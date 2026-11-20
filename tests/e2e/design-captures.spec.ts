import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedRepository } from "../fixtures/git.ts";
import { openSettingsSection } from "./navigation.ts";

// Opt-in design captures for docs/design-audit.md. Set MOGURI_DESIGN_CAPTURE_DIR to an absolute
// directory and MOGURI_DESIGN_CAPTURE_PREFIX to "before" or "after". Generated fixtures only.
const directory = process.env.MOGURI_DESIGN_CAPTURE_DIR ?? "";
const prefix = process.env.MOGURI_DESIGN_CAPTURE_PREFIX ?? "capture";
const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin" || !isAbsolute(directory), "Design captures are opt-in generated macOS screenshots.");

const launch = (state: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(state, "state"), MOGURI_TEST_WINDOW: "hidden" } });
// The window minimum is 840 px; narrower captures emulate the CSS viewport a zoomed minimum window gets.
async function resize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(Math.max(840, size.width), size.height), { width, height });
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
  await page.waitForTimeout(250);
}
async function openRail(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(500); await page.mouse.move(600, 20);
}
async function openResource(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(500); await page.mouse.move(600, 20);
}
async function capture(page: Page, name: string) {
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${prefix}-${name}.png`), scale: "css", animations: "disabled", caret: "hide" });
}
const LONG_REPLY = [
  "## Generated review summary",
  "",
  "The generated change keeps **explicit approvals** and the actual execution boundary visible. A deliberately long sentence checks wrapping inside the measured chat column without horizontal scrolling or clipped words in narrow windows.",
  "",
  "- Generated first finding with `inline code` and a path like apps/desktop/src/generated/very/long/path/to/a/component/file/name.tsx",
  "- Generated second finding",
  "",
  "```ts",
  "export function generatedExample(input: string): string { return input.trim().replace(/generated-pattern-that-is-intentionally-long-to-force-horizontal-scrolling/g, \"replacement\"); }",
  "```",
].join("\n");

test("captures the start, question, composer popover and settings screens", async () => {
  test.setTimeout(120_000);
  const fixture = await setupFixture();
  await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await resize(app, page, 1280, 800); await capture(page, "start-1280");
    await resize(app, page, 760, 800); await capture(page, "start-760");
    await resize(app, page, 1280, 800);
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Autonomy level", exact: true })).toBeVisible();
    await capture(page, "composer-popover-1280");
    await page.keyboard.press("Escape");
    await fixture.send("Design audit: generated structured question.");
    await waitFor(() => fixture.session().pendingQuestionId);
    await expect(page.locator(".user-question")).toBeVisible();
    await capture(page, "question-1280");
    await resize(app, page, 760, 800); await capture(page, "question-760");
    await resize(app, page, 1280, 800);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "Appearance");
    await expect(page.getByRole("heading", { name: "Appearance", level: 2 }).first()).toBeVisible();
    await page.mouse.move(600, 20); await page.waitForTimeout(300);
    await capture(page, "settings-1280");
  } finally { await app.close(); await fixture.close(); }
});

test("captures the approval card and a long completed conversation", async () => {
  test.setTimeout(120_000);
  const approvalFixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf GENERATED_DESIGN_AUDIT", timeoutMs: 2000 } } });
  await approvalFixture.configure(); await approvalFixture.send("Generated approval request for the design audit.");
  await waitFor(() => approvalFixture.session().pendingApproval);
  let app = await launch(approvalFixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toBeVisible();
    await resize(app, page, 1280, 800); await capture(page, "approval-1280");
    await resize(app, page, 760, 800); await capture(page, "approval-760");
  } finally { await app.close(); await approvalFixture.close(); }

  const textFixture = await setupFixture({ responseMode: "text", replyText: LONG_REPLY });
  await textFixture.configure(); await textFixture.send("Generated long conversation for the design audit.");
  await waitFor(() => textFixture.session().status === "completed");
  app = await launch(textFixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".message.assistant").last()).toContainText("Generated review summary");
    await resize(app, page, 1280, 800); await capture(page, "conversation-1280");
    await resize(app, page, 760, 800); await capture(page, "conversation-760");
  } finally { await app.close(); await textFixture.close(); }
});

test("captures failed, stopped and diff states with the command palette", async () => {
  test.setTimeout(180_000);
  const provider = await setupFixture();
  await provider.configure(); await provider.send("generated provider failure");
  await waitFor(() => provider.session().status === "failed");
  let app = await launch(provider.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".message.notice")).toContainText("Generated unavailable provider");
    await resize(app, page, 1280, 800); await capture(page, "failed-model-1280");
  } finally { await app.close(); await provider.close(); }

  const slow = await setupFixture();
  await slow.configure(); await slow.send("generated slow design audit");
  await waitFor(() => slow.session().status === "running");
  const sdk = await new MoguriSdk(slow.service.connection).ready();
  await sdk.command({ type: "session.stop", sessionId: slow.sessionId }); await slow.terminal();
  app = await launch(slow.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".message.notice")).toContainText("Turn stopped");
    await resize(app, page, 1280, 800); await capture(page, "stopped-1280");
  } finally { await app.close(); await slow.close(); }

  const failing = await setupFixture();
  await failing.configure(); await failing.send("generated failing command for the design audit");
  await failing.approve(); await failing.terminal();
  app = await launch(failing.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".activity-row").first()).toBeVisible();
    await resize(app, page, 760, 800); await capture(page, "failed-command-760");
    await resize(app, page, 1280, 800);
    await openRail(page, "Code change");
    await capture(page, "code-change-folder-1280");
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog", { name: "Commands", exact: true })).toBeVisible();
    await page.waitForTimeout(200); await capture(page, "palette-1280");
    await page.keyboard.press("Escape");
  } finally { await app.close(); await failing.close(); }

  const repository = await setupFixture();
  await generatedRepository(repository.project);
  await writeFile(repository.project + "/fixture.txt", ["Generated replacement line.", "Generated added line for the design audit.", ""].join("\n"));
  app = await launch(repository.directory);
  try {
    const page = await app.firstWindow();
    await resize(app, page, 1280, 800);
    await openRail(page, "Code change");
    await expect(page.locator(".unified-diff")).toContainText("Generated added line");
    await capture(page, "code-change-diff-1280");
  } finally { await app.close(); await repository.close(); }
});

test("captures the supporting dashboard, automation, suggestion and budget pages", async () => {
  test.setTimeout(120_000);
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure(); await fixture.send("Generated supporting-page message.");
  await waitFor(() => fixture.session().status === "completed");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await resize(app, page, 1280, 800);
    await openResource(page, "Dashboard");
    const pages = page.getByRole("navigation", { name: "Dashboard pages", exact: true });
    await pages.getByRole("button", { name: "Analytics", exact: true }).click(); await page.waitForTimeout(600);
    await capture(page, "analytics-1280");
    await pages.getByRole("button", { name: "Cost", exact: true }).click(); await page.waitForTimeout(600);
    await capture(page, "cost-1280");
    await openResource(page, "Automations"); await capture(page, "automations-1280");
    await openResource(page, "Suggestions"); await capture(page, "suggestions-1280");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "Budgets");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await page.waitForTimeout(500); await page.mouse.move(600, 20);
    await capture(page, "settings-budgets-1280");
  } finally { await app.close(); await fixture.close(); }
});
