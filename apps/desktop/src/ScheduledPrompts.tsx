import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleLocalChoices, scheduleLocalTime, sessionTitle, TOOL_SUGGESTION_INTERVALS, type DraftEditor, type MoguriSdk, type ScheduledPrompt, type Session, type Snapshot, type ToolSuggestionAutomation } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";

type Run = (operation: () => Promise<unknown>) => Promise<void>;
const offsetLabel = (minutes: number) => `UTC${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
export function SchedulePromptDialog({ sdk, session, editor, initial, close }: {
  sdk: MoguriSdk; session: Session; editor: DraftEditor; initial: "ask" | "schedule"; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const [phase, setPhase] = useState(initial), [remember, setRemember] = useState(false);
  const [delay, setDelay] = useState("5"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [original] = useState(() => ({ profileId: sdk.profileId, text: editor.getState().text, attachments: JSON.stringify(editor.getState().attachments) }));
  const [zone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [local, setLocal] = useState(() => scheduleLocalTime(Date.now() + 30 * 60_000, zone).localTime);
  const [occurrence, setOccurrence] = useState(0);
  const custom = useMemo(() => {
    try { return { choices: scheduleLocalChoices(local, zone), error: "" }; }
    catch (error) { return { choices: [], error: error instanceof Error ? error.message : "The selected local time is invalid." }; }
  }, [local, zone]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const act = async (choice: "send" | "schedule") => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (sdk.profileId !== original.profileId || editor.getState().text !== original.text ||
        JSON.stringify(editor.getState().attachments) !== original.attachments) throw new Error("The original scheduled draft changed. Close this review and review the current draft; newer text was preserved.");
      if (phase === "ask" && remember) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Reconnect this profile before remembering the scheduling choice.");
        await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, idleScheduleAction: choice } }, settings.revision);
      }
      if (choice === "send") { await editor.send("queue", false); close(); }
      else if (phase === "ask") setPhase("schedule");
      else {
        const timing = delay === "custom" ? custom.choices[occurrence] : { kind: "delay" as const, minutes: Number(delay), timeZone: zone };
        if (!timing) throw new Error(custom.error || "Choose the exact local time and UTC offset.");
        await editor.submit((revision) => sdk.scheduledPrompts.create(session.id, timing, revision)); close();
      }
    } catch (error) { setError(error instanceof Error ? error.message : "The original prompt was not acknowledged. Your draft was preserved."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="workspace-dialog scheduled-prompt-dialog" aria-label={phase === "ask" ? "Send now or schedule" : "Schedule prompt"}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return;
      event.stopPropagation();
      if (!(event.target instanceof Element) || !event.target.closest("button")) event.preventDefault();
    }}
    onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <header><h2>{phase === "ask" ? "Nothing is running" : "Schedule prompt"}</h2></header>
    <p>{phase === "ask" ? "Send this prompt now instead of scheduling it?" : "The prompt stays unsent until its scheduled time. Current model, workspace, permissions and budgets still apply."}</p>
    <pre className="scheduled-draft-preview">{original.text || `${session.draft.attachments.length} attached items`}</pre>
    {phase === "ask" ? <label className="check-setting"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />Don't ask me again</label> :
      <><label className="setting-field">Send in<select value={delay} disabled={busy} onChange={(event) => setDelay(event.target.value)}>
        {[5, 10, 30, 60].map((minutes) => <option value={minutes} key={minutes}>{minutes} minutes</option>)}<option value="custom">Custom date and time</option>
      </select></label>
      {delay === "custom" && <><label className="setting-field">Local date and time<input type="datetime-local" value={local} disabled={busy} onChange={(event) => { setLocal(event.target.value); setOccurrence(0); }} /></label>
        {custom.choices.length > 1 && <label className="setting-field">Clock occurrence<select value={occurrence} disabled={busy} onChange={(event) => setOccurrence(Number(event.target.value))}>
          {custom.choices.map((choice, index) => <option value={index} key={choice.at}>{index === 0 ? "First" : "Second"} occurrence ({offsetLabel(choice.offsetMinutes)})</option>)}
        </select></label>}
        <p className="fine-print" role="status">{custom.error || `${zone}, ${offsetLabel(custom.choices[occurrence]?.offsetMinutes ?? 0)}. ${custom.choices[occurrence] ? new Date(custom.choices[occurrence]!.at).toLocaleString() : ""}`}</p></>}
      <p className="fine-print">Local timezone: {zone}. If Moguri is closed, this sends once after restart when the captured controls and current policy still allow it.</p></>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {busy && <p role="status">Saving the original choice. Your draft is preserved until acknowledgement.</p>}
    <footer><button type="button" disabled={busy} onClick={close}>Cancel</button>
      {phase === "ask" ? <><button type="button" disabled={busy} onClick={() => void act("schedule")}>No, schedule</button>
        <button type="button" className="primary" autoFocus disabled={busy} onClick={() => void act("send")}>Send now</button></> :
        <button type="button" className="primary" autoFocus disabled={busy || delay === "custom" && !custom.choices.length} onClick={() => void act("schedule")}>Schedule prompt</button>}
    </footer>
  </dialog>;
}
function ScheduledActions({ sdk, prompt, run }: { sdk: MoguriSdk; prompt: ScheduledPrompt; run: Run }) {
  const [busy, setBusy] = useState(false), pending = useRef(false);
  const act = (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    void run(async () => { try { await operation(); } finally { pending.current = false; setBusy(false); } });
  };
  return <div className="scheduled-prompt-actions">
    <button type="button" disabled={busy} onClick={() => act(() => sdk.scheduledPrompts.sendNow(prompt.id, prompt.revision))}>Send now</button>
    <button type="button" className="quiet" disabled={busy} onClick={() => act(() => sdk.scheduledPrompts.cancel(prompt.id, prompt.revision))}>Cancel</button>
  </div>;
}
export function GhostPrompts({ sdk, session, snapshot, run }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; run: Run }) {
  const prompts = snapshot.scheduledPrompts.filter((prompt) => prompt.sessionId === session.id && ["scheduled", "blocked"].includes(prompt.status));
  return <>{prompts.map((prompt) => <article className="scheduled-ghost" aria-label="Unsent scheduled prompt" key={prompt.id} data-scheduled-id={prompt.id}>
    <header><Icon name="Clock" /><strong>{prompt.status === "blocked" ? "Scheduled prompt paused" : "Scheduled, not sent"}</strong>
      <time dateTime={prompt.dueAt}>{new Date(prompt.dueAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></header>
    <p className="scheduled-prompt-text">{prompt.text || `${prompt.attachments.length} attached items`}</p>
    {prompt.attachments.length > 0 && <p className="fine-print">{prompt.attachments.map((attachment) => attachment.path).join(", ")}</p>}
    {prompt.diagnostic && <p className="scheduled-prompt-diagnostic">{prompt.diagnostic}</p>}
    <ScheduledActions sdk={sdk} prompt={prompt} run={run} />
  </article>)}</>;
}
const intervalLabel = (hours: number) => hours === 24 ? "Every day" : hours === 168 ? "Every week" : `Every ${hours} hours`;
/** The recurring repeated-task tool check. Its switch and interval save immediately. */
function ToolSuggestionAutomationSettings({ sdk, snapshot, openTools }: { sdk: MoguriSdk; snapshot: Snapshot; openTools?: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const value: ToolSuggestionAutomation = snapshot.settings.values.automations?.toolSuggestions ?? { enabled: false, intervalHours: 24 };
  const save = (next: ToolSuggestionAutomation) => {
    const current = sdk.settings.get();
    if (!current) { setError("Reconnect this profile before changing automations. Nothing was saved."); return; }
    setBusy(true); setError("");
    void sdk.settings.update({ ...current.values, automations: { ...current.values.automations, toolSuggestions: next } }, current.revision)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The automation change wasn't saved."))
      .finally(() => setBusy(false));
  };
  return <section className="tool-suggestion-automation" aria-label="Repeated-task tool check"><header><Icon name="Clock" /><h2>Repeated-task tool check</h2></header>
    <p className="fine-print">Looks for requests you repeat across chats, like turning Markdown into a PDF, that a script tool could handle. It runs on this Mac while Moguri is running, makes no model call and never writes or turns on a script. New suggestions appear in Inbox and Capabilities / Tools.</p>
    <label className="check-setting"><input type="checkbox" role="switch" aria-label="Check for repeated tasks automatically" checked={value.enabled} disabled={busy}
      onChange={(event) => save({ ...value, enabled: event.target.checked })} />Check for repeated tasks automatically</label>
    <label className="setting-field">How often<select aria-label="Repeated-task check interval" value={value.intervalHours} disabled={busy || !value.enabled}
      onChange={(event) => save({ ...value, intervalHours: TOOL_SUGGESTION_INTERVALS.find((hours) => hours === Number(event.target.value)) ?? 24 })}>
      {TOOL_SUGGESTION_INTERVALS.map((hours) => <option key={hours} value={hours}>{intervalLabel(hours)}</option>)}</select></label>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {openTools && <button type="button" onClick={openTools}>Review suggested tools</button>}
  </section>;
}
export function ScheduledPromptsPanel({ sdk, snapshot, run, openSession, openTools }: { sdk: MoguriSdk; snapshot: Snapshot; run: Run; openSession: (id: string) => void; openTools?: () => void }) {
  const prompts = snapshot.scheduledPrompts.filter((prompt) => ["scheduled", "blocked", "queued"].includes(prompt.status))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id));
  return <><ToolSuggestionAutomationSettings sdk={sdk} snapshot={snapshot} openTools={openTools} />
  <section className="scheduled-prompts-panel" aria-label="Scheduled prompts"><header><Icon name="Clock" /><h2>Scheduled prompts</h2></header>
    <p className="fine-print">Unsent prompts in an existing chat. Timers belong to Moguri, not this window.</p>
    {!prompts.length && <p>No scheduled prompts. Use Cmd/Ctrl+Enter in an idle chat to schedule one.</p>}
    {prompts.map((prompt) => {
      const session = snapshot.sessions.find((session) => session.id === prompt.sessionId)!;
      return <article className="scheduled-prompt-row" key={prompt.id}><div>
        <button type="button" className="quiet" onClick={() => openSession(session.id)}>{sessionTitle(session)}</button>
        <p className="scheduled-prompt-text">{prompt.text || `${prompt.attachments.length} attached items`}</p>
        <time dateTime={prompt.dueAt}>{new Date(prompt.dueAt).toLocaleString()} ({prompt.timeZone}, {offsetLabel(prompt.offsetMinutes)})</time>
        <small>{prompt.status === "queued" ? "Due, waiting for this chat's turn" : prompt.status === "blocked" ? "Paused" : "Scheduled"}</small>
        {prompt.diagnostic && <p className="scheduled-prompt-diagnostic">{prompt.diagnostic}</p>}
      </div><ScheduledActions sdk={sdk} prompt={prompt} run={run} /></article>;
    })}
  </section></>;
}
