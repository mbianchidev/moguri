import { useEffect, useId, useState } from "react";
import { envLabel, sessionIndicator, sessionTitle, type BudgetRange, type BudgetTotals, type MoguriSdk, type MyWorkFilters, type RoundupFilters, type Snapshot, type WorkspaceDashboard } from "../../../packages/sdk/src/index.ts";
import { useMoguri } from "../../../packages/sdk/src/react.ts";
import { UsageDashboard } from "./UsageDashboard.tsx";
import { callEstimate, dollars } from "./BudgetControls.tsx";
import { InfoTip } from "./Tooltip.tsx";
import { Alert } from "./Alert.tsx";
import { MyWorkInbox } from "./MyWorkInbox.tsx";
import { DependencyRoundup } from "./DependencyRoundup.tsx";
import { AnalyticsView } from "./AnalyticsView.tsx";

const pages = ["My work", "Dependencies", "Analytics", "Usage", "Cost", "Velocity"] as const;
type Page = typeof pages[number];
const DAY = 86_400_000, day = (time: number) => new Date(time).toISOString().slice(0, 10);
const count = (value: number) => value.toLocaleString();
const duration = (ms: number | null) => ms === null ? "Not measured" : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`;
const knownTokens = (totals: BudgetTotals) => `${count(totals.knownReportedTokens)}${totals.unknownTokenCalls ? " known" : ""}`;

function Trend({ title, values, money = false }: { title: string; values: { date: string; value: number | null }[]; money?: boolean }) {
  const id = useId(), maximum = Math.max(0, ...values.flatMap((value) => value.value === null ? [] : [value.value])), max = maximum || 1;
  const x = (index: number) => 74 + (values.length < 2 ? 262 : index / (values.length - 1) * 524), y = (value: number) => 144 - value / max * 112;
  let previous = false;
  const path = values.map((point, index) => {
    if (point.value === null) { previous = false; return ""; }
    const instruction = `${previous ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`;
    previous = true; return instruction;
  }).join(" ");
  return <section className="dashboard-chart" aria-label={title}><h3>{title}</h3>
    <svg viewBox="0 0 640 178" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{title}</title><desc id={`${id}-description`}>{values.length} UTC dates. Missing reports are gaps, not zero. Exact values are in the chart data disclosure.</desc>
      {[0, 0.5, 1].map((tick) => <g key={tick}><line x1="74" x2="606" y1={y(tick * max)} y2={y(tick * max)} className="chart-grid" /><text x="66" y={y(tick * max) + 4} textAnchor="end">{money ? tick * max >= 1000 ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(tick * max) : dollars(tick * max) : (tick * max).toLocaleString(undefined, { maximumFractionDigits: 1, notation: "compact" })}</text></g>)}
      <path d={path} className="chart-line" />
      {values.length <= 90 && values.map((point, index) => point.value === null ? null : <circle key={point.date} cx={x(index)} cy={y(point.value)} r="2.8" className="chart-point"><title>{point.date}: {money ? dollars(point.value) : count(point.value)}</title></circle>)}
      {values.length > 0 && [0, Math.floor((values.length - 1) / 2), values.length - 1].filter((value, index, all) => all.indexOf(value) === index).map((index) => <text key={index} x={x(index)} y="166" textAnchor="middle">{values[index]!.date.slice(5)}</text>)}
    </svg>
    <details><summary>Chart data</summary><div className="chart-data"><table><thead><tr><th>UTC date</th><th>{money ? "Estimated USD" : title}</th></tr></thead><tbody>{values.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.value === null ? "Not fully reported" : money ? dollars(point.value) : count(point.value)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function Breakdown({ title, values, money = false }: { title: string; values: { id: string; name: string; totals: BudgetTotals }[]; money?: boolean }) {
  const metric = (totals: BudgetTotals) => money ? totals.knownEstimatedUsd : totals.knownReportedTokens;
  const max = Math.max(1e-9, ...values.map((value) => metric(value.totals)));
  return <section className="dashboard-breakdown"><h3>{title}</h3>{values.length ? <ul>{values.map((value) => <li key={value.id}>
    <div><span title={value.name}>{value.name}</span><strong>{money ? dollars(metric(value.totals)) : count(metric(value.totals))}</strong></div>
    <div className="breakdown-track" aria-hidden="true"><span style={{ width: `${metric(value.totals) / max * 100}%` }} /></div>
    {(money ? value.totals.unpricedCalls : value.totals.unknownTokenCalls) > 0 && <small>{money ? `${value.totals.unpricedCalls} unpriced calls; known estimate only` : `${value.totals.unknownTokenCalls} unknown reports; known tokens only`}</small>}
  </li>)}</ul> : <p className="fine-print">No recorded model calls or holds in this range.</p>}</section>;
}

export function Dashboard({ sdk, snapshot, openSession, initialItemId, initialFilters, initialRoundupFilters, onDirty }: { sdk: MoguriSdk; snapshot: Snapshot; openSession: (id: string) => Promise<void>; initialItemId?: string | null; initialFilters?: MyWorkFilters; initialRoundupFilters?: RoundupFilters; onDirty?: (dirty: boolean) => void }) {
  const { status } = useMoguri(sdk), connected = status === "connected" && snapshot.profileId === sdk.profileId;
  const [page, setPage] = useState<Page>("My work"), [range, setRange] = useState<BudgetRange>({ kind: "days", days: 7 }), [projectId, setProjectId] = useState("");
  const [custom, setCustom] = useState(() => ({ from: day(Date.now() - 364 * DAY), to: day(Date.now()) }));
  const [state, setState] = useState<{ sdk: MoguriSdk; key: string; value?: WorkspaceDashboard; error?: string } | null>(null), [navigationError, setNavigationError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [roundupItem, setRoundupItem] = useState<string | null>(null);
  useEffect(() => {
    if (initialItemId || initialFilters !== undefined) { setPage("My work"); setProjectId(initialFilters?.projectId ?? ""); }
  }, [initialItemId, initialFilters]);
  useEffect(() => { if (initialRoundupFilters) setPage("Dependencies"); }, [initialRoundupFilters]);
  const stamp = JSON.stringify([snapshot.sessions.map((session) => [session.id, session.revision, session.status, session.turnId, session.updatedAt]), snapshot.budgetEntries, snapshot.budgetPlans, snapshot.projects, snapshot.budgetPolicy.revision]);
  const key = JSON.stringify([range, projectId, stamp, connected]), current = state?.sdk === sdk && state.key === key, data = current ? state.value : undefined;
  useEffect(() => {
    let active = true; setState({ sdk, key });
    if (!connected) { setState({ sdk, key, error: "Dashboard history is unavailable while this profile's service is not connected. No empty totals were substituted." }); return; }
    void sdk.dashboard.overview({ range, ...(projectId ? { projectId } : {}) }).then((result) => { if (active) setState({ sdk, key, value: result.dashboard }); })
      .catch((error: unknown) => { if (active) setState({ sdk, key, error: error instanceof Error ? error.message : "Dashboard data is unavailable. No empty totals were substituted." }); });
    return () => { active = false; };
  }, [sdk, key]);
  const navigate = (id: string) => {
    setNavigationError(""); setOpening(id);
    void (async () => {
      const current = sdk.getState();
      if (current.status !== "connected" || current.snapshot?.profileId !== snapshot.profileId || !current.snapshot.sessions.some((session) => session.id === id)) {
        throw new Error("The exact session is unavailable in this connected profile. No replacement was opened.");
      }
      await openSession(id);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.session-header[data-session-id="${CSS.escape(id)}"] h1`)?.focus());
    })().catch((error: unknown) => setNavigationError(error instanceof Error ? error.message : "The selected session could not be opened. Your draft is preserved."))
      .finally(() => setOpening(null));
  };
  const presets = [7, 30, 60, 90] as const;
  const selectRange = (value: string) => {
    if (value === "custom") setRange({ kind: "custom", ...custom });
    else { const days = presets.find((days) => String(days) === value); if (days) setRange({ kind: "days", days }); }
  };
  const analytics = page === "Analytics" || page === "Dependencies";
  return <section className="workspace-dashboard" aria-label="Profile dashboard">
    <nav className="dashboard-pages" aria-label="Dashboard pages">{pages.map((name) => <button key={name} type="button" aria-current={page === name ? "page" : undefined} onClick={() => setPage(name)}>{name}</button>)}</nav>
    {!analytics && <><div className="dashboard-filters"><label>Range<select aria-label="Dashboard date range" value={range.kind === "days" ? String(range.days) : "custom"} onChange={(event) => selectRange(event.target.value)}>
      {presets.map((days) => <option key={days} value={String(days)}>Last {days} days</option>)}<option value="custom">Custom range</option></select></label>
      <label>Project<select aria-label="Dashboard project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{projectId && !snapshot.projects.some((project) => project.id === projectId) && <option value={projectId}>Removed project</option>}</select></label>
      <span className="fine-print">UTC dates</span><InfoTip label="About dashboard measurements">Only this profile's authoritative records. Current open sessions stay visible even if older than the selected range. Completed/archived sessions use their recorded update time. Charts never change budget charges. Deleted source history is not reconstructed.</InfoTip>
    </div>
    {range.kind === "custom" && <div className="dashboard-custom"><label>From<input type="date" aria-label="Dashboard range from" value={custom.from} onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} /></label><label>Through<input type="date" aria-label="Dashboard range through" value={custom.to} onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} /></label>
      <button type="button" disabled={!custom.from || !custom.to || custom.from > custom.to} onClick={() => setRange({ kind: "custom", ...custom })}>Apply range</button>{custom.from > custom.to && <Alert as="span" role="alert">From must be on or before Through.</Alert>}</div>}</>}
    {page === "My work" && <><MyWorkInbox sdk={sdk} snapshot={snapshot} connected={connected} openSession={openSession} projectId={projectId} initialItemId={roundupItem ?? initialItemId} initialFilters={initialFilters} onDirty={onDirty} />
      <ActiveSessions sdk={sdk} snapshot={snapshot} projectId={projectId} connected={connected} disabled={opening !== null} navigate={navigate} /></>}
    {page === "Analytics" && <AnalyticsView sdk={sdk} connected={connected} openSession={navigate} />}
    {page === "Dependencies" && <DependencyRoundup sdk={sdk} snapshot={snapshot} connected={connected} initialFilters={initialRoundupFilters}
      openItem={(itemId) => { setProjectId(""); setRoundupItem(itemId); setPage("My work"); }} />}
    {!analytics && current && state.error && <Alert as="p" className="inline-error" role="alert">{state.error}</Alert>}{navigationError && <Alert as="p" className="inline-error" role="alert">{navigationError}</Alert>}
    {!analytics && !data && !(current && state.error) && <p role="status">Reading authoritative dashboard data...</p>}
    {!analytics && data && <section aria-label={`${page} dashboard`}>
      <header className="dashboard-page-heading"><h2>{page}</h2><span>{data.window.from} to {data.window.to}</span></header>
      {data.window.excludedUncertainTimeCalls > 0 && <Alert as="p" tone="warning" className="settings-warning">{data.window.excludedUncertainTimeCalls} calls have no verified date and are excluded here. Detailed all-time accounting retains them.</Alert>}
      {page === "My work" ? <>
        <div className="dashboard-metrics"><Metric label="Open" value={count(data.work.open)} /><Metric label="In progress" value={count(data.work.inProgress)} /><Metric label="Completed" value={count(data.work.completed)} /><Metric label="Projects" value={count(data.projects.length)} /></div>
        <Trend title="Completed turns" values={data.days.map((value) => ({ date: value.date, value: value.completedTurns }))} />
        <div className="dashboard-projects">{data.projects.map((project) => <article className="dashboard-project" key={project.projectId ?? "chats"}><header><h3>{project.name}</h3><small>{knownTokens(project.totals)} tokens</small></header>
          <div className="work-ribbon" aria-hidden="true">{(["open", "inProgress", "completed", "archived"] as const).map((status) => <span key={status} className={status} style={{ flexGrow: project.work[status] }} />)}</div>
          <p className="work-counts">{project.work.open} open / {project.work.inProgress} in progress / {project.work.completed} completed{project.work.archived ? ` / ${project.work.archived} archived` : ""}</p>
          <ul>{project.sessionIds.map((id) => { const session = snapshot.sessions.find((value) => value.id === id); return session ? <li key={id}><button type="button" className="quiet" disabled={!connected || opening !== null} onClick={() => navigate(id)}>{session.title}</button><span>{sessionIndicator(session, snapshot).label}</span></li> : null; })}</ul>
          {!project.sessionIds.length && <p className="fine-print">No current or recently completed sessions in this range.</p>}
        </article>)}</div>{!data.projects.length && <p className="fine-print">No projects or chats yet. Choose New to start.</p>}
      </> : page === "Usage" ? <>
        <div className="dashboard-metrics"><Metric label="Reported tokens" value={knownTokens(data.totals)} /><Metric label="Model calls" value={count(data.totals.calls)} /><Metric label="Input tokens" value={data.totals.inputTokens === null ? "Not fully reported" : count(data.totals.inputTokens)} /><Metric label="Output tokens" value={data.totals.outputTokens === null ? "Not fully reported" : count(data.totals.outputTokens)} /></div>
        <Trend title="Reported tokens" values={data.days.map((value) => ({ date: value.date, value: value.totals.reportedTokens }))} />
        <div className="dashboard-breakdowns"><Breakdown title="Tokens by project" values={data.projects.map((value) => ({ id: value.projectId ?? "chats", ...value }))} /><Breakdown title="Tokens by model" values={data.models.map((value) => ({ id: value.modelId, ...value }))} /></div>
        {data.totals.unknownTokenCalls > 0 && <p className="fine-print">{data.totals.unknownTokenCalls} calls lack token reports. Gaps are not zero usage; cached input is not counted twice.</p>}
      </> : page === "Cost" ? <>
        <div className="dashboard-metrics"><Metric label="Estimated spend" value={data.totals.calls ? dollars(data.totals.knownEstimatedUsd) : "No model calls"} detail={data.totals.unpricedCalls ? "Known estimates only" : "Captured estimates, not invoices"} /><Metric label="Unpriced calls" value={count(data.totals.unpricedCalls)} /><Metric label="Held estimate" value={data.totals.heldUsd === null ? "Unknown" : dollars(data.totals.heldUsd)} /><Metric label="Billed spend" value="Not reported" /></div>
        <Trend title="Estimated cost (USD)" money values={data.days.map((value) => ({ date: value.date, value: value.totals.estimatedUsd }))} />
        <div className="dashboard-breakdowns"><Breakdown title="Estimated USD by project" money values={data.projects.map((value) => ({ id: value.projectId ?? "chats", ...value }))} /><Breakdown title="Estimated USD by model" money values={data.models.map((value) => ({ id: value.modelId, ...value }))} /></div>
        <p className="fine-print">{callEstimate(data.totals)}. Estimates, undispatched holds, provider reports and bills are distinct. Missing prices are not free usage.</p>
      </> : <>
        <div className="dashboard-metrics"><Metric label="Completed turns" value={count(data.velocity.completedTurns)} /><Metric label="Median completion" value={duration(data.velocity.medianCompletionMs)} /><Metric label="User interventions" value={count(data.velocity.interventions)} /><Metric label="Completion change" value={data.velocity.completionChangePercent === null ? "No baseline" : `${data.velocity.completionChangePercent >= 0 ? "+" : ""}${data.velocity.completionChangePercent.toFixed(1)}%`} detail={`${data.velocity.previousCompletedTurns} in the previous equal range`} /></div>
        <Trend title="Completed turns" values={data.days.map((value) => ({ date: value.date, value: value.completedTurns }))} />
        <div className="dashboard-breakdowns"><Trend title="User interventions" values={data.days.map((value) => ({ date: value.date, value: value.interventions }))} /><Trend title="Median completion (seconds)" values={data.days.map((value) => ({ date: value.date, value: value.medianCompletionMs === null ? null : value.medianCompletionMs / 1000 }))} /></div>
        <p className="fine-print">Not a measured productivity increase.</p><p className="fine-print">{data.velocity.failedTurns} failed turns / {data.velocity.interruptedTurns} stopped/partial turns / {data.velocity.unmeasuredCompletions} completions without valid timing. Only retained agent turns are observed. Interventions count actual user approvals and answers, not inferred rework or wasted time.</p>
      </>}
    </section>}
    {(page === "Usage" || page === "Cost") && <details className="dashboard-details"><summary>Detailed accounting and original records</summary><UsageDashboard key={JSON.stringify([sdk.profileId, range, projectId])} sdk={sdk} snapshot={snapshot} initialFilters={{ range, ...(projectId ? { projectId } : {}) }} /></details>}
  </section>;
}

function ActiveSessions({ sdk, snapshot, projectId, connected, disabled, navigate }: {
  sdk: MoguriSdk; snapshot: Snapshot; projectId: string; connected: boolean; disabled: boolean; navigate: (id: string) => void;
}) {
  const entries = (snapshot.profileId === sdk.profileId ? snapshot.sessions : []).filter((session) =>
    (!projectId || session.projectId === projectId) && session.status !== "archived" &&
    (session.turnId !== null || session.pendingApproval || session.pendingQuestionId || ["running", "waiting_input", "stopping"].includes(session.status)))
    .map((session) => {
      const waiting = Boolean(session.pendingApproval || session.pendingQuestionId || session.status === "waiting_input");
      const confirmed = waiting || session.turnId !== null && ["running", "stopping"].includes(session.status);
      return { session, waiting, label: confirmed ? sessionIndicator(session, snapshot).label : "Activity unconfirmed" };
    }).sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.session.updatedAt.localeCompare(a.session.updatedAt) || a.session.id.localeCompare(b.session.id));
  const attention = entries.filter((entry) => entry.waiting).length;
  return <section className="dashboard-active" aria-label="Active sessions">
    <header><h2>Active sessions</h2><span role="status" aria-atomic="true">{connected ?
      `${entries.length} active${entries.some((entry) => entry.label === "Activity unconfirmed") ? " or unconfirmed" : ""} / ${attention} need attention` : "Last observed activity; service is not connected."}</span></header>
    <p className="fine-print">Current activity in {snapshot.profile?.name ?? sdk.profileId}, independent of the date range. Held prompts are not active work.</p>
    {entries.length ? <ul>{entries.map(({ session, waiting, label }) => {
      const owner = session.projectId ? snapshot.projects.find((project) => project.id === session.projectId)?.name ?? "Unavailable project" :
        session.projectFolderId ? snapshot.projectFolders.find((folder) => folder.id === session.projectFolderId)?.name ?? "Unavailable project group" : "Project-free chat";
      return <li key={session.id}><button type="button" data-session-id={session.id} data-needs-attention={waiting || undefined}
        disabled={!connected || disabled} aria-label={`Open session ${sessionTitle(session)}`} onClick={() => navigate(session.id)}>
        <span className="dashboard-active-title">{sessionTitle(session)}<small>{owner} / {envLabel(session.controls.env)}</small></span>
        <span className="dashboard-active-state">{connected ? label : `Last observed: ${label}`}</span>
      </button></li>;
    })}</ul> : connected ? <p>No active sessions{projectId ? " in this project" : " in this profile"}.</p> : <p>Current activity is unavailable. Last observed records cannot confirm that no work is running.</p>}
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="dashboard-metric"><span>{label}</span><strong data-word={/\d/.test(value) ? undefined : true}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
