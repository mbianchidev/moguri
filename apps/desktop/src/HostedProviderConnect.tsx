import { useState } from "react";
import { HOSTED_PROVIDERS, type HostedProviderId, type MoguriSdk, type ProviderState } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

/** Hosted provider accounts. Keys go straight to the service's secret backend; nothing is kept in renderer state after saving. */
export function HostedProviderConnect({ provider, run, client, disabled }: {
  provider: ProviderState; run: (action: () => Promise<unknown>) => Promise<void>; client: MoguriSdk; disabled: boolean;
}) {
  const [keys, setKeys] = useState<Partial<Record<HostedProviderId, string>>>({});
  const [codes, setCodes] = useState<Partial<Record<HostedProviderId, string>>>({});
  const connected = (id: HostedProviderId) => provider.catalogue?.providers.find((entry) => entry.id === id && entry.scope === "hosted");
  return <section className="provider-setup" aria-label="Hosted model providers">
    <SettingsHelp label="About hosted providers" target={<h2>Hosted providers</h2>}>Connect your own OpenRouter, Anthropic API, OpenAI API or ChatGPT account. Keys and sign-in tokens stay in your OS keychain and never reach the renderer, logs or model context. API keys bill the provider's API; Sign in with ChatGPT uses your ChatGPT plan. Claude.ai subscription sign-in is not offered because Anthropic does not permit it for third-party apps.</SettingsHelp>
    {HOSTED_PROVIDERS.map((definition) => {
      const state = connected(definition.id), account = state?.account, login = account?.login ?? null, methods: readonly string[] = definition.methods;
      const save = (key: string) => run(async () => { await client.models.hosted.setKey(definition.id as "openrouter", key); setKeys((current) => ({ ...current, [definition.id]: "" })); });
      return <div key={definition.id} className="hosted-provider" aria-label={`${definition.name} account`}>
        <h3>{definition.name}</h3>
        <p className="fine-print">{definition.description}</p>
        {state && <p className={state.status === "connected" ? "connected-label" : "muted"}>{state.status === "connected" ?
          `Connected with ${account?.credential === "oauth" ? "sign-in" : "an API key"}. ${provider.models.filter((model) => model.providerId === definition.id).length} models selectable.` :
          state.status === "connecting" ? "Checking..." : "Not connected."}</p>}
        {methods.includes("api_key") && <form className="button-row" onSubmit={(event) => { event.preventDefault(); const key = keys[definition.id]?.trim(); if (key) void save(key); }}>
          <SettingsInput type="password" autoComplete="off" aria-label={`${definition.name} API key`} placeholder={account?.credential === "api_key" ? "Replace the stored key" : "Paste your API key"}
            value={keys[definition.id] ?? ""} disabled={disabled} onChange={(event) => setKeys((current) => ({ ...current, [definition.id]: event.target.value }))} />
          <button type="submit" disabled={disabled || !keys[definition.id]?.trim()}>Save key</button>
        </form>}
        {methods.includes("oauth") && (login ? <div className="device-flow">
          <p>{login.instructions ?? "Complete sign-in in your browser."}</p>
          <button className="primary" onClick={() => void run(() => window.moguri.openExternal(login.url))}>Open sign-in page</button>
          <form className="button-row" onSubmit={(event) => { event.preventDefault(); const code = codes[definition.id]?.trim();
            if (code) void run(async () => { await client.models.hosted.submitCode(definition.id as "chatgpt", code); setCodes((current) => ({ ...current, [definition.id]: "" })); }); }}>
            <SettingsInput type="password" autoComplete="off" aria-label={`${definition.name} redirect URL`} placeholder="Paste the final redirect URL if the browser cannot reach this computer"
              value={codes[definition.id] ?? ""} onChange={(event) => setCodes((current) => ({ ...current, [definition.id]: event.target.value }))} />
            <button type="submit" disabled={!codes[definition.id]?.trim()}>Submit redirect URL</button>
          </form>
          <button className="quiet" onClick={() => void run(() => client.models.hosted.cancel(definition.id))}>Cancel sign-in</button>
        </div> : <button className={methods.length === 1 ? "primary" : undefined} disabled={disabled || state?.status === "connecting"}
          onClick={() => void run(() => client.models.hosted.login(definition.id as "chatgpt"))}>{definition.id === "chatgpt" ? "Sign in with ChatGPT" : "Sign in with OpenRouter"}</button>)}
        {state && <div className="button-row">
          {account?.credential && <button onClick={() => void run(() => client.models.refresh())} disabled={disabled}>Refresh</button>}
          <button className="quiet" disabled={disabled} onClick={() => void run(() => client.models.hosted.remove(definition.id))}>{account?.credential ? "Sign out and remove credential" : "Remove provider"}</button>
        </div>}
        {state?.diagnostic && state.status !== "connecting" && <Alert as="p" className="inline-error" role="status">{state.diagnostic}</Alert>}
      </div>;
    })}
  </section>;
}
