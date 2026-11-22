import { useEffect, useRef, useState } from "react";
import {
  ROUNDUP_DEFAULT_BOTS, activeRoundupRun, describeAutomationSchedule, outcomeLabel,
  type AutomationSchedule, type MoguriSdk, type RoundupFilters, type RoundupResponse, type RoundupUpdate, type Snapshot,
} from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const at = (time: string | null) => time ? new Date(time).toLocaleString() : "Not observed";
const problemText = { failed: "Read failed", partial: "Incomplete", stale: "Stale", unobserved: "Not read yet", disabled: "Disabled in My Work", missing: "Removed source" } as const;
const runLabel = (status: string) => status === "skipped" ? { label: "Skipped", tone: "neutral" as const } :
  status === "starting" || status === "running" ? { label: "Reading", tone: "running" as const } : outcomeLabel(status);

/**
 * Dependency update roundup (#8): read-only, model-free grouping of update-bot PRs from configured My Work sources.
 * Follow-up work opens the exact PR in My Work, where an idle source-bound chat is only created after review.
 */
export function DependencyRoundup({ sdk, snapshot, connected, openItem, initialFilters }: {
  sdk: MoguriSdk; snapshot: Snapshot; connected: boolean; openItem: (itemId: string) => void; initialFilters?: RoundupFilters;
}) {
  const settings = snapshot.dependencyRoundup, latest = snapshot.dependencyRoundupRuns[0] ?? null, active = snapshot.dependencyRoundupRuns.find(activeRoundupRun);
  const [filters, setFilters] = useState<RoundupFilters>(initialFilters ?? {}), [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; value?: RoundupResponse; error?: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [editing, setEditing] = useState(false);
  const pending = useRef(false);
  useEffect(() => { if (initialFilters) setFilters(initialFilters); }, [initialFilters]);
  const key = JSON.stringify([filters, reload, connected, settings?.revision, snapshot.dependencyRoundupRuns.map((run) => [run.id, run.revision]),
    snapshot.myWorkSources.map((source) => [source.id, source.revision]), snapshot.myWorkRefreshes.map((record) => [record.id, record.revision])]);
  useEffect(() => {
    const abort = new AbortController();
    if (!connected) { setResult({ key, error: "The roundup is unavailable while this profile is disconnected. No empty roundup was substituted." }); return; }
    void sdk.roundups.query(filters, abort.signal).then((value) => { if (!abort.signal.aborted) setResult({ key, value }); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : "The roundup is unavailable. No empty roundup was substituted." }); });
    return () => abort.abort();
  }, [sdk, key]);
  const act = async (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The roundup action failed. Nothing else changed."); }
    finally { pending.current = false; setBusy(false); }
  };
  const data = result?.value, updates = new Map(data?.updates.map((update) => [update.itemId, update]) ?? []);
  const ecosystems = [...new Set(data?.updates.flatMap((update) => update.packages.flatMap((entry) => entry.ecosystem ? [entry.ecosystem] : [])) ?? [])].sort();
  return <section className="dependency-roundup" aria-label="Dependency updates" data-ready={data ? "true" : "false"} data-filters={JSON.stringify(filters)}>
    <header className="dashboard-page-heading"><h2>Dependency updates</h2>
      {settings && <span>{settings.schedule ? `${describeAutomationSchedule(settings.schedule)}${settings.status === "active" ? `, next ${at(settings.nextAt)}` : ", schedule off"}` : "Manual roundups"}</span>}</header>
    <p className="fine-print">Open PRs from {settings ? settings.bots.join(", ") : "update bots"} in the My Work sources you choose, grouped by package. Reading is read-only and never calls a model.
      Security notes come only from each PR&apos;s own labels, title and advisory links; a PR without them is not a statement that a package is secure. &ldquo;Likely breaking&rdquo; is a version and text heuristic.</p>
    <div className="button-row">
      <button type="button" className="primary" disabled={!connected || busy || !settings || Boolean(active)} onClick={() => void act(() => sdk.roundups.refresh())}>Refresh roundup</button>
      {active?.refreshId && <button type="button" disabled={busy} onClick={() => void act(() => sdk.roundups.cancel(active.id))}>Stop</button>}
      <button type="button" disabled={busy} onClick={() => setEditing((value) => !value)}>{settings ? "Change sources and bots" : "Set up roundups"}</button>
      {settings?.schedule && <label className="check-setting"><input type="checkbox" role="switch" checked={settings.status === "active"} disabled={!connected || busy}
        onChange={(event) => void act(() => sdk.roundups.setSchedule(event.target.checked, settings.revision))} />On schedule</label>}
    </div>
    {latest && <p className="roundup-run" data-run-id={latest.id}><StatusBadge status={runLabel(latest.status)} /> {latest.trigger === "manual" ? "Manual" : "Scheduled"} roundup {at(latest.createdAt)}
      {latest.summary && `: ${latest.summary.updates} updates in ${latest.summary.groups} groups, ${latest.summary.security} with reported security, ${latest.summary.failingChecks} failing checks`}
      {latest.diagnostic && <span className="fine-print"> {latest.diagnostic}</span>}</p>}
    {editing && <RoundupSetup sdk={sdk} snapshot={snapshot} close={() => setEditing(false)} />}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {result?.error && <Alert as="p" className="inline-error" role="alert">{result.error}</Alert>}
    {data && !data.settings && !editing && <p>Choose My Work sources and update bots to start a roundup.</p>}
    {data && data.sources.some((source) => source.problem) && <ul className="roundup-sources" aria-label="Source problems">{data.sources.filter((source) => source.problem).map((source) =>
      <li key={source.sourceId}><strong>{source.repository ?? source.sourceId.slice(0, 12)}</strong> {problemText[source.problem!]}{source.diagnostic && <span className="fine-print"> {source.diagnostic}</span>}</li>)}</ul>}
    {data?.settings && <div className="dashboard-filters" role="group" aria-label="Roundup filters">
      <label>State<select aria-label="Roundup PR state" value={filters.state ?? "open"} onChange={(event) => setFilters((value) => ({ ...value, state: event.target.value as RoundupFilters["state"] }))}>
        <option value="open">Open</option><option value="closed">Closed</option><option value="merged">Merged</option><option value="all">All</option></select></label>
      <label>Ecosystem<select aria-label="Roundup ecosystem" value={filters.ecosystem ?? ""} onChange={(event) => setFilters(({ ecosystem: _, ...value }) => event.target.value ? { ...value, ecosystem: event.target.value } : value)}>
        <option value="">All</option>{ecosystems.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="check-setting"><input type="checkbox" checked={filters.security === true} onChange={(event) => setFilters(({ security: _, ...value }) => event.target.checked ? { ...value, security: true } : value)} />Reported security only</label>
      <label className="check-setting"><input type="checkbox" checked={filters.breaking === true} onChange={(event) => setFilters(({ breaking: _, ...value }) => event.target.checked ? { ...value, breaking: true } : value)} />Likely breaking only</label>
      <label>Search<input aria-label="Search roundup" value={filters.text ?? ""} onChange={(event) => setFilters(({ text: _, ...value }) => event.target.value ? { ...value, text: event.target.value } : value)} /></label>
      <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Reload</button>
    </div>}
    {data?.settings && !data.complete && <Alert as="p" tone="warning">Some sources are incomplete, stale or unreadable, so this roundup may be missing updates.</Alert>}
    {data?.settings && !data.groups.length && <p className="fine-print">No update PRs match in the retained observations.</p>}
    {data?.groups.map((group) => <article key={group.key} className="roundup-group" aria-label={`${group.name} updates`}>
      <header><h3>{group.name}</h3><span className="fine-print">{group.ecosystems.join(", ") || "Ecosystem unknown"}{group.versions.length ? ` → ${group.versions.join(", ")}` : ""}</span>
        {group.security && <StatusBadge status={{ label: "Security reported", tone: "failed" }} />}
        {group.likelyBreaking && <StatusBadge status={{ label: "Likely breaking", tone: "attention" }} />}
        {group.failingChecks > 0 && <StatusBadge status={{ label: `${group.failingChecks} failing`, tone: "failed" }} />}</header>
      <ul>{group.itemIds.map((id) => { const update = updates.get(id); return update ? <RoundupRow key={id} update={update} openItem={openItem} /> : null; })}</ul>
    </article>)}
  </section>;
}

function RoundupRow({ update, openItem }: { update: RoundupUpdate; openItem: (itemId: string) => void }) {
  return <li className="roundup-update" data-item-id={update.itemId}>
    <div><strong>{update.repository}#{update.number}</strong> {update.title}</div>
    <div className="fine-print">{update.state}{update.draft ? ", draft" : ""} · CI {update.ci ?? "not observed"} · review {update.reviewDecision ?? "no decision"}
      {update.unresolvedThreads ? ` · ${update.unresolvedThreads} unresolved threads` : ""} · {update.freshness}{update.conflicting ? " · sources disagree" : ""} · observed {at(update.observedAt)}
      {update.sources.length > 1 ? ` · seen through ${update.sources.length} sources` : ""}</div>
    {update.packages.length > 0 && <div className="fine-print">{update.packages.map((entry) => `${entry.name} ${entry.from ?? "?"} → ${entry.to ?? "?"} (${entry.updateType})`).join("; ")}</div>}
    {update.security ? <div className="roundup-security">Reported by the PR: {update.security.signals.join(", ")}
      {update.security.advisories.map((advisory) => advisory.url ?
        <button key={advisory.id} type="button" className="quiet" onClick={() => void window.moguri.openExternal(advisory.url!)}>{advisory.id}</button> : <span key={advisory.id}> {advisory.id}</span>)}</div> :
      <div className="fine-print">No advisory information in this PR.</div>}
    {update.breaking.likely && <div className="fine-print">Likely breaking (heuristic): {update.breaking.signals.join(", ")}</div>}
    <div className="button-row">
      <button type="button" onClick={() => void window.moguri.openExternal(update.url)}>Open on GitHub</button>
      <button type="button" onClick={() => openItem(update.itemId)}>Open in My Work</button>
    </div>
  </li>;
}

function RoundupSetup({ sdk, snapshot, close }: { sdk: MoguriSdk; snapshot: Snapshot; close: () => void }) {
  const current = snapshot.dependencyRoundup, sources = snapshot.myWorkSources.filter((source) => source.enabled || current?.sourceIds.includes(source.id));
  const [selected, setSelected] = useState<string[]>(current?.sourceIds ?? []), [bots, setBots] = useState((current?.bots ?? [...ROUNDUP_DEFAULT_BOTS]).join(", "));
  const [kind, setKind] = useState<"none" | "once" | "daily" | "weekly" | "interval">(current?.schedule?.kind ?? "none");
  const [time, setTime] = useState(current?.schedule && "time" in current.schedule ? current.schedule.time : "09:00");
  const [minutes, setMinutes] = useState(String(current?.schedule?.kind === "interval" ? current.schedule.minutes : 1440));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const zone = current?.schedule?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const schedule = (): AutomationSchedule | null => kind === "none" ? null : kind === "once" ? current?.schedule ?? null : kind === "interval" ? { kind, minutes: Number(minutes), timeZone: zone } :
    kind === "weekly" ? { kind, days: current?.schedule?.kind === "weekly" ? current.schedule.days : [1, 2, 3, 4, 5], time, timeZone: zone } : { kind, time, timeZone: zone };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const next = schedule();
      await sdk.roundups.configure({ sourceIds: selected, bots: bots.split(/[\s,]+/).filter(Boolean), schedule: next,
        scheduleEnabled: next !== null && (current?.status === "active" && current.nextAt !== null || !current?.schedule) }, current?.revision ?? null);
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The roundup settings were not saved."); }
    finally { setBusy(false); }
  };
  return <form className="roundup-setup" aria-label="Roundup setup" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <fieldset><legend>My Work sources</legend>
      {!sources.length && <p className="fine-print">Configure repositories in My Work first. Roundups never read anything else.</p>}
      {sources.map((source) => <label key={source.id} className="check-setting"><input type="checkbox" checked={selected.includes(source.id)} disabled={busy}
        onChange={(event) => setSelected((value) => event.target.checked ? [...value, source.id] : value.filter((id) => id !== source.id))} />
        {source.repository} ({source.accountId.split(":")[0]}){source.enabled ? "" : ", disabled"}</label>)}</fieldset>
    <label className="setting-field">Update bots (GitHub logins)<input value={bots} disabled={busy} onChange={(event) => setBots(event.target.value)} /></label>
    <label className="setting-field">Schedule<select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as typeof kind)}>
      <option value="none">Manual only</option>{current?.schedule?.kind === "once" && <option value="once">One time (keep current)</option>}<option value="daily">Every day</option><option value="weekly">Weekdays</option><option value="interval">Every few hours</option></select></label>
    {(kind === "daily" || kind === "weekly") && <label className="setting-field">Time ({zone})<input type="time" value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} /></label>}
    {kind === "interval" && <label className="setting-field">Every (minutes, at least 15)<input type="number" min={15} max={43200} value={minutes} disabled={busy} onChange={(event) => setMinutes(event.target.value)} /></label>}
    <p className="fine-print">Scheduled roundups need Moguri running; a missed time runs once when it is back, and a time is skipped while a roundup is still reading.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div className="button-row"><button type="button" disabled={busy} onClick={close}>Cancel</button>
      <button type="submit" className="primary" disabled={busy || !selected.length}>Save roundup settings</button></div>
  </form>;
}
