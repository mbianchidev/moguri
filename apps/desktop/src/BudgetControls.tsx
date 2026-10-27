import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { BUDGET_WARNING, KUPO_MODEL_ID, type BudgetLimit, type BudgetStatus, type BudgetTotals, type GlobalBudgetPolicy, type MoguriSdk, type Session, type Snapshot, type WinddownResponse } from "../../../packages/sdk/src/index.ts";

export const dollars = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
export const callEstimate = (totals: BudgetTotals) => totals.calls === 0 ? "No model calls" : totals.estimatedUsd === null ?
  `${dollars(totals.knownEstimatedUsd)} known + unreported/unpriced` : dollars(totals.estimatedUsd);
const count = (value: number) => new Intl.NumberFormat().format(value);
export function useBudgetStatus(sdk: MoguriSdk, session: Session, snapshot: Snapshot) {
  const saved = snapshot.profileId === sdk.profileId ? snapshot.sessionTelemetry?.[session.id] : undefined;
  return { status: saved?.budget ?? null, error: saved?.budgetDiagnostic ?? (saved ? "" : "No retained accounting snapshot is available. No free usage was assumed.") };
}
export function BudgetSummary({ status }: { status: BudgetStatus }) {
  const totals = status.totals, cappedTokens = status.limits.some((limit) => limit.tokens !== null), cappedUsd = status.limits.some((limit) => limit.usd !== null);
  return <section aria-label="Cumulative session budget">
    <dl className="facts"><dt>Reported tokens</dt><dd>{totals.reportedTokens === null ? `${count(totals.knownReportedTokens)} known + ${totals.unknownTokenCalls} unknown calls` : count(totals.reportedTokens)}</dd>
      <dt>Held tokens</dt><dd>{totals.heldTokens === null ? "Unbounded / blocks finite admission" : count(totals.heldTokens)}</dd>
      {totals.plannedHolds > 0 && <><dt>Undispatched model holds</dt><dd>{count(totals.plannedHolds)} / {totals.plannedHeldTokens === null ? "Unknown capacity" : `${count(totals.plannedHeldTokens)} tokens`}</dd></>}
      <dt>Remaining tokens</dt><dd>{status.remainingTokens === null ? cappedTokens ? "Unknown / blocked" : "Unlimited" : count(status.remainingTokens)}</dd>
      <dt>Estimated USD</dt><dd>{callEstimate(totals)}</dd>
      <dt>Held estimated USD</dt><dd>{totals.heldUsd === null ? "Unknown" : dollars(totals.heldUsd)}</dd>
      <dt>Remaining estimated USD</dt><dd>{status.remainingUsd === null ? cappedUsd ? "Unknown / blocked" : "Unlimited" : dollars(status.remainingUsd)}</dd>
      <dt>Provider / billed USD</dt><dd>Not reported</dd></dl>
    {status.ownerSessionId !== status.sessionId && <p className="fine-print">Charged to owning session {status.ownerSessionId}, including its other model-created legs.</p>}
    {status.limits.map((limit) => <p className="fine-print" key={limit.scope}>{limit.scope === "global" ? "Global hard cap" : limit.scope === "profile" ? "Profile hard cap" : "Session cap"}: {limit.tokens === null ? "no token cap" : `${count(limit.tokens)} tokens`}; {limit.usd === null ? "no USD cap" : `${dollars(limit.usd)} estimated`}.</p>)}
    {status.diagnostics.map((diagnostic) => <p className="settings-warning" key={diagnostic}>{diagnostic}</p>)}
    <SettingsHelp label="More about this setting">Estimates are not a billing guarantee. Missing completion keeps reservations held. Resume, deletion and model changes do not reset this ledger.</SettingsHelp>
    {totals.plannedHolds > 0 && <SettingsHelp label="More about this setting">Planned capacity is not a model call or provider report. Only provably undispatched holds can be released automatically after their owner stops. Dispatched or uncertain usage stays held.</SettingsHelp>}
  </section>;
}
export function SessionBudgetSummary({ sdk, snapshot, session }: { sdk: MoguriSdk; snapshot: Snapshot; session: Session }) {
  const { status, error } = useBudgetStatus(sdk, session, snapshot);
  return <>{status ? <BudgetSummary status={status} /> : <p role="status">{error || "Loading cumulative budget..."}</p>}</>;
}
export function BudgetLimitEditor({ sdk, snapshot, session, scope, status, onDirty, disabled = false, globalPolicy }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; scope: "session" | "profile" | "global"; status?: BudgetStatus | null; globalPolicy?: GlobalBudgetPolicy;
  onDirty?: (dirty: boolean) => void; disabled?: boolean;
}) {
  const current = scope === "global" ? globalPolicy?.limit ?? null : scope === "profile" ? snapshot.budgetPolicy.limit : session?.controls.budget.kind === "limited" ? session.controls.budget : null;
  const revision = scope === "global" ? globalPolicy?.revision ?? 0 : scope === "profile" ? snapshot.budgetPolicy.revision : session?.revision ?? 0;
  const [limited, setLimited] = useState(Boolean(current)), [tokens, setTokens] = useState(String(current?.tokens ?? "")), [usd, setUsd] = useState(String(current?.usd ?? ""));
  const [dirty, setDirty] = useState(false), [accepted, setAccepted] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [winddown, setWinddown] = useState<Extract<WinddownResponse, { type: "winddown.status" }> | null>(null), [winddownError, setWinddownError] = useState("");
  const routed = scope === "session" && session?.controls.modelId === KUPO_MODEL_ID;
  useEffect(() => {
    let current = true; setWinddown(null); setWinddownError("");
    if (routed && session) void sdk.winddown.status(session.id).then((value) => { if (current) setWinddown(value); })
      .catch((error: unknown) => { if (current) setWinddownError(error instanceof Error ? error.message : "Actual reserved finishing readiness could not be read. No finite control was enabled."); });
    return () => { current = false; };
  }, [sdk, routed, session?.id, session?.controls.env, snapshot.settings.revision, snapshot.policy.revision, snapshot.provider.models]);
  const base = useRef(revision);
  const load = () => { setLimited(Boolean(current)); setTokens(String(current?.tokens ?? "")); setUsd(String(current?.usd ?? "")); base.current = revision; setDirty(false); setAccepted(false); setError(""); setNotice(""); };
  useEffect(() => { if (revision <= base.current) return; if (!dirty && !saving) load(); else if (!saving) setError("Budget controls changed elsewhere. Your edit is preserved; reload before saving."); }, [revision, dirty, saving]);
  useEffect(() => { onDirty?.(dirty || saving); return () => onDirty?.(false); }, [dirty, saving, onDirty]);
  const change = () => { setDirty(true); setAccepted(false); setNotice(""); };
  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      if (!accepted) throw new Error("Accept the estimate-based accounting and interruption warning first.");
      let limit: BudgetLimit | null = null;
      if (limited) {
        if (tokens && (!/^\d+$/.test(tokens) || !Number.isSafeInteger(Number(tokens)) || Number(tokens) < 1)) throw new Error("Use a positive whole-token cap, or leave it empty.");
        if (usd && (!Number.isFinite(Number(usd)) || Number(usd) < 0.000001)) throw new Error("Use a positive USD estimate cap of at least 0.000001, or leave it empty.");
        if (!tokens && !usd) throw new Error("Set at least one cumulative limit.");
        limit = { basis: "estimate", ...(tokens ? { tokens: Number(tokens) } : {}), ...(usd ? { usd: Number(usd) } : {}) };
      }
      const result = scope === "global" ? await sdk.profiles.globalBudget(limit, base.current, true) : scope === "profile" ? await sdk.budgets.policy(limit, base.current, true) : session ?
        await sdk.sessions.configure(session.id, { ...session.controls, budget: limit ? { kind: "limited", ...limit } : { kind: "unlimited" } }, base.current) :
        (() => { throw new Error("Choose a session for this budget."); })();
      base.current = result.revision!; setDirty(false); setAccepted(false); setNotice(scope === "global" ? "Global policy saved. Profile switching, source deletion and defaults cannot refund it." : scope === "profile" ? "Profile policy saved. Factory/default resets cannot remove it." : "Session budget saved. Existing usage was not reset.");
    } catch (error) { setError(error instanceof Error ? error.message : "Budget was not saved. No cap was silently lifted."); }
    finally { setSaving(false); }
  };
  const locked = disabled || saving || routed && !winddown?.ready || scope === "global" && !globalPolicy || scope === "session" && (Boolean(session?.turnId) || Boolean(status && status.ownerSessionId !== session?.id));
  const usdUnavailable = scope === "session" && (routed ? !winddown?.usdReady : !status || !status.rate || status.totals.unpricedCalls > 0 || status.totals.plannedHolds > 0 && status.totals.plannedHeldUsd === null);
  return <section aria-label={scope === "global" ? "Global budget policy" : scope === "profile" ? "Profile budget policy" : "Session budget controls"} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    {routed && <p className={winddown?.ready ? "fine-print" : "settings-warning"}>{winddownError || winddown?.reason || "Reading exact reserved finishing readiness..."} Profile/global caps still apply; no policy is removed here.</p>}
    <label className="setting-field">{scope === "global" ? "Global hard policy" : scope === "profile" ? "Profile hard policy" : "Session preference"}<select aria-label={`${scope} budget mode`} value={limited ? "limited" : "unlimited"} disabled={locked} onChange={(event) => { setLimited(event.target.value === "limited"); change(); }}><option value="unlimited">{scope === "global" ? "No global cap" : scope === "profile" ? "No profile cap" : "Unlimited, subject to hard policy"}</option><option value="limited">Estimate-based cumulative limits</option></select></label>
    {limited && <><label className="setting-field">Token cap<SettingsInput aria-label={`${scope} token cap`} type="number" min="1" step="1" value={tokens} disabled={locked} onChange={(event) => { setTokens(event.target.value); change(); }} /></label>
      <label className="setting-field">Estimated USD cap<SettingsInput aria-label={`${scope} USD cap`} type="number" min="0.000001" step="0.000001" value={usd} disabled={locked || usdUnavailable} onChange={(event) => { setUsd(event.target.value); change(); }} /></label>
      {usdUnavailable && <><SettingsHelp label="More about this setting">USD caps need fresh model-specific rates and priced prior calls. Configure estimates in Settings / Budgets; unknown history cannot be reset to free.</SettingsHelp>{usd && <button type="button" disabled={locked} onClick={() => { setUsd(""); change(); }}>Remove session USD limit</button>}</>}</>}
    <p className="settings-warning">{BUDGET_WARNING}</p>
    <SettingsHelp label="More about this setting">Input reservations are estimated; the actual output limit is forwarded. Provider totals reconcile once. Reported overages and missing telemetry remain visible; in-flight charges cannot be undone.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" disabled={locked || !dirty} checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I accept estimate-based accounting and interruption risk.</label>
    <div className="button-row"><button type="button" className="primary" disabled={locked || !dirty || !accepted} onClick={() => void save()}>{scope === "global" ? "Save global budget policy" : scope === "profile" ? "Save profile budget policy" : "Save session budget"}</button><button type="button" disabled={saving || revision < base.current} onClick={load}>Reload budget</button></div>
    {scope === "session" && session?.turnId && <SettingsHelp label="More about this setting">Finish or stop this turn before changing its session preference. A profile policy can still block further calls.</SettingsHelp>}
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
  </section>;
}
