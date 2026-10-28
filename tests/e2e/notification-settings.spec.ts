import { _electron as electron, expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { audioBase64, defaultNotificationWav, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop settings qualification is macOS-only.");
test("explicit sound snapshots, separate auto-saved event choices and native preview never play real audio in generated windows", async () => {
  const fixture = await setupFixture(), path = join(fixture.directory, "Generated alert.wav");
  await writeFile(path, defaultNotificationWav("needs-input"), { mode: 0o600 });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SOUND_FILE: path },
  });

  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(page.getByLabel("Play application sounds while Moguri is focused", { exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Import notification sound", exact: true }).click();
    await expect.poll(() => sdk.notifications.list().length).toBe(1);
    const sound = sdk.notifications.list()[0]!;
    await page.getByRole("combobox", { name: "Needs attention sound", exact: true }).selectOption(sound.id);
    await expect.poll(() => sdk.settings.get()?.values.notifications.needsInputSound?.id).toBe(sound.id);
    expect(sdk.settings.get()?.values.notifications.completedSound?.id).toBe("default");
    await page.getByRole("button", { name: "Preview needs attention sound", exact: true }).click();
    await expect(page.getByText("Sound validated; playback is suppressed in the generated hidden window.", { exact: true })).toBeVisible();
    await page.getByLabel("Play a sound: session completed", { exact: true }).uncheck();
    await expect.poll(() => sdk.settings.get()?.values.notifications.completedSound?.enabled).toBe(false);
    await page.getByRole("combobox", { name: "Needs attention sound", exact: true }).selectOption("default");
    await page.getByRole("combobox", { name: "Sound reviewed for removal", exact: true }).selectOption(sound.id);
    await page.getByRole("button", { name: "Remove Generated alert", exact: true }).click();
    await expect.poll(() => sdk.notifications.list().length).toBe(0);
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.requests).toEqual([]); expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("native attention and completion audio messages reach the renderer once with non-silent samples and exact profile ownership", async () => {
  const fixture = await setupFixture(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      Reflect.set(window, "generatedNotificationStarts", []);
      class GeneratedBuffer {
        readonly samples: Float32Array;
        constructor(length: number) { this.samples = new Float32Array(length); }
        getChannelData() { return this.samples; }
      }
      class GeneratedSource {
        buffer: GeneratedBuffer | null = null;
        onended: (() => void) | null = null;
        connect() {} disconnect() {} stop() {}
        start() {
          if (!this.buffer) throw new Error("Generated sound has no decoded PCM.");
          let peak = 0;
          for (const sample of this.buffer.samples) peak = Math.max(peak, Math.abs(sample));
          const starts: unknown = Reflect.get(window, "generatedNotificationStarts");
          if (!Array.isArray(starts)) throw new Error("Generated audio observation is missing.");
          starts.push(peak);
          queueMicrotask(() => this.onended?.());
        }
      }
      class GeneratedContext {
        state = "suspended"; destination = {};
        createBuffer(_channels: number, length: number) { return new GeneratedBuffer(length); }
        createBufferSource() { return new GeneratedSource(); }
        async resume() { this.state = "running"; }
        async close() { this.state = "closed"; }
      }
      Reflect.set(window, "AudioContext", GeneratedContext);
    });
    const send = (profileId: string, kind: "needs-input" | "completed") => app.evaluate(({ BrowserWindow }, input) => {
      BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:notification-audio", input.profileId, input.audio);
    }, { profileId, audio: audioBase64(defaultNotificationWav(kind)) });
    const starts = () => page.evaluate(() => {
      const values: unknown = Reflect.get(window, "generatedNotificationStarts");
      if (!Array.isArray(values)) throw new Error("Generated audio observation is missing.");
      return values;
    });
    await send("default", "needs-input");
    await expect.poll(async () => (await starts()).length).toBe(1);
    await send("generated-other-profile", "needs-input");
    await send("default", "completed");
    await expect.poll(async () => (await starts()).length).toBe(2);
    expect((await starts()).every((peak) => typeof peak === "number" && peak > 0.01)).toBe(true);
    expect(errors).toEqual([]); expect(fixture.requests).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
