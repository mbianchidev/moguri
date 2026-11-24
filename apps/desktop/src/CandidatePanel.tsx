import { SettingsAction, SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { CandidateApplyPreview, CandidateDocument, CandidatePatch, CandidateStagePreview, CandidateGenerationResponse, CandidateRoleReference, CandidateRoleProposalRead, MoguriSdk, Session, Snapshot } from "@moguri-dev/sdk";
import { CandidateGenerationPanel } from "./CandidateGenerationPanel.tsx";
import { CandidateRoleProposalPanel } from "./CandidateRoleProposalPanel.tsx";
import { CompoundPanel } from "./CompoundPanel.tsx";
import { WinddownPanel } from "./WinddownPanel.tsx";
import { Alert } from "./Alert.tsx";
import { envLabel, candidateRootBase, candidateRootLabel, type CandidateWorkspace } from "@moguri-dev/sdk";
import { CandidateWorkspacePanel } from "./CandidateWorkspacePanel.tsx";
import { CandidateRecoveryPanel } from "./CandidateRecoveryPanel.tsx";
import { usePendingWork } from "./pending-work.ts";

interface DraftFile { path: string; baseDigest: string; baseText: string; text: string }
const summaryDefault = "Review repository changes";
export function CandidatePanel({ sdk, snapshot, session, onDirty }: { sdk: MoguriSdk; snapshot: Snapshot; session?: Session; onDirty: (dirty: boolean) => void }) {
  const [summary, setSummary] = useState(summaryDefault), [stageId, setStageId] = useState(""), [path, setPath] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]), [fileIndex, setFileIndex] = useState(0), [draftScope, setDraftScope] = useState<string | null>(null);
  const [modelOrigin, setModelOrigin] = useState<string | CandidateRoleReference | undefined>(), [generationDirty, setGenerationDirty] = useState(false);
  const [compoundDirty, setCompoundDirty] = useState(false);
  const [workspaceDirty, setWorkspaceDirty] = useState(false), [envStages, setEnvStages] = useState<CandidateWorkspace[]>([]);
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
    project?.path, configuration?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision, snapshot.settings.values.remote, snapshot.settings.values.sandbox, session?.sandboxWorkspaceId, cleanup?.id, cleanup?.status]);
  const actualScope = useRef(scope), generation = useRef(0), documentGeneration = useRef(0); actualScope.current = scope;
  const proposalEditor = useRef<HTMLTextAreaElement>(null);
  const changedScope = draftScope !== null && draftScope !== scope;
  const repositoryReady = eligibility?.scope === scope && eligibility.eligible;
  const envReady = Boolean(repositoryReady && session?.projectId && snapshot.policy.allowedEnvs.includes(session.controls.env));
  const local = session?.controls.env === "Local";
  const writable = envReady && session?.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" && !session.turnId;
  const dirty = summary !== summaryDefault || files.some((file) => file.baseDigest === "absent" || file.text !== file.baseText);
  const stages = local ? snapshot.managedWorkspaces.filter((workspace) => workspace.projectId === session?.projectId && workspace.id !== session?.workspaceId && workspace.status === "ready").map((workspace) => ({ id: workspace.id, label: workspace.branch })) :
    envStages.filter((workspace) => workspace.status === "ready").map((workspace) => ({ id: workspace.id, label: `${workspace.name} / ${envLabel(workspace.boundary.env)}` }));
  const candidates = snapshot.candidates.filter((candidate) => !session?.projectId || candidate.projectId === session.projectId || candidate.id === selectedId).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const artifact = snapshot.artifacts.find((artifact) => artifact.id === selectedId);
  const active = selected && ["staging", "applying"].includes(selected.status);
  usePendingWork(Boolean(busy));
  useEffect(() => { onDirty(dirty || Boolean(busy) || generationDirty || compoundDirty || winddownDirty || workspaceDirty); return () => onDirty(false); }, [dirty, busy, generationDirty, compoundDirty, winddownDirty, workspaceDirty, onDirty]);
  useEffect(() => {
    let current = true;
    setEligibility(null);
    if (session) void sdk.candidates.eligibility(session.id).then((value) => {
      if (current) setEligibility({ scope, eligible: value.eligible, diagnostic: value.diagnostic });
    }).catch((error: unknown) => {
      if (current) setEligibility({ scope, eligible: false, diagnostic: error instanceof Error ? error.message : "Couldn't check this repository, so new proposals are disabled." });
    });
    return () => { current = false; };
  }, [sdk, scope]);
  useEffect(() => { generation.current++; setPreview(null); setApplication(null); if (!files.length && summary === summaryDefault) { setDraftScope(null); setStageId(""); } }, [scope]);
  useEffect(() => { setApplication(null); }, [selectedId, selected?.revision]);
  useEffect(() => {
    const token = ++documentGeneration.current; setDocument(null);
    if (selectedId) void sdk.candidates.read(selectedId).then((value) => { if (documentGeneration.current === token) setDocument(value.document); })
      .catch((error: unknown) => { if (documentGeneration.current === token) setError(error instanceof Error ? error.message : "Couldn't read this proposal."); });
    return () => { documentGeneration.current++; };
  }, [sdk, selectedId, selected?.documentDigest]);
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    const token = ++generation.current, capturedScope = scope; setError(""); setNotice(""); setBusy(name);
    try { await operation(() => generation.current === token && actualScope.current === capturedScope); }
    catch (error) { if (generation.current === token && actualScope.current === capturedScope) setError(error instanceof Error ? error.message : "That didn't work. Your draft and saved proposal were kept."); }
    finally { setBusy(""); }
  };
  const load = (fresh: boolean) => void run("Loading source", async (current) => {
    if (!session) return;
    const source = fresh ? null : (await sdk.candidates.source(session.id, [path])).files[0];
    if (!fresh && (!source || source.text === null)) throw new Error("This file doesn't exist. Use Add new file to create it.");
    const value = fresh ? { path, text: "", digest: "absent" } : { path: source!.path, text: source!.text!, digest: source!.baseDigest };
    if (!current()) return;
    if (files.some((file) => file.path.normalize("NFC").toLowerCase() === value.path.normalize("NFC").toLowerCase())) throw new Error("This file is already in the proposal. Select it below.");
    setFiles([...files, { path: value.path, baseDigest: value.digest, baseText: value.text, text: value.text }]); setFileIndex(files.length);
    setDraftScope(scope); setPreview(null); setPath(""); setModelOrigin(undefined);
  });
  const draft = (): CandidatePatch => ({ kind: "patch", summary, edits: files.map(({ path, baseDigest, text }) => ({ path, baseDigest, text })) });
  const reset = () => { generation.current++; setFiles([]); setFileIndex(0); setDraftScope(null); setPreview(null); setStageId(""); setSummary(summaryDefault); setError(""); setModelOrigin(undefined); };
  const sourceRoot = session?.controls.env === "Sandbox" ? "/workspace" : session?.controls.env === "Remote" ? configuration?.values.remotePath ?? undefined :
    session?.workspaceId ? snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId)?.path : project?.path;
  const loadModelProposal = (document: CandidateDocument, sources: Array<{ path: string; baseDigest: string; text: string | null }>, origin: string | CandidateRoleReference) => {
    if (!writable || dirty || !session || document.source.root !== sourceRoot || document.source.projectId !== session.projectId ||
      document.source.workspaceId !== session.workspaceId || !document.stage.workspaceId) throw new Error("Use the proposal's original Local project, and copy or discard your unsaved edits, before loading it.");
    const selected = document.patch.edits.map((edit) => {
      const source = sources.find((file) => file.path === edit.path && file.baseDigest === edit.baseDigest);
      if (!source) throw new Error("The generated edit's source snapshot is missing.");
      return { ...edit, baseText: source.text ?? "" };
    });
    setFiles(selected); setFileIndex(0); setSummary(document.patch.summary); setStageId(document.stage.workspaceId);
    setDraftScope(scope); setModelOrigin(origin); setPreview(null); setSelectedId(""); setError("");
    requestAnimationFrame(() => { proposalEditor.current?.focus(); proposalEditor.current?.scrollIntoView({ block: "nearest" }); });
  };
  const loadGenerated = (value: Extract<CandidateGenerationResponse, { type: "candidate.generation.read" }>) => {
    if (value.generation.status !== "proposed" || !value.proposal) throw new Error("Choose a generation that has a proposal.");
    loadModelProposal(value.proposal, value.input.files, value.generation.id);
    setNotice("Generated changes loaded into the draft. Review staging first; applying them is a separate step.");
  };
  const loadRole = (value: CandidateRoleProposalRead) => {
    loadModelProposal(value.document, value.sourceFiles, { roleSequenceId: value.document.roleOrigin.sequenceId });
    setNotice("Role proposal loaded into the draft. Review staging, then apply separately. Nothing was written.");
  };
  return <section className="candidate-panel" aria-label="Reviewed repository candidates" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h3>Repository candidates</h3>}>Try a change in a separate worktree, review it, then apply it to your project. Only generating a proposal calls a model (which may be billed); nothing is committed or pushed.</SettingsHelp>
    <p className="fine-print">Moguri checks that files haven't changed since you reviewed them. It doesn't run your tests.</p>
    <SettingsHelp label="More about this setting" target={<label className="setting-field">Proposal<select aria-label="Retained candidate" value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose a proposal</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{snapshot.artifacts.find((artifact) => artifact.id === candidate.id)?.name ?? candidate.id} / {candidate.status}</option>)}
    </select></label>} descriptionFirst>Proposals are deleted when their chat is deleted or their linked PR merges. Archiving the chat keeps them.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {!envReady && <Alert as="p" tone="warning" className="settings-warning">{eligibility?.scope === scope && eligibility.diagnostic || "Checking this chat's environment and project..."} Saved proposals stay readable.</Alert>}
    {cleanup && <Alert as="p" className="settings-warning" role={cleanup.status === "failed" ? "alert" : "status"}>Proposal cleanup {cleanup.status}. {cleanup.diagnostic ?? "Waiting for running work to finish before deleting."} Proposals stay readable until deletion finishes.</Alert>}
    {envReady && !writable && <p className="fine-print">To edit, use an agent-mode chat with no turn running.</p>}
    {changedScope && <Alert as="p" tone="warning" className="settings-warning">The chat's project or environment changed. Your draft is kept but can't be staged here; copy or discard it.</Alert>}
    <CandidateWorkspacePanel sdk={sdk} session={session} scope={scope} writable={Boolean(writable && !busy)} onWorkspaces={setEnvStages} onDirty={setWorkspaceDirty} />
    <CandidateRecoveryPanel sdk={sdk} session={session} scope={scope} />
    <CompoundPanel sdk={sdk} snapshot={snapshot} session={session} envStages={envStages} repositoryReady={Boolean(repositoryReady)} draftDirty={dirty || generationDirty || Boolean(busy)} onDirty={setCompoundDirty} onSelectCandidate={setSelectedId} />
    <WinddownPanel sdk={sdk} snapshot={snapshot} session={session} onDirty={setWinddownDirty} />
    <CandidateGenerationPanel sdk={sdk} snapshot={snapshot} session={session} stageId={stageId} files={files.map(({ path, baseDigest }) => ({ path, baseDigest }))}
      scope={scope} sourceRoot={sourceRoot} writable={Boolean(local && writable && !busy && !changedScope)} draftDirty={dirty} loadedGenerationId={typeof modelOrigin === "string" ? modelOrigin : undefined} onDirty={setGenerationDirty} onLoad={loadGenerated} />
    <CandidateRoleProposalPanel sdk={sdk} snapshot={snapshot} session={session} scope={scope} sourceRoot={sourceRoot}
      writable={Boolean(local && writable && !busy && !changedScope)} draftDirty={dirty || generationDirty}
      loadedSequenceId={typeof modelOrigin === "object" ? modelOrigin.roleSequenceId : undefined} onLoad={loadRole} />
    <details className="candidate-section" open={!selectedId}>
      <summary>Draft a proposal</summary>
      <label className="setting-field">Summary<SettingsInput aria-label="Candidate summary" value={summary} maxLength={1200} disabled={Boolean(busy) || changedScope || !writable} onChange={(event) => { setSummary(event.target.value); if (draftScope === null) setDraftScope(scope); setPreview(null); setModelOrigin(undefined); }} /></label>
      {modelOrigin && <p className="fine-print">Model proposal loaded. Editing its summary or files removes the model attribution.</p>}
      <label className="setting-field">{local ? "Staging worktree" : "Staging resource"}<select aria-label={local ? "Candidate staging worktree" : "Candidate staging resource"} value={stageId} disabled={Boolean(busy) || changedScope || !writable} onChange={(event) => { setStageId(event.target.value); setPreview(null); setModelOrigin(undefined); }}>
        <option value="">{local ? "Choose a worktree" : "Choose a staging resource"}</option>{stages.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.label}</option>)}
      </select></label>
      <p className="fine-print">{local ? <>Use a clean worktree on the same base. Create one in Project settings or with <code>/workspace create BRANCH</code>.</> : "Use a clean staging resource on the same base; create one above."}</p>
      <label className="setting-field">File path<SettingsInput aria-label="Candidate file path" value={path} disabled={Boolean(busy) || changedScope || !writable} placeholder="src/example.ts" onChange={(event) => setPath(event.target.value)} /></label>
      <div className="button-row"><button disabled={Boolean(busy) || changedScope || !writable || !path.trim() || files.length >= 20} onClick={() => load(false)}>Load source file</button>
        <button disabled={Boolean(busy) || changedScope || !writable || !path.trim() || files.length >= 20} onClick={() => load(true)}>Add new file</button></div>
      {files.length > 0 && <><label className="setting-field">Proposed file<select aria-label="Proposed candidate file" value={String(fileIndex)} disabled={Boolean(busy)} onChange={(event) => setFileIndex(Number(event.target.value))}>{files.map((file, index) => <option key={file.path} value={String(index)}>{file.path} / {file.baseDigest === "absent" ? "new" : "replace"}</option>)}</select></label>
        {selectedFile && <><p className="fine-print path">Base: <code>{selectedFile.baseDigest}</code></p>
          <label className="setting-field">Proposed content<SettingsTextarea ref={proposalEditor} aria-label="Proposed file text" spellCheck={false} value={selectedFile.text} readOnly={changedScope || !writable} disabled={Boolean(busy)} onChange={(event) => {
            setFiles(files.map((file, index) => index === fileIndex ? { ...file, text: event.target.value } : file)); setPreview(null); setModelOrigin(undefined);
          }} /></label>
          <SettingsAction label="Remove file from proposal" icon="Trash" disabled={Boolean(busy)} onClick={() => { const next = files.filter((_, index) => index !== fileIndex); setFiles(next); setFileIndex(0); setPreview(null); setModelOrigin(undefined); if (!next.length) setDraftScope(null); }} /></>}
      </>}
      <div className="button-row"><button disabled={Boolean(busy) || !writable || changedScope || !dirty || !files.length || !stageId || !summary.trim()} onClick={() => void run("Reviewing staging", async (current) => {
        if (!session) return;
        const value = (await sdk.candidates.preview(session.id, stageId, draft(), typeof modelOrigin === "object" ? modelOrigin : undefined)).preview;
        if (current()) setPreview({ value, scope, sessionId: session.id, stageId });
      })}>Review staging</button>
        <button className="primary" disabled={Boolean(busy) || !writable || changedScope || !preview || preview.scope !== scope} onClick={() => void run("Staging proposal", async (current) => {
          if (!preview) return;
          const captured = preview, created = await sdk.candidates.stage(captured.sessionId, captured.stageId, captured.value.document.patch, captured.value.digest, modelOrigin);
          if (current()) setSelectedId(created.id!);
          const result = await sdk.candidates.wait(created.id!);
          if (!current()) return;
          if (result.candidate.status === "staged") { reset(); setSelectedId(result.candidate.id); setNotice("Staged. Your project files don't change until you apply."); }
          else setError(`Proposal ${result.candidate.status}. ${result.candidate.diagnostic ?? "Check the source and staging folders; nothing was rolled back."}`);
        })} aria-label="Stage reviewed proposal">Stage</button>
        <button disabled={Boolean(busy) || !files.length && !changedScope && !dirty} onClick={reset} aria-label="Discard local proposal">Discard</button></div>
      {preview && preview.scope === scope && <div className="candidate-binding" aria-label="Exact staging preview">
        <p className="fine-print path">{candidateRootLabel(preview.value.document.source)}<br />Source: {preview.value.document.source.root}<br />Staging: {preview.value.document.stage.root}</p>
        {preview.value.warning && <Alert as="p" tone="warning" className="settings-warning">{preview.value.warning}</Alert>}
        <p className="fine-print">{preview.value.document.patch.edits.length} files / base <code>{candidateRootBase(preview.value.document.source).slice(0, 12)}</code>. Staging doesn't apply them to your project.</p>
      </div>}
    </details>
    {selected && <div className="candidate-section" aria-label="Retained candidate outcome">
      <header className="panel-toolbar"><strong>{selected.status === "staged" ? "Proposed, not accepted" : selected.status === "applied" ? "Applied" : `Proposal ${selected.status}`}</strong>
        {active && <button disabled={stopping} onClick={() => { setStopping(true); void sdk.candidates.stop(selected.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop wasn't confirmed.")).finally(() => setStopping(false)); }}>{stopping ? "Requesting stop..." : `Stop ${selected.status === "staging" ? "staging" : "application"}`}</button>}
      </header>
      <p className="fine-print path">{candidateRootLabel(selected.source)}</p>
      {selected.source.env === "Sandbox" && <Alert as="p" tone="warning">Applying changes only the Sandbox workspace copy. To update your local files, publish them from Settings &gt; Sandbox.</Alert>}
      {selected.originSessionId === null && <p className="fine-print">This older proposal has no known chat. Delete it in Artifacts if you no longer need it.</p>}
      <details open={selected.status === "partial"}><summary>{envLabel(selected.source.env)} source and staging folders</summary><p className="fine-print path">Source: {selected.source.root}<br />Staging: {selected.stage.root}<br />Stage: {candidateRootLabel(selected.stage)}</p></details>
      <p className="fine-print">{selected.compoundOrigin ? "Created by a Cascade or Critique workflow; see its test results there." : selected.roleOrigin ? "Created by a model role." : selected.generationId ? "Generated by a model." : artifact?.sources[0]?.actor === "unknown" ? "Imported; author unknown." : ""} {selected.acceptance ? "You accepted it. Nothing was committed or pushed." : "Not accepted yet."}</p>
      {selected.stopRequested && <p className="fine-print">Stop requested. Status: {selected.status}.</p>}
      {selected.diagnostic && <Alert as="p" className={selected.status === "partial" ? "settings-warning" : "inline-error"} role="alert">{selected.diagnostic}</Alert>}
      <p className="fine-print">Staged {selected.stagedPaths.length}/{selected.paths.length} · apply attempts: {selected.attemptedPaths.length} · applied: {selected.appliedPaths.length}</p>
      {selected.status === "partial" && <Alert as="p" tone="warning" className="settings-warning">Some files may already be applied; nothing was rolled back or retried. Check both folders before recovering.</Alert>}
      {document && <details><summary>Proposed files ({document.patch.edits.length})</summary>{document.patch.edits.map((edit) => <div key={edit.path} className="candidate-file-review">
        <strong className="path">{edit.path}</strong><p className="fine-print path">Base: {edit.baseDigest}</p><pre>{edit.text || "(Empty proposed file)"}</pre>
      </div>)}</details>}
      {selected.status === "staged" && <><div className="button-row"><button disabled={Boolean(busy) || !writable} onClick={() => void run("Reviewing changes", async (current) => {
        if (!session) return;
        const preview = (await sdk.candidates.applyPreview(selected.id, session.id)).preview;
        if (current()) setApplication({ value: preview, scope });
      })} aria-label="Review application to original source">Review application</button>
        <button className="primary" disabled={Boolean(busy) || !writable || selected.status !== "staged" || !application || application.scope !== scope || application.value.candidateId !== selected.id || application.value.revision !== selected.revision} onClick={() => void run("Applying files", async (current) => {
          if (!application) return;
          const captured = application.value;
          await sdk.candidates.apply(captured.candidateId, captured.sessionId, captured.revision, captured.digest);
          const result = await sdk.candidates.wait(captured.candidateId);
          if (current()) setNotice(result.candidate.status === "applied" ? "Files applied. Nothing was committed or pushed." : `Apply ${result.candidate.status}. Check the result above.`);
        })}>Apply reviewed files</button>
        <button disabled={Boolean(busy) || selected.status !== "staged"} onClick={() => void run("Rejecting proposal", async () => { await sdk.candidates.reject(selected.id, selected.revision, true); })}>Reject proposal</button>
      </div>
      {application && application.scope === scope && application.value.candidateId === selected.id && application.value.revision === selected.revision && <p className="fine-print path">Files and policy checked just now (<code>{application.value.digest}</code>). Apply writes these files to your project.</p>}</>}
      <button disabled={Boolean(busy) || Boolean(active)} onClick={() => void run("Exporting", async () => {
        const document = (await sdk.artifacts.export(selected.id)).export, saved = await window.moguri.saveDocument(document);
        setNotice(saved ? "Export saved. Your files are unchanged." : "Export cancelled.");
      })} aria-label="Export candidate history">Export</button>
    </div>}
    {!candidates.length && <p className="fine-print">No proposals yet. Staged changes don't touch your project until you apply them.</p>}
    {busy && <p className="fine-print" role="status">{busy}...</p>}
  </section>;
}
