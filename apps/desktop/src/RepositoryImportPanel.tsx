import { useEffect, useRef, useState } from "react";
import { successfulImportItem, type MoguriSdk, type RepositoryImportPreview, type Snapshot } from "@moguri-dev/sdk";
import { SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";
import { WorkspaceFolderPanel } from "./WorkspaceFolderPanel.tsx";
import { PathField, localPath } from "./PathField.tsx";
import { usePendingWork } from "./pending-work.ts";

export function RepositoryImportPanel({ sdk, snapshot, onDirty, configureProject }: {
  sdk: MoguriSdk; snapshot: Snapshot; onDirty: (dirty: boolean) => void; configureProject: (id?: string) => void;
}) {
  const [text, setText] = useState(""), [parent, setParent] = useState("");
  const [preview, setPreview] = useState<RepositoryImportPreview | null>(null), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [selectedId, setSelectedId] = useState("");
  const [original, setOriginal] = useState<RepositoryImportPreview["document"] | null>(null);
  const [inspected, setInspected] = useState<number[]>([]), [folderDirty, setFolderDirty] = useState(false);
  const pending = useRef(false), owner = useRef(sdk); owner.current = sdk;
  const batches = [...snapshot.repositoryImports].reverse(), selected = batches.find((batch) => batch.id === selectedId) ?? batches[0];
  const active = batches.find((batch) => batch.status === "running"), localAllowed = snapshot.policy.allowedEnvs.includes("Local");
  const canImport = preview && reviewed && !preview.document.entries.some((entry) => ["invalid", "blocked"].includes(entry.disposition));
  const revisionKey = JSON.stringify([sdk.profileId, snapshot.policy.revision, snapshot.settings.permissionRevision,
    snapshot.projects.map((project) => [project.id, project.path]), snapshot.projectConfigurations.map((configuration) => [configuration.projectId, configuration.revision])]);
  useEffect(() => { setPreview(null); setReviewed(false); }, [revisionKey]);
  useEffect(() => { setInspected([]); }, [selected?.id, selected?.revision]);
  usePendingWork(busy);
  useEffect(() => { onDirty(Boolean(text) || busy || folderDirty); return () => onDirty(false); }, [text, busy, folderDirty, onDirty]);
  const invalidate = () => { setPreview(null); setReviewed(false); setError(""); };
  const run = async (operation: (owned: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = sdk; setBusy(true); setError("");
    try { await operation(() => owner.current === captured); }
    catch (error) { if (owner.current === captured) setError(error instanceof Error ? error.message : "The import didn't respond. Check the import history before starting again; nothing was retried."); }
    finally { pending.current = false; if (owner.current === captured) setBusy(false); }
  };
  return <section aria-label="Repository management" aria-busy={busy}>
    <h2>Repositories</h2>
    <p className="fine-print">Add projects from a folder on this Mac, or clone them from their URLs.</p>
    <WorkspaceFolderPanel sdk={sdk} snapshot={snapshot} onDirty={setFolderDirty} />
    <h3>Clone from URLs</h3>
    <p className="fine-print">Clone a list of repositories into a folder you choose, after previewing each URL and destination.</p>
    {!localAllowed && <Alert as="p" tone="warning">Your execution policy blocks Local, so repositories can't be cloned here.</Alert>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
    <form onSubmit={(event) => { event.preventDefault(); void run(async (owned) => {
      const result = await sdk.projects.imports.preview({ text, parent: localPath(parent) }); if (owned()) { setPreview(result.preview); setReviewed(false); }
    }); }}>
      <label className="setting-field">Repository URLs, one per line<SettingsTextarea aria-label="Repository URLs" value={text} maxLength={65536} rows={8} spellCheck={false}
        disabled={busy || Boolean(active)} placeholder={"- https://github.com/generated-owner/project\n- git@github.com:another-owner/project.git"}
        onChange={(event) => { setText(event.target.value); invalidate(); }} /></label>
      <PathField label="Import parent folder" ariaLabel="Import parent folder" value={parent} onChange={(value) => { setParent(value); invalidate(); }} kind="folder"
        choose={() => window.moguri.chooseProject("clone")} chooseLabel="Choose import folder" disabled={busy || Boolean(active)} placeholder="/path/to/existing/folder or ~/folder">
        <button type="submit" disabled={busy || Boolean(active) || !localAllowed || !text.trim() || !parent.trim()}>Preview repository import</button>
      </PathField>
    </form>
    {preview && <section aria-label="Repository import preview" className="github-write-review">
      <p>Parent folder: <code>{preview.document.parent.root}</code></p>
      <p className="fine-print">HTTPS or SSH URLs without credentials, up to 100. Clones run one at a time with your existing SSH keys, and skip hooks and submodules.</p>
      {preview.document.warnings.map((warning, index) => <Alert as="p" tone="warning" key={index}>{warning}</Alert>)}
      <ol className="repository-import-list">{preview.document.entries.map((entry) => <li key={entry.line}>
        <strong>{entry.disposition}</strong> <code>{entry.repository ?? entry.source}</code><span className="path">{entry.path ?? "No destination"}</span>
        {entry.diagnostic && <small>{entry.diagnostic}</small>}
      </li>)}</ol>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} disabled={busy || Boolean(active)}
        onChange={(event) => setReviewed(event.target.checked)} />I reviewed these sources and destinations and want to import them</label>
      <button type="button" className="primary" disabled={!canImport || busy || Boolean(active)} onClick={() => void run(async (owned) => {
        const result = await sdk.projects.imports.start(preview, true);
        if (owned()) { setSelectedId(result.id!); setPreview(null); setReviewed(false); setText(""); setOriginal(null); }
      })}>Import repositories</button>
    </section>}
    {selected && <section aria-label="Repository import results">
      <h3>Import history</h3>
      <label className="setting-field">Batch<select aria-label="Original import batch" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setOriginal(null); }}>
        {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.createdAt} / {batch.status} / {batch.items.length} entries</option>)}
      </select></label>
      <p role="status">{selected.status}: {selected.items.filter(successfulImportItem).length} of {selected.items.length} entries resolved{selected.status === "running" ? ", one repository at a time" : ""}.</p>
      {selected.status === "running" && <button type="button" disabled={busy || selected.cancelRequested} onClick={() => void run(async () => { await sdk.projects.imports.cancel(selected.id); })}>
        {selected.cancelRequested ? "Cancellation requested" : "Cancel repository import"}</button>}
      {selected.diagnostic && <Alert as="p" tone="warning">{selected.diagnostic}</Alert>}
      <ol className="repository-import-list">{selected.items.map((item) => <li key={item.line}>
        <strong>{item.status}</strong> <code>{item.repository}</code><span className="path">{item.path}</span>{item.diagnostic && <small>{item.diagnostic}</small>}
        {item.status === "partial" && !item.inspection && selected.status !== "running" && <>
          <label className="check-setting"><SettingsInput type="checkbox" checked={inspected.includes(item.line)} onChange={(event) =>
            setInspected((current) => event.target.checked ? [...current, item.line] : current.filter((line) => line !== item.line))} />
            I checked the leftover files and any running processes for entry {item.line}.</label>
          <button type="button" disabled={busy || !inspected.includes(item.line)} onClick={() => void run(async () => {
            await sdk.projects.imports.acknowledge(selected.id, item.line, selected.revision, true);
          })}>Acknowledge inspected entry {item.line}</button>
        </>}
        {item.inspection && <small>You acknowledged this partial import. It stays partial and isn't retried.</small>}
        {item.projectId && successfulImportItem(item) && snapshot.projects.some((project) => project.id === item.projectId) &&
          <button type="button" disabled={Boolean(text) || busy} onClick={() => configureProject(item.projectId!)}>Configure imported project</button>}
      </li>)}</ol>
      <button type="button" disabled={busy} onClick={() => void run(async (owned) => {
        const result = await sdk.projects.imports.read(selected.id); if (owned()) setOriginal(result.review);
      })}>Show import review</button>
      {original && <details open><summary>Reviewed sources and destinations</summary><pre>{JSON.stringify(original, null, 2)}</pre></details>}
    </section>}
    <h3>Registered projects</h3><p className="fine-print">{snapshot.projects.length} project{snapshot.projects.length === 1 ? "" : "s"} in this profile. Change a repository's remote and other options in Project settings.</p>
    <div className="button-row"><button type="button" disabled={Boolean(text) || busy || !snapshot.projects.length} onClick={() => configureProject()}>Manage projects</button></div>
  </section>;
}
