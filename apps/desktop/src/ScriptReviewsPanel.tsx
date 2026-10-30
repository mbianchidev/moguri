import { useState } from "react";
import type { MoguriSdk, ScriptReviewResponse, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function ScriptReviewsPanel({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [read, setRead] = useState<{ sdk: MoguriSdk; value: ScriptReviewResponse } | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const records = snapshot.scriptReviews.filter((review) => review.profileId === sdk.profileId && review.sessionId === session.id);
  if (!records.length) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "The exact script review is unavailable. No replacement source or execution was used."); }
    finally { setBusy(false); }
  };
  return <section className="script-reviews" aria-label="Repository script reviews">
    <details><summary>Repository script reviews ({records.length})</summary>
      <p className="fine-print">Agent assessments are advice, not a safety guarantee or permission. Unsafe advice never opens an execution-approval prompt by itself.</p>
      {records.map((review) => {
        const selected = read?.sdk === sdk && read.value.review.id === review.id && read.value.review.revision === review.revision ? read.value : null;
        const canForce = selected && review.advice?.verdict === "unsafe" && !review.force && !review.attempt && !session.turnId &&
          session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" && session.controls.env === "Local";
        return <article key={review.id}>
          <h3>{review.source.path}</h3>
          <p>Agent assessment: <strong>{review.advice?.verdict ?? "Not assessed"}</strong>. {review.advice?.summary}</p>
          {review.advice?.findings.length ? <ul>{review.advice.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul> : null}
          <p className="fine-print path">SHA-256 {review.source.digest} / {review.source.bytes} bytes / {review.source.interpreter}</p>
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            setConfirmed(false); const value = await sdk.scriptReviews.read(session.id, review.id); setRead({ sdk, value });
          })} aria-label={`Read full script review ${review.id}`}>Read full source and review</button>
          {selected && <>
            <p className="fine-print">{selected.warning}</p><pre aria-label={`Complete reviewed script ${review.id}`}>{selected.text}</pre>
            {canForce && <>
              <Alert as="p" tone="warning">This agent reported unsafe behavior. Forcing overrides only this advice. Hard policy, the exact source/root and normal execution approval still apply. Code may change your files or contact external services without OS isolation.</Alert>
              <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the complete source and findings and explicitly want to force this exact unsafe script.</label>
              <button type="button" className="danger" disabled={busy || !confirmed} onClick={() => void run(async () => {
                await sdk.scriptReviews.force(session.id, review.id, review.source.digest, review.revision, session.revision);
                setRead(null); setConfirmed(false);
              })}>Force unsafe script under normal policy</button>
            </>}
          </>}
          {review.force && <p className="fine-print">Actual user forced this exact source. That did not grant execution permission.</p>}
          {review.attempt && <p className="fine-print">One original attempt is retained. Inspect its actual tool/job outcome; it cannot be replayed.</p>}
        </article>;
      })}
    </details>
    {busy && <p role="status">Reading or admitting the exact original script review...</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
