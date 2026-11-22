import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, MyWorkEntry, MyWorkFilters, MyWorkResponse, MyWorkSourcePreview, Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

type Inbox = Extract<MyWorkResponse, { type: "my_work.query" }>;
type Followup = Extract<MyWorkResponse, { type: "my_work.followup" }>;
const labels = { "open-pr": "Open PR", "pending-review": "Review requested", "failed-ci": "Failed CI", "unresolved-thread": "Unresolved threads" } as const;
const at = (time: string | null) => time ? new Date(time).toLocaleString() : "Not observed";
const short = (head: string | null) => head?.slice(0, 12) ?? "Unobserved head";

export function MyWorkInbox({ sdk, snapshot, connected, openSession, initialItemId, initialFilters, projectId, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; connected: boolean; openSession: (id: string) => Promise<void>;
  initialItemId?: string | null; initialFilters?: MyWorkFilters; projectId?: string; onDirty?: (dirty: boolean) => void;
}) {
  const [filters, setFilters] = useState<MyWorkFilters>({}), [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ sdk: MoguriSdk; selectionKey: string; key: string; value?: Inbox; error?: string } | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [configurationProject, setConfigurationProject] = useState(""), [workspace, setWorkspace] = useState("");
  const [preview, setPreview] = useState<MyWorkSourcePreview | null>(null), [followup, setFollowup] = useState<{ sourceId: string; value: Followup } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId ?? null), [sourceId, setSourceId] = useState("");
  const [original, setOriginal] = useState<Extract<MyWorkResponse, { type: "my_work.read" }> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), focused = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selectionKey = JSON.stringify([filters, offset, projectId, connected, snapshot.myWorkSources, snapshot.policy.revision,
    snapshot.settings.permissionRevision, snapshot.projectConfigurations.map((value) => [value.projectId, value.revision])]);
  const key = JSON.stringify([selectionKey, reload,
    snapshot.myWorkRefreshes.map((record) => [record.id, record.revision]), snapshot.githubOperations.map((record) => [record.id, record.revision])]);
  const data = connected && result?.sdk === sdk && result.selectionKey === selectionKey ? result.value : undefined;
  const updating = Boolean(data && result?.key !== key);
  const refreshing = snapshot.myWorkRefreshes.find((record) => record.status === "running");
  const selected = data?.entries.find((entry) => entry.id === selectedId);
  useEffect(() => {
    if (!initialItemId && initialFilters === undefined) return;
    setSelectedId(initialItemId ?? initialFilters?.itemId ?? null);
    setFilters(initialItemId ? { itemId: initialItemId, state: "all" } : initialFilters ?? {}); setOffset(0);
    setSourceId(""); setFollowup(null); setOriginal(null);
  }, [sdk, initialItemId, initialFilters]);
  useEffect(() => {
    const abort = new AbortController();
    if (!connected) { setResult({ sdk, selectionKey, key, error: "This profile's inbox is unavailable while disconnected. No empty or clean result was substituted." }); return; }
    void sdk.myWork.query({ ...filters, ...(projectId ? { projectId } : {}) }, { offset, signal: abort.signal })
      .then((value) => { if (!abort.signal.aborted) setResult({ sdk, selectionKey, key, value }); })
      .catch((error: unknown) => { if (!abort.signal.aborted) setResult({ sdk, selectionKey, key, error: error instanceof Error ? error.message : "Inbox observations are unavailable. No empty results were substituted." }); });
    return () => abort.abort();
  }, [sdk, key]);
  useEffect(() => {
    onDirty?.(preview !== null || followup !== null);
    return () => onDirty?.(false);
  }, [onDirty, preview, followup]);
  useEffect(() => {
    if (selected && focused.current !== selected.id && heading.current) { focused.current = selected.id; heading.current.focus(); }
  }, [selected]);
  const change = (patch: Partial<MyWorkFilters>) => { setFilters((value) => ({ ...value, ...patch, itemId: undefined })); setOffset(0); setFollowup(null); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The exact inbox action failed. No success or replacement source was inferred."); }
    finally { setBusy(false); }
  };
  const choose = (entry: MyWorkEntry) => {
    setSelectedId(entry.id); setSourceId(entry.associations.length === 1 ? entry.associations[0]!.source.id : "");
    setFollowup(null); setOriginal(null);
  };
  const sources = snapshot.myWorkSources, repositories = [...new Set(sources.filter((source) => source.enabled).map((source) => source.repository))];
  const accounts = [...new Map(sources.filter((source) => source.enabled).map((source) => [source.accountId, source.account])).entries()];
  const currentSourceId = sourceId || (selected?.associations.length === 1 ? selected.associations[0]!.source.id : "");
  const related = selected?.associations.flatMap((association) => association.sessionIds.map((id) => ({ id, sourceId: association.source.id })))
    .filter((value, index, all) => all.findIndex((other) => other.id === value.id) === index) ?? [];
  return <section className="my-work-inbox" aria-label="GitHub My Work inbox" data-ready={Boolean(!updating && data || result?.sdk === sdk && result.key === key && result.error)} data-filters={JSON.stringify(filters)}>
    <header className="my-work-heading"><div><h2>GitHub attention</h2><p className="fine-print">Explicitly configured repos and accounts in {snapshot.profile?.name ?? sdk.profileId}. Controller gh, not SSH credentials.</p></div>
      <div className="button-row"><button type="button" disabled={!connected || busy || Boolean(refreshing) || !sources.some((source) => source.enabled)}
        onClick={() => void run(async () => { const result = await sdk.myWork.refresh(); setNotice(`Refresh admitted: ${result.id}. Observations and failures remain retained.`); })}>Refresh configured repos</button>
        {refreshing && <button type="button" disabled={busy} onClick={() => void run(async () => {
          const id = refreshing.id; await sdk.myWork.cancel(id); setNotice("Original refresh stopped. Retained partial observations remain; CI watches and GitHub jobs were not cancelled.");
        })}>Stop inbox refresh</button>}</div>
    </header>
    <p role="status" aria-atomic="true">{refreshing ? `Refresh running / ${refreshing.id}` : data ? `Retained view read at ${at(data.observedAt)}. No recurring refresh.` : "Reading retained inbox observations..."}</p>
    {updating && <p role="status">Updating retained view. Previous observations remain visible; they are not proof of current CI.</p>}
    {notice && <p role="status">{notice}</p>}{error && <Alert as="p" role="alert">{error}</Alert>}
    {snapshot.myWorkRefreshes.filter((record) => record.cleanupUnconfirmed && !record.inspection).map((record) => <details className="github-write-review" key={record.id}>
      <summary>Unconfirmed original reader {record.id}</summary><p>{record.diagnostic}</p>
      <p className="fine-print">Original revision {record.revision} / input {record.inputDigest}. Inspection does not confirm cleanup or grant permissions; it permits a separate independent read.</p>
      <button type="button" disabled={busy || !connected} onClick={() => void run(async () => {
        await sdk.myWork.inspect(record.id, record.revision, record.inputDigest, true); setNotice("Original reader inspected. Its outcome and cleanup remain partial/unconfirmed. Refresh separately.");
      })}>I inspected this original partial refresh</button>
    </details>)}
    {result?.sdk === sdk && result.key === key && result.error && <Alert as="p" role="alert">{result.error}</Alert>}
    <details className="my-work-sources"><summary>Configured repositories ({sources.filter((source) => source.enabled).length})</summary>
      <p className="fine-print">Adding a source is explicit, read-only and profile-owned. Missing/inactive accounts fail instead of switching credentials. Changed bindings need a new review.</p>
      <div className="my-work-source-form">
        <label>Project<select aria-label="My Work source project" disabled={busy} value={configurationProject} onChange={(event) => { setConfigurationProject(event.target.value); setWorkspace(""); setPreview(null); }}>
          <option value="">Choose a configured project</option>{snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>Local root<select aria-label="My Work source workspace" disabled={busy} value={workspace} onChange={(event) => { setWorkspace(event.target.value); setPreview(null); }}>
          <option value="">Project checkout</option>{snapshot.managedWorkspaces.filter((value) => value.projectId === configurationProject && value.status !== "removed").map((value) =>
            <option value={value.id} key={value.id}>{value.branch} / {value.path}</option>)}</select></label>
        <button type="button" disabled={!configurationProject || busy || !connected} onClick={() => void run(async () => {
          const value = await sdk.myWork.previewSource({ env: "Local", projectId: configurationProject, ...(workspace ? { workspaceId: workspace } : {}) }); setPreview(value.preview);
        })}>Review inbox source</button>
      </div>
      {preview && <section className="github-write-review" aria-label="Reviewed My Work source">
        <strong>{preview.source.repository} / {preview.source.accountId}</strong><code>{preview.source.binding.root.root}</code>
        <p className="fine-print">{preview.warning}</p><div className="button-row">
          <button type="button" className="primary" disabled={busy || !connected} onClick={() => void run(async () => {
            await sdk.myWork.configure(preview, true); setPreview(null); setNotice("Source configured. Refresh explicitly to observe its work.");
          })}>Confirm read-only source</button><button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel source review</button>
        </div>
      </section>}
      <ul>{sources.map((source) => <li key={source.id}>
        <div><strong>{source.repository}</strong><small>{source.accountId} / {source.enabled ? "Enabled" : "Disabled; original reports retained"}</small><code>{source.binding.root.root}</code></div>
        <button type="button" disabled={busy || !connected} onClick={() => void run(async () => {
          await sdk.myWork.toggle(source.id, source.revision, !source.enabled); setNotice(`Source ${source.enabled ? "disabled" : "enabled"}. No recurring work starts.`);
        })}>{source.enabled ? "Disable source" : "Enable source"}</button>
      </li>)}</ul>{!sources.length && <p>No repositories configured. Review a source above; Moguri never scans unconfigured repositories.</p>}
    </details>
    <fieldset className="my-work-filters" disabled={busy} aria-label="My Work filters">
      <label>Reason<select aria-label="My Work category" value={filters.category ?? ""} onChange={(event) => {
        const category = Object.keys(labels).find((key) => key === event.target.value) as keyof typeof labels | undefined; change({ category });
      }}><option value="">All work</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label} ({data?.counts[value as keyof typeof labels] ?? "?"})</option>)}</select></label>
      <label>Repository<select aria-label="My Work repository" value={filters.repository ?? ""} onChange={(event) => change({ repository: event.target.value || undefined })}>
        <option value="">All configured repos</option>{repositories.map((repository) => <option value={repository} key={repository}>{repository}</option>)}</select></label>
      <label>Account<select aria-label="My Work account" value={filters.accountId ?? ""} onChange={(event) => change({ accountId: event.target.value || undefined })}>
        <option value="">All configured accounts</option>{accounts.map(([id, account]) => <option value={id} key={id}>{account} / {id}</option>)}</select></label>
      <label>PR state<select aria-label="My Work PR state" value={filters.state ?? "open"} onChange={(event) => {
        const state = (["open", "closed", "merged", "all"] as const).find((state) => state === event.target.value); change({ state });
      }}>{(["open", "closed", "merged", "all"] as const).map((state) => <option value={state} key={state}>{state === "all" ? "Any state" : state}</option>)}</select></label>
      <label>Freshness<select aria-label="My Work freshness" value={filters.freshness ?? ""} onChange={(event) => {
        const freshness = (["fresh", "stale", "partial", "unobserved"] as const).find((value) => value === event.target.value); change({ freshness });
      }}><option value="">All observations</option><option value="fresh">Complete within five minutes</option><option value="stale">Stale</option><option value="partial">Partial</option><option value="unobserved">Unobserved</option></select></label>
      <label>Search<input aria-label="My Work search" value={filters.text ?? ""} onChange={(event) => change({ text: event.target.value })} /></label>
      {filters.itemId && <button type="button" onClick={() => { setFilters({}); setSelectedId(null); setOffset(0); }}>Show all work</button>}
    </fieldset>
    {data && <section className="my-work-freshness" aria-label="Repository observation status">{data.sources.map((state) => <div key={state.source.id} data-freshness={state.freshness}>
      <strong>{state.source.repository}</strong><span>{state.source.accountId} / {state.freshness} / {at(state.observedAt)}</span>
      {state.diagnostic && <Alert as="p" tone="warning">{state.diagnostic}</Alert>}
      {!state.observedAt && <p className="fine-print">No observation. This source cannot confirm a clean inbox.</p>}
    </div>)}</section>}
    {data && <><div className="my-work-list" aria-label="Observed pull requests">
      {data.entries.map((entry) => <article key={entry.id} className="my-work-card" data-item-id={entry.id} data-freshness={entry.freshness}>
        <button type="button" disabled={busy} className="quiet my-work-select" aria-label={`Inspect ${entry.repository}#${entry.number}`} aria-expanded={selectedId === entry.id} onClick={() => choose(entry)}>
          <span><code>{entry.repository}#{entry.number}</code><strong>{entry.pull.item.title}</strong></span><span>{entry.pull.item.state}{entry.pull.item.draft ? " / draft" : ""}</span>
        </button><div className="my-work-reasons">{entry.categories.map((category) => <span key={category} data-reason={category}>{labels[category]}</span>)}</div>
        <div className="my-work-evidence"><span>PR <code>{short(entry.pull.item.headSha)}</code> / {at(entry.pull.observedAt)}</span>
          <span>CI <strong>{entry.pull.ci?.state ?? "unobserved"}</strong> / {at(entry.pull.ci?.at ?? null)}</span><span>{entry.freshness}{entry.conflicting ? " / conflicting source heads or state" : ""}</span></div>
      </article>)}
      {!data.entries.length && <p>{data.sources.length ? "No retained PRs match these filters. Check every source's observation/failure status above; missing evidence is not a clean inbox." :
        "Configure a repository and refresh explicitly to see PRs, pending reviews, failed CI and unresolved threads."}</p>}
    </div><div className="button-row"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous work page</button>
      <span>{data.total} matching PRs / one entry per canonical item</span><button type="button" disabled={offset + 30 >= data.total} onClick={() => setOffset(offset + 30)}>Next work page</button>
      <button type="button" disabled={!connected || busy} onClick={() => setReload((value) => value + 1)}>Reload retained view</button></div></>}
    {selected && <section className="my-work-detail" aria-label="My Work item details">
      <h3 ref={heading} tabIndex={-1}>{selected.repository}#{selected.number}: {selected.pull.item.title}</h3>
      <p>{selected.pull.item.state} / head <code>{selected.pull.item.headSha}</code> / review {selected.pull.reviewDecision ?? "No provider decision observed"}</p>
      <p className="fine-print">PR observed {at(selected.pull.observedAt)}. CI observed {at(selected.pull.ci?.at ?? null)}. Viewing is not permission to write.</p>
      {selected.pull.diagnostic && <Alert as="p" tone="warning">{selected.pull.diagnostic}</Alert>}
      <details><summary>Complete retained PR body</summary><pre>{selected.pull.item.body}</pre></details>
      <div className="button-row"><button type="button" onClick={() => void run(() => window.moguri.openExternal(selected.url))}>Open on GitHub</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.myWork.markRead(selected.id); setNotice("Marked read, not resolved or approved."); })}>Mark inbox item read</button>
        {related.map(({ id, sourceId }) => <button key={id} type="button" disabled={!connected || busy} onClick={() => void run(async () => {
          const target = await sdk.myWork.navigate(selected.id, sourceId);
          if (!target.navigation.sessionIds.includes(id)) throw new Error("The exact related session/source changed. No replacement session was opened.");
          await openSession(id);
        })}>Open session {snapshot.sessions.find((session) => session.id === id)?.title ?? id}</button>)}</div>
      <h4>Outstanding review requests</h4>
      {selected.pull.requests === null ? <p>Review requests unobserved.</p> : selected.pull.requests.length ? <ul>{selected.pull.requests.map((request) =>
        <li key={`${request.kind}:${request.login}`}>{request.kind}: {request.login}{request.kind === "team" || request.kind === "enterprise-team" ? " (team membership is not inferred)" : ""}</li>)}</ul> : <p>No outstanding requests at the recorded observation.</p>}
      <h4>Review conversations</h4>{selected.pull.threads === null ? <p>Threads unobserved. Comments are not proof of resolution.</p> : selected.pull.threads.length ?
        <ul>{selected.pull.threads.map((thread) => <li key={thread.id}><strong>{thread.resolved ? "Resolved" : "Unresolved"}{thread.outdated ? " / outdated" : ""}</strong>
          <span> {thread.path}{thread.line ? `:${thread.line}` : ""}</span><pre>{thread.body}</pre>
          <button type="button" onClick={() => void run(() => window.moguri.openExternal(thread.url))}>Open original conversation</button></li>)}</ul> : <p>No review threads at the recorded observation.</p>}
      <h4>Exact-head CI: {selected.pull.ci?.state ?? "unobserved"}</h4>
      {selected.pull.ciWatchId && <p className="fine-print">Original CI source: retained watch {selected.pull.ciWatchId}; this refresh did not start a poller.</p>}
      {selected.pull.ci?.state === "no-checks" && <p>No checks observed. This is not successful CI or merge clearance.</p>}
      <ul>{selected.pull.ci?.items.map((item) => <li key={`${item.kind}:${item.id}`}><strong>{item.title || `${item.kind} ${item.id}`}</strong> / {item.state} / {item.conclusion ?? "No conclusion"}
        {item.body && <pre>{item.body}</pre>}{item.url && <button type="button" onClick={() => void run(() => window.moguri.openExternal(item.url!))}>Open CI source</button>}</li>)}</ul>
      <details><summary>Original source associations and retained watches</summary>{selected.associations.map((association) => <div className="github-binding" key={association.source.id}>
        <strong>{association.source.accountId} / {association.source.binding.projectId}</strong><code>{association.source.binding.root.root}</code>
        <small>Original PR head {short(association.pull.item.headSha)} / {association.pull.item.state} / {association.freshness}. Original refresh {association.refreshId}.</small>
        {association.diagnostic && <p>{association.diagnostic}</p>}
        {association.previous && <p>Previous complete source report {association.previous.refreshId}: PR head {short(association.previous.pull.item.headSha)} /
          CI {association.previous.pull.ci?.state ?? "unobserved"} at {at(association.previous.pull.ci?.at ?? null)}. Historical evidence, not a newer or passing head.</p>}
        {association.previous && <button type="button" disabled={busy} onClick={() => void run(async () => {
          setOriginal(await sdk.myWork.read(association.previous!.refreshId, { sourceId: association.source.id }));
        })}>Read previous complete source report</button>}
        {association.watch && <p>Retained watch {association.watch.operationId}: {association.watch.status} / CI {association.watch.observation?.state ?? "unobserved"} /
          {at(association.watch.observation?.at ?? null)}{association.watch.currentHead ? " / same observed head" : " / different original head; not current CI"}{association.watch.cleanupUnconfirmed ? " / cleanup unconfirmed" : ""}. Opening this view does not restart or cancel it.</p>}
        {association.refreshId && <button type="button" disabled={busy} onClick={() => void run(async () => { setOriginal(await sdk.myWork.read(association.refreshId!, { sourceId: association.source.id })); })}>Read original source report</button>}
      </div>)}</details>
      {original && <details open><summary>Original refresh {original.refresh.id} / {original.refresh.status}</summary><pre>{JSON.stringify(original, null, 2)}</pre></details>}
      <div className="my-work-followup"><label>Follow-up source<select aria-label="My Work follow-up source" value={currentSourceId} onChange={(event) => { setSourceId(event.target.value); setFollowup(null); }}>
        <option value="">Choose an exact account/root</option>{selected.associations.map((association) => <option key={association.source.id} value={association.source.id}>
          {association.source.accountId} / {snapshot.projects.find((project) => project.id === association.source.binding.projectId)?.name ?? "Removed project"} / {association.source.binding.root.root}</option>)}</select></label>
        <button type="button" disabled={!currentSourceId || busy || !connected} onClick={() => void run(async () => {
          setFollowup({ sourceId: currentSourceId, value: await sdk.myWork.previewFollowup(selected.id, currentSourceId) });
        })}>Review scoped follow-up</button>
      </div>
      {followup && <section className="github-write-review" aria-label="Reviewed My Work follow-up"><strong>{followup.value.item.title}</strong>
        <pre>{followup.value.item.body}</pre><p>{followup.value.warning}</p><div className="button-row">
          <button type="button" disabled={busy || !connected} onClick={() => void run(async () => {
            const accepted = followup; setFollowup(null); onDirty?.(false);
            let started;
            try { started = await sdk.myWork.start(accepted.value, accepted.sourceId, true); }
            catch (error) { if (mounted.current) setFollowup(accepted); throw error; }
            if (!started.id) throw new Error("The exact follow-up session was not acknowledged. No replacement was opened.");
            if (mounted.current) await openSession(started.id);
          })}>Confirm idle follow-up session</button><button type="button" disabled={busy} onClick={() => setFollowup(null)}>Cancel follow-up review</button>
        </div></section>}
    </section>}
  </section>;
}
