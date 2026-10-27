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
