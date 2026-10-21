import { useEffect, useRef, useState } from "react";
import { defaultBoard, type BoardConfig, type IssueInput, type IssueKind, type LocalIssue, type MoguriSdk, type Project, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

const newFields = (phaseId: string): IssueInput => ({ title: "", body: "", kind: "feature", phaseId, pullRequestUrl: null });
export function ProjectBoard({ sdk, project, snapshot, onBack, onUnsavedChange }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; onBack: () => void; onUnsavedChange: (dirty: boolean) => void;
}) {
  const board = snapshot.boards.find((board) => board.projectId === project.id) ?? defaultBoard(project.id);
  const issues = snapshot.issues.filter((issue) => issue.projectId === project.id);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; revision: number; fields: IssueInput; base: string } | null>(null);
  const [config, setConfig] = useState<BoardConfig>(() => structuredClone(board));
  const [baseRevision, setBaseRevision] = useState(board.revision);
  const [configDirty, setConfigDirty] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [linearCursor, setLinearCursor] = useState<string | null>(null);
  const ownSave = useRef(false);
  const dirty = configDirty || token.length > 0 || Boolean(editing && JSON.stringify(editing.fields) !== editing.base);
  useEffect(() => { onUnsavedChange(dirty || busy); return () => onUnsavedChange(false); }, [dirty, busy, onUnsavedChange]);
  useEffect(() => {
    if (ownSave.current) return;
    if (!configDirty) { setConfig(structuredClone(board)); setBaseRevision(board.revision); }
    else if (board.revision !== baseRevision) setError("Another client changed this board. Your configuration edit is preserved; reload before saving.");
  }, [board.revision, project.id]);
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
  const changeConfig = (value: Partial<BoardConfig>) => { setConfig((current) => ({ ...current, ...value })); setConfigDirty(true); };
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
      <button aria-expanded={configure} onClick={() => setConfigure((value) => !value)}>Configure phases and integrations</button><span>{board.autoRefreshPrs ? "Linked PRs are observed read-only while Moguri runs." : "Automatic PR observation is off."}</span></div>
    {configure && <section className="board-configuration" aria-label="Board configuration">
      <h2>Phases</h2><p>Order and name your workflow. Move tickets before removing an occupied phase.</p>
      {config.columns.map((column, index) => <div className="board-phase-edit" key={column.id}><code>{column.id}</code><input aria-label={`Phase name ${column.id}`} value={column.name} onChange={(event) => changeConfig({ columns: config.columns.map((entry) => entry.id === column.id ? { ...entry, name: event.target.value } : entry) })} />
        <button aria-label={`Move ${column.name} earlier`} disabled={index === 0} onClick={() => { const columns = [...config.columns]; [columns[index - 1], columns[index]] = [columns[index]!, columns[index - 1]!]; changeConfig({ columns }); }}>Up</button>
        <button aria-label={`Remove ${column.name} phase`} disabled={config.columns.length <= 2 || config.mergedColumnId === column.id} onClick={() => changeConfig({ columns: config.columns.filter((entry) => entry.id !== column.id) })}>Remove</button></div>)}
      <button disabled={config.columns.length >= 12} onClick={() => changeConfig({ columns: [...config.columns, { id: `phase-${crypto.randomUUID().slice(0, 8)}`, name: "New phase" }] })}>Add phase</button>
      <label className="setting-field">Move merged PR tickets to<select aria-label="Merged PR destination" value={config.mergedColumnId} onChange={(event) => changeConfig({ mergedColumnId: event.target.value })}>{config.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
      <label className="check-setting"><input type="checkbox" checked={config.autoRefreshPrs} onChange={(event) => changeConfig({ autoRefreshPrs: event.target.checked })} />Observe explicitly linked PRs automatically, without merge or CI actions</label>
      <label className="setting-field">GitHub read access<select value={config.githubAccess} onChange={(event) => changeConfig({ githubAccess: event.target.value as BoardConfig["githubAccess"] })}><option value="public">Public GitHub API, no account</option><option value="gh-cli">Use my signed-in GitHub CLI account for linked PRs</option></select></label>
      <h2>Optional Linear</h2><p>Off by default. Explicitly import a team page into local tickets. Nothing here uploads local issue content or repository data.</p>
      <label className="check-setting"><input type="checkbox" checked={config.linear.enabled} onChange={(event) => changeConfig({ linear: { ...config.linear, enabled: event.target.checked } })} />Enable read-only Linear import for this project</label>
      <label className="setting-field">Linear team UUID<input value={config.linear.teamId} onChange={(event) => changeConfig({ linear: { ...config.linear, teamId: event.target.value } })} /></label>
      <div className="button-row"><button disabled={!configDirty || busy} onClick={() => void run(async () => {
        ownSave.current = true;
        try {
          await sdk.issues.configure(project.id, config, baseRevision); setConfigDirty(false);
          const committed = (await sdk.issues.board(project.id)).board; setConfig(structuredClone(committed)); setBaseRevision(committed.revision);
        } finally { ownSave.current = false; }
      })} aria-label="Save board configuration">Save</button><button disabled={busy} onClick={() => { setConfig(structuredClone(board)); setBaseRevision(board.revision); setConfigDirty(false); setError(""); }}>Reload</button></div>
      <label className="setting-field">Linear personal API key<input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
      <div className="button-row"><button disabled={!token || busy} onClick={() => void run(async () => { await sdk.linear.setToken(token); setToken(""); setNotice("Linear credential stored only in the OS keychain."); })}>Store Linear key in keychain</button><button disabled={busy} onClick={() => void run(async () => { await sdk.linear.clearToken(); setToken(""); setNotice("Linear credential removed; owned imports cancelled."); })}>Remove Linear key</button>
        <button disabled={!board.linear.enabled || dirty || busy} onClick={() => void importLinear()}>{linearCursor ? "Import next Linear page" : "Import Linear team issues"}</button><button disabled={busy} onClick={() => void run(async () => { const status = await sdk.linear.status(project.id); setNotice(`${status.credential}. ${status.diagnostic}`); })}>Check Linear status</button></div>
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
