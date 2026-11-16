import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupFixture } from "../fixture.ts";
import { isRecord, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { chooseContextWindow, chooseThinkingEffort, finishIdleSchedule, openModelChoices } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Composer execution is qualified on macOS.");
test("one Enter captures the native text even when its content-change notification has not reached the editor", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true }), text = "Generated single-Enter native input.";
    await expect(prompt).toHaveValue(""); await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await prompt.evaluate((element, text) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("The generated textarea has no native value setter.");
      setter.call(element, text);
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    }, text);
    await expect.poll(() => fixture.requests.length).toBe(1);
    await expect.poll(() => fixture.session().status).toBe("completed");
    const turns = fixture.service.controller.events(0).filter((event) => event.event_type === "turn.started");
    expect(turns).toHaveLength(1); expect(turns[0]!.event_type === "turn.started" && turns[0]!.payload.item.text).toBe(text);
    await expect(prompt).toHaveValue(""); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("a single native Enter runs a fresh slash command and active autosave never consumes the ordinary send keystroke", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let saving = false;
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toHaveValue("");
    await prompt.evaluate((element) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("The generated textarea has no native value setter.");
      setter.call(element, "/rename Generated native Enter command");
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    });
    await expect.poll(() => fixture.session().title).toBe("Generated native Enter command");
    await expect(prompt).toHaveValue(""); expect(fixture.requests).toHaveLength(0);
    fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
      const request: unknown = args[0];
      if (isRecord(request) && isRecord(request.command) && request.command.type === "draft.save") { saving = true; await gate.promise; }
      return dispatch(...args);
    };
    const text = "Generated one Enter during active autosave.";
    await prompt.fill(text); await expect.poll(() => saving).toBe(true);
    await prompt.press("Enter"); gate.resolve();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.session().messages.find((message) => message.role === "user")?.text).toBe(text);
    await expect(prompt).toHaveValue(""); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); await fixture.close(); }
});
test("model dropdown keeps preferred Max through High fallback and restores it until the user explicitly changes effort", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768 }), original = fixture.provider.state.models[0]!;
  const maximum = { ...original, id: "gpt-generated-max", apiModelId: "gpt-generated-max", name: "Generated GPT Max", thinkingLevels: ["low", "high", "max"] as const };
  const limited = { ...original, id: "claude-generated-high", apiModelId: "claude-generated-high", name: "Generated Claude High", thinkingLevels: ["low", "high"] as const };
  fixture.provider.state.models.push({ ...maximum, thinkingLevels: [...maximum.thinkingLevels] }, { ...limited, thinkingLevels: [...limited.thinkingLevels] });
  fixture.provider.onChange();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.selectModel(fixture.sessionId, maximum.id);
  await sdk.sessions.modelOptions(fixture.sessionId, { thinkingEffort: "max", contextWindow: 16384 }, undefined, true);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: /^Model:/ }).click();
    const menu = page.getByRole("dialog", { name: "Model", exact: true });
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated Claude High / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await expect(menu.getByRole("button", { name: "Thinking effort", exact: true })).toContainText("High");
    await expect(menu.getByRole("status").filter({ hasText: "Max" })).toContainText("High");
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated GPT Max / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ thinkingEffort: "max" });
    await expect(menu.getByRole("button", { name: "Thinking effort", exact: true })).toContainText("Max");
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated Claude High / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe("high");
    await chooseThinkingEffort(page, "High");
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated GPT Max / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await expect(menu.getByRole("button", { name: "Thinking effort", exact: true })).toContainText("High");
    await chooseThinkingEffort(page, "Model default");
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated Claude High / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toBeUndefined();
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("GPT, Claude, Google and Grok choices use distinct decorative icons while model names remain accessible", async () => {
  const fixture = await setupFixture(), original = fixture.provider.state.models[0]!;
  const choices = [
    { id: "gpt-generated-icon", name: "Generated GPT icon", icon: "ModelGPT" },
    { id: "claude-generated-icon", name: "Generated Claude icon", icon: "ModelClaude" },
    { id: "gemini-generated-icon", name: "Generated Google icon", icon: "ModelGoogle" },
    { id: "grok-generated-icon", name: "Generated Grok icon", icon: "ModelGrok" },
  ];
  fixture.provider.state.models = choices.map((choice) => ({ ...original, id: choice.id, apiModelId: choice.id, name: choice.name }));
  fixture.provider.onChange();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await page.getByRole("button", { name: /^Model:/ }).click();
    const models = await openModelChoices(page), shapes: Array<string | null> = [];
    for (const choice of choices) {
      const option = models.getByRole("menuitemradio", { name: new RegExp(`^${choice.name} `) }), icon = option.locator("svg");
      await expect(icon).toHaveAttribute("data-icon", choice.icon);
      await expect(icon).toHaveAttribute("aria-hidden", "true");
      shapes.push(await icon.locator("path").getAttribute("d"));
    }
    expect(new Set(shapes).size).toBe(4);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("a failed model update remains visible after closing its menu and releases only its own pending gate", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const page = await app.firstWindow(), dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let release!: () => void, received = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  try {
    fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
      const payload: unknown = args[0];
      if (isRecord(payload) && isRecord(payload.command) && payload.command.type === "session.configure") {
        received = true; await held; throw new MoguriError("generated_model_refusal", "Generated model update was refused. The original selection is unchanged.", 409);
      }
      return dispatch(...args);
    };
    await page.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => received).toBe(true); await page.keyboard.press("Escape");
    const prompt = page.getByLabel("Prompt", { exact: true }); await prompt.fill("/rename Generated preserved failed-model draft");
    await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText("Generated model update was refused");
    await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeEnabled();
    await expect(prompt).toHaveValue("/rename Generated preserved failed-model draft");
    expect(fixture.session().controls.modelId).toBeNull(); expect(fixture.requests.length).toBe(0);
    await expect.poll(() => fixture.session().draft.text).toBe("/rename Generated preserved failed-model draft");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { release(); fixture.service.controller.dispatch = dispatch; await app.close(); await fixture.close(); }
});

test("closing the model menu cannot release an in-flight configuration gate or lose the pending slash draft", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const page = await app.firstWindow();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let release!: () => void, received = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  try {
    fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
      const payload: unknown = args[0];
      if (isRecord(payload) && isRecord(payload.command) && payload.command.type === "session.configure") { received = true; await held; }
      return dispatch(...args);
    };
    await page.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => received).toBe(true);
    await page.keyboard.press("Escape");
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("/rename Generated command after configuration");
    const command = page.getByRole("button", { name: "Run command", exact: true });
    await expect(command).toBeDisabled();
    await prompt.press("Meta+Enter");
    await expect(prompt).toHaveValue("/rename Generated command after configuration");
    expect(fixture.session().title).not.toBe("Generated command after configuration");
    release(); await expect(command).toBeEnabled();
    await prompt.press("Enter");
    await expect(page.getByRole("heading", { name: "Generated command after configuration", exact: true })).toBeVisible();
    expect(fixture.session().controls.modelId).toBe(fixture.modelId); expect(fixture.requests.length).toBe(0);
  } finally { release(); fixture.service.controller.dispatch = dispatch; await app.close(); await fixture.close(); }
});

test("compact icon composer preserves queue semantics, model tuning, usage and safe popovers", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768 });
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    const failures: string[] = []; page.on("pageerror", (error) => failures.push(error.message));
    const composer = page.getByRole("form", { name: "Message composer" });
    const prompt = page.getByLabel("Prompt", { exact: true });
    const send = () => composer.getByRole("button", { name: "Send", exact: true });
    await expect(send().locator("svg")).toHaveAttribute("data-icon", "Send");
    await expect(send()).toHaveText("");
    await expect(composer.getByRole("button", { name: "Attach", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Plus");
    await expect(composer.getByRole("button", { name: "Execution environment", exact: true }).locator("svg")).toHaveAttribute("data-icon", "House");
    await expect(composer.getByRole("button", { name: "Autonomy level", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Hand");
    await expect(composer.getByRole("button", { name: "Budget and usage", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Infinity");
    await expect(composer.getByRole("button", { name: "Start local dictation", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Mic");
    await expect(page.locator(".composer-controls")).toHaveCount(0);
    await prompt.fill("Generated modifier-held prompt.");
    await page.keyboard.down("Meta");
    const queue = composer.getByRole("button", { name: "Schedule prompt", exact: true });
    await expect(queue.locator("svg")).toHaveAttribute("data-icon", "Clock");
    await queue.click(); await page.keyboard.up("Meta");
    await finishIdleSchedule(page);
    await expect.poll(() => fixture.service.controller.snapshot().scheduledPrompts[0]?.status).toBe("scheduled");
    expect(fixture.requests.length).toBe(0);
    await expect(send().locator("svg")).toHaveAttribute("data-icon", "Send");
    await page.keyboard.down("Meta");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(send().locator("svg")).toHaveAttribute("data-icon", "Send");
    await page.keyboard.up("Meta");

    await composer.getByRole("button", { name: "Execution environment", exact: true }).click();
    const env = page.getByRole("dialog", { name: "Execution environment", exact: true });
    await expect(env.getByRole("button", { name: "Sandbox Set up SendBox", exact: true })).toBeEnabled();
    await expect(env.getByRole("button", { name: "Remote Not ready", exact: true })).toBeDisabled();
    await expect(env.locator('[data-icon="Box"]')).toHaveCount(1);
    await expect(env.locator('[data-icon="Globe"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const autonomy = page.getByRole("dialog", { name: "Autonomy level", exact: true });
    await expect(autonomy.locator('[data-icon="Rocket"]')).toHaveCount(1);
    await expect(autonomy.locator('[data-icon="Car"]')).toHaveCount(1);
    await expect(autonomy.getByRole("button", { name: /^Autopilot Max/ })).toBeDisabled();
    await autonomy.getByRole("button", { name: /^Guided/ }).click();
    await expect.poll(() => fixture.session().controls.autonomy).toBe("Guided");
    await expect(composer.getByRole("button", { name: "Autonomy level", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Traffic");

    await composer.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe(fixture.modelId);
    await chooseContextWindow(page, "16,384 tokens");
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(16384);
    expect(fixture.requests.length).toBe(0);
    await chooseThinkingEffort(page, "Low");
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384, thinkingEffort: "low" });
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/composer-model-menu.png") });
    await page.keyboard.press("Escape");
    await expect(composer.getByRole("button", { name: /^Model:/ })).toContainText("Generated Copilot model");
    await prompt.fill("Generated compact composer question.");
    await send().click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests[0]?.reasoning_effort).toBe("low");
    await composer.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const usage = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await expect(usage).toContainText("Unlimited");
    await expect(usage).toContainText("Input tokens");
    await expect(usage).toContainText("30");
    await expect(usage).toContainText("12");
    await expect(usage).toContainText("16,384");
    await expect(usage).toContainText("USD not reported");
    const longModelName = "Generated Copilot model with a deliberately long capability name";
    fixture.provider.state.models[0]!.name = longModelName; fixture.provider.onChange();
    await expect(composer.getByRole("button", { name: /^Model:/ })).toHaveAttribute("title", `Model: ${longModelName}`);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await page.screenshot({ path: resolve(".moguri/artifacts/composer-usage-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const overlapping = await composer.locator(".composer-toolbar button").evaluateAll((buttons) => {
      const boxes = buttons.map((button) => button.getBoundingClientRect()).filter((box) => box.width && box.height);
      return boxes.some((a, index) => boxes.slice(index + 1).some((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    });
    expect(overlapping).toBe(false);
    await page.keyboard.press("Escape");
    await expect(composer.getByRole("button", { name: "Start local dictation", exact: true })).toBeEnabled();
    await expect(composer.getByRole("button", { name: "Start local dictation", exact: true })).toHaveAttribute("title", /Set up local dictation/);
    expect(fixture.service.controller.snapshot().jobs.some((job) => job.kind === "voice.record")).toBe(false);
    expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("Up recalls earlier sent prompts to resend or edit, Down returns to the empty draft, and the turn rail reaches the pane bottom", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    for (const [index, text] of ["ciao", "Generated second prompt."].entries()) {
      await prompt.fill(text); await prompt.press("Enter");
      await expect.poll(() => fixture.requests.length).toBe(index + 1);
      await expect.poll(() => fixture.session().status).toBe("completed");
      await expect(prompt).toHaveValue("");
    }
    await prompt.press("ArrowUp"); await expect(prompt).toHaveValue("Generated second prompt.");
    await prompt.press("ArrowUp"); await expect(prompt).toHaveValue("ciao");
    await prompt.press("ArrowUp"); await expect(prompt).toHaveValue("ciao");
    await prompt.press("ArrowDown"); await expect(prompt).toHaveValue("Generated second prompt.");
    await prompt.press("ArrowDown"); await expect(prompt).toHaveValue("");
    await prompt.press("ArrowUp"); await prompt.press("ArrowUp"); await expect(prompt).toHaveValue("ciao");
    await prompt.press("Enter");
    await expect.poll(() => fixture.requests.length).toBe(3);
    await expect.poll(() => fixture.session().messages.filter((message) => message.role === "user").map((message) => message.text)).toEqual(["ciao", "Generated second prompt.", "ciao"]);
    await prompt.fill("Generated typed draft");
    await prompt.press("ArrowUp"); await expect(prompt).toHaveValue("Generated typed draft");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    await expect(rail.getByRole("button", { name: "Checkpoints and rewind", exact: true })).toBeVisible();
    const [railBox, composerBox, paneBox] = await Promise.all([rail.boundingBox(), page.locator(".main-pane > .composer").boundingBox(), page.locator(".main-pane").boundingBox()]);
    expect(Math.round(railBox!.y + railBox!.height)).toBe(Math.round(paneBox!.y + paneBox!.height));
    expect(railBox!.y).toBeLessThan(composerBox!.y);
    expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(railBox!.x);
    await page.screenshot({ path: test.info().outputPath("full-height-rail.png") });
  } finally { await app.close(); await fixture.close(); }
});
