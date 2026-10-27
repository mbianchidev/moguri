import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { activeDecision, activeProjectWork, appearanceColors, continueWorkInput, sessionIndicatorColors, sessionPullRequestUrl, themeVariable, shortcutMatches, DraftEditor, isRecord, sessionTitle as title, type ActivityEntry, type ContinueWorkReview, type PublicMessage, type MoguriSdk, type Command, type Project, type Session, type Snapshot, type StoredEvent, type SessionPanel, type SlashResult, type ArtifactEditorRequest } from "../../../packages/sdk/src/index.ts";
import { useMoguri, useSessionActivity } from "../../../packages/sdk/src/react.ts";
import mascot from "../../../assets/moguri.svg";
import type { SettingsTab } from "./SettingsPanel.tsx";
import { Icon } from "./Icon.tsx";
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import { BrowserPanel, ChangesPanel, FilesPanel, PlanPanel, SideChat } from "./SessionPanels.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { AttentionPanel, SuggestionsPanel, ConfigurationProposals } from "./EngagementPanels.tsx";
import { AttachmentChip } from "./ContextAttachments.tsx";
import { SandboxPanel } from "./SandboxPanel.tsx";
import { ModelAdvice, QuestionCard } from "./QuestionCard.tsx";
import { SessionBudgetSummary } from "./BudgetControls.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { ActivityRow, CurrentActivity, TurnActions } from "./ChatActivity.tsx";
import { NotificationAudio } from "./notification-audio.ts";
import { ApprovalActions } from "./ApprovalActions.tsx";
import { SessionGitHub } from "./SessionGitHub.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { ContinueWorkDialog } from "./ContinueWorkDialog.tsx";
import { ReorderList } from "./ReorderList.tsx";
const SettingsPanel = lazy(() => import("./SettingsPanel.tsx").then((module) => ({ default: module.SettingsPanel })));
const StartDialog = lazy(() => import("./StartDialog.tsx").then((module) => ({ default: module.StartDialog })));
const RichMessage = lazy(() => import("./RichMessage.tsx"));
const ProjectBoard = lazy(() => import("./ProjectBoard.tsx").then((module) => ({ default: module.ProjectBoard })));
const SessionTerminal = lazy(() => import("./SessionTerminal.tsx").then((module) => ({ default: module.SessionTerminal })));
type MoguriClient = MoguriSdk;

type Panel = SessionPanel;
const panels: Panel[] = ["Terminal", "Browser", "Insights", "Changes", "Files", "Plan", "Side chat", "Code change", "Work item"];
const globalPanels = ["Suggestions", "Dashboard", "Attention"] as const;
const savedPanels: Panel[] = [...panels, ...globalPanels, "Artifacts", "Candidates", "Sandbox", "PR"];
type GlobalView = typeof globalPanels[number] | "Automations";
const isGlobalPanel = (value: Panel): value is typeof globalPanels[number] => globalPanels.some((panel) => panel === value);
const resourceSettings = (panel: Panel): SettingsTab | null => panel === "Artifacts" ? "artifacts" : panel === "Candidates" ? "candidates" : panel === "Sandbox" ? "sendbox" : null;
const globalNavigation: { view: GlobalView; icon: string }[] = [
  { view: "Dashboard", icon: "Dashboard" }, { view: "Suggestions", icon: "Suggestions" },
  { view: "Automations", icon: "Clock" },
];
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
export function App({ client: initialClient }: { client: MoguriClient }) {
  const [client, setClient] = useState(initialClient);
  const clients = useRef(new Set([initialClient]));
  const { snapshot, status, error: connectionError, events } = useMoguri(client);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [layout] = useState(savedLayout);
  const [panel, setPanel] = useState<Panel>(isGlobalPanel(layout.panel) || resourceSettings(layout.panel) ? "Insights" : layout.panel === "PR" ? "Code change" : layout.panel);
  const [globalView, setGlobalView] = useState<GlobalView | null>(isGlobalPanel(layout.panel) ? layout.panel : null);
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
  const [settingsUnsaved, setSettingsUnsaved] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [panelDirty, setPanelDirty] = useState(false);
  const questionDirty = useRef(false);
  const questionDirtyChanged = useCallback((dirty: boolean) => { questionDirty.current = dirty; }, []);
  const [nativeModal, setNativeModal] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [terminalDismiss, setTerminalDismiss] = useState<{ action: () => void; cancel?: () => void } | null>(null);
  const [terminalIntent, setTerminalIntent] = useState<{ panel: Panel; sessionId: string | null } | null>(null);
  const [sideSessionId, setSideSessionId] = useState<string | null>(null);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [continueChoice, setContinueChoice] = useState<{ review: ContinueWorkReview; editor: DraftEditor } | null>(null);
  const [suggestionsAll, setSuggestionsAll] = useState(true);
  const [artifactRequest, setArtifactRequest] = useState<ArtifactEditorRequest | null>(null);
  const switchingProfile = useRef(false);
  const [profilePending, setProfilePending] = useState(false);
  const panelVisible = panelOpen && !settingsTab && !boardOpen && !globalView;
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
  const globalSession = snapshot?.sessions.find((session) => session.id === globalSessionId);
  const globalProject = snapshot?.projects.find((project) => project.id === globalSession?.projectId);
  const activeWorkspace = snapshot?.managedWorkspaces.find((workspace) => workspace.id === session?.workspaceId);
  const pendingQuestion = snapshot?.questions.find((question) => question.id === session?.pendingQuestionId && question.status === "open");
  const decisionReview = snapshot?.decisions.find((record) => record.sessionId === session?.id && record.turnId === session?.turnId && activeDecision(record));
  const displayProjectId = settingsTab === "project" ? settingsProjectId : boardOpen ? projectId : session ? session.projectId : projectId;
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
      if (panelDirty || settingsUnsaved || profilePending || [...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) { event.preventDefault(); event.returnValue = ""; }
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
    if (!settingsUnsaved && !panelDirty) return true;
    setNotice("Save your edit or reload committed values before navigating. Your edit is preserved.");
    return false;
  };
  const canNavigate = () => {
    if (questionDirty.current) { setNotice("Send or cancel your custom answer before switching away. It has not been sent."); return false; }
    return canChangePanel();
  };
  const leaveSettings = () => { if (!canNavigate()) return false; setSettingsTab(null); return true; };
  const leaveSurface = () => { if (!leaveSettings()) return false; setBoardOpen(false); setGlobalView(null); return true; };
  const beforeHidingTerminal = (action: () => void, cancel?: () => void) => {
    if (terminalDismiss) { cancel?.(); return; }
    const visible = !settingsTab && !boardOpen && !globalView && panelOpen && panel === "Terminal";
    const running = snapshot?.terminals.some((terminal) => terminal.sessionId === session?.id && !["closed", "failed", "acknowledged"].includes(terminal.status));
    if (visible && running && snapshot?.settings.values.interactions.confirmTerminalClose !== false) { setTerminalDismiss({ action, cancel }); return; }
    action();
  };
  const confirmTerminalNavigation = () => new Promise<boolean>((resolve) => beforeHidingTerminal(() => resolve(true), () => resolve(false)));
  const terminalOpeningHandled = (panel: Panel, sessionId: string | null) => setTerminalIntent((intent) =>
    intent?.panel === panel && intent.sessionId === sessionId ? null : intent);
  const openSettings = (tab: SettingsTab) => { if (!canNavigate()) return; beforeHidingTerminal(() => { setBoardOpen(false); setGlobalView(null); setSettingsTab(tab); }); };
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
  const selectMainSession = (id: string, projectId: string | null) => {
    if (panelOpen && panel === "Terminal" && (selectedId !== id || globalView !== null || boardOpen || settingsTab !== null)) {
      setTerminalIntent({ panel: "Terminal", sessionId: id });
    }
    setSelectedId(id); setProjectId(projectId);
  };
  const chooseSession = (id: string) => run(async () => {
    if (!canNavigate() || (globalView || id !== session?.id) && !await confirmTerminalNavigation()) return;
    if (!leaveSurface()) return;
    await editor?.flush();
    const target = client.getState().snapshot?.sessions.find((session) => session.id === id);
    if (!target) throw new Error("This session was removed.");
    selectMainSession(id, target.projectId); setBoardOpen(target.purpose === "kanban"); setNavOpen(false); setSideSessionId(null);
    if (target.unread) await client.sessions.organize(id, { unread: false });
    const attention = client.getState().snapshot?.attention.filter((entry) => entry.sessionId === id && !entry.acknowledged).map((entry) => entry.id) ?? [];
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
    if (!canNavigate() || nativeModal || terminalDismiss || commandOutput || palette || composerMenuOpen) throw new Error("Save/discard local edits and close dialogs before switching profiles.");
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
      setSelectedId(targetSessionId ?? null); setProjectId(null); setSettingsProjectId(null); setArchived(false); setSettingsTab(null); setBoardOpen(false); setGlobalView(null); setGlobalSessionId(null); setSideSessionId(null); setTerminalIntent(null);
      setPalette(false); setCommandOutput(null); setArtifactRequest(null); setNotice(null);
    } catch (error) { next?.disconnect(); throw error; }
    finally { switchingProfile.current = false; setBusy(false); setProfilePending(false); }
  };
  useEffect(() => window.moguri.onNavigateSession((id, profileId) => {
    if (profileId === client.profileId) void chooseSession(id);
    else void openProfile(profileId, id).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Notification profile could not be opened."));
  }), [chooseSession, client.profileId]);
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
      document.querySelector<HTMLButtonElement>(`[data-sidebar-panel="${panels.includes(panel) ? panel : "Insights"}"]`)?.focus();
    });
  };
  const showPanel = (next: Panel) => run(async () => {
    if (next === "PR") next = "Code change";
    const settings = resourceSettings(next);
    if (settings) { openSettings(settings); return; }
    if (isGlobalPanel(next)) { openGlobal(next, session?.id ?? null); return; }
    if (!canNavigate() || panelVisible && panel === next) return;
    beforeHidingTerminal(() => {
      if (!leaveSurface()) return;
      if (next === "Terminal") setTerminalIntent({ panel: next, sessionId: session?.id ?? null });
      setPanel(next); setPanelOpen(true);
    });
  });
  const applySlash = async (result: SlashResult) => {
    if (result.kind === "continue-work") {
      const target = client.getState().snapshot?.sessions.find((session) => session.id === result.review.sessionId);
      if (!target || result.review.profileId !== client.profileId) throw new Error("The actual continuation owner changed. No draft was consumed.");
      setContinueChoice({ review: result.review, editor: editorFor(target) }); return;
    }
    if (result.kind === "profiles") { openSettings("general"); return; }
    if (result.kind === "profile") { await openProfile(result.profileId); return; }
    if (result.kind === "ok") { setNotice(result.message, true); return; }
    if (result.kind === "text") { setCommandOutput(result.text); return; }
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
    else if (result.panel === "Queue") document.querySelector(".queue")?.scrollIntoView({ block: "nearest" });
    else await showPanel(result.panel);
  };
  const handleSlash = async (target: Session, draft: DraftEditor, text: string) => {
    if (target.projectId && continueWorkInput(text)) {
      const review = await draft.reviewContinueWork();
      setContinueChoice({ review, editor: draft }); return;
    }
    if (/^\/attach-(?:document|file|image)(?:\s|$)/.test(text)) {
      await draft.flush();
      const result = await client.slash(target.id, text, "desktop");
      const saved = client.getState().snapshot?.sessions.find((session) => session.id === target.id)?.draft;
      if (saved) {
        draft.receive(saved);
        if (!draft.getState().conflict && draft.getState().text === text) { draft.edit("", saved.attachments); await draft.flush(); }
      }
      await applySlash(result); return;
    }
    await draft.flush(); draft.edit(""); await draft.flush();
    try { await applySlash(await client.slash(target.id, text, "desktop")); }
    catch (error) { if (client.getState().snapshot?.sessions.some((session) => session.id === target.id && session.status !== "archived")) draft.edit(text); throw error; }
  };
  const closeStart = () => { setStartOpen(false); document.querySelector<HTMLButtonElement>(".start-trigger")?.focus(); };
  const openStart = () => { if (canNavigate()) setStartOpen(true); };
  const startSession = async (projectId: string | null) => {
    if (!canNavigate()) throw new Error("Save existing edits before starting a new chat.");
    if (!await confirmTerminalNavigation()) return;
    if (!leaveSurface()) throw new Error("Save existing edits before starting a new chat.");
    await editor?.flush();
    const result = await client.sessions.create(projectId, "New chat");
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
    {continuedWork && <section className="continuation-status" role="status" aria-label="Project work status">
      <div><strong>{continuedWork.source.title}</strong><p>{continuedWork.status} / one delegated {continuedWork.controls.autonomy} task to its PR; this chat's controls are unchanged.</p>
        {continuedWork.diagnostic && <p>{continuedWork.diagnostic}</p>}</div>
      {continuedWork.sessionId && snapshot.sessions.some((session) => session.id === continuedWork.sessionId) && <button type="button" onClick={() => void chooseSession(continuedWork.sessionId!)}>Open task</button>}
      {activeProjectWork(continuedWork) && <button type="button" onClick={() => void run(() => client.kanban.cancel(continuedWork.id))}>Stop task</button>}
      {continuedWork.prUrl && <button type="button" onClick={() => void run(async () => { await window.moguri.openExternal(continuedWork.prUrl!); })}>Open published PR</button>}
    </section>}
    <Timeline session={session} snapshot={snapshot} run={run} client={client} modal={setNativeModal} />
    {pendingQuestion && <QuestionCard key={pendingQuestion.id} sdk={client} question={pendingQuestion} onDirty={questionDirtyChanged} decisionPending={decisionReview?.source.kind === "question" && decisionReview.source.questionId === pendingQuestion.id} />}
    {session.kind === "metachat" && <ConfigurationProposals sdk={client} snapshot={snapshot} session={session} modal={setNativeModal} />}
    {session.pendingApproval && <section className="approval" aria-label="Tool approval">
      <div className="approval-heading"><span className="attention-dot" /><strong>Your approval is required</strong><span>{session.controls.autonomy}</span></div>
      {decisionReview?.source.kind === "tool" && decisionReview.source.approvalId === session.pendingApproval.id &&
        <p className="fine-print" role="status">A separately metered decision provider is reviewing the existing exact delegation. You can override it now; your actual answer wins and cancelled usage may remain held.</p>}
      <p><strong>{session.pendingApproval.call.name}</strong>{session.pendingApproval.call.name === "run_command" ? session.controls.env === "Remote" ? " will run on the configured SSH host, not inside SendBox." : session.controls.env === "Sandbox" ? " will run inside the approved SendBox boundary." : " will run on your Mac without sandbox isolation." : session.pendingApproval.call.name === "mcp_gateway" ? " may access host code or external services through the configured MCP. Review the exact server, tool and arguments." : session.pendingApproval.call.name === "run_subagent" ? " will send the approved context to a separate, tool-less model call." : session.pendingApproval.call.name.startsWith("propose_") ? " will create a pending proposal, not apply or enable it." : " will access this project's files."}</p>
      <pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre>
      {session.pendingApproval.recommendation && session.pendingApproval.recommendationSource?.stepId === session.pendingApproval.stepId && session.pendingApproval.recommendationSource.callId === session.pendingApproval.call.id ?
        <ModelAdvice text={session.pendingApproval.recommendation} source={session.pendingApproval.recommendationSource} /> :
        session.controls.autonomy === "Guided" && <p className="fine-print">The current solver supplied no explicit recommendation. Review the exact arguments; only your decision or an existing deterministic grant can authorize this action.</p>}
      <ApprovalActions key={session.pendingApproval.id} sdk={client} session={session} busy={busy} run={run} />
    </section>}
    {session.queue.length > 0 && <Queue session={session} command={command} client={client} modal={setNativeModal} />}
    {editor && <ChatComposer key={session.id} session={session} project={project && activeWorkspace ? { ...project, path: activeWorkspace.path } : project} snapshot={snapshot} client={client} editor={editor} run={run} busy={busy} connected={status === "connected"} onConnect={() => openSettings("providers")} onSlash={handleSlash} onMenuChange={setComposerMenuOpen} onGuardrails={() => openSettings("permissions")} onLocalModels={() => openSettings("localModels")} onRemote={() => openSettings("remote")} onSandbox={() => openSettings("sendbox")} onRouting={() => openSettings("kupo")} onDecisions={() => openSettings("decisions")} />}
  </> : null;
  return <><div inert={profilePending} aria-busy={profilePending} style={shellStyle} className={`app-shell ${navOpen ? "nav-open" : ""} ${panelVisible ? "context-open" : ""} ${panelVisible && panelMaximized ? "context-maximized" : ""}`}>
    <header className="titlebar">
      <div className="wordmark"><img className="brand-mascot" src={mascot} alt="" /><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">{globalView ?? project?.name ?? "Chats"}</span>
      <button className="icon-button notification-trigger" aria-label="Attention notifications" title="Attention" aria-pressed={globalView === "Attention"} onClick={() => openGlobal("Attention")}><Icon name="Attention" />{snapshot?.settings.values.notifications.inApp && snapshot.attention.some((entry) => entry.active && !entry.acknowledged) && <span className="attention-unread-dot" />}</button>
    </header>
    <nav id="project-navigation" className="project-nav" aria-label="Projects and sessions">
      <SidebarResizer side="left" value={navWidth} min={180} max={leftMax} onChange={setLeftWidth} controls="project-navigation" />
      <div className="nav-heading"><span>Workspace</span></div>
      <button className="new-session start-trigger" aria-label="New" onClick={openStart} disabled={busy || !snapshot}><Icon name="Plus" />New</button>
      <div className="nav-scroll">
      <nav className="global-navigation" aria-label="Profile resources">{globalNavigation.map(({ view, icon }) => <button key={view} className="settings-nav-button" aria-pressed={globalView === view} onClick={() => openGlobal(view, null, true)}><Icon name={icon} />{view}</button>)}</nav>
      <div className="nav-tabs"><button aria-pressed={!archived && !boardOpen} onClick={() => openSessionList(false)}>Sessions</button><button aria-pressed={archived && !boardOpen} onClick={() => openSessionList(true)}>Archived</button><button aria-pressed={boardOpen} disabled={!project} onClick={openBoard}>Issues</button></div>
      {snapshot && <WorkspaceNavigation key={client.profileId} sdk={client} snapshot={snapshot} selectedId={selectedId} archived={archived} busy={busy} chooseSession={chooseSession} chooseProject={chooseProject} openKanban={openKanban} settings={projectSettings} terminal={projectTerminal} modal={setNativeModal} allow={canNavigate} prepareSession={async (id) => { await editors.current.get(id)?.flush(); }} />}
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
    <main className="main-pane" inert={panelVisible && panelMaximized} style={panelVisible && panelMaximized ? { display: "none" } : undefined}>
      {(notice || connectionError) && <div className={`notice ${notice?.info && !connectionError ? "info" : "error"}`} role={notice?.info && !connectionError ? "status" : "alert"}><span>{connectionError ?? notice?.text}</span><button className="quiet" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {boardOpen && snapshot && project ? <Suspense fallback={<div className="loading-state" role="status">Loading project Kanban...</div>}><ProjectBoard key={project.id} sdk={client} project={project} snapshot={snapshot} onBack={leaveSurface} onUnsavedChange={setSettingsUnsaved} onSettings={() => projectSettings(project.id)} openSession={chooseSession}>{chatContent}</ProjectBoard></Suspense> :
      settingsTab && snapshot ? <Suspense fallback={<div className="loading-state" role="status">Loading shared SDK settings...</div>}><SettingsPanel sdk={client} snapshot={snapshot} session={(session?.projectId ?? null) === (project?.id ?? null) ? session : undefined} project={project} initialTab={settingsTab} artifactRequest={artifactRequest} onArtifactRequestHandled={() => setArtifactRequest(null)} onBack={leaveSettings} onUnsavedChange={setSettingsUnsaved} onSwitchProfile={openProfile} openSession={(id) => { void chooseSession(id); }} prepareMaintenance={async () => {
        if (panelDirty || switchingProfile.current) throw new Error("Finish the actual panel edit or profile switch before whole-store maintenance.");
        for (const editor of editors.current.values()) await editor.flush();
        if ([...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) throw new Error("A saved draft is still pending. No application restart was requested.");
      }} openTerminal={() => { setTerminalIntent({ panel: "Terminal", sessionId: session?.id ?? null }); setSettingsTab(null); setSettingsUnsaved(false); setPanel("Terminal"); setPanelOpen(true); }} /></Suspense> :
      globalView && snapshot ? <section className="global-page" aria-label={`${globalView} workspace`}>
        <header className="global-toolbar"><button className="icon-button" aria-label="Back to chat" onClick={() => { if (canNavigate()) beforeHidingTerminal(() => { leaveSurface(); }); }}><Icon name="Back" /></button><h1>{globalView}</h1>
          {globalView === "Suggestions" && <label>Scope<select aria-label="Resource source chat" value={globalSessionId ?? ""} onChange={(event) => { if (canNavigate()) setGlobalSessionId(event.target.value || null); }}>
            <option value="">All projects</option>{globalSessionId && !globalSession && <option value={globalSessionId} disabled>Source chat removed; choose a current scope</option>}{snapshot.sessions.filter((session) => session.status !== "archived" && session.kind !== "subagent").map((session) => <option key={session.id} value={session.id}>{title(session)}</option>)}
          </select></label>}
        </header>
        <div className={`global-content panel-${globalView.toLowerCase().replaceAll(" ", "-")}`}>{globalView === "Automations" ? <div className="panel-empty"><Icon name="Clock" /><h2>No automations yet</h2><p>This space is reserved for automations. Nothing is scheduled here.</p></div> :
          <ContextPanel key={`${client.profileId}-${globalView}-${globalSessionId}`} panel={globalView} session={globalSession} project={globalProject} events={events} client={client} run={run} snapshot={snapshot} prUrl={null} sideId={null} selectSide={setSideSessionId} onDirty={setPanelDirty} onSlash={handleSlash} editorFor={editorFor} suggestionsAll={suggestionsAll} chooseSession={chooseSession} openSettings={openSettings} setupSandbox={() => openSettings("sendbox")} modal={setNativeModal} nativeAllowed={!palette && !nativeModal && !commandOutput} />}
        </div>
      </section> : <>
      <header className="session-header">
        <button className="icon-button nav-toggle" aria-label="Toggle projects" onClick={() => setNavOpen((value) => !value)}><Icon name="Files" /></button>
        {session?.parentSessionId && <button className="icon-button" aria-label="Open parent session" title="Parent session" onClick={() => void chooseSession(session.parentSessionId!)}><Icon name="Back" /></button>}
        <div className="session-heading"><h1>{session ? title(session) : "Your workspace"}</h1><span>{session ? `${project?.name ?? "Chats"}${activeWorkspace ? ` / ${activeWorkspace.branch}` : ""} / ${session.localFinishing ? "Local finishing" : session.status.replace("_", " ")}` : "Start a chat, with or without a project."}</span></div>
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
    <aside id="session-sidebar" className="context-pane" aria-label="Session sidebar">
      {!panelMaximized && <SidebarResizer side="right" value={contextWidth} min={240} max={rightMax} onChange={setRightWidth} controls="session-sidebar" />}
      <header className="context-heading"><strong>{panel}</strong>
        <button className="icon-button" aria-label={panelMaximized ? "Restore session sidebar" : "Maximize session sidebar"} title={panelMaximized ? "Restore split view" : "Expand over chat; keep navigation visible"} onClick={() => { if (canChangePanel()) setPanelMaximized((value) => !value); }}><Icon name={panelMaximized ? "Minimize" : "Maximize"} /></button>
        <button className="icon-button" aria-label="Hide session sidebar" title="Hide session sidebar" onClick={hidePanel}><Icon name="PanelRight" /></button></header>
      <div className={`context-content panel-${panel.toLowerCase().replaceAll(" ", "-")}`}>
        {panelVisible && <ContextPanel key={`${client.profileId}-${session?.id}-${panel}`} panel={panel} session={session} project={project} events={events} client={client} run={run} snapshot={snapshot} prUrl={connectedPr} sideId={sideSessionId} selectSide={setSideSessionId} onDirty={setPanelDirty} onSlash={handleSlash} editorFor={editorFor} suggestionsAll={suggestionsAll} chooseSession={chooseSession} openSettings={openSettings} setupSandbox={() => openSettings("sendbox")} modal={setNativeModal} visible={panelVisible} terminalAutoStart={terminalIntent?.panel === panel && terminalIntent.sessionId === session?.id} onTerminalOpeningHandled={() => terminalOpeningHandled(panel, session?.id ?? null)} nativeAllowed={!palette && !nativeModal && !terminalDismiss && !composerMenuOpen && !commandOutput && panelVisible} />}
      </div>
      <footer className="context-footer">Bound to the main session</footer>
    </aside>
    <nav className="panel-rail" aria-label="Sidebar panels" onScroll={() => setPanelTooltip(null)}>{panels.map((item) => {
      const pressed = panelVisible && panel === item;
      return <button key={item} data-sidebar-panel={item} className={pressed ? "active" : ""} aria-label={item} aria-describedby={panelTooltip?.panel === item ? "sidebar-panel-tooltip" : undefined} aria-pressed={pressed} aria-expanded={pressed} aria-controls="session-sidebar"
      onMouseEnter={(event) => setPanelTooltip({ panel: item, top: event.currentTarget.getBoundingClientRect().top })}
      onMouseLeave={() => setPanelTooltip(null)} onFocus={(event) => setPanelTooltip({ panel: item, top: event.currentTarget.getBoundingClientRect().top })} onBlur={() => setPanelTooltip(null)}
      onClick={() => { if (pressed) hidePanel(); else void showPanel(item); }}><Icon name={item} /></button>;
    })}</nav>
    {panelTooltip && <div id="sidebar-panel-tooltip" className="sidebar-tooltip" role="tooltip" style={{ top: Math.min(panelTooltip.top, window.innerHeight - 42) }}>{panelTooltip.panel}</div>}
    {terminalDismiss && <TerminalCloseReview sdk={client} cancel={() => { terminalDismiss.cancel?.(); setTerminalDismiss(null); }} confirm={() => { const { action } = terminalDismiss; setTerminalDismiss(null); action(); }} />}
    {commandOutput && <CommandOutput text={commandOutput} close={() => setCommandOutput(null)} />}
    {continueChoice && <ContinueWorkDialog key={`${client.profileId}-${continueChoice.review.sessionId}-${continueChoice.review.expectedRevision}`} sdk={client}
      editor={continueChoice.editor} review={continueChoice.review} close={() => setContinueChoice(null)} modal={setNativeModal} />}
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
  </div>{profilePending && <p className="sr-only" role="status">Opening the selected isolated profile. Existing work stays in its original profile.</p>}</>;
}

function Timeline({ session, snapshot, run, client, modal, label = "Session transcript" }: { session: Session; snapshot: Snapshot; run: Run; client: MoguriClient; modal: (open: boolean) => void; label?: string }) {
  const activity = useSessionActivity(client, session, snapshot);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(150);
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
  const groups = new Map<string, PublicMessage[]>();
  for (const message of session.messages.slice(-limit)) {
    const key = message.turnId || `notice-${message.id}`, group = groups.get(key) ?? [];
    group.push(message); groups.set(key, group);
  }
  const accountingStamp = JSON.stringify([session.turnId, session.status, snapshot.budgetEntries.filter((entry) => entry.sessionId === session.id || entry.ownerSessionId === session.id)
    .map((entry) => [entry.id, entry.status, entry.reportedTokens, entry.estimatedUsdMicros, entry.outcome])]);
  const renderMessage = (message: PublicMessage) => {
    if (message.role === "tool" || message.role === "assistant" && !message.text && (message.toolCalls?.length || !message.outcome)) return null;
    return <article key={`message-${message.id}`} className={`message ${message.role}${message.role === "notice" && message.outcome === "completed" ? " info" : ""}`}>
        <header><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Moguri" : "Session"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.outcome && message.role !== "assistant" && <span className="outcome">{message.outcome}</span>}
          {message.role !== "notice" && <button className="icon-button message-copy" title="Copy message" aria-label={`Copy ${message.role === "user" ? "sent prompt" : "message"} ${message.id}`} onClick={() => void run(() => window.moguri.copyText(message.text))}><Icon name="Copy" /></button>}</header>
        <div className="markdown"><Suspense fallback={<p>{message.text || "Working..."}</p>}><RichMessage text={message.text || (message.outcome ? "No text response was returned." : "Working...")} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div>
        {message.reasoning && !entries.some((entry) => entry.messageId === message.id && entry.kind === "thought") && <details><summary>Provider-exposed reasoning</summary><div className="reasoning markdown"><Suspense fallback={<p>{message.reasoning}</p>}><RichMessage text={message.reasoning} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div></details>}
        {message.attachments?.some((attachment) => attachment.kind === "image") && <div className="message-images">{message.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => <AttachmentChip sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} onOpenChange={modal} />)}</div>}
        {message.attachments?.some((attachment) => attachment.kind !== "image") && <div className="message-documents attachment-list">{message.attachments.filter((attachment) => attachment.kind !== "image").map((attachment) => <AttachmentChip sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} onOpenChange={modal} />)}</div>}
      </article>;
  };
  return <div ref={scroll} className="timeline" role="log" aria-label={label} onScroll={() => { const view = scroll.current!; follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 100; }}><div ref={content}>
    {session.messages.length === 0 && <div className="session-empty"><img className="welcome-mascot small" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>{session.kind === "metachat" ? "Make Moguri work for you" : "What are we working on?"}</h2><p>{session.kind === "metachat" ? "Discuss settings or request a change. You review every exact proposal before it applies." : session.projectId || session.repositories ? <>Ask a question, explore {session.repositories ? "these repositories" : "this project"}, or make a change.<br />{session.controls.automaticApprovals && ["Autopilot", "Autopilot Max"].includes(session.controls.autonomy) ? "Tools and commands are approved automatically within hard policy." : "Approve an action once, or remember it for later."}</> : "Ask a question without a workspace. Files, commands and repository memory are unavailable."}</p><div className="empty-contract"><span>{session.kind === "metachat" ? "Reviewed proposals" : session.projectId || session.repositories ? `${session.controls.env} execution` : "No workspace access"}</span>{session.repositories && <span>{session.repositories.length} captured repositories</span>}<span>{session.controls.autonomy === "Manual" ? "Manual approvals" : session.controls.autonomy}</span><span>Durable history</span></div></div>}
    {session.messages.length > limit && <button className="load-history" onClick={() => setLimit((value) => value + 150)}>Show earlier messages ({session.messages.length - limit})</button>}
    {activity.activity?.nextBefore !== null && activity.activity?.nextBefore !== undefined && <button className="load-history" disabled={activity.earlierLoading} onClick={() => void activity.loadEarlier()}>Show earlier activity</button>}
    {activity.error && <p className="inline-error activity-read-error" role="alert">{activity.error}</p>}
    {[...groups].map(([turnId, messages]) => {
      const first = messages[0]?.role === "user" ? messages[0] : null;
      const operations = entries.filter((entry) => entry.turnId === turnId && entry.kind !== "model");
      const parts: Array<{ sequence: number; message?: PublicMessage; operation?: ActivityEntry }> = [
        ...messages.filter((message) => message.id !== first?.id && message.role !== "tool").map((message) => ({ sequence: positions.get(message.id) ?? Number.MAX_SAFE_INTEGER, message })),
        ...operations.map((operation) => ({ sequence: operation.sequence, operation })),
      ];
      parts.sort((a, b) => a.sequence - b.sequence || Number(Boolean(b.operation)) - Number(Boolean(a.operation)));
      return <div className="conversation-turn" key={JSON.stringify([client.profileId, session.id, turnId])} data-turn-id={turnId}>
        {first && renderMessage(first)}
        <section className="response-turn" aria-label="Assistant response">
          {parts.map((part) => part.operation ? <ActivityRow sdk={client} entry={part.operation} version={activity.activity?.sequence ?? 0} key={part.operation.id} /> : part.message ? renderMessage(part.message) : null)}
          {messages.some((message) => message.role === "tool") && activity.loading && <p className="fine-print" role="status">Loading retained operations...</p>}
          {session.turnId === turnId && !activity.error && <CurrentActivity entries={(activity.activity?.current ?? []).filter((entry) => entry.turnId === turnId)} hasMore={(activity.activity?.currentCount ?? 0) > (activity.activity?.current.length ?? 0)} />}
          {messages[0]?.turnId && <TurnActions sdk={client} sessionId={session.id} turnId={turnId} stamp={accountingStamp}
            canCopy={messages.some((message) => message.role === "assistant" && Boolean(message.text))} run={run} modal={modal} />}
        </section>
      </div>;
    })}
    {entries.some((entry) => entry.turnId === null) && <section className="session-activities" aria-label="Session actions"><h2>Session actions</h2>
      {entries.filter((entry) => entry.turnId === null).map((entry) => <ActivityRow sdk={client} entry={entry} version={activity.activity?.sequence ?? 0} key={entry.id} />)}
      {!activity.error && <CurrentActivity entries={(activity.activity?.current ?? []).filter((entry) => entry.turnId === null)} hasMore={(activity.activity?.currentCount ?? 0) > (activity.activity?.current.length ?? 0)} />}
    </section>}
  </div>
  </div>;
}
function Queue({ session, command, client, modal }: { session: Session; command: (command: Command) => Promise<void>; client: MoguriClient; modal: (open: boolean) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const save = async (messageId: string) => {
    setError("");
    try {
      await client.command({ type: "queue.edit", sessionId: session.id, messageId, expectedRevision: session.queueRevision, text });
      setEditing(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Queue edit failed. Your replacement text is preserved."); }
  };
  return <section className="queue" aria-label="Message queue"><header><strong>Queued messages</strong><span>{session.queue.length} unclaimed</span>
    {!session.turnId && session.queue.some((item) => item.delivery !== "steer") && <button className="quiet" onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume queued work</button>}</header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <ReorderList items={session.queue} scope={`${client.profileId}:queue:${session.id}`} label="Queued prompt order" name={(_item, index) => `queued message ${index + 1}`} disabled={editing !== null}
      change={async (items) => { await client.command({ type: "queue.reorder", sessionId: session.id, expectedRevision: session.queueRevision, messageIds: items.map((item) => item.id) }); }}>
      {(item, index) => <div className="queue-item">{editing === item.id ? <><textarea aria-label="Edit queued message" value={text} onChange={(event) => setText(event.target.value)} /><button onClick={() => void save(item.id)}>Save</button><button className="quiet" onClick={() => setEditing(null)}>Cancel</button></> :
      <><span className="queue-delivery">{item.held ? "held" : item.delivery === "steer" && item.targetTurnId !== session.turnId ? "unapplied steer" : item.delivery}</span><span className="queue-text" title={item.text}>{item.text || "Attached project context"}</span>
        {item.attachments.map((attachment) => <AttachmentChip key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} onOpenChange={modal} />)}
        {item.held && <button className="icon-button" aria-label={`Run queued message ${index + 1}`} title="Release this held prompt" onClick={() => void client.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(error instanceof Error ? error.message : "Prompt could not be released."))}><Icon name="Play" /></button>}
        {item.delivery === "steer" && <button className="quiet" onClick={() => void command({ type: "queue.make-turn", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}>Queue as new turn</button>}
        <button className="icon-button" aria-label={`Copy queued message ${index + 1}`} title="Copy" onClick={() => void window.moguri.copyText(item.text).catch((error: unknown) => setError(error instanceof Error ? error.message : "Copy failed."))}><Icon name="Copy" /></button>
        <button className="icon-button" aria-label={`Edit queued message ${index + 1}`} title="Edit" onClick={() => { setEditing(item.id); setText(item.text); }}><Icon name="Edit" /></button>
        <button className="icon-button" aria-label={`Remove queued message ${index + 1}`} title="Delete" onClick={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}><Icon name="Trash" /></button></>}</div>}
    </ReorderList>
  </section>;
}
function ContextPanel({ panel, session, project, events, client, run, snapshot, prUrl, sideId, selectSide, onDirty, onSlash, editorFor, nativeAllowed, visible = true, terminalAutoStart = false, onTerminalOpeningHandled, suggestionsAll, chooseSession, modal, setupSandbox, openSettings }: {
  panel: Panel; session?: Session; project?: Project; events: StoredEvent[]; client: MoguriClient; run: Run; snapshot: Snapshot | null;
  prUrl: string | null; sideId: string | null; selectSide: (id: string) => void; onDirty: (dirty: boolean) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; nativeAllowed: boolean; visible?: boolean; terminalAutoStart?: boolean; onTerminalOpeningHandled?: () => void;
  editorFor: (session: Session) => DraftEditor;
  suggestionsAll: boolean; chooseSession: (id: string) => Promise<void>; modal: (open: boolean) => void;
  setupSandbox: () => void; openSettings: (tab: SettingsTab) => void;
}) {
  const [trace, setTrace] = useState(false);
  if (panel === "Dashboard" && snapshot) return <Dashboard key={client.profileId} sdk={client} snapshot={snapshot} openSession={chooseSession} />;
  if (panel === "Terminal" && snapshot && session) return <Suspense fallback={<p role="status">Loading Ghostty...</p>}><SessionTerminal sdk={client} session={session} snapshot={snapshot} active={nativeAllowed} visible={visible} autoStart={terminalAutoStart} onAutoStartHandled={onTerminalOpeningHandled} /></Suspense>;
  if (panel === "Attention" && snapshot) return <AttentionPanel sdk={client} snapshot={snapshot} chooseSession={chooseSession} />;
  if (panel === "Suggestions" && snapshot) return <SuggestionsPanel sdk={client} snapshot={snapshot} session={session} allProjects={!session || session.projectId === null && suggestionsAll} chooseSession={chooseSession} modal={modal} />;
  if (!session) return <div className="panel-empty"><Icon name={panel} /><h2>Your session context</h2><p>Open a session to see its {panel.toLowerCase()}. This panel follows the conversation in the main pane.</p></div>;
  const workspaceScope = JSON.stringify([client.profileId, session.id, session.controls.env, session.workspaceId, project?.path,
    session.repositories?.map((binding) => [binding, snapshot?.projectConfigurations.find((configuration) => configuration.projectId === binding.projectId)]),
    snapshot?.projectConfigurations.find((value) => value.projectId === session.projectId), session.controls.env === "Remote" ? snapshot?.settings.values.remote : null,
    session.controls.env === "Sandbox" ? [session.sandboxWorkspaceId, snapshot?.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId)?.revision, snapshot?.settings.values.sandbox] : null]);
  if (!project && !session.repositories && ["Terminal", "Changes", "Files", "PR"].includes(panel)) return <div className="panel-empty"><Icon name="Files" /><h2>No project selected</h2><p>This chat cannot access workspace files or commands. Start a project chat for those operations.</p></div>;
  if (session.repositories && ["PR", "Code change", "Work item"].includes(panel)) return <div className="panel-empty"><Icon name={panel} /><h2>Choose an individual repository chat</h2><p>This repository-specific panel is available in each member project's chat. Folder sessions can read, edit and run commands across their explicitly selected captured roots; no first repository was substituted.</p></div>;
  if (panel === "Insights") {
    const execution = snapshot?.executions.findLast((value) => value.sessionId === session.id);
    const nativeExecution = snapshot?.sandboxExecutions?.findLast((value) => value.sessionId === session.id);
    const nativeWorkspace = snapshot?.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId);
    const routing = snapshot?.routings.findLast((value) => value.sessionId === session.id);
    const workspace = session.controls.env === "Sandbox" ? nativeWorkspace?.stage?.workspace : session.controls.env === "Remote" ? snapshot?.projectConfigurations.find((value) => value.projectId === project?.id)?.values.remotePath : snapshot?.managedWorkspaces.find((value) => value.id === session.workspaceId)?.path ?? project?.path;
    const known = session.usage.filter((usage) => usage.totalTokens !== null);
    const unknown = session.usage.some((usage) => usage.totalTokens === null);
    const total = known.reduce((sum, usage) => sum + (usage.totalTokens ?? 0), 0);
    return <>
      <div className="context-binding"><span className={`status-dot ${session.status}`} /><strong>{title(session)}</strong><small>{session.status.replace("_", " ")}</small></div>
      <h2>Session details</h2><dl className="facts">
        <dt>Project</dt><dd>{session.repositories?.map((binding) => binding.name).join(", ") ?? project?.name ?? "Unavailable"}</dd><dt>Workspace</dt><dd className="path">{session.repositories?.map((binding) => binding.root.root).join("\n") ?? workspace ?? "Unavailable"}</dd>
        <dt>Profile</dt><dd>{snapshot?.profile?.name ?? client.profileId}</dd><dt>Env</dt><dd>{session.localFinishing ? "Local finishing" : session.controls.env}</dd><dt>Boundary</dt><dd>{session.controls.env === "Remote" ? `SSH host ${execution?.target.name ?? snapshot?.settings.values.remote?.name ?? "(unconfigured)"}, not SendBox-isolated` : session.controls.env === "Sandbox" ? "SendBox native guest; private stage, not the Local source" : "Host execution, not isolated"}</dd>
        <dt>Model</dt><dd>{session.controls.modelId ?? "Not selected"}</dd><dt>Autonomy</dt><dd>{session.controls.autonomy}</dd><dt>Budget</dt><dd>{session.controls.budget.kind === "limited" ? "Estimate-based session cap" : "Unlimited preference"}{snapshot?.budgetPolicy.limit ? " / profile hard cap" : ""}</dd>
      </dl>
      {routing && <details><summary>Kupo routing provenance</summary><dl className="facts"><dt>Status</dt><dd>{routing.status}</dd><dt>Workflow</dt><dd>{routing.plan?.pattern ?? "Not selected"}</dd><dt>Classifier</dt><dd className="path">{routing.classifierModelId ?? "Not called (one eligible model)"}</dd><dt>Draft / solver</dt><dd className="path">{routing.plan?.modelId ?? "No accepted plan"}</dd>
        {routing.plan?.pattern === "cascade" && <><dt>Gate / escalation</dt><dd className="path">{routing.plan.escalationId}</dd></>}
        {routing.plan?.pattern === "critique" && <><dt>Read-only critic</dt><dd className="path">{routing.plan.criticId}</dd></>}
        <dt>Confidence / threshold</dt><dd>{routing.plan?.confidence ?? "Not classified"} / {routing.policy.minimumConfidence}</dd></dl>
        {routing.plan && <p>{routing.plan.reason}</p>}{routing.diagnostic && <p className="inline-error">{routing.diagnostic}</p>}<p className="fine-print">Model-supplied confidence is not calibrated probability or permission. Inspect per-call accounting below for actual dispatches; classifier output never becomes solver instructions.</p></details>}
      {execution && <details><summary>Owned remote execution</summary><p className="path">{execution.id}</p><p>{execution.status} / cancellation {execution.cancellation} / {execution.cleanup}</p><p>{execution.diagnostic}</p><button disabled={Boolean(session.turnId)} onClick={() => void run(() => client.remote.reconcile(execution.id))}>Reconcile receipts</button></details>}
      {nativeExecution && <details><summary>Owned native execution</summary><p className="path">{nativeExecution.id}</p><p>{nativeExecution.status} / cancellation {nativeExecution.cancellation} / {nativeExecution.cleanup}</p><p>Model root: {nativeExecution.root ?? "null, project-free"}. Source changes require separate actual-user publication in Sandbox.</p>{nativeExecution.diagnostic && <p className="settings-warning">{nativeExecution.diagnostic}</p>}</details>}
      <details><summary>Startup control sources</summary><pre>{JSON.stringify(session.defaults ?? { source: "legacy explicit session controls" }, null, 2)}</pre><p className="fine-print">These sources were recorded when the session was created. Changing defaults does not rewrite this session.</p></details>
      <h2>Usage</h2><dl className="facts"><dt>Direct model calls</dt><dd>{session.usage.length}</dd><dt>Direct tokens</dt><dd>{known.length ? number(total) + (unknown ? " + unknown" : "") : session.usage.length ? "Unavailable" : "No requests yet"}</dd><dt>Request wall time</dt><dd>{(session.usage.reduce((sum, usage) => sum + usage.requestMs, 0) / 1000).toFixed(2)} s</dd></dl>
      {snapshot && <SessionBudgetSummary sdk={client} snapshot={snapshot} session={session} />}
      <p className="fine-print">Copilot entitlement and billing are account-specific. Missing telemetry is not zero. Active-generation throughput is not measured in this checkpoint.</p>
      {session.usage.length > 0 && <details><summary>Per-call accounting</summary>{session.usage.map((usage) => <div className="call-record" key={usage.stepId}><strong>{usage.modelId}</strong><small>{usage.role} / {usage.outcome}</small><span>{usage.totalTokens === null ? "Tokens unavailable" : `${number(usage.totalTokens)} tokens (${usage.quality})`}</span></div>)}</details>}
      <button className="trace-toggle" onClick={() => setTrace((value) => !value)}>{trace ? "Hide" : "Show"} recent event trace</button>
      {trace && <div className="event-trace"><p className="fine-print">Most recent 200 received events, filtered to this session.</p>{events.filter((event) => event.session_id === session.id).map((event) => <details key={event.id}><summary>#{event.seq} {event.event_type}</summary><pre>{JSON.stringify(event, null, 2)}</pre></details>)}</div>}
      {session.lastError && <p className="inline-error">{session.lastError}</p>}
    </>;
  }
  if (panel === "Browser") return nativeAllowed ? <BrowserPanel sdk={client} session={session} /> : <p className="fine-print">Preview hidden while another surface is active.</p>;
  if (panel === "Changes") return session.controls.env !== "Sandbox" ? <ChangesPanel key={workspaceScope} sdk={client} session={session} /> :
    snapshot ? <SandboxPanel sdk={client} snapshot={snapshot} session={session} onDirty={onDirty} setup={setupSandbox} sessionOnly /> : null;
  if (panel === "Files") return <FilesPanel key={workspaceScope} sdk={client} session={session} />;
  if (panel === "Plan" && snapshot) return <PlanPanel sdk={client} session={session} snapshot={snapshot} workspaceScope={workspaceScope} onDirty={onDirty} modal={modal} />;
  if (panel === "Side chat" && snapshot) return <SideChat sdk={client} parent={session} snapshot={snapshot} selectedId={sideId} select={selectSide} onSlash={onSlash} editorFor={editorFor} onDirty={onDirty}
    openSettings={openSettings} modal={modal} renderTranscript={(side) => <Timeline session={side} snapshot={snapshot} run={run} client={client} modal={modal} label="Side chat transcript" />}
    renderQueue={(side) => <Queue session={side} command={(command) => run(() => client.command(command))} client={client} modal={modal} />} />;
  if ((panel === "Code change" || panel === "PR") && snapshot) return <section aria-label="Session code change" data-session-id={session.id}><p className="fine-print">{title(session)}</p><h2>{prUrl ? "Connected PR" : "Pull requests"}</h2>{!prUrl && <p className="fine-print">This session has no linked pull request. Choose an existing PR or review a new one below.</p>}<SessionGitHub sdk={client} session={session} snapshot={snapshot} kind="pull" selectedUrl={prUrl} onDirty={onDirty} chooseSession={chooseSession} /></section>;
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
    {error && <p className="inline-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={() => ref.current?.close()}>Keep open</button><button className="primary" type="button" disabled={busy} onClick={() => void hide()}>Hide terminal</button></footer>
  </dialog>;
}
function CommandOutput({ text, close }: { text: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="workspace-dialog command-output" onClose={close} aria-label="Command response"><header><h2>Command response</h2><button className="icon-button" aria-label="Close command response" onClick={close}><Icon name="Close" /></button></header><pre>{text}</pre></dialog>;
}
function CommandPalette({ actions, close }: { actions: { name: string; action: () => Promise<void> }[]; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="command-palette" onClose={close}><header><label htmlFor="command-search">Commands</label><button className="quiet" onClick={() => ref.current?.close()}>Esc</button></header>
    <input id="command-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a command..." />
    <div>{actions.filter((action) => action.name.toLowerCase().includes(query.toLowerCase())).map((action) => <button key={action.name} onClick={() => { close(); void action.action(); }}>{action.name}<span>&gt;</span></button>)}</div>
  </dialog>;
}
