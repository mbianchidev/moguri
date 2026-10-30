import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import { COMPOUND_EVIDENCE_WARNING, type CompoundLineageInput, type CompoundLineageReview, type ModelInfo, type MoguriSdk } from "../../../packages/sdk/src/index.ts";
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
    <SettingsHelp label="More about this setting" target={<h3>Actual-user source claim</h3>}>This prepares a local policy draft only. No source URL is fetched, provider metadata inspected, policy saved or model called. Save settings separately after reviewing the complete policy.</SettingsHelp><p className="fine-print">{COMPOUND_EVIDENCE_WARNING}</p>

    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    <label className="setting-field">Exact draft model<select aria-label="Lineage draft model" value={draftModelId} disabled={disabled || busy} onChange={(event) => setDraftModel(event.target.value)}>
      <option value="">Choose actual draft binding</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} / {model.id}</option>)}</select></label>
    <label className="setting-field">Exact critic model<select aria-label="Lineage critic model" value={criticModelId} disabled={disabled || busy} onChange={(event) => setCriticModel(event.target.value)}>
      <option value="">Choose actual critic binding</option>{models.map((model) => <option key={model.id} value={model.id} disabled={model.id === draftModelId}>{model.name} / {model.id}</option>)}</select></label>
    <label className="setting-field">Source-backed draft lineage identifier<SettingsInput aria-label="Reviewed draft lineage" value={draftLineage} maxLength={256} disabled={disabled || busy} onChange={(event) => setDraftLineage(event.target.value)} /></label>
    <label className="setting-field">Source-backed critic lineage identifier<SettingsInput aria-label="Reviewed critic lineage" value={criticLineage} maxLength={256} disabled={disabled || busy} onChange={(event) => setCriticLineage(event.target.value)} /></label>
    <label className="setting-field">Reviewed source kind<select aria-label="Lineage source kind" value={sourceKind} disabled={disabled || busy} onChange={(event) => {
      const value = event.target.value;
      if (value === "reviewed-model-card" || value === "reviewed-training-report" || value === "reviewed-independent-audit") setSourceKind(value);
    }}><option value="reviewed-training-report">Reviewed training report</option><option value="reviewed-model-card">Reviewed model card</option><option value="reviewed-independent-audit">Reviewed independent audit</option></select></label>
    <label className="setting-field">HTTPS source URL<SettingsInput aria-label="Lineage source URL" value={sourceUrl} disabled={disabled || busy} onChange={(event) => setSourceUrl(event.target.value)} /></label>
    <label className="setting-field">Exact reviewed source text<SettingsTextarea aria-label="Lineage source text" value={sourceText} maxLength={16384} disabled={disabled || busy} onChange={(event) => setSourceText(event.target.value)} /></label>
    <label className="setting-field">Explicit review expiry, UTC ISO timestamp<SettingsInput aria-label="Lineage review expiry" value={validUntil} disabled={disabled || busy} onChange={(event) => setValidUntil(event.target.value)} /></label>
    <label className="setting-field">Evidence limitations<SettingsTextarea aria-label="Lineage review limitations" value={limitations} maxLength={1200} disabled={disabled || busy} onChange={(event) => setLimitations(event.target.value)} /></label>
    <label className="check-setting"><SettingsInput aria-label="Reviewed exact lineage source" type="checkbox" checked={reviewed} disabled={disabled || busy} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source and model pair. I am making a limited eligibility claim, not proving independent training or code quality.</label>
    <div className="button-row"><button disabled={disabled || busy || !reviewed || !draftModelId || !criticModelId || !draftLineage.trim() || !criticLineage.trim() || !sourceUrl || !sourceText.trim() || !limitations.trim()}
      onClick={() => { setBusy(true); setError(""); setNotice(""); void sdk.compound.lineageDraft({ draftModelId, criticModelId, draftLineage, criticLineage, sourceKind, sourceUrl, sourceText, validUntil, limitations })
        .then((value) => { onPrepared(value.review, draftModelId, criticModelId); reset(); setNotice("Exact model/source claim added only to the local policy draft and matching Critique routes. Review and Save settings separately; no model or source acceptance."); })
        .catch((error: unknown) => setError(error instanceof Error ? error.message : "Lineage draft could not be prepared. Your source and review fields were preserved."))
        .finally(() => setBusy(false)); }} aria-label="Add to draft: reviewed lineage claim">Add to draft</button>
      <button disabled={disabled || busy || !dirty} onClick={reset} aria-label="Discard unsaved lineage form">Discard</button></div>
  </section>;
}
