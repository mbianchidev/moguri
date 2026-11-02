import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot, WinddownResponse } from "../../../packages/sdk/src/index.ts";
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
  const candidates = snapshot.candidates.filter((candidate) => candidate.status === "applied" && candidate.acceptance?.actor === "user" &&
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
      .catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "The original independently retained checkpoint could not be read."); });
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
    catch (error) { setError(error instanceof Error ? error.message : "Original checkpoint operation was not confirmed. Inputs, accepted bytes, index/HEAD and retained intent were preserved."); }
    finally { pending.current = false; setBusy(""); }
  };
  return <section className="candidate-section" aria-label="Budget wind-down checkpoints" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h2>Budget wind-down checkpoints</h2>}>Reserved capacity is not a model call. A bounded metadata-only finishing role cannot accept code or approve Git. Checkpoint branches require actual-user accepted source bytes and this separate exact review. No checkout, push, merge or branch deletion.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" role="status" className="fine-print">{notice}</Alert>}{busy && <p role="status">{busy}</p>}
    <label className="setting-field">Retained budget checkpoint<select aria-label="Retained budget checkpoint" value={record?.id ?? ""} disabled={Boolean(busy) || dirty} onChange={(event) => setSelectedId(event.target.value)}>
      {!records.length && <option value="">No retained finishing envelopes</option>}{records.map((record) => <option key={record.id} value={record.id}>{snapshot.artifacts.find((artifact) => artifact.id === record.id)?.name ?? record.id} / {record.status}</option>)}</select></label>
    {value && <>
      <h3 ref={outcome} tabIndex={-1}>Checkpoint {value.winddown.status}</h3>
      <p className="fine-print">Actual finishing model: {value.winddown.step.modelId}. Env: {value.winddown.env}. Observation: {value.winddown.step.state}. Original turn: {value.winddown.turnId}.</p>
      {value.winddown.version !== 1 && value.winddown.transport && <p className="fine-print path">Original owned execution: {value.winddown.transport.executionId}<br />Worker: {value.winddown.transport.workerDigest}</p>}
      {value.winddown.diagnostic && <Alert as="p" className="settings-warning" role="alert">{value.winddown.diagnostic}</Alert>}
      <details><summary>Original metadata-only model input/result</summary>{value.roleInput && <pre>{value.roleInput}</pre>}{value.result && <pre>{value.result}</pre>}<p className="fine-print">Untrusted model data, not a user answer, validation proof or Git authority.</p></details>
      {["held", "running", "committing"].includes(value.winddown.status) && <button disabled={Boolean(busy)} onClick={() => void run("Stopping the original checkpoint owner", async () => { await sdk.winddown.stop(value.winddown.id); })} aria-label="Stop this checkpoint owner">Stop</button>}
      {value.winddown.commit && <><p className="fine-print path">Actual user Git intent: {value.winddown.commit.branch} / base {value.winddown.commit.base}<br />Prepared: {value.winddown.commit.preparedCommit ?? "not recorded"}<br />Published: {value.winddown.commit.publishedCommit ?? "not acknowledged"}</p>
        <p className="fine-print">Publication attempted: {String(value.winddown.commit.publicationAttempted)}. Cancel requested: {String(value.winddown.commit.cancelRequested)}. A partial job is never replayed or rolled back.</p></>}
      {value.winddown.version === 3 && value.winddown.commit?.publicationAttempted && ["partial", "completed"].includes(value.winddown.status) && <>
        {value.winddown.commit.inspection ? <p className="fine-print path">Actual user effect inspection: {value.winddown.commit.inspection.reviewDigest}. Original partial job and charges remain unchanged.</p> : value.winddown.status === "partial" &&
          <Alert as="p" tone="warning" className="settings-warning">This original writer remains quarantined. Read its exact source/ref and retained effects, then separately acknowledge that inspection. This cannot complete or replay the interrupted job.</Alert>}
        {value.commitInspection && <details><summary>Retained actual-user inspection</summary><pre>{JSON.stringify(value.commitInspection, null, 2)}</pre></details>}
        <button disabled={Boolean(busy) || !ownSource} onClick={() => void run("Inspecting original checkpoint effects without replay", async (current) => {
          const result = await sdk.winddown.inspectCommit(value.winddown.id);
          if (current()) setInspection({ value: result.inspection, scope });
        })}>Inspect original checkpoint effects</button>
        {inspection?.scope === scope && <section aria-label="Original checkpoint effect inspection">
          <Alert as="p" tone="warning" className="settings-warning">{inspection.value.review.warning}</Alert>
          <p className="fine-print path">Publication Env: {inspection.value.review.document.publicationEnv}<br />Root: {inspection.value.review.document.root}<br />Current exact ref: {inspection.value.review.document.actualCommit ?? "absent"}<br />Prepared: {inspection.value.preparedCommit ?? "not recorded"}<br />Published receipt: {inspection.value.publishedCommit ?? "not recorded"}</p>
          <details><summary>Exact retained effect/ref/source inspection</summary><pre>{JSON.stringify(inspection.value.review.document, null, 2)}</pre></details>
          {value.winddown.status === "partial" && !value.winddown.commit.inspection && <>
            <label className="check-setting"><SettingsInput type="checkbox" aria-label="Reviewed original checkpoint effects" checked={inspectionReviewed} onChange={(event) => setInspectionReviewed(event.target.checked)} />I reviewed only this original settled writer and exact current source/ref. Keep the job partial and all charges; no replay, rollback or PID cleanup claim.</label>
            <button disabled={Boolean(busy) || !ownSource || !inspectionReviewed} onClick={() => void run("Acknowledging only original checkpoint writer inspection", async () => {
              await sdk.winddown.reconcileCommit(value.winddown.id, inspection.value.review.revision, inspection.value.review.digest, true);
              setNotice("Original writer inspection acknowledged. The actual job/task remains partial; current policy and any other inspection gates remain authoritative.");
            })}>Acknowledge original writer inspection</button>
          </>}
        </section>}
      </>}
      {value.winddown.status === "ready" && value.winddown.env !== "Local" && <Alert as="p" className="fine-print" role="status">
        Finishing metadata came from the original {value.winddown.env} worker. It is not task completion, source acceptance or Git authority. Local checkpoint helpers cannot publish a different root.
      </Alert>}
      {value.winddown.status === "ready" && (value.winddown.env === "Local" || (native || remote) && ownSource) && <>
        {!ownSource && <Alert as="p" tone="warning" className="settings-warning">Choose the exact original restored Local source agent after owned work ends. A deleted/moved/project-free source cannot inherit another checkout.</Alert>}
        {native ? <>
          <h4>Separately accepted native source</h4><p className="fine-print">First publish exact native output through its separate actual-user source review. This later action creates a new Local Git branch only in that original source repository. It never runs Git in the guest or substitutes a checkout.</p>
          {publications.map((publication) => <label className="check-setting" key={publication.id}><SettingsInput type="checkbox" aria-label={`Include accepted native publication ${publication.id}`} checked={nativeIds.includes(publication.id)} disabled={Boolean(busy) || !ownSource}
            onChange={(event) => setNativeIds(event.target.checked ? [...nativeIds, publication.id] : nativeIds.filter((id) => id !== publication.id))} />{publication.id} / {publication.root} / accepted by actual user</label>)}
          {!publications.length && <p className="fine-print">No completed separate native-source acceptance exists for this exact execution.</p>}
        </> : remote ? <>
          <h4>Separate peer source acceptance</h4>
          {acceptedRemote ? <p className="fine-print path">Actual user source acceptance: {acceptedRemote.reviewDigest}. Git still needs its separate new-branch review.</p> : <>
            <label className="setting-field">Exact peer files, one path per line<SettingsTextarea aria-label="Remote checkpoint source paths" value={sourcePaths} disabled={Boolean(busy)} onChange={(event) => setSourcePaths(event.target.value)} /></label>
            <button disabled={Boolean(busy) || !sourcePaths.trim()} onClick={() => void run("Reading exact peer source for separate acceptance", async (current) => {
              const result = await sdk.winddown.sourcePreview(value.winddown.id, sourcePaths.split("\n").map((path) => path.trim()).filter(Boolean));
              if (current()) setSourcePreview({ value: result.preview, scope });
            })}>Review peer source</button>
            {sourcePreview?.scope === scope && <section aria-label="Exact peer source acceptance">
              <p className="fine-print path">SSH root: {sourcePreview.value.document.source.root}<br />Base: {sourcePreview.value.document.source.head}</p>
              {sourcePreview.value.document.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.mode} / {file.digest}</summary><pre>{file.text}</pre></details>)}
              {session && (snapshot.blockedProjects.includes(session.projectId ?? "") || snapshot.blockedSessions.includes(session.id)) && <button disabled={Boolean(busy)} onClick={() => void run("Acknowledging actual user source inspection", async () => { await sdk.command({ type: "session.resume", sessionId: session.id }); })}>Resume after source inspection</button>}
              <label className="check-setting"><SettingsInput type="checkbox" aria-label="Reviewed exact peer source" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />I accept only these exact peer bytes. This is not Git permission or task completion.</label>
              <button disabled={Boolean(busy) || !sourceReviewed} onClick={() => void run("Accepting only exact peer source", async () => {
                await sdk.winddown.acceptSource(value.winddown.id, sourcePreview.value.document.files.map((file) => file.path), sourcePreview.value.revision, sourcePreview.value.digest, true);
                setBaseline(fields);
              })}>Accept peer source</button>
            </section>}
          </>}
        </> : <>
          <SettingsHelp label="More about this setting" target={<h4>Accepted candidates</h4>}>Select retained actual-user applied candidates, never a merely staged or model/critic-approved proposal. No new project tests or code-quality proof is implied by this commit.</SettingsHelp>
          {candidates.map((candidate) => <label className="check-setting" key={candidate.id}><SettingsInput type="checkbox" aria-label={`Include accepted checkpoint candidate ${candidate.id}`} checked={candidateIds.includes(candidate.id)} disabled={Boolean(busy) || !ownSource}
            onChange={(event) => setCandidates(event.target.checked ? [...candidateIds, candidate.id] : candidateIds.filter((id) => id !== candidate.id))} />{snapshot.artifacts.find((artifact) => artifact.id === candidate.id)?.name ?? candidate.id} / accepted by actual user</label>)}
        </>}
        <label className="setting-field">Explicit new {remote ? "peer" : "local"} branch<SettingsInput aria-label={remote ? "Checkpoint new peer branch" : "Checkpoint new local branch"} value={branch} disabled={Boolean(busy) || !ownSource} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="setting-field">Exact commit message<SettingsTextarea aria-label="Checkpoint commit message" value={message} maxLength={4096} disabled={Boolean(busy) || !ownSource} onChange={(event) => setMessage(event.target.value)} /></label>
        <div className="button-row"><button disabled={Boolean(busy) || !ownSource || (native ? !nativeIds.length : remote ? !acceptedRemote : !candidateIds.length) || !branch || !message.trim()} onClick={() => void run("Reviewing exact accepted-work Git checkpoint", async (current) => {
          if (!session) throw new Error("Choose the actual original source session.");
          const result = await sdk.winddown.commitPreview({ winddownId: value.winddown.id, sessionId: session.id, candidateIds: native || remote ? [] : candidateIds,
            ...(native ? { nativePublicationIds: nativeIds } : {}), ...(remote ? { remoteAccepted: true as const } : {}), branch, message });
          if (current()) setPreview({ value: result.preview, scope });
        })} aria-label="Review accepted-work Git checkpoint">Review</button>
          <button disabled={Boolean(busy) || !ownSource} onClick={() => void run("Declining checkpoint Git publication", async () => { await sdk.winddown.decline(value.winddown.id, value.winddown.revision, true); })} aria-label="Decline checkpoint Git publication">Decline</button></div>
        {preview && preview.scope === scope && <section className="candidate-binding" aria-label="Exact accepted-work checkpoint Git review">
          <p className="fine-print path">Root: {preview.value.document.source.root}<br />New branch: {preview.value.document.branch}<br />Base: {preview.value.document.base}</p>
          <Alert as="p" tone="warning" className="settings-warning">{preview.value.warning}</Alert><pre>{preview.value.document.message}</pre>
          {preview.value.document.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.mode} / {file.digest}</summary><pre>{file.text}</pre></details>)}
          <label className="check-setting"><SettingsInput aria-label="Reviewed accepted-work checkpoint Git branch" type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed these exact accepted bytes, execution boundary, root, base, new branch and Git message. Preserve source index/HEAD; no push or merge.</label>
          <button className="primary" disabled={Boolean(busy) || !ownSource || !reviewed} onClick={() => void run("Creating the exact reviewed checkpoint branch", async () => {
            const captured = preview.value; setPreview(null); setReviewed(false); focusOutcome.current = true;
            await sdk.winddown.commit({ winddownId: captured.document.winddownId, sessionId: captured.document.sessionId,
              candidateIds: captured.document.candidates.map((candidate) => candidate.id),
              ...(captured.document.version === 2 ? { nativePublicationIds: captured.document.nativePublications.map((entry) => entry.publication.id) } : {}),
              ...(captured.document.version === 3 ? { remoteAccepted: true as const } : {}),
              branch: captured.document.branch, message: captured.document.message },
            captured.revision, captured.digest, true);
            setBaseline(fields); setNotice("Original actual-user Git intent admitted. Inspect its verified result or partial publication; no second model was called.");
          })} aria-label="Commit on new branch from reviewed checkpoint">Commit on new branch</button>
        </section>}
      </>}
      {dirty && <button disabled={Boolean(busy)} onClick={() => { setCandidates([]); setNativeIds([]); setSourcePaths(""); setBranch(""); setMessage("chore: checkpoint explicitly accepted work"); setBaseline(""); setPreview(null); }} aria-label="Discard local checkpoint input">Discard</button>}
    </>}
  </section>;
}
