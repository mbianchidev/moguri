import { _electron as electron, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { NEMOTRON_MODEL } from "../../apps/service/src/voice.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop audio qualification is macOS-only.");
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: [...process.env.MOGURI_TEST_APP ? [] : ["."], "--use-fake-device-for-media-stream"],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
async function speechFixture() {
  const weights = Buffer.from("generated browser PCM recognizer weights");
  const fixture = await setupFixture({ platform: { speech: {
    executable: process.execPath, prefixArgs: [resolve("tests/fixtures/fake-speech.mjs")],
    model: { ...NEMOTRON_MODEL, filename: "generated-browser-pcm.gguf", bytes: weights.length, sha256: createHash("sha256").update(weights).digest("hex") },
    fetch: async () => new Response(weights),
  } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.jobs.wait((await sdk.voice.download(true)).id!);
  return { fixture, sdk };
}

test("actual browser PCM capture reaches the original local recognizer and inserts only after user review", async () => {
  const { fixture, sdk } = await speechFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Start local dictation", exact: true }).click();
    const stop = page.getByRole("button", { name: "Stop local dictation", exact: true });
    await expect(stop).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Control+Space");
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("");
    await page.locator(".composer-transcript").getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated local dictation.");
    expect(fixture.requests.length).toBe(0);
    expect(failures).toEqual([]);
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
    await page.getByRole("button", { name: "List microphones with explicit audio access", exact: true }).click();
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
    await page.getByLabel("Hold the voice shortcut to talk; release to transcribe", { exact: true }).check();
    await expect.poll(() => sdk.settings.get()?.values.voice.pushToTalk).toBe(true);
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

    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Reflect.set(window, "generatedMediaCalls", 0);
      navigator.mediaDevices.getUserMedia = (constraints) => { Reflect.set(window, "generatedMediaCalls", Number(Reflect.get(window, "generatedMediaCalls")) + 1); return original(constraints); };
    });
    fixture.service.controller.platform.voice.status = async () => { entered = true; await gate.promise; return original(); };
    await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.down("D");
    await expect.poll(() => entered).toBe(true);
    await page.keyboard.up("D"); await page.keyboard.up("Shift"); await page.keyboard.up("Control");
    gate.resolve();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("cancelled");
    expect(await page.evaluate(() => Reflect.get(window, "generatedMediaCalls"))).toBe(0);
    expect(fixture.session().draft.text).toBe(""); expect(fixture.requests.length).toBe(0);
  } finally {
    gate.resolve(); fixture.service.controller.platform.voice.status = original;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});
