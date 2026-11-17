import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Analytics uses generated hidden macOS windows.");

test("Analytics shows a recent generated turn on lanes, filters lanes, finds events and selects them by keyboard", async () => {
  test.setTimeout(60_000);
  const fixture = await setupFixture();
  await fixture.configure();
  await fixture.send("Generated analytics timeline prompt");
  await fixture.terminal();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("navigation", { name: "Dashboard pages", exact: true }).getByRole("button", { name: "Analytics", exact: true }).click();
    const analytics = page.getByRole("region", { name: "Analytics", exact: true });
    await expect(analytics.getByText("In memory only.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Dashboard date range", { exact: true })).toBeHidden();
    const sessions = analytics.getByRole("complementary", { name: "Sessions", exact: true });
    await expect(sessions.getByRole("button")).toHaveCount(1);
    await expect(sessions.getByRole("button").first()).toHaveAttribute("aria-current", "true");

    const chips = analytics.getByRole("group", { name: "Show lanes", exact: true });
    await expect(chips.getByRole("button", { name: "Prompts 1", exact: true })).toHaveAttribute("aria-pressed", "true");
    const timeline = analytics.getByRole("group", { name: /^Session timeline/ });
    const prompt = timeline.getByRole("button", { name: /^Prompts: Generated analytics timeline prompt/ });
    await expect(prompt).toHaveCount(1);
    await expect(timeline.getByRole("button", { name: /^Answers: / })).not.toHaveCount(0);

    await chips.getByRole("button", { name: "Prompts 1", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await chips.getByRole("button", { name: "Prompts 1", exact: true }).click();
    await expect(prompt).toHaveCount(1);

    const detail = analytics.getByRole("complementary", { name: "Selected event", exact: true });
    await expect(detail.getByRole("heading", { name: "Select an event", exact: true })).toBeVisible();
    await prompt.click();
    await expect(detail.getByRole("heading", { name: "Generated analytics timeline prompt", exact: true })).toBeVisible();
    await expect(prompt).toHaveAttribute("aria-pressed", "true");
    await timeline.press("ArrowRight");
    await expect(detail.getByText("Answers", { exact: true })).toBeVisible();
    await timeline.press("Escape");
    await expect(detail.getByRole("heading", { name: "Select an event", exact: true })).toBeVisible();

    const find = analytics.getByRole("searchbox", { name: "Find events", exact: true });
    await find.fill("timeline prompt");
    await expect(analytics.getByText(/^\d+ match(es)?$/)).toBeVisible();
    await find.press("Enter");
    await expect(detail.getByRole("heading", { name: "Generated analytics timeline prompt", exact: true })).toBeVisible();
    await expect(analytics.locator(".analytics-footer")).toContainText("Prompts1");
    if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, "analytics.png"), animations: "disabled" });
  } finally {
    await app.close();
    await fixture.close();
  }
});
