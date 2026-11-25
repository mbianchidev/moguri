import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot, SandboxWorkspacePreview, SandboxResult, SandboxPublicationPreview } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { usePendingWork } from "./pending-work.ts";

export function SandboxPanel({ sdk, snapshot, session, onDirty, setup, sessionOnly = false }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; onDirty: (dirty: boolean) => void; setup: () => void; sessionOnly?: boolean;
}) {
  const [paths, setPaths] = useState(""), [source, setSource] = useState<{ value: SandboxWorkspacePreview; revision: number; scope: string } | null>(null);
  const [sourceReviewed, setSourceReviewed] = useState(false), [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<{ id: string; digest: string; value: SandboxResult } | null>(null), [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [review, setReview] = useState<{ value: SandboxPublicationPreview; revision: number; scope: string } | null>(null), [accepted, setAccepted] = useState(false);
  const [inspectionReviewed, setInspectionReviewed] = useState(false), [publicationId, setPublicationId] = useState("");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const native = snapshot.capabilities.find((capability) => capability.env === "Sandbox");
  const workspace = (snapshot.sandboxWorkspaces ?? []).find((value) => value.id === session?.sandboxWorkspaceId);
  const executions = [...snapshot.sandboxExecutions ?? []].filter((value) => !sessionOnly || value.sessionId === session?.id).reverse();
  const execution = executions.find((value) => value.id === selectedId) ?? (selectedId ? undefined : executions.find((value) => value.sessionId === session?.id) ?? executions[0]);
  const repository = execution?.repositories?.find((value) => value.projectId === repositoryId);
  const owner = snapshot.sessions.find((value) => value.id === execution?.sessionId);
  const publications = [...snapshot.sandboxPublications ?? []].filter((value) => !sessionOnly || value.sourceSessionId === session?.id).reverse(), publication = publications.find((value) => value.id === publicationId);
  const job = snapshot.jobs.find((value) => value.id === publication?.jobId);
  const configuration = snapshot.projectConfigurations.find((value) => value.projectId === session?.projectId);
  const sourceScope = JSON.stringify([sdk.profileId, session?.id, session?.revision, session?.controls.env, session?.workspaceId, session?.sandboxWorkspaceId,
    configuration?.revision, snapshot.settings.values.sandbox, snapshot.policy.revision, snapshot.settings.permissionRevision, paths]);
  const resultScope = JSON.stringify([sdk.profileId, execution?.id, execution?.resultDigest]);
  const publicationScope = JSON.stringify([sdk.profileId, execution?.id, execution?.revision, execution?.resultDigest, selectedPaths, repositoryId,
    execution?.repositories ? execution.repositories.map((binding) => [binding, snapshot.projectConfigurations.find((value) => value.projectId === binding.projectId)?.values]) :
      snapshot.projectConfigurations.find((value) => value.projectId === execution?.projectId)?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision]);
  const scope = JSON.stringify([sourceScope, resultScope, publicationScope]), currentScope = useRef(scope), generation = useRef(0), pending = useRef(false);
  const outcome = useRef<HTMLElement>(null), focusOutcome = useRef(false);
  currentScope.current = scope;
  const available = native?.ready && snapshot.policy.allowedEnvs.includes("Sandbox");
  const prepared = session?.controls.env === "Sandbox" && available && !session.turnId && session.status !== "archived" && !session.repositories;
  const automatic = snapshot.settings.values.sandboxManagement?.enabled && snapshot.settings.values.sandboxManagement.automaticWorkspaces;
  const retained = result && result.id === execution?.id && result.digest === execution?.resultDigest ? result.value : null;
  const active = owner?.turnId === execution?.turnId;
  useEffect(() => { setSource(null); setSourceReviewed(false); }, [sourceScope]);
  useEffect(() => { setPaths(""); }, [sdk.profileId, session?.id]);
  useEffect(() => { setResult(null); setSelectedPaths([]); setRepositoryId(""); setInspectionReviewed(false); }, [resultScope]);
  useEffect(() => { setReview(null); setAccepted(false); }, [publicationScope]);
  useEffect(() => { if (publication && focusOutcome.current) { focusOutcome.current = false; outcome.current?.focus(); outcome.current?.scrollIntoView({ block: "nearest" }); } }, [publication?.id]);
  usePendingWork(Boolean(busy));
  useEffect(() => { onDirty(Boolean(busy) || Boolean(paths && !workspace)); return () => onDirty(false); }, [busy, paths, workspace?.id, onDirty]);
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    const token = ++generation.current, captured = scope;
    setBusy(name); setError(""); setNotice("");
    try { await operation(() => generation.current === token && currentScope.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "The Sandbox action wasn't confirmed. Your drafts, results and files were kept."); }
    finally { pending.current = false; setBusy(""); }
  };
  return <section className="candidate-panel" aria-label="Sandbox execution and reviewed publication" aria-busy={Boolean(busy)}>
    <h2>Sandbox workspace</h2>
    <p className="fine-print" role="status">{native?.reason ?? "Sandbox status hasn't been checked yet."}</p>
    <button type="button" disabled={Boolean(busy)} onClick={setup} aria-label="Review Sandbox configuration">Review</button>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {busy && <p className="fine-print" role="status">{busy}</p>}
    {automatic && <p className="fine-print" role="status">Moguri prepares a private workspace when you send. {session?.repositories ? `Each of the ${session.repositories.length} repositories is copied into its own folder, following its folder and ignore rules; your checkouts are never mounted.` : session?.projectId ? "The project is copied following its folder and ignore rules; your checkout is never mounted." : "This chat starts with an empty workspace."} Work carries over between turns.</p>}
    {!automatic && <p className="fine-print">Enable SendBox in Settings &gt; Sandbox to prepare workspaces automatically, or choose files by hand below.</p>}
    <details className="candidate-section">
      <summary>Advanced: prepare from chosen files</summary>
      {session?.repositories && <p className="fine-print">Multi-repository chats need automatic preparation; you can't choose files by hand here.</p>}
      <p className="fine-print">Only the text files you choose are copied into the VM{!session?.repositories && session?.projectId ? <>, at <code>/workspace</code></> : ""}. Your local files are never mounted or changed.</p>
      {!session ? <p>Choose a chat first.</p> : <>
        {session.controls.env !== "Sandbox" && <button type="button" disabled={Boolean(busy) || !available} onClick={() => void run("Switching to Sandbox", async () => {
          if (session.turnId) await sdk.commands.control(session.id, "env", "Sandbox");
          else await sdk.sessions.env(session.id, "Sandbox", session.revision);
        })} aria-label="Use for session: reviewed Sandbox">Use for session</button>}
        {workspace && <p className="fine-print path">Workspace {workspace.id} / {workspace.status}.{workspace.diagnostic && ` ${workspace.diagnostic}`}</p>}
        <label className="setting-field">File paths, one per line<SettingsTextarea aria-label="Native source paths" value={paths} readOnly={!session.projectId} disabled={Boolean(busy)} spellCheck={false}
          placeholder={session.projectId ? "src/example.ts\npackage.json" : "This chat has no project, so its workspace starts empty."} onChange={(event) => setPaths(event.target.value)} /></label>
        <button type="button" disabled={Boolean(busy) || !prepared} onClick={() => void run("Loading files", async (current) => {
          const revision = session.revision, selected = session.projectId ? paths.split(/\r?\n/).filter((path) => path.length > 0) : [];
          const value = (await sdk.sandbox.preview(session.id, selected)).preview;
          if (current()) setSource({ value, revision, scope: sourceScope });
        })} aria-label="Preview native source">Preview</button>
        {source && source.scope === sourceScope && <section className="candidate-binding" aria-label="Exact native source review">
          <p className="fine-print path">Source: {source.value.sourceRoot ?? "none"} / {source.value.bytes} bytes / HEAD {source.value.sourceHead ?? "not a Git repository"}</p>
          <p className="fine-print">{source.value.diagnostic}</p>
          {source.value.files.map((file) => <details key={file.path}><summary className="path">{file.path} / {file.bytes} bytes</summary><p className="fine-print path">SHA-256 {file.digest}</p><pre className="workspace-file-content">{file.text}</pre></details>)}
          <label className="check-setting"><SettingsInput type="checkbox" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />I reviewed these files and their contents.</label>
          <button type="button" className="primary" disabled={Boolean(busy) || !prepared || !sourceReviewed} onClick={() => void run("Preparing workspace", async () => {
            await sdk.sandbox.prepare(session.id, source.value.paths, source.value.digest, source.revision);
            setNotice("Workspace prepared. Your files are unchanged and no turn was started.");
          })} aria-label="Prepare reviewed native stage">Prepare</button>
        </section>}
      </>}
    </details>
    <label className="setting-field">Sandbox run<select aria-label="Retained native execution" value={execution?.id ?? ""} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      {!executions.length && <option value="">No Sandbox runs yet</option>}{executions.map((value) => <option key={value.id} value={value.id}>{snapshot.sessions.find((session) => session.id === value.sessionId)?.title ?? "Deleted chat"} / {value.status} / {value.id.slice(0, 8)}</option>)}
    </select></label>
    {execution && <div className="candidate-section" aria-label="Original native run">
      <p className="fine-print">Outcome: {execution.status} · worker: {execution.workerOutcome ?? "no reply"} · cleanup: {execution.cleanup} · cancellation: {execution.cancellation}</p>
      <p className="fine-print path">VM: {execution.nativeSessionId ?? "none"} · exit code: {execution.cliExitCode ?? "not reported"} · workspace root: {execution.root ?? "none"} · source: {execution.sourceRoot ?? "none"}</p>
      {execution.repositories && <section aria-label="Original captured native repositories"><p className="fine-print">Tools choose a repository by name. Publishing copies files into one repository you pick.</p>
        {execution.repositories.map((binding) => <p className="fine-print path" key={binding.projectId}>{binding.name} / {binding.projectId}<br />{binding.guestRoot} / source {binding.root.root}</p>)}</section>}
      {execution.networkScope && <p className="fine-print">Allowed domains (SendBox {execution.config.qualification?.release ?? "version not reported"}): {execution.networkScope.allowedDomains.join(", ")}.
        {" "}Allowing github.com also allows every address GitHub publishes, including shared cloud ranges.</p>}
      {execution.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{execution.diagnostic}</Alert>}
      <div className="button-row">
        {active && <button type="button" disabled={Boolean(busy)} onClick={() => void run("Stopping turn", async () => { await sdk.sandbox.stop(execution.id); setNotice("Stop requested. Check the outcome and cleanup status above."); })} aria-label="Stop this native turn">Stop</button>}
        <button type="button" disabled={Boolean(busy) || !execution.resultDigest} onClick={() => void run("Loading result", async (current) => {
          const value = (await sdk.sandbox.result(execution.id)).result;
          if (!value) throw new Error("This run saved no result. Use Reconcile to check its status.");
          if (current()) setResult({ id: execution.id, digest: execution.resultDigest!, value });
        })} aria-label="Inspect retained result">Inspect</button>
      </div>
      <label className="check-setting"><SettingsInput type="checkbox" checked={inspectionReviewed} disabled={Boolean(busy) || active} onChange={(event) => setInspectionReviewed(event.target.checked)} />I understand Reconcile only checks or stops this run's VM and never reruns work.</label>
      <button type="button" disabled={Boolean(busy) || active || !inspectionReviewed} onClick={() => void run("Checking run status", async () => {
        await sdk.sandbox.reconcile(execution.id);
        const value = (await sdk.sandbox.execution(execution.id)).execution;
        setNotice(`Run status: ${value.status} · cleanup: ${value.cleanup}. Partial turns stay partial; nothing was rerun.`);
      })} aria-label="Reconcile original native guest">Reconcile</button>
    </div>}
    {retained && execution && <div className="candidate-section" aria-label="Retained native output files">
      <p className="fine-print">Exit code: {retained.exitCode ?? "not reported"} · rollback: {retained.rollback} · result link: {retained.afterBinding} · run log: {retained.journal.status}</p>
      {retained.journal.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{retained.journal.diagnostic}</Alert>}
      {execution.repositories && <label className="setting-field">Publish to repository<select aria-label="Native publication repository" value={repositoryId} disabled={Boolean(busy)}
        onChange={(event) => { setRepositoryId(event.target.value); setSelectedPaths([]); setReview(null); setAccepted(false); }}>
        <option value="">Choose a repository</option>{execution.repositories.map((binding) => <option key={binding.projectId} value={binding.projectId}>{binding.name} / {binding.projectId}</option>)}
      </select></label>}
      {retained.files.map((file) => {
        const member = execution.repositories?.find((binding) => file.path.startsWith(`${binding.directory}/`));
        const path = member ? file.path.slice(member.directory.length + 1) : file.path, publishable = member ? member.projectId === repository?.projectId : Boolean(execution.sourceRoot);
        return <details key={file.path}><summary className="path">{member ? `${member.name}/${path}` : file.path} / {file.bytes} bytes</summary>
        <p className="fine-print path">SHA-256 {file.digest}</p><pre className="workspace-file-content">{file.text}</pre>
        <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Select native output ${file.path}`} checked={publishable && selectedPaths.includes(path)} disabled={Boolean(busy) || !publishable}
          onChange={(event) => setSelectedPaths((paths) => event.target.checked ? [...paths, path] : paths.filter((value) => value !== path))} />Include in publication</label>
      </details>; })}
      {retained.deletedPaths.length > 0 && <Alert as="p" tone="warning" className="settings-warning">Files deleted in the VM aren't published: {retained.deletedPaths.join(", ")}.</Alert>}
      {retained.excludedCount > 0 && <details><summary>{retained.excludedCount} excluded files</summary>
        {retained.excludedCount > retained.excluded.length && <p className="fine-print">Showing {retained.excluded.length} of {retained.excludedCount}. The rest weren't saved and can't be published.</p>}
        {retained.excluded.map((value) => <p key={value.path} className="fine-print path">{value.path}: {value.reason}</p>)}</details>}
      <button type="button" disabled={Boolean(busy) || !selectedPaths.length || selectedPaths.length > 20 || !(execution.sourceRoot || repository)} onClick={() => void run("Preparing publication review", async (current) => {
        const value = (await sdk.sandbox.publicationPreview(execution.id, selectedPaths, repository?.projectId)).preview;
        if (current()) setReview({ value, revision: execution.revision, scope: publicationScope });
      })} aria-label="Review publication of selected source">Review publication</button>
    </div>}
    {review && execution && review.scope === publicationScope && <section className="candidate-binding" aria-label="Exact native source publication">
      <h3>Publish to your files</h3><p className="fine-print path">Destination: {review.value.document.root} · HEAD: {review.value.document.git?.head ?? "not a Git repository"}</p>
      <p className="fine-print">Limits: {review.value.limits.files} files, {review.value.limits.patchBytes} bytes of changes, {review.value.limits.documentBytes} bytes in total.</p>
      <p className="fine-print">{review.value.diagnostic}</p>
      {review.value.document.patch.edits.map((edit) => <details key={edit.path}><summary className="path">{edit.path} / base {edit.baseDigest}</summary><pre className="workspace-file-content">{edit.text}</pre></details>)}
      <label className="check-setting"><SettingsInput type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I reviewed these changes and want them copied into my files. This doesn't run anything or create a Git commit.</label>
      <button type="button" className="primary" disabled={Boolean(busy) || !accepted} onClick={() => void run("Publishing files", async () => {
        const value = await sdk.sandbox.publish(execution.id, review.value.document.patch.edits.map((edit) => edit.path), review.value.digest, review.revision,
          review.value.document.version === 2 ? review.value.document.repositoryId : undefined);
        focusOutcome.current = true; setPublicationId(value.id!); setReview(null); setAccepted(false); setSelectedPaths([]);
        setNotice("Publishing started. Check the result below; no commit is made.");
      })} aria-label="Publish reviewed native files">Publish</button>
    </section>}
    <label className="setting-field">Publication<select aria-label="Retained native publication" value={publicationId} disabled={Boolean(busy)} onChange={(event) => setPublicationId(event.target.value)}>
      <option value="">Choose a publication</option>{publications.map((value) => <option key={value.id} value={value.id}>{value.status} / {value.id.slice(0, 8)}</option>)}
    </select></label>
    {publication && <section ref={outcome} tabIndex={-1} className="candidate-section" aria-label="Native source publication outcome">
      <SettingsHelp label="More about this setting" target={<p className="fine-print" role="status">Publication {publication.status} · accepted by: {publication.acceptance.actor}. {job?.progress}</p>}>Kept even if the chat or run is deleted. Partial publications aren't retried, and your Git index, HEAD and other edits aren't reset.</SettingsHelp>
      <p className="fine-print path">Destination: {publication.root} · attempted: {publication.attemptedPaths.join(", ") || "none"} · copied: {publication.publishedPaths.join(", ") || "none"}</p>
      {publication.diagnostic && <Alert as="p" className="inline-error" role="alert">{publication.diagnostic}</Alert>}
      {job && ["running", "waiting_input"].includes(job.status) && <button type="button" disabled={Boolean(busy)} onClick={() => void run("Stopping publication", async () => { await sdk.jobs.cancel(job.id); })} aria-label="Stop original publication">Stop</button>}

    </section>}
  </section>;
}
