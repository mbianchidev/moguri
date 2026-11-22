import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { MoguriSdk, slashCommands } from "@moguri-dev/sdk";
import { admitGeneratedSkill, setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Composer menus use generated hidden macOS windows.");
test("Guardrails and decision settings sit beside their autonomy choices and settings never select a mode", async () => {
  const fixture = await setupFixture(), app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), original = fixture.session().controls.autonomy;
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Autonomy level", exact: true });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => element.matches(":popover-open") && !element.closest("#session-sidebar") && Boolean(element.closest(".composer")))).toBe(true);
    await expect(page.getByRole("form", { name: "Message composer", exact: true })).toBeVisible();
    const autonomous = menu.getByRole("button", { name: /^Autonomous Automatically approve/ });
    const autopilot = menu.getByRole("button", { name: /^Autopilot / });
    const guardrails = menu.getByRole("button", { name: "Guardrails", exact: true }), decisions = menu.getByRole("button", { name: "Decision provider settings", exact: true });
    expect(await autonomous.evaluate((button) => button.parentElement?.querySelector('[aria-label="Guardrails"]') !== null)).toBe(true);
    expect(await autopilot.evaluate((button) => button.parentElement?.querySelector('[aria-label="Decision provider settings"]') !== null)).toBe(true);
    await expect(autopilot).toBeDisabled(); await expect(decisions).toBeEnabled();
    const selectionBox = await autonomous.boundingBox(), settingBox = await guardrails.boundingBox();
    expect(selectionBox).not.toBeNull(); expect(settingBox).not.toBeNull();
    expect(settingBox!.x).toBeGreaterThanOrEqual(selectionBox!.x + selectionBox!.width);
    await guardrails.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Guardrails and tool guidance", exact: true })).toBeVisible();
    expect(fixture.session().controls.autonomy).toBe(original);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click(); await decisions.click();
    await expect(page.getByRole("heading", { name: "Decision providers and Local Autopilot", exact: true })).toBeVisible();
    expect(fixture.session().controls.autonomy).toBe(original); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
test("the model control opens cascading model, effort and context popups with exact supported options and Kupo's unavailable explanation", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768 });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.routing.configure({ ...sdk.routing.policy()!, enabled: false }, sdk.settings.get()!.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const root = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(root).toBeVisible();
    expect(await root.evaluate((element) => element.matches(":popover-open") && !element.closest("#session-sidebar"))).toBe(true);
    await expect(page.getByRole("log", { name: "Session transcript", exact: true })).toBeVisible();
    await root.getByRole("button", { name: "Choose model", exact: true }).click();
    const models = page.getByRole("menu", { name: "Models", exact: true });
    expect(await models.evaluate((element) => element.matches(":popover-open"))).toBe(true);
    await expect(models.getByRole("menuitemradio", { name: /^Generated Copilot model/ })).toHaveAttribute("aria-checked", "true");
    const kupo = models.getByRole("menuitemradio", { name: /^Kupo/ });
    await expect(kupo).toHaveAttribute("aria-disabled", "true");
    await models.getByRole("button", { name: "Why Kupo is unavailable", exact: true }).click();
    await expect(models.getByRole("region", { name: "Why Kupo is unavailable", exact: true })).toContainText(/model|pool|Kupo|disabled/i);
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/composer-model-cascade.png" });
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await root.getByRole("button", { name: "Thinking effort", exact: true }).click();
    const effort = page.getByRole("menu", { name: "Thinking effort", exact: true });
    await effort.getByRole("menuitemradio", { name: "Low", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe("low");
    await root.getByRole("button", { name: "Working context window", exact: true }).click();
    const windows = page.getByRole("menu", { name: "Working context window", exact: true });
    await expect(windows.getByRole("menuitemradio")).toHaveCount(3);
    await windows.getByRole("menuitemradio", { name: "16,384 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(16384);
    await expect(root.getByRole("button", { name: "Thinking effort", exact: true })).toContainText("Low");
    await expect(root.getByRole("button", { name: "Working context window", exact: true })).toContainText("16.4K");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(840);
    const effortControl = root.getByRole("button", { name: "Thinking effort", exact: true });
    await expect(effortControl).toBeEnabled();
    await effortControl.focus(); await expect(effortControl).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(effort.getByRole("menuitemradio", { name: "Low", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(root.getByRole("button", { name: "Thinking effort", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("model tuning slash shortcuts share the real controls and keep an exact non-preset window selectable", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32769 });
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    for (const [command, effort] of [["/thinking high", "high"], ["/effort low", "low"]] as const) {
      await prompt.fill(command); await page.getByRole("button", { name: "Run command", exact: true }).click();
      await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe(effort);
      await expect(prompt).toHaveValue("");
    }
    await prompt.fill("/context-window 24577"); await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(24577);
    await expect(page.getByText(/^Context window set to 24,577 tokens\./)).toBeVisible();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const root = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(root.getByRole("alert")).toHaveCount(0);
    await root.getByRole("button", { name: "Working context window", exact: true }).click();
    await expect(page.getByRole("menu", { name: "Working context window", exact: true }).getByRole("menuitemradio", { name: "24,577 tokens", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await root.getByRole("button", { name: "Thinking effort", exact: true }).click();
    await page.getByRole("menu", { name: "Thinking effort", exact: true }).getByRole("menuitemradio", { name: "Medium", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 24577, thinkingEffort: "medium" });
    await expect(root.getByRole("status")).toHaveText("Changes save automatically.");
    await page.keyboard.press("Escape");
    await prompt.fill("/context-window 1"); await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Allowed whole-token ceilings");
    await expect(prompt).toHaveValue("");
    const failed = fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "context-window" && entry.status === "failed");
    expect(failed).toBeDefined(); expect(fixture.service.store.blob(failed!.inputDigest)).toContain("/context-window 1");
    expect(fixture.session().controls.modelOptions).toEqual({ contextWindow: 24577, thinkingEffort: "medium" });
    await prompt.fill("/context-window half"); await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384, thinkingEffort: "medium" });
    await expect(page.getByText(/^Context window set to 16,384 tokens\./)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("the scrollable slash list contains all builtins before skills, sends the exact chosen skill as a normal prompt and routes /side text without touching an existing side draft", async () => {
  const fixture = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const root = join(fixture.directory, "generated-ui-command-skills"); await mkdir(root);
  for (let index = 0; index < 10; index++) {
    const path = join(root, `skill-${index}`); await mkdir(path);
    await writeFile(join(path, "SKILL.md"), `---\nname: generated-ui-command-${index}\ndescription: Generated selectable UI skill\n---\nGenerated exact UI skill ${index}.\n`);
  }
  await mkdir(join(root, "review"));
  await writeFile(join(root, "review", "SKILL.md"), "---\nname: review\ndescription: Generated skill shadowed by a built-in\n---\nGenerated shadowed skill.\n");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-ui-commands", name: "Generated UI commands", enabled: true, kind: "local", path: root }] }, settings.revision);
  const selected = (await sdk.skills.find("generated-ui-command-9", { sessionId: fixture.sessionId })).skills[0]!;
  await admitGeneratedSkill(sdk, fixture.sessionId, selected.id, selected.digest);
  const side = await sdk.sessions.side(fixture.sessionId);
  await sdk.command({ type: "draft.save", sessionId: side.id!, expectedRevision: 0, text: "Generated earlier side draft.", attachments: [] });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("/");
    const list = page.getByRole("listbox", { name: "Slash commands", exact: true });
    await expect(list).toBeVisible();
    expect(await list.evaluate((element) => !element.closest("#session-sidebar") && Boolean(element.closest(".composer")))).toBe(true);
    await expect(prompt).toBeFocused();
    await expect(list.getByRole("option")).toHaveCount(slashCommands.length + 11);
    expect(await list.getByRole("option").evaluateAll((items) => items.map((item) => item.getAttribute("data-command-kind")))).toEqual([
      ...slashCommands.map(() => "builtin"), ...Array.from({ length: 10 }, () => "skill"), "shadowed",
    ]);
    const shadowed = list.locator("[data-command-kind='shadowed']");
    await expect(shadowed).toHaveAttribute("aria-disabled", "true");
    await expect(shadowed).toContainText("Skill to rename");
    await expect(shadowed).toContainText("built-in /review command");
    await shadowed.dispatchEvent("click");
    await expect(prompt).toHaveValue("/");
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await list.getByRole("option", { name: /generated-ui-command-9/ }).click();
    await expect(prompt).toHaveValue("/generated-ui-command-9 ");
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "skill.loaded")).toBe(false);
    await prompt.pressSequentially("Generated skill prompt.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await expect(transcript.getByRole("button", { name: "Preview attachment generated-ui-command-9", exact: true })).toBeVisible();
    await expect(transcript).toContainText("Generated skill prompt.");
    await expect(transcript).not.toContainText("Generated exact UI skill 9");
    await expect(transcript.locator(".activity-row[data-kind='load-skill']")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("skill-message.png") });
    await expect(prompt).toHaveValue("");
    await expect.poll(() => fixture.requests.length).toBe(1);
    expect(JSON.stringify(fixture.requests[0]?.messages)).toContain("Generated exact UI skill 9");
    await expect.poll(() => fixture.session().status).toBe("completed");
    await prompt.fill("/side Generated real slash side question.");
    await page.getByRole("button", { name: "Run command", exact: true }).click();
    const panel = page.locator(".side-chat-panel");
    await expect(panel.getByRole("log", { name: "Side chat transcript", exact: true })).toContainText("Generated Copilot response.");
    await expect(panel.getByLabel("Side question", { exact: true })).toHaveValue("Generated earlier side draft.");
    await expect(prompt).toHaveValue("");
    expect(fixture.session().messages.some((message) => message.text.includes("Generated real slash side question."))).toBe(false); expect(fixture.requests).toHaveLength(2);
    expect(JSON.stringify(fixture.requests[1]?.messages)).toContain("Generated real slash side question.");
    await expect(panel.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("side-chat controls keep their original owner and restore focus after the popup closes", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const side = await sdk.sessions.side(fixture.sessionId), original = structuredClone(fixture.session().controls);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Side chat", exact: true }).click();
    const button = page.locator(".side-chat-panel").getByRole("button", { name: "Budget and usage", exact: true });
    await button.focus(); await page.keyboard.press("Enter");
    const menu = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => element.matches(":popover-open") && element.closest("[data-composer-session]")?.getAttribute("data-composer-session"))).toBe(side.id!);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0); await expect(button).toBeFocused();
    expect(fixture.session().controls).toEqual(original);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("composer controls stay usable during a turn and queue their exact slash commands for after it", async () => {
  const fixture = await setupFixture({ respond: () => ({ text: "Generated slow reply.", delayMs: 6000 }) });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.routing.configure({ ...sdk.routing.policy()!, enabled: false }, sdk.settings.get()!.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await expect(page.getByLabel("Prompt", { exact: true })).toBeEnabled();
    await fixture.send("Generated running prompt.");
    await expect.poll(() => Boolean(fixture.session().turnId)).toBe(true);
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const autonomy = page.getByRole("dialog", { name: "Autonomy level", exact: true });
    await autonomy.getByRole("button", { name: /^Guided/ }).click();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const root = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(root).toContainText("A turn is running: changes are queued as commands and apply after it.");
    await root.getByRole("button", { name: "Choose model", exact: true }).click();
    await page.getByRole("menu", { name: "Models", exact: true }).getByRole("menuitemradio", { name: /^Generated Copilot model/ }).click();
    await expect(root.getByRole("status").filter({ hasText: `Queued /model ${fixture.modelId}` })).toBeVisible();
    await expect.poll(() => fixture.session().queue.map((item) => item.text)).toEqual(["/autonomy Guided", `/model ${fixture.modelId}`]);
    expect(fixture.session().controls.autonomy).toBe("Manual");
    await expect.poll(() => fixture.session().controls.autonomy, { timeout: 20_000 }).toBe("Guided");
    await expect.poll(() => fixture.session().queue.length).toBe(0);
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
