import { useEffect, useRef, useState } from "react";
import { fuzzyMatch, type MoguriSdk, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

type AvailabilityChange = { kind: "provider" | "model"; id: string; enabled: boolean } | { kind: "source"; apiModelId: string; modelId: string };
export function ModelAvailabilityPanel({ sdk, snapshot, disabled, onBusy }: {
  sdk: MoguriSdk; snapshot: Snapshot; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState(""), [change, setChange] = useState<AvailabilityChange | null>(null), [error, setError] = useState("");
  const pending = useRef(false), catalogue = snapshot.provider.catalogue, busy = change !== null;
  useEffect(() => () => onBusy(false), [onBusy]);
  const run = async (next: AvailabilityChange, action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setChange(next); onBusy(true); setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The model preference was not acknowledged. Inspect the saved state before retrying."); }
    finally { pending.current = false; setChange(null); onBusy(false); }
  };
  if (!catalogue) return <p role="status">Waiting for this profile's authoritative provider inventory. No default models were substituted.</p>;
  const providerName = (id?: string) => catalogue.providers.find((provider) => provider.id === id)?.name ?? id ?? "Unknown provider";
  const models = catalogue.models.filter((model) => fuzzyMatch(search, `${model.name} ${model.apiModelId} ${model.offerings.map((entry) => providerName(entry.model.providerId)).join(" ")}`));
  return <section className="model-availability" aria-label="Provider and model availability">
    <SettingsHelp label="About provider availability" target={<h3>Generative providers</h3>}>These preferences belong to this profile. Disabling a provider retains its login and configuration but blocks new model selections and admissions. Existing calls keep their actual outcome and charges. Enabling never signs in or starts inference.</SettingsHelp>
    <div className="model-provider-list">{catalogue.providers.map((provider) => <div className="model-provider-row" key={provider.id}>
      <div><strong>{provider.name}</strong><small>{provider.scope === "copilot" ? "GitHub Copilot" : provider.scope === "remote" ? "Configured SSH endpoint" : "Configured local endpoint"} / {provider.enabled ? provider.status : "disabled"}</small>
        {provider.diagnostic && <small>{provider.diagnostic}</small>}</div>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable provider ${provider.name}`}
        checked={change?.kind === "provider" && change.id === provider.id ? change.enabled : provider.enabled} disabled={disabled || busy}
        onChange={(event) => { const enabled = event.target.checked; void run({ kind: "provider", id: provider.id, enabled }, () => sdk.models.setProviderEnabled(provider.id, enabled, snapshot.settings.revision)); }} /><span className="sr-only">Enable {provider.name}</span></label>
    </div>)}</div>
    <SettingsHelp label="About selectable models" target={<h3>Enabled models and sources</h3>}>Only enabled, available, selected sources appear in model pickers or work through /model and routing. Exact matching upstream IDs share one row; choose one provider when multiple sources offer that ID. A saved source never silently changes when unavailable. These declarations are not model-family, independence or quality proof.</SettingsHelp>
    <label className="setting-field">Search models<SettingsInput type="search" aria-label="Search model availability" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Model, ID or provider" /></label>
    <p className="fine-print">{catalogue.models.filter((model) => model.diagnostic === null).length} selectable / {catalogue.models.length} known model{catalogue.models.length === 1 ? "" : "s"}.</p>
    <p className="fine-print" role="status" aria-label="Model availability saving">{busy ? "Saving availability..." : "Changes save automatically."}</p>
    {models.map((model) => <div className="model-availability-row" role="group" aria-label={`Model ${model.apiModelId}`} key={model.apiModelId}>
      <div><strong>{model.name}</strong><code>{model.apiModelId}</code>{model.diagnostic && <small>{model.diagnostic}</small>}</div>
      {model.offerings.length > 1 || model.sourceModelId && !model.offerings.some((entry) => entry.model.id === model.sourceModelId) ?
        <label className="setting-field model-source-choice"><span className="sr-only">Provider for {model.apiModelId}</span><select aria-label={`Provider for ${model.apiModelId}`}
          value={change?.kind === "source" && change.apiModelId === model.apiModelId ? change.modelId : model.sourceModelId ?? ""} disabled={disabled || busy}
          onChange={(event) => { const modelId = event.target.value; void run({ kind: "source", apiModelId: model.apiModelId, modelId }, () => sdk.models.selectSource(model.apiModelId, modelId, snapshot.settings.revision)); }}>
          <option value="" disabled>Choose one provider</option>
          {model.sourceModelId && !model.offerings.some((entry) => entry.model.id === model.sourceModelId) && <option value={model.sourceModelId} disabled>Saved source unavailable</option>}
          {model.offerings.map((entry) => <option key={entry.model.id} value={entry.model.id} disabled={!entry.available || !catalogue.providers.find((provider) => provider.id === entry.model.providerId)?.enabled}>
            {providerName(entry.model.providerId)} / {entry.available ? entry.model.environments?.join(", ") ?? "Local" : "not ready"}
          </option>)}
        </select></label> : <span className="fine-print">{providerName(model.offerings[0]?.model.providerId)}</span>}
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable model ${model.apiModelId}`}
        checked={change?.kind === "model" && change.id === model.apiModelId ? change.enabled : model.enabled} disabled={disabled || busy}
        onChange={(event) => { const enabled = event.target.checked; void run({ kind: "model", id: model.apiModelId, enabled }, () => sdk.models.setEnabled(model.apiModelId, enabled, snapshot.settings.revision)); }} /><span className="sr-only">Enable {model.name}</span></label>
    </div>)}
    {!models.length && <p className="fine-print">{search ? "No matching model in this profile's inventory." : "No model has been advertised or explicitly configured. Sign in or configure a provider; none will be guessed."}</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
