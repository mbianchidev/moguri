import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defaultKupoSettings, KUPO_MODEL_ID } from "../../packages/sdk/src/index.ts";
import { routedFixture } from "../fixtures/single-routing.ts";
import { generatedKupoProfile } from "../fixtures/kupo-profiles.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop modes use generated model fixtures.");

test("Kupo offers three real modes instead of effort, keeps unsupported Performance disabled and executes Savings locally", async () => {
  const fixture = await routedFixture({ configured: false, legacy: false });
  const local = await generatedKupoProfile(fixture.sdk, fixture.solverId, { category: "economy", score: 0.4, price: 0 });
  const frontier = await generatedKupoProfile(fixture.sdk, fixture.modelId, { category: "frontier", score: 0.8, price: 5 });
  await fixture.sdk.routing.configure({ ...defaultKupoSettings(), modelProfiles: [local, frontier] }, fixture.sdk.settings.get()!.revision);
  await fixture.sdk.sessions.selectModel(fixture.sessionId, KUPO_MODEL_ID);
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated draft preserved across Kupo mode choices.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const model = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(model.getByRole("button", { name: "Thinking effort", exact: true })).toHaveCount(0);
    await model.getByRole("button", { name: "Kupo routing preference", exact: true }).click();
    const modes = page.getByRole("menu", { name: "Kupo routing preference", exact: true });
    await expect(modes.getByRole("menuitemradio")).toHaveCount(3);
    await expect(modes.getByRole("menuitemradio", { name: "Performance", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(modes.getByRole("menuitemradio", { name: "Savings", exact: true })).toHaveAttribute("aria-disabled", "false");
    await modes.getByRole("menuitemradio", { name: "Savings", exact: true }).click();
    await expect.poll(() => fixture.session().controls.kupoMode).toBe("savings");
    await expect(prompt).toHaveValue("Generated draft preserved across Kupo mode choices.");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await prompt.press("Enter");
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests).toHaveLength(0); expect(fixture.solver.requests).toHaveLength(1);
    expect(fixture.session().usage[0]?.totalTokens).toBe(42);
    await expect(page.getByRole("button", { name: /^Model:/ })).toContainText("Savings");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("startup defaults show Kupo modes rather than fixed-model effort, and automatic compaction requires an explicit setting", async () => {
  const fixture = await routedFixture({ configured: false, legacy: false });
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Startup defaults");
    await page.getByLabel("Global default model", { exact: true }).selectOption("kupo");
    await expect(page.getByLabel("Global default Kupo mode", { exact: true })).toHaveValue("balanced");
    await expect.poll(() => fixture.sdk.settings.get()?.values.startup.global.kupoMode).toBe("balanced");
    await expect(page.getByLabel("Global default thinking effort", { exact: true })).toHaveCount(0);
    await page.getByLabel("Default model", { exact: true }).selectOption("kupo");
    await expect(page.getByLabel("Default Kupo mode", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Default thinking effort", { exact: true })).toHaveCount(0);
    await page.getByLabel("Default Kupo mode", { exact: true }).selectOption("savings");
    await expect.poll(() => fixture.sdk.settings.get()?.values.startup.profile.kupoMode).toBe("savings");
    await openSettingsSection(page, "Kupo routing");
    await expect(page.getByLabel("Enable automatic Kupo compaction", { exact: true })).not.toBeChecked();
    await page.getByLabel("Enable automatic Kupo compaction", { exact: true }).check();
    await expect.poll(() => {
      const policy = fixture.sdk.settings.get()?.values.kupo;
      return policy?.workflow === "auto" ? policy.autoCompaction?.enabled : undefined;
    }).toBe(true);
    expect(fixture.requests).toHaveLength(0); expect(fixture.solver.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
