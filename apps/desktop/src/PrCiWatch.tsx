import { useEffect, useRef, useState } from "react";
import {
  githubCiOperationMatches, githubSourceOwner, type GithubPullSource, type GithubPreview, type GithubResponse,
  type GithubScope, type MoguriSdk, type Snapshot,
} from "@moguri-dev/sdk";
import type { GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";

type View = Extract<GithubResponse, { type: "github.ci" }>;
type Read = Extract<GithubResponse, { type: "github.read" }>;
export function PrCiWatch({ sdk, scope, snapshot, selection, reloadSource }: {
  sdk: MoguriSdk; scope: GithubScope; snapshot: Snapshot; selection: GithubSelection; reloadSource: () => Promise<void>;
}) {
  const source: GithubPullSource | null = selection.source.kind === "pull" ? { ...selection.source, kind: "pull" } : null;
  const owner = snapshot.sessions.find((session) => session.id === scope.sessionId);
  const key = JSON.stringify([sdk.profileId, scope, selection.source, selection.context.accountId, selection.item.headSha,
    githubSourceOwner(selection.binding), owner?.controls.env, owner?.mode, owner?.pendingMode, owner?.status === "archived",
    snapshot.projects.find((project) => project.id === scope.projectId)?.path,
    snapshot.managedWorkspaces.find((workspace) => workspace.id === scope.workspaceId)?.path,
    snapshot.policy.revision, snapshot.settings.permissionRevision,
    snapshot.projectConfigurations.find((configuration) => configuration.projectId === scope.projectId)?.revision]);
  const current = useRef(key); current.current = key;
  const pending = useRef(false);
  const [refresh, setRefresh] = useState(0), [view, setView] = useState<{ key: string; data?: View; error?: string } | null>(null);
  const [selectedId, setSelectedId] = useState(""), [page, setPage] = useState(0);
  const [review, setReview] = useState<GithubPreview | null>(null), [confirmed, setConfirmed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [read, setRead] = useState<{ key: string; value?: Read; error?: string } | null>(null);
  const records = source ? snapshot.githubOperations.filter((operation) => githubCiOperationMatches(operation,
    { repository: source.repository, accountId: selection.context.accountId, number: source.number }, selection.binding)).reverse() : [];
  const data = view?.key === key ? view.data : undefined, sourceError = view?.key === key ? view.error : undefined;
  const verified = Boolean(data && data.item.state === "open" && data.item.headSha === selection.item.headSha);
  const currentId = verified ? data?.currentWatchId : null;
  const record = records.find((record) => record.id === selectedId) ?? records.find((record) => record.id === currentId) ?? records[0];
  const readKey = JSON.stringify([record?.id, record?.ci?.observationDigest]);
  const observation = read?.key === readKey ? read.value?.ciObservation : undefined;
  const readError = read?.key === readKey ? read.error : undefined;
  const historical = !verified || record?.ci?.target.headSha !== data?.item.headSha ||
    record?.status !== "running" && record?.status !== "completed";

  useEffect(() => {
    const abort = new AbortController(), captured = key;
    setView({ key }); setReview(null); setConfirmed([]); setSelectedId(""); setPage(0); setError("");
    if (!source) { setView({ key, error: "Select an exact pull request before reading CI. No PR was inferred." }); return () => abort.abort(); }
    void sdk.github.ci(scope, source, abort.signal, selection.binding).then((data) => {
      if (data.accountId !== selection.context.accountId || JSON.stringify(githubSourceOwner(data.binding)) !== JSON.stringify(githubSourceOwner(selection.binding))) {
        throw new Error("The selected PR account/root changed. No replacement CI source was adopted.");
      }
      if (!abort.signal.aborted && current.current === captured) setView({ key: captured, data });
    }).catch((error: unknown) => {
      if (!abort.signal.aborted && current.current === captured) setView({ key: captured,
        error: error instanceof Error ? error.message : "The current PR source is unavailable. Retained observations are historical, not green CI." });
    });
    return () => abort.abort();
  }, [sdk, key, refresh]);
  useEffect(() => {
    const abort = new AbortController(), captured = readKey;
    if (!record?.id || !record.ci?.observationDigest) { setRead(null); return () => abort.abort(); }
    setRead({ key: readKey });
    void sdk.github.read(record.id, abort.signal).then((value) => { if (!abort.signal.aborted) setRead({ key: captured, value }); })
      .catch((error: unknown) => { if (!abort.signal.aborted) setRead({ key: captured,
        error: error instanceof Error ? error.message : "The original CI observation is unavailable. No replacement result was used." }); });
    return () => abort.abort();
  }, [sdk, readKey]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const captured = key;
    try { await action(); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Original CI ownership is unconfirmed. Inspect the retained watch; no retry was performed.";
      if (current.current === captured) setError(message); else console.error("Original PR CI operation:", message);
    } finally { pending.current = false; setBusy(false); }
  };
  const visible = observation?.items.slice(page * 20, (page + 1) * 20) ?? [];
  return <section className="pr-ci-watch" aria-label="Retained pull request CI watch">
    <h3>Watch CI at this exact head</h3>
    <p className="fine-print">Two-minute original watch, retained across views. No model, rerun, push or merge. Notifications follow your existing settings; a new head needs a fresh review.</p>
    {!data && !sourceError && <p role="status">Verifying the current PR source; no original watcher is restarted.</p>}
    {sourceError && <Alert as="p" role="alert">Current CI source unavailable: {sourceError} Retained results are historical.</Alert>}
    {data && <p className="fine-print path">PR source verified {new Date(data.verifiedAt).toLocaleString()} / {data.accountId} / current head {data.item.headSha ?? "unavailable"}.</p>}
    {data && !verified && <Alert as="p" role="alert">The selected PR head changed or the PR closed. Prior observations are historical, not current CI.
      <button type="button" disabled={busy} onClick={() => void run(reloadSource)}>Reload selected PR</button></Alert>}
    <button type="button" disabled={busy || !verified || record?.status === "running"} onClick={() => void run(async () => {
      if (!source) throw new Error("The exact PR source is unavailable.");
      const captured = key;
      const review = await sdk.github.previewCi(scope, source, { headSha: selection.item.headSha ?? undefined, binding: selection.binding });
      if (current.current === captured) { setReview(review); setConfirmed([]); }
    })}>Review exact CI watch</button>
    {review && <section aria-label="Exact PR CI watch review">
      <p className="fine-print path">{review.document.accountId} / {review.document.root.root} / {review.document.resource?.headSha}.</p>
      {review.document.confirmations.map((text) => <label className="check-setting" key={text}><input type="checkbox" checked={confirmed.includes(text)} disabled={busy}
        onChange={(event) => setConfirmed((values) => event.target.checked ? [...values, text] : values.filter((value) => value !== text))} />{text}</label>)}
      <button type="button" disabled={busy || review.document.confirmations.some((text) => !confirmed.includes(text))} onClick={() => void run(async () => {
        const captured = key, started = await sdk.github.execute(review, review.document.confirmations, true);
        if (!started.id) throw new Error("The original PR watcher was not acknowledged. Inspect its independent history.");
        if (current.current === captured) { setSelectedId(started.id); setReview(null); setPage(0); }
      })}>Start exact-head watch</button>
    </section>}
    {!records.length && <p className="fine-print">No retained PR watch for this exact account/root/PR. Legacy head-only watches are not reassociated.</p>}
    {records.length > 1 && <label className="setting-field">Retained watch<select aria-label="Retained PR CI watch" value={record?.id ?? ""} onChange={(event) => { setSelectedId(event.target.value); setPage(0); }}>
      {records.map((record) => <option key={record.id} value={record.id}>{record.id} / {record.status} / {record.ci?.target.headSha}</option>)}
    </select></label>}
    {record && <>
      <p role="status">Watch {record.status} / {record.id}. {record.cancelRequested && record.status === "running" ? "Cancellation requested; awaiting the original owner's acknowledgement." : ""} {record.diagnostic}</p>
      {record.ci?.observedAt && <p role="status" aria-atomic="true">{historical ? "Historical observation. " : ""}CI: {record.ci.state} / {record.ci.count} observations at {record.ci.target.headSha}.
        {record.ci.state !== "success" ? " Not successful CI." : " Observed success is not merge clearance."}
        {record.ci.deadlineReached ? " Watch deadline reached; GitHub work was not timed out or cancelled by Moguri." : ""}
        {record.ci.complete ? "" : " No complete collection was observed."}
      </p>}
      {record.ci?.observedAt && <p className="fine-print">Last refresh {new Date(record.ci.observedAt).toLocaleString()}.</p>}
      {record.ci?.cleanupUnconfirmed && <Alert as="p" role="alert">Original process cleanup remains unconfirmed. Inspection or a new view does not clear it.</Alert>}
      {record.status === "running" && <button type="button" disabled={busy} onClick={() => void run(() => sdk.github.cancel(record.id).then(() => {}))}>Cancel original CI watch</button>}
      <p className="fine-print">Original report: <code>moguri github read {record.id}</code>. No source root is needed to inspect retained evidence.</p>
    </>}
    {observation && <details><summary>Original watch observations ({observation.items.length})</summary>
      <p className="fine-print">Captured {new Date(observation.at).toLocaleString()}; normalized metadata, not raw logs. Showing {visible.length} of {observation.items.length} retained observations.</p>
      {visible.map((item) => <article className="pr-observation" key={`${item.kind}:${item.id}`}><strong>{item.title || `Unnamed ${item.kind} ${item.id}`}</strong>
        <p>{item.state} / {item.conclusion ?? "unknown conclusion"}</p>{item.body && <pre>{item.body}</pre>}
        {item.url ? <button type="button" disabled={busy} onClick={() => void run(() => window.moguri.openExternal(item.url!))}>Open original {item.kind} link</button> :
          <p className="fine-print">The provider did not supply a canonical link.</p>}
      </article>)}
      <div className="button-row">{page > 0 && <button type="button" onClick={() => setPage((page) => page - 1)}>Previous retained observations</button>}
        {(page + 1) * 20 < observation.items.length && <button type="button" onClick={() => setPage((page) => page + 1)}>Next retained observations</button>}</div>
    </details>}
    {readError && <Alert as="p" role="alert">{readError}</Alert>}{error && <Alert as="p" role="alert">{error}</Alert>}
    <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Refresh CI source</button>
  </section>;
}
