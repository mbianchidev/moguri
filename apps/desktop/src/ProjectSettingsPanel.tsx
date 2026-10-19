import { useEffect, useRef, useState } from "react";
import { defaultProjectSettings, parse, ProjectSettingsSchema, type MoguriSdk, type Project, type ProjectSettings, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function ProjectSettingsPanel({ sdk, project, session, snapshot, onDirty, openTerminal }: {
  sdk: MoguriSdk; project: Project; session?: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; openTerminal: () => void;
}) {
  const [values, setValues] = useState<ProjectSettings>(defaultProjectSettings);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [sources, setSources] = useState<{ instructions: string | null; mcp: string | null; mcpDigest: string | null } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [publish, setPublish] = useState(false);
  const [branch, setBranch] = useState(`moguri/repo-defaults-${crypto.randomUUID().slice(0, 8)}`);
  const ownSave = useRef(false);
  const run = async (operation: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { const result = await operation(); if (result !== undefined) setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2)); }
    catch (error) { setError(error instanceof Error ? error.message : "Project settings operation failed. Your edit was preserved."); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    const { configuration } = await sdk.projects.configuration(project.id);
    setValues(structuredClone(configuration.values)); setRevision(configuration.revision); setRaw({}); setDirty(false); setLoaded(true);
  };
  useEffect(() => { void run(reload); }, [project.id]);
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  const committedRevision = snapshot.projectConfigurations.find((entry) => entry.projectId === project.id)?.revision ?? 0;
  useEffect(() => {
    if (loaded && !ownSave.current && committedRevision !== revision) {
      if (dirty) setError("Another client changed project settings. Your edit is preserved; reload before saving.");
      else void run(reload);
    }
  }, [committedRevision]);
  const change = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => { setValues((current) => ({ ...current, [key]: value })); setDirty(true); };
  const json = (key: "scripts" | "sandbox" | "mcpServers" | "defaults", label: string) => <label className="setting-field">{label}<textarea aria-label={label} className="json-editor short" spellCheck={false} value={raw[key] ?? JSON.stringify(values[key], null, 2)} onChange={(event) => { setRaw((current) => ({ ...current, [key]: event.target.value })); setDirty(true); }} /></label>;
  const save = () => run(async () => {
    const input = { ...values }; for (const [key, text] of Object.entries(raw)) Object.assign(input, { [key]: JSON.parse(text) });
    const settings = parse(ProjectSettingsSchema, input);
    ownSave.current = true;
    try { const result = await sdk.projects.configure(project.id, settings, revision); setValues(settings); setRevision(result.revision!); setRaw({}); setDirty(false); }
    finally { ownSave.current = false; }
  });
  const canRun = session?.projectId === project.id && !dirty && !busy;
  return <section aria-label="Per-project settings"><header className="project-settings-header"><div><h2>{project.name}</h2><p className="fine-print">{project.path}</p></div>
    <button className="primary" aria-label="Save project settings" disabled={!loaded || !dirty || busy} onClick={() => void save()}>Save</button></header>
    {error && <div className="notice error" role="alert"><span>{error}</span><button disabled={busy} onClick={() => void run(reload)}>Reload</button></div>}
    {!loaded && <p role="status">Loading committed project settings...</p>}
    <fieldset className="project-settings-fields" disabled={!loaded}>
    <h3>Repository</h3><div className="project-settings-grid">
      <label className="setting-field">Upstream<input value={values.repo.upstream} onChange={(event) => change("repo", { ...values.repo, upstream: event.target.value })} /></label>
      <label className="setting-field">Main branch<input value={values.repo.mainBranch} onChange={(event) => change("repo", { ...values.repo, mainBranch: event.target.value })} /></label></div>
    <label className="setting-field">Branch name pattern<input value={values.repo.branchPattern} onChange={(event) => change("repo", { ...values.repo, branchPattern: event.target.value })} /></label>
    <p className="fine-print">Placeholders: {"{slug}"} and {"{id}"}. Binding a PR or creating a session does not silently change this folder's checkout.</p>
    <label className="setting-field">GitHub read access<select value={values.repo.githubAccess} onChange={(event) => change("repo", { ...values.repo, githubAccess: event.target.value as ProjectSettings["repo"]["githubAccess"] })}><option value="public">Public API</option><option value="gh-cli">My signed-in GitHub CLI account</option></select></label>
    <h3>New-session defaults</h3>{json("defaults", "Project startup control overrides")}
    <p className="fine-print">Overrides profile/global preferences for new sessions only. Existing sessions keep their saved controls and source snapshot; policy still wins.</p>
    <h3>Agent folder policy</h3>
    <label className="setting-field">Read-only folders, one per line<textarea aria-label="Read-only folders" value={values.readOnlyFolders.join("\n")} onChange={(event) => change("readOnlyFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    <label className="setting-field">Denied folders, one per line<textarea aria-label="Denied folders" value={values.deniedFolders.join("\n")} onChange={(event) => change("deniedFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    <p className="settings-warning">These are deterministic agent rules, not OS containment. Host command/MCP tools are disabled when they cannot enforce these restrictions. A manually opened user console still runs host code.</p>
    <h3>Sandbox</h3>{json("sandbox", "Project SendBox configuration (null inherits global)")}
    <p className="fine-print">Configuration does not make an unqualified SendBox backend ready. No Local fallback.</p>
    <h3>Remote SSH workspace</h3><label className="setting-field">Canonical remote path<input aria-label="Remote workspace path" value={values.remotePath ?? ""} placeholder="/absolute/path/on/ssh/host" onChange={(event) => change("remotePath", event.target.value || null)} /></label>
    <p className="fine-print">An explicit path on the configured SSH host. It is not this local folder, a synchronization setting or a home-directory mount. Remote project chats cannot run until it is approved and canonical.</p>
    <h3>Scripts</h3>{json("scripts", "Project scripts")}
    <p className="fine-print">Use entries with id, name and exact command. Typical names: start, stop, dev, config. Nothing runs when settings are saved.</p>
    <div className="button-row">{values.scripts.map((script) => <button key={script.id} disabled={!canRun} onClick={() => void run(async () => { await sdk.terminal.open(session!.id, 80, 24, script.id); openTerminal(); })}><Icon name="Play" />{script.name}</button>)}</div>
    {values.scripts.length > 0 && !session && <p className="fine-print">Open a session in this project to run its user scripts.</p>}
    <h3>Preview port and Porto</h3>
    <label className="setting-field">Preview port<input type="number" min={1} max={65535} value={values.port ?? ""} onChange={(event) => change("port", event.target.value ? Number(event.target.value) : null)} /></label>
    <label className="check-setting"><input type="checkbox" checked={values.porto.enabled} onChange={(event) => change("porto", { ...values.porto, enabled: event.target.checked })} />Enable optional Porto inventory access</label>
    <div className="project-settings-grid"><label className="setting-field">Porto project<input value={values.porto.project} onChange={(event) => change("porto", { ...values.porto, project: event.target.value })} /></label>
      <label className="setting-field">Porto executable<input value={values.porto.executable} onChange={(event) => change("porto", { ...values.porto, executable: event.target.value })} /></label></div>
    <button disabled={dirty || busy || !values.porto.enabled} onClick={() => void run(async () => (await sdk.projects.porto(project.id)).output)}>Read Porto inventory</button>
    <p className="fine-print">Reads the installed Porto CLI's inventory without starting/stopping daemons or killing processes. Save the intended port explicitly; Porto-owned services stay Porto-owned.</p>
    <h3>Repository instructions and MCP</h3>
    <div className="project-settings-grid"><label className="setting-field">Instructions file<input value={values.instructionsPath} onChange={(event) => change("instructionsPath", event.target.value)} /></label>
      <label className="setting-field">MCP file<input value={values.mcpPath} onChange={(event) => change("mcpPath", event.target.value)} /></label></div>
    <label className="setting-field">Instruction override (empty uses repo file)<textarea aria-label="Project instruction override" value={values.instructions} onChange={(event) => change("instructions", event.target.value)} /></label>
    <p className="settings-warning">Repository instructions are untrusted guidance. They cannot grant permissions or override read-only mode. Do not put secrets in instructions or scripts.</p>
    <button disabled={dirty || busy} onClick={() => void run(async () => { const result = await sdk.projects.sources(project.id); setSources(result); setReviewed(false); return undefined; })}>Review repo files</button>
    {sources && <><details open><summary>{values.instructionsPath}: {sources.instructions === null ? "missing" : "present"}</summary><pre>{sources.instructions ?? "No instructions file exists."}</pre></details>
      <details><summary>{values.mcpPath}: {sources.mcp === null ? "missing" : "present"}</summary><pre>{sources.mcp ?? "No MCP file exists."}</pre>{sources.mcpDigest && <code>SHA-256 {sources.mcpDigest}</code>}</details>
      <label className="check-setting"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the MCP source. Import only supported entries, disabled.</label>
      <button disabled={!reviewed || !sources.mcpDigest || busy || dirty} onClick={() => void run(async () => { ownSave.current = true; try { await sdk.projects.importMcp(project.id, revision, true, sources.mcpDigest!); await reload(); } finally { ownSave.current = false; } })}>Import reviewed MCP config</button>
      {(sources.instructions === null || sources.mcp === null) && <div className="repo-bootstrap"><label className="setting-field">Publish defaults branch<input value={branch} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="check-setting"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />I approve creating only missing defaults and pushing this non-protected branch. My current branch/index and unrelated changes are preserved.</label>
        <button disabled={!publish || dirty || busy} onClick={() => void run(() => sdk.projects.initialize(project.id, branch, revision, true))}>Create and push missing defaults</button></div>}
    </>}
    {json("mcpServers", "Reviewed project MCP servers")}
    <label className="setting-field">Plan file<input value={values.planPath} onChange={(event) => change("planPath", event.target.value)} /></label>
    <footer className="button-row"><button disabled={busy} onClick={() => { setValues(defaultProjectSettings()); setRaw({}); setDirty(true); }}>Restore project defaults</button><button disabled={busy} onClick={() => void run(reload)}>Reload committed values</button></footer>
    {output && <details className="settings-result" open><summary>SDK response</summary><pre>{output}</pre></details>}
    </fieldset>
  </section>;
}
