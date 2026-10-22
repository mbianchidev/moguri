import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeDecision, DraftEditor, sessionTitle as title, type MoguriSdk, type Command, type Project, type ProviderState, type Session, type Snapshot, type StoredEvent, type SessionPanel, type SlashResult, type ArtifactEditorRequest } from "../../../packages/sdk/src/index.ts";
import { useMoguri } from "../../../packages/sdk/src/react.ts";
import mascot from "../../../assets/moguri.svg";
import type { SettingsTab } from "./SettingsPanel.tsx";
import { Icon } from "./Icon.tsx";
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import { BrowserPanel, ChangesPanel, FilesPanel, PlanPanel, SideChat } from "./SessionPanels.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { AttentionPanel, SuggestionsPanel, ConfigurationProposals } from "./EngagementPanels.tsx";
import { ContextImage } from "./ContextAttachments.tsx";
import { ContextDocument } from "./DocumentAttachment.tsx";
import { ArtifactPanel } from "./ArtifactPanel.tsx";
import { SandboxPanel } from "./SandboxPanel.tsx";
import { CandidatePanel } from "./CandidatePanel.tsx";
import { ModelAdvice, QuestionCard } from "./QuestionCard.tsx";
import { SessionBudgetSummary } from "./BudgetControls.tsx";
import { UsageDashboard } from "./UsageDashboard.tsx";
import { ProfileSwitcher } from "./ProfileSwitcher.tsx";
const SettingsPanel = lazy(() => import("./SettingsPanel.tsx").then((module) => ({ default: module.SettingsPanel })));
const RichMessage = lazy(() => import("./RichMessage.tsx"));
const ProjectBoard = lazy(() => import("./ProjectBoard.tsx").then((module) => ({ default: module.ProjectBoard })));
const GhosttyTerminal = lazy(() => import("./GhosttyTerminal.tsx").then((module) => ({ default: module.GhosttyTerminal })));
type MoguriClient = MoguriSdk;

type Panel = SessionPanel;
const panels: Panel[] = ["Terminal", "Browser", "Insights", "Dashboard", "PR", "Changes", "Files", "Plan", "Artifacts", "Candidates", "Sandbox", "Side chat", "Suggestions", "Attention"];
const number = (value: number) => new Intl.NumberFormat().format(value);
function savedLayout(): { panel: Panel; open: boolean; wide: boolean } {
  try {
    const raw = localStorage.getItem("moguri.sidebar");
    if (!raw) return { panel: "Insights", open: true, wide: false };
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "panel" in value && panels.includes(value.panel as Panel) &&
      "open" in value && typeof value.open === "boolean" && "wide" in value && typeof value.wide === "boolean") {
      return { panel: value.panel as Panel, open: value.open, wide: value.wide };
    }
    console.error("Invalid sidebar preference; using the default layout.");
  } catch { console.error("Sidebar preferences are unavailable; using the default layout."); }
  return { panel: "Insights", open: true, wide: false };
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
  const [panel, setPanel] = useState<Panel>(layout.panel);
  const [panelOpen, setPanelOpen] = useState(layout.open);
  const [widePanel, setWidePanel] = useState(layout.wide);
  const [connections, setConnections] = useState(false);
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notice, updateNotice] = useState<{ text: string; info: boolean } | null>(null);
  const setNotice = useCallback((text: string | null, info = false) => updateNotice(text ? { text, info } : null), []);
  const [busy, setBusy] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [settingsUnsaved, setSettingsUnsaved] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [panelDirty, setPanelDirty] = useState(false);
  const [nativeModal, setNativeModal] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [sideSessionId, setSideSessionId] = useState<string | null>(null);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [suggestionsAll, setSuggestionsAll] = useState(false);
  const [artifactRequest, setArtifactRequest] = useState<ArtifactEditorRequest | null>(null);
  const [profileMenu, setProfileMenu] = useState(false), [profileDirty, setProfileDirty] = useState(false);
  const switchingProfile = useRef(false);
  const [profilePending, setProfilePending] = useState(false);
  const editors = useRef(new Map<string, DraftEditor>());
  useEffect(() => () => { for (const editor of editors.current.values()) editor.dispose(); for (const client of clients.current) client.disconnect(); }, []);
  const session = snapshot?.sessions.find((session) => session.id === selectedId);
  const activeWorkspace = snapshot?.managedWorkspaces.find((workspace) => workspace.id === session?.workspaceId);
  const pendingQuestion = snapshot?.questions.find((question) => question.id === session?.pendingQuestionId && question.status === "open");
  const decisionReview = snapshot?.decisions.find((record) => record.sessionId === session?.id && record.turnId === session?.turnId && activeDecision(record));
  const copilot = snapshot?.provider.connections?.find((connection) => connection.id === "github-copilot") ?? snapshot?.provider;
  const displayProjectId = settingsTab === "project" ? settingsProjectId : boardOpen ? projectId : session ? session.projectId : projectId;
  const project = snapshot?.projects.find((project) => project.id === displayProjectId);
  const connectedPr = session?.prUrl ?? snapshot?.issues.find((issue) => issue.id === session?.workItemId)?.pullRequest?.url ?? null;
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
    const preference = snapshot?.settings.values.appearance.theme ?? "dark";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = preference === "system" ? media.matches ? "dark" : "light" : preference; };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [snapshot?.settings.values.appearance.theme]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (panelDirty || settingsUnsaved || profileDirty || profilePending || [...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [panelDirty, settingsUnsaved, profileDirty, profilePending]);
  useEffect(() => {
    try { localStorage.setItem("moguri.sidebar", JSON.stringify({ panel, open: panelOpen, wide: widePanel })); }
    catch { setNotice("Sidebar preferences could not be saved. Session state is still owned by the service."); }
  }, [panel, panelOpen, widePanel]);
  const run: Run = async (action) => {
    setNotice(null); setBusy(true);
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "The operation failed. Your draft is preserved."); }
    finally { setBusy(false); }
  };
  const command = (command: Command) => run(() => client.command(command));
  const canNavigate = () => {
    if (switchingProfile.current) { setNotice("A profile switch is in progress. Existing work stays in its original profile."); return false; }
    if (!settingsUnsaved && !panelDirty && !profileDirty) return true;
    setNotice("Save your edit or reload committed values before navigating. Your edit is preserved.");
    return false;
  };
  const leaveSettings = () => { if (!canNavigate()) return false; setSettingsTab(null); return true; };
  const leaveSurface = () => { if (!leaveSettings()) return false; setBoardOpen(false); return true; };
  const openSettings = (tab: SettingsTab) => { if (!canNavigate()) return; setBoardOpen(false); setSettingsTab(tab); };
  const openBoard = () => { if (!canNavigate()) return; setSettingsTab(null); setBoardOpen(true); };
  const chooseSession = (id: string) => run(async () => {
    if (!leaveSurface()) return;
    await editor?.flush();
    const target = client.getState().snapshot?.sessions.find((session) => session.id === id);
    if (!target) throw new Error("This session was removed.");
    setSelectedId(id); setProjectId(target.projectId); setNavOpen(false); setSideSessionId(null);
    if (target.unread) await client.sessions.organize(id, { unread: false });
    const attention = client.getState().snapshot?.attention.filter((entry) => entry.sessionId === id && !entry.acknowledged).map((entry) => entry.id) ?? [];
    if (attention.length) await client.attention.acknowledge(attention.slice(-100));
  });
  const openProfile = async (id: string, targetSessionId?: string) => {
    if (!canNavigate() || nativeModal || commandOutput || palette || composerMenuOpen) throw new Error("Save/discard local edits and close dialogs before switching profiles.");
    if (snapshot?.jobs.some((job) => job.kind === "voice.record" && job.status === "running")) throw new Error("Stop owned dictation before switching profiles. Audio is not moved to another profile.");
    switchingProfile.current = true; setBusy(true); setProfilePending(true);
    let next: MoguriSdk | undefined;
    try {
      for (const editor of editors.current.values()) await editor.flush();
      next = await client.profiles.open(id);
      if (targetSessionId && !next.getState().snapshot?.sessions.some((session) => session.id === targetSessionId)) throw new Error("The notification's session was removed from its actual profile.");
      await window.moguri.profile(id);
      for (const editor of editors.current.values()) editor.dispose(); editors.current.clear();
      client.disconnect(); clients.current.delete(client); clients.current.add(next); setClient(next);
      setSelectedId(targetSessionId ?? null); setProjectId(null); setSettingsProjectId(null); setArchived(false); setSettingsTab(null); setBoardOpen(false); setConnections(false); setSideSessionId(null);
      setPalette(false); setCommandOutput(null); setArtifactRequest(null); setProfileMenu(false); setProfileDirty(false); setNotice(null);
    } catch (error) { next?.disconnect(); throw error; }
    finally { switchingProfile.current = false; setBusy(false); setProfilePending(false); }
  };
  useEffect(() => window.moguri.onNavigateSession((id, profileId) => {
    if (profileId === client.profileId) void chooseSession(id);
    else void openProfile(profileId, id).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Notification profile could not be opened."));
  }), [chooseSession, client.profileId]);
  const chooseProject = (id: string | null) => {
    if (!canNavigate()) return;
    setProjectId(id);
    if (!boardOpen) { const target = snapshot?.sessions.find((session) => session.projectId === id && session.status !== "archived"); if (target) setSelectedId(target.id); }
  };
  const projectSettings = (id: string) => { if (!canNavigate()) return; setSettingsProjectId(id); openSettings("project"); };
  const showPanel = (next: Panel) => run(async () => {
    if (!leaveSurface()) return;
    setPanel(next); setPanelOpen(true); setConnections(false);
    if (next === "Terminal" && session?.projectId && session.controls.env === "Local" && snapshot?.policy.allowedEnvs.includes("Local") &&
      !snapshot.terminals.some((terminal) => terminal.sessionId === session.id) &&
      !snapshot.terminalOwners.some((owner) => !owner.remote && owner.cleanup !== "removed" && !["running", "acknowledged"].includes(owner.status))) await client.terminal.open(session.id);
  });
  const applySlash = async (result: SlashResult) => {
    if (result.kind === "profiles") { if (!canNavigate()) return; setProfileMenu(true); setNavOpen(true); return; }
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
    if (result.panel === "Suggestions") { setSuggestionsAll(result.allProjects ?? false); await showPanel("Suggestions"); }
    else if (result.panel === "Settings") openSettings("systemPrompt");
    else if (result.panel === "Models") { document.querySelector<HTMLButtonElement>('[data-composer-control="model"]')?.click(); }
    else if (result.panel === "Queue") document.querySelector(".queue")?.scrollIntoView({ block: "nearest" });
    else await showPanel(result.panel);
  };
  const handleSlash = async (target: Session, draft: DraftEditor, text: string) => {
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
  const newSession = () => run(async () => {
    if (!canNavigate()) return;
    await editor?.flush();
    const result = await client.sessions.create(projectId);
    setSelectedId(result.id!); setArchived(false); setNavOpen(false); setBoardOpen(false);
  });
  const openProject = () => run(async () => {
    if (!canNavigate()) return;
    const path = await window.moguri.chooseProject();
    if (!path) return;
    await editor?.flush();
    const result = await client.command({ type: "project.add", path });
    setProjectId(result.id!);
    const created = await client.command({ type: "session.create", projectId: result.id! });
    setSelectedId(created.id!); setArchived(false); setNavOpen(false); setBoardOpen(false);
  });
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (switchingProfile.current || nativeModal || composerMenuOpen || event.target instanceof Element && event.target.closest(".ghostty-host")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); }
      if (event.key === "Escape") { setPalette(false); setNavOpen(false); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [nativeModal, composerMenuOpen]);
  return <><div inert={profilePending} aria-busy={profilePending} className={`app-shell ${navOpen ? "nav-open" : ""} ${panelOpen && !settingsTab && !boardOpen ? "context-open" : ""} ${widePanel ? "context-wide" : ""}`}>
    <header className="titlebar">
      <div className="wordmark"><img className="brand-mascot" src={mascot} alt="" /><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">{project?.name ?? "No project"}</span>
      <button className="icon-button notification-trigger" aria-label="Attention notifications" title="Attention" onClick={() => void showPanel("Attention")}><Icon name="Attention" />{snapshot?.settings.values.notifications.inApp && snapshot.attention.some((entry) => entry.active && !entry.acknowledged) && <span className="attention-unread-dot" />}</button>
      <button className="quiet palette-trigger" onClick={() => setPalette(true)}>Commands <kbd>Ctrl K</kbd></button>
    </header>
    <nav className="project-nav" aria-label="Projects and sessions">
      <div className="nav-heading"><span>Workspace</span><button className="icon-button" aria-label="Open project" title="Open project" onClick={() => void openProject()}>+</button></div>
      <button className="new-session" aria-label="New session" onClick={() => void newSession()} disabled={busy}><Icon name="Plus" />New</button>
      <label className="new-chat-scope"><span className="sr-only">Project for new chat</span><select aria-label="Project for new chat" value={projectId ?? ""} onChange={(event) => { if (canNavigate()) setProjectId(event.target.value || null); }}><option value="">No project</option>{snapshot?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <div className="nav-tabs"><button aria-pressed={!archived && !boardOpen} onClick={() => { if (leaveSurface()) setArchived(false); }}>Sessions</button><button aria-pressed={archived && !boardOpen} onClick={() => { if (leaveSurface()) setArchived(true); }}>Archived</button><button aria-pressed={boardOpen} disabled={!project} onClick={openBoard}>Issues</button></div>
      {snapshot && <WorkspaceNavigation sdk={client} snapshot={snapshot} selectedId={selectedId} archived={archived} busy={busy} chooseSession={chooseSession} chooseProject={chooseProject} settings={projectSettings} modal={setNativeModal} allow={canNavigate} />}
      {snapshot && <ProfileSwitcher key={client.profileId} sdk={client} snapshot={snapshot} disabled={busy || settingsUnsaved || panelDirty || nativeModal} expanded={profileMenu} setExpanded={setProfileMenu} onSwitch={openProfile} onDirty={setProfileDirty} />}
      <div className="nav-footer">
        <button className="settings-nav-button" aria-label="Settings" onClick={() => openSettings("systemPrompt")}><Icon name="Settings" />Settings</button>
        <button className="settings-nav-button" aria-label="Moguri settings chat" onClick={() => void run(async () => { if (!canNavigate()) return; const result = await client.metachat.create(session ? session.projectId : projectId, session?.id); await chooseSession(result.id!); })}><Icon name="Suggestions" />Settings chat</button>
        <button className="provider-button" onClick={() => { if (leaveSurface()) { setConnections((value) => !value); setPanelOpen(true); } }}>
          <span className={`status-dot ${copilot?.status === "connected" ? "completed" : "idle"}`} />
          <span><strong>GitHub Copilot</strong><small>{copilot?.status ?? "Connecting to service"}</small></span><span>&gt;</span>
        </button>
        <div className="connection-line"><span className={`status-dot ${status === "connected" ? "completed" : "failed"}`} />Local service {status}</div>
      </div>
    </nav>
    <main className="main-pane">
      {(notice || connectionError) && <div className={`notice ${notice?.info && !connectionError ? "info" : "error"}`} role={notice?.info && !connectionError ? "status" : "alert"}><span>{connectionError ?? notice?.text}</span><button className="quiet" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {boardOpen && snapshot && project ? <Suspense fallback={<div className="loading-state" role="status">Loading local project issues...</div>}><ProjectBoard key={project.id} sdk={client} project={project} snapshot={snapshot} onBack={leaveSurface} onUnsavedChange={setSettingsUnsaved} /></Suspense> :
      settingsTab && snapshot ? <Suspense fallback={<div className="loading-state" role="status">Loading shared SDK settings...</div>}><SettingsPanel sdk={client} snapshot={snapshot} session={(session?.projectId ?? null) === (project?.id ?? null) ? session : undefined} project={project} initialTab={settingsTab} onBack={leaveSettings} onUnsavedChange={setSettingsUnsaved} openSession={(id) => { void chooseSession(id); }} openTerminal={() => { setSettingsTab(null); setSettingsUnsaved(false); setConnections(false); setPanel("Terminal"); setPanelOpen(true); }} /></Suspense> : <>
      <header className="session-header">
        <button className="icon-button nav-toggle" aria-label="Toggle projects" onClick={() => setNavOpen((value) => !value)}><Icon name="Files" /></button>
        {session?.parentSessionId && <button className="icon-button" aria-label="Open parent session" title="Parent session" onClick={() => void chooseSession(session.parentSessionId!)}><Icon name="Back" /></button>}
        <div className="session-heading"><h1>{session ? title(session) : "Your workspace"}</h1><span>{session ? `${project?.name ?? "No project"}${activeWorkspace ? ` / ${activeWorkspace.branch}` : ""} / ${session.localFinishing ? "Local finishing" : session.status.replace("_", " ")}` : "Start a chat, with or without a project."}</span></div>
        {session && <label className="session-mode" title={session.pendingMode ? "Requested mode applies at the next safe boundary" : "Hard session tool boundary"}><Icon name={session.mode === "read-only" ? "ReadOnly" : "Agent"} /><select aria-label="Session mode" value={session.pendingMode ?? session.mode} disabled={session.kind === "side" || session.kind === "subagent"} onChange={(event) => void run(() => client.sessions.mode(session.id, event.target.value === "agent" ? "agent" : "read-only"))}><option value="agent">Agent</option><option value="read-only">Read-only</option></select>{session.pendingMode && <span className="fine-print">pending</span>}</label>}
        {session?.turnId && <button className="stop-button" disabled={session.status === "stopping"} onClick={() => void command({ type: "session.stop", sessionId: session.id })}>{session.status === "stopping" ? "Stopping..." : "Stop turn"}</button>}
        {session && !session.turnId && (snapshot?.blockedSessions.includes(session.id) || session.workspaceId && snapshot?.blockedWorkspaces.includes(session.workspaceId) || session.projectId && !session.workspaceId && snapshot?.blockedProjects.includes(session.projectId)) && <button title="Inspect unconfirmed effects before continuing. This does not claim cleanup succeeded." onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume after inspection</button>}
        {session && !session.turnId && <button className="quiet" onClick={() => void command({ type: session.status === "archived" ? "session.restore" : "session.archive", sessionId: session.id })}>{session.status === "archived" ? "Restore" : "Archive"}</button>}
        <button className="icon-button" aria-label={panelOpen ? "Collapse session sidebar" : "Open session sidebar"} onClick={() => { if (canNavigate()) { setPanelOpen((value) => !value); setConnections(false); } }}><Icon name="Insights" /></button>
      </header>
      {!snapshot ? <div className="loading-state" role="status"><div className="skeleton" /><div className="skeleton short" /><p>Connecting to your local workspace...</p></div> :
        !session ? <div className="welcome">
          <img className="welcome-mascot" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>What are we working on?</h2><p>Start a project-free conversation or open a workspace. Nothing runs until you ask.</p>
          <div className="welcome-actions"><button className="primary" onClick={() => void newSession()}>New chat</button><button onClick={() => void openProject()}>Open a project</button></div>
          <ProviderConnect provider={snapshot.provider} run={run} client={client} />
        </div> :
        <>
          <Timeline session={session} run={run} client={client} />
          {pendingQuestion && <QuestionCard key={pendingQuestion.id} sdk={client} question={pendingQuestion} decisionPending={decisionReview?.source.kind === "question" && decisionReview.source.questionId === pendingQuestion.id} />}
          {session.kind === "metachat" && snapshot && <ConfigurationProposals sdk={client} snapshot={snapshot} session={session} modal={setNativeModal} />}
          {session.pendingApproval && <section className="approval" aria-label="Tool approval">
            <div className="approval-heading"><span className="attention-dot" /><strong>Your approval is required</strong><span>{session.controls.autonomy}</span></div>
            {decisionReview?.source.kind === "tool" && decisionReview.source.approvalId === session.pendingApproval.id &&
              <p className="fine-print" role="status">A separately metered decision provider is reviewing the existing exact delegation. You can override it now; your actual answer wins and cancelled usage may remain held.</p>}
            <p><strong>{session.pendingApproval.call.name}</strong>{session.pendingApproval.call.name === "run_command" ? session.controls.env === "Remote" ? " will run on the configured SSH host, not inside SendBox." : session.controls.env === "Sandbox" ? " will run inside the approved SendBox boundary." : " will run on your Mac without sandbox isolation." : session.pendingApproval.call.name === "mcp_gateway" ? " may access host code or external services through the configured MCP. Review the exact server, tool and arguments." : session.pendingApproval.call.name === "run_subagent" ? " will send the approved context to a separate, tool-less model call." : session.pendingApproval.call.name.startsWith("propose_") ? " will create a pending proposal, not apply or enable it." : " will access this project's files."}</p>
            <pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre>
            {session.pendingApproval.recommendation && session.pendingApproval.recommendationSource?.stepId === session.pendingApproval.stepId && session.pendingApproval.recommendationSource.callId === session.pendingApproval.call.id ?
              <ModelAdvice text={session.pendingApproval.recommendation} source={session.pendingApproval.recommendationSource} /> :
              session.controls.autonomy === "Guided" && <p className="fine-print">The current solver supplied no explicit recommendation. Review the exact arguments; only your decision or an existing deterministic grant can authorize this action.</p>}
            <div className="approval-actions"><button disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: false })}>Deny</button><button className="primary" disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: true })}>Approve this action</button></div>
          </section>}
          {session.queue.length > 0 && <Queue session={session} command={command} client={client} />}
          {editor && <ChatComposer key={session.id} session={session} project={project && activeWorkspace ? { ...project, path: activeWorkspace.path } : project} snapshot={snapshot} client={client} editor={editor} run={run} busy={busy} connected={status === "connected"} onConnect={() => { setConnections(true); setPanelOpen(true); }} onSlash={handleSlash} onMenuChange={setComposerMenuOpen} onGuardrails={() => openSettings("permissions")} onLocalModels={() => openSettings("localModels")} onRemote={() => openSettings("remote")} onSandbox={() => void showPanel("Sandbox")} onRouting={() => openSettings("kupo")} onDecisions={() => openSettings("decisions")} />}
        </>}
      </>}
    </main>
    <aside className="context-pane" aria-label="Session sidebar">
      <header className="context-heading"><strong>{connections ? "Connections" : panel}</strong><div><button className="icon-button" aria-label="Resize sidebar" title="Toggle sidebar width" onClick={() => setWidePanel((value) => !value)}>&lt;&gt;</button><button className="icon-button" aria-label="Close sidebar" onClick={() => { if (canNavigate()) setPanelOpen(false); }}><Icon name="Close" /></button></div></header>
      <div className={`context-content panel-${panel.toLowerCase().replaceAll(" ", "-")}`}>{connections && snapshot ? <><ProviderConnect provider={snapshot.provider} client={client} run={run} /><PolicySettings snapshot={snapshot} command={command} /></> :
        <ContextPanel key={`${client.profileId}-${panel === "Artifacts" || panel === "Candidates" || panel === "Dashboard" || panel === "Sandbox" ? "independent" : session?.id}-${panel}`} panel={panel} session={session} project={project} events={events} client={client} run={run} snapshot={snapshot} prUrl={connectedPr} sideId={sideSessionId} selectSide={setSideSessionId} onDirty={setPanelDirty} onSlash={handleSlash} editorFor={editorFor} suggestionsAll={suggestionsAll} chooseSession={chooseSession} artifactRequest={artifactRequest} clearArtifactRequest={() => setArtifactRequest(null)} setupSandbox={() => openSettings("permissions")} modal={setNativeModal} nativeAllowed={!palette && !nativeModal && !composerMenuOpen && !commandOutput && panelOpen && !settingsTab && !boardOpen} />}
      </div>
      <footer className="context-footer">{panel === "Artifacts" ? "Independent of session retention" : panel === "Candidates" ? "Retained independently; writes use reviewed roots" : panel === "Sandbox" ? "Private stages; separate reviewed source publication" : panel === "Dashboard" ? "Current-profile cumulative accounting" : "Bound to the main session"}</footer>
    </aside>
    <nav className="panel-rail" aria-label="Sidebar panels">{panels.filter((item) => item !== "PR" || connectedPr).map((item) => <button key={item} className={panelOpen && panel === item && !connections ? "active" : ""} aria-label={item} title={item} aria-pressed={panelOpen && panel === item && !connections} onClick={() => void showPanel(item)}><Icon name={item} /></button>)}</nav>
    {commandOutput && <CommandOutput text={commandOutput} close={() => setCommandOutput(null)} />}
    {palette && <CommandPalette close={() => setPalette(false)} actions={[
      { name: "New session", action: newSession }, { name: "Open project", action: openProject },
      { name: "Connect GitHub Copilot", action: async () => { if (leaveSurface()) { setConnections(true); setPanelOpen(true); } } },
      { name: "Show Insights and event trace", action: async () => { if (leaveSurface()) { setPanel("Insights"); setPanelOpen(true); setConnections(false); } } },
      { name: "Settings and editable system prompt", action: async () => openSettings("systemPrompt") },
      { name: "Profiles: choose, create or rename", action: async () => { if (canNavigate()) { setProfileMenu(true); setNavOpen(true); } } },
      { name: "Local project issue board", action: async () => openBoard() },
      { name: "Shared dependency cache", action: async () => openSettings("cache") },
      ...(session?.turnId ? [{ name: "Stop active turn", action: () => command({ type: "session.stop", sessionId: session.id }) }] : []),
    ]} />}
  </div>{profilePending && <p className="sr-only" role="status">Opening the selected isolated profile. Existing work stays in its original profile.</p>}</>;
}

function ProviderConnect({ provider, run, client }: { provider: ProviderState; run: Run; client: MoguriClient }) {
  const copilot = provider.connections?.find((connection) => connection.id === "github-copilot") ?? provider;
  return <section className="provider-setup" aria-label="GitHub Copilot connection">
    <h2>GitHub Copilot</h2>
    {copilot.status === "connected" ? <><p className="connected-label">Connected through your Copilot account.</p><p>{provider.models.filter((model) => model.source !== "local").length} account-enabled models available. Choose one in the composer.</p>
      <div className="button-row"><button onClick={() => void run(() => client.command({ type: "provider.refresh" }))}>Refresh connection</button><button className="quiet" onClick={() => void run(() => client.command({ type: "provider.logout" }))}>Sign out</button></div></> :
      <>
        <p>Use your existing Copilot subscription. No other provider key is needed.</p>
        {provider.login ? <div className="device-flow">
          <p>Open GitHub and enter this one-time code:</p><code aria-label="GitHub device code">{provider.login.code}</code>
          <button className="primary" onClick={() => void run(() => window.moguri.openExternal(provider.login!.url))}>Open GitHub</button>
          <p className="muted">Waiting for authorization. Expires at {new Date(provider.login.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
          <button className="quiet" onClick={() => void run(() => client.command({ type: "provider.cancel" }))}>Cancel sign-in</button>
        </div> : <button className="primary" disabled={copilot.status === "connecting"} onClick={() => void run(() => client.command({ type: "provider.login" }))}>{copilot.status === "connecting" ? "Starting sign-in..." : "Sign in with GitHub Copilot"}</button>}
        <p className="fine-print">Uses pi-ai's third-party device flow, not an official Moguri partnership. GitHub subscription and organization policies apply. Sign-in may enable account model policies. Credentials stay in your OS keychain.</p>
      </>}
    {copilot.diagnostic && <p className="inline-error" role="status">{copilot.diagnostic}</p>}
  </section>;
}
function Timeline({ session, run, client }: { session: Session; run: Run; client: MoguriClient }) {
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
  }, [session.id, session.messages.length === 0]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [session.messages.length, session.messages.at(-1)?.text, session.id]);
  return <div ref={scroll} className="timeline" role="log" aria-label="Session transcript" onScroll={() => { const view = scroll.current!; follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 100; }}>
    {session.messages.length === 0 ? <div className="session-empty"><img className="welcome-mascot small" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>{session.kind === "metachat" ? "Make Moguri work for you" : "What are we working on?"}</h2><p>{session.kind === "metachat" ? "Discuss settings or request a change. You review every exact proposal before it applies." : session.projectId ? <>Ask a question, explore this project, or make a change.<br />You review every tool action before it runs.</> : "Ask a question without a workspace. Files, commands and repository memory are unavailable."}</p><div className="empty-contract">    <span>{session.kind === "metachat" ? "Reviewed proposals" : session.projectId ? `${session.controls.env} execution` : "No workspace access"}</span><span>Manual approvals</span><span>Durable history</span></div></div> : <div ref={content}>
      {session.messages.length > limit && <button className="load-history" onClick={() => setLimit((value) => value + 150)}>Show earlier messages ({session.messages.length - limit})</button>}
      {session.messages.slice(-limit).map((message) => <article key={message.id} className={`message ${message.role}${message.role === "notice" && message.outcome === "completed" ? " info" : ""}`}>
        <header><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Moguri" : message.role === "tool" ? message.toolCalls?.[0]?.name ?? "Tool" : "Session"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.outcome && message.role !== "assistant" && <span className="outcome">{message.outcome}</span>}
          {message.role !== "notice" && <button className="icon-button message-copy" title="Copy message" aria-label={`Copy ${message.role === "user" ? "sent prompt" : "message"} ${message.id}`} onClick={() => void run(() => window.moguri.copyText(message.text))}><Icon name="Copy" /></button>}</header>
        {message.role === "tool" ? <details open={message.outcome === "running"}><summary>{message.outcome === "running" ? "Command output" : `Tool result: ${message.outcome}`}</summary><pre>{message.text}</pre></details> :
          <div className="markdown"><Suspense fallback={<p>{message.text || "Working..."}</p>}><RichMessage text={message.text || (message.toolCalls?.length ? "Requesting tool access." : message.outcome ? "No text response was returned." : "Working...")} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div>}
        {message.reasoning && <details><summary>Provider-exposed reasoning</summary><p className="reasoning">{message.reasoning}</p></details>}
        {message.attachments?.some((attachment) => attachment.kind === "image") && <div className="message-images">{message.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => <ContextImage sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} />)}</div>}
        {message.attachments?.some((attachment) => attachment.kind === "document") && <div className="message-documents">{message.attachments.filter((attachment) => attachment.kind === "document").map((attachment) => <ContextDocument sdk={client} sessionId={session.id} attachment={attachment} key={attachment.id} />)}</div>}
      </article>)}
    </div>}
  </div>;
}
function Queue({ session, command, client }: { session: Session; command: (command: Command) => Promise<void>; client: MoguriClient }) {
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
  const reorder = (index: number, direction: number) => {
    const ids = session.queue.map((item) => item.id);
    [ids[index], ids[index + direction]] = [ids[index + direction]!, ids[index]!];
    void command({ type: "queue.reorder", sessionId: session.id, expectedRevision: session.queueRevision, messageIds: ids });
  };
  return <section className="queue" aria-label="Message queue"><header><strong>Queued messages</strong><span>{session.queue.length} unclaimed</span>
    {!session.turnId && session.queue.some((item) => item.delivery !== "steer") && <button className="quiet" onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume queued work</button>}</header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {session.queue.map((item, index) => <div className="queue-item" key={item.id}>{editing === item.id ? <><textarea aria-label="Edit queued message" value={text} onChange={(event) => setText(event.target.value)} /><button onClick={() => void save(item.id)}>Save</button><button className="quiet" onClick={() => setEditing(null)}>Cancel</button></> :
      <><span className="queue-delivery">{item.held ? "held" : item.delivery === "steer" && item.targetTurnId !== session.turnId ? "unapplied steer" : item.delivery}</span><span className="queue-text" title={item.text}>{item.text || "Attached project context"}</span>
        {item.attachments.filter((attachment) => attachment.kind === "document").map((attachment) => <ContextDocument key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} />)}
        {item.held && <button className="icon-button" aria-label={`Run queued message ${index + 1}`} title="Release this held prompt" onClick={() => void client.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(error instanceof Error ? error.message : "Prompt could not be released."))}><Icon name="Play" /></button>}
        {item.delivery === "steer" && <button className="quiet" onClick={() => void command({ type: "queue.make-turn", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}>Queue as new turn</button>}
        <button className="icon-button" aria-label={`Copy queued message ${index + 1}`} title="Copy" onClick={() => void window.moguri.copyText(item.text).catch((error: unknown) => setError(error instanceof Error ? error.message : "Copy failed."))}><Icon name="Copy" /></button>
        <button className="icon-button" aria-label={`Edit queued message ${index + 1}`} title="Edit" onClick={() => { setEditing(item.id); setText(item.text); }}><Icon name="Edit" /></button>
        <button className="icon-button" aria-label={`Move queued message ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => reorder(index, -1)}><Icon name="Up" /></button>
        <button className="icon-button" aria-label={`Move queued message ${index + 1} down`} title="Move down" disabled={index === session.queue.length - 1} onClick={() => reorder(index, 1)}><Icon name="Down" /></button>
        <button className="icon-button" aria-label={`Remove queued message ${index + 1}`} title="Delete" onClick={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}><Icon name="Trash" /></button></>}</div>)}
  </section>;
}
function ContextPanel({ panel, session, project, events, client, run, snapshot, prUrl, sideId, selectSide, onDirty, onSlash, editorFor, nativeAllowed, suggestionsAll, chooseSession, modal, artifactRequest, clearArtifactRequest, setupSandbox }: {
  panel: Panel; session?: Session; project?: Project; events: StoredEvent[]; client: MoguriClient; run: Run; snapshot: Snapshot | null;
  prUrl: string | null; sideId: string | null; selectSide: (id: string) => void; onDirty: (dirty: boolean) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; nativeAllowed: boolean;
  editorFor: (session: Session) => DraftEditor;
  suggestionsAll: boolean; chooseSession: (id: string) => Promise<void>; modal: (open: boolean) => void; artifactRequest: ArtifactEditorRequest | null; clearArtifactRequest: () => void;
  setupSandbox: () => void;
}) {
  const [trace, setTrace] = useState(false);
  if (panel === "Artifacts" && snapshot) return <ArtifactPanel sdk={client} snapshot={snapshot} session={session} projectId={project?.id ?? null} request={artifactRequest} onDirty={onDirty} onRequestHandled={clearArtifactRequest} />;
  if (panel === "Candidates" && snapshot) return <CandidatePanel sdk={client} snapshot={snapshot} session={session} onDirty={onDirty} />;
  if (panel === "Sandbox" && snapshot) return <SandboxPanel sdk={client} snapshot={snapshot} session={session} onDirty={onDirty} setup={setupSandbox} />;
  if (panel === "Dashboard" && snapshot) return <UsageDashboard key={client.profileId} sdk={client} snapshot={snapshot} />;
  if (panel === "Attention" && snapshot) return <AttentionPanel sdk={client} snapshot={snapshot} chooseSession={chooseSession} />;
  if (!session) return <div className="panel-empty"><Icon name={panel} /><h2>Your session context</h2><p>Open a session to see its {panel.toLowerCase()}. This panel follows the conversation in the main pane.</p></div>;
  const workspaceScope = JSON.stringify([client.profileId, session.id, session.controls.env, session.workspaceId, project?.path,
    snapshot?.projectConfigurations.find((value) => value.projectId === session.projectId), session.controls.env === "Remote" ? snapshot?.settings.values.remote : null,
    session.controls.env === "Sandbox" ? [session.sandboxWorkspaceId, snapshot?.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId)?.revision, snapshot?.settings.values.sandbox] : null]);
  if (!project && ["Terminal", "Changes", "Files", "Plan", "PR"].includes(panel)) return <div className="panel-empty"><Icon name="Files" /><h2>No project selected</h2><p>This chat cannot access workspace files, commands, plans or terminals. Start a project chat for those operations.</p></div>;
  if (panel === "Suggestions" && snapshot) return <SuggestionsPanel sdk={client} snapshot={snapshot} session={session} allProjects={suggestionsAll} chooseSession={chooseSession} modal={modal} />;
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
        <dt>Project</dt><dd>{project?.name ?? "Unavailable"}</dd><dt>Workspace</dt><dd className="path">{workspace ?? "Unavailable"}</dd>
        <dt>Profile</dt><dd>{snapshot?.profile?.name ?? client.profileId}</dd><dt>Env</dt><dd>{session.localFinishing ? "Local finishing" : session.controls.env}</dd><dt>Boundary</dt><dd>{session.controls.env === "Remote" ? `SSH host ${execution?.target.name ?? snapshot?.settings.values.remote?.name ?? "(unconfigured)"}, not SendBox-isolated` : session.controls.env === "Sandbox" ? "SendBox native guest; private stage, not the Local source" : "Host execution, not isolated"}</dd>
        <dt>Model</dt><dd>{session.controls.modelId ?? "Not selected"}</dd><dt>Autonomy</dt><dd>{session.controls.autonomy}</dd><dt>Budget</dt><dd>{session.controls.budget.kind === "limited" ? "Estimate-based session cap" : "Unlimited preference"}{snapshot?.budgetPolicy.limit ? " / profile hard cap" : ""}</dd>
      </dl>
      {routing && <details><summary>kupo Single provenance</summary><dl className="facts"><dt>Status</dt><dd>{routing.status}</dd><dt>Classifier</dt><dd className="path">{routing.classifierModelId}</dd><dt>Solver advice</dt><dd className="path">{routing.plan?.modelId ?? "No accepted plan"}</dd><dt>Confidence / threshold</dt><dd>{routing.plan?.confidence ?? "Unavailable"} / {routing.policy.minimumConfidence}</dd></dl>
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
  if (panel === "Terminal" && snapshot) return <Suspense fallback={<p role="status">Loading Ghostty...</p>}><GhosttyTerminal sdk={client} session={session} snapshot={snapshot} active={nativeAllowed} /></Suspense>;
  if (panel === "Browser") return nativeAllowed ? <BrowserPanel sdk={client} session={session} /> : <p className="fine-print">Preview hidden while another surface is active.</p>;
  if (panel === "Changes") return session.controls.env !== "Sandbox" ? <ChangesPanel key={workspaceScope} sdk={client} session={session} /> : snapshot ? <SandboxPanel sdk={client} snapshot={snapshot} session={session} onDirty={onDirty} setup={setupSandbox} /> : null;
  if (panel === "Files") return <FilesPanel key={workspaceScope} sdk={client} session={session} />;
  if (panel === "Plan" && snapshot) return <PlanPanel sdk={client} session={session} snapshot={snapshot} workspaceScope={workspaceScope} onDirty={onDirty} />;
  if (panel === "Side chat" && snapshot) return <SideChat sdk={client} parent={session} snapshot={snapshot} selectedId={sideId} select={selectSide} onSlash={onSlash} editorFor={editorFor} />;
  if (panel === "PR") return prUrl ? <section><h2>Connected PR</h2><p className="path">{prUrl}</p><button onClick={() => void run(() => window.moguri.openExternal(prUrl))}><Icon name="PR" />Open in GitHub</button><p className="fine-print">This binding does not change the checkout or grant merge/push permission. Local work-item PR states are observed read-only.</p></section> : <p>No PR is connected.</p>;
  return <p>Choose a supported panel.</p>;
}
function CommandOutput({ text, close }: { text: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="workspace-dialog command-output" onClose={close} aria-label="Command response"><header><h2>Command response</h2><button className="icon-button" aria-label="Close command response" onClick={close}><Icon name="Close" /></button></header><pre>{text}</pre></dialog>;
}
function PolicySettings({ snapshot, command }: { snapshot: Snapshot; command: (command: Command) => Promise<void> }) {
  return <section className="policy-settings"><h2>Allowed environments</h2><p>Global, user-only policy. Excluding Local blocks new turns. Already-running Local turns may finish.</p>
    <label>Policy<select aria-label="Allowed environments" value={snapshot.policy.allowedEnvs.includes("Local") ? "all" : "protected"} onChange={(event) => void command({ type: "policy.set", allowedEnvs: event.target.value === "all" ? ["Local", "Sandbox", "Remote"] : ["Sandbox", "Remote"] })}><option value="all">Allow Local, Sandbox, Remote</option><option value="protected">Require Sandbox or Remote</option></select></label>
    <p className="fine-print">{snapshot.capabilities.filter((capability) => capability.env !== "Local").map((capability) => `${capability.env}: ${capability.ready ? "ready" : "not ready"}`).join(". ")}. Unqualified targets block new work, without Local fallback.</p>
  </section>;
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
