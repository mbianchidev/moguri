import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { startService } from "@moguri-dev/sdk/testing";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution is qualified on macOS.");
const launch = (stateDir: string) => electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });

test("closing the window saves an unsaved draft and an open queued-prompt edit first, then closes without asking", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 }), stateDir = join(fixture.directory, "state");
  await fixture.configure();
  let app = await launch(stateDir);
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await fixture.send("Please answer generated slow turn while editing.");
    await expect.poll(() => fixture.requests.length).toBe(1);
    await fixture.send("Generated queued prompt before editing.");
    const queued = page.getByRole("article", { name: "Queued message 1", exact: true });
    await queued.getByRole("button", { name: "Edit queued message 1", exact: true }).click();
    await page.getByRole("textbox", { name: "Edit queued message", exact: true }).fill("Generated queued prompt edited, never saved.");
    await page.getByLabel("Prompt", { exact: true }).fill("Generated composer draft typed right before closing.");
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0]!.close(), 0); });
    await closed;
    expect(fixture.session().draft.text).toBe("Generated composer draft typed right before closing.");
    expect(fixture.session().queue[0]?.text).toBe("Generated queued prompt edited, never saved.");
    expect(fixture.service.store.db.isOpen).toBe(true);
    app = await launch(stateDir); page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated composer draft typed right before closing.");
  } finally { await app.close().catch(() => undefined); await fixture.close(); }
});

test("reloading with an unsaved draft saves it and reloads instead of closing the app", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 }), stateDir = join(fixture.directory, "state");
  await fixture.configure();
  const app = await launch(stateDir);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated draft typed right before reloading.");
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0]!.webContents.reload(), 0); });
    await expect.poll(() => fixture.session().draft.text).toBe("Generated draft typed right before reloading.");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated draft typed right before reloading.");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(fixture.service.store.db.isOpen).toBe(true);
  } finally { await app.close().catch(() => undefined); await fixture.close(); }
});

test("after a quit, the restart prompt continues interrupted chats and can stop asking", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 }), stateDir = join(fixture.directory, "state");
  await fixture.configure();
  let app = await launch(stateDir), service: Awaited<ReturnType<typeof startService>> | undefined;
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await fixture.send("Please answer generated slow turn before quitting.");
    await expect.poll(() => fixture.requests.length).toBe(1);
    const quitting = app.waitForEvent("close");
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); });
    await quitting;
    expect(fixture.service.store.db.isOpen).toBe(false);
    service = await startService({ stateDir, provider: fixture.provider, retentionKey: fixture.retentionKey });
    expect(service.controller.snapshot().sessions.find((session) => session.id === fixture.sessionId)?.interruption?.cause).toBe("shutdown");
    app = await launch(stateDir); page = await app.firstWindow();
    const dialog = page.getByRole("dialog", { name: "Continue interrupted work", exact: true });
    await expect(dialog.getByRole("list", { name: "Interrupted chats" })).toContainText("Stopped mid-turn when Moguri quit");
    expect(fixture.requests).toHaveLength(1);
    await expect(dialog.getByRole("button", { name: "Continue all", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Interrupted work", exact: true })).toContainText("Stopped mid-turn when Moguri quit");
    await page.reload(); await expect(dialog).toBeVisible();
    await dialog.getByRole("checkbox", { name: "Don't ask again: continue all automatically after a restart" }).check();
    await dialog.getByRole("button", { name: "Continue all", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => fixture.requests.length).toBe(2);
    expect(JSON.stringify(fixture.requests[1]!.messages)).toContain('moguri-workflow name=\\"continue\\"');
    const sdk = await new MoguriSdk(service.connection).ready();
    expect(sdk.settings.get()?.values.interactions.continueInterrupted).toBe("always");
    sdk.disconnect();
  } finally { await app.close().catch(() => undefined); await service?.close(); await fixture.close(); }
});
