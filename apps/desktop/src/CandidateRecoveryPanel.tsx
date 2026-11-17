import { useEffect, useRef, useState } from "react";
import type { CandidateTransportRecord, MoguriSdk, Session } from "../../../packages/sdk/src/index.ts";
import { SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

const standalone = (record: CandidateTransportRecord) => {
  try { return ["Remote", "Sandbox"].includes(JSON.parse(record.launchJson).kind); } catch { return false; }
};
export function CandidateRecoveryPanel({ sdk, session, scope }: { sdk: MoguriSdk; session?: Session; scope: string }) {
  const [records, setRecords] = useState<CandidateTransportRecord[]>([]), [selected, setSelected] = useState<CandidateTransportRecord | null>(null);
  const [id, setId] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), currentScope = useRef(scope); currentScope.current = scope;
  const refresh = async (current: () => boolean) => {
    const result = await sdk.candidates.transports(session ? { sessionId: session.id } : {});
    if (current()) setRecords(result.transports.filter((record) => record.status === "partial" || !record.cleanupConfirmed));
  };
  useEffect(() => {
    const token = ++generation.current; setSelected(null); setRecords([]); setError("");
    void refresh(() => token === generation.current).catch((error: unknown) => { if (token === generation.current) setError(error instanceof Error ? error.message : "Couldn't load interrupted operations."); });
    return () => { generation.current++; };
  }, [sdk, scope]);
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const token = ++generation.current, originalScope = scope; setBusy(true); setError("");
    try { await operation(() => currentScope.current === originalScope && generation.current === token); }
    catch (error) { if (currentScope.current === originalScope) setError(error instanceof Error ? error.message : "Couldn't confirm the operation's status. Nothing was changed."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="candidate-section" aria-label="Original candidate transport recovery" aria-busy={busy}>
    <h4>Interrupted Remote and Sandbox operations</h4>
    <p className="fine-print">Reconcile reads the worker's log to find out how an interrupted operation ended. It never reruns anything, and an operation stays partial until its cleanup is confirmed.</p>
    {error && <Alert as="p" role="alert">{error}</Alert>}
    <label className="setting-field">Operation<select aria-label="Retained candidate transport" value={selected?.id ?? ""} disabled={busy}
      onChange={(event) => {
        const value = records.find((record) => record.id === event.target.value) ?? null; setSelected(value); setId(value?.id ?? "");
      }}><option value="">Choose an operation</option>{records.map((record) => <option key={record.id} value={record.id}>
        {record.boundary.env} / {record.ownerKind} / {record.id} / {record.cleanupConfirmed ? "cleanup confirmed" : "cleanup unconfirmed"}
      </option>)}</select></label>
    <label className="setting-field">Operation ID<SettingsInput aria-label="Original candidate transport ID" value={id} disabled={busy} onChange={(event) => { setId(event.target.value); setSelected(null); }} /></label>
    <div className="button-row"><button disabled={busy} onClick={() => void run(refresh)}>Refresh</button>
      <button disabled={busy || !id.trim()} onClick={() => void run(async (current) => { const result = await sdk.candidates.transport(id); if (current()) setSelected(result.transport); })}>Look up ID</button>
      <button disabled={busy || !selected || selected.status !== "partial" || selected.cleanupConfirmed || !standalone(selected)}
        onClick={() => void run(async (current) => {
          if (!selected) return;
          await sdk.candidates.reconcileTransport(selected.id, selected.revision);
          const result = await sdk.candidates.transport(selected.id);
          if (current()) setSelected(result.transport);
          await refresh(current);
        })}>Reconcile (read-only)</button></div>
    {selected && <div className="candidate-binding">
      <p className="fine-print path">{selected.boundary.env} / root: {selected.boundary.sourceRoot}<br />Worker build: {selected.boundary.workerDigest}<br />Operation: {selected.status} · cleanup: {selected.cleanupConfirmed ? "confirmed" : "unconfirmed (resources stay on hold)"}</p>
      <p className="fine-print">Moguri acknowledged the final result: {String(selected.terminalAcknowledged)}. {selected.recovery ?
        <>Worker status: {selected.recovery.evidence.journal.status} · acknowledged frames: {selected.recovery.evidence.journal.acknowledged}/{selected.recovery.evidence.journal.sequence}
          {" "}· final frame: {selected.recovery.evidence.terminal.sequence ?? "not saved"}</> : "Worker status: not checked yet."}</p>
      {selected.diagnostic && <Alert as="p" role="status">{selected.diagnostic}</Alert>}
      {!standalone(selected) && <p className="fine-print">This operation is part of a Cascade or Critique workflow and can't be reconciled on its own.</p>}
      {selected.recovery && <details><summary>Reconciliation details</summary><pre>{JSON.stringify(selected.recovery, null, 2)}</pre></details>}
    </div>}
    {busy && <p role="status">Reading status only. Nothing is rerun.</p>}
  </section>;
}
