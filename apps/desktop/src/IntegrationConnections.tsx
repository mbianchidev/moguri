import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { GitHubConnection, LinearConnection, MoguriSdk } from "../../../packages/sdk/src/index.ts";

export function GitHubConnectionPanel({ sdk, openTerminal }: { sdk: MoguriSdk; openTerminal: () => void }) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section aria-label="GitHub integration connection"><h2>GitHub integration</h2><SettingsHelp label="More about this setting">This integration uses your existing GitHub CLI account on the control-plane host. It is separate from Copilot model login and the update PAT. Remote operations keep their explicitly captured SSH account.</SettingsHelp>
    <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setError(""); setConnection(null);
      void sdk.integrations.githubConnection().then((value) => setConnection(value.connection)).catch((error: unknown) => setError(error instanceof Error ? error.message : "The CLI account was not verified. No alternative credential was used.")).finally(() => setBusy(false));
    }}>{busy ? "Checking account..." : "Check existing GitHub CLI account"}</button>
    {connection && <p role="status">Verified CLI account: {connection.login} / {connection.id}. This does not grant repository access or approve an operation.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="fine-print">To sign in or change that CLI account yourself, open the global terminal and run <code>gh auth login --hostname github.com</code>. Moguri never completes personal authorization for you. Select authenticated read access per project and review the exact account for writes.</p>
    <button type="button" disabled={busy} onClick={openTerminal}>Open global terminal</button>
  </section>;
}

export function LinearConnectionPanel({ sdk, onDirty }: { sdk: MoguriSdk; onDirty: (dirty: boolean) => void }) {
  const [connection, setConnection] = useState<LinearConnection | null>(null), [token, setToken] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { onDirty(token.length > 0 || busy); return () => onDirty(false); }, [token, busy, onDirty]);
  useEffect(() => {
    let current = true;
    void sdk.linear.connection().then((value) => { if (current) setConnection(value.connection); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The profile credential backend is unavailable."); });
    return () => { current = false; };
  }, [sdk]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Linear authentication was not confirmed. No credential fallback was used."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Linear integration connection"><h2>Linear connection</h2><SettingsHelp label="More about this setting">Use this profile's personal API key in the secure secret backend. No project is needed to store or verify it. Project/team access and each external write still need their own configuration and review.</SettingsHelp>
    <p role="status">Credential: {connection?.credential ?? "unobserved"}.{connection?.account ? ` Verified ${connection.account.name} / ${connection.account.workspaceName}.` : " No account identity has been verified."}</p>
    <label className="setting-field">Linear personal API key<SettingsInput type="password" aria-label="Linear personal API key" autoComplete="off" maxLength={4096} value={token} disabled={busy} onChange={(event) => setToken(event.target.value)} /></label>
    <div className="button-row"><button type="button" className="primary" disabled={busy || !token} onClick={() => void run(async () => {
      await sdk.linear.setToken(token); setToken(""); setConnection((await sdk.linear.connection()).connection); setNotice("Credential stored only in this profile's secure backend. Verify the actual account explicitly.");
    })}>Store Linear key in keychain</button>
      <button type="button" disabled={busy || Boolean(token)} onClick={() => void run(async () => { setConnection((await sdk.linear.connection(true)).connection); })}>Verify Linear account</button>
      <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.linear.clearToken(); setToken(""); setConnection((await sdk.linear.connection()).connection); setNotice("Profile credential removed. Existing requests and reviews were invalidated."); })}>Remove Linear key</button></div>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
  </section>;
}
