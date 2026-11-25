import type { WebContents } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { browserUrl, ClientError, isRecord, validateBrowserArguments, webAccessAllows, type Connection, type WebAccess, type BrowserRequest, type BrowserResult, type BrowserState, type MoguriSdk } from "@moguri-dev/sdk";

const pointFunction = `function() {
  if (!(this instanceof HTMLElement) || !this.isConnected || this.closest('[inert]') || this.disabled) throw Error('The exact browser element is unavailable or disabled. Take a fresh snapshot.');
  if (this instanceof HTMLInputElement && this.type==='file') throw Error('Agent file selection and uploads are unavailable. No file chooser was opened.');
  this.scrollIntoView({block:'center',inline:'center'});
  const r=this.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
  if (!r.width || !r.height || getComputedStyle(this).visibility!=='visible' || !this.contains(document.elementFromPoint(x,y))) throw Error('The exact browser element is hidden or covered. Inspect the page.');
  return {x,y};
}`;
const fillFunction = `function(text) {
  if (!(this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) || !this.isConnected || this.disabled || this.readOnly ||
      this instanceof HTMLInputElement && !['text','search','email','url','tel','number'].includes(this.type) ||
      !this.getClientRects().length || getComputedStyle(this).visibility!=='visible') throw Error('Only an exact visible editable text field is allowed. Password, file and hidden fields are refused.');
  const prototype=this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(this,text);
  this.dispatchEvent(new Event('input',{bubbles:true})); this.dispatchEvent(new Event('change',{bubbles:true}));
  if (this.value!==text) throw Error('The browser did not accept the complete text. Inspect the partial field value.');
  return true;
}`;

/**
 * Native owner of one session Browser pane. Agent control follows the user's durable per-chat choice (D61): while it is
 * on, every revocation (user navigation, reconnect, permission change, watchdog) is followed by a fresh enable with a new
 * control identity once the cause clears. Earlier approvals, element references and website scope never carry over.
 */
/** An abandoned attachment whose service detach was not acknowledged; only this keeps a replacement pane blocked. */
export class BrowserAttachmentCleanupError extends Error {}

export class SessionBrowserHost {
  private readonly owner;
  private sequence = 0;
  private controlId: string | null = null;
  private stopped = false;
  private connected = true;
  private polling = true;
  private userSuppressed = false;
  private userPending = 0;
  private userEpoch = 0;
  private intentWrites: Promise<unknown> = Promise.resolve();
  private navigating = 0;
  private resuming = false;
  private resumeAt = 0;
  private resumeFailures = 0;
  private wasKeeping = false;
  private debuggerOwned = false;
  private snapshotId: string | null = null;
  private refs = new Map<string, number>();
  private pageEpoch = 0;
  private lastPoll = Date.now();
  private active?: { id: string; abort: AbortController };
  private seenRequests = new Set<string>();
  private mouseDown = false;
  private keyDown: string | null = null;
  private watchdog?: ReturnType<typeof setInterval>;
  private guardedNetwork = false;
  private webAccess?: WebAccess;
  private networkDenied = new Set<string>();
  private readonly connection: Connection;
  private readonly navigated = () => { this.pageEpoch++; this.clearRefs(); };
  private readonly debugMessage = (_event: Electron.Event, method: string) => {
    if (method !== "Page.javascriptDialogOpening" || !this.debuggerOwned || this.contents.isDestroyed()) return;
    void this.contents.debugger.sendCommand("Page.handleJavaScriptDialog", { accept: false })
      .catch((error: unknown) => this.report(`Browser page dialog dismissal was not acknowledged: ${error instanceof Error ? error.message : "unknown dialog failure"}`));
  };
  private constructor(private sdk: MoguriSdk, sessionId: string, private contents: WebContents, private validOwner: () => boolean, private report: (message: string) => void,
    private released: () => void) {
    this.owner = { sessionId, hostId: randomUUID(), lease: randomBytes(32).toString("hex") };
    this.connection = { ...sdk.connection };
    contents.on("did-start-navigation", this.navigated);
    contents.debugger.on("message", this.debugMessage);
  }
  private installNetworkGate(): void {
    this.contents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, done) => {
      if (!this.guardedNetwork) { done({}); return; }
      const target = new URL(details.url);
      if (target.protocol === "wss:") target.protocol = "https:";
      else if (target.protocol === "ws:") target.protocol = "http:";
      const allowed = this.webAccess && webAccessAllows(this.webAccess, target.href);
      if (!allowed && this.networkDenied.size < 20 && !this.networkDenied.has(target.origin)) {
        this.networkDenied.add(target.origin);
        this.report(`Agent browser blocked an unapproved website request to ${target.origin}. No request was replayed.`);
      }
      done({ cancel: !allowed });
    });
  }
  /** `released` runs when this host stops keeping agent control: the user's choice is no longer on, or its poll loop ended. */
  static async attach(sdk: MoguriSdk, sessionId: string, contents: WebContents, validOwner: () => boolean, report: (message: string) => void,
    released: () => void = () => {}): Promise<SessionBrowserHost> {
    const host = new SessionBrowserHost(sdk, sessionId, contents, validOwner, report, released);
    try { await sdk.browser.host.attach(host.owner); }
    catch (error) { host.unlisten(); throw error; }
    try {
      if (contents.isDestroyed() || !validOwner()) throw new Error("The original native browser closed during attachment. No other view was adopted.");
      host.installNetworkGate();
    } catch (error) {
      host.unlisten();
      try { await sdk.browser.host.detach(host.owner); }
      catch (failure) {
        const message = `Browser attachment cleanup was not acknowledged: ${failure instanceof Error ? failure.message : "unknown cleanup failure"}`;
        report(message); throw new BrowserAttachmentCleanupError(message, { cause: error });
      }
      throw error;
    }
    host.watchdog = setInterval(() => { if (Date.now() - host.lastPoll > 8000) host.revoke(); }, 1000);
    void host.poll();
    return host;
  }
  private clearRefs(): void { this.snapshotId = null; this.refs.clear(); }
  // A view closed while attaching (another chat's pane took the browser) has already dropped its listeners; touching its
  // debugger then throws "Object has been destroyed".
  private unlisten(): void {
    if (this.contents.isDestroyed()) return;
    this.contents.removeListener("did-start-navigation", this.navigated);
    this.contents.debugger.removeListener("message", this.debugMessage);
  }
  private session() { return this.sdk.getState().snapshot?.sessions.find((session) => session.id === this.owner.sessionId); }
  /** The user's recorded choice (D61), unless this pane's own off is still being recorded or failed to record. */
  intended(): boolean {
    if (this.session()?.browserAgentControl !== true) { this.userSuppressed = false; return false; }
    return !this.userSuppressed;
  }
  /** Whether control may be held right now. Read-only mode, another Env or an allowed-Env policy without Local only suspend the choice. */
  private eligible(): boolean {
    const session = this.session(), policy = this.sdk.getState().snapshot?.policy;
    return Boolean(session && session.status !== "archived" && session.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" &&
      session.controls.env === "Local" && policy?.allowedEnvs.includes("Local"));
  }
  /** True while the pane should stay alive hidden so the agent keeps its browser: the poll loop runs and the user's choice is on. */
  keepsControl(): boolean { return !this.stopped && this.polling && this.intended(); }
  /** True after the poll loop ended; the pane replaces this host on its next attachment. */
  ended(): boolean { return !this.polling; }
  private sameConnection(): boolean {
    return (["protocolVersion", "pid", "baseUrl", "wsUrl", "token", "storeId"] as const).every((key) => this.connection[key] === this.sdk.connection[key]);
  }
  private revoke(): void {
    this.controlId = null; this.webAccess = undefined; this.clearRefs(); this.active?.abort.abort();
    if (!this.contents.isDestroyed()) {
      this.releaseInput();
      if (this.debuggerOwned && this.contents.debugger.isAttached()) this.contents.debugger.detach();
    }
    this.debuggerOwned = false;
  }
  async control(enabled: boolean) {
    if (!this.sameConnection()) throw new Error("The original browser service connection changed. No different lease or page was controlled.");
    if (enabled && !this.connected) throw new Error("The original browser host is disconnected. No replacement or retry was inferred; if this chat's Agent control stays on, it turns back on with a new identity after the host reconnects.");
    const sequence = ++this.sequence;
    this.revoke();
    try {
      await this.sdk.browser.host.control(this.owner, sequence, enabled);
      const { browser } = await this.sdk.browser.state(this.owner.sessionId);
      if (sequence === this.sequence && !this.stopped && this.validOwner()) {
        this.controlId = enabled ? browser.controlId : null;
        if (this.controlId) this.guardedNetwork = true;
      }
      return browser;
    } catch (error) {
      if (sequence === this.sequence) {
        this.revoke();
        const latest = ++this.sequence;
        await this.sdk.browser.host.control(this.owner, latest, false).catch((failure: unknown) => this.report(`Browser failure revocation was not acknowledged: ${failure instanceof Error ? failure.message : "unknown revocation failure"}`));
      }
      throw error;
    }
  }
  /**
   * The user's switch in this pane. Off revokes immediately, then records the choice; on records it first so the service
   * never holds control the user has not chosen. Writes are serialized so the last toggle wins.
   */
  async userControl(enabled: boolean): Promise<BrowserState> {
    if (!this.sameConnection()) throw new Error("The original browser service connection changed. No different lease or page was controlled.");
    const epoch = ++this.userEpoch;
    this.userPending++; this.userSuppressed = !enabled; this.resumeFailures = 0; this.resumeAt = 0;
    const write = this.intentWrites.then(() => this.sdk.sessions.browserControl(this.owner.sessionId, enabled));
    this.intentWrites = write.catch(() => {});
    try {
      if (!enabled) {
        const browser = await this.control(false);
        try { await write; }
        catch (error) { throw new Error(`Agent control is off in this pane for now, but the chat still has it on, so it turns back on when the pane reopens. Switch it off again. ${error instanceof Error ? error.message : "The choice was not saved."}`); }
        return browser;
      }
      await write;
      if (epoch !== this.userEpoch) return (await this.sdk.browser.state(this.owner.sessionId)).browser;
      return await this.control(true);
    } finally {
      this.userPending--;
      if (!enabled && !this.intended()) this.released();
    }
  }
  /** Turns control back on with a fresh identity when the user's choice is on and nothing else owns the switch. */
  private resume(): void {
    if (!this.intended() || this.controlId || this.resuming || this.userPending || this.navigating || !this.connected || this.stopped ||
      !this.validOwner() || this.contents.isDestroyed() || !this.sameConnection() || !this.eligible() || Date.now() < this.resumeAt) return;
    this.resuming = true;
    void this.control(true).then((browser) => {
      if (browser.controlId) this.resumeFailures = 0;
    }).catch((error: unknown) => {
      this.resumeFailures++;
      this.resumeAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.resumeFailures, 5));
      this.report(`Agent control is still on for this chat but could not turn back on yet: ${error instanceof Error ? error.message : "unknown failure"}`);
    }).finally(() => { this.resuming = false; });
  }
  async navigateByUser(input: string): Promise<void> {
    if (!this.sameConnection()) throw new Error("The original browser service connection changed. Reopen this exact pane before navigation; no other owner was adopted.");
    const url = browserUrl(input);
    // The user's navigation always revokes the current identity; the recorded choice turns control back on after it settles.
    this.navigating++;
    try {
      if (this.controlId) await this.control(false);
      this.revoke();
      if (this.stopped || !this.validOwner() || this.contents.isDestroyed()) throw new Error("The original user browser closed. No other page was opened.");
      if (this.guardedNetwork) await this.contents.loadURL("about:blank");
      this.guardedNetwork = false;
      await this.contents.loadURL(url.href);
    } finally {
      this.navigating--;
      this.resumeAt = 0;
      this.resume();
    }
  }
  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true; clearInterval(this.watchdog); this.revoke(); this.unlisten();
    await this.sdk.browser.host.detach(this.owner);
  }
  private async poll(): Promise<void> {
    let failures = 0;
    try {
      while (!this.stopped && !this.contents.isDestroyed() && this.validOwner()) {
        const sequence = this.sequence;
        if (!this.sameConnection()) throw new Error("The original browser service connection changed. Close and reopen this exact pane; no different owner was adopted.");
        let response: Awaited<ReturnType<MoguriSdk["browser"]["host"]["poll"]>>;
        try {
          response = await this.sdk.browser.host.poll(this.owner, this.contents.getURL().slice(0, 4096), this.contents.getTitle().slice(0, 512));
        } catch (error) {
          const transient = error instanceof TypeError || error instanceof ClientError && ["request_failed", "query_timeout"].includes(error.code);
          if (!transient || failures >= 2 || this.stopped || !this.validOwner() || !this.sameConnection()) throw error;
          failures++; this.connected = false; this.revoke();
          this.report("The original browser status poll failed. Agent access was revoked; only its exact read/lease will be recovered, not a browser action.");
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (this.stopped || !this.validOwner() || !this.sameConnection()) break;
          await this.sdk.browser.host.control(this.owner, ++this.sequence, false);
          continue;
        }
        if (!this.sameConnection()) throw new Error("The original browser service changed during its read. No new owner, result or control was adopted.");
        failures = 0; this.connected = true;
        this.lastPoll = Date.now();
        if (this.stopped || !this.validOwner()) break;
        if (sequence === this.sequence && response.controlId !== this.controlId) this.revoke();
        if (!response.controlId && !this.resuming && sequence === this.sequence) this.resume();
        if (!this.intended() && this.wasKeeping) { this.wasKeeping = false; this.released(); }
        else if (this.intended()) this.wasKeeping = true;
        if (sequence === this.sequence && this.active && response.request?.id !== this.active.id) this.active.abort.abort();
        const request = response.request;
        if (request && request.controlId === this.controlId && !this.active && !this.seenRequests.has(request.id)) {
          this.seenRequests.add(request.id);
          if (this.seenRequests.size > 256) this.seenRequests.delete(this.seenRequests.values().next().value!);
          const active = { id: request.id, abort: new AbortController() };
          this.active = active;
          void this.execute(request, active.abort.signal).then((result) => {
            if (!this.sameConnection()) throw new Error("The original browser result lost its service owner. No different service received the result or replay.");
            return this.sdk.browser.host.reply(this.owner, request.id, result);
          })
            .catch((error: unknown) => this.report(`Browser result was not acknowledged; no replay: ${error instanceof Error ? error.message : "unknown result failure"}`))
            .finally(() => { if (this.active === active) this.active = undefined; });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (error) {
      if (!this.stopped) this.report(`Browser host disconnected; agent control is off until this pane attaches again: ${error instanceof Error ? error.message : "unknown host failure"}`);
    } finally {
      this.connected = false; this.polling = false; this.revoke();
      if (!this.stopped) this.released();
    }
  }
  private guard(request: BrowserRequest, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.stopped || !this.validOwner() || !this.sameConnection() || this.contents.isDestroyed() || !this.controlId || request.controlId !== this.controlId ||
      Date.now() - this.lastPoll > 8000) throw new Error("Browser control was revoked or its exact native owner changed.");
  }
  private async cdp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.stopped || !this.controlId || !this.validOwner() || !this.sameConnection() || this.contents.isDestroyed()) throw new Error("Browser control is off. No debug command was dispatched.");
    if (!this.debuggerOwned) {
      if (this.contents.debugger.isAttached()) throw new Error("This browser has another debugger owner. No existing debug session was adopted.");
      this.contents.debugger.attach("1.3"); this.debuggerOwned = true;
    }
    const value: unknown = await this.contents.debugger.sendCommand(method, params);
    return value;
  }
  private releaseInput(): void {
    if (this.contents.isDestroyed()) return;
    if (this.mouseDown) { this.mouseDown = false; this.contents.sendInputEvent({ type: "mouseUp", x: -1, y: -1, button: "left", clickCount: 1 }); }
    if (this.keyDown) { const keyCode = this.keyDown; this.keyDown = null; this.contents.sendInputEvent({ type: "keyUp", keyCode }); }
  }
  private async snapshot(request: BrowserRequest, signal: AbortSignal): Promise<string> {
    this.clearRefs();
    const epoch = this.pageEpoch;
    const tree = await this.cdp("Accessibility.getFullAXTree", { depth: 12 });
    this.guard(request, signal);
    if (epoch !== this.pageEpoch || !isRecord(tree) || !Array.isArray(tree.nodes)) throw new Error("The browser document changed during inspection. Take a fresh snapshot.");
    this.snapshotId = randomUUID();
    const nodes: { ref?: string; role: string; name: string }[] = [];
    for (const raw of tree.nodes) {
      if (!isRecord(raw) || raw.ignored || !isRecord(raw.role) || typeof raw.role.value !== "string") continue;
      const ref = `r${nodes.length}`;
      const backend = raw.backendDOMNodeId;
      if (typeof backend === "number" && Number.isSafeInteger(backend) && backend > 0) this.refs.set(ref, backend);
      nodes.push({ ...(this.refs.has(ref) ? { ref } : {}), role: raw.role.value.slice(0, 100),
        name: isRecord(raw.name) && typeof raw.name.value === "string" ? raw.name.value.slice(0, 512) : "" });
      if (nodes.length >= 1000) break;
    }
    const offset = Number(request.arguments.offset ?? 0);
    const page = nodes.slice(offset, offset + 80);
    const result = () => JSON.stringify({ source: "untrusted-browser-accessibility", snapshotId: this.snapshotId,
      url: this.contents.getURL(), title: this.contents.getTitle().slice(0, 512), nodes: page,
      nextOffset: offset + page.length < nodes.length ? offset + page.length : null, boundedAt: 1000 });
    while (Buffer.byteLength(result()) > 16384 && page.length) page.pop();
    if (Buffer.byteLength(result()) > 16384) throw new Error("The browser metadata exceeded the bounded snapshot.");
    return result();
  }
  private async element(request: BrowserRequest, signal: AbortSignal): Promise<string> {
    if (!this.snapshotId || request.arguments.snapshotId !== this.snapshotId) throw new Error("This browser snapshot is stale. Inspect the current document again.");
    const backendNodeId = this.refs.get(String(request.arguments.ref));
    if (!backendNodeId) throw new Error("This exact element reference is missing. Take a fresh browser snapshot.");
    const epoch = this.pageEpoch;
    const resolved = await this.cdp("DOM.resolveNode", { backendNodeId });
    this.guard(request, signal);
    if (epoch !== this.pageEpoch || !this.snapshotId || request.arguments.snapshotId !== this.snapshotId ||
      !isRecord(resolved) || !isRecord(resolved.object) || typeof resolved.object.objectId !== "string") throw new Error("The browser element changed during resolution. Nothing was selected by position or text.");
    return resolved.object.objectId;
  }
  private async invoke(objectId: string, functionDeclaration: string, args: unknown[] = []): Promise<unknown> {
    const result = await this.cdp("Runtime.callFunctionOn", { objectId, functionDeclaration, arguments: args.map((value) => ({ value })), returnByValue: true });
    if (isRecord(result) && isRecord(result.exceptionDetails)) {
      const exception = result.exceptionDetails.exception;
      const reason = isRecord(exception) && typeof exception.description === "string" ? exception.description.slice(0, 1000) : "The browser rejected this exact element operation.";
      throw new Error(`Untrusted browser operation failure: ${reason}`);
    }
    if (!isRecord(result) || !isRecord(result.result)) throw new Error("The exact browser element operation had no acknowledged result. Inspect the current page.");
    return result.result.value;
  }
  private async execute(request: BrowserRequest, signal: AbortSignal): Promise<BrowserResult> {
    let effects = false;
    const cancel = () => {
      this.releaseInput();
      if (!this.contents.isDestroyed() && this.debuggerOwned && this.contents.debugger.isAttached()) {
        this.debuggerOwned = false; this.contents.debugger.detach();
      }
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      this.guard(request, signal);
      validateBrowserArguments(request.tool, request.arguments);
      if (request.tool !== "browser_navigate" && this.contents.getURL() !== request.arguments.expectedUrl) throw new Error("The exact browser page changed. Take its current status before requesting another action.");
      const target = request.tool === "browser_navigate" ? String(request.arguments.url) : String(request.arguments.expectedUrl);
      if (!request.webAccess || target !== "about:blank" && !webAccessAllows(request.webAccess, target)) throw new Error("The browser action has no exact approved website scope. No navigation or interaction was dispatched.");
      this.webAccess = request.webAccess;
      this.guardedNetwork = true;
      this.networkDenied.clear();
      await this.cdp("Page.enable");
      this.guard(request, signal);
      await this.cdp("Page.setInterceptFileChooserDialog", { enabled: true });
      this.guard(request, signal);
      if (request.tool === "browser_wait") {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(done, Number(request.arguments.milliseconds));
          const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
          function done() { signal.removeEventListener("abort", abort); resolve(); }
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
        this.guard(request, signal);
        if (this.contents.getURL() !== request.arguments.expectedUrl) throw new Error("The original page changed during the wait. No replacement page was adopted.");
        return { text: JSON.stringify({ waitedMilliseconds: request.arguments.milliseconds, url: this.contents.getURL() }), outcome: "completed" };
      }
      if (request.tool === "browser_screenshot") {
        const epoch = this.pageEpoch, image = await this.contents.capturePage();
        this.guard(request, signal);
        if (epoch !== this.pageEpoch || this.contents.getURL() !== request.arguments.expectedUrl) throw new Error("The original screenshot page changed. No stale image was delivered.");
        const bytes = image.toPNG();
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("The page screenshot is empty or exceeds 8 MiB. No desktop capture or truncated image was substituted.");
        return { text: JSON.stringify({ captured: "exact Browser page", bytes: bytes.length, url: this.contents.getURL(), delivery: "chat response; not implicit model context" }), outcome: "completed",
          deliveries: [{ kind: "image", name: "Browser screenshot", data: bytes.toString("base64") }] };
      }
      if (request.tool === "browser_snapshot") return { text: await this.snapshot(request, signal), outcome: "completed" };
      if (request.tool === "browser_navigate") {
        const url = browserUrl(String(request.arguments.url));
        this.guard(request, signal); effects = true; this.clearRefs();
        const cancel = () => { if (!this.contents.isDestroyed()) this.contents.stop(); };
        signal.addEventListener("abort", cancel, { once: true });
        try { await this.contents.loadURL(url.href); }
        finally { signal.removeEventListener("abort", cancel); }
      } else {
        const objectId = await this.element(request, signal);
        try {
          this.guard(request, signal);
          if (request.tool === "browser_fill") {
            effects = true;
            await this.invoke(objectId, fillFunction, [request.arguments.text]);
          } else if (request.tool === "browser_click") {
            const point = await this.invoke(objectId, pointFunction);
            this.guard(request, signal);
            if (!isRecord(point) || typeof point.x !== "number" || typeof point.y !== "number") throw new Error("The browser element has no current visible point.");
            effects = true;
            this.mouseDown = true;
            await this.cdp("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: point.x, y: point.y });
            this.guard(request, signal);
            await this.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: point.x, y: point.y });
            this.mouseDown = false;
          } else if (request.tool === "browser_press_key") {
            effects = true;
            await this.invoke(objectId, "function(){if(!(this instanceof HTMLElement)||!this.isConnected)throw Error('Stale element');this.focus()}");
            this.guard(request, signal);
            const key = String(request.arguments.key);
            const codes: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, " ": 32 };
            this.keyDown = key;
            await this.cdp("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: codes[key], ...(key === "Enter" ? { text: "\r" } : key === " " ? { text: " " } : {}) });
            this.guard(request, signal);
            await this.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: codes[key] });
            this.keyDown = null;
          } else throw new Error("This browser action is unsupported. No fallback was executed.");
        } finally {
          if (this.debuggerOwned && !this.contents.isDestroyed() && this.contents.debugger.isAttached()) {
            await this.contents.debugger.sendCommand("Runtime.releaseObject", { objectId })
              .catch((error: unknown) => this.report(`Browser element handle release was not acknowledged: ${error instanceof Error ? error.message : "unknown handle cleanup failure"}`));
          }
        }
        this.clearRefs();
      }
      this.guard(request, signal);
      if (this.networkDenied.size) throw new Error(`The browser blocked unapproved website requests to ${[...this.networkDenied].join(", ")}. Review those exact destinations before another action.`);
      return { text: JSON.stringify({ source: "untrusted-browser-result", url: this.contents.getURL(), title: this.contents.getTitle().slice(0, 512), action: request.tool,
        basis: request.tool === "browser_navigate" ? "main-frame-load-finished" : "native-input-acknowledged; inspect the page for website effects", outcome: "completed" }), outcome: "completed" };
    } catch (error) {
      const text = error instanceof Error ? error.message : "The browser action failed.";
      this.report(`Browser action ${request.tool} ${effects ? "may be partial" : "did not complete"}; its original error is retained in the scoped tool result.`);
      return { text: `${text}${effects ? " Website effects may already exist. Inspect before retrying; no automatic replay." : ""}`,
        outcome: effects ? "partial" : signal.aborted ? "cancelled" : "failed" };
    } finally { signal.removeEventListener("abort", cancel); this.releaseInput(); if (effects) this.clearRefs(); }
  }
}
