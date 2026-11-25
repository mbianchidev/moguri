import { useEffect, useState } from "react";
import type { MoguriSdk, OperationEntry, ProfileStorage, Snapshot, TelemetryQuery, TelemetryResponse, UsageFilters } from "@moguri-dev/sdk";
import { envLabel } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

type Operations = Extract<TelemetryResponse, { type: "telemetry.operations" }>;
type Family = OperationEntry["family"] | "";
const failureRate = (value: Operations["totals"]) => value.failureRate === null ? "Unavailable: no definitive results" : `${(value.failureRate * 100).toFixed(1)}% (${value.failed}/${value.knownResults} definitive results)`;
const bytes = (value: number) => `${value.toLocaleString()} bytes`;
export function OperationalUsage({ sdk, snapshot, filters }: { sdk: MoguriSdk; snapshot: Snapshot; filters: UsageFilters }) {
  const [open, setOpen] = useState(false), [family, setFamily] = useState<Family>(""), [page, setPage] = useState({ scope: "", offset: 0 });
  const [operationResult, setOperations] = useState<Operations | null>(null), [operationError, setOperationError] = useState(""), [loading, setLoading] = useState(false);
  const [operationOwner, setOperationOwner] = useState<{ sdk: MoguriSdk; key: string } | null>(null);
  const [storageOpen, setStorageOpen] = useState(false), [storageResult, setStorage] = useState<ProfileStorage | null>(null), [storageError, setStorageError] = useState(""), [measuring, setMeasuring] = useState(false), [refresh, setRefresh] = useState(0);
  const [storageOwner, setStorageOwner] = useState<{ sdk: MoguriSdk; refresh: number } | null>(null);
  const query: Omit<Extract<TelemetryQuery, { type: "telemetry.operations" }>, "type"> = { ...filters, ...(family ? { family } : {}), limit: 20 };
  const scope = JSON.stringify(query), offset = page.scope === scope ? page.offset : 0;
  const stamp = snapshot.operationEntries.map((entry) => `${entry.id}:${entry.revision}:${entry.sourceSeq}`).join("|");
  const operationKey = JSON.stringify([scope, offset, stamp]), operationCurrent = operationOwner?.sdk === sdk && operationOwner.key === operationKey;
  const storageCurrent = storageOwner?.sdk === sdk && storageOwner.refresh === refresh;
  const operations = operationCurrent ? operationResult : null, storage = storageCurrent ? storageResult : null;
  useEffect(() => {
    if (!open) return;
    let current = true; setOperationOwner({ sdk, key: operationKey }); setLoading(true); setOperationError(""); setOperations(null);
    void sdk.telemetry.operations({ ...query, offset }).then((result) => { if (current) setOperations(result); })
      .catch((error: unknown) => { if (current) setOperationError(error instanceof Error ? error.message : "Operation outcomes are unavailable. No zero-failure fallback was used."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sdk, open, scope, offset, stamp]);
  useEffect(() => {
    if (!storageOpen) return;
    let current = true; setStorageOwner({ sdk, refresh }); setMeasuring(true); setStorageError(""); setStorage(null);
    void sdk.telemetry.storage().then((result) => { if (current) setStorage(result.storage); })
      .catch((error: unknown) => { if (current) setStorageError(error instanceof Error ? error.message : "Retained size is unavailable. Missing data is not zero bytes."); })
      .finally(() => { if (current) setMeasuring(false); });
    return () => { current = false; };
  }, [sdk, storageOpen, refresh]);
  return <>
    <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Tool and MCP outcomes</summary>
      {open && <section aria-label="Tool and MCP outcomes" aria-busy={loading || !operationCurrent}>
        <p className="fine-print">Uses the selected dates and source filters, not calendar buckets. Actual MCP attempts are separate from ordinary tools and gateway discovery. Explicit user plan saves have their own history.</p>
        <label className="setting-field">Attempt family<select aria-label="Operation family filter" value={family} onChange={(event) => { const value = event.target.value; if (value === "" || value === "tool" || value === "mcp") setFamily(value); }}><option value="">Tools and MCP, counted once</option><option value="tool">Tools and gateway metadata</option><option value="mcp">MCP tool attempts</option></select></label>
        {(loading || !operationCurrent) && <p role="status">Loading retained outcomes...</p>}{operationCurrent && operationError && <Alert as="p" className="inline-error" role="alert">{operationError}</Alert>}
        {operations && <>
          <dl className="facts"><dt>Retained attempts</dt><dd>{operations.totals.attempts}</dd><dt>Observed starts</dt><dd>{operations.totals.started}</dd>
            <dt>Failure rate</dt><dd>{failureRate(operations.totals)}</dd><dt>Completed / failed</dt><dd>{operations.totals.completed} / {operations.totals.failed}</dd>
            <dt>Denied</dt><dd>{operations.totals.denied}</dd><dt>Pending / running</dt><dd>{operations.totals.pending} / {operations.totals.running}</dd>
            <dt>Stopped / partial</dt><dd>{operations.totals.stopped} / {operations.totals.partial}</dd><dt>Unconfirmed / unknown</dt><dd>{operations.totals.unconfirmed} / {operations.totals.unknown}</dd>
            <dt>Observed lifecycle wall</dt><dd>{operations.totals.elapsedSamples ? `${(operations.totals.observedWallMs / 1000).toFixed(2)} s / ${operations.totals.elapsedSamples} samples` : "No complete timing samples"}</dd>
            <dt>Unmeasured attempts</dt><dd>{operations.totals.unmeasuredAttempts}</dd><dt>Retries</dt><dd>Not attributed</dd></dl>
          <p className="fine-print">Failure rate is failed / (completed + failed). Denied, unfinished and uncertain outcomes are shown separately. Lifecycle wall observations include dispatch/result transport; overlaps are not active tool time.</p>
          {operations.window.excludedUncertainTimeCalls > 0 && <Alert as="p" tone="warning" className="settings-warning">{operations.window.excludedUncertainTimeCalls} attempts lack a verified request/start time and are excluded from this dated view. All time includes them.</Alert>}
          {operations.repositoryCoverage.unattributedCalls > 0 && <p className="fine-print">{operations.repositoryCoverage.unattributedCalls} source/date-matching attempts have no captured repository; repository filters exclude them without guessing.</p>}
          {filters.visibility === "open-source" && operations.repositoryCoverage.unverifiedLicenseCalls > 0 && <p className="fine-print">{operations.repositoryCoverage.unverifiedLicenseCalls} public-repository attempts have unknown license evidence and are excluded without inferring a license.</p>}
          {!operations.totals.attempts && <p>No retained attempts match these filters. Previously deleted history is unavailable, not proof of zero calls.</p>}
          {operations.groups.map((group) => <div className="call-record" key={JSON.stringify([group.family, group.serverId, group.name, group.actor])}><strong>{group.serverId ? `${group.serverId} / ` : ""}{group.name ?? "Unverified identifier"}</strong><small>{group.family} / {group.actor === "external" ? "external client" : group.actor === "model" ? "model" : "unverified actor"}</small><span>{group.totals.attempts} attempts / {failureRate(group.totals)}</span><span>{group.totals.partial} partial / {group.totals.unconfirmed} unconfirmed / {group.totals.unknown} unknown</span></div>)}
          <details><summary>Sanitized attempt history</summary>{operations.entries.map((entry) => <div className="call-record" key={entry.id}><strong>{entry.serverId ? `${entry.serverId} / ` : ""}{entry.name ?? "Unverified identifier"}</strong>
            <small>{entry.actor} / {envLabel(entry.env)} / {entry.outcome}{entry.imported ? " / retained-history import" : ""}</small><span>{entry.requestedAt ?? entry.startedAt ?? "Request/start time unverified"}</span>
            <small>{entry.repository ? `${entry.repository.fullName} / ${entry.repository.visibility}` : "Repository unassigned"}</small>
            <span>{entry.elapsedMs === null ? "No complete timing sample" : `${entry.elapsedMs.toLocaleString()} ms observed lifecycle wall`}</span><small>Event sequence {entry.sourceSeq}{entry.diagnostic ? ` / ${entry.diagnostic}` : ""}</small></div>)}
            <div className="button-row">{offset > 0 && <button type="button" disabled={loading} onClick={() => setPage({ scope, offset: Math.max(0, offset - 20) })}>Previous attempts</button>}{operations.nextOffset !== null && <button type="button" disabled={loading} onClick={() => setPage({ scope, offset: operations.nextOffset! })}>Next attempts</button>}</div>
            <p className="fine-print">Totals include all matching retained attempts, not just this page. Late results or new work can change page ordering. No arguments, commands, output or error text are retained here.</p>
          </details>
          <p className="fine-print">{operations.coverage ? `Independent tracking since ${operations.coverage.since}. ` : "Coverage has not been established. "}Earlier history includes only provable retained events. Sanitized metadata survives source deletion; previously forgotten contents are not recovered.</p>
        </>}
      </section>}
    </details>
    <details onToggle={(event) => setStorageOpen(event.currentTarget.open)}><summary>Retained profile storage</summary>
      {storageOpen && <section aria-label="Retained profile storage" aria-busy={measuring || !storageCurrent}>
        <p className="fine-print">Entire current profile, regardless of date, project or model filters. Key-backed ciphertext, not disk usage, plaintext size or freed disk.</p>
        <button type="button" disabled={measuring} onClick={() => setRefresh((value) => value + 1)}>Refresh retained size</button>
        {(measuring || !storageCurrent) && <p role="status">Measuring retained ciphertext...</p>}{storageCurrent && storageError && <Alert as="p" className="inline-error" role="alert">{storageError}</Alert>}
        {storage && <><dl className="facts"><dt>Included ciphertext</dt><dd>{bytes(storage.bytes.total)}</dd><dt>Sealed event payloads</dt><dd>{bytes(storage.bytes.events)} / {storage.counts.events} events</dd>
          <dt>Encrypted blob grants</dt><dd>{bytes(storage.bytes.blobGrants)} / {storage.counts.blobGrants} grants</dd><dt>Distinct blob contents</dt><dd>{storage.counts.blobContents}</dd>
          <dt>Encrypted scope keys</dt><dd>{bytes(storage.bytes.keys)} / {storage.counts.keys} keys</dd><dt>Physical / freed disk</dt><dd>Not measured</dd></dl>
          <p className="fine-print">Measured {storage.measuredAt}. One content digest can have multiple real encrypted grants. Key presence is checked; this is not a decryption/integrity audit.</p>
          <details><summary>Storage boundaries</summary><p className="fine-print">Counts one sealed payload per event, encrypted blob grants and encrypted key payloads. Excludes structural payload copies, metadata/receipts/tombstones, forgotten ciphertext, SQLite pages/indexes/WAL, repositories/worktrees, dependency caches, weights, memory indexes and terminal buffers. Deletion does not establish physical disk reclamation.</p></details>
        </>}
      </section>}
    </details>
  </>;
}
