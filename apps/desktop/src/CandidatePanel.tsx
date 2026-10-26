import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { CandidateApplyPreview, CandidateDocument, CandidatePatch, CandidateStagePreview, CandidateGenerationResponse, CandidateRoleReference, CandidateRoleProposalRead, MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { CandidateGenerationPanel } from "./CandidateGenerationPanel.tsx";
import { CandidateRoleProposalPanel } from "./CandidateRoleProposalPanel.tsx";
import { CompoundPanel } from "./CompoundPanel.tsx";
import { WinddownPanel } from "./WinddownPanel.tsx";

interface DraftFile { path: string; baseDigest: string; baseText: string; text: string }
const summaryDefault = "Review repository changes";
export function CandidatePanel({ sdk, snapshot, session, onDirty }: { sdk: MoguriSdk; snapshot: Snapshot; session?: Session; onDirty: (dirty: boolean) => void }) {
  const [summary, setSummary] = useState(summaryDefault), [stageId, setStageId] = useState(""), [path, setPath] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]), [fileIndex, setFileIndex] = useState(0), [draftScope, setDraftScope] = useState<string | null>(null);
  const [modelOrigin, setModelOrigin] = useState<string | CandidateRoleReference | undefined>(), [generationDirty, setGenerationDirty] = useState(false);
  const [compoundDirty, setCompoundDirty] = useState(false);
  const [winddownDirty, setWinddownDirty] = useState(false);
  const [preview, setPreview] = useState<{ value: CandidateStagePreview; scope: string; sessionId: string; stageId: string } | null>(null);
  const [selectedId, setSelectedId] = useState(""), [document, setDocument] = useState<CandidateDocument | null>(null);
  const [application, setApplication] = useState<{ value: CandidateApplyPreview; scope: string } | null>(null);
  const [busy, setBusy] = useState(""), [stopping, setStopping] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [eligibility, setEligibility] = useState<{ scope: string; eligible: boolean; diagnostic: string | null } | null>(null);
  const selected = snapshot.candidates.find((candidate) => candidate.id === selectedId), selectedFile = files[fileIndex];
  const project = snapshot.projects.find((project) => project.id === session?.projectId), configuration = snapshot.projectConfigurations.find((value) => value.projectId === project?.id);
  const cleanup = snapshot.candidateCleanups.find((cleanup) => cleanup.status !== "completed" &&
    (cleanup.targets.includes(selectedId) || cleanup.reason.kind === "session-delete" && cleanup.reason.sessionId === session?.id));
  const scope = JSON.stringify([sdk.profileId, session?.id, session?.projectId, session?.controls.env, session?.workspaceId, session?.mode, session?.pendingMode,
    project?.path, configuration?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision, cleanup?.id, cleanup?.status]);
  const actualScope = useRef(scope), generation = useRef(0), documentGeneration = useRef(0); actualScope.current = scope;
  const proposalEditor = useRef<HTMLTextAreaElement>(null);
  const changedScope = draftScope !== null && draftScope !== scope;
  const repositoryReady = eligibility?.scope === scope && eligibility.eligible;
  const local = Boolean(repositoryReady && session?.projectId && session.controls.env === "Local" && snapshot.policy.allowedEnvs.includes("Local"));
  const writable = local && session?.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" && !session.turnId;
  const dirty = summary !== summaryDefault || files.some((file) => file.baseDigest === "absent" || file.text !== file.baseText);
  const stages = snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === session?.projectId && workspace.id !== session.workspaceId && workspace.status === "ready");
  const candidates = snapshot.candidates.filter((candidate) => !session?.projectId || candidate.projectId === session.projectId || candidate.id === selectedId).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const artifact = snapshot.artifacts.find((artifact) => artifact.id === selectedId);
  const active = selected && ["staging", "applying"].includes(selected.status);
  useEffect(() => { onDirty(dirty || Boolean(busy) || generationDirty || compoundDirty || winddownDirty); return () => onDirty(false); }, [dirty, busy, generationDirty, compoundDirty, winddownDirty, onDirty]);
  useEffect(() => {
    let current = true;
    setEligibility(null);
    if (session) void sdk.candidates.eligibility(session.id).then((value) => {
      if (current) setEligibility({ scope, eligible: value.eligible, diagnostic: value.diagnostic });
    }).catch((error: unknown) => {
      if (current) setEligibility({ scope, eligible: false, diagnostic: error instanceof Error ? error.message : "Repository eligibility could not be verified. Creation is disabled." });
    });
    return () => { current = false; };
  }, [sdk, scope]);
  useEffect(() => { generation.current++; setPreview(null); setApplication(null); if (!files.length && summary === summaryDefault) { setDraftScope(null); setStageId(""); } }, [scope]);
  useEffect(() => { setApplication(null); }, [selectedId, selected?.revision]);
  useEffect(() => {
    const token = ++documentGeneration.current; setDocument(null);
    if (selectedId) void sdk.candidates.read(selectedId).then((value) => { if (documentGeneration.current === token) setDocument(value.document); })
      .catch((error: unknown) => { if (documentGeneration.current === token) setError(error instanceof Error ? error.message : "Retained candidate could not be read."); });
    return () => { documentGeneration.current++; };
  }, [sdk, selectedId, selected?.documentDigest]);
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    const token = ++generation.current, capturedScope = scope; setError(""); setNotice(""); setBusy(name);
    try { await operation(() => generation.current === token && actualScope.current === capturedScope); }
    catch (error) { if (generation.current === token && actualScope.current === capturedScope) setError(error instanceof Error ? error.message : "Candidate work failed. Your draft and retained proposal were preserved."); }
    finally { setBusy(""); }
  };
  const load = (fresh: boolean) => void run("Loading source", async (current) => {
    if (!session) return;
    const value = fresh ? { path, text: "", digest: "absent" } : await sdk.workspaces.file(session.id, path);
    if (!current()) return;
    if (files.some((file) => file.path.normalize("NFC").toLowerCase() === value.path.normalize("NFC").toLowerCase())) throw new Error("This file is already in the proposal. Select it below instead of adding an alias.");
    setFiles([...files, { path: value.path, baseDigest: value.digest, baseText: value.text, text: value.text }]); setFileIndex(files.length);
    setDraftScope(scope); setPreview(null); setPath(""); setModelOrigin(undefined);
  });
  const draft = (): CandidatePatch => ({ kind: "patch", summary, edits: files.map(({ path, baseDigest, text }) => ({ path, baseDigest, text })) });
  const reset = () => { generation.current++; setFiles([]); setFileIndex(0); setDraftScope(null); setPreview(null); setStageId(""); setSummary(summaryDefault); setError(""); setModelOrigin(undefined); };
  const sourceRoot = session?.workspaceId ? snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId)?.path : project?.path;
  const loadModelProposal = (document: CandidateDocument, sources: Array<{ path: string; baseDigest: string; text: string | null }>, origin: string | CandidateRoleReference) => {
    if (!writable || dirty || !session || document.source.root !== sourceRoot || document.source.projectId !== session.projectId ||
      document.source.workspaceId !== session.workspaceId || !document.stage.workspaceId) throw new Error("Keep the exact compatible Local source and discard/copy unsaved edits before loading a model proposal.");
    const selected = document.patch.edits.map((edit) => {
      const source = sources.find((file) => file.path === edit.path && file.baseDigest === edit.baseDigest);
      if (!source) throw new Error("The generated edit lost its exact original source snapshot.");
      return { ...edit, baseText: source.text ?? "" };
    });
    setFiles(selected); setFileIndex(0); setSummary(document.patch.summary); setStageId(document.stage.workspaceId);
    setDraftScope(scope); setModelOrigin(origin); setPreview(null); setSelectedId(""); setError("");
    requestAnimationFrame(() => { proposalEditor.current?.focus(); proposalEditor.current?.scrollIntoView({ block: "nearest" }); });
  };
  const loadGenerated = (value: Extract<CandidateGenerationResponse, { type: "candidate.generation.read" }>) => {
    if (value.generation.status !== "proposed" || !value.proposal) throw new Error("Choose an exact retained proposed generation.");
    loadModelProposal(value.proposal, value.input.files, value.generation.id);
    setNotice("Generated bytes loaded locally. Review exact staging first; source application remains a separate actual-user action.");
  };
  const loadRole = (value: CandidateRoleProposalRead) => {
    loadModelProposal(value.document, value.sourceFiles, { roleSequenceId: value.document.roleOrigin.sequenceId });
    setNotice("Canonical final-role bytes loaded locally. Review staging and source application separately. No model or file write was started.");
  };
  return <section className="candidate-panel" aria-label="Reviewed repository candidates" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting">Stage in a separate owned worktree. Review exact bytes before publishing to the source. Manual staging/application use no model; optional generation is explicit and metered. No commit or push.</SettingsHelp>
    <p className="fine-print">Checks cover roots, bases and exact bytes. No project tests or code-quality validation is implied.</p>
    <SettingsHelp label="More about this setting">Candidates and generation proposals are permanently deleted with their originating session or after fresh verification that their exact linked PR merged. Archiving alone preserves them. Ordinary artifacts, applied code, worktrees and PRs keep their own lifecycle.</SettingsHelp>
    <label className="setting-field">Retained proposal<select aria-label="Retained candidate" value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose a retained proposal</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{snapshot.artifacts.find((artifact) => artifact.id === candidate.id)?.name ?? candidate.id} / {candidate.status}</option>)}
    </select></label>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
    {!local && <p className="settings-warning">{eligibility?.scope === scope && eligibility.diagnostic || "Creation requires an explicit Local Git-backed project session. Verifying the exact repository; no previous root is inherited."} Retained proposals remain readable.</p>}
    {cleanup && <p className="settings-warning" role={cleanup.status === "failed" ? "alert" : "status"}>Candidate cleanup {cleanup.status}. {cleanup.diagnostic ?? "Settling exact owned work before deletion."} Deletion is not complete; retained proposals remain inspectable.</p>}
    {local && !writable && <SettingsHelp label="More about this setting">Finish owned work and use an agent-mode session before editing. Read-only and side-session restrictions stay enforced.</SettingsHelp>}
    {changedScope && <p className="settings-warning">The source scope changed. Your unsaved proposal is preserved, but cannot be staged into another root. Copy it or explicitly discard and reload.</p>}
    <CompoundPanel sdk={sdk} snapshot={snapshot} session={session} repositoryReady={Boolean(repositoryReady)} draftDirty={dirty || generationDirty || Boolean(busy)} onDirty={setCompoundDirty} onSelectCandidate={setSelectedId} />
    <WinddownPanel sdk={sdk} snapshot={snapshot} session={session} onDirty={setWinddownDirty} />
    <CandidateGenerationPanel sdk={sdk} snapshot={snapshot} session={session} stageId={stageId} files={files.map(({ path, baseDigest }) => ({ path, baseDigest }))}
      scope={scope} sourceRoot={sourceRoot} writable={Boolean(writable && !busy && !changedScope)} draftDirty={dirty} loadedGenerationId={typeof modelOrigin === "string" ? modelOrigin : undefined} onDirty={setGenerationDirty} onLoad={loadGenerated} />
    <CandidateRoleProposalPanel sdk={sdk} snapshot={snapshot} session={session} scope={scope} sourceRoot={sourceRoot}
      writable={Boolean(writable && !busy && !changedScope)} draftDirty={dirty || generationDirty}
      loadedSequenceId={typeof modelOrigin === "object" ? modelOrigin.roleSequenceId : undefined} onLoad={loadRole} />
    <details className="candidate-section" open={!selectedId}>
      <summary>Draft a proposal</summary>
      <label className="setting-field">Summary<SettingsInput aria-label="Candidate summary" value={summary} maxLength={1200} disabled={Boolean(busy) || changedScope || !writable} onChange={(event) => { setSummary(event.target.value); if (draftScope === null) setDraftScope(scope); setPreview(null); setModelOrigin(undefined); }} /></label>
      {modelOrigin && <SettingsHelp label="More about this setting">Canonical model proposal loaded. Review staging before any write; changing its summary/files clears verified model attribution.</SettingsHelp>}
      <label className="setting-field">Staging worktree<select aria-label="Candidate staging worktree" value={stageId} disabled={Boolean(busy) || changedScope || !writable} onChange={(event) => { setStageId(event.target.value); setPreview(null); setModelOrigin(undefined); }}>
        <option value="">Choose a separate owned worktree</option>{stages.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.branch}</option>)}
      </select></label>
      <p className="fine-print">The service checks clean state and the exact source HEAD on preview. Create/select a new worktree explicitly with Project settings or <code>/workspace create BRANCH</code>; no branch is created here.</p>
      <label className="setting-field">File path<SettingsInput aria-label="Candidate file path" value={path} disabled={Boolean(busy) || changedScope || !writable} placeholder="src/example.ts" onChange={(event) => setPath(event.target.value)} /></label>
      <div className="button-row"><button disabled={Boolean(busy) || changedScope || !writable || !path.trim() || files.length >= 20} onClick={() => load(false)}>Load source file</button>
        <button disabled={Boolean(busy) || changedScope || !writable || !path.trim() || files.length >= 20} onClick={() => load(true)}>Add new file</button></div>
      {files.length > 0 && <><label className="setting-field">Proposed file<select aria-label="Proposed candidate file" value={String(fileIndex)} disabled={Boolean(busy)} onChange={(event) => setFileIndex(Number(event.target.value))}>{files.map((file, index) => <option key={file.path} value={String(index)}>{file.path} / {file.baseDigest === "absent" ? "new" : "replace"}</option>)}</select></label>
        {selectedFile && <><p className="fine-print path">Recorded base: <code>{selectedFile.baseDigest}</code></p>
          <label className="setting-field">Proposed bytes<SettingsTextarea ref={proposalEditor} aria-label="Proposed file text" spellCheck={false} value={selectedFile.text} readOnly={changedScope || !writable} disabled={Boolean(busy)} onChange={(event) => {
            setFiles(files.map((file, index) => index === fileIndex ? { ...file, text: event.target.value } : file)); setPreview(null); setModelOrigin(undefined);
          }} /></label>
          <button disabled={Boolean(busy)} onClick={() => { const next = files.filter((_, index) => index !== fileIndex); setFiles(next); setFileIndex(0); setPreview(null); setModelOrigin(undefined); if (!next.length) setDraftScope(null); }}>Remove file from proposal</button></>}
      </>}
      <div className="button-row"><button disabled={Boolean(busy) || !writable || changedScope || !dirty || !files.length || !stageId || !summary.trim()} onClick={() => void run("Reviewing staging", async (current) => {
        if (!session) return;
        const value = (await sdk.candidates.preview(session.id, stageId, draft(), typeof modelOrigin === "object" ? modelOrigin : undefined)).preview;
        if (current()) setPreview({ value, scope, sessionId: session.id, stageId });
      })}>Review staging</button>
        <button className="primary" disabled={Boolean(busy) || !writable || changedScope || !preview || preview.scope !== scope} onClick={() => void run("Staging exact proposal", async (current) => {
          if (!preview) return;
          const captured = preview, created = await sdk.candidates.stage(captured.sessionId, captured.stageId, captured.value.document.patch, captured.value.digest, modelOrigin);
          if (current()) setSelectedId(created.id!);
          const result = await sdk.candidates.wait(created.id!);
          if (!current()) return;
          if (result.candidate.status === "staged") { reset(); setSelectedId(result.candidate.id); setNotice("Staged separately. Source files are unchanged; review application before publishing."); }
          else setError(`Candidate ${result.candidate.status}. ${result.candidate.diagnostic ?? "Inspect the retained roots and original job; no success or rollback was inferred."}`);
        })}>Stage reviewed proposal</button>
        <button disabled={Boolean(busy) || !files.length && !changedScope && !dirty} onClick={reset}>Discard local proposal</button></div>
      {preview && preview.scope === scope && <div className="candidate-binding" aria-label="Exact staging preview">
        <p className="fine-print path">Local source: {preview.value.document.source.root}<br />Owned stage: {preview.value.document.stage.root}</p>
        {preview.value.warning && <p className="settings-warning">{preview.value.warning}</p>}
        <p className="fine-print">{preview.value.document.patch.edits.length} exact files / base <code>{preview.value.document.source.head.slice(0, 12)}</code>. Staging does not accept or apply them.</p>
      </div>}
    </details>
    {selected && <div className="candidate-section" aria-label="Retained candidate outcome">
      <header className="panel-toolbar"><strong>{selected.status === "staged" ? "Proposed, not accepted" : selected.status === "applied" ? "Applied reviewed files" : `Candidate ${selected.status}`}</strong>
        {active && <button disabled={stopping} onClick={() => { setStopping(true); void sdk.candidates.stop(selected.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop was not confirmed.")).finally(() => setStopping(false)); }}>{stopping ? "Requesting stop..." : `Stop ${selected.status === "staging" ? "staging" : "application"}`}</button>}
      </header>
      <p className="fine-print path">Local source: {selected.source.branch} / base <code>{selected.source.head.slice(0, 12)}</code></p>
      {selected.originSessionId === null && <SettingsHelp label="More about this setting">Legacy origin ownership is unknown. This proposal is not assigned to the current session; its report can be deleted explicitly in Artifacts.</SettingsHelp>}
      <details open={selected.status === "partial"}><summary>Captured Local source and stage</summary><p className="fine-print path">Source: {selected.source.root}<br />Owned stage: {selected.stage.root}<br />Stage branch: {selected.stage.branch}</p></details>
      <p className="fine-print">{selected.compoundOrigin ? "Derived from an actual public compound role. Inspect the separate retained workflow for actual tests and critic observations; provenance is not quality or source acceptance." : selected.roleOrigin ? "Derived from the exact final retained model role. Its independent origin is not quality or acceptance." : selected.generationId ? "Derived from its canonical model generation. Model provenance is not acceptance." : artifact?.sources[0]?.actor === "unknown" ? "Imported proposal; authorship is unverified." : "Retained source provenance is independent of acceptance."} {selected.acceptance ? "Accepted by the actual user. No commit or push was performed." : "No source acceptance is recorded."}</p>
      {selected.stopRequested && <p className="fine-print">Owned stop was requested; the actual outcome is {selected.status}.</p>}
      {selected.diagnostic && <p className={selected.status === "partial" ? "settings-warning" : "inline-error"} role="alert">{selected.diagnostic}</p>}
      <p className="fine-print">Staged: {selected.stagedPaths.length}/{selected.paths.length}. Source attempts: {selected.attemptedPaths.length}. Confirmed source publications: {selected.appliedPaths.length}.</p>
      {selected.status === "partial" && <p className="settings-warning">Files may already be published. No rollback or retry occurred. Inspect both captured roots before an explicit existing workspace/session recovery action.</p>}
      {document && <details><summary>Exact proposed files ({document.patch.edits.length})</summary>{document.patch.edits.map((edit) => <div key={edit.path} className="candidate-file-review">
        <strong className="path">{edit.path}</strong><p className="fine-print path">Source base: {edit.baseDigest}</p><pre>{edit.text || "(Empty proposed file)"}</pre>
      </div>)}</details>}
      {selected.status === "staged" && <><div className="button-row"><button disabled={Boolean(busy) || !writable} onClick={() => void run("Reviewing source application", async (current) => {
        if (!session) return;
        const preview = (await sdk.candidates.applyPreview(selected.id, session.id)).preview;
        if (current()) setApplication({ value: preview, scope });
      })}>Review source application</button>
        <button className="primary" disabled={Boolean(busy) || !writable || selected.status !== "staged" || !application || application.scope !== scope || application.value.candidateId !== selected.id || application.value.revision !== selected.revision} onClick={() => void run("Applying reviewed files", async (current) => {
          if (!application) return;
          const captured = application.value;
          await sdk.candidates.apply(captured.candidateId, captured.sessionId, captured.revision, captured.digest);
          const result = await sdk.candidates.wait(captured.candidateId);
          if (current()) setNotice(result.candidate.status === "applied" ? "Exact reviewed files applied. No commit or push." : `Application ${result.candidate.status}. Inspect its actual retained outcome.`);
        })}>Apply reviewed files</button>
        <button disabled={Boolean(busy) || selected.status !== "staged"} onClick={() => void run("Rejecting proposal", async () => { await sdk.candidates.reject(selected.id, selected.revision, true); })}>Reject proposal</button>
      </div>
      {application && application.scope === scope && application.value.candidateId === selected.id && application.value.revision === selected.revision && <p className="fine-print path">Fresh source/base/policy review: <code>{application.value.digest}</code>. Applying is a separate actual-user action, not a validator or model decision.</p>}</>}
      <button disabled={Boolean(busy) || Boolean(active)} onClick={() => void run("Exporting retained history", async () => {
        const document = (await sdk.artifacts.export(selected.id)).export, saved = await window.moguri.saveDocument(document);
        setNotice(saved ? "Exact candidate/history export saved. Stored copies and source files are unchanged." : "Export cancelled. Stored copies are unchanged.");
      })}>Export candidate history</button>
    </div>}
    {!candidates.length && <p className="fine-print">No retained proposals yet. A successful stage remains separate from your source until an exact apply review.</p>}
    {busy && <p className="fine-print" role="status">{busy}...</p>}
  </section>;
}
