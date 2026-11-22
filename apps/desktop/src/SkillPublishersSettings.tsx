import { useState } from "react";
import { outcomeLabel, type MoguriSdk, type Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { StatusBadge } from "./StatusBadge.tsx";
import { SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";

/** Settings / Skills: saved Ed25519 publisher keys and permanent key/version blocks for this profile. */
export function SkillPublishersSettings({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [identity, setIdentity] = useState(""), [publicKey, setPublicKey] = useState(""), [trusted, setTrusted] = useState(false);
  const [blocking, setBlocking] = useState<{ kind: "key" | "artifact"; digest: string } | null>(null), [reason, setReason] = useState("");
  const [artifact, setArtifact] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const blocked = (kind: "key" | "artifact", digest: string) => snapshot.skillTrustBlocks.some((block) => block.kind === kind && block.digest === digest);
  const run = async (action: () => Promise<string>) => {
    setBusy(true); setError(""); setStatus("");
    try { setStatus(await action()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The publisher change failed. Nothing was saved."); }
    finally { setBusy(false); }
  };
  const block = (kind: "key" | "artifact", digest: string) => void run(async () => {
    await sdk.skills.block(kind, digest, reason.trim());
    setBlocking(null); setReason(""); if (kind === "artifact") setArtifact("");
    return kind === "key" ? "Publisher key blocked." : "Skill version blocked.";
  });
  const confirmBlock = (kind: "key" | "artifact", digest: string) => blocking?.kind === kind && blocking.digest === digest &&
    <div role="group" aria-label={`Confirm blocking ${kind} ${digest.slice(0, 12)}`}>
      <label className="setting-field">Reason<SettingsInput aria-label="Block reason" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <p className="fine-print">Blocking is permanent. Admissions and loads that depend on it stop now; instructions a model already read can't be recalled.</p>
      <div className="button-row"><button type="button" disabled={busy} onClick={() => { setBlocking(null); setReason(""); }}>Cancel</button>
        <button type="button" className="danger" disabled={busy || !reason.trim()} onClick={() => block(kind, digest)}>{kind === "key" ? "Block key" : "Block version"}</button></div>
    </div>;
  return <section aria-label="Skill publisher keys">
    <h3>Publisher keys</h3>
    <p className="fine-print">Save an Ed25519 key once to verify signed skill archives without pasting it each time. A valid signature proves the publisher holds the key, not who they are.</p>
    {snapshot.skillPublishers.length === 0 && <p className="fine-print">No saved publisher keys.</p>}
    {snapshot.skillPublishers.map((publisher) => <article key={publisher.fingerprint}>
      <strong>{publisher.identity}</strong> {blocked("key", publisher.fingerprint) && <StatusBadge status={outcomeLabel("blocked")} />}
      <p className="fine-print path">SHA-256 {publisher.fingerprint} · saved {publisher.createdAt}</p>
      {!blocked("key", publisher.fingerprint) && blocking?.digest !== publisher.fingerprint &&
        <button type="button" disabled={busy} aria-label={`Block publisher key ${publisher.identity}`} onClick={() => { setBlocking({ kind: "key", digest: publisher.fingerprint }); setReason(""); }}>Block key</button>}
      {confirmBlock("key", publisher.fingerprint)}
    </article>)}
    <fieldset disabled={busy}>
      <label className="setting-field">Publisher name<SettingsInput aria-label="Saved publisher name" value={identity} onChange={(event) => { setIdentity(event.target.value); setTrusted(false); }} /></label>
      <label className="setting-field">Ed25519 public key (PEM)<SettingsTextarea aria-label="Saved publisher public key" value={publicKey} onChange={(event) => { setPublicKey(event.target.value); setTrusted(false); }} /></label>
      <label className="check-setting"><SettingsInput type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} />I got this key from the publisher through a channel I trust</label>
      <button type="button" disabled={!trusted || !identity.trim() || !publicKey.trim()} onClick={() => void run(async () => {
        await sdk.skills.savePublisher(identity.trim(), publicKey);
        setIdentity(""); setPublicKey(""); setTrusted(false);
        return "Publisher key saved.";
      })}>Save publisher key</button>
    </fieldset>
    <h3>Blocked keys and versions</h3>
    {snapshot.skillTrustBlocks.length === 0 && <p className="fine-print">Nothing blocked.</p>}
    {snapshot.skillTrustBlocks.map((entry) => <p key={`${entry.kind}:${entry.digest}`} className="fine-print path">
      {entry.kind === "key" ? "Key" : "Version"} {entry.digest} · {entry.reason} · {entry.createdAt}</p>)}
    <label className="setting-field">Skill version SHA-256<SettingsInput aria-label="Skill version digest to block" value={artifact} placeholder="Artifact SHA-256 from a skill review"
      onChange={(event) => { setArtifact(event.target.value.trim().toLowerCase()); setBlocking(null); }} /></label>
    {blocking?.kind !== "artifact" && <button type="button" disabled={busy || !/^[a-f0-9]{64}$/.test(artifact) || blocked("artifact", artifact)}
      onClick={() => { setBlocking({ kind: "artifact", digest: artifact }); setReason(""); }}>Block this version</button>}
    {/^[a-f0-9]{64}$/.test(artifact) && confirmBlock("artifact", artifact)}
    {status && <p role="status">{status}</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
  </section>;
}
