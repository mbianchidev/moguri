import { useState } from "react";
import { HOSTED_PROVIDERS, type HostedProviderId, type MoguriSdk, type ProviderState } from "../../../packages/sdk/src/index.ts";
import { SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";
import { ProviderCard, providerLogoId, providerStatus } from "./ProviderLogo.tsx";

const subtitles: Record<HostedProviderId, string> = {
  openrouter: "Add an API key, or sign in to mint a key you control.",
  anthropic: "API key billed by the Anthropic API.",
  openai: "API key billed by the OpenAI API platform.",
  chatgpt: "Sign in with ChatGPT to use your ChatGPT plan instead of API billing.",
};

/** Hosted provider accounts. Keys go straight to the service's secret backend; nothing is kept in renderer state after saving. */
export function HostedProviderConnect({ provider, run, client, disabled }: {
  provider: ProviderState; run: (action: () => Promise<unknown>) => Promise<void>; client: MoguriSdk; disabled: boolean;
}) {
  const [keys, setKeys] = useState<Partial<Record<HostedProviderId, string>>>({});
  const [codes, setCodes] = useState<Partial<Record<HostedProviderId, string>>>({});
  const [editing, setEditing] = useState<HostedProviderId | null>(null);
  const connected = (id: HostedProviderId) => provider.catalogue?.providers.find((entry) => entry.id === id && entry.scope === "hosted");
  const closeKey = (id: HostedProviderId, refocus = false) => {
    setEditing((current) => current === id ? null : current); setKeys((current) => ({ ...current, [id]: "" }));
    if (refocus) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[aria-controls="hosted-key-${id}"]`)?.focus());
  };
  return HOSTED_PROVIDERS.map((definition) => {
    const id = definition.id, state = connected(id), account = state?.account, login = account?.login ?? null, methods: readonly string[] = definition.methods;
    const keyOpen = editing === id, formId = `hosted-key-${id}`, models = provider.models.filter((model) => model.providerId === id).length;
    const save = (key: string) => run(async () => { await client.models.hosted.setKey(id as "openrouter", key); closeKey(id); });
    const signIn = methods.includes("oauth") && !login && !account?.credential;
    const keyLabel = definition.name.endsWith(" API") ? `${definition.name} key` : `${definition.name} API key`;
    return <ProviderCard key={id} label={definition.name.endsWith(" account") ? definition.name : `${definition.name} account`} logo={providerLogoId({ id, scope: "hosted" })} name={definition.name}
      help={{ label: `About ${definition.name}`, content: definition.description }}
      status={login ? "connecting" : state ? providerStatus(state.status, state.enabled) : "disconnected"}
      subtitle={subtitles[id]}
      meta={account?.credential ? `Connected with ${account.credential === "oauth" ? "sign-in" : "an API key"}. ${models} model${models === 1 ? "" : "s"} selectable.` : undefined}
      actions={<>
        {methods.includes("api_key") && !login && <button aria-expanded={keyOpen} aria-controls={formId} disabled={disabled} onClick={() => keyOpen ? closeKey(id) : setEditing(id)}>
          {account?.credential === "api_key" ? "Replace key" : account?.credential ? "Use an API key" : "Add API key"}</button>}
        {signIn && <button className={methods.length === 1 ? "primary" : undefined} disabled={disabled || state?.status === "connecting"}
          onClick={() => void run(() => client.models.hosted.login(id as "chatgpt"))}>{id === "chatgpt" ? "Continue with ChatGPT" : "Sign in with OpenRouter"}</button>}
        {account?.credential && <button onClick={() => void run(() => client.models.refresh())} disabled={disabled}>Refresh</button>}
        {state && !login && <button className="quiet" disabled={disabled} aria-label={account?.credential ? `Sign out of ${definition.name} and remove credential` : `Remove provider ${definition.name}`}
          onClick={() => void run(() => client.models.hosted.remove(id))}>{account?.credential ? "Sign out" : "Remove provider"}</button>}
      </>}>
      {(keyOpen || login || (id === "chatgpt" && account?.credential) || (state?.diagnostic && state.status !== "connecting")) && <>
        {keyOpen && <form id={formId} className="provider-key-form" onSubmit={(event) => { event.preventDefault(); const key = keys[id]?.trim(); if (key) void save(key); }}>
          <SettingsInput type="password" autoComplete="off" autoFocus aria-label={keyLabel} placeholder={account?.credential === "api_key" ? "Replace the stored key" : "Paste your API key"}
            value={keys[id] ?? ""} disabled={disabled} onChange={(event) => setKeys((current) => ({ ...current, [id]: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeKey(id, true); } }} />
          <button type="submit" className="primary" disabled={disabled || !keys[id]?.trim()}>Save key</button>
          <button type="button" className="quiet" onClick={() => closeKey(id, true)}>Cancel</button>
          <p className="fine-print">Stored in your OS keychain. It never reaches this window again, logs or model context.</p>
        </form>}
        {login && <div className="device-flow">
          <p>{login.instructions ?? "Complete sign-in in your browser."}</p>
          <div className="button-row">
            <button className="primary" onClick={() => void run(() => window.moguri.openExternal(login.url))}>Open sign-in page</button>
            <button className="quiet" onClick={() => void run(() => client.models.hosted.cancel(id))}>Cancel sign-in</button>
          </div>
          <form className="provider-key-form" onSubmit={(event) => { event.preventDefault(); const code = codes[id]?.trim();
            if (code) void run(async () => { await client.models.hosted.submitCode(id as "chatgpt", code); setCodes((current) => ({ ...current, [id]: "" })); }); }}>
            <SettingsInput type="password" autoComplete="off" aria-label={`${definition.name} redirect URL`} placeholder="Paste the final redirect URL if the browser cannot reach this computer"
              value={codes[id] ?? ""} onChange={(event) => setCodes((current) => ({ ...current, [id]: event.target.value }))} />
            <button type="submit" disabled={!codes[id]?.trim()}>Submit redirect URL</button>
          </form>
        </div>}
        {id === "chatgpt" && account?.credential && <p className="fine-print">You're using your ChatGPT plan. Eligible usage in Moguri uses your ChatGPT plan; manage it in your ChatGPT settings.{" "}
          <button className="quiet" onClick={() => void run(() => window.moguri.openExternal("https://chatgpt.com/settings/usage"))}>Manage usage</button></p>}
        {state?.diagnostic && state.status !== "connecting" && <Alert as="p" className="inline-error" role="status">{state.diagnostic}</Alert>}
      </>}
    </ProviderCard>;
  });
}
