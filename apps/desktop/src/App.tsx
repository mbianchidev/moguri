import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DraftEditor } from "../../../packages/client/src/draft.ts";
import { useMoguri } from "../../../packages/client/src/react.ts";
import type { MoguriClient } from "../../../packages/client/src/index.ts";
import type { Command, Project, ProviderState, Session, Snapshot, StoredEvent } from "../../../packages/protocol/src/index.ts";

type Panel = "Changes" | "Terminal" | "Files" | "Browser" | "Side chat" | "Insights" | "Extensions";
const panels: Panel[] = ["Changes", "Terminal", "Files", "Browser", "Side chat", "Insights", "Extensions"];
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
const iconPaths: Record<string, string> = {
  Changes: "M8 3v18m8-18v18M4 7h8m0 10h8", Terminal: "m4 6 6 6-6 6m9 0h7",
  Files: "M3 6h7l2 3h9v11H3Z", Browser: "M3 5h18v15H3Zm0 4h18",
  "Side chat": "M4 4h16v12H9l-5 4Z", Insights: "M5 20v-6m7 6V4m7 16V9",
  Extensions: "M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z",
};
function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={iconPaths[name] ?? "M12 4v16M4 12h16"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editors = useRef(new Map<string, DraftEditor>());
  const session = snapshot?.sessions.find((session) => session.id === selectedId);
  const project = snapshot?.projects.find((project) => project.id === (session?.projectId ?? projectId)) ?? snapshot?.projects[0];
  const editor = useMemo(() => {
    if (!session) return null;
    let value = editors.current.get(session.id);
    if (!value) { value = new DraftEditor(client, session.id, session.draft); editors.current.set(session.id, value); }
    return value;
  }, [client, session?.id]);
  useEffect(() => {
    if (snapshot && !selectedId) setSelectedId(snapshot.sessions.find((session) => session.status !== "archived")?.id ?? snapshot.sessions[0]?.id ?? null);
  }, [snapshot, selectedId]);
  useEffect(() => { if (session && editor) editor.receive(session.draft); }, [session?.draft.revision, editor]);
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
  const newSession = () => run(async () => {
    if (!project) { setNotice("Open a local project first."); return; }
    await editor?.flush();
    const result = await client.command({ type: "session.create", projectId: project.id });
    setSelectedId(result.id!); setArchived(false); setNavOpen(false);
  });
  const openProject = () => run(async () => {
    const path = await window.moguri.chooseProject();
    if (!path) return;
    await editor?.flush();
    const result = await client.command({ type: "project.add", path });
    setProjectId(result.id!);
    const created = await client.command({ type: "session.create", projectId: result.id! });
    setSelectedId(created.id!); setArchived(false); setNavOpen(false);
  });
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); }
      if (event.key === "Escape") { setPalette(false); setNavOpen(false); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  return <div className={`app-shell ${navOpen ? "nav-open" : ""} ${panelOpen ? "context-open" : ""} ${widePanel ? "context-wide" : ""}`}>
    <header className="titlebar">
      <div className="wordmark"><span className="brand-mark">m.</span><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">{project?.name ?? "Your local workspace"}</span>
      <button className="quiet palette-trigger" onClick={() => setPalette(true)}>Commands <kbd>Ctrl K</kbd></button>
    </header>
    <nav className="project-nav" aria-label="Projects and sessions">
      <div className="nav-heading"><span>Workspace</span><button className="icon-button" aria-label="Open project" title="Open project" onClick={() => void openProject()}>+</button></div>
      <button className="new-session" onClick={() => void newSession()} disabled={!project || busy}><span>+</span> New session</button>
      <div className="nav-tabs"><button aria-pressed={!archived} onClick={() => setArchived(false)}>Sessions</button><button aria-pressed={archived} onClick={() => setArchived(true)}>Archived</button></div>
      <div className="project-list">
        {snapshot?.projects.map((item) => <section className="project-group" key={item.id}>
          <button className="project-name" title={item.path} onClick={() => { setProjectId(item.id); }}><Icon name="Files" />{item.name}</button>
          {snapshot.sessions.filter((session) => session.projectId === item.id && (session.status === "archived") === archived).map((item) =>
            <button key={item.id} className={`session-link ${selectedId === item.id ? "selected" : ""}`} aria-current={selectedId === item.id ? "page" : undefined} onClick={() => void run(async () => { await editor?.flush(); setSelectedId(item.id); setNavOpen(false); })}>
              <span className={`status-dot ${item.status}`} /><span className="session-link-text"><span>{title(item)}</span><small>{item.status === "waiting_input" ? "Needs your attention" : item.status}</small></span>
              {item.queue.length > 0 && <span className="queue-count">{item.queue.length}</span>}
            </button>)}
        </section>)}
        {snapshot && snapshot.projects.length === 0 && <p className="nav-empty">Add a project to keep conversations and code together.</p>}
        {snapshot && archived && !snapshot.sessions.some((session) => session.status === "archived") && <p className="nav-empty">Archived sessions stay here, ready to restore.</p>}
      </div>
      <div className="nav-footer">
        <button className="provider-button" onClick={() => { setConnections((value) => !value); setPanelOpen(true); }}>
          <span className={`status-dot ${snapshot?.provider.status === "connected" ? "completed" : "idle"}`} />
          <span><strong>GitHub Copilot</strong><small>{snapshot?.provider.status ?? "Connecting to service"}</small></span><span>&gt;</span>
        </button>
        <div className="connection-line"><span className={`status-dot ${status === "connected" ? "completed" : "failed"}`} />Local service {status}</div>
      </div>
    </nav>
    <main className="main-pane">
      <header className="session-header">
        <button className="icon-button nav-toggle" aria-label="Toggle projects" onClick={() => setNavOpen((value) => !value)}><Icon name="Files" /></button>
        <div className="session-heading"><h1>{session ? title(session) : "Your workspace"}</h1><span>{session ? `${project?.name ?? "Project"} / ${session.localFinishing ? "Local finishing" : session.status.replace("_", " ")}` : "Local first. Under your control."}</span></div>
        {session?.turnId && <button className="stop-button" disabled={session.status === "stopping"} onClick={() => void command({ type: "session.stop", sessionId: session.id })}>{session.status === "stopping" ? "Stopping..." : "Stop turn"}</button>}
        {session && !session.turnId && snapshot?.blockedProjects.includes(session.projectId) && <button title="Inspect the workspace and unconfirmed processes before continuing. This does not claim cleanup succeeded." onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume after inspection</button>}
        {session && !session.turnId && <button className="quiet" onClick={() => void command({ type: session.status === "archived" ? "session.restore" : "session.archive", sessionId: session.id })}>{session.status === "archived" ? "Restore" : "Archive"}</button>}
        <button className="icon-button" aria-label={panelOpen ? "Collapse session sidebar" : "Open session sidebar"} onClick={() => { setPanelOpen((value) => !value); setConnections(false); }}><Icon name="Insights" /></button>
      </header>
      {(notice || connectionError) && <div className="notice error" role="alert"><span>{notice ?? connectionError}</span><button className="quiet" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {!snapshot ? <div className="loading-state" role="status"><div className="skeleton" /><div className="skeleton short" /><p>Connecting to your local workspace...</p></div> :
        !session ? <div className="welcome">
          <span className="welcome-mark">m.</span><h2>Start with your workspace.</h2><p>A shared home for your code, conversations, and the work in between. Nothing runs until you ask.</p>
          <div className="welcome-actions"><button className="primary" onClick={() => void openProject()}>Open a project</button>{project && <button onClick={() => void newSession()}>New session</button>}</div>
          <ProviderConnect provider={snapshot.provider} run={run} client={client} />
        </div> :
        <>
          <Timeline session={session} run={run} />
          {session.pendingApproval && <section className="approval" aria-label="Tool approval">
            <div className="approval-heading"><span className="attention-dot" /><strong>Your approval is required</strong><span>Manual</span></div>
            <p><strong>{session.pendingApproval.call.name}</strong>{session.pendingApproval.call.name === "run_command" ? " will run on your Mac without sandbox isolation." : " will access this project's files."}</p>
            <pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre>
            <div className="approval-actions"><button disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: false })}>Deny</button><button className="primary" disabled={busy} onClick={() => void command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow: true })}>Approve this action</button></div>
          </section>}
          {session.queue.length > 0 && <Queue session={session} command={command} client={client} />}
          {editor && project && <Composer key={session.id} session={session} project={project} snapshot={snapshot} client={client} editor={editor} run={run} busy={busy} connected={status === "connected"} onConnect={() => { setConnections(true); setPanelOpen(true); }} />}
        </>}
    </main>
    <aside className="context-pane" aria-label="Session sidebar">
      <header className="context-heading"><strong>{connections ? "Connections" : panel}</strong><div><button className="icon-button" aria-label="Resize sidebar" title="Toggle sidebar width" onClick={() => setWidePanel((value) => !value)}>&lt;&gt;</button><button className="icon-button" aria-label="Close sidebar" onClick={() => setPanelOpen(false)}>x</button></div></header>
      <div className="context-content">{connections && snapshot ? <><ProviderConnect provider={snapshot.provider} client={client} run={run} /><PolicySettings snapshot={snapshot} command={command} /></> :
        <ContextPanel key={`${session?.id}-${panel}`} panel={panel} session={session} project={project} events={events} client={client} run={run} />}
      </div>
      <footer className="context-footer">Bound to the main session</footer>
    </aside>
    <nav className="panel-rail" aria-label="Sidebar panels">{panels.map((item) => <button key={item} className={panelOpen && panel === item && !connections ? "active" : ""} aria-label={item} title={item} aria-pressed={panelOpen && panel === item && !connections} onClick={() => { setPanel(item); setPanelOpen(true); setConnections(false); }}><Icon name={item} /></button>)}</nav>
    {palette && <CommandPalette close={() => setPalette(false)} actions={[
      { name: "New session", action: newSession }, { name: "Open project", action: openProject },
      { name: "Connect GitHub Copilot", action: async () => { setConnections(true); setPanelOpen(true); } },
      { name: "Show Insights and event trace", action: async () => { setPanel("Insights"); setPanelOpen(true); setConnections(false); } },
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
    {session.messages.length === 0 ? <div className="session-empty"><span className="welcome-mark small">m.</span><h2>What are we working on?</h2><p>Ask a question, explore this project, or make a change.<br />You review every tool action before it runs.</p><div className="empty-contract"><span>Local execution</span><span>Manual approvals</span><span>Durable history</span></div></div> : <>
      {session.messages.length > limit && <button className="load-history" onClick={() => setLimit((value) => value + 150)}>Show earlier messages ({session.messages.length - limit})</button>}
      {session.messages.slice(-limit).map((message) => <article key={message.id} className={`message ${message.role}`}>
        <header><strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Moguri" : message.role === "tool" ? message.toolCalls?.[0]?.name ?? "Tool" : "Session"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.outcome && message.role !== "assistant" && <span className="outcome">{message.outcome}</span>}</header>
        {message.role === "tool" ? <details open={message.outcome === "running"}><summary>{message.outcome === "running" ? "Command output" : `Tool result: ${message.outcome}`}</summary><pre>{message.text}</pre></details> :
          <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
            a: ({ href, children }) => <a href={href} onClick={(event) => { event.preventDefault(); if (href) void run(() => window.moguri.openExternal(href)); }}>{children}</a>,
            img: ({ alt }) => <span>[Image omitted: {alt || "remote image"}]</span>,
          }}>{message.text || (message.toolCalls?.length ? "Requesting tool access." : message.outcome ? "No text response was returned." : "Working...")}</Markdown></div>}
        {message.reasoning && <details><summary>Provider-exposed reasoning</summary><p className="reasoning">{message.reasoning}</p></details>}
      </article>)}
    </>}
  </div>;
}
function Composer({ session, project, snapshot, client, editor, run, busy, connected, onConnect }: {
  session: Session; project: Project; snapshot: Snapshot; client: MoguriClient; editor: DraftEditor; run: Run; busy: boolean; connected: boolean; onConnect: () => void;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [delivery, setDelivery] = useState<"queue" | "steer" | "interrupt">("queue");
  const modelAvailable = snapshot.provider.models.some((model) => model.id === session.controls.modelId);
  const configure = (modelId: string) => run(() => client.command({ type: "session.configure", sessionId: session.id, expectedRevision: session.revision, controls: { ...session.controls, modelId } }));
  const send = (event?: FormEvent) => { event?.preventDefault(); void run(() => editor.send(delivery)); };
  const canSend = connected && !busy && session.status !== "archived" && snapshot.provider.status === "connected" &&
    modelAvailable && (draft.text.trim().length > 0 || draft.attachments.length > 0) && !draft.conflict && (delivery === "queue" || !!session.turnId);
  return <form className="composer" onSubmit={send} aria-label="Message composer">
    {!modelAvailable && <button type="button" className="setup-hint" onClick={onConnect}>{session.controls.modelId ? `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.` : snapshot.provider.status === "connected" ? "Choose a Copilot model below to start." : "Connect GitHub Copilot to choose a model and start."}<span>&gt;</span></button>}
    {session.localFinishing && <p className="local-finishing">Local finishing: this running turn predates the allowed-env policy change. New Local work is blocked.</p>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <span key={attachment.id} title={`Snapshot sha256 ${attachment.digest}`}><Icon name="Files" />{attachment.path}<button type="button" aria-label={`Remove attachment ${attachment.path}`} onClick={() => editor.edit(draft.text, draft.attachments.filter((item) => item.id !== attachment.id))}>x</button></span>)}</div>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>Prompt</label>
    <textarea id={`prompt-${session.id}`} placeholder="Ask anything about this project..." value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
      onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void run(async () => { throw new Error("Image paste is not available in this checkpoint. No clipboard file was attached or sent."); }); } }}
      onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (canSend) send(); } }} />
    {draft.error && <div className="draft-error" role="alert"><p>{draft.error}</p><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    <div className="composer-controls">
      <label>Env<select aria-label="Env" value={session.controls.env} disabled={!!session.turnId} onChange={() => {}} title="Factory default: Local. No sandbox isolation."><option>Local</option><option disabled>Sandbox (not ready)</option><option disabled>Remote (not ready)</option></select></label>
      <label className="model-control">Model<select aria-label="Model" disabled={!!session.turnId || snapshot.provider.status !== "connected"} value={session.controls.modelId ?? ""} onChange={(event) => void configure(event.target.value)}>
        <option value="" disabled>{snapshot.provider.status === "connected" ? "Choose a model" : "Connect Copilot"}</option><option value="kupo" disabled>kupo (not evaluated)</option>
        {session.controls.modelId && !modelAvailable && <option value={session.controls.modelId} disabled>{session.controls.modelId} (unavailable)</option>}
        <optgroup label="GitHub Copilot">{snapshot.provider.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</optgroup>
      </select></label>
      <label>Autonomy level<select aria-label="Autonomy level" value="Manual" onChange={() => {}} title="Factory default: Manual. Each tool needs your approval."><option>Manual</option><option disabled>Guided (not ready)</option><option disabled>Autopilot (not ready)</option><option disabled>Autopilot Max (not ready)</option></select></label>
      <label>Budget<select aria-label="Budget" value="Unlimited" onChange={() => {}} title="Factory default: Unlimited. Finite caps are not enforceable yet."><option>Unlimited</option><option disabled>Token/USD cap (not ready)</option></select></label>
    </div>
    <div className="composer-bottom">
      <details className="attach-menu"><summary><span>+</span> Attach</summary><div className="attach-options">
        <button type="button" onClick={() => void run(async () => { const path = await window.moguri.chooseFile(project.path); if (path) await editor.attach(path); })}>@ Project text file</button>
        {["^ Local file outside project", ": Local folder", "# GitHub issue", "# GitHub pull request", "! Moguri session", "Clipboard image"].map((type) => <button key={type} type="button" disabled title="Not implemented in this checkpoint">{type}<small>Not available yet</small></button>)}
      </div></details>
      <span className="save-state" role="status">{draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved"}</span>
      <div className="send-controls"><select aria-label="Delivery mode" value={delivery} onChange={(event) => setDelivery(event.target.value as typeof delivery)}><option value="queue">{session.turnId ? "Queue" : "Send"}</option><option value="steer" disabled={!session.turnId}>Steer</option><option value="interrupt" disabled={!session.turnId}>Interrupt</option></select><button className="primary send-button" type="submit" disabled={!canSend} title="Ctrl+Enter or Command+Enter">{delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send"} <span aria-hidden="true">&uarr;</span></button></div>
    </div>
    <p className="composer-footnote">Local runs on your Mac. Files go to Copilot only through your prompt or approved tools.</p>
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
      <><span className="queue-delivery">{item.delivery === "steer" && item.targetTurnId !== session.turnId ? "unapplied steer" : item.delivery}</span><span className="queue-text">{item.text || "Attached project context"}</span>{item.delivery === "steer" && <button className="quiet" onClick={() => void command({ type: "queue.make-turn", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}>Queue as new turn</button>}<button className="quiet" onClick={() => { setEditing(item.id); setText(item.text); }}>Edit</button><button className="icon-button" aria-label={`Move queued message ${index + 1} up`} disabled={index === 0} onClick={() => reorder(index, -1)}>&uarr;</button><button className="icon-button" aria-label={`Move queued message ${index + 1} down`} disabled={index === session.queue.length - 1} onClick={() => reorder(index, 1)}>&darr;</button><button className="icon-button" aria-label={`Remove queued message ${index + 1}`} onClick={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}>x</button></>}</div>)}
  </section>;
}
function ContextPanel({ panel, session, project, events, client, run }: { panel: Panel; session?: Session; project?: Project; events: StoredEvent[]; client: MoguriClient; run: Run }) {
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
  if (panel === "Terminal") {
    const commands = session.messages.filter((message) => message.role === "tool" && message.toolCalls?.some((call) => call.name === "run_command"));
    return <><h2>Owned commands</h2><p className="muted">Local host execution. Closing this panel does not stop work.</p>{commands.length ? commands.map((message) => <details key={message.id} open={message.outcome === "running"}><summary>{message.toolCalls?.[0]?.arguments.command as string} / {message.outcome}</summary><pre>{message.text}</pre></details>) : <p className="panel-empty-text">No shell command has been approved in this session.</p>}
      {session.processes.map((process) => <p className="fine-print" key={process.callId}>PID {process.pid}, group {process.processGroup}: {process.outcome}</p>)}
      {session.turnId && <button className="stop-button" onClick={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))}>Stop active work</button>}<p className="fine-print">Interactive terminals and restart reattachment are not implemented yet.</p></>;
  }
  const unavailable: Record<Exclude<Panel, "Insights" | "Terminal">, string> = {
    Changes: "Worktree status and diff views arrive in Phase 3. No Git status has been inferred.",
    Files: "The project file browser arrives in Phase 3. Attach an explicit project text snapshot in the composer, or approve a scoped file tool.",
    Browser: "Stainless is not connected. Browser previews are a later integration; no page or browser context has been sent to the model.",
    "Side chat": "Linked side chat is not implemented. This panel cannot steer, interrupt, or mutate the main session.",
    Extensions: "Extension management is not implemented. No extension or MCP permissions have been granted.",
  };
  return <div className="panel-empty"><Icon name={panel} /><h2>{panel} is not available yet</h2><p>{unavailable[panel]}</p><small>Main session: {title(session)}</small></div>;
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
