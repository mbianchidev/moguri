import { SettingsAction, SettingsHelp } from "./SettingsFields.tsx";
import { useState } from "react";
import type { MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";
import { useSessionActions } from "./SessionActions.tsx";
import { Alert } from "./Alert.tsx";

export function SessionManagement({ sdk, snapshot, openSession, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; openSession: (id: string) => void; onDirty: (dirty: boolean) => void;
}) {
  const [selected, setSelected] = useState(""), [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const actions = useSessionActions(sdk, snapshot, { stored: true, modal: onDirty, inspect: openSession, done: () => {
    setSelected(""); setNotice("Session and its candidates deleted. Artifacts, applied code, worktrees and PRs were kept.");
  } });
  const session = snapshot.sessions.find((session) => session.id === selected);
  const sessions = snapshot.sessions.filter((session) => filter === "all" || (session.status === "archived") === (filter === "archived"));
  const blocked = session && (snapshot.blockedSessions.includes(session.id) || session.workspaceId && snapshot.blockedWorkspaces.includes(session.workspaceId) ||
    session.projectId && !session.workspaceId && snapshot.blockedProjects.includes(session.projectId));
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "The session action failed. Unconfirmed content and artifacts were kept."); }
    finally { setBusy(false); }
  };
  const pending = busy || actions.busy;
  return <section aria-label="Stored session management"><SettingsHelp label="More about this setting" target={<h3>Manage stored sessions</h3>}>Deleting a session also deletes the candidates and proposals it created; archiving keeps them. Artifacts, applied code, worktrees and PRs are always kept.</SettingsHelp>
    {snapshot.candidateCleanups.filter((cleanup) => cleanup.status !== "completed").map((cleanup) => <Alert as="p" key={cleanup.id} className="settings-warning" role={cleanup.status === "failed" ? "alert" : "status"}>
      Candidate cleanup {cleanup.status}: {cleanup.diagnostic ?? "Waiting for running work to finish."} {cleanup.reason.kind === "session-delete" ? "Settle the session's running work, then delete it again." : "Cleanup after the PR merge retries automatically. Code and Git data aren't touched."}
    </Alert>)}
    <label className="setting-field">Show sessions<select aria-label="Stored session filter" value={filter} onChange={(event) => {
      const value = event.target.value; if (value === "all" || value === "active" || value === "archived") { setFilter(value); setSelected(""); }
    }}><option value="all">All sessions</option><option value="active">Not archived</option><option value="archived">Archived</option></select></label>
    <label className="setting-field">Stored session<select aria-label="Stored session" value={session?.id ?? ""} disabled={pending} onChange={(event) => { setSelected(event.target.value); setError(""); setNotice(""); }}>
      <option value="">Choose a session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.title} / {session.status}</option>)}
    </select></label>
    {session && <><p className="fine-print">{session.status} / {session.messages.length} messages / {session.queue.length} queued. {session.completedAt ? `Last completed ${new Date(session.completedAt).toLocaleString()}.` : "Not completed yet."}</p>
      <div className="button-row"><SettingsAction label="Open this session" icon="Back" disabled={pending} onClick={() => openSession(session.id)} />
        {session.status === "archived" && <button type="button" disabled={pending} onClick={() => void run(async () => { await sdk.command({ type: "session.restore", sessionId: session.id }); setNotice("Session restored."); })}>Restore session</button>}
        {session.status !== "archived" && !session.turnId && (blocked || session.queue.length > 0) && <button type="button" disabled={pending} onClick={() => openSession(session.id)} aria-label="Open selected session">Open</button>}
        <SettingsAction label={snapshot.settings.values.retention.confirmDelete === false ? "Delete stored session" : "Review session deletion"} icon="Trash" className="danger" disabled={pending || Boolean(session.turnId)} onClick={() => actions.request(session, "delete")} />
      </div>{session.turnId && <p className="fine-print">Open the session and stop its running turn before deleting it.</p>}</>}
    {!sessions.length && <p className="fine-print">No stored sessions in this filter.</p>}
    {notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}{(error || actions.error) && <Alert as="p" className="inline-error" role="alert">{error || actions.error}</Alert>}
    {actions.dialog}
  </section>;
}
