import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

export function SessionManagement({ sdk, snapshot, openSession, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; openSession: (id: string) => void; onDirty: (dirty: boolean) => void;
}) {
  const [selected, setSelected] = useState(""), [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [review, setReview] = useState<Pick<Session, "id" | "title" | "revision" | "status"> | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const session = snapshot.sessions.find((session) => session.id === selected);
  const sessions = snapshot.sessions.filter((session) => filter === "all" || (session.status === "archived") === (filter === "archived"));
  const stale = review && !snapshot.sessions.some((session) => session.id === review.id && session.revision === review.revision && session.status === review.status);
  const blocked = session && (snapshot.blockedSessions.includes(session.id) || session.workspaceId && snapshot.blockedWorkspaces.includes(session.workspaceId) ||
    session.projectId && !session.workspaceId && snapshot.blockedProjects.includes(session.projectId));
  useEffect(() => { onDirty(busy || review !== null); return () => onDirty(false); }, [busy, review, onDirty]);
  useEffect(() => { if (review) dialog.current?.showModal(); }, [review]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Session management failed. Unconfirmed content and independent artifacts were preserved."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Stored session management"><h3>Manage stored sessions</h3><p>Use the shared service lifecycle, never unlink database files. Independent artifacts, worktrees, connected PRs and other profiles are not deleted with a conversation.</p>
    <label className="setting-field">Show sessions<select aria-label="Stored session filter" value={filter} onChange={(event) => {
      const value = event.target.value; if (value === "all" || value === "active" || value === "archived") { setFilter(value); setSelected(""); }
    }}><option value="all">All sessions</option><option value="active">Not archived</option><option value="archived">Archived</option></select></label>
    <label className="setting-field">Stored session<select aria-label="Stored session" value={session?.id ?? ""} disabled={busy} onChange={(event) => { setSelected(event.target.value); setError(""); setNotice(""); }}>
      <option value="">Choose an actual session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title} / {session.status}</option>)}
    </select></label>
    {session && <><p className="fine-print">{session.status} / {session.messages.length} messages / {session.queue.length} queued. {session.completedAt ? `Last completed ${new Date(session.completedAt).toLocaleString()}.` : "No actual completion recorded."}</p>
      <div className="button-row"><button type="button" disabled={busy} onClick={() => openSession(session.id)}>Open this session</button>
        <button type="button" disabled={busy || Boolean(session.turnId)} onClick={() => void run(async () => { await sdk.command({ type: session.status === "archived" ? "session.restore" : "session.archive", sessionId: session.id }); setNotice("Session lifecycle recorded by its owning service."); })}>{session.status === "archived" ? "Restore session" : "Archive session"}</button>
        {session.status !== "archived" && !session.turnId && (blocked || session.queue.length > 0) && <button type="button" disabled={busy} onClick={() => openSession(session.id)}>Inspect and resume this session</button>}
        <button type="button" className="danger" disabled={busy || Boolean(session.turnId)} onClick={() => { setReview({ id: session.id, title: session.title, revision: session.revision, status: session.status }); setConfirmed(false); }}>Review session deletion</button>
      </div>{session.turnId && <p className="fine-print">Open and stop this owned turn before deleting it from storage. No work is replayed after sleep or reconnection.</p>}</>}
    {!sessions.length && <p className="fine-print">No stored sessions in this filter.</p>}
    {notice && <p className="fine-print" role="status">{notice}</p>}{error && !review && <p className="inline-error" role="alert">{error}</p>}
    {review && <dialog ref={dialog} className="workspace-dialog" aria-label="Delete stored session" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { if (!busy) setReview(null); }}>
      <h2>Delete {review.title}</h2><p>Delete this conversation, its saved draft, queues and session content from the encrypted store. The service stops its owned resources first. Independent artifacts and worktrees survive; linked children are detached, not deleted. Uncertain cleanup blocks deletion.</p>
      {stale && <p className="inline-error" role="alert">This session changed after review. Close and review it again.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I confirm deletion of this stored session, including its unsent content.</label>
      <div className="button-row"><button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel deletion</button><button type="button" className="danger" disabled={busy || !confirmed || Boolean(stale)} onClick={() => void run(async () => {
        await sdk.command({ type: "session.delete", sessionId: review.id, expectedRevision: review.revision, confirm: true });
        setSelected(""); setReview(null); setNotice("Stored session deleted. Independent artifacts, worktrees and external PRs were preserved.");
      })}>Delete stored session</button></div>
    </dialog>}
  </section>;
}
