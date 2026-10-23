import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot, SandboxWorkspacePreview, SandboxResult, SandboxPublicationPreview } from "../../../packages/sdk/src/index.ts";

export function SandboxPanel({ sdk, snapshot, session, onDirty, setup, sessionOnly = false }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; onDirty: (dirty: boolean) => void; setup: () => void; sessionOnly?: boolean;
}) {
  const [paths, setPaths] = useState(""), [source, setSource] = useState<{ value: SandboxWorkspacePreview; revision: number; scope: string } | null>(null);
  const [sourceReviewed, setSourceReviewed] = useState(false), [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<{ id: string; digest: string; value: SandboxResult } | null>(null), [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [review, setReview] = useState<{ value: SandboxPublicationPreview; revision: number; scope: string } | null>(null), [accepted, setAccepted] = useState(false);
  const [inspectionReviewed, setInspectionReviewed] = useState(false), [publicationId, setPublicationId] = useState("");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const native = snapshot.capabilities.find((capability) => capability.env === "Sandbox");
  const workspace = (snapshot.sandboxWorkspaces ?? []).find((value) => value.id === session?.sandboxWorkspaceId);
  const executions = [...snapshot.sandboxExecutions ?? []].filter((value) => !sessionOnly || value.sessionId === session?.id).reverse();
  const execution = executions.find((value) => value.id === selectedId) ?? (selectedId ? undefined : executions.find((value) => value.sessionId === session?.id) ?? executions[0]);
  const owner = snapshot.sessions.find((value) => value.id === execution?.sessionId);
  const publications = [...snapshot.sandboxPublications ?? []].filter((value) => !sessionOnly || value.sourceSessionId === session?.id).reverse(), publication = publications.find((value) => value.id === publicationId);
  const job = snapshot.jobs.find((value) => value.id === publication?.jobId);
  const configuration = snapshot.projectConfigurations.find((value) => value.projectId === session?.projectId);
  const sourceScope = JSON.stringify([sdk.profileId, session?.id, session?.revision, session?.controls.env, session?.workspaceId, session?.sandboxWorkspaceId,
    configuration?.revision, snapshot.settings.values.sandbox, snapshot.policy.revision, snapshot.settings.permissionRevision, paths]);
  const resultScope = JSON.stringify([sdk.profileId, execution?.id, execution?.resultDigest]);
  const publicationScope = JSON.stringify([sdk.profileId, execution?.id, execution?.revision, execution?.resultDigest, selectedPaths,
    snapshot.projectConfigurations.find((value) => value.projectId === execution?.projectId)?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision]);
  const scope = JSON.stringify([sourceScope, resultScope, publicationScope]), currentScope = useRef(scope), generation = useRef(0), pending = useRef(false);
  const outcome = useRef<HTMLElement>(null), focusOutcome = useRef(false);
  currentScope.current = scope;
  const available = native?.ready && snapshot.policy.allowedEnvs.includes("Sandbox");
  const prepared = session?.controls.env === "Sandbox" && available && !session.turnId && session.status !== "archived";
  const retained = result && result.id === execution?.id && result.digest === execution?.resultDigest ? result.value : null;
  const active = owner?.turnId === execution?.turnId;
  useEffect(() => { setSource(null); setSourceReviewed(false); }, [sourceScope]);
  useEffect(() => { setPaths(""); }, [sdk.profileId, session?.id]);
  useEffect(() => { setResult(null); setSelectedPaths([]); setInspectionReviewed(false); }, [resultScope]);
  useEffect(() => { setReview(null); setAccepted(false); }, [publicationScope]);
  useEffect(() => { if (publication && focusOutcome.current) { focusOutcome.current = false; outcome.current?.focus(); outcome.current?.scrollIntoView({ block: "nearest" }); } }, [publication?.id]);
  useEffect(() => { onDirty(Boolean(busy) || Boolean(paths && !workspace)); return () => onDirty(false); }, [busy, paths, workspace?.id, onDirty]);
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    const token = ++generation.current, captured = scope;
    setBusy(name); setError(""); setNotice("");
    try { await operation(() => generation.current === token && currentScope.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "Native work was not confirmed. Original drafts, results and source files were preserved."); }
    finally { pending.current = false; setBusy(""); }
  };
  return <section className="candidate-panel" aria-label="Sandbox execution and reviewed publication" aria-busy={Boolean(busy)}>
    <h2>Sandbox workspace</h2>
    <p className="fine-print" role="status">{native?.reason ?? "Native readiness has not been observed."}</p>
    <button type="button" disabled={Boolean(busy)} onClick={setup}>Review Sandbox configuration</button>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
    {busy && <p className="fine-print" role="status">{busy}</p>}
    <details className="candidate-section" open={!workspace}>
      <summary>Review a private source stage</summary>
      <p className="fine-print">Only selected text snapshots enter the VM. Model root is {session?.projectId ? <code>/workspace</code> : "null in a project-free chat"}; the Local source is never mounted or written by native tools.</p>
      {!session ? <p>Choose an existing session before preparing its private workspace.</p> : <>
        {session.controls.env !== "Sandbox" && <button type="button" disabled={Boolean(busy) || !available || Boolean(session.turnId)} onClick={() => void run("Selecting Sandbox", async () => { await sdk.sessions.env(session.id, "Sandbox", session.revision); })}>Use Sandbox for this session</button>}
        {workspace && <p className="fine-print path">Prepared record: {workspace.id} / {workspace.status}. Actual root ownership is rechecked before every admission.{workspace.diagnostic && ` ${workspace.diagnostic}`}</p>}
        <label className="setting-field">Exact source file paths, one per line<textarea aria-label="Native source paths" value={paths} readOnly={!session.projectId} disabled={Boolean(busy)} spellCheck={false}
          placeholder={session.projectId ? "src/example.ts\npackage.json" : "Empty private workspace. No host root is inherited."} onChange={(event) => setPaths(event.target.value)} /></label>
        <button type="button" disabled={Boolean(busy) || !prepared} onClick={() => void run("Reviewing selected source", async (current) => {
          const revision = session.revision, selected = session.projectId ? paths.split(/\r?\n/).filter((path) => path.length > 0) : [];
          const value = (await sdk.sandbox.preview(session.id, selected)).preview;
          if (current()) setSource({ value, revision, scope: sourceScope });
        })}>Preview native source</button>
        {source && source.scope === sourceScope && <section className="candidate-binding" aria-label="Exact native source review">
          <p className="fine-print path">Local source: {source.value.sourceRoot ?? "None"} / {source.value.bytes} bytes / HEAD {source.value.sourceHead ?? "not a Git root"}.</p>
          <p className="fine-print">{source.value.diagnostic}</p>
          {source.value.files.map((file) => <details key={file.path}><summary className="path">{file.path} / {file.bytes} bytes</summary><p className="fine-print path">SHA-256 {file.digest}</p><pre className="workspace-file-content">{file.text}</pre></details>)}
          <label className="check-setting"><input type="checkbox" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />I reviewed this exact file set and its contents.</label>
          <button type="button" className="primary" disabled={Boolean(busy) || !prepared || !sourceReviewed} onClick={() => void run("Preparing reviewed private stage", async () => {
            await sdk.sandbox.prepare(session.id, source.value.paths, source.value.digest, source.revision);
            setNotice("Reviewed private stage prepared. Source unchanged; no model turn was started.");
          })}>Prepare reviewed native stage</button>
        </section>}
      </>}
    </details>
    <label className="setting-field">Retained native execution<select aria-label="Retained native execution" value={execution?.id ?? ""} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      {!executions.length && <option value="">No retained native runs</option>}{executions.map((value) => <option key={value.id} value={value.id}>{snapshot.sessions.find((session) => session.id === value.sessionId)?.title ?? "Source session deleted"} / {value.status} / {value.id.slice(0, 8)}</option>)}
    </select></label>
    {execution && <div className="candidate-section" aria-label="Original native run">
      <p className="fine-print">Native outcome: {execution.status}. Worker: {execution.workerOutcome ?? "not acknowledged"}. Cleanup: {execution.cleanup}. Cancellation: {execution.cancellation}.</p>
      <p className="fine-print path">Original VM: {execution.nativeSessionId ?? "unbound"}. CLI exit: {execution.cliExitCode ?? "unreported"}. Model root: {execution.root ?? "null"}. Original source: {execution.sourceRoot ?? "none"}.</p>
      {execution.diagnostic && <p className="settings-warning">{execution.diagnostic}</p>}
      <div className="button-row">
        {active && <button type="button" disabled={Boolean(busy)} onClick={() => void run("Stopping original native turn", async () => { await sdk.sandbox.stop(execution.id); setNotice("Stop requested only for the original native owner. Inspect its actual outcome and cleanup."); })}>Stop this native turn</button>}
        <button type="button" disabled={Boolean(busy) || !execution.resultDigest} onClick={() => void run("Inspecting retained native result", async (current) => {
          const value = (await sdk.sandbox.result(execution.id)).result;
          if (!value) throw new Error("This native run has no retained after-state. Reconcile its original owner; no new VM or fallback.");
          if (current()) setResult({ id: execution.id, digest: execution.resultDigest!, value });
        })}>Inspect retained result</button>
      </div>
      <label className="check-setting"><input type="checkbox" checked={inspectionReviewed} disabled={Boolean(busy) || active} onChange={(event) => setInspectionReviewed(event.target.checked)} />Inspect/stop only this original signed guest; never launch or replay work.</label>
      <button type="button" disabled={Boolean(busy) || active || !inspectionReviewed} onClick={() => void run("Reconciling original native owner", async () => {
        await sdk.sandbox.reconcile(execution.id);
        const value = (await sdk.sandbox.execution(execution.id)).execution;
        setNotice(`Original native status: ${value.status}; cleanup: ${value.cleanup}. Partial turns were not upgraded and no model or VM was dispatched.`);
      })}>Reconcile original native guest</button>
    </div>}
    {retained && execution && <div className="candidate-section" aria-label="Retained native output files">
      <p className="fine-print">Signed runtime exit: {retained.exitCode ?? "unreported"} / rollback: {retained.rollback} / after-state association: {retained.afterBinding}. Journal: {retained.journal.status}. Provenance is not code quality or acceptance.</p>
      {retained.journal.diagnostic && <p className="settings-warning">{retained.journal.diagnostic}</p>}
      {retained.files.map((file) => <details key={file.path}><summary className="path">{file.path} / {file.bytes} bytes</summary>
        <p className="fine-print path">SHA-256 {file.digest}</p><pre className="workspace-file-content">{file.text}</pre>
        <label className="check-setting"><input type="checkbox" aria-label={`Select native output ${file.path}`} checked={selectedPaths.includes(file.path)} disabled={Boolean(busy) || !execution.sourceRoot}
          onChange={(event) => setSelectedPaths((paths) => event.target.checked ? [...paths, file.path] : paths.filter((path) => path !== file.path))} />Include these exact bytes in source-publication review</label>
      </details>)}
      {retained.deletedPaths.length > 0 && <p className="settings-warning">Deleted native paths are not automatically published: {retained.deletedPaths.join(", ")}.</p>}
      {retained.excludedCount > 0 && <details><summary>{retained.excludedCount} excluded outputs</summary>
        {retained.excludedCount > retained.excluded.length && <p className="fine-print">Showing {retained.excluded.length} bounded exclusion descriptions of {retained.excludedCount}; omitted files are not retained or publishable text outputs.</p>}
        {retained.excluded.map((value) => <p key={value.path} className="fine-print path">{value.path}: {value.reason}</p>)}</details>}
      <button type="button" disabled={Boolean(busy) || !selectedPaths.length || selectedPaths.length > 20 || !execution.sourceRoot} onClick={() => void run("Reviewing original source publication", async (current) => {
        const value = (await sdk.sandbox.publicationPreview(execution.id, selectedPaths)).preview;
        if (current()) setReview({ value, revision: execution.revision, scope: publicationScope });
      })}>Review selected source publication</button>
    </div>}
    {review && execution && review.scope === publicationScope && <section className="candidate-binding" aria-label="Exact native source publication">
      <h3>Separate actual-user publication</h3><p className="fine-print path">Local destination: {review.value.document.root}. HEAD: {review.value.document.git?.head ?? "not a Git root"}.</p>
      <p className="fine-print">At most {review.value.limits.files} files, {review.value.limits.patchBytes} patch bytes and {review.value.limits.documentBytes} complete review-document bytes.</p>
      <p className="fine-print">{review.value.diagnostic}</p>
      {review.value.document.patch.edits.map((edit) => <details key={edit.path}><summary className="path">{edit.path} / base {edit.baseDigest}</summary><pre className="workspace-file-content">{edit.text}</pre></details>)}
      <label className="check-setting"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I reviewed these exact source bases and output bytes. This authorizes only this copy, not code quality, execution or a Git commit.</label>
      <button type="button" className="primary" disabled={Boolean(busy) || !accepted} onClick={() => void run("Admitting reviewed source publication", async () => {
        const value = await sdk.sandbox.publish(execution.id, review.value.document.patch.edits.map((edit) => edit.path), review.value.digest, review.revision);
        focusOutcome.current = true; setPublicationId(value.id!); setReview(null); setAccepted(false); setSelectedPaths([]);
        setNotice("Exact user publication admitted. Inspect the original job's actual files/outcome; no commit or rollback is assumed.");
      })}>Publish reviewed native files</button>
    </section>}
    <label className="setting-field">Retained source publication<select aria-label="Retained native publication" value={publicationId} disabled={Boolean(busy)} onChange={(event) => setPublicationId(event.target.value)}>
      <option value="">Choose original publication</option>{publications.map((value) => <option key={value.id} value={value.id}>{value.status} / {value.id.slice(0, 8)}</option>)}
    </select></label>
    {publication && <section ref={outcome} tabIndex={-1} className="candidate-section" aria-label="Native source publication outcome">
      <p className="fine-print" role="status">Publication {publication.status}. Actual acceptance actor: {publication.acceptance.actor}. {job?.progress}</p>
      <p className="fine-print path">Original source: {publication.root}. Attempted: {publication.attemptedPaths.join(", ") || "none"}; verified copied: {publication.publishedPaths.join(", ") || "none"}.</p>
      {publication.diagnostic && <p className="inline-error" role="alert">{publication.diagnostic}</p>}
      {job && ["running", "waiting_input"].includes(job.status) && <button type="button" disabled={Boolean(busy)} onClick={() => void run("Stopping original publication job", async () => { await sdk.jobs.cancel(job.id); })}>Stop original publication</button>}
      <p className="fine-print">Retained independently of the source session/execution. Partial work is never silently retried; source index/HEAD and unrelated edits are not reset.</p>
    </section>}
  </section>;
}
