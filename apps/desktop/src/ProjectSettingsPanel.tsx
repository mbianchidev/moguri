import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { defaultProjectConfiguration, defaultProjectSettings, parse, ProjectSettingsSchema, ProjectWorkspaceModeSchema, ProjectPullRequestModeSchema, WORKFLOW_GUIDANCE_FIELDS, type ProjectRepositoryLayout, type WorkflowGuidance, type MoguriSdk, type Project, type ProjectSettings, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { ManagedWorkspacePanel } from "./ManagedWorkspacePanel.tsx";
import { BoardSettings } from "./BoardSettings.tsx";
import { RepositoryRemotePanel } from "./RepositoryRemotePanel.tsx";
import { RepositoryTrustPanel } from "./RepositoryTrustPanel.tsx";
import { Alert } from "./Alert.tsx";
import { ProjectLocationActions } from "./ProjectLocationActions.tsx";

export function ProjectSettingsPanel({ sdk, project, session, snapshot, onDirty, openTerminal, openSession, available = true, discardUnavailable }: {
  sdk: MoguriSdk; project: Project; session?: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; openTerminal: () => void; openSession: (id: string) => void;
  available?: boolean; discardUnavailable?: () => void;
}) {
  const [values, setValues] = useState<ProjectSettings>(defaultProjectSettings);
  const [committed, setCommitted] = useState<ProjectSettings>(defaultProjectSettings);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [boardDirty, setBoardDirty] = useState(false);
  const [remoteDirty, setRemoteDirty] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [repositories, setRepositories] = useState<ProjectRepositoryLayout | null>(null);
  const presentation = snapshot.projectConfigurations.find((entry) => entry.projectId === project.id) ?? defaultProjectConfiguration(project.id);
  const dirty = Object.keys(raw).length > 0 || JSON.stringify(values) !== JSON.stringify(committed);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [sources, setSources] = useState<{ instructions: string | null; mcp: string | null; mcpDigest: string | null } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [publish, setPublish] = useState(false);
  const [branch, setBranch] = useState(`moguri/repo-defaults-${crypto.randomUUID().slice(0, 8)}`);
  const ownSave = useRef(false);
  const committedValues = useRef(committed);
  const run = async (operation: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { const result = await operation(); if (result !== undefined) setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2)); }
    catch (error) { setError(error instanceof Error ? error.message : "Project settings operation failed. Your edit was preserved."); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    const { configuration } = await sdk.projects.configuration(project.id);
    committedValues.current = configuration.values; setCommitted(structuredClone(configuration.values));
    setValues(structuredClone(configuration.values)); setRevision(configuration.revision); setRaw({}); setLoaded(true);
  };
  useEffect(() => { if (available) void run(reload); }, [sdk, project.id]);
  useEffect(() => {
    if (!available) { setRepositories(null); return; }
    let current = true;
    void sdk.projects.repositories(project.id).then((value) => { if (current) setRepositories(value); })
      .catch((error: unknown) => { if (current) { setRepositories(null); setError(error instanceof Error ? error.message : "The actual repository layout could not be verified. No upstream control was enabled."); } });
    return () => { current = false; };
  }, [sdk, project.id, project.path, available, JSON.stringify(presentation.values.deniedFolders)]);
  useEffect(() => { onDirty(dirty || busy || boardDirty || remoteDirty || trustBusy); return () => onDirty(false); }, [dirty, busy, boardDirty, remoteDirty, trustBusy, onDirty]);
  const committedRevision = snapshot.projectConfigurations.find((entry) => entry.projectId === project.id)?.revision ?? 0;
  useEffect(() => {
    if (available && loaded && !ownSave.current && committedRevision !== revision) {
      if (dirty) setError("Another client changed project settings. Your edit is preserved; reload before saving.");
      else void run(reload);
    }
  }, [committedRevision]);
  const change = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => setValues((current) => ({ ...current, [key]: value }));
  const sectionDirty = (key: keyof ProjectSettings) => raw[key] !== undefined || JSON.stringify(values[key]) !== JSON.stringify(committed[key]);
  const saveButton = (key: keyof ProjectSettings, label: string) => <button type="button" className="primary" aria-label={label} disabled={!loaded || busy || !sectionDirty(key)} onClick={() => void save(key)}>Save</button>;
  const json = (key: "scripts" | "sandbox" | "mcpServers" | "defaults", label: string) => <div className="setting-editor"><label className="setting-field">{label}<SettingsTextarea aria-label={label} className="json-editor short" spellCheck={false} value={raw[key] ?? JSON.stringify(values[key], null, 2)} onChange={(event) => setRaw((current) => ({ ...current, [key]: event.target.value }))} /></label>{saveButton(key, `Save ${label}`)}</div>;
  const save = (section?: keyof ProjectSettings) => run(async () => {
    if (!available) throw new Error("The original project is unavailable. No settings were written to another project.");
    if (ownSave.current) throw new Error("Wait for the current project settings save to finish.");
    const input = section ? { ...committedValues.current, [section]: values[section] } : { ...values };
    for (const [key, text] of Object.entries(raw)) if (!section || key === section) Object.assign(input, { [key]: JSON.parse(text) });
    const settings = parse(ProjectSettingsSchema, input);
    ownSave.current = true;
    try {
      const result = await sdk.projects.configure(project.id, settings, revision);
      committedValues.current = settings; setCommitted(structuredClone(settings)); setRevision(result.revision!);
      setValues((current) => section ? { ...current, [section]: structuredClone(settings[section]) } : settings);
      setRaw((current) => { if (!section) return {}; const { [section]: _, ...rest } = current; return rest; });
    }
    finally { ownSave.current = false; }
  });
  const automatic = <K extends "repo" | "porto">(section: K, patch: Partial<ProjectSettings[K]>) => {
    if (ownSave.current || busy) { setError("Wait for the current project settings save to finish. Your edits are preserved."); return; }
    setValues((current) => ({ ...current, [section]: { ...current[section], ...patch } }));
    void run(async () => {
      const settings = parse(ProjectSettingsSchema, { ...committedValues.current, [section]: { ...committedValues.current[section], ...patch } });
      ownSave.current = true;
      try {
        const result = await sdk.projects.configure(project.id, settings, revision);
        committedValues.current = settings; setCommitted(structuredClone(settings)); setRevision(result.revision!);
      } finally { ownSave.current = false; }
    });
  };
  const workflow = (key: keyof WorkflowGuidance, action: "save" | "override" | "inherit") => {
    if (ownSave.current || busy) { setError("Wait for the current project settings save. Your edit is preserved."); return; }
    const guidance = { ...committedValues.current.guidance };
    if (action === "inherit") delete guidance[key];
    else guidance[key] = action === "override" ? snapshot.settings.values.guidance?.[key] ?? "" : values.guidance?.[key] ?? "";
    setValues((current) => {
      const next = { ...current.guidance };
      if (action === "inherit") delete next[key]; else next[key] = guidance[key];
      return { ...current, guidance: next };
    });
    return run(async () => {
      const settings = parse(ProjectSettingsSchema, { ...committedValues.current, guidance });
      ownSave.current = true;
      try {
        const result = await sdk.projects.configure(project.id, settings, revision);
        committedValues.current = settings; setCommitted(structuredClone(settings)); setRevision(result.revision!);
      } finally { ownSave.current = false; }
    });
  };
  const canRun = session?.projectId === project.id && !dirty && !busy;
  return <section aria-label="Per-project settings"><header className="project-settings-header"><div className="project-settings-title"><h2>{project.name}</h2><p className="fine-print">{project.path}</p></div>
    <div className="button-row project-settings-actions"><ProjectLocationActions sdk={sdk} project={project} disabled={!available || busy || trustBusy} run={run} />
      <button className="primary" aria-label="Save project settings" disabled={!available || !loaded || !dirty || busy || trustBusy} onClick={() => void save()}>Save</button></div></header>
    {!available && discardUnavailable && <button type="button" disabled={busy} onClick={discardUnavailable}>Discard unavailable project edit</button>}
    {error && <div className="alert-recovery"><Alert className="notice error" role="alert">{error}</Alert><button disabled={!available || busy} onClick={() => void run(reload)}>Reload</button></div>}
    {!loaded && available && <p role="status">Loading committed project settings...</p>}
    <fieldset className="project-settings-fields" disabled={!available || !loaded || busy || trustBusy}>
    <BoardSettings sdk={sdk} project={project} snapshot={snapshot} onDirty={setBoardDirty} />
    <SettingsHelp label="More about this setting" target={<h3>Project instruction overrides</h3>}>Unselected fields inherit this profile's global guidance. An empty explicit override disables that inherited field. Saving a field preserves other pending text and grants no tools.</SettingsHelp>
    {WORKFLOW_GUIDANCE_FIELDS.map(({ key, label }) => <div className="setting-editor" key={key}>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Override ${label}`} checked={Object.hasOwn(values.guidance ?? {}, key)} onChange={(event) => void workflow(key, event.target.checked ? "override" : "inherit")} />Override {label.toLowerCase()}</label>
      <label className="setting-field">{label}<SettingsTextarea aria-label={`Project ${label}`} maxLength={65536} readOnly={!Object.hasOwn(values.guidance ?? {}, key)} value={values.guidance?.[key] ?? snapshot.settings.values.guidance?.[key] ?? ""} onChange={(event) => change("guidance", { ...values.guidance, [key]: event.target.value })} /></label>
      <button type="button" className="primary" aria-label={`Save project ${label}`} disabled={!Object.hasOwn(values.guidance ?? {}, key) || values.guidance?.[key] === committed.guidance?.[key]} onClick={() => void workflow(key, "save")}>Save</button>
    </div>)}
    <h3>Repository</h3><div className="project-settings-grid">
      {repositories?.complete && repositories.roots.length === 1 && <label className="setting-field">Upstream<SettingsInput value={values.repo.upstream} onChange={(event) => change("repo", { ...values.repo, upstream: event.target.value })} /></label>}
      <label className="setting-field">Main branch<SettingsInput value={values.repo.mainBranch} onChange={(event) => change("repo", { ...values.repo, mainBranch: event.target.value })} /></label></div>
    <p className="fine-print">{repositories?.diagnostic ?? "Verifying the bounded Local repository layout before exposing an upstream control."}{repositories?.complete && repositories.roots.length === 1 ? ` Actual repository: ${repositories.roots[0]}. This preference never rebinds the session's root.` : " An upstream control requires exactly one verified repository, including nested roots."}</p>
    <label className="setting-field">Branch name pattern<SettingsInput value={values.repo.branchPattern} onChange={(event) => change("repo", { ...values.repo, branchPattern: event.target.value })} /></label>
    <div className="project-settings-grid">
      <label className="setting-field">New Local Git tasks<select aria-label="Default project workspace" value={values.repo.workspaceMode ?? "worktree"}
        onChange={(event) => automatic("repo", { workspaceMode: parse(ProjectWorkspaceModeSchema, event.target.value) })}>
        <option value="worktree">Managed worktree (default)</option><option value="checkout">Original checkout (explicit opt-out)</option>
      </select></label>
      <label className="setting-field">Code-change completion<select aria-label="Default pull request workflow" value={values.repo.pullRequests ?? "draft"}
        onChange={(event) => automatic("repo", { pullRequests: parse(ProjectPullRequestModeSchema, event.target.value) })}>
        <option value="draft">Draft pull request (default)</option><option value="none">Only when explicitly requested</option>
      </select></label>
    </div>
    <p className="fine-print">New Local Git tasks create owned worktrees before running. Existing sessions keep their exact root. PR guidance never grants publication, authentication or merge permission; ordinary approvals still apply.</p>
    {saveButton("repo", "Save repository settings")}
    <RepositoryTrustPanel key={`${sdk.profileId}:${project.id}`} sdk={sdk} project={project} snapshot={snapshot}
      disabled={!available || !loaded || dirty || busy} onBusy={setTrustBusy} />
    <RepositoryRemotePanel sdk={sdk} project={project} snapshot={snapshot} upstream={committed.repo.upstream}
      disabled={!available || !loaded || dirty || busy} onDirty={setRemoteDirty} />
    <p className="fine-print">Placeholders: {"{slug}"} and {"{id}"}. Binding a PR or creating a session does not silently change this folder's checkout.</p>
    <SettingsHelp label="More about this setting" target={<label className="setting-field">GitHub read access<select aria-label="GitHub read access" value={values.repo.githubAccess} onChange={(event) => automatic("repo", { githubAccess: event.target.value === "gh-cli" ? "gh-cli" : "public" })}><option value="public">Public API</option><option value="gh-cli">My signed-in GitHub CLI account</option></select></label>}>Repository attribution uses the selected session's Local or pinned SSH account. Its review shows the actual host before lookup. Linked-PR observation and client attachments remain control-plane reads.</SettingsHelp>
    <SettingsHelp label="More about this setting" target={<h3>New-session defaults</h3>}>Overrides profile/global preferences for new sessions only. Existing sessions keep their saved controls and source snapshot; policy still wins.</SettingsHelp>{json("defaults", "Project startup control overrides")}

    {loaded && <ManagedWorkspacePanel sdk={sdk} project={project} settings={values} snapshot={snapshot} disabled={dirty || busy} openSession={openSession} />}
    <h3>Agent folder policy</h3>
    <label className="setting-field">Read-only folders, one per line<SettingsTextarea aria-label="Read-only folders" value={values.readOnlyFolders.join("\n")} onChange={(event) => change("readOnlyFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    {saveButton("readOnlyFolders", "Save read-only folders")}
    <label className="setting-field">Denied folders, one per line<SettingsTextarea aria-label="Denied folders" value={values.deniedFolders.join("\n")} onChange={(event) => change("deniedFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    {saveButton("deniedFolders", "Save denied folders")}
    <Alert as="p" tone="warning" className="settings-warning">These are deterministic agent rules, not OS containment. Host command/MCP tools are disabled when they cannot enforce these restrictions. A manually opened user console still runs host code.</Alert>
    <h3>Sandbox</h3>{json("sandbox", "Project SendBox configuration (null inherits global)")}
    <p className="fine-print">Configuration does not make an unqualified SendBox backend ready. No Local fallback.</p>
    <h3>Remote SSH workspace</h3><SettingsHelp label="More about this setting" target={<label className="setting-field">Canonical remote path<SettingsInput aria-label="Remote workspace path" value={values.remotePath ?? ""} placeholder="/absolute/path/on/ssh/host" onChange={(event) => change("remotePath", event.target.value || null)} /></label>}>An explicit path on the configured SSH host. It is not this local folder, a synchronization setting or a home-directory mount. Remote project chats cannot run until it is approved and canonical.</SettingsHelp>
    {saveButton("remotePath", "Save remote workspace path")}

    <SettingsHelp label="More about this setting" target={<h3>Scripts</h3>}>Use entries with id, name and exact command. Typical names: start, stop, dev, config. Nothing runs when settings are saved.</SettingsHelp>{json("scripts", "Project scripts")}

    <div className="button-row">{values.scripts.map((script) => <button key={script.id} disabled={!canRun} onClick={() => void run(async () => { await sdk.terminal.open(session!.id, 80, 24, script.id); openTerminal(); })}><Icon name="Play" />{script.name}</button>)}</div>
    {values.scripts.length > 0 && !session && <p className="fine-print">Open a session in this project to run its user scripts.</p>}
    <h3>Preview port and Porto</h3>
    <label className="setting-field">Preview port<SettingsInput type="number" min={1} max={65535} value={values.port ?? ""} onChange={(event) => change("port", event.target.value ? Number(event.target.value) : null)} /></label>
    {saveButton("port", "Save preview port")}
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.porto.enabled} onChange={(event) => automatic("porto", { enabled: event.target.checked })} />Enable optional Porto inventory access</label>
    <div className="project-settings-grid"><label className="setting-field">Porto project<SettingsInput value={values.porto.project} onChange={(event) => change("porto", { ...values.porto, project: event.target.value })} /></label>
      <label className="setting-field">Porto executable<SettingsInput value={values.porto.executable} onChange={(event) => change("porto", { ...values.porto, executable: event.target.value })} /></label></div>
    {saveButton("porto", "Save Porto settings")}
    <SettingsHelp label="More about this setting" target={<button disabled={dirty || busy || !values.porto.enabled} onClick={() => void run(async () => (await sdk.projects.porto(project.id)).output)}>Read Porto inventory</button>}>Reads the installed Porto CLI's inventory without starting/stopping daemons or killing processes. Save the intended port explicitly; Porto-owned services stay Porto-owned.</SettingsHelp>

    <h3>Repository instructions and MCP</h3>
    <div className="project-settings-grid"><div><label className="setting-field">Instructions file<SettingsInput value={values.instructionsPath} onChange={(event) => change("instructionsPath", event.target.value)} /></label>{saveButton("instructionsPath", "Save instructions path")}</div>
      <div><label className="setting-field">MCP file<SettingsInput value={values.mcpPath} onChange={(event) => change("mcpPath", event.target.value)} /></label>{saveButton("mcpPath", "Save MCP path")}</div></div>
    <label className="setting-field">Instruction override (empty uses repo file)<SettingsTextarea aria-label="Project instruction override" value={values.instructions} onChange={(event) => change("instructions", event.target.value)} /></label>
    {saveButton("instructions", "Save project instructions")}
    <Alert as="p" tone="warning" className="settings-warning">Repository instructions are untrusted guidance. They cannot grant permissions or override read-only mode. Do not put secrets in instructions or scripts.</Alert>
    <button disabled={dirty || busy} onClick={() => void run(async () => { const result = await sdk.projects.sources(project.id); setSources(result); setReviewed(false); return undefined; })}>Review repo files</button>
    {sources && <><details open><summary>{values.instructionsPath}: {sources.instructions === null ? "missing" : "present"}</summary><pre>{sources.instructions ?? "No instructions file exists."}</pre></details>
      <details><summary>{values.mcpPath}: {sources.mcp === null ? "missing" : "present"}</summary><pre>{sources.mcp ?? "No MCP file exists."}</pre>{sources.mcpDigest && <code>SHA-256 {sources.mcpDigest}</code>}</details>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the MCP source. Import only supported entries, disabled.</label>
      <button disabled={!reviewed || !sources.mcpDigest || busy || dirty} onClick={() => void run(async () => { ownSave.current = true; try { await sdk.projects.importMcp(project.id, revision, true, sources.mcpDigest!); await reload(); } finally { ownSave.current = false; } })} aria-label="Import reviewed MCP config">Import</button>
      {(sources.instructions === null || sources.mcp === null) && <div className="repo-bootstrap"><label className="setting-field">Publish defaults branch<SettingsInput value={branch} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />I approve creating only missing defaults and pushing this non-protected branch. My current branch/index and unrelated changes are preserved.</label>
        <button disabled={!publish || dirty || busy} onClick={() => void run(() => sdk.projects.initialize(project.id, branch, revision, true))} aria-label="Create and push missing defaults">Create and push</button></div>}
    </>}
    {json("mcpServers", "Reviewed project MCP servers")}
    <label className="setting-field">Plan file<SettingsInput value={values.planPath} onChange={(event) => change("planPath", event.target.value)} /></label>
    {saveButton("planPath", "Save plan path")}
    <footer className="button-row"><button disabled={busy} onClick={() => { setValues(defaultProjectSettings()); setRaw({}); }} aria-label="Restore defaults for project">Restore defaults</button><button disabled={busy} onClick={() => void run(reload)} aria-label="Reload committed values">Reload</button></footer>
    {output && <details className="settings-result" open><summary>SDK response</summary><pre>{output}</pre></details>}
    </fieldset>
  </section>;
}
