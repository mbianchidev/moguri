import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { appearanceColors, colorContrast, defaultProjectConfiguration, isRecord, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Project color interactions use generated hidden macOS fixtures.");

test("project context menus offer rainbow presets and preserve project settings, grouping and saved color", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const projectId = fixture.session().projectId, group = await sdk.projects.folder("Generated color folder");
  const configuration = (await sdk.projects.configuration(projectId)).configuration;
  await sdk.projects.organize(projectId, { folderId: group.id!, order: 4, color: "#123456" }, configuration.revision);
  const before = (await sdk.projects.configuration(projectId)).configuration;
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), project = page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "project", exact: true });
    await project.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Project actions for project", exact: true });
    await expect(menu).toBeVisible();
    for (const name of ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"]) {
      const choice = menu.getByRole("menuitemradio", { name, exact: true });
      await expect(choice).toBeVisible();
      const bounds = await choice.boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.width, `${name} pointer target width`).toBeGreaterThanOrEqual(24);
      expect(bounds!.height, `${name} pointer target height`).toBeGreaterThanOrEqual(24);
      const color = await choice.locator(".project-color-swatch").evaluate((element) => {
        const channels = getComputedStyle(element).backgroundColor.match(/\d+/g);
        if (!channels || channels.length !== 3) throw new Error("A preset must expose an opaque RGB swatch.");
        return "#" + channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
      });
      for (const mode of ["dark", "light"] as const) {
        const theme = appearanceColors({ theme: mode }, mode);
        expect(colorContrast(color, theme.sidebar), `${name} icon in ${mode}`).toBeGreaterThanOrEqual(3);
        expect(colorContrast(color, theme.surface), `${name} swatch in ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
    await menu.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
    await expect(menu).toHaveCount(0);
    const current = () => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === projectId)!;
    await expect.poll(() => current().color).toBe("#3b82f6");
    expect(current().folderId).toBe(group.id); expect(current().order).toBe(4); expect(current().values).toEqual(before.values);
    await expect(project.locator(".project-color")).toHaveCSS("color", "rgb(59, 130, 246)");
    await page.reload();
    await project.click({ button: "right" });
    await expect(menu.getByRole("menuitemradio", { name: "Blue", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("project colors work from keyboard context menus and the actions trigger toggles the same menu", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), project = page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "project", exact: true });
    const trigger = page.getByRole("button", { name: "Project actions for project", exact: true });
    const menu = page.getByRole("menu", { name: "Project actions for project", exact: true });
    await project.focus(); await project.press("Shift+F10");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0); await expect(project).toBeFocused();
    await trigger.click(); await expect(menu).toBeVisible();
    await trigger.click(); await expect(menu).toHaveCount(0);
    await trigger.click(); await page.keyboard.press("Home");
    await expect(menu.getByRole("menuitemradio", { name: "Red", exact: true })).toBeFocused();
    for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowRight");
    await expect(menu.getByRole("menuitemradio", { name: "Blue", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().projectConfigurations[0]?.color).toBe("#3b82f6");
    await expect(trigger).toBeFocused();
    await trigger.click(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowLeft");
    await expect(menu.getByRole("menuitemradio", { name: "Violet", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect.poll(() => fixture.service.controller.snapshot().projectConfigurations[0]?.color).toBe("#a855f7");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("custom project colors save only on confirmation, can reset, and no longer live in project settings", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  const projectId = fixture.session().projectId, defaultColor = defaultProjectConfiguration(projectId).color;
  const currentColor = () => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === projectId)?.color ?? defaultColor;
  try {
    const page = await app.firstWindow(), trigger = page.getByRole("button", { name: "Project actions for project", exact: true });
    const menu = page.getByRole("menu", { name: "Project actions for project", exact: true });
    await trigger.click(); await menu.getByRole("menuitem", { name: "Custom color...", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Project color", exact: true });
    await dialog.getByLabel("Custom project color", { exact: true }).fill("#7860a3");
    expect(currentColor()).toBe(defaultColor);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(currentColor()).toBe(defaultColor);
    await trigger.click(); await menu.getByRole("menuitem", { name: "Custom color...", exact: true }).click();
    await dialog.getByLabel("Custom project color", { exact: true }).fill("#7860a3");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(currentColor).toBe("#7860a3");
    await expect(trigger).toBeFocused();
    await trigger.click(); await menu.getByRole("menuitemradio", { name: "Default color", exact: true }).click();
    await expect.poll(currentColor).toBe(defaultColor);
    await trigger.click(); await expect(menu.getByRole("menuitemradio", { name: "Default color", exact: true })).toHaveAttribute("aria-checked", "true");
    await menu.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("region", { name: "Per-project settings" })).toBeVisible();
    await expect(page.getByLabel("Icon color for project", { exact: true })).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("pending color changes reject stale revisions visibly and preserve a newer project move before explicit retry", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const projectId = fixture.session().projectId, group = await sdk.projects.folder("Generated concurrent color folder");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let attempts = 0;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "project.organize" && raw.command.color === "#3b82f6" && ++attempts === 1) await gate.promise;
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), trigger = page.getByRole("button", { name: "Project actions for project", exact: true });
    const menu = page.getByRole("menu", { name: "Project actions for project", exact: true });
    await trigger.click(); await menu.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
    await expect.poll(() => attempts).toBe(1);
    await trigger.click();
    await expect(menu.getByRole("menuitemradio", { name: "Red", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    const configuration = (await sdk.projects.configuration(projectId)).configuration;
    await sdk.projects.organize(projectId, { folderId: group.id!, order: 7, color: configuration.color }, configuration.revision);
    gate.resolve();
    await expect(page.getByRole("alert")).toContainText(/changed|revision/i);
    const current = () => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === projectId)!;
    expect(current().color).toBe(configuration.color); expect(current().folderId).toBe(group.id); expect(current().order).toBe(7);
    expect(attempts).toBe(1);
    await trigger.click(); await menu.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
    await expect.poll(() => current().color).toBe("#3b82f6");
    expect(attempts).toBe(2); expect(current().folderId).toBe(group.id); expect(current().order).toBe(7);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the project named by the context menu owns its color even when another project's session is selected", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const path = join(fixture.directory, "generated-other-colors"); await mkdir(path);
  const other = await sdk.command({ type: "project.add", path }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: fixture.session().title, exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "generated-other-colors", exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: "Project actions for generated-other-colors", exact: true }).getByRole("menuitemradio", { name: "Red", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === other.id)?.color).toBe("#ef4444");
    expect(fixture.service.controller.snapshot().projectConfigurations.find((entry) => entry.projectId === fixture.session().projectId)?.color ?? defaultProjectConfiguration(fixture.session().projectId).color).toBe("#a8d7bc");
    await expect(page.getByRole("heading", { name: fixture.session().title, exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
