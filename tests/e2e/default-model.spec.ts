import { _electron as electron, expect, test, type Page, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Shared model defaults are qualified with generated hidden macOS fixtures.");
const startup = async (page: Page) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Startup defaults", exact: true }).click();
};
const saved = (page: Page) => expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");

test("global fixed model/effort and last explicit selection drive new Start chats without changing existing sessions", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768 });
  let app: ElectronApplication | undefined;
  try {
    app = await launch(fixture.directory);
    const page = await app.firstWindow(), create = async () => {
      const before = new Set(fixture.service.controller.snapshot().sessions.map((entry) => entry.id));
      await page.getByRole("button", { name: "New", exact: true }).click();
      await page.getByRole("dialog", { name: "New", exact: true }).getByRole("button", { name: /^New chat/ }).click();
      await expect.poll(() => fixture.service.controller.snapshot().sessions.length).toBe(before.size + 1);
      return fixture.service.controller.snapshot().sessions.find((entry) => !before.has(entry.id))!;
    };
    await page.getByRole("button", { name: /^Model:/ }).click();
    const model = page.getByRole("dialog", { name: "Model", exact: true });
    await model.getByRole("button", { name: /Generated Copilot model/ }).click();
    await model.getByLabel("Thinking effort", { exact: true }).selectOption("high");
    await expect(model.getByText("Changes save automatically.", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().lastModelSelection).toEqual({ modelId: fixture.modelId, thinkingEffort: "high" });
    await page.keyboard.press("Escape");
    const remembered = await create();
    expect(remembered.controls.modelId).toBe(fixture.modelId); expect(remembered.controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await startup(page);
    const global = page.getByLabel("Global default model", { exact: true });
    await expect(global).toHaveValue("last-used"); await global.selectOption(fixture.modelId); await saved(page);
    await page.getByLabel("Global default thinking effort", { exact: true }).selectOption("low"); await saved(page);
    expect(fixture.service.controller.snapshot().settings.values.startup.profile.modelId).toBeUndefined();
    expect(fixture.session().controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.getByRole("region", { name: "Moguri settings", exact: true }).screenshot({ path: ".moguri/artifacts/global-default-model.png" });
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    const fixed = await create();
    expect(fixed.controls.modelOptions).toEqual({ thinkingEffort: "low" }); expect(fixed.defaults?.sources.modelId).toBe("global");
    expect(fixture.service.controller.snapshot().lastModelSelection).toEqual({ modelId: fixture.modelId, thinkingEffort: "high" });
    await startup(page); await global.selectOption("last-used"); await saved(page);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    expect((await create()).controls.modelOptions).toEqual({ thinkingEffort: "high" });
    await page.reload(); expect((await create()).controls.modelId).toBe(fixture.modelId);
    await startup(page); await global.selectOption("none"); await saved(page);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    expect((await create()).controls.modelId).toBeNull();
    expect(fixture.service.controller.snapshot().lastModelSelection).toEqual({ modelId: fixture.modelId, thinkingEffort: "high" });
    expect(fixture.requests).toHaveLength(0);
  } finally { await app?.close(); await fixture.close(); }
});

test("a remembered effort that loses transport support stays explicit until the user chooses provider default", async () => {
  const fixture = await setupFixture({ reasoning: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId, modelOptions: { thinkingEffort: "high" } });
    fixture.provider.state.models[0]!.thinkingLevels = [];
    await fixture.provider.refresh(); await sdk.refresh();
    const created = await sdk.sessions.create(null, "Generated unsupported remembered effort");
    expect(sdk.getState().snapshot!.sessions.find((entry) => entry.id === created.id)?.controls.modelOptions).toEqual({ thinkingEffort: "high" });
    app = await launch(fixture.directory);
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const model = page.getByRole("dialog", { name: "Model", exact: true }), effort = model.getByLabel("Thinking effort", { exact: true });
    await expect(effort).toHaveValue("high"); await expect(effort).toBeEnabled();
    await expect(model.getByRole("alert")).toContainText("saved thinking effort is no longer supported");
    await effort.selectOption("");
    await expect(model.getByText("Changes save automatically.", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().lastModelSelection).toEqual({ modelId: fixture.modelId });
    await page.keyboard.press("Escape"); expect(fixture.requests).toHaveLength(0);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("profile overrides remain explicit and can inherit the shared global model without changing old chats", async () => {
  const fixture = await setupFixture({ reasoning: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, startup: { global: { modelId: fixture.modelId, modelOptions: { thinkingEffort: "low" } }, profile: { modelId: null } } }, settings.revision);
    app = await launch(fixture.directory);
    const page = await app.firstWindow();
    await startup(page);
    await expect(page.getByLabel("Global default model", { exact: true })).toHaveValue(fixture.modelId);
    const profile = page.getByLabel("Default model", { exact: true });
    await expect(profile).toHaveValue("none"); await profile.selectOption("inherit"); await saved(page);
    expect(fixture.session().controls.modelId).toBeNull();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("dialog", { name: "New", exact: true }).getByRole("button", { name: /^New chat/ }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.at(-1)?.controls.modelId).toBe(fixture.modelId);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("a held/refused global default save stays pending then visible without changing remembered or global intent", async () => {
  const fixture = await setupFixture({ reasoning: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let app: ElectronApplication | undefined, entered = false;
  try {
    await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId, modelOptions: { thinkingEffort: "high" } });
    fixture.service.controller.dispatch = async (raw: unknown) => {
      if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "settings.update") {
        entered = true; await gate.promise; throw new MoguriError("generated_default_refused", "Generated global model default save was refused before any effect.", 503);
      }
      return dispatch(raw);
    };
    app = await launch(fixture.directory);
    const page = await app.firstWindow(); await startup(page);
    const global = page.getByLabel("Global default model", { exact: true });
    await global.selectOption(fixture.modelId); await waitFor(() => entered);
    await expect(global).toBeDisabled(); gate.resolve();
    await expect(page.getByRole("alert")).toContainText("Generated global model default save was refused");
    expect(fixture.service.controller.snapshot().settings.values.startup.global.modelId).toBeUndefined();
    expect(fixture.service.controller.snapshot().lastModelSelection).toEqual({ modelId: fixture.modelId, thinkingEffort: "high" });
    fixture.service.controller.dispatch = dispatch;
    await page.getByRole("button", { name: "Reload current settings", exact: true }).click(); await saved(page);
    await expect(global).toHaveValue("last-used");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(page.getByRole("form", { name: "Message composer", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app?.close(); sdk.disconnect(); await fixture.close(); }
});
