import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { continueWorkInput, DraftEditor, isRecord, KUPO_MODEL_ID, kupoModes, RECOVERY_DELAYS_MS, retryFailure, modelContextWindows, supportsModelContextWindow, pasteLineCount, sessionTitle, slashCommands, attachmentTriggers, parseAttachmentTrigger, shortcutLabel, type DraftDictation, type Controls, type ModelInfo, type ModelOptions, type MoguriSdk, type Project, type Session, type Snapshot, type SlashSuggestion, type ThinkingEffort, type KupoMode, type KupoModeAvailability } from "../../../packages/sdk/src/index.ts";
import { Icon, modelIcon } from "./Icon.tsx";
import { AttachmentChip, AttachmentMenu, AttachmentReview, matchingContextSessions, SESSION_DRAG_TYPE, clipboardImage, type AttachmentReviewRequest } from "./ContextAttachments.tsx";
import { BudgetLimitEditor, BudgetSummary, useBudgetStatus } from "./BudgetControls.tsx";
import { ContextCompactionReview } from "./ContextCompaction.tsx";
import { ModelEvidencePanel } from "./ModelEvidencePanel.tsx";
import { useDecisionStatus } from "./DecisionPanel.tsx";
import { estimatedCost } from "./ChatActivity.tsx";
import { useDictation, useDictationTranscript } from "./useDictation.ts";
import { DictationButton } from "./DictationButton.tsx";
import { ModelSubmenu } from "./ModelSubmenu.tsx";
import { InfoTip } from "./Tooltip.tsx";
import { PolicyHint } from "./PolicyHint.tsx";
import { Alert } from "./Alert.tsx";
import { SchedulePromptDialog } from "./ScheduledPrompts.tsx";

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
  onSlash: (session: Session, editor: DraftEditor, text: string, held?: boolean) => Promise<void>;
  inputLabel?: string; autoFocus?: boolean; onPendingChange?: (pending: boolean) => void;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const input = useRef<HTMLTextAreaElement>(null), dictated = useRef<DraftDictation | null>(null);
  const [insertedTranscript, setInsertedTranscript] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [slashCatalog, setSlashCatalog] = useState<{ scope: string; entries: SlashSuggestion[]; error: string }>({ scope: "", entries: [], error: "" });
  const [slashOption, setSlashOption] = useState(0), slashList = useRef<HTMLDivElement>(null), slashListId = useId();
  const decisions = useDecisionStatus(client, session, snapshot, menu === "autonomy" || session.controls.autonomy === "Autopilot Max");
  const [attachmentReview, setAttachmentReview] = useState<AttachmentReviewRequest | null>(null);
  const literalMentions = useRef<{ text: string; ids: Set<string> }>({ text: "", ids: new Set() });
  const mentionPending = useRef(false);
  const [contextReview, setContextReview] = useState(false);
  const [scheduleReview, setScheduleReview] = useState<"ask" | "schedule" | null>(null);
  const [heldPending, setHeldPending] = useState(false);
  const [resuming, setResuming] = useState(false), resumePending = useRef(false);
  const [retrying, setRetrying] = useState(false), retryPending = useRef(false);
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
  const dictation = useDictation(client, session, snapshot, { shortcuts: true, globalShortcut: inputLabel === "Prompt",
    beforeStart: () => {
      dictated.current?.close();
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
  const voiceShortcut = snapshot.settings.values.voice.shortcut ?? "Control+Space";
  const voiceActive = Boolean(voiceJob) || ["starting", "recording", "transcribing"].includes(dictation.state.phase) || dictation.state.cleanupPending;
  const isSlash = draft.text.startsWith("/");
  const attachmentTrigger = isSlash || dismissedTrigger === draft.text ? null : parseAttachmentTrigger(draft.text);
  const sessionOptions = attachmentTrigger && [":", "!"].includes(attachmentTrigger.prefix) ? matchingContextSessions(snapshot, session.id, attachmentTrigger.query) : [];
  useEffect(() => { setSessionOption(0); }, [attachmentTrigger?.prefix, attachmentTrigger?.query]);
  const requiresImages = Boolean(session.inheritedImages || session.sideContext?.inheritedImages) || draft.attachments.some((attachment) => attachment.kind === "image") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "image"));
  const requiresDocuments = Boolean(session.sideContext?.documents.length) || draft.attachments.some((attachment) => attachment.kind === "document") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "document"));
  const documentBlocked = requiresDocuments && (model?.toolInput === false || session.kind === "metachat" || session.kind === "subagent");
  const held = heldModifier;
  const holdingNext = heldPending || held && Boolean(draft.text.trim() || draft.attachments.length);
  const hardBudget = Boolean(snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit);
  const question = snapshot.questions.find((question) => question.id === session.pendingQuestionId && question.status === "open");
  const answering = Boolean(question && delivery === "queue" && !isSlash);
  const needsResume = !session.turnId && (snapshot.blockedSessions.includes(session.id) ||
    Boolean(session.workspaceId && snapshot.blockedWorkspaces.includes(session.workspaceId)) ||
    Boolean(session.projectId && !session.workspaceId && snapshot.blockedProjects.includes(session.projectId)));
  const failedRequest = retryFailure(session, snapshot.modelFailures);
  const retryAction = Boolean(failedRequest) && !isSlash && !held && !heldPending;
  const recoveryCycle = snapshot.modelRecoveryCycle;
  const nextRecoveryAt = failedRequest?.status === "pending" && recoveryCycle?.status === "active" && recoveryCycle.round < 4 ?
    new Date(Date.parse(recoveryCycle.startedAt) + RECOVERY_DELAYS_MS[recoveryCycle.round]!) : null;
  const resumeAction = needsResume && !retryAction && !isSlash && !held && !heldPending;
  const canRetry = connected && !busy && !configuring && !retrying && !voiceActive;
  const canResume = connected && !busy && !configuring && !resuming && session.status !== "archived";
  const canQueue = connected && !busy && !configuring && !resuming && !retrying && !voiceActive && session.status !== "archived" && Boolean(draft.text.trim() || draft.attachments.length) && !draft.conflict;
  const canSend = answering ? canQueue && Boolean(draft.text.trim()) && Boolean(question?.allowFreeform || question?.choices.includes(draft.text)) :
    canQueue && snapshot.provider.status === "connected" && eligibleModel && !needsNativeStage && (session.controls.autonomy !== "Autopilot Max" || decisions.ready) &&
    snapshot.policy.allowedEnvs.includes(session.controls.env) && Boolean(snapshot.capabilities.find((capability) => capability.env === session.controls.env)?.ready) && (!requiresImages || Boolean(model?.imageInput)) && !documentBlocked && (delivery === "queue" || Boolean(session.turnId));
  const slashOpen = isSlash && !/\s/.test(draft.text);
  const slashScope = JSON.stringify([client.profileId, session.id, session.controls.env, snapshot.settings.revision, snapshot.registry.map((entry) => [entry.id, entry.revision])]);
  useEffect(() => {
    if (!slashOpen) return;
    const request = new AbortController(); let active = true;
    void client.commands.list(session.id, request.signal).then((entries) => {
      if (active) setSlashCatalog({ scope: slashScope, entries, error: "" });
    }).catch((error: unknown) => {
      if (active) setSlashCatalog({ scope: slashScope, entries: [], error: error instanceof Error ? error.message : "The skill catalog could not be refreshed. Built-in commands remain available." });
    });
    return () => { active = false; request.abort(); };
  }, [client, slashScope, slashOpen]);
  const catalog: SlashSuggestion[] = slashCatalog.scope === slashScope && slashCatalog.entries.length ? slashCatalog.entries :
    slashCommands.map(({ name, description }) => ({ kind: "builtin", name, description }));
  const suggestions = slashOpen ? catalog.filter((command) => command.name.toLowerCase().startsWith(draft.text.slice(1).toLowerCase())) : [];
  useEffect(() => { setSlashOption(0); }, [draft.text, suggestions.length]);
  useEffect(() => {
    const list = slashList.current, selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    const bounds = list.getBoundingClientRect(), item = selected.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [slashOption]);
  const selectSlash = (suggestion: SlashSuggestion) => {
    const selectedText = editor.getState().text;
    if (selectedText !== draft.text) { void run(async () => { throw new Error("The slash draft changed. Select the command again; the newer text was preserved."); }); return; }
    if (suggestion.kind === "builtin") { editor.edit(`/${suggestion.name} `); input.current?.focus(); return; }
    void run(async () => {
      await editor.flush();
      const current = client.getState().snapshot?.sessions.find((entry) => entry.id === session.id);
      if (!current) throw new Error("The selected skill's owning session was removed. No draft was substituted.");
      if (editor.getState().text !== selectedText || current.draft.text !== selectedText) throw new Error("The slash draft changed while saving. The newer text was preserved; select the skill again.");
      await client.skills.use(session.id, suggestion.skill.id, suggestion.skill.digest, current.draft.revision, "");
      const saved = client.getState().snapshot?.sessions.find((entry) => entry.id === session.id)?.draft;
      if (saved) editor.receive(saved);
      input.current?.focus();
    });
  };
  useEffect(() => { onMenuChange(menu !== null || attachmentReview !== null || previewOpen || contextReview || scheduleReview !== null); return () => onMenuChange(false); }, [menu, attachmentReview, previewOpen, contextReview, scheduleReview, onMenuChange]);
  useEffect(() => { onPendingChange?.(configuring || heldPending || resuming || retrying); return () => onPendingChange?.(false); }, [configuring, heldPending, resuming, retrying, onPendingChange]);
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
    if (!source || source.id === session.id) throw new Error("Choose another retained session in this profile. No content was attached.");
    await reviewAttachment({ kind: "session", sourceSessionId: source.id, preview: (await client.attachments.sessionPreview(session.id, source.id)).preview });
  });
  const removeAttachment = async (id: string) => {
    const current = editor.getState();
    editor.edit(current.text, current.attachments.filter((value) => value.id !== id)); await editor.flush();
  };
  const submit = (event?: FormEvent, hold = held) => {
    event?.preventDefault();
    if (heldPending || resumePending.current || retryPending.current) return;
    if (!answering && !isSlash && !failedRequest && (hold || !needsResume)) {
      const text = editor.getState().text;
      if (literalMentions.current.text !== text) literalMentions.current = { text, ids: new Set() };
      const ids = new Set(text.match(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi)?.map((id) => id.toLowerCase()) ?? []);
      const source = snapshot.sessions.find((source) => source.id !== session.id && ids.has(source.id.toLowerCase()) &&
        !literalMentions.current.ids.has(source.id) && !editor.getState().attachments.some((attachment) => attachment.kind === "session" && attachment.source.location === source.id));
      if (source) {
        if (!mentionPending.current) { mentionPending.current = true; void attachSession(source.id).finally(() => { mentionPending.current = false; }); }
        return;
      }
    }
    if (failedRequest && !isSlash && !hold) {
      if (!canRetry) return;
      retryPending.current = true; setRetrying(true);
      void run(async () => {
        try { await client.sessions.retry(session.id, failedRequest.id, failedRequest.revision); }
        finally { retryPending.current = false; setRetrying(false); }
      });
      return;
    }
    if (hold && !session.turnId && !isSlash) {
      if (!canQueue) return;
      const choice = snapshot.settings.values.interactions.idleScheduleAction ?? "ask";
      if (choice === "send") { submit(undefined, false); return; }
      setScheduleReview(choice); return;
    }
    if (needsResume && !isSlash && !hold) {
      if (!canResume) return;
      resumePending.current = true; setResuming(true);
      void run(async () => {
        try { await client.command({ type: "session.resume", sessionId: session.id }); }
        finally { resumePending.current = false; setResuming(false); }
      });
      return;
    }
    const pendingHold = hold;
    if (pendingHold) setHeldPending(true);
    void run(async () => {
      try {
        if (answering && question && !hold) { await editor.flush(); return await client.questions.answerDraft(question.id, question.revision); }
        if (!hold && session.projectId && (isSlash || delivery === "queue") && continueWorkInput(draft.text)) return await onSlash(session, editor, draft.text);
        if (isSlash) return await onSlash(session, editor, draft.text, hold);
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
    void dictation.toggle();
  };
  const selectAutonomy = (autonomy: Controls["autonomy"]) => run(async () => {
    trackConfiguration(true); setConfigurationError("");
    try { await client.sessions.autonomy(session.id, autonomy, session.revision); setMenu(null); }
    catch (error) { setConfigurationError(error instanceof Error ? error.message : "The autonomy selection was not acknowledged. Existing controls were preserved."); throw error; }
    finally { trackConfiguration(false); }
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
  const sendLabel = isSlash ? "Run command" : held || heldPending ? session.turnId ? "Queue prompt without starting work" : "Schedule prompt" : retryAction ? "Retry last model request" : needsResume ? "Resume" : answering ? "Answer question" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send";
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
    aria-label="Message composer" aria-description={retryAction ? "Enter retries the original failed model request without sending or clearing this draft. Earlier tools and hooks are not replayed." : resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without resuming." : answering ? "Enter answers. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without answering." : "Enter sends. Shift+Enter adds a line. Cmd/Ctrl+Enter holds or schedules without starting work."}>
    {failedRequest && <Alert as="p" className="composer-context-warning" role="status">{failedRequest.status === "exhausted" ? "Automatic recovery exhausted all four rounds. Retry remains an explicit action." :
      failedRequest.status === "blocked" ? failedRequest.diagnostic : nextRecoveryAt ? `Automatic recovery round ${recoveryCycle!.round + 1} is scheduled for ${nextRecoveryAt.toLocaleTimeString()}. Retry now leaves that countdown unchanged unless the response succeeds.` : failedRequest.diagnostic} Your unsent draft and queued prompts are preserved.</Alert>}
    {documentCapture && <div className="document-capture"><p role="status">Extracting {documentCapture.name} locally. No model call; your draft is preserved.</p><progress aria-label="Local document extraction" /><button type="button" onClick={() => void client.attachments.cancelDocument(session.id, documentCapture.id).catch((error: unknown) => setDocumentError(error instanceof Error ? error.message : "Capture stop is unconfirmed. Inspect the saved draft."))}>Cancel extraction</button></div>}
    {documentError && <Alert as="p" className="inline-error" role="alert">{documentError}</Alert>}
    {configuring && <Alert as="p" className="composer-context-warning" role="status">Saving model settings. Your draft is preserved until the change settles.</Alert>}
    {configurationError && menu !== "model" && <Alert as="p" className="inline-error" role="alert">{configurationError}</Alert>}
    {session.controls.modelId && (!model || model.synthetic && !eligibleModel) && <button type="button" className="setup-hint" onClick={session.controls.modelId === KUPO_MODEL_ID ? onRouting : onConnect}>{session.controls.modelId === KUPO_MODEL_ID ? `Kupo is unavailable in ${session.controls.env}. ${snapshot.routingDiagnostics?.join(" ") ?? "Inspect its model pool and budget policy."}` : `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.`}<Icon name="Down" /></button>}
    {model && !eligibleModel && <button type="button" className="setup-hint" onClick={() => setMenu("model")}>This saved model is not available in {session.controls.env}. Choose a compatible model explicitly.<Icon name="Down" /></button>}
    {requiresImages && model && !model.imageInput && !answering && <Alert as="p" className="composer-context-warning" role="status">Select an image-capable model. The complete context stays in your draft or conversation.</Alert>}
    {documentBlocked && !answering && <Alert as="p" className="composer-context-warning" role="status">Documents need an ordinary chat and tool-capable model. Your complete draft and held queue are preserved; no document is dropped or expanded into the prompt.</Alert>}
    {answering && draft.attachments.length > 0 && <Alert as="p" className="composer-context-warning" role="status">Answers consume only text. Attached context stays saved.</Alert>}
    {session.localFinishing && <p className="local-finishing">Local finishing. New Local turns are blocked by policy.</p>}
    {needsNativeStage && <button type="button" className="setup-hint" onClick={onSandbox}>Review a private native workspace before starting a turn. Your draft and held queue are preserved.<Icon name="Box" /></button>}
    {session.controls.autonomy === "Autopilot Max" && !decisions.ready && <button type="button" className="setup-hint" onClick={onDecisions}>{decisions.reason}<Icon name="Rocket" /></button>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <AttachmentChip key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} remove={() => removeAttachment(attachment.id)} onOpenChange={setPreviewOpen} />)}</div>}
    {dragging && <p className="session-drop-hint" role="status">Drop to attach this session's content</p>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>{inputLabel}</label>
    <textarea ref={input} autoFocus={autoFocus} id={`prompt-${session.id}`} aria-controls={suggestions.length ? slashListId : undefined}
      aria-autocomplete={suggestions.length ? "list" : undefined} aria-haspopup={suggestions.length ? "listbox" : undefined}
      aria-activedescendant={suggestions[slashOption] ? `${slashListId}-${slashOption}` : undefined}
      placeholder={answering ? question?.allowFreeform ? "Type your answer..." : "Choose one of the offered answers above..." : session.kind === "metachat" ? "Ask about Moguri settings..." : session.kind === "side" ? "Ask about the main conversation..." : project ? "Ask anything about this project..." : "Ask anything..."} value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
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
        if (suggestions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSlashOption((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
        else if (sessionOptions.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSessionOption((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + sessionOptions.length) % sessionOptions.length); }
        else if (sessionOptions.length && event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); chooseAttachmentTrigger(); }
        else if (event.key === "Tab" && suggestions[slashOption]) { event.preventDefault(); selectSlash(suggestions[slashOption]); }
        else if (event.key === "Tab" && attachmentTrigger) { event.preventDefault(); chooseAttachmentTrigger(); }
        else {
          const action = chatSubmission(event);
          if (!action) return;
          event.preventDefault();
          if (isSlash || action === "hold" ? canQueue : retryAction ? canRetry : needsResume ? canResume : canSend) submit(undefined, action === "hold");
        }
      }} />
    {suggestions.length > 0 && <div ref={slashList} id={slashListId} className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion, index) => <button type="button" role="option" id={`${slashListId}-${index}`} tabIndex={-1}
      aria-selected={index === slashOption} key={suggestion.kind === "skill" ? suggestion.skill.id : suggestion.name} data-command-kind={suggestion.kind}
      onClick={() => selectSlash(suggestion)}><strong>/{suggestion.name}{suggestion.kind === "skill" && <small>Skill / {suggestion.skill.sourceName}</small>}</strong><span>{suggestion.description}</span></button>)}</div>}
    {slashOpen && slashCatalog.scope === slashScope && slashCatalog.error && <Alert as="p" className="inline-error" role="alert">{slashCatalog.error} Built-in slash commands remain available.</Alert>}
    {sessionOptions.length > 0 && <div className="attachment-session-suggestions" role="listbox" aria-label="Active context sessions">{sessionOptions.map((source, index) => <button type="button" role="option" aria-selected={index === sessionOption} key={source.id} onClick={() => { setTrigger(attachmentTrigger); void attachSession(source.id); }}><Icon name="Side chat" /><span>{sessionTitle(source)}</span></button>)}</div>}
    {attachmentTrigger && <button className="attachment-trigger-hint quiet" type="button" onClick={chooseAttachmentTrigger}>{attachmentTrigger.prefix} {attachmentTriggers[attachmentTrigger.prefix]}<small>Tab to choose; text stays literal until selection</small></button>}
    {draft.error && <div className="draft-error"><Alert as="p" role="alert">{draft.error}</Alert><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    {(voiceJob || dictation.state.phase === "starting" || dictation.state.cleanupPending) && <p className="composer-voice-status fine-print" role="status">{dictation.state.cleanupPending ? "Original audio cleanup is unconfirmed. Retry discard before starting another microphone." : dictation.state.phase === "transcribing" ? "Flushing the original local audio buffer. Inserted words are preserved." : voiceJob?.progress || "Preparing the exact local microphone; Stop cancels pending startup."}
      <button type="button" className="quiet" onClick={() => { if (voiceJob && voiceJob.id !== dictation.state.id) void run(() => client.jobs.cancel(voiceJob.id)); else void dictation.cancel(); }}>Cancel and discard dictation</button></p>}
    {dictation.state.error && dictation.state.error !== voiceOutcome?.error && <Alert as="p" className="composer-voice-status inline-error" role="alert">{dictation.state.error}</Alert>}
    {dictation.standbyReady && <p className="composer-voice-status fine-print" role="status">Microphone ready in this focused composer. Standby is enabled; no audio is being recorded.</p>}
    {dictation.preparationError && <Alert as="p" className="composer-voice-status inline-error" role="alert">{dictation.preparationError}</Alert>}
    {voiceOutcome?.status === "failed" && <Alert as="p" className="composer-voice-status inline-error" role="alert">{voiceOutcome.error || "Local dictation failed. Already inserted words were preserved."}</Alert>}
    {transcript && transcript.id !== insertedTranscript && !voiceFinalizing && <div className="composer-transcript"><Icon name="Mic" /><div className="composer-transcript-text"><strong>Dictation ready</strong>
      {transcriptPreview?.error ? <Alert as="p" className="inline-error" role="alert">{transcriptPreview.error}</Alert> : <p aria-label="Dictation transcript">{transcriptPreview?.text ?? "Loading the local transcript..."}</p>}</div>
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
        {item("env", "Execution environment", envIcon[session.controls.env], <><h2>Execution environment</h2>{snapshot.capabilities.map((capability) => {
          const policyBlocked = !snapshot.policy.allowedEnvs.includes(capability.env);
          const groupUnavailable = Boolean(session.repositories && (capability.env === "Remote" || capability.env === "Sandbox" &&
            !(snapshot.settings.values.sandboxManagement?.enabled && snapshot.settings.values.sandboxManagement.automaticWorkspaces)));
          return <div className="composer-option-row" key={capability.env}><button className="composer-menu-option" type="button" disabled={Boolean(session.turnId) || !capability.ready || policyBlocked || groupUnavailable} aria-pressed={session.controls.env === capability.env}
            title={groupUnavailable ? capability.env === "Remote" ? "Captured groups have no qualified SSH execution transport." : "Review managed automatic private workspaces in Sandbox settings first." : capability.reason} onClick={() => void run(async () => { await client.sessions.env(session.id, capability.env, session.revision); setMenu(null); })}>
            <Icon name={envIcon[capability.env]} /><span>{capability.env}<small>{policyBlocked ? "Blocked by policy" : groupUnavailable ? capability.env === "Remote" ? "Group transport not qualified" : "Managed group workspace setup required" : capability.env === "Local" ? "Host execution, not sandboxed" : !capability.ready ? "Not ready" : capability.env === "Sandbox" ? session.repositories ? "Private copies of every captured repository" : "Verified SendBox guest; private stage required" : "Verified SSH host, not SendBox isolation"}</small></span>{session.controls.env === capability.env && <Icon name="Check" />}</button>
            {policyBlocked && <PolicyHint label={`Why ${capability.env} is unavailable`} target="environments">Global execution policy excludes {capability.env}. Opening its setting does not widen policy, change this session's Env or restart work.</PolicyHint>}
          </div>;
        })}{session.repositories && <p>Captured groups support Local and reviewed managed Sandbox execution. Every workspace tool explicitly selects an original repository. There is no first/default or common-parent root, and SSH groups remain unqualified.</p>}<p>Remote transfers approved context to {snapshot.settings.values.remote?.name ?? "the configured SSH host"}. Sandbox uses a separately reviewed private stage and scoped model access, never a live source checkout. Missing readiness never falls back to Local; unavailable models are cleared, not substituted.</p><button type="button" className="quiet" onClick={() => { setMenu(null); onRemote(); }}>Remote SSH setup</button><button type="button" className="quiet" onClick={() => { setMenu(null); onSandbox(); }}>Sandbox qualification</button><button type="button" className="quiet" onClick={() => { setMenu(null); onSandbox(); }}>Native workspace and results</button></>)}
        <ComposerPopover name="model" label="Model" description={model?.name ?? session.controls.modelId ?? "Select model"} open={menu === "model"} toggle={() => toggle("model")} close={() => close("model")} trigger={<span className="composer-model-name">{model?.name ?? (session.controls.modelId ? session.controls.modelId : "Select model")}{model?.synthetic && session.controls.kupoMode ? ` · ${kupoModes.find((mode) => mode.id === session.controls.kupoMode)!.name}` : session.controls.modelOptions?.thinkingEffort && ` · ${effortLabel(session.controls.modelOptions.thinkingEffort)}`}</span>} model>
          <ModelMenu sdk={client} session={session} snapshot={snapshot} requiresImages={requiresImages} onConnect={() => { setMenu(null); onConnect(); }} onLocalModels={() => { setMenu(null); onLocalModels(); }} onRouting={() => { setMenu(null); onRouting(); }} onContext={() => { setMenu(null); setContextReview(true); }} onSaving={trackConfiguration} onError={setConfigurationError} pending={configuring} />
        </ComposerPopover>
        {item("autonomy", "Autonomy level", autonomyIcon[session.controls.autonomy], <><h2>Autonomy</h2>{(["Manual", "Guided", "Autopilot", "Autopilot Max"] as const).map((autonomy) => {
          const reason = autonomy === "Manual" ? "You approve tools or remember a grant" : autonomy === "Guided" ? "Advice, then your confirmation" : autonomy === "Autopilot" ? "Automatically approve all tools and commands" :
            decisions.ready ? "Automatic approvals plus bounded System One decisions" : decisions.reason;
          return <div className="composer-option-row" key={autonomy}><button className="composer-menu-option" type="button" aria-pressed={autonomy === session.controls.autonomy} disabled={configuring || Boolean(session.turnId) || autonomy === "Autopilot Max" && !decisions.ready} title={reason} onClick={() => void selectAutonomy(autonomy)}><Icon name={autonomyIcon[autonomy]} /><span>{autonomy}<small>{reason}</small></span>{autonomy === session.controls.autonomy && <Icon name="Check" />}</button>
            {autonomy === "Autopilot Max" && !decisions.ready && <PolicyHint label="Why Autopilot Max is unavailable" target="decisions">{reason} Reviewing the actual decision configuration does not start inference or enable an unqualified transport.</PolicyHint>}
          </div>;
        })}<p>Autopilot modes are unattended. Hard deny rules, read-only mode, environment policy and budgets still apply.</p>
          {snapshot.settings.values.permissions.defaultDecision === "deny" && <p>Automatic approvals cannot bypass the saved tool policy.<PolicyHint label="About automatic approval policy" target="tools">Default-deny and explicit deny rules remain authoritative. Changing autonomy or opening this setting does not remove a hard rule.</PolicyHint></p>}
          {["Autopilot", "Autopilot Max"].includes(session.controls.autonomy) && !session.controls.automaticApprovals && <Alert as="p" tone="warning" className="settings-warning">This saved mode uses legacy bounded grants. Select it again to enable automatic approvals explicitly.</Alert>}
          {decisions.error && <Alert as="p" className="inline-error" role="alert">{decisions.error}</Alert>}<button className="quiet" type="button" onClick={() => { setMenu(null); onGuardrails(); }}>Guardrails</button><button className="quiet" type="button" onClick={() => { setMenu(null); onDecisions(); }}>Decision provider settings</button></>)}
      </div>
      <div className="composer-trailing">
        {item("budget", "Budget and usage", session.controls.budget.kind === "unlimited" && !hardBudget ? "Infinity" : "Dollar", <UsageMenu key={session.id} sdk={client} session={session} snapshot={snapshot} />)}
        <DictationButton state={dictation.state} recording={Boolean(voiceJob)}
          label={voiceFinalizing ? "Finalizing local dictation" : voicePreparing ? "Cancel local dictation setup" : voiceJob || dictation.state.phase === "starting" ? "Stop local dictation" : "Start local dictation"}
          disabled={voiceFinalizing || dictation.state.cleanupPending || dictation.state.phase === "transcribing" || !connected || session.status === "archived" || snapshot.settings.values.voice.enabled === false}
          title={snapshot.settings.values.voice.enabled === false ? "Enable local dictation in Settings / Voice, after reviewing its model license." : `Click to record; click again to confirm. ${voiceShortcut === "none" ? "No push-to-talk shortcut is assigned." : snapshot.settings.values.voice.pushToTalk ?
            `Hold ${shortcutLabel(voiceShortcut)} for push-to-talk.` : `Press ${shortcutLabel(voiceShortcut)} to record; press again to finish.`}`}
          toggle={() => void dictate()} />
        <div className="composer-send-group">
          {session.turnId && !holdingNext ? <button className="icon-button composer-send composer-stop" type="button" aria-label={session.status === "stopping" ? "Stopping turn" : "Stop turn"} title="Stop the current turn and hold queued work. Your unsent draft is preserved." disabled={!connected || session.status === "stopping"} onClick={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))}><Icon name="Stop" /></button> :
            <button className="primary icon-button composer-send" type="submit" aria-label={sendLabel} aria-busy={resuming || retrying || undefined} title={retryAction ? "Retry the exact failed model request. Earlier tools/hooks are not replayed; your new draft is not sent or cleared." : resumeAction ? "Resume this session after inspecting unconfirmed effects. Your draft is not sent, and cleanup is not marked successful." : held || heldPending ? session.turnId ? "Queue without starting (Cmd/Ctrl+Enter)" : "Schedule this idle prompt (Cmd/Ctrl+Enter)" : `${sendLabel}. Hold Cmd/Ctrl to queue without starting.`} disabled={heldPending || resuming || retrying || (retryAction ? !canRetry : resumeAction ? !canResume : isSlash || held ? !canQueue : !canSend)} onClick={(event) => { event.preventDefault(); submit(undefined, (event.metaKey || event.ctrlKey || held) && !isSlash); }}><Icon name={held || heldPending ? "Clock" : retryAction ? "Refresh" : resumeAction ? "Play" : "Send"} /></button>}
          <ComposerPopover name="delivery" label="Delivery mode" open={menu === "delivery"} toggle={() => toggle("delivery")} close={() => close("delivery")} trigger={<Icon name="Down" />}>
            <h2>Delivery</h2>{(["queue", "steer", "interrupt"] as const).map((value) => <button className="composer-menu-option" type="button" key={value} aria-pressed={delivery === value} disabled={value !== "queue" && !session.turnId} onClick={() => { setDelivery(value); setMenu(null); }}><Icon name={value === "queue" ? "Send" : value === "steer" ? "Agent" : "Stop"} /><span>{value === "queue" ? question && !isSlash ? "Answer actual question" : session.turnId ? "Queue after current turn" : "Send" : value === "steer" ? "Steer at next boundary" : "Interrupt current turn"}</span></button>)}
            {session.turnId && <button className="primary" type="button" disabled={held || isSlash ? !canQueue : !canSend} onClick={() => { setMenu(null); submit(undefined, held); }}>{sendLabel}</button>}
            <p>{resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first." : "Enter sends using this delivery mode."} Cmd/Ctrl+Enter always holds the prompt instead.</p>
          </ComposerPopover>
        </div>
      </div>
      <span className="sr-only" role="status">{status}</span>
    </div>
    {attachmentReview && <AttachmentReview sdk={client} sessionId={session.id} editor={editor} request={attachmentReview} adopt={adopt} close={() => {
      if (attachmentReview.kind === "session") literalMentions.current.ids.add(attachmentReview.sourceSessionId);
      setAttachmentReview(null);
    }} />}
    {contextReview && <ContextCompactionReview sdk={client} session={session} snapshot={snapshot} close={() => { setContextReview(false); document.getElementById(`prompt-${session.id}`)?.focus(); }} />}
    {scheduleReview && <SchedulePromptDialog sdk={client} session={session} editor={editor} initial={scheduleReview} close={() => setScheduleReview(null)} />}
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

const effortLabel = (value: ThinkingEffort | "") => value === "" ? "Model default" : value === "xhigh" ? "Extra high" : value[0]!.toUpperCase() + value.slice(1);
function ModelMenu({ sdk, session, snapshot, onConnect, onLocalModels, onRouting, onContext, onSaving, onError, pending, requiresImages }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onConnect: () => void; onLocalModels: () => void; onRouting: () => void; onContext: () => void; onSaving: (saving: boolean) => void; onError: (message: string) => void; pending: boolean; requiresImages: boolean }) {
  const current = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState(session.controls.modelOptions?.contextWindow?.toString() ?? "");
  const [effort, setEffort] = useState<ThinkingEffort | "">(session.controls.modelOptions?.thinkingEffort ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submenu, setSubmenu] = useState<"models" | "effort" | "context" | "mode" | null>(null);
  const [modeChoices, setModeChoices] = useState<KupoModeAvailability[]>([]), [modeError, setModeError] = useState("");
  const modeScope = JSON.stringify([sdk.profileId, session.id, session.controls.env, session.controls.modelId, session.controls.kupoMode, snapshot.settings.revision, snapshot.policy.revision, snapshot.provider.models]);
  useEffect(() => {
    if (!current?.synthetic || snapshot.settings.values.kupo.workflow !== "auto") return;
    let active = true;
    setModeChoices([]); setModeError("");
    void sdk.routing.modes(session.id).then(({ modes }) => { if (active) setModeChoices(modes); })
      .catch((error: unknown) => { if (active) setModeError(error instanceof Error ? error.message : "Mode readiness could not be read. No option was guessed."); });
    return () => { active = false; };
  }, [sdk, modeScope]);
  const revision = useRef(session.revision);
  const windows = current && !current.synthetic ? modelContextWindows(current) : null;
  const staleWindow = Boolean(window && (!current || current.synthetic || !supportsModelContextWindow(current, Number(window))));
  const staleEffort = Boolean(effort && !current?.thinkingLevels?.includes(effort));
  const contextChoices = windows?.values.slice() ?? [];
  if (window && !staleWindow && !contextChoices.includes(Number(window))) contextChoices.push(Number(window));
  contextChoices.sort((a, b) => b - a);
  const reload = () => { revision.current = session.revision; setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? ""); setEffort(session.controls.modelOptions?.thinkingEffort ?? ""); setError(""); onError(""); };
  const options: ModelOptions = { ...(window ? { contextWindow: Number(window) } : {}), ...(effort ? { thinkingEffort: effort } : {}) };
  const dirty = options.contextWindow !== session.controls.modelOptions?.contextWindow || options.thinkingEffort !== session.controls.modelOptions?.thinkingEffort;
  const select = async (model: ModelInfo) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try {
      const result = await sdk.sessions.selectModel(session.id, model.id, revision.current);
      const saved = sdk.getState().snapshot?.sessions.find((value) => value.id === session.id);
      if (!saved) throw new Error("The saved model controls could not be reloaded. Reconnect before another selection; no substitute model was chosen.");
      revision.current = result.revision!;
      setWindow(saved.controls.modelOptions?.contextWindow?.toString() ?? "");
      setEffort(saved.controls.modelOptions?.thinkingEffort ?? "");
    } catch (error) { const message = error instanceof Error ? error.message : "Model selection failed. No fallback was used."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const save = async (options: ModelOptions, rememberModelSelection = false) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try { const result = await sdk.sessions.modelOptions(session.id, options, revision.current, rememberModelSelection || undefined); revision.current = result.revision!; }
    catch (error) { const message = error instanceof Error ? error.message : "Model settings were not saved."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const chooseMode = async (mode: KupoMode) => {
    setSaving(true); onSaving(true); setError(""); onError("");
    try { const result = await sdk.sessions.kupoMode(session.id, mode, revision.current); revision.current = result.revision!; setSubmenu(null); }
    catch (error) { const message = error instanceof Error ? error.message : "The original Kupo mode was not saved. No model or effort was substituted."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const locked = saving || pending || Boolean(session.turnId);
  const effortChoices: Array<ThinkingEffort | ""> = ["", ...current?.thinkingLevels ?? []];
  return <>{snapshot.provider.status !== "connected" && <><p>Connect GitHub Copilot or configure a local model to use Kupo.</p><button type="button" onClick={onConnect}>Connect Copilot</button></>}
    <ModelSubmenu label="Choose model" text="Model" value={current?.name ?? "Select model"} open={submenu === "models"} disabled={locked}
      toggle={() => setSubmenu(submenu === "models" ? null : "models")} close={() => setSubmenu(null)}>
      <input className="composer-model-search" aria-label="Search models" placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="composer-model-list">{snapshot.provider.models.filter((model) => (model.synthetic || !model.environments || model.environments.includes(session.controls.env)) && model.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(Boolean(b.synthetic)) - Number(Boolean(a.synthetic))).map((model) => {
      const unavailable = Boolean(model.environments && !model.environments.includes(session.controls.env));
      const description = model.synthetic ? unavailable ? `Unavailable in ${session.controls.env}. ${snapshot.routingDiagnostics?.join(" ") ?? ""}` :
        snapshot.settings.values.kupo.workflow === "auto" ? "Automatic Single / Cascade / Critique using configured models; every role is metered" :
          snapshot.settings.values.kupo.workflow === "compound" ? "Moguri / separately metered classifier, proposal and conditional roles" : "Moguri / separately metered router and solver" :
        `${model.source === "local" ? model.providerId : "GitHub Copilot"} / ${compact(model.contextWindow)} maximum context`;
      const disabled = locked || dirty || unavailable || requiresImages && !model.imageInput;
      return <div className="model-choice-row" key={model.id}><button type="button" role="menuitemradio" className="composer-menu-option" aria-checked={model.id === session.controls.modelId}
        aria-disabled={disabled} onClick={() => { if (!disabled) { setSubmenu(null); void select(model); } }}>
        <Icon name={modelIcon(model)} /><span>{model.name}<small>{unavailable ? "Unavailable" : description}</small></span>{model.id === session.controls.modelId && <Icon name="Check" />}</button>
        {unavailable && (model.synthetic ? <PolicyHint label="Why Kupo is unavailable" target="kupo" navigationBlocked={dirty || saving || pending ? "Save or reload your model setting edit before opening Kupo settings." : undefined}>{description}</PolicyHint> :
          <InfoTip label={`Why ${model.name} is unavailable`}>{description}</InfoTip>)}
      </div>;
    })}</div>
    </ModelSubmenu>
    {current?.synthetic ? <ModelSubmenu label="Kupo effort" text="Effort" value={snapshot.settings.values.kupo.workflow !== "auto" ? "Retained explicit policy" : session.controls.kupoMode ? kupoModes.find((mode) => mode.id === session.controls.kupoMode)!.name : "Legacy / choose an effort"}
      open={submenu === "mode"} disabled={locked || snapshot.settings.values.kupo.workflow !== "auto"} toggle={() => setSubmenu(submenu === "mode" ? null : "mode")} close={() => setSubmenu(null)}>
      {!modeChoices.length && !modeError && <p role="status">Reading shared mode readiness...</p>}
      {kupoModes.map((mode) => {
        const choice = modeChoices.find((choice) => choice.mode === mode.id), unavailable = !choice?.available;
        return <div key={mode.id} className="model-choice-row"><button type="button" role="menuitemradio" className="composer-menu-option"
          aria-label={mode.name} aria-description={mode.description} aria-checked={session.controls.kupoMode === mode.id} aria-disabled={unavailable}
          onClick={() => { if (!unavailable) void chooseMode(mode.id); }}><span>{mode.name}<small>{mode.description}</small></span>{session.controls.kupoMode === mode.id && <Icon name="Check" />}</button>
          <InfoTip label={`About ${mode.name} readiness`}>{choice?.reason ?? (modeError || "Readiness is not yet known. No model was admitted.")}</InfoTip></div>;
      })}
      <p className="fine-print">Kupo effort selects Balanced, Savings or Performance routing. It is not a model's thinking effort. Each admitted role keeps its actual supported effort, context and metered budget. Source reviews and mode choices do not grant permissions or prove quality.</p>
      {modeError && <Alert as="p" className="inline-error" role="alert">{modeError}</Alert>}
    </ModelSubmenu> : <ModelSubmenu label="Thinking effort" text="Effort" value={current?.thinkingLevels?.length || staleEffort ? effortLabel(effort) : "Provider controlled"}
      open={submenu === "effort"} disabled={locked || !current?.thinkingLevels?.length && !staleEffort} toggle={() => setSubmenu(submenu === "effort" ? null : "effort")} close={() => setSubmenu(null)}>
      {effortChoices.map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={effort === value}
        onClick={() => { setEffort(value); setSubmenu(null); void save({ ...(window ? { contextWindow: Number(window) } : {}), ...(value ? { thinkingEffort: value } : {}) }, true); }}>
        <span>{effortLabel(value)}</span>{effort === value && <Icon name="Check" />}</button>)}
    </ModelSubmenu>}
    {session.controls.preferredThinkingEffort !== undefined && <p className="fine-print" role="status">
      {effortLabel(session.controls.preferredThinkingEffort)} preference retained. {current?.synthetic ? "Kupo manages each role's effort." :
        !current ? "Select a model to apply this preference." : effort ? `Using ${effortLabel(effort)} for this model; the original preference returns on a supporting model.` :
          "This model has no adjustable thinking; the preference returns on a supporting model."}
    </p>}
    <ModelSubmenu label="Working context window" text="Context window" value={window ? compact(Number(window)) : windows?.values[0] ? compact(windows.values[0]) : current?.synthetic ? "Managed by Kupo" : "Not selected"}
      open={submenu === "context"} disabled={locked || !windows?.values.length} toggle={() => setSubmenu(submenu === "context" ? null : "context")} close={() => setSubmenu(null)}>
      {[null, ...contextChoices].map((value) => <button key={value ?? "default"} type="button" role="menuitemradio" aria-checked={window === (value?.toString() ?? "")}
        onClick={() => { setWindow(value?.toString() ?? ""); setSubmenu(null); void save({ ...(value ? { contextWindow: value } : {}), ...(effort ? { thinkingEffort: effort } : {}) }); }}>
        <span>{value === null ? "Model default" : `${count(value)} tokens`}</span>{window === (value?.toString() ?? "") && <Icon name="Check" />}</button>)}
    </ModelSubmenu>
    <details className="model-tuning"><summary>Model details and setup</summary>
      <p>Only qualified model options are offered. Counts are estimates; overfull context stops without truncating history. Kupo binds tuning to each actual approved role.</p>
      <ModelEvidencePanel sdk={sdk} model={current} scope={JSON.stringify([sdk.profileId, session.id, session.controls.env, current?.id])} remote={session.controls.env === "Remote"} />
      <button className="quiet" type="button" disabled={saving || pending} onClick={onContext}>Review context and compactions</button><button className="quiet" type="button" onClick={onLocalModels}>Configure local models</button><button className="quiet" type="button" onClick={onRouting}>{snapshot.settings.values.kupo.workflow === "auto" ? "Kupo settings" : snapshot.settings.values.kupo.workflow === "compound" ? "kupo Compound settings" : "kupo Single settings"}</button>
    </details>
      {session.turnId && <p>Stop the active turn before changing model settings.</p>}
      {staleWindow && <Alert as="p" className="inline-error" role="alert">The saved working window is no longer supported. Choose an offered window explicitly. History and saved settings were not clamped.</Alert>}
      {staleEffort && <Alert as="p" className="inline-error" role="alert">The saved thinking effort is no longer supported. Choose an offered effort or provider default explicitly. The model and context were not substituted.</Alert>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <div className="button-row"><span className="fine-print" role="status">{saving ? "Saving..." : dirty ? "Settings were not saved. Reload before choosing again." : "Changes save automatically."}</span><button type="button" className="quiet" disabled={saving || pending} onClick={reload}>Reload</button></div>
    </>;
}

function UsageMenu({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const accounting = useBudgetStatus(sdk, session, snapshot);
  const [budgetView, setBudgetView] = useState<"usage" | "limits">("usage");
  const [budgetDirty, setBudgetDirty] = useState(false);
  const policyNavigationBlocked = budgetDirty ? "Save or reload the session budget edit before opening a hard-policy setting." : undefined;
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
        <div><dt>Plan</dt><dd>{plan}
          {snapshot.budgetPolicy.limit && <PolicyHint label="About profile budget policy" target="profile-budget" navigationBlocked={policyNavigationBlocked}>This profile's hard cap applies even when the session preference is Unlimited. Opening policy does not clear usage, held work or a cap.</PolicyHint>}
          {snapshot.globalBudgetPolicy?.limit && <PolicyHint label="About global budget policy" target="global-budget" navigationBlocked={policyNavigationBlocked}>The global hard cap applies across profiles. Navigation cannot refund accounting or change policy.</PolicyHint>}
        </dd></div>
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
      <h3>Session budget limits</h3><BudgetLimitEditor sdk={sdk} snapshot={snapshot} session={session} scope="session" status={accounting.status} onDirty={setBudgetDirty} />
    </div>
    {accounting.error && <Alert as="p" className="inline-error" role="alert">{accounting.error}</Alert>}</>;
}
