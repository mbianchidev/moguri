import { isRecord, MAX_SPEECH_SAMPLES, SPEECH_SAMPLE_RATE } from "../../../packages/sdk/src/index.ts";
import type { CaptureLease, CaptureRecorder } from "./dictation.ts";

export interface MicrophoneChoice { id: string; label: string }
const active = (signal: AbortSignal) => signal.throwIfAborted();
const stopTracks = (stream: MediaStream | undefined) => { for (const track of stream?.getTracks() ?? []) track.stop(); };
export interface BrowserAudioPreparation {
  readonly signal: AbortSignal;
  readonly context: AudioContext;
  readonly ready: Promise<void>;
  close(): Promise<void>;
}
export function prepareBrowserAudio(signal: AbortSignal): BrowserAudioPreparation {
  active(signal);
  const context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE, latencyHint: "interactive" });
  let closing: Promise<void> | undefined;
  const close = () => {
    signal.removeEventListener("abort", abort);
    return closing ??= context.state === "closed" ? Promise.resolve() : context.close();
  };
  const abort = () => { void close().catch((error: unknown) => console.error("Prepared audio processor cleanup failed:", error instanceof Error ? error.message : "unconfirmed context cleanup")); };
  signal.addEventListener("abort", abort, { once: true });
  const ready = (async () => {
    if (context.sampleRate !== SPEECH_SAMPLE_RATE) throw new Error("The browser did not provide normalized 16-kHz audio. No WAV header was relabeled.");
    await context.audioWorklet.addModule(new URL("./audio-capture.worklet.js?no-inline", import.meta.url).href);
    active(signal);
  })();
  void ready.catch((error: unknown) => {
    if (!signal.aborted) console.error("Local audio processor preparation failed:", error instanceof Error ? error.message : "unavailable capture processor");
  });
  return { signal, context, ready, close };
}
export async function listMicrophones(profileId: string, signal: AbortSignal): Promise<MicrophoneChoice[]> {
  let permission: string | undefined, stream: MediaStream | undefined;
  try {
    active(signal); permission = await window.moguri.audioPermission({ profileId, purpose: "devices" }); active(signal);
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); active(signal);
    const devices = await navigator.mediaDevices.enumerateDevices(); active(signal);
    const inputs = devices.filter((device) => device.kind === "audioinput");
    if (inputs.length > 128) throw new Error("The audio engine returned more than 128 microphones. The list was not silently truncated.");
    return inputs.map((device, index) => ({ id: device.deviceId, label: device.label || `Microphone ${index + 1}` }));
  } finally { stopTracks(stream); if (permission) await window.moguri.releaseAudioPermission(permission); }
}

export async function captureBrowserAudio(profileId: string, sessionId: string, lease: CaptureLease, deviceId: string, signal: AbortSignal, failed: (error: Error) => void,
  received?: (samples: Float32Array) => void, preparation = prepareBrowserAudio(signal)): Promise<CaptureRecorder> {
  if (preparation.signal !== signal) throw new Error("The prepared audio processor belongs to another capture. No microphone or processing context was borrowed.");
  const context = preparation.context;
  let permission: string | undefined, stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined, node: AudioWorkletNode | undefined, mute: GainNode | undefined;
  let error: Error | null = null, ready = false, finished = false, stopped = false, finalizing: Promise<Float32Array> | undefined;
  const started = Promise.withResolvers<void>(), ended = Promise.withResolvers<void>(), chunks: Float32Array[] = [];
  let samples = 0, startup: ReturnType<typeof setTimeout> | undefined, finalization: ReturnType<typeof setTimeout> | undefined;
  const clearAudio = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0; samples = 0; };
  const close = async () => {
    stopped = true; clearTimeout(startup); clearTimeout(finalization);
    signal.removeEventListener("abort", abort);
    for (const track of stream?.getTracks() ?? []) track.removeEventListener("ended", disconnected);
    stopTracks(stream); source?.disconnect(); node?.disconnect(); mute?.disconnect(); node?.port.close();
    const id = permission; permission = undefined;
    await Promise.all([preparation.close(), id ? window.moguri.releaseAudioPermission(id) : undefined]);
  };
  const fail = (value: Error) => {
    if (error || stopped) return;
    error = value; started.resolve(); ended.resolve(); clearAudio();
    void close().catch((error: unknown) => console.error("Original audio hardware cleanup failed:", error instanceof Error ? error.message : "unconfirmed media cleanup"));
    failed(value);
  };
  const disconnected = () => fail(new Error("The selected microphone disconnected. No other input device was substituted."));
  const abort = () => {
    error ??= new DOMException("Original microphone capture cancelled. Raw audio was discarded.", "AbortError");
    started.resolve(); ended.resolve(); clearAudio();
    void close().catch((error: unknown) => console.error("Cancelled microphone cleanup failed:", error instanceof Error ? error.message : "unconfirmed media cleanup"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    active(signal); await preparation.ready; active(signal);
    node = new AudioWorkletNode(context, "moguri-audio-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.onprocessorerror = () => fail(new Error("The local PCM capture processor failed. Raw audio was discarded; no transcript was accepted."));
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (stopped || !isRecord(event.data)) return;
      if (event.data.type === "ready") { ready = true; clearTimeout(startup); started.resolve(); }
      else if (event.data.type === "done") { finished = true; ended.resolve(); }
      else if (event.data.type === "pcm") {
        if (!(event.data.samples instanceof ArrayBuffer) || event.data.samples.byteLength % 4) { fail(new Error("The local PCM capture returned an invalid sample frame.")); return; }
        const chunk = new Float32Array(event.data.samples);
        if (samples + chunk.length > MAX_SPEECH_SAMPLES) { fail(new Error("Capture exceeded its two-minute bound. No partial audio was silently truncated.")); return; }
        samples += chunk.length;
        if (received) received(chunk); else chunks.push(chunk);
      }
    };
    mute = context.createGain(); mute.gain.value = 0;
    node.connect(mute); mute.connect(context.destination);
    permission = await window.moguri.audioPermission({ profileId, sessionId, jobId: lease.id, purpose: "capture" }); active(signal);
    if (deviceId !== "default" && !navigator.mediaDevices.getSupportedConstraints().deviceId) throw new Error("This audio engine cannot enforce exact device selection. No default microphone was opened.");
    await context.resume(); active(signal);
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId === "default" ? {} : { deviceId: { exact: deviceId } }), channelCount: { ideal: 1 } }, video: false });
    active(signal);
    const tracks = stream.getAudioTracks();
    if (tracks.length !== 1 || stream.getVideoTracks().length || deviceId !== "default" && tracks[0]?.getSettings().deviceId !== deviceId) throw new Error("The audio stream did not match the exact selected microphone. No input was substituted.");
    for (const track of tracks) track.addEventListener("ended", disconnected, { once: true });
    source = context.createMediaStreamSource(stream);
    source.connect(node);
    startup = setTimeout(() => fail(new Error("No microphone PCM frames arrived within five seconds. Check the selected input and OS audio access.")), 5000);
    await window.moguri.releaseAudioPermission(permission); permission = undefined;
    await started.promise; active(signal);
    if (error || !ready) throw error ?? new Error("The local microphone never produced an audio frame.");
    return {
      finish: () => finalizing ??= (async () => {
        if (!finished) { node!.port.postMessage({ type: "finish" }); finalization = setTimeout(() => fail(new Error("The local audio processor did not acknowledge its original flush.")), 2000); }
        await ended.promise; active(signal);
        if (error) throw error;
        const result = new Float32Array(received ? 0 : samples);
        let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        await close(); clearAudio(); return result;
      })(),
      discard: async () => { abort(); await close(); },
    };
  } catch (error) { clearAudio(); await close(); throw error; }
}
