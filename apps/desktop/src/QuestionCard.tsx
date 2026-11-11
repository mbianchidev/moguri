import { useEffect, useRef, useState } from "react";
import type { ModelAdviceSource, MoguriSdk, UserQuestion } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

export function QuestionCard({ sdk, question, decisionPending = false, onDirty }: { sdk: MoguriSdk; question: UserQuestion; decisionPending?: boolean; onDirty?: (dirty: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [text, setText] = useState("");
  const pending = useRef(false);
  const choices = question.choices.filter((choice) => !["other", "other, please specify"].includes(choice.trim().toLowerCase()));
  const dirty = Boolean(text);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => {
    const unsaved = (event: BeforeUnloadEvent) => { if (text && question.status === "open") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unsaved); return () => window.removeEventListener("beforeunload", unsaved);
  }, [text, question.status]);
  const answer = async (value: string, custom = false) => {
    if (pending.current) return;
    pending.current = true;
    setError(""); setBusy(true);
    try { if (custom) await sdk.questions.answerOther(question.id, value, question.revision); else await sdk.questions.answer(question.id, value, question.revision); setText(""); }
    catch (error) { setError(error instanceof Error ? error.message : "The question changed. Review the actual pending question; no answer was invented."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="user-question" aria-label="User question" aria-busy={busy} tabIndex={0}>
    <h2><Icon name="Question" />Your answer is needed</h2>
    {decisionPending && <p className="fine-print" role="status">A separately metered decision provider is evaluating this exact user-delegated technical choice. You can override it now. Your real answer wins; automated advice is never recorded as you.</p>}
    <div className="question-context" role="group" aria-label="Question and model advice" tabIndex={0}><p className="question-text">{question.question}</p>
      {question.recommendation && <ModelAdvice source={question.recommendation} text={question.recommendation.reason} choice={question.recommendation.choice} />}</div>
    {choices.length > 0 && <ul className="question-choices" aria-label="Offered answers">{choices.map((choice) => <li key={choice}>
      <button type="button" disabled={busy} onClick={() => void answer(choice)}>{choice}</button>
    </li>)}</ul>}
    <form className="question-other" onSubmit={(event) => {
      event.preventDefault(); event.stopPropagation();
      if (text.trim() && !busy) void answer(text, true);
    }}>
      <label htmlFor={`other-text-${question.id}`}>Other<span className="sr-only"> answer</span></label>
      <textarea id={`other-text-${question.id}`} rows={1} value={text} maxLength={32768} readOnly={busy}
        aria-describedby={`other-help-${question.id}`} title="Enter sends Other; Shift+Enter adds a line. Answers are not permissions. Never enter credentials."
        onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229 || event.shiftKey || event.altKey) return;
          event.preventDefault(); event.stopPropagation();
          if (!event.ctrlKey && !event.metaKey) event.currentTarget.form?.requestSubmit();
        }} />
      <button type="submit" className="icon-button" aria-label="Send answer" title="Send answer" disabled={busy || !text.trim()}><Icon name="Send" /></button>
    </form>
    <p id={`other-help-${question.id}`} className="sr-only">Enter sends Other; Shift+Enter adds a line. Answers are not tool or Git permissions. Never enter credentials; use connection settings.</p>
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
