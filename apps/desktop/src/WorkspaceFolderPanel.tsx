import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Snapshot, WorkspaceFolderObservation, WorkspaceFolderPreview } from "../../../packages/sdk/src/index.ts";
import { SettingsAction, SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";
import { PathField, localPath } from "./PathField.tsx";

const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const checkedLabel = (status: WorkspaceFolderObservation | undefined) => {
  if (!status) return "";
  if (status.status === "checking") return "Checking...";
  if (!status.checkedAt) return "Not checked yet";
  const time = new Date(status.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Checked at ${time}${status.added ? `, added ${plural(status.added, "repository", "repositories")}` : ""}`;
};

/** Trusted workspace folders: Moguri reads them to find repositories and adds those as read-only projects. */
export function WorkspaceFolderPanel({ sdk, snapshot, onDirty }: { sdk: MoguriSdk; snapshot: Snapshot; onDirty: (dirty: boolean) => void }) {
  const [preview, setPreview] = useState<WorkspaceFolderPreview | null>(null), [include, setInclude] = useState<string[]>([]);
  const [sync, setSync] = useState(true), [trusted, setTrusted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [status, setStatus] = useState<WorkspaceFolderObservation[]>([]), [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const pending = useRef(false), owner = useRef(sdk); owner.current = sdk;
  const folders = snapshot.workspaceFolders, localAllowed = snapshot.policy.allowedEnvs.includes("Local");
  const folderKey = JSON.stringify([sdk.profileId, folders.map((folder) => [folder.id, folder.revision]), snapshot.projects.length]);
  const checking = status.some((entry) => entry.status === "checking");
  useEffect(() => { onDirty(Boolean(preview) || busy); return () => onDirty(false); }, [preview, busy, onDirty]);
  useEffect(() => {
    let current = true;
    const load = () => { void sdk.projects.folders.status().then((value) => { if (current) setStatus(value.folders); }).catch(() => {}); };
    load();
    const timer = checking ? setInterval(load, 1500) : undefined;
    return () => { current = false; if (timer) clearInterval(timer); };
  }, [sdk, folderKey, checking]);
  const run = async (operation: (owned: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = sdk; setBusy(true); setError(""); setNotice("");
    try {
      await operation(() => owner.current === captured);
      if (owner.current === captured) setStatus((await captured.projects.folders.status()).folders);
    } catch (error) { if (owner.current === captured) setError(error instanceof Error ? error.message : "Moguri couldn't read that folder. Nothing was imported."); }
    finally { pending.current = false; if (owner.current === captured) setBusy(false); }
  };
  const load = async (path: string, owned: () => boolean) => {
    const result = await sdk.projects.folders.preview(path);
    if (!owned()) return;
    setPreview(result.preview); setTrusted(false);
    const existing = folders.find((folder) => folder.id === result.preview.document.folderId);
    setSync(existing?.sync ?? true);
    setInclude(result.preview.document.entries.filter((entry) => entry.disposition === "new").map((entry) => entry.relative));
  };
  const close = () => { setPreview(null); setInclude([]); setTrusted(false); setFolderPath(""); };
  const selectable = preview?.document.entries.filter((entry) => entry.disposition !== "registered") ?? [];
  const registered = preview?.document.entries.filter((entry) => entry.disposition === "registered") ?? [];
  return <section aria-label="Workspace folders" aria-busy={busy}>
    <SettingsHelp label="About workspace folders" target={<h3>Workspace folders</h3>}>Moguri reads the folder to find Git repositories and adds each one as a project. It never edits them: every session works in its own worktree in Moguri's storage.</SettingsHelp>
    <p className="fine-print">Add the folder that holds your repositories. Moguri only reads it.</p>
    {!localAllowed && <Alert as="p" tone="warning">Your execution policy blocks Local, so Moguri can't read folders on this Mac.</Alert>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
    {notice && <p role="status" className="fine-print">{notice}</p>}
    {!preview && <PathField label="Folder" ariaLabel="Workspace folder path" value={folderPath} onChange={setFolderPath} kind="folder"
      choose={() => window.moguri.chooseProject("workspace")} chooseLabel="Choose folder…" chooseAriaLabel="Choose workspace folder"
      onChosen={(path) => void run((owned) => load(path, owned))} disabled={busy || !localAllowed} placeholder="~/workspace or /path/to/folder">
      <button type="button" disabled={busy || !localAllowed || !folderPath.trim()} onClick={() => void run((owned) => load(localPath(folderPath), owned))}>Find repositories</button>
    </PathField>}
    {preview && <section aria-label="Workspace folder review" className="github-write-review workspace-folder-review">
      <p>Folder: <code className="path">{preview.document.root.root}</code></p>
      {preview.document.diagnostic && <Alert as="p" tone="warning">{preview.document.diagnostic}</Alert>}
      {selectable.length ? <fieldset className="workspace-folder-repositories"><legend>Repositories to add ({include.length} of {selectable.length})</legend>
        <ul>{selectable.map((entry) => <li key={entry.relative}><label className="check-setting">
          <input type="checkbox" checked={include.includes(entry.relative)} disabled={busy}
            onChange={(event) => setInclude((current) => event.target.checked ? [...current, entry.relative] : current.filter((value) => value !== entry.relative))} />
          <span><strong>{entry.name}</strong>{entry.relative !== entry.name && <small className="path">{entry.relative}</small>}
            {entry.disposition === "excluded" && <small>Left out earlier</small>}</span></label></li>)}</ul>
      </fieldset> : <p className="fine-print">{registered.length ? "Every repository here is already a project." : "No Git repositories found in this folder."}</p>}
      {registered.length > 0 && <p className="fine-print">Already projects: {registered.map((entry) => entry.name).join(", ")}.</p>}
      {preview.document.linkedWorktrees > 0 && <p className="fine-print">Skipped {plural(preview.document.linkedWorktrees, "linked worktree")}.</p>}
      <fieldset className="workspace-folder-sync"><legend>After adding</legend>
        <label className="check-setting"><input type="radio" name="workspace-folder-sync" checked={sync} disabled={busy} onChange={() => setSync(true)} />
          <span>Keep in sync<small>New repositories in this folder are added automatically. Removed ones are never deleted.</small></span></label>
        <label className="check-setting"><input type="radio" name="workspace-folder-sync" checked={!sync} disabled={busy} onChange={() => setSync(false)} />
          <span>Import once<small>Only the repositories you pick now. You can turn on sync later.</small></span></label>
      </fieldset>
      <label className="check-setting"><SettingsInput type="checkbox" checked={trusted} disabled={busy} onChange={(event) => setTrusted(event.target.checked)} />
        I trust this folder and allow Moguri to read it</label>
      <div className="button-row">
        <button type="button" className="primary" disabled={busy || !trusted || !localAllowed}
          onClick={() => void run(async (owned) => {
            await sdk.projects.folders.import(preview, include, sync, true);
            if (owned()) { setNotice(include.length ? `Added ${plural(include.length, "project")}${sync ? " and kept the folder in sync" : ""}.` : "Folder added."); close(); }
          })}>{include.length ? `Add ${plural(include.length, "project")}` : "Add folder"}</button>
        <button type="button" disabled={busy} onClick={close}>Cancel</button>
      </div>
    </section>}
    {folders.length > 0 && <ul className="workspace-folder-list" aria-label="Added workspace folders">{folders.map((folder) => {
      const entry = status.find((value) => value.folderId === folder.id), count = snapshot.projects.filter((project) => project.workspaceFolderId === folder.id).length;
      return <li key={folder.id} className="workspace-folder-row">
        <div className="workspace-folder-summary">
          <code className="path">{folder.root.root}</code>
          <small>{plural(count, "project")}{entry ? ` · ${checkedLabel(entry)}` : ""}</small>
        </div>
        <div className="workspace-folder-actions">
          <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Keep ${folder.root.root} in sync`} checked={syncing[folder.id] ?? folder.sync} disabled={busy}
            onChange={(event) => {
              const next = event.target.checked;
              setSyncing((current) => ({ ...current, [folder.id]: next }));
              void run(async () => { await sdk.projects.folders.configure(folder.id, next, folder.revision); })
                .finally(() => setSyncing(({ [folder.id]: _done, ...rest }) => rest));
            }} />Keep in sync</label>
          <button type="button" disabled={busy || entry?.status === "checking"} aria-label={`Check ${folder.root.root} now`}
            onClick={() => void run(async () => { await sdk.projects.folders.check(folder.id); })}>Check now</button>
          <SettingsAction label={`Stop tracking ${folder.root.root}`} icon="Trash" disabled={busy}
            onClick={() => void run(async () => { await sdk.projects.folders.remove(folder.id, folder.revision); })} />
        </div>
        {entry?.diagnostic && <Alert as="p" tone="warning">{entry.diagnostic}</Alert>}
        {entry && entry.available > 0 && <div className="workspace-folder-available"><p className="fine-print">{plural(entry.available, "new repository", "new repositories")} found.</p>
          <button type="button" disabled={busy || Boolean(preview)} onClick={() => void run((owned) => load(folder.root.root, owned))}>Review new repositories</button></div>}
        {entry && entry.missing.length > 0 && <Alert as="p" tone="warning">{plural(entry.missing.length, "project")} from this folder can't be found. Remove {entry.missing.length === 1 ? "it" : "them"} in Project settings if {entry.missing.length === 1 ? "it was" : "they were"} deleted.</Alert>}
      </li>;
    })}</ul>}
  </section>;
}
