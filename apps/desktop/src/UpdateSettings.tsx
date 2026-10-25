import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { MoguriSdk, UpdateInstallReview, UpdateStatus } from "../../../packages/sdk/src/index.ts";

export function UpdateSettings({ sdk, revision, disabled, onBusy, prepareMaintenance }: {
  sdk: MoguriSdk; revision: number; disabled: boolean; onBusy: (busy: boolean) => void; prepareMaintenance: () => Promise<void>;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null), [token, setToken] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [review, setReview] = useState<UpdateInstallReview | null>(null), [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let current = true;
    void sdk.application.updates.status().then((value) => { if (current) setStatus(value.update); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The actual private update status is unavailable."); });
    return () => { current = false; };
  }, [sdk, revision]);
  useEffect(() => { onBusy(busy || token.length > 0 || Boolean(review)); return () => onBusy(false); }, [busy, token, review, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Original update work is unconfirmed. No alternate account, install or retry was used."); }
    finally { setBusy(false); }
  };
  const operation = status?.operation, owned = Boolean(operation && ["checking", "downloading", "cancelling", "installing"].includes(operation.status));
  return <section aria-label="Private application updates"><h3>Private GitHub updates</h3>
    <SettingsHelp label="More about this setting">Fixed source: mbianchidev/moguri. The updater uses its own secure, whole-store-owned GitHub PAT, not Copilot sign-in or the GitHub CLI account. Prefer a fine-grained token limited to this repository with Contents read access.</SettingsHelp>
    <p className="fine-print">Running build: {status?.currentVersion ?? "unobserved"}. Separate credential: {status?.credential ?? "unobserved"}. No credential read is inferred from a provider login.</p>
    <label className="setting-field">Private release PAT<SettingsInput type="password" aria-label="Private release PAT" autoComplete="off" value={token} disabled={disabled || busy || owned} onChange={(event) => setToken(event.target.value)} /></label>
    <div className="button-row"><button type="button" disabled={disabled || busy || owned || !token} onClick={() => void run(async () => {
      await sdk.application.updates.setToken(token); setToken(""); setStatus((await sdk.application.updates.status()).update);
    })}>Save private release PAT</button>
      <button type="button" disabled={disabled || busy || owned || Boolean(token)} onClick={() => void run(async () => { setStatus((await sdk.application.updates.credential()).update); })}>Inspect updater credential</button>
      <button type="button" disabled={disabled || busy || owned} onClick={() => void run(async () => { await sdk.application.updates.setToken(null); setToken(""); setStatus((await sdk.application.updates.status()).update); })}>Remove updater credential</button>
      <button type="button" disabled={busy || !token} onClick={() => setToken("")}>Discard token edit</button></div>
    {status?.diagnostic && <p className="settings-warning">{status.diagnostic}</p>}
    <p className="settings-warning">Updates do not require Apple signing. Integrity/repository checks are not notarization or an independent signing trust root. Moguri retains quarantine and never bypasses Gatekeeper or other OS warnings. Downloading/staging does not execute new code.</p>
    <div className="button-row"><button type="button" disabled={disabled || busy || owned || !status?.enabled || Boolean(token)} onClick={() => void run(async () => {
      await sdk.application.updates.check(); setStatus((await sdk.application.updates.status()).update);
    })}>Check for updates now</button>
      {operation && ["checking", "downloading"].includes(operation.status) && <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.application.updates.cancel(operation.id); })}>Cancel original update</button>}</div>
    {operation && <><p role="status">Update: {operation.status}{operation.release ? ` / ${operation.release.manifest.version}` : ""}. {operation.diagnostic}</p>
      {operation.stagedBundle && <p className="fine-print path">Retained verified stage: {operation.stagedBundle}</p>}
      {operation.status === "ready" && !status?.installable && <><p className="fine-print">Installing updates requires Moguri's packaged app.</p><SettingsHelp label="About source-runtime update limits">This unpackaged/source runtime can inspect and stage releases, but cannot replace the checkout. Installation needs the actual owned packaged app.</SettingsHelp></>}
      {operation.status === "ready" && status?.installable && <button type="button" disabled={disabled || busy || Boolean(token)} onClick={() => void run(async () => {
        setReview((await sdk.application.updates.installPreview(operation.id)).review); setConfirmed(false);
      })}>Review install and restart</button>}</>}
    {review && <><dl className="facts"><dt>New version</dt><dd>{review.version}</dd><dt>Exact destination</dt><dd className="path">{review.destination}</dd>
      <dt>Preserved previous app</dt><dd className="path">{review.backup}</dd><dt>Old bundle SHA-512</dt><dd className="path">{review.oldBundleSha512}</dd><dt>New bundle SHA-512</dt><dd className="path">{review.bundleSha512}</dd></dl>
      <p className="settings-warning">Confirmation stops all profile work and restarts the actual app. Unknown accounting stays held and authenticated terminals survive without input replay. A trusted current-code helper preserves the old bundle and verifies the exact same-filesystem candidate. Interrupted work never installs itself again.</p>
      <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the exact old/new application bytes, destination, backup and restart</label>
      <div className="button-row"><button type="button" className="primary" disabled={disabled || busy || !confirmed || Boolean(token)} onClick={() => void run(async () => { await prepareMaintenance(); await window.moguri.installUpdate(review.id, review.digest); })}>Install verified update and restart</button>
        <button type="button" disabled={busy} onClick={() => { setReview(null); setConfirmed(false); }}>Cancel install review</button></div></>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
