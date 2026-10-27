import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import {
  defaultSandboxManagement, type MoguriSdk, type SandboxManagement, type SandboxSetupReview, type SandboxSetupStatus, type Snapshot,
} from "../../../packages/sdk/src/index.ts";

const active = new Set(["checking", "preparing", "installing", "importing", "verifying"]);
export function SandboxSetupPanel({ sdk, snapshot, value, disabled, onBusy, onDirty, update }: {
  sdk: MoguriSdk; snapshot: Snapshot; disabled: boolean; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void;
  value: SandboxManagement | undefined;
  update: (patch: Partial<SandboxManagement>) => void;
}) {
  const management = { ...defaultSandboxManagement(), ...value };
  const [status, setStatus] = useState<SandboxSetupStatus | null>(null), [review, setReview] = useState<SandboxSetupReview | null>(null);
  const [accepted, setAccepted] = useState(false), [version, setVersion] = useState(management.version);
  const [requesting, setRequesting] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), editedVersion = useRef(false);
  const busy = requesting || Boolean(status?.operation && active.has(status.operation.status));
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const selectedVersion = status?.selectedVersion ?? management.version;
  useEffect(() => { onDirty(version !== selectedVersion); return () => onDirty(false); }, [version, selectedVersion, onDirty]);
  useEffect(() => { setReview(null); setAccepted(false); if (!editedVersion.current) setVersion(management.version); }, [snapshot.settings.revision]);
  useEffect(() => {
    const token = ++generation.current; let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const value = await sdk.sandbox.setup.status();
        if (generation.current === token) { setStatus(value.setup); if (!editedVersion.current) setVersion(value.setup.selectedVersion); }
      }
      catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "Native setup status could not be read."); }
      finally { loading = false; }
    };
    void load(); const timer = setInterval(() => void load(), 1000);
    return () => { generation.current++; clearInterval(timer); };
  }, [sdk]);
  const run = async (operation: (owned: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setRequesting(true); setError("");
    const token = generation.current;
    try { await operation(() => generation.current === token); }
    catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "Managed setup was not confirmed. Original configuration and work remain retained."); }
    finally {
      pending.current = false;
      if (generation.current === token) {
        setRequesting(false);
        try { const value = await sdk.sandbox.setup.status(); if (generation.current === token) setStatus(value.setup); }
        catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "Original setup status could not be confirmed."); }
      }
    }
  };
  const wait = async (id: string) => {
    const result = await sdk.sandbox.setup.wait(id);
    if (["partial", "failed", "cancelled"].includes(result.operation.status)) throw new Error(result.operation.diagnostic ?? "Original native setup did not complete.");
    return result.operation;
  };
  const reviewVersion = async (owned: () => boolean) => {
    const selected = version.trim();
    if (selected !== status?.bundledVersion) await wait((await sdk.sandbox.setup.prepare(selected)).id!);
    const value = await sdk.sandbox.setup.review(selected);
    if (owned()) { setReview(value.review); setAccepted(false); }
  };
  return <section className="candidate-section" aria-label="Managed SendBox setup" aria-busy={busy}>
    <SettingsHelp label="More about this setting" target={<h3>Ready-to-use Sandbox</h3>}>Moguri supplies its pinned worker image, Linux Node runtime and native dependencies. Review once; private workspaces and the selected provider's DNS aliases are managed automatically.</SettingsHelp>
    <p className="fine-print">Configured SendBox: {status?.selectedVersion ?? management.version}. Bundled version: {status ? status.bundledVersion ?? "not included in this runtime" : "checking"}. New versions install side by side, never over your existing SendBox.</p>
    {status && <p className="fine-print" role="status">{status.diagnostic}</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {status?.operation && <p className="fine-print" role="status">Setup {status.operation.status}. {status.operation.diagnostic}</p>}
    {status?.operation && active.has(status.operation.status) && <button type="button" onClick={() => {
      void sdk.sandbox.setup.cancel(status.operation!.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Original setup cancellation was not confirmed."));
    }}>Cancel original setup</button>}
    <div className="setting-editor">
      <label className="setting-field">SendBox version to review<SettingsInput aria-label="SendBox version to review" value={version} disabled={disabled || busy}
        onChange={(event) => { editedVersion.current = true; setVersion(event.target.value); setReview(null); setAccepted(false); }} /></label>
      <button type="button" className="primary" disabled={disabled || busy || !status?.supported || !version.trim()} onClick={() => void run(reviewVersion)}>
        {version.trim() === status?.bundledVersion ? "Review bundled setup" : "Prepare version for review"}
      </button>
      {version !== selectedVersion && <button type="button" disabled={busy} onClick={() => {
        editedVersion.current = false; setVersion(selectedVersion); setReview(null); setAccepted(false);
      }}>Keep configured version</button>}
    </div>
    <label className="check-setting"><SettingsInput type="checkbox" checked={management.automaticUpdates} disabled={disabled || busy}
      onChange={(event) => update({ automaticUpdates: event.target.checked })} />Check public SendBox releases at startup and every four hours</label>
    <button type="button" disabled={disabled || busy || !status?.supported} onClick={() => void run(async () => { await wait((await sdk.sandbox.setup.check()).id!); })}>Check SendBox updates now</button>
    {status?.availableRelease && <p className="fine-print">SendBox {status.availableRelease.version} is available. Your configured version has not changed.
      <button type="button" disabled={disabled || busy} onClick={() => { editedVersion.current = true; setVersion(status.availableRelease!.version); setReview(null); setAccepted(false); }}>Review available version</button></p>}
    <label className="check-setting"><SettingsInput type="checkbox" checked={management.automaticWorkspaces} disabled={disabled || busy}
      onChange={(event) => update({ automaticWorkspaces: event.target.checked })} />Prepare private session workspaces automatically</label>
    <label className="check-setting"><SettingsInput type="checkbox" checked={management.automaticProviderNetwork} disabled={disabled || busy}
      onChange={(event) => update({ automaticProviderNetwork: event.target.checked })} />Automatically allow the selected model provider's actual HTTPS endpoint and public DNS aliases</label>
    <p className="settings-warning">GitHub website/API access is included. Review the selected release's network delegation below: SendBox 0.2.4 expands github.com through GitHub Meta, including shared-cloud IP ranges. No host credentials, private/metadata addresses or Local fallback are granted.</p>
    {review && <section className="candidate-binding" aria-label="Exact managed Sandbox review">
      <SettingsHelp label="More about this setting" target={<h4>SendBox {review.version} / Moguri protocol {review.protocol}</h4>}>Linux Node 26.12.0, Moguri's agent worker and native PTY dependencies are included. No build, container command or manual SHA entry is required.</SettingsHelp>
      <p>{review.diagnostic}</p>
      <p className="fine-print path">Release location: {review.destination}</p>

      <details><summary>Exact runtime and image identities</summary>
        <p className="fine-print path">Image: {review.configuration.image}</p>
        <p className="fine-print path">Worker SHA-256: {review.configuration.qualification?.workerDigest}</p>
        <p className="fine-print path">Bridge SHA-256: {review.configuration.qualification?.bridgeDigest}</p>
        <p className="fine-print path">Installer SHA-512: {review.installerSha512}</p>
        <p className="fine-print path">Image archive SHA-512: {review.imageArchiveSha512}</p>
      </details>
      <label className="check-setting"><SettingsInput type="checkbox" checked={accepted} disabled={disabled || busy} onChange={(event) => setAccepted(event.target.checked)} />
        I reviewed this runtime, pinned worker, private-workspace mode and provider/network policy.{review.administratorRequired ? " Installation will request my administrator approval." : " Existing verified release files will be reused."}
      </label>
      <button type="button" className="primary" disabled={disabled || busy || !accepted || !snapshot.policy.allowedEnvs.includes("Sandbox")} onClick={() => void run(async (owned) => {
        const admitted = await sdk.sandbox.setup.apply(review); await wait(admitted.id!);
        if (!owned()) return;
        editedVersion.current = false; setVersion(review.version); setReview(null); setAccepted(false);
      })}>{management.enabled ? "Apply reviewed Sandbox setup" : "Enable Sandbox"}</button>
    </section>}
  </section>;
}
