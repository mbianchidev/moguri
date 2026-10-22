import { useTaskProgress } from "../../../packages/sdk/src/react.ts";
import type { MoguriSdk, Session } from "../../../packages/sdk/src/index.ts";

export function TaskProgressBar({ sdk, session, connected }: { sdk: MoguriSdk; session: Session; connected: boolean }) {
  const { progress, error } = useTaskProgress(sdk, session, connected);
  const checklist = progress?.checklist, model = progress?.longRunning ? progress.model : null;
  return <section className="task-progress" aria-label="Estimated task completion">
    <div><label htmlFor={`plan-progress-${session.id}`}>Plan checklist</label><span>{checklist?.total ? `${checklist.completed}/${checklist.total} (${checklist.percent}%)` : "Unknown"}</span></div>
    <progress id={`plan-progress-${session.id}`} max={100} value={checklist?.percent ?? undefined} aria-valuetext={checklist?.total ? `${checklist.completed} of ${checklist.total} checklist items checked. Estimate only.` : "No checklist measurement is available."} />
    {model && <><div><label htmlFor={`model-progress-${session.id}`}>Model estimate{model.stale ? " (stale)" : ""}</label><span>{model.percent}%</span></div><progress id={`model-progress-${session.id}`} max={100} value={model.percent} aria-valuetext={`${model.percent} percent, untrusted model estimate${model.stale ? ", stale" : ""}.`} /><p>{model.summary}</p></>}
    <p className="fine-print" role="status">{error ?? (progress?.disagreement ? "Model estimate differs from the checked plan by at least 20 points. " : "") + (checklist?.diagnostic ?? "Estimate only. Checklist rechecked every 15 seconds; checked items have equal weight.")}</p>
    {progress?.longRunning && !model && <p className="fine-print">Model estimate not reported yet. No extra inference is started for polling.</p>}
  </section>;
}
