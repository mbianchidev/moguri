import { SettingsHelp } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { CandidateRoleProposalRead, MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function CandidateRoleProposalPanel({ sdk, snapshot, session, scope, sourceRoot, writable, draftDirty, loadedSequenceId, onLoad }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; scope: string; sourceRoot?: string; writable: boolean; draftDirty: boolean;
  loadedSequenceId?: string; onLoad: (proposal: CandidateRoleProposalRead) => void;
}) {
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<{ sdk: MoguriSdk; scope: string; value: CandidateRoleProposalRead } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [expanded, setExpanded] = useState(false);
  const operation = useRef(0), actualScope = useRef(scope); actualScope.current = scope;
  const reports = snapshot.roleSequences.filter((record) => {
    const role = record.steps.findLast((step) => step.state === "recorded")?.role;
    return record.status === "completed" && (record.projectId === session?.projectId || record.id === selectedId) &&
      (role === "draft" || role === "revision" || role === "escalation");
  }).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = snapshot.roleSequences.find((record) => record.id === selectedId);
  const loaded = read?.sdk === sdk && read.scope === scope && read.value.document.roleOrigin.sequenceId === selectedId ? read.value : null;
  const compatible = loaded && session && loaded.document.source.projectId === session.projectId && loaded.document.source.workspaceId === session.workspaceId &&
    loaded.document.source.root === sourceRoot && snapshot.managedWorkspaces.some((workspace) => workspace.id === loaded.document.stage.workspaceId && workspace.path === loaded.document.stage.root && workspace.status === "ready");
  useEffect(() => {
    const token = ++operation.current; setRead(null); setError(""); setBusy(Boolean(selectedId));
    if (selectedId) void sdk.candidates.roleProposal(selectedId).then((value) => {
      if (operation.current === token && actualScope.current === scope) setRead({ sdk, scope, value });
    }).catch((error: unknown) => {
      if (operation.current === token && actualScope.current === scope) setError(error instanceof Error ? error.message : "This sequence has no usable code proposal.");
    }).finally(() => { if (operation.current === token) setBusy(false); });
    return () => { operation.current++; };
  }, [sdk, selectedId, selected?.revision, scope]);
  if (!reports.length && !selectedId) return null;
  return <details className="candidate-section" open={expanded} aria-busy={busy} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Load a proposal from a model role</summary>
    <SettingsHelp label="More about this setting" target={<label className="setting-field">Role sequence<select aria-label="Retained role proposal" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose a completed sequence</option>{reports.map((record) => <option key={record.id} value={record.id}>{snapshot.artifacts.find((artifact) => artifact.id === record.id)?.name ?? record.id}</option>)}
    </select></label>} descriptionFirst>Shows the last draft, revision or escalation from a finished role sequence. Nothing runs here.</SettingsHelp>
    {busy && <p className="fine-print" role="status">Loading proposal...</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {loaded && <>
      <p className="fine-print path">Model: {loaded.document.roleOrigin.modelId} / {loaded.document.roleOrigin.role} / step {loaded.document.roleOrigin.stepId}</p>

      <SettingsHelp label="More about this setting" target={<details><summary>Proposed files ({loaded.document.patch.edits.length})</summary>{loaded.document.patch.edits.map((edit) => <div key={edit.path} className="candidate-file-review">
        <strong className="path">{edit.path}</strong><pre>{edit.text || "(Empty proposed file)"}</pre>
      </div>)}</details>} descriptionFirst>Editing removes the model attribution. Applying to your project is still a separate step.</SettingsHelp>
      <button disabled={busy || !writable || draftDirty || !compatible} onClick={() => {
        try { onLoad(loaded); setExpanded(false); }
        catch (error) { setError(error instanceof Error ? error.message : "Couldn't load the proposal here."); }
      }} aria-label={loadedSequenceId === selectedId ? "Loaded for review" : "Load for review final-role proposal"}>{loadedSequenceId === selectedId ? "Loaded for review" : "Load for review"}</button>
      {draftDirty && <p className="fine-print">Copy or discard your unsaved draft or task first; Moguri won't overwrite it.</p>}
      {!compatible && <p className="fine-print">To load this, use the original Local project and make sure its staging worktree is ready.</p>}
    </>}
  </details>;
}
