import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MoguriSdk, isRecord, MoguriError } from "../../packages/sdk/src/index.ts";
import { NEMOTRON_MODEL } from "../../apps/service/src/voice.ts";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload");
      window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    }
  });
  await app.close();
};
test.skip(process.platform !== "darwin", "Desktop interaction is qualified on macOS.");

test("Enter sends, Shift+Enter inserts a line, composition never submits, and modifiers still hold prompts", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId }, fixture.session().revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated first line");
    await prompt.press("Shift+Enter"); await prompt.press("End");
    await page.keyboard.insertText("Generated second line");
    await expect(prompt).toHaveValue("Generated first line\nGenerated second line");
    await prompt.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
    await prompt.dispatchEvent("keydown", { key: "Enter", code: "Enter", repeat: true });
    expect(fixture.requests.length).toBe(0);
    await prompt.press("Enter");
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.session().messages.find((message) => message.role === "user")?.text).toBe("Generated first line\nGenerated second line");
    const message = page.locator(".message.assistant").last(), copy = message.getByRole("button", { name: /^Copy message/ });
    await prompt.hover(); await expect(copy).toHaveCSS("opacity", "0");
    await message.hover(); await expect(copy).toHaveCSS("opacity", "1");
    await prompt.hover(); await copy.focus(); await expect(copy).toHaveCSS("opacity", "1");
    await prompt.focus(); await expect(copy).toHaveCSS("opacity", "0");
    const main = await page.getByRole("main").boundingBox(), text = await message.boundingBox();
    expect(text!.width).toBeGreaterThan(main!.width * 0.85);
    await prompt.fill("Generated held prompt"); await prompt.press("Control+Enter");
    await expect.poll(() => fixture.session().queue.at(-1)?.held).toBe(true);
    expect(fixture.requests.length).toBe(1);

    const side = await sdk.sessions.spawn(fixture.sessionId, "side");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Side chat", exact: true }).click();
    const question = page.getByLabel("Side question", { exact: true });
    await question.fill("Generated side first line"); await question.press("Shift+Enter");
    await page.keyboard.insertText("Generated side second line"); await question.press("Enter");
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === side.id)?.status).toBe("completed");
    expect(sdk.getState().snapshot?.sessions.find((session) => session.id === side.id)?.messages.find((message) => message.role === "user")?.text).toBe("Generated side first line\nGenerated side second line");
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});

test("both sidebars resize, persist, keep chat usable and reopen from labeled rail icons", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("moguri.sidebar", JSON.stringify({ panel: "Insights", open: true, wide: true })));
    await page.reload();
    const left = page.getByRole("separator", { name: "Resize projects sidebar", exact: true });
    const right = page.getByRole("separator", { name: "Resize session sidebar", exact: true });
    await expect(left).toBeVisible(); await expect(right).toBeVisible();
    await expect(right).toHaveAttribute("aria-valuenow", "360");
    const before = Number(await left.getAttribute("aria-valuenow"));
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    const environment = page.getByRole("dialog", { name: "Execution environment", exact: true }), anchor = (await environment.boundingBox())!.x;
    await left.focus(); await left.press("ArrowRight");
    await expect(left).toHaveAttribute("aria-valuenow", String(before + 16));
    await expect.poll(async () => (await environment.boundingBox())?.x).toBeCloseTo(anchor + 16, 1);
    await page.keyboard.press("Escape");
    const box = (await right.boundingBox())!, initial = Number(await right.getAttribute("aria-valuenow"));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x - 70, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
    expect(Number(await right.getAttribute("aria-valuenow"))).toBeGreaterThan(initial + 60);
    const savedRight = await right.getAttribute("aria-valuenow");
    await page.reload(); await expect(right).toHaveAttribute("aria-valuenow", savedRight!);
    await expect(left).toHaveAttribute("aria-valuenow", String(before + 16));
    await page.getByRole("complementary", { name: "Session sidebar" }).getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeHidden();
    const insights = page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Insights", exact: true });
    await insights.hover(); await expect(page.getByRole("tooltip")).toHaveText("Insights");
    await insights.click(); await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("dialog", { name: "Start", exact: true }).getByRole("button", { name: /^New chat/ }).click();
    await page.getByRole("button", { name: "ask Moguri", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ask Moguri", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Candidates", exact: true }).click();
    const warning = page.getByText("Staging/applying needs an explicitly Local project session allowed by policy. Your current Env and model were not changed. Retained proposals remain readable.", { exact: true });
    await expect(warning).toBeVisible();
    const styles = await warning.evaluate((element) => {
      const warning = getComputedStyle(element), nearby = getComputedStyle(element.parentElement!.querySelector(".fine-print")!);
      return { warning: [warning.fontFamily, warning.fontSize, warning.lineHeight], nearby: [nearby.fontFamily, nearby.fontSize, nearby.lineHeight] };
    });
    expect(styles.warning).toEqual(styles.nearby);
    await insights.click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    expect((await page.getByRole("main").boundingBox())!.width).toBeGreaterThanOrEqual(340);
    await left.press("End"); await right.press("End");
    expect((await page.getByRole("main").boundingBox())!.width).toBeGreaterThanOrEqual(340);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  } finally { await close(app); await fixture.close(); }
});

test("toggle and dropdown preferences autosave without committing a pending text edit", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), settings = () => fixture.service.controller.snapshot().settings.values;
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    const guidance = page.getByLabel("Global user guidance", { exact: true });
    await guidance.fill("Generated pending text. Save only when explicitly requested.");
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await expect.poll(() => settings().appearance.theme).toBe("light");
    expect(settings().instructions).toBe("");
    await categories.getByRole("button", { name: "Subagents", exact: true }).click();
    await page.getByLabel("Enable optional read-only subagents").check();
    await expect.poll(() => settings().subagents.enabled).toBe(true);
    await page.getByLabel("Maximum parallel children", { exact: true }).selectOption("2");
    await expect.poll(() => settings().subagents.maxParallel).toBe(2);
    expect(settings().instructions).toBe("");
    await categories.getByRole("button", { name: "Retention", exact: true }).click();
    const age = page.getByLabel("Archived retention days", { exact: true });
    await age.fill("91");
    await page.getByLabel("Automatically delete archived sessions after the configured age").check();
    await expect.poll(() => settings().retention).toEqual({ deleteArchived: true, afterDays: 7, archiveCompleted: false, archiveAfterDays: 7 });
    await expect(age).toHaveValue("91");
    await page.getByRole("button", { name: "Save retention age", exact: true }).click();
    await expect.poll(() => settings().retention.afterDays).toBe(91);
    expect(settings().instructions).toBe("");
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    await expect(guidance).toHaveValue("Generated pending text. Save only when explicitly requested.");
    await page.getByRole("button", { name: "Save user guidance", exact: true }).click();
    await expect.poll(() => settings().instructions).toBe("Generated pending text. Save only when explicitly requested.");
    await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); await fixture.close(); }
});

test("a refused autosave preserves the edit and never overwrites another client's revision", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let release!: () => void, received = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
    fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
      const payload: unknown = args[0];
      if (isRecord(payload) && isRecord(payload.command) && payload.command.type === "settings.update") {
        received = true; await held; throw new MoguriError("generated_save_refusal", "Generated preference save was refused.", 409);
      }
      return dispatch(...args);
    };
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await expect.poll(() => received).toBe(true);
    await expect(page.getByRole("button", { name: "Back to session", exact: true })).toBeDisabled();
    release(); await expect(page.getByRole("alert")).toContainText("Generated preference save was refused");
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("light");
    fixture.service.controller.dispatch = dispatch;
    const sdk = await new MoguriSdk(fixture.service.connection).ready();
    try {
      const saved = sdk.settings.get()!;
      await sdk.settings.update({ ...saved.values, instructions: "Generated other-client guidance." }, saved.revision);
      await expect(page.getByRole("alert")).toContainText("Another client changed settings");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Another client changed settings");
      expect(sdk.settings.get()!.values.appearance.theme).toBe("dark");
      expect(sdk.settings.get()!.values.instructions).toBe("Generated other-client guidance.");
      await page.getByRole("button", { name: "Reload current settings", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption("light");
      await expect.poll(() => sdk.settings.get()!.values.appearance.theme).toBe("light");
      expect(sdk.settings.get()!.values.instructions).toBe("Generated other-client guidance.");
    } finally { sdk.disconnect(); }
  } finally { release(); fixture.service.controller.dispatch = dispatch; await close(app); await fixture.close(); }
});

test("project dropdowns and toggles save only their changed fields, while nearby text saves remain explicit", async () => {
  const fixture = await setupFixture();
  initializeGeneratedRepository(fixture.project);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), configuration = () => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === fixture.session().projectId)?.values;
    await page.getByLabel("Project actions for project", { exact: true }).click();
    await page.locator(".workspace-menu[open]").getByRole("button", { name: "Settings", exact: true }).click();
    const instructions = page.getByLabel("Project instruction override", { exact: true });
    await instructions.fill("Generated uncommitted project guidance.");
    const upstream = page.getByLabel("Upstream", { exact: true }), originalUpstream = await upstream.inputValue();
    await upstream.fill("generated-upstream");
    await page.getByLabel("GitHub read access", { exact: true }).selectOption("gh-cli");
    await expect.poll(() => configuration()?.repo.githubAccess).toBe("gh-cli");
    expect(configuration()?.repo.upstream).toBe(originalUpstream);
    await expect(upstream).toHaveValue("generated-upstream");
    expect(configuration()?.instructions).toBe("");
    await page.getByLabel("Enable optional Porto inventory access").check();
    await expect.poll(() => configuration()?.porto.enabled).toBe(true);
    expect(configuration()?.instructions).toBe("");
    await expect(instructions).toHaveValue("Generated uncommitted project guidance.");
    await page.getByRole("button", { name: "Save project instructions", exact: true }).click();
    await expect.poll(() => configuration()?.instructions).toBe("Generated uncommitted project guidance.");
    expect(configuration()?.repo.upstream).toBe(originalUpstream);
    await page.getByRole("button", { name: "Save repository settings", exact: true }).click();
    await expect.poll(() => configuration()?.repo.upstream).toBe("generated-upstream");
    await expect(page.getByRole("button", { name: "Save project settings", exact: true })).toBeDisabled();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
  } finally { await close(app); await fixture.close(); }
});

test("Ctrl+Space starts and finalizes generated local dictation outside the textarea without repeated stops or sending", async () => {
  const weights = Buffer.from("generated desktop recognizer weights");
  const directory = await mkdtemp(join(tmpdir(), "moguri-generated-desktop-speech-")), marker = join(directory, "ready");
  const prefixArgs = [resolve("tests/fixtures/fake-speech.mjs"), "--started-marker", marker, "--finalize-delay", "3300"];
  const fixture = await setupFixture({ platform: { speech: {
    executable: process.execPath, prefixArgs,
    model: { ...NEMOTRON_MODEL, filename: "generated.gguf", bytes: weights.length, sha256: createHash("sha256").update(weights).digest("hex") },
    fetch: async () => new Response(weights),
  } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.voice.download(true);
  await expect.poll(() => sdk.getState().snapshot?.jobs.findLast((job) => job.kind === "voice.download")?.status).toBe("completed");
  const app = await launch(fixture.directory);
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let release = () => {};
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("moguri:microphone-permission"); ipcMain.handle("moguri:microphone-permission", () => true); });
    await prompt.fill("Generated original draft.");
    await page.getByRole("button", { name: "Start local dictation", exact: true }).focus();
    await page.keyboard.press("Control+Space");
    await expect(page.getByRole("button", { name: "Stop local dictation", exact: true })).toBeVisible();
    await expect.poll(() => existsSync(marker)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", ctrlKey: true, repeat: true })));
    await expect.poll(() => sdk.getState().snapshot?.jobs.findLast((job) => job.kind === "voice.record")?.status).toBe("running");
    await page.keyboard.press("Control+Space");
    await expect(page.getByRole("status").filter({ hasText: "Finishing local transcription" })).toBeVisible();
    await page.keyboard.press("Control+Space");
    await expect.poll(() => sdk.getState().snapshot?.jobs.findLast((job) => job.kind === "voice.record")?.status).toBe("completed");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(prompt).toHaveValue("Generated original draft.\nGenerated local dictation.");
    const previousPid = await readFile(marker, "utf8");
    await page.getByRole("button", { name: "Start local dictation", exact: true }).click();
    await expect.poll(() => readFile(marker, "utf8")).not.toBe(previousPid);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Voice dictation", exact: true }).click();
    let received = false;
    const held = new Promise<void>((resolve) => { release = resolve; });
    fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
      const payload: unknown = args[0];
      if (isRecord(payload) && isRecord(payload.command) && payload.command.type === "settings.update") { received = true; await held; }
      return dispatch(...args);
    };
    await page.getByLabel("Native speech backend", { exact: true }).selectOption("cpu");
    await expect.poll(() => received).toBe(true);
    await expect(page.getByRole("button", { name: "Back to session", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Stop and transcribe", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Stop and transcribe", exact: true }).click();
    await page.getByRole("button", { name: "Cancel and discard", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.jobs.findLast((job) => job.kind === "voice.record")?.status).toBe("cancelled");
    expect(sdk.getState().snapshot?.jobs.findLast((job) => job.kind === "voice.record")?.resultDigest).toBeNull();
    release();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    fixture.service.controller.dispatch = dispatch;
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(prompt).toHaveValue("Generated original draft.\nGenerated local dictation.");
    prefixArgs.push("--exit-signal", "SIGTERM");
    await page.keyboard.press("Control+Space");
    await expect(page.getByRole("alert")).toContainText("signal SIGTERM. Generated native capture failed.");
    await expect(prompt).toHaveValue("Generated original draft.\nGenerated local dictation.");
    expect(fixture.requests.length).toBe(0);
    expect(existsSync(join(fixture.directory, "state", "speech-models", NEMOTRON_MODEL.filename))).toBe(false);
  } finally { release(); fixture.service.controller.dispatch = dispatch; await close(app); sdk.disconnect(); await fixture.close(); await rm(directory, { recursive: true, force: true }); }
});
