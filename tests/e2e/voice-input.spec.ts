import { _electron as electron, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { audioFromBase64, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { NEMOTRON_MODEL } from "../../apps/service/src/voice.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop audio qualification is macOS-only.");
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: [...process.env.MOGURI_TEST_APP ? [] : ["."], "--use-fake-device-for-media-stream"],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
async function speechFixture(args: string[] = [], pushToTalk = true) {
  const weights = Buffer.from("generated browser PCM recognizer weights");
  const fixture = await setupFixture({ platform: { speech: {
    executable: process.execPath, prefixArgs: [resolve("tests/fixtures/fake-speech.mjs"), ...args],
    model: { ...NEMOTRON_MODEL, filename: "generated-browser-pcm.gguf", bytes: weights.length, sha256: createHash("sha256").update(weights).digest("hex") },
    fetch: async () => new Response(weights),
  } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.jobs.wait((await sdk.voice.download(true)).id!);
  if (pushToTalk) {
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, pushToTalk: true } }, settings.revision);
  }
  return { fixture, sdk };
}

test("tapping default Ctrl+Space survives cold admission and records after release instead of cancelling startup", async () => {
  const { fixture, sdk } = await speechFixture(["--listener-delay", "300", "--buffered-ready"], false), app = await launch(fixture.directory);
  expect(sdk.settings.get()!.values.voice.pushToTalk).toBe(false);
  const capture = fixture.service.controller.platform.captureVoice.bind(fixture.service.controller.platform);
  const gate = Promise.withResolvers<void>(); let entered = false;
  fixture.service.controller.platform.captureVoice = async (request) => {
    if (request.action === "start") { entered = true; await gate.promise; }
    return capture(request);
  };
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true }), microphone = page.locator(".composer-mic");
    await prompt.fill("Generated original unsent draft."); await prompt.focus();
    await page.keyboard.press("Control+Space");
    await expect.poll(() => entered).toBe(true);
    gate.resolve();
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await expect(prompt).toHaveValue(/Generated original unsent draft\. Generated/);
    await expect(page.getByRole("alert").filter({ hasText: "Recording stopped before the microphone was ready" })).toHaveCount(0);
    await page.keyboard.press("Control+Space");
    await expect(prompt).toHaveValue("Generated original unsent draft. Generated local dictation.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture")).toHaveLength(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("consented focused standby reuses one generated microphone and disable closes tracks and removes the model", async () => {
  const { fixture, sdk } = await speechFixture([], false);
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, standby: true } }, settings.revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true }), microphone = page.locator(".composer-mic");
    await page.evaluate(() => {
      Object.defineProperty(document, "hasFocus", { configurable: true, value: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), tracks: MediaStreamTrack[] = [];
      Reflect.set(window, "generatedStandbyCalls", 0); Reflect.set(window, "generatedStandbyTracks", tracks);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        Reflect.set(window, "generatedStandbyCalls", Number(Reflect.get(window, "generatedStandbyCalls")) + 1);
        const stream = await acquire(constraints); tracks.push(...stream.getTracks()); return stream;
      };
    });
    await prompt.focus();
    await expect(page.getByRole("status").filter({ hasText: "Microphone ready in this focused composer" })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "generatedStandbyCalls"))).toBe(1);
    expect(fixture.service.controller.snapshot().jobs.some((job) => job.kind === "voice.capture")).toBe(false);
    await page.keyboard.press("Control+Space");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => Reflect.get(window, "generatedStandbyCalls"))).toBe(1);
    await page.keyboard.press("Control+Space");
    await expect(prompt).toHaveValue("Generated local dictation.");
    const disabled = await sdk.voice.disable(true);
    expect((await sdk.jobs.wait(disabled.id!)).status).toBe("completed");
    await expect(microphone).toBeDisabled();
    await expect.poll(() => page.evaluate(() => {
      const tracks: unknown = Reflect.get(window, "generatedStandbyTracks");
      return Array.isArray(tracks) && tracks.every((track) => track instanceof MediaStreamTrack && track.readyState === "ended");
    })).toBe(true);
    expect((await sdk.voice.status()).voice.modelReady).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("actual browser PCM capture reaches the original local stream and inserts without sending a model turn", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Start local dictation", exact: true }).click();
    const stop = page.getByRole("button", { name: "Stop local dictation", exact: true });
    await expect(stop).toHaveAttribute("aria-pressed", "true");
    await stop.click();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated local dictation.");
    await expect(page.locator(".composer-transcript")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests.length).toBe(0);
    expect(failures).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("an unassigned PTT shortcut leaves the two-click microphone usable without misleading hold instructions", async () => {
  const { fixture, sdk } = await speechFixture(), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, shortcut: "none", pushToTalk: true } }, settings.revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), microphone = page.locator(".composer-mic");
    await expect(microphone).toHaveAttribute("title", /No push-to-talk shortcut is assigned/);
    await page.keyboard.press("Control+Space");
    expect(fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture")).toHaveLength(0);
    await microphone.click(); await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await microphone.click();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated local dictation.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("microphone clicks record and confirm despite a legacy PTT preference; pointer release never commits the clip", async () => {
  const { fixture, sdk } = await speechFixture(["--transcribe-delay", "300"]);
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, pushToTalk: true } }, settings.revision);
  let uploads = 0, commits = 0, sampleCount = 0, peak = 0;
  const original = fixture.service.controller.platform.captureVoice.bind(fixture.service.controller.platform);
  fixture.service.controller.platform.captureVoice = async (request) => {
    if (request.action === "append") {
      const bytes = audioFromBase64(request.audio), values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      uploads++; sampleCount += bytes.length / 2;
      for (let offset = 0; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(values.getInt16(offset, true)));
    }
    if (request.action === "finish") commits++;
    return original(request);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.evaluate(() => {
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const device = await acquire(constraints);
        for (const track of device.getTracks()) track.stop();
        const context = new AudioContext({ sampleRate: 48_000 }), source = context.createOscillator(), gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        source.frequency.value = 440; gain.gain.value = 0.2;
        source.connect(gain); gain.connect(destination); source.start(); await context.resume();
        Reflect.set(window, "generatedInputContext", context);
        return destination.stream;
      };
      Reflect.set(window, "generatedClipPeak", 0);
      class ObservedWorklet extends AudioWorkletNode {
        constructor(...args: ConstructorParameters<typeof AudioWorkletNode>) {
          super(...args);
          this.port.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (event.data && typeof event.data === "object" && "samples" in event.data && event.data.samples instanceof ArrayBuffer) {
              let peak = Number(Reflect.get(window, "generatedClipPeak"));
              for (const sample of new Float32Array(event.data.samples)) peak = Math.max(peak, Math.abs(sample));
              Reflect.set(window, "generatedClipPeak", peak);
            }
          });
        }
      }
      Reflect.set(window, "AudioWorkletNode", ObservedWorklet);
    });
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated preserved draft.");
    const microphone = page.locator(".composer-mic");
    await microphone.click();
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => Number(Reflect.get(window, "generatedClipPeak")))).toBeGreaterThan(0.05);
    await expect.poll(() => sampleCount).toBeGreaterThanOrEqual(16_000);
    const bounds = await microphone.boundingBox();
    if (!bounds) throw new Error("Generated microphone button is not visible.");
    await page.mouse.move(bounds.x - 60, bounds.y - 60);
    await page.mouse.down();
    await page.mouse.up();
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Control+Space");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    expect(commits).toBe(0);
    expect(fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("running");
    await microphone.click();
    await expect(page.locator(".composer-mic")).toBeDisabled();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await page.evaluate(() => { Reflect.deleteProperty(document, "visibilityState"); document.dispatchEvent(new Event("visibilitychange")); });
    await expect(page.locator(".composer-transcript")).toHaveCount(0);
    await expect(prompt).toHaveValue("Generated preserved draft. Generated local dictation.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(uploads).toBeGreaterThan(0); expect(commits).toBe(1); expect(sampleCount).toBeGreaterThan(0); expect(peak).toBeGreaterThan(1000);
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
    await page.evaluate(async () => {
      const context: unknown = Reflect.get(window, "generatedInputContext");
      if (context instanceof AudioContext) await context.close();
    });
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("device selection and push-to-talk use real qualified bindings, while release before delayed admission never opens media", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  const original = fixture.service.controller.platform.voice.status.bind(fixture.service.controller.platform.voice);
  const gate = Promise.withResolvers<void>(); let entered = false;
  try {
    const page = await app.firstWindow(), categories = page.getByRole("navigation", { name: "Settings categories" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await categories.getByRole("button", { name: "Voice dictation", exact: true }).click();
    await page.getByRole("button", { name: "Find microphones with explicit audio access", exact: true }).click();
    const device = page.getByLabel("Voice input device", { exact: true });
    await expect.poll(() => device.evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) throw new Error("Generated microphone selector missing.");
      return Array.from(element.options).filter((option) => !["default", "communications", ""].includes(option.value)).length;
    })).toBeGreaterThan(0);
    const selected = await device.evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) throw new Error("Generated microphone selector missing.");
      return Array.from(element.options).find((option) => !["default", "communications", ""].includes(option.value))!.value;
    });
    await device.selectOption(selected);
    await expect.poll(() => sdk.settings.get()?.values.voice.inputDeviceId).toBe(selected);
    await page.getByLabel("Voice shortcut", { exact: true }).fill("Control+Shift+KeyD");
    await expect(page.getByLabel("Hold the microphone button to talk; release to finish", { exact: true })).toHaveCount(0);
    await page.getByLabel("Dictation language", { exact: true }).selectOption("en-US");
    await expect.poll(() => sdk.settings.get()?.values.voice.language).toBe("en-US");
    expect(sdk.settings.get()?.values.voice.shortcut).toBe("Control+Space");
    await page.getByRole("button", { name: "Save Voice shortcut", exact: true }).click();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await categories.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await page.getByLabel("Commands shortcut", { exact: true }).fill("Control+Shift+KeyP");
    await page.getByRole("button", { name: "Save Commands shortcut", exact: true }).click();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.keyboard.press("Control+k"); await expect(page.getByLabel("Commands", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Control+Shift+P"); await expect(page.locator(".command-palette")).toBeVisible(); await page.keyboard.press("Escape");
    await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.down("D");
    await expect(page.getByRole("button", { name: "Stop local dictation", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.up("D"); await page.keyboard.up("Shift"); await page.keyboard.up("Control");
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await expect(page.getByRole("button", { name: "Start local dictation", exact: true })).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    const savedFirstTranscript = fixture.session().draft.text;
    await sdk.jobs.wait((await sdk.voice.disable(true)).id!);

    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const NativeContext = AudioContext, prepared: AudioContext[] = [];
      class ObservedContext extends NativeContext {
        constructor(options?: AudioContextOptions) { super(options); prepared.push(this); }
      }
      Reflect.set(window, "AudioContext", ObservedContext);
      Reflect.set(window, "generatedInterruptedContextStates", () => prepared.map((context) => context.state));
      Reflect.set(window, "generatedMediaCalls", 0);
      navigator.mediaDevices.getUserMedia = (constraints) => { Reflect.set(window, "generatedMediaCalls", Number(Reflect.get(window, "generatedMediaCalls")) + 1); return original(constraints); };
    });
    await sdk.jobs.wait((await sdk.voice.enable(true)).id!);
    const preparation = await sdk.voice.prepare();
    if (preparation.id) await sdk.jobs.wait(preparation.id);
    await expect.poll(() => page.evaluate(() => {
      const states: unknown = Reflect.get(window, "generatedInterruptedContextStates");
      return typeof states === "function" ? states().length : 0;
    })).toBe(1);
    fixture.service.controller.platform.voice.status = async () => { entered = true; await gate.promise; return original(); };
    await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.down("D");
    await expect.poll(() => entered).toBe(true);
    await page.keyboard.up("D"); await page.keyboard.up("Shift"); await page.keyboard.up("Control");
    gate.resolve();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("cancelled");
    await expect(page.getByRole("alert").filter({ hasText: "before the microphone was ready" })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "generatedMediaCalls"))).toBe(0);
    await expect.poll(() => page.evaluate(() => {
      const states: unknown = Reflect.get(window, "generatedInterruptedContextStates");
      if (typeof states !== "function") throw new Error("Generated interrupted context observer is missing.");
      return states()[0];
    })).toBe("closed");
    expect(fixture.session().draft.text).toBe(savedFirstTranscript); expect(fixture.requests.length).toBe(0);
  } finally {
    gate.resolve(); fixture.service.controller.platform.voice.status = original;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("Space and Enter activate the microphone as a click-toggle button without key-repeat or release commits", async () => {
  const { fixture, sdk } = await speechFixture();
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, pushToTalk: true } }, settings.revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), microphone = page.locator(".composer-mic");
    await expect(microphone).toBeEnabled();
    for (const key of ["Space", "Enter"]) {
      await microphone.focus();
      await page.keyboard.down(key);
      await page.keyboard.down(key);
      await page.keyboard.up(key);
      await expect(microphone).toHaveAttribute("aria-pressed", "true");
      expect(fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("running");
      await page.keyboard.press(key);
      await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(key === "Space" ? "Generated local dictation." : "Generated local dictation. Generated local dictation.");
      await expect(microphone).toBeEnabled();
      expect(fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture")).toHaveLength(key === "Space" ? 1 : 2);
    }
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(0);
  } finally {
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("releasing an earlier Ctrl+Space gesture cannot finalize a newer click recording", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), microphone = page.locator(".composer-mic"), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(microphone).toBeEnabled(); await prompt.focus();
    await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    // macOS Ctrl-click opens a context menu; semantic activation keeps this held-key test platform-independent.
    const activate = () => microphone.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("Generated microphone control is not a native button.");
      button.click();
    });
    await activate();
    await expect(prompt).toHaveValue("Generated local dictation.");
    await expect(microphone).toBeEnabled();
    await activate();
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    const current = fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")!;
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    expect(fixture.service.controller.snapshot().jobs.find((job) => job.id === current.id)?.status).toBe("running");
    await microphone.click();
    await expect(prompt).toHaveValue("Generated local dictation. Generated local dictation.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    const captures = fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture");
    expect(captures).toHaveLength(2); expect(captures.every((job) => job.status === "completed")).toBe(true);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("interrupted push-to-talk reports discard, and an empty recognition result is an error rather than blank success", async () => {
  const { fixture, sdk } = await speechFixture(["--empty-transcript"]);
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, voice: { ...settings.values.voice, pushToTalk: true } }, settings.revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), microphone = page.locator(".composer-mic");
    await page.getByLabel("Prompt", { exact: true }).fill("Generated preserved draft.");
    await expect(microphone).toBeEnabled();
    await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(page.getByRole("alert").filter({ hasText: "lost focus" })).toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("cancelled");
    await expect(page.locator(".composer-transcript")).toHaveCount(0);
    await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(microphone).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.up("Control"); await page.keyboard.up("Space");
    await expect(page.getByRole("alert").filter({ hasText: "No speech was recognized" })).toBeVisible();
    await expect(page.locator(".composer-transcript")).toHaveCount(0);
    expect(fixture.session().draft.text).toBe("Generated preserved draft."); expect(fixture.requests).toHaveLength(0);
  } finally {
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("Ctrl+Space streams words into the textbox while held and release flushes once without an Insert action", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.locator(".composer-mic")).toBeEnabled();
    await prompt.focus();
    await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(page.locator(".composer-mic")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".composer-mic svg[data-icon='Mic']")).toBeVisible();
    await expect(page.locator(".composer-mic svg[data-icon='Stop']")).toHaveCount(0);
    await expect(page.locator(".composer-mic")).toHaveClass(/recording/);
    await expect(prompt).toHaveValue(/Generated/, { timeout: 5000 });
    expect(fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("running");
    expect(fixture.requests).toHaveLength(0);
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await expect(prompt).toHaveValue("Generated local dictation.");
    await expect(page.locator(".composer-transcript").getByRole("button", { name: "Insert", exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a cold recognizer with buffered readiness keeps the mic visible and flushes the same push-to-talk recording", async () => {
  const { fixture, sdk } = await speechFixture(["--listener-delay", "1000", "--buffered-ready"]), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true }), mic = page.locator(".composer-mic");
    await prompt.fill("Generated preserved original draft."); await prompt.focus();
    await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await expect(mic.locator("svg[data-icon='Mic']")).toBeVisible();
    await expect(mic).toHaveClass(/recording/);
    await expect(prompt).toHaveValue(/draft\. Generated /);
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/dictation-active-microphone.png" });
    const capture = fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")!;
    expect(capture.status).toBe("running");
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect.poll(() => fixture.service.controller.snapshot().jobs.find((job) => job.id === capture.id)?.status).toBe("completed");
    await expect(prompt).toHaveValue("Generated preserved original draft. Generated local dictation.");
    await expect(mic.locator("svg[data-icon='Mic']")).toBeVisible();
    await expect(mic).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("alert").filter({ hasText: /capture is missing|within sixty seconds/ })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture")).toHaveLength(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("push-to-talk onset preserves the first microphone samples through cold audio-processor startup", async () => {
  const { fixture, sdk } = await speechFixture(["--listener-delay", "1000", "--buffered-ready"]), app = await launch(fixture.directory);
  let samples = 0, openingSamples = 0;
  const capture = fixture.service.controller.platform.captureVoice.bind(fixture.service.controller.platform);
  fixture.service.controller.platform.captureVoice = async (request) => {
    if (request.action === "append") {
      const bytes = audioFromBase64(request.audio), values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let offset = 0; offset < bytes.length; offset += 2) {
        if (samples++ < 4096 && Math.abs(values.getInt16(offset, true)) > 1000) openingSamples++;
      }
    }
    return capture(request);
  };
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.locator(".composer-mic")).toBeEnabled();
    await page.evaluate(() => {
      const NativeContext = AudioContext, acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      class ColdContext extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          const add = this.audioWorklet.addModule.bind(this.audioWorklet);
          this.audioWorklet.addModule = async (...args: Parameters<Worklet["addModule"]>) => {
            await new Promise((resolve) => setTimeout(resolve, 650));
            return add(...args);
          };
        }
      }
      Reflect.set(window, "AudioContext", ColdContext);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const device = await acquire(constraints);
        for (const track of device.getTracks()) track.stop();
        const context = new NativeContext({ sampleRate: 48_000 }), oscillator = context.createOscillator(), gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 440; oscillator.connect(gain); gain.connect(destination);
        await context.resume();
        gain.gain.setValueAtTime(0.4, context.currentTime);
        gain.gain.setValueAtTime(0, context.currentTime + 0.25);
        oscillator.start();
        Reflect.set(window, "generatedCloseOnsetInput", () => context.close());
        return destination.stream;
      };
    });

    await prompt.focus(); await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(page.locator(".composer-mic")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => samples).toBeGreaterThanOrEqual(4096);
    expect(openingSamples, "the opening 250 ms must not disappear while the processing graph initializes").toBeGreaterThan(3000);
    console.log(JSON.stringify({ primitive: "generated-ptt-opening-pcm", openingSamples, firstFrameSamples: 4096,
      sourceRate: 48_000, captureRate: 16_000, openingToneMs: 250, processorDelayMs: 650, recognizerDelayMs: 1000, modelCalls: 0 }));
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(prompt).toHaveValue("Generated local dictation.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally {
    const page = await app.firstWindow();
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.evaluate(async () => { const close: unknown = Reflect.get(window, "generatedCloseOnsetInput"); if (typeof close === "function") await close(); });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("push-to-talk onset does not wait for an unrelated draft-save acknowledgement", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), saved = Promise.withResolvers<void>();
  let saving = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (typeof raw === "object" && raw !== null && "command" in raw && typeof raw.command === "object" && raw.command !== null &&
      "type" in raw.command && raw.command.type === "draft.save") { saving = true; await saved.promise; }
    return dispatch(raw);
  };
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await page.evaluate(() => {
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Reflect.set(window, "generatedOnsetMediaCalls", 0);
      navigator.mediaDevices.getUserMedia = (constraints) => {
        Reflect.set(window, "generatedOnsetMediaCalls", Number(Reflect.get(window, "generatedOnsetMediaCalls")) + 1);
        return acquire(constraints);
      };
    });
    await prompt.fill("Generated still-saving draft.");
    await expect.poll(() => saving).toBe(true);
    const pressedAt = performance.now();
    await prompt.focus(); await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "generatedOnsetMediaCalls")), { timeout: 2000 }).toBe(1);
    await expect(page.locator(".composer-mic")).toHaveAttribute("aria-pressed", "true");
    console.log(JSON.stringify({ primitive: "generated-ptt-save-independent-onset", recordingMs: performance.now() - pressedAt,
      draftSaveAcknowledged: false, modelCalls: 0 }));
    saved.resolve();
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(prompt).toHaveValue("Generated still-saving draft. Generated local dictation.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally {
    saved.resolve(); fixture.service.controller.dispatch = dispatch;
    const page = await app.firstWindow(); await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("failed onset preparation closes its exact silent context without opening a microphone or losing draft text", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated draft before failed startup.");
    await sdk.jobs.wait((await sdk.voice.disable(true)).id!);
    await page.evaluate(() => {
      const NativeContext = AudioContext, contexts: AudioContext[] = [], acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Reflect.set(window, "generatedFailedOnsetMedia", 0);
      class FailedContext extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options); contexts.push(this);
          this.audioWorklet.addModule = async () => { throw new Error("Generated unavailable onset processor."); };
        }
      }
      Reflect.set(window, "AudioContext", FailedContext);
      Reflect.set(window, "generatedFailedOnsetStates", () => contexts.map((context) => context.state));
      navigator.mediaDevices.getUserMedia = (constraints) => {
        Reflect.set(window, "generatedFailedOnsetMedia", Number(Reflect.get(window, "generatedFailedOnsetMedia")) + 1);
        return acquire(constraints);
      };
    });
    await sdk.jobs.wait((await sdk.voice.enable(true)).id!);
    await prompt.focus(); await page.keyboard.down("Control"); await page.keyboard.down("Space");
    await expect(page.getByRole("alert").filter({ hasText: "Generated unavailable onset processor." })).toBeVisible();
    await page.keyboard.up("Space"); await page.keyboard.up("Control");
    await expect.poll(() => page.evaluate(() => {
      const states: unknown = Reflect.get(window, "generatedFailedOnsetStates");
      if (typeof states !== "function") throw new Error("Generated context ownership observer is missing.");
      const values: string[] = states();
      return values.length > 0 && values.every((state) => state === "closed");
    })).toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, "generatedFailedOnsetMedia"))).toBe(0);
    await expect(prompt).toHaveValue("Generated draft before failed startup.");
    await expect(page.locator(".composer-mic")).toBeEnabled();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().jobs.filter((job) => job.kind === "voice.capture")).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
