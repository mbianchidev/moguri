import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { activeProjectWork, claimedProjectWork, compareIssues, defaultBoard, githubManagedIssue, githubSyncSettings, issuePosition, kanbanPreferences, type IssueInput, type IssueKind, type IssuePosition, type LocalIssue, type MoguriSdk, type Project, type Snapshot } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { GitHubItemPicker, type GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { usePendingWork } from "./pending-work.ts";

const newFields = (phaseId: string): IssueInput => ({ title: "", body: "", kind: "feature", phaseId, pullRequestUrl: null });
const CARD_DRAG = "application/x-moguri-kanban-card";
export function ProjectBoard({ sdk, project, snapshot, onBack, onUnsavedChange, onSettings, openSession, children }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; onBack: () => void; onUnsavedChange: (dirty: boolean) => void;
  onSettings: () => void; openSession: (id: string) => Promise<void>; children?: ReactNode;
}) {
  const board = snapshot.boards.find((board) => board.projectId === project.id) ?? defaultBoard(project.id);
  const issues = snapshot.issues.filter((issue) => issue.projectId === project.id);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; revision: number; fields: IssueInput; base: string } | null>(null);
  const [creating, setCreating] = useState<string | null>(null), [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncValue, setSyncValue] = useState<boolean | null>(null);
  useEffect(() => { setSyncValue(null); }, [board.autoRefreshPrs]);
  const [importValue, setImportValue] = useState<boolean | null>(null);
  const syncSettings = githubSyncSettings(board);
  useEffect(() => { setImportValue(null); }, [syncSettings.importIssues]);
  const syncJob = snapshot.jobs.findLast((job) => job.projectId === project.id && job.kind === "issues.refresh");
  const [linearCursor, setLinearCursor] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "chat">("board");
  const [githubKind, setGithubKind] = useState<"issue" | "pull" | null>(null), [github, setGithub] = useState<GithubSelection | null>(null);
  const [createdSession, setCreatedSession] = useState("");
  const drag = useRef<{ issueId: string; profileId: string; archived: boolean; positions: IssuePosition[] } | null>(null);
  const focusCard = useRef<{ id: string; phaseId: string } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null), [drop, setDrop] = useState<{ phaseId: string; issueId?: string; edge?: "before" | "after" } | null>(null);
  const preferences = kanbanPreferences(board);
  const projectWork = snapshot.projectWorkRuns.filter((run) => run.projectId === project.id);
  const work = [...projectWork.filter(activeProjectWork), ...projectWork.filter((run) => !activeProjectWork(run)).slice(-8)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = work.some(activeProjectWork), claims = new Set(snapshot.projectWorkRuns.filter(claimedProjectWork).map((run) => run.source.key));
  const dirty = Boolean(editing && JSON.stringify(editing.fields) !== editing.base || creating && newTitle.trim());
  useLayoutEffect(() => {
    const target = focusCard.current;
    if (!target || busy) return;
    const card = [...document.querySelectorAll<HTMLElement>(".issue-ticket[data-issue-id]")].find((element) => element.dataset.issueId === target.id && element.dataset.phaseId === target.phaseId);
    if (card) { card.focus(); focusCard.current = null; }
  }, [issues, busy]);
  usePendingWork(busy);
  useEffect(() => { onUnsavedChange(dirty || busy); return () => onUnsavedChange(false); }, [dirty, busy, onUnsavedChange]);
  const run = async (operation: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The project operation failed. Your edit was preserved."); }
    finally { setBusy(false); }
  };
  const edit = (issue: LocalIssue) => {
    if (dirty) { setError("Save or cancel this edit before selecting another ticket."); return; }
    const fields = { title: issue.title, body: issue.body, kind: issue.kind, phaseId: issue.phaseId, pullRequestUrl: issue.pullRequest?.url ?? null };
    setEditing({ id: issue.id, revision: issue.revision, fields, base: JSON.stringify(fields) }); setError("");
  };
  const change = (value: Partial<IssueInput>) => setEditing((current) => current ? { ...current, fields: { ...current.fields, ...value } } : null);
  const save = () => run(async () => {
    if (!editing) return;
    await sdk.issues.update(editing.id, editing.fields, editing.revision);
    setEditing(null);
  });
  const reorder = (issueId: string, phaseId: string, beforeIssueId: string | null, captured?: NonNullable<typeof drag.current>) => run(async () => {
    const state = sdk.getState(), current = state.snapshot?.issues.find((issue) => issue.id === issueId && issue.projectId === project.id);
    if (state.status !== "connected" || !current || captured && (captured.profileId !== sdk.profileId || captured.archived !== current.archived)) {
      throw new Error("The original profile or card changed. No card was moved.");
    }
    const expected = captured?.positions ?? issues.filter((issue) => issue.archived === current.archived).map(issuePosition);
    const original = expected.find((entry) => entry.issueId === issueId);
    if (!original || original.phaseId !== current.phaseId) throw new Error("The source card changed phase. Start the move again; no newer arrangement was overwritten.");
    if (githubManagedIssue(board, current) && phaseId !== current.phaseId) throw new Error("GitHub controls this card's column while sync is on. Reorder inside its column, or turn sync off to move it locally.");
    await sdk.issues.reorder(issueId, phaseId, beforeIssueId, expected.filter((entry) => [original.phaseId, phaseId].includes(entry.phaseId)), current.revision);
    focusCard.current = { id: issueId, phaseId };
    setNotice(`Card moved in ${board.columns.find((column) => column.id === phaseId)?.name ?? phaseId}.`);
  });
  const dropCard = (event: DragEvent, phaseId: string, beforeIssueId: string | null) => {
    const intent = drag.current;
    if (!intent || !event.dataTransfer.types.includes(CARD_DRAG)) return;
    event.preventDefault(); event.stopPropagation(); drag.current = null; setDragged(null); setDrop(null);
    if (intent.issueId !== beforeIssueId) void reorder(intent.issueId, phaseId, beforeIssueId, intent);
  };
  const keyboardMove = (issue: LocalIssue, key: string) => {
    if (busy || dirty) return;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const index = board.columns.findIndex((column) => column.id === issue.phaseId) + (key === "ArrowLeft" ? -1 : 1);
      const phase = board.columns[index]; if (phase) void reorder(issue.id, phase.id, null);
    } else {
      const siblings = issues.filter((entry) => entry.phaseId === issue.phaseId && entry.archived === issue.archived).sort(compareIssues);
      const index = siblings.findIndex((entry) => entry.id === issue.id), target = index + (key === "ArrowUp" ? -1 : 1);
      if (target < 0 || target >= siblings.length) return;
      void reorder(issue.id, issue.phaseId, key === "ArrowUp" ? siblings[target]!.id : siblings[target + 1]?.id ?? null);
    }
  };
  const importLinear = () => run(async () => {
    const job = await sdk.linear.import(project.id, linearCursor ?? undefined);
    const completed = await sdk.jobs.wait(job.id!);
    if (completed.status !== "completed") throw new Error(completed.error ?? `Import is ${completed.status}.`);
    const result: unknown = JSON.parse((await sdk.mcp.readResult(job.id!)).text);
    if (!result || typeof result !== "object" || !("nextCursor" in result) || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("The retained import response was invalid.");
    setLinearCursor(result.nextCursor); setNotice(result.nextCursor ? "Imported this page. More remote tickets are available." : "Import finished. Existing local edits were preserved; nothing was exported.");
  });
  return <section className="project-board-page" aria-label="Local project issue board">
    <header className="board-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" onClick={onBack}><Icon name="Back" /></button><div><h1>Kanban</h1><p>{project.name} / project board and chat</p></div>
      <label className="check-setting"><input type="checkbox" role="switch" aria-label="Sync with GitHub" checked={syncValue ?? board.autoRefreshPrs} disabled={busy || dirty}
        onChange={(event) => { const enabled = event.currentTarget.checked; setSyncValue(enabled); void run(async () => {
          try { await sdk.issues.configure(project.id, { ...board, autoRefreshPrs: enabled }, board.revision); }
          catch (error) { setSyncValue(null); throw error; }
        }); }} />Sync with GitHub</label></header>
    <div className="kanban-sync-controls">
      {board.autoRefreshPrs && <label className="check-setting"><input type="checkbox" role="switch" aria-label="Import open GitHub issues" checked={importValue ?? syncSettings.importIssues}
        disabled={busy || dirty} onChange={(event) => {
          const enabled = event.currentTarget.checked; setImportValue(enabled);
          void run(async () => {
            try { await sdk.issues.configure(project.id, { ...board, githubAccess: enabled ? "gh-cli" : board.githubAccess,
              githubSync: { ...syncSettings, importIssues: enabled } }, board.revision); }
            catch (error) { setImportValue(null); throw error; }
          });
        }} />Import open GitHub issues</label>}
      <span className="fine-print">GitHub updates Kanban only. Dragging never changes GitHub.</span>
      {board.githubSource && <span className="fine-print">Source: {board.githubSource.account} / {board.githubSource.repository}</span>}
      {syncJob && <Alert as="p" className={syncJob.status === "failed" || syncJob.status === "partial" ? "inline-error" : "fine-print"}
        role={syncJob.status === "failed" || syncJob.status === "partial" ? "alert" : "status"}>
        GitHub sync {syncJob.status}: {syncJob.error ?? syncJob.progress}
      </Alert>}
    </div>
    <div className="board-view-switch" role="group" aria-label="Kanban view"><button aria-pressed={view === "board"} disabled={dirty || busy} onClick={() => setView("board")}>Board</button>
      <button aria-pressed={view === "chat"} disabled={dirty || busy} onClick={() => setView("chat")}>Chat</button>
      <span>Continue from {preferences.source === "kanban" ? "Kanban cards" : preferences.source === "github-prs" ? "open GitHub PRs" : "open GitHub issues"} / one item to its draft PR</span></div>
    {(error || notice) && <Alert as="div" className={`notice ${error ? "error" : "info"}`} role={error ? "alert" : "status"}>{error || notice}</Alert>}
    {createdSession && <button className="quiet" disabled={busy || dirty} onClick={() => void openSession(createdSession)}>Open created source session</button>}
    {view === "chat" ? <div className="kanban-chat">{children}</div> : <div className="kanban-board-content">
    <p className="board-guidance">Use /continue-work or send "continue work" in Chat. Opening this board never starts inference or signs in.</p>
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
      <header><h2>Edit issue</h2><span>Revision {editing.revision}</span></header>
      <label className="setting-field">Issue title<input autoFocus value={editing.fields.title} maxLength={256} required onChange={(event) => change({ title: event.target.value })} /></label>
      <div className="issue-editor-row"><label className="setting-field">Issue type<select value={editing.fields.kind} onChange={(event) => change({ kind: event.target.value as IssueKind })}><option value="feature">Feature</option><option value="bug">Bug</option><option value="misc">Misc</option></select></label>
        <label className="setting-field">Issue phase<select value={editing.fields.phaseId} disabled={Boolean(editing.id && issues.some((issue) => issue.id === editing.id && githubManagedIssue(board, issue)))} onChange={(event) => change({ phaseId: event.target.value })}>{board.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label></div>
      <label className="setting-field">Issue description<textarea value={editing.fields.body} maxLength={64 * 1024} onChange={(event) => change({ body: event.target.value })} /></label>
      <label className="setting-field">Connected GitHub PR URL<input type="url" value={editing.fields.pullRequestUrl ?? ""} placeholder="https://github.com/owner/repo/pull/123" onChange={(event) => change({ pullRequestUrl: event.target.value || null })} /></label>
      <p className="fine-print">Linked GitHub states control the column while sync is on. Title and description edits remain local; failed checks preserve the previous status.</p>
      <div className="button-row"><button className="primary" aria-label="Save issue" type="submit" disabled={busy || !editing.fields.title.trim()}>Save</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    <div className="kanban-scroll" role="region" aria-label="Kanban phases, scroll horizontally for more columns" tabIndex={0}><div className="kanban-columns" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(220px, 1fr))` }}>{board.columns.map((column) => {
      const tickets = issues.filter((issue) => issue.phaseId === column.id && issue.archived === archived).sort(compareIssues);
      return <section className={`kanban-column ${drop?.phaseId === column.id && !drop.issueId ? "kanban-drop-column" : ""}`} key={column.id} aria-label={`${column.name} issues`}
        onDragOver={(event) => { if (drag.current && event.dataTransfer.types.includes(CARD_DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDrop({ phaseId: column.id }); } }}
        onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(null); }}
        onDrop={(event) => dropCard(event, column.id, null)}><header><h2>{column.name}</h2><span>{tickets.length}</span></header>
        {tickets.length === 0 && <p className="kanban-empty">No {archived ? "archived " : ""}issues in this phase.</p>}
        {tickets.map((issue, index) => <article className={`issue-ticket ${dragged === issue.id ? "kanban-dragging" : ""} ${drop?.issueId === issue.id ? `kanban-drop-${drop.edge}` : ""}`}
          key={issue.id} data-issue-id={issue.id} data-phase-id={issue.phaseId} aria-label={`Card #${issue.number}: ${issue.title}`} tabIndex={0} draggable={!busy && !dirty}
          aria-description="Drag to move or reorder. Alt+Up/Down reorders; Alt+Left/Right changes column."
          onKeyDown={(event) => { if (event.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); keyboardMove(issue, event.key); } }}
          onDragStart={(event) => {
            if (busy || dirty) { event.preventDefault(); return; }
            event.stopPropagation(); drag.current = { issueId: issue.id, profileId: sdk.profileId, archived: issue.archived,
              positions: issues.filter((entry) => entry.archived === issue.archived).map(issuePosition) };
            event.dataTransfer.setData(CARD_DRAG, issue.id); event.dataTransfer.effectAllowed = "move"; setDragged(issue.id);
          }}
          onDragEnd={() => { drag.current = null; setDragged(null); setDrop(null); }}
          onDragOver={(event) => {
            if (!drag.current || !event.dataTransfer.types.includes(CARD_DRAG)) return;
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
            const bounds = event.currentTarget.getBoundingClientRect();
            setDrop({ phaseId: column.id, issueId: issue.id, edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
          }}
          onDrop={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            dropCard(event, column.id, event.clientY < bounds.top + bounds.height / 2 ? issue.id : tickets[index + 1]?.id ?? null);
          }}>
          <div className="ticket-meta"><span>#{issue.number}</span><span className={`issue-kind ${issue.kind}`}>{issue.kind}</span></div>
          <button className="ticket-title" onClick={() => edit(issue)}>{issue.title}</button>
          {issue.github && <div className="ticket-link"><button className="quiet" onClick={() => void run(async () => { await window.moguri.openExternal(issue.github!.url); })}>{issue.github.repo}#{issue.github.number}</button>
            <span>{issue.github.state === "closed" ? issue.github.stateReason === "not_planned" ? "Closed: won't do" : issue.github.stateReason === "duplicate" ? "Closed: duplicate" : "Closed" : "Open issue"}</span>
            {issue.github.pullRequests.map((request) => <button className="quiet" key={request.url} onClick={() => void run(async () => { await window.moguri.openExternal(request.url); })}>
              {request.draft ? "Draft PR" : "PR"} #{request.number}</button>)}
            {issue.github.diagnostic && <Alert as="p" className="inline-error">{issue.github.diagnostic}</Alert>}</div>}
          {issue.pullRequest && <div className="ticket-link"><button className="quiet" onClick={() => void run(async () => { await window.moguri.openExternal(issue.pullRequest!.url); })}>{issue.pullRequest.repo}#{issue.pullRequest.number}</button><span>{issue.pullRequest.state}</span>{issue.pullRequest.diagnostic && <Alert as="p" className="inline-error">{issue.pullRequest.diagnostic}</Alert>}</div>}
          {issue.linear && <p className="fine-print">Imported from Linear {issue.linear.identifier}</p>}
          {claims.has(`kanban:${issue.id}`) && <p className="fine-print">Claimed by a retained task. Finish or inspect that task before starting again.</p>}
          {githubManagedIssue(board, issue) && <p className="fine-print">Column follows GitHub. Drag to reorder within this column.</p>}
          <label className="ticket-phase">Phase for issue {issue.number}<select aria-label={`Phase for issue ${issue.number}`} value={issue.phaseId} disabled={busy || dirty || githubManagedIssue(board, issue)} onChange={(event) => void run(async () => { await sdk.issues.move(issue.id, event.target.value, issue.revision); })}>{board.columns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button className="quiet" disabled={busy || dirty} onClick={() => void run(async () => { await sdk.issues.archive(issue.id, !issue.archived, issue.revision); })}>{issue.archived ? "Restore issue" : "Archive issue"}</button>
        </article>)}
        {!archived && (creating === column.id ? <form className="kanban-add-item" aria-label={`Add item to ${column.name}`} onSubmit={(event) => {
          event.preventDefault(); if (busy || !newTitle.trim()) return;
          const title = newTitle;
          void run(async () => { await sdk.issues.create(project.id, { ...newFields(column.id), title }); setNewTitle(""); setCreating(null); });
        }}><input autoFocus aria-label={`New item in ${column.name}`} value={newTitle} maxLength={256} placeholder="Item title" disabled={busy}
          onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); setCreating(null); setNewTitle(""); } }} />
          <div className="button-row"><button type="submit" disabled={busy || !newTitle.trim()}>Add item</button><button type="button" disabled={busy} onClick={() => { setCreating(null); setNewTitle(""); }}>Cancel</button></div></form> :
          <button className="quiet kanban-add-trigger" aria-label={`Add item to ${column.name}`} disabled={busy || dirty} onClick={() => { setEditing(null); setCreating(column.id); setNewTitle(""); }}><Icon name="Plus" />Add item</button>)}
        </section>;
    })}</div></div>
    {snapshot.jobs.some((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)) && <details className="board-jobs"><summary>Issue integration jobs</summary>
      {snapshot.jobs.filter((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)).slice(-8).reverse().map((job) => <div className="job-row" key={job.id}><div><strong>{job.kind}</strong><small>{job.status}: {job.error ?? job.progress}</small></div>
        {["running", "waiting_input"].includes(job.status) && <button onClick={() => void sdk.jobs.cancel(job.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Cancellation was not confirmed."))}>Cancel job</button>}</div>)}</details>}
    <p className="board-footnote">Cards, order, phases and GitHub observations use the shared Moguri SDK. Cards are independent of session history. Failed checks preserve status and never become GitHub writes.</p>
    </div>}
  </section>;
}
