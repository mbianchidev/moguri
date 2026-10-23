class MoguriAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.position = 0;
    this.total = 0;
    this.ready = false;
    this.ended = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === "finish") {
        this.flush();
        this.ended = true;
        this.port.postMessage({ type: "done" });
      }
    };
  }
  flush() {
    if (!this.position) return;
    const samples = this.buffer.slice(0, this.position);
    this.port.postMessage({ type: "pcm", samples: samples.buffer }, [samples.buffer]);
    this.buffer.fill(0);
    this.position = 0;
  }
  process(inputs, outputs) {
    for (const channel of outputs[0] ?? []) channel.fill(0);
    if (this.ended) return false;
    const channels = inputs[0] ?? [], frames = channels[0]?.length ?? 0;
    for (let frame = 0; frame < frames; frame++) {
      let value = 0;
      for (const channel of channels) value += channel[frame] ?? 0;
      this.buffer[this.position++] = value / channels.length;
      this.total++;
      if (this.position === this.buffer.length) this.flush();
      if (this.total === 16000 * 120) {
        this.flush(); this.ended = true; this.port.postMessage({ type: "done" }); break;
      }
    }
    if (frames && !this.ready) { this.ready = true; this.port.postMessage({ type: "ready" }); }
    return !this.ended;
  }
}
registerProcessor("moguri-audio-capture", MoguriAudioCapture);
