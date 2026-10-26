import { useEffect, useState, type ReactNode } from "react";
import { activeProjectWork, claimedProjectWork, defaultBoard, kanbanPreferences, type IssueInput, type IssueKind, type LocalIssue, type MoguriSdk, type Project, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { GitHubItemPicker, type GithubSelection } from "./GitHubPickers.tsx";

const newFields = (phaseId: string): IssueInput => ({ title: "", body: "", kind: "feature", phaseId, pullRequestUrl: null });
export function ProjectBoard({ sdk, project, session, snapshot, onBack, onUnsavedChange, onSettings, openSession, children }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; onBack: () => void; onUnsavedChange: (dirty: boolean) => void;
  onSettings: () => void; session?: Session; openSession: (id: string) => Promise<void>; children?: ReactNode;
}) {
  const board = snapshot.boards.find((board) => board.projectId === project.id) ?? defaultBoard(project.id);
  const issues = snapshot.issues.filter((issue) => issue.projectId === project.id);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; revision: number; fields: IssueInput; base: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [linearCursor, setLinearCursor] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "chat">("board");
  const [githubKind, setGithubKind] = useState<"issue" | "pull" | null>(null), [github, setGithub] = useState<GithubSelection | null>(null);
  const [createdSession, setCreatedSession] = useState("");
  const preferences = kanbanPreferences(board);
  const projectWork = snapshot.projectWorkRuns.filter((run) => run.projectId === project.id);
  const work = [...projectWork.filter(activeProjectWork), ...projectWork.filter((run) => !activeProjectWork(run)).slice(-8)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = work.some(activeProjectWork), claims = new Set(snapshot.projectWorkRuns.filter(claimedProjectWork).map((run) => run.source.key));
  const canContinue = session?.projectId === project.id && session.controls.env === "Local" && session.mode === "agent" &&
    Boolean(session.controls.modelId) && snapshot.policy.allowedEnvs.includes("Local") && !session.turnId && !session.queue.length &&
    !projectWork.some((run) => run.originSessionId === session.id && activeProjectWork(run));
  const dirty = Boolean(editing && JSON.stringify(editing.fields) !== editing.base);
  useEffect(() => { onUnsavedChange(dirty || busy); return () => onUnsavedChange(false); }, [dirty, busy, onUnsavedChange]);
  const run = async (operation: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The project operation failed. Your edit was preserved."); }
    finally { setBusy(false); }
  };
  const edit = (issue?: LocalIssue) => {
    if (dirty) { setError("Save or cancel this edit before selecting another ticket."); return; }
    const fields = issue ? { title: issue.title, body: issue.body, kind: issue.kind, phaseId: issue.phaseId, pullRequestUrl: issue.pullRequest?.url ?? null } : newFields(board.columns[0]!.id);
    setEditing({ id: issue?.id ?? null, revision: issue?.revision ?? 0, fields, base: JSON.stringify(fields) }); setError("");
  };
  const change = (value: Partial<IssueInput>) => setEditing((current) => current ? { ...current, fields: { ...current.fields, ...value } } : null);
  const save = () => run(async () => {
    if (!editing) return;
    if (editing.id) await sdk.issues.update(editing.id, editing.fields, editing.revision);
    else await sdk.issues.create(project.id, editing.fields);
    setEditing(null);
  });
  const importLinear = () => run(async () => {
    const job = await sdk.linear.import(project.id, linearCursor ?? undefined);
    const completed = await sdk.jobs.wait(job.id!);
    if (completed.status !== "completed") throw new Error(completed.error ?? `Import is ${completed.status}.`);
    const result: unknown = JSON.parse((await sdk.mcp.readResult(job.id!)).text);
    if (!result || typeof result !== "object" || !("nextCursor" in result) || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("The retained import response was invalid.");
    setLinearCursor(result.nextCursor); setNotice(result.nextCursor ? "Imported this page. More remote tickets are available." : "Import finished. Existing local edits were preserved; nothing was exported.");
  });
  const continueWork = (issueId?: string) => run(async () => {
    if (!session) throw new Error("Open this project's Kanban chat first.");
    const task = await sdk.kanban.continue(session.id, issueId);
    setNotice(`Task ${task.id} is preparing one isolated checkout. Its actual status appears below; no next card or merge is scheduled.`);
  });
  return <section className="project-board-page" aria-label="Local project issue board">
    <header className="board-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" onClick={onBack}><Icon name="Back" /></button><div><h1>Kanban</h1><p>{project.name} / project board and chat</p></div><button disabled={busy || dirty || !canContinue} onClick={() => void continueWork()}>Continue work</button><button disabled={busy || dirty} onClick={() => void run(async () => {
      const job = await sdk.issues.refresh(project.id); setNotice(`Linked-PR check ${job.id} started. Only verified merges advance phases.`);
    })}>Refresh linked PRs</button><button className="primary" aria-label="New issue" disabled={busy || dirty} onClick={() => edit()}>New</button></header>
    <div className="board-view-switch" role="group" aria-label="Kanban view"><button aria-pressed={view === "board"} disabled={dirty || busy} onClick={() => setView("board")}>Board</button>
      <button aria-pressed={view === "chat"} disabled={dirty || busy} onClick={() => setView("chat")}>Chat</button>
      <span>Continue from {preferences.source === "kanban" ? "Kanban cards" : preferences.source === "github-prs" ? "open GitHub PRs" : "open GitHub issues"} / one item to its draft PR</span></div>
    {(error || notice) && <div className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</div>}
    {createdSession && <button className="quiet" disabled={busy || dirty} onClick={() => void openSession(createdSession)}>Open created source session</button>}
    {view === "chat" ? <div className="kanban-chat">{children}</div> : <div className="kanban-board-content">
    {!session?.controls.modelId && <p className="board-guidance">Choose a model in Chat before Continue work. Opening this board never starts inference or signs in.</p>}
    {work.length > 0 && <section className="kanban-work" aria-label="Project continuation tasks"><h2>{active ? "Current work" : "Recent work"}</h2>{work.map((task) => <article key={task.id} className="job-row">
      <div><strong>{task.source.title}</strong><small>{task.status}{task.diagnostic ? `: ${task.diagnostic}` : ""}</small>{task.prUrl && <button className="quiet" onClick={() => void run(async () => { await window.moguri.openExternal(task.prUrl!); })}>Open published PR</button>}</div>
      {task.sessionId && snapshot.sessions.some((session) => session.id === task.sessionId) && <button disabled={dirty || busy} onClick={() => void openSession(task.sessionId!)}>Open task</button>}
      {activeProjectWork(task) ? <button disabled={busy} onClick={() => void run(async () => { await sdk.kanban.cancel(task.id); setNotice("Stop requested for the original owned task. Its actual acknowledgement is retained; partial work is not success."); })}>Stop task</button> :
        task.status !== "completed" && !task.inspectedAt && <button disabled={busy} onClick={() => void run(async () => { await sdk.kanban.inspect(task.id, task.revision, true); setNotice("Recorded your inspection. The task was not resumed and its original branch/worktree was preserved."); })}>I inspected this task; release card</button>}
    </article>)}</section>}
    <div className="board-options"><button aria-pressed={archived} onClick={() => setArchived((value) => !value)}>{archived ? "Show active issues" : "Show archived issues"}</button>
      <button disabled={busy || dirty} onClick={onSettings}>Project settings</button><span>{board.autoRefreshPrs ? "Linked PRs are observed read-only while Moguri runs." : "Automatic PR observation is off."}</span>
      <button aria-pressed={githubKind === "issue"} disabled={dirty || busy} onClick={() => { setGithubKind((kind) => kind === "issue" ? null : "issue"); setGithub(null); }}>GitHub issues</button>
      <button aria-pressed={githubKind === "pull"} disabled={dirty || busy} onClick={() => { setGithubKind((kind) => kind === "pull" ? null : "pull"); setGithub(null); }}>GitHub PRs</button>
      {board.linear.enabled && <button disabled={dirty || busy} onClick={() => void importLinear()}>{linearCursor ? "Import next Linear page" : "Import Linear team issues"}</button>}</div>
    {githubKind && <section className="kanban-github" aria-label="GitHub work alongside Kanban"><GitHubItemPicker key={`${project.id}-${githubKind}`} sdk={sdk} scope={{ env: "Local", projectId: project.id }} kind={githubKind} select={setGithub} disabled={busy} />
      {github && <><p className="fine-print">This Mac's GitHub account / {github.source.account}. Item text is source data, not permission.</p><p className="kanban-source-body">{github.item.body || "No description."}</p>
        <button disabled={busy || dirty} onClick={() => void run(async () => { const result = await sdk.github.startSession({ env: "Local", projectId: project.id }, github.source, github.digest); setCreatedSession(result.id!); setNotice("Created an idle source session with its complete unsent draft. No model was run."); })}>Start session from {githubKind === "issue" ? "issue" : "PR"}</button></>}
    </section>}
    {editing && <form className="issue-editor" aria-label="Issue editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header><h2>{editing.id ? "Edit issue" : "New issue"}</h2><span>{editing.id ? `Revision ${editing.revision}` : "Saved only on this device"}</span></header>
      <label className="setting-field">Issue title<input autoFocus value={editing.fields.title} maxLength={160} required onChange={(event) => change({ title: event.target.value })} /></label>
      <div className="issue-editor-row"><label className="setting-field">Issue type<select value={editing.fields.kind} onChange={(event) => change({ kind: event.target.value as IssueKind })}><option value="feature">Feature</option><option value="bug">Bug</option><option value="misc">Misc</option></select></label>
        <label className="setting-field">Issue phase<select value={editing.fields.phaseId} onChange={(event) => change({ phaseId: event.target.value })}>{board.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></div>
      <label className="setting-field">Issue description<textarea value={editing.fields.body} maxLength={64 * 1024} onChange={(event) => change({ body: event.target.value })} /></label>
      <label className="setting-field">Connected GitHub PR URL<input type="url" value={editing.fields.pullRequestUrl ?? ""} placeholder="https://github.com/owner/repo/pull/123" onChange={(event) => change({ pullRequestUrl: event.target.value || null })} /></label>
      <p className="fine-print">Linking a PR permits read-only state checks under this board's policy. Only a verified merge moves the ticket. Closed, failed or unauthenticated checks do not.</p>
      <div className="button-row"><button className="primary" aria-label="Save issue" type="submit" disabled={busy || !editing.fields.title.trim()}>Save</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    <div className="kanban-scroll" role="region" aria-label="Kanban phases, scroll horizontally for more columns" tabIndex={0}><div className="kanban-columns" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(220px, 1fr))` }}>{board.columns.map((column) => {
      const tickets = issues.filter((issue) => issue.phaseId === column.id && issue.archived === archived).sort((a, b) => a.number - b.number);
      return <section className="kanban-column" key={column.id} aria-label={`${column.name} issues`}><header><h2>{column.name}</h2><span>{tickets.length}</span></header>
        {tickets.length === 0 && <p className="kanban-empty">No {archived ? "archived " : ""}issues in this phase.</p>}
        {tickets.map((issue) => <article className="issue-ticket" key={issue.id}>
          <div className="ticket-meta"><span>#{issue.number}</span><span className={`issue-kind ${issue.kind}`}>{issue.kind}</span></div>
          <button className="ticket-title" onClick={() => edit(issue)}>{issue.title}</button>
          {issue.pullRequest && <div className="ticket-link"><button className="quiet" onClick={() => void run(async () => { await window.moguri.openExternal(issue.pullRequest!.url); })}>{issue.pullRequest.repo}#{issue.pullRequest.number}</button><span>{issue.pullRequest.state}</span>{issue.pullRequest.diagnostic && <p className="inline-error">{issue.pullRequest.diagnostic}</p>}</div>}
          {issue.linear && <p className="fine-print">Imported from Linear {issue.linear.identifier}</p>}
          {claims.has(`kanban:${issue.id}`) && <p className="fine-print">Claimed by a retained task. Finish or inspect that task before starting again.</p>}
          <label className="ticket-phase">Phase for issue {issue.number}<select aria-label={`Phase for issue ${issue.number}`} value={issue.phaseId} disabled={busy || dirty} onChange={(event) => void run(async () => { await sdk.issues.move(issue.id, event.target.value, issue.revision); })}>{board.columns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button className="quiet" disabled={busy || dirty} onClick={() => void run(async () => { await sdk.issues.archive(issue.id, !issue.archived, issue.revision); })}>{issue.archived ? "Restore issue" : "Archive issue"}</button>
          {!issue.archived && issue.phaseId !== board.mergedColumnId && <button className="quiet" disabled={busy || dirty || !canContinue || claims.has(`kanban:${issue.id}`)} onClick={() => void continueWork(issue.id)}>Work on card #{issue.number}</button>}
        </article>)}</section>;
    })}</div></div>
    {snapshot.jobs.some((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)) && <details className="board-jobs"><summary>Issue integration jobs</summary>
      {snapshot.jobs.filter((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)).slice(-8).reverse().map((job) => <div className="job-row" key={job.id}><div><strong>{job.kind}</strong><small>{job.status}: {job.error ?? job.progress}</small></div>
        {["running", "waiting_input"].includes(job.status) && <button onClick={() => void sdk.jobs.cancel(job.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Cancellation was not confirmed."))}>Cancel job</button>}</div>)}</details>}
    <p className="board-footnote">Tickets, phases and PR observations use the shared Moguri SDK. Local tickets are independent of session history. Failed checks are visible, never interpreted as merges.</p>
    </div>}
  </section>;
}
