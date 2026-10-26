import { openUsageDetails } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { budgetPlanFixture } from "../fixtures/budget-plan-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native planned-budget inspection is qualified on macOS.");

test("desktop distinguishes planned capacity from real calls and observes automatic undispatched release without fabricating zero usage", async () => {
  const f = await budgetPlanFixture(); f.create();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openUsageDetails(page);
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await expect(dashboard.locator("dt").filter({ hasText: /^Model calls$/ }).locator("+ dd")).toHaveText("0");
    await expect(dashboard.locator("dt").filter({ hasText: /^Undispatched model holds$/ }).locator("+ dd")).toHaveText("1 / 30 tokens");
    await dashboard.getByText("Planned model reservations", { exact: true }).click();
    const plans = dashboard.getByRole("region", { name: "Planned model reservations", exact: true });
    await expect(plans).toContainText("10 input + 20 output tokens reserved"); await expect(plans).toContainText("USD estimate unknown");
    await expect(dashboard.locator("dt").filter({ hasText: /^Estimated USD$/ }).locator("+ dd")).toHaveText("No model calls");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await plans.locator(".call-record").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/planned-budget-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await plans.locator(".call-record").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/planned-budget-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    f.append([{ event_type: "turn.finished", profile_id: f.control.profileId, session_id: f.sessionId, turn_id: f.request.turnId,
      payload: { outcome: "stopped", diagnostic: "Generated owner stopped before planned dispatch." } }]);
    await expect(dashboard.locator("dt").filter({ hasText: /^Undispatched model holds$/ }).locator("+ dd")).toHaveText("0 / 0 tokens");
    await plans.getByLabel("Planned reservation state", { exact: true }).selectOption("released");
    await expect(plans).toContainText("Released undispatched capacity: owner-turn-finished");
    await expect(dashboard.locator("dt").filter({ hasText: /^Model calls$/ }).locator("+ dd")).toHaveText("0");
    expect(f.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("a held planned-budget response cannot populate another selected session scope", async () => {
  const f = await budgetPlanFixture(); f.create();
  const other = await f.sdk.sessions.create(null, "Generated other budget scope");
  let held = false, release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), original = f.control.platform.query.bind(f.control.platform);
  f.control.platform.query = async (query) => { if (query.type === "budget.plans" && query.sessionId === f.sessionId && !held) { held = true; await gate; } return original(query); };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openUsageDetails(page);
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await dashboard.getByText("Filters", { exact: true }).click();
    await dashboard.getByLabel("Usage session filter", { exact: true }).selectOption(f.sessionId);
    await dashboard.getByText("Planned model reservations", { exact: true }).click(); await expect.poll(() => held).toBe(true);
    await dashboard.getByLabel("Usage session filter", { exact: true }).selectOption(other.id!); release();
    const plans = dashboard.getByRole("region", { name: "Planned model reservations", exact: true });
    await expect(plans).toContainText("No planned reservations match"); await expect(plans).not.toContainText("10 input + 20 output");
    expect(f.requests).toHaveLength(0);
  } finally { release(); f.control.platform.query = original; await app.close(); await f.close(); }
});
