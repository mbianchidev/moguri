import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { localModelId } from "../../apps/service/src/model-registry.ts";
import { setupFixture } from "../fixture.ts";
import { openModelChoices, openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Availability controls use generated hidden macOS windows.");

test("long provider settings keep scrolling inside the viewport without moving app chrome or exposing blank space", async () => {
  const fixture = await setupFixture(), original = fixture.provider.state.models[0]!;
  const generated = Array.from({ length: 80 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return { ...original, id: `generated-scroll-${suffix}`, apiModelId: `generated-scroll-${suffix}`, name: `Generated settings model ${suffix}` };
  });
  fixture.provider.state.models.push(...generated); fixture.provider.onChange(); await fixture.configure();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Providers");
    const panel = page.getByRole("region", { name: "Provider and model availability", exact: true });
    const content = page.locator(".settings-content"), categories = page.getByRole("navigation", { name: "Settings categories" });
    const last = panel.getByRole("switch", { name: "Enable model generated-scroll-080", exact: true });
    await expect(panel.getByRole("switch", { name: /^Enable model / })).toHaveCount(81);
    const geometry = () => page.evaluate(() => {
      const element = (selector: string) => {
        const found = document.querySelector(selector);
        if (!(found instanceof HTMLElement)) throw new Error(`Generated settings element is missing: ${selector}`);
        return found;
      };
      const toolbar = element(".settings-toolbar").getBoundingClientRect(), body = element(".settings-content");
      const nav = element(".settings-layout > nav").getBoundingClientRect(), bounds = body.getBoundingClientRect();
      return { viewport: innerHeight, toolbar: { top: toolbar.top, bottom: toolbar.bottom },
        content: { top: bounds.top, bottom: bounds.bottom, height: body.clientHeight, scrollHeight: body.scrollHeight },
        nav: { top: nav.top, bottom: nav.bottom },
        document: { height: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, bodyHeight: document.body.getBoundingClientRect().height },
        shell: { top: element(".app-shell").getBoundingClientRect().top, bottom: element(".app-shell").getBoundingClientRect().bottom, scrollHeight: element(".app-shell").scrollHeight },
        offscreenLabels: Array.from(document.querySelectorAll<HTMLElement>(".sr-only")).map((label) => ({
          text: label.textContent, bottom: label.getBoundingClientRect().bottom, parent: label.offsetParent?.className,
        })).filter((label) => label.bottom > innerHeight).slice(-3),
        outerScroll: ["html", "body", ".app-shell", ".main-pane", ".settings-page", ".settings-layout"].map((selector) => element(selector).scrollTop) };
    });
    const contained = async () => {
      const value = await geometry();
      expect(value.outerScroll, JSON.stringify(value)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(value.document.height, JSON.stringify(value)).toBeCloseTo(value.viewport, 0);
      expect(value.shell.top).toBe(0);
      expect(value.shell.bottom).toBeCloseTo(value.viewport, 0);
      expect(value.toolbar.top).toBeGreaterThanOrEqual(0);
      expect(value.toolbar.bottom).toBeLessThan(value.viewport);
      expect(value.content.top).toBeGreaterThanOrEqual(value.toolbar.bottom - 1);
      expect(value.content.bottom).toBeCloseTo(value.viewport, 0);
      expect(value.nav.bottom).toBeCloseTo(value.viewport, 0);
      expect(value.content.height).toBeGreaterThan(100);
      expect(value.content.scrollHeight).toBeGreaterThan(value.content.height);
    };
    for (const [width, height] of [[2000, 1100], [1280, 800], [860, 620]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.width, size.height), { width, height });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await contained();
      await last.scrollIntoViewIfNeeded(); await last.focus();
      await expect(last).toBeInViewport({ ratio: 1 });
      const checked = await last.isChecked();
      await page.keyboard.press("Space");
      await expect(last).toBeChecked({ checked: !checked });
      await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
      await contained();
      await content.hover(); await page.mouse.wheel(0, 100000);
      await expect.poll(() => content.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(2);
      await page.mouse.wheel(0, 100000);
      await contained();
      const scrolledContent = await content.evaluate((element) => element.scrollTop);
      await categories.hover(); await page.mouse.wheel(0, 100000);
      // The seven-page rail usually fits; when it overflows it scrolls on its own, never the content.
      if (await categories.evaluate((element) => element.scrollHeight > element.clientHeight)) await expect.poll(() => categories.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(categories.getByRole("button", { name: "Restore all defaults", exact: true })).toBeInViewport({ ratio: 1 });
      expect(await content.evaluate((element) => element.scrollTop)).toBe(scrolledContent);
      await contained();
      const observed = await geometry();
      console.log(JSON.stringify({ primitive: "settings-scroll-containment", width, viewportHeight: observed.viewport,
        documentHeight: observed.document.height, contentHeight: observed.content.height, outerScroll: observed.outerScroll }));
      await openSettingsSection(page, "Appearance");
      await expect(page.getByRole("button", { name: "Back to session", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".settings-content").getByRole("heading", { name: "Appearance", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.querySelector(".app-shell")?.scrollTop)).toBe(0);
      await openSettingsSection(page, "Providers");
    }
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("disabling the current model leaves the composer unselected until another explicit choice, even after re-enable", async () => {
  const fixture = await setupFixture({ reasoning: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await sdk.refresh();
  await sdk.sessions.modelOptions(fixture.sessionId, { thinkingEffort: "high" }, undefined, true);
  await sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: fixture.session().draft.revision,
    text: "Generated draft waits for model selection.", attachments: [] });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await openSettingsSection(page, "Providers");
    const panel = page.getByRole("region", { name: "Provider and model availability", exact: true });
    await panel.getByRole("switch", { name: `Enable model ${fixture.modelId}`, exact: true }).uncheck();
    await expect.poll(() => fixture.session().controls.modelId).toBeNull();
    await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(composer.getByRole("button", { name: /^Model:/ })).toContainText("Select model");
    await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated draft waits for model selection.");
    await openSettingsSection(page, "Providers");
    await panel.getByRole("switch", { name: `Enable model ${fixture.modelId}`, exact: true }).check();
    await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await composer.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Generated Copilot model / }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await page.keyboard.press("Escape");
    await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the provider list can reduce twenty-one models to three and disabled models disappear from the picker and fail through /model", async () => {
  const fixture = await setupFixture();
  const original = fixture.provider.state.models[0]!, generated = Array.from({ length: 20 }, (_, index) => ({
    ...original, id: `generated-ui-model-${index + 1}`, apiModelId: `generated-ui-model-${index + 1}`, name: `Generated UI model ${index + 1}`,
  }));
  fixture.provider.state.models.push(...generated); fixture.provider.onChange(); await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Providers");
    const panel = page.getByRole("region", { name: "Provider and model availability", exact: true });
    await expect(panel.getByRole("switch", { name: /^Enable model / })).toHaveCount(21);
    for (const model of generated.slice(2)) {
      await panel.getByRole("switch", { name: `Enable model ${model.id}`, exact: true }).uncheck();
      await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
    }
    await expect(panel).toContainText("3 selectable / 21 known models.");
    await expect.poll(() => sdk.getState().snapshot!.provider.models.filter((model) => !model.synthetic).length).toBe(3);
    await panel.getByRole("searchbox", { name: "Search model availability", exact: true }).fill("GUIml20");
    await expect(panel.getByRole("group", { name: "Model generated-ui-model-20", exact: true })).toBeVisible();
    await panel.getByRole("searchbox", { name: "Search model availability", exact: true }).fill("");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(860, 680));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(860);
    expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/provider-model-availability.png" });
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const choices = await openModelChoices(page);
    await expect(choices.getByRole("menuitemradio")).toHaveCount(4);
    await expect(choices.getByRole("menuitemradio", { name: /^Generated UI model 3\b/ })).toHaveCount(0);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill(`/model ${generated[2]!.id}`);
    await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/available|disabled/i);
    expect(fixture.session().controls.modelId).toBe(fixture.modelId);
    await prompt.fill(""); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("duplicate models use an exclusive provider dropdown and provider switches retain unavailable choices instead of falling back", async () => {
  const fixture = await setupFixture({ exposeModels: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const local = localModelId("ui-choice", fixture.modelId), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, localModels: [{ id: "ui-choice", name: "Generated UI source", enabled: true,
    baseUrl: `${fixture.baseUrl}/v1`, auth: "none", models: [{ id: fixture.modelId, name: "Generated duplicate model", contextWindow: fixture.contextWindow, maxTokens: 128, imageInput: false }] }] }, settings.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Providers");
    const panel = page.getByRole("region", { name: "Provider and model availability", exact: true }), source = panel.getByRole("combobox", { name: `Provider for ${fixture.modelId}`, exact: true });
    await expect(source).toHaveValue("");
    await source.selectOption(local);
    await expect.poll(() => sdk.getState().snapshot!.provider.models.filter((model) => !model.synthetic).map((model) => model.id)).toEqual([local]);
    await panel.getByRole("switch", { name: "Enable provider Generated UI source", exact: true }).uncheck();
    await expect(source).toHaveValue(local);
    await expect(panel).toContainText("The selected provider is disabled.");
    await expect.poll(() => sdk.getState().snapshot!.provider.models.filter((model) => !model.synthetic).length).toBe(0);
    await panel.getByRole("switch", { name: "Enable provider GitHub Copilot", exact: true }).uncheck();
    await expect(page.getByRole("button", { name: "Refresh connection", exact: true })).toBeDisabled();
    expect(fixture.provider.state.status).toBe("connected");
    await panel.getByRole("switch", { name: "Enable provider GitHub Copilot", exact: true }).check();
    await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
    await expect(source).toHaveValue(local);
    await source.selectOption(fixture.modelId);
    await expect.poll(() => sdk.getState().snapshot!.provider.models.filter((model) => !model.synthetic).map((model) => model.id)).toEqual([fixture.modelId]);
    await panel.getByRole("switch", { name: `Enable model ${fixture.modelId}`, exact: true }).uncheck();
    await expect(panel).toContainText("Disabled in this profile.");
    await expect(panel.getByRole("status", { name: "Model availability saving", exact: true })).toHaveText("Changes save automatically.");
    expect(sdk.models.catalogue().models).toHaveLength(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
