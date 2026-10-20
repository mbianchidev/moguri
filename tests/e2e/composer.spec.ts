import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupFixture } from "../fixture.ts";
import { isRecord, MoguriError } from "../../packages/sdk/src/index.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Composer execution is qualified on macOS.");
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
    await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: /Generated Copilot model/ }).click();
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
    await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: /Generated Copilot model/ }).click();
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
    await prompt.press("Meta+Enter");
    await expect(page.getByRole("heading", { name: "Generated command after configuration", exact: true })).toBeVisible();
    expect(fixture.session().controls.modelId).toBe(fixture.modelId); expect(fixture.requests.length).toBe(0);
  } finally { release(); fixture.service.controller.dispatch = dispatch; await app.close(); await fixture.close(); }
});

test("compact icon composer preserves queue semantics, model tuning, usage and safe popovers", async () => {
  const fixture = await setupFixture({ reasoning: true });
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
    const queue = composer.getByRole("button", { name: "Queue prompt without starting work", exact: true });
    await expect(queue.locator("svg")).toHaveAttribute("data-icon", "Clock");
    await queue.click(); await page.keyboard.up("Meta");
    await expect.poll(() => fixture.session().queue[0]?.held).toBe(true);
    expect(fixture.requests.length).toBe(0);
    await expect(send().locator("svg")).toHaveAttribute("data-icon", "Send");
    await page.keyboard.down("Meta");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(send().locator("svg")).toHaveAttribute("data-icon", "Send");
    await page.keyboard.up("Meta");

    await composer.getByRole("button", { name: "Execution environment", exact: true }).click();
    const env = page.getByRole("dialog", { name: "Execution environment", exact: true });
    await expect(env.getByRole("button", { name: /^Sandbox/ })).toBeDisabled();
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
    const model = page.getByRole("dialog", { name: "Model", exact: true });
    await model.getByRole("button", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe(fixture.modelId);
    await model.getByLabel("Working context window", { exact: true }).fill("16384");
    await model.getByLabel("Working context window", { exact: true }).press("Enter");
    expect(fixture.requests.length).toBe(0);
    await model.getByLabel("Thinking effort", { exact: true }).selectOption("low");
    await model.getByRole("button", { name: "Save", exact: true }).click();
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
    await composer.getByRole("button", { name: "Start local dictation", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/model|download/i);
    expect(fixture.service.controller.snapshot().jobs.some((job) => job.kind === "voice.record")).toBe(false);
    expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
