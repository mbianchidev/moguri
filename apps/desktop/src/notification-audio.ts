import { audioFromBase64, validateNotificationWav } from "../../../packages/sdk/src/index.ts";

export class NotificationAudio {
  private generation = 0;
  private owned?: { context: AudioContext; source: AudioBufferSourceNode; started: boolean };
  private cleaning?: Promise<void>;
  constructor(private readonly failed: (error: unknown) => void) {}
  async play(audio: string): Promise<void> {
    const generation = ++this.generation;
    await this.stopOwned();
    if (generation !== this.generation) return;
    const bytes = audioFromBase64(audio), wave = validateNotificationWav(bytes);
    const context = new AudioContext({ sampleRate: wave.sampleRate });
    const buffer = context.createBuffer(1, wave.samples, wave.sampleRate), channel = buffer.getChannelData(0);
    const values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < wave.samples; i++) channel[i] = values.getInt16(44 + i * 2, true) / 32768;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
    const owned = { context, source, started: false }; this.owned = owned;
    source.onended = () => { if (this.owned === owned) void this.close().catch(this.failed); };
    try {
      await context.resume();
      if (generation !== this.generation || this.owned !== owned) return;
      source.start(); owned.started = true;
    } catch (error) {
      if (generation !== this.generation) return;
      try { if (this.owned === owned) await this.close(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Notification sound failed and audio cleanup is unconfirmed."); }
      throw error;
    }
  }
  async close(): Promise<void> {
    ++this.generation; await this.stopOwned();
  }
  private async stopOwned(): Promise<void> {
    if (this.cleaning) await this.cleaning;
    const owned = this.owned;
    if (!owned) return;
    this.cleaning = (async () => {
      owned.source.onended = null;
      try { if (owned.started) { owned.source.stop(); owned.started = false; } }
      finally { owned.source.disconnect(); if (owned.context.state !== "closed") await owned.context.close(); }
      if (this.owned === owned) this.owned = undefined;
    })();
    try { await this.cleaning; } finally { this.cleaning = undefined; }
  }
}
