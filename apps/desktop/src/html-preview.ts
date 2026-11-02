import { WebContentsView, session as electronSession, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isolatedHtmlDocument, type MoguriSdk } from "../../../packages/sdk/src/index.ts";

export interface HtmlPreviewRequest {
  sessionId: string; attachmentId: string; digest: string;
  bounds: { x: number; y: number; width: number; height: number };
}
export class HtmlPreviewHost {
  private current?: { key: string; view: WebContentsView; storage: Electron.Session; window: BrowserWindow };
  private generation = 0;
  private pendingKey: string | undefined;
  async hide(profileId: string, request: Pick<HtmlPreviewRequest, "sessionId" | "attachmentId" | "digest">): Promise<void> {
    const key = JSON.stringify([profileId, request.sessionId, request.attachmentId, request.digest]);
    if (this.current?.key === key || this.pendingKey === key) await this.close();
  }
  async close(): Promise<void> {
    this.generation++;
    this.pendingKey = undefined;
    await this.disposeCurrent();
  }
  private async disposeCurrent(): Promise<void> {
    const current = this.current;
    if (!current) return;
    if (!current.window.isDestroyed()) current.window.contentView.removeChildView(current.view);
    const contents = current.view.webContents;
    if (!contents.isDestroyed()) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Isolated HTML renderer cleanup was not confirmed. No replacement renderer was started.")), 3000);
        contents.once("destroyed", () => { clearTimeout(timer); resolve(); });
        contents.close({ waitForBeforeUnload: false });
      });
    }
    await current.storage.clearStorageData();
    if (this.current === current) this.current = undefined;
  }
  async show(window: BrowserWindow, sdk: MoguriSdk, request: HtmlPreviewRequest, currentOwner: () => boolean): Promise<void> {
    const key = JSON.stringify([sdk.profileId, request.sessionId, request.attachmentId, request.digest]);
    if (this.current?.key === key) {
      if (!currentOwner() || !sdk.getState().snapshot?.sessions.some((session) => session.id === request.sessionId)) { await this.close(); throw new Error("The original page owner was removed or changed."); }
      this.place(this.current.view, window, request.bounds); return;
    }
    const generation = ++this.generation;
    this.pendingKey = key;
    await this.disposeCurrent();
    if (generation !== this.generation || !currentOwner()) throw new Error("A newer page or profile owns this renderer. No stale source was rendered.");
    const original = await sdk.attachments.read(request.sessionId, request.attachmentId);
    if (!currentOwner() || generation !== this.generation || original.attachment.kind !== "html" || original.attachment.digest !== request.digest || original.content.kind !== "html") {
      throw new Error("The exact retained HTML source/profile changed. No replacement source was rendered.");
    }
    const storage = electronSession.fromPartition(`moguri-html-${randomUUID()}`, { cache: false });
    storage.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
    storage.setPermissionCheckHandler(() => false);
    storage.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, respond) => respond({ cancel:
      details.url !== "about:blank" && !details.url.startsWith("data:text/html;base64,") &&
      !(details.resourceType === "image" && (details.url.startsWith("data:image/") || details.url.startsWith("blob:"))) }));
    storage.on("will-download", (event) => event.preventDefault());
    const view = new WebContentsView({ webPreferences: { session: storage, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, sandbox: true, webSecurity: true, webviewTag: false,
      preload: fileURLToPath(new URL("./html-preload.cjs", import.meta.url)) } });
    const owned = { key, view, storage, window }; this.current = owned;
    this.pendingKey = undefined;
    const contents = view.webContents;
    contents.setAudioMuted(true);
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-frame-navigate", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        _event.preventDefault();
        window.webContents.send("moguri:html-dismiss", request.attachmentId);
      }
    });
    try {
      await contents.loadURL("about:blank");
      contents.debugger.attach("1.3");
      contents.debugger.on("message", (_event, method) => {
        if (method === "Page.javascriptDialogOpening") void contents.debugger.sendCommand("Page.handleJavaScriptDialog", { accept: false })
          .catch((error: unknown) => console.error("Isolated page dialog dismissal failed:", error instanceof Error ? error.message : "unconfirmed dialog"));
      });
      await contents.debugger.sendCommand("Page.enable");
      await contents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `for (const name of ["RTCPeerConnection","webkitRTCPeerConnection","WebTransport","WebSocket","EventSource","Worker","SharedWorker","showOpenFilePicker","showSaveFilePicker","showDirectoryPicker"]) Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false});` });
      await contents.debugger.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true });
      window.contentView.addChildView(view);
      this.place(view, window, request.bounds);
      const url = `data:text/html;base64,${Buffer.from(isolatedHtmlDocument(original.content.html)).toString("base64")}`;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([contents.loadURL(url), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Isolated page load exceeded ten seconds. Source was retained; no successful render was inferred.")), 10000); })]); }
      finally { clearTimeout(timer); }
      if (!currentOwner() || this.current !== owned || contents.getOSProcessId() === window.webContents.getOSProcessId()) throw new Error("The page did not retain a separate current renderer. No privileged/shared renderer was accepted.");
    } catch (error) { if (this.current === owned) await this.close(); throw error; }
  }
  private place(view: WebContentsView, window: BrowserWindow, bounds: HtmlPreviewRequest["bounds"]) {
    const { width, height } = window.getContentBounds();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1 || bounds.height < 1) throw new Error("Use actual finite on-screen HTML bounds.");
    const x = Math.max(0, Math.min(width, Math.round(bounds.x))), y = Math.max(0, Math.min(height, Math.round(bounds.y)));
    view.setBounds({ x, y, width: Math.max(1, Math.min(width - x, Math.round(bounds.width))), height: Math.max(1, Math.min(height - y, Math.round(bounds.height))) });
  }
}
