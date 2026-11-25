import { SettingsAction, SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useId, useState } from "react";
import { UPDATE_TOKEN_CREATION_URL, UPDATE_TOKEN_GUIDANCE, type MoguriSdk, type UpdateInstallReview, type UpdateStatus } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

const UPDATE_CREDENTIAL_LABELS: Record<UpdateStatus["credential"], string> = {
  unobserved: "not checked", configured: "saved", missing: "none, using public releases", failed: "couldn't be read",
};

export function UpdateSettings({ sdk, revision, disabled, onBusy, prepareMaintenance }: {
  sdk: MoguriSdk; revision: number; disabled: boolean; onBusy: (busy: boolean) => void; prepareMaintenance: () => Promise<void>;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null), [token, setToken] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const setupDescription = useId();
  const [review, setReview] = useState<UpdateInstallReview | null>(null), [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let current = true;
    void sdk.application.updates.status().then((value) => { if (current) setStatus(value.update); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Update status is unavailable."); });
    return () => { current = false; };
  }, [sdk, revision]);
  useEffect(() => { onBusy(busy || token.length > 0 || Boolean(review)); return () => onBusy(false); }, [busy, token, review, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "The update action couldn't be confirmed. Nothing was retried."); }
    finally { setBusy(false); }
  };
  const operation = status?.operation, owned = Boolean(operation && ["checking", "downloading", "cancelling", "installing"].includes(operation.status));
  return <section aria-label="Application updates"><SettingsHelp label="More about this setting" target={<h3>GitHub updates</h3>}>Updates come from Moguri's public GitHub releases and need no token. While the release repository is private, or to raise GitHub's rate limit, save a fine-grained token with read-only Contents access. It stays separate from Copilot and the GitHub CLI.</SettingsHelp>
    <button type="button" disabled={busy} aria-describedby={setupDescription} onClick={() => void run(async () => { await window.moguri.openExternal(UPDATE_TOKEN_CREATION_URL); })}>Set up read-only update access</button>
    <p id={setupDescription} className="fine-print">Optional. Opens GitHub with read-only Contents access prefilled. Under Repository access, choose Only select repositories, then the Moguri release repository.</p>
    <details className="update-token-help"><summary>Create a token with the right permissions</summary><ol>{UPDATE_TOKEN_GUIDANCE.map((step) => <li key={step}>{step}</li>)}</ol></details>
    <p className="fine-print">Version: {status?.currentVersion ?? "checking..."} · Update token: {UPDATE_CREDENTIAL_LABELS[status?.credential ?? "unobserved"]}</p>
    <label className="setting-field">Release access token (optional)<SettingsInput type="password" aria-label="Release access token" autoComplete="off" value={token} disabled={disabled || busy || owned} onChange={(event) => setToken(event.target.value)} /></label>
    <div className="button-row"><button type="button" disabled={disabled || busy || owned || !token} onClick={() => void run(async () => {
      await sdk.application.updates.setToken(token); setToken(""); setStatus((await sdk.application.updates.status()).update);
    })} aria-label="Store release access token">Store</button>
      <button type="button" disabled={disabled || busy || owned || Boolean(token)} onClick={() => void run(async () => { setStatus((await sdk.application.updates.credential()).update); })} aria-label="Inspect updater credential">Inspect</button>
      <SettingsAction label="Remove updater credential" icon="Trash" disabled={disabled || busy || owned} onClick={() => void run(async () => { await sdk.application.updates.setToken(null); setToken(""); setStatus((await sdk.application.updates.status()).update); })} />
      <button type="button" disabled={busy || !token} onClick={() => setToken("")} aria-label="Discard token edit">Discard</button></div>
    {status?.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{status.diagnostic}</Alert>}
    <Alert as="p" tone="warning" className="settings-warning">Development builds aren't notarized, so macOS may warn when an update installs. Moguri never bypasses Gatekeeper.</Alert>
    <div className="button-row"><button type="button" disabled={disabled || busy || owned || !status?.enabled || Boolean(token)} onClick={() => void run(async () => {
      await sdk.application.updates.check(); setStatus((await sdk.application.updates.status()).update);
    })} aria-label="Check for updates now">Check</button>
      {operation && ["checking", "downloading"].includes(operation.status) && <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.application.updates.cancel(operation.id); })} aria-label="Cancel original update">Cancel</button>}</div>
    {operation && <><p role="status">Update: {operation.status}{operation.release ? ` / ${operation.release.manifest.version}` : ""}. {operation.diagnostic}</p>
      {operation.stagedBundle && <p className="fine-print path">Verified download: {operation.stagedBundle}</p>}
      {operation.status === "ready" && !status?.installable && !status?.manager && <SettingsHelp label="About source-runtime update limits" target={<p className="fine-print">Installing updates requires Moguri's packaged app.</p>}>This development build can check for and download updates, but it can't install them.</SettingsHelp>}
      {operation.status === "ready" && status?.installable && <button type="button" disabled={disabled || busy || Boolean(token)} onClick={() => void run(async () => {
        setReview((await sdk.application.updates.installPreview(operation.id)).review); setConfirmed(false);
      })} aria-label="Review install and restart">Review install</button>}</>}
    {review && <><dl className="facts"><dt>New version</dt><dd>{review.version}</dd><dt>Install location</dt><dd className="path">{review.destination}</dd>
      <dt>Backup of current app</dt><dd className="path">{review.backup}</dd><dt>Current app SHA-512</dt><dd className="path">{review.oldBundleSha512}</dd><dt>New app SHA-512</dt><dd className="path">{review.bundleSha512}</dd></dl>
      <Alert as="p" tone="warning" className="settings-warning">Installing stops running work in every profile and restarts Moguri. Your terminals stay open, and the current app is kept as a backup.</Alert>
      <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this update and want to install it and restart</label>
      <div className="button-row"><button type="button" className="primary" disabled={disabled || busy || !confirmed || Boolean(token)} onClick={() => void run(async () => { await prepareMaintenance(); await window.moguri.installUpdate(review.id, review.digest); })} aria-label="Install and restart with verified update">Install and restart</button>
        <button type="button" disabled={busy} onClick={() => { setReview(null); setConfirmed(false); }} aria-label="Cancel install review">Cancel</button></div></>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
