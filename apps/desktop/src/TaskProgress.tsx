import { useEffect, useRef, useState } from "react";
import { useTaskProgress } from "../../../packages/sdk/src/react.ts";
import type { MoguriSdk, Session, TaskProgress } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function TaskPlanPanel({ sdk, session, modal }: { sdk: MoguriSdk; session: Session; modal?: (open: boolean) => void }) {
  const turnId = session.turnId ?? session.messages.findLast((message) => message.role === "user")?.turnId;
  const current = session.taskPlan && session.taskPlan.turnId === turnId;
  return <section className="task-plan" aria-label="Model task plan">
    {current ? <ActiveTaskPlan sdk={sdk} session={session} modal={modal} /> :
      <p className="fine-print">No task plan. Moguri creates one explicitly when a change needs multiple steps; simple answers do not create a checklist.</p>}
  </section>;
}
function ActiveTaskPlan({ sdk, session, modal }: { sdk: MoguriSdk; session: Session; modal?: (open: boolean) => void }) {
  const { progress, error } = useTaskProgress(sdk, session, sdk.getState().status === "connected");
  const [details, setDetails] = useState(false);
  useEffect(() => { modal?.(details); return () => modal?.(false); }, [details, modal]);
  if (error) return <p className="inline-error" role="alert">{error}</p>;
  if (!progress) return <p role="status">Reading the owning model's task plan...</p>;
  if (!progress.plan) return <p className="fine-print">No task plan matches the current turn and workspace. Earlier plans were not reused.</p>;
  const checklist = progress.checklist, model = progress.longRunning ? progress.model : null;
  return <><h3>{progress.plan.title}</h3><ol className="task-plan-steps">{progress.plan.steps.map((step, index) =>
    <li key={index} data-status={step.status}><input type="checkbox" checked={step.status === "done"} disabled aria-label={step.text} /><span>{step.text}</span>
      {step.status === "in_progress" && <small>In progress</small>}</li>)}</ol>
    <section className="task-progress" aria-label="Estimated task completion">
      <div className="task-progress-row plan-checklist-progress"><label htmlFor={`plan-progress-${session.id}`}>Plan checklist</label>
        <progress id={`plan-progress-${session.id}`} max={100} value={checklist.percent ?? undefined} aria-valuetext={`${checklist.completed} of ${checklist.total} model plan items checked. Estimate only.`} />
        <span>{checklist.completed}/{checklist.total} ({checklist.percent}%)</span><small>Estimate only</small>
        <button className="icon-button" type="button" aria-label="Task progress details" title="Task progress details and limitations" onClick={() => setDetails(true)}><Icon name="Info" /></button>
      </div>
      {model && <div className="task-progress-row"><label htmlFor={`model-progress-${session.id}`}>Model estimate{model.stale ? " (stale)" : ""}</label><progress id={`model-progress-${session.id}`} max={100} value={model.percent} /><span>{model.percent}%</span></div>}
      {progress.disagreement && <p className="task-progress-alert" role="status">Model estimate differs from the checked plan. <button className="quiet" type="button" onClick={() => setDetails(true)}>Inspect details</button></p>}
    </section>
    <p className="fine-print">Model-reported checklist, not proof of acceptance or successful completion. From {progress.plan.source.modelId}.</p>
    {details && <ProgressDetails progress={progress} close={() => setDetails(false)} />}
  </>;
}
function ProgressDetails({ progress, close }: { progress: TaskProgress; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="workspace-dialog task-progress-details" aria-label="Task progress details" onClose={close}>
    <header><h2>Estimated task completion</h2><button className="icon-button" type="button" aria-label="Close task progress details" onClick={close}><Icon name="Close" /></button></header>
    <p>Estimate only. Checklist rechecked every 15 seconds; checked items have equal weight. No percentage proves acceptance, quality, permission or successful task completion.</p>
    <p>{progress.checklist.diagnostic}</p>
    {progress.plan && <p className="fine-print">Actual plan source: {progress.plan.source.modelId} / {progress.plan.source.stepId} / {progress.plan.source.callId} / revision {progress.plan.revision}.</p>}
    {progress.model && <><p><strong>Model advice{progress.model.stale ? " (stale)" : ""}: {progress.model.percent}%</strong></p><p>{progress.model.summary}</p><p className="fine-print">Untrusted advice from the owning task, not a user answer.</p></>}
    {progress.longRunning && !progress.model && <p>Model estimate not reported yet. No extra inference is started for polling.</p>}
    <footer><button type="button" onClick={close}>Close details</button></footer>
  </dialog>;
}
