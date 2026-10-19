import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { DraftEditor, slashCommands, type MoguriSdk, type Command, type Project, type ProviderState, type Session, type Snapshot, type StoredEvent, type SessionPanel, type SlashResult } from "../../../packages/sdk/src/index.ts";
import { useMoguri } from "../../../packages/sdk/src/react.ts";
import mascot from "../../../assets/moguri.svg";
import type { SettingsTab } from "./SettingsPanel.tsx";
import { Icon } from "./Icon.tsx";
import { WorkspaceNavigation } from "./WorkspaceNavigation.tsx";
import { BrowserPanel, ChangesPanel, PlanPanel, SideChat } from "./SessionPanels.tsx";
const SettingsPanel = lazy(() => import("./SettingsPanel.tsx").then((module) => ({ default: module.SettingsPanel })));
const RichMessage = lazy(() => import("./RichMessage.tsx"));
const ProjectBoard = lazy(() => import("./ProjectBoard.tsx").then((module) => ({ default: module.ProjectBoard })));
const GhosttyTerminal = lazy(() => import("./GhosttyTerminal.tsx").then((module) => ({ default: module.GhosttyTerminal })));
type MoguriClient = MoguriSdk;

type Panel = SessionPanel;
const panels: Panel[] = ["Terminal", "Browser", "Insights", "PR", "Changes", "Plan", "Side chat"];
const title = (session: Session) => session.title !== "New session" ? session.title : session.messages.find((message) => message.role === "user")?.text.split("\n")[0]?.slice(0, 64) || "New session";
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
export function App({ client }: { client: MoguriClient }) {
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
  const [sideSessionId, setSideSessionId] = useState<string | null>(null);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const editors = useRef(new Map<string, DraftEditor>());
  useEffect(() => () => { for (const editor of editors.current.values()) editor.dispose(); }, []);
  const session = snapshot?.sessions.find((session) => session.id === selectedId);
  const project = snapshot?.projects.find((project) => project.id === (settingsTab === "project" ? settingsProjectId ?? session?.projectId : boardOpen ? projectId ?? session?.projectId : session?.projectId ?? projectId)) ?? snapshot?.projects[0];
  const connectedPr = session?.prUrl ?? snapshot?.issues.find((issue) => issue.id === session?.workItemId)?.pullRequest?.url ?? null;
  const editorFor = useCallback((target: Session) => {
    let value = editors.current.get(target.id);
    if (!value) { value = new DraftEditor(client, target.id, target.draft); editors.current.set(target.id, value); }
    return value;
  }, [client]);
  const editor = useMemo(() => session ? editorFor(session) : null, [editorFor, session?.id]);
  useEffect(() => {
    if (snapshot && (!selectedId || !snapshot.sessions.some((session) => session.id === selectedId))) setSelectedId(snapshot.sessions.find((session) => session.status !== "archived")?.id ?? snapshot.sessions[0]?.id ?? null);
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
      if ([...editors.current.values()].some((editor) => editor.getState().dirty || editor.getState().saving)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
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
    if (!settingsUnsaved && !panelDirty) return true;
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
  });
  const chooseProject = (id: string) => {
    if (!canNavigate()) return;
    setProjectId(id);
    if (!boardOpen) { const target = snapshot?.sessions.find((session) => session.projectId === id && session.status !== "archived"); if (target) setSelectedId(target.id); }
  };
  const projectSettings = (id: string) => { if (!canNavigate()) return; setSettingsProjectId(id); openSettings("project"); };
  const showPanel = (next: Panel) => run(async () => {
    if (!leaveSurface()) return;
    setPanel(next); setPanelOpen(true); setConnections(false);
    if (next === "Terminal" && session && !snapshot?.terminals.some((terminal) => terminal.sessionId === session.id && terminal.status === "running")) await client.terminal.open(session.id);
  });
  const applySlash = async (result: SlashResult) => {
    if (result.kind === "ok") { setNotice(result.message, true); return; }
    if (result.kind === "text") { setCommandOutput(result.text); return; }
    if (result.kind === "copy") { await window.moguri.copyText(result.text); setNotice("Copied.", true); return; }
    if (result.kind === "session") {
      if (result.side) { setSideSessionId(result.sessionId); await showPanel("Side chat"); }
      else await chooseSession(result.sessionId);
      return;
    }
    if (result.panel === "Settings") openSettings("systemPrompt");
    else if (result.panel === "Models") { document.querySelector<HTMLSelectElement>('[aria-label="Model"]')?.focus(); }
    else if (result.panel === "Queue") document.querySelector(".queue")?.scrollIntoView({ block: "nearest" });
    else await showPanel(result.panel);
  };
  const handleSlash = async (target: Session, draft: DraftEditor, text: string) => {
    await draft.flush(); draft.edit(""); await draft.flush();
    try { await applySlash(await client.slash(target.id, text, "desktop")); }
    catch (error) { if (client.getState().snapshot?.sessions.some((session) => session.id === target.id && session.status !== "archived")) draft.edit(text); throw error; }
  };
  const newSession = () => run(async () => {
    if (!canNavigate()) return;
    if (!project) { setNotice("Open a local project first."); return; }
    await editor?.flush();
    const result = await client.command({ type: "session.create", projectId: project.id });
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
      if (nativeModal || event.target instanceof Element && event.target.closest(".ghostty-host")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); }
      if (event.key === "Escape") { setPalette(false); setNavOpen(false); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [nativeModal]);
  return <div className={`app-shell ${navOpen ? "nav-open" : ""} ${panelOpen && !settingsTab && !boardOpen ? "context-open" : ""} ${widePanel ? "context-wide" : ""}`}>
    <header className="titlebar">
      <div className="wordmark"><img className="brand-mascot" src={mascot} alt="" /><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">{project?.name ?? "Your local workspace"}</span>
      <button className="quiet palette-trigger" onClick={() => setPalette(true)}>Commands <kbd>Ctrl K</kbd></button>
    </header>
    <nav className="project-nav" aria-label="Projects and sessions">
      <div className="nav-heading"><span>Workspace</span><button className="icon-button" aria-label="Open project" title="Open project" onClick={() => void openProject()}>+</button></div>
      <button className="new-session" aria-label="New session" onClick={() => void newSession()} disabled={!project || busy}><Icon name="Plus" />New</button>
      <div className="nav-tabs"><button aria-pressed={!archived && !boardOpen} onClick={() => { if (leaveSurface()) setArchived(false); }}>Sessions</button><button aria-pressed={archived && !boardOpen} onClick={() => { if (leaveSurface()) setArchived(true); }}>Archived</button><button aria-pressed={boardOpen} disabled={!project} onClick={openBoard}>Issues</button></div>
      {snapshot && <WorkspaceNavigation sdk={client} snapshot={snapshot} selectedId={selectedId} archived={archived} busy={busy} chooseSession={chooseSession} chooseProject={chooseProject} settings={projectSettings} modal={setNativeModal} allow={canNavigate} />}
      <div className="nav-footer">
        <button className="settings-nav-button" aria-label="Settings" onClick={() => openSettings("systemPrompt")}><Icon name="Settings" />Settings</button>
        <button className="provider-button" onClick={() => { if (leaveSurface()) { setConnections((value) => !value); setPanelOpen(true); } }}>
          <span className={`status-dot ${snapshot?.provider.status === "connected" ? "completed" : "idle"}`} />
          <span><strong>GitHub Copilot</strong><small>{snapshot?.provider.status ?? "Connecting to service"}</small></span><span>&gt;</span>
        </button>
        <div className="connection-line"><span className={`status-dot ${status === "connected" ? "completed" : "failed"}`} />Local service {status}</div>
      </div>
    </nav>
    <main className="main-pane">
      {(notice || connectionError) && <div className={`notice ${notice?.info && !connectionError ? "info" : "error"}`} role={notice?.info && !connectionError ? "status" : "alert"}><span>{connectionError ?? notice?.text}</span><button className="quiet" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {boardOpen && snapshot && project ? <Suspense fallback={<div className="loading-state" role="status">Loading local project issues...</div>}><ProjectBoard key={project.id} sdk={client} project={project} snapshot={snapshot} onBack={leaveSurface} onUnsavedChange={setSettingsUnsaved} /></Suspense> :
      settingsTab && snapshot ? <Suspense fallback={<div className="loading-state" role="status">Loading shared SDK settings...</div>}><SettingsPanel sdk={client} snapshot={snapshot} session={session?.projectId === project?.id ? session : undefined} project={project} initialTab={settingsTab} onBack={leaveSettings} onUnsavedChange={setSettingsUnsaved} openTerminal={() => { setSettingsTab(null); setSettingsUnsaved(false); setConnections(false); setPanel("Terminal"); setPanelOpen(true); }} /></Suspense> : <>
      <header className="session-header">
        <button className="icon-button nav-toggle" aria-label="Toggle projects" onClick={() => setNavOpen((value) => !value)}><Icon name="Files" /></button>
        {session?.parentSessionId && <button className="icon-button" aria-label="Open parent session" title="Parent session" onClick={() => void chooseSession(session.parentSessionId!)}><Icon name="Back" /></button>}
        <div className="session-heading"><h1>{session ? title(session) : "Your workspace"}</h1><span>{session ? `${project?.name ?? "Project"} / ${session.localFinishing ? "Local finishing" : session.status.replace("_", " ")}` : "Local first. Under your control."}</span></div>
        {session && <label className="session-mode" title={session.pendingMode ? "Requested mode applies at the next safe boundary" : "Hard session tool boundary"}><Icon name={session.mode === "read-only" ? "ReadOnly" : "Agent"} /><select aria-label="Session mode" value={session.pendingMode ?? session.mode} disabled={session.kind !== "agent"} onChange={(event) => void run(() => client.sessions.mode(session.id, event.target.value === "agent" ? "agent" : "read-only"))}><option value="agent">Agent</option><option value="read-only">Read-only</option></select>{session.pendingMode && <span className="fine-print">pending</span>}</label>}
        {session?.turnId && <button className="stop-button" disabled={session.status === "stopping"} onClick={() => void command({ type: "session.stop", sessionId: session.id })}>{session.status === "stopping" ? "Stopping..." : "Stop turn"}</button>}
        {session && !session.turnId && snapshot?.blockedProjects.includes(session.projectId) && <button title="Inspect the workspace and unconfirmed processes before continuing. This does not claim cleanup succeeded." onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume after inspection</button>}
        {session && !session.turnId && <button className="quiet" onClick={() => void command({ type: session.status === "archived" ? "session.restore" : "session.archive", sessionId: session.id })}>{session.status === "archived" ? "Restore" : "Archive"}</button>}
        <button className="icon-button" aria-label={panelOpen ? "Collapse session sidebar" : "Open session sidebar"} onClick={() => { if (canNavigate()) { setPanelOpen((value) => !value); setConnections(false); } }}><Icon name="Insights" /></button>
      </header>
      {!snapshot ? <div className="loading-state" role="status"><div className="skeleton" /><div className="skeleton short" /><p>Connecting to your local workspace...</p></div> :
        !session ? <div className="welcome">
          <img className="welcome-mascot" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>Start with your workspace.</h2><p>A shared home for your code, conversations, and the work in between. Nothing runs until you ask.</p>
          <div className="welcome-actions"><button className="primary" onClick={() => void openProject()}>Open a project</button>{project && <button onClick={() => void newSession()}>New session</button>}</div>
          <ProviderConnect provider={snapshot.provider} run={run} client={client} />
        </div> :
        <>
          <Timeline session={session} run={run} />
          {session.pendingApproval && <section className="approval" aria-label="Tool approval">
            <div className="approval-heading"><span className="attention-dot" /><strong>Your approval is required</strong><span>{session.controls.autonomy}</span></div>
            <p><strong>{session.pendingApproval.call.name}</strong>{session.pendingApproval.call.name === "run_command" ? " will run on your Mac without sandbox isolation." : session.pendingApproval.call.name === "mcp_gateway" ? " may access host code or external services through the configured MCP. Review the exact server, tool and arguments." : session.pendingApproval.call.name === "run_subagent" ? " will send the approved context to a separate, tool-less model call." : session.pendingApproval.call.name.startsWith("propose_") ? " will create a pending proposal, not apply or enable it." : " will access this project's files."}</p>
            <pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre>
            <div className="approval-actions"><button disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: false })}>Deny</button><button className="primary" disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: true })}>Approve this action</button></div>
          </section>}
          {session.queue.length > 0 && <Queue session={session} command={command} client={client} />}
          {editor && project && <Composer key={session.id} session={session} project={project} snapshot={snapshot} client={client} editor={editor} run={run} busy={busy} connected={status === "connected"} onConnect={() => { setConnections(true); setPanelOpen(true); }} onSlash={handleSlash} />}
        </>}
      </>}
    </main>
    <aside className="context-pane" aria-label="Session sidebar">
      <header className="context-heading"><strong>{connections ? "Connections" : panel}</strong><div><button className="icon-button" aria-label="Resize sidebar" title="Toggle sidebar width" onClick={() => setWidePanel((value) => !value)}>&lt;&gt;</button><button className="icon-button" aria-label="Close sidebar" onClick={() => { if (canNavigate()) setPanelOpen(false); }}><Icon name="Close" /></button></div></header>
      <div className={`context-content panel-${panel.toLowerCase().replaceAll(" ", "-")}`}>{connections && snapshot ? <><ProviderConnect provider={snapshot.provider} client={client} run={run} /><PolicySettings snapshot={snapshot} command={command} /></> :
        <ContextPanel key={`${session?.id}-${panel}`} panel={panel} session={session} project={project} events={events} client={client} run={run} snapshot={snapshot} prUrl={connectedPr} sideId={sideSessionId} selectSide={setSideSessionId} onDirty={setPanelDirty} onSlash={handleSlash} editorFor={editorFor} nativeAllowed={!palette && !nativeModal && !commandOutput && panelOpen && !settingsTab && !boardOpen} />}
      </div>
      <footer className="context-footer">Bound to the main session</footer>
    </aside>
    <nav className="panel-rail" aria-label="Sidebar panels">{panels.filter((item) => item !== "PR" || connectedPr).map((item) => <button key={item} className={panelOpen && panel === item && !connections ? "active" : ""} aria-label={item} title={item} aria-pressed={panelOpen && panel === item && !connections} onClick={() => void showPanel(item)}><Icon name={item} /></button>)}</nav>
    {commandOutput && <CommandOutput text={commandOutput} close={() => setCommandOutput(null)} />}
    {palette && <CommandPalette close={() => setPalette(false)} actions={[
      { name: "New session", action: newSession }, { name: "Open project", action: openProject },
      { name: "Connect GitHub Copilot", action: async () => { if (leaveSurface()) { setConnections(true); setPanelOpen(true); } } },
      { name: "Show Insights and event trace", action: async () => { if (leaveSurface()) { setPanel("Insights"); setPanelOpen(true); setConnections(false); } } },
      { name: "Settings and editable system prompt", action: async () => openSettings("systemPrompt") },
      { name: "Local project issue board", action: async () => openBoard() },
      { name: "Shared dependency cache", action: async () => openSettings("cache") },
      ...(session?.turnId ? [{ name: "Stop active turn", action: () => command({ type: "session.stop", sessionId: session.id }) }] : []),
    ]} />}
  </div>;
}

function ProviderConnect({ provider, run, client }: { provider: ProviderState; run: Run; client: MoguriClient }) {
  return <section className="provider-setup" aria-label="GitHub Copilot connection">
    <h2>GitHub Copilot</h2>
    {provider.status === "connected" ? <><p className="connected-label">Connected through your Copilot account.</p><p>{provider.models.length} account-enabled models available. Choose one in the composer.</p>
      <div className="button-row"><button onClick={() => void run(() => client.command({ type: "provider.refresh" }))}>Refresh connection</button><button className="quiet" onClick={() => void run(() => client.command({ type: "provider.logout" }))}>Sign out</button></div></> :
      <>
        <p>Use your existing Copilot subscription. No other provider key is needed.</p>
        {provider.login ? <div className="device-flow">
          <p>Open GitHub and enter this one-time code:</p><code aria-label="GitHub device code">{provider.login.code}</code>
          <button className="primary" onClick={() => void run(() => window.moguri.openExternal(provider.login!.url))}>Open GitHub</button>
          <p className="muted">Waiting for authorization. Expires at {new Date(provider.login.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
          <button className="quiet" onClick={() => void run(() => client.command({ type: "provider.cancel" }))}>Cancel sign-in</button>
        </div> : <button className="primary" disabled={provider.status === "connecting"} onClick={() => void run(() => client.command({ type: "provider.login" }))}>{provider.status === "connecting" ? "Starting sign-in..." : "Sign in with GitHub Copilot"}</button>}
        <p className="fine-print">Uses pi-ai's third-party device flow, not an official Moguri partnership. GitHub subscription and organization policies apply. Sign-in may enable account model policies. Credentials stay in your OS keychain.</p>
      </>}
    {provider.diagnostic && <p className="inline-error" role="status">{provider.diagnostic}</p>}
  </section>;
}
function Timeline({ session, run }: { session: Session; run: Run }) {
  const scroll = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(150);
  const follow = useRef(true);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [session.messages.length, session.messages.at(-1)?.text, session.id]);
  return <div ref={scroll} className="timeline" role="log" aria-label="Session transcript" onScroll={() => { const view = scroll.current!; follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 100; }}>
    {session.messages.length === 0 ? <div className="session-empty"><img className="welcome-mascot small" src={mascot} alt="Moguri face and bat-wing mascot" /><h2>What are we working on?</h2><p>Ask a question, explore this project, or make a change.<br />You review every tool action before it runs.</p><div className="empty-contract"><span>Local execution</span><span>Manual approvals</span><span>Durable history</span></div></div> : <>
      {session.messages.length > limit && <button className="load-history" onClick={() => setLimit((value) => value + 150)}>Show earlier messages ({session.messages.length - limit})</button>}
      {session.messages.slice(-limit).map((message) => <article key={message.id} className={`message ${message.role}`}>
        <header><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Moguri" : message.role === "tool" ? message.toolCalls?.[0]?.name ?? "Tool" : "Session"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.outcome && message.role !== "assistant" && <span className="outcome">{message.outcome}</span>}
          {message.role !== "notice" && <button className="icon-button message-copy" title="Copy message" aria-label={`Copy ${message.role === "user" ? "sent prompt" : "message"} ${message.id}`} onClick={() => void run(() => window.moguri.copyText(message.text))}><Icon name="Copy" /></button>}</header>
        {message.role === "tool" ? <details open={message.outcome === "running"}><summary>{message.outcome === "running" ? "Command output" : `Tool result: ${message.outcome}`}</summary><pre>{message.text}</pre></details> :
          <div className="markdown"><Suspense fallback={<p>{message.text || "Working..."}</p>}><RichMessage text={message.text || (message.toolCalls?.length ? "Requesting tool access." : message.outcome ? "No text response was returned." : "Working...")} openLink={(href) => void run(() => window.moguri.openExternal(href))} /></Suspense></div>}
        {message.reasoning && <details><summary>Provider-exposed reasoning</summary><p className="reasoning">{message.reasoning}</p></details>}
      </article>)}
    </>}
  </div>;
}
function Composer({ session, project, snapshot, client, editor, run, busy, connected, onConnect, onSlash }: {
  session: Session; project: Project; snapshot: Snapshot; client: MoguriClient; editor: DraftEditor; run: Run; busy: boolean; connected: boolean; onConnect: () => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [delivery, setDelivery] = useState<"queue" | "steer" | "interrupt">("queue");
  const modelAvailable = snapshot.provider.models.some((model) => model.id === session.controls.modelId);
  const configure = (modelId: string, autonomy = session.controls.autonomy) => run(() => client.command({ type: "session.configure", sessionId: session.id, expectedRevision: session.revision, controls: { ...session.controls, modelId, autonomy } }));
  const voiceJob = snapshot.jobs.findLast((job) => job.sessionId === session.id && job.kind === "voice.record" && job.status === "running");
  const transcript = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe"].includes(job.kind) && job.status === "completed");
  const dictate = () => run(async () => {
    await editor.flush();
    if (voiceJob) return client.voice.stop(voiceJob.id);
    const status = (await client.voice.status()).voice;
    if (!status.runtimeReady || !status.modelReady) throw new Error(status.diagnostic ?? "Set up local dictation in Settings before recording.");
    if (!await window.moguri.microphonePermission()) throw new Error("Microphone permission was denied. No audio was recorded.");
    return client.voice.record(session.id);
  });
  const isSlash = draft.text.startsWith("/");
  const send = (event?: FormEvent, held = false) => { event?.preventDefault(); void run(() => isSlash ? onSlash(session, editor, draft.text) : editor.send(held ? "queue" : delivery, held)); };
  const canSend = connected && !busy && session.status !== "archived" && snapshot.provider.status === "connected" &&
    modelAvailable && (draft.text.trim().length > 0 || draft.attachments.length > 0) && !draft.conflict && (delivery === "queue" || !!session.turnId);
  const canQueue = connected && !busy && session.status !== "archived" && (draft.text.trim().length > 0 || draft.attachments.length > 0) && !draft.conflict;
  const suggestions = isSlash && !/\s/.test(draft.text) ? slashCommands.filter((command) => command.name.startsWith(draft.text.slice(1))).slice(0, 7) : [];
  return <form className="composer" onSubmit={send} aria-label="Message composer">
    {!modelAvailable && <button type="button" className="setup-hint" onClick={onConnect}>{session.controls.modelId ? `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.` : snapshot.provider.status === "connected" ? "Choose a Copilot model below to start." : "Connect GitHub Copilot to choose a model and start."}<span>&gt;</span></button>}
    {session.localFinishing && <p className="local-finishing">Local finishing: this running turn predates the allowed-env policy change. New Local work is blocked.</p>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <span key={attachment.id} title={`Snapshot sha256 ${attachment.digest}`}><Icon name="Files" />{attachment.path}<button type="button" aria-label={`Remove attachment ${attachment.path}`} onClick={() => editor.edit(draft.text, draft.attachments.filter((item) => item.id !== attachment.id))}>x</button></span>)}</div>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>Prompt</label>
    <textarea id={`prompt-${session.id}`} placeholder="Ask anything about this project..." value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
      onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void run(async () => { throw new Error("Image paste is not available in this checkpoint. No clipboard file was attached or sent."); }); } }}
      onKeyDown={(event) => {
        if (event.code === "Space" && event.ctrlKey) { event.preventDefault(); void dictate(); }
        else if (event.key === "Tab" && suggestions[0]) { event.preventDefault(); editor.edit(`/${suggestions[0].name} `); }
        else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (isSlash ? canQueue : event.shiftKey ? canSend : canQueue) send(undefined, !event.shiftKey); }
      }} />
    {suggestions.length > 0 && <div className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion) => <button type="button" role="option" aria-selected={false} key={suggestion.name} onClick={() => editor.edit(`/${suggestion.name} `)}><strong>/{suggestion.name}</strong><span>{suggestion.description}</span></button>)}</div>}
    {draft.error && <div className="draft-error" role="alert"><p>{draft.error}</p><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    <div className="composer-controls">
      <label>Env<select aria-label="Env" value={session.controls.env} disabled={!!session.turnId} onChange={() => {}} title="Factory default: Local. No sandbox isolation."><option>Local</option><option disabled>Sandbox (not ready)</option><option disabled>Remote (not ready)</option></select></label>
      <label className="model-control">Model<select aria-label="Model" disabled={!!session.turnId || snapshot.provider.status !== "connected"} value={session.controls.modelId ?? ""} onChange={(event) => void configure(event.target.value)}>
        <option value="" disabled>{snapshot.provider.status === "connected" ? "Choose a model" : "Connect Copilot"}</option><option value="kupo" disabled>kupo (not evaluated)</option>
        {session.controls.modelId && !modelAvailable && <option value={session.controls.modelId} disabled>{session.controls.modelId} (unavailable)</option>}
        <optgroup label="GitHub Copilot">{snapshot.provider.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</optgroup>
      </select></label>
      <label>Autonomy level<select aria-label="Autonomy level" value={session.controls.autonomy} disabled={!!session.turnId} onChange={(event) => void configure(session.controls.modelId ?? "", event.target.value as Session["controls"]["autonomy"])} title="Permissions remain final. Autopilot requires explicit delegations."><option>Manual</option><option>Guided</option><option>Autopilot</option><option disabled>Autopilot Max</option></select></label>
      <label>Budget<select aria-label="Budget" value="Unlimited" onChange={() => {}} title="Factory default: Unlimited. Finite caps are not enforceable yet."><option>Unlimited</option><option disabled>Token/USD cap (not ready)</option></select></label>
    </div>
    <div className="composer-bottom">
      <details className="attach-menu"><summary><span>+</span> Attach</summary><div className="attach-options">
        <button type="button" onClick={() => void run(async () => { const path = await window.moguri.chooseFile(project.path); if (path) await editor.attach(path); })}>@ Project text file</button>
        {["^ Local file outside project", ": Local folder", "# GitHub issue", "# GitHub pull request", "! Moguri session", "Clipboard image"].map((type) => <button key={type} type="button" disabled title="Not implemented in this checkpoint">{type}<small>Not available yet</small></button>)}
      </div></details>
      <span className="save-state" role="status">{draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved"}</span>
      <button type="button" className="quiet dictate-button" aria-label={voiceJob ? "Stop local dictation" : "Start local dictation"} title="Ctrl+Space. Requires explicit local model setup; never sends audio to a provider." onClick={() => void dictate()}>{voiceJob ? "Stop dictation" : "Dictate"}</button>
      {transcript && <button type="button" className="quiet" onClick={() => void run(async () => { await editor.flush(); return client.voice.insert(session.id, transcript.id, client.getState().snapshot!.sessions.find((item) => item.id === session.id)!.draft.revision); })}>Insert transcript</button>}
      <div className="send-controls"><button className="icon-button" type="button" aria-label="Queue prompt without starting work" title="Cmd/Ctrl+Enter: queue without starting" disabled={!canQueue || isSlash} onClick={() => send(undefined, true)}><Icon name="Plus" /></button>
        {!isSlash && <select aria-label="Delivery mode" value={delivery} onChange={(event) => setDelivery(event.target.value as typeof delivery)}><option value="queue">{session.turnId ? "Queue" : "Send"}</option><option value="steer" disabled={!session.turnId}>Steer</option><option value="interrupt" disabled={!session.turnId}>Interrupt</option></select>}
        <button className="primary send-button" type="submit" disabled={isSlash ? !canQueue : !canSend} title="Send now. Cmd/Ctrl+Enter queues instead.">{isSlash ? "Run" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send"} <Icon name="Play" /></button></div>
    </div>
    <p className="composer-footnote">Cmd/Ctrl+Enter queues. Shift+Cmd/Ctrl+Enter sends. {session.mode === "read-only" ? "Read-only: edit and execution tools are disabled." : "Local host execution; tools require permission."}</p>
  </form>;
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
        {item.held && <button className="icon-button" aria-label={`Run queued message ${index + 1}`} title="Release this held prompt" onClick={() => void client.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(error instanceof Error ? error.message : "Prompt could not be released."))}><Icon name="Play" /></button>}
        {item.delivery === "steer" && <button className="quiet" onClick={() => void command({ type: "queue.make-turn", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}>Queue as new turn</button>}
        <button className="icon-button" aria-label={`Copy queued message ${index + 1}`} title="Copy" onClick={() => void window.moguri.copyText(item.text).catch((error: unknown) => setError(error instanceof Error ? error.message : "Copy failed."))}><Icon name="Copy" /></button>
        <button className="icon-button" aria-label={`Edit queued message ${index + 1}`} title="Edit" onClick={() => { setEditing(item.id); setText(item.text); }}><Icon name="Edit" /></button>
        <button className="icon-button" aria-label={`Move queued message ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => reorder(index, -1)}><Icon name="Up" /></button>
        <button className="icon-button" aria-label={`Move queued message ${index + 1} down`} title="Move down" disabled={index === session.queue.length - 1} onClick={() => reorder(index, 1)}><Icon name="Down" /></button>
        <button className="icon-button" aria-label={`Remove queued message ${index + 1}`} title="Delete" onClick={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}><Icon name="Trash" /></button></>}</div>)}
  </section>;
}
function ContextPanel({ panel, session, project, events, client, run, snapshot, prUrl, sideId, selectSide, onDirty, onSlash, editorFor, nativeAllowed }: {
  panel: Panel; session?: Session; project?: Project; events: StoredEvent[]; client: MoguriClient; run: Run; snapshot: Snapshot | null;
  prUrl: string | null; sideId: string | null; selectSide: (id: string) => void; onDirty: (dirty: boolean) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; nativeAllowed: boolean;
  editorFor: (session: Session) => DraftEditor;
}) {
  const [trace, setTrace] = useState(false);
  if (!session) return <div className="panel-empty"><Icon name={panel} /><h2>Your session context</h2><p>Open a session to see its {panel.toLowerCase()}. This panel follows the conversation in the main pane.</p></div>;
  if (panel === "Insights") {
    const known = session.usage.filter((usage) => usage.totalTokens !== null);
    const unknown = session.usage.some((usage) => usage.totalTokens === null);
    const total = known.reduce((sum, usage) => sum + (usage.totalTokens ?? 0), 0);
    return <>
      <div className="context-binding"><span className={`status-dot ${session.status}`} /><strong>{title(session)}</strong><small>{session.status.replace("_", " ")}</small></div>
      <h2>Session details</h2><dl className="facts">
        <dt>Project</dt><dd>{project?.name ?? "Unavailable"}</dd><dt>Workspace</dt><dd className="path">{project?.path ?? "Unavailable"}</dd>
        <dt>Profile</dt><dd>Default</dd><dt>Env</dt><dd>{session.localFinishing ? "Local finishing" : session.controls.env}</dd><dt>Boundary</dt><dd>Host execution, not isolated</dd>
        <dt>Model</dt><dd>{session.controls.modelId ?? "Not selected"}</dd><dt>Autonomy</dt><dd>{session.controls.autonomy}</dd><dt>Budget</dt><dd>Unlimited</dd>
      </dl>
      <h2>Usage</h2><dl className="facts"><dt>Model calls</dt><dd>{session.usage.length}</dd><dt>Tokens</dt><dd>{known.length ? number(total) + (unknown ? " + unknown" : "") : session.usage.length ? "Unavailable" : "No requests yet"}</dd><dt>Request wall time</dt><dd>{(session.usage.reduce((sum, usage) => sum + usage.requestMs, 0) / 1000).toFixed(2)} s</dd><dt>Estimated cost</dt><dd>Unavailable</dd><dt>Provider-reported</dt><dd>Unavailable</dd><dt>Billed cost</dt><dd>Unavailable</dd></dl>
      <p className="fine-print">Copilot entitlement and billing are account-specific. Missing telemetry is not zero. Active-generation throughput is not measured in this checkpoint.</p>
      {session.usage.length > 0 && <details><summary>Per-call accounting</summary>{session.usage.map((usage) => <div className="call-record" key={usage.stepId}><strong>{usage.modelId}</strong><small>{usage.role} / {usage.outcome}</small><span>{usage.totalTokens === null ? "Tokens unavailable" : `${number(usage.totalTokens)} tokens (${usage.quality})`}</span></div>)}</details>}
      <button className="trace-toggle" onClick={() => setTrace((value) => !value)}>{trace ? "Hide" : "Show"} recent event trace</button>
      {trace && <div className="event-trace"><p className="fine-print">Most recent 200 received events, filtered to this session.</p>{events.filter((event) => event.session_id === session.id).map((event) => <details key={event.id}><summary>#{event.seq} {event.event_type}</summary><pre>{JSON.stringify(event, null, 2)}</pre></details>)}</div>}
      {session.lastError && <p className="inline-error">{session.lastError}</p>}
    </>;
  }
  if (panel === "Terminal" && snapshot) return <Suspense fallback={<p role="status">Loading Ghostty...</p>}><GhosttyTerminal sdk={client} session={session} snapshot={snapshot} /></Suspense>;
  if (panel === "Browser") return nativeAllowed ? <BrowserPanel sdk={client} session={session} /> : <p className="fine-print">Preview hidden while another surface is active.</p>;
  if (panel === "Changes") return <ChangesPanel sdk={client} session={session} />;
  if (panel === "Plan") return <PlanPanel sdk={client} session={session} onDirty={onDirty} />;
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
    <p className="fine-print">Sandbox and Remote are not ready in this checkpoint. Requiring them intentionally blocks all new work, without Local fallback.</p>
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
