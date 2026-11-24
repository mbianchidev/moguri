import { lazy, Suspense, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useVirtualDisk } from "./VirtualDiskSettings.tsx";
import { autonomyLabel, autonomyValues, envLabel, hostedProvider, configuredReadinessModels, continueWorkInput, parseShellCommand, resolveSessionReference, sessionReferences, DraftEditor, isRecord, KUPO_MODEL_ID, kupoModes, RECOVERY_DELAYS_MS, retryFailure, modelContextWindows, supportsModelContextWindow, pasteLineCount, sentPromptHistory, sessionTitle, slashCommands, isSharedSlash, parseSlash, attachmentTriggers, parseAttachmentTrigger, shortcutLabel, voiceShortcutMode, type DraftDictation, type Controls, type ModelInfo, type ModelOptions, type MoguriSdk, type Project, type Session, type Snapshot, type SlashSuggestion, type GatewaySkill, type ThinkingEffort, type KupoMode, type KupoModeAvailability, type KupoOptionsReport, type QueueableControlCommand } from "@moguri-dev/sdk";
import { Icon, modelIcon } from "./Icon.tsx";
import { AttachmentChip, AttachmentMenu, AttachmentReview, captureReviewed, matchingContextSessions, SESSION_DRAG_TYPE, clipboardImage, type AttachmentReviewRequest } from "./ContextAttachments.tsx";
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
import { StartupModelContext } from "./StartupModelContext.ts";
import { isModelDiscoveryPending } from "./startup-cache.ts";

const SandboxSetupDialog = lazy(() => import("./SandboxSetupDialog.tsx").then((module) => ({ default: module.SandboxSetupDialog })));
const ModelReadinessView = lazy(() => import("./ModelReadinessView.tsx").then((module) => ({ default: module.ModelReadinessView })));
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

export function ChatComposer({ session, project, snapshot, client, editor, run, busy, connected, onConnect, onSlash, onTerminal, onMenuChange, onGuardrails, onLocalModels, onRemote, onSandbox, onRouting, onDecisions, onVoiceSettings, inputLabel = "Prompt", autoFocus = false, onPendingChange }: {
  session: Session; project?: Project; snapshot: Snapshot; client: MoguriSdk; editor: DraftEditor; run: Run; busy: boolean; connected: boolean;
  onConnect: () => void; onMenuChange: (open: boolean) => void; onGuardrails: () => void;
  onLocalModels: () => void; onRemote: () => void; onSandbox: () => void; onRouting: () => void; onDecisions: () => void;
  onSlash: (session: Session, editor: DraftEditor, text: string, held?: boolean) => Promise<void>;
  /** Show this chat's Terminal panel after a `!command` ran in its user console. */
  onTerminal?: () => void;
  inputLabel?: string; autoFocus?: boolean; onPendingChange?: (pending: boolean) => void; onVoiceSettings?: () => void;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const input = useRef<HTMLTextAreaElement>(null), dictated = useRef<DraftDictation | null>(null);
  // The box grows with its text up to a few more lines; Enlarge gives a taller, drag-resizable box until it's restored.
  const [enlarged, setEnlarged] = useState(false);
  const [insertedTranscript, setInsertedTranscript] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sandboxSetup, setSandboxSetup] = useState<{ revision: number } | null>(null);
  const [slashCatalog, setSlashCatalog] = useState<{ scope: string; entries: SlashSuggestion[]; error: string }>({ scope: "", entries: [], error: "" });
  const [slashOption, setSlashOption] = useState(0), slashList = useRef<HTMLDivElement>(null), slashListId = useId();
  const decisions = useDecisionStatus(client, session, snapshot, menu === "autonomy" || session.controls.autonomy === "Autopilot Max");
  const [attachmentReview, setAttachmentReview] = useState<AttachmentReviewRequest | null>(null);
  const literalMentions = useRef<{ text: string; ids: Set<string> }>({ text: "", ids: new Set() });
  const mentionPending = useRef(false);
  const chosenSkill = useRef<GatewaySkill | null>(null);
  const recalled = useRef<{ index: number; text: string } | null>(null);
  /** Up on an empty draft (or while browsing) recalls earlier sent prompts; Down walks back toward the empty draft. */
  const recallPrompt = (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return false;
    const current = editor.getState(), field = event.currentTarget, up = event.key === "ArrowUp";
    if (recalled.current && current.text !== recalled.current.text) recalled.current = null;
    const browsing = recalled.current !== null;
    if (!browsing && (!up || current.text)) return false;
    if (browsing && field.selectionStart !== field.selectionEnd) return false;
    if (browsing && (up ? field.value.slice(0, field.selectionStart).includes("\n") : field.value.slice(field.selectionEnd).includes("\n"))) return false;
    const prompts = sentPromptHistory(session.messages), next = (recalled.current?.index ?? -1) + (up ? 1 : -1);
    if (next >= prompts.length) return browsing || prompts.length > 0;
    const text = next < 0 ? "" : prompts[next]!;
    recalled.current = next < 0 ? null : { index: next, text };
    editor.edit(text, current.attachments);
    requestAnimationFrame(() => { if (input.current) input.current.setSelectionRange(text.length, text.length); });
    return true;
  };
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
  const [dismissedSlash, setDismissedSlash] = useState<string | null>(null);
  const [finishingVoice, setFinishingVoice] = useState(false);
  const [documentCapture, setDocumentCapture] = useState<{ id: string; name: string } | null>(null), [documentError, setDocumentError] = useState("");
  const heldModifier = useQueueModifier();
  const [configurationCount, setConfigurationCount] = useState(0), [configurationError, setConfigurationError] = useState("");
  const configuring = configurationCount > 0;
  const trackConfiguration = useCallback((started: boolean) => setConfigurationCount((count) => count + (started ? 1 : -1)), []);
  const [delivery, setDelivery] = useState<"auto" | "queue" | "steer" | "interrupt">("auto");
  const model = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const cachedModels = useContext(StartupModelContext), cachedModel = cachedModels.find((model) => model.id === session.controls.modelId);
  const eligibleModel = Boolean(model && (!model.environments || model.environments.includes(session.controls.env)));
  const nativeStage = snapshot.sandboxWorkspaces?.find((value) => value.id === session.sandboxWorkspaceId && value.sessionId === session.id);
  const automaticNative = snapshot.settings.values.sandboxManagement?.enabled && snapshot.settings.values.sandboxManagement.automaticWorkspaces;
  const needsNativeStage = session.controls.env === "Sandbox" && nativeStage?.status !== "ready" && !automaticNative;
  const dictation = useDictation(client, session, snapshot, { shortcuts: true, globalShortcut: inputLabel === "Prompt",
    beforeStart: () => {
      dictated.current?.close();
      dictated.current = editor.startDictation(input.current?.selectionStart, input.current?.selectionEnd);
    },
    onTranscript: (text, _jobId, final) => {
      if (!dictated.current) throw new Error("The original dictation composer is closed. No transcript was inserted elsewhere.");
      dictated.current.update(text);
      if (final) { dictated.current.close(); void run(() => editor.flush()); }
    } });
  useEffect(() => () => dictated.current?.close(), [editor]);
  const voiceJob = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.capture"].includes(job.kind) && job.status === "running");
  const voiceOutcome = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe", "voice.capture"].includes(job.kind));
  // Streamed captures already wrote their words into this draft; only batch transcripts await an explicit Insert.
  const transcript = voiceOutcome?.status === "completed" && voiceOutcome.kind !== "voice.capture" ? voiceOutcome : undefined;
  const transcriptPreview = useDictationTranscript(client, session.id, transcript?.id);
  const voiceFinalizing = finishingVoice || dictation.state.phase === "transcribing" || Boolean(voiceJob?.progress?.startsWith("Finalizing"));
  const voicePreparing = voiceJob?.kind === "voice.record" && Boolean(voiceJob.progress?.startsWith("Preparing"));
  const voiceShortcut = snapshot.settings.values.voice.shortcut ?? "Control+Space";
  const voiceActive = Boolean(voiceJob) || ["starting", "recording", "transcribing"].includes(dictation.state.phase) || dictation.state.cleanupPending;
  const isSlash = draft.text.startsWith("/");
  const shellCommand = parseShellCommand(draft.text), isShell = shellCommand !== null;
  const canRunShell = (value: ReturnType<DraftEditor["getState"]>) => connected && session.status !== "archived" && !value.conflict && Boolean(parseShellCommand(value.text));
  // `/skill-name [prompt]` sends a normal prompt with the skill attached; every other slash runs as a queued command.
  const slashName = isSlash ? parseSlash(draft.text)?.name : undefined;
  const commandSlash = isSlash && (!slashName || isSharedSlash(slashName));
  const attachmentTrigger = isSlash || isShell || dismissedTrigger === draft.text ? null : parseAttachmentTrigger(draft.text);
  const sessionOptions = attachmentTrigger?.prefix === ":" ? matchingContextSessions(snapshot, session.id, attachmentTrigger.query) : [];
  useEffect(() => { setSessionOption(0); }, [attachmentTrigger?.prefix, attachmentTrigger?.query]);
  const requiresImages = Boolean(session.inheritedImages || session.sideContext?.inheritedImages) || draft.attachments.some((attachment) => attachment.kind === "image") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "image"));
  const requiresDocuments = Boolean(session.sideContext?.documents.length) || draft.attachments.some((attachment) => attachment.kind === "document") || session.messages.some((message) => message.attachments?.some((attachment) => attachment.kind === "document"));
  const documentBlocked = requiresDocuments && (model?.toolInput === false || session.kind === "metachat" || session.kind === "subagent");
  const held = heldModifier;
  const holdingNext = heldPending || held && Boolean(draft.text.trim() || draft.attachments.length);
  const hardBudget = Boolean(snapshot.budgetPolicy.limit || snapshot.globalBudgetPolicy?.limit);
  const question = snapshot.questions.find((question) => question.id === session.pendingQuestionId && question.status === "open");
  const answering = Boolean(question && (delivery === "queue" || delivery === "auto") && !isSlash);
  const diskVolume = session.workspaceId ? snapshot.managedWorkspaces.find((workspace) => workspace.id === session.workspaceId)?.volume : undefined;
  const disk = useVirtualDisk(client, Boolean(diskVolume))?.disk;
  const diskPaused = Boolean(diskVolume && disk?.id === diskVolume.diskId && (disk.pressure?.paused || disk.status === "resizing"));
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
  const canQueueDraft = (value: ReturnType<DraftEditor["getState"]>) => connected && !busy && !configuring && !resuming && !retrying && !voiceActive && session.status !== "archived" && Boolean(value.text.trim() || value.attachments.length) && !value.conflict && !value.pendingInput;
  const canSendDraft = (value: ReturnType<DraftEditor["getState"]>) => question && (delivery === "queue" || delivery === "auto") && !value.text.startsWith("/") ?
    canQueueDraft(value) && Boolean(value.text.trim()) && Boolean(question.allowFreeform || question.choices.includes(value.text)) :
    canQueueDraft(value) && snapshot.provider.status === "connected" && eligibleModel && !needsNativeStage && (session.controls.autonomy !== "Autopilot Max" || decisions.ready) &&
    snapshot.policy.allowedEnvs.includes(session.controls.env) && Boolean(snapshot.capabilities.find((capability) => capability.env === session.controls.env)?.ready) && (!requiresImages || Boolean(model?.imageInput)) && !documentBlocked && (delivery === "queue" || delivery === "auto" || Boolean(session.turnId));
  const canQueue = canQueueDraft(draft), canSend = canSendDraft(draft);
  const slashOpen = isSlash && !/\s/.test(draft.text) && dismissedSlash !== draft.text;
  useEffect(() => { setDismissedSlash(null); }, [draft.text]);
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
    if (suggestion.kind === "shadowed") return;
    const selectedText = editor.getState().text;
    if (selectedText !== draft.text) { void run(async () => { throw new Error("The slash draft changed. Select the command again; the newer text was preserved."); }); return; }
    if (suggestion.kind === "skill") chosenSkill.current = suggestion.skill;
    editor.edit(`/${suggestion.name} `); input.current?.focus();
  };
  const sendSkill = async (text: string, name: string, prompt: string, hold: boolean) => {
    const chosen = chosenSkill.current?.name === name ? chosenSkill.current : undefined;
    const matches = (await client.commands.list(session.id)).flatMap((entry) => entry.kind === "skill" && entry.name === name ? [entry.skill] : []);
    const skill = matches.find((value) => value.id === chosen?.id) ?? (matches.length === 1 ? matches[0] : undefined);
    if (!skill) {
      if (matches.length > 1) throw new Error(`Several skills are named ${name}. Pick the exact one from the slash list; your draft was preserved.`);
      return await onSlash(session, editor, text, hold);
    }
    if (!(hold ? canQueueDraft : canSendDraft)(editor.getState())) throw new Error("This chat can't send right now (check the model, Env and connection). The skill was not loaded; your draft was preserved.");
    await editor.flush();
    const current = client.getState().snapshot?.sessions.find((entry) => entry.id === session.id);
    if (!current || editor.getState().text !== text || current.draft.text !== text) throw new Error("The draft changed while saving. The newer text was preserved; send it again.");
    await client.skills.use(session.id, skill.id, skill.digest, current.draft.revision, prompt);
    const saved = client.getState().snapshot?.sessions.find((entry) => entry.id === session.id)?.draft;
    if (saved) editor.receive(saved);
    chosenSkill.current = null;
    return await editor.send(hold ? "queue" : delivery, hold);
  };
  useEffect(() => { onMenuChange(menu !== null || sandboxSetup !== null || attachmentReview !== null || previewOpen || contextReview || scheduleReview !== null); return () => onMenuChange(false); }, [menu, sandboxSetup, attachmentReview, previewOpen, contextReview, scheduleReview, onMenuChange]);
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
    const current = editor.getState(), text = current.text, isSlash = text.startsWith("/");
    const shell = parseShellCommand(text);
    if (shell !== null) {
      if (!canRunShell(current)) return;
      // A shell line is the user's own console input: no prompt, steer, queue item or model call.
      void run(async () => {
        await client.terminal.run(session.id, shell);
        if (editor.getState().text === text) { editor.edit(""); await editor.flush(); }
        onTerminal?.();
      });
      return;
    }
    const answering = Boolean(question && (delivery === "queue" || delivery === "auto") && !isSlash);
    const canQueue = canQueueDraft(current);
    if (!answering && !isSlash && !failedRequest && (hold || !needsResume)) {
      if (literalMentions.current.text !== text) literalMentions.current = { text, ids: new Set() };
      const others = snapshot.sessions.filter((source) => source.id !== session.id), ids = new Set<string>();
      for (const reference of sessionReferences(text)) {
        const matches = resolveSessionReference(others, reference);
        if (matches.length > 1) { void run(async () => { throw new Error(`Session ID ${reference} matches ${matches.length} sessions. Use more characters or the full ID; nothing was attached or sent.`); }); return; }
        if (matches[0] && (reference.startsWith(":") || matches[0].id.toLowerCase() === reference)) ids.add(matches[0].id);
      }
      const source = others.find((source) => ids.has(source.id) &&
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
        if (!hold && session.projectId && (isSlash || delivery === "queue" || delivery === "auto" && !session.turnId) && continueWorkInput(text)) return await onSlash(session, editor, text);
        const slash = isSlash ? parseSlash(text) : null;
        if (slash && !isSharedSlash(slash.name)) return await sendSkill(text, slash.name, slash.argument, hold);
        if (isSlash) return await onSlash(session, editor, text, hold);
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
    try {
      if (session.turnId) await client.commands.control(session.id, "autonomy", autonomy);
      else await client.sessions.autonomy(session.id, autonomy, session.revision);
      setMenu(null);
    }
    catch (error) { setConfigurationError(error instanceof Error ? error.message : "The autonomy selection was not acknowledged. Existing controls were preserved."); throw error; }
    finally { trackConfiguration(false); }
  });
  const toggle = (value: Menu) => { if (value === "attach") setTrigger(null); setMenu((current) => current === value ? null : value); };
  const chooseAttachmentTrigger = () => {
    if (!attachmentTrigger) return;
    setTrigger(attachmentTrigger);
    if (attachmentTrigger.prefix === ":" && sessionOptions[sessionOption]) { void attachSession(sessionOptions[sessionOption]!.id); return; }
    if (attachmentTrigger.prefix === "^" && attachmentTrigger.query) { void capture(() => attachPath(attachmentTrigger.query)); return; }
    setMenu("attach");
  };
  const close = (value: Menu) => setMenu((current) => current === value ? null : current);
  const status = draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved";
  const sendLabel = isShell ? "Run in terminal" : commandSlash ? "Run command" : held || heldPending ? session.turnId ? "Queue prompt without starting work" : "Schedule prompt" : retryAction ? "Retry last model request" : needsResume ? "Resume" : answering ? "Answer question" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? delivery === "auto" ? "Send now" : "Queue" : "Send";
  const item = (name: Menu, label: string, icon: string, children: ReactNode) => <ComposerPopover name={name} label={label} description={name === "env" ? `${envLabel(session.controls.env)}. ${session.controls.env === "Remote" ? "SSH-host execution, not SendBox isolation." : session.controls.env === "Sandbox" ? "Native SendBox guest; exact qualification and private staging are required." : "Host execution is not sandboxed."}` : name === "autonomy" ? autonomyLabel(session.controls.autonomy) : name === "budget" ? session.controls.budget.kind === "unlimited" ? hardBudget ? "Unlimited preference; hard policy applies" : "Unlimited" : "Estimate-based cap" : undefined} open={menu === name} toggle={() => toggle(name)} close={() => close(name)} trigger={<Icon name={icon} />}>{children}</ComposerPopover>;
  return <form className={`composer compact-composer ${dragging ? "session-drop-target" : ""}`} data-composer-session={session.id} onSubmit={(event) => submit(event)} onKeyDown={(event) => { if (event.key === "Escape") { setTrigger(null); setDismissedTrigger(draft.text); setDismissedSlash(draft.text); } }}
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
    aria-label="Message composer" data-question-pending={question ? true : undefined} data-enlarged={enlarged || undefined}
    aria-description={retryAction ? "Enter retries the original failed model request without sending or clearing this draft. Earlier tools and hooks are not replayed." : resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without resuming." : answering ? "Enter answers. Shift+Enter adds a line. Cmd/Ctrl+Enter queues without answering." : "Enter sends. Shift+Enter adds a line. Cmd/Ctrl+Enter holds or schedules without starting work."}>
    {failedRequest && <Alert as="p" className="composer-context-warning" role="status">{failedRequest.status === "exhausted" ? "Automatic recovery exhausted all four rounds. Retry remains an explicit action." :
      failedRequest.status === "blocked" ? failedRequest.diagnostic : nextRecoveryAt ? `Automatic recovery round ${recoveryCycle!.round + 1} is scheduled for ${nextRecoveryAt.toLocaleTimeString()}. Retry now leaves that countdown unchanged unless the response succeeds.` : failedRequest.diagnostic} Your unsent draft and queued prompts are preserved.</Alert>}
    {documentCapture && <div className="document-capture"><p role="status">Extracting {documentCapture.name} locally. No model call; your draft is preserved.</p><progress aria-label="Local document extraction" /><button type="button" onClick={() => void client.attachments.cancelDocument(session.id, documentCapture.id).catch((error: unknown) => setDocumentError(error instanceof Error ? error.message : "Capture stop is unconfirmed. Inspect the saved draft."))}>Cancel extraction</button></div>}
    {documentError && <Alert as="p" className="inline-error" role="alert">{documentError}</Alert>}
    {diskPaused && <Alert as="p" className="composer-context-warning" role="status">{disk?.status === "resizing" ? "Moguri's virtual disk is being resized, so this chat waits before its next model call." :
      "Moguri's virtual disk is full, so this chat is paused before its next model call. Archive sessions (their clean, pushed worktrees are removed) or make the disk bigger in Settings / Retention; work resumes on its own."}</Alert>}
    {configuring && <Alert as="p" className="composer-context-warning" role="status">Saving model settings. Your draft is preserved until the change settles.</Alert>}
    {configurationError && menu !== "model" && <Alert as="p" className="inline-error" role="alert">{configurationError}</Alert>}
    {session.controls.modelId && (!model || model.synthetic && !eligibleModel) && <button type="button" className="setup-hint" onClick={session.controls.modelId === KUPO_MODEL_ID ? onRouting : onConnect}>{session.controls.modelId === KUPO_MODEL_ID ? `Kupo is unavailable in ${envLabel(session.controls.env)}. ${snapshot.routingDiagnostics?.join(" ") ?? "Inspect its model pool and budget policy."}` : `Saved model ${session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.`}<Icon name="Down" /></button>}
    {model && !eligibleModel && <button type="button" className="setup-hint" onClick={() => setMenu("model")}>This saved model is not available in {envLabel(session.controls.env)}. Choose a compatible model explicitly.<Icon name="Down" /></button>}
    {requiresImages && model && !model.imageInput && !answering && <Alert as="p" className="composer-context-warning" role="status">Select an image-capable model. The complete context stays in your draft or conversation.</Alert>}
    {documentBlocked && !answering && <Alert as="p" className="composer-context-warning" role="status">Documents need an ordinary chat and tool-capable model. Your complete draft and held queue are preserved; no document is dropped or expanded into the prompt.</Alert>}
    {answering && draft.attachments.length > 0 && <Alert as="p" className="composer-context-warning" role="status">Answers consume only text. Attached context stays saved.</Alert>}
    {session.localFinishing && <p className="local-finishing">Local finishing. New Local turns are blocked by policy.</p>}
    {needsNativeStage && <button type="button" className="setup-hint" onClick={onSandbox}>Review a private native workspace before starting a turn. Your draft and held queue are preserved.<Icon name="Box" /></button>}
    {session.controls.autonomy === "Autopilot Max" && !decisions.ready && <button type="button" className="setup-hint" onClick={onDecisions}>{decisions.reason}<Icon name="Rocket" /></button>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <AttachmentChip key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} remove={() => removeAttachment(attachment.id)} onOpenChange={setPreviewOpen} />)}</div>}
    {dragging && <p className="session-drop-hint" role="status">Drop to attach this session's content</p>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>{inputLabel}</label>
    <div className="composer-input">
      <textarea ref={input} autoFocus={autoFocus} id={`prompt-${session.id}`} rows={question ? 1 : undefined} aria-controls={suggestions.length ? slashListId : undefined}
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
          else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && recallPrompt(event)) event.preventDefault();
          else {
            const action = chatSubmission(event);
            if (!action) return;
            event.preventDefault();
            const text = event.currentTarget.value;
            if (text !== draft.text && text !== editor.getState().text) editor.edit(text);
            const current = editor.getState();
            if (current.text.startsWith("!") ? canRunShell(current) : current.text.startsWith("/") || action === "hold" ? canQueueDraft(current) : failedRequest ? canRetry : needsResume ? canResume : canSendDraft(current)) submit(undefined, action === "hold");
          }
        }} />
      {!question && <button type="button" className="icon-button composer-enlarge" aria-pressed={enlarged} aria-label={enlarged ? "Restore the message box" : "Enlarge the message box"}
        title={enlarged ? "Restore the message box" : "Enlarge the message box"}
        onClick={() => { if (input.current) input.current.style.height = ""; setEnlarged((value) => !value); input.current?.focus(); }}><Icon name={enlarged ? "Minimize" : "Maximize"} /></button>}
    </div>
    {suggestions.length > 0 && <div ref={slashList} id={slashListId} className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion, index) => <button type="button" role="option" id={`${slashListId}-${index}`} tabIndex={-1}
      aria-selected={index === slashOption} aria-disabled={suggestion.kind === "shadowed" || undefined} key={suggestion.kind === "builtin" ? suggestion.name : suggestion.skill.id} data-command-kind={suggestion.kind}
      onClick={() => selectSlash(suggestion)}><strong>/{suggestion.name}{suggestion.kind !== "builtin" && <small>{suggestion.kind === "shadowed" ? "Skill to rename" : "Skill"} / {suggestion.skill.sourceName}</small>}</strong><span>{suggestion.description}</span></button>)}</div>}
    {slashOpen && slashCatalog.scope === slashScope && slashCatalog.error && <Alert as="p" className="inline-error" role="alert">{slashCatalog.error} Built-in slash commands remain available.</Alert>}
    {sessionOptions.length > 0 && <div className="attachment-session-suggestions" role="listbox" aria-label="Active context sessions">{sessionOptions.map((source, index) => <button type="button" role="option" aria-selected={index === sessionOption} key={source.id} onClick={() => { setTrigger(attachmentTrigger); void attachSession(source.id); }}><Icon name="Side chat" /><span>{sessionTitle(source)}</span></button>)}</div>}
    {isShell && <p className="composer-shell-hint fine-print" role="status"><Icon name="Terminal" />{shellCommand ? <>Enter runs this line in the chat's terminal, in <code>{session.repositories ? "the repository chosen in Terminal" : project?.path ?? "your home folder"}</code>. No model call.</> : "Type a shell command after ! to run it in this chat's terminal."}</p>}
    {attachmentTrigger && <button className="attachment-trigger-hint quiet" type="button" onClick={chooseAttachmentTrigger}>{attachmentTrigger.prefix} {attachmentTriggers[attachmentTrigger.prefix]}<small>Tab to choose; text stays literal until selection</small></button>}
    {draft.error && <div className="draft-error"><Alert as="p" role="alert">{draft.error}</Alert><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    {(voiceJob || dictation.state.phase === "starting" || dictation.state.cleanupPending) && <p className="composer-voice-status fine-print" role="status">{dictation.state.cleanupPending ? "Original audio cleanup is unconfirmed. Retry discard before starting another microphone." : dictation.state.phase === "transcribing" ? "Flushing the original local audio buffer. Inserted words are preserved." : voiceJob?.progress || "Preparing the exact local microphone; Stop cancels pending startup."}
      <button type="button" className="quiet" onClick={() => { if (voiceJob && voiceJob.id !== dictation.state.id) void run(() => client.jobs.cancel(voiceJob.id)); else void dictation.cancel(); }}>Cancel and discard dictation</button></p>}
    {!dictation.modelChanged && dictation.state.error && dictation.state.error !== voiceOutcome?.error && <Alert as="p" className="composer-voice-status inline-error" role="alert">{dictation.state.error}</Alert>}
    {dictation.modelChanged ? <Alert as="p" className="composer-voice-status inline-error" role="alert">Your trusted dictation model file changed, so dictation is blocked until you review it again.
      {onVoiceSettings && <button type="button" className="quiet" onClick={onVoiceSettings}>Review model</button>}</Alert> :
      dictation.preparationError && dictation.preparationError !== dictation.state.error && dictation.preparationError !== voiceOutcome?.error &&
      <Alert as="p" className="composer-voice-status inline-error" role="alert">{dictation.preparationError}</Alert>}
    {!dictation.modelChanged && voiceOutcome?.status === "failed" && <Alert as="p" className="composer-voice-status inline-error" role="alert">{voiceOutcome.error || "Local dictation failed. Already inserted words were preserved."}</Alert>}
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
          const groupUnavailable = Boolean(session.repositories && capability.env === "Remote");
          const setup = capability.env === "Sandbox" && (!capability.ready || Boolean(session.repositories && !automaticNative));
          return <div className="composer-option-row" key={capability.env}><button className="composer-menu-option" type="button" disabled={setup && Boolean(session.turnId) || !connected || configuring || !capability.ready && !setup || policyBlocked || groupUnavailable} aria-pressed={session.controls.env === capability.env}
            title={groupUnavailable ? "Captured groups have no qualified SSH execution transport." : capability.reason} onClick={() => {
              if (setup) { setMenu(null); setSandboxSetup({ revision: session.revision }); }
              else void run(async () => {
                if (session.turnId) await client.commands.control(session.id, "env", capability.env);
                else await client.sessions.env(session.id, capability.env, session.revision);
                setMenu(null);
              });
            }}>
            <Icon name={envIcon[capability.env]} /><span>{envLabel(capability.env)}<small>{policyBlocked ? "Blocked by policy" : groupUnavailable ? "Group transport not qualified" : setup ? "Set up SendBox" : capability.env === "Local" ? "Host execution, not sandboxed" : !capability.ready ? "Not ready" : capability.env === "Sandbox" ? session.repositories ? "Private copies of every captured repository" : automaticNative ? "Verified SendBox guest; workspaces managed" : "Verified SendBox guest; private stage required" : "Verified SSH host, not SendBox isolation"}</small></span>{session.controls.env === capability.env && <Icon name="Check" />}</button>
            {policyBlocked && <PolicyHint label={`Why ${envLabel(capability.env)} is unavailable`} target="environments">Global execution policy excludes {envLabel(capability.env)}. Opening its setting does not widen policy, change this session's Env or restart work.</PolicyHint>}
            {capability.env !== "Local" && <button type="button" className="icon-button quiet composer-env-settings" aria-label={capability.env === "Sandbox" ? "SendBox settings" : "Remote host settings"}
              title={capability.env === "Sandbox" ? "SendBox settings" : "Remote host settings"} onClick={() => { setMenu(null); if (capability.env === "Sandbox") onSandbox(); else onRemote(); }}><Icon name="Settings" /></button>}
          </div>;
        })}{session.repositories && <p>Captured groups support Local and reviewed managed Sandbox execution. Every workspace tool explicitly selects an original repository. There is no first/default or common-parent root, and SSH groups remain unqualified.</p>}</>)}
        <ComposerPopover name="model" label="Model" description={model?.name ?? (cachedModel ? `${cachedModel.name} (cached label; refreshing availability)` : session.controls.modelId) ?? "Select model"} open={menu === "model"} toggle={() => toggle("model")} close={() => close("model")} trigger={<span className="composer-model-name">{model?.name ?? cachedModel?.name ?? (session.controls.modelId ? session.controls.modelId : "Select model")}{!model && cachedModel ? " (refreshing)" : model?.synthetic && session.controls.kupoMode ? ` · ${kupoModes.find((mode) => mode.id === session.controls.kupoMode)!.name}` : session.controls.modelOptions?.thinkingEffort && ` · ${effortLabel(session.controls.modelOptions.thinkingEffort)}`}</span>} model>
          <ModelMenu sdk={client} session={session} snapshot={snapshot} requiresImages={requiresImages} onConnect={() => { setMenu(null); onConnect(); }} onLocalModels={() => { setMenu(null); onLocalModels(); }} onRouting={() => { setMenu(null); onRouting(); }} onContext={() => { setMenu(null); setContextReview(true); }} onModelSelected={() => { if (session.kind === "side") setMenu(null); }} onSaving={trackConfiguration} onError={setConfigurationError} pending={configuring} />
        </ComposerPopover>
        {item("autonomy", "Autonomy level", autonomyIcon[session.controls.autonomy], <><h2>Autonomy</h2>{autonomyValues.map((autonomy) => {
          const reason = autonomy === "Manual" ? "You approve tools or remember a grant" : autonomy === "Guided" ? "Advice, then your confirmation" : autonomy === "Autopilot" ? "Automatically approve all tools and commands" :
            decisions.ready ? "Automatic approvals plus bounded System One decisions" : decisions.reason;
          return <div className="composer-option-row" key={autonomy}><button className="composer-menu-option" type="button" aria-pressed={autonomy === session.controls.autonomy} disabled={configuring || autonomy === "Autopilot Max" && !decisions.ready} title={reason} onClick={() => void selectAutonomy(autonomy)}><Icon name={autonomyIcon[autonomy]} /><span>{autonomyLabel(autonomy)}<small>{reason}</small></span>{autonomy === session.controls.autonomy && <Icon name="Check" />}</button>
            {autonomy === "Autopilot Max" && !decisions.ready && <PolicyHint label="Why Autopilot is unavailable" target="decisions">{reason} Reviewing the actual decision configuration does not start inference or enable an unqualified transport.</PolicyHint>}
            {autonomy === "Autopilot" && <button type="button" className="icon-button quiet composer-env-settings" aria-label="Guardrails" title="Guardrails" onClick={() => { setMenu(null); onGuardrails(); }}><Icon name="Settings" /></button>}
            {autonomy === "Autopilot Max" && <button type="button" className="icon-button quiet composer-env-settings" aria-label="Decision provider settings" title="Decision provider settings" onClick={() => { setMenu(null); onDecisions(); }}><Icon name="Settings" /></button>}
          </div>;
        })}<p>Autonomous and Autopilot are unattended. Hard deny rules, read-only mode, environment policy and budgets still apply.</p>
          {snapshot.settings.values.permissions.defaultDecision === "deny" && <p>Automatic approvals cannot bypass the saved tool policy.<PolicyHint label="About automatic approval policy" target="tools">Default-deny and explicit deny rules remain authoritative. Changing autonomy or opening this setting does not remove a hard rule.</PolicyHint></p>}
          {decisions.error && <Alert as="p" className="inline-error" role="alert">{decisions.error}</Alert>}</>)}
      </div>
      <div className="composer-trailing">
        {item("budget", "Budget and usage", session.controls.budget.kind === "unlimited" && !hardBudget ? "Infinity" : "Dollar", <UsageMenu key={session.id} sdk={client} session={session} snapshot={snapshot} />)}
        <DictationButton state={dictation.state} recording={Boolean(voiceJob)} armed={dictation.standbyReady}
          label={voiceFinalizing ? "Finalizing local dictation" : voicePreparing ? "Cancel local dictation setup" : voiceJob || dictation.state.phase === "starting" ? "Stop local dictation" : "Start local dictation"}
          disabled={voiceFinalizing || dictation.state.cleanupPending || dictation.state.phase === "transcribing" || !connected || session.status === "archived" || snapshot.settings.values.voice.enabled === false}
          title={snapshot.settings.values.voice.enabled === false ? "Enable local dictation in Settings / Voice, after reviewing its model license." : dictation.readinessDiagnostic ? `Set up local dictation in Settings / Voice. ${dictation.readinessDiagnostic}` : `Click to record; click again to confirm. ${voiceShortcut === "none" ? "No push-to-talk shortcut is assigned." : voiceShortcutMode(snapshot.settings.values.voice) === "hold" ?
            `Hold ${shortcutLabel(voiceShortcut)} for push-to-talk.` : `Press ${shortcutLabel(voiceShortcut)} to record; press again to finish.`}`}
          toggle={() => void dictate()} />
        <div className="composer-send-group">
          {session.turnId && !holdingNext && (draft.text.trim() || draft.attachments.length > 0) && !commandSlash &&
            <button className="primary icon-button composer-send" type="button" aria-label={sendLabel} title={isShell ? "Run this line in the chat's terminal. The agent's turn is not affected." : "Send to the active agent at its next safe boundary. The current operation is not cancelled."} disabled={isShell ? !canRunShell(draft) : !canSend} onClick={() => submit(undefined, false)}><Icon name={isShell ? "Terminal" : "Send"} /></button>}
          {session.turnId && !holdingNext ? <button className="icon-button composer-send composer-stop" type="button" aria-label={session.status === "stopping" ? "Stopping turn" : "Stop turn"} title="Stop the current turn and hold queued work. Your unsent draft is preserved." disabled={!connected || session.status === "stopping"} onClick={() => void run(() => client.command({ type: "session.stop", sessionId: session.id }))}><Icon name="Stop" /></button> :
            <button className="primary icon-button composer-send" type="submit" aria-label={sendLabel} aria-busy={resuming || retrying || undefined} title={isShell ? "Run this line in the chat's terminal. No model call." : retryAction ? "Retry the exact failed model request. Earlier tools/hooks are not replayed; your new draft is not sent or cleared." : resumeAction ? "Resume this session after inspecting unconfirmed effects. Your draft is not sent, and cleanup is not marked successful." : held || heldPending ? session.turnId ? "Queue without starting (Cmd/Ctrl+Enter)" : "Schedule this idle prompt (Cmd/Ctrl+Enter)" : `${sendLabel}. Hold Cmd/Ctrl to queue without starting.`} disabled={heldPending || resuming || retrying || (isShell ? !canRunShell(draft) : retryAction ? !canRetry : resumeAction ? !canResume : commandSlash || held ? !canQueue : !canSend)} onClick={(event) => { event.preventDefault(); submit(undefined, (event.metaKey || event.ctrlKey || held) && !commandSlash); }}><Icon name={isShell ? "Terminal" : held || heldPending ? "Clock" : retryAction ? "Refresh" : resumeAction ? "Play" : "Send"} /></button>}
          <ComposerPopover name="delivery" label="Delivery mode" open={menu === "delivery"} toggle={() => toggle("delivery")} close={() => close("delivery")} trigger={<Icon name="Down" />}>
            <h2>Delivery</h2>{(["auto", "queue", "steer", "interrupt"] as const).map((value) => <button className="composer-menu-option" type="button" key={value} aria-pressed={delivery === value} disabled={value !== "queue" && value !== "auto" && !session.turnId} onClick={() => { setDelivery(value); setMenu(null); }}><Icon name={value === "queue" || value === "auto" ? "Send" : value === "steer" ? "Agent" : "Stop"} /><span>{value === "auto" ? "Send now; steer an active solver" : value === "queue" ? question && !isSlash ? "Answer actual question" : session.turnId ? "Queue after current turn" : "Send" : value === "steer" ? "Steer at next boundary" : "Interrupt current turn"}</span></button>)}
            {session.turnId && <button className="primary" type="button" disabled={held || isSlash ? !canQueue : !canSend} onClick={() => { setMenu(null); submit(undefined, held); }}>{sendLabel}</button>}
            <p>{resumeAction ? "Enter resumes existing work without sending this draft. Inspect unconfirmed effects first." : "Enter sends using this delivery mode."} Cmd/Ctrl+Enter always holds the prompt instead.</p>
          </ComposerPopover>
        </div>
      </div>
      <span className="sr-only" role="status">{status}</span>
    </div>
    {sandboxSetup && <Suspense fallback={<p role="status">Opening SendBox setup...</p>}><SandboxSetupDialog sdk={client} snapshot={snapshot} sessionId={session.id} expectedRevision={sandboxSetup.revision}
      close={() => { setSandboxSetup(null); input.current?.form?.querySelector<HTMLButtonElement>('[data-composer-control="env"]')?.focus(); }} /></Suspense>}
    {attachmentReview && <AttachmentReview sdk={client} request={attachmentReview} attach={async (request) => {
      await editor.flush(); await captureReviewed(client, session.id, request);
      const saved = client.getState().snapshot?.sessions.find((value) => value.id === session.id)?.draft;
      if (saved) await adopt(saved);
    }} close={() => {
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
function ModelMenu({ sdk, session, snapshot, onConnect, onLocalModels, onRouting, onContext, onModelSelected, onSaving, onError, pending, requiresImages }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onConnect: () => void; onLocalModels: () => void; onRouting: () => void; onContext: () => void; onModelSelected: () => void; onSaving: (saving: boolean) => void; onError: (message: string) => void; pending: boolean; requiresImages: boolean }) {
  const cachedModels = useContext(StartupModelContext);
  const current = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState(session.controls.modelOptions?.contextWindow?.toString() ?? "");
  const [effort, setEffort] = useState<ThinkingEffort | "">(session.controls.modelOptions?.thinkingEffort ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [queued, setQueued] = useState("");
  const [submenu, setSubmenu] = useState<"models" | "effort" | "context" | "mode" | null>(null);
  const [modeChoices, setModeChoices] = useState<KupoModeAvailability[]>([]), [modeError, setModeError] = useState("");
  const [poolControls, setPoolControls] = useState<KupoOptionsReport | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | undefined>();
  const inspectionControlId = useId();
  const readinessModels = configuredReadinessModels(snapshot.provider.catalogue, session.controls.env);
  const inspectedId = inspectionId ?? (readinessModels.some((model) => model.id === session.controls.modelId) ? session.controls.modelId ?? "" : "");
  const inspectedModel = readinessModels.find((model) => model.id === inspectedId);
  const modeScope = JSON.stringify([sdk.profileId, session.id, session.controls.env, session.controls.modelId, session.controls.kupoMode, session.controls.modelOptions, snapshot.settings.revision, snapshot.policy.revision, snapshot.provider.models]);
  useEffect(() => {
    setPoolControls(null);
    if (!current?.synthetic) return;
    let active = true;
    setModeChoices([]); setModeError("");
    void Promise.all([snapshot.settings.values.kupo.workflow === "auto" ? sdk.routing.modes(session.id) : Promise.resolve({ modes: [] }),
      sdk.routing.options(session.id)]).then(([{ modes }, { report }]) => {
      if (active) { setModeChoices(modes); setPoolControls(report); }
    })
      .catch((error: unknown) => { if (active) setModeError(error instanceof Error ? error.message : "Mode readiness could not be read. No option was guessed."); });
    return () => { active = false; };
  }, [sdk, modeScope]);
  const revision = useRef(session.revision);
  // Choices here save at once, so only a save in flight is unsaved. Otherwise adopt a newer session revision and its
  // options, so a change from another client never leaves this panel sending an older revision than it shows.
  useEffect(() => {
    if (saving || session.revision <= revision.current) return;
    revision.current = session.revision;
    setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? "");
    setEffort(session.controls.modelOptions?.thinkingEffort ?? "");
  }, [session.revision, saving]);
  const windows = current?.synthetic ? poolControls?.available ? poolControls.windows : null : current ? modelContextWindows(current) : null;
  const staleWindow = Boolean(window && (current?.synthetic ? poolControls?.available && !poolControls.windows.values.includes(Number(window)) :
    !current || !supportsModelContextWindow(current, Number(window))));
  const thinkingLevels = current?.synthetic ? poolControls?.thinkingLevels ?? [] : current?.thinkingLevels ?? [];
  const staleEffort = Boolean(effort && !current?.synthetic && !thinkingLevels.includes(effort));
  const contextChoices = windows?.values.slice() ?? [];
  if (window && !staleWindow && !contextChoices.includes(Number(window))) contextChoices.push(Number(window));
  contextChoices.sort((a, b) => b - a);
  const reload = () => { revision.current = session.revision; setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? ""); setEffort(session.controls.modelOptions?.thinkingEffort ?? ""); setError(""); onError(""); };
  const options: ModelOptions = { ...(window ? { contextWindow: Number(window) } : {}), ...(effort ? { thinkingEffort: effort } : {}) };
  const dirty = options.contextWindow !== session.controls.modelOptions?.contextWindow || options.thinkingEffort !== session.controls.modelOptions?.thinkingEffort;
  const turnActive = Boolean(session.turnId);
  // During a turn, each change becomes its exact slash command in the session queue; local edit state is left untouched.
  const queue = async (name: QueueableControlCommand, argument: string) => {
    setSaving(true); onSaving(true); setError(""); onError(""); setSubmenu(null);
    try { await sdk.commands.control(session.id, name, argument); setQueued(`Queued /${name} ${argument} to apply after this turn.`); }
    catch (error) { const message = error instanceof Error ? error.message : "The change was not queued. Current settings were preserved."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const select = async (model: ModelInfo) => {
    if (turnActive) return queue("model", model.id);
    setSaving(true); onSaving(true); setError(""); onError("");
    try {
      const result = await sdk.sessions.selectModel(session.id, model.id, revision.current);
      const saved = sdk.getState().snapshot?.sessions.find((value) => value.id === session.id);
      if (!saved) throw new Error("The saved model controls could not be reloaded. Reconnect before another selection; no substitute model was chosen.");
      revision.current = result.revision!;
      setWindow(saved.controls.modelOptions?.contextWindow?.toString() ?? "");
      setEffort(saved.controls.modelOptions?.thinkingEffort ?? "");
      onModelSelected();
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
    if (turnActive) return queue("kupo-mode", mode);
    setSaving(true); onSaving(true); setError(""); onError("");
    try { const result = await sdk.sessions.kupoMode(session.id, mode, revision.current); revision.current = result.revision!; setSubmenu(null); }
    catch (error) { const message = error instanceof Error ? error.message : "The original Kupo mode was not saved. No model or effort was substituted."; setError(message); onError(message); }
    finally { setSaving(false); onSaving(false); }
  };
  const locked = saving || pending;
  const effortChoices: Array<ThinkingEffort | ""> = ["", ...thinkingLevels];
  return <>{isModelDiscoveryPending(snapshot.provider) ? <p role="status">Refreshing current model availability. Cached labels do not enable a model call.</p> :
    snapshot.provider.status !== "connected" && <><p>Connect GitHub Copilot or configure a local model to use Kupo.</p><button type="button" onClick={onConnect}>Connect Copilot</button></>}
    {cachedModels.length > 0 && <details><summary>Last known models and thinking efforts</summary>
      <p>Display only. Current model and effort controls below use live qualified options.</p>
      <ul>{cachedModels.map((model) => <li key={model.id}>{model.name}: {model.thinkingLevels.length ? model.thinkingLevels.map(effortLabel).join(", ") : "no declared thinking effort"}</li>)}</ul>
    </details>}
    <ModelSubmenu label="Choose model" text="Model" value={current?.name ?? "Select model"} open={submenu === "models"} disabled={locked}
      toggle={() => setSubmenu(submenu === "models" ? null : "models")} close={() => setSubmenu(null)}>
      <input className="composer-model-search" aria-label="Search models" placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="composer-model-list">{snapshot.provider.models.filter((model) => (model.synthetic || !model.environments || model.environments.includes(session.controls.env)) && model.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(Boolean(b.synthetic)) - Number(Boolean(a.synthetic))).map((model) => {
      const unavailable = Boolean(model.environments && !model.environments.includes(session.controls.env));
      const description = model.synthetic ? unavailable ? `Unavailable in ${envLabel(session.controls.env)}. ${snapshot.routingDiagnostics?.join(" ") ?? ""}` :
        snapshot.settings.values.kupo.workflow === "auto" ? "Automatic Single / Cascade / Critique / Council using configured models; every role is metered" :
          snapshot.settings.values.kupo.workflow === "compound" ? "Moguri / separately metered classifier, proposal and conditional roles" : "Moguri / separately metered router and solver" :
        model.source === "claude-agent" ? "Runs your installed Claude Code / Local / every tool needs Moguri approval" :
        model.source === "codex-agent" ? "Runs your installed Codex / Local / commands and edits need Moguri approval" :
        model.source === "hosted" && model.providerId === "chatgpt" ? `Using ChatGPT plan / ${compact(model.contextWindow)} maximum context` :
        `${model.source === "local" ? model.providerId : model.source === "hosted" ? hostedProvider(model.providerId ?? "")?.name ?? model.providerId : "GitHub Copilot"} / ${compact(model.contextWindow)} maximum context`;
      const disabled = locked || dirty || unavailable || requiresImages && !model.imageInput;
      return <div className="model-choice-row" key={model.id}><button type="button" role="menuitemradio" className="composer-menu-option" aria-checked={model.id === session.controls.modelId}
        aria-disabled={disabled} onClick={() => { if (!disabled) { setSubmenu(null); void select(model); } }}>
        <Icon name={modelIcon(model)} /><span>{model.name}<small>{unavailable ? "Unavailable" : description}</small></span>{model.id === session.controls.modelId && <Icon name="Check" />}</button>
        {unavailable && (model.synthetic ? <PolicyHint label="Why Kupo is unavailable" target="kupo" navigationBlocked={dirty || saving || pending ? "Save or reload your model setting edit before opening Kupo settings." : undefined}>{description}</PolicyHint> :
          <InfoTip label={`Why ${model.name} is unavailable`}>{description}</InfoTip>)}
      </div>;
    })}</div>
    </ModelSubmenu>
    {current?.synthetic ? <ModelSubmenu label="Kupo routing preference" text="Routing" value={snapshot.settings.values.kupo.workflow !== "auto" ? "Retained explicit policy" : session.controls.kupoMode ? kupoModes.find((mode) => mode.id === session.controls.kupoMode)!.name : "Legacy / choose a preference"}
      open={submenu === "mode"} disabled={locked || snapshot.settings.values.kupo.workflow !== "auto"} toggle={() => setSubmenu(submenu === "mode" ? null : "mode")} close={() => setSubmenu(null)}>
      {!modeChoices.length && !modeError && <p role="status">Reading shared mode readiness...</p>}
      {kupoModes.map((mode) => {
        const choice = modeChoices.find((choice) => choice.mode === mode.id), unavailable = !choice?.available;
        return <div key={mode.id} className="model-choice-row"><button type="button" role="menuitemradio" className="composer-menu-option"
          aria-label={mode.name} aria-description={mode.description} aria-checked={session.controls.kupoMode === mode.id} aria-disabled={unavailable}
          onClick={() => { if (!unavailable) void chooseMode(mode.id); }}><span>{mode.name}<small>{mode.description}</small></span>{session.controls.kupoMode === mode.id && <Icon name="Check" />}</button>
          <InfoTip label={`About ${mode.name} readiness`}>{choice?.reason ?? (modeError || "Readiness is not yet known. No model was admitted.")}</InfoTip></div>;
      })}
      <p className="fine-print">Modes are routing preferences, not effort levels. Dynamic picks Savings, Balanced or Performance for each request. Kupo's classifier chooses supported thinking for each role. Context, metered budgets and normal permissions still apply.</p>
      {modeError && <Alert as="p" className="inline-error" role="alert">{modeError}</Alert>}
    </ModelSubmenu> : <ModelSubmenu label="Thinking effort" text="Effort" value={current?.thinkingLevels?.length || staleEffort ? effortLabel(effort) : "Provider controlled"}
      open={submenu === "effort"} disabled={locked || !current?.thinkingLevels?.length && !staleEffort} toggle={() => setSubmenu(submenu === "effort" ? null : "effort")} close={() => setSubmenu(null)}>
      {effortChoices.map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={effort === value}
        onClick={() => { if (turnActive) { void queue("effort", value || "default"); return; } setEffort(value); setSubmenu(null); void save({ ...(window ? { contextWindow: Number(window) } : {}), ...(value ? { thinkingEffort: value } : {}) }, true); }}>
        <span>{effortLabel(value)}</span>{effort === value && <Icon name="Check" />}</button>)}
    </ModelSubmenu>}
    {current?.synthetic && <p className="fine-print">Thinking is automatic: Kupo's classifier selects each role's supported effort.</p>}
    {session.controls.preferredThinkingEffort !== undefined && <p className="fine-print" role="status">
      {effortLabel(session.controls.preferredThinkingEffort)} fixed-model preference retained. {current?.synthetic ? "Kupo's classifier manages each role's effort instead." :
        !current ? "Select a model to apply this preference." : effort ? `Using ${effortLabel(effort)} for this model; the original preference returns on a supporting model.` :
          "This model has no adjustable thinking; the preference returns on a supporting model."}
    </p>}
    <ModelSubmenu label="Working context window" text="Context window" value={window ? compact(Number(window)) : windows?.values[0] ? current?.synthetic ? `Up to ${compact(windows.values[0])}` : compact(windows.values[0]) : current?.synthetic ? "Managed by Kupo" : "Not selected"}
      open={submenu === "context"} disabled={locked || !windows?.values.length} toggle={() => setSubmenu(submenu === "context" ? null : "context")} close={() => setSubmenu(null)}>
      {[null, ...contextChoices].map((value) => <button key={value ?? "default"} type="button" role="menuitemradio" aria-checked={window === (value?.toString() ?? "")}
        onClick={() => {
          if (turnActive) { void (value ? queue("context-window", String(value)) : queue("model-settings", JSON.stringify(effort ? { thinkingEffort: effort } : {}))); return; }
          setWindow(value?.toString() ?? ""); setSubmenu(null); void save({ ...(value ? { contextWindow: value } : {}), ...(effort ? { thinkingEffort: effort } : {}) });
        }}>
        <span>{value === null ? "Model default" : `${count(value)} tokens`}</span>{window === (value?.toString() ?? "") && <Icon name="Check" />}</button>)}
      {current?.synthetic && <p className="fine-print">Model default lets each request use any eligible model whose own qualified window fits it. A ceiling narrows Kupo to models that support it; history and attachments are never truncated.</p>}
    </ModelSubmenu>
    {current?.synthetic && poolControls && !poolControls.available && <Alert as="p" className="inline-error" role="alert">{poolControls.diagnostic}
      {effort ? <button type="button" disabled={locked} onClick={() => {
        if (turnActive) { void queue("model-settings", JSON.stringify(window ? { contextWindow: Number(window) } : {})); return; }
        setEffort(""); void save(window ? { contextWindow: Number(window) } : {});
      }}>Use automatic thinking</button> : Object.keys(session.controls.modelOptions ?? {}).length > 0 && <button type="button" disabled={locked} onClick={() => {
        if (turnActive) { void queue("model-settings", "{}"); return; }
        setWindow(""); setEffort(""); void save({});
      }}>Clear pooled overrides</button>}
    </Alert>}
    <details className="model-tuning" onToggle={(event) => setDetailsOpen(event.currentTarget.open)}><summary>Model details and setup</summary>
      <p>Only qualified model options are offered. Counts are estimates; overfull context stops without truncating history. Kupo binds tuning to each actual approved role.</p>
      <ModelEvidencePanel sdk={sdk} model={current} scope={JSON.stringify([sdk.profileId, session.id, session.controls.env, current?.id])} remote={session.controls.env === "Remote"} />
      {detailsOpen && readinessModels.length > 0 && <div className="setting-field">
        <label htmlFor={inspectionControlId}>Inspect configured model without selecting it</label>
        <select id={inspectionControlId} value={inspectedId} onChange={(event) => setInspectionId(event.target.value)}>
          <option value="">Choose an exact configured model for inspection</option>
          {readinessModels.map((model) => <option key={model.id} value={model.id}>{model.name} / {model.providerId}</option>)}
        </select>
      </div>}
      {detailsOpen && inspectedModel && <Suspense fallback={<p role="status">Loading runtime-readiness controls...</p>}>
        <ModelReadinessView sdk={sdk} session={session} model={inspectedModel} snapshot={snapshot} />
      </Suspense>}
      {detailsOpen && inspectedId && !inspectedModel && <Alert as="p" className="inline-error" role="alert">This exact inspection choice is no longer configured for this execution machine. Choose explicitly; no model or machine was substituted.</Alert>}
      <button className="quiet" type="button" disabled={saving || pending} onClick={onContext}>Review context and compactions</button><button className="quiet" type="button" onClick={onLocalModels}>Configure local models</button><button className="quiet" type="button" onClick={onRouting}>{snapshot.settings.values.kupo.workflow === "auto" ? "Kupo settings" : snapshot.settings.values.kupo.workflow === "compound" ? "kupo Compound settings" : "kupo Single settings"}</button>
    </details>
      {turnActive && <p className="fine-print">A turn is running: changes are queued as commands and apply after it.</p>}
      {queued && <p className="fine-print" role="status">{queued}</p>}
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
