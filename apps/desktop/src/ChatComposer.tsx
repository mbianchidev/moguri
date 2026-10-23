import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { DraftEditor, KUPO_MODEL_ID, modelContextWindows, pasteLineCount, slashCommands, attachmentTriggers, parseAttachmentTrigger, type Controls, type ModelContextPreview, type ModelInfo, type ModelOptions, type MoguriSdk, type Project, type Session, type Snapshot, type ThinkingEffort } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { AttachmentMenu, AttachmentReview, ContextImage, clipboardImage, type AttachmentReviewRequest } from "./ContextAttachments.tsx";
import { BudgetLimitEditor, BudgetSummary, useBudgetStatus } from "./BudgetControls.tsx";
import { ContextCompactionReview } from "./ContextCompaction.tsx";
import { ModelEvidencePanel } from "./ModelEvidencePanel.tsx";
import { useDecisionStatus } from "./DecisionPanel.tsx";
import { TaskProgressBar } from "./TaskProgress.tsx";
import { ContextDocument } from "./DocumentAttachment.tsx";

type Menu = "attach" | "env" | "model" | "autonomy" | "budget" | "delivery";
type Run = (operation: () => Promise<unknown>) => Promise<void>;
const envIcon = { Local: "House", Sandbox: "Box", Remote: "Globe" } as const;
const autonomyIcon = { Manual: "Hand", Guided: "Traffic", Autopilot: "Car", "Autopilot Max": "Rocket" } as const;
const compact = (value: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const count = (value: number) => new Intl.NumberFormat().format(value);
export function useQueueModifier(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const update = (event: KeyboardEvent) => setHeld(event.metaKey || event.ctrlKey);
    const reset = () => setHeld(false);
    window.addEventListener("keydown", update); window.addEventListener("keyup", update); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", update); window.removeEventListener("keyup", update); window.removeEventListener("blur", reset); };
  }, []);
  return held;
}
export function chatSubmission(event: ReactKeyboardEvent<HTMLTextAreaElement>): "hold" | "send" | null {
  if (event.nativeEvent.isComposing || event.keyCode === 229 || event.key !== "Enter" || event.altKey ||
    event.shiftKey && !event.metaKey && !event.ctrlKey) return null;
  event.preventDefault();
  if (event.repeat) return null;
  return (event.metaKey || event.ctrlKey) && !event.shiftKey ? "hold" : "send";
}

export function ChatComposer({ session, project, snapshot, client, editor, run, busy, connected, onConnect, onSlash, onMenuChange, onGuardrails, onLocalModels, onRemote, onSandbox, onRouting, onDecisions }: {
  session: Session; project?: Project; snapshot: Snapshot; client: MoguriSdk; editor: DraftEditor; run: Run; busy: boolean; connected: boolean;
  onConnect: () => void; onMenuChange: (open: boolean) => void; onGuardrails: () => void;
  onLocalModels: () => void; onRemote: () => void; onSandbox: () => void; onRouting: () => void; onDecisions: () => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [menu, setMenu] = useState<Menu | null>(null);
  const decisions = useDecisionStatus(client, session, snapshot, menu === "autonomy" || session.controls.autonomy === "Autopilot Max");
  const [attachmentReview, setAttachmentReview] = useState<AttachmentReviewRequest | null>(null);
  const [contextReview, setContextReview] = useState(false);
  const [progressReview, setProgressReview] = useState(false);
  const [pendingTrigger, setPendingTrigger] = useState<ReturnType<typeof parseAttachmentTrigger>>(null);
  const [documentCapture, setDocumentCapture] = useState<{ id: string; name: string } | null>(null), [documentError, setDocumentError] = useState("");
  const heldModifier = useQueueModifier();
  const [configurationCount, setConfigurationCount] = useState(0), [configurationError, setConfigurationError] = useState("");
  const configuring = configurationCount > 0;
  const trackConfiguration = useCallback((started: boolean) => setConfigurationCount((count) => count + (started ? 1 : -1)), []);
  const [delivery, setDelivery] = useState<"queue" | "steer" | "interrupt">("queue");
  const model = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const eligibleModel = Boolean(model && (!model.environments || model.environments.includes(session.controls.env)));
  const nativeStage = snapshot.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId && value.sessionId === session.id);
  const needsNativeStage = session.controls.env === "Sandbox" && nativeStage?.status !== "ready";
  const voiceJob = snapshot.jobs.findLast((job) => job.sessionId === session.id && job.kind === "voice.record" && job.status === "running");
  const voiceOutcome = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe"].includes(job.kind));
  const [dictationPending, setDictationPending] = useState(false);
  const dictationBusy = useRef(false);
  const transcript = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe"].includes(job.kind) && job.status === "completed");
  const [insertedTranscript, setInsertedTranscript] = useState<string | null>(null);
  const isSlash = draft.text.startsWith("/");
  const attachmentTrigger = isSlash ? null : parseAttachmentTrigger(draft.text);
  const requiresImages = Boolean(session.inheritedImages) || draft.attachments.some((attachment) => attachment.kind === "image") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "image"));
  const requiresDocuments = draft.attachments.some((attachment) => attachment.kind === "document") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "document"));
  const documentBlocked = requiresDocuments && (model?.toolInput === false || session.kind === "metachat" || session.kind === "subagent");
  const held = heldModifier && !isSlash;
  const hardBudget = Boolean(snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit);
  const question = snapshot.questions.find((question) => question.id === session.pendingQuestionId && question.status === "open");
  const answering = Boolean(question && delivery === "queue" && !isSlash);
  const canQueue = connected && !busy && !configuring && session.status !== "archived" && Boolean(draft.text.trim() || draft.attachments.length) && !draft.conflict;
  const canSend = answering ? canQueue && Boolean(draft.text.trim()) && Boolean(question?.allowFreeform || question?.choices.includes(draft.text)) :
    canQueue && snapshot.provider.status === "connected" && eligibleModel && !needsNativeStage && (session.controls.autonomy !== "Autopilot Max" || decisions.ready) &&
    snapshot.policy.allowedEnvs.includes(session.controls.env) && Boolean(snapshot.capabilities.find((capability) => capability.env === session.controls.env)?.ready) && (!requiresImages || Boolean(model?.imageInput)) && !documentBlocked && (delivery === "queue" || Boolean(session.turnId));
  const suggestions = isSlash && !/\s/.test(draft.text) ? slashCommands.filter((command) => command.name.startsWith(draft.text.slice(1))).slice(0, 7) : [];
  useEffect(() => { onMenuChange(menu !== null || attachmentReview !== null || contextReview || progressReview); return () => onMenuChange(false); }, [menu, attachmentReview, contextReview, progressReview, onMenuChange]);
  const adopt = async (saved: Session["draft"]) => {
    const text = editor.getState().text;
    editor.receive(saved);
    if (pendingTrigger && text.slice(pendingTrigger.start) === pendingTrigger.prefix + pendingTrigger.query) {
      editor.edit(text.slice(0, pendingTrigger.start).trimEnd(), saved.attachments);
      await editor.flush();
    }
    setPendingTrigger(null);
  };
  const capture: Run = (work) => run(async () => {
    const ids = new Set(editor.getState().attachments.map((attachment) => attachment.id));
    await editor.flush(); await work();
    const saved = client.getState().snapshot?.sessions.find((session) => session.id === editor.sessionId)?.draft;
    if (saved) { if (saved.attachments.some((attachment) => !ids.has(attachment.id))) await adopt(saved); else editor.receive(saved); }
  });
  const selectFile = (mode: "auto" | "image" | "document") => {
    void capture(async () => {
      const path = await window.moguri.chooseAttachment(mode === "auto" ? "file" : mode);
      if (!path) return;
      if (mode === "document" || mode === "auto" && /\.(pdf|xlsx|docx)$/i.test(path)) {
        const id = crypto.randomUUID(); setDocumentCapture({ id, name: path.split(/[\\/]/).at(-1) ?? "Selected document" }); setDocumentError("");
        try { await client.attachments.document(session.id, path, { captureId: id }); } finally { setDocumentCapture(null); }
      } else await client.attachments.file(session.id, path, mode);
    });
  };
  const send = (event?: FormEvent, hold = held) => {
    event?.preventDefault();
    void run(async () => {
      if (isSlash) return onSlash(session, editor, draft.text);
      if (answering && question && !hold) { await editor.flush(); return client.questions.answerDraft(question.id, question.revision); }
      return editor.send(hold ? "queue" : delivery, hold);
    });
  };
  const dictate = useCallback(async () => {
    if (dictationBusy.current) return;
    dictationBusy.current = true; setDictationPending(true);
    try {
      await run(async () => {
        if (voiceJob) return client.voice.stop(voiceJob.id);
        await editor.flush();
        const status = (await client.voice.status()).voice;
        if (!status.runtimeReady || !status.modelReady) throw new Error(status.diagnostic ?? "Set up local dictation in Settings before recording.");
        if (!await window.moguri.microphonePermission()) throw new Error("Microphone permission was denied. No audio was recorded.");
        return client.voice.record(session.id);
      });
    } finally { dictationBusy.current = false; setDictationPending(false); }
  }, [client, editor, run, session.id, voiceJob?.id]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !connected || session.status === "archived" || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.code !== "Space" && event.key !== " " || event.isComposing ||
        event.target instanceof Element && event.target.closest(".ghostty-host, .side-chat-panel, dialog, [popover]")) return;
      event.preventDefault();
      if (!event.repeat) void dictate();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [dictate, connected, session.status]);
  const configure = (controls: Controls) => run(async () => {
    await client.sessions.configure(session.id, controls, session.revision);
    setMenu(null);
  });
  const toggle = (value: Menu) => { if (value === "attach") setPendingTrigger(null); setMenu((current) => current === value ? null : value); };
  const chooseAttachmentTrigger = () => { if (attachmentTrigger) { setPendingTrigger(attachmentTrigger); setMenu("attach"); } };
  const close = (value: Menu) => setMenu((current) => current === value ? null : current);
  const status = draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved";
  const sendLabel = isSlash ? "Run command" : held ? "Queue prompt without starting work" : answering ? "Answer question" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send";
  const item = (name: Menu, label: string, icon: string, children: ReactNode) => <ComposerPopover name={name} label={label} description={name === "env" ? `${session.controls.env}. ${session.controls.env === "Remote" ? "SSH-host execution, not SendBox isolation." : session.controls.env === "Sandbox" ? "Native SendBox guest; exact qualification and private staging are required." : "Host execution is not sandboxed."}` : name === "autonomy" ? session.controls.autonomy : name === "budget" ? session.controls.budget.kind === "unlimited" ? hardBudget ? "Unlimited preference; hard policy applies" : "Unlimited" : "Estimate-based cap" : undefined} open={menu === name} toggle={() => toggle(name)} close={() => close(name)} trigger={<Icon name={icon} />}>{children}</ComposerPopover>;
  return <form className="composer compact-composer" onSubmit={(event) => send(event)} onKeyDown={(event) => { if (event.key === "Escape") setPendingTrigger(null); }} aria-label="Message composer" aria-description={answering ? "Enter answers. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without answering." : "Enter sends. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without starting work."}>
    <TaskProgressBar sdk={client} session={session} connected={connected} details={progressReview} open={() => setProgressReview(true)} close={() => setProgressReview(false)} />
    {documentCapture && <div className="document-capture"><p role="status">Extracting {documentCapture.name} locally. No model call; your draft is preserved.</p><progress aria-label="Local document extraction" /><button type="button" onClick={() => void client.attachments.cancelDocument(session.id, documentCapture.id).catch((error: unknown) => setDocumentError(error instanceof Error ? error.message : "Capture stop is unconfirmed. Inspect the saved draft."))}>Cancel extraction</button></div>}
    {documentError && <p className="inline-error" role="alert">{documentError}</p>}
    {configuring && <p className="composer-context-warning" role="status">Saving model settings. Your draft is preserved until the change settles.</p>}
    {configurationError && menu !== "model" && <p className="inline-error" role="alert">{configurationError}</p>}
    {session.controls.modelId && !model && <button type="button" className="setup-hint" onClick={session.controls.modelId === KUPO_MODEL_ID ? onRouting : onConnect}>{session.controls.modelId === KUPO_MODEL_ID ? "Saved kupo selection is blocked. Inspect its approved pool and hard-budget policy; no fallback was used." : `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.`}<Icon name="Down" /></button>}
    {model && !eligibleModel && <button type="button" className="setup-hint" onClick={() => setMenu("model")}>This saved model is not available in {session.controls.env}. Choose a compatible model explicitly.<Icon name="Down" /></button>}
    {requiresImages && model && !model.imageInput && !answering && <p className="composer-context-warning" role="status">Select an image-capable model. The complete context stays in your draft or conversation.</p>}
    {documentBlocked && !answering && <p className="composer-context-warning" role="status">Documents need an ordinary chat and tool-capable model. Your complete draft and held queue are preserved; no document is dropped or expanded into the prompt.</p>}
    {answering && draft.attachments.length > 0 && <p className="composer-context-warning" role="status">Answers consume only text. Attached context stays saved.</p>}
    {session.localFinishing && <p className="local-finishing">Local finishing. New Local turns are blocked by policy.</p>}
    {needsNativeStage && <button type="button" className="setup-hint" onClick={onSandbox}>Review a private native workspace before starting a turn. Your draft and held queue are preserved.<Icon name="Box" /></button>}
    {session.controls.autonomy === "Autopilot Max" && !decisions.ready && <button type="button" className="setup-hint" onClick={onDecisions}>{decisions.reason}<Icon name="Rocket" /></button>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <span key={attachment.id} title={`${attachment.kind} / ${attachment.bytes} bytes / SHA-256 ${attachment.digest}`}>{attachment.kind === "document" ? <ContextDocument sdk={client} sessionId={session.id} attachment={attachment} /> : <>{attachment.kind === "image" ? <ContextImage sdk={client} sessionId={session.id} attachment={attachment} /> : <Icon name={attachment.kind === "session" ? "Side chat" : attachment.kind.startsWith("github") ? "PR" : "Files"} />}{attachment.path}</>}<button type="button" aria-label={`Remove attachment ${attachment.path}`} onClick={() => editor.edit(draft.text, draft.attachments.filter((item) => item.id !== attachment.id))}><Icon name="Close" /></button></span>)}</div>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>Prompt</label>
    <textarea id={`prompt-${session.id}`} placeholder={answering ? question?.allowFreeform ? "Type your answer..." : "Choose one of the offered answers above..." : session.kind === "metachat" ? "Ask about Moguri settings..." : project ? "Ask anything about this project..." : "Ask anything..."} value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length) {
          const text = event.clipboardData.getData("text/plain");
          if (pasteLineCount(text) > 50) {
            event.preventDefault();
            const { selectionStart, selectionEnd } = event.currentTarget;
            void run(() => editor.paste(text, selectionStart, selectionEnd));
          }
          return;
        }
        event.preventDefault();
        void capture(async () => { if (files.length !== 1) throw new Error("Paste one image at a time. No clipboard files were attached or sent."); const file = files[0]!; await client.attachments.image(session.id, await clipboardImage(file), (file.name || "Clipboard image").slice(0, 100)); });
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Tab" && suggestions[0]) { event.preventDefault(); editor.edit(`/${suggestions[0].name} `); }
        else if (event.key === "Tab" && attachmentTrigger) { event.preventDefault(); chooseAttachmentTrigger(); }
        else {
          const action = chatSubmission(event);
          if (action && (isSlash || action === "hold" ? canQueue : canSend)) send(undefined, action === "hold");
        }
      }} />
    {suggestions.length > 0 && <div className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion) => <button type="button" role="option" aria-selected={false} key={suggestion.name} onClick={() => editor.edit(`/${suggestion.name} `)}><strong>/{suggestion.name}</strong><span>{suggestion.description}</span></button>)}</div>}
    {attachmentTrigger && <button className="attachment-trigger-hint quiet" type="button" onClick={chooseAttachmentTrigger}>{attachmentTrigger.prefix} {attachmentTriggers[attachmentTrigger.prefix]}<small>Tab to choose; text stays literal until selection</small></button>}
    {draft.error && <div className="draft-error" role="alert"><p>{draft.error}</p><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    {voiceJob && <p className="composer-voice-status fine-print" role="status">{voiceJob.progress || "Starting local dictation. Ctrl+Space stops and transcribes; nothing is sent."}</p>}
    {voiceOutcome?.status === "failed" && <p className="composer-voice-status inline-error" role="alert">{voiceOutcome.error || "Local dictation failed. Your draft is unchanged."}</p>}
    {transcript && transcript.id !== insertedTranscript && <div className="composer-transcript"><Icon name="Mic" /><span>Dictation ready</span><button type="button" onClick={() => void run(async () => { await editor.flush(); await client.voice.insert(session.id, transcript.id, client.getState().snapshot!.sessions.find((item) => item.id === session.id)!.draft.revision); setInsertedTranscript(transcript.id); })}>Insert</button></div>}
    <div className="composer-toolbar">
      <div className="composer-leading">
        {item("attach", "Attach", "Plus", <AttachmentMenu sdk={client} session={session} project={project} snapshot={snapshot} editor={editor} run={run} capture={capture} selectFile={selectFile} initial={pendingTrigger} close={() => setMenu(null)} review={(request) => { setAttachmentReview(request); setMenu(null); }} />)}
        {item("env", "Execution environment", envIcon[session.controls.env], <><h2>Execution environment</h2>{snapshot.capabilities.map((capability) => <button className="composer-menu-option" key={capability.env} type="button" disabled={Boolean(session.turnId) || !capability.ready || !snapshot.policy.allowedEnvs.includes(capability.env)} aria-pressed={session.controls.env === capability.env} title={capability.reason} onClick={() => void run(async () => { await client.sessions.env(session.id, capability.env, session.revision); setMenu(null); })}><Icon name={envIcon[capability.env]} /><span>{capability.env}<small>{!snapshot.policy.allowedEnvs.includes(capability.env) ? "Blocked by policy" : capability.env === "Local" ? "Host execution, not sandboxed" : !capability.ready ? "Not ready" : capability.env === "Sandbox" ? "Verified SendBox guest; private stage required" : "Verified SSH host, not SendBox isolation"}</small></span>{session.controls.env === capability.env && <Icon name="Check" />}</button>)}<p>Remote transfers approved context to {snapshot.settings.values.remote?.name ?? "the configured SSH host"}. Sandbox uses a separately reviewed private stage and scoped model access, never a live source checkout. Missing readiness never falls back to Local; unavailable models are cleared, not substituted.</p><button type="button" className="quiet" onClick={() => { setMenu(null); onRemote(); }}>Remote SSH setup</button><button type="button" className="quiet" onClick={() => { setMenu(null); onGuardrails(); }}>Sandbox qualification</button><button type="button" className="quiet" onClick={() => { setMenu(null); onSandbox(); }}>Native workspace and results</button></>)}
        <ComposerPopover name="model" label="Model" description={model?.name ?? session.controls.modelId ?? "Select model"} open={menu === "model"} toggle={() => toggle("model")} close={() => close("model")} trigger={<span className="composer-model-name">{model?.name ?? (session.controls.modelId ? session.controls.modelId : "Select model")}</span>} model>
          <ModelMenu sdk={client} session={session} snapshot={snapshot} requiresImages={requiresImages} onConnect={() => { setMenu(null); onConnect(); }} onLocalModels={() => { setMenu(null); onLocalModels(); }} onRouting={() => { setMenu(null); onRouting(); }} onContext={() => { setMenu(null); setContextReview(true); }} onSaving={trackConfiguration} onError={setConfigurationError} pending={configuring} />
        </ComposerPopover>
        {item("autonomy", "Autonomy level", autonomyIcon[session.controls.autonomy], <><h2>Autonomy</h2>{(["Manual", "Guided", "Autopilot", "Autopilot Max"] as const).map((autonomy) => {
          const grants = snapshot.settings.values.permissions.tools.some((rule) => rule.decision === "allow") || snapshot.settings.values.permissions.commands.some((rule) => rule.decision === "allow");
          const reason = autonomy === "Manual" ? "You approve tools" : autonomy === "Guided" ? "Advice, then your confirmation" : autonomy === "Autopilot" ? grants ? "Within explicit delegations" : "Undelegated tools still ask; no permissions added" : decisions.ready ? "Explicit bounded decision provider; existing policy remains final" : decisions.reason;
          return <button className="composer-menu-option" type="button" key={autonomy} aria-pressed={autonomy === session.controls.autonomy} disabled={Boolean(session.turnId) || autonomy === "Autopilot Max" && !decisions.ready} title={reason} onClick={() => void configure({ ...session.controls, autonomy })}><Icon name={autonomyIcon[autonomy]} /><span>{autonomy}<small>{reason}</small></span>{autonomy === session.controls.autonomy && <Icon name="Check" />}</button>;
        })}{decisions.error && <p className="inline-error" role="alert">{decisions.error}</p>}<button className="quiet" type="button" onClick={() => { setMenu(null); onGuardrails(); }}>Guardrails</button><button className="quiet" type="button" onClick={() => { setMenu(null); onDecisions(); }}>Decision provider settings</button></>)}
      </div>
      <div className="composer-trailing">
        {item("budget", "Budget and usage", session.controls.budget.kind === "unlimited" && !hardBudget ? "Infinity" : "Dollar", <UsageMenu key={session.id} sdk={client} session={session} snapshot={snapshot} editor={editor} />)}
        <button className={`icon-button composer-mic ${voiceJob ? "recording" : ""}`} type="button" aria-label={voiceJob ? "Stop local dictation" : "Start local dictation"} aria-pressed={Boolean(voiceJob)} disabled={dictationPending || !connected || session.status === "archived"} title={voiceJob ? "Stop and transcribe (Ctrl+Space)" : "Dictate (Ctrl+Space)"} onClick={() => void dictate()}><Icon name={voiceJob ? "Stop" : "Mic"} /></button>
        <div className="composer-send-group">
          {session.turnId ? <button className="icon-button composer-send composer-stop" type="button" aria-label={session.status === "stopping" ? "Stopping turn" : "Stop turn"} title="Stop the current turn. Your unsent draft is preserved." disabled={!connected || session.status === "stopping"} onClick={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))}><Icon name="Stop" /></button> :
            <button className="primary icon-button composer-send" type="submit" aria-label={sendLabel} title={held ? "Queue without starting (Cmd/Ctrl+Enter)" : `${sendLabel}. Hold Cmd/Ctrl to queue without starting.`} disabled={isSlash || held ? !canQueue : !canSend} onClick={(event) => { event.preventDefault(); send(undefined, (event.metaKey || event.ctrlKey || held) && !isSlash); }}><Icon name={held ? "Clock" : "Send"} /></button>}
          <ComposerPopover name="delivery" label="Delivery mode" open={menu === "delivery"} toggle={() => toggle("delivery")} close={() => close("delivery")} trigger={<Icon name="Down" />}>
            <h2>Delivery</h2>{(["queue", "steer", "interrupt"] as const).map((value) => <button className="composer-menu-option" type="button" key={value} aria-pressed={delivery === value} disabled={value !== "queue" && !session.turnId} onClick={() => { setDelivery(value); setMenu(null); }}><Icon name={value === "queue" ? "Send" : value === "steer" ? "Agent" : "Stop"} /><span>{value === "queue" ? question && !isSlash ? "Answer actual question" : session.turnId ? "Queue after current turn" : "Send" : value === "steer" ? "Steer at next boundary" : "Interrupt current turn"}</span></button>)}
            {session.turnId && <button className="primary" type="button" disabled={held || isSlash ? !canQueue : !canSend} onClick={() => { setMenu(null); send(undefined, held); }}>{sendLabel}</button>}
            <p>Enter sends using this delivery mode. Cmd/Ctrl+Enter always holds the prompt instead.</p>
          </ComposerPopover>
        </div>
      </div>
      <span className="sr-only" role="status">{status}</span>
    </div>
    {attachmentReview && <AttachmentReview sdk={client} sessionId={session.id} editor={editor} request={attachmentReview} adopt={adopt} close={() => setAttachmentReview(null)} />}
    {contextReview && <ContextCompactionReview sdk={client} session={session} snapshot={snapshot} close={() => { setContextReview(false); document.getElementById(`prompt-${session.id}`)?.focus(); }} />}
  </form>;
}

function ComposerPopover({ name, label, description, open, toggle, close, trigger, children, model = false }: {
  name: Menu; label: string; description?: string; open: boolean; toggle: () => void; close: () => void; trigger: ReactNode; children: ReactNode; model?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const element = panel.current;
    element.showPopover();
    const position = () => {
      if (!button.current) return;
      const anchor = button.current.getBoundingClientRect();
      const parent = button.current.closest(".composer")!.getBoundingClientRect();
      element.style.width = `${Math.min(360, parent.width, window.innerWidth - 24)}px`;
      const width = element.getBoundingClientRect().width;
      element.style.left = `${Math.max(12, Math.min(parent.right - width, anchor.left, window.innerWidth - width - 12))}px`;
      element.style.maxHeight = `${Math.max(100, anchor.top - 60)}px`;
      element.style.top = `${Math.max(50, anchor.top - element.getBoundingClientRect().height - 8)}px`;
    };
    const observer = new ResizeObserver(position); observer.observe(element); observer.observe(button.current);
    observer.observe(button.current.closest(".composer")!);
    const navigation = button.current.closest(".app-shell")?.querySelector(".project-nav");
    if (navigation) observer.observe(navigation);
    position(); window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); if (element.matches(":popover-open")) element.hidePopover(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open]);
  return <div className={`composer-control ${model ? "model-menu-control" : ""}`}>
    <button ref={button} type="button" className={model ? "composer-model-button quiet" : "icon-button"} aria-label={model ? undefined : label} aria-description={description} title={description ? `${label}: ${description}` : label} data-composer-control={name} aria-haspopup="dialog" aria-expanded={open} aria-controls={`composer-${name}`} onClick={toggle}>{model && <span className="sr-only">Model: </span>}{trigger}</button>
    {open && <div ref={panel} id={`composer-${name}`} className={`composer-popover ${name}-popover`} popover="auto" role="dialog" aria-label={label} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); } }} onToggle={(event) => { if (event.newState === "closed") { if (document.activeElement === document.body || panel.current?.contains(document.activeElement)) button.current?.focus(); close(); } }}>{children}</div>}
  </div>;
}

function ModelMenu({ sdk, session, snapshot, onConnect, onLocalModels, onRouting, onContext, onSaving, onError, pending, requiresImages }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onConnect: () => void; onLocalModels: () => void; onRouting: () => void; onContext: () => void; onSaving: (saving: boolean) => void; onError: (message: string) => void; pending: boolean; requiresImages: boolean }) {
  const current = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState(session.controls.modelOptions?.contextWindow?.toString() ?? "");
  const [effort, setEffort] = useState<ThinkingEffort | "">(session.controls.modelOptions?.thinkingEffort ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const revision = useRef(session.revision);
  const windows = current && !current.synthetic ? modelContextWindows(current) : null;
  const staleWindow = Boolean(window && !windows?.values.includes(Number(window)));
  const reload = () => { revision.current = session.revision; setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? ""); setEffort(session.controls.modelOptions?.thinkingEffort ?? ""); setError(""); onError(""); };
  const options: ModelOptions = { ...(window ? { contextWindow: Number(window) } : {}), ...(effort ? { thinkingEffort: effort } : {}) };
  const dirty = options.contextWindow !== session.controls.modelOptions?.contextWindow || options.thinkingEffort !== session.controls.modelOptions?.thinkingEffort;
  const select = async (model: ModelInfo) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try {
      const { modelOptions: _, ...controls } = session.controls;
      const result = await sdk.sessions.configure(session.id, { ...controls, modelId: model.id }, revision.current);
      revision.current = result.revision!; setWindow(""); setEffort("");
    } catch (error) { const message = error instanceof Error ? error.message : "Model selection failed. No fallback was used."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const save = async (options: ModelOptions) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try { const result = await sdk.sessions.modelOptions(session.id, options, revision.current); revision.current = result.revision!; }
    catch (error) { const message = error instanceof Error ? error.message : "Model settings were not saved."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  return <><h2>Model</h2>{snapshot.provider.status !== "connected" ? <><p>Connect GitHub Copilot to discover account-enabled models.</p><button type="button" onClick={onConnect}>Connect Copilot</button></> : <>
    <input className="composer-model-search" aria-label="Search models" placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="composer-model-list">{snapshot.provider.models.filter((model) => (!model.environments || model.environments.includes(session.controls.env)) && model.name.toLowerCase().includes(search.toLowerCase())).map((model) => <button type="button" className="composer-menu-option" key={model.id} aria-pressed={model.id === session.controls.modelId} disabled={saving || pending || Boolean(session.turnId) || dirty || requiresImages && !model.imageInput} title={requiresImages && !model.imageInput ? "This context requires image input." : undefined} onClick={() => void select(model)}><span>{model.name}<small>{model.synthetic ? snapshot.settings.values.kupo.workflow === "compound" ? "Moguri / separately metered classifier, proposal and conditional roles" : "Moguri / separately metered router and solver" : `${model.source === "local" ? model.providerId : "GitHub Copilot"} / ${compact(model.contextWindow)} maximum context`}</small></span>{model.id === session.controls.modelId && <Icon name="Check" />}</button>)}</div>
    {!snapshot.provider.models.some((model) => !model.environments || model.environments.includes(session.controls.env)) && <p>No approved model is available in this env. For Remote, probe the SSH target and explicitly allow scoped Copilot access or configure a remote-local endpoint.</p>}
    <div className="model-tuning">
      <label>Working context<select aria-label="Working context window" value={window} disabled={!windows?.values.length || saving || pending || Boolean(session.turnId)} onChange={(event) => {
        const value = event.target.value; setWindow(value);
        void save({ ...(value ? { contextWindow: Number(value) } : {}), ...(effort ? { thinkingEffort: effort } : {}) });
      }}>
        <option value="">{windows?.values[0] ? `${windows.source === "provider" ? "Provider default" : "Model maximum"} (${count(windows.values[0])})` : current?.synthetic ? "Bound to actual approved solver" : "Select a compatible model"}</option>
        {windows?.values.map((value) => <option key={value} value={value}>{count(value)} tokens{windows.source === "provider" ? " (provider supported)" : value === current?.contextWindow ? " (maximum)" : " (half maximum)"}</option>)}
        {staleWindow && <option value={window} disabled>Saved unsupported window ({count(Number(window))})</option>}
      </select></label>
      <label>Thinking effort<select aria-label="Thinking effort" value={effort} disabled={!current?.thinkingLevels?.length || saving || pending || Boolean(session.turnId)} onChange={(event) => {
        const value = current?.thinkingLevels?.find((level) => level === event.target.value) ?? ""; setEffort(value);
        void save({ ...(window ? { contextWindow: Number(window) } : {}), ...(value ? { thinkingEffort: value } : {}) });
      }}><option value="">{current?.thinkingLevels?.length ? "Model default" : "Provider controlled"}</option>{current?.thinkingLevels?.map((level) => <option value={level} key={level}>{level}</option>)}</select></label>
      <p>{current?.synthetic ? snapshot.settings.values.kupo.workflow === "compound" ? "Reviewed Compound uses exact Local source/worktree/test review in Candidates. Each role keeps its actual working window/output bound. Finite Local turns need explicit reserved wind-down; use a fixed model for tuning." : "Single alpha is text-only. Finite Local turns need the explicit reserved wind-down policy; use a fixed model for context/thinking overrides. Actual roles and model accounting remain separate." : "Working context stays within the model maximum. Counts are estimated; overfull requests stop without truncating history."}</p>
      {session.turnId && <p>Stop the active turn before changing model settings.</p>}
      {staleWindow && <p className="inline-error" role="alert">The saved working window is no longer supported. Choose an offered window explicitly. History and saved settings were not clamped.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row"><span className="fine-print" role="status">{saving ? "Saving..." : dirty ? "Settings were not saved. Reload before choosing again." : "Changes save automatically."}</span><button type="button" className="quiet" disabled={saving || pending} onClick={reload}>Reload</button></div>
    </div>
  </>}<ModelEvidencePanel sdk={sdk} model={current} scope={JSON.stringify([sdk.profileId, session.id, session.controls.env, current?.id])} remote={session.controls.env === "Remote"} />
    <button className="quiet" type="button" disabled={saving || pending} onClick={onContext}>Review context and compactions</button><button className="quiet" type="button" onClick={onLocalModels}>Configure local models</button><button className="quiet" type="button" onClick={onRouting}>{snapshot.settings.values.kupo.workflow === "compound" ? "kupo Compound settings" : "kupo Single settings"}</button></>;
}

function UsageMenu({ sdk, session, snapshot, editor }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; editor: DraftEditor }) {
  const accounting = useBudgetStatus(sdk, session, snapshot);
  const [budgetView, setBudgetView] = useState<"usage" | "limits">("usage");
  const [context, setContext] = useState<ModelContextPreview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void (async () => { await editor.flush(); const result = await sdk.sessions.context(session.id); if (current) { setContext(result.context); setError(""); } })().catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Context usage is unavailable."); });
    return () => { current = false; };
  }, [session.draft.revision, session.revision, session.usage.length, session.usage.at(-1)?.outcome]);
  const tokens = (field: "inputTokens" | "outputTokens" | "cacheReadTokens") => {
    if (!session.usage.length) return "0";
    const values = session.usage.map((usage) => usage[field]);
    const known = values.filter((value): value is number => value !== null);
    return known.length ? `${count(known.reduce((sum, value) => sum + value, 0))}${known.length < values.length ? " + unknown" : ""}` : "Not reported";
  };
  const dollars = (field: "estimatedUsd" | "providerReportedUsd" | "billedUsd") => {
    const values = session.usage.map((usage) => usage[field]);
    if (!values.length || values.every((value) => value === null)) return null;
    return `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(values.reduce<number>((sum, value) => sum + (value ?? 0), 0))}${values.some((value) => value === null) ? " + unknown" : ""}`;
  };
  return <><header className="composer-usage-heading"><h2>Usage</h2><span>{session.controls.budget.kind === "unlimited" ? snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit ? "Hard policy applies" : "Unlimited" : "Estimated cap"}</span></header>
    <div className="button-row"><button type="button" aria-pressed={budgetView === "usage"} onClick={() => setBudgetView("usage")}>Current usage</button><button type="button" aria-pressed={budgetView === "limits"} onClick={() => setBudgetView("limits")}>Session budget limits</button></div>
    <div hidden={budgetView !== "usage"}><dl className="composer-usage"><dt>Input tokens</dt><dd>{tokens("inputTokens")}</dd><dt>Output tokens</dt><dd>{tokens("outputTokens")}</dd><dt>Cached input</dt><dd>{tokens("cacheReadTokens")}</dd><dt>Context estimate</dt><dd>{context ? `~${count(context.estimatedTokens)}${context.contextWindow ? ` / ${count(context.contextWindow)}` : ""}` : error ? "Unavailable" : "Loading..."}</dd>
    {(["estimatedUsd", "providerReportedUsd", "billedUsd"] as const).map((field) => { const value = dollars(field); return value ? <div className="usage-dollar-row" key={field}><dt>{field === "estimatedUsd" ? "Estimated USD" : field === "providerReportedUsd" ? "Provider-reported USD" : "Billed USD"}</dt><dd>{value}</dd></div> : null; })}
  </dl>{!dollars("estimatedUsd") && !dollars("providerReportedUsd") && !dollars("billedUsd") && <p>USD not reported.</p>}<p>Context includes the saved draft and is estimated. Usage updates after each call; unreported values stay unknown.</p>
    {accounting.status && <BudgetSummary status={accounting.status} />}
    </div>
    <div hidden={budgetView !== "limits"}><BudgetLimitEditor sdk={sdk} snapshot={snapshot} session={session} scope="session" status={accounting.status} /></div>
    {(error || accounting.error) && <p className="inline-error" role="alert">{error || accounting.error}</p>}</>;
}
