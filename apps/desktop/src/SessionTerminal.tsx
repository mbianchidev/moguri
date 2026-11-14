import { useEffect, useId, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { AgentTerminal } from "./AgentTerminal.tsx";
import { GhosttyTerminal } from "./GhosttyTerminal.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { RepositoryPicker } from "./RepositoryPicker.tsx";

export function SessionTerminal({ sdk, session, snapshot, active, visible, autoStart, showAgent = false, onAutoStartHandled, openAgent }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean; visible: boolean; autoStart: boolean; onAutoStartHandled?: () => void;
  showAgent?: boolean; openAgent?: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<"user" | "agent">(showAgent ? "agent" : "user"), id = useId();
  useEffect(() => {
    if (!showAgent) return;
    setSelected("agent"); onAutoStartHandled?.();
  }, [showAgent, onAutoStartHandled]);
  const [repository, setRepository] = useState("");
  const root = session.repositories?.find((value) => value.projectId === repository)?.root.root;
  const user = useRef<HTMLButtonElement>(null), agent = useRef<HTMLButtonElement>(null);
  const workspace = snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId);
  if (workspace && workspace.status !== "ready") return <section className="session-terminal" aria-label="Preparing session console">
    <p role="status">{workspace.status === "creating" ? "Preparing the owned worktree before opening its console." : workspace.diagnostic ?? "The original worktree is not ready. Inspect its actual job; no base console was opened."}</p>
  </section>;
  return <section className="session-terminal">
    <div className="terminal-ownership" role="tablist" aria-label="Terminal ownership" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "user" : event.key === "End" ? "agent" : selected === "user" ? "agent" : "user";
      setSelected(next); (next === "user" ? user : agent).current?.focus();
    }}>
      <Tooltip content="Your private interactive console"><button ref={user} id={`${id}-user`} type="button" role="tab" aria-selected={selected === "user"} aria-controls={`${id}-panel`} tabIndex={selected === "user" ? 0 : -1} onClick={() => setSelected("user")}>User</button></Tooltip>
      <Tooltip content="Background agents and approved commands; read-only output"><button ref={agent} id={`${id}-agent`} type="button" role="tab" aria-selected={selected === "agent"} aria-controls={`${id}-panel`} tabIndex={selected === "agent" ? 0 : -1} onClick={() => setSelected("agent")}>Agent</button></Tooltip>
    </div>
    {selected === "user" && <RepositoryPicker session={session} value={repository} change={setRepository} label="Terminal" />}
    <div className="terminal-owned-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${selected}`}>
      {selected === "user" ? session.repositories && !root ? <p className="fine-print">Select the exact repository for this private console. No HOME or common-parent shell is opened.</p> :
        <GhosttyTerminal key={`${session.id}:${root ?? ""}`} sdk={sdk} session={session} snapshot={snapshot} active={active} visible={visible} autoStart={autoStart} requestedRoot={root} onAutoStartHandled={onAutoStartHandled} /> :
        <AgentTerminal sdk={sdk} session={session} snapshot={snapshot} active={active} openAgent={openAgent} />}
    </div>
  </section>;
}
