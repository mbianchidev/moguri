import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { defaultBoard, type BoardConfig, type MoguriSdk, type Project, type Snapshot } from "../../../packages/sdk/src/index.ts";

const values = (board: BoardConfig): BoardConfig => ({ columns: structuredClone(board.columns), mergedColumnId: board.mergedColumnId,
  autoRefreshPrs: board.autoRefreshPrs, githubAccess: board.githubAccess, linear: { ...board.linear } });
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
  const automatic = <K extends "mergedColumnId" | "autoRefreshPrs" | "githubAccess">(key: K, value: BoardConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    void write({ ...actual.current, [key]: value });
  };
  return <section className="board-configuration" aria-label="Board configuration"><h3>Ticket workflow</h3><SettingsHelp label="More about this setting">Phases and integration choices live here, not in the issue board. Toggles and dropdowns save their own field; phase names and team text have adjacent Save actions.</SettingsHelp>
    <fieldset className="settings-fields" disabled={busy}>
      {draft.columns.map((column, index) => <div className="board-phase-edit" key={column.id}><code>{column.id}</code><SettingsInput aria-label={`Phase name ${column.id}`} value={column.name} onChange={(event) => setDraft((current) => ({ ...current, columns: current.columns.map((entry) => entry.id === column.id ? { ...entry, name: event.target.value } : entry) }))} />
        <button type="button" aria-label={`Move ${column.name} earlier`} disabled={index === 0} onClick={() => { const columns = [...draft.columns]; [columns[index - 1], columns[index]] = [columns[index]!, columns[index - 1]!]; setDraft((current) => ({ ...current, columns })); }}>Up</button>
        <button type="button" aria-label={`Remove ${column.name} phase`} disabled={draft.columns.length <= 2 || draft.mergedColumnId === column.id || snapshot.issues.some((issue) => issue.projectId === project.id && issue.phaseId === column.id)} onClick={() => setDraft((current) => ({ ...current, columns: current.columns.filter((entry) => entry.id !== column.id) }))}>Remove</button>
      </div>)}
      <div className="button-row"><button type="button" disabled={draft.columns.length >= 12} onClick={() => setDraft((current) => ({ ...current, columns: [...current.columns, { id: `phase-${crypto.randomUUID().slice(0, 8)}`, name: "New phase" }] }))}>Add phase</button>
        <button type="button" className="primary" aria-label="Save board configuration" disabled={JSON.stringify(draft.columns) === JSON.stringify(committed.columns)} onClick={() => void write({ ...actual.current, columns: draft.columns })}>Save phases</button></div>
      <label className="setting-field">Move merged PR tickets to<select aria-label="Merged PR destination" value={draft.mergedColumnId} onChange={(event) => automatic("mergedColumnId", event.target.value)}>{committed.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={draft.autoRefreshPrs} onChange={(event) => automatic("autoRefreshPrs", event.target.checked)} />Observe explicitly linked PRs automatically, without merge or CI actions</label>
      <label className="setting-field">Linked-PR GitHub read access<select aria-label="Linked-PR GitHub read access" value={draft.githubAccess} onChange={(event) => automatic("githubAccess", event.target.value === "gh-cli" ? "gh-cli" : "public")}><option value="public">Public GitHub API, no account</option><option value="gh-cli">My signed-in GitHub CLI account</option></select></label>
      <h3>Optional Linear team</h3><SettingsHelp label="More about this setting">Authentication lives in Integrations / Linear. Save the exact team UUID before enabling import. Importing is explicit and read-only; enabling a team never exports local tickets or starts a scan.</SettingsHelp>
      <label className="check-setting"><SettingsInput type="checkbox" checked={draft.linear.enabled} disabled={!draft.linear.enabled && !/^[A-Za-z0-9-]{1,128}$/.test(committed.linear.teamId)} onChange={(event) => {
        const enabled = event.target.checked; setDraft((current) => ({ ...current, linear: { ...current.linear, enabled } }));
        void write({ ...actual.current, linear: { ...actual.current.linear, enabled } });
      }} />Enable read-only Linear import for this project</label>
      <label className="setting-field">Linear team UUID<SettingsInput aria-label="Linear team UUID" value={draft.linear.teamId} onChange={(event) => setDraft((current) => ({ ...current, linear: { ...current.linear, teamId: event.target.value } }))} /></label>
      <button type="button" className="primary" aria-label="Save Linear team" disabled={draft.linear.teamId === committed.linear.teamId} onClick={() => void write({ ...actual.current, linear: { ...actual.current.linear, teamId: draft.linear.teamId } })}>Save</button>
    </fieldset>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={reload}>Reload board settings</button>
  </section>;
}
