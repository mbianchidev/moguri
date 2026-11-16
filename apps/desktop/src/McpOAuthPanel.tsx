import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function McpOAuthPanel({ sdk, serverId, sessionId, snapshot }: { sdk: MoguriSdk; serverId: string; sessionId?: string; snapshot: Snapshot }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [issuer, setIssuer] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const state = snapshot.oauthAuthorizations.findLast((authorization) => authorization.serverId === serverId);
  const run = async (operation: () => Promise<unknown>) => { setBusy(true); setError(""); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "The OAuth request failed."); } finally { setBusy(false); } };
  useEffect(() => {
    let current = true; setUrl(null);
    if (!state || !["waiting", "exchanging"].includes(state.state)) return;
    void sdk.mcp.oauthStatus(state.id).then((result) => { if (current) setUrl(result.url); }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "OAuth status is unavailable."); });
    return () => { current = false; };
  }, [serverId, state?.id, state?.state, state?.authorizationUrlReady, busy]);
  return <section className="mcp-oauth-panel" aria-label="MCP OAuth"><SettingsHelp label="More about this setting" target={<h3>OAuth connection</h3>}>Signs in with OAuth (PKCE) and keeps tokens in your keychain. Your browser opens only when you click Open authorization.</SettingsHelp>
    {state && <p role="status">Last authorization: {state.state}{state.diagnostic ? ` / ${state.diagnostic}` : ""}</p>}{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div className="button-row"><button disabled={busy || Boolean(state && ["waiting", "exchanging"].includes(state.state))} onClick={() => void run(async () => { const result = await sdk.mcp.oauthBegin(serverId, sessionId); setUrl((await sdk.mcp.oauthStatus(result.id!)).url); })} aria-label="Connect OAuth">Connect</button>
      {url && <button className="primary" onClick={() => void run(() => window.moguri.openExternal(url))}>Open authorization</button>}
      {state && ["waiting", "exchanging"].includes(state.state) && <button onClick={() => void run(() => sdk.mcp.oauthCancel(state.id))} aria-label="Cancel login">Cancel</button>}
      <button disabled={busy} onClick={() => void run(async () => { await sdk.mcp.oauthClear(serverId, sessionId); setUrl(null); })} aria-label="Remove OAuth connection">Remove</button></div>
    {url && <p className="fine-print path">{url}</p>}
    <details><summary>Pre-registered client, if dynamic registration is unavailable</summary><label className="setting-field">Client ID<SettingsInput value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" maxLength={4096} /></label><label className="setting-field">Issuer URL<SettingsInput value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={2048} /></label><SettingsHelp label="More about this setting" target={<label className="setting-field">Registered loopback redirect URI<SettingsInput value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} placeholder="http://127.0.0.1:49152/oauth/callback" maxLength={2048} /></label>}>Register this redirect with the issuer. If you leave it empty, Moguri picks a random loopback port, which the issuer must allow.</SettingsHelp><label className="setting-field">Client secret, only if required<SettingsInput type="password" autoComplete="off" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} maxLength={32768} /></label><button disabled={busy || !clientId || !issuer} onClick={() => void run(async () => { await sdk.mcp.oauthClient(serverId, clientId, issuer, clientSecret || undefined, sessionId, redirectUri || undefined); setClientSecret(""); })} aria-label="Store client in keychain">Store</button></details>
  </section>;
}
