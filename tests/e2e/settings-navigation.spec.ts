import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop settings are qualified on macOS.");

test("left global resources and the seven right session panels remain separate while searchable settings preserve edits", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });

  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const rail = page.getByRole("navigation", { name: "Sidebar panels" });
    await expect(rail.getByRole("button")).toHaveCount(7);
    expect(await rail.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(["Terminal", "Browser", "Insights", "Changes", "Files", "Plan", "Side chat"]);
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await expect(resources.getByRole("button")).toHaveText(["Dashboard", "Artifacts", "Candidates", "Sandbox", "Suggestions", "Global Terminal"]);
    await expect(rail.getByRole("button", { name: "Attention", exact: true })).toHaveCount(0);
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

test("legacy global preferences restore on the left without losing widths and an attached PR stays an auxiliary action", async () => {
  const url = "https://github.com/generated/project/pull/7";
  const fixture = await setupFixture({ platform: { integrations: { fetch: async () =>
    Response.json({ number: 7, html_url: url, state: "open", draft: false, merged: false, merged_at: null }) } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { prUrl: url });
  await waitFor(() => fixture.session().prObservation);
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("moguri.sidebar", JSON.stringify({ panel: "Dashboard", open: true, maximized: false, leftWidth: 248, rightWidth: 416 })));
    await page.reload();
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true }), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const dashboard = resources.getByRole("button", { name: "Dashboard", exact: true }), sidebar = page.getByRole("complementary", { name: "Session sidebar", exact: true });
    await expect(dashboard).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("main").getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(sidebar).toBeHidden(); await expect(rail.getByRole("button")).toHaveCount(7);
    await expect(rail.getByRole("button", { name: "PR", exact: true })).toHaveCount(0);
    await dashboard.click();
    const prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeVisible(); await expect(dashboard).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("separator", { name: "Resize projects sidebar", exact: true })).toHaveAttribute("aria-valuenow", "248");
    await expect(page.getByRole("separator", { name: "Resize session sidebar", exact: true })).toHaveAttribute("aria-valuenow", "416");
    await prompt.fill("/pr"); await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect(sidebar.getByRole("heading", { name: "Connected PR", exact: true })).toBeVisible();
    await expect(sidebar).toContainText(url); await expect(rail.getByRole("button")).toHaveCount(7);
    await sidebar.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    const insights = rail.getByRole("button", { name: "Insights", exact: true });
    await expect(insights).toBeFocused(); await insights.click();
    await expect(sidebar).toBeVisible();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/desktop-sidebar-placement.png", animations: "disabled" });
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
