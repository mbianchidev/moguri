import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { runningSessionNames, runningSessions, sessionChildBindings, sessionSubtree, type MoguriSdk, type Session, type SessionChildrenAction, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

type Action = "archive" | "delete" | "detach";
type ReviewedSession = Pick<Session, "id" | "title" | "revision" | "status" | "projectId" | "parentSessionId" | "kind">;
export interface SessionActionOwner { signal: AbortSignal; settle(outcome: "completed" | "cancelled" | "failed"): void }
type Review = ({
  action: "archive" | "delete"; session: ReviewedSession; tree: ReviewedSession[];
  childrenAction: SessionChildrenAction | null; canDetachChildren: boolean; showChildChoice: boolean; confirmAction: boolean;
  /** Sessions in the tree whose work this stops. They always get an explicit warning, whatever "don't ask again" preference is saved. */
  running: Pick<Session, "id" | "title">[];
} | {
  action: "detach"; session: ReviewedSession;
  destination: { groupId: string | null; revision: number | null; name: string; parent: string };
  confirmAction: boolean;
}) & { owner?: SessionActionOwner };
const runningIn = (state: Snapshot, sessionId: string) => runningSessions(state.sessions, state.jobs, [sessionId]).map(({ id, title }) => ({ id, title }));
function sameChildren(tree: ReviewedSession[], sessions: Session[], sessionId: string): boolean {
  return JSON.stringify(sessionChildBindings(tree, sessionId)) === JSON.stringify(sessionChildBindings(sessions, sessionId));
}
export function useSessionActions(sdk: MoguriSdk, snapshot: Snapshot, options: {
  modal?: (open: boolean) => void; prepare?: (id: string) => Promise<void>; inspect?: (id: string) => void | Promise<void>;
  done?: (action: Action, id: string) => void; stored?: boolean;
} = {}) {
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [remember, setRemember] = useState(false), [rememberChildren, setRememberChildren] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id?: string; seq: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), pending = useRef(false), returnFocus = useRef<HTMLElement | null>(null);
  const current = snapshot.sessions.find((session) => session.id === review?.session.id);
  const destinationChanged = (value: Review, state: Snapshot) => value.action === "detach" && Boolean(value.destination.groupId &&
    !state.sessionGroups.some((group) => group.id === value.destination.groupId && group.projectId === value.session.projectId && group.revision === value.destination.revision));
  const stale = Boolean(review && (!current || current.revision !== review.session.revision || current.status !== review.session.status ||
    destinationChanged(review, snapshot) || review.action !== "detach" && !sameChildren(review.tree, snapshot.sessions, review.session.id)));
  useEffect(() => { options.modal?.(Boolean(review || busy)); return () => options.modal?.(false); }, [review, busy, options.modal]);
  useEffect(() => {
    if (!review || dialog.current?.open) return;
    dialog.current?.showModal();
    if (review.action === "detach") cancel.current?.focus();
  }, [review]);
  useEffect(() => {
    const owner = review?.owner;
    if (!owner) return;
    const abort = () => setReview((value) => value?.owner === owner ? null : value);
    owner.signal.addEventListener("abort", abort, { once: true });
    if (owner.signal.aborted) abort();
    return () => owner.signal.removeEventListener("abort", abort);
  }, [review]);
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
    review?.owner?.settle("cancelled");
    setReview(null); focusSession(review?.session.id);
  };
  const perform = async (value: Review, rememberAction: boolean, rememberChildrenChoice: boolean, confirmDetach?: true) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      value.owner?.signal.throwIfAborted();
      await options.prepare?.(value.session.id);
      value.owner?.signal.throwIfAborted();
      if (rememberAction || rememberChildrenChoice) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Confirmation preferences are unavailable. No session action was attempted.");
        if (value.action === "detach") {
          await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmSessionDetach: false } }, settings.revision);
        } else {
          const retention = { ...settings.values.retention };
          if (rememberAction) retention[value.action === "archive" ? "confirmArchive" : "confirmDelete"] = false;
          if (rememberChildrenChoice && value.childrenAction) {
            if (value.action === "archive") {
              if (value.childrenAction === "delete") throw new Error("Archive review cannot remember a delete-children choice.");
              retention.archiveChildren = value.childrenAction;
            } else {
              if (value.childrenAction === "archive") throw new Error("Delete review cannot remember an archive-children choice.");
              retention.deleteChildren = value.childrenAction;
            }
          }
          await sdk.settings.update({ ...settings.values, retention }, settings.revision);
        }
      }
      const check = () => {
        const state = sdk.getState(), session = state.snapshot?.sessions.find((session) => session.id === value.session.id);
        if (state.status !== "connected" || !state.snapshot || !session || session.revision !== value.session.revision ||
          session.status !== value.session.status || destinationChanged(value, state.snapshot) ||
          value.action !== "detach" && !sameChildren(value.tree, state.snapshot.sessions, value.session.id)) {
          throw new Error("This session or its attached children changed after review. Close and review it again; no session action was performed.");
        }
        return session;
      };
      check();
      value.owner?.signal.throwIfAborted();
      const children = value.action !== "detach" && value.tree.length > 1 && value.childrenAction ? {
        action: value.childrenAction, expected: sessionChildBindings(value.tree, value.session.id),
      } : undefined;
      const confirmRunning = value.action !== "detach" && value.running.length > 0;
      if (value.action === "delete") await sdk.sessions.delete(value.session.id, true, value.session.revision, children, confirmRunning ? { confirmRunning: true } : {});
      else if (value.action === "detach") await sdk.sessions.organize(value.session.id, { parentSessionId: null, groupId: value.destination.groupId }, value.session.revision, confirmDetach);
      else await sdk.command({ type: "session.archive", sessionId: value.session.id, expectedRevision: value.session.revision, ...(children ? { children } : {}), ...(confirmRunning ? { confirmRunning: true as const } : {}) });
      setReview(null); options.done?.(value.action, value.session.id);
      value.owner?.settle("completed");
      focusSession(value.session.id);
    } catch (error) {
      const state = sdk.getState().snapshot;
      if (value.action !== "detach" && state && error instanceof Error && "code" in error && error.code === "session_running") {
        // Work started after the review: show the running warning and ask again instead of failing.
        if (value.action === "delete") setConfirmed(false);
        setReview({ ...value, running: runningIn(state, value.session.id) }); setError("");
      } else setError(error instanceof Error ? error.message : "The session action failed. Unconfirmed work and retained artifacts were preserved.");
    } finally { pending.current = false; setBusy(false); }
  };
  const request = (session: Session, action: Action, groupId = session.groupId, owner?: SessionActionOwner) => {
    if (pending.current) { setError("The previous exact session action is still settling."); owner?.settle("failed"); return; }
    if (owner?.signal.aborted) { owner.settle("cancelled"); return; }
    setFocusTarget(null);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setRemember(false); setRememberChildren(false); setConfirmed(false);
    const source: ReviewedSession = { id: session.id, title: session.title, revision: session.revision, status: session.status,
      projectId: session.projectId, parentSessionId: session.parentSessionId, kind: session.kind };
    if (action === "detach") {
      if (!session.parentSessionId || session.turnId || session.kind === "subagent") { setError("Only an idle user-owned child session can be detached. No hierarchy was changed."); return; }
      const group = snapshot.sessionGroups.find((group) => group.id === groupId && group.projectId === session.projectId);
      if (groupId && !group) { setError("The destination group changed. Review the original project again; no session was detached."); return; }
      const value: Review = { action, session: source, owner, destination: { groupId, revision: group?.revision ?? null,
        name: group?.name ?? snapshot.projects.find((project) => project.id === session.projectId)?.name ?? "Chats",
        parent: snapshot.sessions.find((parent) => parent.id === session.parentSessionId)?.title ?? session.parentSessionId,
      }, confirmAction: snapshot.settings.values.interactions.confirmSessionDetach !== false };
      if (value.confirmAction) setReview(value);
      else void perform(value, false, false);
      return;
    }
    const tree = sessionSubtree(snapshot.sessions, session.id).map((value): ReviewedSession => ({
      id: value.id, title: value.title, revision: value.revision, status: value.status, projectId: value.projectId,
      parentSessionId: value.parentSessionId, kind: value.kind,
    }));
    const children = tree.slice(1), canDetachChildren = !children.some((child) => child.parentSessionId === session.id && child.kind === "subagent");
    const confirmAction = (action === "archive" ? snapshot.settings.values.retention.confirmArchive : snapshot.settings.values.retention.confirmDelete) !== false;
    const preference = action === "archive" ? snapshot.settings.values.retention.archiveChildren ?? "ask" : snapshot.settings.values.retention.deleteChildren ?? "ask";
    const preferredAction: SessionChildrenAction | null = preference === "ask" ? null : preference;
    const childrenAction = preferredAction === "detach" && !canDetachChildren ? null : preferredAction;
    const showChildChoice = children.length > 0 && (preference === "ask" || childrenAction === null);
    const running = runningIn(snapshot, session.id);
    const value: Review = { action, session: source, tree, childrenAction, canDetachChildren, showChildChoice, confirmAction, running, owner };
    if (action === "delete") setConfirmed(!confirmAction && !running.length);
    if (confirmAction || running.length || children.length > 0 && childrenAction === null) setReview(value);
    else void perform(value, false, false);
  };
  const stored = options.stored && review?.action === "delete";
  const title = review?.action === "detach" ? "Detach session" : review?.action === "archive" ? "Archive session" : stored ? "Delete stored session" : "Delete session";
  const running = review && review.action !== "detach" ? review.running : [];
  const confirmDelete = review?.action === "delete" && (review.confirmAction || running.length > 0);
  const childrenReviewRequired = review !== null && review.action !== "detach" && review.showChildChoice;
  const inspectionRequired = review?.action === "delete" && /inspect|unconfirmed|cleanup/i.test(error);
  const childrenSummary = review && review.action !== "detach" && review.tree.length > 1 ? review.childrenAction === "detach" ?
    `${review.showChildChoice ? "This choice" : "The selected preference"} settles owned work, detaches direct children and keeps their nested hierarchy intact.` : review.childrenAction ?
      `${review.showChildChoice ? "This choice" : "The selected preference"} will also ${review.childrenAction} all ${review.tree.length - 1} attached sessions, including nested subsessions.` : "" : "";
  const inspect = () => {
    if (!review || !options.inspect || pending.current) return;
    const id = review.session.id;
    close();
    void Promise.resolve(options.inspect(id)).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The session could not be opened for inspection."));
  };
  return { request, busy, reviewing: Boolean(review), error: review ? "" : error, dialog: review && <dialog ref={dialog} className="workspace-dialog" aria-label={title}
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={close}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!stale && (!childrenReviewRequired || "childrenAction" in review && review.childrenAction !== null) &&
        (!confirmDelete || confirmed)) void perform(review, remember, rememberChildren, review.action === "detach" ? true : undefined);
    }}>
      <h2>{title}: {review.session.title}</h2>
      {running.length > 0 && <Alert as="p" tone="warning">
        {`${runningSessionNames(running)} ${running.length === 1 ? "is" : "are"} still running. ${review.action === "archive" ? "Archiving" : "Deleting"} stops ${running.length === 1 ? "its" : "their"} current work. Moguri always asks before stopping running work, even if you turned off these confirmations.`}
      </Alert>}
      <p>{review.action === "detach" ? `Detach from "${review.destination.parent}" into the "${review.destination.name}" root list. Its workspace, Env, content and cancellation ownership stay unchanged; its children remain attached to it.` :
        review.action === "archive" ? `Stop this session's selected owned work and archive the conversation. Saved drafts, held prompts and independent artifacts remain; you can restore it from Archived. ${childrenSummary}` :
        `Permanently delete this conversation, its saved draft, queues, session content and every selected candidate or generation proposal. The service settles owned work and removes proposal records and retention grants first. Ordinary independent artifacts, applied code, worktrees and external PRs survive. Failed or unconfirmed cleanup blocks deletion. ${childrenSummary}`}</p>
      {review.action !== "detach" && review.showChildChoice && review.tree.length > 1 && <fieldset className="session-children-choice">
        <legend>{review.tree.length - 1} attached child sessions</legend>
        <p>{review.action === "archive" ? "Archive every attached session, including nested subsessions, or detach the direct children." :
          "Delete every attached session, including nested subsessions, or detach the direct children."}</p>
        <label className="check-setting"><SettingsInput type="radio" name="session-children-action" checked={review.childrenAction === review.action}
          disabled={busy} onChange={() => setReview((current) => current && current.action !== "detach" ? { ...current, childrenAction: current.action } : current)} />
          {review.action === "archive" ? "Archive attached sessions" : "Delete attached sessions"} (including nested subsessions)</label>
        <label className="check-setting"><SettingsInput type="radio" name="session-children-action" checked={review.childrenAction === "detach"}
          disabled={busy || !review.canDetachChildren} onChange={() => setReview((current) => current && current.action !== "detach" ? { ...current, childrenAction: "detach" } : current)} />
          Settle owned work, then detach direct children; nested descendants stay with their direct parent {!review.canDetachChildren && "(unavailable while model-owned subagents are attached)"}</label>
        <details><summary>Review attached sessions</summary><ul>{review.tree.slice(1).map((child) => <li key={child.id}>
          {child.title}{child.parentSessionId !== review.session.id ? " (nested)" : ""}
        </li>)}</ul></details>
        <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={rememberChildren} disabled={busy || review.childrenAction === null}
          onChange={(event) => setRememberChildren(event.target.checked)} />Don't ask me again about child sessions when {review.action === "archive" ? "archiving" : "deleting"}</label>}>
          Saves this exact cascade-or-detach choice in this profile. Change it in Settings / Retention. It never grants permissions or overrides cleanup checks.
        </SettingsHelp>
      </fieldset>}
      {stale && <Alert as="p" className="inline-error" role="alert">This session or its attached children changed after review. Close and review it again.</Alert>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      {confirmDelete && <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
        {stored ? "I confirm deletion of this stored session, its unsent content and originating candidates." : "I confirm deletion of this session, its unsent content and originating candidates."}{running.length > 0 && " Its running work stops."}</label>}
      {review.confirmAction && <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
        {review.action === "detach" ? "Do not ask again when detaching sessions" : review.action === "archive" ? "Do not ask again when archiving sessions" : "Do not ask again when deleting sessions"}</label>}>Change this preference in Settings / {review.action === "detach" ? "Confirmations" : "Sessions"}. It does not grant tool permissions or enable automatic cleanup.{review.action !== "detach" && " Running sessions always ask before their work stops."}</SettingsHelp>}
      <div className="button-row"><button ref={cancel} type="button" disabled={busy} onClick={close}>{review.action === "delete" ? "Cancel deletion" : "Cancel"}</button>
        {inspectionRequired && <button type="button" disabled={busy || !options.inspect} onClick={inspect}>Open session to inspect</button>}
        <button type="submit" className={review.action === "delete" || running.length ? "danger" : "primary"} disabled={busy || stale ||
          confirmDelete && !confirmed || childrenReviewRequired && "childrenAction" in review && review.childrenAction === null}>{running.length ? `Stop work and ${review.action === "archive" ? "archive" : "delete"}` : title}</button></div>
    </form>
  </dialog> };
}
