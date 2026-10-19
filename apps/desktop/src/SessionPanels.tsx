import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DraftEditor, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { useQueueModifier } from "./ChatComposer.tsx";

export function ChangesPanel({ sdk, session }: { sdk: MoguriSdk; session: Session }) {
  const [data, setData] = useState<{ branch: string; status: string; diff: string } | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    if (!session.projectId) { setError("Select a project to inspect file changes."); return; }
    try { setData(await sdk.projects.git(session.projectId)); }
    catch (error) { setError(error instanceof Error ? error.message : "Git status could not be read."); }
  };
  useEffect(() => { void load(); }, [session.id, session.turnId]);
  return <section className="changes-panel"><header className="panel-toolbar"><strong>{data?.branch ?? "File changes"}</strong><button className="icon-button" title="Refresh diff" aria-label="Refresh diff" onClick={() => void load()}><Icon name="Down" /></button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {data && <><pre className="git-status">{data.status || "Working tree is clean."}</pre><pre className="unified-diff">{data.diff || (data.status ? "No tracked diff. Untracked files are listed above." : "No changes.")}</pre></>}
  </section>;
}
export function PlanPanel({ sdk, session, onDirty }: { sdk: MoguriSdk; session: Session; onDirty: (dirty: boolean) => void }) {
  const [plan, setPlan] = useState<{ text: string; digest: string; path: string } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = plan !== null && text !== plan.text;
  useEffect(() => { onDirty(dirty || saving); return () => onDirty(false); }, [dirty, saving, onDirty]);
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [dirty, saving]);
  const load = async () => { setError(""); try { const result = await sdk.plans.read(session.id); setPlan(result); setText(result.text); } catch (error) { setError(error instanceof Error ? error.message : "Plan could not be read."); } };
  useEffect(() => { void load(); }, [session.id]);
  const readOnly = session.mode !== "agent" || session.pendingMode === "read-only" || session.kind === "side" || session.status === "archived";
  return <section className="plan-panel"><header className="panel-toolbar"><strong title={plan?.path}>{plan?.path ?? "Plan"}</strong><button className="icon-button" aria-label="Reload plan" title="Reload plan, discarding local edits" disabled={saving} onClick={() => void load()}><Icon name="Down" /></button>
    <button className="primary" disabled={!dirty || saving || readOnly} onClick={() => {
      if (!plan) return;
      setSaving(true); setError("");
      void sdk.plans.save(session.id, text, plan.digest).then(() => load()).catch((error: unknown) => setError(error instanceof Error ? error.message : "The plan was not saved; your edit was preserved.")).finally(() => setSaving(false));
    }}>Save</button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {readOnly && <p className="fine-print">Question-only session. Plan editing is disabled.</p>}
    <textarea aria-label="Project plan" spellCheck={false} value={text} disabled={!plan || readOnly || saving} onChange={(event) => setText(event.target.value)} placeholder="No plan yet. Write one here to create it explicitly." />
    <p className="fine-print">{saving ? "Saving..." : dirty ? "Unsaved edit" : "Saved snapshots survive session deletion."}</p>
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
        if (bounds.width > 1 && bounds.height > 1) await window.moguri.preview({ sessionId: session.id, url: session.browserUrl, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } });
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Preview could not load. No page content was sent to the agent."); }
      finally { running = false; }
    };
    const observer = new ResizeObserver(() => void update());
    if (host.current) observer.observe(host.current);
    window.addEventListener("scroll", update, true);
    void update();
    return () => { disposed = true; observer.disconnect(); window.removeEventListener("scroll", update, true); void window.moguri.preview(null).catch(() => console.error("Native preview cleanup was not acknowledged.")); };
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
    {side ? <SideConversation key={side.id} sdk={sdk} session={side} onSlash={onSlash} editorFor={editorFor} /> : <p className="fine-print">Open a parallel question-only session with a snapshot of this conversation's approved context. It cannot edit code or promote itself.</p>}
  </section>;
}
function SideConversation({ sdk, session, onSlash, editorFor }: { sdk: MoguriSdk; session: Session; onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>; editorFor: (session: Session) => DraftEditor }) {
  const editor = useMemo(() => editorFor(session), [editorFor, session.id]);
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [error, setError] = useState("");
  const held = useQueueModifier();
  useEffect(() => { editor.receive(session.draft); }, [session.draft.revision]);
  const send = (held = false) => {
    setError("");
    void (draft.text.startsWith("/") ? onSlash(session, editor, draft.text) : editor.send("queue", held)).catch((error: unknown) => setError(error instanceof Error ? error.message : "Question was not sent."));
  };
  return <><div className="side-transcript" role="log" aria-label="Side chat transcript">{session.messages.slice(-40).map((message) => <article key={message.id}><strong>{message.role === "user" ? "You" : "Moguri"}</strong><p>{message.text}</p></article>)}</div>
    {session.pendingApproval && <section className="side-approval" aria-label="Side read approval"><strong>Read access: {session.pendingApproval.call.name}</strong><pre>{JSON.stringify(session.pendingApproval.call.arguments, null, 2)}</pre><div className="button-row">
      {[false, true].map((allow) => <button key={String(allow)} className={allow ? "primary" : ""} onClick={() => void sdk.command({ type: "approval.respond", sessionId: session.id, approvalId: session.pendingApproval!.id, allow }).catch((error: unknown) => setError(error instanceof Error ? error.message : "Read approval was not acknowledged."))}>{allow ? "Approve read" : "Deny"}</button>)}</div></section>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {draft.error && <p className="inline-error" role="alert">{draft.error} <button onClick={() => editor.reload()}>Reload draft</button>{draft.conflict && <button onClick={() => void editor.keepMine().catch((error: unknown) => setError(error instanceof Error ? error.message : "Draft could not be saved."))}>Keep mine</button>}</p>}
    <textarea aria-label="Side question" value={draft.text} onChange={(event) => editor.edit(event.target.value)} placeholder="Ask about the current context..." onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(!event.shiftKey); } }} />
    <div className="side-controls"><span title="Hard read-only policy"><Icon name="ReadOnly" />Question-only</span><button className="primary icon-button" aria-label={held ? "Queue side question" : "Ask"} title={held ? "Queue without starting" : "Ask"} disabled={!draft.text.trim() || !held && Boolean(session.turnId)} onClick={() => send(held)}><Icon name={held ? "Clock" : "Send"} /></button>
      {session.turnId && <button className="icon-button" aria-label="Stop side question" onClick={() => void sdk.command({ type: "session.stop", sessionId: session.id }).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop was not acknowledged."))}><Icon name="Stop" /></button>}</div>
    {session.queue.length > 0 && <div className="side-queue">{session.queue.map((item) => <button key={item.id} disabled={!item.held} onClick={() => void sdk.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(error instanceof Error ? error.message : "Question could not be released."))}>{item.held ? "Run queued question" : "Queued"}: {item.text.slice(0, 35)}</button>)}</div>}
  </>;
}
