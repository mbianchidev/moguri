import { lazy, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClientError, compareSessions, defaultBoard, defaultProjectConfiguration, fuzzyMatch, kanbanPreferences, sessionIndicator, sessionOrderScope, sessionTitle, type MoguriSdk, type NavigationFolder, type Project, type ProjectConfiguration, type Session, type Snapshot, type ProjectArtifactChoice, type ProjectArtifactPreview } from "../../../packages/sdk/src/index.ts";
import type { ArtifactMaterialization } from "../../../packages/sdk/src/index.ts";
import { ArtifactRepositoryCopy } from "./ArtifactRepositoryCopy.tsx";
import { Icon } from "./Icon.tsx";
import { useSessionActions, type SessionActionOwner } from "./SessionActions.tsx";
import { SESSION_DRAG_TYPE } from "./ContextAttachments.tsx";
import { GitHubItemPicker, type GithubSelection } from "./GitHubPickers.tsx";
import { PolicyNavigationContext } from "./PolicyHint.tsx";
import { Alert } from "./Alert.tsx";
const RichMessage = lazy(() => import("./RichMessage.tsx"));

type EditKind = "rename" | "attach" | "group" | "new-group" | "folder" | "new-folder" | "merge-projects" | "color" | "folder-color" | "pr" | "work" | "relocate" | "remove-project";
interface Edit { kind: EditKind; project?: Project; session?: Session; folder?: NavigationFolder; projects?: { projectId: string; revision: number }[]; anchor?: HTMLElement }
interface NavigationMenu { kind: "project" | "session" | "folder"; id: string; x: number; y: number; anchor: HTMLElement; trigger: HTMLElement | null }
const projectColors = [
  { name: "Red", color: "#ef4444" }, { name: "Orange", color: "#d86716" }, { name: "Yellow", color: "#a67c00" },
  { name: "Green", color: "#2f9e44" }, { name: "Blue", color: "#3b82f6" }, { name: "Indigo", color: "#6366f1" }, { name: "Violet", color: "#a855f7" },
] as const;
const changeProjectColor = (sdk: MoguriSdk, configuration: ProjectConfiguration, color: string) => sdk.projects.organize(configuration.projectId,
  { folderId: configuration.folderId, order: configuration.order, color }, configuration.revision);
const groupColor = (folder: NavigationFolder) => folder.color ?? "#a8d7bc";
const SESSION_DRAG = SESSION_DRAG_TYPE;
const PROJECT_DRAG = "application/x-moguri-project";
type ProjectPosition = { id: string; folderId: string | null; order: number; name: string };
type SessionPosition = { id: string; scope: string; order: number };
const position = (session: Session): SessionPosition => ({ id: session.id, scope: sessionOrderScope(session), order: session.order ?? 0 });
function samePositions(expected: SessionPosition[], sessions: Session[]): boolean {
  const actual = new Map(sessions.map((session) => [session.id, position(session)]));
  return expected.length === actual.size && expected.every((entry) => {
    const value = actual.get(entry.id);
    return value?.scope === entry.scope && value.order === entry.order;
  });
}
const dropEdge = (element: HTMLElement, y: number): "before" | "after" | "inside" => {
  const bounds = element.getBoundingClientRect(), ratio = (y - bounds.top) / bounds.height;
  return ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
};
export function WorkspaceNavigation({ sdk, snapshot, selectedId, archived, busy, chooseSession, chooseProject, openKanban, settings, terminal, modal, allow, prepareSession,
  sessionActionRequest, onSessionActionRequestHandled, setupSandbox }: {
  sdk: MoguriSdk; snapshot: Snapshot; selectedId: string | null; archived: boolean; busy: boolean;
  chooseSession: (id: string) => Promise<void>; chooseProject: (id: string | null) => void; settings: (projectId: string) => void;
  openKanban: (projectId: string) => Promise<void>;
  modal: (open: boolean) => void; allow: () => boolean; terminal?: (projectId: string) => void;
  prepareSession?: (id: string) => Promise<void>;
  sessionActionRequest?: { sessionId: string; action: "archive"; nonce: number; owner?: SessionActionOwner } | null; onSessionActionRequestHandled?: (nonce: number) => void;
  setupSandbox?: () => void;
}) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const openPolicy = useContext(PolicyNavigationContext);
  const editFocus = useRef<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    if (!search.trim()) return null;
    const values = new Map(snapshot.sessions.map((session) => [session.id, session]));
    const selected = new Set(snapshot.sessions.filter((session) => (session.status === "archived") === archived &&
      fuzzyMatch(search, sessionTitle(session, 160, "New chat"))).map((session) => session.id));
    for (const id of [...selected]) {
      let parent = values.get(id)?.parentSessionId;
      while (parent && !selected.has(parent)) { selected.add(parent); parent = values.get(parent)?.parentSessionId; }
    }
    return selected;
  }, [search, snapshot.sessions, archived]);
  const [menu, setMenu] = useState<NavigationMenu | null>(null);
  const [foldersMenu, setFoldersMenu] = useState<NavigationMenu | null>(null);
  const projectsMenuButton = useRef<HTMLButtonElement>(null), removedFolderFocus = useRef<{ id: string; profileId: string } | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => new Set());
  const [expandedLists, setExpandedLists] = useState<Set<string>>(() => new Set());
  const [navigationStatus, setNavigationStatus] = useState("");
  useEffect(() => { setCollapsedFolders(new Set()); setCollapsedProjects(new Set()); setExpandedLists(new Set()); setSearch(""); setFoldersMenu(null); setNavigationStatus(""); removedFolderFocus.current = null; }, [sdk.profileId]);
  useLayoutEffect(() => {
    const request = removedFolderFocus.current;
    if (!request || request.profileId !== sdk.profileId || snapshot.projectFolders.some((folder) => folder.id === request.id)) return;
    removedFolderFocus.current = null;
    if (document.activeElement === document.body) projectsMenuButton.current?.focus();
  }, [sdk.profileId, snapshot.projectFolders]);
  const selectedBranch = new Set<string>();
  for (let session = snapshot.sessions.find((session) => session.id === selectedId); session && !selectedBranch.has(session.id);
    session = snapshot.sessions.find((parent) => parent.id === session.parentSessionId)) selectedBranch.add(session.id);
  const page = (key: string, entries: Session[], limit: number) => {
    if (matches || expandedLists.has(key) || entries.length <= limit) return entries;
    const visible = entries.slice(0, limit), selected = entries.find((entry) => selectedBranch.has(entry.id));
    if (selected && !visible.some((entry) => entry.id === selected.id)) visible[limit - 1] = selected;
    return visible;
  };
  const more = (key: string, count: number, limit: number, label: string) => !matches && count > limit &&
    <button type="button" className="quiet nav-show-more" aria-label={`${expandedLists.has(key) ? "Show fewer" : "Show more"} ${label}`}
      aria-expanded={expandedLists.has(key)} onClick={() => setExpandedLists((current) => {
        const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
      })}>{expandedLists.has(key) ? "Show less" : "Show more"}{!expandedLists.has(key) && ` (${count - limit})`}</button>;
  const colorPending = useRef(false);
  const [savingColor, setSavingColor] = useState(false);
  const [drop, setDrop] = useState<{ id: string; edge: "before" | "after" | "detach" | "inside" } | null>(null);
  const dragging = useRef<{ source: SessionPosition; siblings: SessionPosition[]; profileId: string } | null>(null);
  const projectDrag = useRef<{ id: string; siblings: ProjectPosition[]; profileId: string } | null>(null);
  const [ordering, setOrdering] = useState(false), orderPending = useRef(false);
  const actions = useSessionActions(sdk, snapshot, { prepare: prepareSession, inspect: chooseSession });
  const handledSessionAction = useRef<number | null>(null);
  useEffect(() => {
    const request = sessionActionRequest;
    if (!request || handledSessionAction.current === request.nonce) return;
    handledSessionAction.current = request.nonce;
    const target = snapshot.sessions.find((session) => session.id === request.sessionId);
    if (target) actions.request(target, request.action, undefined, request.owner);
    else { setError("The session requested for this action is no longer available."); request.owner?.settle("failed"); }
    onSessionActionRequestHandled?.(request.nonce);
  }, [sessionActionRequest, snapshot.sessions, actions.request, onSessionActionRequestHandled]);
  useLayoutEffect(() => {
    if (edit || !editFocus.current) return;
    const anchor = editFocus.current; editFocus.current = null;
    if (anchor.isConnected) anchor.focus();
  }, [edit]);
  useEffect(() => { if (menu && !(menu.kind === "project" ? snapshot.projects : menu.kind === "folder" ? snapshot.projectFolders : snapshot.sessions).some((entry) => entry.id === menu.id)) setMenu(null); }, [menu, snapshot.projects, snapshot.projectFolders, snapshot.sessions]);
  useEffect(() => { modal(Boolean(edit || menu || foldersMenu || actions.reviewing || actions.busy)); return () => modal(false); }, [edit, menu, foldersMenu, actions.reviewing, actions.busy, modal]);
  const run = async (operation: () => Promise<unknown>) => { setError(""); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Workspace action failed."); } };
  const open = (value: Edit) => { if (allow()) setEdit(value); };
  const folder = (project: Project) => (snapshot.projectConfigurations.find((entry) => entry.projectId === project.id) ?? defaultProjectConfiguration(project.id));
  const collapseGroupProjects = (group: NavigationFolder, collapsed: boolean) => {
    const state = sdk.getState().snapshot, currentGroup = state?.profileId === sdk.profileId && state.projectFolders.find((value) => value.id === group.id);
    if (!currentGroup || !state) { setError("This project group is no longer available in the original profile. No other group was changed."); return; }
    const members = state.projects.filter((project) => state.projectConfigurations.some((configuration) => configuration.projectId === project.id && configuration.folderId === group.id));
    setCollapsedProjects((current) => {
      const next = new Set(current);
      for (const project of members) { if (collapsed) next.add(project.id); else next.delete(project.id); }
      return next;
    });
    if (!collapsed) setCollapsedFolders((current) => { const next = new Set(current); next.delete(group.id); return next; });
    setNavigationStatus(`${collapsed ? "Collapsed" : "Expanded"} ${members.length} project${members.length === 1 ? "" : "s"} in ${currentGroup.name}.`);
  };
  const closeMenu = (restore = true) => {
    const anchor = menu?.anchor; setMenu(null);
    if (restore) queueMicrotask(() => { if (anchor?.isConnected) anchor.focus(); });
  };
  const openMenu = (kind: NavigationMenu["kind"], id: string, anchor: HTMLElement, x: number, y: number) => {
    if (allow()) {
      const trigger = kind === "project" ? anchor.closest(".project-row")?.querySelector<HTMLButtonElement>(".project-actions") ?? null :
        kind === "folder" ? anchor.closest("summary")?.querySelector<HTMLButtonElement>(".folder-actions") ?? null : null;
      anchor.focus(); setMenu({ kind, id, x, y, anchor, trigger });
    }
  };
  const saveNavigationColor = (operation: () => Promise<unknown>) => {
    if (colorPending.current) { setError("Wait for the current project color change to finish."); return; }
    colorPending.current = true; setSavingColor(true);
    void run(async () => {
      try {
        await operation();
      } finally { colorPending.current = false; setSavingColor(false); }
    });
  };
  const saveColor = (project: Project, color: string) => saveNavigationColor(() => changeProjectColor(sdk, folder(project), color));
  const saveFolderColor = (group: NavigationFolder, color: string) => saveNavigationColor(() => sdk.projects.folder(group.name, group.order, group.id, group.revision, color));
  const ungroup = (group: NavigationFolder) => run(async () => {
    if (!allow()) return;
    const members = snapshot.projectConfigurations.filter((configuration) => configuration.folderId === group.id).map(({ projectId, revision }) => ({ projectId, revision }));
    const request = { id: group.id, profileId: sdk.profileId }; removedFolderFocus.current = request;
    try { await sdk.projects.ungroup(group.id, members, group.revision); }
    catch (error) { if (removedFolderFocus.current === request) removedFolderFocus.current = null; throw error; }
  });
  const siblings = (session: Session, sessions = snapshot.sessions) => sessions.filter((entry) => entry.projectId === session.projectId &&
    (entry.parentSessionId ?? null) === (session.parentSessionId ?? null) && (session.parentSessionId || entry.groupId === session.groupId) &&
    (session.parentSessionId || session.projectId !== null || entry.projectFolderId === session.projectFolderId) &&
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
      if (edge === "inside") {
        if (source.turnId || source.kind === "subagent" || currentTarget.kind === "subagent") throw new Error("Stop the original session before attaching it. Model-owned subagents cannot acquire new navigation ownership.");
        const order = Math.max(-1, ...state.sessions.filter((session) => session.parentSessionId === currentTarget.id).map((session) => session.order ?? 0)) + 1;
        await sdk.sessions.organize(source.id, { parentSessionId: currentTarget.id, groupId: null, order }, source.revision);
        return;
      }
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
  const projectPosition = (project: Project, state: Snapshot): ProjectPosition => {
    const value = state.projectConfigurations.find((entry) => entry.projectId === project.id) ?? defaultProjectConfiguration(project.id);
    return { id: project.id, folderId: value.folderId, order: value.order, name: project.name };
  };
  const projectSiblings = (project: Project, state = snapshot) => state.projects.filter((entry) => projectPosition(entry, state).folderId === projectPosition(project, state).folderId)
    .sort((a, b) => projectPosition(a, state).order - projectPosition(b, state).order || a.name.localeCompare(b.name));
  const sameProjects = (expected: ProjectPosition[], project: Project, state: Snapshot) =>
    JSON.stringify(expected) === JSON.stringify(projectSiblings(project, state).map((entry) => projectPosition(entry, state)));
  const saveProjectOrder = async (project: Project, ordered: Project[], expected: ProjectPosition[]) => {
    if (orderPending.current) throw new Error("Wait for the current order to settle before another move.");
    orderPending.current = true; setOrdering(true);
    try {
      for (let attempt = 0; ; attempt++) {
        const state = sdk.getState(), current = state.snapshot?.projects.find((entry) => entry.id === project.id);
        if (state.status !== "connected" || !state.snapshot || !current || !sameProjects(expected, current, state.snapshot)) {
          throw new Error("The project's folder, order or sibling list changed. Start the drag again; no newer arrangement was overwritten.");
        }
        try {
          return await sdk.projects.reorder(projectPosition(current, state.snapshot).folderId, ordered.map((entry) => ({ projectId: entry.id,
            revision: state.snapshot!.projectConfigurations.find((value) => value.projectId === entry.id)?.revision ?? 0 })));
        } catch (error) {
          if (attempt || !(error instanceof ClientError) || error.code !== "revision_conflict") throw error;
          await sdk.refresh();
        }
      }
    } finally { orderPending.current = false; setOrdering(false); }
  };
  const moveProject = (project: Project, delta: number) => run(async () => {
    const ordered = projectSiblings(project), expected = ordered.map((entry) => projectPosition(entry, snapshot));
    const index = ordered.findIndex((entry) => entry.id === project.id), target = index + delta;
    if (target < 0 || target >= ordered.length) throw new Error("This project is already at the edge of its folder.");
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    await saveProjectOrder(project, ordered, expected);
  });
  const dropProject = (event: DragEvent<HTMLElement>, target: Project) => {
    const intent = projectDrag.current;
    if (!intent) return;
    event.preventDefault(); event.stopPropagation(); setDrop(null);
    const edge = dropEdge(event.currentTarget, event.clientY);
    void run(async () => {
      if (!allow()) return;
      const state = sdk.getState().snapshot, source = state?.projects.find((entry) => entry.id === intent.id);
      const currentTarget = state?.projects.find((entry) => entry.id === target.id);
      if (!event.dataTransfer.types.includes(PROJECT_DRAG) || intent.profileId !== sdk.profileId || !state || !source || !currentTarget ||
        !sameProjects(intent.siblings, source, state)) {
        throw new Error("The original project/profile/folder arrangement changed. Start the drag again; no newer structure was overwritten.");
      }
      if (source.id === currentTarget.id) return;
      if (edge === "inside") {
        open({ kind: "merge-projects", projects: [currentTarget, source].map((project) => ({ projectId: project.id,
          revision: state.projectConfigurations.find((configuration) => configuration.projectId === project.id)?.revision ?? 0 })) });
        return;
      }
      if (projectPosition(source, state).folderId !== projectPosition(currentTarget, state).folderId) throw new Error("Reorder at the edges of sibling projects, or drop in the center to name a new folder.");
      const next = projectSiblings(source, state).filter((entry) => entry.id !== source.id), index = next.findIndex((entry) => entry.id === target.id);
      next.splice(index + (edge === "after" ? 1 : 0), 0, source);
      await saveProjectOrder(source, next, intent.siblings);
    });
  };
  const toggleKanban = (project: Project) => run(async () => {
    const current = (await sdk.issues.board(project.id)).board;
    await sdk.issues.configure(project.id, { ...current, kanban: { ...kanbanPreferences(current), visible: !kanbanPreferences(current).visible } }, current.revision);
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
      const zone = dropEdge(event.currentTarget, event.clientY);
      const detaching = zone !== "inside" && source?.parentSessionId && !session.parentSessionId && !source.turnId && source.kind !== "subagent";
      const edge = detaching ? "detach" : zone;
      const valid = source && source.id !== session.id && source.projectId === session.projectId && samePositions(dragging.current.siblings, siblings(source)) &&
        (zone === "inside" ? !source.turnId && source.kind !== "subagent" && session.kind !== "subagent" :
          detaching || dragging.current.siblings.some((entry) => entry.id === session.id) && source.pinned === session.pinned);
      if (!valid) { event.stopPropagation(); event.dataTransfer.dropEffect = "none"; setDrop(null); return; }
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
      setDrop({ id: session.id, edge });
    }} onDragLeave={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop((value) => value?.id === session.id ? null : value);
    }} onDrop={(event) => dropSession(event, session)}
    onContextMenu={(event) => { event.preventDefault(); const anchor = event.currentTarget.querySelector<HTMLButtonElement>(".session-link")!; openMenu("session", session.id, anchor, event.clientX, event.clientY); }}>
    <button className="session-link" data-session-id={session.id} data-unread={unread ? "true" : undefined} aria-label={session.title} aria-description={`${unread ? "Unread. " : ""}${indicator.label}. Double-click to rename. Right-click or Shift+F10 for actions. Drop on a session to attach; drop near its edges or use Alt+Up/Down to reorder siblings. Drag a child to a header to detach.`}
      aria-haspopup="menu" aria-expanded={menu?.kind === "session" && menu.id === session.id} aria-current={selectedId === session.id ? "page" : undefined} onClick={() => void chooseSession(session.id)} title={session.title}
      onDoubleClick={(event) => { event.preventDefault(); open({ kind: "rename", session }); }}
      onKeyDown={(event) => {
        if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); void moveSession(session, event.key === "ArrowUp" ? -1 : 1); return; }
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu("session", session.id, event.currentTarget, bounds.right, bounds.top);
      }}>
      <span className="status-dot session-status-dot" data-session-state={indicator.kind} title={indicator.label} aria-hidden="true" /><span className="session-link-text"><span>{sessionTitle(session, 60, "New chat")}</span>
        {session.status === "waiting_input" && <small title="Needs attention">Needs attention</small>}</span><SessionIndicators indicator={indicator} />{session.pinned && <Icon name="Pin" />}{session.queue.length > 0 && <span className="queue-count">{session.queue.length}</span>}
    </button>
  </div>;
  };
  const renderProject = (project: Project) => {
    const configuration = folder(project);
    const sessions = snapshot.sessions.filter((session) => session.projectId === project.id && (session.status === "archived") === archived && (!matches || matches.has(session.id)));
    const board = snapshot.boards.find((entry) => entry.projectId === project.id) ?? defaultBoard(project.id);
    const boardVisible = !archived && kanbanPreferences(board).visible && (!matches || sessions.some((session) => session.purpose === "kanban"));
    const visible = new Set(sessions.filter((session) => session.purpose !== "kanban" || boardVisible).map((session) => session.id));
    const roots = sessions.filter((session) => session.purpose !== "kanban" && (!session.parentSessionId || !visible.has(session.parentSessionId))).sort(compareSessions);
    const rootIds = new Set(page(`project:${project.id}`, roots, 5).map((session) => session.id));
    const tree = (parent: string | null, group: string | null, depth = 0): ReactNode => {
      const entries = sessions.filter((session) => session.purpose !== "kanban" &&
        (session.parentSessionId && visible.has(session.parentSessionId) ? session.parentSessionId : null) === parent &&
        (parent !== null || session.groupId === group && rootIds.has(session.id))).sort(compareSessions);
      const key = `children:${parent}`, rows = parent ? page(key, entries, 5) : entries;
      return <>{rows.map((session) => <div key={session.id}>{renderSession(session, depth)}{depth < 8 && tree(session.id, group, depth + 1)}</div>)}
        {parent && more(key, entries.length, 5, `subsessions of ${snapshot.sessions.find((session) => session.id === parent)?.title ?? "this session"}`)}</>;
    };
    const boardChat = sessions.find((entry) => entry.purpose === "kanban");
    return <section className="project-group" key={project.id} aria-label={`Project ${project.name}`} onDragOver={(event) => dragHeader(event, project.id)} onDrop={(event) => detach(event, project.id)}>
      <header className={`project-row ${drop?.id === `project:${project.id}` ? `drop-${drop.edge}` : ""}`} draggable={!actions.busy && !ordering}
        onContextMenu={(event) => { event.preventDefault(); openMenu("project", project.id, event.currentTarget.querySelector<HTMLButtonElement>(".project-name")!, event.clientX, event.clientY); }}
        onDragStart={(event) => {
          if (!allow() || orderPending.current) { event.preventDefault(); return; }
          event.stopPropagation(); dragging.current = null;
          projectDrag.current = { id: project.id, siblings: projectSiblings(project).map((entry) => projectPosition(entry, snapshot)), profileId: sdk.profileId };
          event.dataTransfer.setData(PROJECT_DRAG, project.id); event.dataTransfer.effectAllowed = "move"; setMenu(null);
        }}
        onDragEnd={() => { projectDrag.current = null; setDrop(null); }}
        onDragOver={(event) => {
          const intent = projectDrag.current;
          if (!intent) return;
          event.stopPropagation();
          const edge = dropEdge(event.currentTarget, event.clientY);
          if (edge !== "inside" && !intent.siblings.some((entry) => entry.id === project.id) || intent.id === project.id) { event.dataTransfer.dropEffect = "none"; setDrop(null); return; }
          event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDrop({ id: `project:${project.id}`, edge });
        }} onDrop={(event) => dropProject(event, project)}>
      <button type="button" className="icon-button project-collapse" aria-label={`${collapsedProjects.has(project.id) ? "Expand" : "Collapse"} project ${project.name}`}
        aria-expanded={!collapsedProjects.has(project.id)} onClick={() => setCollapsedProjects((current) => {
          const next = new Set(current); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next;
        })}><span className={`folder-chevron${collapsedProjects.has(project.id) ? " collapsed" : ""}`}><Icon name="Down" /></span></button>
      <button className="project-name" data-project-id={project.id} aria-haspopup="menu" aria-expanded={menu?.kind === "project" && menu.id === project.id}
        aria-description="Open settings. Right-click or Shift+F10 for actions and icon color. Drop onto another project to name a folder; use row edges or Alt+Up/Down to reorder siblings." title={`Project settings: ${project.path}`} onClick={() => settings(project.id)}
        onKeyDown={(event) => {
          if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); void moveProject(project, event.key === "ArrowUp" ? -1 : 1); return; }
          if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
            event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu("project", project.id, event.currentTarget, bounds.right, bounds.top);
          }
        }}><span className="project-color" style={{ color: configuration.color }}><Icon name="Files" /></span><span className="project-label">{project.name}</span></button>
      <button type="button" className="icon-button project-actions" title={`Project actions for ${project.name}`} aria-label={`Project actions for ${project.name}`} aria-haspopup="menu" aria-expanded={menu?.kind === "project" && menu.id === project.id}
        onClick={(event) => {
          if (menu?.kind === "project" && menu.id === project.id) { closeMenu(); return; }
          const bounds = event.currentTarget.getBoundingClientRect(); openMenu("project", project.id, event.currentTarget, bounds.right, bounds.top);
        }}><Icon name="More" /></button></header>
      {!collapsedProjects.has(project.id) && <>{boardVisible && <><button className={`session-link kanban-link ${selectedId === boardChat?.id ? "selected" : ""}`} aria-label={`Kanban for ${project.name}`}
        aria-current={selectedId === boardChat?.id ? "page" : undefined} onClick={() => void openKanban(project.id)}><Icon name="Plan" /><span>Kanban</span><span className="queue-count">{snapshot.issues.filter((issue) => issue.projectId === project.id && !issue.archived && issue.phaseId !== board.mergedColumnId).length}</span></button>
        {boardChat && tree(boardChat.id, null, 1)}</>}
      {tree(null, null)}
      {snapshot.sessionGroups.filter((group) => group.projectId === project.id).sort((a, b) => a.order - b.order).map((group) => <div className="session-group" key={group.id} onDragOver={(event) => dragHeader(event, project.id)} onDrop={(event) => detach(event, project.id, group.id)}><h3>{group.name}</h3>{tree(null, group.id)}</div>)}
      {more(`project:${project.id}`, roots.length, 5, `sessions in ${project.name}`)}</>}
    </section>;
  };
  const projects = [...snapshot.projects].filter((project) => !matches || snapshot.sessions.some((session) => session.projectId === project.id && matches.has(session.id)))
    .sort((a, b) => folder(a).order - folder(b).order || a.name.localeCompare(b.name));
  const general = snapshot.sessions.filter((session) => session.projectId === null && (session.status === "archived") === archived && (!matches || matches.has(session.id)));
  const generalIds = new Set(general.map((session) => session.id));
  const activeFolders = new Set(snapshot.projectFolders.map((folder) => folder.id));
  const generalTree = (parent: string | null, folderId: string | null = null, depth = 0): ReactNode => {
    const entries = general.filter((session) => (session.parentSessionId && generalIds.has(session.parentSessionId) ? session.parentSessionId : null) === parent &&
      (parent !== null || (session.projectFolderId && activeFolders.has(session.projectFolderId) ? session.projectFolderId : null) === folderId)).sort(compareSessions);
    const key = parent ? `children:${parent}` : `chats:${folderId}`, limit = parent || folderId ? 5 : 10;
    const label = parent ? `subsessions of ${snapshot.sessions.find((session) => session.id === parent)?.title ?? "this session"}` :
      folderId ? `sessions in ${snapshot.projectFolders.find((folder) => folder.id === folderId)?.name ?? "this folder"}` : "chats";
    return <>{page(key, entries, limit).map((session) => <div key={session.id}>{renderSession(session, depth)}{depth < 8 && generalTree(session.id, folderId, depth + 1)}</div>)}
      {more(key, entries.length, limit, label)}</>;
  };
  const menuSession = menu?.kind === "session" ? snapshot.sessions.find((session) => session.id === menu.id) : undefined;
  const projectMenu = menu?.kind === "project" ? snapshot.projects.find((project) => project.id === menu.id) : undefined;
  const folderMenu = menu?.kind === "folder" ? snapshot.projectFolders.find((folder) => folder.id === menu.id) : undefined;
  const menuProject = snapshot.projects.find((project) => project.id === menuSession?.projectId);
  const menuUnread = menuSession ? unreadSession(menuSession, snapshot) : false;
  return <><div className="project-list" aria-busy={busy || actions.busy || ordering}>
    <div className="workspace-navigation-tools"><label className="workspace-session-search"><Icon name="Search" /><input type="search" aria-label="Search sessions" placeholder="Search sessions" value={search}
      onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim()) { setCollapsedFolders(new Set()); setCollapsedProjects(new Set()); } }} /></label>
      <button ref={projectsMenuButton} type="button" className="icon-button" aria-label="Projects menu" title="Projects menu" aria-haspopup="menu" aria-expanded={Boolean(foldersMenu)} onClick={(event) => {
        if (foldersMenu) { setFoldersMenu(null); return; }
        const bounds = event.currentTarget.getBoundingClientRect();
        setFoldersMenu({ kind: "project", id: "folders", x: bounds.left, y: bounds.bottom, anchor: event.currentTarget, trigger: event.currentTarget });
      }}><Icon name="More" /></button></div>
    {(error || actions.error) && <Alert as="p" className="inline-error" role="alert">{error || actions.error}</Alert>}
    <p className="sr-only" role="status" aria-atomic="true">{navigationStatus}</p>
    <section className="project-group general-chats" aria-label="Chats" onDragOver={(event) => dragHeader(event, null)} onDrop={(event) => detach(event, null)}><header className="project-row"><button className="project-name" onClick={() => chooseProject(null)}><Icon name="Side chat" /><span className="project-label">Chats</span></button></header>{generalTree(null)}</section>
    {projects.filter((project) => !folder(project).folderId).map(renderProject)}
    {snapshot.projectFolders.slice().sort((a, b) => a.order - b.order).filter((group) => !matches || projects.some((project) => folder(project).folderId === group.id) || general.some((session) => session.projectFolderId === group.id)).map((group) =>
      <details className="project-folder" key={group.id} open={!collapsedFolders.has(group.id)}><summary onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        event.preventDefault();
        setCollapsedFolders((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; });
      }} onContextMenu={(event) => { event.preventDefault(); openMenu("folder", group.id, event.currentTarget, event.clientX, event.clientY); }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
            event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu("folder", group.id, event.currentTarget, bounds.right, bounds.top);
          }
        }}><span className={`folder-chevron${collapsedFolders.has(group.id) ? " collapsed" : ""}`}><Icon name="Down" /></span><span className="folder-icon" style={{ color: groupColor(group) }}><Icon name="Files" /></span><span className="folder-name">{group.name}</span>
        <button type="button" className="icon-button" aria-label={`New chat in ${group.name}`} title="Local chat with access to every repository in this folder"
          disabled={busy || !snapshot.policy.allowedEnvs.includes("Local") || !snapshot.projectConfigurations.some((configuration) => configuration.folderId === group.id)}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); void run(async () => {
            const result = await sdk.sessions.createFolder(group.id, `${group.name} chat`, { env: "Local" }); await chooseSession(result.id!);
          }); }}><Icon name="Plus" /></button>
        <button type="button" className="icon-button folder-actions" aria-label={`Project group actions for ${group.name}`} aria-haspopup="menu" aria-expanded={menu?.kind === "folder" && menu.id === group.id}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu("folder", group.id, event.currentTarget, bounds.right, bounds.bottom); }}><Icon name="More" /></button>
      </summary>{generalTree(null, group.id)}{projects.filter((project) => folder(project).folderId === group.id).map(renderProject)}</details>)}
    {!projects.length && <p className="nav-empty">Use New for a chat, a local folder or a repository.</p>}
    {archived && !snapshot.sessions.some((session) => session.status === "archived") && <p className="nav-empty">No archived sessions.</p>}
  </div>
  {foldersMenu && <WorkspaceContextMenu label="Projects menu" point={foldersMenu} close={(restore = true) => { const anchor = foldersMenu.anchor; setFoldersMenu(null); if (restore) queueMicrotask(() => anchor.isConnected && anchor.focus()); }}>
    <button role="menuitem" onClick={() => { setCollapsedFolders(new Set()); setCollapsedProjects(new Set()); }}><Icon name="Maximize" />Expand all groups</button>
    <button role="menuitem" onClick={() => { setCollapsedFolders(new Set(snapshot.projectFolders.map((folder) => folder.id))); setCollapsedProjects(new Set(snapshot.projects.map((project) => project.id))); }}><Icon name="Minimize" />Collapse all groups</button>
  </WorkspaceContextMenu>}
  {menu && projectMenu && <WorkspaceContextMenu label={`Project actions for ${projectMenu.name}`} point={menu} close={closeMenu}>
    <NavigationColors label="Project icon color" color={folder(projectMenu).color} busy={savingColor} pick={(color) => saveColor(projectMenu, color)}
      customLabel="Custom project color" custom={() => open({ kind: "color", project: projectMenu, anchor: menu.anchor })} />
    <button role="menuitem" onClick={() => void run(async () => { const result = await sdk.command({ type: "session.create", projectId: projectMenu.id }); await chooseSession(result.id!); })}><Icon name="Plus" />New chat</button>
    <button role="menuitem" onClick={() => open({ kind: "work", project: projectMenu })}><Icon name="Plan" />From work item</button>
    <button role="menuitem" onClick={() => open({ kind: "pr", project: projectMenu })}><Icon name="PR" />From PR</button>
    <button role="menuitem" onClick={() => settings(projectMenu.id)}><Icon name="Settings" />Settings</button>
    <button role="menuitem" onClick={() => void toggleKanban(projectMenu)}><Icon name="Plan" />{kanbanPreferences(snapshot.boards.find((board) => board.projectId === projectMenu.id) ?? defaultBoard(projectMenu.id)).visible ? "Hide Kanban" : "Show Kanban"}</button>
    {terminal && <button role="menuitem" onClick={() => terminal(projectMenu.id)}><Icon name="Terminal" />Open project terminal</button>}
    <button role="menuitem" onClick={() => void run(async () => { const info = await sdk.projects.git(projectMenu.id, false); if (!info.repository) throw new Error("This attached folder has no supported GitHub upstream."); await window.moguri.openExternal(info.repository); })}><Icon name="PR" />Open in GitHub</button>
    <button role="menuitem" onClick={() => open({ kind: "new-group", project: projectMenu })}><Icon name="Group" />New session group</button>
    <button role="menuitem" onClick={() => open({ kind: "folder", project: projectMenu })}><Icon name="Files" />Move to folder</button>
    <button role="menuitem" onClick={() => open({ kind: "new-folder", project: projectMenu })}><Icon name="Plus" />New folder</button>
    <button role="menuitem" onClick={() => open({ kind: "relocate", project: projectMenu })}><Icon name="Link" />Change attached folder</button>
    <button role="menuitem" className="danger" onClick={() => open({ kind: "remove-project", project: projectMenu })}><Icon name="Trash" />Remove</button>
  </WorkspaceContextMenu>}
  {menu && folderMenu && <WorkspaceContextMenu label={`Project group actions for ${folderMenu.name}`} point={menu} close={closeMenu}>
    <NavigationColors label="Project group icon color" color={groupColor(folderMenu)} busy={savingColor} pick={(color) => saveFolderColor(folderMenu, color)}
      customLabel="Custom group color" custom={() => open({ kind: "folder-color", folder: folderMenu, anchor: menu.anchor })} />
    <button role="menuitem" onClick={() => collapseGroupProjects(folderMenu, false)}><Icon name="Maximize" />Expand all projects</button>
    <button role="menuitem" onClick={() => collapseGroupProjects(folderMenu, true)}><Icon name="Minimize" />Collapse all projects</button>
    <button role="menuitem" disabled={busy || !snapshot.policy.allowedEnvs.includes("Sandbox") ||
      !snapshot.capabilities.some((capability) => capability.env === "Sandbox" && capability.ready) ||
      !(snapshot.settings.values.sandboxManagement?.enabled && snapshot.settings.values.sandboxManagement.automaticWorkspaces) ||
      !snapshot.projectConfigurations.some((configuration) => configuration.folderId === folderMenu.id)}
      title={!snapshot.policy.allowedEnvs.includes("Sandbox") ? "Global execution policy excludes Sandbox." : "Requires a reviewed ready SendBox runtime and managed automatic private workspaces for every captured member."}
      onClick={() => void run(async () => { const result = await sdk.sessions.createFolder(folderMenu.id, `${folderMenu.name} Sandbox chat`, { env: "Sandbox" }); await chooseSession(result.id!); })}>
      <Icon name="Sandbox" />New Sandbox chat
    </button>
    {!snapshot.policy.allowedEnvs.includes("Sandbox") && openPolicy && <button role="menuitem" onClick={() => openPolicy("environments")}>
      <Icon name="Settings" />Open execution policy
    </button>}
    {setupSandbox && <button role="menuitem" onClick={setupSandbox}><Icon name="Settings" />Sandbox settings</button>}
    <button role="menuitem" onClick={() => void ungroup(folderMenu)}><Icon name="Group" />Ungroup</button>
  </WorkspaceContextMenu>}
  {menu && menuSession && <WorkspaceContextMenu label={`Actions for ${menuSession.title}`} point={menu} close={closeMenu}>
    <button role="menuitem" onClick={() => open({ kind: "rename", project: menuProject, session: menuSession })}><Icon name="Edit" />Rename</button>
    <button role="menuitem" onClick={() => void run(() => sdk.sessions.organize(menuSession.id, { pinned: !menuSession.pinned }))}><Icon name={menuSession.pinned ? "PinOff" : "Pin"} />{menuSession.pinned ? "Unpin" : "Pin"}</button>
    <button role="menuitem" onClick={() => void run(async () => {
      const ids = menuUnread ? sdk.getState().snapshot?.attention.filter((entry) => entry.sessionId === menuSession.id && !entry.acknowledged).map((entry) => entry.id) ?? [] : [];
      await sdk.sessions.organize(menuSession.id, { unread: !menuUnread });
      if (ids.length) await sdk.attention.acknowledge(ids.slice(-100));
    })}><Icon name="ReadOnly" />{menuUnread ? "Mark read" : "Mark unread"}</button>
    <button role="menuitem" disabled={!menuProject} onClick={() => open({ kind: "group", project: menuProject, session: menuSession })}><Icon name="Group" />Move to group</button>
    <button role="menuitem" disabled={Boolean(menuSession.turnId) || menuSession.kind === "subagent"} onClick={() => open({ kind: "attach", project: menuProject, session: menuSession })}><Icon name="Link" />Attach to session</button>
    {menuSession.parentSessionId && <button role="menuitem" disabled={Boolean(menuSession.turnId) || menuSession.kind === "subagent"} onClick={() => actions.request(menuSession, "detach")}><Icon name="Back" />Detach</button>}
    <button role="menuitem" disabled={menuSession.mode !== "agent" || menuSession.kind !== "agent"} onClick={() => void run(async () => { const result = await sdk.sessions.spawn(menuSession.id, "agent"); await chooseSession(result.id!); })}><Icon name="Plus" />Subsession</button>
    <button role="menuitem" onClick={() => menuSession.status === "archived" ? void run(() => sdk.command({ type: "session.restore", sessionId: menuSession.id })) : actions.request(menuSession, "archive")}><Icon name="Down" />{menuSession.status === "archived" ? "Unarchive" : "Archive"}</button>
    <button role="menuitem" className="danger" onClick={() => actions.request(menuSession, "delete")}><Icon name="Trash" />Delete</button>
  </WorkspaceContextMenu>}
  {actions.dialog}
  {edit && <NavigationDialog key={`${edit.kind}-${edit.session?.id ?? edit.project?.id ?? edit.folder?.id}`} edit={edit} sdk={sdk} snapshot={snapshot} close={() => {
    editFocus.current = edit.anchor ?? null; setEdit(null);
  }} chooseSession={chooseSession}
    detach={(session) => { setEdit(null); actions.request(session, "detach"); }} />}</>;
}
function NavigationColors({ label, color, busy, pick, customLabel, custom }: { label: string; color: string; busy: boolean; pick: (color: string) => void; customLabel: string; custom: () => void }) {
  const current = color.toLowerCase();
  return <div role="group" aria-label={label}><div className="project-color-palette">
    {projectColors.map(({ name, color }) => <button type="button" role="menuitemradio" key={name} aria-label={name} title={name}
      aria-checked={current === color} disabled={busy} onClick={() => pick(color)}>
      <span className="project-color-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
      {current === color && <span className="project-color-check"><Icon name="Check" /></span>}
    </button>)}
    <button type="button" role="menuitemradio" aria-label={customLabel} title={customLabel}
      aria-checked={!projectColors.some(({ color }) => color === current)} disabled={busy} onClick={custom}>
      <span className="project-color-swatch custom" aria-hidden="true"><Icon name="Edit" /></span>
    </button>
  </div></div>;
}
function WorkspaceContextMenu({ label, point, close, children }: { label: string; point: NavigationMenu; close: (restore?: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, point.x))}px`;
    element.style.top = `${Math.max(48, Math.min(window.innerHeight - bounds.height - 8, point.y))}px`;
    (element.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)') ?? element.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target) && !point.trigger?.contains(event.target)) close(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [close, point.trigger]);
  return createPortal(<div ref={ref} className="session-context-menu" role="menu" aria-label={label} style={{ left: point.x, top: point.y }}
    onClick={(event) => { if (event.target instanceof Element && event.target.closest("button")) close(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key === "Tab") { close(false); return; }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation();
        if (event.target instanceof Element) event.target.closest<HTMLButtonElement>("button:not(:disabled)")?.click();
        return;
      }
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const palette = horizontal && event.target instanceof Element ? event.target.closest(".project-color-palette") : null;
      if ((horizontal && !palette) || !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from((palette ?? ref.current)?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []), index = buttons.findIndex((button) => button === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
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
    failed: "Close", partial: "Issue", stopped: "Waiting", queued: "Clock",
  };
  const name = names[indicator.kind];
  return <span className="session-indicators">
    {name && <span className="session-mark" data-session-state={indicator.kind} role="img" aria-label={indicator.label} title={indicator.label}><Icon name={name} /></span>}
    {indicator.kind === "completed" && indicator.prUrl && <span className="session-pr-icon" data-pr-state={indicator.prState} role="img" aria-label={indicator.prLabel} title={indicator.prLabel}><Icon name="PR" /></span>}
  </span>;
}
function NavigationDialog({ edit, sdk, snapshot, close, chooseSession, detach }: { edit: Edit; sdk: MoguriSdk; snapshot: Snapshot; close: () => void; chooseSession: (id: string) => Promise<void>; detach: (session: Session) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(edit.kind === "color" ?
    (snapshot.projectConfigurations.find((entry) => entry.projectId === edit.project!.id) ?? defaultProjectConfiguration(edit.project!.id)).color :
    edit.kind === "folder-color" ? groupColor(edit.folder!) :
    edit.kind === "rename" ? edit.session!.title : edit.kind === "relocate" ? edit.project!.path : edit.kind === "attach" ? edit.session!.parentSessionId ?? "" : "");
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
  const titles: Record<EditKind, string> = { rename: "Rename", attach: "Attach session", group: "Session group", "new-group": "New session group", folder: "Project folder", "new-folder": "New project folder", "merge-projects": "New project group", color: "Project color", "folder-color": "Project group color", pr: "Session from PR", work: "Session from work item", relocate: "Change attached folder", "remove-project": "Remove project" };
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
        case "merge-projects":
          if (!edit.projects) throw new Error("The original project pair is missing. Start the drag again.");
          await sdk.projects.group(value, edit.projects); break;
        case "folder": if (!configuration) throw new Error("Project configuration is required."); await sdk.projects.organize(requiredProject().id, { folderId: value || null, color: configuration.color, order: configuration.order }, configuration.revision); break;
        case "color": if (!configuration) throw new Error("Project configuration is required."); await changeProjectColor(sdk, configuration, value); break;
        case "folder-color":
          if (!edit.folder) throw new Error("The originally selected project group is missing.");
          await sdk.projects.folder(edit.folder.name, edit.folder.order, edit.folder.id, edit.folder.revision, value); break;
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
        {staleArtifacts && <Alert as="p" tone="warning" className="settings-warning">The artifact set changed. Reload its impact before choosing.</Alert>}
      </>}<button type="button" disabled={busy || previewLoading} onClick={() => void loadArtifacts()}>Reload artifact preview</button></section>}
      <label className="check-setting"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand and confirm this removal.</label></> :
      edit.kind === "color" || edit.kind === "folder-color" ? <label className="setting-field">{edit.kind === "folder-color" ? "Custom group color" : "Custom project color"}<span className="project-custom-color"><input type="color" aria-label={edit.kind === "folder-color" ? "Custom group color" : "Custom project color"} value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} /><code>{value}</code></span></label> :
      choices ? <label className="setting-field">{edit.kind === "work" ? "Or choose a local work item" : "Destination"}<select aria-label="Destination" value={value} onChange={(event) => { setValue(event.target.value); setGithub(null); }}><option value="">{edit.kind === "work" ? "Choose local work item" : "None"}</option>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> :
        <label className="setting-field">{edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"}<input ref={nameInput} aria-label={edit.kind === "pr" ? "GitHub PR URL" : edit.kind === "relocate" ? "Existing absolute folder" : "Name"} autoFocus value={value} onChange={(event) => { setValue(event.target.value); setGithub(null); }} required={!github} /></label>}
    {edit.kind === "pr" && <p className="fine-print">Binds PR context without changing this folder's checkout or starting work.</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}<footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button className={destructive ? "danger" : "primary"} disabled={busy || previewLoading || staleArtifacts || artifactChoiceMissing || destructive && !confirmed || !destructive && !["attach", "group", "folder"].includes(edit.kind) && !value.trim() && !github} type="submit">{busy ? "Working..." : destructive ? "Delete" : edit.kind === "pr" || edit.kind === "work" ? "Start session" : "Save"}</button></footer>
  </form></dialog>;
}
