import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native telemetry UI is qualified on macOS.");

test("desktop UTC windows, captured prices, stream observations and retained call/turn views share the authoritative ledger", async () => {
  const fixture = await setupFixture({ maxOutputTokens: 128, stream: { chunks: ["Generated ", "desktop ", "timing."], delayMs: 25 },
    usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42, prompt_tokens_details: { cached_tokens: 10 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const settings = structuredClone(sdk.settings.get()!.values);
  settings.budgets.rates = [{ modelId: fixture.modelId, inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }];
  await sdk.settings.update(settings, sdk.settings.get()!.revision); await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByLabel("Prompt", { exact: true }).fill("Generated observed desktop telemetry.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests.length).toBe(1);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await dashboard.getByText("Date range and buckets", { exact: true }).click();
    await dashboard.getByLabel("Usage date range", { exact: true }).selectOption("7");
    await dashboard.getByLabel("Usage calendar buckets", { exact: true }).selectOption("day");
    await expect(dashboard).toContainText("42");
    await dashboard.getByText("Token categories", { exact: true }).click();
    const categories = dashboard.getByText("Token categories", { exact: true }).locator("..");
    await expect(categories).toContainText("30"); await expect(categories).toContainText("12"); await expect(categories).toContainText("10");
    await expect(categories).toContainText("Not reported");
    await dashboard.getByText("Observed streaming", { exact: true }).click();
    const observed = dashboard.getByText("Observed streaming", { exact: true }).locator("..");
    await expect(observed).toContainText("output tokens/s"); await expect(observed).toContainText("not GPU generation");
    const projection = await sdk.budgets.dashboard({ range: { kind: "days", days: 7 }, bucket: "day" });
    expect(projection.totals.reportedTokens).toBe(42); expect(projection.totals.measuredStreamCalls).toBe(1);
    expect(projection.totals.observedOutputTokensPerSecond).toBeGreaterThan(0);
    await dashboard.getByText("Captured price history (1)", { exact: true }).click();
    await expect(dashboard).toContainText("user-estimate"); await expect(dashboard).toContainText("per million tokens");
    const changed = structuredClone(sdk.settings.get()!.values);
    changed.budgets.rates[0] = { ...changed.budgets.rates[0]!, inputUsdPerMillion: 9, outputUsdPerMillion: 9 };
    await sdk.settings.update(changed, sdk.settings.get()!.revision);
    expect((await sdk.budgets.dashboard()).pricing[0]?.rate.inputUsdPerMillion).toBe(1);
    await dashboard.getByLabel("Usage date range", { exact: true }).selectOption("custom");
    await dashboard.getByLabel("Usage range from", { exact: true }).fill("2024-03-02");
    await dashboard.getByLabel("Usage range through", { exact: true }).fill("2024-03-01");
    await dashboard.getByRole("button", { name: "Apply UTC range", exact: true }).click();
    await expect(dashboard.getByRole("alert")).toContainText("ends before it starts");
    await dashboard.getByLabel("Usage date range", { exact: true }).selectOption("year");
    await expect(dashboard.getByLabel("Usage calendar year", { exact: true })).toBeVisible();
    await expect(dashboard).toContainText("42");
    await dashboard.getByText("Per-call history", { exact: true }).click();
    const calls = dashboard.getByLabel("Accounted model calls", { exact: true });
    await expect(calls).toContainText("42 reported tokens"); await expect(calls).toContainText("first output"); await expect(calls).toContainText("user-estimate");
    await calls.getByRole("button", { name: "Filter this owning turn", exact: true }).click();
    await dashboard.getByText("Filters", { exact: true }).click();
    await expect(dashboard.getByLabel("Usage turn filter", { exact: true })).toHaveValue(fixture.service.controller.snapshot().budgetEntries[0]!.turnId!);
    await dashboard.getByText("Filters", { exact: true }).click();
    await dashboard.getByText("Observed streaming", { exact: true }).click();
    await dashboard.getByText("Date range and buckets", { exact: true }).click();
    await dashboard.getByRole("heading", { name: "Usage dashboard", exact: true }).scrollIntoViewIfNeeded();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/dated-telemetry-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/dated-telemetry-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(fixture.requests.length).toBe(1); expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
