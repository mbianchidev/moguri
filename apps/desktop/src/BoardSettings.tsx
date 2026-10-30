import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { defaultBoard, githubSyncSettings, kanbanPreferences, type BoardConfig, type KanbanSource, type MoguriSdk, type Project, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { ReorderList } from "./ReorderList.tsx";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

const values = (board: BoardConfig): BoardConfig => ({ columns: structuredClone(board.columns), mergedColumnId: board.mergedColumnId,
  autoRefreshPrs: board.autoRefreshPrs, githubAccess: board.githubAccess, linear: { ...board.linear }, kanban: structuredClone(kanbanPreferences(board)),
  githubSync: structuredClone(githubSyncSettings(board)) });
export function BoardSettings({ sdk, project, snapshot, onDirty }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; onDirty: (dirty: boolean) => void;
}) {
  const board = snapshot.boards.find((board) => board.projectId === project.id) ?? defaultBoard(project.id);
  const [draft, setDraft] = useState(() => values(board)), [committed, setCommitted] = useState(() => values(board));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const base = useRef(board.revision), actual = useRef(committed), pending = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(committed);
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  const reload = () => { const value = values(board); actual.current = value; base.current = board.revision; setDraft(value); setCommitted(value); setError(""); };
  useEffect(() => {
    if (pending.current || board.revision === base.current) return;
    if (dirty) setError("Another client changed board settings. Your edit is preserved; reload before saving.");
    else reload();
  }, [board.revision]);
  const write = async (value: BoardConfig) => {
    if (pending.current) { setError("Wait for the current board save. Your edit is preserved."); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await sdk.issues.configure(project.id, value, base.current);
      actual.current = value; base.current = result.revision!; setCommitted(value); setNotice("The selected board field was saved. Other pending text was preserved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Board settings were not saved. Your edit is preserved."); }
    finally { pending.current = false; setBusy(false); }
  };
  const automatic = <K extends "mergedColumnId" | "autoRefreshPrs" | "githubAccess" | "kanban" | "githubSync">(key: K, value: BoardConfig[K]) => {
    if (key === "mergedColumnId" && typeof value === "string") {
      const githubSync = { ...githubSyncSettings(actual.current), phases: { ...githubSyncSettings(actual.current).phases, done: value } };
      setDraft((current) => ({ ...current, mergedColumnId: value, githubSync }));
      void write({ ...actual.current, mergedColumnId: value, githubSync }); return;
    }
    setDraft((current) => ({ ...current, [key]: value }));
    void write({ ...actual.current, [key]: value });
  };
  const kanban = kanbanPreferences(draft);
  return <section className="board-configuration" aria-label="Board configuration"><SettingsHelp label="More about this setting" target={<h3>Project Kanban</h3>}>Each project has a special Kanban chat. Continue work takes one item in an isolated Local checkout, uses this chat's selected model and budget, then stops at its draft PR. It never merges or drains the backlog. GitHub uses this Mac's signed-in CLI account, not Copilot login or SSH credentials.</SettingsHelp>
    <fieldset className="settings-fields" disabled={busy}>
      <label className="check-setting"><SettingsInput type="checkbox" checked={kanban.visible} onChange={(event) => automatic("kanban", { ...kanban, visible: event.target.checked })} />Show Kanban in this project's sessions</label>
      <label className="setting-field">Continue work from<select aria-label="Continue work from" value={kanban.source} onChange={(event) => automatic("kanban", { ...kanban, source: event.target.value as KanbanSource })}>
        <option value="kanban">Open Kanban cards, including imported Linear cards</option><option value="github-issues">Open GitHub issues</option><option value="github-prs">Open GitHub pull requests</option>
      </select></label>
      <SettingsHelp label="More about this setting" target={<fieldset className="kanban-eligible"><legend>Eligible Kanban phases</legend>{committed.columns.filter((column) => column.id !== committed.mergedColumnId).map((column) =>
        <label className="check-setting" key={column.id}><SettingsInput type="checkbox" role="checkbox" checked={kanban.phaseIds.includes(column.id)} onChange={(event) => automatic("kanban", {
          ...kanban, phaseIds: event.target.checked ? [...kanban.phaseIds, column.id] : kanban.phaseIds.filter((id) => id !== column.id),
        })} />{column.name}</label>)}</fieldset>}>Selected phases are tried in their saved order. In progress precedes Backlog by default. Hiding Kanban preserves its cards, chat and ongoing tasks.</SettingsHelp>

      <h3>Ticket workflow</h3>
      <ReorderList items={draft.columns} scope={`${sdk.profileId}:board:${project.id}`} label="Board phases" name={(column) => column.name} disabled={busy}
        change={(columns) => setDraft((current) => ({ ...current, columns }))}>{(column) => <div className="board-phase-edit"><code>{column.id}</code><SettingsInput aria-label={`Phase name ${column.id}`} value={column.name} onChange={(event) => setDraft((current) => ({ ...current, columns: current.columns.map((entry) => entry.id === column.id ? { ...entry, name: event.target.value } : entry) }))} />
        <button type="button" className="icon-button" aria-label={`Remove ${column.name} phase`} title={`Remove ${column.name} phase`} disabled={draft.columns.length <= 2 || draft.mergedColumnId === column.id || snapshot.issues.some((issue) => issue.projectId === project.id && issue.phaseId === column.id)} onClick={() => setDraft((current) => ({ ...current, columns: current.columns.filter((entry) => entry.id !== column.id) }))}><Icon name="Trash" /></button>
      </div>}</ReorderList>
      <div className="button-row"><button type="button" disabled={draft.columns.length >= 12} onClick={() => setDraft((current) => ({ ...current, columns: [...current.columns, { id: `phase-${crypto.randomUUID().slice(0, 8)}`, name: "New phase" }] }))}>Add phase</button>
        <button type="button" className="primary" aria-label="Save board configuration" disabled={JSON.stringify(draft.columns) === JSON.stringify(committed.columns)} onClick={() => {
          const kanban = { ...kanbanPreferences(actual.current), phaseIds: kanbanPreferences(actual.current).phaseIds.filter((id) => draft.columns.some((column) => column.id === id)) };
          setDraft((current) => ({ ...current, kanban })); void write({ ...actual.current, columns: draft.columns, kanban });
        }}>Save</button></div>
      <label className="setting-field">Move merged PR tickets to<select aria-label="Merged PR destination" value={draft.mergedColumnId} onChange={(event) => automatic("mergedColumnId", event.target.value)}>{committed.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={draft.autoRefreshPrs} onChange={(event) => automatic("autoRefreshPrs", event.target.checked)} />Sync with GitHub, read-only into Kanban</label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={githubSyncSettings(draft).importIssues} onChange={(event) => {
        const importIssues = event.target.checked, githubSync = { ...githubSyncSettings(actual.current), importIssues };
        setDraft((current) => ({ ...current, githubSync, githubAccess: importIssues ? "gh-cli" : current.githubAccess }));
        void write({ ...actual.current, githubSync, githubAccess: importIssues ? "gh-cli" : actual.current.githubAccess });
      }} />Import open issues from this repository and keep existing links updated</label>
      {(["backlog", "inProgress", "review", "done"] as const).map((state) => <label className="setting-field" key={state}>GitHub {state === "inProgress" ? "draft PR" : state === "review" ? "open PR" : state === "done" ? "closed issue" : "open issue"} column
        <select aria-label={`GitHub ${state} column`} value={githubSyncSettings(draft).phases[state]} onChange={(event) => {
          const value = event.target.value;
          setDraft((current) => ({ ...current, githubSync: { ...githubSyncSettings(current), phases: { ...githubSyncSettings(current).phases, [state]: value } } }));
        }}>{committed.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>)}
      <button type="button" disabled={JSON.stringify(githubSyncSettings(draft).phases) === JSON.stringify(githubSyncSettings(committed).phases)}
        onClick={() => void write({ ...actual.current, githubSync: { ...githubSyncSettings(actual.current), phases: githubSyncSettings(draft).phases } })}>Save GitHub mapping</button>
      <label className="setting-field">Linked-PR GitHub read access<select aria-label="Linked-PR GitHub read access" value={draft.githubAccess} onChange={(event) => automatic("githubAccess", event.target.value === "gh-cli" ? "gh-cli" : "public")}><option value="public">Public GitHub API, no account</option><option value="gh-cli">My signed-in GitHub CLI account</option></select></label>
      <SettingsHelp label="More about this setting" target={<h3>Optional Linear team</h3>}>Authentication lives in Integrations / Linear. Save the exact team UUID before enabling import. Importing is explicit and read-only; enabling a team never exports local tickets or starts a scan.</SettingsHelp>
      <label className="check-setting"><SettingsInput type="checkbox" checked={draft.linear.enabled} disabled={!draft.linear.enabled && !/^[A-Za-z0-9-]{1,128}$/.test(committed.linear.teamId)} onChange={(event) => {
        const enabled = event.target.checked; setDraft((current) => ({ ...current, linear: { ...current.linear, enabled } }));
        void write({ ...actual.current, linear: { ...actual.current.linear, enabled } });
      }} />Enable read-only Linear import for this project</label>
      <label className="setting-field">Linear team UUID<SettingsInput aria-label="Linear team UUID" value={draft.linear.teamId} onChange={(event) => setDraft((current) => ({ ...current, linear: { ...current.linear, teamId: event.target.value } }))} /></label>
      <button type="button" className="primary" aria-label="Save Linear team" disabled={draft.linear.teamId === committed.linear.teamId} onClick={() => void write({ ...actual.current, linear: { ...actual.current.linear, teamId: draft.linear.teamId } })}>Save</button>
    </fieldset>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    <button type="button" disabled={busy} onClick={reload} aria-label="Reload board settings">Reload</button>
  </section>;
}
