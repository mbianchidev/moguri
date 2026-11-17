import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { defaultProjectConfiguration, defaultProjectSettings, parse, ProjectSettingsSchema, ProjectWorkspaceModeSchema, ProjectPullRequestModeSchema, ProjectScreenshotModeSchema, ProjectInstallerModeSchema, WORKFLOW_GUIDANCE_FIELDS, type InstallerCandidate, type ProjectRepositoryLayout, type WorkflowGuidance, type MoguriSdk, type Project, type ProjectSettings, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { ManagedWorkspacePanel } from "./ManagedWorkspacePanel.tsx";
import { BoardSettings } from "./BoardSettings.tsx";
import { RepositoryRemotePanel } from "./RepositoryRemotePanel.tsx";
import { PathField } from "./PathField.tsx";
import { RepositoryTrustPanel } from "./RepositoryTrustPanel.tsx";
import { Alert } from "./Alert.tsx";

export function ProjectSettingsPanel({ sdk, project, session, snapshot, onDirty, openTerminal, openSession, available = true, discardUnavailable }: {
  sdk: MoguriSdk; project: Project; session?: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; openTerminal: () => void; openSession: (id: string) => void;
  available?: boolean; discardUnavailable?: () => void;
}) {
  const [values, setValues] = useState<ProjectSettings>(defaultProjectSettings);
  const [installers, setInstallers] = useState<InstallerCandidate[] | null>(null);
  useEffect(() => {
    let current = true; setInstallers(null);
    void sdk.projects.installers(project.id).then((value) => { if (current) setInstallers(value); }, () => { if (current) setInstallers([]); });
    return () => { current = false; };
  }, [sdk, project.id, project.path]);
  const sourceFolder = project.workspaceFolderId ? snapshot.workspaceFolders.find((folder) => folder.id === project.workspaceFolderId)?.root.root ?? "a workspace folder" : null;
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
  const [branch, setBranch] = useState(() => `${snapshot.settings.values.git?.branchPrefix ?? ""}moguri/repo-defaults-${crypto.randomUUID().slice(0, 8)}`);
  const ownSave = useRef(false);
  const committedValues = useRef(committed);
  const run = async (operation: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { const result = await operation(); if (result !== undefined) setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2)); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't update project settings. Your edits are kept."); }
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
      .catch((error: unknown) => { if (current) { setRepositories(null); setError(error instanceof Error ? error.message : "Couldn't check the repository layout, so Upstream is hidden."); } });
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
    if (!available) throw new Error("This project is no longer available. Nothing was saved.");
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
  return <section aria-label="Per-project settings"><header className="project-settings-header"><div><h2>{project.name}</h2><p className="fine-print">{project.path}</p></div>
    <button className="primary" aria-label="Save project settings" disabled={!available || !loaded || !dirty || busy || trustBusy} onClick={() => void save()}>Save</button></header>
    {!available && discardUnavailable && <button type="button" disabled={busy} onClick={discardUnavailable}>Discard unavailable project edit</button>}
    {error && <div className="alert-recovery"><Alert className="notice error" role="alert">{error}</Alert><button disabled={!available || busy} onClick={() => void run(reload)}>Reload</button></div>}
    {!loaded && available && <p role="status">Loading project settings...</p>}
    <fieldset className="project-settings-fields" disabled={!available || !loaded || busy || trustBusy}>
    <BoardSettings sdk={sdk} project={project} snapshot={snapshot} onDirty={setBoardDirty} />
    <SettingsHelp label="More about this setting" target={<h3>User guidance overrides</h3>}>Fields you don't override use your global User guidance. An empty override turns that field off for this project.</SettingsHelp>
    {WORKFLOW_GUIDANCE_FIELDS.map(({ key, label }) => <div className="setting-editor" key={key}>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Override ${label}`} checked={Object.hasOwn(values.guidance ?? {}, key)} onChange={(event) => void workflow(key, event.target.checked ? "override" : "inherit")} />Override {label.toLowerCase()}</label>
      <label className="setting-field">{label}<SettingsTextarea aria-label={`Project ${label}`} maxLength={65536} readOnly={!Object.hasOwn(values.guidance ?? {}, key)} value={values.guidance?.[key] ?? snapshot.settings.values.guidance?.[key] ?? ""} onChange={(event) => change("guidance", { ...values.guidance, [key]: event.target.value })} /></label>
      <button type="button" className="primary" aria-label={`Save project ${label}`} disabled={!Object.hasOwn(values.guidance ?? {}, key) || values.guidance?.[key] === committed.guidance?.[key]} onClick={() => void workflow(key, "save")}>Save</button>
    </div>)}
    <h3>Repository</h3>
    {sourceFolder && <p className="fine-print project-source">Added from <code className="path">{sourceFolder}</code>. Moguri only reads this repository: every session works in its own worktree.</p>}
    <div className="project-settings-grid">
      {repositories?.complete && repositories.roots.length === 1 && <label className="setting-field">Upstream<SettingsInput value={values.repo.upstream} onChange={(event) => change("repo", { ...values.repo, upstream: event.target.value })} /></label>}
      <label className="setting-field">Main branch<SettingsInput value={values.repo.mainBranch} onChange={(event) => change("repo", { ...values.repo, mainBranch: event.target.value })} /></label></div>
    <p className="fine-print">{!repositories ? "Checking the repository layout..."
      : repositories.complete && repositories.roots.length === 1 ? `Repository: ${repositories.roots[0]}.`
        : `${repositories.complete ? "No Git repository found in this folder." : repositories.diagnostic} Upstream needs exactly one, including nested ones.`}</p>
    <label className="setting-field">Branch name pattern<SettingsInput value={values.repo.branchPattern} onChange={(event) => change("repo", { ...values.repo, branchPattern: event.target.value })} /></label>
    <div className="project-settings-grid">
      <label className="setting-field">New Local Git tasks run in<select aria-label="Default project workspace" value={sourceFolder ? "worktree" : values.repo.workspaceMode ?? "worktree"}
        disabled={Boolean(sourceFolder)} onChange={(event) => automatic("repo", { workspaceMode: parse(ProjectWorkspaceModeSchema, event.target.value) })}>
        <option value="worktree">{sourceFolder ? "A new worktree (always)" : "A new worktree (default)"}</option>{!sourceFolder && <option value="checkout">This folder's checkout</option>}
      </select></label>
      <label className="setting-field">After code changes<select aria-label="Default pull request workflow" value={values.repo.pullRequests ?? "draft"}
        onChange={(event) => automatic("repo", { pullRequests: parse(ProjectPullRequestModeSchema, event.target.value) })}>
        <option value="draft">Open a draft pull request (default)</option><option value="none">Open a PR only when asked</option>
      </select></label>
      <label className="setting-field">Screenshots of UI changes<select aria-label="Screenshots of UI changes" value={values.repo.screenshots ?? "ui-changes"}
        onChange={(event) => automatic("repo", { screenshots: parse(ProjectScreenshotModeSchema, event.target.value) })}>
        <option value="ui-changes">Take them as the UI changes (default)</option><option value="off">Only when asked</option>
      </select></label>
      <label className="setting-field">Installer when session work is done<select aria-label="Installer when session work is done" value={values.repo.installers ?? "ask"}
        onChange={(event) => {
          const choice = event.target.value;
          if (choice === "ask") automatic("repo", { installers: undefined });
          else automatic("repo", { installers: parse(ProjectInstallerModeSchema, choice),
            ...(choice === "build" && !values.repo.installerCommand && installers?.[0] ? { installerCommand: installers[0].run } : {}) });
        }}>
        <option value="ask">Ask me (default)</option><option value="build">Build it</option><option value="skip">Don't build</option>
      </select></label>
    </div>
    {values.repo.installers === "build" && <label className="setting-field">Installer command<SettingsInput aria-label="Installer command" value={values.repo.installerCommand ?? ""}
      placeholder={installers?.[0]?.run ?? "npm run package:mac"} spellCheck={false}
      onChange={(event) => change("repo", { ...values.repo, installerCommand: event.target.value || undefined })} /></label>}
    {installers && installers.length > 0 && <p className="fine-print">Found {installers.map((candidate) => candidate.run).join(", ")} in this project.</p>}
    <p className="fine-print">Existing sessions keep their workspace. These choices guide the agent; pushing, merging and running commands follow your normal approvals.</p>
    {saveButton("repo", "Save repository settings")}
    <RepositoryTrustPanel key={`${sdk.profileId}:${project.id}`} sdk={sdk} project={project} snapshot={snapshot}
      disabled={!available || !loaded || dirty || busy} onBusy={setTrustBusy} />
    {project.workspaceFolderId ? <p className="fine-print">Moguri doesn't change this repository's remotes because it only reads projects from a workspace folder.</p> :
      <RepositoryRemotePanel sdk={sdk} project={project} snapshot={snapshot} upstream={committed.repo.upstream}
        disabled={!available || !loaded || dirty || busy} onDirty={setRemoteDirty} />}
    <p className="fine-print">Branch pattern placeholders: {"{slug}"}, {"{id}"}. This folder's checkout never switches on its own.</p>
    <SettingsHelp label="More about this setting" target={<label className="setting-field">GitHub read access<select aria-label="GitHub read access" value={values.repo.githubAccess} onChange={(event) => automatic("repo", { githubAccess: event.target.value === "gh-cli" ? "gh-cli" : "public" })}><option value="public">Public GitHub API</option><option value="gh-cli">My signed-in GitHub CLI account</option></select></label>}>How Moguri reads this repository's GitHub data. Remote chats use the SSH host's account, shown before each lookup; linked-PR checks always run from this Mac.</SettingsHelp>
    <SettingsHelp label="More about this setting" target={<h3>New-session defaults</h3>}>Applies only to new sessions in this project. Policy limits still apply.</SettingsHelp>{json("defaults", "Project startup control overrides")}

    {loaded && <ManagedWorkspacePanel sdk={sdk} project={project} settings={values} snapshot={snapshot} disabled={dirty || busy} openSession={openSession} />}
    <h3>Folder access</h3>
    <label className="setting-field">Read-only folders, one per line<SettingsTextarea aria-label="Read-only folders" value={values.readOnlyFolders.join("\n")} onChange={(event) => change("readOnlyFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    {saveButton("readOnlyFolders", "Save read-only folders")}
    <label className="setting-field">Denied folders, one per line<SettingsTextarea aria-label="Denied folders" value={values.deniedFolders.join("\n")} onChange={(event) => change("deniedFolders", event.target.value.split("\n").map((value) => value.trim()).filter(Boolean))} /></label>
    {saveButton("deniedFolders", "Save denied folders")}
    <Alert as="p" tone="warning" className="settings-warning">These rules limit the agent's tools, not the OS. Tools that can't honor them are turned off; terminals you open aren't restricted.</Alert>
    <h3>Sandbox</h3>{json("sandbox", "Project SendBox configuration (null inherits global)")}
    <p className="fine-print">Saving doesn't make SendBox ready. Sandbox chats never fall back to Local.</p>
    <h3>Remote SSH workspace</h3><SettingsHelp label="More about this setting" target={<label className="setting-field">Remote path<SettingsInput aria-label="Remote workspace path" value={values.remotePath ?? ""} placeholder="/absolute/path/on/ssh/host" onChange={(event) => change("remotePath", event.target.value || null)} /></label>}>An absolute path on your SSH host; nothing is synced from this Mac. Remote chats in this project can't run until the path is set and verified.</SettingsHelp>
    {saveButton("remotePath", "Save remote workspace path")}

    <SettingsHelp label="More about this setting" target={<h3>Scripts</h3>}>Each entry needs an id, name and command (for example start, dev or stop). Saving doesn't run anything.</SettingsHelp>{json("scripts", "Project scripts")}

    <div className="button-row">{values.scripts.map((script) => <button key={script.id} disabled={!canRun} onClick={() => void run(async () => { await sdk.terminal.open(session!.id, 80, 24, script.id); openTerminal(); })}><Icon name="Play" />{script.name}</button>)}</div>
    {values.scripts.length > 0 && !session && <p className="fine-print">Open a session in this project to run these scripts.</p>}
    <h3>Preview port and Porto</h3>
    <label className="setting-field">Preview port<SettingsInput type="number" min={1} max={65535} value={values.port ?? ""} onChange={(event) => change("port", event.target.value ? Number(event.target.value) : null)} /></label>
    {saveButton("port", "Save preview port")}
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.porto.enabled} onChange={(event) => automatic("porto", { enabled: event.target.checked })} />Enable Porto inventory</label>
    <label className="setting-field">Porto project<SettingsInput value={values.porto.project} onChange={(event) => change("porto", { ...values.porto, project: event.target.value })} /></label>
    <PathField label="Porto executable" ariaLabel="Porto executable" kind="file" title="Choose the Porto executable" chooseAriaLabel="Choose Porto executable"
      placeholder="porto (on PATH) or /path/to/porto" value={values.porto.executable} onChange={(value) => change("porto", { ...values.porto, executable: value })} />
    {saveButton("porto", "Save Porto settings")}
    <SettingsHelp label="More about this setting" target={<button disabled={dirty || busy || !values.porto.enabled} onClick={() => void run(async () => (await sdk.projects.porto(project.id)).output)}>Read Porto inventory</button>}>Lists services from your installed Porto CLI without starting or stopping anything. Set the preview port yourself; Moguri doesn't manage Porto services.</SettingsHelp>

    <h3>Repository instructions and MCP</h3>
    <div className="project-settings-grid"><div><label className="setting-field">Instructions file<SettingsInput value={values.instructionsPath} onChange={(event) => change("instructionsPath", event.target.value)} /></label>{saveButton("instructionsPath", "Save instructions path")}</div>
      <div><label className="setting-field">MCP file<SettingsInput value={values.mcpPath} onChange={(event) => change("mcpPath", event.target.value)} /></label>{saveButton("mcpPath", "Save MCP path")}</div></div>
    <label className="setting-field">Instructions (leave empty to use the repo file)<SettingsTextarea aria-label="Project instruction override" value={values.instructions} onChange={(event) => change("instructions", event.target.value)} /></label>
    {saveButton("instructions", "Save project instructions")}
    <Alert as="p" tone="warning" className="settings-warning">Instructions guide the agent but can't grant permissions or bypass read-only mode. Don't put secrets in instructions or scripts.</Alert>
    <button disabled={dirty || busy} onClick={() => void run(async () => { const result = await sdk.projects.sources(project.id); setSources(result); setReviewed(false); return undefined; })}>Review repo files</button>
    {sources && <><details open><summary>{values.instructionsPath}: {sources.instructions === null ? "missing" : "present"}</summary><pre>{sources.instructions ?? "No instructions file found."}</pre></details>
      <details><summary>{values.mcpPath}: {sources.mcp === null ? "missing" : "present"}</summary><pre>{sources.mcp ?? "No MCP file found."}</pre>{sources.mcpDigest && <code>SHA-256 {sources.mcpDigest}</code>}</details>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this MCP file. Import its supported servers as disabled.</label>
      <button disabled={!reviewed || !sources.mcpDigest || busy || dirty} onClick={() => void run(async () => { ownSave.current = true; try { await sdk.projects.importMcp(project.id, revision, true, sources.mcpDigest!); await reload(); } finally { ownSave.current = false; } })} aria-label="Import reviewed MCP config">Import</button>
      {(sources.instructions === null || sources.mcp === null) && <div className="repo-bootstrap"><label className="setting-field">Branch for missing defaults<SettingsInput value={branch} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />I want Moguri to add only the missing default files on this branch (not your main branch) and push it. My current branch and uncommitted changes stay as they are.</label>
        <button disabled={!publish || dirty || busy} onClick={() => void run(() => sdk.projects.initialize(project.id, branch, revision, true))} aria-label="Create and push missing defaults">Create and push</button></div>}
    </>}
    {json("mcpServers", "Reviewed project MCP servers")}
    <label className="setting-field">Plan file<SettingsInput value={values.planPath} onChange={(event) => change("planPath", event.target.value)} /></label>
    {saveButton("planPath", "Save plan path")}
    <footer className="button-row"><button disabled={busy} onClick={() => { setValues(defaultProjectSettings()); setRaw({}); }} aria-label="Restore defaults for project">Restore defaults</button><button disabled={busy} onClick={() => void run(reload)} aria-label="Reload committed values">Reload</button></footer>
    {output && <details className="settings-result" open><summary>Last result</summary><pre>{output}</pre></details>}
    </fieldset>
  </section>;
}
