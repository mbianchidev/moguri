import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot, WinddownResponse } from "../../../packages/sdk/src/index.ts";
import { envLabel, isLocalCandidateRecord } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

type Read = Extract<WinddownResponse, { type: "winddown.read" }>;
type Preview = Extract<WinddownResponse, { type: "winddown.commit.preview" }>["preview"];
type SourcePreview = Extract<WinddownResponse, { type: "winddown.source.preview" }>["preview"];
type Inspection = Extract<WinddownResponse, { type: "winddown.commit.inspect" }>["inspection"];
export function WinddownPanel({ sdk, snapshot, session, onDirty }: { sdk: MoguriSdk; snapshot: Snapshot; session?: Session; onDirty: (dirty: boolean) => void }) {
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<Read | null>(null), [candidateIds, setCandidates] = useState<string[]>([]);
  const [branch, setBranch] = useState(""), [message, setMessage] = useState("chore: checkpoint explicitly accepted work");
  const [nativeIds, setNativeIds] = useState<string[]>([]), [sourcePaths, setSourcePaths] = useState("");
  const [sourcePreview, setSourcePreview] = useState<{ value: SourcePreview; scope: string } | null>(null), [sourceReviewed, setSourceReviewed] = useState(false);
  const [preview, setPreview] = useState<{ value: Preview; scope: string } | null>(null), [reviewed, setReviewed] = useState(false), [baseline, setBaseline] = useState("");
  const [inspection, setInspection] = useState<{ value: Inspection; scope: string } | null>(null), [inspectionReviewed, setInspectionReviewed] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), generation = useRef(0), outcome = useRef<HTMLHeadingElement>(null), focusOutcome = useRef(false);
  const records = [...snapshot.winddowns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const record = records.find((record) => record.id === selectedId) ?? (!selectedId ? records.find((record) => record.sessionId === session?.id) : undefined);
  const value = record && read?.winddown.id === record.id && read.winddown.revision === record.revision ? read : null;
  const ownSource = session && record && session.id === record.sessionId && session.projectId === record.projectId && session.workspaceId === record.workspaceId &&
    session.controls.env === record.env && session.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only" && session.status !== "archived" &&
    !session.turnId && snapshot.policy.allowedEnvs.includes(record.env) && (record.env !== "Sandbox" || snapshot.policy.allowedEnvs.includes("Local"));
  const remote = record?.version === 3 && record.env === "Remote";
  const native = record?.version === 3 && record.env === "Sandbox";
  const acceptedRemote = record?.version !== 1 && record?.remoteAcceptance;
  const publications = native ? snapshot.sandboxPublications?.filter((publication) => publication.status === "completed" &&
    publication.acceptance.actor === "user" && publication.sourceSessionId === record.sessionId && publication.executionId === record.transport?.executionId) ?? [] : [];
  const candidates = snapshot.candidates.filter(isLocalCandidateRecord).filter((candidate) => candidate.status === "applied" && candidate.acceptance?.actor === "user" &&
    candidate.projectId === record?.projectId && candidate.source.workspaceId === record?.workspaceId && candidate.source.root === record?.source?.root);
  const fields = JSON.stringify([candidateIds, nativeIds, sourcePaths, branch, message]);
  const dirty = (candidateIds.length > 0 || nativeIds.length > 0 || sourcePaths.length > 0 || branch.length > 0 || message !== "chore: checkpoint explicitly accepted work") && fields !== baseline;
  const scope = JSON.stringify([sdk.profileId, session?.id, session?.controls.env, session?.workspaceId, session?.mode, session?.pendingMode,
    record?.id, record?.revision, fields, snapshot.policy.revision, snapshot.settings.permissionRevision,
    snapshot.projectConfigurations.find((configuration) => configuration.projectId === record?.projectId)?.revision]);
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => { onDirty(dirty || Boolean(busy)); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { setPreview(null); setReviewed(false); setSourcePreview(null); setSourceReviewed(false); setInspection(null); setInspectionReviewed(false); }, [scope]);
  useEffect(() => {
    const token = ++generation.current;
    if (!record) { setRead(null); return; }
    void sdk.winddown.read(record.id).then((value) => { if (generation.current === token) setRead(value); })
      .catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "Couldn't read this checkpoint."); });
    return () => { generation.current++; };
  }, [sdk, record?.id, record?.revision]);
  useEffect(() => {
    if (record && focusOutcome.current && ["completed", "failed", "partial"].includes(record.status)) {
      focusOutcome.current = false; outcome.current?.focus(); outcome.current?.scrollIntoView({ block: "nearest" });
    }
  }, [record?.status]);
  const run = async (name: string, operation: (current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = scope; setBusy(name); setError(""); setNotice("");
    try { await operation(() => currentScope.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "The checkpoint action wasn't confirmed. Your input, accepted changes and Git index/HEAD were kept."); }
    finally { pending.current = false; setBusy(""); }
  };
  return <section className="candidate-section" aria-label="Budget wind-down checkpoints" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h3>Budget wind-down checkpoints</h3>}>When a capped budget runs low, Moguri stops and runs one short finishing step from reserved budget; it sees only usage totals, not your code. You can then commit changes you already accepted to a new branch; nothing is pushed or merged.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" role="status" className="fine-print">{notice}</Alert>}{busy && <p role="status">{busy}</p>}
    <label className="setting-field">Checkpoint<select aria-label="Retained budget checkpoint" value={record?.id ?? ""} disabled={Boolean(busy) || dirty} onChange={(event) => setSelectedId(event.target.value)}>
      {!records.length && <option value="">No checkpoints yet</option>}{records.map((record) => <option key={record.id} value={record.id}>{snapshot.artifacts.find((artifact) => artifact.id === record.id)?.name ?? record.id} / {record.status}</option>)}</select></label>
    {value && <>
      <h4 ref={outcome} tabIndex={-1}>Checkpoint {value.winddown.status}</h4>
      <p className="fine-print">Finishing model: {value.winddown.step.modelId} · Env: {envLabel(value.winddown.env)} · step: {value.winddown.step.state} · turn: {value.winddown.turnId}</p>
      {value.winddown.version !== 1 && value.winddown.transport && <p className="fine-print path">Run: {value.winddown.transport.executionId}<br />Worker: {value.winddown.transport.workerDigest}</p>}
      {value.winddown.diagnostic && <Alert as="p" className="settings-warning" role="alert">{value.winddown.diagnostic}</Alert>}
      <details><summary>Model input and output</summary>{value.roleInput && <pre>{value.roleInput}</pre>}{value.result && <pre>{value.result}</pre>}<p className="fine-print">Model output. It can't answer for you, validate work or approve Git.</p></details>
      {["held", "running", "committing"].includes(value.winddown.status) && <button disabled={Boolean(busy)} onClick={() => void run("Stopping checkpoint", async () => { await sdk.winddown.stop(value.winddown.id); })} aria-label="Stop this checkpoint owner">Stop</button>}
      {value.winddown.commit && <><p className="fine-print path">Branch: {value.winddown.commit.branch} / base {value.winddown.commit.base}<br />Prepared commit: {value.winddown.commit.preparedCommit ?? "not recorded"}<br />Published commit: {value.winddown.commit.publishedCommit ?? "not confirmed"}</p>
        <p className="fine-print">Publish attempted: {String(value.winddown.commit.publicationAttempted)} · cancel requested: {String(value.winddown.commit.cancelRequested)}. A partial job is never retried or rolled back.</p></>}
      {value.winddown.version === 3 && value.winddown.commit?.publicationAttempted && ["partial", "completed"].includes(value.winddown.status) && <>
        {value.winddown.commit.inspection ? <p className="fine-print path">You inspected the result ({value.winddown.commit.inspection.reviewDigest}). The job's status and charges are unchanged.</p> : value.winddown.status === "partial" &&
          <Alert as="p" tone="warning" className="settings-warning">This interrupted commit is on hold. Inspect what it changed, then acknowledge; that doesn't finish or retry it.</Alert>}
        {value.commitInspection && <details><summary>Your inspection</summary><pre>{JSON.stringify(value.commitInspection, null, 2)}</pre></details>}
        <button disabled={Boolean(busy) || !ownSource} onClick={() => void run("Inspecting checkpoint", async (current) => {
          const result = await sdk.winddown.inspectCommit(value.winddown.id);
          if (current()) setInspection({ value: result.inspection, scope });
        })}>Inspect checkpoint result</button>
        {inspection?.scope === scope && <section aria-label="Original checkpoint effect inspection">
          <Alert as="p" tone="warning" className="settings-warning">{inspection.value.review.warning}</Alert>
          <p className="fine-print path">Env: {envLabel(inspection.value.review.document.publicationEnv)}<br />Root: {inspection.value.review.document.root}<br />Branch now at: {inspection.value.review.document.actualCommit ?? "no commit"}<br />Prepared commit: {inspection.value.preparedCommit ?? "not recorded"}<br />Published commit: {inspection.value.publishedCommit ?? "not recorded"}</p>
          <details><summary>Inspection details</summary><pre>{JSON.stringify(inspection.value.review.document, null, 2)}</pre></details>
          {value.winddown.status === "partial" && !value.winddown.commit.inspection && <>
            <label className="check-setting"><SettingsInput type="checkbox" aria-label="Reviewed original checkpoint effects" checked={inspectionReviewed} onChange={(event) => setInspectionReviewed(event.target.checked)} />I reviewed this interrupted commit and the branch's current state. Keep it partial with its charges; don't retry or roll back.</label>
            <button disabled={Boolean(busy) || !ownSource || !inspectionReviewed} onClick={() => void run("Acknowledging", async () => {
              await sdk.winddown.reconcileCommit(value.winddown.id, inspection.value.review.revision, inspection.value.review.digest, true);
              setNotice("Inspection acknowledged. The job stays partial.");
            })}>Acknowledge inspection</button>
          </>}
        </section>}
      </>}
      {value.winddown.status === "ready" && value.winddown.env !== "Local" && <Alert as="p" className="fine-print" role="status">
        This finishing summary came from the {envLabel(value.winddown.env)} worker; it doesn't mark the task done or approve changes. Commits go only to the run's original folder.
      </Alert>}
      {value.winddown.status === "ready" && (value.winddown.env === "Local" || (native || remote) && ownSource) && <>
        {!ownSource && <Alert as="p" tone="warning" className="settings-warning">Open the checkpoint's original chat in agent mode, with no turn running, to continue. A deleted, moved or project-free source can't use another checkout.</Alert>}
        {native ? <>
          <h5>Published Sandbox files</h5><p className="fine-print">First publish the Sandbox output from Settings &gt; Sandbox. This then creates a new local Git branch in that project; Git never runs inside the VM.</p>
          {publications.map((publication) => <label className="check-setting" key={publication.id}><SettingsInput type="checkbox" aria-label={`Include accepted native publication ${publication.id}`} checked={nativeIds.includes(publication.id)} disabled={Boolean(busy) || !ownSource}
            onChange={(event) => setNativeIds(event.target.checked ? [...nativeIds, publication.id] : nativeIds.filter((id) => id !== publication.id))} />{publication.id} / {publication.root} / accepted by you</label>)}
          {!publications.length && <p className="fine-print">No published Sandbox files for this run yet.</p>}
        </> : remote ? <>
          <h5>Accept files on the SSH host</h5>
          {acceptedRemote ? <p className="fine-print path">Files accepted: {acceptedRemote.reviewDigest}. Review the new branch below to commit.</p> : <>
            <label className="setting-field">Files on the SSH host, one path per line<SettingsTextarea aria-label="Remote checkpoint source paths" value={sourcePaths} disabled={Boolean(busy)} onChange={(event) => setSourcePaths(event.target.value)} /></label>
            <button disabled={Boolean(busy) || !sourcePaths.trim()} onClick={() => void run("Reading files", async (current) => {
              const result = await sdk.winddown.sourcePreview(value.winddown.id, sourcePaths.split("\n").map((path) => path.trim()).filter(Boolean));
              if (current()) setSourcePreview({ value: result.preview, scope });
            })}>Review files</button>
            {sourcePreview?.scope === scope && <section aria-label="Exact peer source acceptance">
              <p className="fine-print path">SSH root: {sourcePreview.value.document.source.root}<br />Base: {sourcePreview.value.document.source.head}</p>
              {sourcePreview.value.document.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.mode} / {file.digest}</summary><pre>{file.text}</pre></details>)}
              {session && (snapshot.blockedProjects.includes(session.projectId ?? "") || snapshot.blockedSessions.includes(session.id)) && <button disabled={Boolean(busy)} onClick={() => void run("Resuming", async () => { await sdk.command({ type: "session.resume", sessionId: session.id }); })}>Resume after source inspection</button>}
              <label className="check-setting"><SettingsInput type="checkbox" aria-label="Reviewed exact peer source" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />I accept these files as they are. This doesn't commit them or mark the task done.</label>
              <button disabled={Boolean(busy) || !sourceReviewed} onClick={() => void run("Accepting files", async () => {
                await sdk.winddown.acceptSource(value.winddown.id, sourcePreview.value.document.files.map((file) => file.path), sourcePreview.value.revision, sourcePreview.value.digest, true);
                setBaseline(fields);
              })}>Accept files</button>
            </section>}
          </>}
        </> : <>
          <SettingsHelp label="More about this setting" target={<h5>Applied proposals</h5>}>Only proposals you applied appear here, not ones that were just staged or approved by a model. Committing doesn't run tests.</SettingsHelp>
          {candidates.map((candidate) => <label className="check-setting" key={candidate.id}><SettingsInput type="checkbox" aria-label={`Include accepted checkpoint candidate ${candidate.id}`} checked={candidateIds.includes(candidate.id)} disabled={Boolean(busy) || !ownSource}
            onChange={(event) => setCandidates(event.target.checked ? [...candidateIds, candidate.id] : candidateIds.filter((id) => id !== candidate.id))} />{snapshot.artifacts.find((artifact) => artifact.id === candidate.id)?.name ?? candidate.id} / applied by you</label>)}
        </>}
        <label className="setting-field">{remote ? "New branch on the SSH host" : "New local branch"}<SettingsInput aria-label={remote ? "Checkpoint new peer branch" : "Checkpoint new local branch"} value={branch} disabled={Boolean(busy) || !ownSource} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="setting-field">Commit message<SettingsTextarea aria-label="Checkpoint commit message" value={message} maxLength={4096} disabled={Boolean(busy) || !ownSource} onChange={(event) => setMessage(event.target.value)} /></label>
        <div className="button-row"><button disabled={Boolean(busy) || !ownSource || (native ? !nativeIds.length : remote ? !acceptedRemote : !candidateIds.length) || !branch || !message.trim()} onClick={() => void run("Reviewing commit", async (current) => {
          if (!session) throw new Error("Open the checkpoint's original chat first.");
          const result = await sdk.winddown.commitPreview({ winddownId: value.winddown.id, sessionId: session.id, candidateIds: native || remote ? [] : candidateIds,
            ...(native ? { nativePublicationIds: nativeIds } : {}), ...(remote ? { remoteAccepted: true as const } : {}), branch, message });
          if (current()) setPreview({ value: result.preview, scope });
        })} aria-label="Review accepted-work Git checkpoint">Review</button>
          <button disabled={Boolean(busy) || !ownSource} onClick={() => void run("Declining", async () => { await sdk.winddown.decline(value.winddown.id, value.winddown.revision, true); })} aria-label="Decline checkpoint Git publication">Decline</button></div>
        {preview && preview.scope === scope && <section className="candidate-binding" aria-label="Exact accepted-work checkpoint Git review">
          <p className="fine-print path">Root: {preview.value.document.source.root}<br />New branch: {preview.value.document.branch}<br />Base: {preview.value.document.base}</p>
          <Alert as="p" tone="warning" className="settings-warning">{preview.value.warning}</Alert><pre>{preview.value.document.message}</pre>
          {preview.value.document.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.mode} / {file.digest}</summary><pre>{file.text}</pre></details>)}
          <label className="check-setting"><SettingsInput aria-label="Reviewed accepted-work checkpoint Git branch" type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed these files, the environment, the base, the new branch and the commit message. Leave my current branch and index alone; don't push or merge.</label>
          <button className="primary" disabled={Boolean(busy) || !ownSource || !reviewed} onClick={() => void run("Committing", async () => {
            const captured = preview.value; setPreview(null); setReviewed(false); focusOutcome.current = true;
            await sdk.winddown.commit({ winddownId: captured.document.winddownId, sessionId: captured.document.sessionId,
              candidateIds: captured.document.candidates.map((candidate) => candidate.id),
              ...(captured.document.version === 2 ? { nativePublicationIds: captured.document.nativePublications.map((entry) => entry.publication.id) } : {}),
              ...(captured.document.version === 3 ? { remoteAccepted: true as const } : {}),
              branch: captured.document.branch, message: captured.document.message },
            captured.revision, captured.digest, true);
            setBaseline(fields); setNotice("Commit started. Check the result above; no model was called.");
          })} aria-label="Commit on new branch from reviewed checkpoint">Commit on new branch</button>
        </section>}
      </>}
      {dirty && <button disabled={Boolean(busy)} onClick={() => { setCandidates([]); setNativeIds([]); setSourcePaths(""); setBranch(""); setMessage("chore: checkpoint explicitly accepted work"); setBaseline(""); setPreview(null); }} aria-label="Discard local checkpoint input">Discard</button>}
    </>}
  </section>;
}
