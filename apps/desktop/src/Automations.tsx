import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeAutomationRun, describeAutomationSchedule, describeAutomationStep, outcomeLabel, scheduleLocalChoices, scheduleLocalTime,
  type Automation, type AutomationDefinition, type AutomationRun, type AutomationSchedule, type AutomationStep, type Controls, type MoguriSdk, type Snapshot,
} from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

type Run = (operation: () => Promise<unknown>) => Promise<void>;
type ScheduleKind = AutomationSchedule["kind"];
type InterpreterName = Extract<AutomationStep, { kind: "script" }>["interpreter"];
interface StepDraft { kind: "prompt" | "script"; text: string; path: string; interpreter: InterpreterName; args: string }
const interpreters: InterpreterName[] = ["sh", "bash", "node-module", "node-commonjs", "python3"];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const autonomies: Controls["autonomy"][] = ["Manual", "Guided", "Autopilot", "Autopilot Max"];
const envs: Controls["env"][] = ["Local", "Sandbox", "Remote"];
const when = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const budgetText = (controls: Controls) => controls.budget.kind === "unlimited" ? "unlimited budget" : "limited budget";
const stepDraft = (step?: AutomationStep): StepDraft => step?.kind === "script" ?
  { kind: "script", text: "", path: step.path, interpreter: step.interpreter, args: (step.args ?? []).join("\n") } :
  { kind: "prompt", text: step?.text ?? "", path: "", interpreter: "sh", args: "" };

export function AutomationsPanel({ sdk, snapshot, run, openSession }: { sdk: MoguriSdk; snapshot: Snapshot; run: Run; openSession: (id: string) => void }) {
  const [editing, setEditing] = useState<Automation | "new" | null>(null);
  const automations = [...snapshot.automations].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return <section className="automations-panel" aria-label="Recurring automations">
    <header><Icon name="Clock" /><h2>Recurring automations</h2>
      <button type="button" className="primary" disabled={!snapshot.projects.length} onClick={() => setEditing("new")}>New automation</button></header>
    <p className="fine-print">Each run starts a new chat in its project with the model, Env, autonomy and budget shown below, and never gets extra permissions.
      Moguri must be running: a missed time runs once when Moguri is back, and a time is skipped while the previous run is still active.</p>
    {!snapshot.projects.length && <p>Add a project first. Automations always run in an explicit project.</p>}
    {snapshot.projects.length > 0 && !automations.length && <p>No automations yet.</p>}
    {automations.map((automation) => <AutomationCard key={automation.id} sdk={sdk} snapshot={snapshot} automation={automation} run={run}
      openSession={openSession} edit={() => setEditing(automation)} />)}
    {editing && <AutomationDialog sdk={sdk} snapshot={snapshot} automation={editing === "new" ? null : editing} close={() => setEditing(null)} />}
  </section>;
}

function AutomationCard({ sdk, snapshot, automation, run, openSession, edit }: {
  sdk: MoguriSdk; snapshot: Snapshot; automation: Automation; run: Run; openSession: (id: string) => void; edit: () => void;
}) {
  const [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), pending = useRef(false);
  const runs = snapshot.automationRuns.filter((value) => value.automationId === automation.id).slice(0, 10);
  const active = runs.find(activeAutomationRun), on = automation.status === "active";
  const project = snapshot.projects.find((value) => value.id === automation.projectId);
  const model = snapshot.provider.models.find((value) => value.id === automation.controls.modelId);
  const act = (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    void run(async () => { try { await operation(); } finally { pending.current = false; setBusy(false); } });
  };
  return <article className="automation-card" aria-label={automation.name} data-automation-id={automation.id}>
    <header><h3>{automation.name}</h3>
      <StatusBadge status={on ? { label: "Active", tone: "running" } : { label: "Paused", tone: "neutral" }} />
      <label className="check-setting"><input type="checkbox" role="switch" checked={on} disabled={busy}
        onChange={(event) => act(() => event.target.checked ? sdk.automations.enable(automation.id, automation.revision) : sdk.automations.pause(automation.id, automation.revision))} />On schedule</label>
    </header>
    <dl className="automation-facts">
      <dt>Schedule</dt><dd>{describeAutomationSchedule(automation.schedule)}</dd>
      <dt>Next run</dt><dd>{on ? automation.nextAt ? when(automation.nextAt) : "No upcoming time" : "Paused"}</dd>
      <dt>Project</dt><dd>{project?.name ?? "Removed project"}</dd>
      <dt>Runs with</dt><dd>{automation.controls.env}, {model?.name ?? automation.controls.modelId ?? "no model"}, {automation.controls.autonomy}, {budgetText(automation.controls)}</dd>
    </dl>
    <ol className="automation-steps" aria-label="Steps">{automation.steps.map((step, index) =>
      <li key={index}><strong>{step.kind === "prompt" ? "Prompt" : "Script"}</strong> {describeAutomationStep(step)}</li>)}</ol>
    {automation.diagnostic && <Alert as="p" className="inline-error" role="alert">{automation.diagnostic}</Alert>}
    <div className="automation-actions">
      <button type="button" disabled={busy || Boolean(active)} onClick={() => act(() => sdk.automations.runNow(automation.id, automation.revision))}>Run now</button>
      <button type="button" disabled={busy} onClick={edit}>Edit</button>
      {confirming ? <>
        <span className="fine-print">{active ? "Stop the active run and delete this automation? Its chats are kept." : "Delete this automation? Its chats are kept."}</span>
        <button type="button" className="danger" disabled={busy} onClick={() => act(() => sdk.automations.delete(automation.id, { stopRunning: Boolean(active), expectedRevision: automation.revision }))}>
          {active ? "Stop run and delete" : "Delete"}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </> : <button type="button" className="quiet" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>}
    </div>
    <h4>Recent runs</h4>
    {runs.length ? <ul className="automation-runs" aria-label="Recent runs">{runs.map((value) => <AutomationRunRow key={value.id} sdk={sdk} snapshot={snapshot} value={value} run={run} openSession={openSession} />)}</ul> :
      <p className="fine-print">No runs yet.</p>}
  </article>;
}

function AutomationRunRow({ sdk, snapshot, value, run, openSession }: { sdk: MoguriSdk; snapshot: Snapshot; value: AutomationRun; run: Run; openSession: (id: string) => void }) {
  const chat = value.sessionId ? snapshot.sessions.find((session) => session.id === value.sessionId) : undefined;
  const label = value.status === "skipped" ? { label: "Skipped", tone: "neutral" as const } : value.status === "starting" ? { label: "Starting", tone: "running" as const } : outcomeLabel(value.status);
  return <li data-run-id={value.id}>
    <StatusBadge status={label} />
    <span><time dateTime={value.occurrenceAt}>{when(value.occurrenceAt)}</time> {value.trigger === "manual" ? "Run now" : "Scheduled"}
      {value.missed > 0 && `, ${value.missed} missed`}{activeAutomationRun(value) && value.steps.length > 1 && `, step ${Math.min(value.step + 1, value.steps.length)} of ${value.steps.length}`}</span>
    {value.diagnostic && <p className="scheduled-prompt-diagnostic">{value.diagnostic}</p>}
    <span className="automation-run-actions">
      {chat && <button type="button" className="quiet" onClick={() => openSession(chat.id)}>Open chat</button>}
      {value.sessionId && !chat && <span className="fine-print">Chat deleted</span>}
      {activeAutomationRun(value) && value.sessionId && <button type="button" onClick={() => void run(() => sdk.automations.stopRun(value.id))}>Stop</button>}
    </span>
  </li>;
}

function AutomationDialog({ sdk, snapshot, automation, close }: { sdk: MoguriSdk; snapshot: Snapshot; automation: Automation | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const localZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const schedule = automation?.schedule;
  const [name, setName] = useState(automation?.name ?? "");
  const [projectId, setProjectId] = useState(automation?.projectId ?? snapshot.projects[0]?.id ?? "");
  const [kind, setKind] = useState<ScheduleKind>(schedule?.kind ?? "daily");
  const [timeZone, setTimeZone] = useState(schedule?.timeZone ?? localZone);
  const [once, setOnce] = useState(schedule?.kind === "once" ? schedule.localTime : scheduleLocalTime(Date.now() + 3_600_000, localZone).localTime);
  const [minutes, setMinutes] = useState(String(schedule?.kind === "interval" ? schedule.minutes : 60));
  const [time, setTime] = useState(schedule?.kind === "daily" || schedule?.kind === "weekly" ? schedule.time : "09:00");
  const [days, setDays] = useState<number[]>(schedule?.kind === "weekly" ? schedule.days : [1, 2, 3, 4, 5]);
  const [steps, setSteps] = useState<StepDraft[]>(automation ? automation.steps.map(stepDraft) : [stepDraft()]);
  const [modelId, setModelId] = useState(automation?.controls.modelId ?? "");
  const [env, setEnv] = useState<Controls["env"] | "">(automation?.controls.env ?? "");
  const [autonomy, setAutonomy] = useState<Controls["autonomy"] | "">(automation?.controls.autonomy ?? "");
  const [enabled, setEnabled] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const update = (index: number, changes: Partial<StepDraft>) => setSteps((current) => current.map((step, at) => at === index ? { ...step, ...changes } : step));
  const definition = (): AutomationDefinition => {
    let value: AutomationSchedule;
    if (kind === "once") {
      const [first] = scheduleLocalChoices(once, timeZone);
      value = { kind: "once", at: first!.at, timeZone, localTime: first!.localTime, offsetMinutes: first!.offsetMinutes };
    } else if (kind === "interval") value = { kind: "interval", minutes: Number(minutes), timeZone };
    else if (kind === "daily") value = { kind: "daily", time, timeZone };
    else value = { kind: "weekly", days: [...days].sort((a, b) => a - b), time, timeZone };
    return { name: name.trim(), schedule: value, steps: steps.map((step): AutomationStep => step.kind === "prompt" ? { kind: "prompt", text: step.text } :
      { kind: "script", path: step.path.trim(), interpreter: step.interpreter, ...(step.args.trim() ? { args: step.args.split("\n").filter((line) => line.length) } : {}) }) };
  };
  const save = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const controls = { ...(modelId ? { modelId } : {}), ...(env ? { env } : {}), ...(autonomy ? { autonomy } : {}) };
      if (automation) await sdk.automations.update(automation.id, definition(), controls, automation.revision);
      else await sdk.automations.create(projectId, definition(), { enabled, controls });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The automation was not saved."); }
    finally { pending.current = false; setBusy(false); }
  };
  const title = automation ? "Edit automation" : "New automation";
  return <dialog ref={dialog} className="workspace-dialog automation-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <header><h2>{title}</h2></header>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="setting-field">Name<input value={name} maxLength={120} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label className="setting-field">Project<select value={projectId} disabled={busy || Boolean(automation)} onChange={(event) => setProjectId(event.target.value)}>
        {snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <fieldset className="automation-schedule"><legend>Schedule</legend>
        <label className="setting-field">Repeat<select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as ScheduleKind)}>
          <option value="once">Once</option><option value="interval">Every few minutes or hours</option><option value="daily">Every day</option><option value="weekly">On chosen weekdays</option></select></label>
        {kind === "once" && <label className="setting-field">Local date and time<input type="datetime-local" value={once} disabled={busy} onChange={(event) => setOnce(event.target.value)} /></label>}
        {kind === "interval" && <label className="setting-field">Every (minutes, at least 15)<input type="number" min={15} max={43200} step={1} value={minutes} disabled={busy} onChange={(event) => setMinutes(event.target.value)} /></label>}
        {(kind === "daily" || kind === "weekly") && <label className="setting-field">Time<input type="time" value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} /></label>}
        {kind === "weekly" && <div className="automation-days" role="group" aria-label="Weekdays">{weekdayNames.map((day, index) =>
          <label key={day} className="check-setting"><input type="checkbox" checked={days.includes(index)} disabled={busy}
            onChange={(event) => setDays((current) => event.target.checked ? [...current, index] : current.filter((value) => value !== index))} />{day.slice(0, 3)}</label>)}</div>}
        <label className="setting-field">Timezone<input value={timeZone} disabled={busy} onChange={(event) => setTimeZone(event.target.value)} /></label>
        <p className="fine-print">A time that doesn't exist on a daylight-saving day runs once, shifted forward; a repeated time runs at its first occurrence.</p>
      </fieldset>
      <fieldset className="automation-step-list"><legend>Steps, run in order</legend>
        {steps.map((step, index) => <fieldset key={index} className="automation-step"><legend>Step {index + 1}</legend>
          <label className="setting-field">Type<select value={step.kind} disabled={busy} onChange={(event) => update(index, { kind: event.target.value as StepDraft["kind"] })}>
            <option value="prompt">Prompt</option><option value="script">Trusted repository script (Local, no model call)</option></select></label>
          {step.kind === "prompt" ? <label className="setting-field">Prompt<textarea rows={3} value={step.text} disabled={busy} onChange={(event) => update(index, { text: event.target.value })} /></label> : <>
            <label className="setting-field">Script path<input value={step.path} placeholder="scripts/check.sh" disabled={busy} onChange={(event) => update(index, { path: event.target.value })} /></label>
            <label className="setting-field">Interpreter<select value={step.interpreter} disabled={busy} onChange={(event) => update(index, { interpreter: event.target.value as InterpreterName })}>
              {interpreters.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="setting-field">Arguments, one per line<textarea rows={2} value={step.args} disabled={busy} onChange={(event) => update(index, { args: event.target.value })} /></label>
          </>}
          <div className="automation-step-actions">
            <button type="button" className="quiet" disabled={busy || index === 0} onClick={() => setSteps((current) => current.map((value, at) => at === index - 1 ? current[index]! : at === index ? current[index - 1]! : value))}>Move up</button>
            <button type="button" className="quiet" disabled={busy || steps.length === 1} onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}>Remove step</button>
          </div>
        </fieldset>)}
        <button type="button" disabled={busy || steps.length >= 10} onClick={() => setSteps((current) => [...current, stepDraft()])}>Add step</button>
        <p className="fine-print">Script steps run only exact scripts in this project's repository trust, under normal approval. Approval follows the autonomy below.</p>
      </fieldset>
      <fieldset className="automation-controls"><legend>Runs with</legend>
        <label className="setting-field">Model<select value={modelId} disabled={busy} onChange={(event) => setModelId(event.target.value)}>
          {!automation && <option value="">Project default</option>}
          {snapshot.provider.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        <label className="setting-field">Env<select value={env} disabled={busy} onChange={(event) => setEnv(event.target.value as Controls["env"] | "")}>
          {!automation && <option value="">Project default</option>}{envs.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="setting-field">Autonomy<select value={autonomy} disabled={busy} onChange={(event) => setAutonomy(event.target.value as Controls["autonomy"] | "")}>
          {!automation && <option value="">Project default</option>}{autonomies.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <p className="fine-print">Budget follows the project default and is shown on the automation once saved.</p>
      </fieldset>
      {!automation && <label className="check-setting"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />Turn on now</label>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !name.trim() || !projectId}>{automation ? "Save changes" : "Create automation"}</button></footer>
    </form>
  </dialog>;
}
