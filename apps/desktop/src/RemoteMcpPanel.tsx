import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, RemoteMcpPreview, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

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
    catch (error) { setError(error instanceof Error ? error.message : "Remote MCP operation failed. No Local or credential fallback was used."); }
    finally { setBusy(false); }
  };
  return <section className="mcp-remote-panel" aria-label="Remote MCP access">
    <SettingsHelp label="More about this setting" target={<h3>Remote MCP access</h3>}>Execution is on the pinned SSH host, not inside SendBox. A saved Local MCP account is not permission to send it there. Tool calls still need their own exact approval.</SettingsHelp>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="button-row">
      <button disabled={disabled || busy || !snapshot.settings.values.remote} onClick={() => void run(async () => {
        await sdk.remote.probe(); setReview(null); setMessage("SSH readiness updated. Review the exact resource before granting; discovery and execution are separate actions.");
      })}>Probe SSH target</button>
      <button disabled={disabled || busy || !ready} onClick={() => void run(async () => {
        const requested = binding, result = await sdk.mcp.remotePreview(session.id, serverId);
        if (activeBinding.current !== requested) throw new Error("The selected MCP scope changed during review. Review its current host and resource again.");
        setReview({ preview: result.preview, binding: requested }); setReviewed(false); setForwardAccess(false);
      })}>Review Remote grant</button>
      <button disabled={disabled || busy || !stored} onClick={() => void run(async () => {
        await sdk.mcp.revokeRemote(session.id, serverId, snapshot.settings.revision, true);
        setReview(null); setReviewed(false); setForwardAccess(false);
        setMessage("Remote grant revoked. Existing received access and external effects cannot be rolled back; retained results remain readable.");
      })}>Revoke Remote grant</button>
    </div>
    {!ready && <p className="fine-print" role="status">Probe the configured SSH target before a new review. Revocation and retained-result inspection do not need a ready host.</p>}
    {review && !preview && <p className="settings-warning">This review is stale. Review the current host, root and resource again; no permission was inferred.</p>}
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
      <p className="settings-warning">{preview.warning}</p>
      {preview.server.auth !== "none" && <label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow Remote MCP access forwarding" checked={forwardAccess} disabled={disabled || busy}
        onChange={(event) => setForwardAccess(event.target.checked)} />Allow this profile's access credential to reach this exact SSH peer and MCP resource. It may be a long-lived bearer key; the host can retain it. Refresh credentials stay local.</label>}
      <label className="check-setting"><SettingsInput type="checkbox" aria-label="Confirm exact Remote MCP review" checked={reviewed} disabled={disabled || busy}
        onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact host, root and MCP resource. This grants no tool approval or broader policy.</label>
      <button className="primary" disabled={disabled || busy || !ready || !reviewed} onClick={() => void run(async () => {
        await sdk.mcp.grantRemote(session.id, serverId, preview.digest, preview.settingsRevision, forwardAccess, true);
        setReview(null); setReviewed(false); setForwardAccess(false);
        setMessage("Grant saved. Probe SSH again, then discover tools under the new scope. No tool call started.");
      })}>Save exact Remote grant</button>
    </>}
    <details className="mcp-remote-history"><summary>Recorded Remote calls ({calls.length})</summary>
      {!calls.length && <p>No Remote call has been admitted for this resource. A grant or catalog is not a tool effect.</p>}
      {calls.length > 10 && <p>Latest 10 calls shown. Use /mcp-remote calls for the full session list.</p>}
      {calls.slice(-10).reverse().map((call) => <div className="job-row" key={call.id}>
        <div><strong>{call.tool} / {call.status}</strong><small>{call.actor === "model" ? "Model-owned" : "External SDK"} / {call.phase} / access {call.accessForwarded === null ? "unknown" : call.accessForwarded ? "received" : "not forwarded"}</small>
          <small className="path">{call.root}</small></div>
        <button disabled={busy} aria-label={`Inspect MCP operation ${call.id}`} onClick={() => void run(async () => {
          const result = JSON.stringify(await sdk.mcp.remoteCall(session.id, call.id), null, 2);
          setInspection(result.length > 12000 ? `${result.slice(0, 12000)}\n\nPreview limited to 12,000 characters. Use mcp.readResult with the recorded job ID for exact result pages.` : result);
        })}>Inspect</button>
        {call.executionId && session.turnId !== call.turnId && <button disabled={busy} onClick={() => void run(async () => {
          await sdk.remote.reconcile(call.executionId!); setMessage("Existing SSH receipts reconciled. No tool or credential was replayed; an original partial turn stays partial.");
        })}>Reconcile receipts</button>}
      </div>)}
      {inspection && <pre className="mcp-remote-result" aria-label="Remote MCP operation result">{inspection}</pre>}
    </details>
  </section>;
}
