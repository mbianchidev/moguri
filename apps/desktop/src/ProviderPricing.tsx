import { useEffect, useRef, useState } from "react";
import { API_EQUIVALENT_NOTICE, type MoguriSdk, type PriceProvider, type PricingResponse, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { dollars } from "./BudgetControls.tsx";

export function ProviderPricing({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [catalog, setCatalog] = useState<PricingResponse | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false), [jobId, setJobId] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    let current = true;
    void sdk.prices.catalog().then((value) => { if (current) setCatalog(value); }).catch((error: unknown) => {
      if (current) setError(error instanceof Error ? error.message : "Provider references are unavailable. No zero rates were substituted.");
    });
    return () => { current = false; };
  }, [sdk, snapshot.providerPriceRevision, snapshot.provider.models]);
  const refresh = async (provider?: PriceProvider) => {
    if (inFlight.current || !catalog) return;
    inFlight.current = true; setPending(true); setError(""); setNotice("");
    try {
      const started = await sdk.prices.refresh(provider ? [provider] : undefined, catalog.revision);
      setJobId(started.id!);
      const completed = await sdk.jobs.wait(started.id!);
      if (completed.status !== "completed") throw new Error(completed.error ?? `The original price refresh is ${completed.status}. Previous references were preserved.`);
      setCatalog(await sdk.prices.catalog());
      setNotice("Official reference prices refreshed. Historical calls were not repriced; no model request or authentication occurred.");
    } catch (error) { setError(error instanceof Error ? error.message : "Price refresh failed. Previous references and historical costs were preserved."); }
    finally { inFlight.current = false; setPending(false); }
  };
  return <section className="provider-pricing" aria-label="Provider API-equivalent prices" aria-busy={pending}>
    <h3>Provider API-equivalent prices</h3><p className="fine-print">{API_EQUIVALENT_NOTICE}</p>
    <p className="fine-print">For example, a name-matched Opus 5.5 uses Anthropic's API rates even through Copilot. Unknown, ambiguous or expired rates stay unknown. Text-token estimates exclude subscriptions, regional/service surcharges and separate hosted-tool charges.</p>
    <button type="button" disabled={pending || !catalog} onClick={() => void refresh()} aria-label="Refresh official provider prices">Refresh</button>
    {pending && jobId && <button type="button" onClick={() => void sdk.jobs.cancel(jobId).then(() => setNotice("Stop requested for the original refresh. Its final outcome remains authoritative.")).catch((error: unknown) => setError(error instanceof Error ? error.message : "Price refresh cancellation was not acknowledged."))} aria-label="Stop price refresh">Stop</button>}
    {catalog?.catalogs.map((source) => <div className="call-record" key={source.provider}><strong>{source.provider}</strong>
      <span>{source.prices.length} reference models / checked {source.observedAt} / {source.evidence === "bundled-verified-table" ? "bundled verified snapshot" : "explicit official-page refresh"}</span>
      <div className="button-row"><button type="button" className="quiet" disabled={pending} aria-label={`Refresh ${source.provider}`} onClick={() => void refresh(source.provider)}>Refresh</button>
        <button type="button" className="quiet" onClick={() => void window.moguri.openExternal(source.sourceUrl).catch((error: unknown) => setError(error instanceof Error ? error.message : "The official source could not be opened."))} aria-label="View source for official prices">View source</button></div>
    </div>)}
    {catalog && <details><summary>Current model matches ({catalog.matches.filter((match) => match.rate).length}/{catalog.matches.length})</summary>
      {catalog.matches.map((match) => <div className="call-record" key={match.modelId}><strong>{snapshot.provider.models.find((model) => model.id === match.modelId)?.name ?? match.modelId}</strong>
        <span>{match.rate ? `${dollars(match.rate.inputUsdPerMillion)} input / ${dollars(match.rate.outputUsdPerMillion)} output per million, API-equivalent` : match.diagnostic}</span>
        {match.rate?.source === "provider-api-equivalent" && <small>{match.rate.pricing.provider} / {match.rate.pricing.modelId} / captured source {match.rate.effectiveAt}</small>}
      </div>)}
    </details>}
    {notice && <p className="fine-print" role="status">{notice}</p>}{error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
