import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { PathField, localPath } from "./PathField.tsx";
import { useEffect, useState } from "react";
import type { MoguriSdk, StorageMoveReview, StorageStatus } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export function StorageSettings({ sdk, disabled, onBusy, prepareMaintenance }: {
  sdk: MoguriSdk; disabled: boolean; onBusy: (busy: boolean) => void; prepareMaintenance: () => Promise<void>;
}) {
  const [storage, setStorage] = useState<StorageStatus | null>(null), [path, setPath] = useState(""), [review, setReview] = useState<StorageMoveReview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [output, setOutput] = useState("");
  useEffect(() => {
    let current = true;
    void sdk.application.storage.status().then((result) => { if (current) { setStorage(result.storage); setPath(result.storage.directory); } })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The storage location could not be read."); });
    return () => { current = false; };
  }, [sdk]);
  useEffect(() => { onBusy(busy || Boolean(review) || Boolean(storage && path !== storage.directory)); return () => onBusy(false); }, [busy, review, path, storage, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "The storage move couldn't be confirmed. Your data was kept and nothing was retried."); }
    finally { setBusy(false); }
  };
  const change = (value: string) => { setPath(value); setReview(null); setConfirmed(false); setOutput(""); };
  return <section aria-label="Whole-store location"><SettingsHelp label="More about this setting" target={<h3>Change storage location</h3>}>Moves all profiles, sessions and artifacts together. Project files, worktrees and model or cache files stay where they are.</SettingsHelp>
    <PathField label="Session storage location" ariaLabel="Session storage location" value={path} onChange={change} kind="folder"
      choose={() => window.moguri.chooseStorageDirectory()} chooseLabel="Choose" chooseAriaLabel="Choose storage parent" disabled={disabled || busy || !storage?.enabled || storage.explicitOverride}>
      <button type="button" disabled={disabled || busy || !storage?.enabled || storage.explicitOverride || path === storage.directory} onClick={() => void run(async () => { setReview((await sdk.application.storage.preview(localPath(path))).review); setConfirmed(false); })} aria-label="Review storage relocation">Review</button>
      <button type="button" disabled={busy} onClick={() => { if (storage) change(storage.directory); }} aria-label="Discard storage edit">Discard</button>
    </PathField>
    {storage?.explicitOverride && <Alert as="p" tone="warning" className="settings-warning">MOGURI_STATE_DIR is set for this launch. Restart without it to change the storage location.</Alert>}
    {storage?.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{storage.diagnostic}</Alert>}
    {review && <><dl className="facts"><dt>Current location</dt><dd className="path">{review.source}</dd><dt>New location</dt><dd className="path">{review.destination}</dd>
      <dt>Resources left in place</dt><dd className="path">{review.resourceBase}</dd><dt>Profiles / active owners</dt><dd>{review.profiles.length} / {review.activeOwners.length}</dd></dl>
      <Alert as="p" tone="warning" className="settings-warning">Moving stops running model and tool work, copies the store and restarts Moguri. Your terminals stay open, and the old copy is kept as a backup.</Alert>
      <label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed these locations and want to move storage and restart</label>
      <button type="button" className="primary" disabled={disabled || busy || !confirmed} onClick={() => void run(async () => {
        await prepareMaintenance();
        const result = await window.moguri.relocateStorage(review.destination, review.digest);
        setReview(null); setConfirmed(false); setPath(result.directory); setStorage((current) => current ? { ...current, directory: result.directory } : current);
        setOutput(`Storage copied to ${result.directory}. Restart was suppressed in the generated hidden window.`);
      })} aria-label="Move and restart Moguri with relocated storage">Move and restart</button></>}
    {storage?.operation && <p className="fine-print">Last relocation: {storage.operation.status}. {storage.operation.diagnostic}</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{output && <Alert as="p" role="status">{output}</Alert>}
  </section>;
}
