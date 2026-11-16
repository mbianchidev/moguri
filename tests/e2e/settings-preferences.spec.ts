import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { appearanceColors, colorContrast, MoguriSdk, themePalettes, themeVariable } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Preferences UI is qualified on macOS.");
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
  await app.close();
};

test("instruction fields save independently, project overrides are real and default verbosity never changes an existing session", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), categories = page.getByRole("navigation", { name: "Settings categories" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await categories.getByRole("button", { name: "User guidance", exact: true }).click();
    await page.getByLabel("README sections", { exact: true }).fill("Generated README preference.");
    await page.getByLabel("Responses to the user", { exact: true }).fill("Generated pending reply style.");
    await page.getByRole("button", { name: "Save README sections", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.guidance?.readmeSections).toBe("Generated README preference.");
    expect(fixture.service.controller.snapshot().settings.values.guidance?.responseStyle).toBeUndefined();
    await expect(page.getByLabel("Responses to the user", { exact: true })).toHaveValue("Generated pending reply style.");
    await page.getByRole("button", { name: "Save Responses to the user", exact: true }).click();
    await page.getByLabel("Documentation style", { exact: true }).fill("Generated inherited documentation.");
    await page.getByRole("button", { name: "Save Documentation style", exact: true }).click();
    await categories.getByRole("button", { name: "Startup defaults", exact: true }).click();
    await page.getByLabel("Default response verbosity", { exact: true }).selectOption("dry");
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.startup.profile.verbosity).toBe("dry");
    expect(fixture.session().controls.verbosity).toBeUndefined();
    await categories.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByLabel("Override Documentation style", { exact: true }).check();
    await page.getByLabel("Project Documentation style", { exact: true }).fill("Generated project-only documentation.");
    await page.getByLabel("Override When debugging", { exact: true }).check();
    await page.getByLabel("Project When debugging", { exact: true }).fill("Generated unsaved debugging preference.");
    await page.getByRole("button", { name: "Save project Documentation style", exact: true }).click();
    const configuration = () => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === fixture.session().projectId)!;
    await expect.poll(() => configuration().values.guidance?.documentation).toBe("Generated project-only documentation.");
    expect(configuration().values.guidance?.debugging).toBe("");
    await expect(page.getByLabel("Project When debugging", { exact: true })).toHaveValue("Generated unsaved debugging preference.");
    await page.getByRole("button", { name: "Save project When debugging", exact: true }).click();
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); await fixture.close(); }
});

test("named and custom palettes update actual elements and reject unreadable custom text without replacing it", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Appearance", exact: true }).click();
    const palette = page.getByLabel("Color palette", { exact: true });
    await palette.selectOption("ocean");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("#a7cfea");
    await palette.selectOption("custom");
    await page.getByText("Custom element colors", { exact: true }).click();
    const text = page.getByLabel("Custom dark text", { exact: true });
    await text.fill("#191f29");
    await expect(page.getByRole("alert")).toContainText("contrast");
    await expect(text).toHaveValue("#191f29");
    expect(fixture.service.controller.snapshot().settings.values.appearance.custom?.dark?.text).toBeUndefined();
    const accent = page.getByLabel("Custom dark accent", { exact: true });
    await accent.fill("#b9e5cb");
    await expect(page.getByRole("alert")).toContainText("contrast");
    await expect(text).toHaveValue("#191f29");
    expect(fixture.service.controller.snapshot().settings.values.appearance.custom?.dark).toBeUndefined();
    await text.fill("#e1e8f0");
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.appearance.custom?.dark).toMatchObject({ accent: "#b9e5cb", text: "#e1e8f0" });
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.reload();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text").trim())).toBe("#e1e8f0");
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); await fixture.close(); }
});

test("the complete shared preset catalogue colors real desktop controls in both modes and survives reload", async ({}, info) => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Appearance", exact: true }).click();
    const palette = page.getByLabel("Color palette", { exact: true }), mode = page.getByLabel("Theme", { exact: true });
    expect(await palette.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(themePalettes.map((entry) => entry.id));
    for (const theme of ["light", "dark"] as const) {
      await mode.selectOption(theme);
      for (const { id } of themePalettes.filter((entry) => entry.id !== "custom")) {
        await palette.selectOption(id);
        const colors = appearanceColors({ theme, palette: id }, theme), variables = Object.keys(colors).map(themeVariable);
        await expect.poll(() => page.evaluate((keys) => Object.fromEntries(keys.map((key) =>
          [key, getComputedStyle(document.documentElement).getPropertyValue(key).trim()])), variables)).toEqual(
          Object.fromEntries(Object.entries(colors).map(([key, value]) => [themeVariable(key), value])));
        const actual = await palette.evaluate((element) => {
          const css = getComputedStyle(element), hex = (color: string) => {
            const channels = color.match(/\d+/g);
            if (!channels || channels.length !== 3) throw new Error(`Expected an opaque control color, got ${color}.`);
            return "#" + channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
          };
          return { text: hex(css.color), background: hex(css.backgroundColor), border: hex(css.borderTopColor) };
        });
        expect(colorContrast(actual.text, actual.background), `${id} ${theme} actual select text`).toBeGreaterThanOrEqual(4.5);
        expect(colorContrast(actual.border, actual.background), `${id} ${theme} actual select boundary`).toBeGreaterThanOrEqual(3);
      }
    }
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await expect.poll(() => sdk.settings.get()?.values.appearance.palette).toBe("crystal");
    await page.screenshot({ path: info.outputPath("shared-crystal-theme.png") });
    await page.reload();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim())).toBe("#0b1536");
    expect(errors).toEqual([]); expect(fixture.requests.length).toBe(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});

test("session management deletes only the confirmed actual session and preserves independent artifacts", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const artifact = await sdk.artifacts.create(fixture.sessionId, { kind: "decision", name: "Generated independent settings document", text: "Generated retained settings content." });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Retention", exact: true }).click();
    await expect(page.getByLabel("Completed archive days", { exact: true })).toHaveValue("7");
    await expect(page.getByLabel("Archived retention days", { exact: true })).toHaveValue("7");
    await page.getByLabel("Completed archive days", { exact: true }).fill("11");
    await page.getByLabel("Archived retention days", { exact: true }).fill("13");
    await page.getByRole("button", { name: "Save archive age", exact: true }).click();
    await expect.poll(() => sdk.settings.get()?.values.retention.archiveAfterDays).toBe(11);
    expect(sdk.settings.get()?.values.retention.afterDays).toBe(7);
    await expect(page.getByLabel("Archived retention days", { exact: true })).toHaveValue("13");
    await page.getByRole("button", { name: "Save retention age", exact: true }).click();
    await page.getByLabel("Stored session", { exact: true }).selectOption(fixture.sessionId);
    await page.getByRole("button", { name: "Review session deletion", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Delete stored session", exact: true });
    await expect(review.getByRole("button", { name: "Delete stored session", exact: true })).toBeDisabled();
    await review.getByLabel("I confirm deletion of this stored session, its unsent content and originating candidates.", { exact: true }).check();
    await review.getByRole("button", { name: "Delete stored session", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.length).toBe(0);
    expect((await sdk.artifacts.read(artifact.id!)).text).toBe("Generated retained settings content.");
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});
