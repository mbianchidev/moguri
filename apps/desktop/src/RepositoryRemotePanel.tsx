import { useEffect, useRef, useState } from "react";
import type { GithubPreview, MoguriSdk, Project, Snapshot } from "../../../packages/sdk/src/index.ts";
import { SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

export function RepositoryRemotePanel({ sdk, project, snapshot, upstream, disabled, onDirty }: {
  sdk: MoguriSdk; project: Project; snapshot: Snapshot; upstream: string; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [remote, setRemote] = useState(upstream), [url, setUrl] = useState(""), [preview, setPreview] = useState<GithubPreview | null>(null);
  const [confirmations, setConfirmations] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [inspection, setInspection] = useState<Awaited<ReturnType<MoguriSdk["github"]["read"]>> | null>(null);
  const [inspected, setInspected] = useState(false);
  const revision = snapshot.projectConfigurations.find((configuration) => configuration.projectId === project.id)?.revision ?? 0;
  const key = JSON.stringify([sdk.profileId, project.id, project.path, revision, snapshot.policy.revision, snapshot.settings.permissionRevision]);
  const scope = useRef({ sdk, key, projectId: project.id }); scope.current = { sdk, key, projectId: project.id };
  const pending = useRef(false);
  const records = snapshot.githubOperations.filter((operation) => operation.projectId === project.id && operation.kind === "git.remote.set").slice().reverse();
  const active = records.some((operation) => operation.status === "running");
  useEffect(() => { setPreview(null); setConfirmations([]); }, [key]);
  useEffect(() => { onDirty(Boolean(url) || busy); return () => onDirty(false); }, [url, busy, onDirty]);
  const invalidate = () => { setPreview(null); setConfirmations([]); setError(""); };
  const run = async (operation: (owned: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const owner = scope.current; setBusy(true); setError("");
    try { await operation(() => scope.current.sdk === owner.sdk && scope.current.key === owner.key); }
    catch (error) { if (scope.current.sdk === owner.sdk) setError(error instanceof Error ? error.message : "The original remote-change acknowledgement is unavailable. Inspect retained history; no URL was retried."); }
    finally { pending.current = false; if (scope.current.sdk === owner.sdk) setBusy(false); }
  };
  return <section aria-label="Repository remote URL" className="repository-remote" aria-busy={busy}>
    <h4>Change remote URL</h4>
    <p className="fine-print">Local checkout: <code>{project.path}</code>. This changes actual shared Git configuration, including listed linked worktrees. It never changes an SSH/Sandbox binding, authenticates, fetches or pushes. Historical PR/candidate sources stay attached to their original repository.</p>
    {error && <Alert as="p" role="alert">{error}</Alert>}
    {records[0] && <p role="status">Latest remote URL change: {records[0].status}{records[0].cancelRequested ? " / cancellation requested" : ""}.</p>}
    <fieldset disabled={disabled || busy || active || !snapshot.policy.allowedEnvs.includes("Local")}>
      <label className="setting-field">Remote name<SettingsInput aria-label="Remote name" value={remote} onChange={(event) => { setRemote(event.target.value); invalidate(); }} /></label>
      <label className="setting-field">New remote URL<SettingsInput aria-label="New remote URL" value={url} placeholder="https://github.com/new-owner/repository.git" spellCheck={false}
        onChange={(event) => { setUrl(event.target.value); invalidate(); }} /></label>
      <button type="button" disabled={!remote || !url} onClick={() => void run(async (owned) => {
        const result = await sdk.projects.remotePreview(project.id, remote, url); if (owned()) { setPreview(result.preview); setConfirmations([]); }
      })}>Preview remote URL change</button>
    </fieldset>
    {preview?.document.remoteChange && <section className="github-write-review" aria-label="Remote URL change review">
      <dl className="facts"><dt>Remote</dt><dd>{preview.document.remoteChange.name}</dd>
        <dt>Old fetch URL</dt><dd>{preview.document.remoteChange.fetchUrl}</dd>
        <dt>Old explicit push URL</dt><dd>{preview.document.remoteChange.pushUrls.join(", ") || "Uses fetch URL"}</dd>
        <dt>New fetch and push URL</dt><dd>{preview.document.remoteChange.url}</dd>
        <dt>Shared config</dt><dd className="path">{preview.document.remoteChange.config.path}</dd></dl>
      <h4>Affected linked worktrees</h4><ul>{preview.document.remoteChange.worktrees.map((root) => <li className="path" key={root.root}>{root.root}
        <small>Effective fetch: {root.nextFetchUrl}<br />Effective push: {root.nextPushUrl}</small></li>)}</ul>
      {preview.document.warnings.map((warning, index) => <p className="fine-print" key={index}>{warning}</p>)}
      {preview.document.confirmations.map((text) => <label className="check-setting" key={text}><SettingsInput type="checkbox" checked={confirmations.includes(text)}
        disabled={disabled || busy || active} onChange={(event) => setConfirmations((current) => event.target.checked ? [...current, text] : current.filter((value) => value !== text))} />{text}</label>)}
      <button type="button" className="primary" disabled={disabled || busy || active || confirmations.length !== preview.document.confirmations.length} onClick={() => void run(async () => {
        await sdk.projects.setRemote(preview, preview.document.confirmations, true);
        if (scope.current.sdk === sdk && scope.current.projectId === project.id) { setUrl(""); setPreview(null); setConfirmations([]); }
      })}>Apply reviewed remote URL</button>
    </section>}
    {records.map((operation) => <div className="call-record" key={operation.id}><strong>Remote URL change / {operation.status}</strong>
      {operation.diagnostic && <Alert as="p" tone="warning">{operation.diagnostic}</Alert>}
      <small>{operation.id}</small>
      <div className="button-row"><button type="button" disabled={busy} onClick={() => void run(async (owned) => {
        const result = await sdk.github.read(operation.id); if (owned()) setInspection(result);
      })}>Inspect remote change</button>
        {operation.status === "running" && <button type="button" disabled={busy || operation.cancelRequested} onClick={() => void run(async () => { await sdk.github.cancel(operation.id); })}>Cancel remote change</button>}</div>
    </div>)}
    {inspection && <details open><summary>Original remote change and retained outcome</summary><pre>{JSON.stringify(inspection, null, 2)}</pre>
      {inspection.operation.status === "partial" && !inspection.operation.inspection && <>
        <label className="check-setting"><SettingsInput type="checkbox" checked={inspected} onChange={(event) => setInspected(event.target.checked)} />
          I inspected the original shared config and possible effects. This does not prove cleanup, restore the old URL or declare success.</label>
        <button type="button" disabled={busy || !inspected} onClick={() => void run(async (owned) => {
          await sdk.github.acknowledge(inspection.operation.id, inspection.operation.revision, inspection.operation.inputDigest, true);
          const result = await sdk.github.read(inspection.operation.id); if (owned()) { setInspection(result); setInspected(false); }
        })}>Acknowledge inspected remote change</button>
      </>}
    </details>}
  </section>;
}
