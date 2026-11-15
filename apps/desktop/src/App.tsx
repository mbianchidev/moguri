import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { activeDecision, sessionShortId, activeProjectWork, appearanceColors, continueWorkInput, conversationNavigation, pendingInputStatus, sessionIndicatorColors, sessionPullRequestUrl, themeVariable, shortcutMatches, DraftEditor, isRecord, sessionTitle as title, type ActivityEntry, type ContinueWorkReview, type ConversationNavigationEntry, type PublicMessage, type MoguriSdk, type Command, type Project, type Session, type Snapshot, type StoredEvent, type SessionPanel, type SlashResult, type ArtifactEditorRequest } from "../../../packages/sdk/src/index.ts";
import { useMoguri, useSessionActivity } from "../../../packages/sdk/src/react.ts";
import mascot from "../../../assets/moguri.svg";
import type { SettingsTab } from "./SettingsPanel.tsx";
import type { DesktopStartupStatus } from "./bridge.d.ts";
import { PolicyNavigationContext, policyLocations, type PolicyFocusRequest, type PolicyTarget } from "./PolicyHint.tsx";
import { Icon } from "./Icon.tsx";
import { CopyButton, SessionIdChip } from "./CopyButton.tsx";
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import { BrowserPanel, ChangesPanel, FilesPanel, HomeWriterReview, PlanPanel, SideChat } from "./SessionPanels.tsx";
import { SessionCoordinationPanel } from "./SessionCoordination.tsx";
import { InteractiveHtml } from "./InteractiveHtml.tsx";
import { CodeChangePane } from "./CodeChangePane.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { AttentionPanel, SuggestionsPanel, ConfigurationProposals } from "./EngagementPanels.tsx";
import { AttachmentChip } from "./ContextAttachments.tsx";
import { SandboxPanel } from "./SandboxPanel.tsx";
import { ModelAdvice, QuestionCard } from "./QuestionCard.tsx";
import { SessionBudgetSummary } from "./BudgetControls.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { MyWorkFiltersSchema, parse, type MyWorkFilters } from "../../../packages/sdk/src/index.ts";
import { ActivityRow, CurrentActivity, TurnActions } from "./ChatActivity.tsx";
import { NotificationAudio } from "./notification-audio.ts";
import { ApprovalActions } from "./ApprovalActions.tsx";
import { SessionGitHub } from "./SessionGitHub.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { ContinueWorkDialog } from "./ContinueWorkDialog.tsx";
import type { SessionActionOwner } from "./SessionActions.tsx";
import type { CommandClientAttachment, CommandExecution, CommandViewContext, CommandViewOutcome } from "../../../packages/sdk/src/index.ts";
import { Queue } from "./QueuedPrompts.tsx";
import { usePanelBadges } from "./PanelBadges.ts";
import { RepositoryProposal } from "./RepositoryProposal.tsx";
import { AnsweredQuestion, ConversationNavigation } from "./ConversationNavigation.tsx";
import { Alert } from "./Alert.tsx";
import { ProjectFolderActions, type ProjectFolderAction } from "./PanelFailure.tsx";
import { GhostPrompts, ScheduledPromptsPanel } from "./ScheduledPrompts.tsx";
import { createStartupView, isModelDiscoveryPending, readStartupView, saveStartupView, type StartupModel, type StartupView } from "./startup-cache.ts";
import { StartupModelContext } from "./StartupModelContext.ts";
import { CommandMessage } from "./CommandMessage.tsx";
const SettingsPanel = lazy(() => import("./SettingsPanel.tsx").then((module) => ({ default: module.SettingsPanel })));
const StartDialog = lazy(() => import("./StartDialog.tsx").then((module) => ({ default: module.StartDialog })));
const RichMessage = lazy(() => import("./RichMessage.tsx"));
const ProjectBoard = lazy(() => import("./ProjectBoard.tsx").then((module) => ({ default: module.ProjectBoard })));
const SessionTerminal = lazy(() => import("./SessionTerminal.tsx").then((module) => ({ default: module.SessionTerminal })));
type MoguriClient = MoguriSdk;

type Panel = SessionPanel;
const panels: Panel[] = ["Terminal", "Browser", "Insights", "Code change", "Files", "Plan", "Side chat", "Work item"];
const chatPanels: Panel[] = ["Terminal", "Browser", "Insights", "Plan", "Side chat"];
const availablePanels = (session?: Session): Panel[] => session && !session.projectId && !session.repositories ? chatPanels : panels;
const panelUnavailable = (panel: Panel) => `${panel} needs a project or project group chat. Chats show Side chat, Plan, Insights, Browser and Terminal.`;
const globalPanels = ["Suggestions", "Dashboard", "Attention"] as const;
const savedPanels: Panel[] = [...panels, ...globalPanels, "Artifacts", "Candidates", "Sandbox", "PR", "Changes"];
type GlobalView = typeof globalPanels[number] | "Automations";
const isGlobalPanel = (value: Panel): value is typeof globalPanels[number] => globalPanels.some((panel) => panel === value);
const resourceSettings = (panel: Panel): SettingsTab | null => panel === "Artifacts" ? "artifacts" : panel === "Candidates" ? "candidates" : panel === "Sandbox" ? "sendbox" : null;
const globalNavigation: { view: GlobalView; icon: string }[] = [
  { view: "Dashboard", icon: "Dashboard" }, { view: "Attention", icon: "Inbox" }, { view: "Suggestions", icon: "Suggestions" },
  { view: "Automations", icon: "Clock" },
];
const globalLabel = (view: GlobalView) => view === "Attention" ? "Inbox" : view;
const number = (value: number) => new Intl.NumberFormat().format(value);
interface SidebarLayout { panel: Panel; open: boolean; maximized: boolean; leftWidth: number; rightWidth: number }
function savedLayout(): SidebarLayout {
  const defaults: SidebarLayout = { panel: "Insights", open: true, maximized: false, leftWidth: 232, rightWidth: 288 };
  try {
    const raw = localStorage.getItem("moguri.sidebar");
    if (!raw) return defaults;
    const value: unknown = JSON.parse(raw);
    const panel = isRecord(value) ? value.panel === "Global Terminal" ? "Terminal" : savedPanels.find((panel) => panel === value.panel) : undefined;
    if (isRecord(value) && panel && typeof value.open === "boolean") {
      const width = (input: unknown, min: number, max: number, fallback: number) =>
        typeof input === "number" && Number.isFinite(input) ? Math.max(min, Math.min(max, Math.round(input))) : fallback;
      return { panel, open: value.open, maximized: value.maximized === true, leftWidth: width(value.leftWidth, 180, 400, defaults.leftWidth),
        rightWidth: width(value.rightWidth, 240, 640, value.wide === true ? 360 : defaults.rightWidth) };
    }
    console.error("Invalid sidebar preference; using the default layout.");
  } catch { console.error("Sidebar preferences are unavailable; using the default layout."); }
  return defaults;
}
function SidebarResizer({ side, value, min, max, onChange, controls }: {
  side: "left" | "right"; value: number; min: number; max: number; onChange: (width: number) => void; controls: string;
}) {
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const resize = (width: number) => onChange(Math.max(min, Math.min(max, Math.round(width))));
  return <div className={`sidebar-resizer ${side}`} role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={side === "left" ? "Resize projects sidebar" : "Resize session sidebar"} aria-controls={controls}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} pixels`}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, width: value };
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      if (start?.pointer === event.pointerId) resize(start.width + (event.clientX - start.x) * (side === "left" ? 1 : -1));
    }}
    onPointerUp={(event) => { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      resize(event.key === "Home" ? min : event.key === "End" ? max :
        value + (event.key === "ArrowRight" ? 16 : -16) * (side === "left" ? 1 : -1));
    }} />;
}
type Run = (action: () => Promise<unknown>) => Promise<void>;
function waitForCommandSurface(signal: AbortSignal, applied: () => boolean): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      observer.disconnect(); window.clearTimeout(timeout); signal.removeEventListener("abort", aborted);
      document.body.removeEventListener("toggle", check, true);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      try { signal.throwIfAborted(); if (applied()) finish(); }
      catch (error) { finish(error); }
    };
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => finish(new Error("The original queued view did not render within 10 seconds. Its acknowledgement remains incomplete; later queued input is held.")), 10_000);
    const aborted = () => finish(signal.reason ?? new Error("The original queued UI action was cancelled before it rendered."));
    signal.addEventListener("abort", aborted, { once: true });
    document.body.addEventListener("toggle", check, true);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    check();
  });
}
export interface AppProps {
  client: MoguriClient;
  startupScope?: string | null;
  startupView?: StartupView | null;
}
export function App({ client: initialClient, startupScope = null, startupView = null }: AppProps) {
  const [client, setClient] = useState(initialClient);
  const clients = useRef(new Set([initialClient]));
  const { snapshot, status, error: connectionError, events } = useMoguri(client);
  const restoredSession = startupView && startupView.storeId === initialClient.connection.storeId && startupView.profileId === initialClient.profileId ?
    initialClient.getState().snapshot?.sessions.find((session) => session.id === startupView.session?.id) : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(restoredSession?.id ?? null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [archived, setArchived] = useState(restoredSession?.status === "archived");
  const presentation = useRef(startupView), presentationSignature = useRef("");
  const [cachedModels, setCachedModels] = useState<{ storeId: string | undefined; profileId: string; models: readonly StartupModel[] }>({
    storeId: initialClient.connection.storeId, profileId: initialClient.profileId, models: startupView?.models ?? [],
  });
  const [layout] = useState(savedLayout);
  const [panel, setPanel] = useState<Panel>(isGlobalPanel(layout.panel) || resourceSettings(layout.panel) ? "Insights" : layout.panel === "PR" || layout.panel === "Changes" ? "Code change" : layout.panel);
  const [globalView, setGlobalView] = useState<GlobalView | null>(isGlobalPanel(layout.panel) ? layout.panel : null);
  const [inboxItemId, setInboxItemId] = useState<string | null>(null), [inboxFilters, setInboxFilters] = useState<MyWorkFilters | undefined>();
  const [globalSessionId, setGlobalSessionId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(layout.open);
  const [panelMaximized, setPanelMaximized] = useState(layout.maximized);
  const [leftWidth, setLeftWidth] = useState(layout.leftWidth), [rightWidth, setRightWidth] = useState(layout.rightWidth);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [panelTooltip, setPanelTooltip] = useState<{ panel: Panel; top: number } | null>(null);
  const [palette, setPalette] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notice, updateNotice] = useState<{ text: string; info: boolean } | null>(null);
  const setNotice = useCallback((text: string | null, info = false) => updateNotice(text ? { text, info } : null), []);
  useEffect(() => {
    let current = true;
    if (!client.getState().snapshot?.provider.login) void client.models.refresh().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The current profile's model availability could not be refreshed.";
      console.error("Startup model refresh failed:", message);
      if (current) setNotice(`${message} Inspect Providers settings; no sign-in, inference or substitute model was started.`);
    });
    return () => { current = false; };
  }, [client, setNotice]);
  useEffect(() => {
    const failed = (error: unknown) => setNotice(error instanceof Error ? error.message : "Notification audio failed. No alternate sound was substituted.");
    const audio = new NotificationAudio(failed);
    const stopAudio = window.moguri.onAudioStop(() => { void audio.close().catch(failed); });
    const stopErrors = window.moguri.onNativeError((profileId, message) => { if (profileId === client.profileId) setNotice(message); });
    const stopSounds = window.moguri.onNotificationAudio((profileId, sound) => { if (profileId === client.profileId) void audio.play(sound).catch(failed); });
    return () => { stopAudio(); stopErrors(); stopSounds(); void audio.close().catch(failed); };
  }, [client, setNotice]);
  const [busy, setBusy] = useState(false);
  const pendingRuns = useRef(0);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(resourceSettings(layout.panel));
  const [policyFocus, setPolicyFocus] = useState<PolicyFocusRequest | null>(null);
  const [settingsUnsaved, setSettingsUnsaved] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [panelDirty, setPanelDirty] = useState(false);
  const panelDirtyRef = useRef(false);
  const reportPanelDirty = useCallback((dirty: boolean) => { panelDirtyRef.current = dirty; setPanelDirty(dirty); }, []);
  const questionDirty = useRef(false);
  const questionDirtyChanged = useCallback((dirty: boolean) => { questionDirty.current = dirty; }, []);
  const [nativeModal, setNativeModal] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [terminalDismiss, setTerminalDismiss] = useState<{ action: () => void; cancel?: () => void } | null>(null);
  const [terminalIntent, setTerminalIntent] = useState<{ panel: Panel; sessionId: string | null; ownership?: "agent" } | null>(null);
  const [sideSessionId, setSideSessionId] = useState<string | null>(null);
  const [continueChoice, setContinueChoice] = useState<{ review: ContinueWorkReview; editor: DraftEditor;
    queued?: { context: CommandViewContext; settle(outcome: CommandViewOutcome): void } } | null>(null);
  const [sessionActionRequest, setSessionActionRequest] = useState<{ sessionId: string; action: "archive"; nonce: number; owner?: SessionActionOwner } | null>(null);
  const sessionActionRequestNonce = useRef(0);
  const [projectActionRequest, setProjectActionRequest] = useState<{ projectId: string; action: "relocate" | "remove-project"; nonce: number } | null>(null);
  const projectActionRequestNonce = useRef(0);
  const requestProjectAction = useCallback<ProjectFolderAction>((projectId, action) => {
    setNavOpen(true); setProjectActionRequest({ projectId, action, nonce: ++projectActionRequestNonce.current });
  }, []);
  const [suggestionsAll, setSuggestionsAll] = useState(true);
  const [artifactRequest, setArtifactRequest] = useState<ArtifactEditorRequest | null>(null);
  const switchingProfile = useRef(false);
  const [profilePending, setProfilePending] = useState(false);
  const panelVisible = panelOpen && !settingsTab && !boardOpen && !globalView;
  const panelExpanded = panelVisible && panelMaximized;
  const leftMax = Math.max(180, Math.min(400, viewportWidth - 44 - 340 - (panelVisible ? 240 : 0)));
  const navWidth = Math.min(leftWidth, leftMax);
  const rightMax = Math.max(240, Math.min(640, viewportWidth - 44 - 340 - navWidth));
  const contextWidth = Math.min(rightWidth, rightMax);
  const shellStyle: CSSProperties & { "--nav-width": string; "--context-width": string } = {
    "--nav-width": `${navWidth}px`, "--context-width": `${contextWidth}px`,
  };
  const editors = useRef(new Map<string, DraftEditor>());
  useEffect(() => {
    const resize = () => { setViewportWidth(window.innerWidth); setPanelTooltip(null); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => () => { for (const editor of editors.current.values()) editor.dispose(); for (const client of clients.current) client.disconnect(); }, []);
  useEffect(() => {
    if (snapshot) for (const [id, editor] of editors.current) if (!snapshot.sessions.some((session) => session.id === id)) { editor.dispose(); editors.current.delete(id); }
  }, [snapshot]);
  const session = snapshot?.sessions.find((session) => session.id === selectedId);
  const sessionPanels = availablePanels(session), shownPanel = sessionPanels.includes(panel) ? panel : "Insights";
  const panelBadges = usePanelBadges(client, session, snapshot);
  const globalSession = snapshot?.sessions.find((session) => session.id === globalSessionId);
  const globalProject = snapshot?.projects.find((project) => project.id === globalSession?.projectId);
  const activeWorkspace = snapshot?.managedWorkspaces.find((workspace) => workspace.id === session?.workspaceId);
  const pendingQuestion = snapshot?.questions.find((question) => question.id === session?.pendingQuestionId && question.status === "open");
  const decisionReview = snapshot?.decisions.find((record) => record.sessionId === session?.id && record.turnId === session?.turnId && activeDecision(record));
  const displayProjectId = boardOpen ? projectId : session ? session.projectId : projectId;
  const project = snapshot?.projects.find((project) => project.id === displayProjectId);
  const connectedPr = session && snapshot ? sessionPullRequestUrl(session, snapshot) : null;
  const continuedWork = snapshot?.projectWorkRuns.findLast((work) => work.originSessionId === session?.id);
  const editorFor = useCallback((target: Session) => {
    let value = editors.current.get(target.id);
    if (!value) { value = new DraftEditor(client, target.id, target.draft); editors.current.set(target.id, value); }
    return value;
  }, [client]);
  const editor = useMemo(() => session ? editorFor(session) : null, [editorFor, session?.id]);
  useEffect(() => {
    if (!startupScope || status !== "connected" || !snapshot || !client.connection.storeId) return;
    try {
      const previous = presentation.current?.profileId === client.profileId && presentation.current.storeId === client.connection.storeId ?
        presentation.current : readStartupView(localStorage, startupScope, client.profileId);
      const next = createStartupView(startupScope, client.connection.storeId, snapshot, selectedId, previous);
      const signature = JSON.stringify(next);
      if (presentationSignature.current === signature) return;
      saveStartupView(localStorage, next);
      presentation.current = next; presentationSignature.current = signature;
      setCachedModels((previous) => previous.storeId === next.storeId && previous.profileId === next.profileId &&
        JSON.stringify(previous.models) === JSON.stringify(next.models) ? previous : { storeId: next.storeId, profileId: next.profileId, models: next.models });
    } catch (error) {
      console.error("Moguri could not retain its startup presentation:", error instanceof Error ? error.message : "cache unavailable");
      updateNotice((previous) => previous ?? { text: "The last-view cache is unavailable. Live data and drafts are still owned by the service.", info: true });
    }
  }, [startupScope, snapshot, status, client, selectedId]);
  useEffect(() => {
    if (snapshot && (!selectedId || !snapshot.sessions.some((session) => session.id === selectedId))) { const target = snapshot.sessions.find((session) => session.status !== "archived") ?? snapshot.sessions[0]; setSelectedId(target?.id ?? null); setProjectId(target?.projectId ?? null); }
    if (snapshot) for (const [id, editor] of editors.current) if (!snapshot.sessions.some((session) => session.id === id)) { editor.dispose(); editors.current.delete(id); }
  }, [snapshot, selectedId]);
  useEffect(() => { if (session && editor) editor.receive(session.draft); }, [session?.draft.revision, editor]);
  useEffect(() => {
    const preference = snapshot?.settings.values.appearance ?? { theme: "dark" };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const mode = preference.theme === "system" ? media.matches ? "dark" : "light" : preference.theme;
      document.documentElement.dataset.theme = mode;
      const colors = appearanceColors(preference, mode);
      for (const [key, color] of Object.entries(colors)) document.documentElement.style.setProperty(themeVariable(key), color);
      for (const [suffix, background] of [["", colors.sidebar], ["-hover", colors.hover], ["-selected", colors.selected]] as const) {
        for (const [key, color] of Object.entries(sessionIndicatorColors(background))) document.documentElement.style.setProperty(`--session-${key}${suffix}`, color);
      }
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [JSON.stringify(snapshot?.settings.values.appearance)]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (panelDirtyRef.current || settingsUnsaved || profilePending || [...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [panelDirty, settingsUnsaved, profilePending]);
  useEffect(() => {
    try { localStorage.setItem("moguri.sidebar", JSON.stringify({ panel, open: panelOpen, maximized: panelMaximized, leftWidth, rightWidth })); }
    catch { setNotice("Sidebar preferences could not be saved. Session state is still owned by the service."); }
  }, [panel, panelOpen, panelMaximized, leftWidth, rightWidth]);
  useEffect(() => { if (!panelOpen) setPanelMaximized(false); }, [panelOpen]);
  const run: Run = async (action) => {
    setNotice(null); pendingRuns.current++; setBusy(true);
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "The operation failed. Your draft is preserved."); }
    finally { pendingRuns.current--; setBusy(pendingRuns.current > 0); }
  };
  const command = (command: Command) => run(() => client.command(command));
  const canChangePanel = () => {
    if (switchingProfile.current) { setNotice("A profile switch is in progress. Existing work stays in its original profile."); return false; }
    if (!settingsUnsaved && !panelDirtyRef.current) return true;
    setNotice("Save your edit or reload committed values before navigating. Your edit is preserved.");
    return false;
  };
  const canNavigate = () => {
    if (questionDirty.current) { setNotice("Send or cancel your custom answer before switching away. It has not been sent."); return false; }
    return canChangePanel();
  };
  const leaveSettings = () => { if (!canNavigate()) return false; setSettingsTab(null); setPolicyFocus(null); return true; };
  const leaveSurface = () => { if (!leaveSettings()) return false; setBoardOpen(false); setGlobalView(null); return true; };
  const beforeHidingTerminal = (action: () => void, cancel?: () => void) => {
    if (terminalDismiss) { cancel?.(); return; }
    const visible = !settingsTab && !boardOpen && !globalView && panelOpen && panel === "Terminal";
    const running = snapshot?.terminals.some((terminal) => terminal.sessionId === session?.id && !["closed", "failed", "acknowledged"].includes(terminal.status));
    if (visible && running && snapshot?.settings.values.interactions.confirmTerminalClose !== false) { setTerminalDismiss({ action, cancel }); return; }
    action();
  };
  const confirmTerminalNavigation = () => new Promise<boolean>((resolve) => beforeHidingTerminal(() => resolve(true), () => resolve(false)));
  const terminalOpeningHandled = (opening: typeof terminalIntent) => setTerminalIntent((intent) => intent === opening ? null : intent);
  const openSettings = (tab: SettingsTab, target?: PolicyTarget, prepare?: () => void) => { if (!canNavigate()) return; beforeHidingTerminal(() => {
    if (!settingsTab && tab !== "project") setSettingsProjectId(session ? session.projectId : projectId);
    prepare?.(); setBoardOpen(false); setGlobalView(null); setSettingsTab(tab); setPolicyFocus(target ? { target, id: crypto.randomUUID() } : null);
  }); };
  const openPolicy = (target: PolicyTarget, prepare?: () => void) => openSettings(policyLocations[target].tab, target, prepare);
  const settingsMenu = useRef(openSettings); settingsMenu.current = openSettings;
  useEffect(() => window.moguri.onOpenSettings(() => settingsMenu.current("general")), [client]);
  useEffect(() => window.moguri.onUpdateAvailable((_id, version) => setNotice(`Moguri ${version} is verified and staged. Open Settings / General to review installation and restart. Nothing has been replaced.`, true)), [setNotice]);
  const openBoard = () => { if (!canNavigate()) return; if (boardOpen) { setBoardOpen(false); return; } if (project) void openKanban(project.id); };
  const openGlobal = (view: GlobalView, sourceId: string | null = null, toggle = false) => {
    if (!canNavigate()) return;
    if (!toggle && globalView === view && globalSessionId === sourceId) return;
    beforeHidingTerminal(() => {
      if (toggle && globalView === view) { setGlobalView(null); return; }
      setSettingsTab(null); setBoardOpen(false); setGlobalSessionId(sourceId); setGlobalView(view); setNavOpen(false);
    });
  };
  const selectMainSession = (id: string, projectId: string | null, ownership?: "agent") => {
    if (panelOpen && panel === "Terminal" && (selectedId !== id || globalView !== null || boardOpen || settingsTab !== null)) {
      setTerminalIntent({ panel: "Terminal", sessionId: id, ownership });
    }
    setSelectedId(id); setProjectId(projectId);
  };
  const chooseSession = (id: string, ownership?: "agent") => run(async () => {
    if (!canNavigate() || (globalView || id !== session?.id) && !await confirmTerminalNavigation()) return;
    if (!leaveSurface()) return;
    await editor?.flush();
    const target = client.getState().snapshot?.sessions.find((session) => session.id === id);
    if (!target) throw new Error("This session was removed.");
    selectMainSession(id, target.projectId, ownership); setBoardOpen(target.purpose === "kanban"); setNavOpen(false); setSideSessionId(null);
    if (target.unread) await client.sessions.organize(id, { unread: false });
    const attention = client.getState().snapshot?.attention.filter((entry) => entry.sessionId === id && !entry.deleted && !entry.acknowledged && entry.reason !== "ci" && entry.reason !== "my-work").map((entry) => entry.id) ?? [];
    if (attention.length) await client.attention.acknowledge(attention.slice(-100));
  });
  const openKanban = (id: string) => run(async () => {
    if (!canNavigate() || !await confirmTerminalNavigation()) return;
    await editor?.flush();
    const opened = await client.kanban.open(id);
    if (!opened.id) throw new Error("The project's Kanban chat was not acknowledged.");
    if (!leaveSurface()) return;
    selectMainSession(opened.id, id); setBoardOpen(true); setArchived(false); setNavOpen(false); setSideSessionId(null);
  });
  const openSessionList = (toggleArchived: boolean) => {
    if (!canNavigate()) return;
    const navigate = () => { if (leaveSurface()) setArchived((value) => toggleArchived ? !value : false); };
    if (globalView) beforeHidingTerminal(navigate); else navigate();
  };
  const openProfile = async (id: string, targetSessionId?: string) => {
    if (!canNavigate() || nativeModal || terminalDismiss || palette || composerMenuOpen) throw new Error("Save/discard local edits and close menus or dialogs before switching profiles.");
    if (snapshot?.jobs.some((job) => ["voice.record", "voice.capture"].includes(job.kind) && job.status === "running")) throw new Error("Stop owned dictation before switching profiles. Audio is not moved to another profile.");
    if (!await confirmTerminalNavigation()) return;
    switchingProfile.current = true; setBusy(true); setProfilePending(true);
    let next: MoguriSdk | undefined;
    try {
      for (const editor of editors.current.values()) await editor.flush();
      next = await client.profiles.open(id);
      if (targetSessionId && !next.getState().snapshot?.sessions.some((session) => session.id === targetSessionId)) throw new Error("The notification's session was removed from its actual profile.");
      await window.moguri.profile(id);
      for (const editor of editors.current.values()) editor.dispose(); editors.current.clear();
      client.disconnect(); clients.current.delete(client); clients.current.add(next); setClient(next);
      let remembered: StartupView | null = null;
      if (startupScope && next.connection.storeId) {
        try {
          const cached = readStartupView(localStorage, startupScope, next.profileId);
          if (cached?.storeId === next.connection.storeId) remembered = cached;
        } catch (error) { console.error("The selected profile's startup view is unavailable:", error instanceof Error ? error.message : "cache invalid"); }
      }
      const restored = next.getState().snapshot?.sessions.find((session) => session.id === (targetSessionId ?? remembered?.session?.id));
      setSelectedId(restored?.id ?? null); setProjectId(null); setSettingsProjectId(null); setArchived(restored?.status === "archived"); setSettingsTab(null); setPolicyFocus(null); setBoardOpen(false); setGlobalView(null); setGlobalSessionId(null); setSideSessionId(null); setTerminalIntent(null);
      setPalette(false); setArtifactRequest(null); setSessionActionRequest(null); setNotice(null);
      setInboxItemId(null); setInboxFilters(undefined);
      return next;
    } catch (error) { next?.disconnect(); throw error; }
    finally { switchingProfile.current = false; setBusy(false); setProfilePending(false); }
  };
  useEffect(() => window.moguri.onNavigateSession((id, profileId) => {
    if (profileId === client.profileId) void chooseSession(id);
    else void openProfile(profileId, id).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Notification profile could not be opened."));
  }), [chooseSession, client.profileId]);
  const openInbox = (id: string) => {
    if (!canNavigate()) return;
    setInboxItemId(id); setInboxFilters({ itemId: id, state: "all" }); openGlobal("Dashboard", null);
  };
  useEffect(() => window.moguri.onNavigateWork((id, profileId) => {
    void (async () => {
      if (profileId !== client.profileId) {
        const target = await openProfile(profileId);
        if (!target || target.profileId !== profileId) return;
        setInboxItemId(id); setInboxFilters({ itemId: id, state: "all" }); setGlobalSessionId(null); setGlobalView("Dashboard");
      } else openInbox(id);
    })().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "The exact notification profile/item could not be opened."));
  }), [client.profileId, openProfile]);
  useEffect(() => window.moguri.onNavigateInbox((id, profileId) => {
    void (async () => {
      if (profileId === client.profileId && !canNavigate()) return;
      const target = profileId === client.profileId ? client : await openProfile(profileId);
      if (!target || target.profileId !== profileId) return;
      if (!target.getState().snapshot?.attention.some((entry) => entry.id === id && entry.reason === "script-review")) {
        throw new Error("The original script notification is unavailable in this profile. No different review was opened.");
      }
      if (target === client) openGlobal("Attention", null, true);
      else { setGlobalSessionId(null); setGlobalView("Attention"); }
    })().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "The original script notification could not be opened."));
  }), [client, openProfile]);
  const chooseProject = (id: string | null) => {
    if (!canNavigate()) return;
    if (boardOpen && id === projectId) { setBoardOpen(false); return; }
    const target = snapshot?.sessions.find((session) => session.projectId === id && session.status !== "archived");
    const navigate = () => {
      setProjectId(id);
      if (boardOpen || !target) return;
      if (globalView || settingsTab) setSelectedId(target.id);
      else selectMainSession(target.id, target.projectId);
    };
    if (!globalView && !boardOpen && target && target.id !== session?.id) beforeHidingTerminal(navigate); else navigate();
  };
  const projectSettings = (id: string) => { if (!canNavigate()) return; if (settingsTab === "project" && settingsProjectId === id) { leaveSettings(); return; } setSettingsProjectId(id); openSettings("project"); };
  const projectTerminal = (id: string) => {
    if (!canNavigate()) return;
    beforeHidingTerminal(() => void run(async () => {
      await editor?.flush();
      const state = client.getState().snapshot;
      if (!state?.projects.some((project) => project.id === id)) throw new Error("This project was removed. No terminal or hidden chat was created.");
      const target = state.sessions.find((value) => value.id === selectedId && value.projectId === id && value.status !== "archived" && value.kind !== "subagent") ??
        state.sessions.find((value) => value.projectId === id && value.status !== "archived" && value.kind !== "subagent");
      if (!target) throw new Error("Create or select a session in this project first. No global terminal or hidden chat was created.");
      if (!leaveSurface()) return;
      selectMainSession(target.id, target.projectId); setPanel("Terminal"); setPanelOpen(true); setTerminalIntent({ panel: "Terminal", sessionId: target.id });
    }));
  };
  const hidePanel = () => {
    if (!canChangePanel()) return;
    beforeHidingTerminal(() => {
      setPanelOpen(false);
      document.querySelector<HTMLButtonElement>(`[data-sidebar-panel="${shownPanel}"]`)?.focus();
    });
  };
  const showPanel = (next: Panel, ownership?: "agent") => run(async () => {
    if (next === "PR" || next === "Changes") next = "Code change";
    const settings = resourceSettings(next);
    if (settings) { openSettings(settings); return; }
    if (isGlobalPanel(next)) { openGlobal(next, session?.id ?? null); return; }
    if (!sessionPanels.includes(next)) throw new Error(panelUnavailable(next));
    if (!canNavigate() || panelVisible && shownPanel === next && !ownership) return;
    beforeHidingTerminal(() => {
      if (!leaveSurface()) return;
      if (next === "Terminal") setTerminalIntent({ panel: next, sessionId: session?.id ?? null, ownership });
      setPanel(next); setPanelOpen(true);
    });
  });
  const openSessionPanel = async (next: Panel) => {
    const target = next === "PR" || next === "Changes" ? "Code change" : next;
    if (!isGlobalPanel(target) && !resourceSettings(target) && !sessionPanels.includes(target)) throw new Error(panelUnavailable(target));
    await showPanel(target);
  };
  const applySlash = async (result: SlashResult) => {
    if (result.kind === "github-view") throw new Error("This retained GitHub picker belongs to its actual TUI binding, not a replacement desktop view.");
    if (result.kind === "client-view") {
      if (result.name === "sessions") { openSessionList(false); return; }
      if (result.name === "session") { if (!leaveSurface()) throw new Error("Save or reload the current edit before returning to the original conversation."); return; }
      if (result.name === "work-items") { await openSessionPanel("Work item"); return; }
      if (result.name === "code-requests") { await openSessionPanel("Code change"); return; }
      if (result.name === "my-work") {
        if (!canNavigate()) throw new Error("Save/discard the current edit before opening the inbox.");
        setInboxItemId(null); setInboxFilters(parse(MyWorkFiltersSchema, JSON.parse(result.argument))); openGlobal("Dashboard", null); return;
      }
      if (result.name === "sidebar") {
        if (result.argument && !["open", "close"].includes(result.argument)) throw new Error("Use /sidebar [open|close].");
        if (result.argument === "close" || !result.argument && panelVisible) hidePanel();
        else await showPanel(isGlobalPanel(shownPanel) || resourceSettings(shownPanel) ? "Insights" : shownPanel);
        return;
      }
      throw new Error(`This desktop binding has no handler for ${result.name}. The queued action was not acknowledged or sent to a model.`);
    }
    if (result.kind === "continue-work") {
      const target = client.getState().snapshot?.sessions.find((session) => session.id === result.review.sessionId);
      if (!target || result.review.profileId !== client.profileId) throw new Error("The actual continuation owner changed. No draft was consumed.");
      setContinueChoice({ review: result.review, editor: editorFor(target) }); return;
    }
    if (result.kind === "profiles") { openSettings("general"); return; }
    if (result.kind === "profile") { await openProfile(result.profileId); return; }
    if (result.kind === "ok") { setNotice(result.message, true); return; }
    if (result.kind === "text") return;
    if (result.kind === "copy") { await window.moguri.copyText(result.text); setNotice("Copied.", true); return; }
    if (result.kind === "export") { const saved = await window.moguri.saveDocument(result.document); setNotice(saved ? `Export saved to ${saved.path}.` : "Export cancelled. Stored copies are unchanged.", true); return; }
    if (result.kind === "artifact-editor") {
      if (!canNavigate()) throw new Error("Save your current edit before opening another retained document.");
      setArtifactRequest(result.artifact); await showPanel("Artifacts"); return;
    }
    if (result.kind === "session") {
      if (result.side) { setSideSessionId(result.sessionId); await showPanel("Side chat"); }
      else await chooseSession(result.sessionId);
      return;
    }
    if (result.panel === "Suggestions") { setSuggestionsAll(result.allProjects ?? true); openGlobal("Suggestions", result.allProjects === false ? session?.id ?? null : null); }
    else if (result.panel === "Settings") openSettings("general");
    else if (result.panel === "Models") { document.querySelector<HTMLButtonElement>('[data-composer-control="model"]')?.click(); }
    else if (result.panel === "Queue") {
      const queue = document.querySelector(".queue");
      if (queue) queue.scrollIntoView({ block: "nearest" });
      else setNotice("No undispatched prompts or commands remain in this session's queue.", true);
    }
    else await openSessionPanel(result.panel);
  };
  const handleSlash = async (target: Session, draft: DraftEditor, text: string, held = false) => {
    if (target.status === "archived" && text.trim() === "/restore") {
      await client.commands.restore(target.id, "desktop", target.revision, held);
      if (draft.getState().text === text) draft.reload();
      return;
    }
    if (!text.startsWith("/") && target.projectId && continueWorkInput(text)) {
      const review = await draft.reviewContinueWork();
      setContinueChoice({ review, editor: draft }); return;
    }
    if (draft.getState().text !== text || draft.getState().conflict) throw new Error("The original command draft changed. Its newer text was preserved; submit it explicitly.");
    await draft.submit((expectedDraftRevision) => client.commands.submit(target.id, { client: "desktop", expectedDraftRevision, delivery: "queue", held }));
  };
  const commandAttachment = useRef<CommandClientAttachment | null>(null);
  const commandUi = useRef<{ canApply(execution: CommandExecution): boolean; apply(context: CommandViewContext): Promise<CommandViewOutcome> } | null>(null);
  commandUi.current = {
    canApply: (execution) => execution.sessionId === selectedId && execution.profileId === client.profileId && !settingsTab && !settingsUnsaved && !panelDirty &&
      !questionDirty.current && !switchingProfile.current && !profilePending && !nativeModal && !terminalDismiss && !startOpen && !palette,
    apply: async (context) => {
      context.signal.throwIfAborted();
      if (context.sdk !== client || context.sessionId !== selectedId || !canNavigate()) throw new Error("The original queued UI owner or its saved edit changed. No replacement conversation was used.");
      const result = context.result;
      if (result.kind === "client-view" && result.name === "archive") {
        return new Promise<CommandViewOutcome>((resolve, reject) => {
          const nonce = ++sessionActionRequestNonce.current;
          const clear = () => setSessionActionRequest((value) => value?.nonce === nonce ? null : value);
          const abort = () => { clear(); reject(context.signal.reason ?? new Error("The original archive UI owner ended.")); };
          context.signal.addEventListener("abort", abort, { once: true });
          setSessionActionRequest({ sessionId: context.sessionId, action: "archive", nonce, owner: { signal: context.signal, settle: (outcome) => {
            context.signal.removeEventListener("abort", abort); clear(); resolve({ outcome, ...(outcome === "completed" ? {} :
              { diagnostic: outcome === "cancelled" ? "The actual user cancelled this exact archive review." : "The original archive view could not be applied. No replacement session was archived." }) });
          } } });
          if (context.signal.aborted) abort();
        });
      }
      if (result.kind === "continue-work") {
        const target = client.getState().snapshot?.sessions.find((session) => session.id === context.sessionId);
        if (!target || !("command" in result.review)) throw new Error("The original queued continuation review is unavailable. No saved composer was substituted.");
        return new Promise<CommandViewOutcome>((resolve, reject) => {
          const clear = () => setContinueChoice((value) => value?.queued?.context.execution.id === context.execution.id ? null : value);
          const abort = () => { clear(); reject(context.signal.reason ?? new Error("The exact queued continuation owner ended.")); };
          context.signal.addEventListener("abort", abort, { once: true });
          const settle = (outcome: CommandViewOutcome) => { context.signal.removeEventListener("abort", abort); clear(); resolve(outcome); };
          setContinueChoice({ review: result.review, editor: editorFor(target), queued: { context, settle } });
          if (context.signal.aborted) abort();
        });
      }
      if (result.kind === "copy") { await window.moguri.copyText(result.text); setNotice("Copied.", true); return { outcome: "completed" }; }
      if (result.kind === "export") {
        const saved = await window.moguri.saveDocument(result.document);
        setNotice(saved ? `Export saved to ${saved.path}.` : "Export cancelled. Original stored copies are unchanged.", true);
        return { outcome: saved ? "completed" : "cancelled" };
      }
      const sidebarOpen = result.kind === "client-view" && result.name === "sidebar" ?
        result.argument === "open" || result.argument !== "close" && !panelVisible : null;
      await applySlash(result);
      await waitForCommandSurface(context.signal, () => {
        const shell = document.querySelector<HTMLElement>(".app-shell");
        if (!shell || shell.inert) return false;
        if (result.kind === "profile") return shell.dataset.profileId === result.profileId;
        if (shell.dataset.profileId !== context.execution.profileId) return false;
        if (result.kind === "session") return result.side ? shell.dataset.sideSessionId === result.sessionId &&
          document.querySelector<HTMLElement>(".side-read-only")?.dataset.sideSessionId === result.sessionId : shell.dataset.sessionId === result.sessionId;
        if (result.kind === "profiles") return Boolean(document.querySelector('[data-settings-tab="general"]'));
        if (result.kind === "artifact-editor") {
          const editor = document.querySelector<HTMLElement>(".artifact-panel");
          return editor?.dataset.editingArtifactId === (result.artifact.id ?? "new") && editor.dataset.editingRevision === String(result.artifact.revision);
        }
        if (result.kind === "client-view") {
          if (result.name === "session") return shell.dataset.sessionId === context.sessionId && !document.querySelector(".settings-layout, .global-page");
          if (result.name === "sessions") return shell.classList.contains("nav-open") && Boolean(document.querySelector('.nav-tabs button[aria-pressed="true"]')?.textContent?.includes("Sessions"));
          if (result.name === "sidebar") return shell.classList.contains("context-open") === sidebarOpen;
          if (result.name === "my-work") {
            const inbox = document.querySelector<HTMLElement>(".my-work-inbox[data-ready='true']");
            return Boolean(inbox && inbox.dataset.filters === result.argument);
          }
          const target = result.name === "work-items" ? "Work item" : result.name === "code-requests" ? "Code change" : null;
          return target !== null && shell.classList.contains("context-open") && document.querySelector<HTMLElement>("#session-sidebar")?.dataset.sessionPanel === target;
        }
        if (result.kind !== "panel") return true;
        if (result.panel === "Models") return Boolean(document.querySelector('.model-popover[role="dialog"]:popover-open'));
        if (result.panel === "Queue") return Boolean(document.querySelector(".queue, .notice.info"));
        if (result.panel === "Settings") return Boolean(document.querySelector('[data-settings-tab="general"]'));
        const settings = resourceSettings(result.panel);
        if (settings) return Boolean(document.querySelector(`[data-settings-tab="${settings}"]`));
        if (isGlobalPanel(result.panel)) return Boolean(document.querySelector(`.global-page[aria-label="${result.panel} workspace"]`));
        const side = document.querySelector<HTMLElement>("#session-sidebar"), expected = result.panel === "PR" || result.panel === "Changes" ? "Code change" : result.panel;
        return shell.classList.contains("context-open") && side?.dataset.sessionPanel === expected && side.dataset.sourceSessionId === context.sessionId;
      });
      return { outcome: "completed" };
    },
  };
  useEffect(() => {
    if (status !== "connected") return;
    let closed = false, attached: CommandClientAttachment | undefined;
    const apply = (context: CommandViewContext) => {
      const owner = commandUi.current;
      if (!owner) throw new Error("The actual queued UI owner is closed.");
      return owner.apply(context);
    };
    void client.commands.attach("desktop", {
      panel: apply, session: apply, profiles: apply, profile: apply, copy: apply, export: apply, "artifact-editor": apply, "continue-work": apply,
      "client-view:session": apply, "client-view:sessions": apply, "client-view:work-items": apply, "client-view:code-requests": apply, "client-view:sidebar": apply, "client-view:archive": apply,
      "client-view:my-work": apply,
    }, { canApply: (execution) => !closed && (commandUi.current?.canApply(execution) ?? false), onError: (error) => setNotice(error.message) })
      .then((value) => { attached = value; if (closed) return value.dispose(); commandAttachment.current = value; })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "The original queued UI client could not attach."));
    return () => {
      closed = true; if (commandAttachment.current === attached) commandAttachment.current = null;
      if (attached) void attached.dispose().catch((error: unknown) => console.error("Queued UI detach remains unconfirmed:", error instanceof Error ? error.message : "original client cleanup failed"));
    };
  }, [client, status]);
  useEffect(() => { commandAttachment.current?.wake(); }, [selectedId, settingsTab, settingsUnsaved, panelDirty, profilePending, nativeModal, terminalDismiss, startOpen, palette]);
  const closeStart = () => { setStartOpen(false); document.querySelector<HTMLButtonElement>(".start-trigger")?.focus(); };
  const openStart = () => { if (canNavigate()) setStartOpen(true); };
  const startSession = async (projectId: string | null) => {
    if (!canNavigate()) throw new Error("Save existing edits before starting a new chat.");
    if (!await confirmTerminalNavigation()) return;
    if (!leaveSurface()) throw new Error("Save existing edits before starting a new chat.");
    await editor?.flush();
    const result = await client.sessions.create(projectId);
    if (!result.id) throw new Error("The new chat was not acknowledged. Existing drafts are preserved.");
    selectMainSession(result.id, projectId); setArchived(false); setNavOpen(false); setBoardOpen(false); setSideSessionId(null); closeStart();
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || switchingProfile.current || nativeModal || terminalDismiss || composerMenuOpen || event.target instanceof Element && event.target.closest(".ghostty-host, .shortcut-field")) return;
      if (shortcutMatches(event, snapshot?.settings.values.shortcuts?.commands ?? "Primary+KeyK")) { event.preventDefault(); if (!event.repeat) setPalette((open) => !open); }
      if (event.key === "Escape") { setPalette(false); setNavOpen(false); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [nativeModal, terminalDismiss, composerMenuOpen, snapshot?.settings.values.shortcuts?.commands]);
  const chatContent = session && snapshot ? <>
    <HomeWriterReview key={`${client.profileId}:${session.id}`} sdk={client} session={session} snapshot={snapshot} chooseSession={chooseSession} />
    {activeWorkspace?.status === "creating" && <p className="fine-print" role="status">Preparing the isolated worktree. Queued prompts wait for its actual root; the original checkout is not used.</p>}
    {session.toolRecovery?.turnId === session.turnId && <Alert as="p" tone="warning" role="status">The agent is continuing read-only recovery. An original tool still has unconfirmed effects or cleanup; further writes remain fenced.</Alert>}
    {continuedWork && <section className="continuation-status" role="status" aria-label="Project work status">
      <div><strong>{continuedWork.source.title}</strong><p>{continuedWork.status} / one delegated {continuedWork.controls.autonomy} task to its PR; this chat's controls are unchanged.</p>
        {continuedWork.diagnostic && <p>{continuedWork.diagnostic}</p>}</div>
      {continuedWork.sessionId && snapshot.sessions.some((session) => session.id === continuedWork.sessionId) && <button type="button" onClick={() => void chooseSession(continuedWork.sessionId!)}>Open task</button>}
      {activeProjectWork(continuedWork) && <button type="button" onClick={() => void run(() => client.kanban.cancel(continuedWork.id))}>Stop task</button>}
      {continuedWork.prUrl && <button type="button" onClick={() => void run(async () => { await window.moguri.openExternal(continuedWork.prUrl!); })}>Open published PR</button>}
    </section>}
    <Timeline key={JSON.stringify([client.profileId, session.id])} session={session} editor={editorFor(session)} snapshot={snapshot} run={run} client={client} modal={setNativeModal} />
    {pendingQuestion && <QuestionCard key={pendingQuestion.id} sdk={client} question={pendingQuestion} onDirty={questionDirtyChanged} decisionPending={decisionReview?.source.kind === "question" && decisionReview.source.questionId === pendingQuestion.id} />}
    {session.kind === "metachat" && <ConfigurationProposals sdk={client} snapshot={snapshot} session={session} modal={setNativeModal} />}
    <RepositoryProposal key={`${client.profileId}:${session.id}`} sdk={client} session={session} snapshot={snapshot} />
    {session.pendingApproval && <section className="approval" aria-label="Tool approval">
      <div className="approval-heading"><span className="attention-dot" /><strong>Your approval is required</strong><span>{session.controls.autonomy}</span></div>
      {decisionReview?.source.kind === "tool" && decisionReview.source.approvalId === session.pendingApproval.id &&
        <p className="fine-print" role="status">A separately metered decision provider is reviewing the existing exact delegation. You can override it now; your actual answer wins and cancelled usage may remain held.</p>}
      <p><strong>{session.pendingApproval.call.name}</strong>{session.pendingApproval.call.name === "run_script" ? session.controls.env === "Sandbox" ? " will execute the exact reviewed bytes inside the approved SendBox boundary, not the Local source checkout. The agent's assessment is not permission or a safety guarantee." : " will execute the exact reviewed script on your Mac without sandbox isolation. The agent's assessment is not permission or a safety guarantee." : session.pendingApproval.call.name === "run_command" ? session.controls.env === "Remote" ? " will run on the configured SSH host, not inside SendBox." : session.controls.env === "Sandbox" ? " will run inside the approved SendBox boundary." : " will run on your Mac without sandbox isolation." : session.pendingApproval.call.name === "mcp_gateway" ? " may access host code or external services through the configured MCP. Review the exact server, tool and arguments." : session.pendingApproval.call.name === "run_subagent" ? " will send the approved context to a separate, tool-less model call." : session.pendingApproval.call.name.startsWith("propose_") ? " will create a pending proposal, not apply or enable it." : " will use the displayed session capability and scope."}</p>
      {session.controls.env === "Local" && session.homeRoot && <p className="fine-print path">Local chat directory: {session.homeRoot.root}</p>}
      <pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre>
      {session.pendingApproval.recommendation && session.pendingApproval.recommendationSource?.stepId === session.pendingApproval.stepId && session.pendingApproval.recommendationSource.callId === session.pendingApproval.call.id ?
        <ModelAdvice text={session.pendingApproval.recommendation} source={session.pendingApproval.recommendationSource} /> :
        session.controls.autonomy === "Guided" && <p className="fine-print">The current solver supplied no explicit recommendation. Review the exact arguments; only your decision or an existing deterministic grant can authorize this action.</p>}
      <ApprovalActions key={session.pendingApproval.id} sdk={client} session={session} busy={busy} run={run} />
    </section>}
    {session.queue.length > 0 && <Queue key={JSON.stringify(["queue", client.profileId, session.id])} session={session} command={command} client={client} modal={setNativeModal} />}
    {editor && <ChatComposer key={session.id} session={session} project={project && activeWorkspace ? { ...project, path: activeWorkspace.path } : project} snapshot={snapshot} client={client} editor={editor} run={run} busy={busy} connected={status === "connected"} onConnect={() => openSettings("providers")} onSlash={handleSlash} onMenuChange={setComposerMenuOpen} onGuardrails={() => openSettings("permissions")} onLocalModels={() => openSettings("localModels")} onRemote={() => openSettings("remote")} onSandbox={() => openSettings("sendbox")} onRouting={() => openSettings("kupo")} onDecisions={() => openSettings("decisions")} />}
  </> : null;
  const presentationModels = status === "connected" && snapshot && isModelDiscoveryPending(snapshot.provider) &&
    cachedModels.profileId === client.profileId && cachedModels.storeId === client.connection.storeId ? cachedModels.models : [];
  const inboxUnread = Boolean(snapshot?.settings.values.notifications.inApp && snapshot.attention.some((entry) => entry.active && !entry.acknowledged));
  return <StartupModelContext.Provider value={presentationModels}><PolicyNavigationContext.Provider value={openPolicy}><ProjectFolderActions.Provider value={requestProjectAction}><div inert={profilePending} aria-busy={profilePending} style={shellStyle}
    data-profile-id={client.profileId} data-session-id={selectedId ?? ""} data-side-session-id={sideSessionId ?? ""}
    className={`app-shell ${navOpen ? "nav-open" : ""} ${panelVisible ? "context-open" : ""} ${panelExpanded ? "context-maximized" : ""}`}>
    <header className="titlebar">
      <div className="wordmark"><img className="brand-mascot" src={mascot} alt="" /><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">{globalView ? globalLabel(globalView) : project?.name ?? "Chats"}</span>
    </header>
    <nav id="project-navigation" className="project-nav" aria-label="Projects and sessions">
      <SidebarResizer side="left" value={navWidth} min={180} max={leftMax} onChange={setLeftWidth} controls="project-navigation" />
      <div className="nav-heading"><span>Workspace</span></div>
      <button className="new-session start-trigger" aria-label="New" onClick={openStart} disabled={busy || !snapshot}><Icon name="Plus" />New</button>
      <div className="nav-scroll">
      <nav className="global-navigation" aria-label="Profile resources">{globalNavigation.map(({ view, icon }) => <button key={view} className="settings-nav-button" aria-label={globalLabel(view)} aria-description={view === "Attention" && inboxUnread ? "Unread notifications" : undefined} aria-pressed={globalView === view} onClick={() => openGlobal(view, null, true)}><Icon name={icon} />{globalLabel(view)}{view === "Attention" && inboxUnread && <span className="attention-unread-dot" aria-hidden="true" />}</button>)}</nav>
      <div className="nav-tabs"><button aria-pressed={!archived && !boardOpen} onClick={() => openSessionList(false)}>Sessions</button><button aria-pressed={archived && !boardOpen} onClick={() => openSessionList(true)}>Archived</button><button aria-pressed={boardOpen} disabled={!project} onClick={openBoard}>Issues</button></div>
      {snapshot && <WorkspaceNavigation key={client.profileId} sdk={client} snapshot={snapshot} selectedId={selectedId} archived={archived} busy={busy} chooseSession={chooseSession} chooseProject={chooseProject} startChat={() => startSession(null)} openKanban={openKanban} settings={projectSettings} terminal={projectTerminal} modal={setNativeModal} allow={canNavigate} prepareSession={async (id) => { await editors.current.get(id)?.flush(); }}
        setupSandbox={() => openSettings("sendbox")}
        sessionActionRequest={sessionActionRequest} onSessionActionRequestHandled={(nonce) => setSessionActionRequest((request) => request?.nonce === nonce ? null : request)}
        projectActionRequest={projectActionRequest} onProjectActionRequestHandled={(nonce) => setProjectActionRequest((request) => request?.nonce === nonce ? null : request)} />}
      </div>
      <div className="nav-footer">
        <div className="profile-actions">
        {snapshot && <div className="profile-indicator" aria-label="Current profile">{snapshot.profile?.color && <span className="status-dot" style={{ backgroundColor: snapshot.profile.color }} />}<span>{snapshot.profile?.name ?? client.profileId}</span></div>}
        <Tooltip content="Ask Moguri"><button className="icon-button" aria-label="ask Moguri" onClick={() => void run(async () => { if (!canNavigate()) return; const result = await client.metachat.create(session ? session.projectId : projectId, session?.id); await chooseSession(result.id!); })}><img className="ask-mascot" src={mascot} alt="" /></button></Tooltip>
        <Tooltip content="Settings"><button className="icon-button" aria-label="Settings" aria-pressed={settingsTab !== null} onClick={() => { if (settingsTab) leaveSettings(); else openSettings("general"); }}><Icon name="Settings" /></button></Tooltip>
        </div>
        <div className="connection-line"><span className={`status-dot ${status === "connected" ? "completed" : "failed"}`} />Local service {status}</div>
      </div>
    </nav>
    <main className="main-pane" inert={panelExpanded} style={panelExpanded ? { display: "none" } : undefined}>
      {(notice || connectionError) && <Alert className={`notice ${notice?.info && !connectionError ? "info" : "error"}`} role={notice?.info && !connectionError ? "status" : "alert"} onDismiss={() => setNotice(null)}>{connectionError ?? notice?.text}</Alert>}
      {boardOpen && snapshot && project ? <Suspense fallback={<div className="loading-state" role="status">Loading project Kanban...</div>}><ProjectBoard key={project.id} sdk={client} project={project} snapshot={snapshot} onBack={leaveSurface} onUnsavedChange={setSettingsUnsaved} onSettings={() => projectSettings(project.id)} openSession={chooseSession}>{chatContent}</ProjectBoard></Suspense> :
      settingsTab && snapshot ? <Suspense fallback={<div className="loading-state" role="status">Loading shared SDK settings...</div>}><SettingsPanel sdk={client} snapshot={snapshot} session={(session?.projectId ?? null) === (project?.id ?? null) ? session : undefined} project={project} configurationProjectId={settingsProjectId} selectConfigurationProject={setSettingsProjectId} initialTab={settingsTab} policyFocus={policyFocus} artifactRequest={artifactRequest} onArtifactRequestHandled={() => setArtifactRequest(null)} onBack={leaveSettings} onUnsavedChange={setSettingsUnsaved} onSwitchProfile={async (id) => { await openProfile(id); }} openSession={(id) => { void chooseSession(id); }} prepareMaintenance={async () => {
        if (panelDirty || switchingProfile.current) throw new Error("Finish the actual panel edit or profile switch before whole-store maintenance.");
        for (const editor of editors.current.values()) await editor.flush();
        if ([...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) throw new Error("A saved draft is still pending. No application restart was requested.");
      }} openTerminal={() => { setTerminalIntent({ panel: "Terminal", sessionId: session?.id ?? null }); setSettingsTab(null); setSettingsUnsaved(false); setPanel("Terminal"); setPanelOpen(true); }} /></Suspense> :
      globalView && snapshot ? <section className="global-page" aria-label={`${globalLabel(globalView)} workspace`}>
        <header className="global-toolbar"><button className="icon-button" aria-label="Back to chat" onClick={() => { if (canNavigate()) beforeHidingTerminal(() => { leaveSurface(); }); }}><Icon name="Back" /></button><h1>{globalLabel(globalView)}</h1>
          {globalView === "Suggestions" && <label>Scope<select aria-label="Resource source chat" value={globalSessionId ?? ""} onChange={(event) => { if (canNavigate()) setGlobalSessionId(event.target.value || null); }}>
            <option value="">All projects</option>{globalSessionId && !globalSession && <option value={globalSessionId} disabled>Source chat removed; choose a current scope</option>}{snapshot.sessions.filter((session) => session.status !== "archived" && session.kind !== "subagent").map((session) => <option key={session.id} value={session.id}>{title(session)}</option>)}
          </select></label>}
        </header>
        <div className={`global-content panel-${globalView.toLowerCase().replaceAll(" ", "-")}`}>{globalView === "Automations" ? <ScheduledPromptsPanel sdk={client} snapshot={snapshot} run={run} openSession={(id) => void chooseSession(id)} /> :
          <ContextPanel key={`${client.profileId}-${globalView}-${globalSessionId}`} panel={globalView} session={globalSession} project={globalProject} events={events} client={client} run={run} snapshot={snapshot} prUrl={null} sideId={null} selectSide={setSideSessionId} onDirty={reportPanelDirty} onSlash={handleSlash} editorFor={editorFor} suggestionsAll={suggestionsAll} chooseSession={chooseSession} openSettings={openSettings} setupSandbox={() => openSettings("sendbox")} modal={setNativeModal} nativeAllowed={!palette && !nativeModal} initialWorkItemId={inboxItemId} initialWorkFilters={inboxFilters} chooseWork={openInbox} />}
        </div>
      </section> : <>
      <header className="session-header" data-session-id={session?.id}>
        <button className="icon-button nav-toggle" aria-label="Toggle projects" onClick={() => setNavOpen((value) => !value)}><Icon name="Files" /></button>
        {session?.parentSessionId && <button className="icon-button" aria-label="Open parent session" title="Parent session" onClick={() => void chooseSession(session.parentSessionId!)}><Icon name="Back" /></button>}
        <div className="session-heading"><h1 tabIndex={-1}>{session ? title(session, 64, "New chat") : "Your workspace"}</h1><span>{session ? `${project?.name ?? "Chats"}${activeWorkspace ? ` / ${activeWorkspace.branch}` : ""} / ${session.localFinishing ? "Local finishing" : session.status.replace("_", " ")}` : "Start a chat, with or without a project."}{session && <> / <SessionIdChip id={session.id} /></>}</span></div>
      </header>
      {!snapshot ? <div className="loading-state" role="status"><div className="skeleton" /><div className="skeleton short" /><p>Connecting to your local workspace...</p></div> :
        !session ? <div className="welcome">
          <img className="welcome-mascot" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>What are we working on?</h2><p>Start a project-free conversation or open a workspace. Nothing runs until you ask.</p>
          <p className="welcome-start-hint">Choose New to open a chat or a project.</p>
          <button onClick={() => openSettings("providers")}>Configure model providers</button>
        </div> :
        chatContent}
      </>}
    </main>
    <aside id="session-sidebar" className="context-pane" aria-label="Session sidebar" data-session-panel={shownPanel} data-source-session-id={session?.id ?? ""}>
      {!panelExpanded && <SidebarResizer side="right" value={contextWidth} min={240} max={rightMax} onChange={setRightWidth} controls="session-sidebar" />}
      <header className="context-heading"><strong>{shownPanel}</strong>
        <button className="icon-button" aria-label={panelMaximized ? "Restore session sidebar" : "Maximize session sidebar"} title={panelMaximized ? "Restore split view" : "Expand over chat; keep navigation visible"} onClick={() => { if (canChangePanel()) setPanelMaximized((value) => !value); }}><Icon name={panelMaximized ? "Minimize" : "Maximize"} /></button>
        <button className="icon-button" aria-label="Hide session sidebar" title="Hide session sidebar" onClick={hidePanel}><Icon name="PanelRight" /></button></header>
      <div className={`context-content panel-${shownPanel.toLowerCase().replaceAll(" ", "-")}`}>
        {panelVisible && <ContextPanel key={`${client.profileId}-${session?.id}-${shownPanel}`} panel={shownPanel} session={session} project={project} events={events} client={client} run={run} snapshot={snapshot} prUrl={connectedPr} sideId={sideSessionId} selectSide={setSideSessionId} onDirty={reportPanelDirty} onSlash={handleSlash} editorFor={editorFor} suggestionsAll={suggestionsAll} chooseSession={chooseSession} openSettings={openSettings} setupSandbox={() => openSettings("sendbox")} modal={setNativeModal} visible={panelVisible} terminalAutoStart={terminalIntent?.panel === shownPanel && terminalIntent.sessionId === session?.id && terminalIntent.ownership !== "agent"} terminalShowAgent={terminalIntent?.panel === shownPanel && terminalIntent.sessionId === session?.id && terminalIntent.ownership === "agent"} onTerminalOpeningHandled={() => terminalOpeningHandled(terminalIntent)} nativeAllowed={!palette && !nativeModal && !terminalDismiss && !composerMenuOpen && panelVisible} />}
      </div>
      <footer className="context-footer">Bound to the main session</footer>
    </aside>
    <nav className="panel-rail" aria-label="Sidebar panels" onScroll={() => setPanelTooltip(null)}>{sessionPanels.map((item) => {
      const pressed = panelVisible && shownPanel === item, badge = panelBadges[item];
      return <button key={item} data-sidebar-panel={item} className={pressed ? "active" : ""} aria-label={item} aria-description={badge?.hint} aria-describedby={panelTooltip?.panel === item ? "sidebar-panel-tooltip" : undefined} aria-pressed={pressed} aria-expanded={pressed} aria-controls="session-sidebar"
      onMouseEnter={(event) => setPanelTooltip({ panel: item, top: event.currentTarget.getBoundingClientRect().top })}
      onMouseLeave={() => setPanelTooltip(null)} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setPanelTooltip({ panel: item, top: event.currentTarget.getBoundingClientRect().top }); }} onBlur={() => setPanelTooltip(null)}
      onClick={() => { if (pressed) hidePanel(); else void showPanel(item, item === "Terminal" && badge ? "agent" : undefined); }}><Icon name={item} />{badge && <span className="panel-badge" aria-hidden="true">{badge.value}</span>}</button>;
    })}</nav>
    {panelTooltip && <div id="sidebar-panel-tooltip" className="sidebar-tooltip" role="tooltip" style={{ top: Math.min(panelTooltip.top, window.innerHeight - 42) }}>{panelTooltip.panel}{panelBadges[panelTooltip.panel] && <small>{panelBadges[panelTooltip.panel]!.hint}</small>}</div>}
    {terminalDismiss && <TerminalCloseReview sdk={client} cancel={() => { terminalDismiss.cancel?.(); setTerminalDismiss(null); }} confirm={() => { const { action } = terminalDismiss; setTerminalDismiss(null); action(); }} />}
    {continueChoice && <ContinueWorkDialog key={`${client.profileId}-${continueChoice.review.sessionId}-${"command" in continueChoice.review ? continueChoice.review.command.executionId : continueChoice.review.expectedRevision}`} sdk={client}
      editor={continueChoice.editor} review={continueChoice.review} close={() => {
        if (continueChoice.queued) continueChoice.queued.settle({ outcome: "cancelled", restoreInput: true, diagnostic: "The actual user cancelled this original continuation before choosing a route." });
        else setContinueChoice(null);
      }} modal={setNativeModal} chooseQueued={continueChoice.queued ? async (choice) => {
        const owned = continueChoice.queued;
        if (!owned || owned.context.sdk !== client || owned.context.execution.profileId !== client.profileId) throw new Error("The actual continuation profile changed. No request was substituted.");
        owned.context.signal.throwIfAborted();
        await client.commands.choose(owned.context.clientId, owned.context.claim, choice);
        owned.settle({ outcome: "completed" });
      } : undefined} />}
    {startOpen && snapshot && <Suspense fallback={<p className="sr-only" role="status">Opening Start...</p>}><StartDialog sdk={client} snapshot={snapshot} start={startSession} close={closeStart} modal={setNativeModal} /></Suspense>}
    {palette && <CommandPalette close={() => setPalette(false)} actions={[
      { name: "Start a chat or project", action: async () => openStart() },
      { name: "Connect GitHub Copilot", action: async () => openSettings("providers") },
      { name: "Show Insights and event trace", action: async () => { if (canNavigate()) beforeHidingTerminal(() => { if (leaveSurface()) { setPanel("Insights"); setPanelOpen(true); } }); } },
      { name: "Settings and editable system prompt", action: async () => openSettings("systemPrompt") },
      { name: "Profiles: choose, create or rename", action: async () => openSettings("general") },
      { name: "Local project issue board", action: async () => openBoard() },
      { name: "Shared dependency cache", action: async () => openSettings("cache") },
      ...(session?.turnId ? [{ name: "Stop active turn", action: () => command({ type: "session.stop", sessionId: session.id }) }] : []),
    ]} />}
  </div>{profilePending && <p className="sr-only" role="status">Opening the selected isolated profile. Existing work stays in its original profile.</p>}</ProjectFolderActions.Provider></PolicyNavigationContext.Provider></StartupModelContext.Provider>;
}

function Timeline({ session, editor, snapshot, run, client, modal, label = "Session transcript", navigationLabel = "Conversation turns", rewind = true }: {
  session: Session; editor: DraftEditor; snapshot: Snapshot; run: Run; client: MoguriClient; modal: (open: boolean) => void; label?: string; navigationLabel?: string; rewind?: boolean;
}) {
  const pendingInput = useSyncExternalStore(editor.subscribe, () => editor.getState().pendingInput, () => editor.getState().pendingInput);
  const activity = useSessionActivity(client, session, snapshot);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [historyStart, setHistoryStart] = useState<number | null>(null);
  const [commandLimit, setCommandLimit] = useState(10);
  const commands = snapshot.commandExecutions.filter((entry) => entry.sessionId === session.id)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const start = historyStart ?? Math.max(0, session.messages.length - 150);
  const navigation = useMemo(() => conversationNavigation(snapshot, session.id), [snapshot.profileId, session.id, session.messages, snapshot.questions]);
  const promptAnchors = new Map(navigation.filter((entry) => entry.kind === "prompt").map((entry) => [entry.messageId, entry.id]));
  const answers = new Map<string, Array<Extract<ConversationNavigationEntry, { kind: "answer" }>>>();
  for (const entry of navigation) if (entry.kind === "answer") {
    const values = answers.get(entry.messageId) ?? []; values.push(entry); answers.set(entry.messageId, values);
  }
  const follow = useRef(true);
  useEffect(() => { follow.current = true; }, [session.id]);
  useEffect(() => {
    const view = scroll.current;
    if (!view) return;
    const observer = new ResizeObserver(() => { if (follow.current) view.scrollTop = view.scrollHeight; });
    observer.observe(view); if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [session.id]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [session.messages.length, session.messages.at(-1)?.text, session.id]);
  const entries = activity.activity?.entries ?? [], positions = new Map(activity.activity?.messageOrder.map((entry) => [entry.id, entry.sequence]) ?? []);
  const empty = session.messages.length === 0 && !pendingInput && entries.length === 0 && commands.length === 0;
  const groups = new Map<string, PublicMessage[]>();
  for (const message of session.messages.slice(start)) {
    const key = message.turnId || `notice-${message.id}`, group = groups.get(key) ?? [];
    group.push(message); groups.set(key, group);
  }
  const rows = [
    ...[...groups].map(([turnId, messages]) => ({ kind: "turn" as const, id: `turn-${turnId}`, timestamp: messages[0]!.timestamp, turnId, messages })),
    ...commands.slice(-commandLimit).map((execution) => ({ kind: "command" as const, id: `command-${execution.id}`, timestamp: execution.createdAt, execution })),
  ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
  const renderMessage = (message: PublicMessage) => {
    const outputs = message.attachments ?? [];
    const renderOutputs = (attachments = outputs) => attachments.map((attachment) => attachment.kind === "html" ?
      <InteractiveHtml key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} /> :
      <AttachmentChip sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} onOpenChange={modal} />);
    if (message.role === "tool") {
      const visible = outputs.filter((attachment) => !session.messages.some((other) => other.role === "assistant" && other.attachments?.some((item) => item.id === attachment.id)));
      return visible.length ? <article className="message notice" key={`output-${message.id}`} aria-label="Original tool outputs">
        <header><strong>Tool outputs</strong><span>{message.outcome}</span></header>{renderOutputs(visible)}</article> : null;
    }
    const hidden = message.role === "assistant" && !message.text.trim() && !outputs.length;
    return <Fragment key={`message-${message.id}`}>{!hidden && <article className={`message ${message.role}${message.role === "notice" && message.outcome === "completed" ? " info" : ""}`}
      aria-label={message.role === "user" ? "User prompt" : undefined} data-conversation-anchor={promptAnchors.get(message.id)} tabIndex={message.role === "user" ? -1 : undefined}>
        <header><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Moguri" : "Session"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.outcome && message.role !== "assistant" && <span className="outcome">{message.outcome}</span>}
          {message.role !== "notice" && <CopyButton className="message-copy" title="Copy message" label={`Copy ${message.role === "user" ? "sent prompt" : "message"} ${message.id}`} text={message.text} />}</header>
        {message.text && <div className="markdown"><Suspense fallback={<p>{message.text}</p>}><RichMessage text={message.text} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div>}
        {message.reasoning && !entries.some((entry) => entry.messageId === message.id && entry.kind === "thought") && <details><summary>Provider-exposed reasoning</summary><div className="reasoning markdown"><Suspense fallback={<p>{message.reasoning}</p>}><RichMessage text={message.reasoning} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div></details>}
        {message.attachments?.some((attachment) => attachment.kind === "image") && <div className="message-images">{message.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => <AttachmentChip sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} onOpenChange={modal} />)}</div>}
        {message.attachments?.filter((attachment): attachment is Extract<typeof attachment, { kind: "html" }> => attachment.kind === "html")
          .map((attachment) => <InteractiveHtml key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} />)}
        {message.attachments?.some((attachment) => attachment.kind !== "image" && attachment.kind !== "html") && <div className="message-documents attachment-list">{message.attachments.filter((attachment) => attachment.kind !== "image" && attachment.kind !== "html").map((attachment) => <AttachmentChip sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} onOpenChange={modal} />)}</div>}
      </article>}{answers.get(message.id)?.map((entry) => <AnsweredQuestion key={entry.id} entry={entry} />)}</Fragment>;
  };
  return <><div className="conversation-history"><div ref={scroll} className={`timeline${empty ? " timeline-empty" : ""}`} role="log" aria-label={label} onScroll={() => { const view = scroll.current!; follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 100; }}><div ref={content} className="timeline-content">
    {empty && <div className="session-empty"><img className="welcome-mascot small" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>{session.kind === "metachat" ? "Make Moguri work for you" : "What are we working on?"}</h2><p>{session.kind === "metachat" ? "Discuss settings or request a change. You review every exact proposal before it applies." : session.projectId || session.repositories ? <>Ask a question, explore {session.repositories ? "these repositories" : "this project"}, or make a change.<br />{session.controls.automaticApprovals && ["Autopilot", "Autopilot Max"].includes(session.controls.autonomy) ? "Tools and commands are approved automatically within hard policy." : "Approve an action once, or remember it for later."}</> : "Ask a question without a workspace. Files, commands and repository memory are unavailable."}</p><div className="empty-contract"><span>{session.kind === "metachat" ? "Reviewed proposals" : session.projectId || session.repositories ? `${session.controls.env} execution` : "No workspace access"}</span>{session.repositories && <span>{session.repositories.length} captured repositories</span>}<span>{session.controls.autonomy === "Manual" ? "Manual approvals" : session.controls.autonomy}</span><span>Durable history</span></div></div>}
    {start > 0 && <button className="load-history" onClick={() => setHistoryStart(Math.max(0, start - 150))}>Show earlier messages ({start})</button>}
    {commands.length > commandLimit && <button className="load-history" onClick={() => setCommandLimit((value) => value + 10)}>Show earlier command responses</button>}
    {activity.activity?.nextBefore !== null && activity.activity?.nextBefore !== undefined && <button className="load-history" disabled={activity.earlierLoading} onClick={() => void activity.loadEarlier()}>Show earlier activity</button>}
    {activity.error && <Alert as="p" className="inline-error activity-read-error" role="alert">{activity.error}</Alert>}
    {rows.map((row) => {
      if (row.kind === "command") return <CommandMessage key={row.id} sdk={client} execution={row.execution}
        stop={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))} />;
      const { turnId, messages } = row;
      const first = messages[0]?.role === "user" ? messages[0] : null;
      const operations = entries.filter((entry) => entry.turnId === turnId && entry.kind !== "model");
      const parts: Array<{ sequence: number; message?: PublicMessage; operation?: ActivityEntry }> = [
        ...messages.filter((message) => message.id !== first?.id && (message.role !== "tool" || message.attachments?.length))
          .map((message) => ({ sequence: positions.get(message.id) ?? Number.MAX_SAFE_INTEGER, message })),
        ...operations.map((operation) => ({ sequence: operation.sequence, operation })),
      ];
      parts.sort((a, b) => a.sequence - b.sequence || Number(Boolean(b.operation)) - Number(Boolean(a.operation)));
      return <div className="conversation-turn" key={JSON.stringify([client.profileId, session.id, turnId])} data-turn-id={turnId}>
        {first && renderMessage(first)}
        <section className="response-turn" aria-label="Assistant response">
          {parts.map((part) => part.operation ? <ActivityRow sdk={client} entry={part.operation} version={activity.activity?.sequence ?? 0} key={part.operation.id} /> : part.message ? renderMessage(part.message) : null)}
          {messages.some((message) => message.role === "tool") && activity.loading && <p className="fine-print" role="status">Loading retained operations...</p>}
          {session.turnId === turnId && !activity.error && <CurrentActivity entries={(activity.activity?.current ?? []).filter((entry) => entry.turnId === turnId)} hasMore={(activity.activity?.currentCount ?? 0) > (activity.activity?.current.length ?? 0)} />}
          {messages[0]?.turnId && <TurnActions sdk={client} sessionId={session.id} turnId={turnId} info={snapshot.sessionTelemetry?.[session.id]?.turns.find((info) => info.turnId === turnId)}
            canCopy={messages.some((message) => message.role === "assistant" && Boolean(message.text.trim()))} />}
        </section>
      </div>;
    })}
    {entries.some((entry) => entry.turnId === null) && <section className="session-activities" aria-label="Session actions"><h2>Session actions</h2>
      {entries.filter((entry) => entry.turnId === null).map((entry) => <ActivityRow sdk={client} entry={entry} version={activity.activity?.sequence ?? 0} key={entry.id} />)}
      {!activity.error && <CurrentActivity entries={(activity.activity?.current ?? []).filter((entry) => entry.turnId === null)} hasMore={(activity.activity?.currentCount ?? 0) > (activity.activity?.current.length ?? 0)} />}
    </section>}
    {session.queue.filter((item) => item.delivery === "steer" && item.targetTurnId === session.turnId && !item.command).map((item) =>
      <article className="message user pending-input" key={item.id} aria-label="Live message">
        <header><strong>You</strong><span>Live input</span></header>
        <p className="fine-print" role="status">Acknowledged. The agent will read this at its next safe boundary.</p>
        <div className="pending-input-text">{item.text}</div>
        {item.attachments.length > 0 && <div className="attachment-list">{item.attachments.map((attachment) =>
          <span key={attachment.id}>{attachment.path}</span>)}</div>}
      </article>)}
    {pendingInput && <article className="message user pending-input" aria-label="Pending message">
      <header><strong>You</strong><span>Not yet acknowledged</span></header>
      <p className="fine-print" role="status">{pendingInputStatus(pendingInput)} Awaiting service acknowledgement.</p>
      <div className="pending-input-text">{pendingInput.text}</div>
      {pendingInput.attachments.length > 0 && <div className="attachment-list">{pendingInput.attachments.map((attachment) =>
        <span key={attachment.id}>{attachment.path}</span>)}</div>}
    </article>}
    <GhostPrompts sdk={client} session={session} snapshot={snapshot} run={run} />
  </div>
  </div>{(navigation.length > 0 || rewind) && <ConversationNavigation entries={navigation} viewport={scroll} renderedFrom={start} label={navigationLabel}
    rewind={rewind ? { sdk: client, session, snapshot } : undefined} modal={modal} onNavigate={(entry) => {
    follow.current = false; setHistoryStart(Math.min(start, entry.messageIndex));
  }} />}</div></>;
}
function ClientDiagnostics({ client }: { client: MoguriClient }) {
  const [startup, setStartup] = useState<DesktopStartupStatus | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void window.moguri.startupStatus().then((value) => { if (active) setStartup(value); })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Native startup timings are unavailable."); });
    return () => { active = false; };
  }, []);
  const text = JSON.stringify({ desktopStartup: startup, clientRequests: client.getRequestTimings() }, null, 2);
  return <details><summary>Client request timings</summary>
    <p className="fine-print">Last 50 SDK requests for this profile client. Headers and body are transport timings, not server CPU or model time. No input, paths, credentials or payloads are retained here.</p>
    {error && <Alert as="p" role="alert">{error}</Alert>}
    <CopyButton label="Copy client request timings" text={text} /><pre>{text}</pre>
  </details>;
}
function ContextPanel({ panel, session, project, events, client, run, snapshot, sideId, selectSide, onDirty, onSlash, editorFor, nativeAllowed, visible = true, terminalAutoStart = false, terminalShowAgent = false, onTerminalOpeningHandled, suggestionsAll, chooseSession, modal, setupSandbox, openSettings, initialWorkItemId, initialWorkFilters, chooseWork }: {
  panel: Panel; session?: Session; project?: Project; events: StoredEvent[]; client: MoguriClient; run: Run; snapshot: Snapshot | null;
  prUrl: string | null; sideId: string | null; selectSide: (id: string) => void; onDirty: (dirty: boolean) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; nativeAllowed: boolean; visible?: boolean; terminalAutoStart?: boolean; terminalShowAgent?: boolean; onTerminalOpeningHandled?: () => void;
  editorFor: (session: Session) => DraftEditor;
  suggestionsAll: boolean; chooseSession: (id: string, ownership?: "agent") => Promise<void>; modal: (open: boolean) => void;
  setupSandbox: () => void; openSettings: (tab: SettingsTab) => void;
  initialWorkItemId?: string | null; initialWorkFilters?: MyWorkFilters; chooseWork?: (id: string) => void;
}) {
  const [trace, setTrace] = useState(false);
  if (panel === "Dashboard" && snapshot) return <Dashboard key={client.profileId} sdk={client} snapshot={snapshot} openSession={chooseSession} initialItemId={initialWorkItemId} initialFilters={initialWorkFilters} onDirty={onDirty} />;
  if (panel === "Terminal" && snapshot && session) return <Suspense fallback={<p role="status">Loading Ghostty...</p>}><SessionTerminal sdk={client} session={session} snapshot={snapshot} active={nativeAllowed} visible={visible} autoStart={terminalAutoStart} showAgent={terminalShowAgent} onAutoStartHandled={onTerminalOpeningHandled} openAgent={(id) => chooseSession(id, "agent")} /></Suspense>;
  if (panel === "Attention" && snapshot) return <AttentionPanel sdk={client} snapshot={snapshot} chooseSession={chooseSession} chooseWork={chooseWork} />;
  if (panel === "Suggestions" && snapshot) return <SuggestionsPanel sdk={client} snapshot={snapshot} session={session} allProjects={!session || session.projectId === null && suggestionsAll} chooseSession={chooseSession} modal={modal} />;
  if (!session) return <div className="panel-empty"><Icon name={panel} /><h2>Your session context</h2><p>Open a session to see its {panel.toLowerCase()}. This panel follows the conversation in the main pane.</p></div>;
  const workspaceScope = JSON.stringify([client.profileId, session.id, session.controls.env, session.workspaceId, project?.path, session.homeRoot,
    session.repositories?.map((binding) => [binding, snapshot?.projectConfigurations.find((configuration) => configuration.projectId === binding.projectId)]),
    snapshot?.projectConfigurations.find((value) => value.projectId === session.projectId), session.controls.env === "Remote" ? snapshot?.settings.values.remote : null,
    session.controls.env === "Sandbox" ? [session.sandboxWorkspaceId, snapshot?.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId)?.revision, snapshot?.settings.values.sandbox] : null]);
  if (!project && !session.repositories && ["Changes", "PR", "Code change"].includes(panel)) return <div className="panel-empty"><Icon name="Files" /><h2>Choose an explicit repository</h2><p>Home files and approved commands do not require a project. Code changes and pull requests need a selected repository; chat commands can use an explicit git -C path or gh --repo owner/repo target.</p></div>;
  if (session.repositories && panel === "Work item") return <div className="panel-empty"><Icon name={panel} /><h2>Choose an individual repository chat</h2><p>This repository-specific panel is available in each member project's chat. Folder sessions can read, edit and run commands across their explicitly selected captured roots; no first repository was substituted.</p></div>;
  if (panel === "Insights") {
    const execution = snapshot?.executions.findLast((value) => value.sessionId === session.id);
    const nativeExecution = snapshot?.sandboxExecutions?.findLast((value) => value.sessionId === session.id);
    const nativeWorkspace = snapshot?.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId);
    const routing = snapshot?.routings.findLast((value) => value.sessionId === session.id);
    const workspace = session.controls.env === "Sandbox" ? nativeWorkspace?.stage?.workspace : session.controls.env === "Remote" ? snapshot?.projectConfigurations.find((value) => value.projectId === project?.id)?.values.remotePath : snapshot?.managedWorkspaces.find((value) => value.id === session.workspaceId)?.path ?? project?.path ?? session.homeRoot?.root;
    const known = session.usage.filter((usage) => usage.totalTokens !== null);
    const unknown = session.usage.some((usage) => usage.totalTokens === null);
    const total = known.reduce((sum, usage) => sum + (usage.totalTokens ?? 0), 0);
    return <>
      <div className="context-binding"><span className={`status-dot ${session.status}`} /><strong>{title(session)}</strong><small>{session.status.replace("_", " ")}</small></div>
      <h2>Execution</h2><dl className="facts">
        <dt>Env</dt><dd>{session.localFinishing ? "Local finishing" : session.controls.env}</dd><dt>Boundary</dt><dd>{session.controls.env === "Remote" ? `SSH host ${execution?.target.name ?? snapshot?.settings.values.remote?.name ?? "(unconfigured)"}, not SendBox-isolated` : session.controls.env === "Sandbox" ? "SendBox native guest; private stage, not the Local source" : "Host execution, not isolated"}</dd>
        <dt>Model</dt><dd>{session.controls.modelId ?? "Not selected"}</dd><dt>Autonomy</dt><dd>{session.controls.autonomy}</dd><dt>Budget</dt><dd>{session.controls.budget.kind === "limited" ? "Estimate-based session cap" : "Unlimited preference"}{snapshot?.budgetPolicy.limit ? " / profile hard cap" : ""}</dd>
      </dl>
      <details className="session-identity"><summary>Session identity and workspace</summary><dl className="facts">
        <dt>Session ID</dt><dd className="path"><code>{session.id}</code><CopyButton label="Copy session ID" text={session.id} /></dd>
        <dt>Short ID</dt><dd><code>{sessionShortId(session.id)}</code></dd>
        <dt>Project</dt><dd>{session.repositories?.map((binding) => binding.name).join(", ") ?? project?.name ?? "None (project-free)"}</dd><dt>Workspace</dt><dd className="path">{session.repositories?.map((binding) => binding.root.root).join("\n") ?? workspace ?? "Unavailable"}</dd>
        <dt>Profile</dt><dd>{snapshot?.profile?.name ?? client.profileId}</dd>
      </dl><p className="fine-print">Mention <code>:{sessionShortId(session.id)}</code> or the full ID in a composer to attach a reviewed public snapshot. An ID grants no execution or private-console access.</p></details>
      {snapshot && <SessionCoordinationPanel sdk={client} session={session} snapshot={snapshot} onDirty={onDirty} />}
      {routing && <details><summary>Kupo routing provenance</summary><dl className="facts"><dt>Status</dt><dd>{routing.status}</dd><dt>Workflow</dt><dd>{routing.plan?.pattern ?? "Not selected"}</dd><dt>Classifier</dt><dd className="path">{routing.classifierModelId ?? "Not called (one eligible model)"}</dd><dt>Draft / solver</dt><dd className="path">{routing.plan?.modelId ?? "No accepted plan"}</dd>
        {routing.plan?.pattern === "cascade" && <><dt>Gate / escalation</dt><dd className="path">{routing.plan.escalationId}</dd></>}
        {routing.plan?.pattern === "critique" && <><dt>Read-only critic</dt><dd className="path">{routing.plan.criticId}</dd></>}
        <dt>Confidence / threshold</dt><dd>{routing.plan?.confidence ?? "Not classified"} / {routing.policy.minimumConfidence}</dd></dl>
        {routing.plan && <p>{routing.plan.reason}</p>}{routing.diagnostic && <Alert as="p" className="inline-error">{routing.diagnostic}</Alert>}<p className="fine-print">Model-supplied confidence is not calibrated probability or permission. Inspect per-call accounting below for actual dispatches; classifier output never becomes solver instructions.</p></details>}
      {execution && <details><summary>Owned remote execution</summary><p className="path">{execution.id}</p><p>{execution.status} / cancellation {execution.cancellation} / {execution.cleanup}</p><p>{execution.diagnostic}</p><button disabled={Boolean(session.turnId)} onClick={() => void run(() => client.remote.reconcile(execution.id))}>Reconcile receipts</button></details>}
      {nativeExecution && <details><summary>Owned native execution</summary><p className="path">{nativeExecution.id}</p><p>{nativeExecution.status} / cancellation {nativeExecution.cancellation} / {nativeExecution.cleanup}</p><p>Model root: {nativeExecution.root ?? "null, project-free"}. Source changes require separate actual-user publication in Sandbox.</p>{nativeExecution.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{nativeExecution.diagnostic}</Alert>}</details>}
      <details><summary>Startup control sources</summary><pre>{JSON.stringify(session.defaults ?? { source: "legacy explicit session controls" }, null, 2)}</pre><p className="fine-print">These sources were recorded when the session was created. Changing defaults does not rewrite this session.</p></details>
      <h2>Usage</h2><dl className="facts"><dt>Direct model calls</dt><dd>{session.usage.length}</dd><dt>Direct tokens</dt><dd>{known.length ? number(total) + (unknown ? " + unknown" : "") : session.usage.length ? "Unavailable" : "No requests yet"}</dd><dt>Request wall time</dt><dd>{(session.usage.reduce((sum, usage) => sum + usage.requestMs, 0) / 1000).toFixed(2)} s</dd></dl>
      {snapshot && <SessionBudgetSummary sdk={client} snapshot={snapshot} session={session} />}
      <p className="fine-print">Copilot entitlement and billing are account-specific. Missing telemetry is not zero. Active-generation throughput is not measured in this checkpoint.</p>
      {session.usage.length > 0 && <details><summary>Per-call accounting</summary>{session.usage.map((usage) => <div className="call-record" key={usage.stepId}><strong>{usage.modelId}</strong><small>{usage.role} / {usage.outcome}</small><span>{usage.totalTokens === null ? "Tokens unavailable" : `${number(usage.totalTokens)} tokens (${usage.quality})`}</span></div>)}</details>}
      <button className="trace-toggle" onClick={() => setTrace((value) => !value)}>{trace ? "Hide" : "Show"} recent event trace</button>
      {trace && <div className="event-trace"><ClientDiagnostics client={client} /><p className="fine-print">Most recent 200 received events, filtered to this session.</p>{events.filter((event) => event.session_id === session.id).map((event) => <details key={event.id}><summary>#{event.seq} {event.event_type}</summary><pre>{JSON.stringify(event, null, 2)}</pre></details>)}</div>}
      {session.lastError && <Alert as="p" className="inline-error">{session.lastError}</Alert>}
    </>;
  }
  if (panel === "Browser") return nativeAllowed ? <BrowserPanel sdk={client} session={session} /> : <p className="fine-print">Preview hidden while another surface is active.</p>;
  if (panel === "Files") return <FilesPanel key={workspaceScope} sdk={client} session={session} />;
  if (panel === "Plan" && snapshot) return <PlanPanel sdk={client} session={session} snapshot={snapshot} workspaceScope={workspaceScope} onDirty={onDirty} modal={modal} />;
  if (panel === "Side chat" && snapshot) return <SideChat sdk={client} parent={session} snapshot={snapshot} selectedId={sideId} select={selectSide} onSlash={onSlash} editorFor={editorFor} onDirty={onDirty}
    openSettings={openSettings} modal={modal} renderTranscript={(side) => <Timeline key={JSON.stringify([client.profileId, side.id])} session={side} editor={editorFor(side)} snapshot={snapshot} run={run} client={client} modal={modal} label="Side chat transcript" navigationLabel="Side chat turns" rewind={false} />}
    renderQueue={(side) => <Queue key={JSON.stringify(["queue", client.profileId, side.id])} session={side} command={(command) => run(() => client.command(command))} client={client} modal={modal} />} />;
  if (["Code change", "PR", "Changes"].includes(panel) && snapshot) return <CodeChangePane key={`${client.profileId}:${session.id}`} sdk={client} session={session} snapshot={snapshot} onDirty={onDirty} chooseSession={chooseSession}
    changes={session.controls.env !== "Sandbox" ? <ChangesPanel key={workspaceScope} sdk={client} session={session} /> : <SandboxPanel sdk={client} snapshot={snapshot} session={session} onDirty={onDirty} setup={setupSandbox} sessionOnly />} />;
  if (panel === "Work item" && snapshot) return <section aria-label="Session work item" data-session-id={session.id}><p className="fine-print">{title(session)}</p><SessionGitHub sdk={client} session={session} snapshot={snapshot} kind="issue" onDirty={onDirty} chooseSession={chooseSession} /></section>;
  return <p>Choose a supported panel.</p>;
}
function TerminalCloseReview({ sdk, cancel, confirm }: { sdk: MoguriSdk; cancel: () => void; confirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const hide = async () => {
    setBusy(true); setError("");
    try {
      if (remember) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Reconnect before saving the terminal-close preference.");
        await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
      }
      confirmed.current = true;
      ref.current?.close();
      confirm();
    } catch (error) { setError(error instanceof Error ? error.message : "The preference could not be saved. The terminal pane remains open."); }
    finally { setBusy(false); }
  };
  return <dialog ref={ref} className="workspace-dialog terminal-close-review" aria-label="Close terminal pane" onClose={() => { if (!confirmed.current) cancel(); }} onCancel={(event) => { if (busy) event.preventDefault(); }}>
    <header><h2>Hide terminal pane?</h2><button className="icon-button" type="button" aria-label="Cancel closing terminal pane" disabled={busy} onClick={() => ref.current?.close()}><Icon name="Close" /></button></header>
    <p>Your consoles keep running. Use the terminal's X button to terminate a console without this confirmation.</p>
    <label className="check-setting"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Do not ask me again when closing terminal</label>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <footer><button type="button" disabled={busy} onClick={() => ref.current?.close()}>Keep open</button><button className="primary" type="button" disabled={busy} onClick={() => void hide()}>Hide terminal</button></footer>
  </dialog>;
}
function CommandPalette({ actions, close }: { actions: { name: string; action: () => Promise<void> }[]; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.showModal();
    return () => { requestAnimationFrame(() => { if (previous?.isConnected && (!document.activeElement || document.activeElement === document.body)) previous.focus({ preventScroll: true }); }); };
  }, []);
  return <dialog ref={ref} className="command-palette" aria-label="Commands" onClose={close}><header><label htmlFor="command-search">Commands</label><button className="quiet" onClick={() => ref.current?.close()}>Esc</button></header>
    <input id="command-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a command..." />
    <div>{actions.filter((action) => action.name.toLowerCase().includes(query.toLowerCase())).map((action) => <button key={action.name} onClick={() => { close(); void action.action(); }}>{action.name}<span>&gt;</span></button>)}</div>
  </dialog>;
}
