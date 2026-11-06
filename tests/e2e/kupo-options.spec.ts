import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { KUPO_MODEL_ID, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { compoundApiFixture } from "../fixtures/compound-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Pooled-control UI uses a generated hidden macOS app.");

test("Kupo keeps mode, exact role effort and working window separate in the real composer", async () => {
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
    await expect(control.getByRole("button", { name: "Kupo effort", exact: true })).toBeVisible();
    await expect(control.getByRole("button", { name: "Working context window", exact: true })).toBeEnabled();
    await control.getByRole("button", { name: "Working context window", exact: true }).click();
    await page.getByRole("menu", { name: "Working context window", exact: true })
      .getByRole("menuitemradio", { name: "16,384 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(16384);
    await control.getByRole("button", { name: "Role thinking override", exact: true }).click();
    await page.getByRole("menu", { name: "Role thinking override", exact: true })
      .getByRole("menuitemradio", { name: "High", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384, thinkingEffort: "high" });
    expect(fixture.session().controls.kupoMode).toBe("balanced");
    await expect(control.getByRole("alert")).toHaveCount(0);
    const effortControl = control.getByRole("button", { name: "Role thinking override", exact: true });
    await expect(effortControl).toBeEnabled();
    await effortControl.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu", { name: "Role thinking override", exact: true })
      .getByRole("menuitemradio", { name: "High", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(effortControl).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated draft remains unsent while reviewing exact Kupo controls.");
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("reviewed Compound exposes exact role effort/window without selecting an automatic mode or spending a role", async () => {
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
    const effort = control.getByRole("button", { name: "Role thinking override", exact: true });
    await expect(effort).toBeVisible(); await expect(effort).toBeEnabled();
    await effort.click();
    await page.getByRole("menu", { name: "Role thinking override", exact: true }).getByRole("menuitemradio", { name: "High", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe("high");
    await control.getByRole("button", { name: "Working context window", exact: true }).click();
    await page.getByRole("menu", { name: "Working context window", exact: true }).getByRole("menuitemradio", { name: "131,072 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 131072, thinkingEffort: "high" });
    expect(fixture.session().controls.kupoMode).toBe(before);
    await fixture.sdk.compound.preview(fixture.input);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.providers.every((provider) => provider.requests.length === 0)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated Compound tuning preserves this unsent draft.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});
