import { useEffect, useRef, useState } from "react";
import { fuzzyMatch, type MoguriSdk, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";
import { ProviderLogo, providerLogoId } from "./ProviderLogo.tsx";
import { GroupedModelList, modelPriceText } from "./GroupedModelList.tsx";

type AvailabilityChange = { kind: "provider" | "model"; id: string; enabled: boolean } | { kind: "source"; apiModelId: string; modelId: string } | { kind: "refresh" };
export function ModelAvailabilityPanel({ sdk, snapshot, disabled, onBusy }: {
  sdk: MoguriSdk; snapshot: Snapshot; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState(""), [change, setChange] = useState<AvailabilityChange | null>(null), [error, setError] = useState("");
  const pending = useRef(false), catalogue = snapshot.provider.catalogue, busy = change !== null;
  useEffect(() => () => onBusy(false), [onBusy]);
  const run = async (next: AvailabilityChange, action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setChange(next); if (next.kind !== "refresh") onBusy(true); setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The change couldn't be confirmed. Check the current setting before retrying."); }
    finally { pending.current = false; setChange(null); if (next.kind !== "refresh") onBusy(false); }
  };
  if (!catalogue) return <p role="status">Loading providers...</p>;
  const providerName = (id?: string) => catalogue.providers.find((provider) => provider.id === id)?.name ?? id ?? "Unknown provider";
  const entries = new Map(catalogue.models.map((model) => [model.apiModelId, model] as const));
  const models = catalogue.models.filter((model) => fuzzyMatch(search, `${model.name} ${model.apiModelId} ${model.offerings.map((entry) => providerName(entry.model.providerId)).join(" ")}`));
  return <section className="model-availability" aria-label="Provider and model availability">
    <div className="provider-section-header">
      <SettingsHelp label="About provider availability" target={<h3>Availability</h3>}>Turning a provider off hides its models from new chats in this profile but keeps its sign-in. Calls already made are unaffected.</SettingsHelp>
      <button type="button" disabled={disabled || busy} aria-label="Refresh available models" onClick={() => void run({ kind: "refresh" }, () => sdk.models.refresh())}>
        {change?.kind === "refresh" ? "Refreshing models..." : "Refresh available models"}
      </button>
    </div>
    <p className="fine-print">Models refresh when the app opens. Refresh again after changing an account or starting a local server.</p>
    <div className="model-provider-list">{catalogue.providers.map((provider) => <div className="model-provider-row" key={provider.id}>
      <ProviderLogo logo={providerLogoId(provider)} fallback={provider.scope === "remote" ? "Globe" : "House"} />
      <div><strong>{provider.name}</strong><small>{provider.scope === "copilot" ? "GitHub Copilot" : provider.scope === "remote" ? "Configured SSH endpoint" : provider.scope === "agent" ? `Your installed ${provider.source === "codex-agent" ? "Codex" : "Claude Code"}` : provider.scope === "hosted" ? "Your hosted account" : "Configured local endpoint"} / {provider.enabled ? provider.status : "disabled"}</small>
        {provider.diagnostic && <small>{provider.diagnostic}</small>}</div>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable provider ${provider.name}`}
        checked={change?.kind === "provider" && change.id === provider.id ? change.enabled : provider.enabled} disabled={disabled || busy}
        onChange={(event) => { const enabled = event.target.checked; void run({ kind: "provider", id: provider.id, enabled }, () => sdk.models.setProviderEnabled(provider.id, enabled, snapshot.settings.revision)); }} /><span className="sr-only">Enable {provider.name}</span></label>
    </div>)}</div>
    <SettingsHelp label="About selectable models" target={<h3>Enabled models and sources</h3>}>Only enabled models appear in model pickers, /model and routing. When several providers offer the same model ID, choose which one to use.</SettingsHelp>
    <label className="setting-field">Search models<SettingsInput type="search" aria-label="Search model availability" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Model, ID or provider" /></label>
    <p className="fine-print">{catalogue.models.filter((model) => model.diagnostic === null).length} selectable / {catalogue.models.length} known model{catalogue.models.length === 1 ? "" : "s"}.</p>
    <p className="fine-print" role="status" aria-label="Model availability saving">{change?.kind === "refresh" ? "Refreshing available models..." : busy ? "Saving availability..." : "Changes save automatically."}</p>
    <GroupedModelList label="Models by provider" query={search} priceInRow emptyText="No models yet. Sign in or configure a provider."
      items={models.map((model) => {
        // One row per model, under the provider that serves it: the chosen source, else the first available offering.
        const offering = model.offerings.find((entry) => entry.model.id === model.sourceModelId) ?? model.offerings.find((entry) => entry.available) ?? model.offerings[0]!;
        return { key: model.apiModelId, model: { ...offering.model, name: model.name }, provider: catalogue.providers.find((provider) => provider.id === offering.model.providerId) ?? null,
          price: snapshot.modelPrices?.[offering.model.id] ?? null };
      })}
      row={(item) => { const model = entries.get(item.key)!; return <div className="model-availability-row" role="group" aria-label={`Model ${model.apiModelId}`}>
      <div><strong>{model.name}</strong><code>{model.apiModelId}</code>{model.diagnostic && <small>{model.diagnostic}</small>}</div>
      <span className="model-price">{modelPriceText(item.price)}</span>
      {model.offerings.length > 1 || model.sourceModelId && !model.offerings.some((entry) => entry.model.id === model.sourceModelId) ?
        <label className="setting-field model-source-choice"><span className="sr-only">Provider for {model.apiModelId}</span><select aria-label={`Provider for ${model.apiModelId}`}
          value={change?.kind === "source" && change.apiModelId === model.apiModelId ? change.modelId : model.sourceModelId ?? ""} disabled={disabled || busy}
          onChange={(event) => { const modelId = event.target.value; void run({ kind: "source", apiModelId: model.apiModelId, modelId }, () => sdk.models.selectSource(model.apiModelId, modelId, snapshot.settings.revision)); }}>
          <option value="" disabled>Choose one provider</option>
          {model.sourceModelId && !model.offerings.some((entry) => entry.model.id === model.sourceModelId) && <option value={model.sourceModelId} disabled>Saved source unavailable</option>}
          {model.offerings.map((entry) => <option key={entry.model.id} value={entry.model.id} disabled={!entry.available || !catalogue.providers.find((provider) => provider.id === entry.model.providerId)?.enabled}>
            {providerName(entry.model.providerId)} / {entry.available ? entry.model.environments?.join(", ") ?? "Local" : "not ready"}
          </option>)}
        </select></label> : null}
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable model ${model.apiModelId}`}
        checked={change?.kind === "model" && change.id === model.apiModelId ? change.enabled : model.enabled} disabled={disabled || busy}
        onChange={(event) => { const enabled = event.target.checked; void run({ kind: "model", id: model.apiModelId, enabled }, () => sdk.models.setEnabled(model.apiModelId, enabled, snapshot.settings.revision)); }} /><span className="sr-only">Enable {model.name}</span></label>
    </div>; }} />
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
