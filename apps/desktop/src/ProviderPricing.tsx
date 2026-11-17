import { useEffect, useRef, useState } from "react";
import { type MoguriSdk, type PriceProvider, type PricingResponse, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { dollars } from "./BudgetControls.tsx";
import { Alert } from "./Alert.tsx";

export function ProviderPricing({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [catalog, setCatalog] = useState<PricingResponse | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false), [jobId, setJobId] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    let current = true;
    void sdk.prices.catalog().then((value) => { if (current) setCatalog(value); }).catch((error: unknown) => {
      if (current) setError(error instanceof Error ? error.message : "Couldn't load prices. Unknown prices aren't treated as free.");
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
      if (completed.status !== "completed") throw new Error(completed.error ?? `Price refresh ${completed.status}. Previous prices were kept.`);
      setCatalog(await sdk.prices.catalog());
      setNotice("Official reference prices refreshed. Past calls keep the prices they were charged at.");
    } catch (error) { setError(error instanceof Error ? error.message : "Price refresh failed. Previous prices were kept."); }
    finally { inFlight.current = false; setPending(false); }
  };
  return <section className="provider-pricing" aria-label="Provider API-equivalent prices" aria-busy={pending}>
    <h3>Model prices</h3><p className="fine-print">Estimates use each model maker's public API prices, even through Copilot or another reseller. They aren't your subscription cost or bill.</p>
    <p className="fine-print">Models without a current price show as unknown, not free.</p>
    <button type="button" disabled={pending || !catalog} onClick={() => void refresh()} aria-label="Refresh official provider prices">Refresh</button>
    {pending && jobId && <button type="button" onClick={() => void sdk.jobs.cancel(jobId).then(() => setNotice("Stop requested.")).catch((error: unknown) => setError(error instanceof Error ? error.message : "Stop wasn't confirmed."))} aria-label="Stop price refresh">Stop</button>}
    {catalog?.catalogs.map((source) => <div className="call-record" key={source.provider}><strong>{source.provider}</strong>
      <span>{source.prices.length} models / checked {source.observedAt} / {source.evidence === "bundled-verified-table" ? "bundled with Moguri" : "refreshed from the official page"}</span>
      <div className="button-row"><button type="button" className="quiet" disabled={pending} aria-label={`Refresh ${source.provider}`} onClick={() => void refresh(source.provider)}>Refresh</button>
        <button type="button" className="quiet" onClick={() => void window.moguri.openExternal(source.sourceUrl).catch((error: unknown) => setError(error instanceof Error ? error.message : "Couldn't open the price page."))} aria-label="View source for official prices">View source</button></div>
    </div>)}
    {catalog && <details><summary>Your models with prices ({catalog.matches.filter((match) => match.rate).length}/{catalog.matches.length})</summary>
      {catalog.matches.map((match) => <div className="call-record" key={match.modelId}><strong>{snapshot.provider.models.find((model) => model.id === match.modelId)?.name ?? match.modelId}</strong>
        <span>{match.rate ? `${dollars(match.rate.inputUsdPerMillion)} input / ${dollars(match.rate.outputUsdPerMillion)} output per million tokens` : match.diagnostic}</span>
        {match.rate?.source === "provider-api-equivalent" && <small>{match.rate.pricing.provider} / {match.rate.pricing.modelId} / price from {match.rate.effectiveAt}</small>}
      </div>)}
    </details>}
    {notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
