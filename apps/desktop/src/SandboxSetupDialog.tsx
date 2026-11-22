import { useCallback, useEffect, useRef, useState } from "react";
import type { MoguriSdk, Snapshot } from "@moguri-dev/sdk";
import { SandboxSetupPanel } from "./SandboxSetupPanel.tsx";

const unchanged = () => {};
export function SandboxSetupDialog({ sdk, snapshot, sessionId, expectedRevision, close }: {
  sdk: MoguriSdk; snapshot: Snapshot; sessionId: string; expectedRevision: number; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), choosing = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  const ready = useCallback(async () => {
    if (choosing.current) throw new Error("The original Env selection was already submitted. Inspect that exact outcome or close this dialog; no selection was replayed.");
    const current = sdk.getState();
    if (current.status !== "connected" || !current.snapshot?.settings.values.sandboxManagement?.enabled ||
      !current.snapshot.settings.values.sandboxManagement.automaticWorkspaces ||
      !current.snapshot.capabilities.find((capability) => capability.env === "Sandbox")?.ready) {
      throw new Error("SendBox is not confirmed ready with automatic private workspaces. Inspect its actual setup or custom settings; no Env was changed.");
    }
    choosing.current = true;
    await sdk.sessions.env(sessionId, "Sandbox", expectedRevision);
    close();
  }, [sdk, sessionId, expectedRevision, close]);
  return <dialog ref={ref} className="workspace-dialog sandbox-setup-dialog" aria-label="Set up SendBox" onCancel={(event) => {
    event.preventDefault(); if (!busy) close();
  }}>
    <header><h2>Set up SendBox</h2></header>
    <p>Review once. Moguri manages the bundled runtime and private workspaces for chats and projects. Customization stays in Settings.</p>
    <SandboxSetupPanel sdk={sdk} snapshot={snapshot} value={snapshot.settings.values.sandboxManagement} disabled={false}
      onBusy={setBusy} onDirty={unchanged} update={unchanged} compact onReady={ready} />
    <footer><button type="button" disabled={busy} onClick={close}>Close</button></footer>
  </dialog>;
}
