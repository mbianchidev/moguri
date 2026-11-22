import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DraftEditor, envLabel, type BrowserState, type MoguriSdk, type Session, type Snapshot, type PlanBinding } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { TaskPlanPanel } from "./TaskProgress.tsx";
import { QuestionCard } from "./QuestionCard.tsx";
import { SessionCoordinationPanel } from "./SessionCoordination.tsx";
import { ApprovalActions } from "./ApprovalActions.tsx";
import { ApprovalCall } from "./ApprovalCall.tsx";
import type { SettingsTab } from "./settings-catalog.ts";
import { RepositoryPicker } from "./RepositoryPicker.tsx";
import { Alert } from "./Alert.tsx";
import { StainlessBrowserRow } from "./StainlessPanel.tsx";
import { PanelError, panelFailure, type PanelFailure } from "./PanelFailure.tsx";
import { UnifiedDiff } from "./UnifiedDiff.tsx";
const CodeView = lazy(() => import("./CodeView.tsx").then((module) => ({ default: module.CodeView })));

export function HomeWriterReview({ sdk, session, snapshot, chooseSession }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; chooseSession: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const root = session.controls.env === "Local" ? session.homeRoot : undefined;
  const writers = root ? snapshot.chatWriters.filter((writer) => writer.status === "unconfirmed" && writer.root.root === root.root &&
    writer.root.device === root.device && writer.root.inode === root.inode) : [];
  if (!writers.length) return null;
  return <section className="settings-warning" aria-label="Home writer inspection"><strong>Home needs inspection</strong>
    <p>Inspect the original files and processes before acknowledging risk. This does not prove cleanup, grant permissions or resume queued prompts.</p>
    {writers.map((writer) => <details key={writer.id} open><summary>Interrupted Home writer</summary>
      <p className="path">{writer.root.root} / {writer.id}</p><p>{writer.diagnostic}</p>
      {snapshot.sessions.some((source) => source.id === writer.sessionId) ? writer.sessionId !== session.id &&
        <button type="button" disabled={busy} onClick={() => void chooseSession(writer.sessionId)}>Open original chat</button> :
        <p>Original chat removed. Its independent writer record remains.</p>}
      <button type="button" disabled={busy || Boolean(session.turnId) || snapshot.sessions.some((source) => source.id === writer.sessionId && source.turnId === writer.turnId)}
        onClick={() => {
          setBusy(true); setError("");
          void sdk.workspaces.acknowledgeHomeWriter(session.id, writer.id, writer.revision, true)
            .catch((error: unknown) => setError(error instanceof Error ? error.message : "The exact Home inspection was not acknowledged. Original ownership remains."))
            .finally(() => setBusy(false));
        }}>Acknowledge inspected Home</button>
    </details>)}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}

export function ChangesPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [repository, setRepository] = useState(""), generation = useRef(0);
  const [data, setData] = useState<{ branch: string; status: string; diff: string } | null>(null);
  const [error, setError] = useState<PanelFailure | null>(null), [loading, setLoading] = useState(false);
  const load = async () => {
    setError(null);
    const current = ++generation.current; setData(null); setLoading(true);
    if (session.repositories && !repository) { setLoading(false); return; }
    if (!session.projectId && !session.repositories) { setError({ message: "Select a project to inspect file changes.", code: null }); setLoading(false); return; }
    try { const data = await sdk.workspaces.git(session.id, true, repository || undefined); if (generation.current === current) setData(data); }
    catch (error) { if (generation.current === current) setError(panelFailure(error, "Git status could not be read.")); }
    finally { if (generation.current === current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [session.id, session.workspaceId, session.turnId, repository]);
  return <section className="changes-panel" aria-label="Bound workspace changes" aria-busy={loading}><RepositoryPicker session={session} value={repository} change={(value) => { generation.current++; setData(null); setRepository(value); }} label="Changes" /><header className="panel-toolbar"><strong>{data?.branch ?? "File changes"}</strong><button className="icon-button" title="Refresh diff" aria-label="Refresh diff" disabled={loading || Boolean(session.repositories && !repository)} onClick={() => void load()}><Icon name="Refresh" /></button></header>
    {loading && <p className="fine-print" role="status">Loading changes from the bound workspace...</p>}
    <PanelError failure={error} projectId={session.projectId} />
    {data && <>{data.status ? <pre className="git-status" tabIndex={0} role="region" aria-label="Changed files">{data.status}</pre> : <p className="panel-empty-text" role="status">Working tree is clean.</p>}
      {data.diff ? <UnifiedDiff text={data.diff} label="Tracked changes" /> : data.status && <p className="panel-empty-text">No tracked diff. Untracked files are listed above.</p>}</>}
    {session.controls.env === "Remote" && <p className="fine-print">Read-only Git state from the approved SSH workspace. No Local checkout was used.</p>}
  </section>;
}
export function FilesPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [repository, setRepository] = useState("");
  const [path, setPath] = useState("."), [entries, setEntries] = useState<string[]>([]), [file, setFile] = useState<{ path: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState<PanelFailure | null>(null), generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current; setLoading(true); setError(null); setFile(null);
    if (session.repositories && !repository) { setEntries([]); setLoading(false); return; }
    void sdk.workspaces.files(session.id, path, repository || undefined).then((result) => { if (generation.current === current) setEntries(result.entries); })
      .catch((error: unknown) => { if (generation.current === current) { setEntries([]); setError(panelFailure(error, "Directory could not be read from the bound root.")); } })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [session.id, session.workspaceId, session.sandboxWorkspaceId, session.controls.env, path, repository]);
  const open = (entry: string) => {
    if (entry.endsWith("/")) { setPath(entry.slice(0, -1)); return; }
    const current = ++generation.current; setLoading(true); setError(null);
    void sdk.workspaces.file(session.id, entry, repository || undefined).then((result) => { if (generation.current === current) setFile(result); })
      .catch((error: unknown) => { if (generation.current === current) setError(panelFailure(error, "File could not be read.")); })
      .finally(() => { if (generation.current === current) setLoading(false); });
  };
  return <section className="files-panel" aria-label="Bound workspace files"><RepositoryPicker session={session} value={repository}
    change={(value) => { generation.current++; setFile(null); setEntries([]); setPath("."); setRepository(value); }} label="Files" /><header className="panel-toolbar">
    <button className="icon-button" aria-label={file ? "Back to folder" : "Parent folder"} title={file ? "Back" : "Parent folder"} disabled={!file && path === "."} onClick={() => { generation.current++; if (file) setFile(null); else setPath(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "."); }}><Icon name="Back" /></button><strong title={file?.path ?? path}>{file?.path ?? (path === "." ? "Workspace root" : path)}</strong></header>
    {loading && <p role="status">Loading from the bound workspace...</p>}<PanelError failure={error} projectId={session.projectId} />
    {file ? <Suspense fallback={<pre className="workspace-file-content" tabIndex={0}>{file.text}</pre>}><CodeView path={file.path} text={file.text} label={`File ${file.path}`} /></Suspense> : <div className="workspace-file-list">{entries.map((entry) => <button key={entry} onClick={() => open(entry)} disabled={loading}><Icon name={entry.endsWith("/") ? "Files" : "Plan"} /><span>{entry.slice(path === "." ? 0 : path.length + 1)}</span></button>)}{!loading && !error && !entries.length && <p className="fine-print">No allowed files in this directory.</p>}</div>}
    <p className="fine-print">Read-only {session.controls.env === "Remote" ? "SSH workspace" : session.controls.env === "Sandbox" ? "private native stage, not the Local source" : session.homeRoot ? "Home" : "workspace"} view. Protected paths, symlinks and denied folders stay excluded; this is not an attachment or agent permission.</p>
  </section>;
}
interface PlanPanelProps { sdk: MoguriSdk; session: Session; snapshot: Snapshot; workspaceScope: string; onDirty: (dirty: boolean) => void; modal?: (open: boolean) => void }
export function PlanPanel(props: PlanPanelProps) {
  const [fileOpen, setFileOpen] = useState(false), [fileDirty, setFileDirty] = useState(false);
  const fileDirtyChanged = useCallback((dirty: boolean) => { setFileDirty(dirty); props.onDirty(dirty); }, [props.onDirty]);
  return <><TaskPlanPanel sdk={props.sdk} session={props.session} modal={props.modal} />
    {props.session.projectId && <><button type="button" className="quiet workspace-plan-toggle" disabled={fileDirty} aria-expanded={fileOpen} onClick={() => setFileOpen((open) => !open)}><Icon name={fileOpen ? "Down" : "ChevronRight"} />{fileOpen ? "Hide workspace plan file" : "Open workspace plan file"}</button>
      {fileOpen && <WorkspacePlanFile {...props} onDirty={fileDirtyChanged} />}</>}
  </>;
}
function WorkspacePlanFile({ sdk, session, snapshot, workspaceScope, onDirty }: PlanPanelProps) {
  const scope = workspaceScope;
  const generation = useRef(0), currentScope = useRef(scope);
  currentScope.current = scope;
  const [plan, setPlan] = useState<({ text: string; digest: string; path: string; scope: string } & Partial<PlanBinding>) | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stopping, setStopping] = useState(false);
  const save = snapshot.planSaves.findLast((entry) => entry.sessionId === session.id);
  const execution = snapshot.executions.find((entry) => entry.id === save?.executionId);
  const dirty = plan !== null && text !== plan.text;
  useEffect(() => { onDirty(dirty || saving); return () => onDirty(false); }, [dirty, saving, onDirty]);
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [dirty, saving]);
  const load = async (expectedBinding?: string) => {
    const current = ++generation.current; setError(""); setLoading(true);
    try {
      const result = await sdk.plans.read(session.id);
      if (generation.current !== current || currentScope.current !== scope) return;
      if (expectedBinding && result.bindingDigest !== expectedBinding) { setError("The original save settled, but the workspace changed. Your edit is preserved; reload explicitly before editing another root."); return; }
      setPlan({ ...result, scope }); setText(result.text);
    } catch (error) { if (generation.current === current && currentScope.current === scope) setError(error instanceof Error ? error.message : "Plan could not be read."); }
    finally { if (generation.current === current && currentScope.current === scope) setLoading(false); }
  };
  useEffect(() => {
    generation.current++;
    if (dirty && plan?.scope !== scope) { setLoading(false); setError("The bound workspace changed. Your edit is preserved; copy it or explicitly reload before saving into another root."); }
    else void load();
    return () => { generation.current++; };
  }, [scope]);
  const scopeChanged = plan !== null && plan.scope !== scope;
  const readOnly = scopeChanged || session.controls.env === "Sandbox" || session.mode !== "agent" || session.pendingMode === "read-only" || session.kind === "side" || session.kind === "subagent" || session.status === "archived" ||
    session.controls.env === "Remote" && (!snapshot.policy.allowedEnvs.includes("Remote") || !snapshot.capabilities.find((capability) => capability.env === "Remote")?.ready || Boolean(session.turnId));
  return <section className="plan-panel" aria-label="Bound project plan" aria-busy={loading || saving}><header className="panel-toolbar"><strong title={plan?.path}>{plan?.path ?? "Plan"}</strong><button className="icon-button" aria-label="Reload plan" title="Reload plan, discarding local edits" disabled={saving || loading} onClick={() => void load()}><Icon name="Refresh" /></button>
    <button className="primary" disabled={!dirty || saving || loading || readOnly} onClick={() => {
      if (!plan) return;
      setSaving(true); setError("");
      const capturedScope = scope;
      void sdk.plans.save(session.id, text, plan.digest, plan.bindingDigest).then(() => {
        if (currentScope.current !== capturedScope) { setError("The original save settled, but the workspace changed. Your edit is preserved; reload explicitly before editing another root."); return; }
        return load(plan.bindingDigest);
      }).catch((error: unknown) => setError(error instanceof Error ? error.message : "The plan was not saved; your edit was preserved.")).finally(() => setSaving(false));
    }}>Save</button></header>
    {loading && <p className="fine-print" role="status">Loading plan from the bound workspace...</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {plan?.boundary && <details className="plan-binding"><summary>SSH destination and binding</summary><p className="fine-print path">{plan.boundary.root}/{plan.path} / {plan.boundary.hostFingerprint}. Saving uses this exact reviewed binding, not a Local path.</p></details>}
    {readOnly && <p className="fine-print">{scopeChanged ? "Workspace changed. Reload explicitly before editing this root." : session.controls.env === "Remote" && session.mode === "agent" ? "Finish owned work and verify the exact Remote target/policy before saving. No Local fallback." : "Question-only or unavailable workspace. Plan editing is disabled."}</p>}
    <textarea aria-label="Project plan" spellCheck={false} value={text} readOnly={readOnly} disabled={!plan || saving || loading} onChange={(event) => setText(event.target.value)} placeholder={session.controls.env === "Remote" ? "No plan exists in the approved remote workspace." : "No plan yet. Write one here to create it explicitly."} />
    {(!loading || dirty || saving) && <p className="fine-print">{saving ? "Saving exact owned plan. Your edit is preserved until settlement." : dirty ? "Unsaved edit" : session.controls.env === "Remote" ? "Read from the approved SSH workspace. Only explicit saves retain an independent snapshot; no model is called." : "Saved snapshots survive session deletion."}</p>}
    {save && <details className="plan-save-outcome" aria-label="Remote plan save outcome"><summary>Remote save: {save.status}</summary>
      <p className="fine-print path">Phase: {save.phase}. File: {save.fileOutcome}. Source: {save.root}/{save.path}.</p>
      <p className="fine-print path">Pinned host: {save.hostFingerprint}. Worker cleanup: {execution?.cleanup === "acknowledged" ? "user inspection acknowledged, not proof" : execution?.cleanup ?? "not confirmed"}. SSH is not sandbox isolation or descendant-containment proof.</p>
      {save.createdDirectories.length > 0 && <p className="fine-print">Created directories: {save.createdDirectories.join(", ")}. No rollback is implied.</p>}
      {save.artifactId && <p className="fine-print">Independent retained snapshot: <code>{save.artifactId}</code>. Open it from Artifacts.</p>}
      {save.diagnostic && <Alert as="p" className="inline-error" role="alert">{save.diagnostic}</Alert>}
      {save.status === "running" && <button type="button" disabled={stopping} onClick={() => { setStopping(true); void sdk.plans.stopSave(session.id, save.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Exact save stop was not confirmed.")).finally(() => setStopping(false)); }}>Stop Remote save</button>}
    </details>}
  </section>;
}
export function BrowserPanel({ sdk, session, openSettings }: { sdk: MoguriSdk; session: Session; openSettings: () => void }) {
  const [url, setUrl] = useState(session.browserUrl ?? "");
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  // The switch shows the chat's recorded Agent control choice (D61); a pending toggle shows its requested value until it settles.
  const [pendingChoice, setPendingChoice] = useState<boolean | null>(null);
  const enabled = pendingChoice ?? session.browserAgentControl === true;
  const latest = useRef(session); latest.current = session;
  const updateHost = useRef<() => void>(() => {});
  const reload = useRef(false);
  const urlDirty = useRef(false);
  const controlIntent = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { setUrl(session.browserUrl ?? ""); urlDirty.current = false; }, [session.id, session.browserUrl]);
  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;
    let polling = false;
    const update = async () => {
      again = true;
      if (disposed || running || !host.current) return;
      running = true;
      try {
        while (again && !disposed && host.current) {
          again = false;
          const bounds = host.current.getBoundingClientRect();
          if (bounds.width > 1 && bounds.height > 1) {
            const force = reload.current; reload.current = false;
            const current = sdk.getState().snapshot?.sessions.find((value) => value.id === session.id) ?? latest.current;
            await window.moguri.preview({ sessionId: session.id, url: current.browserUrl, reload: force, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }, sdk.profileId);
          }
        }
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Preview could not load. No page content was sent to the agent."); }
      finally { running = false; }
    };
    const status = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const { browser } = await sdk.browser.state(session.id);
        if (!disposed) {
          setStatusError("");
          setBrowser(browser);
          if (!urlDirty.current && browser.url && browser.url !== "about:blank") setUrl(browser.url);
        }
      } catch (error) { if (!disposed) { setBrowser(null); setStatusError(error instanceof Error ? error.message : "Browser authority could not be read."); } }
      finally { polling = false; }
    };
    updateHost.current = () => void update();
    let browserSequence = sdk.getState().events.findLast((event) => event.event_type === "session.browser_changed" && event.session_id === session.id)?.seq ?? 0;
    const unsubscribe = sdk.subscribe(() => {
      const changed = sdk.getState().events.findLast((event) => event.event_type === "session.browser_changed" && event.session_id === session.id);
      if (changed && changed.seq > browserSequence) { browserSequence = changed.seq; reload.current = true; void update(); }
    });
    const observer = new ResizeObserver(() => void update());
    if (host.current) observer.observe(host.current);
    window.addEventListener("scroll", update, true);
    void update();
    void status();
    const timer = setInterval(() => void status(), 500);
    return () => {
      disposed = true; clearInterval(timer); unsubscribe(); observer.disconnect(); window.removeEventListener("scroll", update, true);
      controlIntent.current++; setPendingChoice(null);
      void window.moguri.preview(null, sdk.profileId, session.id).catch(() => console.error("Native preview cleanup was not acknowledged."));
    };
  }, [sdk, session.id]);
  useEffect(() => updateHost.current(), [session.browserUrl, session.controls.env]);
  const toggle = async (checked: boolean) => {
    const intent = ++controlIntent.current;
    setPendingChoice(checked); setError("");
    try {
      const browser = await window.moguri.browserControl(session.id, checked, sdk.profileId);
      if (controlIntent.current === intent) setBrowser(browser);
    } catch (error) { if (controlIntent.current === intent) setError(error instanceof Error ? error.message : "Browser control was not changed."); }
    // Read the recorded choice before dropping the pending value so the switch never flickers back.
    await sdk.refresh().catch(() => {});
    if (controlIntent.current === intent) setPendingChoice(null);
  };
  const navigate = async () => { setError(""); try { await sdk.sessions.browser(session.id, url); urlDirty.current = false; } catch (error) { setError(error instanceof Error ? error.message : "Preview URL was not accepted."); } };
  const activeUrl = browser?.url && browser.url !== "about:blank" ? browser.url : session.browserUrl;
  const localAllowed = sdk.getState().snapshot?.policy.allowedEnvs.includes("Local") ?? false;
  const paused = session.controls.env !== "Local" ? `Paused while this chat runs in ${envLabel(session.controls.env)}` : !localAllowed ? "Paused while policy does not allow Local" :
    session.mode !== "agent" || session.pendingMode === "read-only" ? "Paused while this chat is read-only" : null;
  const state = !enabled ? "Agent access off" : paused ? `${paused}. Agent control stays on for this chat until you turn it off` :
    browser?.controlId ? "Agent control stays on for this chat until you turn it off" : "Agent control stays on for this chat; reconnecting";
  return <section className="browser-panel"><div className="browser-control"><button className="browser-control-toggle" type="button" role="switch" aria-label="Agent browser control" aria-checked={enabled}
    disabled={!enabled && (!browser?.available || session.mode !== "agent" || session.kind !== "agent")} onClick={() => void toggle(!enabled)}>
    <span className="browser-toggle-track" aria-hidden="true"><span className="browser-toggle-thumb" /></span><span>Agent control</span></button>
    <span role="status">{state}</span></div>
    <form className="browser-address" onSubmit={(event) => { event.preventDefault(); void navigate(); }}><input aria-label="Preview URL" placeholder="https://... or local preview URL" value={url} onChange={(event) => { urlDirty.current = true; setUrl(event.target.value); }} />
    <button className="icon-button" type="submit" aria-label="Load preview" title="Load preview"><Icon name="Play" /></button><button className="icon-button" type="button" aria-label="Open preview in default browser" title="Open in browser" disabled={!activeUrl} onClick={() => void window.moguri.openExternal(activeUrl!).catch((error: unknown) => setError(error instanceof Error ? error.message : "Browser could not open."))}><Icon name="Browser" /></button></form>
    <StainlessBrowserRow sdk={sdk} session={session} revision={sdk.getState().snapshot?.settings.revision ?? 0} url={activeUrl} openSettings={openSettings} />
    {(error || statusError) && <Alert as="p" className="inline-error" role="alert">{error || statusError}</Alert>}
    <div ref={host} className="browser-host">{!session.browserUrl && <p>Enter a preview URL. This isolated view has no Moguri bridge, account cookies, filesystem access or automatic model context.</p>}</div>
    <p className="terminal-boundary">{enabled ? "Approved browser tools can read and control this page, also while you look at another panel. Your own navigation and reconnects give the agent a new identity; turn off Agent control to revoke access immediately." :
      session.controls.env === "Local" ? "Isolated web preview. Agent access is off until you enable it; tool approvals still apply." : "Local preview only. Agent browser control is unavailable in Sandbox and Remote; no Local fallback."}</p>
  </section>;
}
export function SideChat({ sdk, parent, snapshot, selectedId, select, onSlash, editorFor, onDirty, openSettings, modal, renderTranscript, renderQueue }: {
  sdk: MoguriSdk; parent: Session; snapshot: Snapshot; selectedId: string | null; select: (id: string) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
  editorFor: (session: Session) => DraftEditor;
  onDirty?: (dirty: boolean) => void;
  openSettings: (tab: SettingsTab) => void; modal: (open: boolean) => void;
  renderTranscript: (session: Session) => ReactNode; renderQueue: (session: Session) => ReactNode;
}) {
  const sides = snapshot.sessions.filter((session) => session.parentSessionId === parent.id && session.createdParentSessionId === parent.id && session.kind === "side" && session.status !== "archived");
  const side = sides.find((session) => session.id === selectedId) ?? sides.at(-1);
  const [error, setError] = useState<PanelFailure | null>(null);
  const [answerDirty, setAnswerDirty] = useState(false);
  const [coordinationDirty, setCoordinationDirty] = useState(false), dirty = answerDirty || coordinationDirty;
  const creating = useRef(false);
  useEffect(() => {
    if (side || creating.current) return;
    creating.current = true; let current = true;
    void sdk.sessions.side(parent.id).then((result) => { if (current) select(result.id!); })
      .catch((error: unknown) => { if (current) setError(panelFailure(error, "The original side chat could not be opened.")); })
      .finally(() => { creating.current = false; });
    return () => { current = false; };
  }, [sdk, parent.id, side?.id]);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  return <section className="side-chat-panel"><SessionCoordinationPanel key={`${sdk.profileId}:${parent.id}`} sdk={sdk} session={parent} snapshot={snapshot} onDirty={setCoordinationDirty} />
    <header className="panel-toolbar"><select aria-label="Question-only side session" value={side?.id ?? ""} disabled={dirty} onChange={(event) => select(event.target.value)}>{sides.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}{!side && <option value="">Question-only context</option>}</select>
    <button className="icon-button" aria-label="New side chat" title="New question-only side chat" disabled={dirty} onClick={() => void sdk.sessions.spawn(parent.id, "side").then((result) => select(result.id!)).catch((error: unknown) => setError(panelFailure(error, "Side chat could not be created.")))}><Icon name="Plus" /></button></header>
    <PanelError failure={error} projectId={parent.projectId} />
    {side ? <SideConversation key={side.id} sdk={sdk} session={side} snapshot={snapshot} onSlash={onSlash} editorFor={editorFor} onDirty={setAnswerDirty}
      openSettings={openSettings} modal={modal} renderTranscript={renderTranscript} renderQueue={renderQueue} /> : !error && <p className="fine-print" role="status">Opening the original read-only side chat...</p>}
  </section>;
}
function SideConversation({ sdk, session, snapshot, onSlash, editorFor, onDirty, openSettings, modal, renderTranscript, renderQueue }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
  editorFor: (session: Session) => DraftEditor; onDirty?: (dirty: boolean) => void; openSettings: (tab: SettingsTab) => void; modal: (open: boolean) => void;
  renderTranscript: (session: Session) => ReactNode; renderQueue: (session: Session) => ReactNode;
}) {
  const editor = useMemo(() => editorFor(session), [editorFor, session.id]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [composerPending, setComposerPending] = useState(false);
  const [questionDirty, setQuestionDirty] = useState(false), [coordinationDirty, setCoordinationDirty] = useState(false);
  useEffect(() => { onDirty?.(questionDirty || coordinationDirty || busy || composerPending); return () => onDirty?.(false); }, [questionDirty, coordinationDirty, busy, composerPending, onDirty]);
  const question = snapshot.questions.find((question) => question.id === session.pendingQuestionId && question.status === "open");
  useEffect(() => { editor.receive(session.draft); }, [session.draft.revision]);
  const run = async (operation: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "The original side-chat action failed. Its draft is preserved."); }
    finally { setBusy(false); }
  };
  const project = snapshot.projects.find((project) => project.id === session.projectId);
  const workspace = snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId);
  const boundProject = project && (!session.workspaceId || workspace) ? { ...project, path: workspace?.path ?? project.path } : undefined;
  return <><SessionCoordinationPanel key={`${sdk.profileId}:${session.id}`} sdk={sdk} session={session} snapshot={snapshot} onDirty={setCoordinationDirty} />
    <p className="side-read-only" data-side-session-id={session.id}><Icon name="ReadOnly" /><strong>Read-only</strong> / main chat context refreshes for each new question</p>
    {renderTranscript(session)}
    {question && <QuestionCard key={question.id} sdk={sdk} question={question} onDirty={setQuestionDirty} />}
    {session.pendingApproval && <section className="side-approval" aria-label="Side read approval"><div className="approval-body">
      <ApprovalCall call={session.pendingApproval.call} snapshot={snapshot} /></div>
      <ApprovalActions key={session.pendingApproval.id} sdk={sdk} session={session} busy={busy} run={run} /></section>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {session.queue.length > 0 && renderQueue(session)}
    <ChatComposer session={session} project={boundProject} snapshot={snapshot} client={sdk} editor={editor} run={run} busy={busy}
      connected={sdk.getState().status === "connected"} inputLabel="Side question" autoFocus onPendingChange={setComposerPending}
      onSlash={onSlash} onMenuChange={modal} onConnect={() => openSettings("providers")} onGuardrails={() => openSettings("permissions")}
      onLocalModels={() => openSettings("localModels")} onRemote={() => openSettings("remote")} onSandbox={() => openSettings("sendbox")}
      onRouting={() => openSettings("kupo")} onDecisions={() => openSettings("decisions")} onVoiceSettings={() => openSettings("voice")} />
  </>;
}
