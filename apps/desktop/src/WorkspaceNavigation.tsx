import { useEffect, useRef, useState, type ReactNode } from "react";
import { defaultProjectConfiguration, sessionTitle, type MoguriSdk, type Project, type Session, type Snapshot, type ProjectArtifactChoice, type ProjectArtifactPreview } from "../../../packages/sdk/src/index.ts";
import type { ArtifactMaterialization } from "../../../packages/sdk/src/index.ts";
import { ArtifactRepositoryCopy } from "./ArtifactRepositoryCopy.tsx";
import { Icon } from "./Icon.tsx";

type EditKind = "rename" | "attach" | "group" | "new-group" | "folder" | "new-folder" | "pr" | "work" | "relocate" | "delete-session" | "remove-project";
interface Edit { kind: EditKind; project?: Project; session?: Session }
export function WorkspaceNavigation({ sdk, snapshot, selectedId, archived, busy, chooseSession, chooseProject, settings, modal, allow }: {
  sdk: MoguriSdk; snapshot: Snapshot; selectedId: string | null; archived: boolean; busy: boolean;
  chooseSession: (id: string) => Promise<void>; chooseProject: (id: string | null) => void; settings: (projectId: string) => void;
  modal: (open: boolean) => void; allow: () => boolean;
}) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { modal(Boolean(edit)); return () => modal(false); }, [edit, modal]);
  const run = async (operation: () => Promise<unknown>) => { setError(""); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Workspace action failed."); } };
  const open = (value: Edit) => { if (allow()) setEdit(value); };
  const folder = (project: Project) => (snapshot.projectConfigurations.find((entry) => entry.projectId === project.id) ?? defaultProjectConfiguration(project.id));
  const move = (project: Project, delta: number) => run(async () => {
    const configuration = folder(project);
    const siblings = projects.filter((project) => folder(project).folderId === configuration.folderId);
    const index = siblings.findIndex((entry) => entry.id === project.id);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target]!, siblings[index]!];
    await sdk.projects.reorder(configuration.folderId, siblings.map((project) => ({ projectId: project.id, revision: folder(project).revision })));
  });
  const renderSession = (session: Session, project: Project | undefined, depth: number) => <div className={`session-row ${session.id === selectedId ? "selected" : ""}`} key={session.id} style={{ paddingInlineStart: `${Math.min(8, depth) * 10}px` }}>
    <button className="session-link" aria-current={selectedId === session.id ? "page" : undefined} onClick={() => void chooseSession(session.id)} title={session.title}>
      <span className={`status-dot ${session.status}`} /><span className="session-link-text"><span>{sessionTitle(session, 60, "New chat")}</span>
        {session.status === "waiting_input" && <small>Needs attention</small>}</span><SessionAttention snapshot={snapshot} session={session} />{session.pinned && <Icon name="Pin" />}{session.unread && <span className="unread-dot" title="Unread" />}{session.queue.length > 0 && <span className="queue-count">{session.queue.length}</span>}
    </button>
    <WorkspaceMenu label={`Actions for ${session.title}`}>
      <button onClick={() => open({ kind: "rename", project, session })}><Icon name="Edit" />Rename</button>
      <button onClick={() => void run(() => sdk.sessions.organize(session.id, { pinned: !session.pinned }))}><Icon name="Pin" />{session.pinned ? "Unpin" : "Pin"}</button>
      <button onClick={() => void run(() => sdk.sessions.organize(session.id, { unread: !session.unread }))}><Icon name="ReadOnly" />{session.unread ? "Mark read" : "Mark unread"}</button>
      <button disabled={!project} onClick={() => open({ kind: "group", project, session })}><Icon name="Group" />Move to group</button>
      <button disabled={Boolean(session.turnId) || session.kind === "subagent"} onClick={() => open({ kind: "attach", project, session })}><Icon name="Link" />Attach to session</button>
      {session.parentSessionId && <button disabled={Boolean(session.turnId) || session.kind === "subagent"} onClick={() => void run(() => sdk.sessions.organize(session.id, { parentSessionId: null }))}><Icon name="Back" />Detach</button>}
      <button disabled={session.mode !== "agent" || session.kind !== "agent"} onClick={() => void run(async () => { const result = await sdk.sessions.spawn(session.id, "agent"); await chooseSession(result.id!); })}><Icon name="Plus" />Subsession</button>
      <button onClick={() => void run(() => sdk.command({ type: session.status === "archived" ? "session.restore" : "session.archive", sessionId: session.id }))}><Icon name="Down" />{session.status === "archived" ? "Unarchive" : "Archive"}</button>
      <button className="danger" onClick={() => open({ kind: "delete-session", project, session })}><Icon name="Trash" />Delete</button>
    </WorkspaceMenu>
  </div>;
  const renderProject = (project: Project) => {
    const configuration = folder(project);
    const sessions = snapshot.sessions.filter((session) => session.projectId === project.id && (session.status === "archived") === archived);
    const visible = new Set(sessions.map((session) => session.id));
    const tree = (parent: string | null, group: string | null, depth = 0): ReactNode => sessions.filter((session) =>
      (session.parentSessionId && visible.has(session.parentSessionId) ? session.parentSessionId : null) === parent && (parent !== null || session.groupId === group))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt.localeCompare(b.createdAt)).map((session) => <div key={session.id}>{renderSession(session, project, depth)}{tree(session.id, group, depth + 1)}</div>);
    return <section className="project-group" key={project.id}><header className="project-row">
      <button className="project-name" title={`Project settings: ${project.path}`} onClick={() => settings(project.id)}><span className="project-color" style={{ color: configuration.color }}><Icon name="Files" /></span><span className="project-label">{project.name}</span></button>
      <WorkspaceMenu label={`Project actions for ${project.name}`}>
        <button onClick={() => void run(async () => { const result = await sdk.command({ type: "session.create", projectId: project.id }); await chooseSession(result.id!); })}><Icon name="Plus" />New chat</button>
        <button onClick={() => open({ kind: "work", project })}><Icon name="Plan" />From work item</button>
        <button onClick={() => open({ kind: "pr", project })}><Icon name="PR" />From PR</button>
        <button onClick={() => settings(project.id)}><Icon name="Settings" />Settings</button>
        <button onClick={() => void run(async () => { const info = await sdk.projects.git(project.id, false); if (!info.repository) throw new Error("This attached folder has no supported GitHub upstream."); await window.moguri.openExternal(info.repository); })}><Icon name="PR" />Open in GitHub</button>
        <button onClick={() => open({ kind: "new-group", project })}><Icon name="Group" />New session group</button>
        <button onClick={() => open({ kind: "folder", project })}><Icon name="Files" />Move to folder</button>
        <button onClick={() => open({ kind: "new-folder", project })}><Icon name="Plus" />New folder</button>
        <button onClick={() => void move(project, -1)}><Icon name="Up" />Move up</button>
        <button onClick={() => void move(project, 1)}><Icon name="Down" />Move down</button>
        <button onClick={() => open({ kind: "relocate", project })}><Icon name="Link" />Change attached folder</button>
        <button className="danger" onClick={() => open({ kind: "remove-project", project })}><Icon name="Trash" />Remove</button>
      </WorkspaceMenu></header>
      {tree(null, null)}
      {snapshot.sessionGroups.filter((group) => group.projectId === project.id).sort((a, b) => a.order - b.order).map((group) => <div className="session-group" key={group.id}><h3>{group.name}</h3>{tree(null, group.id)}</div>)}
    </section>;
  };
  const projects = [...snapshot.projects].sort((a, b) => folder(a).order - folder(b).order || a.name.localeCompare(b.name));
  const general = snapshot.sessions.filter((session) => session.projectId === null && (session.status === "archived") === archived);
  const generalIds = new Set(general.map((session) => session.id));
  const generalTree = (parent: string | null, depth = 0): ReactNode => general.filter((session) => (session.parentSessionId && generalIds.has(session.parentSessionId) ? session.parentSessionId : null) === parent).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt.localeCompare(b.createdAt)).map((session) => <div key={session.id}>{renderSession(session, undefined, depth)}{depth < 8 && generalTree(session.id, depth + 1)}</div>);
  return <><div className="project-list" aria-busy={busy}>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <section className="project-group general-chats" aria-label="Chats"><header className="project-row"><button className="project-name" onClick={() => chooseProject(null)}><Icon name="Side chat" /><span className="project-label">Chats</span></button></header>{generalTree(null)}</section>
    {projects.filter((project) => !folder(project).folderId).map(renderProject)}
    {snapshot.projectFolders.slice().sort((a, b) => a.order - b.order).map((group) => <details className="project-folder" key={group.id} open><summary><Icon name="Files" />{group.name}</summary>{projects.filter((project) => folder(project).folderId === group.id).map(renderProject)}</details>)}
    {!projects.length && <p className="nav-empty">Use Start for a chat, a local folder or a repository.</p>}
    {archived && !snapshot.sessions.some((session) => session.status === "archived") && <p className="nav-empty">No archived sessions.</p>}
  </div>{edit && <NavigationDialog key={`${edit.kind}-${edit.session?.id ?? edit.project?.id}`} edit={edit} sdk={sdk} snapshot={snapshot} close={() => setEdit(null)} chooseSession={chooseSession} />}</>;
}
function SessionAttention({ snapshot, session }: { snapshot: Snapshot; session: Session }) {
  const entry = snapshot.attention.findLast((entry) => entry.sessionId === session.id && entry.active);
  if (!entry || !snapshot.settings.values.notifications.inApp) return null;
  const label = entry.kind === "question" ? entry.source === "heuristic" ? "Possible question" : "Question" : entry.kind === "done" ? "Agent done and waiting" : entry.reason === "approval" ? "Approval needed" : "Attention needed";
  return <span className={`session-attention ${entry.acknowledged ? "read" : "unread"}`} title={label} aria-label={label}><Icon name={entry.kind === "question" ? "Question" : entry.kind === "done" ? "Waiting" : "Attention"} />{!entry.acknowledged && <span className="attention-unread-dot" />}</span>;
}
function WorkspaceMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current) ref.current.open = false; };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={ref} className="workspace-menu" onToggle={() => {
    const details = ref.current; const panel = details?.querySelector<HTMLDivElement>(":scope > div");
    if (!details?.open || !panel) return;
    const anchor = details.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, anchor.right + 4))}px`;
    panel.style.top = `${Math.max(50, Math.min(window.innerHeight - panel.getBoundingClientRect().height - 10, anchor.top))}px`;
  }} onClick={(event) => { if (event.target instanceof Element && event.target.closest("button") && ref.current) ref.current.open = false; }}>
    <summary aria-label={label} title={label}><Icon name="More" /></summary><div>{children}</div>
  </details>;
}
function NavigationDialog({ edit, sdk, snapshot, close, chooseSession }: { edit: Edit; sdk: MoguriSdk; snapshot: Snapshot; close: () => void; chooseSession: (id: string) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(edit.kind === "rename" ? edit.session!.title : edit.kind === "relocate" ? edit.project!.path : "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<ProjectArtifactPreview | null>(null), [artifactAction, setArtifactAction] = useState<ProjectArtifactChoice["action"] | "">(""), [exportedDigest, setExportedDigest] = useState("");
  const [materialized, setMaterialized] = useState<ArtifactMaterialization | null>(null);
  const [previewLoading, setPreviewLoading] = useState(edit.kind === "remove-project");
  const loadArtifacts = async () => {
    if (edit.kind !== "remove-project" || !edit.project) return;
    setPreviewLoading(true); setError(""); setArtifactAction(""); setExportedDigest(""); setMaterialized(null);
    try { setArtifactPreview((await sdk.artifacts.projectPreview(edit.project.id)).preview); }
    catch (error) { setError(error instanceof Error ? error.message : "Artifact impact could not be loaded. Nothing was removed."); }
    finally { setPreviewLoading(false); }
  };
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { void loadArtifacts(); }, []);
  const destructive = edit.kind === "delete-session" || edit.kind === "remove-project";
  const currentArtifacts = snapshot.artifacts.filter((artifact) => artifact.projectId === edit.project?.id);
  const staleArtifacts = edit.kind === "remove-project" && (!artifactPreview || currentArtifacts.length !== artifactPreview.artifacts.length || currentArtifacts.some((artifact) => !artifactPreview.artifacts.some((entry) => entry.id === artifact.id && entry.revision === artifact.revision)));
  const artifactChoiceMissing = edit.kind === "remove-project" && Boolean(artifactPreview?.artifacts.length) && (!artifactAction || artifactAction === "export" && !exportedDigest || artifactAction === "materialize" && (!materialized || materialized.setDigest !== artifactPreview?.digest));
  const titles: Record<EditKind, string> = { rename: "Rename", attach: "Attach session", group: "Session group", "new-group": "New session group", folder: "Project folder", "new-folder": "New project folder", pr: "Session from PR", work: "Session from work item", relocate: "Change attached folder", "delete-session": "Delete session", "remove-project": "Remove project" };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const configuration = edit.project ? (await sdk.projects.configuration(edit.project.id)).configuration : null;
      const requiredProject = () => { if (!edit.project) throw new Error("This action needs a selected project."); return edit.project; };
      switch (edit.kind) {
        case "rename": await sdk.sessions.rename(edit.session!.id, value); break;
        case "attach": await sdk.sessions.organize(edit.session!.id, { parentSessionId: value || null }); break;
        case "group": await sdk.sessions.organize(edit.session!.id, { groupId: value || null }); break;
        case "new-group": await sdk.sessions.group(requiredProject().id, value); break;
        case "new-folder": await sdk.projects.folder(value); break;
        case "folder": if (!configuration) throw new Error("Project configuration is required."); await sdk.projects.organize(requiredProject().id, { folderId: value || null, color: configuration.color, order: configuration.order }, configuration.revision); break;
        case "relocate": if (!configuration) throw new Error("Project configuration is required."); await sdk.projects.relocate(requiredProject().id, value, configuration.revision); break;
        case "delete-session": if (!confirmed) throw new Error("Confirm deletion first."); await sdk.sessions.delete(edit.session!.id, true); break;
        case "remove-project": {
          if (!confirmed || !configuration || !artifactPreview || staleArtifacts || artifactChoiceMissing) throw new Error("Review the current artifact set and confirm its disposition before removal.");
          const choice = artifactPreview.artifacts.length && artifactAction ? { action: artifactAction, expectedDigest: artifactPreview.digest, ...(exportedDigest ? { exportedDigest } : {}), ...(materialized ? { materializationId: materialized.jobId } : {}) } : undefined;
          await sdk.projects.remove(requiredProject().id, true, configuration.revision, choice); break;
        }
        case "pr": { const result = await sdk.sessions.fromWork(requiredProject().id, { prUrl: value }); await chooseSession(result.id!); break; }
        case "work": { const result = await sdk.sessions.fromWork(requiredProject().id, { issueId: value }); await chooseSession(result.id!); break; }
      }
      close();
    } catch (error) { setError(error instanceof Error ? error.message : "The action failed; no success was recorded."); }
    finally { setBusy(false); }
  };
  const choices = edit.kind === "attach" ? snapshot.sessions.filter((session) => session.projectId === (edit.session?.projectId ?? edit.project?.id ?? null) && session.id !== edit.session?.id).map((session) => ({ id: session.id, name: session.title })) :
    edit.kind === "group" ? snapshot.sessionGroups.filter((group) => group.projectId === edit.project?.id) :
    edit.kind === "folder" ? snapshot.projectFolders :
    edit.kind === "work" ? snapshot.issues.filter((issue) => issue.projectId === edit.project?.id && !issue.archived).map((issue) => ({ id: issue.id, name: `#${issue.number} ${issue.title}` })) : null;
  return <dialog ref={ref} className="workspace-dialog" onClose={close} aria-label={titles[edit.kind]}><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><h2>{titles[edit.kind]}</h2><button className="icon-button" type="button" aria-label="Cancel dialog" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    {destructive ? <><p>{edit.kind === "delete-session" ? "Stops owned work and removes the conversation, drafts and queues. Connected PRs remain open and retained project artifacts survive. Linked children are detached, not deleted." : "Stops this project's owned work and removes its Moguri records and indexes. Choose what happens to independent artifacts. Repository files, external PRs, shared package/model stores and diagnostic audit logs are not deleted. Retained worktrees must be removed separately."}</p>
      {edit.kind === "remove-project" && <section aria-label="Artifact removal impact">{previewLoading ? <p role="status">Loading artifact impact...</p> : artifactPreview && <><p>{artifactPreview.artifacts.length} independent document{artifactPreview.artifacts.length === 1 ? "" : "s"}, including archived copies.</p>
        {artifactPreview.artifacts.length > 0 && <><ul>{artifactPreview.artifacts.map((artifact) => <li key={artifact.id}>{artifact.name} / {artifact.kind} / revision {artifact.revision}</li>)}</ul>
          <label className="setting-field">Artifact disposition<select aria-label="Artifact disposition" value={artifactAction} disabled={busy || staleArtifacts} onChange={(event) => { const value = event.target.value; if (value === "" || value === "retain" || value === "delete" || value === "export" || value === "materialize") { setArtifactAction(value); setExportedDigest(""); setMaterialized(null); } }}>
            <option value="">Choose explicitly</option><option value="retain">Keep as profile documents</option><option value="export">Export to a new file, then delete stored copies</option><option value="materialize">Copy into repository artifacts/, then delete stored copies</option><option value="delete">Delete retained artifact copies</option></select></label>
          {artifactAction === "export" && <><button type="button" disabled={busy || staleArtifacts} onClick={() => { void (async () => {
            setBusy(true); setError("");
            try {
              const value = await sdk.artifacts.projectExport(edit.project!.id);
              if (value.preview.digest !== artifactPreview.digest) throw new Error("The artifact set changed. Reload and review before exporting.");
              const saved = await window.moguri.saveDocument(value.export);
              if (saved) setExportedDigest(saved.digest);
            } catch (error) { setError(error instanceof Error ? error.message : "Export was not saved; project copies remain intact."); }
            finally { setBusy(false); }
          })(); }}>Save reviewed export</button><p className="fine-print">{exportedDigest ? "Exact export saved. Deletion still requires your explicit confirmation below." : "Save the exact export to a new file before deleting stored copies."}</p></>}
          {artifactAction === "materialize" && <ArtifactRepositoryCopy sdk={sdk} snapshot={snapshot} projectId={edit.project!.id} expectedSetDigest={artifactPreview.digest} allowWorkspaces={false} onSaved={setMaterialized} onBusy={setBusy} />}
        </>}
        {staleArtifacts && <p className="settings-warning">The artifact set changed. Reload its impact before choosing.</p>}
      </>}<button type="button" disabled={busy || previewLoading} onClick={() => void loadArtifacts()}>Reload artifact preview</button></section>}
      <label className="check-setting"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand and confirm this removal.</label></> :
      choices ? <label className="setting-field">Destination<select aria-label="Destination" value={value} onChange={(event) => setValue(event.target.value)}><option value="">{edit.kind === "work" ? "Choose work item" : "None"}</option>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> :
        <label className="setting-field">{edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"}<input aria-label={edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"} autoFocus value={value} onChange={(event) => setValue(event.target.value)} required /></label>}
    {edit.kind === "pr" && <p className="fine-print">Binds PR context without changing this folder's checkout or starting work.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button className={destructive ? "danger" : "primary"} disabled={busy || previewLoading || staleArtifacts || artifactChoiceMissing || destructive && !confirmed || !destructive && !["attach", "group", "folder"].includes(edit.kind) && !value.trim()} type="submit">{busy ? "Working..." : destructive ? "Delete" : "Save"}</button></footer>
  </form></dialog>;
}
