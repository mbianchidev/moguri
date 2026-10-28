import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

type Action = "archive" | "delete" | "detach";
type ReviewedSession = Pick<Session, "id" | "title" | "revision" | "status" | "projectId" | "parentSessionId">;
type Review = { action: "archive" | "delete"; session: ReviewedSession } | {
  action: "detach"; session: ReviewedSession;
  destination: { groupId: string | null; revision: number | null; name: string; parent: string };
};
export function useSessionActions(sdk: MoguriSdk, snapshot: Snapshot, options: {
  modal?: (open: boolean) => void; prepare?: (id: string) => Promise<void>; done?: (action: Action, id: string) => void; stored?: boolean;
} = {}) {
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [remember, setRemember] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id?: string; seq: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), pending = useRef(false), returnFocus = useRef<HTMLElement | null>(null);
  const current = snapshot.sessions.find((session) => session.id === review?.session.id);
  const destinationChanged = (value: Review, state: Snapshot) => value.action === "detach" && Boolean(value.destination.groupId &&
    !state.sessionGroups.some((group) => group.id === value.destination.groupId && group.projectId === value.session.projectId && group.revision === value.destination.revision));
  const stale = Boolean(review && (!current || current.revision !== review.session.revision || current.status !== review.session.status || destinationChanged(review, snapshot)));
  useEffect(() => { options.modal?.(Boolean(review || busy)); return () => options.modal?.(false); }, [review, busy, options.modal]);
  useEffect(() => { if (review) { dialog.current?.showModal(); if (review.action === "detach") cancel.current?.focus(); } }, [review]);
  useLayoutEffect(() => {
    if (!focusTarget || review || busy || snapshot.seq < focusTarget.seq) return;
    const source = Array.from(document.querySelectorAll<HTMLButtonElement>(".session-link")).find((element) => element.dataset.sessionId === focusTarget.id);
    if (source) source.focus();
    else if (returnFocus.current?.isConnected) returnFocus.current.focus();
    else document.querySelector<HTMLButtonElement>(".session-link, .start-trigger")?.focus();
    setFocusTarget(null);
  }, [focusTarget, review, busy, snapshot.seq]);
  const focusSession = (id?: string) => setFocusTarget({ id, seq: sdk.getState().snapshot?.seq ?? snapshot.seq });
  const close = () => {
    if (pending.current) return;
    setReview(null); focusSession(review?.session.id);
  };
  const perform = async (value: Review, skipFuture: boolean, confirmDetach?: true) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await options.prepare?.(value.session.id);
      const check = () => {
        const state = sdk.getState(), session = state.snapshot?.sessions.find((session) => session.id === value.session.id);
        if (state.status !== "connected" || !state.snapshot || !session || session.revision !== value.session.revision ||
          session.status !== value.session.status || destinationChanged(value, state.snapshot)) throw new Error("This session or destination changed after review. Close and review it again; no session action was performed.");
        return session;
      };
      check();
      if (skipFuture) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Confirmation preferences are unavailable. No session action was attempted.");
        await sdk.settings.update(value.action === "detach" ? { ...settings.values, interactions: { ...settings.values.interactions, confirmSessionDetach: false } } :
          { ...settings.values, retention: { ...settings.values.retention, [value.action === "archive" ? "confirmArchive" : "confirmDelete"]: false } }, settings.revision);
      }
      check();
      if (value.action === "delete") await sdk.sessions.delete(value.session.id, true, value.session.revision);
      else if (value.action === "detach") await sdk.sessions.organize(value.session.id, { parentSessionId: null, groupId: value.destination.groupId }, value.session.revision, confirmDetach);
      else await sdk.command({ type: "session.archive", sessionId: value.session.id });
      setReview(null); options.done?.(value.action, value.session.id);
      focusSession(value.session.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The session action failed. Unconfirmed work and retained artifacts were preserved.");
    } finally { pending.current = false; setBusy(false); }
  };
  const request = (session: Session, action: Action, groupId = session.groupId) => {
    if (pending.current) return;
    setFocusTarget(null);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setRemember(false); setConfirmed(false);
    const source: ReviewedSession = { id: session.id, title: session.title, revision: session.revision, status: session.status,
      projectId: session.projectId, parentSessionId: session.parentSessionId };
    let value: Review;
    if (action === "detach") {
      if (!session.parentSessionId || session.turnId || session.kind === "subagent") { setError("Only an idle user-owned child session can be detached. No hierarchy was changed."); return; }
      const group = snapshot.sessionGroups.find((group) => group.id === groupId && group.projectId === session.projectId);
      if (groupId && !group) { setError("The destination group changed. Review the original project again; no session was detached."); return; }
      value = { action, session: source, destination: { groupId, revision: group?.revision ?? null,
        name: group?.name ?? snapshot.projects.find((project) => project.id === session.projectId)?.name ?? "Chats",
        parent: snapshot.sessions.find((parent) => parent.id === session.parentSessionId)?.title ?? session.parentSessionId } };
    } else value = { action, session: source };
    if ((action === "detach" ? snapshot.settings.values.interactions.confirmSessionDetach : action === "archive" ?
      snapshot.settings.values.retention.confirmArchive : snapshot.settings.values.retention.confirmDelete) !== false) setReview(value);
    else void perform(value, false);
  };
  const stored = options.stored && review?.action === "delete";
  const title = review?.action === "detach" ? "Detach session" : review?.action === "archive" ? "Archive session" : stored ? "Delete stored session" : "Delete session";
  return { request, busy, reviewing: Boolean(review), error: review ? "" : error, dialog: review && <dialog ref={dialog} className="workspace-dialog" aria-label={title}
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={close}>
    <form onSubmit={(event) => { event.preventDefault(); if (!stale && (review.action !== "delete" || confirmed)) void perform(review, remember, review.action === "detach" ? true : undefined); }}>
      <h2>{title}: {review.session.title}</h2>
      <p>{review.action === "detach" ? `Detach from "${review.destination.parent}" into the "${review.destination.name}" root list. Its workspace, Env, content and cancellation ownership stay unchanged; its children remain attached to it.` :
        review.action === "archive" ? "Stop this session's owned work and archive the conversation. Saved drafts, held prompts and independent artifacts remain; you can restore it from Archived." :
        "Permanently delete this conversation, its saved draft, queues, session content and every candidate or generation proposal originating from it. The service settles owned work and removes proposal records and retention grants first. Ordinary independent artifacts, applied code, worktrees and external PRs survive; linked children are detached, not deleted. Failed or unconfirmed cleanup blocks deletion."}</p>
      {stale && <p className="inline-error" role="alert">This session changed after review. Close and review it again.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {review.action === "delete" && <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
        {stored ? "I confirm deletion of this stored session, its unsent content and originating candidates." : "I confirm deletion of this session, its unsent content and originating candidates."}</label>}
      <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
        {review.action === "detach" ? "Do not ask again when detaching sessions" : review.action === "archive" ? "Do not ask again when archiving sessions" : "Do not ask again when deleting sessions"}</label>}>Change this preference in Settings / {review.action === "detach" ? "Confirmations" : "Sessions"}. It does not grant tool permissions or enable automatic cleanup.</SettingsHelp>
      <div className="button-row"><button ref={cancel} type="button" disabled={busy} onClick={close}>{review.action === "delete" ? "Cancel deletion" : "Cancel"}</button>
        <button type="submit" className={review.action === "delete" ? "danger" : "primary"} disabled={busy || stale || review.action === "delete" && !confirmed}>{title}</button></div>
    </form>
  </dialog> };
}
