import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { ActivityContent, ActivityEntry, ActivityResponse, BudgetTotals, MoguriSdk, TurnInfo, UsageEstimate } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { dollars } from "./BudgetControls.tsx";
import { Alert } from "./Alert.tsx";
const RichMessage = lazy(() => import("./RichMessage.tsx"));

const icons: Record<ActivityEntry["kind"], string> = {
  "read-file": "ReadFile", "create-file": "CreateFile", "edit-file": "EditFile", "search-files": "Search", "search-skills": "Search",
  "search-web": "Search", "load-skill": "Skill", "create-issue": "Issue", command: "Terminal", mcp: "Mcp", "ask-user": "Question",
  thought: "Thought", model: "Thought", tool: "Tool",
};
export const activityDuration = (value: number | null): string => value === null ? "Unavailable" :
  value < 60_000 ? `${Math.floor(Math.max(0, value) / 1000)}s` :
    value < 3_600_000 ? `${Math.floor(value / 60_000)}m ${Math.floor(value / 1000) % 60}s` : `${Math.floor(value / 3_600_000)}h ${Math.floor(value / 60_000) % 60}m`;
export const activityBytes = (value: number | null): string => value === null ? "Not observed" : value < 1000 ? `${value} B` :
  value < 1_000_000 ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / 1000)} KB` : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / 1_000_000)} MB`;
export function activityStarted(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not observed";
  const date = new Date(value);
  return `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)} - ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }).format(date)}`;
}
export const estimatedCost = (totals: BudgetTotals, estimate?: UsageEstimate | null): string => estimate?.estimatedCalls && estimate.estimatedUsd !== null ? `~${dollars(estimate.estimatedUsd)}` :
  estimate?.estimatedCalls && estimate.knownEstimatedUsd > 0 ? `~${dollars(estimate.knownEstimatedUsd)} known + unknown` : totals.estimatedUsd !== null ? dollars(totals.estimatedUsd) :
  totals.knownEstimatedUsd > 0 ? `${dollars(totals.knownEstimatedUsd)} known + unknown` : "Not estimated";
const active = (entry: ActivityEntry) => ["running", "waiting_input"].includes(entry.status);
function useElapsed(startedAt: string | null, ticking: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking, startedAt]);
  const start = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(start) && now >= start ? now - start : null;
}
type Read = Extract<ActivityResponse, { type: "activity.read" }>;
function localPage(text: string, offset: number): ActivityContent {
  const bytes = new TextEncoder().encode(text);
  let start = Math.max(0, Math.min(offset, bytes.length));
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  let end = Math.min(bytes.length, start + 16_384);
  while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return { text: new TextDecoder().decode(bytes.slice(start, end)), bytes: bytes.length, offset: start, nextOffset: end < bytes.length ? end : null };
}
export function ActivityRow({ sdk, entry, version }: { sdk: MoguriSdk; entry: ActivityEntry; version: number }) {
  const [open, setOpen] = useState(false), [argumentOffset, setArgumentOffset] = useState(0), [outputOffset, setOutputOffset] = useState(0);
  const [state, setState] = useState<{ key: string; arguments: Read | null; output: Read | null; error: string | null; loading: boolean }>({ key: "", arguments: null, output: null, error: null, loading: false });
  const key = JSON.stringify([sdk.profileId, entry.sessionId, entry.id, entry.status, version, argumentOffset, outputOffset]);
  const owner = useRef({ sdk, key }); owner.current = { sdk, key };
  const live = useElapsed(entry.startedAt, open && active(entry));
  const sourceMessage = entry.messageId ? sdk.getState().snapshot?.sessions.find((session) => session.id === entry.sessionId)?.messages.find((message) => message.id === entry.messageId) : undefined;
  const sourceCall = entry.source === "tool" && sourceMessage?.role === "tool" ? sourceMessage.toolCalls?.find((call) => call.id === sourceMessage.id) : undefined;
  const localArgumentsText = entry.hasArguments && sourceMessage?.role === "tool" && sourceCall ? JSON.stringify(sourceCall.arguments, null, 2) : null;
  const sourceOutput = entry.source === "model" && sourceMessage?.role === "assistant" ? sourceMessage.reasoning ?? sourceMessage.text :
    entry.source === "tool" && sourceMessage?.role === "tool" ? sourceMessage.text : null;
  const sourceOutputBytes = sourceOutput === null ? null : new TextEncoder().encode(sourceOutput).byteLength;
  const localOutputText = entry.hasOutput && sourceOutput !== null ? sourceOutput : null;
  const outputMatchesRetained = entry.outputBasis === "retained-tail" || sourceOutputBytes === entry.outputBytes;
  const localArguments: Read | null = localArgumentsText === null ? null : {
    type: "activity.read", entry, part: "arguments", content: localPage(localArgumentsText, argumentOffset),
  };
  const localOutput: Read | null = localOutputText === null ? null : {
    type: "activity.read", entry, part: "output", content: localPage(localOutputText, outputOffset),
  };
  const needsArguments = entry.hasArguments && localArguments === null;
  const needsOutput = entry.hasOutput && localOutput === null;
  useEffect(() => { setArgumentOffset(0); setOutputOffset(0); }, [entry.id, entry.status]);
  useEffect(() => {
    if (!open || !needsArguments && !needsOutput) return;
    let current = true; setState({ key, arguments: null, output: null, error: null, loading: true });
    void Promise.all([
      needsArguments ? sdk.activity.read(entry.sessionId, entry.id, "arguments", { offset: argumentOffset }) : Promise.resolve(null),
      needsOutput ? sdk.activity.read(entry.sessionId, entry.id, "output", { offset: outputOffset }) : Promise.resolve(null),
    ]).then(([args, output]) => {
      if (current && owner.current.sdk === sdk && owner.current.key === key) setState({ key, arguments: args, output, error: null, loading: false });
    }).catch((error: unknown) => {
      if (current && owner.current.sdk === sdk && owner.current.key === key) setState({ key, arguments: null, output: null, error: error instanceof Error ? error.message : "The exact retained activity could not be read.", loading: false });
    });
    return () => { current = false; };
  }, [sdk, key, open, needsArguments, needsOutput]);
  const current = state.key === key, observed = current ? state.output?.entry ?? state.arguments?.entry ?? entry : entry;
  const running = active(observed);
  const renderPart = (part: Read | null, kind: "arguments" | "output", title?: string) => {
    if (!part?.content) return null;
    const content = part.content, offset = kind === "arguments" ? setArgumentOffset : setOutputOffset;
    return <section className={`activity-part ${entry.kind === "thought" ? "activity-thought" : ""}`} aria-label={kind === "arguments" ? "Operation arguments" : "Operation result"}>
      <header><strong>{title ?? (kind === "arguments" ? "Arguments" : entry.kind === "thought" ? "Provider-exposed reasoning" : "Result")}</strong></header>
      {entry.kind === "thought" ? <div className="markdown"><Suspense fallback={<p>{content.text}</p>}><RichMessage text={content.text} openLink={(href) => {
        void window.moguri.openExternal(href).catch((error: unknown) => {
          if (owner.current.sdk === sdk && owner.current.key === key) setState((value) => ({ ...value, error: error instanceof Error ? error.message : "The selected link could not be opened." }));
        });
      }} /></Suspense></div> : <pre>{content.text || "Empty captured response."}</pre>}
      {(content.offset > 0 || content.nextOffset !== null) && <div className="button-row">
        {content.offset > 0 && <button type="button" onClick={() => offset(0)}>First {kind === "arguments" ? "arguments" : "result"} page</button>}
        {content.nextOffset !== null && <button type="button" onClick={() => offset(content.nextOffset!)}>Next {kind === "arguments" ? "arguments" : "result"} page</button>}
      </div>}
    </section>;
  };
  return <details className={`activity-row activity-${entry.kind} activity-status-${observed.status}`} data-activity-id={entry.id} data-kind={entry.kind} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span className="activity-chevron"><Icon name="Down" /></span><Icon name={icons[entry.kind]} /><span className="activity-title">{entry.label}{entry.subject && <span className="activity-subject" title={entry.subject}>{entry.subject}</span>}</span>
      {observed.status !== "completed" && <span className="activity-state">{observed.errorCode === "not_found" ? "Not Found" : observed.status.replaceAll("_", " ")}</span>}
    </summary>
    {open && <div className="activity-expansion">
      {state.loading && (needsArguments && !localArguments || needsOutput && !localOutput) && <p role="status">Reading additional retained data...</p>}
      {current && state.error && <Alert as="p" className="inline-error" role="alert">{state.error}</Alert>}
      {localArguments && renderPart(localArguments, "arguments")}
      {current && !localArguments && renderPart(state.arguments, "arguments")}
      {localOutput && renderPart(localOutput, "output", outputMatchesRetained ? undefined : "Conversation result")}
      {current && !localOutput && renderPart(state.output, "output")}
      {localOutput && !outputMatchesRetained && <p className="fine-print">Showing the exact tool result saved in this conversation. Separate retained source bytes are not fetched automatically.</p>}
      {!observed.hasOutput && <p className="fine-print">{running ? "No result has been observed yet." : "No readable result is retained for this operation."}</p>}
      {["partial", "unconfirmed"].includes(observed.status) && <Alert as="p" className="settings-warning" role="alert">This result is partial or unconfirmed. Inspect it before explicitly choosing Resume; no continuation or cleanup success is implied.</Alert>}
      {observed.hasOutput && observed.outputBasis === "retained-tail" && <p className="fine-print">Bounded captured output tail, not complete process output. No final result has been retained.</p>}
      {entry.kind === "thought" && <p className="fine-print">Only provider-exposed reasoning. Request duration covers the whole model call; separate thought time is not reported.</p>}
      <footer className="activity-metrics">
        <span title={observed.startedAt ?? undefined}>Started <strong>{activityStarted(observed.startedAt)}</strong></span>
        <span title={observed.durationBasis === "model-request" ? "Observed complete model request, not separate thought time." : observed.durationBasis === "source-load" ? "Observed source loading time." : "Observed lifecycle wall time, including waiting; not CPU active time."}>{running ? "Elapsed" : "Duration"} <strong>{activityDuration(running ? live : observed.durationMs)}</strong></span>
        <span title={observed.outputBytes === null ? "No output quantity observed." : `${observed.outputBasis === "retained-tail" ? "Bounded captured tail" : "Retained output"}; not total process/network output.`}>Output <strong>{activityBytes(observed.outputBytes)}</strong></span>
      </footer>
    </div>}
  </details>;
}
export function CurrentActivity({ entries, hasMore = false }: { entries: ActivityEntry[]; hasMore?: boolean }) {
  const running = entries.filter(active), current = running.at(-1);
  const elapsed = useElapsed(current?.startedAt ?? null, Boolean(current));
  if (!current) return null;
  return <div className="current-activity" aria-label="Current operation"><span className={current.status === "waiting_input" ? "activity-waiting" : "activity-spinner"}><Icon name={current.status === "waiting_input" ? "Question" : "Progress"} /></span>
    <span>{current.status === "waiting_input" ? "Waiting for your answer" : current.label}{current.subject && <span className="activity-subject" title={current.subject}>{current.subject}</span>}</span>
    {(running.length > 1 || hasMore) && <small>{running.length}{hasMore ? "+" : ""} concurrent</small>}<time role="timer" aria-live="off" aria-label="Elapsed operation time">{activityDuration(elapsed)}</time>
  </div>;
}
export function TurnActions({ sdk, sessionId, turnId, info, canCopy, modal }: {
  sdk: MoguriSdk; sessionId: string; turnId: string; info: TurnInfo | undefined; canCopy: boolean;
  modal: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const error = info && (info.sessionId !== sessionId || info.turnId !== turnId) ? "Saved turn information belongs to another source. No data was substituted." : "";
  useEffect(() => { if (open) modal(true); return () => { if (open) modal(false); }; }, [open, modal]);
  useEffect(() => {
    const element = panel.current, anchor = button.current;
    if (!open || !element || !anchor) return;
    element.showPopover(); element.focus({ preventScroll: true });
    const position = () => {
      const bounds = anchor.getBoundingClientRect(), size = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(innerWidth - size.width - 8, bounds.left))}px`;
      element.style.top = `${Math.max(8, Math.min(innerHeight - size.height - 8, bounds.top - size.height - 7))}px`;
    };
    const observer = new ResizeObserver(position); observer.observe(element); position();
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); if (element.matches(":popover-open")) element.hidePopover(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open]);
  const tokens = (value: number | null, known = 0, estimate?: number | null) => value === null ?
    estimate !== null && estimate !== undefined ? `~${estimate.toLocaleString()}` : known > 0 ? `${known.toLocaleString()} known + unknown` : "Not reported" : value.toLocaleString();
  return <footer className="turn-actions" aria-label="Response actions">
    <CopyButton label="Copy response" disabled={!canCopy} source={`${sdk.profileId}:${sessionId}:${turnId}`} text={() => sdk.activity.response(sessionId, turnId)} />
    <button ref={button} className="icon-button" type="button" title="Turn information" aria-label="Turn information" aria-haspopup="dialog" aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Icon name="Info" /></button>
    {open && <div ref={panel} id={panelId} tabIndex={-1} className="turn-info-popover" popover="auto" role="dialog" aria-label="Turn information" onToggle={(event) => {
      if (event.newState === "closed") { setOpen(false); button.current?.focus(); }
    }}>
      {error ? <Alert as="p" className="inline-error" role="alert">{error}</Alert> : !info ? <p role="status">No original telemetry was recorded for this turn.</p> : <>
        <dl><dt>{info.models.length > 1 ? "Models" : "Model"}</dt><dd>{info.models.length ? [...new Set(info.models.map((model) => model.modelId))].join(", ") : "Not observed"}</dd>
          <dt>Est. USD</dt><dd>{estimatedCost(info.usage, info.estimate)}</dd>
          <dt>Tokens</dt><dd>{tokens(info.usage.inputTokens, info.usage.knownInputTokens, info.estimate?.inputTokens)} in / {tokens(info.usage.outputTokens, info.usage.knownOutputTokens, info.estimate?.outputTokens)} out</dd>
          <dt>Cache</dt><dd>{tokens(info.usage.cacheReadTokens, info.usage.knownCacheReadTokens)} read / {tokens(info.usage.cacheWriteTokens, info.usage.knownCacheWriteTokens)} write
            {info.usage.inputTokens !== null && info.usage.inputTokens > 0 && info.usage.cacheReadTokens !== null && <small> ({Math.round(info.usage.cacheReadTokens / info.usage.inputTokens * 100)}% cached input)</small>}</dd>
          <dt>Context</dt><dd>{info.context?.estimatedTokens !== null && info.context?.estimatedTokens !== undefined ? `~${info.context.estimatedTokens.toLocaleString()}${info.context.window ? ` / ${info.context.window.toLocaleString()}` : ""} tokens` : "Not recorded"}</dd>
        </dl>
        <details><summary>Original turn details</summary><dl><dt>Started</dt><dd>{activityStarted(info.startedAt)}</dd><dt>Duration</dt><dd>{activityDuration(info.durationMs)}</dd>
          <dt>Outcome</dt><dd>{info.outcome}</dd><dt>Response</dt><dd>{activityBytes(info.responseBytes)}</dd>
          <dt>Working window</dt><dd>{info.context?.window ? `${info.context.window.toLocaleString()} tokens` : "Not observed"}</dd>
          <dt>Context estimate</dt><dd>{info.context?.estimatedTokens === null || !info.context ? "Not observed" : `~${info.context.estimatedTokens.toLocaleString()}`}</dd>
          <dt>Reasoning tokens</dt><dd>Not separately reported</dd>
        </dl><p className="fine-print">Original model/context evidence and complete owning-turn accounting. Values prefixed with ~ use retained input and visible-output estimates, not provider reports. Estimated USD is not a bill or AI-credit balance; missing cache telemetry stays unknown.</p></details>
      </>}
    </div>}
  </footer>;
}
