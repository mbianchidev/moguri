import { encodeSpeechPcm, encodeSpeechWav } from "../../../packages/sdk/src/index.ts";

export interface CaptureLease { id: string; token: string }
export interface CaptureRecorder { finish(): Promise<Float32Array>; discard(): Promise<void> }
export interface CapturePorts {
  begin(signal: AbortSignal): Promise<CaptureLease>;
  acquire(lease: CaptureLease, deviceId: string, signal: AbortSignal, failed: (error: Error) => void, received: (samples: Float32Array) => void): Promise<CaptureRecorder>;
  upload(lease: CaptureLease, bytes: Uint8Array): Promise<void>;
  cancel(lease: CaptureLease): Promise<void>;
  append?(lease: CaptureLease, sequence: number, bytes: Uint8Array): Promise<void>;
  read?(lease: CaptureLease): Promise<{ text: string; revision: number }>;
  finishStream?(lease: CaptureLease, sequence: number): Promise<string>;
  changed?(lease: CaptureLease, text: string, final: boolean): void;
}
interface Attempt {
  abort: AbortController; lease?: CaptureLease; recorder?: CaptureRecorder;
  discard?: Promise<void>; cancellation?: Promise<void>; finalizing?: Promise<void>;
  audio: Promise<void>; sequence: number; revision: number; reading?: boolean; text: string;
  observed?: { status: string; error: string | null };
}
export interface CaptureState { phase: "idle" | "starting" | "recording" | "transcribing" | "failed"; id: string | null; error: string | null; cleanupPending: boolean }

export class SpeechCaptureController {
  private state: CaptureState = { phase: "idle", id: null, error: null, cleanupPending: false };
  private readonly listeners = new Set<() => void>();
  private owner?: Attempt;
  private readonly cleanupOwners = new Set<Attempt>();
  private deadline?: ReturnType<typeof setTimeout>;
  private progress?: ReturnType<typeof setInterval>;
  private disposed = false;
  constructor(private readonly ports: CapturePorts) {
    const streaming = [ports.append, ports.read, ports.finishStream].filter(Boolean).length;
    if (streaming && streaming !== 3) throw new Error("Streaming capture needs its exact append, read and finish transport. No batch fallback is allowed.");
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(phase: CaptureState["phase"], error: string | null = null, id = this.owner?.lease?.id ?? null): void {
    this.state = { phase, id, error, cleanupPending: this.cleanupOwners.size > 0 }; for (const listener of this.listeners) listener();
  }
  private async cleanup(owner: Attempt, cancel = true): Promise<void> {
    this.cleanupOwners.add(owner);
    owner.abort.abort();
    if (owner.recorder) owner.discard ??= owner.recorder.discard().catch((error: unknown) => { owner.discard = undefined; throw error; });
    if (cancel && owner.lease) owner.cancellation ??= this.ports.cancel(owner.lease).catch((error: unknown) => { owner.cancellation = undefined; throw error; });
    const results = await Promise.allSettled([owner.discard, owner.cancellation]);
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, errors.map((error) => error instanceof Error ? error.message : "Original capture cleanup is unconfirmed.").join(" "));
    this.cleanupOwners.delete(owner);
  }
  private async failed(owner: Attempt, error: unknown): Promise<void> {
    let detail = error instanceof Error ? error.message : "Local capture failed. The saved draft is unchanged.";
    try { await this.cleanup(owner); }
    catch (error) { detail += ` Cleanup was not confirmed: ${error instanceof Error ? error.message : "inspect the original capture"}`; }
    if (this.owner === owner) { this.owner = undefined; clearTimeout(this.deadline); clearInterval(this.progress); this.publish("failed", detail, this.cleanupOwners.has(owner) ? owner.lease?.id ?? null : null); }
    else if (this.cleanupOwners.has(owner)) this.publish(this.owner ? this.state.phase : "failed", detail, this.owner?.lease?.id ?? owner.lease?.id ?? null);
  }
  private receive(owner: Attempt, samples: Float32Array): void {
    if (!this.ports.append) return;
    let bytes: Uint8Array;
    try { bytes = encodeSpeechPcm(samples); }
    catch (error) { void this.failed(owner, error); return; }
    finally { samples.fill(0); }
    const sequence = ++owner.sequence;
    owner.audio = owner.audio.then(async () => {
      try {
        if (this.owner !== owner || owner.abort.signal.aborted || !owner.lease) return;
        await this.ports.append!(owner.lease, sequence, bytes);
      } finally { bytes.fill(0); }
    }).catch(async (error: unknown) => { if (this.owner === owner && !owner.abort.signal.aborted) await this.failed(owner, error); });
  }
  private read(owner: Attempt): void {
    if (!this.ports.read || !owner.lease || owner.reading || this.owner !== owner || owner.abort.signal.aborted) return;
    owner.reading = true;
    void this.ports.read(owner.lease).then((value) => {
      if (this.owner !== owner || owner.abort.signal.aborted) return;
      if (value.revision < owner.revision || value.revision === owner.revision && value.text !== owner.text) throw new Error("The original streamed transcript changed its version. Existing composer text was preserved.");
      owner.revision = value.revision;
      if (value.text !== owner.text) { owner.text = value.text; this.ports.changed?.(owner.lease!, value.text, false); }
    }).catch(async (error: unknown) => { if (this.owner === owner && !owner.abort.signal.aborted) await this.failed(owner, error); })
      .finally(() => { owner.reading = false; });
  }
  async start(deviceId = "default"): Promise<void> {
    if (this.disposed || this.owner || this.cleanupOwners.size) throw new Error("Finish or confirm discard of the original capture before starting another microphone.");
    const owner: Attempt = { abort: new AbortController(), audio: Promise.resolve(), sequence: 0, revision: -1, text: "" };
    this.owner = owner; this.publish("starting");
    try {
      owner.lease = await this.ports.begin(owner.abort.signal);
      if (this.owner !== owner || owner.abort.signal.aborted) { await this.cleanup(owner); return; }
      this.publish("starting");
      owner.recorder = await this.ports.acquire(owner.lease, deviceId, owner.abort.signal, (error) => {
        void this.failed(owner, error).catch((error: unknown) => console.error("Original microphone cleanup failed:", error instanceof Error ? error.message : "unconfirmed capture cleanup"));
      }, (samples) => this.receive(owner, samples));
      if (this.owner !== owner || owner.abort.signal.aborted) { await this.cleanup(owner); return; }
      this.publish("recording");
      if (this.ports.read) { this.read(owner); this.progress = setInterval(() => this.read(owner), 250); }
      this.deadline = setTimeout(() => { void this.finish().catch((error: unknown) => console.error("Bounded microphone stop failed:", error instanceof Error ? error.message : "unconfirmed finalization")); }, 120_000);
    } catch (error) { await this.failed(owner, error); }
  }
  async finish(): Promise<void> {
    const owner = this.owner;
    if (!owner) return;
    if (this.state.phase === "starting") return this.cancel("Recording stopped before the microphone was ready. No audio was captured. Hold until Recording appears, then release to transcribe.");
    if (owner.finalizing) return owner.finalizing;
    const recorder = owner.recorder, lease = owner.lease;
    if (!recorder || !lease) return;
    clearTimeout(this.deadline); this.publish("transcribing");
    owner.finalizing = (async () => {
      let samples: Float32Array | undefined, bytes: Uint8Array | undefined;
      try {
        samples = await recorder.finish();
        if (this.owner !== owner || owner.abort.signal.aborted) { await this.cleanup(owner); return; }
        if (this.ports.finishStream) {
          await owner.audio;
          if (this.owner !== owner || owner.abort.signal.aborted) return;
          const text = await this.ports.finishStream(lease, owner.sequence);
          if (this.owner !== owner || owner.abort.signal.aborted) return;
          if (owner.observed && owner.observed.status !== "completed") throw new Error(owner.observed.error ?? `Original dictation ${owner.observed.status}. Inserted words were preserved.`);
          this.ports.changed?.(lease, text, true);
          await this.cleanup(owner, false);
          if (this.owner === owner) { this.owner = undefined; clearInterval(this.progress); this.publish("idle"); }
          return;
        }
        bytes = encodeSpeechWav(samples); samples.fill(0);
        await this.ports.upload(lease, bytes);
      } catch (error) { await this.failed(owner, error); }
      finally { samples?.fill(0); bytes?.fill(0); }
    })();
    return owner.finalizing;
  }
  async cancel(reason: string | null = null): Promise<void> {
    const owners = [...new Set([...(this.owner ? [this.owner] : []), ...this.cleanupOwners])];
    if (!owners.length) return;
    this.owner = undefined; clearTimeout(this.deadline); clearInterval(this.progress);
    const results = await Promise.allSettled(owners.map((owner) => this.cleanup(owner)));
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) {
      const message = errors.map((error) => error instanceof Error ? error.message : "Original capture cancellation is unconfirmed.").join(" ");
      console.error("Original capture cancellation was not confirmed:", message);
      if (!this.owner && !this.disposed) this.publish("failed", message, owners.find((owner) => this.cleanupOwners.has(owner))?.lease?.id ?? null);
    } else if (!this.owner) this.publish("idle", reason);
  }
  observe(id: string, status: string, error: string | null): void {
    const owner = this.owner;
    if (!owner || owner.lease?.id !== id || ["running", "waiting_input"].includes(status)) return;
    if (this.ports.finishStream && owner.finalizing) { owner.observed = { status, error }; return; }
    this.owner = undefined; clearTimeout(this.deadline); clearInterval(this.progress);
    this.publish(["failed", "partial"].includes(status) ? "failed" : "idle", status === "cancelled" ? error ?? "Local dictation was cancelled before a transcript was ready. Your draft is unchanged." : ["failed", "partial"].includes(status) ? error ?? "Local recognition did not complete." : null);
    void this.cleanup(owner, false).catch((error: unknown) => {
      console.error("Settled microphone cleanup was not confirmed:", error instanceof Error ? error.message : "original capture cleanup");
      if (!this.owner && !this.disposed) this.publish("failed", error instanceof Error ? error.message : "Original microphone cleanup is unconfirmed.", owner.lease?.id ?? null);
    });
  }
  dispose(): void { this.disposed = true; void this.cancel(); this.listeners.clear(); }
}
