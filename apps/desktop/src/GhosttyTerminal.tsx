import { useEffect, useRef, useState } from "react";
import { FitAddon, Ghostty, Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

let ghostty: Promise<Ghostty> | undefined;
export function GhosttyTerminal({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const terminals = snapshot.terminals.filter((terminal) => terminal.sessionId === session.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const terminal = terminals.find((terminal) => terminal.id === selected) ?? terminals.findLast((terminal) => terminal.status === "running") ?? terminals.at(-1);
  const host = useRef<HTMLDivElement>(null);
  const emulator = useRef<Terminal | null>(null);
  const input = useRef(Promise.resolve());
  const run = async (operation: () => Promise<unknown>) => {
    setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Terminal operation failed. No input was replayed."); }
  };
  useEffect(() => {
    if (!terminal || !host.current) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Terminal | undefined;
    let cursor = 0;
    const read = async () => {
      if (disposed || !current) return;
      try {
        const result = await sdk.terminal.read(terminal.id, cursor);
        if (disposed) return;
        if (cursor < result.baseOffset) { current.reset(); setError("Older output exceeded the bounded in-memory buffer. The view starts at its retained tail."); }
        current.write(result.data); cursor = result.nextOffset;
        current.options.disableStdin = result.terminal.status !== "running";
        if (result.terminal.status === "running" || result.data.length) timer = setTimeout(() => void read(), result.data.length === 65536 ? 0 : 120);
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Terminal disconnected. Input was not replayed."); }
    };
    void (async () => {
      try {
        ghostty ??= Ghostty.load(wasmUrl);
        const runtime = await ghostty;
        if (disposed || !host.current) return;
        current = new Terminal({ ghostty: runtime, cols: terminal.cols, rows: terminal.rows, fontSize: 12, scrollback: 1500,
          disableStdin: terminal.status !== "running", theme: { background: "#11161e", foreground: "#e1e8f0", cursor: "#a8d7bc" } });
        current.open(host.current); emulator.current = current;
        host.current.setAttribute("aria-label", "Ghostty terminal");
        current.textarea?.setAttribute("aria-label", "Terminal input");
        const fit = new FitAddon(); current.loadAddon(fit);
        current.onData((data) => { input.current = input.current.then(() => sdk.terminal.input(terminal.id, data)).catch((error: unknown) => { if (!disposed) setError(error instanceof Error ? error.message : "Input was not acknowledged and was not replayed."); }); });
        current.onResize(({ cols, rows }) => {
          if (!current?.options.disableStdin) void sdk.terminal.resize(terminal.id, Math.min(500, Math.max(10, cols)), Math.min(200, Math.max(2, rows))).catch((error: unknown) => { if (!disposed) setError(error instanceof Error ? error.message : "Terminal resize failed."); });
        });
        current.attachCustomKeyEventHandler((event) => {
          if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c" && current?.hasSelection()) { void run(() => window.moguri.copyText(current!.getSelection())); return true; }
          return false;
        });
        fit.fit(); fit.observeResize(); void read();
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Ghostty could not initialize. Rebuild its bundled WASM asset."); }
    })();
    return () => { disposed = true; clearTimeout(timer); current?.dispose(); emulator.current = null; };
  }, [terminal?.id, sdk]);
  return <section className="ghostty-panel" aria-label="Embedded Ghostty terminal">
    <header className="terminal-tabs"><select aria-label="Selected terminal" value={terminal?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>{terminals.map((terminal, index) => <option key={terminal.id} value={terminal.id}>{terminal.title} {index + 1} / {terminal.status}</option>)}{!terminals.length && <option value="">No terminal</option>}</select>
      <button className="icon-button" aria-label="New terminal" title="New terminal" onClick={() => void run(async () => { const created = await sdk.terminal.open(session.id); setSelected(created.id!); })}><Icon name="Plus" /></button>
      <button className="icon-button" aria-label="Copy terminal selection" title="Copy selection" disabled={!terminal} onClick={() => void run(() => window.moguri.copyText(emulator.current?.getSelection() ?? ""))}><Icon name="Copy" /></button>
      <button className="icon-button" aria-label="Close terminal" title="Stop and close terminal" disabled={!terminal || terminal.status !== "running"} onClick={() => void run(() => sdk.terminal.close(terminal!.id))}><Icon name="Close" /></button>
    </header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div ref={host} className="ghostty-host" />
    {!terminal && <button className="primary" onClick={() => void run(async () => { const created = await sdk.terminal.open(session.id); setSelected(created.id!); })}>Open terminal</button>}
    {terminal?.diagnostic && <p className="fine-print">{terminal.diagnostic}</p>}
    {terminal?.status === "unconfirmed" && <button onClick={() => void run(() => sdk.terminal.acknowledge(terminal.id, true))}>I inspected its processes</button>}
    <p className="terminal-boundary">Ghostty / Local user console. Input and output are not saved or sent to the agent. Closing the panel does not stop its shell.</p>
  </section>;
}
