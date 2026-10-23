import { useEffect, useState } from "react";
import { defaultBoard, type IssueInput, type IssueKind, type LocalIssue, type MoguriSdk, type Project, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

const newFields = (phaseId: string): IssueInput => ({ title: "", body: "", kind: "feature", phaseId, pullRequestUrl: null });
export function ProjectBoard({ sdk, project, snapshot, onBack, onUnsavedChange, onSettings }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; onBack: () => void; onUnsavedChange: (dirty: boolean) => void;
  onSettings: () => void;
}) {
  const board = snapshot.boards.find((board) => board.projectId === project.id) ?? defaultBoard(project.id);
  const issues = snapshot.issues.filter((issue) => issue.projectId === project.id);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; revision: number; fields: IssueInput; base: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [linearCursor, setLinearCursor] = useState<string | null>(null);
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
  return <section className="project-board-page" aria-label="Local project issue board">
    <header className="board-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" onClick={onBack}><Icon name="Back" /></button><div><h1>Project issues</h1><p>{project.name} / local only, no assignees</p></div><button disabled={busy || dirty} onClick={() => void run(async () => {
      const job = await sdk.issues.refresh(project.id); setNotice(`Linked-PR check ${job.id} started. Only verified merges advance phases.`);
    })}>Refresh linked PRs</button><button className="primary" aria-label="New issue" disabled={busy || dirty} onClick={() => edit()}>New</button></header>
    {(error || notice) && <div className={`notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</div>}
    <div className="board-options"><button aria-pressed={archived} onClick={() => setArchived((value) => !value)}>{archived ? "Show active issues" : "Show archived issues"}</button>
      <button disabled={busy || dirty} onClick={onSettings}>Project settings</button><span>{board.autoRefreshPrs ? "Linked PRs are observed read-only while Moguri runs." : "Automatic PR observation is off."}</span>
      {board.linear.enabled && <button disabled={dirty || busy} onClick={() => void importLinear()}>{linearCursor ? "Import next Linear page" : "Import Linear team issues"}</button>}</div>
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
          <label className="ticket-phase">Phase for issue {issue.number}<select aria-label={`Phase for issue ${issue.number}`} value={issue.phaseId} disabled={busy || dirty} onChange={(event) => void run(async () => { await sdk.issues.move(issue.id, event.target.value, issue.revision); })}>{board.columns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button className="quiet" disabled={busy || dirty} onClick={() => void run(async () => { await sdk.issues.archive(issue.id, !issue.archived, issue.revision); })}>{issue.archived ? "Restore issue" : "Archive issue"}</button>
        </article>)}</section>;
    })}</div></div>
    {snapshot.jobs.some((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)) && <details className="board-jobs"><summary>Issue integration jobs</summary>
      {snapshot.jobs.filter((job) => job.projectId === project.id && /^(issues\.|linear\.)/.test(job.kind)).slice(-8).reverse().map((job) => <div className="job-row" key={job.id}><div><strong>{job.kind}</strong><small>{job.status}: {job.error ?? job.progress}</small></div>
        {["running", "waiting_input"].includes(job.status) && <button onClick={() => void sdk.jobs.cancel(job.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Cancellation was not confirmed."))}>Cancel job</button>}</div>)}</details>}
    <p className="board-footnote">Tickets, phases and PR observations use the shared Moguri SDK. Local tickets are independent of session history. Failed checks are visible, never interpreted as merges.</p>
  </section>;
}
