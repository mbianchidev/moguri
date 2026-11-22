import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { audioBase64, defaultNotificationWav, encodeSpeechWav, MAX_NOTIFICATION_AUDIO_BYTES, validateNotificationWav } from "@moguri-dev/sdk";
import { loadNotificationSoundFile } from "@moguri-dev/sdk/node";
import { NotificationAudio } from "../apps/desktop/src/notification-audio.ts";

test("original generated defaults are distinct bounded PCM and file loading rejects links, malformed headers and excess duration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moguri-generated-sound-"));
  try {
    const needs = defaultNotificationWav("needs-input"), complete = defaultNotificationWav("completed");
    assert.notDeepEqual(needs, complete);
    assert.ok(validateNotificationWav(needs).durationMs < 1000);
    const exact = encodeSpeechWav(new Float32Array(160_000));
    assert.equal(exact.length, MAX_NOTIFICATION_AUDIO_BYTES); assert.equal(validateNotificationWav(exact).durationMs, 10_000);
    const path = join(directory, "Generated sound.wav"); await writeFile(path, exact);
    assert.deepEqual(await loadNotificationSoundFile(path), { name: "Generated sound", audio: audioBase64(exact) });
    const link = join(directory, "Generated link.wav"); await symlink(path, link);
    await assert.rejects(() => loadNotificationSoundFile(link), /link|ELOOP/i);
    await writeFile(path, encodeSpeechWav(new Float32Array(160_001)));
    await assert.rejects(() => loadNotificationSoundFile(path), /ten seconds/i);
    await writeFile(path, "Generated non-audio bytes");
    await assert.rejects(() => loadNotificationSoundFile(path), /WAV/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("closing pending audio prevents late playback; unconfirmed cleanup retains the exact context for explicit retry", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext"), resumed = Promise.withResolvers<void>(), contexts: FakeAudioContext[] = [];
  class FakeAudioContext {
    state = "suspended"; starts = 0; closes = 0; failClose = false;
    destination = {};
    constructor() { contexts.push(this); }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { buffer: null, onended: null, connect: () => {}, disconnect: () => {}, start: () => { this.starts++; }, stop: () => { assert.ok(this.starts); } }; }
    async resume() { await resumed.promise; if (this.state !== "closed") this.state = "running"; }
    async close() { this.closes++; if (this.failClose) throw new Error("Generated audio cleanup failure"); this.state = "closed"; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });
  const failures: unknown[] = [], player = new NotificationAudio((error) => failures.push(error)), audio = audioBase64(defaultNotificationWav("completed"));
  try {
    const play = player.play(audio); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(contexts.length, 1); await player.close(); resumed.resolve(); await play;
    assert.equal(contexts[0]!.starts, 0); assert.equal(contexts[0]!.state, "closed");
    await player.play(audio); contexts[1]!.failClose = true;
    await assert.rejects(() => player.close(), /cleanup failure/);
    await assert.rejects(() => player.play(audio), /cleanup failure/); assert.equal(contexts.length, 2);
    contexts[1]!.failClose = false; await player.close(); assert.equal(contexts[1]!.state, "closed");
    assert.deepEqual(failures, []);
  } finally {
    resumed.resolve(); await player.close();
    if (original) Object.defineProperty(globalThis, "AudioContext", original); else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
