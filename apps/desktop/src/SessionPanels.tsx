import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DraftEditor, type MoguriSdk, type Session, type Snapshot, type PlanBinding } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { chatSubmission, useQueueModifier } from "./ChatComposer.tsx";

export function ChangesPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [data, setData] = useState<{ branch: string; status: string; diff: string } | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    if (!session.projectId) { setError("Select a project to inspect file changes."); return; }
    try { setData(await sdk.workspaces.git(session.id)); }
    catch (error) { setError(error instanceof Error ? error.message : "Git status could not be read."); }
  };
  useEffect(() => { void load(); }, [session.id, session.workspaceId, session.turnId]);
  return <section className="changes-panel"><header className="panel-toolbar"><strong>{data?.branch ?? "File changes"}</strong><button className="icon-button" title="Refresh diff" aria-label="Refresh diff" onClick={() => void load()}><Icon name="Down" /></button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {data && <><pre className="git-status">{data.status || "Working tree is clean."}</pre><pre className="unified-diff">{data.diff || (data.status ? "No tracked diff. Untracked files are listed above." : "No changes.")}</pre></>}
    {session.controls.env === "Remote" && <p className="fine-print">Read-only Git state from the approved SSH workspace. No Local checkout was used.</p>}
  </section>;
}
export function FilesPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [path, setPath] = useState("."), [entries, setEntries] = useState<string[]>([]), [file, setFile] = useState<{ path: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current; setLoading(true); setError(""); setFile(null);
    void sdk.workspaces.files(session.id, path).then((result) => { if (generation.current === current) setEntries(result.entries); })
      .catch((error: unknown) => { if (generation.current === current) { setEntries([]); setError(error instanceof Error ? error.message : "Directory could not be read from the bound root."); } })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [session.id, session.workspaceId, session.sandboxWorkspaceId, session.controls.env, path]);
  const open = (entry: string) => {
    if (entry.endsWith("/")) { setPath(entry.slice(0, -1)); return; }
    const current = ++generation.current; setLoading(true); setError("");
    void sdk.workspaces.file(session.id, entry).then((result) => { if (generation.current === current) setFile(result); })
      .catch((error: unknown) => { if (generation.current === current) setError(error instanceof Error ? error.message : "File could not be read."); })
      .finally(() => { if (generation.current === current) setLoading(false); });
  };
  return <section className="files-panel" aria-label="Bound workspace files"><header className="panel-toolbar">
    <button className="icon-button" aria-label={file ? "Back to folder" : "Parent folder"} title={file ? "Back" : "Parent folder"} disabled={!file && path === "."} onClick={() => { generation.current++; if (file) setFile(null); else setPath(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "."); }}><Icon name="Back" /></button><strong title={file?.path ?? path}>{file?.path ?? path}</strong></header>
    {loading && <p role="status">Loading from the bound workspace...</p>}{error && <p className="inline-error" role="alert">{error}</p>}
    {file ? <pre className="workspace-file-content">{file.text}</pre> : <div className="workspace-file-list">{entries.map((entry) => <button key={entry} onClick={() => open(entry)} disabled={loading}><Icon name={entry.endsWith("/") ? "Files" : "Plan"} /><span>{entry.slice(path === "." ? 0 : path.length + 1)}</span></button>)}{!loading && !error && !entries.length && <p className="fine-print">No allowed files in this directory.</p>}</div>}
    <p className="fine-print">Read-only {session.controls.env === "Remote" ? "SSH workspace" : session.controls.env === "Sandbox" ? "private native stage, not the Local source" : "workspace"} view. Protected paths, symlinks and denied folders stay excluded; this is not an attachment or agent permission.</p>
  </section>;
}
export function PlanPanel({ sdk, session, snapshot, workspaceScope, onDirty }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; workspaceScope: string; onDirty: (dirty: boolean) => void }) {
  const scope = workspaceScope;
  const generation = useRef(0), currentScope = useRef(scope);
  currentScope.current = scope;
  const [plan, setPlan] = useState<({ text: string; digest: string; path: string; scope: string } & Partial<PlanBinding>) | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
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
    const current = ++generation.current; setError("");
    try {
      const result = await sdk.plans.read(session.id);
      if (generation.current !== current || currentScope.current !== scope) return;
      if (expectedBinding && result.bindingDigest !== expectedBinding) { setError("The original save settled, but the workspace changed. Your edit is preserved; reload explicitly before editing another root."); return; }
      setPlan({ ...result, scope }); setText(result.text);
    } catch (error) { if (generation.current === current && currentScope.current === scope) setError(error instanceof Error ? error.message : "Plan could not be read."); }
  };
  useEffect(() => {
    generation.current++;
    if (dirty && plan?.scope !== scope) setError("The bound workspace changed. Your edit is preserved; copy it or explicitly reload before saving into another root.");
    else void load();
    return () => { generation.current++; };
  }, [scope]);
  const scopeChanged = plan !== null && plan.scope !== scope;
  const readOnly = scopeChanged || session.controls.env === "Sandbox" || session.mode !== "agent" || session.pendingMode === "read-only" || session.kind === "side" || session.kind === "subagent" || session.status === "archived" ||
    session.controls.env === "Remote" && (!snapshot.policy.allowedEnvs.includes("Remote") || !snapshot.capabilities.find((capability) => capability.env === "Remote")?.ready || Boolean(session.turnId));
  return <section className="plan-panel" aria-label="Bound project plan"><header className="panel-toolbar"><strong title={plan?.path}>{plan?.path ?? "Plan"}</strong><button className="icon-button" aria-label="Reload plan" title="Reload plan, discarding local edits" disabled={saving} onClick={() => void load()}><Icon name="Down" /></button>
    <button className="primary" disabled={!dirty || saving || readOnly} onClick={() => {
      if (!plan) return;
      setSaving(true); setError("");
      const capturedScope = scope;
      void sdk.plans.save(session.id, text, plan.digest, plan.bindingDigest).then(() => {
        if (currentScope.current !== capturedScope) { setError("The original save settled, but the workspace changed. Your edit is preserved; reload explicitly before editing another root."); return; }
        return load(plan.bindingDigest);
      }).catch((error: unknown) => setError(error instanceof Error ? error.message : "The plan was not saved; your edit was preserved.")).finally(() => setSaving(false));
    }}>Save</button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {plan?.boundary && <details className="plan-binding"><summary>SSH destination and binding</summary><p className="fine-print path">{plan.boundary.root}/{plan.path} / {plan.boundary.hostFingerprint}. Saving uses this exact reviewed binding, not a Local path.</p></details>}
    {readOnly && <p className="fine-print">{scopeChanged ? "Workspace changed. Reload explicitly before editing this root." : session.controls.env === "Remote" && session.mode === "agent" ? "Finish owned work and verify the exact Remote target/policy before saving. No Local fallback." : "Question-only or unavailable workspace. Plan editing is disabled."}</p>}
    <textarea aria-label="Project plan" spellCheck={false} value={text} readOnly={readOnly} disabled={!plan || saving} onChange={(event) => setText(event.target.value)} placeholder={session.controls.env === "Remote" ? "No plan exists in the approved remote workspace." : "No plan yet. Write one here to create it explicitly."} />
    <p className="fine-print">{saving ? "Saving exact owned plan. Your edit is preserved until settlement." : dirty ? "Unsaved edit" : session.controls.env === "Remote" ? "Read from the approved SSH workspace. Only explicit saves retain an independent snapshot; no model is called." : "Saved snapshots survive session deletion."}</p>
    {save && <details className="plan-save-outcome" aria-label="Remote plan save outcome"><summary>Remote save: {save.status}</summary>
      <p className="fine-print path">Phase: {save.phase}. File: {save.fileOutcome}. Source: {save.root}/{save.path}.</p>
      <p className="fine-print path">Pinned host: {save.hostFingerprint}. Worker cleanup: {execution?.cleanup === "acknowledged" ? "user inspection acknowledged, not proof" : execution?.cleanup ?? "not confirmed"}. SSH is not sandbox isolation or descendant-containment proof.</p>
      {save.createdDirectories.length > 0 && <p className="fine-print">Created directories: {save.createdDirectories.join(", ")}. No rollback is implied.</p>}
      {save.artifactId && <p className="fine-print">Independent retained snapshot: <code>{save.artifactId}</code>. Open it from Artifacts.</p>}
      {save.diagnostic && <p className="inline-error" role="alert">{save.diagnostic}</p>}
      {save.status === "running" && <button type="button" disabled={stopping} onClick={() => { setStopping(true); void sdk.plans.stopSave(session.id, save.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Exact save stop was not confirmed.")).finally(() => setStopping(false)); }}>Stop Remote save</button>}
    </details>}
  </section>;
}
export function BrowserPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [url, setUrl] = useState(session.browserUrl ?? "");
  const [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { setUrl(session.browserUrl ?? ""); }, [session.id, session.browserUrl]);
  useEffect(() => {
    let disposed = false;
    let running = false;
    const update = async () => {
      if (disposed || running || !host.current || !session.browserUrl) return;
      running = true;
      try {
        const bounds = host.current.getBoundingClientRect();
        if (bounds.width > 1 && bounds.height > 1) await window.moguri.preview({ sessionId: session.id, url: session.browserUrl, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }, sdk.profileId);
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Preview could not load. No page content was sent to the agent."); }
      finally { running = false; }
    };
    const observer = new ResizeObserver(() => void update());
    if (host.current) observer.observe(host.current);
    window.addEventListener("scroll", update, true);
    void update();
    return () => { disposed = true; observer.disconnect(); window.removeEventListener("scroll", update, true); void window.moguri.preview(null, sdk.profileId).catch(() => console.error("Native preview cleanup was not acknowledged.")); };
  }, [session.id, session.browserUrl]);
  const navigate = async () => { setError(""); try { await sdk.sessions.browser(session.id, url); } catch (error) { setError(error instanceof Error ? error.message : "Preview URL was not accepted."); } };
  return <section className="browser-panel"><form className="browser-address" onSubmit={(event) => { event.preventDefault(); void navigate(); }}><input aria-label="Preview URL" placeholder="https://... or local preview URL" value={url} onChange={(event) => setUrl(event.target.value)} />
    <button className="icon-button" type="submit" aria-label="Load preview" title="Load preview"><Icon name="Play" /></button><button className="icon-button" type="button" aria-label="Open preview in default browser" title="Open in browser" disabled={!session.browserUrl} onClick={() => void window.moguri.openExternal(session.browserUrl!).catch((error: unknown) => setError(error instanceof Error ? error.message : "Browser could not open."))}><Icon name="Browser" /></button></form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div ref={host} className="browser-host">{!session.browserUrl && <p>Enter a preview URL. This isolated view has no Moguri bridge, account cookies, filesystem access or automatic model context.</p>}</div>
    <p className="terminal-boundary">Isolated web preview. Page data is not sent to the agent.</p>
  </section>;
}
export function SideChat({ sdk, parent, snapshot, selectedId, select, onSlash, editorFor }: {
  sdk: MoguriSdk; parent: Session; snapshot: Snapshot; selectedId: string | null; select: (id: string) => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
  editorFor: (session: Session) => DraftEditor;
}) {
  const sides = snapshot.sessions.filter((session) => session.parentSessionId === parent.id && session.kind === "side" && session.status !== "archived");
  const side = sides.find((session) => session.id === selectedId) ?? sides.at(-1);
  const [error, setError] = useState("");
  return <section className="side-chat-panel"><header className="panel-toolbar"><select aria-label="Question-only side session" value={side?.id ?? ""} onChange={(event) => select(event.target.value)}>{sides.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}{!side && <option value="">Question-only context</option>}</select>
    <button className="icon-button" aria-label="New side chat" title="New question-only side chat" onClick={() => void sdk.sessions.spawn(parent.id, "side").then((result) => select(result.id!)).catch((error: unknown) => setError(error instanceof Error ? error.message : "Side chat could not be created."))}><Icon name="Plus" /></button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {side ? <SideConversation key={side.id} sdk={sdk} session={side} snapshot={snapshot} onSlash={onSlash} editorFor={editorFor} /> : <p className="fine-print">Open a parallel question-only session with a snapshot of this conversation's approved context. It cannot edit code or promote itself.</p>}
  </section>;
}
function SideConversation({ sdk, session, snapshot, onSlash, editorFor }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; editorFor: (session: Session) => DraftEditor }) {
  const editor = useMemo(() => editorFor(session), [editorFor, session.id]);
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [error, setError] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const configurationPending = useRef(false);
  const requiresImages = Boolean(session.inheritedImages) || draft.attachments.some((attachment) => attachment.kind === "image") ||
    session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "image"));
  const models = snapshot.provider.models.filter((model) => !model.synthetic && (!model.environments || model.environments.includes(session.controls.env)) && (!requiresImages || model.imageInput));
  const model = models.find((model) => model.id === session.controls.modelId);
  const held = useQueueModifier();
  const canQueue = Boolean(draft.text.trim()) && !draft.conflict && session.status !== "archived" && !configuring && sdk.getState().status === "connected";
  const canSend = canQueue && !session.turnId && (draft.text.startsWith("/") || Boolean(model));
  useEffect(() => { editor.receive(session.draft); }, [session.draft.revision]);
  const send = (held = false) => {
    setError("");
    void (draft.text.startsWith("/") ? onSlash(session, editor, draft.text) : editor.send("queue", held)).catch((error: unknown) => setError(error instanceof Error ? error.message : "Question was not sent."));
  };
  const chooseModel = async (modelId: string) => {
    if (configurationPending.current) return;
    configurationPending.current = true; setConfiguring(true); setError("");
    try {
      const { modelOptions: _, ...controls } = session.controls;
      await sdk.sessions.configure(session.id, { ...controls, modelId: modelId || null }, session.revision);
    } catch (error) { setError(error instanceof Error ? error.message : "Side-chat model selection was not saved. Your draft is preserved."); }
    finally { configurationPending.current = false; setConfiguring(false); }
  };
  return <><label className="side-model">Model<select aria-label="Side chat model" value={session.controls.modelId ?? ""} disabled={configuring || Boolean(session.turnId)} onChange={(event) => void chooseModel(event.target.value)}>
    <option value="">Select model</option>{session.controls.modelId && !model && <option value={session.controls.modelId} disabled>Unavailable: {session.controls.modelId}</option>}
    {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
    {!model && <p className="fine-print" role="status">{models.length ? "Choose a model for this side chat. Its read-only scope and your draft are preserved." : "No concrete model is available in this environment. Configure or reconnect one in Settings; no provider was substituted."}</p>}
    <div className="side-transcript" role="log" aria-label="Side chat transcript">{session.messages.slice(-40).map((message) => <article key={message.id}><strong>{message.role === "user" ? "You" : "Moguri"}</strong><p>{message.text}</p></article>)}</div>
    {session.pendingApproval && <section className="side-approval" aria-label="Side read approval"><strong>Read access: {session.pendingApproval.call.name}</strong><pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre><div className="button-row">
      {[false, true].map((allow) => <button key={String(allow)} className={allow ? "primary" : ""} onClick={() => void sdk.command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow }).catch((error: unknown) => setError(error instanceof Error ? error.message : "Read approval was not acknowledged."))}>{allow ? "Approve read" : "Deny"}</button>)}</div></section>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {draft.error && <p className="inline-error" role="alert">{draft.error} <button onClick={() => editor.reload()}>Reload draft</button>{draft.conflict && <button onClick={() => void editor.keepMine().catch((error: unknown) => setError(error instanceof Error ? error.message : "Draft could not be saved."))}>Keep mine</button>}</p>}
    <textarea aria-label="Side question" aria-description="Enter sends. Shift+Enter adds a line. Cmd/Ctrl+Enter holds the question without starting work." value={draft.text} onChange={(event) => editor.edit(event.target.value)} placeholder="Ask about the current context..." onKeyDown={(event) => {
      const action = chatSubmission(event);
      if (action && (action === "hold" ? canQueue : canSend)) send(action === "hold");
    }} />
    <div className="side-controls"><span title="Hard read-only policy"><Icon name="ReadOnly" />Question-only</span>{session.turnId ?
      <button className="icon-button composer-stop" aria-label="Stop side question" disabled={session.status === "stopping"} onClick={() => void sdk.command({ type: "session.stop", sessionId: session.id }).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop was not acknowledged."))}><Icon name="Stop" /></button> :
      <button className="primary icon-button" aria-label={held ? "Queue side question" : "Ask"} title={held ? "Queue without starting" : "Ask"} disabled={held ? !canQueue : !canSend} onClick={() => send(held)}><Icon name={held ? "Clock" : "Send"} /></button>}</div>
    {session.queue.length > 0 && <div className="side-queue">{session.queue.map((item) => <button key={item.id} disabled={!item.held} onClick={() => void sdk.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(error instanceof Error ? error.message : "Question could not be released."))}>{item.held ? "Run queued question" : "Queued"}: {item.text.slice(0, 35)}</button>)}</div>}
  </>;
}
