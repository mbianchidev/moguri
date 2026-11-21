import { useEffect, useRef, useState } from "react";
import type { ModelEvidenceReport, ModelInfo, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function ModelEvidencePanel({ sdk, model, scope, remote }: { sdk: MoguriSdk; model?: ModelInfo; scope: string; remote: boolean }) {
  const [report, setReport] = useState<{ sdk: MoguriSdk; scope: string; value: ModelEvidenceReport } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const operation = useRef(0), actualScope = useRef(scope); actualScope.current = scope;
  const supported = model?.source === "copilot" && model.providerId === "github-copilot" && !model.synthetic;
  const loaded = report?.sdk === sdk && report.scope === scope ? report.value : null;
  useEffect(() => {
    operation.current++; setReport(null); setError(""); setBusy(false);
    return () => { operation.current++; };
  }, [sdk, scope]);
  const inspect = async () => {
    if (!model || !supported) return;
    const token = ++operation.current, selected = model.id, captured = scope;
    setBusy(true); setReport(null); setError("");
    try {
      const result = await sdk.models.evidence(selected);
      if (operation.current !== token || actualScope.current !== captured) return;
      if (result.evidence.modelId !== selected || result.evidence.providerId !== "github-copilot") throw new Error("Evidence belongs to another model/provider. No report was displayed.");
      setReport({ sdk, scope: captured, value: result.evidence });
    } catch (error) {
      if (operation.current === token && actualScope.current === captured) setError(error instanceof Error ? error.message : "Copilot metadata could not be read. No model or family was substituted.");
    } finally { if (operation.current === token) setBusy(false); }
  };
  return <details className="model-tuning" aria-busy={busy}>
    <summary>Provider-declared model metadata</summary>
    <p className="fine-print">Explicit account-catalogue read only. No project content or inference; provider claims are not independent lineage, quality or approval.</p>
    {remote && <p className="fine-print">Metadata is read by the local control plane. Remote host inference still runs on your configured SSH host.</p>}
    {supported ? <button type="button" disabled={busy} onClick={() => void inspect()}>{busy ? "Reading Copilot catalogue..." : "Read Copilot model declarations"}</button> :
      <p className="fine-print">Choose an available concrete Copilot model. Local and Remote host endpoint families and synthetic model lineage remain unknown; names are never used to invent them.</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {loaded && <section className="model-evidence" aria-label="Provider-declared model evidence">
      <p className="fine-print" role="status">{loaded.status === "declared" ? "Provider declaration received, not independently verified." : "Provider family is unknown; no family was inferred."}</p>
      <dl className="composer-usage"><dt>Claimed family</dt><dd>{loaded.claimed.family ?? "Unknown / not declared"}</dd>
        <dt>Claimed vendor</dt><dd>{loaded.claimed.vendor ?? "Unknown / not declared"}</dd>
        <dt>Claimed version</dt><dd>{loaded.claimed.version ?? "Unknown / not declared"}</dd></dl>
      <details><summary>Exact observation and limits</summary>
        <p className="fine-print path">API model: {loaded.apiModelId}<br />Source: {loaded.source.endpoint}<br />Field: {loaded.source.familyField}<br />Observed: {loaded.observedAt}<br />Digest: {loaded.digest}</p>
        <p className="fine-print">{loaded.warning}</p>
      </details>
    </section>}
  </details>;
}
