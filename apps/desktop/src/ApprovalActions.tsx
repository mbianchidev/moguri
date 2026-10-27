import { useState } from "react";
import { commandFamily, type MoguriSdk, type RememberApproval, type Session } from "../../../packages/sdk/src/index.ts";

export function ApprovalActions({ sdk, session, busy, run }: {
  sdk: MoguriSdk; session: Session; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [scope, setScope] = useState<RememberApproval["scope"] | "once">("once");
  const [match, setMatch] = useState<RememberApproval["match"]>("exact");
  const approval = session.pendingApproval;
  if (!approval) return null;
  const command = approval.call.name === "run_command" || approval.call.name === "command_job" && approval.call.arguments.action === "start" ?
    approval.call.arguments.command : null;
  const family = typeof command === "string" ? commandFamily(command) : null;
  const nested = approval.call.name === "mcp_gateway" && approval.call.arguments.action === "call";
  const wholeTool = !nested && !["run_command", "command_job", "debug", "mcp_gateway"].includes(approval.call.name);
  const selectedMatch = family || wholeTool ? match : "exact";
  const label = scope === "once" ? "Approve this action" : selectedMatch === "tool" ? `Always approve ${approval.call.name}` : selectedMatch === "family" ? `Always approve ${family}` :
    scope === "session" ? "Approve for this session" : scope === "project" ? "Approve for this project" : nested ? "Always approve this MCP tool" : "Always approve this action";
  return <>
    <div className="approval-options"><label className="setting-field">Approval scope<select aria-label="Approval scope" disabled={busy} value={scope}
      onChange={(event) => { const value = event.target.value; if (value === "once" || value === "session" || value === "project" || value === "global") setScope(value); }}>
      <option value="once">Only this action</option><option value="session">Approve for this session</option>
      <option value="project" disabled={!session.projectId}>Approve for this project</option><option value="global">Always approve across projects in this profile</option>
    </select></label>
      {scope !== "once" && family && <label className="setting-field">Command matching<select aria-label="Command matching" disabled={busy} value={match}
        onChange={(event) => setMatch(event.target.value === "family" ? "family" : "exact")}><option value="exact">This exact command</option><option value="family">Command family: {family}</option></select></label>}
      {scope !== "once" && wholeTool && <label className="setting-field">Tool matching<select aria-label="Tool matching" disabled={busy} value={match}
        onChange={(event) => setMatch(event.target.value === "tool" ? "tool" : "exact")}><option value="exact">These exact arguments</option><option value="tool">Always approve {approval.call.name}</option></select></label>}
    </div>
    {scope !== "once" && <p className="fine-print">Remembered in this profile for {session.controls.env}. {nested ? `Only ${String(approval.call.arguments.serverId)}/${String(approval.call.arguments.tool)} with this schema and server configuration.` :
      selectedMatch === "family" ? `Future simple ${family} commands, with any arguments. Compound shell expressions still need review.` : selectedMatch === "tool" ? `Future ${approval.call.name} calls with new arguments, within this scope.` : "Only these exact arguments."} Hard denials and environment policy still apply.</p>}
    <div className="approval-actions"><button disabled={busy} onClick={() => void run(() => sdk.approvals.respond(session.id, approval.id, false))}>Deny</button>
      <button className="primary" disabled={busy} onClick={() => void run(() => sdk.approvals.respond(session.id, approval.id, true,
        scope === "once" ? undefined : { scope, match: selectedMatch }))}>{label}</button></div>
  </>;
}
