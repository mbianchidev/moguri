import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { parseShortcut, shortcutMatches, shortcutModifiersHeld, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { captureBrowserAudio } from "./browser-audio.ts";
import { SpeechCaptureController } from "./dictation.ts";

export function useDictation(sdk: MoguriSdk, session: Session | undefined, snapshot: Snapshot, options: {
  shortcuts?: boolean; active?: boolean; beforeStart?: () => Promise<void>;
} = {}) {
  const before = useRef(options.beforeStart); before.current = options.beforeStart;
  const sessionId = session?.id;
  const controller = useMemo(() => {
    const id = () => { if (!sessionId) throw new Error("Choose an actual chat before dictating. No hidden session was created."); return sessionId; };
    return new SpeechCaptureController({
      begin: async (signal) => { await before.current?.(); signal.throwIfAborted(); return sdk.voice.startCapture(id()); },
      acquire: (lease, device, signal, failed) => captureBrowserAudio(sdk.profileId, id(), lease, device, signal, failed),
      upload: (lease, bytes) => sdk.voice.uploadCapture(id(), lease.id, lease.token, bytes),
      cancel: (lease) => sdk.voice.cancelCapture(id(), lease.id, lease.token),
    });
  }, [sdk, sessionId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const pushToTalk = snapshot.settings.values.voice.pushToTalk ?? false;
  const job = snapshot.jobs.find((job) => job.id === state.id);
  const start = useCallback(() => controller.start(snapshot.settings.values.voice.inputDeviceId ?? "default"), [controller, snapshot.settings.values.voice.inputDeviceId]);
  const finish = useCallback(() => controller.finish(), [controller]);
  const cancel = useCallback(() => controller.cancel(), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { if (job) controller.observe(job.id, job.status, job.error); }, [controller, job?.id, job?.status, job?.error]);
  useEffect(() => { if (options.active === false) void cancel(); }, [options.active, cancel]);
  useEffect(() => {
    const stop = () => { void cancel(); };
    const blur = () => { const phase = controller.getState().phase; if (phase === "recording" || pushToTalk && phase === "starting") stop(); };
    const hidden = () => { if (document.visibilityState === "hidden") stop(); };
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", hidden);
    const off = window.moguri.onAudioStop(stop);
    return () => { off(); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hidden); };
  }, [controller, cancel, pushToTalk]);
  const connected = sdk.getState().status === "connected", enabled = options.shortcuts && options.active !== false;
  const shortcut = snapshot.settings.values.voice.shortcut ?? "Control+Space";
  useEffect(() => {
    if (!enabled) return;
    let held = false;
    const binding = parseShortcut(shortcut);
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !connected || session?.status === "archived" ||
        event.target instanceof Element && event.target.closest(".ghostty-host, .side-chat-panel, dialog, [popover], .shortcut-field") ||
        !shortcutMatches(event, shortcut)) return;
      event.preventDefault(); if (event.repeat) return;
      const state = controller.getState();
      if (state.cleanupPending) return;
      if (pushToTalk) { if (held) return; held = true; if (state.phase === "idle" || state.phase === "failed") void start(); }
      else if (state.phase === "starting" || state.phase === "recording") void finish();
      else if (state.phase === "idle" || state.phase === "failed") void start();
    };
    const up = (event: KeyboardEvent) => {
      if (!held || !binding || event.code !== binding.code && shortcutModifiersHeld(event, binding)) return;
      held = false; void finish();
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); if (held) void cancel(); };
  }, [enabled, connected, session?.status, controller, shortcut, pushToTalk, start, finish, cancel]);
  return { state, start, finish, cancel };
}
