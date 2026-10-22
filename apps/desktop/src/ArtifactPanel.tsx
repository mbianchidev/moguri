import { useEffect, useRef, useState } from "react";
import { ArtifactKindSchema, parse, type ArtifactEditorRequest, type ArtifactKind, type ArtifactSourcePreview, type MoguriSdk, type RetainedArtifact, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { ArtifactRepositoryCopy } from "./ArtifactRepositoryCopy.tsx";

const kinds: ArtifactKind[] = ["plan", "decision", "answer", "research-note", "report"];
const fields = (value: ArtifactEditorRequest) => JSON.stringify({ name: value.name, text: value.text, kind: value.kind, projectId: value.projectId, status: value.status, folderId: value.folderId ?? null, workItemId: value.workItemId ?? null });
const sourceLabel = (artifact: RetainedArtifact) => {
  if (artifact.sources.some((source) => source.boundary?.env === "Remote")) return "User-requested Remote file snapshot, not a chat answer or permission.";
  if (artifact.origin === "checkpoint") return "Deterministic budget checkpoint. No model answer or successful Git commit is implied.";
  if (artifact.origin === "question") return artifact.sources.at(-1)?.actor === "user" ? "Actual user answer; the model question is context, not permission." : "Automated answer, not a human instruction.";
  return artifact.origin === "manual" ? "User-entered text, not verified authorship" : artifact.sources.some((source) => source.actor === "model") ? "Model output, not a human answer" : artifact.sources.some((source) => source.actor === "user") ? "Canonical user message" : "Source authorship unknown";
};
export function ArtifactPanel({ sdk, snapshot, session, projectId, request, onDirty, onRequestHandled }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; projectId: string | null; request: ArtifactEditorRequest | null; onDirty: (dirty: boolean) => void; onRequestHandled: () => void;
}) {
  const [draft, setDraft] = useState<ArtifactEditorRequest | null>(null), [baseline, setBaseline] = useState("");
  const [showArchived, setShowArchived] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false), [history, setHistory] = useState<RetainedArtifact[]>([]), [nextOffset, setNextOffset] = useState<number | null>(0), [oldText, setOldText] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(""), [source, setSource] = useState<(ArtifactSourcePreview & { sessionId: string; sourceId: string }) | null>(null);
  const [promoteName, setPromoteName] = useState("Retained answer"), [promoteKind, setPromoteKind] = useState<ArtifactKind>("answer");
  const [repositoryProject, setRepositoryProject] = useState(projectId ?? "");
  const [roleIndex, setRoleIndex] = useState("0"), [roleData, setRoleData] = useState<string | null>(null), [roleContract, setRoleContract] = useState<string | null>(null);
  const roleOutput = useRef<HTMLPreElement>(null);
  const contractOutput = useRef<HTMLPreElement>(null);
  const generation = useRef(0), sourceSession = useRef(session?.id), dirty = Boolean(draft && fields(draft) !== baseline);
  sourceSession.current = session?.id;
  const current = draft?.id ? snapshot.artifacts.find((artifact) => artifact.id === draft.id) : undefined;
  const candidate = draft?.id ? snapshot.candidates.find((candidate) => candidate.id === draft.id) : undefined;
  const generated = draft?.id ? snapshot.candidateGenerations.find((generation) => generation.id === draft.id) : undefined;
  const sequence = draft?.id ? snapshot.roleSequences.find((sequence) => sequence.id === draft.id) : undefined;
  const native = snapshot.sandboxExecutions?.find((value) => value.id === draft?.id), publication = snapshot.sandboxPublications?.find((value) => value.id === draft?.id);
  const immutable = Boolean(candidate || generated || sequence || native || publication);
  const activeCandidate = publication?.status === "publishing" || native && (!["owned-guest-stopped", "acknowledged"].includes(native.cleanup) || native.inspectionIntent?.status === "running") ||
    sequence?.status === "running" || generated?.status === "running" || candidate && (["staging", "applying"].includes(candidate.status) || snapshot.jobs.some((job) => job.candidate?.candidateId === candidate.id && ["running", "waiting_input"].includes(job.status)));
  const conflict = Boolean(draft?.id && (!current || current.revision !== draft.revision));
  const documents = snapshot.artifacts.filter((artifact) => showArchived || artifact.status !== "archived" || artifact.id === draft?.id).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const accept = (value: ArtifactEditorRequest) => {
    setDraft(value); setBaseline(fields(value)); setConfirmed(false); setHistory([]); setNextOffset(0); setOldText(null); setRoleIndex("0"); setRoleData(null); setRoleContract(null);
  };
  useEffect(() => {
    if (!request) return;
    generation.current++; accept(request); setError(""); setNotice(""); onRequestHandled();
  }, [request]);
  useEffect(() => { setSource(null); setSourceId(""); }, [session?.id]);
  useEffect(() => { setRepositoryProject(projectId ?? ""); }, [projectId]);
  const run = async (operation: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Artifact work failed. Your edit is preserved."); }
    finally { setBusy(false); }
  };
  const load = async (id: string) => {
    const token = ++generation.current, value = await sdk.artifacts.read(id);
    if (generation.current === token) accept({ ...value.artifact, text: value.text, sessionId: value.artifact.originSessionId });
  };
  const fresh = () => {
    generation.current++; accept({ id: null, revision: 0, kind: "research-note", name: "", text: "", projectId, sessionId: session?.projectId === projectId ? session.id : null, status: "active" });
    setError(""); setNotice("");
  };
  const save = async () => {
    if (!draft) return;
    if (draft.id) { await sdk.artifacts.update(draft.id, { name: draft.name, ...(!immutable ? { text: draft.text } : {}), folderId: draft.folderId ?? null, workItemId: draft.workItemId ?? null }, draft.revision); await load(draft.id); }
    else {
      const origin = snapshot.sessions.some((session) => session.id === draft.sessionId && session.projectId === draft.projectId) ? draft.sessionId : null;
      const created = await sdk.artifacts.create(origin, { kind: draft.kind, name: draft.name, text: draft.text, projectId: draft.projectId, folderId: draft.folderId ?? null, workItemId: draft.workItemId ?? null });
      await load(created.id!);
    }
    setNotice("Retained independently. No conversation, source file or policy was changed.");
  };
  return <section className="artifact-panel" aria-label="Retained artifacts" aria-busy={busy}>
    <p className="fine-print">Retained text, independent of sessions. Never automatic instructions or model context; media is not copied.</p>
    <div className="panel-toolbar"><label className="setting-field">Document<select aria-label="Retained artifact" value={draft?.id ?? ""} disabled={busy || dirty} onChange={(event) => { const id = event.target.value; if (id) void run(() => load(id)); }}>
      <option value="">Choose a retained document</option>{documents.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.name} / {artifact.kind} / {artifact.projectId ? snapshot.projects.find((project) => project.id === artifact.projectId)?.name ?? "Former project" : "Profile"}{artifact.folderId ? ` / ${snapshot.projectFolders.find((folder) => folder.id === artifact.folderId)?.name ?? "Former folder"}` : ""}{artifact.workItemId ? ` / #${snapshot.issues.find((issue) => issue.id === artifact.workItemId)?.number ?? "?"}` : ""}{artifact.status === "archived" ? " / archived" : ""}</option>)}
    </select></label><button className="icon-button" aria-label="New artifact" title="New retained document" disabled={busy || dirty} onClick={fresh}><Icon name="Plus" /></button></div>
    <label className="check-setting"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived documents</label>
    {!documents.length && !draft && <p>No retained documents yet. Create one here or retain a completed message below.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
    {draft && <>
      {!draft.id ? <><label className="setting-field">Kind<select aria-label="Artifact kind" value={draft.kind} disabled={busy} onChange={(event) => setDraft({ ...draft, kind: parse(ArtifactKindSchema, event.target.value) })}>{kinds.map((kind) => <option key={kind} value={kind}>{kind.replace("-", " ")}</option>)}</select></label>
        <label className="setting-field">Scope<select aria-label="Artifact scope" value={draft.projectId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, projectId: event.target.value || null, sessionId: null, workItemId: null })}><option value="">Profile / no project</option>{draft.projectId && !snapshot.projects.some((project) => project.id === draft.projectId) && <option value={draft.projectId}>Former project / unavailable</option>}{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></> :
        <p className="fine-print">{draft.kind.replace("-", " ")} / {draft.projectId ? snapshot.projects.find((project) => project.id === draft.projectId)?.name ?? "Former project" : "Profile"} / revision {draft.revision}{current?.status === "archived" ? " / archived" : ""}</p>}
      {sequence && <section className="artifact-role-sequence" aria-label="Retained role sequence">
        <p className="fine-print">Sequence {sequence.status}. Recorded data only, not a code approval or permission.</p>
        <label className="setting-field">Recorded role<select aria-label="Retained role index" value={roleIndex} disabled={busy} onChange={(event) => { generation.current++; setRoleIndex(event.target.value); setRoleData(null); setRoleContract(null); }}>
          {sequence.steps.map((step, index) => <option key={step.planId} value={index}>{index} / {step.role} / {step.modelId} / {step.state}</option>)}
        </select></label>
        <button disabled={busy} onClick={() => void run(async () => {
          const token = generation.current, value = await sdk.roleSequences.read(sequence.id, Number(roleIndex));
          if (generation.current === token) {
            setRoleData(JSON.stringify(value.step, null, 2));
            requestAnimationFrame(() => { roleOutput.current?.focus(); roleOutput.current?.scrollIntoView({ block: "nearest" }); });
          }
        })}>Inspect recorded role</button>
        {roleData !== null && <pre ref={roleOutput} tabIndex={0} aria-label="Recorded role data">{roleData}</pre>}
        {sequence.inputVersion === 2 && <><p className="fine-print">Original declared output and context checks only. Valid is not code quality, independent lineage or acceptance.</p>
          <button disabled={busy} onClick={() => void run(async () => {
            const token = generation.current, value = await sdk.roleSequences.contract(sequence.id, Number(roleIndex));
            if (generation.current === token) {
              setRoleContract(JSON.stringify(value, null, 2));
              requestAnimationFrame(() => { contractOutput.current?.focus(); contractOutput.current?.scrollIntoView({ block: "nearest" }); });
            }
          })}>Inspect role contract</button>
          {roleContract !== null && <pre ref={contractOutput} tabIndex={0} aria-label="Role contract evaluation">{roleContract}</pre>}
        </>}
      </section>}
      <label className="setting-field">Name<input aria-label="Artifact name" value={draft.name} maxLength={160} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="setting-field">Folder<select aria-label="Artifact folder" value={draft.folderId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}><option value="">No folder</option>{snapshot.projectFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <label className="setting-field">Work item<select aria-label="Artifact work item" value={draft.workItemId ?? ""} disabled={busy || !draft.projectId} onChange={(event) => setDraft({ ...draft, workItemId: event.target.value || null })}><option value="">No work item</option>{snapshot.issues.filter((issue) => issue.projectId === draft.projectId).map((issue) => <option key={issue.id} value={issue.id}>#{issue.number} {issue.title}{issue.archived ? " / archived" : ""}</option>)}</select></label>
      {current && <p className="fine-print">{native || publication ? "Immutable native input/result, original owner and actual source-publication acceptance. Use Sandbox to inspect exact outputs; metadata edits cannot rewrite provenance or authorize source copying." : sequence ? "Immutable role input and actual model observations. Protocol completion is not a user answer, code-quality proof or approval." : generated ? "Immutable generation input/result. Actual model provenance is retained; staging and application require separate reviews." : candidate ? candidate.generationId ? "Derived from a canonical model proposal. Immutable bytes, model provenance and actual user acceptance stay separate." : "Imported proposal with unverified authorship. Its immutable bytes and actual acceptance are separate; use Candidates to review/apply." : sourceLabel(current)}{current.edited ? " / explicitly edited" : ""}</p>}
      {current?.sources.filter((source) => source.boundary?.env === "Remote").map((source, index) => <p className="fine-print path" key={index}>Remote source: {source.boundary?.root}/{source.boundary?.path} / {source.boundary?.hostFingerprint} / {source.outcome ?? "unconfirmed"}</p>)}
      <label className="setting-field">Text<textarea className="artifact-editor" aria-label="Artifact text" value={draft.text} maxLength={128 * 1024} disabled={busy} readOnly={immutable} spellCheck={false} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label>
      {conflict && <p className="settings-warning">This document changed or was deleted elsewhere. Your edit is preserved. Reload committed values before another save.</p>}
      <div className="button-row"><button className="primary" disabled={busy || !draft.name.trim() || conflict || Boolean(draft.id) && !dirty} onClick={() => void run(save)}>Save artifact</button>
        {draft.id && <button disabled={busy} onClick={() => void run(() => load(draft.id!))}>Reload committed</button>}
        {(!draft.id || !current) && <button disabled={busy} onClick={() => { setDraft(null); setBaseline(""); }}>Discard local edit</button>}</div>
      {current && <>
        <details><summary>Source provenance</summary><pre>{JSON.stringify({ origin: current.origin, originSessionId: current.originSessionId, workspaceId: current.workspaceId, path: current.path, sources: current.sources }, null, 2)}</pre></details>
        <div className="button-row"><button disabled={busy || dirty || conflict || Boolean(activeCandidate)} onClick={() => void run(async () => { await sdk.artifacts.update(current.id, { status: current.status === "active" ? "archived" : "active" }, draft.revision); await load(current.id); })}>{current.status === "active" ? "Archive artifact" : "Restore artifact"}</button>
          <button disabled={busy || dirty || conflict} onClick={() => void run(async () => { const value = (await sdk.artifacts.export(current.id)).export; const saved = await window.moguri.saveDocument(value); setNotice(saved ? `Export saved to ${saved.path}. Stored copies are unchanged.` : "Export cancelled. Stored copies are unchanged."); })}>Export artifact</button></div>
        <details><summary>Content revisions</summary><button disabled={busy || nextOffset === null} onClick={() => void run(async () => { const page = await sdk.artifacts.history(current.id, nextOffset ?? 0); setHistory((history) => [...history, ...page.revisions]); setNextOffset(page.nextOffset); })}>Load revisions</button>
          <div className="artifact-history">{history.map((artifact) => <button key={artifact.revision} disabled={busy} onClick={() => void run(async () => { setOldText((await sdk.artifacts.read(current.id, artifact.revision)).text); })}>Revision {artifact.revision} / {artifact.status}</button>)}</div>{oldText !== null && <pre aria-label="Historical artifact text">{oldText || "(Empty document)"}</pre>}</details>
        <details><summary>Delete this retained copy</summary><p className="fine-print">Deletes this artifact and its revisions, not source files, conversations or other retained copies.</p><label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy || dirty} onChange={(event) => setConfirmed(event.target.checked)} />Delete this artifact's grants.</label>
          <button className="danger" disabled={busy || dirty || conflict || !confirmed || Boolean(activeCandidate)} onClick={() => void run(async () => { await sdk.artifacts.delete(current.id, draft.revision, true); generation.current++; setDraft(null); setBaseline(""); setNotice("Selected retained artifact deleted. Other copies were preserved."); })}>Delete artifact</button></details>
      </>}
      <details><summary>Repository copy of project artifacts</summary>
        <label className="setting-field">Project<select aria-label="Artifact repository project" value={repositoryProject} disabled={busy} onChange={(event) => setRepositoryProject(event.target.value)}><option value="">Choose a project explicitly</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {repositoryProject && <ArtifactRepositoryCopy sdk={sdk} snapshot={snapshot} projectId={repositoryProject} defaultWorkspaceId={session?.projectId === repositoryProject ? session.workspaceId : null} onBusy={setBusy} />}
      </details>
    </>}
    {session && <details><summary>Retain a completed message</summary>
      <label className="setting-field">Message<select aria-label="Artifact source message" value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setSource(null); }}><option value="">Choose a user or model message</option>{session.messages.filter((message) => ["user", "assistant"].includes(message.role) && message.text).map((message) => <option key={message.id} value={message.id}>{message.role === "user" ? "User" : "Model"}: {message.text.slice(0, 70)}</option>)}</select></label>
      <button disabled={busy || !sourceId} onClick={() => void run(async () => { const value = (await sdk.artifacts.source(session.id, "message", sourceId)).preview; if (sourceSession.current !== session.id) throw new Error("The source session changed. Review a message from the current session."); setSource({ ...value, sessionId: session.id, sourceId }); })}>Review exact source</button>
      {source && <><p className="fine-print">{source.source.actor === "model" ? "Model output. Retaining this does not label it as a human answer." : "Canonical user message."} / {source.source.outcome ?? "user input"}</p><pre className="artifact-source-preview">{source.text}</pre>
        <label className="setting-field">Kind<select aria-label="Promoted artifact kind" value={promoteKind} onChange={(event) => setPromoteKind(parse(ArtifactKindSchema, event.target.value))}>{kinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label className="setting-field">Name<input aria-label="Promoted artifact name" value={promoteName} maxLength={160} onChange={(event) => setPromoteName(event.target.value)} /></label>
        <button disabled={busy || dirty || !promoteName.trim()} onClick={() => void run(async () => { const created = await sdk.artifacts.promote(source.sessionId, { sourceKind: "message", sourceId: source.sourceId, kind: promoteKind, name: promoteName, expectedDigest: source.digest }); await load(created.id!); setSource(null); })}>Retain reviewed message</button></>}
    </details>}
  </section>;
}
