import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseShortcut, shortcutMatches, shortcutModifiersHeld, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { captureBrowserAudio } from "./browser-audio.ts";
import { SpeechCaptureController } from "./dictation.ts";

export function useDictation(sdk: MoguriSdk, session: Session | undefined, snapshot: Snapshot, options: {
  shortcuts?: boolean; active?: boolean; beforeStart?: () => Promise<void>;
  onTranscript?: (text: string, jobId: string, final: boolean) => void;
} = {}) {
  const before = useRef(options.beforeStart); before.current = options.beforeStart;
  const transcript = useRef(options.onTranscript); transcript.current = options.onTranscript;
  const sessionId = session?.id;
  const controller = useMemo(() => {
    const id = () => { if (!sessionId) throw new Error("Choose an actual chat before dictating. No hidden session was created."); return sessionId; };
    return new SpeechCaptureController({
      begin: async (signal) => { await before.current?.(); signal.throwIfAborted(); return sdk.voice.startCapture(id(), undefined, { streaming: true }); },
      acquire: (lease, device, signal, failed, received) => captureBrowserAudio(sdk.profileId, id(), lease, device, signal, failed, received),
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
  }, [sdk, sessionId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const job = snapshot.jobs.find((job) => job.id === state.id);
  const start = useCallback(() => controller.start(snapshot.settings.values.voice.inputDeviceId ?? "default"), [controller, snapshot.settings.values.voice.inputDeviceId]);
  const finish = useCallback(() => controller.finish(), [controller]);
  const cancel = useCallback((reason?: string) => controller.cancel(reason), [controller]);
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
  const connected = sdk.getState().status === "connected", enabled = options.shortcuts && options.active !== false;
  const shortcut = snapshot.settings.values.voice.shortcut ?? "Control+Space";
  useEffect(() => {
    if (!enabled) return;
    let held = false;
    const binding = parseShortcut(shortcut);
    const down = (event: KeyboardEvent) => {
      const composer = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-composer-session]") : null;
      if (event.defaultPrevented || event.isComposing || !connected || session?.status === "archived" ||
        composer && composer.dataset.composerSession !== sessionId ||
        event.target instanceof Element && event.target.closest(".ghostty-host, dialog, [popover], .shortcut-field") ||
        !shortcutMatches(event, shortcut)) return;
      event.preventDefault(); if (event.repeat) return;
      const state = controller.getState();
      if (state.cleanupPending) return;
      if (held || state.phase === "transcribing") return;
      held = true;
      if (state.phase === "idle" || state.phase === "failed") void start();
    };
    const up = (event: KeyboardEvent) => {
      if (!held || !binding || event.code !== binding.code && shortcutModifiersHeld(event, binding)) return;
      held = false; void finish();
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); if (held) void cancel("The voice shortcut was interrupted before release. Raw audio was discarded; inserted words were preserved."); };
  }, [enabled, connected, session?.status, sessionId, controller, shortcut, start, finish, cancel]);
  return { state, start, finish, cancel };
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
