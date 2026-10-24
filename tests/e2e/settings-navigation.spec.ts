import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop settings are qualified on macOS.");

test("searchable grouped settings preserve edits and keep global resources off the session rail", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const rail = page.getByRole("navigation", { name: "Sidebar panels" });
    for (const name of ["Suggestions", "Dashboard", "Artifacts", "Candidates", "Sandbox", "Attention"]) {
      await expect(rail.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    const navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    await expect(navigation.getByRole("button", { name: "Manage profiles", exact: true })).toHaveCount(0);
    await expect(navigation.getByLabel("Active profile", { exact: true })).toHaveCount(0);
    const count = fixture.service.controller.snapshot().sessions.length;
    await navigation.getByRole("button", { name: "Suggestions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose a source chat", exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().sessions.length).toBe(count);
    await page.getByLabel("Resource source chat", { exact: true }).selectOption(fixture.sessionId);
    await expect(page.getByRole("region", { name: "Moguri suggestions", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeHidden();
    await navigation.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Active profile", { exact: true })).toBeVisible();
    const search = page.getByLabel("Search settings", { exact: true });
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await search.fill("readme readiness");
    await expect(categories.getByRole("button", { name: "User guidance", exact: true })).toBeVisible();
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    await page.getByLabel("Global user guidance", { exact: true }).fill("Generated unsaved settings guidance.");
    await search.fill("theme");
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.appearance.theme).toBe("light");
    expect(fixture.service.controller.snapshot().settings.values.instructions).toBe("");
    await search.fill("no-matching-generated-setting");
    await expect(categories).toContainText("No matching settings. Your edits are preserved.");
    await search.fill("readme");
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    await expect(page.getByLabel("Global user guidance", { exact: true })).toHaveValue("Generated unsaved settings guidance.");
    await page.getByRole("button", { name: "Save user guidance", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.instructions).toBe("Generated unsaved settings guidance.");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await navigation.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeHidden();
    await page.getByRole("button", { name: "Attention notifications", exact: true }).click();
    await expect(page.getByRole("region", { name: "Attention list", exact: true })).toBeVisible();
    await rail.getByRole("button", { name: "Insights", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeVisible();
    expect(fixture.requests.length).toBe(0);
    expect(failures).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
    await app.close(); await fixture.close();
  }
});
