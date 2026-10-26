import { useEffect, useRef, useState } from "react";
import type { ContinueWorkChoice, ContinueWorkReview, DraftEditor, MoguriSdk } from "../../../packages/sdk/src/index.ts";

export function ContinueWorkDialog({ sdk, editor, review, close, modal }: {
  sdk: MoguriSdk; editor: DraftEditor; review: ContinueWorkReview; close: () => void; modal: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const session = sdk.getState().snapshot?.sessions.find((session) => session.id === review.sessionId);
  const canDelegate = session?.projectId && session.kind === "agent" && session.mode === "agent" && session.controls.env === "Local" &&
    !session.turnId && !session.queue.length && session.status !== "archived";
  useEffect(() => { modal(true); ref.current?.showModal(); return () => modal(false); }, [modal]);
  const choose = async (choice: ContinueWorkChoice) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (sdk.profileId !== review.profileId) throw new Error("The owning profile changed. Review the current draft again.");
      await editor.chooseContinueWork(review, choice);
      close();
    } catch (error) { setError(error instanceof Error ? error.message : "The route was not acknowledged. Your draft was preserved."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <dialog ref={ref} className="workspace-dialog" aria-label="Continue work" onCancel={(event) => {
    event.preventDefault(); if (!pending.current) close();
  }}><header><h2>Continue work</h2></header>
    <p>Work from this project's Kanban, or send this exact prompt to the model? Choose for this request only.</p>
    <pre className="kanban-source-body">{review.text}</pre>
    <p className="fine-print">Kanban handles one item through its PR. Sending to the model uses the normal chat, controls and permissions. Cancel keeps your draft.</p>
    {!canDelegate && <p className="fine-print">Kanban delegation needs an idle writable Local project chat. You can still send the prompt normally.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {busy && <p role="status">Saving this choice. No replacement request will be sent.</p>}
    <footer><button disabled={busy} onClick={close}>Cancel</button><button disabled={busy || !session} onClick={() => void choose("prompt")}>Send to model</button>
      <button className="primary" autoFocus disabled={busy || !canDelegate} onClick={() => void choose("kanban")}>Work from Kanban</button></footer>
  </dialog>;
}
