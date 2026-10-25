import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native pane-toggle qualification is macOS-only.");

test("each nonterminal right-pane icon opens its view and the same icon collapses back to the rail, including maximized and keyboard use", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const pane = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    for (const name of ["Browser", "Insights", "Changes", "Files", "Plan", "Side chat"]) {
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
    const owner = sdk.getState().snapshot!.terminals.find((entry) => entry.sessionId === fixture.sessionId)!;
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
