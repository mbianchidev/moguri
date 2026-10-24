import { useId, useRef, useState } from "react";
import type { MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { AgentTerminal } from "./AgentTerminal.tsx";
import { GhosttyTerminal } from "./GhosttyTerminal.tsx";

export function SessionTerminal({ sdk, session, snapshot, active, visible, autoStart, opening = false }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean; visible: boolean; autoStart: boolean; opening?: boolean;
}) {
  const [selected, setSelected] = useState<"user" | "agent">("user"), id = useId();
  const user = useRef<HTMLButtonElement>(null), agent = useRef<HTMLButtonElement>(null);
  return <section className="session-terminal">
    <div className="terminal-ownership" role="tablist" aria-label="Terminal ownership" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "user" : event.key === "End" ? "agent" : selected === "user" ? "agent" : "user";
      setSelected(next); (next === "user" ? user : agent).current?.focus();
    }}>
      <button ref={user} id={`${id}-user`} type="button" role="tab" aria-selected={selected === "user"} aria-controls={`${id}-panel`} tabIndex={selected === "user" ? 0 : -1} onClick={() => setSelected("user")}>User</button>
      <button ref={agent} id={`${id}-agent`} type="button" role="tab" aria-selected={selected === "agent"} aria-controls={`${id}-panel`} tabIndex={selected === "agent" ? 0 : -1} onClick={() => setSelected("agent")}>Agent</button>
    </div>
    <div className="terminal-owned-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${selected}`}>
      {selected === "user" ? <GhosttyTerminal sdk={sdk} session={session} snapshot={snapshot} active={active} visible={visible} autoStart={autoStart} opening={opening} consoleScope="session" /> :
        <AgentTerminal sdk={sdk} session={session} snapshot={snapshot} active={active} />}
    </div>
  </section>;
}
