import { useEffect, useRef, useState } from "react";
import type { GatewaySkill, MoguriSdk, Session, SkillInspection, SkillPublisher, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function SkillAdmissionsPanel({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [skills, setSkills] = useState<GatewaySkill[]>([]), [inspection, setInspection] = useState<SkillInspection | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [paths, setPaths] = useState("."), [access, setAccess] = useState<"read-only" | "native-files">("read-only");
  const [signed, setSigned] = useState(false), [identity, setIdentity] = useState(""), [publicKey, setPublicKey] = useState(""), [signature, setSignature] = useState("");
  const generation = useRef(0);
  const admissions = snapshot.skillAdmissions.filter((grant) => grant.sessionId === session.id);
  const scope = JSON.stringify([sdk.profileId, session.id, session.projectId, session.workspaceId, session.mode, session.controls.env,
    snapshot.policy.revision, snapshot.settings.permissionRevision, admissions.filter((grant) => grant.state === "revoked").map((grant) => [grant.id, grant.revision])]);
  useEffect(() => { generation.current++; setInspection(null); setReviewed(false); setSkills([]); }, [scope]);
  useEffect(() => () => { generation.current++; }, []);
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    const token = ++generation.current; setBusy(true); setError("");
    try { await operation(() => generation.current === token); }
    catch (error) { if (generation.current === token) setError(error instanceof Error ? error.message : "The exact source review failed. No source or authority was substituted."); }
    finally { setBusy(false); }
  };
  return <section className="script-reviews" aria-label="Skill source admission">
    <details><summary>Skill source reviews ({admissions.length})</summary>
      <p className="fine-print">Discovery and source reads are not admission. A hash or repository label is not publisher identity. Local skill context is limited to reviewed native file tools, never commands, network, credentials or automatic permission.</p>
      {session.controls.env !== "Local" && <Alert as="p" tone="warning">This source/admission transport is Local-only. No controller fallback is available.</Alert>}
      <button type="button" disabled={busy || session.controls.env !== "Local"} onClick={() => void run(async (current) => {
        const found = await sdk.skills.find("", { sessionId: session.id });
        if (current()) { setSkills(found.skills); setInspection(null); setReviewed(false); }
      })}>Find current skills</button>
      {skills.map((skill) => <article key={skill.id}><strong>{skill.name}</strong><p>{skill.description}</p><small>{skill.sourceName} / {skill.digest}</small>
        <button type="button" disabled={busy} onClick={() => void run(async (current) => {
          const value = (await sdk.skills.inspect(session.id, skill.id, skill.digest)).inspection;
          if (current()) { setInspection(value); setReviewed(false); setSigned(value.origin.kind === "archive"); setAccess("read-only"); }
        })} aria-label={`Review source ${skill.name}`}>Review complete source</button>
      </article>)}
      {inspection && <div aria-label="Complete skill source review">
        <h3>{inspection.name} / {inspection.origin.version}</h3>
        <p className="fine-print">Exact workspace: <code>{inspection.root.root}</code>. Artifact SHA-256 <code>{inspection.origin.artifactDigest}</code>. Publisher is not verified by a name, description, scanner or hash.</p>
        {inspection.diagnostics.map((diagnostic) => <p key={diagnostic} className="fine-print">{diagnostic}</p>)}
        {inspection.files.map((file) => <details key={file.path} open><summary>{file.path} / {file.bytes} bytes / {file.digest}</summary><pre>{file.text}</pre></details>)}
        {inspection.excluded.length > 0 && <p>Excluded protected paths: {inspection.excluded.join(", ")}. They cannot be dependencies.</p>}
        {inspection.externalReferences.length > 0 && <details><summary>Unfetched external references (not inspected or authorized)</summary><pre>{inspection.externalReferences.join("\n")}</pre></details>}
        <label className="setting-field">Literal permitted paths, comma-separated<input aria-label="Skill permitted paths" value={paths} onChange={(event) => { setPaths(event.target.value); setReviewed(false); }} /></label>
        <label className="setting-field">Local file access<select value={access} aria-label="Skill file access" onChange={(event) => { setAccess(event.target.value === "native-files" ? "native-files" : "read-only"); setReviewed(false); }}>
          <option value="read-only">Read-only native files</option>{inspection.access === "native-files" && <option value="native-files">Native file writes under current hard policy</option>}
        </select></label>
        <label className="check-setting"><input type="checkbox" checked={signed} disabled={inspection.origin.kind === "archive"} onChange={(event) => { setSigned(event.target.checked); setReviewed(false); }} />Verify a separately user-pinned Ed25519 publisher key</label>
        {signed && <>
          <label className="setting-field">User-pinned publisher identity<input aria-label="Pinned skill publisher" value={identity} onChange={(event) => { setIdentity(event.target.value); setReviewed(false); }} /></label>
          <label className="setting-field">Ed25519 public key (PEM)<textarea aria-label="Skill publisher public key" value={publicKey} onChange={(event) => { setPublicKey(event.target.value); setReviewed(false); }} /></label>
          <label className="setting-field">Detached signature (base64)<textarea aria-label="Skill artifact signature" value={signature} onChange={(event) => { setSignature(event.target.value); setReviewed(false); }} /></label>
          <p className="fine-print">Verify against the documented moguri-skill-artifact-v1 signature payload. Pinning proves control of this reviewed key, not an independently verified real-world organization.</p>
        </>}
        <label className="check-setting"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />
          {signed ? "I reviewed all source files and independently pinned this exact publisher key." : "I reviewed all source files and acknowledge the publisher is not verified."}</label>
        <button type="button" disabled={busy || !reviewed || Boolean(session.turnId) || !paths.trim() || signed && (!identity || !publicKey || !signature)} onClick={() => void run(async (current) => {
          const publisher: SkillPublisher = signed ? { kind: "pinned-ed25519", identity, publicKey, signature } : { kind: "unverified-local", acknowledge: "publisher-not-verified" };
          await sdk.skills.admit({ sessionId: session.id, skillId: inspection.skillId, expectedDigest: inspection.contentDigest, expectedInspectionDigest: inspection.digest,
            publisher, access, paths: paths.split(",").map((path) => path.trim()).filter(Boolean), validHours: 24 });
          if (current()) { setReviewed(false); setInspection(null); }
        })}>Admit exact source for this session</button>
      </div>}
      {admissions.map((grant) => <article key={grant.id}>
        <h3>{grant.name}: {grant.state}</h3>
        <p className="fine-print">{grant.publisher.kind === "unverified-local" ? "Publisher not verified; actual-user Local review." : `User-pinned key: ${grant.keyFingerprint}.`} Expires {grant.expiresAt}. {grant.access}: {grant.paths.join(", ")}.</p>
        <code>{grant.origin.artifactDigest}</code>
        {grant.reason && <p>{grant.reason}</p>}
        {grant.state === "active" && <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.skills.use(session.id, grant.skillId, grant.contentDigest, session.draft.revision); })}>Insert admitted skill into draft</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.skills.revoke(session.id, grant.id, grant.revision, "Actual user revoked this source admission."); })}>Revoke source admission</button>
        </div>}
      </article>)}
      <p className="fine-print">Revocation blocks future consumption/effects. It cannot retract instructions already delivered to a model or undo work already running. A rewind never restores an old source grant.</p>
    </details>
    {busy && <p role="status">Reading or checking the exact source authority...</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
