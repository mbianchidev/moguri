import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { GeneratedIntakeClock } from "../fixtures/intake-clock.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution is qualified on macOS.");
test("Automations creates a recurring workflow, runs it in a new chat and saves the schedule switch immediately", async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  await fixture.configure();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Automations", exact: true }).click();
    const panel = page.getByRole("region", { name: "Recurring automations", exact: true });
    await expect(panel).toContainText("No automations yet.");
    await panel.getByRole("button", { name: "New automation", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New automation", exact: true });
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Generated weekday digest");
    await dialog.getByRole("combobox", { name: "Repeat", exact: true }).selectOption("weekly");
    await dialog.getByRole("textbox", { name: "Time", exact: true }).fill("09:30");
    await dialog.getByRole("textbox", { name: "Timezone", exact: true }).fill("UTC");
    const step = (name: string) => dialog.getByRole("group", { name, exact: true }).getByRole("textbox", { name: "Prompt", exact: true });
    await step("Step 1").fill("Generated first automation step.");
    await dialog.getByRole("button", { name: "Add step", exact: true }).click();
    await step("Step 2").fill("Generated second automation step.");
    await dialog.getByRole("combobox", { name: "Model", exact: true }).selectOption(fixture.modelId);
    await dialog.getByRole("button", { name: "Create automation", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = panel.getByRole("article", { name: "Generated weekday digest", exact: true });
    await expect(card).toContainText("Weekdays at 09:30 (UTC)");
    await expect(card.getByRole("switch", { name: "On schedule" })).toBeChecked();
    expect(fixture.service.controller.snapshot().automations[0]?.nextAt).toBe("2030-01-02T09:30:00.000Z");
    const before = fixture.service.controller.snapshot().sessions.length;
    await card.getByRole("button", { name: "Run now", exact: true }).click();
    await expect(card.getByRole("list", { name: "Recent runs", exact: true }).getByRole("listitem").first()).toContainText("Completed");
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.service.controller.snapshot().sessions.length).toBe(before + 1);
    await card.getByRole("switch", { name: "On schedule" }).click();
    await expect(card.getByRole("switch", { name: "On schedule" })).not.toBeChecked();
    await expect(card).toContainText("Paused");
    expect(fixture.service.controller.snapshot().automations[0]?.status).toBe("paused");
    clock.advanceBy(7 * 86_400_000);
    expect(fixture.requests).toHaveLength(2);
    await card.getByRole("button", { name: "Open chat", exact: true }).click();
    await expect(page.getByRole("article", { name: "User prompt", exact: true }).first()).toContainText("Generated first automation step.");
  } finally { await app.close(); await fixture.close(); }
});
