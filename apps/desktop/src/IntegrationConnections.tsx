import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { GitHubConnection, LinearConnection, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function GitHubConnectionPanel({ sdk, openTerminal, onStatus }: { sdk: MoguriSdk; openTerminal?: () => void; onStatus?: (connected: boolean) => void }) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let current = true; setBusy(true);
    void sdk.integrations.githubConnection().then((value) => { if (current) { setConnection(value.connection); setError(""); onStatus?.(true); } })
      .catch((error: unknown) => { if (current) { setError(error instanceof Error ? error.message : "The GitHub CLI account is unavailable."); onStatus?.(false); } })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [sdk]);
  return <section aria-label="GitHub integration connection"><SettingsHelp label="About GitHub integration" target={<h2>GitHub integration</h2>}>Moguri uses your GitHub CLI (gh) account on this Mac for repositories, issues and pull requests. It's separate from your Copilot sign-in and the update token.</SettingsHelp>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setError(""); setConnection(null);
      void sdk.integrations.githubConnection().then((value) => { setConnection(value.connection); onStatus?.(true); })
        .catch((error: unknown) => { setError(error instanceof Error ? error.message : "The GitHub CLI account could not be verified."); onStatus?.(false); }).finally(() => setBusy(false));
    }} aria-label={busy ? "Checking account..." : "Verify GitHub CLI account"}>{busy ? "Checking..." : "Verify"}</button>
    {connection && <p role="status">Verified gh account: {connection.login} / {connection.id}</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <details><summary>Sign in or fix repository access</summary><p>In a terminal on this Mac, run <code>gh auth login --hostname github.com --web --git-protocol ssh</code>, then click Verify. Private repositories need access through this account, and some organizations also require SSO.</p>
      <p className="fine-print">To watch linked PRs in the background, choose this account in Project settings.</p></details>
    {!openTerminal && <p className="fine-print">Select a Local session to open its terminal here.</p>}
    <button type="button" disabled={busy || !openTerminal} onClick={openTerminal} aria-label="Open terminal for selected session">Open terminal</button>
  </section>;
}

export function LinearConnectionPanel({ sdk, onDirty, onStatus }: { sdk: MoguriSdk; onDirty: (dirty: boolean) => void; onStatus?: (connection: LinearConnection) => void }) {
  const [connection, setConnection] = useState<LinearConnection | null>(null), [token, setToken] = useState("");
  useEffect(() => { if (connection) onStatus?.(connection); }, [connection]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { onDirty(token.length > 0 || busy); return () => onDirty(false); }, [token, busy, onDirty]);
  useEffect(() => {
    let current = true;
    void sdk.linear.connection().then((value) => { if (current) setConnection(value.connection); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The credential store is unavailable."); });
    return () => { current = false; };
  }, [sdk]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Linear sign-in could not be confirmed."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Linear integration connection"><SettingsHelp label="More about this setting" target={<h2>Linear connection</h2>}>Stores this profile's Linear personal API key in the keychain. You choose a team per project, and every change sent to Linear is reviewed first.</SettingsHelp>
    <p role="status">API key: {connection?.credential ?? "unobserved"}{connection?.account ? ` · verified ${connection.account.name} / ${connection.account.workspaceName}` : " · account not verified"}</p>
    <label className="setting-field">Linear personal API key<SettingsInput type="password" aria-label="Linear personal API key" autoComplete="off" maxLength={4096} value={token} disabled={busy} onChange={(event) => setToken(event.target.value)} /></label>
    <div className="button-row"><button type="button" className="primary" disabled={busy || !token} onClick={() => void run(async () => {
      await sdk.linear.setToken(token); setToken(""); setConnection((await sdk.linear.connection()).connection); setNotice("API key saved. Click Verify to check the account.");
    })} aria-label="Store Linear key in keychain">Store</button>
      <button type="button" disabled={busy || Boolean(token)} onClick={() => void run(async () => { setConnection((await sdk.linear.connection(true)).connection); })} aria-label="Verify Linear account">Verify</button>
      <button type="button" className="quiet" aria-label="Remove Linear key" disabled={busy} onClick={() => void run(async () => { await sdk.linear.clearToken(); setToken(""); setConnection((await sdk.linear.connection()).connection); setNotice("API key removed. Open reviews no longer apply."); })}>Remove</button></div>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
  </section>;
}
