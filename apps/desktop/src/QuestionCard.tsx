import { useState } from "react";
import type { ModelAdviceSource, MoguriSdk, UserQuestion } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function QuestionCard({ sdk, question }: { sdk: MoguriSdk; question: UserQuestion }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const answer = async (text: string) => {
    setError(""); setBusy(true);
    try { await sdk.questions.answer(question.id, text, question.revision); }
    catch (error) { setError(error instanceof Error ? error.message : "The question changed. Review the actual pending question; no answer was invented."); }
    finally { setBusy(false); }
  };
  return <section className="user-question" aria-label="User question" aria-busy={busy}>
    <h2><Icon name="Question" />Your answer is needed</h2>
    <div className="question-context" role="group" aria-label="Question and model advice" tabIndex={0}><p className="question-text">{question.question}</p>
      {question.recommendation && <ModelAdvice source={question.recommendation} text={question.recommendation.reason} choice={question.recommendation.choice} />}</div>
    {question.choices.length > 0 && <div className="button-row question-choices" role="group" aria-label="Offered answers">{question.choices.map((choice) => <button key={choice} disabled={busy} onClick={() => void answer(choice)}>{choice}</button>)}</div>}
    <p className="fine-print">{question.allowFreeform ? "Or use the composer's Answer button. Cmd/Ctrl+Enter still queues instead." : "Choose an offered answer. Queuing a prompt does not answer."} Answers are task context, not tool/Git permission. Never enter credentials; use connection settings.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}

export function ModelAdvice({ source, text, choice }: { source: ModelAdviceSource; text: string; choice?: string }) {
  return <div className="model-advice" role="note" aria-label="Model advice">
    <p><strong>{choice ? `Model recommends: ${choice}` : "Current solver recommendation"}</strong></p>
    <p>{text}</p>
    <p className="fine-print">From {source.modelId}. Untrusted model advice, not a user answer or permission. You still decide.</p>
  </div>;
}
