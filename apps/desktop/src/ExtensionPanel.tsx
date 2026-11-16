import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import {
  HookDefinitionSchema, MarketplaceInputSchema, MarketplaceSourceSchema, parse, type CapabilityEntry, type MarketplacePreview, type MarketplaceCatalogListing,
  type MoguriSdk, type Project, type Session, type Snapshot,
} from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function ExtensionPanel({ sdk, snapshot, project, session, mode, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; project?: Project; session?: Session; mode: "hooks" | "marketplace"; onDirty: (value: boolean) => void;
}) {
  const [hookJson, setHookJson] = useState(JSON.stringify({ schemaVersion: 1, name: "project-check", description: "Reviewed project check",
    trigger: "turn.start", command: "printf 'project check\\n'", timeoutMs: 30000 }, null, 2));
  const [sourceId, setSourceId] = useState(project?.id ?? ""), [commit, setCommit] = useState("");
  const [path, setPath] = useState("moguri-marketplace.json"), [packageName, setPackageName] = useState(""), [version, setVersion] = useState("");
  const [preview, setPreview] = useState<MarketplacePreview | null>(null);
  const [catalog, setCatalog] = useState<MarketplaceCatalogListing | null>(null);
  const [selected, setSelected] = useState<{ entry: CapabilityEntry; content: string; currentRevision: number } | null>(null);
  const [history, setHistory] = useState<CapabilityEntry[]>([]);
  const [reviewed, setReviewed] = useState(false), [contentReviewed, setContentReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  const invalidate = () => { setPreview(null); setCatalog(null); setReviewed(false); setDirty(true); };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Extension operation failed. No successful install or execution was inferred."); }
    finally { setBusy(false); }
  };
  const read = async (entry: CapabilityEntry, digest = entry.contentDigest) => {
    const result = await sdk.capabilities.version(entry.id, digest);
    setSelected({ ...result, currentRevision: entry.revision }); setContentReviewed(false);
  };
  const actual = selected && snapshot.registry.find((entry) => entry.id === selected.entry.id);
  const stale = Boolean(selected && (!actual || actual.revision !== selected.currentRevision));
  const entries = snapshot.registry.filter((entry) => entry.projectId === project?.id && (mode === "hooks" ? entry.kind === "hook" : Boolean(entry.marketplace || entry.ownerPluginId)));
  return <section aria-label={mode === "hooks" ? "Reviewed lifecycle hooks" : "Repository marketplace"}>
    <SettingsHelp label="More about this setting" target={<h2>{mode === "hooks" ? "Lifecycle hooks" : "Repository marketplace"}</h2>}>Imports, updates and rollbacks install disabled content. Enabling never grants tools. Every hook/script still uses actual root/mode policy, exact command approval, cancellation and truthful partial outcomes.</SettingsHelp>
    {!project && <Alert as="p" tone="warning" className="settings-warning">Choose a project. No extension inherits an unrelated root.</Alert>}
    {error && <Alert as="p" role="alert" className="notice error">{error}</Alert>}{status && <Alert as="p" role="status">{status}</Alert>}
    {mode === "hooks" ? <>
      <SettingsHelp label="More about this setting" target={<label className="setting-field">Hook definition JSON<SettingsTextarea aria-label="Hook definition JSON" className="json-editor" spellCheck={false} value={hookJson} onChange={(event) => { setHookJson(event.target.value); setReviewed(false); setDirty(true); }} /></label>} descriptionFirst>Turn-start hooks finish before any model reservation or request. Turn-end hooks run only after normal successful solver completion. Failed/denied hooks stop continuation; cleanup or cancelled turns do not launch additional hooks. Tool-less roles and read-only chats never execute them.</SettingsHelp>
      <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact command and trigger. Import it disabled.</label>
      <button disabled={!project || !reviewed || busy} onClick={() => void run(async () => {
        const result = await sdk.hooks.import(project!.id, parse(HookDefinitionSchema, JSON.parse(hookJson)));
        setReviewed(false); setDirty(false); setStatus(`Hook ${result.id} imported disabled. Review and enable it separately; no command ran.`);
      })}>Import reviewed hook</button>
    </> : <>
      <SettingsHelp label="More about this setting" target={<label className="setting-field">Catalog source repository<select aria-label="Catalog source repository" value={sourceId} onChange={(event) => { setSourceId(event.target.value); invalidate(); }}>{snapshot.projects.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>} descriptionFirst>Use a registered repository and an immutable full commit SHA. Catalogs are read from Git objects, never from an unreviewed checkout or URL. No hosted account, clone, fetch, installer or executable entrypoint is implied. Declared licenses are informational, not a trust certification.</SettingsHelp>
      <label className="setting-field">Catalog commit SHA<SettingsInput aria-label="Catalog commit SHA" value={commit} onChange={(event) => { setCommit(event.target.value); invalidate(); }} /></label>
      <label className="setting-field">Catalog path<SettingsInput aria-label="Catalog path" value={path} onChange={(event) => { setPath(event.target.value); invalidate(); }} /></label>
      <button disabled={!project || !commit || busy} onClick={() => void run(async () => {
        const input = parse(MarketplaceSourceSchema, { projectId: project!.id, sourceProjectId: sourceId, commit, path });
        setCatalog((await sdk.marketplace.catalog(input)).catalog); setDirty(false); setPreview(null); setReviewed(false);
      })}>Read pinned catalog</button>
      {catalog && <div aria-label="Catalog packages">{catalog.packages.map((item) => <button key={`${item.name}@${item.version}`} disabled={busy}
        onClick={() => { setPackageName(item.name); setVersion(item.version); setPreview(null); setReviewed(false); }}>{item.name}@{item.version} ({item.license}): {item.description}</button>)}</div>}
      <label className="setting-field">Package name<SettingsInput aria-label="Marketplace package name" value={packageName} onChange={(event) => { setPackageName(event.target.value); invalidate(); }} /></label>
      <label className="setting-field">Package version<SettingsInput aria-label="Marketplace package version" value={version} onChange={(event) => { setVersion(event.target.value); invalidate(); }} /></label>
      <button disabled={!project || !commit || !packageName || !version || busy} onClick={() => void run(async () => {
        const input = parse(MarketplaceInputSchema, { projectId: project!.id, sourceProjectId: sourceId, commit, path, packageName, version });
        setPreview((await sdk.marketplace.preview(input)).preview); setReviewed(false); setDirty(false);
      })}>Review pinned bundle</button>
      {preview && <><Alert as="p" tone="warning" className="settings-warning">{preview.warning}</Alert><p>Source: <code>{preview.source.root}</code>, catalog SHA-256 <code>{preview.catalogDigest}</code></p>
        <pre>{JSON.stringify(preview.manifest, null, 2)}</pre>
        <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the exact source, license, complete capabilities and commands. Install/update this bundle disabled.</label>
        <button disabled={!reviewed || busy} onClick={() => void run(async () => {
          const result = await sdk.marketplace.install(preview.input, preview.digest, true);
          setPreview(null); setReviewed(false); setDirty(false); setStatus(`Bundle ${result.id} installed disabled. Its previous versions remain reviewable; no code was executed.`);
        })} aria-label="Install reviewed bundle">Install</button></>}
    </>}
    <button disabled={busy} onClick={() => { setDirty(false); setReviewed(false); setPreview(null); setError(""); }} aria-label="Discard uncommitted review">Discard</button>
    <h3>Installed capabilities</h3>
    {!entries.length && <p className="fine-print">Nothing installed yet. Reviewed bundles appear here after Install.</p>}
    <div className="button-row">{entries.map((entry) => <button key={entry.id} disabled={busy} onClick={() => void run(async () => { await read(entry); setHistory([]); })}>{entry.name}: {entry.retired ? "removed" : entry.enabled ? "enabled" : "disabled"}</button>)}</div>
    {selected && actual && <><h3>{selected.entry.name}</h3><pre>{selected.content}</pre><p className="fine-print">Content SHA-256 <code>{selected.entry.contentDigest}</code>, current revision {selected.currentRevision}.</p>
      {stale && <Alert as="p" role="alert" className="settings-warning">Another client changed this capability. Review its current content again; this old review cannot enable or replace it.</Alert>}
      <label className="check-setting"><SettingsInput type="checkbox" checked={contentReviewed} onChange={(event) => setContentReviewed(event.target.checked)} />I reviewed these exact bytes and their execution requirements.</label>
      <div className="button-row">
        {selected.entry.contentDigest === actual.contentDigest && <button disabled={!contentReviewed || busy || stale || actual.retired} onClick={() => void run(async () => {
          await sdk.capabilities.toggle(actual.id, !actual.enabled, selected.currentRevision);
          const current = sdk.getState().snapshot!.registry.find((entry) => entry.id === actual.id)!; await read(current);
          setStatus("Capability state changed. Enabling is not a tool/Git permission.");
        })} aria-label={actual.enabled ? "Disable capability" : "Enable reviewed capability"}>{actual.enabled ? "Disable" : "Enable"}</button>}
        <button disabled={busy || stale} onClick={() => void run(async () => { setHistory((await sdk.capabilities.history(actual.id)).entries); })} aria-label="Review capability history">History</button>
        {selected.entry.contentDigest !== actual.contentDigest && <button disabled={!contentReviewed || busy || stale} onClick={() => void run(async () => {
          await sdk.capabilities.rollback(actual.id, selected.currentRevision, selected.entry.contentDigest, true);
          await read(sdk.getState().snapshot!.registry.find((entry) => entry.id === actual.id)!); setStatus("A disabled rollback revision was retained. Existing history was not rewritten.");
        })} aria-label="Roll back disabled capability version">Roll back disabled</button>}
        {actual.kind === "skill" && actual.enabled && session?.projectId === actual.projectId && <button disabled={!contentReviewed || busy || stale} onClick={() => void run(async () => {
          await sdk.capabilities.useSkill(session.id, actual.id, selected.entry.contentDigest, session.draft.revision);
          setStatus("Selected skill inserted into the saved draft. Nothing was sent or approved.");
        })} aria-label="Insert into draft selected skill">Insert into draft</button>}
      </div>
      <div className="button-row">{history.map((entry) => <button key={entry.revision} disabled={busy} onClick={() => void run(() => read(actual, entry.contentDigest))}>Inspect version r{entry.revision}</button>)}</div>
    </>}
  </section>;
}
