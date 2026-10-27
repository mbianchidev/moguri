import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { ArtifactMaterialization, ArtifactMaterializationPreview, MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";

export function ArtifactRepositoryCopy({ sdk, snapshot, projectId, expectedSetDigest, allowWorkspaces = true, defaultWorkspaceId = null, onSaved, onBusy }: {
  sdk: MoguriSdk; snapshot: Snapshot; projectId: string; expectedSetDigest?: string; allowWorkspaces?: boolean; defaultWorkspaceId?: string | null;
  onSaved?: (value: ArtifactMaterialization | null) => void; onBusy?: (busy: boolean) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? ""), [commit, setCommit] = useState(false), [branch, setBranch] = useState("");
  const [preview, setPreview] = useState<ArtifactMaterializationPreview | null>(null), [saved, setSaved] = useState<ArtifactMaterialization | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [jobId, setJobId] = useState<string | null>(null);
  const generation = useRef(0), project = snapshot.projects.find((project) => project.id === projectId);
  const signature = JSON.stringify(snapshot.artifacts.filter((artifact) => artifact.projectId === projectId).map(({ id, revision }) => [id, revision]));
  const configurationRevision = snapshot.projectConfigurations.find((entry) => entry.projectId === projectId)?.revision ?? 0;
  const options = { ...(workspaceId ? { workspaceId } : {}), ...(commit ? { commitBranch: branch } : {}) };
  const job = snapshot.jobs.find((job) => job.id === jobId);
  useEffect(() => {
    generation.current++; setPreview(null); setSaved(null); setError(""); onSaved?.(null);
  }, [projectId, workspaceId, commit, branch, signature, configurationRevision, expectedSetDigest]);
  useEffect(() => { setWorkspaceId(defaultWorkspaceId ?? ""); }, [projectId, defaultWorkspaceId]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); onBusy?.(true); setError("");
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "Repository copy failed. Stored documents were preserved."); }
    finally { setBusy(false); onBusy?.(false); }
  };
  const review = async () => {
    const token = ++generation.current, value = (await sdk.artifacts.materializePreview(projectId, options)).preview;
    if (expectedSetDigest && value.setDigest !== expectedSetDigest) throw new Error("The artifact set changed. Reload the removal preview before writing a repository copy.");
    if (generation.current === token) { setPreview(value); setSaved(null); onSaved?.(null); }
  };
  const write = async () => {
    if (!preview) throw new Error("Review the exact repository destination first.");
    const token = generation.current, started = await sdk.artifacts.materialize(projectId, preview.digest, options);
    setJobId(started.id!);
    const job = await sdk.jobs.wait(started.id!);
    if (job.status !== "completed") throw new Error(job.error ?? `Artifact materialization ${job.status}. Inspect its destination; no source documents were deleted.`);
    const result = (await sdk.artifacts.materialization(started.id!)).result;
    if (!result) throw new Error("The completed copy has no verified receipt. Stored documents were preserved.");
    if (token !== generation.current) throw new Error("The source set or destination changed during publication. Inspect the completed job and review again; stored documents were preserved.");
    setSaved(result); onSaved?.(result);
  };
  return <section aria-label="Repository artifact copy" onKeyDown={(event) => { if (event.key === "Enter" && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) event.preventDefault(); }}>

    {allowWorkspaces && <label className="setting-field">Destination root<select aria-label="Artifact destination root" disabled={busy} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
      <option value="">Attached base folder: {project?.path ?? "unavailable"}</option>
      {snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === projectId && workspace.status === "ready").map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.branch} / {workspace.path}</option>)}
    </select></label>}
    <label className="check-setting"><SettingsInput type="checkbox" checked={commit} disabled={busy} onChange={(event) => setCommit(event.target.checked)} />Also commit to a new local branch</label>
    {commit && <label className="setting-field">New local branch<SettingsInput aria-label="Artifact commit branch" value={branch} maxLength={200} disabled={busy} onChange={(event) => setBranch(event.target.value)} placeholder="docs/retained-artifacts" /></label>}
    <SettingsHelp label="More about this setting" target={<button type="button" disabled={busy || !project || commit && !branch.trim()} onClick={() => void run(review)}>Review repository copy</button>} descriptionFirst>Copy all retained project revisions, including archived documents, into a new private JSON file under artifacts/. Review sensitive content before an optional local Git commit. No overwrite, checkout, push or automatic instruction loading.</SettingsHelp>
    {preview && <><p className="fine-print">{preview.count} document{preview.count === 1 ? "" : "s"} / {preview.bytes.toLocaleString()} bytes. Exact destination:</p><pre aria-label="Reviewed artifact destination">{`${preview.root}/${preview.path}`}</pre>
      {preview.commit && <p className="fine-print">New local branch {preview.commit.branch}, parent {preview.commit.base}. Current checkout and index remain unchanged.</p>}
      <button className="primary" type="button" disabled={busy || Boolean(saved)} onClick={() => void run(write)}>{commit ? "Write and commit reviewed copy" : "Write reviewed repository copy"}</button></>}
    {busy && jobId && <><p className="fine-print" role="status">{job?.progress ?? "Waiting for the owned repository job."}</p><button type="button" onClick={() => void sdk.jobs.cancel(jobId).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop was not acknowledged. Inspect the owned job."))}>Stop repository copy</button></>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {saved && <p className="fine-print" role="status">Exact repository copy verified{saved.commit ? `; local commit ${saved.commit.commit}` : ""}. Stored Moguri documents remain until a separate explicit deletion.</p>}
  </section>;
}
