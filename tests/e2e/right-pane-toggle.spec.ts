import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { MoguriError, MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedRepository } from "../fixtures/git.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native pane-toggle qualification is macOS-only.");

test("Code change reports its pending read and recovers from failure without claiming a clean workspace", async () => {
  const fixture = await setupFixture(), gate = Promise.withResolvers<void>();
  await generatedRepository(fixture.project);
  await writeFile(join(fixture.project, "fixture.txt"), "Generated changed file.\n");
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let entered = false, fail = true;
  fixture.service.controller.platform.query = async (...args: Parameters<typeof query>) => {
    if (args[0].type === "session.git") {
      entered = true; await gate.promise;
      if (fail) throw new MoguriError("generated_diff_read", "Generated diff read unavailable. Retry the bound workspace.", 503);
    }
    return query(...args);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Code change", exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    const refresh = pane.getByRole("button", { name: "Refresh diff", exact: true });
    for (const [width, height] of [[1280, 900], [840, 620]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.width, size.height), { width, height });
      await page.screenshot({ path: test.info().outputPath(`changes-loading-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await expect(pane.getByRole("status")).toContainText("Loading changes");
    await expect(refresh).toBeDisabled();
    await expect(pane).not.toContainText("Working tree is clean");
    gate.resolve();
    await expect(pane.getByRole("alert")).toContainText("Generated diff read unavailable");
    await expect(refresh).toBeEnabled();
    fail = false; await refresh.press("Enter");
    await expect(pane.locator(".unified-diff")).toContainText("Generated changed file.");
    await expect(pane.getByRole("alert")).toHaveCount(0);
    await expect(pane.getByRole("status")).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.platform.query = query; await app.close(); await fixture.close(); }
});

test("pending plan reload locks the original edit and preserves it when the read fails", async () => {
  const fixture = await setupFixture(), gate = Promise.withResolvers<void>();
  await mkdir(join(fixture.project, "docs"));
  await writeFile(join(fixture.project, "docs/plan.md"), "Generated saved plan.\n");
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let paused = false, entered = false, fail = true;
  fixture.service.controller.platform.query = async (...args: Parameters<typeof query>) => {
    if (args[0].type === "plan.read" && paused) {
      entered = true; await gate.promise;
      if (fail) throw new MoguriError("generated_plan_read", "Generated plan read unavailable; your edit is preserved.", 503);
    }
    return query(...args);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Plan", exact: true }).click();
    await pane.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const editor = pane.getByRole("textbox", { name: "Project plan", exact: true }), reload = pane.getByRole("button", { name: "Reload plan", exact: true });
    await expect(editor).toHaveValue("Generated saved plan.\n");
    await editor.fill("Generated original unsaved plan edit.");
    paused = true; await reload.click(); await expect.poll(() => entered).toBe(true);
    for (const [width, height] of [[1280, 900], [840, 620]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.width, size.height), { width, height });
      await page.screenshot({ path: test.info().outputPath(`plan-loading-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await expect(editor).toBeDisabled();
    await expect(reload).toBeDisabled(); await expect(pane.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(pane.getByRole("status")).toContainText("Loading plan");
    await expect(editor).toHaveValue("Generated original unsaved plan edit.");
    await expect(pane).toContainText("Unsaved edit");
    gate.resolve();
    await expect(pane.getByRole("alert")).toContainText("Generated plan read unavailable");
    await expect(editor).toBeEditable(); await expect(editor).toHaveValue("Generated original unsaved plan edit.");
    fail = false; await reload.press("Enter");
    await expect(editor).toHaveValue("Generated saved plan.\n");
    await expect(pane.getByRole("status")).toHaveCount(0);
    expect(fixture.service.controller.snapshot().artifacts).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  } finally {
    gate.resolve(); fixture.service.controller.platform.query = query;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); });
    await app.close(); await fixture.close();
  }
});

test("each nonterminal right-pane icon opens its view and the same icon collapses back to the rail, including maximized and keyboard use", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    for (const name of ["Browser", "Insights", "Code change", "Files", "Plan", "Side chat"]) {
      const button = rail.getByRole("button", { name, exact: true });
      await button.click(); await expect(pane).toBeVisible();
      await button.click(); await expect(pane).toBeHidden(); await expect(rail).toBeVisible();
      await expect(button).toBeFocused(); await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(button).toHaveAttribute("aria-expanded", "false"); await expect(button).toHaveAttribute("aria-controls", "session-sidebar");
      await button.press("Enter"); await expect(pane).toBeVisible(); await expect(button).toHaveAttribute("aria-expanded", "true");
      await button.press("Enter"); await expect(pane).toBeHidden();
    }
    const browser = rail.getByRole("button", { name: "Browser", exact: true });
    await browser.click(); await pane.getByRole("button", { name: "Maximize session sidebar", exact: true }).click();
    await expect(page.getByRole("form", { name: "Message composer" })).toBeHidden();
    await browser.click(); await expect(pane).toBeHidden(); await expect(rail).toBeVisible();
    await expect(page.getByRole("form", { name: "Message composer" })).toBeVisible();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/desktop-right-pane-collapsed.png", animations: "disabled" });
    await page.reload(); await expect(pane).toBeHidden(); await expect(browser).toHaveAttribute("aria-expanded", "false");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("clicking Terminal again respects hide confirmation and opt-out, preserves the same running owner, and X still terminates directly", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const terminal = rail.getByRole("button", { name: "Terminal", exact: true }), pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await terminal.click(); await expect(input).toHaveAttribute("aria-disabled", "false");
    const owner = await waitFor(() => sdk.getState().snapshot!.terminals.find((entry) => entry.sessionId === fixture.sessionId));
    await terminal.click();
    const confirm = page.getByRole("dialog", { name: "Close terminal pane", exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Keep open", exact: true }).click();
    await expect(pane).toBeVisible(); await expect(terminal).toHaveAttribute("aria-expanded", "true");
    await expect(input).toBeFocused();
    await terminal.click(); await confirm.getByLabel("Do not ask me again when closing terminal", { exact: true }).check();
    await confirm.getByRole("button", { name: "Hide terminal", exact: true }).click();
    await expect(pane).toBeHidden(); await expect(terminal).toBeFocused();
    expect(sdk.getState().snapshot!.terminals.find((entry) => entry.id === owner.id)?.status).toBe("running");
    await terminal.press("Enter"); await expect(input).toHaveAttribute("aria-disabled", "false");
    expect(sdk.getState().snapshot!.terminals).toHaveLength(1);
    expect(sdk.getState().snapshot!.terminals[0]?.id).toBe(owner.id); expect(sdk.getState().snapshot!.terminals[0]?.pid).toBe(owner.pid);
    await terminal.press("Enter"); await expect(pane).toBeHidden(); await expect(confirm).toHaveCount(0);
    await terminal.click(); await expect(input).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true }).getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.find((entry) => entry.id === owner.id)?.status).toBe("closed");
    await expect(confirm).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the active Plan icon cannot collapse a dirty owned editor or write its unsaved contents", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const plan = rail.getByRole("button", { name: "Plan", exact: true }), pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await plan.click(); await pane.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const editor = pane.getByRole("textbox", { name: "Project plan", exact: true });
    await expect(editor).toBeEditable(); await editor.fill("Generated unsaved plan must stay here.");
    await expect(pane).toContainText("Unsaved edit");
    await plan.click(); await expect(pane).toBeVisible(); await expect(plan).toHaveAttribute("aria-expanded", "true");
    await expect(editor).toHaveValue("Generated unsaved plan must stay here.");
    await expect(page.getByRole("alert")).toContainText("Save your edit");
    expect(existsSync(join(fixture.project, "docs/plan.md"))).toBe(false);
    await pane.getByRole("button", { name: "Reload plan", exact: true }).click();
    await expect(editor).toHaveValue(""); await plan.click(); await expect(pane).toBeHidden();
    expect(fixture.requests).toHaveLength(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); });
    await app.close(); await fixture.close();
  }
});
