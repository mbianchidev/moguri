import { useEffect, useRef, useState } from "react";
import type { CommandJobRead, MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

export function CommandJobs({ sdk, session, snapshot, active }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean }) {
  const jobs = snapshot.jobs.filter((job) => job.sessionId === session.id && job.commandJob);
  const [selectedId, setSelectedId] = useState(""), [offset, setOffset] = useState(0), [revision, setRevision] = useState(0), [inspected, setInspected] = useState(false);
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs.at(-1);
  const key = JSON.stringify([sdk.profileId, session.id, selected?.id, offset]), owner = useRef(key); owner.current = key;
  const [read, setRead] = useState<{ key: string; data: CommandJobRead } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef(false), data = read?.key === key ? read.data : null;
  useEffect(() => { setOffset(0); setInspected(false); setError(""); }, [sdk, session.id, selected?.id]);
  useEffect(() => {
    if (!selected || !active) return;
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const captured = key;
    const load = async () => {
      try {
        const value = await sdk.tools.command(session.id, selected.id, offset);
        if (disposed || owner.current !== captured) return;
        setRead({ key: captured, data: value.data }); setError("");
      } catch (error) { if (!disposed && owner.current === captured) setError(error instanceof Error ? error.message : "The original watch logs are unavailable; no other console was substituted."); }
      finally { if (!disposed && selected.status === "running") timer = setTimeout(() => void load(), 500); }
    };
    void load();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sdk, key, selected?.status, selected?.commandJob?.inspected, active, revision]);
  const perform = async (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await operation(); setRevision((value) => value + 1); setInspected(false); }
    catch (error) { setError(error instanceof Error ? error.message : "The exact command operation was not acknowledged."); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!jobs.length) return null;
  return <details className="command-jobs" open><summary>Owned command and watch jobs</summary>
    <label>Command job<select aria-label="Owned command job" value={selected?.id ?? ""} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setOffset(0); }}>
      {jobs.map((job) => <option key={job.id} value={job.id}>{job.commandJob?.command.slice(0, 80)} / {job.status}</option>)}</select></label>
    {selected && <>
      <code className="agent-command-line" tabIndex={0}>{selected.commandJob?.command}</code>
      <div className="button-row"><button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh watch logs</button>
        {selected.status === "running" && <button type="button" disabled={busy} onClick={() => void perform(() => sdk.jobs.cancel(selected.id))}>Stop watch job</button>}</div>
      {data ? <>
        <p className="fine-print"><strong>{data.status}</strong> / {data.env} / {data.root}. Source: {data.source}. Observed wall time {data.elapsedMs === null ? "unavailable" : `${Math.round(data.elapsedMs)} ms`}; output {data.outputBytes === null ? "unavailable" : `${data.outputBytes} normalized bytes`}.</p>
        {data.text !== null && <pre className="command-job-output" tabIndex={0} aria-label="Original watch output">{data.text}</pre>}
        {data.diagnostic && <p className="inline-error" role="alert">{data.diagnostic}</p>}
        <div className="button-row">{offset > 0 && <button type="button" onClick={() => setOffset(0)}>First watch page</button>}
          {data.nextOffset !== null && <button type="button" onClick={() => setOffset(data.nextOffset!)}>Next watch page</button>}</div>
        {selected.status === "partial" && !selected.commandJob?.inspected && data.inspectionDigest && <section aria-label="Unconfirmed watch inspection">
          <p className="fine-print">Inspect the original captured root and processes. Acknowledgement records your inspection, not successful cleanup, command success or PID ownership.</p>
          <label className="checkbox"><input type="checkbox" checked={inspected} disabled={busy} onChange={(event) => setInspected(event.target.checked)} />I inspected this original watch job</label>
          <button type="button" disabled={!inspected || busy} onClick={() => void perform(() => sdk.tools.acknowledgeCommand(session.id, selected.id, data.inspectionDigest!, true))}>Acknowledge watch inspection</button>
        </section>}
      </> : <p role="status">Reading the original watch job...</p>}
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="fine-print">Watch jobs are explicit Local work, independent of a finished model turn. No User/Global console access, PID adoption or restart replay. CPU/RSS and unobserved output are unavailable, not zero.</p>
  </details>;
}
