import { SettingsHelp } from "./SettingsFields.tsx";
import type { MoguriSdk, ProviderState } from "../../../packages/sdk/src/index.ts";

export function ProviderConnect({ provider, run, client }: {
  provider: ProviderState; run: (action: () => Promise<unknown>) => Promise<void>; client: MoguriSdk;
}) {
  const copilot = provider.connections?.find((connection) => connection.id === "github-copilot") ?? provider;
  return <section className="provider-setup" aria-label="GitHub Copilot connection">
    <SettingsHelp label="More about this setting" target={<h2>GitHub Copilot</h2>}>{copilot.status !== "connected" && <>Uses pi-ai's third-party device flow, not an official Moguri partnership. GitHub subscription and organization policies apply. Sign-in may enable account model policies. Credentials stay in your OS keychain.</>}</SettingsHelp>
    {copilot.status === "connected" ? <><p className="connected-label">Connected through your Copilot account.</p><p>{provider.models.filter((model) => model.source !== "local").length} account-enabled models available. Choose one in the composer.</p>
      <div className="button-row"><button onClick={() => void run(() => client.command({ type: "provider.refresh" }))}>Refresh connection</button><button className="quiet" onClick={() => void run(() => client.command({ type: "provider.logout" }))}>Sign out</button></div></> :
      <>
        <p>Use your existing Copilot subscription. No other provider key is needed.</p>
        {provider.login ? <div className="device-flow">
          <p>Open GitHub and enter this one-time code:</p><code aria-label="GitHub device code">{provider.login.code}</code>
          <button className="primary" onClick={() => void run(() => window.moguri.openExternal(provider.login!.url))}>Open GitHub</button>
          <p className="muted">Waiting for authorization. Expires at {new Date(provider.login.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
          <button className="quiet" onClick={() => void run(() => client.command({ type: "provider.cancel" }))}>Cancel sign-in</button>
        </div> : <button className="primary" disabled={copilot.status === "connecting"} onClick={() => void run(() => client.command({ type: "provider.login" }))}>{copilot.status === "connecting" ? "Starting sign-in..." : "Sign in with GitHub Copilot"}</button>}

      </>}
    {copilot.diagnostic && <p className="inline-error" role="status">{copilot.diagnostic}</p>}
  </section>;
}
