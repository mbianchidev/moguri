import { SettingsAction, SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useState } from "react";
import { generatedBranchName, type MoguriSdk, type Project, type ProjectSettings, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

export function ManagedWorkspacePanel({ sdk, project, settings, snapshot, disabled, openSession }: {
  sdk: MoguriSdk; project: Project; settings: ProjectSettings; snapshot: Snapshot; disabled: boolean; openSession: (id: string) => void;
}) {
  const [branch, setBranch] = useState(() => generatedBranchName(settings.repo.branchPattern, "work", crypto.randomUUID().slice(0, 8), snapshot.settings.values.git?.branchPrefix));
  const [baseRef, setBaseRef] = useState(settings.repo.mainBranch);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [output, setOutput] = useState("");
  const [removal, setRemoval] = useState<{ id: string; revision: number } | null>(null);
  const workspaces = snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === project.id);
  const removable = workspaces.filter((workspace) => workspace.status === "ready" && !snapshot.sessions.some((session) => session.workspaceId === workspace.id));
  const run = async (operation: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { const result = await operation(); if (result !== undefined) setOutput(JSON.stringify(result, null, 2)); }
    catch (error) { setError(error instanceof Error ? error.message : "Workspace work failed. Existing files/branches were preserved; inspect before retrying."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Managed worktrees"><SettingsHelp label="More about this setting" target={<h3>Isolated worktrees</h3>}>Local checkouts with service-owned identity and independent writer leases. The base folder, index, unrelated edits and branches stay untouched. Session deletion never removes a worktree.</SettingsHelp>
    <div className="project-settings-grid">
      <label className="setting-field">New branch<SettingsInput aria-label="Managed worktree branch" value={branch} disabled={disabled || busy} onChange={(event) => setBranch(event.target.value)} /></label>
      <label className="setting-field">Base ref<SettingsInput aria-label="Managed worktree base" value={baseRef} disabled={disabled || busy} onChange={(event) => setBaseRef(event.target.value)} /></label>
    </div>
    <button disabled={disabled || busy || !branch || !baseRef} onClick={() => void run(async () => {
      const created = await sdk.workspaces.create(project.id, branch, { baseRef }); const workspace = await sdk.workspaces.wait(created.id!);
      setOutput(`Created ${workspace.branch}. Open a new session below; no model was started.`);
      return undefined;
    })}>{busy ? "Working..." : "Create worktree"}</button>
    <SettingsHelp label="More about this setting" target={<button disabled={disabled || busy} onClick={() => void run(() => sdk.workspaces.discover(project.id))} aria-label="Discover Git worktrees">Discover</button>}>Discovery reads Git registration only. Unmanaged roots are not adopted, removed or granted to an agent; attach their folder explicitly as a project if needed.</SettingsHelp>

    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {!workspaces.length && <p className="fine-print">No managed checkouts yet. Ordinary project chats keep using the attached base folder.</p>}
    {removable.length > 0 && <label className="setting-field">Workspace reviewed for removal
      <select aria-label="Workspace reviewed for removal" value={removal?.id ?? ""} disabled={disabled || busy} onChange={(event) => {
        const workspace = removable.find((workspace) => workspace.id === event.target.value);
        setRemoval(workspace ? { id: workspace.id, revision: workspace.revision } : null);
      }}><option value="">No removal confirmed</option>{removable.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.branch} / {workspace.path}</option>)}</select>
      <span className="fine-print">Remove only the selected clean, idle, unbound checkout. Keep its branch. Changed revisions require a new selection.</span>
    </label>}
    {workspaces.slice().reverse().map((workspace) => {
      const bound = snapshot.sessions.filter((session) => session.workspaceId === workspace.id).length;
      return <details key={workspace.id} className="workspace-record"><summary>{workspace.branch} / {workspace.status}{bound ? ` / ${bound} session${bound === 1 ? "" : "s"}` : ""}</summary>
        <p className="fine-print path">{workspace.path}</p><p className="fine-print">Base <code>{workspace.baseCommit}</code></p>{workspace.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{workspace.diagnostic}</Alert>}
        <div className="button-row"><button disabled={disabled || busy || workspace.status !== "ready"} onClick={() => void run(async () => { const created = await sdk.sessions.create(project.id, workspace.branch, { env: "Local" }, workspace.id); openSession(created.id!); })}><Icon name="Plus" />New chat</button>
          <button disabled={disabled || busy || workspace.status === "removed"} onClick={() => void run(() => sdk.workspaces.inspect(workspace.id))}>Inspect</button>
          <button disabled={disabled || busy || workspace.status !== "partial"} onClick={() => void run(() => sdk.workspaces.reconcile(workspace.id, workspace.revision))}>Reconcile</button>
          {["creating", "removing"].includes(workspace.status) && workspace.jobId && <button onClick={() => { void sdk.jobs.cancel(workspace.jobId!).catch((error: unknown) => setError(error instanceof Error ? error.message : "Cancellation was not acknowledged.")); }}><Icon name="Stop" />Stop</button>}</div>
        {workspace.status === "ready" && <SettingsAction label={`Remove worktree ${workspace.branch}`} icon="Trash"
          disabled={disabled || busy || bound > 0 || removal?.id !== workspace.id || removal.revision !== workspace.revision}
          onClick={() => void run(async () => { await sdk.workspaces.remove(workspace.id, workspace.revision, true); await sdk.workspaces.wait(workspace.id); setRemoval(null); })} />}
      </details>;
    })}
    {output && <details className="settings-result" open><summary>Workspace response</summary><pre>{output}</pre></details>}
  </section>;
}
