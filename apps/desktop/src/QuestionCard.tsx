import { useEffect, useRef, useState } from "react";
import type { ModelAdviceSource, MoguriSdk, UserQuestion } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

export function QuestionCard({ sdk, question, decisionPending = false, onDirty }: { sdk: MoguriSdk; question: UserQuestion; decisionPending?: boolean; onDirty?: (dirty: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [other, setOther] = useState(false), [text, setText] = useState("");
  const otherInput = useRef<HTMLTextAreaElement>(null);
  const dirty = Boolean(text);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { if (other) otherInput.current?.focus(); }, [other]);
  useEffect(() => {
    const unsaved = (event: BeforeUnloadEvent) => { if (text && question.status === "open") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unsaved); return () => window.removeEventListener("beforeunload", unsaved);
  }, [text, question.status]);
  const answer = async (value: string, custom = false) => {
    setError(""); setBusy(true);
    try { if (custom) await sdk.questions.answerOther(question.id, value, question.revision); else await sdk.questions.answer(question.id, value, question.revision); setText(""); }
    catch (error) { setError(error instanceof Error ? error.message : "The question changed. Review the actual pending question; no answer was invented."); }
    finally { setBusy(false); }
  };
  return <section className="user-question" aria-label="User question" aria-busy={busy} tabIndex={0}>
    <h2><Icon name="Question" />Your answer is needed</h2>
    {decisionPending && <p className="fine-print" role="status">A separately metered decision provider is evaluating this exact user-delegated technical choice. You can override it now. Your real answer wins; automated advice is never recorded as you.</p>}
    <div className="question-context" role="group" aria-label="Question and model advice" tabIndex={0}><p className="question-text">{question.question}</p>
      {question.recommendation && <ModelAdvice source={question.recommendation} text={question.recommendation.reason} choice={question.recommendation.choice} />}</div>
    <div className="button-row question-choices" role="group" aria-label="Offered answers">{question.choices.filter((choice) => choice !== "Other, please specify").map((choice) => <button key={choice} disabled={busy} onClick={() => void answer(choice)}>{choice}</button>)}
      <button type="button" disabled={busy} aria-expanded={other} aria-controls={`other-answer-${question.id}`} onClick={() => setOther(true)}>Other, please specify</button></div>
    {other && <form id={`other-answer-${question.id}`} className="question-other" onSubmit={(event) => { event.preventDefault(); if (text.trim() && !busy) void answer(text, true); }}>
      <label htmlFor={`other-text-${question.id}`}>Other answer</label><textarea ref={otherInput} id={`other-text-${question.id}`} value={text} maxLength={32768} disabled={busy} onChange={(event) => setText(event.target.value)} />
      <div className="button-row"><button type="button" disabled={busy} onClick={() => { setText(""); setOther(false); }}>Cancel custom answer</button><button type="submit" className="primary" disabled={busy || !text.trim()}>Send answer</button></div>
    </form>}
    <p className="fine-print">{question.allowFreeform ? "Or type your answer and press Enter. Cmd/Ctrl+Enter still queues instead." : "Choose an offered answer or explicitly submit Other. Queuing a prompt does not answer."} Answers are task context, not tool/Git permission. Never enter credentials; use connection settings.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}

export function ModelAdvice({ source, text, choice }: { source: ModelAdviceSource; text: string; choice?: string }) {
  return <div className="model-advice" role="note" aria-label="Model advice">
    <p><strong>{choice ? `Model recommends: ${choice}` : "Current solver recommendation"}</strong></p>
    <p>{text}</p>
    <p className="fine-print">From {source.modelId}. Untrusted model advice, not a user answer or permission. You still decide.</p>
  </div>;
}
