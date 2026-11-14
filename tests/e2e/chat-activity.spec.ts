import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native chat activity is qualified on macOS.");

test("desktop expands original operations and public reasoning, copies only the response, and keeps original turn info and usage compact", async () => {
  const fixture = await setupFixture({ reasoning: true, reasoningText: "**Considering testing strategies**\n\nGenerated public provider reasoning.", contextWindow: 32768,
    toolAdvice: "Generated plan before reading.", usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42, prompt_tokens_details: { cached_tokens: 10 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, budgets: { ...settings.values.budgets, rates: [
    { modelId: fixture.modelId, inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" },
  ] } }, settings.revision);
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await waitForWorkspace(page);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:copy-text");
      ipcMain.handle("moguri:copy-text", (_event, value: unknown) => {
        if (typeof value !== "string") throw new Error("Generated clipboard expects text.");
        process.env.MOGURI_GENERATED_COPY = value;
      });
    });
    await page.getByLabel("Prompt", { exact: true }).fill("generated tool: inspect the generated file.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await fixture.terminal();
    expect(fixture.session().pendingApproval).toBeNull();
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    const read = transcript.locator(".activity-row[data-kind='read-file']");
    await expect(read.locator("summary svg[data-icon='ReadFile']")).toBeVisible();
    expect(await read.locator(".activity-chevron").evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0);
    await read.locator("summary").click();
    await expect(read.getByText("Loading the retained operation...", { exact: true })).toHaveCount(0);
    await expect(read.getByRole("region", { name: "Operation arguments", exact: true })).toContainText('"path": "fixture.txt"');
    await expect(read.getByRole("region", { name: "Operation result", exact: true })).toContainText("generated original");
    await expect(read.getByRole("region", { name: "Operation arguments", exact: true }).locator("header")).not.toContainText("UTF-8 bytes");
    await expect(read.getByRole("region", { name: "Operation result", exact: true }).locator("header")).not.toContainText("UTF-8 bytes");
    await expect(read.locator(".activity-metrics")).toContainText(/Started .+ - .+/);
    await expect(read.locator(".activity-metrics")).toContainText(/Duration \d/);
    await expect(read.locator(".activity-metrics")).toContainText(/Output \d/);
    const thought = transcript.locator(".activity-row[data-kind='thought']");
    await expect(thought.locator("summary svg[data-icon='Thought']")).toBeVisible();
    await thought.locator("summary").click();
    await expect(thought).toHaveClass(/activity-status-completed/);
    await expect(thought).toContainText("Generated public provider reasoning.");
    await expect(thought.locator("strong").filter({ hasText: "Considering testing strategies" })).toBeVisible();
    await expect(thought).toContainText("separate thought time is not reported");
    const response = transcript.getByRole("region", { name: "Assistant response", exact: true });
    await response.hover();
    await response.getByRole("button", { name: "Copy response", exact: true }).click();
    const turnId = fixture.session().messages.find((message) => message.role === "user")!.turnId;
    await expect.poll(() => app.evaluate(() => process.env.MOGURI_GENERATED_COPY)).toBe(sdk.activity.response(fixture.sessionId, turnId));
    const copied = await app.evaluate(() => process.env.MOGURI_GENERATED_COPY);
    expect(copied).toContain("Generated plan before reading.");
    expect(copied).not.toContain("Generated public provider reasoning.");
    expect(copied).not.toContain("generated original");
    await sdk.sessions.modelOptions(fixture.sessionId, { contextWindow: 16384 }, fixture.session().revision);
    const infoButton = response.getByRole("button", { name: "Turn information", exact: true });
    await infoButton.focus(); await page.keyboard.press("Enter");
    const info = response.getByRole("region", { name: "Turn information", exact: true });
    await expect(info).toBeFocused();
    await expect(info).toContainText(fixture.modelId);
    await expect(info).toContainText("60 in / 24 out");
    await expect(info).toContainText("33% cached input");
    await info.getByText("Original turn details", { exact: true }).click();
    await expect(info).toContainText("32,768 tokens");
    await expect(info).toContainText("Not separately reported");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/chat-activity-turn.png") });
    await page.keyboard.press("Escape");
    await expect(info).toHaveCount(0); await expect(infoButton).toBeFocused();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await expect(budget.locator(".compact-usage > div").first()).toContainText("Est. USD");
    await expect(budget).toContainText("2 model calls");
    await expect(budget).toContainText("20 cached");
    await expect(budget.getByRole("meter", { name: "Estimated context window", exact: true })).toHaveAttribute("max", "16384");
    await expect(budget.getByRole("button", { name: "View usage and limits...", exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    const sidebar = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await expect(sidebar.getByRole("dialog", { name: "Budget and usage", exact: true })).toBeVisible();
    await expect(page.getByRole("form", { name: "Message composer", exact: true })).toBeVisible();
    const sidebarBounds = await sidebar.boundingBox(), budgetBounds = await budget.boundingBox();
    expect(budgetBounds!.x).toBeGreaterThanOrEqual(sidebarBounds!.x);
    expect(budgetBounds!.x + budgetBounds!.width).toBeLessThanOrEqual(sidebarBounds!.x + sidebarBounds!.width);
    expect(budgetBounds!.y + budgetBounds!.height).toBeLessThanOrEqual(sidebarBounds!.y + sidebarBounds!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: resolve(".moguri/artifacts/chat-activity-budget.png") });
    await budget.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    await expect(budget.getByRole("region", { name: "Session budget controls", exact: true })).toBeVisible();
    await budget.getByRole("button", { name: "Back to compact usage", exact: true }).click();
    await expect(budget).toContainText("2 model calls");
    await page.keyboard.press("Escape");
    await fixture.send("generated failing command"); await fixture.approve(); await fixture.terminal();
    const command = transcript.locator(".activity-row[data-kind='command']");
    await command.locator("summary").click();
    await expect(command).toContainText("failed");
    await expect(command.getByRole("region", { name: "Operation arguments", exact: true })).toContainText("exit 7");
    await expect(command.getByRole("region", { name: "Operation result", exact: true })).toContainText("Generated command failure");
    expect(fixture.requests.length).toBe(4); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("current operation has a wall timer, respects reduced motion, and disappears after acknowledged stop", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByLabel("Prompt", { exact: true }).fill("generated slow activity");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true }), operation = transcript.getByLabel("Current operation", { exact: true });
    await expect(operation).toBeVisible(); await expect(operation).toContainText("Generating response");
    const timer = operation.getByRole("timer", { name: "Elapsed operation time", exact: true }), first = await timer.textContent();
    await expect(timer).toHaveAttribute("aria-live", "off");
    await expect.poll(() => timer.textContent()).not.toBe(first);
    expect(await operation.locator(".activity-spinner").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    await expect(operation).toHaveCount(0);
    await transcript.getByRole("button", { name: "Turn information", exact: true }).click();
    const info = transcript.getByRole("region", { name: "Turn information", exact: true });
    await info.getByText("Original turn details", { exact: true }).click();
    await expect(info).toContainText("stopped");
    expect(fixture.requests.length).toBe(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("saved original turn information never leaks into another session or starts a click-time query", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("Generated activity source response."); await fixture.terminal();
  await sdk.sessions.rename(fixture.sessionId, "Generated activity first");
  const second = await sdk.sessions.create(null, "Generated activity second");
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let reads = 0;
  fixture.service.controller.platform.query = async (input) => {
    if (input.type === "activity.turn") { reads++; throw new Error("Generated click-time turn information read is forbidden."); }
    return query(input);
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await page.locator(".session-link").filter({ hasText: "Generated activity first" }).click();
    await transcript.getByRole("button", { name: "Turn information", exact: true }).click();
    await expect(transcript.getByRole("region", { name: "Turn information", exact: true })).toContainText(fixture.modelId);
    await page.locator(".session-link").filter({ hasText: "Generated activity second" }).click();
    await expect(page.locator(".session-link[aria-current='page']")).toHaveAttribute("title", "Generated activity second");
    await expect(transcript.getByRole("region", { name: "Turn information", exact: true })).toHaveCount(0);
    await expect(transcript.locator(".conversation-turn")).toHaveCount(0);
    await expect(transcript).not.toContainText("Generated Copilot response");
    expect((await sdk.activity.list(second.id!)).activity.entries).toEqual([]);
    expect(reads).toBe(0);
    expect(fixture.requests.length).toBe(1);
  } finally { fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("an incomplete reasoning response shows its actual output limit and does not approve or execute its pending tool", async () => {
  const fixture = await setupFixture({
    reasoning: true, maxOutputTokens: 4096, finishReason: "length",
    toolCall: { name: "read_file", args: { path: "fixture.txt" } },
  });
  await fixture.configure(); await fixture.send("Generated partial README inspection."); await fixture.terminal();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await expect(transcript).toContainText("4096-token output limit");
    await expect(transcript).toContainText("Reasoning counts toward this limit.");
    await expect(transcript).toContainText("No tools from this incomplete response were executed.");
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toHaveCount(0);
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "tool.started")).toBe(false);
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); await fixture.close(); }
});
