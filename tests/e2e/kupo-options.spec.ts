import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { KUPO_MODEL_ID, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { compoundApiFixture } from "../fixtures/compound-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Pooled-control UI uses a generated hidden macOS app.");

test("Kupo offers routing preferences and a working window but leaves thinking automatic and preserves fixed-model tuning", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768, maxOutputTokens: 512, responseMode: "text" });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.selectModel(fixture.sessionId, KUPO_MODEL_ID);
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });

  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated draft remains unsent while reviewing exact Kupo controls.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const control = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(control.getByRole("button", { name: "Kupo routing preference", exact: true })).toBeVisible();
    await expect(control.getByRole("button", { name: /effort|thinking override/i })).toHaveCount(0);
    await expect(control).toContainText("classifier");
    await expect(control.getByRole("button", { name: "Working context window", exact: true })).toBeEnabled();
    await control.getByRole("button", { name: "Working context window", exact: true }).click();
    await page.getByRole("menu", { name: "Working context window", exact: true })
      .getByRole("menuitemradio", { name: "16,384 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(16384);
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384 });
    expect(fixture.session().controls.kupoMode).toBe("balanced");
    await expect(control.getByRole("alert")).toHaveCount(0);
    const routingControl = control.getByRole("button", { name: "Kupo routing preference", exact: true });
    await routingControl.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu", { name: "Kupo routing preference", exact: true })
      .getByRole("menuitemradio", { name: "Balanced", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(routingControl).toBeFocused();
    await page.keyboard.press("Escape");
    await sdk.refresh();
    await sdk.sessions.selectModel(fixture.sessionId, fixture.modelId);
    await page.getByRole("button", { name: /^Model:/ }).click();
    await control.getByRole("button", { name: "Thinking effort", exact: true }).click();
    await page.getByRole("menu", { name: "Thinking effort", exact: true }).getByRole("menuitemradio", { name: "High", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe("high");
    await page.keyboard.press("Escape");
    await sdk.refresh();
    await sdk.sessions.selectModel(fixture.sessionId, KUPO_MODEL_ID);
    await page.getByRole("button", { name: /^Model:/ }).click();
    await expect(control.getByRole("button", { name: /effort|thinking override/i })).toHaveCount(0);
    expect(fixture.session().controls.modelOptions?.thinkingEffort).toBeUndefined();
    expect(fixture.session().controls.preferredThinkingEffort).toBe("high");
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated draft remains unsent while reviewing exact Kupo controls.");
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); sdk.disconnect(); await fixture.close();
  }
});

test("reviewed Compound keeps its explicit workflow and working window without a manual thinking override or role spend", async () => {
  const fixture = await compoundApiFixture({ reasoning: true, hostedRoles: true });
  await fixture.configure();
  const before = fixture.session().controls.kupoMode;
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated Compound tuning preserves this unsent draft.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const control = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(control.getByRole("button", { name: /effort|thinking override/i })).toHaveCount(0);
    await control.getByRole("button", { name: "Working context window", exact: true }).click();
    await page.getByRole("menu", { name: "Working context window", exact: true }).getByRole("menuitemradio", { name: "131,072 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 131072 });
    expect(fixture.session().controls.kupoMode).toBe(before);
    await fixture.sdk.compound.preview(fixture.input);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.providers.every((provider) => provider.requests.length === 0)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated Compound tuning preserves this unsent draft.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("a retained manual Kupo effort stays blocked until explicitly cleared without losing the window or saved draft", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768, maxOutputTokens: 512, responseMode: "text" });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.selectModel(fixture.sessionId, KUPO_MODEL_ID);
  await sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: 0,
    text: "Generated original saved legacy-thinking draft.", attachments: [] });
  const original = fixture.session();
  fixture.service.store.commit([{ event_type: "session.configured", profile_id: sdk.profileId, project_id: original.projectId,
    session_id: original.id, payload: { controls: { ...original.controls, modelOptions: { contextWindow: 16384, thinkingEffort: "high" } } } }]);
  fixture.service.controller.refreshProfile();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const model = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(model.getByRole("alert")).toContainText("classifier");
    await expect(model.getByRole("button", { name: /effort|thinking override/i })).toHaveCount(0);
    await model.getByRole("button", { name: "Use automatic thinking", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384 });
    await expect(model.getByRole("alert")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated original saved legacy-thinking draft.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.session().controls.kupoMode).toBe(original.controls.kupoMode);
    expect(fixture.session().controls.budget).toEqual(original.controls.budget);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
