import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, RemoteMcpPreview, Session, Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export function RemoteMcpPanel({ sdk, snapshot, session, serverId, disabled }: {
  sdk: MoguriSdk; snapshot: Snapshot; session: Session; serverId: string; disabled: boolean;
}) {
  const configuration = snapshot.projectConfigurations.find((configuration) => configuration.projectId === session.projectId);
  const binding = JSON.stringify([snapshot.profileId, session.id, serverId, snapshot.settings.revision, snapshot.policy.revision,
    configuration?.revision, session.projectId, session.workspaceId, session.controls.env, session.mode, session.pendingMode]);
  const activeBinding = useRef(binding); activeBinding.current = binding;
  const [review, setReview] = useState<{ preview: RemoteMcpPreview; binding: string } | null>(null);
  const [reviewed, setReviewed] = useState(false), [forwardAccess, setForwardAccess] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [inspection, setInspection] = useState("");
  useEffect(() => { setReviewed(false); setForwardAccess(false); }, [binding]);
  const preview = review?.binding === binding ? review.preview : null;
  const ready = snapshot.capabilities.some((capability) => capability.env === "Remote" && capability.ready);
  const stored = snapshot.settings.values.remote?.mcpGrants?.some((grant) => grant.serverId === serverId);
  const calls = snapshot.remoteMcpCalls.filter((call) => call.sessionId === session.id && call.serverId === serverId);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The Remote MCP action failed."); }
    finally { setBusy(false); }
  };
  return <section className="mcp-remote-panel" aria-label="Remote MCP access">
    <SettingsHelp label="More about this setting" target={<h3>Remote MCP access</h3>}>This server runs on your SSH host, outside the Sandbox. Local credentials go there only if you allow it, and each tool call still needs approval.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {message && <Alert as="p" role="status">{message}</Alert>}
    <div className="button-row">
      <button disabled={disabled || busy || !snapshot.settings.values.remote} onClick={() => void run(async () => {
        await sdk.remote.probe(); setReview(null); setMessage("SSH readiness updated. Review the server before granting access.");
      })}>Probe SSH target</button>
      <button disabled={disabled || busy || !ready} onClick={() => void run(async () => {
        const requested = binding, result = await sdk.mcp.remotePreview(session.id, serverId);
        if (activeBinding.current !== requested) throw new Error("The MCP scope changed during review. Review it again.");
        setReview({ preview: result.preview, binding: requested }); setReviewed(false); setForwardAccess(false);
      })}>Review Remote grant</button>
      <button disabled={disabled || busy || !stored} onClick={() => void run(async () => {
        await sdk.mcp.revokeRemote(session.id, serverId, snapshot.settings.revision, true);
        setReview(null); setReviewed(false); setForwardAccess(false);
        setMessage("Remote grant revoked. Credentials already sent and actions already taken can't be undone.");
      })}>Revoke Remote grant</button>
    </div>
    {!ready && <p className="fine-print">Probe the SSH target before reviewing a grant.</p>}
    {review && !preview && <Alert as="p" tone="warning" className="settings-warning">This review is out of date. Review the host and server again.</Alert>}
    {preview && <>
      <dl className="mcp-remote-scope">
        <div><dt>Profile</dt><dd className="path">{snapshot.profileId}</dd></div>
        <div><dt>SSH host</dt><dd>{preview.host.name} / {preview.host.user}@{preview.host.host}:{preview.host.port}</dd></div>
        <div><dt>Pinned host key</dt><dd className="path">{preview.host.fingerprint}</dd></div>
        <div><dt>Remote root</dt><dd className="path">{preview.root}</dd></div>
        <div><dt>MCP resource</dt><dd className="path">{preview.server.transport} / {preview.server.resource}</dd></div>
        <div><dt>Authentication</dt><dd>{preview.server.auth} / {preview.granted ? "Resource grant saved" : "No resource grant"} / {preview.forwardAccess ? "Access forwarding granted" : "No access forwarding"}</dd></div>
        <div><dt>Review digest</dt><dd className="path">{preview.digest}</dd></div>
      </dl>
      <Alert as="p" tone="warning" className="settings-warning">{preview.warning}</Alert>
      {preview.server.auth !== "none" && <label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow Remote MCP access forwarding" checked={forwardAccess} disabled={disabled || busy}
        onChange={(event) => setForwardAccess(event.target.checked)} />Send this profile's access credential to this SSH host for this MCP server. It may be a long-lived bearer token that the host can keep; refresh tokens stay on this Mac.</label>}
      <label className="check-setting"><SettingsInput type="checkbox" aria-label="Confirm exact Remote MCP review" checked={reviewed} disabled={disabled || busy}
        onChange={(event) => setReviewed(event.target.checked)} />I reviewed this host, folder and MCP server. Tool calls still need approval.</label>
      <button className="primary" disabled={disabled || busy || !ready || !reviewed} onClick={() => void run(async () => {
        await sdk.mcp.grantRemote(session.id, serverId, preview.digest, preview.settingsRevision, forwardAccess, true);
        setReview(null); setReviewed(false); setForwardAccess(false);
        setMessage("Grant saved. Probe SSH again, then discover tools.");
      })} aria-label="Save exact Remote grant">Save</button>
    </>}
    <details className="mcp-remote-history"><summary>Recorded Remote calls ({calls.length})</summary>
      {!calls.length && <p>No Remote calls for this server yet.</p>}
      {calls.length > 10 && <p>Latest 10 calls shown. Use /mcp-remote calls for the full session list.</p>}
      {calls.slice(-10).reverse().map((call) => <div className="job-row" key={call.id}>
        <div><strong>{call.tool} / {call.status}</strong><small>{call.actor === "model" ? "Model" : "External SDK"} / {call.phase} / access {call.accessForwarded === null ? "unknown" : call.accessForwarded ? "received" : "not forwarded"}</small>
          <small className="path">{call.root}</small></div>
        <button disabled={busy} aria-label={`Inspect MCP operation ${call.id}`} onClick={() => void run(async () => {
          const result = JSON.stringify(await sdk.mcp.remoteCall(session.id, call.id), null, 2);
          setInspection(result.length > 12000 ? `${result.slice(0, 12000)}\n\nPreview limited to 12,000 characters. Use mcp.readResult with the job ID for the full result.` : result);
        })}>Inspect</button>
        {call.executionId && session.turnId !== call.turnId && <button disabled={busy} onClick={() => void run(async () => {
          await sdk.remote.reconcile(call.executionId!); setMessage("Remote results reconciled. Nothing was rerun, and a partial turn stays partial.");
        })} aria-label="Reconcile receipts">Reconcile</button>}
      </div>)}
      {inspection && <pre className="mcp-remote-result" aria-label="Remote MCP operation result">{inspection}</pre>}
    </details>
  </section>;
}
