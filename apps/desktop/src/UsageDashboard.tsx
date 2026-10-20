import { useEffect, useState } from "react";
import { isModelRole, type BudgetBucket, type BudgetQuery, type BudgetResponse, type BudgetTotals, type MoguriSdk, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { dollars } from "./BudgetControls.tsx";
import { OperationalUsage } from "./OperationalUsage.tsx";
import { RepositoryMetadata } from "./RepositoryMetadata.tsx";

type Result = Extract<BudgetResponse, { type: "budget.dashboard" }>;
type Filters = Omit<Extract<BudgetQuery, { type: "budget.dashboard" }>, "type">;
type CallFilters = Omit<Extract<BudgetQuery, { type: "budget.calls" }>, "type">;
const tokens = (totals: BudgetTotals) => totals.reportedTokens === null ? `${totals.knownReportedTokens.toLocaleString()} known + ${totals.unknownTokenCalls} unknown calls` : totals.reportedTokens.toLocaleString();
const detail = (value: number | null | undefined) => value === null || value === undefined ? "Not reported" : value.toLocaleString();
const dayPresets = [7, 30, 60, 90, 365] as const;
const buckets: BudgetBucket[] = ["day", "week", "month", "all"];
export function UsageDashboard({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [filters, setFilters] = useState<Filters>({}), [queryResult, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [resultOwner, setResultOwner] = useState<{ sdk: MoguriSdk; key: string } | null>(null);
  const today = new Date().toISOString().slice(0, 10), currentYear = new Date().getUTCFullYear();
  const [custom, setCustom] = useState({ from: today, to: today }), [showCalls, setShowCalls] = useState(false);
  const stamp = snapshot.budgetEntries.map((entry) => [entry.id, entry.status, entry.reportedTokens, entry.estimatedUsdMicros, entry.inputTokens, entry.outputTokens, entry.cacheReadTokens, entry.cacheWriteTokens, entry.stream?.firstOutputMs, entry.stream?.streamMs, entry.stream?.outputEvents, entry.createdAt, entry.timeBasis, entry.ownerTurnId].join(":")).join("|");
  const resultKey = JSON.stringify([filters, stamp, snapshot.budgetPolicy.revision]), resultCurrent = resultOwner?.sdk === sdk && resultOwner.key === resultKey;
  const result = resultCurrent ? queryResult : null;
  const choose = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((filters) => ({ ...filters, [key]: value, ...(key === "offset" ? {} : { offset: 0 }) }));
  const years = [...new Set([currentYear, ...snapshot.budgetEntries.flatMap((entry) => { const year = new Date(entry.createdAt).getUTCFullYear(); return Number.isInteger(year) && year >= 1970 && year <= 9999 ? [year] : []; })])].sort((left, right) => right - left);
  const rangeValue = filters.range?.kind === "days" ? String(filters.range.days) : filters.range?.kind ?? "all";
  const range = (value: string) => {
    if (value === "all") choose("range", undefined);
    else if (value === "year") choose("range", { kind: "year", year: currentYear });
    else if (value === "custom") choose("range", { kind: "custom", ...custom });
    else { const days = dayPresets.find((days) => String(days) === value); if (days) choose("range", { kind: "days", days }); }
  };
  useEffect(() => {
    let current = true; setResultOwner({ sdk, key: resultKey }); setLoading(true); setError(""); setResult(null);
    void sdk.budgets.dashboard(filters).then((result) => { if (current) setResult(result); }).catch((error: unknown) => { if (current) { setResult(null); setError(error instanceof Error ? error.message : "Usage totals are unavailable. No zero-usage fallback was used."); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sdk, JSON.stringify(filters), stamp, snapshot.budgetPolicy.revision]);
  const models = [...new Set(snapshot.budgetEntries.map((entry) => entry.modelId))], providers = [...new Set(snapshot.budgetEntries.flatMap((entry) => entry.providerId ? [entry.providerId] : []))], roles = [...new Set(snapshot.budgetEntries.map((entry) => entry.role))];
  const repositories = new Map(snapshot.budgetEntries.flatMap((entry) => entry.repository ? [[entry.repository.id, entry.repository.fullName] as const] : []));
  for (const observation of snapshot.repositoryObservations) if (observation.repository) repositories.set(observation.repository.id, observation.repository.fullName);
  const organizations = [...new Set(snapshot.budgetEntries.flatMap((entry) => entry.repository?.ownerKind === "organization" ? [entry.repository.owner] : []))];
  const { bucket: _bucket, offset: _offset, limit: _limit, ...callFilters } = filters;
  return <section aria-label="Profile usage dashboard" aria-busy={loading || !resultCurrent}><h2>Usage dashboard</h2><p className="fine-print">{snapshot.profile?.name ?? sdk.profileId} profile. All model roles and held unknowns. Estimates are not bills.</p>
    <details><summary>Date range and buckets</summary>
    <label className="setting-field">Date range<select aria-label="Usage date range" value={rangeValue} onChange={(event) => range(event.target.value)}><option value="all">All time</option>{dayPresets.map((days) => <option key={days} value={String(days)}>Past {days} UTC days</option>)}<option value="year">Calendar year</option><option value="custom">Custom inclusive UTC dates</option></select></label>
    {filters.range?.kind === "year" && <label className="setting-field">Year<select aria-label="Usage calendar year" value={filters.range.year} onChange={(event) => choose("range", { kind: "year", year: Number(event.target.value) })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>}
    {filters.range?.kind === "custom" && <div><label className="setting-field">From (UTC)<input aria-label="Usage range from" type="date" value={custom.from} onChange={(event) => setCustom((range) => ({ ...range, from: event.target.value }))} /></label><label className="setting-field">Through (UTC)<input aria-label="Usage range through" type="date" value={custom.to} onChange={(event) => setCustom((range) => ({ ...range, to: event.target.value }))} /></label><button type="button" disabled={!custom.from || !custom.to || loading} onClick={() => choose("range", { kind: "custom", ...custom })}>Apply UTC range</button></div>}
    <label className="setting-field">Calendar buckets<select aria-label="Usage calendar buckets" value={filters.bucket ?? "month"} onChange={(event) => { const bucket = buckets.find((value) => value === event.target.value); if (bucket) choose("bucket", bucket); }}>{buckets.map((bucket) => <option key={bucket} value={bucket}>{bucket === "all" ? "Whole selected range" : bucket === "week" ? "Week (Monday, UTC)" : `${bucket[0]!.toUpperCase()}${bucket.slice(1)} (UTC)`}</option>)}</select></label>
    </details>
    {resultCurrent && error && <p className="inline-error" role="alert">{error}</p>}{(loading || !resultCurrent) && <p role="status">Updating authoritative totals...</p>}
    {result && <><p className="fine-print">{result.window.from ? `${result.window.from} through ${result.window.to}, inclusive UTC.` : "All recorded dates, including calls with uncertain historical times."} Date filters never reduce cumulative budget charges.</p>
      {result.window.excludedUncertainTimeCalls > 0 && <p className="settings-warning">{result.window.excludedUncertainTimeCalls} calls have no verified request time and are excluded from this dated view. All time includes them.</p>}
      {result.repositoryCoverage.unattributedCalls > 0 && <p className="fine-print">{result.repositoryCoverage.unattributedCalls} calls in this source/date view lack repository attribution{filters.repositoryId || filters.organization || filters.visibility ? " and are excluded by repository filters" : ""}. Earlier deleted or unverified history is not reconstructed.</p>}
      {filters.visibility === "open-source" && result.repositoryCoverage.unverifiedLicenseCalls > 0 && <p className="fine-print">{result.repositoryCoverage.unverifiedLicenseCalls} public-repository calls have unverified detected licenses and are excluded from this category, not assumed unlicensed or zero work.</p>}
      <dl className="facts"><dt>Model calls</dt><dd>{result.totals.calls}</dd><dt>Reported tokens</dt><dd>{tokens(result.totals)}</dd>
      <dt>Held tokens</dt><dd>{result.totals.heldTokens === null ? "Unbounded / unknown" : result.totals.heldTokens.toLocaleString()}</dd>
      <dt>Estimated USD</dt><dd>{result.totals.estimatedUsd === null ? `${dollars(result.totals.knownEstimatedUsd)} known + unreported/unpriced` : dollars(result.totals.estimatedUsd)}</dd>
      <dt>Held estimated USD</dt><dd>{result.totals.heldUsd === null ? "Unknown" : dollars(result.totals.heldUsd)}</dd>
      <dt>Provider / billed USD</dt><dd>Not reported</dd><dt>Request wall time</dt><dd>{(result.totals.requestMs / 1000).toFixed(2)} s</dd></dl>
      <p className="fine-print">{result.policy.limit ? `Profile hard policy: ${result.policy.limit.tokens ?? "unlimited"} tokens / ${result.policy.limit.usd === undefined ? "no USD cap" : dollars(result.policy.limit.usd) + " estimated"}.` : "No profile hard cap. Session caps still apply."}</p>
      <details><summary>Token categories</summary><dl className="facts"><dt>Input, cache included</dt><dd>{detail(result.totals.inputTokens)}</dd><dt>Output</dt><dd>{detail(result.totals.outputTokens)}</dd><dt>Cached read, input subset</dt><dd>{detail(result.totals.cacheReadTokens)}</dd><dt>Cache creation, input subset</dt><dd>{detail(result.totals.cacheWriteTokens)}</dd></dl><p className="fine-print">Input totals derive from reported total minus output. Cache subsets are not added again; absent details are unknown.</p></details>
      <details><summary>Observed streaming</summary><dl className="facts"><dt>First output delay</dt><dd>{result.totals.meanFirstOutputMs === null ? "Unavailable" : `${result.totals.meanFirstOutputMs.toFixed(1)} ms / ${result.totals.firstOutputSamples} calls`}</dd><dt>Stream delivery rate</dt><dd>{result.totals.observedOutputTokensPerSecond === null ? "Unavailable" : `${result.totals.observedOutputTokensPerSecond.toFixed(1)} output tokens/s`}</dd><dt>Measured calls</dt><dd>{result.totals.measuredStreamCalls}</dd><dt>Unmeasured/non-generative</dt><dd>{result.totals.unmeasuredStreamCalls}</dd></dl><p className="fine-print">Execution-host observations include provider/network chunk delivery, not GPU generation or productivity. Single-event and unreported output cannot provide a rate. Decision roles are excluded.</p></details>
      <details><summary>UTC periods ({result.periods.length})</summary>{result.periods.map((period) => <div className="call-record" key={period.from ?? "unknown"}><strong>{period.from ? `${period.from}${period.to !== period.from ? ` through ${period.to}` : ""}` : "Unverified historical request time"}</strong><span>{period.totals.calls} calls / {tokens(period.totals)} tokens</span><span>{period.totals.estimatedUsd === null ? `${dollars(period.totals.knownEstimatedUsd)} known + unpriced/unreported` : dollars(period.totals.estimatedUsd)} estimated</span></div>)}<p className="fine-print">Calendar boundaries are UTC; edge buckets can be partial. Only periods with recorded calls are listed.</p></details>
      <details><summary>Captured price history ({result.pricing.length})</summary>{result.pricing.map(({ rate, calls }) => <div className="call-record" key={JSON.stringify(rate)}><strong>{snapshot.provider.models.find((model) => model.id === rate.modelId)?.name ?? rate.modelId}</strong><span>{dollars(rate.inputUsdPerMillion)} input / {dollars(rate.outputUsdPerMillion)} output per million tokens</span><small>{rate.effectiveAt} / {rate.source} / {calls} calls</small></div>)}{!result.pricing.length && <p className="fine-print">No captured rates. Missing prices are not free.</p>}<p className="fine-print">Historical user estimates captured at admission, not current vendor prices or invoices. Calls without a captured rate remain unpriced.</p></details>
    </>}
    <RepositoryMetadata sdk={sdk} snapshot={snapshot} />
    <OperationalUsage sdk={sdk} snapshot={snapshot} filters={callFilters} />
    <details><summary>Filters</summary>
      <label className="setting-field">Repository as recorded<select aria-label="Usage repository filter" value={filters.repositoryId ?? ""} onChange={(event) => choose("repositoryId", event.target.value ? Number(event.target.value) : undefined)}><option value="">All / includes unassigned history</option>{[...repositories].map(([id, name]) => <option key={id} value={id}>{name} / {id}</option>)}</select></label>
      <label className="setting-field">GitHub organization as recorded<select aria-label="Usage organization filter" value={filters.organization ?? ""} onChange={(event) => choose("organization", event.target.value || undefined)}><option value="">All owner kinds</option>{organizations.map((organization) => <option key={organization}>{organization}</option>)}</select></label>
      <label className="setting-field">Visibility as recorded<select aria-label="Usage visibility filter" value={filters.visibility ?? ""} onChange={(event) => { const visibility = (["public", "private", "internal", "open-source"] as const).find((value) => value === event.target.value); choose("visibility", visibility); }}><option value="">All / includes unverified</option><option value="public">Public</option><option value="private">Private</option><option value="internal">Internal</option><option value="open-source">Open source (public + OSI license)</option></select></label>
      <label className="setting-field">Project<select aria-label="Usage project filter" value={filters.projectId ?? ""} onChange={(event) => choose("projectId", event.target.value || undefined)}><option value="">All / includes removed projects</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="setting-field">Folder<select aria-label="Usage folder filter" value={filters.folderId ?? ""} onChange={(event) => choose("folderId", event.target.value || undefined)}><option value="">All folders</option>{snapshot.projectFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <label className="setting-field">Session<select aria-label="Usage session filter" value={filters.sessionId ?? ""} onChange={(event) => choose("sessionId", event.target.value || undefined)}><option value="">All / includes deleted sources</option>{snapshot.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>
      <label className="setting-field">Turn ID<input aria-label="Usage turn filter" value={filters.turnId ?? ""} onChange={(event) => choose("turnId", event.target.value || undefined)} placeholder="All turns" /></label>
      <label className="setting-field">Environment<select aria-label="Usage environment filter" value={filters.env ?? ""} onChange={(event) => { const value = ["Local", "Remote", "Sandbox", "unknown"].find((value) => value === event.target.value); if (!value) choose("env", undefined); else if (value === "Local" || value === "Remote" || value === "Sandbox" || value === "unknown") choose("env", value); }}><option value="">All environments</option>{["Local", "Remote", "Sandbox", "unknown"].map((env) => <option key={env}>{env}</option>)}</select></label>
      <label className="setting-field">Provider<select aria-label="Usage provider filter" value={filters.providerId ?? ""} onChange={(event) => choose("providerId", event.target.value || undefined)}><option value="">All / includes unknown</option>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></label>
      <label className="setting-field">Model<select aria-label="Usage model filter" value={filters.modelId ?? ""} onChange={(event) => choose("modelId", event.target.value || undefined)}><option value="">All models</option>{models.map((model) => <option key={model}>{model}</option>)}</select></label>
      <label className="setting-field">Role<select aria-label="Usage role filter" value={filters.role ?? ""} onChange={(event) => { const value = event.target.value; if (!value) choose("role", undefined); else if (isModelRole(value)) choose("role", value); }}><option value="">All actual roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
    </details>
    {result && <>
      {!result.groups.length && <p>No calls match this filter. Unknown historical costs are not fabricated.</p>}
      {result.groups.map((group) => <div className="call-record" key={JSON.stringify([group.role, group.modelId, group.providerId])}><strong>{snapshot.provider.models.find((model) => model.id === group.modelId)?.name ?? group.modelId}</strong><small>{group.role} / {group.providerId ?? "unknown provider"}</small><span>{group.totals.calls} calls / {tokens(group.totals)} tokens</span><span>{group.totals.estimatedUsd === null ? "Estimated USD incomplete" : dollars(group.totals.estimatedUsd) + " estimated"}</span></div>)}
      <div className="button-row">{Boolean(filters.offset) && <button type="button" disabled={loading} onClick={() => choose("offset", Math.max(0, (filters.offset ?? 0) - 50))}>Previous roles</button>}{result.nextOffset !== null && <button type="button" disabled={loading} onClick={() => choose("offset", result.nextOffset!)}>Next roles</button>}</div>
    </>}
    <details onToggle={(event) => setShowCalls(event.currentTarget.open)}><summary>Per-call history</summary>{showCalls && <UsageCalls key={JSON.stringify(callFilters)} sdk={sdk} filters={callFilters} stamp={stamp} onTurn={(turnId) => choose("turnId", turnId)} />}</details>
    <p className="fine-print">Deleting a source never refunds its accounting. Cached/category tokens are not added again to provider totals. Summed request wall time is not session wall time or active generation throughput. Repository/owner/visibility values are immutable admission snapshots of explicitly observed metadata, not today's GitHub state. Other profiles' private task data is not combined here.</p>
  </section>;
}

function UsageCalls({ sdk, filters, stamp, onTurn }: { sdk: MoguriSdk; filters: CallFilters; stamp: string; onTurn: (id: string) => void }) {
  const [offset, setOffset] = useState(0), [result, setResult] = useState<Extract<BudgetResponse, { type: "budget.calls" }> | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true; setLoading(true); setError(""); setResult(null);
    void sdk.budgets.calls({ ...filters, offset, limit: 20 }).then((value) => { if (current) setResult(value); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Call history is unavailable; no empty success was assumed."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sdk, JSON.stringify(filters), offset, stamp]);
  return <div aria-label="Accounted model calls" aria-busy={loading}>{loading && <p role="status">Loading retained calls...</p>}{error && <p className="inline-error" role="alert">{error}</p>}
    {result?.calls.map((call) => <div className="call-record" key={call.id}><strong>{call.modelId}</strong><small>{call.role} / {call.env} / {call.status} / {call.outcome}</small>
      <span>{call.imported && call.timeBasis !== "model-start" || call.timeBasis === "unknown" ? "Unverified historical request time" : call.createdAt}</span>
      <small>{call.repository ? `${call.repository.fullName} / ${call.repository.ownerKind} / ${call.repository.visibility} / metadata ${call.repository.observedAt}` : `Repository unassigned${call.repositoryDiagnostic ? ` / ${call.repositoryDiagnostic}` : ""}`}</small>
      <span>{call.reportedTokens === null ? "Token usage unknown" : `${call.reportedTokens.toLocaleString()} reported tokens`} / {call.estimatedUsdMicros === null ? "USD unknown" : dollars(call.estimatedUsdMicros / 1_000_000) + " estimated"}</span>
      <span>{call.stream?.firstOutputMs === null || call.stream?.firstOutputMs === undefined ? "First output unmeasured" : `${call.stream.firstOutputMs.toFixed(1)} ms first output`}; {(call.requestMs / 1000).toFixed(2)} s request wall time</span>
      {call.rate && <small>{call.rate.effectiveAt} / {call.rate.source}; input {dollars(call.rate.inputUsdPerMillion)}, output {dollars(call.rate.outputUsdPerMillion)} per million</small>}
      {call.telemetryDiagnostic && <p className="inline-error">{call.telemetryDiagnostic}</p>}
      {(call.ownerTurnId || call.turnId) && <button type="button" className="quiet" onClick={() => { const turn = call.ownerTurnId ?? call.turnId; if (turn) onTurn(turn); }}>{call.ownerTurnId ? "Filter this owning turn" : "Filter this actual turn"}</button>}
    </div>)}
    {result && !result.calls.length && <p>No calls match this view.</p>}<p className="fine-print">Pages show current accounting. New calls or late reports can change ordering; totals are computed separately, not by adding these pages.</p>
    <div className="button-row">{offset > 0 && <button type="button" disabled={loading} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous calls</button>}{result?.nextOffset !== null && result?.nextOffset !== undefined && <button type="button" disabled={loading} onClick={() => setOffset(result.nextOffset!)}>Next calls</button>}</div>
  </div>;
}
