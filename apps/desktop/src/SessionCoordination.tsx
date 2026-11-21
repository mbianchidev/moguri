import { useEffect, useRef, useState } from "react";
import type { CoordinationRead, CoordinationResponse, MoguriSdk, Session, Snapshot, SessionContextInput, SessionWaitPreview } from "../../../packages/sdk/src/index.ts";
import { envLabel } from "../../../packages/sdk/src/index.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { Alert } from "./Alert.tsx";

type Review = Extract<CoordinationResponse, { type: "coordination.preview" }>;
export function SessionCoordinationPanel({ sdk, session, snapshot, onDirty }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onDirty?: (dirty: boolean) => void }) {
  const links = snapshot.coordinationLinks.filter((link) => link.parentId === session.id || link.childId === session.id);
  const peers = snapshot.sessions.filter((peer) => peer.id !== session.id);
  const [selected, setSelected] = useState(""), [text, setText] = useState(""), [busy, setBusy] = useState(false), [questionDirty, setQuestionDirty] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const target = peers.find((peer) => peer.id === selected) ?? peers.find((peer) => links.some((link) => link.parentId === peer.id || link.childId === peer.id));
  const key = JSON.stringify([sdk.profileId, session.id, target?.id]);
  const [waitReview, setWaitReview] = useState<{ key: string; preview: SessionWaitPreview } | null>(null);
  const [result, setResult] = useState<{ key: string; data: CoordinationRead } | null>(null), [review, setReview] = useState<{ key: string; value: Review } | null>(null);
  const current = useRef(key), pending = useRef(false); current.current = key;
  const data = result?.key === key ? result.data : null, grant = review?.key === key ? review.value : null;
  const actual = target ? snapshot.sessions.find((peer) => peer.id === target.id) : undefined;
  const parent = Boolean(target && target.createdParentSessionId === session.id);
  const writable = session.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only";
  const dirty = Boolean(text) || questionDirty || busy;
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", close); return () => window.removeEventListener("beforeunload", close);
  }, [dirty]);
  useEffect(() => { setError(""); setStatus(""); setReview(null); setWaitReview(null); }, [key]);
  const perform = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setStatus("");
    const captured = key;
    try { await operation(); }
    catch (error) {
      const message = error instanceof Error ? error.message : "The original session operation was not acknowledged.";
      if (current.current === captured) setError(message); else console.error("Original coordination operation:", message);
    } finally { pending.current = false; setBusy(false); }
  };
  const read = async (input: SessionContextInput) => {
    const captured = key, value = await sdk.coordination.read(session.id, input);
    if (current.current === captured) setResult({ key: captured, data: value.data });
  };
  const send = async (dispatch: boolean) => {
    if (!target || !text.trim()) return;
    const captured = key, originalText = text;
    if (dispatch) await sdk.coordination.control(session.id, { action: "dispatch", targetSessionId: target.id, text: originalText });
    else await sdk.coordination.message(session.id, target.id, originalText);
    if (current.current === captured) { setText(""); setStatus(dispatch ? "Task retained for the child under its existing controls. Admission is not success." : "Advisory message retained. No target draft, answer, permission or paid reply was created."); }
  };
  const inspection = data?.action === "inspect" ? data : null;
  const question = inspection?.question && actual?.pendingQuestionId === inspection.question.id ? snapshot.questions.find((question) => question.id === inspection.question?.id && question.status === "open") : undefined;
  const approval = inspection?.approval && actual?.pendingApproval?.id === inspection.approval.id ? actual.pendingApproval : null;
  return <details className="coordination-panel"><summary aria-description="Review session messages, context grants and task dependencies">Session coordination</summary>
    <p className="fine-print">Live access uses the original root-bound grant, not sidebar nesting. Side chats remain read-only. Messages retain the actual sender and do not start a paid reply.</p>
    <div className="button-row">
      <label>Coordination target<select aria-label="Coordination target" value={target?.id ?? ""} disabled={dirty || !peers.length} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Choose an exact session</option>{peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.title} / {peer.id} / {peer.status}</option>)}</select></label>
      {writable && <button type="button" disabled={dirty} onClick={() => void perform(async () => { const created = await sdk.sessions.spawn(session.id, "agent"); if (created.id) setSelected(created.id); setStatus("Agent child created with Manual autonomy. No task was started."); })}>New agent child</button>}
    </div>
    {target && <>
      <div className="button-row">
        <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: "inspect", targetSessionId: target.id }))}>Inspect session</button>
        <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: "transcript", targetSessionId: target.id }))}>Read public transcript</button>
        <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: "inbox" }))}>Read inbox</button>
        {session.createdParentSessionId && <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: "snapshot" }))}>Read captured main context</button>}
        <button type="button" disabled={busy} onClick={() => void perform(async () => { const captured = key, value = await sdk.coordination.preview(session.id, target.id); if (current.current === captured) setReview({ key: captured, value }); })}>Review coordination grant</button>
        <button type="button" disabled={busy || Boolean(session.turnId) || !target.turnId && !target.queue.length} onClick={() => void perform(async () => {
          const captured = key, value = await sdk.sessions.waitPreview(session.id, target.id); if (current.current === captured) setWaitReview({ key: captured, preview: value.preview });
        })}>Review wait for session</button>
      </div>
      {grant && <section aria-label="Coordination grant review"><p>Exact captured profile, environment and roots:</p><pre tabIndex={0}>{JSON.stringify({ parent: grant.parentBinding, child: grant.childBinding }, null, 2)}</pre>
        {grant.kind === "peer" && <p>This grants only reviewed public context and advisory messages, not dispatch, stop, answers, permissions or filesystem access.</p>}
        <button type="button" disabled={busy} onClick={() => void perform(async () => {
          await sdk.coordination.grant(session.id, target.id, grant.digest, !grant.link?.enabled, true); setReview(null); setStatus(grant.link?.enabled ? "Coordination revoked. Existing messages remain retained." : "Coordination granted to these exact reviewed roots.");
        })}>{grant.link?.enabled ? "Revoke coordination" : "Grant reviewed coordination"}</button></section>}
      {waitReview?.key === key && <section aria-label="Session dependency review"><p>Wait for this exact {waitReview.preview.task.kind}: <code>{waitReview.preview.task.id}</code> in <code>{waitReview.preview.targetSessionId}</code>.</p>
        <p>Only successful completion releases this dependency. Failure, removal or changed ownership stays paused. Held prompts still need explicit release.</p>
        <button type="button" disabled={busy} onClick={() => void perform(async () => { await sdk.sessions.waitFor(waitReview.preview, true); setWaitReview(null); setStatus("Dependency retained for the exact captured task. No work was started."); })}>Wait for this task to succeed</button></section>}
      {inspection && <section aria-label="Coordinated session state"><p><strong>{inspection.title}</strong>: {inspection.status} / {inspection.mode} / {envLabel(inspection.env)}. {inspection.queued} queued.</p>
        {inspection.lastError && <Alert as="p" className="inline-error" role="alert">{inspection.lastError}</Alert>}
        {inspection.plan && <><strong>{inspection.plan.title}</strong><ol>{inspection.plan.steps.map((step, index) => <li key={index}>{step.status}: {step.text}</li>)}</ol><p className="fine-print">Model-authored progress, not task acceptance or permission.</p></>}
        {question && <QuestionCard key={question.id} sdk={sdk} question={question} onDirty={setQuestionDirty} />}
        {approval && <section aria-label="Coordinated child approval"><strong>Original child approval: {approval.call.name}</strong><pre tabIndex={0}>{JSON.stringify(approval.call.arguments, null, 2)}</pre><div className="button-row">
          {[false, true].map((allow) => <button key={String(allow)} type="button" disabled={busy} onClick={() => void perform(async () => {
            await sdk.command({ type: "approval.respond", sessionId: target.id, approvalId: approval.id, allow }); setResult(null); setStatus("Your actual decision was sent to the original child approval.");
          })}>{allow ? "Approve child operation" : "Deny child operation"}</button>)}</div></section>}
      </section>}
      {data && (data.action === "transcript" || data.action === "snapshot") && <section aria-label="Coordinated public context"><pre tabIndex={0}>{data.text}</pre>
        <p className="fine-print">Public session data only; no private consoles or hidden reasoning.</p>
        {data.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: data.action, targetSessionId: target.id, offset: data.nextOffset!, expectedDigest: data.digest }))}>Next context page</button>}</section>}
      {data?.action === "inbox" && <section aria-label="Session coordination inbox">{data.messages.map((message) => <article key={message.id}><strong>{message.kind} / {message.origin.actor} / {message.fromSessionId}</strong><p>{message.text}</p>{message.deliveryDiagnostic && <Alert as="p" className="inline-error" role="alert">{message.deliveryDiagnostic}</Alert>}</article>)}
        {data.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void perform(() => read({ action: "inbox", offset: data.nextOffset! }))}>Earlier inbox page</button>}</section>}
      <label>Message to {target.title}<textarea aria-label="Coordination message" value={text} maxLength={8000} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
      <div className="button-row">
        <button type="button" disabled={busy || !text.trim()} onClick={() => void perform(() => send(false))}>Send advisory</button>
        {parent && writable && target.kind === "agent" && target.coordinationParentId === session.id && <button type="button" disabled={busy || !text.trim()} onClick={() => void perform(() => send(true))}>Dispatch child task</button>}
        {text && <button type="button" className="quiet" disabled={busy} onClick={() => setText("")}>Discard message</button>}
        {parent && <button type="button" disabled={busy || !target.turnId && !target.queue.length} onClick={() => void perform(async () => { await sdk.coordination.control(session.id, { action: "stop", targetSessionId: target.id, expectedTurnId: target.turnId }); setStatus("Stop requested for the observed child turn. Inspect the actual acknowledged/partial result."); })}>Stop child work</button>}
      </div>
      <p className="fine-print">Dispatch queues metered child work under its existing model, budget, environment and approvals. It never answers a question, approves an operation or changes autonomy.</p>
    </>}
    {session.wait && <section aria-label="Current session dependency"><p>Dependency: {session.wait.status} / <code>{session.wait.targetSessionId}</code> / {session.wait.task.kind} <code>{session.wait.task.id}</code></p>
      {session.wait.diagnostic && <Alert as="p" role="status">{session.wait.diagnostic}</Alert>}
      {["waiting", "blocked"].includes(session.wait.status) && <button type="button" disabled={busy} onClick={() => void perform(async () => {
        await sdk.sessions.cancelWait(session.id, session.wait!.id, session.wait!.revision); setStatus("Dependency removed. Held prompts and current admission gates are unchanged.");
      })}>Remove this dependency</button>}
    </section>}
    {busy && <p role="status">Waiting for the original session operation...</p>}{status && <Alert as="p" role="status">{status}</Alert>}{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </details>;
}
