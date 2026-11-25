import { useEffect, useRef, useState } from "react";
import { FitAddon, Ghostty, Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import { envLabel, shortcutMatches, type MoguriSdk, type RemoteReadiness, type Session, type Snapshot, type TerminalOwner } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { Alert } from "./Alert.tsx";

let ghostty: Promise<Ghostty> | undefined;
function observeTerminalFit(terminal: Terminal, container: HTMLElement): () => void {
  const fit = new FitAddon(); terminal.loadAddon(fit);
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
  // Ghostty drops observer notifications during its 50 ms fit guard.
  const schedule = () => {
    if (disposed) return;
    clearTimeout(timer); timer = setTimeout(() => { if (!disposed) fit.fit(); }, 100);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(container); schedule();
  return () => { disposed = true; clearTimeout(timer); observer.disconnect(); };
}
/**
 * The pane's real size in cells, measured with a throwaway hidden emulator using the same font, so a new shell starts at
 * the width it is shown at. Starting at a default 80x24 and resizing afterwards makes zsh print its partial-line `%`
 * marker and a second prompt drawn for the wrong width.
 */
async function measureTerminalSize(container: HTMLElement | null): Promise<{ cols: number; rows: number }> {
  const fallback = { cols: 80, rows: 24 };
  if (!container || !container.clientWidth || !container.clientHeight) return fallback;
  const probe = document.createElement("div"), style = getComputedStyle(container);
  probe.className = container.className; probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", left: "0", top: "0",
    width: `${container.clientWidth}px`, height: `${container.clientHeight}px`, padding: style.padding, boxSizing: "border-box" });
  document.body.append(probe);
  let measuring: Terminal | undefined;
  try {
    ghostty ??= Ghostty.load(wasmUrl);
    measuring = new Terminal({ ghostty: await ghostty, cols: 80, rows: 24, fontSize: 12, scrollback: 0, disableStdin: true });
    measuring.open(probe);
    const fit = new FitAddon(); measuring.loadAddon(fit);
    const size = fit.proposeDimensions();
    return size ? { cols: Math.min(500, Math.max(10, size.cols)), rows: Math.min(200, Math.max(2, size.rows)) } : fallback;
  } catch { return fallback; }
  finally { measuring?.dispose(); probe.remove(); }
}
export function GhosttyOutput({ text, active, scope }: { text: string; active: boolean; scope: string }) {
  const host = useRef<HTMLDivElement>(null), emulator = useRef<Terminal | null>(null), latest = useRef(text);
  const [error, setError] = useState("");
  latest.current = text;
  useEffect(() => {
    if (!active || !host.current) return;
    const container = host.current;
    // Leave Tab to browser focus navigation, not Ghostty's keyboard capture.
    const tab = (event: KeyboardEvent) => { if (event.key === "Tab") event.stopImmediatePropagation(); };
    container.addEventListener("keydown", tab, true);
    let disposed = false, current: Terminal | undefined, stopFit = () => {};
    setError("");
    void (async () => {
      try {
        ghostty ??= Ghostty.load(wasmUrl);
        const runtime = await ghostty;
        if (disposed || !host.current) return;
        current = new Terminal({ ghostty: runtime, cols: 120, rows: 30, fontSize: 12, scrollback: 1500, disableStdin: true,
          theme: { background: "#0e0e10", foreground: "#ececef", cursor: "#a8d7bc" } });
        current.open(host.current); emulator.current = current;
        host.current.setAttribute("aria-label", "Agent terminal output");
        host.current.setAttribute("aria-readonly", "true");
        host.current.contentEditable = "false";
        current.textarea?.setAttribute("aria-label", "Read-only Agent output");
        current.textarea?.setAttribute("readonly", "");
        current.attachCustomKeyEventHandler(() => true);
        stopFit = observeTerminalFit(current, host.current);
        if (latest.current) current.write(latest.current);
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Ghostty could not render the retained Agent output."); }
    })();
    return () => { disposed = true; stopFit(); container.removeEventListener("keydown", tab, true); current?.dispose(); emulator.current = null; };
  }, [active, scope]);
  useEffect(() => {
    const current = emulator.current;
    if (!current) return;
    current.reset(); if (text) current.write(text);
  }, [text]);
  return <>{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}<div ref={host} className="ghostty-host agent-ghostty-host" aria-label="Agent terminal output" aria-readonly="true" />
    <pre className="sr-only" aria-label="Agent command transcript" aria-live="off">{text}</pre></>;
}
export function GhosttyTerminal({ sdk, session, snapshot, active, visible = active, autoStart = false, onAutoStartHandled, requestedRoot }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean; visible?: boolean; autoStart?: boolean; onAutoStartHandled?: () => void; requestedRoot?: string;
}) {
  const env = session.controls.env;
  const terminals = snapshot.terminals.filter((terminal) => terminal.sessionId === session.id && terminal.status !== "closed" &&
    (!session.repositories || terminal.binding?.root === requestedRoot));
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [remoteState, setRemoteState] = useState<RemoteReadiness | null>(null);
  const autoOpened = useRef(false);
  const [defaultRoot, setDefaultRoot] = useState("");
  const terminal = terminals.find((terminal) => terminal.id === selected) ?? terminals.findLast((terminal) => terminal.status === "running") ?? terminals.at(-1);
  const target = snapshot.settings.values.remote;
  const matchingPeer = (owner: TerminalOwner | undefined) => Boolean(owner?.remote && target && owner.remote.target.host === target.host &&
    owner.remote.target.port === target.port && owner.remote.target.user === target.user && owner.remote.target.hostKey === target.hostKey);
  const scopedOwners = snapshot.terminalOwners.filter((owner) => owner.status !== "acknowledged" && owner.cleanup !== "removed" &&
    (env === "Remote" ? matchingPeer(owner) : env === "Local" && !owner.remote));
  const profileOwner = scopedOwners.at(-1);
  const owner = snapshot.terminalOwners.find((owner) => owner.id === terminal?.ownerId) ?? profileOwner;
  const connected = sdk.getState().status === "connected";
  const configuration = snapshot.projectConfigurations.find((configuration) => configuration.projectId === session?.projectId);
  const localRoot = session?.workspaceId ? snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId)?.path :
    snapshot.projects.find((project) => project.id === session?.projectId)?.path;
  const sameRoot = terminal?.binding && terminal.binding.profileId === sdk.profileId && terminal.binding.sessionId === (session?.id ?? null) &&
    terminal.binding.projectId === (session?.projectId ?? null) && (terminal.env === "Remote" ? matchingPeer(owner) && session?.workspaceId === null &&
    terminal.binding.env === "Remote" && terminal.binding.peerDigest === owner?.remote?.peerDigest && terminal.binding.root === configuration?.values.remotePath :
    terminal.env === "Local" && terminal.binding.env === "Local" && (session.repositories ? terminal.binding.root === requestedRoot : !session?.projectId || terminal.binding.root === localRoot));
  const canInput = connected && terminal?.status === "running" && session?.status !== "archived" && sameRoot &&
    terminal.env === env && snapshot.policy.allowedEnvs.includes(terminal.env);
  const canControl = connected && terminal?.ownerId && !["closed", "failed", "acknowledged"].includes(terminal.status);
  const canOpen = connected && ["Local", "Remote"].includes(env) && snapshot.policy.allowedEnvs.includes(env) &&
    snapshot.capabilities.some((capability) => capability.env === env && capability.ready) &&
    (session?.projectId || env === "Local" && Boolean(session.repositories ? requestedRoot : defaultRoot)) &&
    (env !== "Remote" || Boolean(remoteState?.terminalBuild) && session?.workspaceId === null) &&
    !snapshot.terminalOwners.some((owner) => owner.status === "stopped" && owner.cleanup !== "removed") &&
    session?.status !== "archived" && scopedOwners.length <= 1 && (!profileOwner || profileOwner.status === "running");
  const needsProbe = env === "Remote" && connected && (!remoteState?.ready || !remoteState.terminalBuild);
  const host = useRef<HTMLDivElement>(null);
  const emulator = useRef<Terminal | null>(null);
  const actionPending = useRef(false);
  const copyShortcut = useRef(snapshot.settings.values.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC");
  copyShortcut.current = snapshot.settings.values.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC";
  const run = async (operation: () => Promise<unknown>) => {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "Terminal operation failed. No input was replayed."); }
    finally { actionPending.current = false; setBusy(false); }
  };
  const openTerminal = () => {
    if (actionPending.current) return;
    autoOpened.current = true; onAutoStartHandled?.();
    return run(async () => {
      const { cols, rows } = await measureTerminalSize(host.current);
      const result = await sdk.terminal.open(session.id, cols, rows, undefined, session.repositories ? requestedRoot : session.projectId ? undefined : defaultRoot);
      setSelected(result.id!);
    });
  };
  useEffect(() => {
    if (!visible) { autoOpened.current = false; return; }
    if (!active || !autoStart || autoOpened.current || busy || actionPending.current) return;
    const existing = terminals.some((terminal) => !["closed", "failed", "acknowledged"].includes(terminal.status));
    if (!existing && !canOpen) return;
    if (existing) { autoOpened.current = true; onAutoStartHandled?.(); }
    else void openTerminal();
  }, [visible, active, autoStart, canOpen, busy, session?.id, env, terminals, onAutoStartHandled]);
  useEffect(() => {
    let current = true;
    if (connected && active && env === "Local" && !session?.projectId && !session.repositories) void sdk.terminal.defaultRoot().then((value) => { if (current) setDefaultRoot(value.root); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The explicit Local console root is unavailable. No previous project root was reused."); });
    return () => { current = false; };
  }, [sdk, connected, active, env, session?.projectId, session.repositories]);
  useEffect(() => {
    let current = true; setRemoteState(null);
    if (env === "Remote" && connected && active) void sdk.remote.status().then((result) => { if (current) setRemoteState(result.remote); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Remote console build status is unavailable. No Local fallback."); });
    return () => { current = false; };
  }, [sdk, env, connected, active, snapshot.settings.revision, snapshot.capabilities.find((capability) => capability.env === "Remote")?.ready]);
  useEffect(() => {
    if (!terminal || !host.current || !connected || !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Terminal | undefined, stopFit = () => {};
    let cursor = 0;
    let input = Promise.resolve();
    const inputAbort = new AbortController();
    const stdinDisabled = (disabled: boolean) => { if (!disposed && current) { current.options.disableStdin = disabled; host.current?.setAttribute("aria-disabled", String(disabled)); } };
    const stopInput = () => { inputAbort.abort(); stdinDisabled(true); };
    const read = async () => {
      if (disposed || !current) return;
      try {
        const result = await sdk.terminal.read(terminal.id, cursor);
        if (disposed) return;
        if (cursor < result.baseOffset) { current.reset(); setError("Older output exceeded the bounded in-memory buffer. The view starts at its retained tail."); }
        if (result.data.length) current.write(result.data);
        cursor = result.nextOffset;
        stdinDisabled(!canInput || inputAbort.signal.aborted || result.terminal.status !== "running");
        if (result.terminal.status === "running" || result.data.length) timer = setTimeout(() => void read(), result.data.length === 65536 ? 0 : 120);
      } catch (error) {
        stopInput();
        if (!disposed) setError(error instanceof Error ? error.message : "Terminal disconnected. Reconnect its existing owner; input was not replayed.");
      }
    };
    void (async () => {
      try {
        ghostty ??= Ghostty.load(wasmUrl);
        const runtime = await ghostty;
        if (disposed || !host.current) return;
        current = new Terminal({ ghostty: runtime, cols: terminal.cols, rows: terminal.rows, fontSize: 12, scrollback: 1500,
          disableStdin: !canInput, theme: { background: "#0e0e10", foreground: "#ececef", cursor: "#a8d7bc" } });
        current.open(host.current); emulator.current = current;
        host.current.setAttribute("aria-label", "Ghostty terminal");
        current.textarea?.setAttribute("aria-label", "Terminal input");
        current.onData((data) => {
          input = input.then(() => sdk.terminal.input(terminal.id, data, inputAbort.signal)).catch((error: unknown) => {
            stopInput();
            if (!disposed) setError(`${error instanceof Error ? error.message : "Terminal input was not acknowledged."} Queued input was discarded. Reconnect the existing terminal and inspect it before typing again.`);
          });
        });
        current.onResize(({ cols, rows }) => {
          if (!disposed && !current?.options.disableStdin) void sdk.terminal.resize(terminal.id, Math.min(500, Math.max(10, cols)), Math.min(200, Math.max(2, rows))).catch((error: unknown) => { if (!disposed) setError(error instanceof Error ? error.message : "Terminal resize failed."); });
        });
        current.attachCustomKeyEventHandler((event) => {
          if (shortcutMatches(event, copyShortcut.current) && current?.hasSelection()) { void run(() => window.moguri.copyText(current!.getSelection())); return true; }
          return false;
        });
        stopFit = observeTerminalFit(current, host.current); void read();
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Ghostty could not initialize. Rebuild its bundled WASM asset."); }
    })();
    return () => { stopInput(); disposed = true; stopFit(); clearTimeout(timer); current?.dispose(); emulator.current = null; };
  }, [terminal?.id, terminal?.attachmentId, terminal?.status, connected, canInput, viewEpoch, active, sdk]);
  return <section className="ghostty-panel" aria-label="Embedded Ghostty terminal">
    <header className="terminal-tabs"><select aria-label="Selected terminal" value={terminal?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>{terminals.map((terminal, index) => <option key={terminal.id} value={terminal.id}>{terminal.title} {index + 1} / {terminal.status}</option>)}{!terminals.length && <option value="">No terminal</option>}</select>
      <Tooltip content="New terminal in this chat"><button className="icon-button" aria-label="New terminal" disabled={busy || !canOpen} onClick={() => void openTerminal()}><Icon name="Plus" /></button></Tooltip>
      <CopyButton label="Copy terminal selection" disabled={busy || !terminal} source={`${session.id}:${terminal?.id}`} text={() => emulator.current?.getSelection() ?? ""} />
      <Tooltip content="Reconnect the existing owner; no shell or input replay"><button className="icon-button" aria-label="Reconnect existing terminal" disabled={busy || !canControl} onClick={() => void run(async () => { await sdk.terminal.reconcile(terminal!.id); setViewEpoch((epoch) => epoch + 1); })}><Icon name="Link" /></button></Tooltip>
      <Tooltip content="Stop this terminal"><button className="icon-button" aria-label="Close terminal" disabled={busy || !canControl} onClick={() => void run(() => sdk.terminal.close(terminal!.id))}><Icon name="Close" /></button></Tooltip>
    </header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {terminal?.env === "Remote" && owner?.remote && <p className="terminal-host-boundary"><strong>Remote SSH console</strong><br />
      {owner.remote.target.user}@{owner.remote.target.host}:{owner.remote.target.port}<br /><code>{terminal.binding?.root}</code></p>}
    {!connected && <Alert as="p" className="inline-error" role="status">Control plane disconnected. Queued input was discarded; no shell will be opened automatically.</Alert>}
    <div ref={host} className="ghostty-host" aria-disabled="true" />
    {!terminal && <p className="fine-print" role="status">{busy ? "Starting terminal..." : canOpen ? autoStart && !autoOpened.current ? "Opening the selected terminal root..." : "No running console. Use + to open one; restoring a pane never replays a launch." : env === "Sandbox" ? "Interactive user consoles are not qualified for Sandbox. The Agent tab shows approved command output; no Local shell was substituted." : profileOwner?.diagnostic ?? "Terminal unavailable under the current environment, project or owner policy. No alternate root was used."}</p>}
    {!session.projectId && !session.repositories && env === "Local" && defaultRoot && <p className="terminal-boundary">This chat's user console starts in <code>{defaultRoot}</code>. This does not give any chat or model workspace access.</p>}
    {needsProbe && <><p className="fine-print">{terminal ? "Existing input stays on its authenticated original owner. Probe the configured SSH worker before opening another Remote console." : remoteState?.terminalDiagnostic ?? "Probe the explicitly configured SSH target and mapped project before a new Remote console. No Local shell is substituted."}</p>
      <button disabled={busy || !target || session?.status === "archived"} onClick={() => void run(async () => { await sdk.remote.probe(); setRemoteState((await sdk.remote.status()).remote); })}>Probe SSH target</button></>}
    {connected && terminal?.status === "running" && !canInput && <p className="fine-print">Read-only view: this is still the captured {terminal.env ?? "unconfirmed"} console. The current session environment, project mapping or policy does not allow new input.</p>}
    {terminal?.diagnostic && <p className="fine-print">{terminal.diagnostic}</p>}
    {terminal?.status === "unconfirmed" && <button disabled={busy || !connected} onClick={() => void run(() => sdk.terminal.acknowledge(terminal.id, true))}>I inspected its processes</button>}
    {owner && <details className="terminal-owner"><summary>Shared {owner.remote ? "Remote" : "Local"} owner / {owner.status}</summary>
      <p><code>{owner.id}</code><br />Broker PID {owner.pid ?? "unobserved"} / private resources {owner.cleanup}</p>
      {terminal?.binding && <p>Actual {envLabel(terminal.binding.env)} console root: <code>{terminal.binding.root}</code></p>}
      {owner.remote && <p>Captured SSH host: <code>{owner.remote.target.user}@{owner.remote.target.host}:{owner.remote.target.port}</code><br />Pinned public key: <code>{owner.remote.target.hostKey}</code></p>}
      {owner.diagnostic && <p>{owner.diagnostic}</p>}
      {!["stopped", "acknowledged"].includes(owner.status) && <button disabled={busy || !connected} onClick={() => void run(async () => { await sdk.terminal.reconcileOwner(owner.id); setViewEpoch((epoch) => epoch + 1); })}>Inspect existing owner</button>}
      {owner.status === "unconfirmed" && <button disabled={busy || !connected} onClick={() => void run(() => sdk.terminal.acknowledgeOwner(owner.id, true))}>I inspected this owner</button>}
    </details>}
    <p className="terminal-boundary">{!terminal && env === "Sandbox" ? "Sandbox user console unavailable." : terminal?.env === "Remote" || !terminal && env === "Remote" ? "Remote user console on its captured SSH host, not SendBox isolation." : "Local user console."} Output is volatile, never agent context. Close this panel to detach; service restart reattaches, service stop closes owned groups. Input is never replayed.</p>
  </section>;
}
