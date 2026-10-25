import { useState } from "react";
import type { MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";
import { useSessionActions } from "./SessionActions.tsx";

export function SessionManagement({ sdk, snapshot, openSession, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; openSession: (id: string) => void; onDirty: (dirty: boolean) => void;
}) {
  const [selected, setSelected] = useState(""), [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const actions = useSessionActions(sdk, snapshot, { stored: true, modal: onDirty, done: () => {
    setSelected(""); setNotice("Stored session and its originating candidates deleted. Ordinary artifacts, applied code, worktrees and external PRs were preserved.");
  } });
  const session = snapshot.sessions.find((session) => session.id === selected);
  const sessions = snapshot.sessions.filter((session) => filter === "all" || (session.status === "archived") === (filter === "archived"));
  const blocked = session && (snapshot.blockedSessions.includes(session.id) || session.workspaceId && snapshot.blockedWorkspaces.includes(session.workspaceId) ||
    session.projectId && !session.workspaceId && snapshot.blockedProjects.includes(session.projectId));
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Session management failed. Unconfirmed content and independent artifacts were preserved."); }
    finally { setBusy(false); }
  };
  const pending = busy || actions.busy;
  return <section aria-label="Stored session management"><h3>Manage stored sessions</h3><p>Permanent session deletion also deletes its originating candidates and generation proposals. Archiving alone preserves them. Ordinary artifacts, applied code, worktrees, connected PRs and other profiles are preserved.</p>
    {snapshot.candidateCleanups.filter((cleanup) => cleanup.status !== "completed").map((cleanup) => <p key={cleanup.id} className="settings-warning" role={cleanup.status === "failed" ? "alert" : "status"}>
      Candidate cleanup {cleanup.status}: {cleanup.diagnostic ?? "Owned work is settling; deletion is not complete."} {cleanup.reason.kind === "session-delete" ? "Reconcile owned resources, then retry this session's deletion." : "Verified-merge cleanup will retry automatically; no code or Git resources are removed."}
    </p>)}
    <label className="setting-field">Show sessions<select aria-label="Stored session filter" value={filter} onChange={(event) => {
      const value = event.target.value; if (value === "all" || value === "active" || value === "archived") { setFilter(value); setSelected(""); }
    }}><option value="all">All sessions</option><option value="active">Not archived</option><option value="archived">Archived</option></select></label>
    <label className="setting-field">Stored session<select aria-label="Stored session" value={session?.id ?? ""} disabled={pending} onChange={(event) => { setSelected(event.target.value); setError(""); setNotice(""); }}>
      <option value="">Choose an actual session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title} / {session.status}</option>)}
    </select></label>
    {session && <><p className="fine-print">{session.status} / {session.messages.length} messages / {session.queue.length} queued. {session.completedAt ? `Last completed ${new Date(session.completedAt).toLocaleString()}.` : "No actual completion recorded."}</p>
      <div className="button-row"><button type="button" disabled={pending} onClick={() => openSession(session.id)}>Open this session</button>
        {session.status === "archived" && <button type="button" disabled={pending} onClick={() => void run(async () => { await sdk.command({ type: "session.restore", sessionId: session.id }); setNotice("Session restored by its owning service."); })}>Restore session</button>}
        {session.status !== "archived" && !session.turnId && (blocked || session.queue.length > 0) && <button type="button" disabled={pending} onClick={() => openSession(session.id)}>Inspect and resume this session</button>}
        <button type="button" className="danger" disabled={pending || Boolean(session.turnId)} onClick={() => actions.request(session, "delete")}>{snapshot.settings.values.retention.confirmDelete === false ? "Delete stored session" : "Review session deletion"}</button>
      </div>{session.turnId && <p className="fine-print">Open and stop this owned turn before deleting it from storage. No work is replayed after sleep or reconnection.</p>}</>}
    {!sessions.length && <p className="fine-print">No stored sessions in this filter.</p>}
    {notice && <p className="fine-print" role="status">{notice}</p>}{(error || actions.error) && <p className="inline-error" role="alert">{error || actions.error}</p>}
    {actions.dialog}
  </section>;
}
