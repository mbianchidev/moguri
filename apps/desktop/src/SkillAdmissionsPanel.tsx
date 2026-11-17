import { useEffect, useRef, useState } from "react";
import { builtinClashNotice, type GatewaySkill, type MoguriSdk, type Session, type SkillInspection, type SkillPublisher, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { SourceIndicators } from "./SourceIndicators.tsx";

export function SkillAdmissionsPanel({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [skills, setSkills] = useState<GatewaySkill[]>([]), [inspection, setInspection] = useState<SkillInspection | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [paths, setPaths] = useState("."), [access, setAccess] = useState<"read-only" | "native-files">("read-only");
  const [signed, setSigned] = useState(false), [identity, setIdentity] = useState(""), [publicKey, setPublicKey] = useState(""), [signature, setSignature] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const savedKeys = snapshot.skillPublishers.filter((publisher) => !snapshot.skillTrustBlocks.some((block) => block.kind === "key" && block.digest === publisher.fingerprint));
  const generation = useRef(0);
  const admissions = snapshot.skillAdmissions.filter((grant) => grant.sessionId === session.id);
  const scope = JSON.stringify([sdk.profileId, session.id, session.projectId, session.workspaceId, session.mode, session.controls.env,
    snapshot.policy.revision, snapshot.settings.revision, snapshot.settings.permissionRevision, admissions.filter((grant) => grant.state === "revoked").map((grant) => [grant.id, grant.revision])]);
  useEffect(() => { generation.current++; setInspection(null); setReviewed(false); setSkills([]); }, [scope]);
  useEffect(() => () => { generation.current++; }, []);
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    const token = ++generation.current; setBusy(true); setError("");
    try { await operation(() => generation.current === token); }
    catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "Skill source review failed. No other source was used."); }
    finally { setBusy(false); }
  };
  return <section className="script-reviews" aria-label="Skill source admission">
    <details><summary>Skill approvals for this session ({admissions.length})</summary>
      <p className="fine-print">Approving a skill lets this session use its instructions with the file access you choose. Skills never get commands, network access or credentials.</p>
      {session.controls.env !== "Local" && <Alert as="p" tone="warning">Skill approval works only in Local sessions.</Alert>}
      <button type="button" disabled={busy || session.controls.env !== "Local"} onClick={() => void run(async (current) => {
        const found = await sdk.skills.find("", { sessionId: session.id });
        if (current()) { setSkills(found.skills); setInspection(null); setReviewed(false); }
      })}>Find current skills</button>
      {skills.map((skill) => <article key={skill.id}><strong>{skill.name}</strong><p>{skill.description}</p><small>{skill.sourceName} / {skill.digest}</small>
        {skill.shadowedBy && <Alert as="p" tone="warning" className="skill-clash">{builtinClashNotice(skill.name, skill.shadowedBy)}</Alert>}
        <button type="button" disabled={busy} onClick={() => void run(async (current) => {
          const value = (await sdk.skills.inspect(session.id, skill.id, skill.digest)).inspection;
          if (current()) { setInspection(value); setReviewed(false); setSigned(value.origin.kind === "archive"); setAccess("read-only"); }
        })} aria-label={`Review source ${skill.name}`}>Review source</button>
      </article>)}
      {inspection && <div aria-label="Complete skill source review">
        <h3>{inspection.name} / {inspection.origin.version}</h3>
        <p className="fine-print">Workspace <code>{inspection.root.root}</code> · SHA-256 <code>{inspection.origin.artifactDigest}</code>. A name, description or hash doesn't verify the publisher.</p>
        {inspection.diagnostics.map((diagnostic) => <p key={diagnostic} className="fine-print">{diagnostic}</p>)}
        <SourceIndicators report={inspection.scan} gate="trusted-skill" label={`Indicator findings for ${inspection.name}`} />
        {inspection.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.bytes} bytes / {file.digest}</summary><pre>{file.text}</pre></details>)}
        {inspection.excluded.length > 0 && <p>Excluded protected paths: {inspection.excluded.join(", ")}</p>}
        {inspection.externalReferences.length > 0 && <details><summary>External links (not fetched or reviewed)</summary><pre>{inspection.externalReferences.join("\n")}</pre></details>}
        <label className="setting-field">Allowed paths, comma-separated<input aria-label="Skill permitted paths" value={paths} onChange={(event) => { setPaths(event.target.value); setReviewed(false); }} /></label>
        <label className="setting-field">File access<select value={access} aria-label="Skill file access" onChange={(event) => { setAccess(event.target.value === "native-files" ? "native-files" : "read-only"); setReviewed(false); }}>
          <option value="read-only">Read files only</option>{inspection.access === "native-files" && <option value="native-files">Read and write files (policy limits apply)</option>}
        </select></label>
        <label className="check-setting"><input type="checkbox" checked={signed} disabled={inspection.origin.kind === "archive"} onChange={(event) => { setSigned(event.target.checked); setReviewed(false); }} />Verify the publisher with an Ed25519 key I trust</label>
        {signed && savedKeys.length > 0 && <label className="setting-field">Publisher key<select aria-label="Saved skill publisher key" value={savedKey} onChange={(event) => { setSavedKey(event.target.value); setReviewed(false); }}>
          <option value="">Paste a key</option>{savedKeys.map((publisher) => <option key={publisher.fingerprint} value={publisher.fingerprint}>{publisher.identity} ({publisher.fingerprint.slice(0, 12)})</option>)}
        </select></label>}
        {signed && savedKey && <label className="setting-field">Detached signature (base64)<textarea aria-label="Skill artifact signature" value={signature} onChange={(event) => { setSignature(event.target.value); setReviewed(false); }} /></label>}
        {signed && !savedKey && <>
          <label className="setting-field">Publisher identity<input aria-label="Pinned skill publisher" value={identity} onChange={(event) => { setIdentity(event.target.value); setReviewed(false); }} /></label>
          <label className="setting-field">Ed25519 public key (PEM)<textarea aria-label="Skill publisher public key" value={publicKey} onChange={(event) => { setPublicKey(event.target.value); setReviewed(false); }} /></label>
          <label className="setting-field">Detached signature (base64)<textarea aria-label="Skill artifact signature" value={signature} onChange={(event) => { setSignature(event.target.value); setReviewed(false); }} /></label>
          <p className="fine-print">A valid signature proves the publisher holds this key, not who they are.</p>
        </>}
        <label className="check-setting"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />
          {signed ? "I reviewed all source files and trust this publisher key." : "I reviewed all source files and acknowledge the publisher is not verified."}</label>
        <button type="button" disabled={busy || !reviewed || Boolean(session.turnId) || !paths.trim() || signed && (!signature || !savedKey && (!identity || !publicKey))} onClick={() => void run(async (current) => {
          const publisher: SkillPublisher = !signed ? { kind: "unverified-local", acknowledge: "publisher-not-verified" } :
            savedKey ? { kind: "saved-ed25519", fingerprint: savedKey, signature } : { kind: "pinned-ed25519", identity, publicKey, signature };
          await sdk.skills.admit({ sessionId: session.id, skillId: inspection.skillId, expectedDigest: inspection.contentDigest, expectedInspectionDigest: inspection.digest,
            publisher, access, paths: paths.split(",").map((path) => path.trim()).filter(Boolean), validHours: 24 });
          if (current()) { setReviewed(false); setInspection(null); }
        })}>Approve skill for this session</button>
      </div>}
      {admissions.map((grant) => <article key={grant.id}>
        <h3>{grant.name}: {grant.state}</h3>
        <p className="fine-print">{grant.publisher.kind === "unverified-local" ? "Publisher not verified." : `Publisher key: ${snapshot.skillPublishers.find((publisher) => publisher.fingerprint === grant.keyFingerprint)?.identity ?? ""} ${grant.keyFingerprint}.`} Expires {grant.expiresAt} · {grant.access}: {grant.paths.join(", ")}</p>
        <code>{grant.origin.artifactDigest}</code>
        {grant.reason && <p>{grant.reason}</p>}
        {grant.state === "active" && <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.skills.use(session.id, grant.skillId, grant.contentDigest, session.draft.revision); })}>Attach skill to draft</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.skills.revoke(session.id, grant.id, grant.revision, "Actual user revoked this source admission."); })}>Revoke skill approval</button>
        </div>}
      </article>)}
      <p className="fine-print">Revoking stops future use. It can't recall instructions a model already read or undo work already started.</p>
    </details>
    {busy && <p role="status">Checking skill source...</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
