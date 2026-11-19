import { useState } from "react";
import {
  CI_RETRY_LIMITS, CI_RETRY_STATUS_LABELS, CI_RETRY_TERMINAL, CONFLICT_RESOLUTION_STATUS_LABELS, DEFAULT_PR_AUTOMATION, effectivePrAutomation, PR_AUTOMATION_FLAGS,
  PR_AUTOMATION_LABELS, prAutomationExceptions, prAutomationSourceLabel, type CiRetryRecord, type ConflictResolutionRecord, type MoguriSdk, type PrAutomationFlag,
  type PrAutomationOverride, type PrAutomationSettings, type ProjectSettings, type Session, type Snapshot,
} from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

const DESCRIPTIONS: Record<PrAutomationFlag, string> = {
  ciRetry: `Reruns a failed GitHub Actions job, at most ${CI_RETRY_LIMITS.attempts} times per check and head with backoff, only when GitHub Status is healthy and the job's log points to a transient cause such as an HTTP 5xx or a network error. Test, build, type and lint failures are never rerun. Needs your signed-in GitHub CLI account.`,
  conflictResolution: "When GitHub reports that the PR conflicts with its base, Moguri queues a turn that merges the base and keeps both sides' features, then validates with tests. If both can't be kept, it aborts the merge and asks you.",
};

/** Global defaults and the list of repositories that override them (Settings / GitHub workflows). */
export function PrAutomationDefaults({ values, snapshot, disabled, onChange, openProject }: {
  values: PrAutomationSettings | undefined; snapshot: Snapshot; disabled: boolean;
  onChange: (patch: Partial<PrAutomationSettings>) => void; openProject: (projectId: string) => void;
}) {
  const defaults = values ?? DEFAULT_PR_AUTOMATION;
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
  const exceptions = prAutomationExceptions({ prAutomation: defaults }, snapshot.projectConfigurations, new Set(projects.keys()));
  return <section aria-label="Pull request automation">
    <SettingsHelp label="About pull request automation" target={<h3>Pull request automation</h3>}>Both start off. Each repository can override either one in its Project settings. Neither lets Moguri merge, force-push, rebase shared history or sign in for you.</SettingsHelp>
    {PR_AUTOMATION_FLAGS.map((flag) => <div key={flag}>
      <label className="check-setting"><SettingsInput type="checkbox" role="switch" checked={defaults[flag]} disabled={disabled}
        onChange={(event) => onChange({ [flag]: event.target.checked })} />{PR_AUTOMATION_LABELS[flag]}</label>
      <p className="fine-print">{DESCRIPTIONS[flag]}</p>
    </div>)}
    <h4>Repository exceptions</h4>
    {exceptions.length ? <ul className="automation-exceptions" aria-label="Repository exceptions">{exceptions.map((exception) => <li key={`${exception.projectId}:${exception.flag}`}>
      <span><strong>{projects.get(exception.projectId)?.name ?? exception.projectId}</strong>: {PR_AUTOMATION_LABELS[exception.flag]} {exception.value ? "on" : "off"}
        {exception.value === exception.global ? " (same as the default, kept as an override)" : ` (default is ${exception.global ? "on" : "off"})`}</span>
      <button type="button" disabled={disabled} aria-label={`Open ${projects.get(exception.projectId)?.name ?? "repository"} settings`} onClick={() => openProject(exception.projectId)}>Open settings</button>
    </li>)}</ul> : <p className="fine-print">No repository overrides these defaults.</p>}
  </section>;
}

/** Per-repository inherit/on/off choices with the effective value and where it comes from (Project settings). */
export function PrAutomationOverrides({ values, snapshot, onChange }: {
  values: ProjectSettings; snapshot: Snapshot; onChange: (flag: PrAutomationFlag, choice: "inherit" | PrAutomationOverride) => void;
}) {
  const effective = effectivePrAutomation(snapshot.settings.values, values);
  return <>{PR_AUTOMATION_FLAGS.map((flag) => <label className="setting-field" key={flag}>{PR_AUTOMATION_LABELS[flag]}
    <select aria-label={PR_AUTOMATION_LABELS[flag]} value={values.repo[flag] ?? "inherit"}
      onChange={(event) => onChange(flag, event.target.value === "enabled" || event.target.value === "disabled" ? event.target.value : "inherit")}>
      <option value="inherit">Use the global default ({effective[flag].global ? "on" : "off"})</option>
      <option value="enabled">On for this repository</option><option value="disabled">Off for this repository</option>
    </select>
    <span className="fine-print" role="status">Now: {prAutomationSourceLabel(effective[flag])}</span>
  </label>)}</>;
}

const time = (value: string | null) => value ? new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "unknown";
function CiRetryCard({ value, busy, cancel }: { value: CiRetryRecord; busy: boolean; cancel: () => void }) {
  const attempts = value.attempts.length;
  return <article className="pr-observation" aria-label={`CI retry for ${value.check.name}`}>
    <header><strong>{value.check.name}</strong><span>{CI_RETRY_STATUS_LABELS[value.status]}</span></header>
    <p className="fine-print">Head {value.binding.headSha.slice(0, 7)} / @{value.binding.account.login} / {attempts} of {CI_RETRY_LIMITS.attempts} reruns used
      {value.status === "scheduled" && value.notBefore ? ` / next not before ${time(value.notBefore)}` : ""}</p>
    {value.classification && <p className="fine-print">Why: {value.classification.reason}</p>}
    {value.classification?.evidence.map((line) => <pre key={line} className="pr-comment-body">{line}</pre>)}
    {value.health && <p className="fine-print">GitHub Status at {time(value.health.observedAt)}: {value.health.state}{value.health.diagnostic ? `. ${value.health.diagnostic}` : ""}</p>}
    {value.health?.incidents.map((incident) => <p className="fine-print" key={incident.id}>Incident: {incident.name} ({incident.components.join(", ") || "GitHub"}, {incident.status}, since {time(incident.startedAt)})
      {incident.url && <> <button type="button" className="quiet" onClick={() => void window.moguri.openExternal(incident.url!)}>Open incident</button></>}</p>)}
    {value.attempts.length > 0 && <ol className="fine-print" aria-label="Rerun attempts">{value.attempts.map((attempt) => <li key={attempt.attempt}>
      Rerun {attempt.attempt} of job {attempt.jobId}: {attempt.status}{attempt.result ? `, result ${attempt.result.replaceAll("_", " ")}` : attempt.status === "requested" ? ", waiting for GitHub" : ""}
      {attempt.diagnostic ? `. ${attempt.diagnostic}` : ""}</li>)}</ol>}
    {value.diagnostic && <p className="fine-print">{value.diagnostic}</p>}
    {!CI_RETRY_TERMINAL.has(value.status) && <button type="button" disabled={busy} onClick={cancel}>Cancel automatic retry</button>}
  </article>;
}
function ConflictCard({ value }: { value: ConflictResolutionRecord }) {
  const verification = value.verification;
  return <article className="pr-observation" aria-label={`Conflict resolution with ${value.binding.baseRef}`}>
    <header><strong>Conflict with {value.binding.baseRef}</strong><span>{CONFLICT_RESOLUTION_STATUS_LABELS[value.status]}</span></header>
    <p className="fine-print">Head {value.binding.headSha.slice(0, 7)}, base {value.binding.baseSha.slice(0, 7)}{value.turnOutcome ? `, turn ${value.turnOutcome}` : ""}.</p>
    {value.diagnostic && <p className="fine-print">{value.diagnostic}</p>}
    {verification && verification.conflicted.length > 0 && <p className="fine-print">Conflicted files: {verification.conflicted.join(", ")}</p>}
  </article>;
}
/** What Fix broken CI and conflict resolution did for this session's PR, with cancellation for pending retries. */
export function PrAutomationPanel({ sdk, session, snapshot, url }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; url: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const configuration = session.projectId ? snapshot.projectConfigurations.find((value) => value.projectId === session.projectId)?.values ?? null : null;
  const effective = configuration ? effectivePrAutomation(snapshot.settings.values, configuration) : null;
  const records = (snapshot.prAutomation ?? []).filter((value) => value.sessionId === session.id && value.binding.url === url).reverse();
  if (!effective || !records.length && !effective.ciRetry.value && !effective.conflictResolution.value) return null;
  const cancel = async (value: CiRetryRecord) => {
    setBusy(true); setError("");
    try { await sdk.prAutomation.cancel(value.id, value.revision); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The retry wasn't cancelled. Its current state is shown."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Pull request automation status">
    <header className="panel-toolbar"><strong>Automation</strong></header>
    <p className="fine-print">{PR_AUTOMATION_FLAGS.map((flag) => `${PR_AUTOMATION_LABELS[flag]}: ${prAutomationSourceLabel(effective[flag])}`).join(". ")}.</p>
    {records.length ? records.map((value) => value.kind === "ci-retry" ? <CiRetryCard key={value.id} value={value} busy={busy} cancel={() => void cancel(value)} /> :
      <ConflictCard key={value.id} value={value} />) : <p className="fine-print">Nothing has run for this pull request yet.</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
