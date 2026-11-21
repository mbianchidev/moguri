import { useEffect, useRef, useState } from "react";
import { envLabel, candidateRootLabel, type CandidateWorkspace, type CandidateWorkspacePreview, type MoguriSdk, type Session } from "../../../packages/sdk/src/index.ts";
import { SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

export function CandidateWorkspacePanel({ sdk, session, scope, writable, onWorkspaces, onDirty }: {
  sdk: MoguriSdk; session?: Session; scope: string; writable: boolean;
  onWorkspaces(value: CandidateWorkspace[]): void; onDirty(value: boolean): void;
}) {
  const [name, setName] = useState(""), [preview, setPreview] = useState<CandidateWorkspacePreview | null>(null);
  const [workspaces, setWorkspaces] = useState<CandidateWorkspace[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), actualScope = useRef(scope); actualScope.current = scope;
  const nativeOrPeer = Boolean(session && session.controls.env !== "Local");
  useEffect(() => { onDirty(Boolean(name) || busy); return () => onDirty(false); }, [name, busy, onDirty]);
  useEffect(() => {
    const token = ++generation.current; setPreview(null); setWorkspaces([]); onWorkspaces([]);
    if (nativeOrPeer && session) void sdk.candidates.workspaces(session.id).then((value) => {
      if (token === generation.current) { setWorkspaces(value.workspaces); onWorkspaces(value.workspaces); }
    }).catch((error: unknown) => { if (token === generation.current) setError(error instanceof Error ? error.message : "Couldn't load staging areas."); });
    return () => { generation.current++; };
  }, [sdk, scope, nativeOrPeer, onWorkspaces]);
  if (!nativeOrPeer || !session) return null;
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    const captured = scope, token = ++generation.current; setBusy(true); setError("");
    try { await operation(() => actualScope.current === captured && generation.current === token); }
    catch (error) { if (actualScope.current === captured) setError(error instanceof Error ? error.message : "The staging action wasn't confirmed. Nothing was retried or deleted."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="candidate-section" aria-label="Owned candidate Env workspaces" aria-busy={busy}>
    <h4>{envLabel(session.controls.env)} staging areas</h4>
    <p className="fine-print">Remote host staging areas are detached Git worktrees on the SSH host; Sandbox staging areas are copies of the private workspace. They're kept when a proposal or chat is deleted.</p>
    {error && <Alert as="p" role="alert">{error}</Alert>}
    <label className="setting-field">Name<SettingsInput aria-label="Candidate workspace name" value={name} disabled={busy || !writable}
      maxLength={120} onChange={(event) => { setName(event.target.value); setPreview(null); }} /></label>
    <div className="button-row"><button disabled={busy || !writable || !name.trim()} onClick={() => void run(async (current) => {
      const value = await sdk.candidates.workspacePreview(session.id, name);
      if (current()) setPreview(value.preview);
    })}>Review workspace creation</button>
      <button className="primary" disabled={busy || !writable || !preview || preview.name !== name} onClick={() => void run(async (current) => {
        if (!preview) return;
        const created = await sdk.candidates.createWorkspace(session.id, preview.name, preview.digest, true);
        const resource = await sdk.candidates.waitWorkspace(created.id!);
        if (!current()) return;
        setPreview(null);
        const value = await sdk.candidates.workspaces(session.id);
        if (!current()) return;
        setWorkspaces(value.workspaces); onWorkspaces(value.workspaces);
        if (resource.status !== "ready") throw new Error(resource.diagnostic ?? "Creation wasn't confirmed. The staging area was left as is.");
        setName("");
      })}>Create reviewed workspace</button>
      <button disabled={busy || !name && !preview} onClick={() => { setName(""); setPreview(null); }}>Discard workspace review</button></div>
    {preview && <div className="candidate-binding"><p className="fine-print path">{candidateRootLabel(preview.source)}<br />Source: {preview.source.root}<br />Created under: {preview.stageParent}<br />Review: {preview.digest}</p><p>{preview.diagnostic}</p></div>}
    {workspaces.map((workspace) => <details key={workspace.id}><summary>{workspace.name} / {envLabel(workspace.boundary.env)} / {workspace.status}</summary>
      <p className="fine-print path">ID: {workspace.id}<br />Source: {workspace.source.root}<br />Stage: {workspace.plannedRoot}{!workspace.stage && " (creation not confirmed)"}</p>
      {workspace.diagnostic && <Alert as="p" role="status">{workspace.diagnostic}</Alert>}
      {workspace.status === "creating" && <button disabled={busy} onClick={() => void run(async () => { await sdk.candidates.stopWorkspace(workspace.id); })}>Stop this workspace creation</button>}
    </details>)}
    {busy && <p role="status">Working... No model is called.</p>}
  </section>;
}
