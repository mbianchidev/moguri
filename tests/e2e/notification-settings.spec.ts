import { _electron as electron, expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defaultNotificationWav, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop settings qualification is macOS-only.");
test("explicit sound snapshots, separate auto-saved event choices and native preview never play real audio in generated windows", async () => {
  const fixture = await setupFixture(), path = join(fixture.directory, "Generated alert.wav");
  await writeFile(path, defaultNotificationWav("needs-input"), { mode: 0o600 });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SOUND_FILE: path },
  });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Notifications", exact: true }).click();
    await page.getByRole("button", { name: "Import notification sound", exact: true }).click();
    await expect.poll(() => sdk.notifications.list().length).toBe(1);
    const sound = sdk.notifications.list()[0]!;
    await page.getByRole("combobox", { name: "Needs input sound", exact: true }).selectOption(sound.id);
    await expect.poll(() => sdk.settings.get()?.values.notifications.needsInputSound?.id).toBe(sound.id);
    expect(sdk.settings.get()?.values.notifications.completedSound?.id).toBe("default");
    await page.getByRole("button", { name: "Preview needs input sound", exact: true }).click();
    await expect(page.getByText("Sound validated; playback is suppressed in the generated hidden window.", { exact: true })).toBeVisible();
    await page.getByLabel("Play a sound: session completed", { exact: true }).uncheck();
    await expect.poll(() => sdk.settings.get()?.values.notifications.completedSound?.enabled).toBe(false);
    await page.getByRole("combobox", { name: "Needs input sound", exact: true }).selectOption("default");
    await page.getByLabel("Confirm removal of Generated alert", { exact: true }).check();
    await page.getByRole("button", { name: "Remove Generated alert", exact: true }).click();
    await expect.poll(() => sdk.notifications.list().length).toBe(0);
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.requests).toEqual([]); expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});
