import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { continueWorkInput, DraftEditor, isRecord, KUPO_MODEL_ID, modelContextWindows, pasteLineCount, sessionTitle, slashCommands, attachmentTriggers, parseAttachmentTrigger, shortcutLabel, type DraftDictation, type Controls, type ModelInfo, type ModelOptions, type MoguriSdk, type Project, type Session, type Snapshot, type ThinkingEffort } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { AttachmentChip, AttachmentMenu, AttachmentReview, matchingContextSessions, SESSION_DRAG_TYPE, clipboardImage, type AttachmentReviewRequest } from "./ContextAttachments.tsx";
import { BudgetLimitEditor, BudgetSummary, useBudgetStatus } from "./BudgetControls.tsx";
import { ContextCompactionReview } from "./ContextCompaction.tsx";
import { ModelEvidencePanel } from "./ModelEvidencePanel.tsx";
import { useDecisionStatus } from "./DecisionPanel.tsx";
import { estimatedCost } from "./ChatActivity.tsx";
import { useDictation, useDictationTranscript } from "./useDictation.ts";
import { DictationButton } from "./DictationButton.tsx";

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

export function ChatComposer({ session, project, snapshot, client, editor, run, busy, connected, onConnect, onSlash, onMenuChange, onGuardrails, onLocalModels, onRemote, onSandbox, onRouting, onDecisions, inputLabel = "Prompt", autoFocus = false, onPendingChange }: {
  session: Session; project?: Project; snapshot: Snapshot; client: MoguriSdk; editor: DraftEditor; run: Run; busy: boolean; connected: boolean;
  onConnect: () => void; onMenuChange: (open: boolean) => void; onGuardrails: () => void;
  onLocalModels: () => void; onRemote: () => void; onSandbox: () => void; onRouting: () => void; onDecisions: () => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
  inputLabel?: string; autoFocus?: boolean; onPendingChange?: (pending: boolean) => void;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const input = useRef<HTMLTextAreaElement>(null), dictated = useRef<DraftDictation | null>(null);
  const [insertedTranscript, setInsertedTranscript] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const decisions = useDecisionStatus(client, session, snapshot, menu === "autonomy" || session.controls.autonomy === "Autopilot Max");
  const [attachmentReview, setAttachmentReview] = useState<AttachmentReviewRequest | null>(null);
  const [contextReview, setContextReview] = useState(false);
  const [heldPending, setHeldPending] = useState(false);
  const [resuming, setResuming] = useState(false), resumePending = useRef(false);
  const [pendingTrigger, setPendingTrigger] = useState<ReturnType<typeof parseAttachmentTrigger>>(null);
  const triggerRef = useRef(pendingTrigger);
  const setTrigger = (value: typeof pendingTrigger) => { triggerRef.current = value; setPendingTrigger(value); };
  const [previewOpen, setPreviewOpen] = useState(false), [dragging, setDragging] = useState(false);
  const [sessionOption, setSessionOption] = useState(0), [dismissedTrigger, setDismissedTrigger] = useState<string | null>(null);
  const [finishingVoice, setFinishingVoice] = useState(false);
  const [documentCapture, setDocumentCapture] = useState<{ id: string; name: string } | null>(null), [documentError, setDocumentError] = useState("");
  const heldModifier = useQueueModifier();
  const [configurationCount, setConfigurationCount] = useState(0), [configurationError, setConfigurationError] = useState("");
  const configuring = configurationCount > 0;
  const trackConfiguration = useCallback((started: boolean) => setConfigurationCount((count) => count + (started ? 1 : -1)), []);
  const [delivery, setDelivery] = useState<"queue" | "steer" | "interrupt">("queue");
  const model = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const eligibleModel = Boolean(model && (!model.environments || model.environments.includes(session.controls.env)));
  const nativeStage = snapshot.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId && value.sessionId === session.id);
  const automaticNative = snapshot.settings.values.sandboxManagement?.enabled && snapshot.settings.values.sandboxManagement.automaticWorkspaces;
  const needsNativeStage = session.controls.env === "Sandbox" && nativeStage?.status !== "ready" && !automaticNative;
  const dictation = useDictation(client, session, snapshot, { shortcuts: true,
    beforeStart: async () => {
      await editor.flush(); dictated.current?.close();
      dictated.current = editor.startDictation(input.current?.selectionStart, input.current?.selectionEnd);
    },
    onTranscript: (text, id, final) => {
      if (!dictated.current) throw new Error("The original dictation composer is closed. No transcript was inserted elsewhere.");
      dictated.current.update(text);
      if (final) { dictated.current.close(); setInsertedTranscript(id); void run(() => editor.flush()); }
    } });
  useEffect(() => () => dictated.current?.close(), [editor]);
  const voiceJob = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.capture"].includes(job.kind) && job.status === "running");
  const voiceOutcome = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe", "voice.capture"].includes(job.kind));
  const transcript = voiceOutcome?.status === "completed" ? voiceOutcome : undefined;
  const transcriptPreview = useDictationTranscript(client, session.id, transcript?.id);
  const voiceFinalizing = finishingVoice || dictation.state.phase === "transcribing" || Boolean(voiceJob?.progress?.startsWith("Finalizing"));
  const voicePreparing = voiceJob?.kind === "voice.record" && Boolean(voiceJob.progress?.startsWith("Preparing"));
  const voiceActive = Boolean(voiceJob) || ["starting", "recording", "transcribing"].includes(dictation.state.phase) || dictation.state.cleanupPending;
  const isSlash = draft.text.startsWith("/");
  const attachmentTrigger = isSlash || dismissedTrigger === draft.text ? null : parseAttachmentTrigger(draft.text);
  const sessionOptions = attachmentTrigger && [":", "!"].includes(attachmentTrigger.prefix) ? matchingContextSessions(snapshot, session.id, attachmentTrigger.query) : [];
  useEffect(() => { setSessionOption(0); }, [attachmentTrigger?.prefix, attachmentTrigger?.query]);
  const requiresImages = Boolean(session.inheritedImages) || draft.attachments.some((attachment) => attachment.kind === "image") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "image"));
  const requiresDocuments = draft.attachments.some((attachment) => attachment.kind === "document") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "document"));
  const documentBlocked = requiresDocuments && (model?.toolInput === false || session.kind === "metachat" || session.kind === "subagent");
  const held = heldModifier && !isSlash;
  const holdingNext = heldPending || held && Boolean(draft.text.trim() || draft.attachments.length);
  const hardBudget = Boolean(snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit);
  const question = snapshot.questions.find((question) => question.id === session.pendingQuestionId && question.status === "open");
  const answering = Boolean(question && delivery === "queue" && !isSlash);
  const needsResume = !session.turnId && (snapshot.blockedSessions.includes(session.id) ||
    Boolean(session.workspaceId && snapshot.blockedWorkspaces.includes(session.workspaceId)) ||
    Boolean(session.projectId && !session.workspaceId && snapshot.blockedProjects.includes(session.projectId)));
  const resumeAction = needsResume && !isSlash && !held && !heldPending;
  const canResume = connected && !busy && !configuring && !resuming && session.status !== "archived";
  const canQueue = connected && !busy && !configuring && !resuming && !voiceActive && session.status !== "archived" && Boolean(draft.text.trim() || draft.attachments.length) && !draft.conflict;
  const canSend = answering ? canQueue && Boolean(draft.text.trim()) && Boolean(question?.allowFreeform || question?.choices.includes(draft.text)) :
    canQueue && snapshot.provider.status === "connected" && eligibleModel && !needsNativeStage && (session.controls.autonomy !== "Autopilot Max" || decisions.ready) &&
    snapshot.policy.allowedEnvs.includes(session.controls.env) && Boolean(snapshot.capabilities.find((capability) => capability.env === session.controls.env)?.ready) && (!requiresImages || Boolean(model?.imageInput)) && !documentBlocked && (delivery === "queue" || Boolean(session.turnId));
  const suggestions = isSlash && !/\s/.test(draft.text) ? slashCommands.filter((command) => command.name.startsWith(draft.text.slice(1))).slice(0, 7) : [];
  useEffect(() => { onMenuChange(menu !== null || attachmentReview !== null || previewOpen || contextReview); return () => onMenuChange(false); }, [menu, attachmentReview, previewOpen, contextReview, onMenuChange]);
  useEffect(() => { onPendingChange?.(configuring || heldPending || resuming); return () => onPendingChange?.(false); }, [configuring, heldPending, resuming, onPendingChange]);
  const adopt = async (saved: Session["draft"]) => {
    const text = editor.getState().text;
    editor.receive(saved);
    const pending = triggerRef.current, current = parseAttachmentTrigger(text);
    if (pending && current?.start === pending.start && current.prefix === pending.prefix && current.query === pending.query) {
      editor.edit(text.slice(0, pending.start).trimEnd(), saved.attachments);
      await editor.flush();
    }
    setTrigger(null);
  };
  const capture: Run = (work) => run(async () => {
    const ids = new Set(editor.getState().attachments.map((attachment) => attachment.id));
    await editor.flush(); await work();
    const saved = client.getState().snapshot?.sessions.find((session) => session.id === editor.sessionId)?.draft;
    if (saved) { if (saved.attachments.some((attachment) => !ids.has(attachment.id))) await adopt(saved); else editor.receive(saved); }
  });
  const attachFile = async (path: string) => {
    if (/\.(pdf|xlsx|docx)$/i.test(path)) {
      const id = crypto.randomUUID(); setDocumentCapture({ id, name: path.split(/[\\/]/).at(-1) ?? "Selected document" }); setDocumentError("");
      try { await client.attachments.document(session.id, path, { captureId: id }); } finally { setDocumentCapture(null); }
    } else await client.attachments.file(session.id, path);
  };
  const selectFile = () => { void capture(async () => { const path = await window.moguri.chooseAttachment("file"); if (path) await attachFile(path); }); };
  const reviewAttachment = async (request: AttachmentReviewRequest) => {
    if (request.kind === "session" && client.settings.get()?.values.interactions.confirmSessionAttachments === false) {
      await editor.flush();
      await client.attachments.session(session.id, request.sourceSessionId, request.preview.digest, true);
      const saved = client.getState().snapshot?.sessions.find((value) => value.id === session.id)?.draft;
      if (saved) await adopt(saved);
    } else setAttachmentReview(request);
    setMenu(null);
  };
  const attachPath = async (path: string) => {
    const selected = await client.attachments.localPath(session.id, path);
    if (selected.kind === "folder") await reviewAttachment({ kind: "folder", path: selected.path, preview: (await client.attachments.folderPreview(session.id, selected.path)).preview });
    else await attachFile(selected.path);
  };
  const attachSession = (sourceId: string) => capture(async () => {
    const state = client.getState().snapshot, source = state?.sessions.find((value) => value.id === sourceId);
    if (!source || source.status === "archived" || source.id === session.id) throw new Error("Choose another active session in this profile. No content was attached.");
    await reviewAttachment({ kind: "session", sourceSessionId: source.id, preview: (await client.attachments.sessionPreview(session.id, source.id)).preview });
  });
  const removeAttachment = async (id: string) => {
    const current = editor.getState();
    editor.edit(current.text, current.attachments.filter((value) => value.id !== id)); await editor.flush();
  };
  const submit = (event?: FormEvent, hold = held) => {
    event?.preventDefault();
    if (heldPending || resumePending.current) return;
    if (needsResume && !isSlash && !hold) {
      if (!canResume) return;
      resumePending.current = true; setResuming(true);
      void run(async () => {
        try { await client.command({ type: "session.resume", sessionId: session.id }); }
        finally { resumePending.current = false; setResuming(false); }
      });
      return;
    }
    const pendingHold = hold && !isSlash;
    if (pendingHold) setHeldPending(true);
    void run(async () => {
      try {
        if (answering && question && !hold) { await editor.flush(); return await client.questions.answerDraft(question.id, question.revision); }
        if (!hold && session.projectId && (isSlash || delivery === "queue") && continueWorkInput(draft.text)) return await onSlash(session, editor, draft.text);
        if (isSlash) return await onSlash(session, editor, draft.text);
        return await editor.send(hold ? "queue" : delivery, hold);
      } finally { if (pendingHold) setHeldPending(false); }
    });
  };
  const insertTranscript = async (jobId: string) => {
    await editor.flush();
    const current = client.getState().snapshot?.sessions.find((item) => item.id === session.id);
    if (!current) throw new Error("The dictation destination was removed. The transcript was not inserted elsewhere.");
    await client.voice.insert(session.id, jobId, current.draft.revision);
    const saved = client.getState().snapshot?.sessions.find((item) => item.id === session.id)?.draft;
    if (saved) editor.receive(saved);
    setInsertedTranscript(jobId);
  };
  const dictate = () => {
    if (voiceFinalizing) return;
    if (voiceJob?.kind === "voice.record") return run(async () => {
      await editor.flush();
      if (voicePreparing) { await client.jobs.cancel(voiceJob.id); return; }
      setFinishingVoice(true);
      try {
        await client.voice.stop(voiceJob.id);
        const settled = await client.jobs.wait(voiceJob.id, { timeoutMs: 65_000 });
        if (settled.status !== "completed") throw new Error(settled.error ?? `Local dictation ${settled.status}. Your draft was preserved.`);
        await insertTranscript(voiceJob.id);
      } finally { setFinishingVoice(false); }
    });
    if (dictation.state.phase === "starting" || dictation.state.phase === "recording") void dictation.finish();
    else if (dictation.state.phase === "idle" || dictation.state.phase === "failed") void dictation.start();
  };
  const configure = (controls: Controls) => run(async () => {
    await client.sessions.configure(session.id, controls, session.revision);
    setMenu(null);
  });
  const toggle = (value: Menu) => { if (value === "attach") setTrigger(null); setMenu((current) => current === value ? null : value); };
  const chooseAttachmentTrigger = () => {
    if (!attachmentTrigger) return;
    setTrigger(attachmentTrigger);
    if ([":", "!"].includes(attachmentTrigger.prefix) && sessionOptions[sessionOption]) { void attachSession(sessionOptions[sessionOption]!.id); return; }
    if (attachmentTrigger.prefix === "^" && attachmentTrigger.query) { void capture(() => attachPath(attachmentTrigger.query)); return; }
    setMenu("attach");
  };
  const close = (value: Menu) => setMenu((current) => current === value ? null : current);
  const status = draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved";
  const sendLabel = isSlash ? "Run command" : held || heldPending ? "Queue prompt without starting work" : needsResume ? "Resume" : answering ? "Answer question" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send";
  const item = (name: Menu, label: string, icon: string, children: ReactNode) => <ComposerPopover name={name} label={label} description={name === "env" ? `${session.controls.env}. ${session.controls.env === "Remote" ? "SSH-host execution, not SendBox isolation." : session.controls.env === "Sandbox" ? "Native SendBox guest; exact qualification and private staging are required." : "Host execution is not sandboxed."}` : name === "autonomy" ? session.controls.autonomy : name === "budget" ? session.controls.budget.kind === "unlimited" ? hardBudget ? "Unlimited preference; hard policy applies" : "Unlimited" : "Estimate-based cap" : undefined} open={menu === name} toggle={() => toggle(name)} close={() => close(name)} trigger={<Icon name={icon} />}>{children}</ComposerPopover>;
  return <form className={`composer compact-composer ${dragging ? "session-drop-target" : ""}`} data-composer-session={session.id} onSubmit={(event) => submit(event)} onKeyDown={(event) => { if (event.key === "Escape") { setTrigger(null); setDismissedTrigger(draft.text); } }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); } }}
    onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
    onDrop={(event) => {
      if (!event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
      event.preventDefault(); event.stopPropagation(); setDragging(false); setTrigger(null);
      const raw = event.dataTransfer.getData(SESSION_DRAG_TYPE);
      void run(async () => {
        const source: unknown = JSON.parse(raw);
        if (!isRecord(source) || source.profileId !== client.profileId || typeof source.sessionId !== "string") throw new Error("Drop a session from this profile. No source content was read.");
        await attachSession(source.sessionId);
      });
    }}
    aria-label="Message composer" aria-description={resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without resuming." : answering ? "Enter answers. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without answering." : "Enter sends. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without starting work."}>
    {documentCapture && <div className="document-capture"><p role="status">Extracting {documentCapture.name} locally. No model call; your draft is preserved.</p><progress aria-label="Local document extraction" /><button type="button" onClick={() => void client.attachments.cancelDocument(session.id, documentCapture.id).catch((error: unknown) => setDocumentError(error instanceof Error ? error.message : "Capture stop is unconfirmed. Inspect the saved draft."))}>Cancel extraction</button></div>}
    {documentError && <p className="inline-error" role="alert">{documentError}</p>}
    {configuring && <p className="composer-context-warning" role="status">Saving model settings. Your draft is preserved until the change settles.</p>}
    {configurationError && menu !== "model" && <p className="inline-error" role="alert">{configurationError}</p>}
    {session.controls.modelId && (!model || model.synthetic && !eligibleModel) && <button type="button" className="setup-hint" onClick={session.controls.modelId === KUPO_MODEL_ID ? onRouting : onConnect}>{session.controls.modelId === KUPO_MODEL_ID ? `Kupo is unavailable in ${session.controls.env}. ${snapshot.routingDiagnostics?.join(" ") ?? "Inspect its model pool and budget policy."}` : `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.`}<Icon name="Down" /></button>}
    {model && !eligibleModel && <button type="button" className="setup-hint" onClick={() => setMenu("model")}>This saved model is not available in {session.controls.env}. Choose a compatible model explicitly.<Icon name="Down" /></button>}
    {requiresImages && model && !model.imageInput && !answering && <p className="composer-context-warning" role="status">Select an image-capable model. The complete context stays in your draft or conversation.</p>}
    {documentBlocked && !answering && <p className="composer-context-warning" role="status">Documents need an ordinary chat and tool-capable model. Your complete draft and held queue are preserved; no document is dropped or expanded into the prompt.</p>}
    {answering && draft.attachments.length > 0 && <p className="composer-context-warning" role="status">Answers consume only text. Attached context stays saved.</p>}
    {session.localFinishing && <p className="local-finishing">Local finishing. New Local turns are blocked by policy.</p>}
    {needsNativeStage && <button type="button" className="setup-hint" onClick={onSandbox}>Review a private native workspace before starting a turn. Your draft and held queue are preserved.<Icon name="Box" /></button>}
    {session.controls.autonomy === "Autopilot Max" && !decisions.ready && <button type="button" className="setup-hint" onClick={onDecisions}>{decisions.reason}<Icon name="Rocket" /></button>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <AttachmentChip key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} remove={() => removeAttachment(attachment.id)} onOpenChange={setPreviewOpen} />)}</div>}
    {dragging && <p className="session-drop-hint" role="status">Drop to attach this session's content</p>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>{inputLabel}</label>
    <textarea ref={input} autoFocus={autoFocus} id={`prompt-${session.id}`} placeholder={answering ? question?.allowFreeform ? "Type your answer..." : "Choose one of the offered answers above..." : session.kind === "metachat" ? "Ask about Moguri settings..." : session.kind === "side" ? "Ask about the main conversation..." : project ? "Ask anything about this project..." : "Ask anything..."} value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
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
        if (sessionOptions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSessionOption((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + sessionOptions.length) % sessionOptions.length); }
        else if (sessionOptions.length && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); chooseAttachmentTrigger(); }
        else if (event.key === "Tab" && suggestions[0]) { event.preventDefault(); editor.edit(`/${suggestions[0].name} `); }
        else if (event.key === "Tab" && attachmentTrigger) { event.preventDefault(); chooseAttachmentTrigger(); }
        else {
          const action = chatSubmission(event);
          if (!action) return;
          event.preventDefault();
          if (isSlash || action === "hold" ? canQueue : needsResume ? canResume : canSend) submit(undefined, action === "hold");
        }
      }} />
    {suggestions.length > 0 && <div className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion) => <button type="button" role="option" aria-selected={false} key={suggestion.name} onClick={() => editor.edit(`/${suggestion.name} `)}><strong>/{suggestion.name}</strong><span>{suggestion.description}</span></button>)}</div>}
    {sessionOptions.length > 0 && <div className="attachment-session-suggestions" role="listbox" aria-label="Active context sessions">{sessionOptions.map((source, index) => <button type="button" role="option" aria-selected={index === sessionOption} key={source.id} onClick={() => { setTrigger(attachmentTrigger); void attachSession(source.id); }}><Icon name="Side chat" /><span>{sessionTitle(source)}</span></button>)}</div>}
    {attachmentTrigger && <button className="attachment-trigger-hint quiet" type="button" onClick={chooseAttachmentTrigger}>{attachmentTrigger.prefix} {attachmentTriggers[attachmentTrigger.prefix]}<small>Tab to choose; text stays literal until selection</small></button>}
    {draft.error && <div className="draft-error" role="alert"><p>{draft.error}</p><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    {(voiceJob || dictation.state.phase === "starting" || dictation.state.cleanupPending) && <p className="composer-voice-status fine-print" role="status">{dictation.state.cleanupPending ? "Original audio cleanup is unconfirmed. Retry discard before starting another microphone." : dictation.state.phase === "recording" ? "Words stream locally into this draft. Release to finish; nothing is sent to the chat model." : dictation.state.phase === "transcribing" ? "Flushing the original local audio buffer. Inserted words are preserved." : voiceJob?.progress || "Preparing the exact local microphone; Stop cancels pending startup."}
      <button type="button" className="quiet" onClick={() => { if (voiceJob && voiceJob.id !== dictation.state.id) void run(() => client.jobs.cancel(voiceJob.id)); else void dictation.cancel(); }}>Cancel and discard dictation</button></p>}
    {dictation.state.error && dictation.state.error !== voiceOutcome?.error && <p className="composer-voice-status inline-error" role="alert">{dictation.state.error}</p>}
    {voiceOutcome?.status === "failed" && <p className="composer-voice-status inline-error" role="alert">{voiceOutcome.error || "Local dictation failed. Already inserted words were preserved."}</p>}
    {transcript && transcript.id !== insertedTranscript && !voiceFinalizing && <div className="composer-transcript"><Icon name="Mic" /><div className="composer-transcript-text"><strong>Dictation ready</strong>
      {transcriptPreview?.error ? <p className="inline-error" role="alert">{transcriptPreview.error}</p> : <p aria-label="Dictation transcript">{transcriptPreview?.text ?? "Loading the local transcript..."}</p>}</div>
      <button type="button" disabled={!transcriptPreview?.text} onClick={() => void run(() => insertTranscript(transcript.id))}>Insert</button></div>}
    <div className="composer-toolbar">
      <div className="composer-leading">
        {item("attach", "Attach", "Plus", <AttachmentMenu sdk={client} session={session} project={project} snapshot={snapshot} run={run} capture={capture} selectFile={selectFile} attachPath={attachPath} initial={pendingTrigger} close={() => setMenu(null)} review={reviewAttachment} />)}
        <button className="composer-mode" type="button" role="switch" aria-label="Agent mode"
          aria-checked={(session.pendingMode ?? session.mode) === "agent"} disabled={busy || !connected || session.status === "archived" || session.kind === "side" || session.kind === "subagent"}
          title={session.pendingMode ? "Requested mode applies at the next safe boundary" : (session.mode === "agent" ? "Agent: switch to read-only" : "Read-only: switch to agent")}
          onClick={() => void run(() => client.sessions.mode(session.id, (session.pendingMode ?? session.mode) === "agent" ? "read-only" : "agent"))}>
          <Icon name={(session.pendingMode ?? session.mode) === "agent" ? "Edit" : "BookOpen"} /><span>{(session.pendingMode ?? session.mode) === "agent" ? "Agent" : "Read-only"}</span>
          {session.pendingMode && <small>pending</small>}
        </button>
        {item("env", "Execution environment", envIcon[session.controls.env], <><h2>Execution environment</h2>{snapshot.capabilities.map((capability) => <button className="composer-menu-option" key={capability.env} type="button" disabled={Boolean(session.turnId) || !capability.ready || !snapshot.policy.allowedEnvs.includes(capability.env) || Boolean(session.repositories && capability.env !== "Local")} aria-pressed={session.controls.env === capability.env} title={session.repositories && capability.env !== "Local" ? "Folder sessions currently support Local execution only." : capability.reason} onClick={() => void run(async () => { await client.sessions.env(session.id, capability.env, session.revision); setMenu(null); })}><Icon name={envIcon[capability.env]} /><span>{capability.env}<small>{!snapshot.policy.allowedEnvs.includes(capability.env) ? "Blocked by policy" : session.repositories && capability.env !== "Local" ? "Not qualified for folder sessions" : capability.env === "Local" ? "Host execution, not sandboxed" : !capability.ready ? "Not ready" : capability.env === "Sandbox" ? "Verified SendBox guest; private stage required" : "Verified SSH host, not SendBox isolation"}</small></span>{session.controls.env === capability.env && <Icon name="Check" />}</button>)}{session.repositories && <p>Folder sessions currently support Local execution only. Each tool selects one of the exact captured repositories; there is no default or common-parent workspace.</p>}<p>Remote transfers approved context to {snapshot.settings.values.remote?.name ?? "the configured SSH host"}. Sandbox uses a separately reviewed private stage and scoped model access, never a live source checkout. Missing readiness never falls back to Local; unavailable models are cleared, not substituted.</p><button type="button" className="quiet" onClick={() => { setMenu(null); onRemote(); }}>Remote SSH setup</button><button type="button" className="quiet" onClick={() => { setMenu(null); onGuardrails(); }}>Sandbox qualification</button><button type="button" className="quiet" onClick={() => { setMenu(null); onSandbox(); }}>Native workspace and results</button></>)}
        <ComposerPopover name="model" label="Model" description={model?.name ?? session.controls.modelId ?? "Select model"} open={menu === "model"} toggle={() => toggle("model")} close={() => close("model")} trigger={<span className="composer-model-name">{model?.name ?? (session.controls.modelId ? session.controls.modelId : "Select model")}</span>} model>
          <ModelMenu sdk={client} session={session} snapshot={snapshot} requiresImages={requiresImages} onConnect={() => { setMenu(null); onConnect(); }} onLocalModels={() => { setMenu(null); onLocalModels(); }} onRouting={() => { setMenu(null); onRouting(); }} onContext={() => { setMenu(null); setContextReview(true); }} onSaving={trackConfiguration} onError={setConfigurationError} pending={configuring} />
        </ComposerPopover>
        {item("autonomy", "Autonomy level", autonomyIcon[session.controls.autonomy], <><h2>Autonomy</h2>{(["Manual", "Guided", "Autopilot", "Autopilot Max"] as const).map((autonomy) => {
          const reason = autonomy === "Manual" ? "You approve tools or remember a grant" : autonomy === "Guided" ? "Advice, then your confirmation" : autonomy === "Autopilot" ? "Automatically approve all tools and commands" :
            decisions.ready ? "Automatic approvals plus bounded System One decisions" : decisions.reason;
          return <button className="composer-menu-option" type="button" key={autonomy} aria-pressed={autonomy === session.controls.autonomy} disabled={Boolean(session.turnId) || autonomy === "Autopilot Max" && !decisions.ready} title={reason} onClick={() => void configure({ ...session.controls, autonomy, automaticApprovals: autonomy === "Autopilot" || autonomy === "Autopilot Max" })}><Icon name={autonomyIcon[autonomy]} /><span>{autonomy}<small>{reason}</small></span>{autonomy === session.controls.autonomy && <Icon name="Check" />}</button>;
        })}<p>Autopilot modes are unattended. Hard deny rules, read-only mode, environment policy and budgets still apply.</p>
          {["Autopilot", "Autopilot Max"].includes(session.controls.autonomy) && !session.controls.automaticApprovals && <p className="settings-warning">This saved mode uses legacy bounded grants. Select it again to enable automatic approvals explicitly.</p>}
          {decisions.error && <p className="inline-error" role="alert">{decisions.error}</p>}<button className="quiet" type="button" onClick={() => { setMenu(null); onGuardrails(); }}>Guardrails</button><button className="quiet" type="button" onClick={() => { setMenu(null); onDecisions(); }}>Decision provider settings</button></>)}
      </div>
      <div className="composer-trailing">
        {item("budget", "Budget and usage", session.controls.budget.kind === "unlimited" && !hardBudget ? "Infinity" : "Dollar", <UsageMenu key={session.id} sdk={client} session={session} snapshot={snapshot} />)}
        <DictationButton state={dictation.state} pushToTalk={Boolean(snapshot.settings.values.voice.pushToTalk && voiceJob?.kind !== "voice.record")} recording={Boolean(voiceJob)}
          label={voiceFinalizing ? "Finalizing local dictation" : voicePreparing ? "Cancel local dictation setup" : voiceJob || dictation.state.phase === "starting" ? "Stop local dictation" : "Start local dictation"}
          disabled={voiceFinalizing || dictation.state.cleanupPending || dictation.state.phase === "transcribing" || !connected || session.status === "archived"}
          title={`Local dictation (${shortcutLabel(snapshot.settings.values.voice.shortcut ?? "Control+Space")})`}
          start={dictation.start} finish={dictation.finish} cancel={dictation.cancel} toggle={() => void dictate()} />
        <div className="composer-send-group">
          {session.turnId && !holdingNext ? <button className="icon-button composer-send composer-stop" type="button" aria-label={session.status === "stopping" ? "Stopping turn" : "Stop turn"} title="Stop the current turn and hold queued work. Your unsent draft is preserved." disabled={!connected || session.status === "stopping"} onClick={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))}><Icon name="Stop" /></button> :
            <button className="primary icon-button composer-send" type="submit" aria-label={sendLabel} aria-busy={resuming || undefined} title={resumeAction ? "Resume this session after inspecting unconfirmed effects. Your draft is not sent, and cleanup is not marked successful." : held || heldPending ? "Queue without starting (Cmd/Ctrl+Enter)" : `${sendLabel}. Hold Cmd/Ctrl to queue without starting.`} disabled={heldPending || resuming || (resumeAction ? !canResume : isSlash || held ? !canQueue : !canSend)} onClick={(event) => { event.preventDefault(); submit(undefined, (event.metaKey || event.ctrlKey || held) && !isSlash); }}><Icon name={held || heldPending ? "Clock" : resumeAction ? "Play" : "Send"} /></button>}
          <ComposerPopover name="delivery" label="Delivery mode" open={menu === "delivery"} toggle={() => toggle("delivery")} close={() => close("delivery")} trigger={<Icon name="Down" />}>
            <h2>Delivery</h2>{(["queue", "steer", "interrupt"] as const).map((value) => <button className="composer-menu-option" type="button" key={value} aria-pressed={delivery === value} disabled={value !== "queue" && !session.turnId} onClick={() => { setDelivery(value); setMenu(null); }}><Icon name={value === "queue" ? "Send" : value === "steer" ? "Agent" : "Stop"} /><span>{value === "queue" ? question && !isSlash ? "Answer actual question" : session.turnId ? "Queue after current turn" : "Send" : value === "steer" ? "Steer at next boundary" : "Interrupt current turn"}</span></button>)}
            {session.turnId && <button className="primary" type="button" disabled={held || isSlash ? !canQueue : !canSend} onClick={() => { setMenu(null); submit(undefined, held); }}>{sendLabel}</button>}
            <p>{resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first." : "Enter sends using this delivery mode."} Cmd/Ctrl+Enter always holds the prompt instead.</p>
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
      const toolbarTop = button.current.closest(".composer-toolbar")?.getBoundingClientRect().top ?? anchor.top;
      const anchorTop = Math.min(anchor.top, toolbarTop);
      element.style.width = `${Math.min(360, parent.width, window.innerWidth - 24)}px`;
      const width = element.getBoundingClientRect().width;
      element.style.left = `${Math.max(12, Math.min(parent.right - width, anchor.left, window.innerWidth - width - 12))}px`;
      element.style.maxHeight = `${Math.max(100, anchorTop - 60)}px`;
      element.style.top = `${Math.max(50, anchorTop - element.getBoundingClientRect().height - 8)}px`;
    };
    const observer = new ResizeObserver(position); observer.observe(element); observer.observe(button.current);
    observer.observe(button.current.closest(".composer")!);
    const navigation = button.current.closest(".app-shell")?.querySelector(".project-nav");
    if (navigation) observer.observe(navigation);
    position(); window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); if (element.matches(":popover-open")) element.hidePopover(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open]);
  const id = useId();
  return <div className={`composer-control ${model ? "model-menu-control" : ""}`}>
    <button ref={button} type="button" className={model ? "composer-model-button quiet" : "icon-button"} aria-label={model ? undefined : label} aria-description={description} title={description ? `${label}: ${description}` : label} data-composer-control={name} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>{model && <span className="sr-only">Model: </span>}{trigger}</button>
    {open && <div ref={panel} id={id} className={`composer-popover ${name}-popover`} popover="auto" role="dialog" aria-label={label} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); } }} onToggle={(event) => { if (event.newState === "closed") { if (document.activeElement === document.body || panel.current?.contains(document.activeElement)) button.current?.focus(); close(); } }}>{children}</div>}
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
  const staleEffort = Boolean(effort && !current?.thinkingLevels?.includes(effort));
  const reload = () => { revision.current = session.revision; setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? ""); setEffort(session.controls.modelOptions?.thinkingEffort ?? ""); setError(""); onError(""); };
  const options: ModelOptions = { ...(window ? { contextWindow: Number(window) } : {}), ...(effort ? { thinkingEffort: effort } : {}) };
  const dirty = options.contextWindow !== session.controls.modelOptions?.contextWindow || options.thinkingEffort !== session.controls.modelOptions?.thinkingEffort;
  const select = async (model: ModelInfo) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try {
      const result = await sdk.sessions.selectModel(session.id, model.id, revision.current);
      revision.current = result.revision!; setWindow(""); setEffort("");
    } catch (error) { const message = error instanceof Error ? error.message : "Model selection failed. No fallback was used."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const save = async (options: ModelOptions, rememberModelSelection = false) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try { const result = await sdk.sessions.modelOptions(session.id, options, revision.current, rememberModelSelection || undefined); revision.current = result.revision!; }
    catch (error) { const message = error instanceof Error ? error.message : "Model settings were not saved."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  return <><h2>Model</h2>{snapshot.provider.status !== "connected" && <><p>Connect GitHub Copilot or configure a local model to use Kupo.</p><button type="button" onClick={onConnect}>Connect Copilot</button></>}
    <input className="composer-model-search" aria-label="Search models" placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="composer-model-list">{snapshot.provider.models.filter((model) => (model.synthetic || !model.environments || model.environments.includes(session.controls.env)) && model.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(Boolean(b.synthetic)) - Number(Boolean(a.synthetic))).map((model) => {
      const unavailable = Boolean(model.environments && !model.environments.includes(session.controls.env));
      const description = model.synthetic ? unavailable ? `Unavailable in ${session.controls.env}. ${snapshot.routingDiagnostics?.join(" ") ?? ""}` :
        snapshot.settings.values.kupo.workflow === "auto" ? "Automatic Single / Cascade / Critique using configured models; every role is metered" :
          snapshot.settings.values.kupo.workflow === "compound" ? "Moguri / separately metered classifier, proposal and conditional roles" : "Moguri / separately metered router and solver" :
        `${model.source === "local" ? model.providerId : "GitHub Copilot"} / ${compact(model.contextWindow)} maximum context`;
      return <button type="button" className="composer-menu-option" key={model.id} aria-pressed={model.id === session.controls.modelId}
        disabled={saving || pending || Boolean(session.turnId) || dirty || unavailable || requiresImages && !model.imageInput}
        title={unavailable ? description : requiresImages && !model.imageInput ? "This context requires image input." : undefined}
        onClick={() => void select(model)}><span>{model.name}<small>{description}</small></span>{model.id === session.controls.modelId && <Icon name="Check" />}</button>;
    })}</div>
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
      <label>Thinking effort<select aria-label="Thinking effort" value={effort} disabled={!current?.thinkingLevels?.length && !staleEffort || saving || pending || Boolean(session.turnId)} onChange={(event) => {
        const value = current?.thinkingLevels?.find((level) => level === event.target.value) ?? ""; setEffort(value);
        void save({ ...(window ? { contextWindow: Number(window) } : {}), ...(value ? { thinkingEffort: value } : {}) }, true);
      }}><option value="">{current?.thinkingLevels?.length ? "Model default" : "Provider controlled"}</option>
        {staleEffort && <option value={effort} disabled>Saved unsupported effort: {effort}</option>}
        {current?.thinkingLevels?.map((level) => <option value={level} key={level}>{level}</option>)}</select></label>
      <p>{current?.synthetic ? snapshot.settings.values.kupo.workflow === "auto" ? "One eligible model runs directly. With multiple models, Kupo chooses Single, gated Cascade or eligible Critique with one revision. Only the selected response reaches normal approvals. Finite automatic budgets, images and model-specific tuning remain unavailable." :
        snapshot.settings.values.kupo.workflow === "compound" ? "Reviewed Compound uses exact Local source/worktree/test review in Candidates. Each role keeps its actual working window/output bound. Finite Local turns need explicit reserved wind-down; use a fixed model for tuning." : "Single alpha is text-only. Finite Local turns need the explicit reserved wind-down policy; use a fixed model for context/thinking overrides. Actual roles and model accounting remain separate." : "Working context stays within the model maximum. Counts are estimated; overfull requests stop without truncating history."}</p>
      {session.turnId && <p>Stop the active turn before changing model settings.</p>}
      {staleWindow && <p className="inline-error" role="alert">The saved working window is no longer supported. Choose an offered window explicitly. History and saved settings were not clamped.</p>}
      {staleEffort && <p className="inline-error" role="alert">The saved thinking effort is no longer supported. Choose an offered effort or provider default explicitly. The model and context were not substituted.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row"><span className="fine-print" role="status">{saving ? "Saving..." : dirty ? "Settings were not saved. Reload before choosing again." : "Changes save automatically."}</span><button type="button" className="quiet" disabled={saving || pending} onClick={reload}>Reload</button></div>
    </div>
  <ModelEvidencePanel sdk={sdk} model={current} scope={JSON.stringify([sdk.profileId, session.id, session.controls.env, current?.id])} remote={session.controls.env === "Remote"} />
    <button className="quiet" type="button" disabled={saving || pending} onClick={onContext}>Review context and compactions</button><button className="quiet" type="button" onClick={onLocalModels}>Configure local models</button><button className="quiet" type="button" onClick={onRouting}>{snapshot.settings.values.kupo.workflow === "auto" ? "Kupo settings" : snapshot.settings.values.kupo.workflow === "compound" ? "kupo Compound settings" : "kupo Single settings"}</button></>;
}

function UsageMenu({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const accounting = useBudgetStatus(sdk, session, snapshot);
  const [budgetView, setBudgetView] = useState<"usage" | "limits">("usage");
  const context = snapshot.sessionTelemetry?.[session.id]?.context;
  const estimate = snapshot.sessionTelemetry?.[session.id]?.estimate;
  const totals = accounting.status?.totals;
  const tokens = (value: number | null | undefined, known = 0, estimated?: number | null) => value === null || value === undefined ?
    estimated !== null && estimated !== undefined ? `~${count(estimated)}` : known > 0 ? `${count(known)} known + unknown` : "Not reported" : count(value);
  const plan = session.controls.budget.kind === "unlimited" ? snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit ? "Unlimited preference; hard policy applies" : "Unlimited" : "Estimate-based limits";
  const selectedModel = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const used = context?.estimatedTokens, window = session.controls.modelOptions?.contextWindow ??
    (selectedModel && !selectedModel.synthetic ? modelContextWindows(selectedModel).values[0] : context?.window);
  const percent = used !== undefined && window ? used / window * 100 : null;
  return <>
    <div hidden={budgetView !== "usage"} className="compact-budget">
      <dl className="compact-usage">
        <div className="compact-cost-row"><dt>Est. USD</dt><dd title="Captured model-specific estimates, including owning-session roles; not a bill.">{totals ? estimatedCost(totals, estimate) : "Not recorded"}</dd></div>
        <div><dt>Plan</dt><dd>{plan}</dd></div>
        <div><dt>Session</dt><dd>{totals ? `${count(totals.calls)} model call${totals.calls === 1 ? "" : "s"}` : "Not recorded"}{accounting.status && accounting.status.ownerSessionId !== session.id && <small>Charged to the owning session</small>}</dd></div>
        <div><dt>Tokens</dt><dd className="compact-token-lines">
          <span><Icon name="Up" /><span><span className="sr-only">Input tokens </span>{tokens(totals?.inputTokens, totals?.knownInputTokens, estimate?.inputTokens)}<small> ({tokens(totals?.cacheReadTokens, totals?.knownCacheReadTokens)} cached)</small></span></span>
          <span><Icon name="Down" /><span><span className="sr-only">Output tokens </span>{tokens(totals?.outputTokens, totals?.knownOutputTokens, estimate?.outputTokens)}</span></span>
        </dd></div>
        <div><dt>Context</dt><dd>
          {percent !== null && used !== undefined && window ? <meter className="compact-context-meter" aria-label="Estimated context window" min={0} max={window} value={Math.min(used, window)}
            aria-valuetext={`Estimated ${count(used)} tokens of ${count(window)}`} /> : <div className="compact-context-meter" aria-hidden="true" />}
          <div className="compact-context-values"><span>{percent === null ? context ? `~${count(context.estimatedTokens)}` : "Not yet recorded" : `~${Math.round(percent)}%`}</span><span title="Selected working window">{window ? count(window) : "Not yet recorded"}</span></div>
          {percent !== null && percent > 100 && <small className="inline-error">Over the working window; context is not truncated.</small>}
        </dd></div>
      </dl>
      <p className="compact-usage-note">Retained model context estimate; unsent draft text is not part of a model call. ~ marks input/visible-output estimates, not provider reports.{totals?.estimatedUsd === null && totals.knownEstimatedUsd === 0 && (estimate?.estimatedUsd === null || estimate?.estimatedUsd === undefined) ? " USD not reported or priced." : ""}</p>
      {totals && (totals.unknownTokenCalls > 0 || totals.heldTokens === null) && <p className="compact-usage-note">Unknown usage/holds remain charged. Open limits for details.</p>}
      <button className="compact-usage-link" type="button" onClick={() => setBudgetView("limits")}>View usage and limits...</button>
    </div>
    <div hidden={budgetView !== "limits"}><header className="composer-usage-heading"><button className="icon-button" type="button" aria-label="Back to compact usage" onClick={() => setBudgetView("usage")}><Icon name="Back" /></button><h2>Usage and limits</h2></header>
      <details><summary>Detailed session accounting</summary>{accounting.status && <BudgetSummary status={accounting.status} />}</details>
      <h3>Session budget limits</h3><BudgetLimitEditor sdk={sdk} snapshot={snapshot} session={session} scope="session" status={accounting.status} />
    </div>
    {accounting.error && <p className="inline-error" role="alert">{accounting.error}</p>}</>;
}
