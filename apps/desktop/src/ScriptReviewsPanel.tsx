import { useState } from "react";
import { scriptReviewNeedsApproval, type MoguriSdk, type ScriptReviewResponse, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function ScriptReviewsPanel({ sdk, session, snapshot, reviewIds, onReviewed }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; reviewIds: string[]; onReviewed: () => void;
}) {
  const [read, setRead] = useState<{ sdk: MoguriSdk; value: ScriptReviewResponse } | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const records = snapshot.scriptReviews.filter((review) => review.profileId === sdk.profileId && review.sessionId === session.id &&
    reviewIds.includes(review.id) && scriptReviewNeedsApproval(review));
  if (!records.length) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "This script review is no longer available. Nothing was run."); }
    finally { setBusy(false); }
  };
  return <section className="script-reviews" aria-label="Repository script reviews">
    <h3>Repository script reviews ({records.length})</h3>
      <p className="fine-print">Assessments are model advice, not a safety guarantee. A script marked unsafe can't run unless you force it.</p>
      {records.map((review) => {
        const selected = read?.sdk === sdk && read.value.review.id === review.id && read.value.review.revision === review.revision ? read.value : null;
        const canForce = selected && review.advice?.verdict === "unsafe" && !review.force && !review.attempt && !session.turnId &&
          session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" &&
          (session.controls.env === "Local" || session.controls.env === "Sandbox" && snapshot.capabilities.some((capability) => capability.env === "Sandbox" && capability.ready));
        return <article key={review.id}>
          <h4>{review.source.path}</h4>
          <p>Agent assessment: <strong>{review.advice?.verdict ?? "Not assessed"}</strong>. {review.advice?.summary}</p>
          {review.advice?.findings.length ? <ul>{review.advice.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul> : null}
          <p className="fine-print path">SHA-256 {review.source.digest} / {review.source.bytes} bytes / {review.source.interpreter}</p>
          <button type="button" disabled={busy} aria-expanded={Boolean(selected)} aria-controls={selected ? `script-source-${review.id}` : undefined} onClick={() => {
            setConfirmed(false);
            if (selected) { setRead(null); return; }
            void run(async () => { const value = await sdk.scriptReviews.read(session.id, review.id); setRead({ sdk, value }); });
          }} aria-label={`${selected ? "Collapse" : "Read full"} script review ${review.id}`}>{selected ? "Hide source" : "Show full source"}</button>
          {selected && <div id={`script-source-${review.id}`}>
            <p className="fine-print">{selected.warning}</p><pre aria-label={`Complete reviewed script ${review.id}`}>{selected.text}</pre>
            {review.advice?.verdict === "safe" && <>
              <p className="fine-print">Approving clears this notification. It doesn't run the script or grant permission to run it.</p>
              <button type="button" className="primary" disabled={busy} aria-label={`Approve script review ${review.id}`} onClick={() => void run(async () => {
                await sdk.scriptReviews.approve(session.id, review.id, review.source.digest, review.revision, session.revision);
                setRead(null); setConfirmed(false); onReviewed();
              })}>Approve script review</button>
            </>}
            {canForce && <>
              <Alert as="p" tone="warning">Forcing overrides only the agent's unsafe verdict; policy and the normal run approval still apply. {session.controls.env === "Sandbox" ? "If approved, it runs in a new model-free guest with the reviewed network rules; isolation doesn't make the code safe." : "If approved, it runs on this Mac without isolation and may change your files or contact external services."}</Alert>
              <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the full source and findings and want to override the unsafe verdict.</label>
              <button type="button" className="danger" disabled={busy || !confirmed} onClick={() => void run(async () => {
                await sdk.scriptReviews.force(session.id, review.id, review.source.digest, review.revision, session.revision);
                setRead(null); setConfirmed(false); onReviewed();
              })}>Force unsafe script under normal policy</button>
            </>}
          </div>}
          {review.attempt && <p className="fine-print">This script already ran once; check that run's result in the session. It won't be retried.</p>}
        </article>;
      })}
    {busy && <p role="status">Updating script review...</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
