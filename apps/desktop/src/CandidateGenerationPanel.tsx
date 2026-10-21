import { useEffect, useRef, useState } from "react";
import { KUPO_MODEL_ID, type CandidateGenerationInput, type CandidateGenerationPreview, type CandidateGenerationResponse, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";

type Read = Extract<CandidateGenerationResponse, { type: "candidate.generation.read" }>;
export function CandidateGenerationPanel({ sdk, snapshot, session, stageId, files, scope, sourceRoot, writable, draftDirty, loadedGenerationId, onDirty, onLoad }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; stageId: string; files: Array<{ path: string; baseDigest: string }>;
  scope: string; sourceRoot?: string; writable: boolean; draftDirty: boolean; loadedGenerationId?: string; onDirty: (dirty: boolean) => void; onLoad: (value: Read) => void;
}) {
  const [task, setTask] = useState(""), [taskScope, setTaskScope] = useState<string | null>(null), [approved, setApproved] = useState(false);
  const [preview, setPreview] = useState<{ value: CandidateGenerationPreview; input: CandidateGenerationInput; sessionId: string; stageId: string; key: string } | null>(null);
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<{ sdk: MoguriSdk; value: Read } | null>(null);
  const [busy, setBusy] = useState(""), [stopping, setStopping] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const model = snapshot.provider.models.find((model) => model.id === session?.controls.modelId), fixed = Boolean(model && !model.synthetic && model.id !== KUPO_MODEL_ID);
  const key = JSON.stringify([scope, session?.controls.modelId, session?.controls.modelOptions, model, snapshot.settings.revision, stageId, files, task]);
  const actualKey = useRef(key), operation = useRef(0), readOperation = useRef(0); actualKey.current = key;
  const changed = taskScope !== null && taskScope !== scope, selected = snapshot.candidateGenerations.find((generation) => generation.id === selectedId);
  const loaded = read?.sdk === sdk && read.value.generation.id === selectedId ? read.value : null;
  const reports = snapshot.candidateGenerations.filter((generation) => generation.projectId === session?.projectId || generation.id === selectedId).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const usage = snapshot.budgetEntries.find((entry) => entry.turnId === selectedId && entry.role === "draft");
  const compatible = Boolean(loaded && session && loaded.input.source.projectId === session.projectId && loaded.input.source.workspaceId === session.workspaceId &&
    loaded.input.source.root === sourceRoot && snapshot.managedWorkspaces.some((workspace) => workspace.id === loaded.input.stage.workspaceId && workspace.path === loaded.input.stage.root && workspace.status === "ready"));
  useEffect(() => { onDirty(Boolean(task) || Boolean(busy)); return () => onDirty(false); }, [task, busy, onDirty]);
  useEffect(() => { setPreview(null); setApproved(false); }, [key]);
  useEffect(() => {
    const token = ++readOperation.current; setRead(null);
    if (selectedId) void sdk.candidates.generation(selectedId).then((value) => { if (readOperation.current === token) setRead({ sdk, value }); })
      .catch((error: unknown) => { if (readOperation.current === token) setError(error instanceof Error ? error.message : "Generation report is unavailable."); });
    return () => { readOperation.current++; };
  }, [sdk, selectedId, selected?.revision]);
  const run = async (label: string, action: (current: () => boolean) => Promise<void>) => {
    const token = ++operation.current, captured = key; setBusy(label); setError(""); setNotice("");
    try { await action(() => operation.current === token && actualKey.current === captured); }
    catch (error) { if (operation.current === token && actualKey.current === captured) setError(error instanceof Error ? error.message : "Generation was not acknowledged. Input and owned work remain inspectable."); }
    finally { setBusy(""); }
  };
  return <details className="candidate-section" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Generate a separate model proposal</summary>
    <p className="fine-print">Choose source files and a separate staging worktree below. This sends original reviewed source, not unsaved proposed edits. Generation never stages, applies or executes its output.</p>
    <p className="fine-print">Selected fixed model: {fixed ? model?.name : "None / choose an available fixed model in the composer"}. No provider or Env fallback.</p>
    <label className="setting-field">Generation task<textarea className="generation-task" aria-label="Candidate generation task" maxLength={4096} value={task} disabled={Boolean(busy)} readOnly={!writable || changed}
      onChange={(event) => { setTask(event.target.value); if (taskScope === null) setTaskScope(scope); }} placeholder="Describe the change for the selected files" /></label>
    {changed && <p className="settings-warning">The task belongs to an older source scope. Copy it or explicitly discard before reviewing another root.</p>}
    <div className="button-row"><button disabled={Boolean(busy) || !writable || !fixed || changed || !task.trim() || !files.length || !stageId} onClick={() => void run("Reviewing generation", async (current) => {
      if (!session) return;
      const input = { task, files }, value = await sdk.candidates.generatePreview(session.id, stageId, input);
      if (current()) setPreview({ value: value.preview, input, sessionId: session.id, stageId, key });
    })}>Review model generation</button><button disabled={Boolean(busy) || !task} onClick={() => { setTask(""); setTaskScope(null); setPreview(null); setApproved(false); }}>Discard generation task</button></div>
    {preview && preview.key === key && <section className="generation-review" aria-label="Exact model generation review">
      <p className="fine-print">{preview.input.files.length} selected files / {preview.value.estimatedInputTokens.toLocaleString()} estimated input tokens / at most {preview.value.maxOutputTokens.toLocaleString()} output tokens.</p>
      <p className="settings-warning">{preview.value.warning}</p>
      <details><summary>Exact generation system prompt</summary><pre>{preview.value.systemPrompt}</pre></details>
      <label className="check-setting"><input type="checkbox" aria-label="Approve one generation call and independent retention" checked={approved} disabled={Boolean(busy)} onChange={(event) => setApproved(event.target.checked)} />I approve one model call and independent input/result retention. No file write is approved here.</label>
      <button className="primary" disabled={Boolean(busy) || !approved || !writable || preview.key !== key} onClick={() => void run("Starting owned generation", async (current) => {
        const captured = preview, created = await sdk.candidates.generate(captured.sessionId, captured.stageId, captured.input, captured.value.digest, true);
        if (current()) { setSelectedId(created.id!); setTask(""); setTaskScope(null); setPreview(null); setApproved(false); setNotice("Owned generation started. Its report survives this panel; source and staging remain unchanged."); }
      })}>Generate reviewed proposal</button>
    </section>}
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
    <label className="setting-field">Generation report<select aria-label="Retained generation report" value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose an independent generation</option>{reports.map((record) => <option key={record.id} value={record.id}>{snapshot.artifacts.find((artifact) => artifact.id === record.id)?.name ?? record.id} / {record.status}</option>)}
    </select></label>
    {selected && <section className="generation-outcome" aria-label="Owned generation outcome">
      <header className="panel-toolbar"><strong>{selected.status === "proposed" ? "Generated, not staged or accepted" : `Generation ${selected.status}`}</strong>
        {selected.status === "running" && <button disabled={stopping} onClick={() => { setStopping(true); void sdk.candidates.stopGeneration(selected.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Generation stop was not confirmed.")).finally(() => setStopping(false)); }}>{stopping ? "Requesting stop..." : "Stop generation"}</button>}</header>
      <p className="fine-print path">Actual model: {selected.modelId}. {usage ? usage.reportedTokens === null ? `Usage unreported; ${usage.reservedTokens ?? "unknown"} reserved tokens remain held.` : `${usage.reportedTokens.toLocaleString()} reported tokens.` : "No admitted model step is recorded yet."} No provider bill was inferred.</p>
      <p className="fine-print">Source: {selected.source.branch} / base {selected.source.head.slice(0, 12)}. Generation is untrusted model output, not a user answer, file approval or quality claim.</p>
      {selected.diagnostic && <p className="settings-warning" role="alert">{selected.diagnostic}</p>}
      {loaded && <><details><summary>Captured generation input and roots</summary><p className="fine-print path">Local source: {loaded.input.source.root}<br />Owned stage: {loaded.input.stage.root}</p><p>{loaded.input.task}</p><p className="fine-print">{loaded.input.files.map((file) => file.path).join(", ")}</p></details>
        {loaded.proposal && <><details><summary>Exact generated files ({loaded.proposal.patch.edits.length})</summary>{loaded.proposal.patch.edits.map((edit) => <div className="candidate-file-review" key={edit.path}><strong className="path">{edit.path}</strong><pre>{edit.text || "(Empty proposed file)"}</pre></div>)}</details>
          <button disabled={Boolean(busy) || !writable || draftDirty || !compatible || selected.status !== "proposed"} onClick={() => { try { onLoad(loaded); setNotice("Loaded locally for a separate exact staging review. Nothing was written or accepted."); setExpanded(false); } catch (error) { setError(error instanceof Error ? error.message : "Proposal was not loaded into this scope."); } }}>{loadedGenerationId === selected.id ? "Loaded for staging review" : "Load generated proposal for staging review"}</button>
          {loadedGenerationId === selected.id ? <p className="fine-print">Generated bytes are in the draft below. Review staging, then source application separately. Editing the bytes clears verified model attribution.</p> : draftDirty && <p className="fine-print">Copy or discard your unsaved draft before loading generated bytes; they are never silently replaced.</p>}
          {!compatible && <p className="fine-print">Select the original compatible Local source and ready captured staging worktree to load this proposal. The service rechecks current bases before staging.</p>}
        </>}
        {loaded.text !== null && <details><summary>Raw model output (untrusted)</summary><pre>{loaded.text}</pre></details>}
      </>}
    </section>}
    {!reports.length && <p className="fine-print">No retained generations yet. Review selected source/model data first; saving settings or selecting a report never calls a model.</p>}
    {busy && <p className="fine-print" role="status">{busy}...</p>}
  </details>;
}
