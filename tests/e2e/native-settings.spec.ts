import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { startService } from "../../apps/service/src/server.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop settings qualification is macOS-only.");
test("root menu preference and reviewed whole-store move use real generated storage without a tray, picker or relaunch", async () => {
  const fixture = await setupFixture(), stateDir = join(fixture.directory, "state"), locatorDirectory = join(fixture.directory, "location"), destination = join(fixture.directory, "new-storage");
  await fixture.service.close();
  const service = await startService({ stateDir, provider: fixture.provider, retentionKey: fixture.retentionKey, storage: { locatorDirectory, explicitOverride: false } });
  const sdk = await new MoguriSdk(service.connection).ready(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_STATE_DIR_EXPLICIT: "0", MOGURI_LOCATION_DIR: locatorDirectory, MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_STORAGE_DESTINATION: destination },
  });
  try {
    const page = await app.firstWindow(), categories = page.getByRole("navigation", { name: "Settings categories" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const menu = page.getByLabel("Show Moguri in the menu bar", { exact: true });
    await expect(menu).toBeChecked(); await menu.uncheck();
    await expect.poll(async () => (await sdk.application.status()).configuration.values.menuBar).toBe(false);
    expect(await page.evaluate(() => window.moguri.applyApplicationPreferences())).toEqual({ menuBar: false, suppressed: true });
    await categories.getByRole("button", { name: "Retention", exact: true }).click();
    await page.getByRole("button", { name: "Choose storage parent", exact: true }).click();
    await expect(page.getByLabel("Session storage location", { exact: true })).toHaveValue(destination);
    await page.getByRole("button", { name: "Review storage relocation", exact: true }).click();
    const move = page.getByRole("button", { name: "Move and restart Moguri with relocated storage", exact: true });
    await expect(move).toBeDisabled();
    await page.getByLabel("I reviewed the exact source, destination, retained resources and restart impact", { exact: true }).check();
    await move.click();
    await expect(page.getByText(/Restart was suppressed in the generated hidden window/)).toBeVisible();
    expect(fixture.requests.length).toBe(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await service.close(); await fixture.close();
  }
});
