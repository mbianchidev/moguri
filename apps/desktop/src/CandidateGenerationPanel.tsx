import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { KUPO_MODEL_ID, type CandidateGenerationInput, type CandidateGenerationPreview, type CandidateGenerationResponse, type MoguriSdk, type Session, type Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

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
      .catch((error: unknown) => { if (readOperation.current === token) setError(error instanceof Error ? error.message : "Couldn't read this generation."); });
    return () => { readOperation.current++; };
  }, [sdk, selectedId, selected?.revision]);
  const run = async (label: string, action: (current: () => boolean) => Promise<void>) => {
    const token = ++operation.current, captured = key; setBusy(label); setError(""); setNotice("");
    try { await action(() => operation.current === token && actualKey.current === captured); }
    catch (error) { if (operation.current === token && actualKey.current === captured) setError(error instanceof Error ? error.message : "Generation wasn't confirmed. Its input and any results are still available."); }
    finally { setBusy(""); }
  };
  return <details className="candidate-section" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Generate a proposal with a model</summary>

    <p className="fine-print">Model: {fixed ? model?.name : "none (choose a specific model, not kupo, in the composer)"}</p>
    <SettingsHelp label="More about this setting" target={<label className="setting-field">Generation task<SettingsTextarea className="generation-task" aria-label="Candidate generation task" maxLength={4096} value={task} disabled={Boolean(busy)} readOnly={!writable || changed}
      onChange={(event) => { setTask(event.target.value); if (taskScope === null) setTaskScope(scope); }} placeholder="Describe the change for the selected files" /></label>} descriptionFirst>Choose files and a staging worktree under Draft a proposal. The model sees the saved files, not your unsaved edits, and its output is never applied automatically.</SettingsHelp>
    {changed && <Alert as="p" tone="warning" className="settings-warning">The chat's project or environment changed. Copy or discard this task first.</Alert>}
    <div className="button-row"><button disabled={Boolean(busy) || !writable || !fixed || changed || !task.trim() || !files.length || !stageId} onClick={() => void run("Reviewing generation", async (current) => {
      if (!session) return;
      const input = { task, files }, value = await sdk.candidates.generatePreview(session.id, stageId, input);
      if (current()) setPreview({ value: value.preview, input, sessionId: session.id, stageId, key });
    })} aria-label="Review model generation">Review</button><button disabled={Boolean(busy) || !task} onClick={() => { setTask(""); setTaskScope(null); setPreview(null); setApproved(false); }} aria-label="Discard generation task">Discard</button></div>
    {preview && preview.key === key && <section className="generation-review" aria-label="Exact model generation review">
      <p className="fine-print">{preview.input.files.length} files · about {preview.value.estimatedInputTokens.toLocaleString()} input tokens · up to {preview.value.maxOutputTokens.toLocaleString()} output tokens</p>
      <Alert as="p" tone="warning" className="settings-warning">{preview.value.warning}</Alert>
      <details><summary>System prompt</summary><pre>{preview.value.systemPrompt}</pre></details>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label="Approve one generation call and proposal retention" checked={approved} disabled={Boolean(busy)} onChange={(event) => setApproved(event.target.checked)} />I approve one model call, which may be billed. Moguri keeps the proposal until I delete it, its chat is deleted or its linked PR merges; no files are written.</label>
      <button className="primary" disabled={Boolean(busy) || !approved || !writable || preview.key !== key} onClick={() => void run("Starting generation", async (current) => {
        const captured = preview, created = await sdk.candidates.generate(captured.sessionId, captured.stageId, captured.input, captured.value.digest, true);
        if (current()) { setSelectedId(created.id!); setTask(""); setTaskScope(null); setPreview(null); setApproved(false); setNotice("Generation started. Your files and staging worktree are unchanged."); }
      })} aria-label="Generate reviewed proposal">Generate</button>
    </section>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    <label className="setting-field">Generation<select aria-label="Retained generation report" value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose a generation</option>{reports.map((record) => <option key={record.id} value={record.id}>{snapshot.artifacts.find((artifact) => artifact.id === record.id)?.name ?? record.id} / {record.status}</option>)}
    </select></label>
    {selected && <section className="generation-outcome" aria-label="Owned generation outcome">
      <header className="panel-toolbar"><strong>{selected.status === "proposed" ? "Generated, not staged or accepted" : `Generation ${selected.status}`}</strong>
        {selected.status === "running" && <button disabled={stopping} onClick={() => { setStopping(true); void sdk.candidates.stopGeneration(selected.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop wasn't confirmed.")).finally(() => setStopping(false)); }} aria-label={stopping ? "Requesting stop..." : "Stop generation"}>{stopping ? "Requesting stop..." : "Stop"}</button>}</header>
      <p className="fine-print path">Model: {selected.modelId} · {usage ? usage.reportedTokens === null ? `usage not reported (${usage.reservedTokens ?? "unknown"} tokens still reserved)` : `${usage.reportedTokens.toLocaleString()} tokens reported` : "no model call yet"}</p>
      <p className="fine-print">Source: {selected.source.branch} / base {selected.source.head.slice(0, 12)}. Model output; review it before use.</p>
      {selected.diagnostic && <Alert as="p" className="settings-warning" role="alert">{selected.diagnostic}</Alert>}
      {loaded && <><details><summary>Input and folders</summary><p className="fine-print path">Source: {loaded.input.source.root}<br />Staging: {loaded.input.stage.root}</p><p>{loaded.input.task}</p><p className="fine-print">{loaded.input.files.map((file) => file.path).join(", ")}</p></details>
        {loaded.proposal && <><details><summary>Generated files ({loaded.proposal.patch.edits.length})</summary>{loaded.proposal.patch.edits.map((edit) => <div className="candidate-file-review" key={edit.path}><strong className="path">{edit.path}</strong><pre>{edit.text || "(Empty proposed file)"}</pre></div>)}</details>
          <button disabled={Boolean(busy) || !writable || draftDirty || !compatible || selected.status !== "proposed"} onClick={() => { try { onLoad(loaded); setNotice("Loaded into the draft for review. Nothing was written."); setExpanded(false); } catch (error) { setError(error instanceof Error ? error.message : "Couldn't load the proposal here."); } }} aria-label={loadedGenerationId === selected.id ? "Loaded for review" : "Load for review generated proposal"}>{loadedGenerationId === selected.id ? "Loaded for review" : "Load for review"}</button>
          {loadedGenerationId === selected.id ? <p className="fine-print">The generated changes are in the draft below. Editing them removes the model attribution.</p> : draftDirty && <p className="fine-print">Copy or discard your unsaved draft first; Moguri won't overwrite it.</p>}
          {!compatible && <p className="fine-print">To load this, use the chat's original Local project and make sure its staging worktree is ready.</p>}
        </>}
        {loaded.text !== null && <details><summary>Raw model output (untrusted)</summary><pre>{loaded.text}</pre></details>}
      </>}
    </section>}
    {!reports.length && <p className="fine-print">No generations yet. Only Generate calls a model.</p>}
    {busy && <p className="fine-print" role="status">{busy}...</p>}
  </details>;
}
