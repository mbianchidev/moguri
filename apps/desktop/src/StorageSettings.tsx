import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { MoguriSdk, StorageMoveReview, StorageStatus } from "../../../packages/sdk/src/index.ts";

export function StorageSettings({ sdk, disabled, onBusy, prepareMaintenance }: {
  sdk: MoguriSdk; disabled: boolean; onBusy: (busy: boolean) => void; prepareMaintenance: () => Promise<void>;
}) {
  const [storage, setStorage] = useState<StorageStatus | null>(null), [path, setPath] = useState(""), [review, setReview] = useState<StorageMoveReview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [output, setOutput] = useState("");
  useEffect(() => {
    let current = true;
    void sdk.application.storage.status().then((result) => { if (current) { setStorage(result.storage); setPath(result.storage.directory); } })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The authoritative storage location could not be read."); });
    return () => { current = false; };
  }, [sdk]);
  useEffect(() => { onBusy(busy || Boolean(review) || Boolean(storage && path !== storage.directory)); return () => onBusy(false); }, [busy, review, path, storage, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Storage maintenance is unconfirmed. Original data was preserved; no copy was retried."); }
    finally { setBusy(false); }
  };
  const change = (value: string) => { setPath(value); setReview(null); setConfirmed(false); setOutput(""); };
  return <section aria-label="Whole-store location"><SettingsHelp label="More about this setting" target={<h3>Change storage location</h3>}>The entire encrypted store moves together: all profiles, sessions, independent artifacts, credentials references and budget holds. Project files, managed worktrees, model/cache files and terminal owners remain at their captured resource roots.</SettingsHelp>
    <label className="setting-field">Session storage location<SettingsInput aria-label="Session storage location" value={path} disabled={disabled || busy || !storage?.enabled || storage.explicitOverride} onChange={(event) => change(event.target.value)} /></label>
    <div className="button-row"><button type="button" disabled={disabled || busy || !storage?.enabled || storage.explicitOverride} onClick={() => void run(async () => { const path = await window.moguri.chooseStorageDirectory(); if (path) change(path); })}>Choose storage parent</button>
      <button type="button" disabled={disabled || busy || !storage?.enabled || storage.explicitOverride || path === storage.directory} onClick={() => void run(async () => { setReview((await sdk.application.storage.preview(path)).review); setConfirmed(false); })}>Review storage relocation</button>
      <button type="button" disabled={busy} onClick={() => { if (storage) change(storage.directory); }}>Discard storage edit</button></div>
    {storage?.explicitOverride && <p className="settings-warning">This launch explicitly selected MOGURI_STATE_DIR. Restart without the override before changing default storage. It is never silently cleared or rewritten.</p>}
    {storage?.diagnostic && <p className="settings-warning">{storage.diagnostic}</p>}
    {review && <><dl className="facts"><dt>Encrypted source</dt><dd className="path">{review.source}</dd><dt>New data directory</dt><dd className="path">{review.destination}</dd>
      <dt>Original resources retained</dt><dd className="path">{review.resourceBase}</dd><dt>Profiles / actual owners</dt><dd>{review.profiles.length} / {review.activeOwners.length}</dd></dl>
      <p className="settings-warning">Confirmation stops owned model/tool work and closes every SQLite writer before copying. Unknown accounting remains held. Authenticated user terminals survive this explicit restart without input replay. The old encrypted database remains a retired backup, not a second writer. Neither source nor partial destination is automatically deleted.</p>
      <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the exact source, destination, retained resources and restart impact</label>
      <button type="button" className="primary" disabled={disabled || busy || !confirmed} onClick={() => void run(async () => {
        await prepareMaintenance();
        const result = await window.moguri.relocateStorage(review.destination, review.digest);
        setReview(null); setConfirmed(false); setPath(result.directory); setStorage((current) => current ? { ...current, directory: result.directory } : current);
        setOutput(`Encrypted store copied and discovery published at ${result.directory}. Restart was suppressed in the generated hidden window.`);
      })}>Move store and restart Moguri</button></>}
    {storage?.operation && <p className="fine-print">Last relocation: {storage.operation.status}. {storage.operation.diagnostic}</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}{output && <p role="status">{output}</p>}
  </section>;
}
