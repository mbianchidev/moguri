import { useEffect, useRef, useState } from "react";
import { FitAddon, Ghostty, Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

let ghostty: Promise<Ghostty> | undefined;
export function GhosttyTerminal({ sdk, session, snapshot, active }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean }) {
  const terminals = snapshot.terminals.filter((terminal) => terminal.sessionId === session.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewEpoch, setViewEpoch] = useState(0);
  const terminal = terminals.find((terminal) => terminal.id === selected) ?? terminals.findLast((terminal) => terminal.status === "running") ?? terminals.at(-1);
  const profileOwner = snapshot.terminalOwners.findLast((owner) => owner.status !== "acknowledged" && owner.cleanup !== "removed");
  const owner = snapshot.terminalOwners.find((owner) => owner.id === terminal?.ownerId) ?? profileOwner;
  const connected = sdk.getState().status === "connected";
  const canInput = connected && terminal?.status === "running" && session.status !== "archived" &&
    session.controls.env === "Local" && snapshot.policy.allowedEnvs.includes("Local");
  const canControl = connected && terminal?.ownerId && !["closed", "failed", "acknowledged"].includes(terminal.status);
  const canOpen = connected && session.controls.env === "Local" && snapshot.policy.allowedEnvs.includes("Local") &&
    session.status !== "archived" && (!profileOwner || profileOwner.status === "running");
  const host = useRef<HTMLDivElement>(null);
  const emulator = useRef<Terminal | null>(null);
  const actionPending = useRef(false);
  const run = async (operation: () => Promise<unknown>) => {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "Terminal operation failed. No input was replayed."); }
    finally { actionPending.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!terminal || !host.current || !connected || !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Terminal | undefined;
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
          disableStdin: !canInput, theme: { background: "#11161e", foreground: "#e1e8f0", cursor: "#a8d7bc" } });
        current.open(host.current); emulator.current = current;
        host.current.setAttribute("aria-label", "Ghostty terminal");
        current.textarea?.setAttribute("aria-label", "Terminal input");
        const fit = new FitAddon(); current.loadAddon(fit);
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
          if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c" && current?.hasSelection()) { void run(() => window.moguri.copyText(current!.getSelection())); return true; }
          return false;
        });
        fit.fit(); fit.observeResize(); void read();
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Ghostty could not initialize. Rebuild its bundled WASM asset."); }
    })();
    return () => { stopInput(); disposed = true; clearTimeout(timer); current?.dispose(); emulator.current = null; };
  }, [terminal?.id, terminal?.attachmentId, terminal?.status, connected, canInput, viewEpoch, active, sdk]);
  return <section className="ghostty-panel" aria-label="Embedded Ghostty terminal">
    <header className="terminal-tabs"><select aria-label="Selected terminal" value={terminal?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>{terminals.map((terminal, index) => <option key={terminal.id} value={terminal.id}>{terminal.title} {index + 1} / {terminal.status}</option>)}{!terminals.length && <option value="">No terminal</option>}</select>
      <button className="icon-button" aria-label="New terminal" title="New terminal" disabled={busy || !canOpen} onClick={() => void run(async () => { const created = await sdk.terminal.open(session.id); setSelected(created.id!); })}><Icon name="Plus" /></button>
      <button className="icon-button" aria-label="Copy terminal selection" title="Copy selection" disabled={busy || !terminal} onClick={() => void run(() => window.moguri.copyText(emulator.current?.getSelection() ?? ""))}><Icon name="Copy" /></button>
      <button className="icon-button" aria-label="Reconnect existing terminal" title="Inspect and reconnect existing owner; never launch a shell or replay input" disabled={busy || !canControl} onClick={() => void run(async () => { await sdk.terminal.reconcile(terminal!.id); setViewEpoch((epoch) => epoch + 1); })}><Icon name="Link" /></button>
      <button className="icon-button" aria-label="Close terminal" title="Stop this exact owned terminal" disabled={busy || !canControl} onClick={() => void run(() => sdk.terminal.close(terminal!.id))}><Icon name="Close" /></button>
    </header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!connected && <p className="inline-error" role="status">Control plane disconnected. Queued input was discarded; no shell will be opened automatically.</p>}
    <div ref={host} className="ghostty-host" aria-disabled="true" />
    {!terminal && <button className="primary" disabled={busy || !canOpen} onClick={() => void run(async () => { const created = await sdk.terminal.open(session.id); setSelected(created.id!); })}>Open terminal</button>}
    {connected && terminal?.status === "running" && !canInput && <p className="fine-print">Read-only view: this is still the captured Local console. The current session environment or policy does not allow new input.</p>}
    {terminal?.diagnostic && <p className="fine-print">{terminal.diagnostic}</p>}
    {terminal?.status === "unconfirmed" && <button disabled={busy || !connected} onClick={() => void run(() => sdk.terminal.acknowledge(terminal.id, true))}>I inspected its processes</button>}
    {owner && <details className="terminal-owner"><summary>Shared Local owner / {owner.status}</summary>
      <p><code>{owner.id}</code><br />Broker PID {owner.pid ?? "unobserved"} / private resources {owner.cleanup}</p>
      {terminal?.binding && <p>Actual Local console root: <code>{terminal.binding.root}</code></p>}
      {owner.diagnostic && <p>{owner.diagnostic}</p>}
      {!["stopped", "acknowledged"].includes(owner.status) && <button disabled={busy || !connected} onClick={() => void run(async () => { await sdk.terminal.reconcileOwner(owner.id); setViewEpoch((epoch) => epoch + 1); })}>Inspect existing owner</button>}
      {owner.status === "unconfirmed" && <button disabled={busy || !connected} onClick={() => void run(() => sdk.terminal.acknowledgeOwner(owner.id, true))}>I inspected this owner</button>}
    </details>}
    <p className="terminal-boundary">Local user console. Output is volatile, never agent context. Close this panel to detach; service restart reattaches, service stop closes owned groups. Input is never replayed.</p>
  </section>;
}
