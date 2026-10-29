import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk, effectiveToolPreferences } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Generated command/settings clients use hidden native Electron.");

test("the requested factory ranking is active immediately and actual keyboard reordering persists without granting permission", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready(), app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "MCP gateway");
    const list = page.getByRole("list", { name: "Tool preference order", exact: true });
    await expect(list.getByRole("listitem").first()).toContainText("MCP via Gateway");
    await expect(list.getByRole("listitem").last()).toContainText("CLI");
    const handle = list.getByRole("button", { name: "Reorder CLI", exact: true });
    for (let index = 2; index >= 0; index--) {
      await handle.press("Alt+ArrowUp");
      await expect.poll(() => effectiveToolPreferences(sdk.settings.get()?.values.toolPreferences).order.indexOf("cli")).toBe(index);
    }
    await expect(list.getByRole("listitem").first()).toContainText("CLI");
    expect(sdk.settings.get()?.values.permissions.tools).toEqual([]);
    await page.reload(); await openSettingsSection(page, "MCP gateway");
    await expect(list.getByRole("listitem").first()).toContainText("CLI");
    await page.getByRole("button", { name: "Reset tool preference order", exact: true }).click();
    await expect.poll(() => effectiveToolPreferences(sdk.settings.get()?.values.toolPreferences).order[0]).toBe("mcp-gateway");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("an actual held preset stays inert and spawn creates a real manually governed child with its exact task", async () => {
  const f = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure(); await sdk.refresh();
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/impeccable Generated explicit UI work."); await input.press("Meta+Enter");
    await expect.poll(() => f.session().queue[0]?.held).toBe(true);
    expect(f.requests).toHaveLength(0);
    await sdk.command({ type: "session.resume", sessionId: f.sessionId });
    await expect.poll(() => f.session().status).toBe("completed");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await input.fill("/spawn Generated actual child assignment."); await input.press("Enter");
    await expect.poll(() => f.service.controller.snapshot().sessions.find((session) => session.createdParentSessionId === f.sessionId)?.status).toBe("completed");
    const child = f.service.controller.snapshot().sessions.find((session) => session.createdParentSessionId === f.sessionId)!;
    expect(child.controls.autonomy).toBe("Manual");
    await expect(page.getByRole("heading", { name: "Subsession", exact: true })).toBeVisible();
    await expect(page.getByRole("log", { name: "Session transcript", exact: true })).toContainText("Generated actual child assignment.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.requests).toHaveLength(2);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("a failed ranking save keeps the local order visible and a concurrent client cannot silently replace it", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready(), app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "MCP gateway");
    const list = page.getByRole("list", { name: "Tool preference order", exact: true });
    f.service.store.db.exec("CREATE TRIGGER generated_ranking_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='settings.updated' BEGIN SELECT RAISE(ABORT,'Generated ranking save failure'); END;");
    await list.getByRole("button", { name: "Reorder CLI", exact: true }).press("Alt+ArrowUp");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Unsaved changes");
    await expect(list.getByRole("listitem").nth(2)).toContainText("CLI");
    expect(effectiveToolPreferences(sdk.settings.get()?.values.toolPreferences).order[3]).toBe("cli");
    f.service.store.db.exec("DROP TRIGGER generated_ranking_failure");
    const before = sdk.settings.get()!;
    await sdk.settings.update({ ...before.values, appearance: { ...before.values.appearance, theme: "light" } }, before.revision);
    await expect(page.getByRole("alert")).toContainText("Another client changed settings");
    await expect(list.getByRole("listitem").nth(2)).toContainText("CLI");
    await page.getByRole("button", { name: "Reload current settings", exact: true }).click();
    await expect(list.getByRole("listitem").last()).toContainText("CLI");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(sdk.settings.get()?.values.appearance.theme).toBe("light");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
