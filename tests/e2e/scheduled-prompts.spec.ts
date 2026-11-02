import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { GeneratedIntakeClock } from "../fixtures/intake-clock.ts";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution is qualified on macOS.");
test("idle Hold reviews scheduling, renders a real unsent ghost and Send now preserves the new draft", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 }); await fixture.configure();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await prompt.fill("Generated scheduled ghost from desktop."); await prompt.press("Meta+Enter");
    const question = page.getByRole("dialog", { name: "Send now or schedule", exact: true });
    await expect(question).toBeVisible(); expect(fixture.requests).toHaveLength(0);
    await question.getByRole("button", { name: "No, schedule", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Schedule prompt", exact: true });
    await review.getByLabel("Send in").selectOption("10");
    await review.getByRole("button", { name: "Schedule prompt", exact: true }).click();
    const ghost = page.getByRole("article", { name: "Unsent scheduled prompt" });
    await expect(ghost).toContainText("Generated scheduled ghost from desktop.");
    await expect(page.getByRole("article", { name: "User prompt", exact: true })).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0); expect(fixture.session().queue).toHaveLength(0);
    await prompt.fill("Generated newer unsent desktop draft.");
    await ghost.hover(); await ghost.getByRole("button", { name: "Send now", exact: true }).click();
    await expect(page.getByRole("article", { name: "User prompt", exact: true })).toContainText("Generated scheduled ghost from desktop.");
    await expect(ghost).toHaveCount(0); await fixture.terminal();
    await expect(prompt).toHaveValue("Generated newer unsent desktop draft.");
    expect(fixture.requests).toHaveLength(1);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("remembered scheduling preference and Automations group share the exact timer-owned prompt", async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await prompt.fill("Generated remembered schedule."); await prompt.press("Control+Enter");
    const question = page.getByRole("dialog", { name: "Send now or schedule", exact: true });
    await question.getByLabel("Don't ask me again").check(); await question.getByRole("button", { name: "No, schedule" }).click();
    await page.getByRole("dialog", { name: "Schedule prompt", exact: true }).getByRole("button", { name: "Schedule prompt", exact: true }).click();
    await expect(page.getByRole("article", { name: "Unsent scheduled prompt" })).toHaveCount(1);
    await prompt.fill("Generated next scheduling draft."); await prompt.press("Control+Enter");
    await expect(page.getByRole("dialog", { name: "Schedule prompt", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Send now or schedule", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape"); await expect(prompt).toHaveValue("Generated next scheduling draft.");
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Automations", exact: true }).click();
    const group = page.getByRole("region", { name: "Scheduled prompts", exact: true });
    await expect(group).toContainText("Generated remembered schedule.");
    await expect(group.getByRole("button", { name: "Send now", exact: true })).toHaveCount(1);
    clock.advanceBy(300_000); await fixture.terminal();
    await expect(group.getByRole("button", { name: "Send now", exact: true })).toHaveCount(0);
    await sdk.refresh(); expect(sdk.settings.get()?.values.interactions.idleScheduleAction).toBe("schedule");
    expect(sdk.scheduledPrompts.list()[0]?.status).toBe("admitted"); expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
