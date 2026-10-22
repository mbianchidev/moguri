import { useEffect, useRef } from "react";
import { useTaskProgress } from "../../../packages/sdk/src/react.ts";
import type { MoguriSdk, Session, TaskProgress } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function TaskProgressBar({ sdk, session, connected, details, open, close }: {
  sdk: MoguriSdk; session: Session; connected: boolean; details: boolean; open: () => void; close: () => void;
}) {
  const { progress, error } = useTaskProgress(sdk, session, connected);
  const checklist = progress?.checklist, model = progress?.longRunning ? progress.model : null;
  return <section className="task-progress" aria-label="Estimated task completion">
    <div className="task-progress-row"><label htmlFor={`plan-progress-${session.id}`}>Plan checklist</label>
      <progress id={`plan-progress-${session.id}`} max={100} value={checklist?.percent ?? undefined} aria-valuetext={checklist?.total ? `${checklist.completed} of ${checklist.total} checklist items checked. Estimate only.` : "No checklist measurement is available."} />
      <span>{checklist?.total ? `${checklist.completed}/${checklist.total} (${checklist.percent}%)` : "Unknown"}</span>
      <small>Estimate only</small><button className="icon-button" type="button" aria-label="Task progress details" title="Task progress details and limitations" onClick={open}><Icon name="Insights" /></button>
    </div>
    {model && <div className="task-progress-row"><label htmlFor={`model-progress-${session.id}`}>Model estimate{model.stale ? " (stale)" : ""}</label><progress id={`model-progress-${session.id}`} max={100} value={model.percent} aria-valuetext={`${model.percent} percent, untrusted model estimate${model.stale ? ", stale" : ""}.`} /><span>{model.percent}%</span></div>}
    {(error || progress?.disagreement) && <p className="task-progress-alert" role="status">{error ? "Plan check unavailable." : "Model estimate differs from the checked plan."} <button className="quiet" type="button" onClick={open}>Inspect details</button></p>}
    {details && <ProgressDetails progress={progress} error={error} close={close} />}
  </section>;
}
function ProgressDetails({ progress, error, close }: { progress: TaskProgress | null; error: string | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="workspace-dialog task-progress-details" aria-label="Task progress details" onClose={close}>
    <header><h2>Estimated task completion</h2><button className="icon-button" type="button" aria-label="Close task progress details" onClick={close}><Icon name="Close" /></button></header>
    <p>Estimate only. Checklist rechecked every 15 seconds; checked items have equal weight. No percentage proves acceptance, quality, permission or successful task completion.</p>
    {error ? <p className="inline-error" role="alert">{error}</p> : <p>{progress?.checklist.diagnostic ?? "Reading the exact bound plan."}</p>}
    {progress?.checklist.path && <p className="fine-print path">{progress.env} / {progress.checklist.path} / {progress.checklist.digest}</p>}
    {progress?.model && <><p><strong>Model advice{progress.model.stale ? " (stale)" : ""}: {progress.model.percent}%</strong></p><p>{progress.model.summary}</p><p className="fine-print">{progress.model.source.modelId} / {progress.model.reportedAt}. Untrusted advice from the owning task, not a user answer.</p></>}
    {progress?.disagreement && <p className="inline-error">Model estimate differs from the checked plan by at least 20 percentage points.</p>}
    {progress?.longRunning && !progress.model && <p>Model estimate not reported yet. No extra inference is started for polling.</p>}
    <footer><button type="button" onClick={close}>Close details</button></footer>
  </dialog>;
}
