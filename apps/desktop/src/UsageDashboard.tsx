import { useEffect, useState } from "react";
import { isModelRole, type BudgetQuery, type BudgetResponse, type BudgetTotals, type MoguriSdk, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { dollars } from "./BudgetControls.tsx";

type Result = Extract<BudgetResponse, { type: "budget.dashboard" }>;
type Filters = Omit<Extract<BudgetQuery, { type: "budget.dashboard" }>, "type">;
const tokens = (totals: BudgetTotals) => totals.reportedTokens === null ? `${totals.knownReportedTokens.toLocaleString()} known + ${totals.unknownTokenCalls} unknown calls` : totals.reportedTokens.toLocaleString();
export function UsageDashboard({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [filters, setFilters] = useState<Filters>({}), [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const stamp = snapshot.budgetEntries.map((entry) => `${entry.id}:${entry.status}:${entry.reportedTokens}:${entry.estimatedUsdMicros}`).join("|");
  const choose = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((filters) => ({ ...filters, [key]: value, ...(key === "offset" ? {} : { offset: 0 }) }));
  useEffect(() => {
    let current = true; setLoading(true); setError(""); setResult(null);
    void sdk.budgets.dashboard(filters).then((result) => { if (current) setResult(result); }).catch((error: unknown) => { if (current) { setResult(null); setError(error instanceof Error ? error.message : "Usage totals are unavailable. No zero-usage fallback was used."); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sdk, JSON.stringify(filters), stamp, snapshot.budgetPolicy.revision]);
  const models = [...new Set(snapshot.budgetEntries.map((entry) => entry.modelId))], providers = [...new Set(snapshot.budgetEntries.flatMap((entry) => entry.providerId ? [entry.providerId] : []))], roles = [...new Set(snapshot.budgetEntries.map((entry) => entry.role))];
  return <section aria-label="Profile usage dashboard" aria-busy={loading}><h2>Usage dashboard</h2><p className="fine-print">{snapshot.profile?.name ?? sdk.profileId} profile. Every actual agent-model role, including owned children and stopped/unknown requests. Deleting a source does not refund accounting. Estimates are not bills.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}{loading && <p role="status">Updating authoritative totals...</p>}
    {result && <><dl className="facts"><dt>Model calls</dt><dd>{result.totals.calls}</dd><dt>Reported tokens</dt><dd>{tokens(result.totals)}</dd>
      <dt>Held tokens</dt><dd>{result.totals.heldTokens === null ? "Unbounded / unknown" : result.totals.heldTokens.toLocaleString()}</dd>
      <dt>Estimated USD</dt><dd>{result.totals.estimatedUsd === null ? `${dollars(result.totals.knownEstimatedUsd)} known + unreported/unpriced` : dollars(result.totals.estimatedUsd)}</dd>
      <dt>Held estimated USD</dt><dd>{result.totals.heldUsd === null ? "Unknown" : dollars(result.totals.heldUsd)}</dd>
      <dt>Provider / billed USD</dt><dd>Not reported</dd><dt>Request wall time</dt><dd>{(result.totals.requestMs / 1000).toFixed(2)} s</dd></dl>
      <p className="fine-print">{result.policy.limit ? `Profile hard policy: ${result.policy.limit.tokens ?? "unlimited"} tokens / ${result.policy.limit.usd === undefined ? "no USD cap" : dollars(result.policy.limit.usd) + " estimated"}.` : "No profile hard cap. Session caps still apply."}</p>
    </>}
    <details><summary>Filters</summary>
      <label className="setting-field">Project<select aria-label="Usage project filter" value={filters.projectId ?? ""} onChange={(event) => choose("projectId", event.target.value || undefined)}><option value="">All / includes removed projects</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="setting-field">Folder<select aria-label="Usage folder filter" value={filters.folderId ?? ""} onChange={(event) => choose("folderId", event.target.value || undefined)}><option value="">All folders</option>{snapshot.projectFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <label className="setting-field">Session<select aria-label="Usage session filter" value={filters.sessionId ?? ""} onChange={(event) => choose("sessionId", event.target.value || undefined)}><option value="">All / includes deleted sources</option>{snapshot.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>
      <label className="setting-field">Provider<select aria-label="Usage provider filter" value={filters.providerId ?? ""} onChange={(event) => choose("providerId", event.target.value || undefined)}><option value="">All / includes unknown</option>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></label>
      <label className="setting-field">Model<select aria-label="Usage model filter" value={filters.modelId ?? ""} onChange={(event) => choose("modelId", event.target.value || undefined)}><option value="">All models</option>{models.map((model) => <option key={model}>{model}</option>)}</select></label>
      <label className="setting-field">Role<select aria-label="Usage role filter" value={filters.role ?? ""} onChange={(event) => { const value = event.target.value; if (!value) choose("role", undefined); else if (isModelRole(value)) choose("role", value); }}><option value="">All actual roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
    </details>
    {result && <>
      {!result.groups.length && <p>No calls match this filter. Unknown historical costs are not fabricated.</p>}
      {result.groups.map((group) => <div className="call-record" key={JSON.stringify([group.role, group.modelId, group.providerId])}><strong>{snapshot.provider.models.find((model) => model.id === group.modelId)?.name ?? group.modelId}</strong><small>{group.role} / {group.providerId ?? "unknown provider"}</small><span>{group.totals.calls} calls / {tokens(group.totals)} tokens</span><span>{group.totals.estimatedUsd === null ? "Estimated USD incomplete" : dollars(group.totals.estimatedUsd) + " estimated"}</span></div>)}
      <div className="button-row">{Boolean(filters.offset) && <button type="button" disabled={loading} onClick={() => choose("offset", Math.max(0, (filters.offset ?? 0) - 50))}>Previous roles</button>}{result.nextOffset !== null && <button type="button" disabled={loading} onClick={() => choose("offset", result.nextOffset!)}>Next roles</button>}</div>
    </>}
    <p className="fine-print">Cached/category tokens are not added again to provider totals. Request wall time is not active generation throughput. Repository/org/visibility metadata requires its separate qualified integrations. Other profiles' private task data is not combined here.</p>
  </section>;
}
