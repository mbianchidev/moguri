import { useEffect, useRef, useState } from "react";
import { KupoModelProfileInputSchema, parse, type KupoModelProfile, type ModelInfo, type MoguriSdk } from "../../../packages/sdk/src/index.ts";
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
    catch (error) { setError(error instanceof Error ? error.message : "The exact model/source profile could not be prepared. Nothing was saved."); }
    finally { pending.current = false; setBusy(false); onBusy(false); }
  };
  const template = {
    modelId: "", category: "economy", costClass: "", evaluationSet: "", scores: { reasoning: "", code: "", debugging: "", tools: "" },
    referencePrice: { inputUsdPerMillion: "", outputUsdPerMillion: "", basis: "provider-api-equivalent" },
    sourceUrl: "", sourceText: "", observedAt: "", validUntil: "", limitations: "",
  };
  return <details className="kupo-profile-review"><summary>Review model evaluations and reference prices</summary>
    <p>Balanced can use declared capabilities. Savings and Performance need a current exact-model source review, including frontier/economy classification and API-equivalent reference prices. Unknown is never frontier, cheap, free or independent.</p>
    <p className="fine-print">Scores are source-reviewed normalized observations, not Moguri quality guarantees. Comparable Cascade models need the same evaluation-set SHA-256. Critique also needs a reviewed independent lineage pair and matching user-defined cost class. Evidence expires within 30 days of observation. No benchmark or metadata request runs here.</p>
    <label className="setting-field">Model profile JSON<textarea className="json-editor" value={text} disabled={disabled || busy}
      placeholder={JSON.stringify(template, null, 2)} onChange={(event) => { setText(event.target.value); setProfile(null); setReviewed(false); }} /></label>
    <details><summary>Exact available model IDs</summary><pre>{JSON.stringify(models.map(({ id, name, source, thinkingLevels }) => ({ id, name, source, thinkingLevels })), null, 2)}</pre></details>
    <div className="button-row"><button type="button" disabled={disabled || busy || !text.trim()} onClick={() => void prepare()}>Prepare source review</button>
      <button type="button" className="quiet" disabled={busy} onClick={() => { setText(""); setProfile(null); setReviewed(false); setError(""); }}>Discard profile draft</button></div>
    {profile && <section aria-label="Exact model profile review"><h3>{profile.modelId}: {profile.category}</h3>
      <p>{profile.sourceUrl}</p><pre className="scheduled-draft-preview">{profile.sourceText}</pre>
      <p className="fine-print">Source SHA-256: {profile.sourceDigest}. Evaluation set: {profile.evaluationSet}. Cost class: {profile.costClass}.</p>
      <p>Reference only: ${profile.referencePrice.inputUsdPerMillion} input / ${profile.referencePrice.outputUsdPerMillion} output per million tokens. {profile.referencePrice.basis === "local-no-api-fee" ? "No hosted API fee does not erase token usage, configured rates or unknown accounting." : "This is not billed cost or a rate-policy change."}</p>
      <p>{profile.limitations}</p>
      <label className="check-setting"><input type="checkbox" checked={reviewed} disabled={disabled || busy} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source, classification, scores, price and limitations</label>
      <button type="button" disabled={disabled || busy || !reviewed} onClick={() => {
        try { onPrepared(profile); setText(""); setProfile(null); setReviewed(false); }
        catch (error) { setError(error instanceof Error ? error.message : "The complete policy could not accept this profile. Its reviewed source was preserved."); }
      }}>Add to unsaved Kupo policy</button>
    </section>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <p className="fine-print">Adding a profile does not select a mode, call a model or grant permissions. Save the complete policy explicitly after review.</p>
  </details>;
}
