import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { activeCompound, activeDecision, ArtifactKindSchema, parse, type ArtifactEditorRequest, type ArtifactKind, type ArtifactSourcePreview, type MoguriSdk, type RetainedArtifact, type Session, type Snapshot } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { ArtifactRepositoryCopy } from "./ArtifactRepositoryCopy.tsx";
import { DecisionPanel } from "./DecisionPanel.tsx";
import { Alert } from "./Alert.tsx";
import { usePendingWork } from "./pending-work.ts";

const kinds: ArtifactKind[] = ["plan", "decision", "answer", "research-note", "report"];
const fields = (value: ArtifactEditorRequest) => JSON.stringify({ name: value.name, text: value.text, kind: value.kind, projectId: value.projectId, status: value.status, folderId: value.folderId ?? null, workItemId: value.workItemId ?? null });
const sourceLabel = (artifact: RetainedArtifact) => {
  if (artifact.sources.some((source) => source.boundary?.env === "Remote")) return "Snapshot of a Remote host file you requested.";
  if (artifact.origin === "checkpoint") return "Budget checkpoint record. It doesn't mean a commit succeeded.";
  if (artifact.origin === "question") return artifact.sources.at(-1)?.actor === "user" ? "Your answer to a model's question." : "Automated answer, not from you.";
  return artifact.origin === "manual" ? "Text you entered" : artifact.sources.some((source) => source.actor === "model") ? "Model output" : artifact.sources.some((source) => source.actor === "user") ? "Your message" : "Author unknown";
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
  // Focus moves to an output only after React has rendered it; an animation frame can run before that commit.
  const focusOutput = useRef<"role" | "contract" | null>(null);
  useEffect(() => {
    const target = focusOutput.current === "role" ? roleOutput.current : focusOutput.current === "contract" ? contractOutput.current : null;
    if (!target) return;
    focusOutput.current = null; target.focus(); target.scrollIntoView({ block: "nearest" });
  }, [roleData, roleContract]);
  const generation = useRef(0), sourceSession = useRef(session?.id), dirty = Boolean(draft && fields(draft) !== baseline);
  sourceSession.current = session?.id;
  const current = draft?.id ? snapshot.artifacts.find((artifact) => artifact.id === draft.id) : undefined;
  const candidate = draft?.id ? snapshot.candidates.find((candidate) => candidate.id === draft.id) : undefined;
  const generated = draft?.id ? snapshot.candidateGenerations.find((generation) => generation.id === draft.id) : undefined;
  const sequence = draft?.id ? snapshot.roleSequences.find((sequence) => sequence.id === draft.id) : undefined;
  const compound = draft?.id ? snapshot.compoundWorkflows.find((workflow) => workflow.id === draft.id) : undefined;
  const winddown = draft?.id ? snapshot.winddowns.find((record) => record.id === draft.id) : undefined;
  const decision = draft?.id ? snapshot.decisions.find((record) => record.id === draft.id) : undefined;
  const native = snapshot.sandboxExecutions?.find((value) => value.id === draft?.id), publication = snapshot.sandboxPublications?.find((value) => value.id === draft?.id);
  const immutable = Boolean(candidate || generated || sequence || compound || winddown || decision || native || publication);
  const activeCandidate = decision && activeDecision(decision) || winddown && ["held", "running", "committing"].includes(winddown.status) || compound && activeCompound(compound) || publication?.status === "publishing" || native && (!["owned-guest-stopped", "acknowledged"].includes(native.cleanup) || native.inspectionIntent?.status === "running") ||
    sequence?.status === "running" || generated?.status === "running" || candidate && (["staging", "applying"].includes(candidate.status) || snapshot.jobs.some((job) => job.candidate?.candidateId === candidate.id && ["running", "waiting_input"].includes(job.status)));
  const conflict = Boolean(draft?.id && (!current || current.revision !== draft.revision));
  const documents = snapshot.artifacts.filter((artifact) => showArchived || artifact.status !== "archived" || artifact.id === draft?.id).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // A save or load clears the edit flag only once it settles, so closing in between waits for it (#100).
  usePendingWork(busy);
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
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "That didn't work. Your edit was kept."); }
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
    setNotice("Document saved. Chats, files and policies weren't changed.");
  };
  return <section className="artifact-panel" aria-label="Retained artifacts" aria-busy={busy}
    data-editing-artifact-id={draft?.id ?? (draft ? "new" : "")} data-editing-revision={draft?.revision}>
    <DecisionPanel sdk={sdk} snapshot={snapshot} session={session} selection={decision?.id} />
    <h3>Documents</h3>
    <p className="fine-print">Saved text, separate from chats. Never sent to a model automatically; media isn't copied.</p>
    <div className="panel-toolbar"><label className="setting-field">Document<select aria-label="Retained artifact" value={draft?.id ?? ""} disabled={busy || dirty} onChange={(event) => { const id = event.target.value; if (id) void run(() => load(id)); }}>
      <option value="">Choose a document</option>{documents.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.name} / {artifact.kind} / {artifact.projectId ? snapshot.projects.find((project) => project.id === artifact.projectId)?.name ?? "Former project" : "Profile"}{artifact.folderId ? ` / ${snapshot.projectFolders.find((folder) => folder.id === artifact.folderId)?.name ?? "Former folder"}` : ""}{artifact.workItemId ? ` / #${snapshot.issues.find((issue) => issue.id === artifact.workItemId)?.number ?? "?"}` : ""}{artifact.status === "archived" ? " / archived" : ""}</option>)}
    </select></label><button className="icon-button" aria-label="New artifact" title="New document" disabled={busy || dirty} onClick={fresh}><Icon name="Plus" /></button></div>
    <label className="check-setting"><SettingsInput type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived documents</label>
    {!documents.length && !draft && <p>No documents yet. Create one, or save a chat message below.</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {draft && <>
      {!draft.id ? <><label className="setting-field">Kind<select aria-label="Artifact kind" value={draft.kind} disabled={busy} onChange={(event) => setDraft({ ...draft, kind: parse(ArtifactKindSchema, event.target.value) })}>{kinds.map((kind) => <option key={kind} value={kind}>{kind.replace("-", " ")}</option>)}</select></label>
        <label className="setting-field">Scope<select aria-label="Artifact scope" value={draft.projectId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, projectId: event.target.value || null, sessionId: null, workItemId: null })}><option value="">Profile / no project</option>{draft.projectId && !snapshot.projects.some((project) => project.id === draft.projectId) && <option value={draft.projectId}>Former project / unavailable</option>}{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></> :
        <p className="fine-print">{draft.kind.replace("-", " ")} / {draft.projectId ? snapshot.projects.find((project) => project.id === draft.projectId)?.name ?? "Former project" : "Profile"} / revision {draft.revision}{current?.status === "archived" ? " / archived" : ""}</p>}
      {sequence && <section className="artifact-role-sequence" aria-label="Retained role sequence">
        <p className="fine-print">Sequence {sequence.status}. Read-only record; it doesn't approve code or grant permissions.</p>
        <label className="setting-field">Recorded role<select aria-label="Retained role index" value={roleIndex} disabled={busy} onChange={(event) => { generation.current++; setRoleIndex(event.target.value); setRoleData(null); setRoleContract(null); }}>
          {sequence.steps.map((step, index) => <option key={step.planId} value={index}>{index} / {step.role} / {step.modelId} / {step.state}</option>)}
        </select></label>
        <button disabled={busy} onClick={() => void run(async () => {
          const token = generation.current, value = await sdk.roleSequences.read(sequence.id, Number(roleIndex));
          if (generation.current === token) {
            focusOutput.current = "role"; setRoleData(JSON.stringify(value.step, null, 2));
          }
        })} aria-label="View role from original record">View role</button>
        {roleData !== null && <pre ref={roleOutput} tabIndex={0} aria-label="Recorded role data">{roleData}</pre>}
        {sequence.inputVersion === 2 && <>
          <SettingsHelp label="More about this setting" target={<button disabled={busy} onClick={() => void run(async () => {
            const token = generation.current, value = await sdk.roleSequences.contract(sequence.id, Number(roleIndex));
            if (generation.current === token) {
              focusOutput.current = "contract"; setRoleContract(JSON.stringify(value, null, 2));
            }
          })} aria-label="View contract for original role">View contract</button>} descriptionFirst>Shows whether the role's output passed its declared format and context checks. Passing says nothing about code quality.</SettingsHelp>
          {roleContract !== null && <pre ref={contractOutput} tabIndex={0} aria-label="Role contract evaluation">{roleContract}</pre>}
        </>}
      </section>}
      <label className="setting-field">Name<SettingsInput aria-label="Artifact name" value={draft.name} maxLength={160} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="setting-field">Folder<select aria-label="Artifact folder" value={draft.folderId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}><option value="">No folder</option>{snapshot.projectFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      <label className="setting-field">Work item<select aria-label="Artifact work item" value={draft.workItemId ?? ""} disabled={busy || !draft.projectId} onChange={(event) => setDraft({ ...draft, workItemId: event.target.value || null })}><option value="">No work item</option>{snapshot.issues.filter((issue) => issue.projectId === draft.projectId).map((issue) => <option key={issue.id} value={issue.id}>#{issue.number} {issue.title}{issue.archived ? " / archived" : ""}</option>)}</select></label>
      {current && <p className="fine-print">{native || publication ? "Read-only Sandbox run record. Inspect or publish its files in Settings > Sandbox." : sequence ? "Read-only model role record." : generated ? "Read-only model generation. Stage and apply it in Candidates." : candidate ? candidate.generationId ? "Read-only proposal generated by a model. Review or apply it in Candidates." : "Read-only imported proposal; author unknown. Review or apply it in Candidates." : sourceLabel(current)}{current.edited ? " / edited" : ""}</p>}
      {current?.sources.filter((source) => source.boundary?.env === "Remote").map((source, index) => <p className="fine-print path" key={index}>Remote host source: {source.boundary?.root}/{source.boundary?.path} / {source.boundary?.hostFingerprint} / {source.outcome ?? "unconfirmed"}</p>)}
      <label className="setting-field">Text<SettingsTextarea className="artifact-editor" aria-label="Artifact text" value={draft.text} maxLength={128 * 1024} disabled={busy} readOnly={immutable} spellCheck={false} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label>
      {conflict && <Alert as="p" tone="warning" className="settings-warning">This document changed or was deleted elsewhere. Your edit is kept; reload before saving again.</Alert>}
      <div className="button-row"><button className="primary" disabled={busy || !draft.name.trim() || conflict || Boolean(draft.id) && !dirty} onClick={() => void run(save)}>Save artifact</button>
        {draft.id && <button disabled={busy} onClick={() => void run(() => load(draft.id!))}>Reload saved</button>}
        {(!draft.id || !current) && <button disabled={busy} onClick={() => { setDraft(null); setBaseline(""); }}>Discard local edit</button>}</div>
      {current && <>
        <details><summary>Source details</summary><pre>{JSON.stringify({ origin: current.origin, originSessionId: current.originSessionId, workspaceId: current.workspaceId, path: current.path, sources: current.sources }, null, 2)}</pre></details>
        <div className="button-row"><button disabled={busy || dirty || conflict || Boolean(activeCandidate)} onClick={() => void run(async () => { await sdk.artifacts.update(current.id, { status: current.status === "active" ? "archived" : "active" }, draft.revision); await load(current.id); })} aria-label={current.status === "active" ? "Archive artifact" : "Restore artifact"}>{current.status === "active" ? "Archive" : "Restore"}</button>
          <button disabled={busy || dirty || conflict} onClick={() => void run(async () => { const value = (await sdk.artifacts.export(current.id)).export; const saved = await window.moguri.saveDocument(value); setNotice(saved ? `Export saved to ${saved.path}.` : "Export cancelled."); })}>Export artifact</button></div>
        <details><summary>Revisions</summary><button disabled={busy || nextOffset === null} onClick={() => void run(async () => { const page = await sdk.artifacts.history(current.id, nextOffset ?? 0); setHistory((history) => [...history, ...page.revisions]); setNextOffset(page.nextOffset); })}>Load revisions</button>
          <div className="artifact-history">{history.map((artifact) => <button key={artifact.revision} disabled={busy} onClick={() => void run(async () => { setOldText((await sdk.artifacts.read(current.id, artifact.revision)).text); })}>Revision {artifact.revision} / {artifact.status}</button>)}</div>{oldText !== null && <pre aria-label="Historical artifact text">{oldText || "(Empty document)"}</pre>}</details>
        <details><summary>Delete this document</summary><p className="fine-print">Deletes this document and all its revisions. Your files, chats and other documents aren't affected.</p><label className="check-setting"><SettingsInput type="checkbox" checked={confirmed} disabled={busy || dirty} onChange={(event) => setConfirmed(event.target.checked)} />I want to permanently delete this document.</label>
          <button className="danger" disabled={busy || dirty || conflict || !confirmed || Boolean(activeCandidate)} onClick={() => void run(async () => { await sdk.artifacts.delete(current.id, draft.revision, true); generation.current++; setDraft(null); setBaseline(""); setNotice("Document deleted."); })}>Delete artifact</button></details>
      </>}
      <details><summary>Copy project documents into the repository</summary>
        <label className="setting-field">Project<select aria-label="Artifact repository project" value={repositoryProject} disabled={busy} onChange={(event) => setRepositoryProject(event.target.value)}><option value="">Choose a project</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {repositoryProject && <ArtifactRepositoryCopy sdk={sdk} snapshot={snapshot} projectId={repositoryProject} defaultWorkspaceId={session?.projectId === repositoryProject ? session.workspaceId : null} onBusy={setBusy} />}
      </details>
    </>}
    {session && <details><summary>Save a chat message</summary>
      <label className="setting-field">Message<select aria-label="Artifact source message" value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setSource(null); }}><option value="">Choose a message</option>{session.messages.filter((message) => ["user", "assistant"].includes(message.role) && message.text).map((message) => <option key={message.id} value={message.id}>{message.role === "user" ? "User" : "Model"}: {message.text.slice(0, 70)}</option>)}</select></label>
      <button disabled={busy || !sourceId} onClick={() => void run(async () => { const value = (await sdk.artifacts.source(session.id, "message", sourceId)).preview; if (sourceSession.current !== session.id) throw new Error("The chat changed. Choose a message from the current chat."); setSource({ ...value, sessionId: session.id, sourceId }); })}>Preview message</button>
      {source && <><p className="fine-print">{source.source.actor === "model" ? "Model output. It stays labeled as model-written." : "Your message."} / {source.source.outcome ?? "user input"}</p><pre className="artifact-source-preview">{source.text}</pre>
        <label className="setting-field">Kind<select aria-label="Promoted artifact kind" value={promoteKind} onChange={(event) => setPromoteKind(parse(ArtifactKindSchema, event.target.value))}>{kinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label className="setting-field">Name<SettingsInput aria-label="Promoted artifact name" value={promoteName} maxLength={160} onChange={(event) => setPromoteName(event.target.value)} /></label>
        <button disabled={busy || dirty || !promoteName.trim()} onClick={() => void run(async () => { const created = await sdk.artifacts.promote(source.sessionId, { sourceKind: "message", sourceId: source.sourceId, kind: promoteKind, name: promoteName, expectedDigest: source.digest }); await load(created.id!); setSource(null); })} aria-label="Retain reviewed message">Save</button></>}
    </details>}
  </section>;
}
