import { useEffect, useRef, useState } from "react";
import type { CheckpointResponse, MoguriSdk, RewindFileDecision, RewindPreview, Session, Snapshot, TurnCheckpoint } from "../../../packages/sdk/src/index.ts";
import { envLabel } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function RewindPanel({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [preview, setPreview] = useState<RewindPreview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [decisions, setDecisions] = useState<RewindFileDecision[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [read, setRead] = useState<Extract<CheckpointResponse, { type: "checkpoints.read" }> | null>(null), [prune, setPrune] = useState(false);
  const [inspection, setInspection] = useState<Extract<CheckpointResponse, { type: "rewind.inspect" }> | null>(null), [acknowledged, setAcknowledged] = useState(false);
  const [capturePrune, setCapturePrune] = useState<string | null>(null);
  const generation = useRef(0);
  const reviewAbort = useRef<AbortController | null>(null);
  const checkpoints = snapshot.checkpoints.filter((checkpoint) => checkpoint.sessionId === session.id).sort((a, b) => b.startSequence - a.startSequence);
  const rewinds = snapshot.rewinds.filter((record) => record.sessionId === session.id);
  const captures = snapshot.checkpointCaptures.filter((capture) => capture.sessionId === session.id && !capture.forgotten &&
    !checkpoints.some((checkpoint) => checkpoint.id === capture.checkpointId));
  const scope = JSON.stringify([sdk.profileId, session.id, session.revision, snapshot.policy.revision, snapshot.settings.permissionRevision,
    checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.revision])]);
  useEffect(() => { generation.current++; reviewAbort.current?.abort(new Error("The original review scope changed.")); setPreview(null); setConfirmed(false); setDecisions([]); setInspection(null); setRead(null); setCapturePrune(null); }, [scope]);
  useEffect(() => () => { generation.current++; reviewAbort.current?.abort(new Error("The original review closed.")); }, []);
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    const token = ++generation.current; setBusy(true); setError("");
    try { await operation(() => generation.current === token); }
    catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "The exact rewind failed. Inspect its actual retained outcome; no rollback success was inferred."); }
    finally { setBusy(false); }
  };
  const review = (checkpoint: TurnCheckpoint, mode: "conversation" | "workspace") => {
    setPreview(null); setConfirmed(false); setDecisions([]);
    const abort = new AbortController(); reviewAbort.current = abort;
    return run(async (current) => {
      try {
        const value = (await sdk.checkpoints.preview(session.id, checkpoint.id, mode, abort.signal)).preview;
        if (current()) { setPreview(value); setConfirmed(false); setDecisions([]); }
      } finally { if (reviewAbort.current === abort) reviewAbort.current = null; }
    });
  };
  const conflictsChosen = preview?.files.every((file) => !file.conflict || decisions.some((decision) => decision.root === file.root && decision.path === file.path)) ?? false;
  return <section className="script-reviews" aria-label="Checkpoints and rewind">
      <h3>Retained checkpoints ({checkpoints.length})</h3>
      <p className="fine-print">Restore active conversation context, optionally with reviewed workspace files. Later history and spent/unknown budgets remain. External effects such as pushes, merges, deployments and MCP calls are not undone.</p>
      <button type="button" disabled={busy} onClick={() => void run(async (current) => {
        await sdk.checkpoints.settle(session.id);
        if (current()) { setPreview(null); setConfirmed(false); }
      })}>Stop owned work for rewind</button>
      {!checkpoints.length && <p>No provable checkpoints are retained. Earlier files were not reconstructed from the current checkout.</p>}
      {captures.map((capture) => <article key={capture.id} aria-label={`Unadmitted capture ${capture.id}`}>
        <h3>{capture.phase} capture: {capture.status}</h3>
        <p className="fine-print">{capture.id} / {capture.storageBytes ?? 0} retained bytes. {capture.diagnostic}</p>
        <label className="check-setting"><input type="checkbox" checked={capturePrune === capture.id} disabled={busy || capture.status === "capturing"}
          onChange={(event) => setCapturePrune(event.target.checked ? capture.id : null)} />Remove only this reviewed capture's encrypted snapshot. Private stages, filesystem backups, history and accounting remain.</label>
        <button type="button" disabled={busy || capturePrune !== capture.id || !["partial", "failed", "captured"].includes(capture.status)}
          onClick={() => void run(async (current) => { await sdk.checkpoints.pruneCapture(session.id, capture.id, capture.revision); if (current()) setCapturePrune(null); })}>Prune reviewed unadmitted capture</button>
      </article>)}
      {checkpoints.map((checkpoint) => <article key={checkpoint.id}>
        <h3>{checkpoint.summary || checkpoint.turnId}</h3>
        <p className="fine-print">{checkpoint.createdAt} / {envLabel(checkpoint.env)} / event {checkpoint.startSequence} / {checkpoint.terminal?.outcome ?? "turn not settled"} / {checkpoint.storageBytes} retained bytes</p>
        {checkpoint.diagnostics.map((diagnostic) => <p key={diagnostic} className="fine-print">{diagnostic}</p>)}
        <div className="button-row">
          <button type="button" disabled={busy || checkpoint.forgotten} onClick={() => void review(checkpoint, "conversation")}>Review conversation rewind</button>
          <button type="button" disabled={busy || checkpoint.forgotten || !checkpoint.beforeDigest} onClick={() => void review(checkpoint, "workspace")}>Review workspace rewind</button>
          <button type="button" disabled={busy || checkpoint.forgotten} onClick={() => void run(async (current) => {
            const value = await sdk.checkpoints.read(session.id, checkpoint.id);
            if (current()) { setRead(value); setPrune(false); }
          })}>Inspect checkpoint scope</button>
        </div>
      </article>)}
      {read && <div aria-label="Checkpoint scope">
        <p>Captured conversation messages: {read.state?.context.length ?? "unavailable"}. Draft, queue and controls are inspection-only and will not replace current values. Independent artifacts and accounting are never rolled back.</p>
        <pre>{JSON.stringify({ checkpoint: read.checkpoint.id, roots: read.before?.roots.map((root) => ({ root: root.binding, files: root.files.map(({ path, digest, bytes, mode }) => ({ path, digest, bytes, mode })), excluded: root.excluded, git: root.git })) }, null, 2)}</pre>
        <label className="check-setting"><input type="checkbox" checked={prune} disabled={busy} onChange={(event) => setPrune(event.target.checked)} />Permanently remove this checkpoint's encrypted snapshots, not history, accounting, active context, reviewed operation receipts/plans or displaced filesystem backups.</label>
        <button type="button" disabled={busy || !prune || !read.checkpoint.terminal} onClick={() => void run(async (current) => {
          await sdk.checkpoints.prune(session.id, read.checkpoint.id, read.checkpoint.revision);
          if (current()) { setRead(null); setPrune(false); }
        })}>Prune reviewed checkpoint</button>
      </div>}
      {preview && <section aria-label="Exact rewind preview">
        <h3>Target {preview.checkpointId}: {preview.mode}</h3>
        <p>Active context: {preview.currentContextMessages} messages to {preview.contextMessages}. History stays inspectable. External effects are not undone.</p>
        {preview.warnings.map((warning) => <p className="fine-print" key={warning}>{warning}</p>)}
        {preview.blockers.map((blocker) => <Alert as="p" role="alert" key={blocker}>{blocker}</Alert>)}
        {preview.files.length > 0 && <table><thead><tr><th>Path</th><th>Current / target SHA-256</th><th>Conflict decision</th></tr></thead><tbody>
          {preview.files.map((file) => <tr key={JSON.stringify([file.root, file.path])}><td>{file.root}<br />{file.path}</td>
            <td><code>{file.currentDigest ?? "absent"}</code><br /><code>{file.targetDigest ?? "absent"}</code></td>
            <td>{file.conflict && <p>{file.conflict}</p>}<label>{file.conflict ? "Required file decision" : "File decision"}<select
              aria-label={`Rewind decision ${file.path}`} value={decisions.find((decision) => decision.root === file.root && decision.path === file.path)?.choice ?? (file.conflict ? "" : "restore-checkpoint")}
              onChange={(event) => {
                const choice = event.target.value;
                const next = decisions.filter((decision) => decision.root !== file.root || decision.path !== file.path);
                if (choice === "keep-current" || choice === "restore-checkpoint") next.push({ root: file.root, path: file.path, choice });
                setDecisions(next);
                setConfirmed(false);
              }}><option value="">Choose explicitly</option><option value="keep-current">Keep current file</option><option value="restore-checkpoint">Restore checkpoint; retain displaced file</option></select></label></td>
          </tr>)}
        </tbody></table>}
        <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this exact target and file decisions.</label>
        <button type="button" className="danger" disabled={busy || !confirmed || !conflictsChosen || preview.blockers.length > 0} onClick={() => void run(async (current) => {
          await sdk.checkpoints.apply(session.id, preview.checkpointId, preview.mode, preview.digest, decisions);
          if (current()) { setPreview(null); setConfirmed(false); }
        })}>Confirm reviewed rewind</button>
      </section>}
      {rewinds.map((record) => <article key={record.id}><h3>Rewind {record.id}: {record.status}</h3>
        {record.diagnostic && <p>{record.diagnostic}</p>}
        {record.status === "running" && <button type="button" onClick={() => void sdk.checkpoints.stop(session.id, record.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "The exact stop failed; inspect the retained operation."))}>Stop original rewind</button>}
        <button type="button" disabled={busy} onClick={() => void run(async (current) => {
          const value = await sdk.checkpoints.inspect(session.id, record.id);
          if (current()) { setInspection(value); setAcknowledged(false); }
        })}>Inspect exact rewind effects</button>
      </article>)}
      {inspection && <div aria-label="Actual rewind effects"><p>{inspection.diagnostic}</p><pre>{JSON.stringify(inspection.effects, null, 2)}</pre>
        {inspection.record.status === "partial" && inspection.record.quarantined && <>
          <p>This acknowledgement releases only this terminal operation's root quarantine. The rewind remains partial; nothing is replayed, refunded or labeled successful.</p>
          <label className="check-setting"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />I inspected these exact current files and retained displaced backups.</label>
          <button type="button" disabled={busy || !acknowledged} onClick={() => void run(async (current) => {
            await sdk.checkpoints.acknowledge(session.id, inspection.record.id, inspection.record.revision, inspection.digest);
            if (current()) setInspection(null);
          })}>Acknowledge terminal partial effects</button>
        </>}
      </div>}
    {busy && <p role="status">Checking or applying the exact reviewed rewind...</p>}
    {busy && reviewAbort.current && <button type="button" onClick={() => reviewAbort.current?.abort(new Error("The actual user cancelled this exact rewind review."))}>Cancel current rewind review</button>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
