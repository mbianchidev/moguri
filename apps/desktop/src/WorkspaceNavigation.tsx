import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClientError, compareSessions, defaultProjectConfiguration, sessionIndicator, sessionOrderScope, sessionTitle, type MoguriSdk, type Project, type Session, type Snapshot, type ProjectArtifactChoice, type ProjectArtifactPreview } from "../../../packages/sdk/src/index.ts";
import type { ArtifactMaterialization } from "../../../packages/sdk/src/index.ts";
import { ArtifactRepositoryCopy } from "./ArtifactRepositoryCopy.tsx";
import { Icon } from "./Icon.tsx";
import { useSessionActions } from "./SessionActions.tsx";
import { SESSION_DRAG_TYPE } from "./ContextAttachments.tsx";
import { GitHubItemPicker, type GithubSelection } from "./GitHubPickers.tsx";
const RichMessage = lazy(() => import("./RichMessage.tsx"));

type EditKind = "rename" | "attach" | "group" | "new-group" | "folder" | "new-folder" | "pr" | "work" | "relocate" | "remove-project";
interface Edit { kind: EditKind; project?: Project; session?: Session }
const SESSION_DRAG = SESSION_DRAG_TYPE;
type SessionPosition = { id: string; scope: string; order: number };
const position = (session: Session): SessionPosition => ({ id: session.id, scope: sessionOrderScope(session), order: session.order ?? 0 });
function samePositions(expected: SessionPosition[], sessions: Session[]): boolean {
  const actual = new Map(sessions.map((session) => [session.id, position(session)]));
  return expected.length === actual.size && expected.every((entry) => {
    const value = actual.get(entry.id);
    return value?.scope === entry.scope && value.order === entry.order;
  });
}
const dropEdge = (element: HTMLElement, y: number): "before" | "after" => {
  const bounds = element.getBoundingClientRect(), ratio = (y - bounds.top) / bounds.height;
  return ratio < 0.5 ? "before" : "after";
};
export function WorkspaceNavigation({ sdk, snapshot, selectedId, archived, busy, chooseSession, chooseProject, settings, terminal, modal, allow, prepareSession }: {
  sdk: MoguriSdk; snapshot: Snapshot; selectedId: string | null; archived: boolean; busy: boolean;
  chooseSession: (id: string) => Promise<void>; chooseProject: (id: string | null) => void; settings: (projectId: string) => void;
  modal: (open: boolean) => void; allow: () => boolean; terminal?: (projectId: string) => void;
  prepareSession?: (id: string) => Promise<void>;
}) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; anchor: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<{ id: string; edge: "before" | "after" | "detach" } | null>(null);
  const dragging = useRef<{ source: SessionPosition; siblings: SessionPosition[]; profileId: string } | null>(null);
  const [ordering, setOrdering] = useState(false), orderPending = useRef(false);
  const actions = useSessionActions(sdk, snapshot, { prepare: prepareSession });
  useEffect(() => { if (menu && !snapshot.sessions.some((session) => session.id === menu.id)) setMenu(null); }, [menu, snapshot.sessions]);
  useEffect(() => { modal(Boolean(edit || menu || actions.reviewing || actions.busy)); return () => modal(false); }, [edit, menu, actions.reviewing, actions.busy, modal]);
  const run = async (operation: () => Promise<unknown>) => { setError(""); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Workspace action failed."); } };
  const open = (value: Edit) => { if (allow()) setEdit(value); };
  const folder = (project: Project) => (snapshot.projectConfigurations.find((entry) => entry.projectId === project.id) ?? defaultProjectConfiguration(project.id));
  const closeMenu = (restore = true) => {
    const anchor = menu?.anchor; setMenu(null);
    if (restore) queueMicrotask(() => { if (anchor?.isConnected) anchor.focus(); });
  };
  const openMenu = (session: Session, anchor: HTMLElement, x: number, y: number) => {
    if (allow()) { anchor.focus(); setMenu({ id: session.id, x, y, anchor }); }
  };
  const siblings = (session: Session, sessions = snapshot.sessions) => sessions.filter((entry) => entry.projectId === session.projectId &&
    (entry.parentSessionId ?? null) === (session.parentSessionId ?? null) && (session.parentSessionId || entry.groupId === session.groupId) &&
    (entry.status === "archived") === archived).sort(compareSessions);
  const saveOrder = async (session: Session, ordered: Session[]) => {
    if (orderPending.current) throw new Error("Wait for the current session order to settle before moving another session.");
    const expected = ordered.map(position), ids = ordered.map((entry) => entry.id);
    orderPending.current = true; setOrdering(true);
    try {
      for (let attempt = 0; ; attempt++) {
        const state = sdk.getState(), current = state.snapshot?.sessions.find((entry) => entry.id === session.id);
        if (state.status !== "connected" || !state.snapshot || !current) throw new Error("Connect to the original profile before reordering. No session was moved.");
        const currentSiblings = siblings(current, state.snapshot.sessions);
        if (!samePositions(expected, currentSiblings)) throw new Error("The session list changed its order, membership, pin or hierarchy. Start the move again; no newer arrangement was overwritten.");
        const revisions = new Map(currentSiblings.map((entry) => [entry.id, entry.revision]));
        try {
          return await sdk.sessions.reorder(current.projectId, current.parentSessionId ?? null, current.parentSessionId ? null : current.groupId,
            archived, ids.map((sessionId) => ({ sessionId, revision: revisions.get(sessionId)! })));
        } catch (error) {
          if (attempt > 0 || !(error instanceof ClientError) || error.code !== "revision_conflict") throw error;
          await sdk.refresh();
        }
      }
    } finally { orderPending.current = false; setOrdering(false); }
  };
  const moveSession = (session: Session, delta: number) => run(async () => {
    const ordered = siblings(session), index = ordered.findIndex((entry) => entry.id === session.id), target = index + delta;
    if (target < 0 || target >= ordered.length || ordered[target]!.pinned !== session.pinned) throw new Error("This session is already at the edge of its pinned or unpinned siblings.");
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!]; await saveOrder(session, ordered);
  });
  const sourceFor = (event: DragEvent) => {
    const source = dragging.current;
    if (!source || !event.dataTransfer.types.includes(SESSION_DRAG)) return null;
    if (source.profileId !== sdk.profileId) throw new Error("The original drag belongs to another profile. No session was moved.");
    const state = sdk.getState().snapshot, session = state?.sessions.find((entry) => entry.id === source.source.id);
    if (!state || !session || !samePositions(source.siblings, siblings(session, state.sessions))) throw new Error("The dragged session list changed its order, membership, pin or hierarchy. Start the drag again; no workspace or session was adopted.");
    return session;
  };
  const detach = (event: DragEvent, projectId: string | null, groupId: string | null = null) => {
    if (!dragging.current) return;
    event.preventDefault(); event.stopPropagation(); setDrop(null);
    void run(async () => {
      if (!allow()) return;
      const session = sourceFor(event); if (!session) return;
      if (session.projectId !== projectId) throw new Error("Drag only within this session's project. Its workspace and Env were not changed.");
      if (session.parentSessionId) actions.request(session, "detach", groupId);
      else await sdk.sessions.organize(session.id, { groupId }, session.revision);
    });
  };
  const dragHeader = (event: DragEvent, projectId: string | null) => {
    const drag = dragging.current;
    if (!drag) return;
    setDrop(null);
    const source = snapshot.sessions.find((entry) => entry.id === drag.source.id);
    if (!source || source.projectId !== projectId || source.turnId || source.kind === "subagent" || !samePositions(drag.siblings, siblings(source))) {
      event.dataTransfer.dropEffect = "none"; return;
    }
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
  };
  const dropSession = (event: DragEvent<HTMLDivElement>, target: Session) => {
    if (!dragging.current) return;
    event.preventDefault(); event.stopPropagation();
    const edge = dropEdge(event.currentTarget, event.clientY); setDrop(null);
    void run(async () => {
      if (!allow()) return;
      const source = sourceFor(event); if (!source) return;
      if (source.id === target.id) throw new Error("Drop onto a different session, or onto its project header to detach.");
      if (source.projectId !== target.projectId) throw new Error("Sessions can only be detached or ordered within their existing project.");
      const state = sdk.getState().snapshot, currentTarget = state?.sessions.find((entry) => entry.id === target.id);
      if (!state || !currentTarget || !samePositions([position(target)], [currentTarget])) throw new Error("The drop target changed its order or hierarchy. Start the drag again.");
      const ordered = siblings(currentTarget, state.sessions);
      if (!ordered.some((entry) => entry.id === source.id)) {
        if (source.parentSessionId && !currentTarget.parentSessionId) { actions.request(source, "detach", currentTarget.groupId); return; }
        throw new Error("Reorder sibling sessions, or drag a child to a root row or header to detach it. Use the context menu to attach sessions.");
      }
      if (source.pinned !== target.pinned) throw new Error("Pinned chats stay above unpinned chats. Change Pin in the context menu before moving between those groups.");
      const next = ordered.filter((entry) => entry.id !== source.id), index = next.findIndex((entry) => entry.id === target.id);
      next.splice(index + (edge === "after" ? 1 : 0), 0, source); await saveOrder(currentTarget, next);
    });
  };
  const move = (project: Project, delta: number) => run(async () => {
    const configuration = folder(project);
    const siblings = projects.filter((project) => folder(project).folderId === configuration.folderId);
    const index = siblings.findIndex((entry) => entry.id === project.id);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target]!, siblings[index]!];
    await sdk.projects.reorder(configuration.folderId, siblings.map((project) => ({ projectId: project.id, revision: folder(project).revision })));
  });
  const renderSession = (session: Session, depth: number) => {
    const indicator = sessionIndicator(session, snapshot);
    const unread = unreadSession(session, snapshot);
    return <div className={`session-row ${session.id === selectedId ? "selected" : ""} ${drop?.id === session.id ? `drop-${drop.edge}` : ""}`} key={session.id} style={{ paddingInlineStart: `${Math.min(8, depth) * 10}px` }}
    draggable={!actions.busy && !ordering} onDragStart={(event) => {
      if (!allow() || orderPending.current) { event.preventDefault(); return; }
      dragging.current = { source: position(session), siblings: siblings(session).map(position), profileId: sdk.profileId };
      event.dataTransfer.setData(SESSION_DRAG, JSON.stringify({ profileId: sdk.profileId, sessionId: session.id })); event.dataTransfer.effectAllowed = "copyMove"; setMenu(null);
    }} onDragEnd={() => { dragging.current = null; setDrop(null); }}
    onDragOver={(event) => {
      if (!dragging.current) return;
      const source = snapshot.sessions.find((entry) => entry.id === dragging.current?.source.id);
      const detaching = source?.parentSessionId && !session.parentSessionId && !source.turnId && source.kind !== "subagent";
      const edge = detaching ? "detach" : dropEdge(event.currentTarget, event.clientY);
      const valid = source && source.id !== session.id && source.projectId === session.projectId && samePositions(dragging.current.siblings, siblings(source)) &&
        (detaching || dragging.current.siblings.some((entry) => entry.id === session.id) && source.pinned === session.pinned);
      if (!valid) { event.stopPropagation(); event.dataTransfer.dropEffect = "none"; setDrop(null); return; }
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
      setDrop({ id: session.id, edge });
    }} onDragLeave={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop((value) => value?.id === session.id ? null : value);
    }} onDrop={(event) => dropSession(event, session)}
    onContextMenu={(event) => { event.preventDefault(); const anchor = event.currentTarget.querySelector<HTMLButtonElement>(".session-link")!; openMenu(session, anchor, event.clientX, event.clientY); }}>
    <button className="session-link" data-session-id={session.id} data-unread={unread ? "true" : undefined} aria-label={session.title} aria-description={`${unread ? "Unread. " : ""}${indicator.label}. Double-click to rename. Right-click or Shift+F10 for actions. Drag or Alt+Up/Down to reorder siblings; drag a child to a root row or header to detach.`}
      aria-haspopup="menu" aria-expanded={menu?.id === session.id} aria-current={selectedId === session.id ? "page" : undefined} onClick={() => void chooseSession(session.id)} title={session.title}
      onDoubleClick={(event) => { event.preventDefault(); open({ kind: "rename", session }); }}
      onKeyDown={(event) => {
        if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); void moveSession(session, event.key === "ArrowUp" ? -1 : 1); return; }
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu(session, event.currentTarget, bounds.right, bounds.top);
      }}>
      <span className="status-dot session-status-dot" data-session-state={indicator.kind} title={indicator.label} aria-hidden="true" /><span className="session-link-text"><span>{sessionTitle(session, 60, "New chat")}</span>
        {session.status === "waiting_input" && <small title="Needs attention">Needs attention</small>}</span><SessionIndicators indicator={indicator} />{session.pinned && <Icon name="Pin" />}{session.queue.length > 0 && <span className="queue-count">{session.queue.length}</span>}
    </button>
  </div>;
  };
  const renderProject = (project: Project) => {
    const configuration = folder(project);
    const sessions = snapshot.sessions.filter((session) => session.projectId === project.id && (session.status === "archived") === archived);
    const visible = new Set(sessions.map((session) => session.id));
    const tree = (parent: string | null, group: string | null, depth = 0): ReactNode => sessions.filter((session) =>
      (session.parentSessionId && visible.has(session.parentSessionId) ? session.parentSessionId : null) === parent && (parent !== null || session.groupId === group))
      .sort(compareSessions).map((session) => <div key={session.id}>{renderSession(session, depth)}{tree(session.id, group, depth + 1)}</div>);
    return <section className="project-group" key={project.id} aria-label={`Project ${project.name}`} onDragOver={(event) => dragHeader(event, project.id)} onDrop={(event) => detach(event, project.id)}><header className="project-row">
      <button className="project-name" title={`Project settings: ${project.path}`} onClick={() => settings(project.id)}><span className="project-color" style={{ color: configuration.color }}><Icon name="Files" /></span><span className="project-label">{project.name}</span></button>
      <WorkspaceMenu label={`Project actions for ${project.name}`}>
        <button onClick={() => void run(async () => { const result = await sdk.command({ type: "session.create", projectId: project.id }); await chooseSession(result.id!); })}><Icon name="Plus" />New chat</button>
        <button onClick={() => open({ kind: "work", project })}><Icon name="Plan" />From work item</button>
        <button onClick={() => open({ kind: "pr", project })}><Icon name="PR" />From PR</button>
        <button onClick={() => settings(project.id)}><Icon name="Settings" />Settings</button>
        {terminal && <button onClick={() => terminal(project.id)}><Icon name="Terminal" />Open project terminal</button>}
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
      {snapshot.sessionGroups.filter((group) => group.projectId === project.id).sort((a, b) => a.order - b.order).map((group) => <div className="session-group" key={group.id} onDragOver={(event) => dragHeader(event, project.id)} onDrop={(event) => detach(event, project.id, group.id)}><h3>{group.name}</h3>{tree(null, group.id)}</div>)}
    </section>;
  };
  const projects = [...snapshot.projects].sort((a, b) => folder(a).order - folder(b).order || a.name.localeCompare(b.name));
  const general = snapshot.sessions.filter((session) => session.projectId === null && (session.status === "archived") === archived);
  const generalIds = new Set(general.map((session) => session.id));
  const generalTree = (parent: string | null, depth = 0): ReactNode => general.filter((session) => (session.parentSessionId && generalIds.has(session.parentSessionId) ? session.parentSessionId : null) === parent).sort(compareSessions).map((session) => <div key={session.id}>{renderSession(session, depth)}{depth < 8 && generalTree(session.id, depth + 1)}</div>);
  const menuSession = snapshot.sessions.find((session) => session.id === menu?.id), menuProject = snapshot.projects.find((project) => project.id === menuSession?.projectId);
  const menuUnread = menuSession ? unreadSession(menuSession, snapshot) : false;
  return <><div className="project-list" aria-busy={busy || actions.busy || ordering}>
    {(error || actions.error) && <p className="inline-error" role="alert">{error || actions.error}</p>}
    <section className="project-group general-chats" aria-label="Chats" onDragOver={(event) => dragHeader(event, null)} onDrop={(event) => detach(event, null)}><header className="project-row"><button className="project-name" onClick={() => chooseProject(null)}><Icon name="Side chat" /><span className="project-label">Chats</span></button></header>{generalTree(null)}</section>
    {projects.filter((project) => !folder(project).folderId).map(renderProject)}
    {snapshot.projectFolders.slice().sort((a, b) => a.order - b.order).map((group) => <details className="project-folder" key={group.id} open><summary><Icon name="Files" />{group.name}</summary>{projects.filter((project) => folder(project).folderId === group.id).map(renderProject)}</details>)}
    {!projects.length && <p className="nav-empty">Use New for a chat, a local folder or a repository.</p>}
    {archived && !snapshot.sessions.some((session) => session.status === "archived") && <p className="nav-empty">No archived sessions.</p>}
  </div>
  {menu && menuSession && <SessionContextMenu label={`Actions for ${menuSession.title}`} point={menu} close={closeMenu}>
    <button role="menuitem" onClick={() => open({ kind: "rename", project: menuProject, session: menuSession })}><Icon name="Edit" />Rename</button>
    <button role="menuitem" onClick={() => void run(() => sdk.sessions.organize(menuSession.id, { pinned: !menuSession.pinned }))}><Icon name={menuSession.pinned ? "PinOff" : "Pin"} />{menuSession.pinned ? "Unpin" : "Pin"}</button>
    <button role="menuitem" onClick={() => void run(async () => {
      const ids = menuUnread ? sdk.getState().snapshot?.attention.filter((entry) => entry.sessionId === menuSession.id && !entry.acknowledged).map((entry) => entry.id) ?? [] : [];
      await sdk.sessions.organize(menuSession.id, { unread: !menuUnread });
      if (ids.length) await sdk.attention.acknowledge(ids.slice(-100));
    })}><Icon name="ReadOnly" />{menuUnread ? "Mark read" : "Mark unread"}</button>
    <button role="menuitem" onClick={() => void moveSession(menuSession, -1)}><Icon name="Up" />Move up</button>
    <button role="menuitem" onClick={() => void moveSession(menuSession, 1)}><Icon name="Down" />Move down</button>
    <button role="menuitem" disabled={!menuProject} onClick={() => open({ kind: "group", project: menuProject, session: menuSession })}><Icon name="Group" />Move to group</button>
    <button role="menuitem" disabled={Boolean(menuSession.turnId) || menuSession.kind === "subagent"} onClick={() => open({ kind: "attach", project: menuProject, session: menuSession })}><Icon name="Link" />Attach to session</button>
    {menuSession.parentSessionId && <button role="menuitem" disabled={Boolean(menuSession.turnId) || menuSession.kind === "subagent"} onClick={() => actions.request(menuSession, "detach")}><Icon name="Back" />Detach</button>}
    <button role="menuitem" disabled={menuSession.mode !== "agent" || menuSession.kind !== "agent"} onClick={() => void run(async () => { const result = await sdk.sessions.spawn(menuSession.id, "agent"); await chooseSession(result.id!); })}><Icon name="Plus" />Subsession</button>
    <button role="menuitem" onClick={() => menuSession.status === "archived" ? void run(() => sdk.command({ type: "session.restore", sessionId: menuSession.id })) : actions.request(menuSession, "archive")}><Icon name="Down" />{menuSession.status === "archived" ? "Unarchive" : "Archive"}</button>
    <button role="menuitem" className="danger" onClick={() => actions.request(menuSession, "delete")}><Icon name="Trash" />Delete</button>
  </SessionContextMenu>}
  {actions.dialog}
  {edit && <NavigationDialog key={`${edit.kind}-${edit.session?.id ?? edit.project?.id}`} edit={edit} sdk={sdk} snapshot={snapshot} close={() => setEdit(null)} chooseSession={chooseSession}
    detach={(session) => { setEdit(null); actions.request(session, "detach"); }} />}</>;
}
function SessionContextMenu({ label, point, close, children }: { label: string; point: { x: number; y: number }; close: (restore?: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, point.x))}px`;
    element.style.top = `${Math.max(48, Math.min(window.innerHeight - bounds.height - 8, point.y))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) close(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [close]);
  return createPortal(<div ref={ref} className="session-context-menu" role="menu" aria-label={label} style={{ left: point.x, top: point.y }}
    onClick={(event) => { if (event.target instanceof Element && event.target.closest("button")) close(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key === "Tab") { close(false); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []), index = buttons.findIndex((button) => button === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>{children}</div>, document.body);
}
function unreadSession(session: Session, snapshot: Snapshot): boolean {
  const entry = snapshot.attention.findLast((entry) => entry.sessionId === session.id && entry.active);
  return session.unread || Boolean(snapshot.settings.values.notifications.inApp && entry && !entry.acknowledged);
}
function SessionIndicators({ indicator }: { indicator: ReturnType<typeof sessionIndicator> }) {
  const names: Partial<Record<typeof indicator.kind, string>> = {
    running: "Progress", question: "Question", approval: "Waiting", completed: "Check", merged: "PRMerged",
    failed: "Issue", partial: "Issue", stopped: "Waiting", queued: "Clock",
  };
  const name = names[indicator.kind];
  return <span className="session-indicators">
    {name && <span className="session-mark" data-session-state={indicator.kind} role="img" aria-label={indicator.label} title={indicator.label}><Icon name={name} /></span>}
    {indicator.kind === "completed" && indicator.prUrl && <span className="session-pr-icon" data-pr-state={indicator.prState} role="img" aria-label={indicator.prLabel} title={indicator.prLabel}><Icon name="PR" /></span>}
  </span>;
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
function NavigationDialog({ edit, sdk, snapshot, close, chooseSession, detach }: { edit: Edit; sdk: MoguriSdk; snapshot: Snapshot; close: () => void; chooseSession: (id: string) => Promise<void>; detach: (session: Session) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(edit.kind === "rename" ? edit.session!.title : edit.kind === "relocate" ? edit.project!.path : edit.kind === "attach" ? edit.session!.parentSessionId ?? "" : "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [github, setGithub] = useState<GithubSelection | null>(null);
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
  useEffect(() => {
    ref.current?.showModal();
    if (edit.kind === "rename") { nameInput.current?.focus(); nameInput.current?.select(); }
  }, []);
  useEffect(() => { void loadArtifacts(); }, []);
  const destructive = edit.kind === "remove-project";
  const currentArtifacts = snapshot.artifacts.filter((artifact) => artifact.projectId === edit.project?.id);
  const staleArtifacts = edit.kind === "remove-project" && (!artifactPreview || currentArtifacts.length !== artifactPreview.artifacts.length || currentArtifacts.some((artifact) => !artifactPreview.artifacts.some((entry) => entry.id === artifact.id && entry.revision === artifact.revision)));
  const artifactChoiceMissing = edit.kind === "remove-project" && Boolean(artifactPreview?.artifacts.length) && (!artifactAction || artifactAction === "export" && !exportedDigest || artifactAction === "materialize" && (!materialized || materialized.setDigest !== artifactPreview?.digest));
  const titles: Record<EditKind, string> = { rename: "Rename", attach: "Attach session", group: "Session group", "new-group": "New session group", folder: "Project folder", "new-folder": "New project folder", pr: "Session from PR", work: "Session from work item", relocate: "Change attached folder", "remove-project": "Remove project" };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const configuration = edit.project ? (await sdk.projects.configuration(edit.project.id)).configuration : null;
      const requiredProject = () => { if (!edit.project) throw new Error("This action needs a selected project."); return edit.project; };
      switch (edit.kind) {
        case "rename": await sdk.sessions.rename(edit.session!.id, value); break;
        case "attach":
          if (!value && edit.session!.parentSessionId) { detach(edit.session!); return; }
          await sdk.sessions.organize(edit.session!.id, { parentSessionId: value || null }); break;
        case "group": await sdk.sessions.organize(edit.session!.id, { groupId: value || null }); break;
        case "new-group": await sdk.sessions.group(requiredProject().id, value); break;
        case "new-folder": await sdk.projects.folder(value); break;
        case "folder": if (!configuration) throw new Error("Project configuration is required."); await sdk.projects.organize(requiredProject().id, { folderId: value || null, color: configuration.color, order: configuration.order }, configuration.revision); break;
        case "relocate": if (!configuration) throw new Error("Project configuration is required."); await sdk.projects.relocate(requiredProject().id, value, configuration.revision); break;
        case "remove-project": {
          if (!confirmed || !configuration || !artifactPreview || staleArtifacts || artifactChoiceMissing) throw new Error("Review the current artifact set and confirm its disposition before removal.");
          const choice = artifactPreview.artifacts.length && artifactAction ? { action: artifactAction, expectedDigest: artifactPreview.digest, ...(exportedDigest ? { exportedDigest } : {}), ...(materialized ? { materializationId: materialized.jobId } : {}) } : undefined;
          await sdk.projects.remove(requiredProject().id, true, configuration.revision, choice); break;
        }
        case "pr": case "work": {
          const scope = { env: "Local" as const, projectId: requiredProject().id };
          const result = github ? await sdk.github.startSession(scope, github.source, github.digest) :
            await sdk.sessions.fromWork(scope.projectId, edit.kind === "pr" ? { prUrl: value } : { issueId: value });
          await chooseSession(result.id!); break;
        }
      }
      close();
    } catch (error) { setError(error instanceof Error ? error.message : "The action failed; no success was recorded."); }
    finally { setBusy(false); }
  };
  const choices = edit.kind === "attach" ? snapshot.sessions.filter((session) => session.projectId === (edit.session?.projectId ?? edit.project?.id ?? null) && session.id !== edit.session?.id && session.kind !== "subagent").map((session) => ({ id: session.id, name: session.title })) :
    edit.kind === "group" ? snapshot.sessionGroups.filter((group) => group.projectId === edit.project?.id) :
    edit.kind === "folder" ? snapshot.projectFolders :
    edit.kind === "work" ? snapshot.issues.filter((issue) => issue.projectId === edit.project?.id && !issue.archived).map((issue) => ({ id: issue.id, name: `#${issue.number} ${issue.title}` })) : null;
  return <dialog ref={ref} className="workspace-dialog" onClose={close} aria-label={titles[edit.kind]}><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><h2>{titles[edit.kind]}</h2><button className="icon-button" type="button" aria-label="Cancel dialog" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    {(edit.kind === "pr" || edit.kind === "work") && edit.project && <>
      <GitHubItemPicker sdk={sdk} scope={{ env: "Local", projectId: edit.project.id }} kind={edit.kind === "pr" ? "pull" : "issue"} disabled={busy}
        select={(selection) => { setGithub(selection); if (selection) setValue(""); }} />
      {github && <section className="github-item" aria-label="Reviewed session source"><h3>#{github.item.number} {github.item.title}</h3>
        <p className="fine-print path">Source workspace: {github.binding.root.root}</p>
        <Suspense fallback={<p>{github.item.body}</p>}><RichMessage text={github.item.body || "No description."} openLink={(url) => { void window.moguri.openExternal(url).catch((error: unknown) => setError(error instanceof Error ? error.message : "The link could not be opened.")); }} /></Suspense></section>}
    </>}
    {destructive ? <><p>Stops this project's owned work and removes its Moguri records and indexes. Choose what happens to independent artifacts. Repository files, external PRs, shared package/model stores and diagnostic audit logs are not deleted. Retained worktrees must be removed separately.</p>
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
      choices ? <label className="setting-field">{edit.kind === "work" ? "Or choose a local work item" : "Destination"}<select aria-label="Destination" value={value} onChange={(event) => { setValue(event.target.value); setGithub(null); }}><option value="">{edit.kind === "work" ? "Choose local work item" : "None"}</option>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> :
        <label className="setting-field">{edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"}<input ref={nameInput} aria-label={edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"} autoFocus value={value} onChange={(event) => { setValue(event.target.value); setGithub(null); }} required={!github} /></label>}
    {edit.kind === "pr" && <p className="fine-print">Binds PR context without changing this folder's checkout or starting work.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button className={destructive ? "danger" : "primary"} disabled={busy || previewLoading || staleArtifacts || artifactChoiceMissing || destructive && !confirmed || !destructive && !["attach", "group", "folder"].includes(edit.kind) && !value.trim() && !github} type="submit">{busy ? "Working..." : destructive ? "Delete" : edit.kind === "pr" || edit.kind === "work" ? "Start session" : "Save"}</button></footer>
  </form></dialog>;
}
