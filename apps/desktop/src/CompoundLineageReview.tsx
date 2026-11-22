import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import { type CompoundLineageInput, type CompoundLineageReview, type ModelInfo, type MoguriSdk } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export function CompoundLineageReview({ sdk, models, disabled, onPrepared, onDirty, onBusy }: {
  sdk: MoguriSdk; models: ModelInfo[]; disabled: boolean;
  onPrepared: (review: CompoundLineageReview, draftModelId: string, criticModelId: string) => void;
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const [draftModelId, setDraftModel] = useState(""), [criticModelId, setCriticModel] = useState("");
  const [draftLineage, setDraftLineage] = useState(""), [criticLineage, setCriticLineage] = useState("");
  const [sourceKind, setSourceKind] = useState<CompoundLineageInput["sourceKind"]>("reviewed-training-report");
  const [sourceUrl, setSourceUrl] = useState(""), [sourceText, setSourceText] = useState(""), [limitations, setLimitations] = useState("");
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 86400_000).toISOString());
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dirty = Boolean(draftModelId || criticModelId || draftLineage || criticLineage || sourceUrl || sourceText || limitations);
  const fields = JSON.stringify([draftModelId, criticModelId, draftLineage, criticLineage, sourceKind, sourceUrl, sourceText, limitations, validUntil]);
  useEffect(() => { setReviewed(false); }, [fields]);
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const reset = () => { setDraftModel(""); setCriticModel(""); setDraftLineage(""); setCriticLineage(""); setSourceUrl(""); setSourceText(""); setLimitations(""); setReviewed(false); };
  return <section className="candidate-section" aria-label="Source-backed lineage review" aria-busy={busy}>
    <SettingsHelp label="More about this setting" target={<h3>Independent model pair</h3>}>Adds the pair to your unsaved Kupo policy. Nothing is fetched and no model is called; save settings to apply it.</SettingsHelp><p className="fine-print">Critique needs a draft and critic model that you claim were trained independently, based on a source you reviewed. It's your claim, not proof.</p>

    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    <label className="setting-field">Draft model<select aria-label="Lineage draft model" value={draftModelId} disabled={disabled || busy} onChange={(event) => setDraftModel(event.target.value)}>
      <option value="">Choose a model</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} / {model.id}</option>)}</select></label>
    <label className="setting-field">Critic model<select aria-label="Lineage critic model" value={criticModelId} disabled={disabled || busy} onChange={(event) => setCriticModel(event.target.value)}>
      <option value="">Choose a model</option>{models.map((model) => <option key={model.id} value={model.id} disabled={model.id === draftModelId}>{model.name} / {model.id}</option>)}</select></label>
    <label className="setting-field">Draft model lineage, from the source<SettingsInput aria-label="Reviewed draft lineage" value={draftLineage} maxLength={256} disabled={disabled || busy} onChange={(event) => setDraftLineage(event.target.value)} /></label>
    <label className="setting-field">Critic model lineage, from the source<SettingsInput aria-label="Reviewed critic lineage" value={criticLineage} maxLength={256} disabled={disabled || busy} onChange={(event) => setCriticLineage(event.target.value)} /></label>
    <label className="setting-field">Source type<select aria-label="Lineage source kind" value={sourceKind} disabled={disabled || busy} onChange={(event) => {
      const value = event.target.value;
      if (value === "reviewed-model-card" || value === "reviewed-training-report" || value === "reviewed-independent-audit") setSourceKind(value);
    }}><option value="reviewed-training-report">Training report</option><option value="reviewed-model-card">Model card</option><option value="reviewed-independent-audit">Independent audit</option></select></label>
    <label className="setting-field">Source URL (HTTPS)<SettingsInput aria-label="Lineage source URL" value={sourceUrl} disabled={disabled || busy} onChange={(event) => setSourceUrl(event.target.value)} /></label>
    <label className="setting-field">Source text<SettingsTextarea aria-label="Lineage source text" value={sourceText} maxLength={16384} disabled={disabled || busy} onChange={(event) => setSourceText(event.target.value)} /></label>
    <label className="setting-field">Expires (UTC ISO timestamp)<SettingsInput aria-label="Lineage review expiry" value={validUntil} disabled={disabled || busy} onChange={(event) => setValidUntil(event.target.value)} /></label>
    <label className="setting-field">Limitations<SettingsTextarea aria-label="Lineage review limitations" value={limitations} maxLength={1200} disabled={disabled || busy} onChange={(event) => setLimitations(event.target.value)} /></label>
    <label className="check-setting"><SettingsInput aria-label="Reviewed exact lineage source" type="checkbox" checked={reviewed} disabled={disabled || busy} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this source and model pair. I'm claiming they're independent enough for Critique, not proving it or vouching for code quality.</label>
    <div className="button-row"><button disabled={disabled || busy || !reviewed || !draftModelId || !criticModelId || !draftLineage.trim() || !criticLineage.trim() || !sourceUrl || !sourceText.trim() || !limitations.trim()}
      onClick={() => { setBusy(true); setError(""); setNotice(""); void sdk.compound.lineageDraft({ draftModelId, criticModelId, draftLineage, criticLineage, sourceKind, sourceUrl, sourceText, validUntil, limitations })
        .then((value) => { onPrepared(value.review, draftModelId, criticModelId); reset(); setNotice("Added to the unsaved policy and matching Critique routes. Save settings to apply it."); })
        .catch((error: unknown) => setError(error instanceof Error ? error.message : "Couldn't add this pair. Your input was kept."))
        .finally(() => setBusy(false)); }} aria-label="Add to draft: reviewed lineage claim">Add to draft</button>
      <button disabled={disabled || busy || !dirty} onClick={reset} aria-label="Discard unsaved lineage form">Discard</button></div>
  </section>;
}
