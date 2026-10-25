import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

type Action = "archive" | "delete";
interface Review { action: Action; session: Pick<Session, "id" | "title" | "revision" | "status"> }
export function useSessionActions(sdk: MoguriSdk, snapshot: Snapshot, options: {
  modal?: (open: boolean) => void; prepare?: (id: string) => Promise<void>; done?: (action: Action, id: string) => void; stored?: boolean;
} = {}) {
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [remember, setRemember] = useState(false), [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), returnFocus = useRef<HTMLElement | null>(null);
  const current = snapshot.sessions.find((session) => session.id === review?.session.id);
  const stale = Boolean(review && (!current || current.revision !== review.session.revision || current.status !== review.session.status));
  useEffect(() => { options.modal?.(Boolean(review || busy)); return () => options.modal?.(false); }, [review, busy, options.modal]);
  useEffect(() => { if (review) dialog.current?.showModal(); }, [review]);
  const close = () => {
    if (pending.current) return;
    setReview(null);
    queueMicrotask(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else document.querySelector<HTMLButtonElement>(".session-link, .start-trigger")?.focus();
    });
  };
  const perform = async (value: Review, skipFuture: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await options.prepare?.(value.session.id);
      const session = sdk.getState().snapshot?.sessions.find((session) => session.id === value.session.id);
      if (!session || session.revision !== value.session.revision || session.status !== value.session.status) throw new Error("This session changed after review. Close and review it again; nothing was archived or deleted.");
      if (skipFuture) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Confirmation preferences are unavailable. No session action was attempted.");
        await sdk.settings.update({ ...settings.values, retention: { ...settings.values.retention,
          [value.action === "archive" ? "confirmArchive" : "confirmDelete"]: false } }, settings.revision);
      }
      if (value.action === "delete") await sdk.sessions.delete(value.session.id, true, value.session.revision);
      else await sdk.command({ type: "session.archive", sessionId: value.session.id });
      setReview(null); options.done?.(value.action, value.session.id);
      queueMicrotask(() => document.querySelector<HTMLButtonElement>(".session-link, .start-trigger")?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : "The session action failed. Unconfirmed work and retained artifacts were preserved.");
    } finally { pending.current = false; setBusy(false); }
  };
  const request = (session: Session, action: Action) => {
    if (pending.current) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setRemember(false); setConfirmed(false);
    const value = { action, session: { id: session.id, title: session.title, revision: session.revision, status: session.status } };
    if ((action === "archive" ? snapshot.settings.values.retention.confirmArchive : snapshot.settings.values.retention.confirmDelete) !== false) setReview(value);
    else void perform(value, false);
  };
  const stored = options.stored && review?.action === "delete";
  const title = review?.action === "archive" ? "Archive session" : stored ? "Delete stored session" : "Delete session";
  return { request, busy, reviewing: Boolean(review), error: review ? "" : error, dialog: review && <dialog ref={dialog} className="workspace-dialog" aria-label={title}
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={close}>
    <form onSubmit={(event) => { event.preventDefault(); if (!stale && (review.action !== "delete" || confirmed)) void perform(review, remember); }}>
      <h2>{title}: {review.session.title}</h2>
      <p>{review.action === "archive" ? "Stop this session's owned work and archive the conversation. Saved drafts, held prompts and independent artifacts remain; you can restore it from Archived." :
        "Permanently delete this conversation, its saved draft, queues, session content and every candidate or generation proposal originating from it. The service settles owned work and removes proposal records and retention grants first. Ordinary independent artifacts, applied code, worktrees and external PRs survive; linked children are detached, not deleted. Failed or unconfirmed cleanup blocks deletion."}</p>
      {stale && <p className="inline-error" role="alert">This session changed after review. Close and review it again.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {review.action === "delete" && <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
        {stored ? "I confirm deletion of this stored session, its unsent content and originating candidates." : "I confirm deletion of this session, its unsent content and originating candidates."}</label>}
      <label className="check-setting"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
        {review.action === "archive" ? "Do not ask again when archiving sessions" : "Do not ask again when deleting sessions"}</label>
      <p className="fine-print">Change this preference in Settings / Sessions. It does not grant tool permissions or enable automatic cleanup.</p>
      <div className="button-row"><button type="button" disabled={busy} onClick={close}>{review.action === "delete" ? "Cancel deletion" : "Cancel"}</button>
        <button type="submit" className={review.action === "delete" ? "danger" : "primary"} disabled={busy || stale || review.action === "delete" && !confirmed}>{title}</button></div>
    </form>
  </dialog> };
}
