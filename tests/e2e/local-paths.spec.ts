import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { defaultNotificationWav, MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { generatedGguf, sha256, transcribeStreamingGguf, transcribeWhisperGguf } from "../fixtures/voice-models.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Local path fields use generated files in hidden macOS windows.");
async function write(path: string, bytes: Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); return path; }

test("speech models can be found on request, typed or chosen, and every local path field accepts a typed path or a picker", async () => {
  test.setTimeout(120_000);
  const home = await mkdtemp(join(tmpdir(), "moguri-generated-home-"));
  const handy = join(home, "Library", "Application Support", "com.pais.handy", "models"), moonshine = transcribeStreamingGguf();
  await write(join(handy, "moonshine-streaming.gguf"), moonshine);
  await write(join(home, ".cache", "huggingface", "generated", "whisper.gguf"), transcribeWhisperGguf());
  await write(join(home, ".cache", "huggingface", "generated", "language-model.gguf"), generatedGguf({ "general.architecture": "llama" }));
  const fixture = await setupFixture({ platform: { speech: { executable: process.execPath, prefixArgs: [resolve("tests/fixtures/fake-speech.mjs")],
    transcribeHost: [process.execPath, resolve("tests/fixtures/fake-transcribe-host.mjs")], home } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), sound = join(fixture.directory, "Generated typed alert.wav");
  await writeFile(sound, defaultNotificationWav("completed"), { mode: 0o600 });
  const executable = join(fixture.directory, "generated-claude");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Voice dictation");
    await page.getByRole("button", { name: "Find installed models", exact: true }).click();
    const found = page.getByRole("region", { name: "Found speech models", exact: true });
    await expect(found).toContainText("Found 2 speech models.");
    await expect(found).toContainText("Skipped 1 other model file");
    const whisper = found.getByRole("listitem").filter({ hasText: "Generated Whisper" });
    await expect(whisper).toContainText("Can't stream"); await expect(whisper.getByRole("button")).toHaveCount(0);
    await found.getByRole("button", { name: "Review Generated Moonshine Streaming", exact: true }).click();
    const review = page.getByRole("region", { name: "Model review" });
    await expect(review).toContainText(sha256(moonshine));
    await review.getByRole("button", { name: "Discard review", exact: true }).click();

    const path = page.getByLabel("Speech model path", { exact: true });
    await path.fill(handy);
    await page.getByRole("button", { name: "Review model at this path", exact: true }).click();
    await expect(found).toContainText("Found 1 speech model.");
    await path.fill(join(home, ".cache", "huggingface", "generated", "whisper.gguf"));
    await page.getByRole("button", { name: "Review model at this path", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "can't stream dictation" })).toBeVisible();
    await path.fill(join(handy, "moonshine-streaming.gguf"));
    await page.getByRole("button", { name: "Review model at this path", exact: true }).click();
    await review.getByRole("button", { name: "Trust this model", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.voice.model?.path).toBe(await realpath(join(handy, "moonshine-streaming.gguf")));

    await openSettingsSection(page, "Notifications");
    await page.getByLabel("Notification sound path", { exact: true }).fill(sound);
    await page.getByRole("button", { name: "Import notification sound", exact: true }).click();
    await expect.poll(() => sdk.notifications.list().map((entry) => entry.name)).toEqual(["Generated typed alert"]);

    await openSettingsSection(page, "Providers");
    await page.getByRole("switch", { name: "Enable Claude Agent", exact: true }).check();
    await expect.poll(() => sdk.settings.get()!.values.claudeAgent?.enabled).toBe(true);
    await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, executable);
    await page.getByRole("button", { name: "Choose Claude Agent executable", exact: true }).click();
    await expect(page.getByLabel("Claude Code executable", { exact: true })).toHaveValue(executable);
    await page.getByRole("button", { name: "Save Claude Agent executable", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.claudeAgent?.executablePath).toBe(executable);
    expect(fixture.requests).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); await rm(home, { recursive: true, force: true }); }
});
