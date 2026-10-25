import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { setupFixture } from "../fixture.ts";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The desktop experience is qualified on macOS.");

test("compact navigation, global suggestions and the four graphic dashboard pages", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), nav = page.getByRole("navigation", { name: "Projects and sessions", exact: true });
    await expect(nav.getByRole("button", { name: "New", exact: true })).toBeVisible();
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await expect(resources.getByRole("button")).toHaveText(["Dashboard", "Suggestions", "Automations", "Code change", "Work item", "Global Terminal"]);
    await expect(nav.getByRole("button", { name: "Settings", exact: true })).toHaveText("");
    await expect(nav.getByRole("button", { name: "ask Moguri", exact: true })).toHaveText("");
    const before = fixture.service.controller.snapshot().sessions.length;
    await resources.getByRole("button", { name: "Suggestions", exact: true }).click();
    await expect(page.getByRole("region", { name: "Moguri suggestions", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Usage gaps", exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().sessions.length).toBe(before);
    for (const name of ["Automations", "Code change", "Work item"]) {
      await resources.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("main").getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await resources.getByRole("button", { name: "Dashboard", exact: true }).click();
    const pages = page.getByRole("navigation", { name: "Dashboard pages", exact: true });
    for (const name of ["My work", "Usage", "Cost", "Velocity"]) {
      await pages.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("region", { name: `${name} dashboard`, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("Dashboard date range", { exact: true })).toHaveValue("7");
    await page.getByLabel("Dashboard date range", { exact: true }).selectOption("custom");
    const from = await page.getByLabel("Dashboard range from", { exact: true }).inputValue();
    expect(Number(from.slice(0, 4))).toBeGreaterThanOrEqual(new Date().getUTCFullYear() - 1);
    await expect(page.getByText("Not a measured productivity increase.", { exact: true })).toBeVisible();
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); await fixture.close(); }
});

test("settings explanations are keyboard tooltips and non-secret fields copy their actual values", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:copy-text");
      ipcMain.handle("moguri:copy-text", (_event, text: string) => { process.env.MOGURI_GENERATED_COPY = text; });
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", { name: "Settings categories", exact: true });
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
    const info = page.getByRole("button", { name: "About appearance", exact: true });
    await info.focus();
    await expect(page.getByRole("tooltip")).toContainText("factory theme");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    const field = page.getByLabel("Global user guidance", { exact: true });
    await field.fill("Generated copyable guidance.");
    await field.hover();
    await page.getByRole("button", { name: "Copy Global user guidance", exact: true }).click();
    expect(await app.evaluate(() => process.env.MOGURI_GENERATED_COPY)).toBe("Generated copyable guidance.");
    await expect(field).toHaveValue("Generated copyable guidance.");
    await page.getByRole("button", { name: "Save user guidance", exact: true }).click();
    await categories.getByRole("button", { name: "Local models", exact: true }).click();
    for (const password of await page.locator('input[type="password"]').all()) {
      await expect(password.locator("..").getByRole("button", { name: /^Copy / })).toHaveCount(0);
    }
    for (const label of ["Artifacts", "Candidates", "Sandbox"]) await expect(categories.getByRole("button", { name: label, exact: true })).toBeVisible();
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); await fixture.close(); }
});

test("small real cost estimates remain graphically visible and saved skill folders refresh without inference", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, budgets: { ...settings.values.budgets, rates: [{ modelId: fixture.modelId, inputUsdPerMillion: 1, outputUsdPerMillion: 2, source: "user-estimate", effectiveAt: new Date().toISOString().slice(0, 10) }] } }, settings.revision);
  await fixture.send("Generated dashboard graph fixture."); await fixture.terminal();
  const root = join(fixture.directory, "generated-desktop-skills");
  await mkdir(root); await writeFile(join(root, "SKILL.md"), "---\nname: generated-desktop-review\ndescription: Review generated desktop changes\n---\nUse the original generated evidence.\n");
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await resources.getByRole("button", { name: "Dashboard", exact: true }).click();
    const pages = page.getByRole("navigation", { name: "Dashboard pages", exact: true });
    await pages.getByRole("button", { name: "Cost", exact: true }).click();
    const chart = page.getByRole("region", { name: "Estimated cost (USD)", exact: true });
    await expect(chart.locator("circle")).toHaveCount(7);
    expect(await chart.locator("circle").evaluateAll((points) => Math.min(...points.map((point) => Number(point.getAttribute("cy")))))).toBeLessThan(40);
    await chart.getByText("Chart data", { exact: true }).click();
    await expect(chart.getByRole("table")).toContainText("0.000054");
    await chart.getByText("Chart data", { exact: true }).click();
    await page.getByLabel("Dashboard date range", { exact: true }).selectOption("30");
    await expect(chart.locator("circle")).toHaveCount(30);
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/workspace-cost-dashboard.png", animations: "disabled" });
    await pages.getByRole("button", { name: "Usage", exact: true }).click();
    await page.screenshot({ path: ".moguri/artifacts/workspace-usage-dashboard.png", animations: "disabled" });
    await pages.getByRole("button", { name: "My work", exact: true }).click();
    await page.screenshot({ path: ".moguri/artifacts/workspace-my-work-dashboard.png", animations: "disabled" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories", exact: true }).getByRole("button", { name: "Skill gateway", exact: true }).click();
    const gateway = page.getByRole("region", { name: "Skill gateway settings", exact: true });
    await gateway.getByLabel("Skill source name", { exact: true }).fill("Generated desktop skills");
    await gateway.getByLabel("Skill source location", { exact: true }).fill(root);
    await gateway.getByRole("button", { name: "Add source", exact: true }).click();
    await gateway.getByRole("button", { name: "Save skill sources", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.skillSources?.length).toBe(1);
    await gateway.getByRole("button", { name: "Find skills", exact: true }).click();
    await expect(gateway).toContainText("generated-desktop-review");
    await gateway.getByRole("button", { name: "Read skill", exact: true }).click();
    await expect(gateway.locator("pre")).toContainText("Use the original generated evidence.");
    await writeFile(join(root, "SKILL.md"), "---\nname: generated-desktop-review\ndescription: Review generated desktop changes\n---\nChanged generated evidence.\n");
    await gateway.getByRole("button", { name: "Read skill", exact: true }).click();
    await expect(gateway.getByRole("alert")).toContainText("changed");
    await expect(gateway.locator("pre")).toHaveCount(0);
    expect(fixture.requests.length).toBe(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
