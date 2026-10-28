import assert from "node:assert/strict";
import test from "node:test";
import { SpeechCaptureController, type CaptureLease } from "../apps/desktop/src/dictation.ts";
import { validateSpeechWav } from "../packages/protocol/src/audio.ts";

test("push-to-talk release before service admission never opens a late microphone or uploads audio", async () => {
  const admitted = Promise.withResolvers<CaptureLease>();
  let opened = 0, uploaded = 0;
  const cancelled: string[] = [];
  const controller = new SpeechCaptureController({
    begin: () => admitted.promise,
    acquire: async () => { opened++; return { finish: async () => new Float32Array(160), discard: async () => {} }; },
    upload: async () => { uploaded++; },
    cancel: async (lease) => { cancelled.push(lease.id); },
  });
  const starting = controller.start("generated-device");
  await controller.finish();
  admitted.resolve({ id: "generated-original-capture", token: "generated-private-lease" });
  await starting;
  assert.equal(opened, 0); assert.equal(uploaded, 0);
  assert.deepEqual(cancelled, ["generated-original-capture"]);
  assert.equal(controller.getState().phase, "idle");
  assert.match(controller.getState().error ?? "", /before.*ready/i);
});

test("a late media stream is discarded after release, while its original lease is cancelled once", async () => {
    const media = Promise.withResolvers<{ finish: () => Promise<Float32Array>; discard: () => Promise<void> }>();
    let opened = false, discarded = 0, cancelled = 0, uploaded = 0;
    const controller = new SpeechCaptureController({
      begin: async () => ({ id: "generated-late-stream", token: "generated-lease" }),
      acquire: async () => { opened = true; return media.promise; },
      cancel: async () => { cancelled++; }, upload: async () => { uploaded++; },
    });
    const starting = controller.start("generated-exact-device");
    await Promise.resolve(); assert.equal(opened, true);
    await controller.finish();
    media.resolve({ finish: async () => new Float32Array(16), discard: async () => { discarded++; } });
    await starting;
    assert.equal(discarded, 1); assert.equal(cancelled, 1); assert.equal(uploaded, 0);
});

test("repeated finalization uploads one actual normalized WAV and never sends chat text", async () => {
    let finishes = 0, uploads = 0, cancels = 0, selected = "";
    const controller = new SpeechCaptureController({
      begin: async () => ({ id: "generated-real-clip", token: "generated-original-lease" }),
      acquire: async (_lease, device) => {
        selected = device;
        return { finish: async () => { finishes++; return new Float32Array(1600).fill(0.1); }, discard: async () => {} };
      },
      upload: async (lease, bytes) => { assert.equal(lease.id, "generated-real-clip"); assert.equal(validateSpeechWav(bytes).durationMs, 100); uploads++; },
      cancel: async () => { cancels++; },
    });

    await controller.start("generated-exact-device"); assert.equal(controller.getState().phase, "recording");
    await Promise.all([controller.finish(), controller.finish()]);
    assert.equal(selected, "generated-exact-device"); assert.equal(finishes, 1); assert.equal(uploads, 1);
    controller.observe("generated-real-clip", "completed", null);
    assert.equal(controller.getState().phase, "idle"); assert.equal(cancels, 0);
    controller.dispose();
});

test("failed cancellation retains the exact original lease for explicit discard retry and prevents another microphone", async () => {
  let starts = 0, cancellations = 0;
  const controller = new SpeechCaptureController({
    begin: async () => { starts++; return { id: "generated-owned-cleanup", token: "generated-private-cleanup-lease" }; },
    acquire: async () => ({ finish: async () => new Float32Array(160), discard: async () => {} }),
    upload: async () => { throw new Error("Generated cancelled capture must never upload."); },
    cancel: async (lease) => { assert.equal(lease.id, "generated-owned-cleanup"); if (++cancellations === 1) throw new Error("Generated cancellation transport failure"); },
  });
  await controller.start(); await controller.cancel();
  assert.equal(controller.getState().phase, "failed");
  assert.equal(controller.getState().id, "generated-owned-cleanup");
  await assert.rejects(() => controller.start(), /discard|capture/i);
  assert.equal(starts, 1);
  await controller.cancel();
  assert.equal(cancellations, 2); assert.equal(controller.getState().phase, "idle");
  controller.dispose();
});

test("external cancellation is visible rather than silently returning to idle without a transcript", async () => {
  const controller = new SpeechCaptureController({
    begin: async () => ({ id: "generated-external-stop", token: "generated-private-lease" }),
    acquire: async () => ({ finish: async () => new Float32Array(160), discard: async () => {} }),
    upload: async () => {}, cancel: async () => {},
  });
  await controller.start(); await controller.finish();
  controller.observe("generated-external-stop", "cancelled", "Generated original dictation was cancelled.");
  assert.match(controller.getState().error ?? "", /cancelled/i);
  controller.dispose();
});

test("streaming captures deliver partial text while held and finish once even when the job event beats its final reply", async () => {
  let audio: ((samples: Float32Array) => void) | undefined, appends = 0, finishes = 0;
  const partial = Promise.withResolvers<void>(), updates: Array<{ text: string; final: boolean }> = [];
  const controller = new SpeechCaptureController({
    begin: async () => ({ id: "generated-live-capture", token: "generated-live-lease" }),
    acquire: async (_lease, _device, _signal, _failed, received) => {
      audio = received;
      return { finish: async () => new Float32Array(), discard: async () => {} };
    },
    upload: async () => { throw new Error("Streaming must not upload another batch WAV."); },
    append: async (_lease, sequence, bytes) => { appends++; assert.equal(sequence, appends); assert.equal(bytes.length, 3200); },
    read: async () => ({ text: appends ? "Generated partial" : "", revision: appends }),
    finishStream: async () => { finishes++; controller.observe("generated-live-capture", "completed", null); return "Generated final."; },
    changed: (_lease, text, final) => { updates.push({ text, final }); if (!final && text) partial.resolve(); },
    cancel: async () => {},
  });
  try {
    await controller.start(); assert.equal(typeof audio, "function");
    audio!(new Float32Array(1600).fill(0.1));
    await partial.promise;
    assert.equal(controller.getState().phase, "recording");
    assert.ok(updates.some((value) => value.text === "Generated partial" && !value.final));
    await Promise.all([controller.finish(), controller.finish()]);
    assert.equal(appends, 1); assert.equal(finishes, 1);
    assert.deepEqual(updates.at(-1), { text: "Generated final.", final: true });
    assert.equal(controller.getState().phase, "idle");
  } finally { controller.dispose(); }
});

test("a stale poll rejection cannot cancel the original buffer while its final receipt is pending", async () => {
  const poll = Promise.withResolvers<{ text: string; revision: number }>(), final = Promise.withResolvers<string>();
  const updates: Array<{ text: string; final: boolean }> = [];
  let finishing = false, cancellations = 0;
  const controller = new SpeechCaptureController({
    begin: async () => ({ id: "generated-final-owner", token: "generated-final-lease" }),
    acquire: async () => ({ finish: async () => new Float32Array(), discard: async () => {} }),
    upload: async () => { throw new Error("No replay into a batch upload."); },
    append: async () => {}, read: () => poll.promise,
    finishStream: async () => { finishing = true; return final.promise; },
    changed: (_lease, text, final) => updates.push({ text, final }),
    cancel: async () => { cancellations++; },
  });
  try {
    await controller.start(); const completing = controller.finish();
    while (!finishing) await new Promise((resolve) => setTimeout(resolve, 1));
    poll.reject(new Error("Generated stale capture poll."));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controller.getState().phase, "transcribing"); assert.equal(cancellations, 0);
    final.resolve("Generated original final transcript."); await completing;
    assert.deepEqual(updates, [{ text: "Generated original final transcript.", final: true }]);
    assert.equal(controller.getState().phase, "idle");
  } finally { final.resolve("Generated original final transcript."); controller.dispose(); }
});
