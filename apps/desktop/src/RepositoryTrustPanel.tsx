import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Project, RepositoryTrustPreview, Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export function RepositoryTrustPanel({ sdk, project, snapshot, disabled, onBusy }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<RepositoryTrustPreview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const review = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const trust = snapshot.repositoryTrusts.find((trust) => trust.projectId === project.id);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Repository trust was not changed. Review the current scripts again."); }
    finally { if (alive.current) setBusy(false); }
  };
  const decide = (revoke: boolean) => run(async () => {
    if (revoke) {
      if (!trust) throw new Error("This trust decision is no longer available.");
      await sdk.repositoryTrust.revoke(project.id, trust.revision);
    } else {
      if (!preview || !confirmed) throw new Error("Review and confirm the scripts first.");
      await sdk.repositoryTrust.trust(preview);
    }
    if (alive.current) { setPreview(null); setConfirmed(false); review.current?.focus(); }
  });
  return <section aria-label="Repository script trust">
    <h3>Repository script trust</h3>
    <p className="fine-print" role="status">{trust?.status === "trusted" ?
      `Trusted: ${trust.files} existing scripts. New or changed scripts still need review.` :
      "Not trusted. Each script gets an agent assessment before it runs."}</p>
    <p className="fine-print">Trusting lets existing scripts and tests skip that assessment; normal run approvals still apply. It doesn't vet their dependencies or isolate them.</p>
    {error && <Alert as="p" role="alert" className="inline-error">{error}</Alert>}
    <div className="button-row">
      <button ref={review} type="button" disabled={disabled || busy} onClick={() => void run(async () => {
        const { preview } = await sdk.repositoryTrust.preview(project.id);
        if (alive.current) { setPreview(preview); setConfirmed(false); }
      })}>Review repo trust</button>
      {trust?.status === "trusted" && <button type="button" disabled={disabled || busy} onClick={() => void decide(true)}>Revoke repo trust</button>}
    </div>
    {preview && <div className="configuration-review">
      <p className="fine-print path">Repository: {preview.root.root}</p>
      <p className="fine-print">HEAD <code>{preview.head}</code> · {preview.files.length} scripts · {preview.excluded.length} excluded paths</p>
      <details><summary>Scripts to trust</summary><pre aria-label="Repository trust source baseline">{preview.files.map((file) => `${file.path}  sha256=${file.digest}`).join("\n") || "No tracked scripts found."}</pre></details>
      <details><summary>Excluded paths and dependencies</summary><pre>{JSON.stringify({ excluded: preview.excluded, dependencies: preview.dependencies }, null, 2)}</pre></details>
      <Alert as="p" tone="warning" className="settings-warning">{preview.warning}</Alert>
      <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={disabled || busy}
        onChange={(event) => setConfirmed(event.target.checked)} />I trust the existing scripts listed above in this repository.</label>
      <div className="button-row"><button type="button" className="primary" disabled={disabled || busy || !confirmed}
        onClick={() => void decide(false)}>Trust existing repo scripts</button>
        <button type="button" disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); review.current?.focus(); }}>Cancel trust review</button></div>
    </div>}
  </section>;
}
