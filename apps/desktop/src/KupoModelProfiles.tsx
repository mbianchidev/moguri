import { useEffect, useRef, useState } from "react";
import { KupoModelProfileInputSchema, parse, type KupoModelProfile, type ModelInfo, type MoguriSdk } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export function KupoModelProfiles({ sdk, models, disabled, onPrepared, onDirty, onBusy }: {
  sdk: MoguriSdk; models: ModelInfo[]; disabled: boolean; onPrepared: (profile: KupoModelProfile) => void;
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const [text, setText] = useState(""), [profile, setProfile] = useState<KupoModelProfile | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => { onDirty(Boolean(text || profile)); return () => onDirty(false); }, [text, profile, onDirty]);
  const prepare = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); onBusy(true); setError("");
    try { setProfile((await sdk.routing.profileDraft(parse(KupoModelProfileInputSchema, JSON.parse(text)))).profile); setReviewed(false); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn't read this profile. Nothing was saved."); }
    finally { pending.current = false; setBusy(false); onBusy(false); }
  };
  const template = {
    modelId: "", category: "economy", costClass: "", evaluationSet: "", scores: { reasoning: "", code: "", debugging: "", tools: "" },
    referencePrice: { inputUsdPerMillion: "", outputUsdPerMillion: "", basis: "provider-api-equivalent" },
    sourceUrl: "", sourceText: "", observedAt: "", validUntil: "", limitations: "",
  };
  return <details className="kupo-profile-review"><summary>Add model scores and prices</summary>
    <p>Savings and Performance class models by their published API price: up to $5 per million output tokens is economy, $20 or more is frontier, and local models are economy. A profile here overrides that class and adds scores for Cascade.</p>
    <p className="fine-print">Profiles expire 30 days after their observation date. Moguri doesn't run benchmarks; scores come from the source you paste.</p>
    <label className="setting-field">Model profile JSON<textarea className="json-editor" value={text} disabled={disabled || busy}
      placeholder={JSON.stringify(template, null, 2)} onChange={(event) => { setText(event.target.value); setProfile(null); setReviewed(false); }} /></label>
    <details><summary>Available model IDs</summary><pre>{JSON.stringify(models.map(({ id, name, source, thinkingLevels }) => ({ id, name, source, thinkingLevels })), null, 2)}</pre></details>
    <div className="button-row"><button type="button" disabled={disabled || busy || !text.trim()} onClick={() => void prepare()}>Preview profile</button>
      <button type="button" className="quiet" disabled={busy} onClick={() => { setText(""); setProfile(null); setReviewed(false); setError(""); }}>Discard profile draft</button></div>
    {profile && <section aria-label="Exact model profile review"><h3>{profile.modelId}: {profile.category}</h3>
      <p>{profile.sourceUrl}</p><pre className="scheduled-draft-preview">{profile.sourceText}</pre>
      <p className="fine-print">Evaluation set: {profile.evaluationSet}. Cost class: {profile.costClass}. Source SHA-256: {profile.sourceDigest}.</p>
      <p>Reference price: ${profile.referencePrice.inputUsdPerMillion} input / ${profile.referencePrice.outputUsdPerMillion} output per million tokens. {profile.referencePrice.basis === "local-no-api-fee" ? "No API fee, but token usage still counts toward budgets." : "Used to compare models; it isn't your bill and doesn't change budget prices."}</p>
      <p>{profile.limitations}</p>
      <label className="check-setting"><input type="checkbox" checked={reviewed} disabled={disabled || busy} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this source, class, scores, price and limitations</label>
      <button type="button" disabled={disabled || busy || !reviewed} onClick={() => {
        try { onPrepared(profile); setText(""); setProfile(null); setReviewed(false); }
        catch (error) { setError(error instanceof Error ? error.message : "The policy couldn't accept this profile. Your input was kept."); }
      }}>Add to Kupo policy</button>
    </section>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <p className="fine-print">Adding a profile doesn't call a model. Save settings to apply it.</p>
  </details>;
}
