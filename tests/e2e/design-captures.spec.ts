import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { setupFixture, waitFor } from "../fixture.ts";

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
    const categories = page.getByRole("navigation", { name: "Settings categories", exact: true });
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
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
