import { SettingsHelp } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { envLabel, activeDecision, type DecisionResponse, type MoguriSdk, type Session, type Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

type Status = Extract<DecisionResponse, { type: "decisions.status" }>;
type Read = Extract<DecisionResponse, { type: "decisions.read" }>;
export function useDecisionStatus(sdk: MoguriSdk, session: Session | undefined, snapshot: Snapshot, enabled = true) {
  const key = JSON.stringify([sdk.profileId, session?.id, session?.controls.env, session?.controls.budget, snapshot.settings.revision, snapshot.policy.revision,
    snapshot.budgetPolicy.revision, snapshot.globalBudgetPolicy?.revision, snapshot.provider.models,
    snapshot.budgetEntries.filter((entry) => entry.outputLimitViolation).map((entry) => entry.id)]);
  const [value, setValue] = useState<{ key: string; status: Status | null; error: string } | null>(null);
  useEffect(() => {
    let current = true;
    if (enabled && session) void sdk.decisions.status(session.id).then((status) => { if (current) setValue({ key, status, error: "" }); })
      .catch((error: unknown) => { if (current) setValue({ key, status: null, error: error instanceof Error ? error.message : "Couldn't check the decision provider, so Autopilot is unavailable." }); });
    return () => { current = false; };
  }, [sdk, key, enabled]);
  const result = value?.key === key ? value : null;
  return { status: result?.status ?? null, error: result?.error ?? "", ready: Boolean(result?.status?.ready),
    reason: result?.error || result?.status?.reason || (session ? "Checking the decision provider..." : "Choose a chat to check Autopilot readiness.") };
}
export function DecisionPanel({ sdk, snapshot, session, selection }: { sdk: MoguriSdk; snapshot: Snapshot; session?: Session; selection?: string }) {
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<Read | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const generation = useRef(0), pending = useRef(false), heading = useRef<HTMLHeadingElement>(null), focusResult = useRef(false);
  const records = [...snapshot.decisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const record = records.find((record) => record.id === (selection ?? selectedId)) ??
    (selection || selectedId ? undefined : records.find((record) => record.sessionId === session?.id) ?? records[0]);
  const value = record && read?.decision.id === record.id && read.decision.revision === record.revision ? read : null;
  const scope = JSON.stringify([sdk.profileId, record?.id, record?.revision]), owner = JSON.stringify([sdk.profileId, record?.id]), current = useRef(owner); current.current = owner;
  useEffect(() => {
    const token = ++generation.current; setError("");
    if (!record) { setRead(null); return; }
    void sdk.decisions.read(record.id).then((result) => { if (generation.current === token) setRead(result); })
      .catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "Couldn't read this decision."); });
    return () => { generation.current++; };
  }, [sdk, scope]);
  useEffect(() => {
    if (record && focusResult.current && !activeDecision(record)) { focusResult.current = false; heading.current?.focus(); }
  }, [record?.status]);
  const charge = record?.stepId ? snapshot.budgetEntries.find((entry) => entry.id === record.stepId) : undefined;
  const stop = async () => {
    if (!record || pending.current) return;
    const captured = owner; pending.current = true; setBusy(true); setError(""); focusResult.current = true;
    try { await sdk.decisions.stop(record.id); }
    catch (error) { if (current.current === captured) setError(error instanceof Error ? error.message : "Stop wasn't confirmed. Nothing was retried."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="candidate-section" aria-label="Decision-provider observations" aria-busy={busy}>
    <SettingsHelp label="More about this setting" target={<h3>Decision-provider history</h3>}>Lists each call Autopilot made to its decision provider. The model's advice can't grant permissions, approve changes or answer for you.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <label className="setting-field">Decision<select aria-label="Retained decision" value={record?.id ?? ""} disabled={busy || Boolean(selection)} onChange={(event) => setSelectedId(event.target.value)}>
      {!records.length && <option value="">No decisions yet</option>}
      {records.map((record) => <option key={record.id} value={record.id}>{record.kind} / {record.status} / {record.modelId}</option>)}
    </select></label>
    {record && <>
      <h4 ref={heading} tabIndex={-1}>Decision {record.status}</h4>
      <dl className="facts"><dt>Role / model</dt><dd>{record.role} / {record.modelId}</dd>
        <dt>Env</dt><dd>{envLabel(record.env)}</dd>
        {record.version === 2 && <><dt>Run / worker</dt><dd className="path">{record.transport.executionId} / {record.transport.workerDigest}</dd></>}
        <dt>Provider / API model</dt><dd>{record.providerId} / {record.apiModelId}</dd>
        <dt>Chat / turn</dt><dd className="path">{record.sessionId} / {record.turnId}</dd>
        <dt>Request / model step</dt><dd className="path">{record.sourceDigest} / {record.stepId ?? "Not started"}</dd>
        <dt>Outcome / cancellation / cleanup</dt><dd>{record.workerOutcome ?? "No reply"} / {record.cancellation} / {record.cleanup}</dd>
        <dt>Reported tokens</dt><dd>{charge?.reportedTokens ?? (record.stepId ? "Unknown (still held)" : "No model call")}</dd>
        <dt>Held tokens</dt><dd>{charge && charge.status !== "settled" ? charge.reservedTokens ?? "Unknown (blocks capped budgets)" : 0}</dd>
        <dt>Provider / billed USD</dt><dd>Not reported</dd>
        <dt>Applied by / choice</dt><dd>{record.applied ? `${record.applied.actor} / ${record.applied.choice}` : "Not applied"}</dd></dl>
      {!snapshot.sessions.some((session) => session.id === record.sessionId) && <p className="fine-print">The chat that made this decision was deleted.</p>}
      {record.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{record.diagnostic}</Alert>}
      {value && <details><summary>Request and raw result</summary><pre>{JSON.stringify(value.input, null, 2)}</pre>
        <pre>{value.result ?? "No complete result received."}</pre><p className="fine-print">Raw provider output. Confidence values aren't calibrated.</p></details>}
      {activeDecision(record) && <button type="button" disabled={busy} onClick={() => void stop()} aria-label="Stop only this decision">Stop</button>}
    </>}
  </section>;
}
