import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedRepository } from "../fixtures/git.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Design-system interaction is qualified on generated hidden macOS windows.");

const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
const LONG_TOKEN = "GENERATED_UNBROKEN_".repeat(24);
const REPLY = ["## Generated review", "", `A long generated path ${LONG_TOKEN} must wrap.`, "", "```ts",
  `const generated = "${"x".repeat(320)}";`, "```"].join("\n");

async function tabTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab" = "Tab", limit = 90) {
  for (let step = 0; step <= limit; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`Keyboard focus never reached the target with ${key}.`);
}
async function expectFocusRing(target: Locator) {
  await expect(target).toBeFocused();
  const ring = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { visible: element.matches(":focus-visible"), style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(ring.visible).toBe(true);
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
}
async function viewport(app: ElectronApplication, page: Page, width: number, height = 800) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(Math.max(840, size.width), size.height), { width, height });
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);
const unobstructed = (target: Locator) => target.evaluate((element) => {
  const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return box.width > 0 && box.bottom <= window.innerHeight && Boolean(hit && (hit === element || element.contains(hit)));
});

test("keyboard alone moves from session to compose, approval and review with a visible focus ring and worded status", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf GENERATED_DESIGN_SYSTEM", timeoutMs: 2000 } }, replyText: REPLY });
  await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeVisible();
    await viewport(app, page, 1280);
    const insights = page.locator(".context-binding .status-badge");
    await expect(insights).toHaveText("Idle");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const sessionLink = page.getByRole("navigation", { name: "Projects and sessions", exact: true }).locator(".session-link").first();
    await tabTo(page, sessionLink); await expectFocusRing(sessionLink);
    await page.keyboard.press("Enter");
    await tabTo(page, prompt); await expectFocusRing(prompt);
    await page.keyboard.type("Generated keyboard-only design system request.");
    await page.keyboard.press("Enter");

    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toBeVisible();
    await expect(approval.locator(".approval-heading")).toContainText("Your approval is required");
    await expect(approval).toContainText("on your Mac without sandbox isolation");
    await expect(insights).toHaveText("Needs attention");
    await expect(insights).toHaveAttribute("data-tone", "attention");
    await expect(sessionLink).toHaveAttribute("aria-description", /Permission or approval needed/);
    const approve = approval.getByRole("button", { name: "Approve this action", exact: true });
    await tabTo(page, approve, "Shift+Tab"); await expectFocusRing(approve);
    expect(fixture.session().pendingApproval).toBeTruthy();
    await page.keyboard.press("Enter");

    await waitFor(() => fixture.session().status === "completed");
    await expect(approval).toHaveCount(0);
    await expect(insights).toHaveText("Completed");
    await expect(sessionLink.locator('.session-mark[data-session-state="completed"]')).toHaveAttribute("aria-label", /Session completed/);
    const code = page.locator(".message.assistant pre[tabindex='0']").last();
    await expect(code).toBeVisible();
    await tabTo(page, code, "Shift+Tab"); await expectFocusRing(code);
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(fixture.requests.length).toBe(2);
  } finally { await app.close(); await fixture.close(); }
});

test("narrow layouts keep pending approvals and the composer reachable without horizontal overflow", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: `printf ${LONG_TOKEN}`, timeoutMs: 2000 } } });
  await fixture.configure(); await fixture.send(`Generated narrow request ${LONG_TOKEN}`);
  await waitFor(() => fixture.session().pendingApproval);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toBeVisible();
    await expect(page.locator(".context-pane")).toBeVisible();
    const approve = approval.getByRole("button", { name: "Approve this action", exact: true }), deny = approval.getByRole("button", { name: "Deny", exact: true });
    const send = page.getByRole("form", { name: "Message composer", exact: true }).getByRole("textbox", { name: "Prompt", exact: true });
    for (const width of [1280, 840, 760, 600, 420]) {
      await viewport(app, page, width);
      expect(await noHorizontalOverflow(page), `${width}px overflows horizontally`).toBe(true);
      await expect(page.locator(".context-pane")).toBeVisible();
      expect(await unobstructed(approve), `${width}px covers Approve`).toBe(true);
      expect(await unobstructed(deny), `${width}px covers Deny`).toBe(true);
      expect(await unobstructed(send), `${width}px covers the prompt`).toBe(true);
      await expect(page.locator(".context-binding .status-badge")).toHaveText("Needs attention");
    }
    expect(fixture.session().pendingApproval).toBeTruthy();
    expect(fixture.requests.length).toBe(1);
  } finally { await app.close(); await fixture.close(); }
});

test("failed, stopped, non-Git and diff states stay distinct, worded and reachable", async () => {
  const failed = await setupFixture();
  await failed.configure(); await failed.send("generated provider failure");
  await waitFor(() => failed.session().status === "failed");
  let app = await launch(failed.directory);
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer", exact: true });
    await expect(page.locator('.message.notice[data-tone="failed"]')).toContainText("Generated unavailable provider");
    const action = composer.getByRole("button", { name: /^(Resume|Retry last model request)$/ });
    await expect(action).toBeVisible(); await expect(action).toHaveText("");
    await expect(action).toHaveClass(/icon-button/);
    const pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Code change", exact: true }).click();
    await expect(pane.getByRole("status").filter({ hasText: "isn't a Git repository" })).toBeVisible();
    await expect(pane.getByRole("alert")).toHaveCount(0);
    await pane.getByText("Details", { exact: true }).click();
    await expect(pane.locator(".panel-empty-detail")).toContainText("not a git repository");
    await page.keyboard.press("Meta+k");
    const search = page.getByRole("dialog", { name: "Commands", exact: true }).getByRole("searchbox", { name: "Find a command", exact: true });
    await expect(search).toBeFocused();
    await search.fill("generated-no-such-command");
    await expect(page.getByRole("dialog", { name: "Commands", exact: true }).getByRole("status")).toContainText("No command matches");
    await page.keyboard.press("Escape");
    expect(failed.requests.length).toBe(1);
  } finally { await app.close(); await failed.close(); }

  const stopped = await setupFixture();
  await stopped.configure(); await stopped.send("generated slow design-system stop");
  await waitFor(() => stopped.session().status === "running");
  const sdk = await new MoguriSdk(stopped.service.connection).ready();
  await sdk.command({ type: "session.stop", sessionId: stopped.sessionId }); await stopped.terminal();
  app = await launch(stopped.directory);
  try {
    const page = await app.firstWindow();
    const notice = page.locator(".message.notice").filter({ hasText: "Turn stopped" });
    await expect(notice).toHaveAttribute("data-tone", "stopped");
    await expect(notice.locator(".status-badge")).toHaveText("Stopped");
  } finally { await app.close(); await stopped.close(); }

  const repository = await setupFixture();
  await generatedRepository(repository.project);
  await writeFile(join(repository.project, "fixture.txt"), "Generated design-system replacement.\n");
  app = await launch(repository.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Code change", exact: true }).click();
    const diff = page.getByRole("complementary", { name: "Session sidebar", exact: true }).locator(".unified-diff");
    await expect(diff.locator('.diff-line[data-kind="add"]')).toHaveText("+Generated design-system replacement.");
    await expect(diff.locator('.diff-line[data-kind="remove"]')).toHaveText("-generated original");
    await expect(diff.locator('.diff-line[data-kind="hunk"]')).toHaveCount(1);
    await expect(diff).toHaveAttribute("tabindex", "0");
  } finally { await app.close(); await repository.close(); }
});
