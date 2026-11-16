import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseShortcut, shortcutMatches, shortcutModifiersHeld, voiceShortcutMode, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { captureBrowserAudio, prepareBrowserAudio, prepareBrowserMicrophone, type BrowserAudioPreparation, type BrowserMicrophonePreparation } from "./browser-audio.ts";
import { SpeechCaptureController } from "./dictation.ts";

export function useDictation(sdk: MoguriSdk, session: Session | undefined, snapshot: Snapshot, options: {
  shortcuts?: boolean; globalShortcut?: boolean; active?: boolean; beforeStart?: () => void | Promise<void>;
  onTranscript?: (text: string, jobId: string, final: boolean) => void;
} = {}) {
  const before = useRef(options.beforeStart); before.current = options.beforeStart;
  const transcript = useRef(options.onTranscript); transcript.current = options.onTranscript;
  const sessionId = session?.id;
  const standby = useRef<BrowserMicrophonePreparation | undefined>(undefined);
  const standbyPending = useRef<Promise<BrowserMicrophonePreparation | undefined> | undefined>(undefined);
  const [standbyReady, setStandbyReady] = useState(false), [preparationError, setPreparationError] = useState("");
  const [readinessDiagnostic, setReadinessDiagnostic] = useState<string | null>(null), [modelChanged, setModelChanged] = useState(false);
  const [readiness, setReadiness] = useState<{ sdk: MoguriSdk; key: string; ready: boolean } | null>(null);
  const driver = useMemo(() => {
    const id = () => { if (!sessionId) throw new Error("Choose an actual chat before dictating. No hidden session was created."); return sessionId; };
    let preparation: BrowserAudioPreparation | undefined, warmed: BrowserAudioPreparation | undefined;
    const warm = () => { if (!warmed || warmed.context.state === "closed") warmed = prepareBrowserAudio(new AbortController().signal); };
    const controller = new SpeechCaptureController({
      begin: async (signal) => {
        signal.throwIfAborted();
        preparation = warmed ?? prepareBrowserAudio(signal); warmed = undefined;
        preparation.claim(signal);
        const resumed = preparation.context.resume();
        await Promise.all([resumed, Promise.resolve().then(() => before.current?.())]); signal.throwIfAborted();
        return sdk.voice.startCapture(id(), undefined, { streaming: true });
      },
      acquire: async (lease, device, signal, failed, received) => {
        const microphone = standby.current ?? await standbyPending.current;
        if (signal.aborted) { await microphone?.close(); signal.throwIfAborted(); }
        if (standby.current === microphone) standby.current = undefined;
        setStandbyReady(false);
        return captureBrowserAudio(sdk.profileId, id(), lease, device, signal, failed, received, preparation, microphone);
      },
      upload: (lease, bytes) => sdk.voice.uploadCapture(id(), lease.id, lease.token, bytes),
      cancel: (lease) => sdk.voice.cancelCapture(id(), lease.id, lease.token),
      append: (lease, sequence, bytes) => sdk.voice.appendCapture(id(), lease.id, lease.token, sequence, bytes),
      read: (lease) => sdk.voice.readCapture(id(), lease.id, lease.token),
      finishStream: async (lease, sequence) => {
        await sdk.voice.finishCapture(id(), lease.id, lease.token, sequence);
        // Includes cold startup within the original 210-second service capture lease.
        const job = await sdk.jobs.wait(lease.id, { timeoutMs: 220_000 });
        if (job.status !== "completed") throw new Error(job.error ?? `Local dictation ${job.status}. Words already inserted in the draft were preserved.`);
        return sdk.voice.transcript(id(), lease.id);
      },
      changed: (lease, text, final) => transcript.current?.(text, lease.id, final),
    });
    return { controller, warm, close: () => { const original = warmed; warmed = undefined; return original?.close(); } };
  }, [sdk, sessionId]);
  const controller = driver.controller;
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const job = snapshot.jobs.find((job) => job.id === state.id);
  const start = useCallback((gesture?: symbol) => controller.start(snapshot.settings.values.voice.inputDeviceId ?? "default", gesture), [controller, snapshot.settings.values.voice.inputDeviceId]);
  const finish = useCallback((gesture?: symbol) => controller.finish(gesture), [controller]);
  const cancel = useCallback((reason?: string, gesture?: symbol) => controller.cancel(reason, gesture), [controller]);
  const toggle = useCallback(() => {
    const current = controller.getState();
    if (current.cleanupPending) return;
    if (current.phase === "idle" || current.phase === "failed") return start();
    if (current.phase === "starting" || current.phase === "recording") return finish();
  }, [controller, start, finish]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { if (job) controller.observe(job.id, job.status, job.error); }, [controller, job?.id, job?.status, job?.error]);
  useEffect(() => { if (options.active === false) void cancel(); }, [options.active, cancel]);
  useEffect(() => {
    const stop = () => { void cancel("Local dictation was interrupted by a profile change or sleep. Raw audio was discarded; words already inserted in the draft were preserved."); };
    const blur = () => {
      const phase = controller.getState().phase;
      if (phase === "recording" || phase === "starting") void cancel("Local recording stopped when Moguri lost focus. Words already inserted in the draft were preserved.");
    };
    const hidden = () => {
      const phase = controller.getState().phase;
      if (document.visibilityState === "hidden" && (phase === "starting" || phase === "recording")) void cancel("Local recording stopped when Moguri was hidden. Words already inserted in the draft were preserved.");
    };
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", hidden);
    const off = window.moguri.onAudioStop(stop);
    return () => { off(); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hidden); };
  }, [controller, cancel]);
  const voiceEnabled = snapshot.settings.values.voice.enabled !== false;
  const connected = sdk.getState().status === "connected", enabled = options.shortcuts && options.active !== false && voiceEnabled;
  const shortcut = snapshot.settings.values.voice.shortcut ?? "Control+Space";
  const pushToTalk = voiceShortcutMode(snapshot.settings.values.voice) === "hold";
  const lifecycle = snapshot.jobs.findLast((job) => ["voice.download", "voice.disable"].includes(job.kind));
  const selectedModel = snapshot.settings.values.voice.model;
  const readinessKey = JSON.stringify([snapshot.settings.values.voice.backend, lifecycle?.id, lifecycle?.status, selectedModel?.sha256, selectedModel?.trustedAt]);
  useEffect(() => {
    if (voiceEnabled && connected && options.active !== false && sessionId && readiness?.sdk === sdk && readiness.key === readinessKey &&
      readiness.ready && ["idle", "failed"].includes(state.phase)) driver.warm();
    return () => { void driver.close()?.catch((error: unknown) => console.error("Original audio warm-up cleanup failed:", error instanceof Error ? error.message : "unconfirmed graph cleanup")); };
  }, [driver, connected, options.active, sessionId, state.phase, voiceEnabled, sdk, readiness, readinessKey]);
  useEffect(() => { if (!voiceEnabled) void cancel("Voice dictation was disabled. Raw audio was discarded; inserted words were preserved."); }, [voiceEnabled, cancel]);
  useEffect(() => { if (!connected) void cancel("The original control plane disconnected. Microphone capture stopped; inserted words were preserved."); }, [connected, cancel]);
  useEffect(() => {
    if (!voiceEnabled || !connected || options.active === false || lifecycle?.kind === "voice.download" && lifecycle.status !== "completed") return;
    let current = true;
    setPreparationError("");
    setReadiness({ sdk, key: readinessKey, ready: false });
    void sdk.voice.status().then(async ({ voice }) => {
      if (!current) return;
      setReadiness({ sdk, key: readinessKey, ready: voice.runtimeReady && voice.modelReady });
      if (!voice.runtimeReady || !voice.modelReady) { setReadinessDiagnostic(voice.diagnostic); return; }
      setReadinessDiagnostic(null);
      const result = await sdk.voice.prepare();
      if (!result.id) return;
      const job = await sdk.jobs.wait(result.id, { timeoutMs: 180_000 });
      if (job.status !== "completed") throw new Error(job.error ?? `Local recognizer preparation ${job.status}. No microphone or cloud fallback was used.`);
    }).catch((error: unknown) => { if (current) setPreparationError(error instanceof Error ? error.message : "Local recognizer preparation failed. No cloud fallback."); });
    return () => { current = false; };
  }, [sdk, voiceEnabled, connected, options.active, snapshot.settings.values.voice.backend, lifecycle?.id, lifecycle?.status, selectedModel?.sha256, selectedModel?.trustedAt]);
  const failedVoice = snapshot.jobs.filter((job) => ["voice.prepare", "voice.capture", "voice.record", "voice.transcribe"].includes(job.kind) && job.status === "failed").length;
  useEffect(() => {
    if (!voiceEnabled || !connected || !selectedModel) { setModelChanged(false); return; }
    let current = true;
    void sdk.voice.status().then(({ voice }) => { if (current) setModelChanged(voice.model?.trust === "changed"); },
      (error: unknown) => console.error("Voice model trust status is unavailable:", error instanceof Error ? error.message : "status query failed"));
    return () => { current = false; };
  }, [sdk, voiceEnabled, connected, selectedModel?.sha256, selectedModel?.trustedAt, failedVoice]);
  useEffect(() => {
    if (!voiceEnabled || !connected || !snapshot.settings.values.voice.standby || !sessionId || options.active === false) return;
    let preparing: AbortController | undefined, disposed = false;
    const release = () => {
      preparing?.abort(); preparing = undefined;
      standbyPending.current = undefined;
      const original = standby.current; standby.current = undefined; setStandbyReady(false);
      void original?.close().catch((error: unknown) => console.error("Original standby microphone closure failed:", error instanceof Error ? error.message : "unconfirmed cleanup"));
    };
    const focus = () => {
      const owner = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-composer-session]")?.dataset.composerSession : undefined;
      if (disposed || owner !== sessionId || !document.hasFocus() || document.visibilityState === "hidden" || !["idle", "failed"].includes(controller.getState().phase)) { release(); return; }
      if (preparing || standby.current) return;
      const request = new AbortController(); preparing = request;
      const promise = prepareBrowserMicrophone(sdk.profileId, sessionId, snapshot.settings.values.voice.inputDeviceId ?? "default", request.signal);
      standbyPending.current = promise;
      void promise.then(async (microphone) => {
        if (disposed || preparing !== request || request.signal.aborted) { await microphone?.close(); return; }
        standby.current = microphone; preparing = undefined; standbyPending.current = undefined; setStandbyReady(Boolean(microphone));
      }).catch((error: unknown) => { if (standbyPending.current === promise) standbyPending.current = undefined; if (!request.signal.aborted && !disposed) setPreparationError(error instanceof Error ? error.message : "Standby microphone unavailable. No device was substituted."); });
    };
    document.addEventListener("focusin", focus); window.addEventListener("focus", focus); window.addEventListener("blur", release);
    const off = window.moguri.onAudioStop(release);
    const changed = controller.subscribe(() => { if (["idle", "failed"].includes(controller.getState().phase)) queueMicrotask(focus); });
    focus();
    return () => { disposed = true; off(); changed(); document.removeEventListener("focusin", focus); window.removeEventListener("focus", focus); window.removeEventListener("blur", release); release(); };
  }, [sdk, sessionId, voiceEnabled, connected, snapshot.settings.values.voice.standby, snapshot.settings.values.voice.inputDeviceId, options.active, controller]);
  useEffect(() => {
    if (!enabled) return;
    let held: symbol | undefined;
    const binding = parseShortcut(shortcut);
    const down = (event: KeyboardEvent) => {
      const composer = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-composer-session]") : null;
      if (event.defaultPrevented || event.isComposing || !connected || session?.status === "archived" ||
        !composer && !options.globalShortcut ||
        composer && composer.dataset.composerSession !== sessionId ||
        event.target instanceof Element && event.target.closest(".ghostty-host, dialog, [popover], .shortcut-field") ||
        !shortcutMatches(event, shortcut)) return;
      event.preventDefault(); if (event.repeat) return;
      const state = controller.getState();
      if (state.cleanupPending) return;
      if (!pushToTalk) { void toggle(); return; }
      if (held || state.phase !== "idle" && state.phase !== "failed") return;
      held = Symbol("voice shortcut"); void start(held);
    };
    const up = (event: KeyboardEvent) => {
      if (!held || !binding || event.code !== binding.code && shortcutModifiersHeld(event, binding)) return;
      const gesture = held; held = undefined; void finish(gesture);
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); if (held) void cancel("The voice shortcut was interrupted before release. Raw audio was discarded; inserted words were preserved.", held); };
  }, [enabled, connected, session?.status, sessionId, controller, shortcut, pushToTalk, options.globalShortcut, start, finish, cancel, toggle]);
  return { state, start, finish, cancel, toggle, standbyReady, preparationError, readinessDiagnostic, modelChanged };
}

export function useDictationTranscript(sdk: MoguriSdk, sessionId: string | undefined, jobId: string | undefined) {
  const [result, setResult] = useState<{ sdk: MoguriSdk; sessionId: string; id: string; text: string; error: string } | null>(null);
  useEffect(() => {
    let current = true;
    if (sessionId && jobId) void sdk.voice.transcript(sessionId, jobId).then(
      (text) => { if (current) setResult({ sdk, sessionId, id: jobId, text, error: "" }); },
      (error: unknown) => { if (current) setResult({ sdk, sessionId, id: jobId, text: "", error: error instanceof Error ? error.message : "The local transcript could not be read. Your draft is unchanged." }); },
    );
    return () => { current = false; };
  }, [sdk, sessionId, jobId]);
  return result?.sdk === sdk && result.sessionId === sessionId && result.id === jobId ? result : null;
}
