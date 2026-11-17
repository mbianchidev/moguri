import type { MoguriSdk, ProviderState } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { ProviderCard, providerStatus } from "./ProviderLogo.tsx";

export function ProviderConnect({ provider, run, client }: {
  provider: ProviderState; run: (action: () => Promise<unknown>) => Promise<void>; client: MoguriSdk;
}) {
  const copilot = provider.connections?.find((connection) => connection.id === "github-copilot") ?? provider;
  const enabled = provider.catalogue?.providers.find((connection) => connection.id === "github-copilot")?.enabled ?? true;
  const connected = copilot.status === "connected";
  const models = provider.models.filter((model) => !model.synthetic && model.providerId === "github-copilot").length;
  const status = provider.login && !connected ? "connecting" : providerStatus(copilot.status, enabled);
  return <ProviderCard label="GitHub Copilot connection" logo="github-copilot" name="GitHub Copilot" status={status}
    help={connected ? undefined : { label: "About GitHub Copilot sign-in", content: "Uses pi-ai's third-party device flow, not an official Moguri partnership. GitHub subscription and organization policies apply. Sign-in may enable account model policies. Credentials stay in your OS keychain." }}
    subtitle={connected ? "Connected through your Copilot account." : "Use your existing Copilot subscription. No other provider key is needed."}
    meta={connected ? `${models} enabled Copilot model${models === 1 ? "" : "s"} selectable. Choose one in the composer.` : undefined}
    actions={connected ? <>
      <button disabled={!enabled} onClick={() => void run(() => client.command({ type: "provider.refresh" }))} aria-label="Refresh connection">Refresh</button>
      <button className="quiet" onClick={() => void run(() => client.command({ type: "provider.logout" }))}>Sign out</button>
    </> : !provider.login && <button className="primary" disabled={!enabled || copilot.status === "connecting"} onClick={() => void run(() => client.command({ type: "provider.login" }))}
      aria-label={copilot.status === "connecting" ? "Starting sign-in..." : "Sign in with GitHub Copilot"}>{copilot.status === "connecting" ? "Starting..." : "Sign in"}</button>}>
    {(!enabled || (!connected && provider.login) || copilot.diagnostic) && <>
      {!enabled && <p className="fine-print">Copilot is disabled in this profile. Its existing login is retained; enable the provider under Availability before using its models.</p>}
      {!connected && provider.login && <div className="device-flow">
        <p>Open GitHub and enter this one-time code:</p><code aria-label="GitHub device code">{provider.login.code}</code>
        <div className="button-row">
          <button className="primary" disabled={!enabled} onClick={() => void run(() => window.moguri.openExternal(provider.login!.url))}>Open GitHub</button>
          <button className="quiet" onClick={() => void run(() => client.command({ type: "provider.cancel" }))}>Cancel sign-in</button>
        </div>
        <p className="fine-print">Waiting for authorization. Expires at {new Date(provider.login.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
      </div>}
      {copilot.diagnostic && <Alert as="p" className="inline-error" role="status">{copilot.diagnostic}</Alert>}
    </>}
  </ProviderCard>;
}
