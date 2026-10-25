import { useEffect, useRef, useState } from "react";
import { useSessionActivity } from "../../../packages/sdk/src/react.ts";
import type { ActivityResponse, MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { activityBytes, activityDuration, activityStarted, CurrentActivity } from "./ChatActivity.tsx";
import { GhosttyOutput } from "./GhosttyTerminal.tsx";
import { Icon } from "./Icon.tsx";
import { CommandJobs } from "./CommandJobs.tsx";

type Read = Extract<ActivityResponse, { type: "activity.read" }>;
export function AgentTerminal({ sdk, session, snapshot, active }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; active: boolean }) {
  const activity = useSessionActivity(sdk, session, snapshot, "run_command"), commands = activity.activity?.entries ?? [];
  const scope = JSON.stringify([sdk.profileId, session.id]);
  const [selection, setSelection] = useState<{ scope: string; id: string | null }>({ scope, id: null });
  const selected = commands.find((entry) => entry.id === (selection.scope === scope ? selection.id : null)) ??
    commands.findLast((entry) => ["pending", "running"].includes(entry.status)) ?? commands.at(-1);
  const [follow, setFollow] = useState(true), [offset, setOffset] = useState(0), [copyError, setCopyError] = useState("");
  const source = JSON.stringify([scope, selected?.id]), key = JSON.stringify([source, selected?.updatedSequence, follow, offset]);
  const owner = useRef({ sdk, key }); owner.current = { sdk, key };
  const [state, setState] = useState<{ sdk: MoguriSdk; source: string; key: string; result: Read | null; error: string; loading: boolean }>({
    sdk, source, key, result: null, error: "", loading: false,
  });
  useEffect(() => { setFollow(true); setOffset(0); setCopyError(""); }, [sdk, source]);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    setState((previous) => ({ sdk, source, key, result: previous.sdk === sdk && previous.source === source ? previous.result : null, error: "", loading: true }));
    void sdk.agentTerminals.read(session.id, selected.id, follow ? { tail: true } : { offset }).then((result) => {
      if (result.entry.sessionId !== session.id || result.entry.id !== selected.id || result.entry.toolName !== "run_command") throw new Error("Agent output returned a different command. No source was substituted.");
      if (current && owner.current.sdk === sdk && owner.current.key === key) setState({ sdk, source, key, result, error: "", loading: false });
    }).catch((error: unknown) => {
      if (current && owner.current.sdk === sdk && owner.current.key === key) setState({ sdk, source, key, result: null, error: error instanceof Error ? error.message : "The exact Agent command output could not be read.", loading: false });
    });
    return () => { current = false; };
  }, [sdk, key]);
  const current = state.sdk === sdk && state.source === source, result = current ? state.result : null, content = result?.content;
  const readError = current ? state.error : "", loading = Boolean(selected) && (!current || state.loading), error = activity.error || readError || copyError;
  const copy = async () => {
    setCopyError("");
    try { await window.moguri.copyText(content?.text ?? ""); }
    catch (error) { setCopyError(error instanceof Error ? error.message : "Agent output could not be copied."); }
  };
  return <section className="agent-terminal" aria-label="Agent terminal">
    <CommandJobs sdk={sdk} session={session} snapshot={snapshot} active={active} />
    <header className="terminal-tabs">
      <select aria-label="Selected agent command" value={selected?.id ?? ""} onChange={(event) => setSelection({ scope, id: event.target.value })}>
        {commands.map((command, index) => <option value={command.id} key={command.id}>{index + 1}. {command.subject?.slice(0, 65) ?? "Recorded command"} / {command.status}</option>)}
        {!commands.length && <option value="">{activity.error ? "History unavailable" : activity.loading ? "Loading commands..." : "No approved command"}</option>}
      </select>
      <label className="agent-follow"><input type="checkbox" checked={follow} onChange={(event) => { setFollow(event.target.checked); setOffset(0); }} />Follow latest output</label>
      <button className="icon-button" type="button" title="Copy displayed Agent output" aria-label="Copy agent output" disabled={!content} onClick={() => void copy()}><Icon name="Copy" /></button>
      {activity.activity?.nextBefore && <button className="quiet" type="button" disabled={activity.earlierLoading} onClick={() => void activity.loadEarlier()}>Earlier commands</button>}
    </header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {selected ? <>
      <code className="agent-command-line" tabIndex={0}>{selected.subject ?? "Original command text unavailable."}</code>
      <p className="agent-command-meta"><strong>{selected.status}</strong><span>{selected.env ?? "unknown"} execution</span><span>{activityStarted(selected.startedAt)}</span><span>Duration {activityDuration(selected.durationMs)}</span></p>
      <CurrentActivity entries={activity.activity?.current ?? []} hasMore={(activity.activity?.currentCount ?? 0) > (activity.activity?.current.length ?? 0)} />
      {loading && !result && <p role="status">Reading the original Agent output...</p>}
      <GhosttyOutput text={content?.text ?? ""} active={active} scope={JSON.stringify([sdk.profileId, session.id, selected.id, follow, offset])} />
      {content ? <div className="agent-output-pages">
        <span>{content.offset.toLocaleString()}..{(content.offset + new TextEncoder().encode(content.text).length).toLocaleString()} / {activityBytes(content.bytes)} retained UTF-8</span>
        {content.offset > 0 && <button className="quiet" type="button" onClick={() => { setFollow(false); setOffset(0); }}>First page</button>}
        {content.nextOffset !== null && <button className="quiet" type="button" onClick={() => { setFollow(false); setOffset(content.nextOffset!); }}>Next page</button>}
      </div> : !loading && <p className="fine-print">{readError ? "Agent output is unavailable. Reopen this tab to retry; no empty result was assumed." : selected.status === "pending" ? "Waiting for command approval; no PTY has started." : "No output has been observed for this command."}</p>}
      {result?.entry.outputBasis === "retained-tail" && <p className="fine-print">Captured live tail, not complete process output. No final result has been retained.</p>}
    </> : <p className="fine-print" role="status">{activity.loading ? "Reading Agent command history..." : activity.error ? "Agent history is unavailable. Reopen this tab to retry; no empty history was assumed." : "No approved agent commands yet. Moguri uses run_command here after approval; opening this tab never runs a command."}</p>}
    <p className="terminal-boundary">Agent command results are shared with the model. Each command owns a separate PTY; there is no shared interactive shell or keyboard input here. Use Stop in chat to cancel active work. Your User and Global consoles stay private.</p>
  </section>;
}
