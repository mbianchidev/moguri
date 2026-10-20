import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { generatedRepositoryMetadata } from "../fixtures/repository-info.ts";

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

test("desktop tool/MCP outcomes and retained storage use sanitized authoritative projections without new inference", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let release = () => {}, held = false, settled = false;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByLabel("Prompt", { exact: true }).fill("generated tool: inspect the generated fixture.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await fixture.approve(); await fixture.terminal();
    await fixture.send("generated failing command"); await fixture.approve(); await fixture.terminal();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await dashboard.getByText("Tool and MCP outcomes", { exact: true }).click();
    const operations = dashboard.getByRole("region", { name: "Tool and MCP outcomes", exact: true });
    await expect(operations).toContainText("50.0% (1/2 definitive results)");
    await expect(operations).toContainText("read_file"); await expect(operations).toContainText("run_command");
    await operations.getByLabel("Operation family filter", { exact: true }).selectOption("mcp");
    await expect(operations).toContainText("No retained attempts match these filters");
    await expect(operations).toContainText("Unavailable: no definitive results");
    await operations.getByLabel("Operation family filter", { exact: true }).selectOption("tool");
    await expect(operations).toContainText("50.0% (1/2 definitive results)");
    fixture.service.controller.platform.query = async (input) => {
      const result = await query(input);
      if (input.type === "telemetry.operations" && input.family === "mcp" && !held) { held = true; await barrier; settled = true; }
      return result;
    };
    await operations.getByLabel("Operation family filter", { exact: true }).selectOption("mcp");
    await expect.poll(() => held).toBe(true);
    await operations.getByLabel("Operation family filter", { exact: true }).selectOption("tool");
    await expect(operations).toContainText("50.0% (1/2 definitive results)");
    release(); await expect.poll(() => settled).toBe(true);
    await expect(operations).toContainText("50.0% (1/2 definitive results)");
    await operations.getByText("Sanitized attempt history", { exact: true }).click();
    await expect(operations).toContainText("model / Local / completed"); await expect(operations).toContainText("model / Local / failed");
    await expect(operations).not.toContainText("fixture.txt"); await expect(operations).not.toContainText("exit 7");
    await operations.getByText("Sanitized attempt history", { exact: true }).click();
    await dashboard.getByText("Retained profile storage", { exact: true }).click();
    const storage = dashboard.getByRole("region", { name: "Retained profile storage", exact: true });
    await expect(storage).toContainText("Included ciphertext"); await expect(storage).toContainText("Not measured");
    await storage.getByRole("button", { name: "Refresh retained size", exact: true }).click();
    await expect(storage).toContainText("Encrypted blob grants"); await expect(storage).toContainText("not disk usage");
    const requests = fixture.requests.length;
    expect((await sdk.telemetry.operations()).totals.attempts).toBe(2); expect((await sdk.telemetry.storage()).storage.bytes.total).toBeGreaterThan(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await dashboard.getByText("Tool and MCP outcomes", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/operation-outcomes-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await dashboard.getByText("Tool and MCP outcomes", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/operation-outcomes-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(operations).toContainText("50.0% (1/2 definitive results)");
    expect(fixture.requests.length).toBe(requests); expect(failures).toEqual([]);
  } finally { release(); fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("desktop explicitly reviews repository lookup and filters immutable owner/visibility evidence without additional inference", async () => {
  let lookups = 0, license = "MIT";
  const fixture = await setupFixture({ platform: { integrations: { fetch: async () => { lookups++; return Response.json(generatedRepositoryMetadata(license)); } } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const git = initializeGeneratedRepository(fixture.project); git(["remote", "add", "origin", "https://github.com/generated/example.git"]);
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await dashboard.getByText("Repository attribution", { exact: true }).click();
    const repository = dashboard.getByRole("region", { name: "Repository attribution", exact: true });
    expect(lookups).toBe(0);
    await repository.getByLabel("Repository scope session", { exact: true }).selectOption(fixture.sessionId);
    await repository.getByRole("button", { name: "Review repository binding", exact: true }).click();
    await expect(repository).toContainText("https://github.com/generated/example");
    await expect(repository).toContainText("no credential"); expect(lookups).toBe(0);
    await repository.getByRole("button", { name: "Refresh verified metadata", exact: true }).click();
    await expect(repository).toContainText("Stored observation"); await expect(repository).toContainText("organization"); await expect(repository).toContainText("MIT");
    expect(lookups).toBe(1); expect(fixture.requests.length).toBe(0);
    await page.getByLabel("Prompt", { exact: true }).fill("Generated repository-attributed desktop response.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await fixture.terminal();
    await dashboard.getByText("Filters", { exact: true }).click();
    await dashboard.getByLabel("Usage repository filter", { exact: true }).selectOption("42");
    await dashboard.getByLabel("Usage organization filter", { exact: true }).selectOption("generated");
    await dashboard.getByLabel("Usage visibility filter", { exact: true }).selectOption("open-source");
    await expect(dashboard).toContainText("42"); expect((await sdk.budgets.dashboard({ visibility: "open-source" })).totals.calls).toBe(1);
    license = "BUSL-1.1";
    const preview = (await sdk.repositories.preview(fixture.sessionId)).preview, refresh = await sdk.repositories.refresh(fixture.sessionId, preview.bindingDigest, preview.revision, true);
    expect((await sdk.jobs.wait(refresh.id!)).status).toBe("completed");
    await expect(repository).toContainText("BUSL-1.1");
    await page.getByLabel("Prompt", { exact: true }).fill("Generated later non-OSI metadata response.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.requests.length).toBe(2); await fixture.terminal();
    expect((await sdk.budgets.dashboard()).totals.calls).toBe(2); expect((await sdk.budgets.dashboard({ visibility: "open-source" })).totals.calls).toBe(1);
    expect((await sdk.budgets.dashboard({ visibility: "public" })).totals.calls).toBe(2);
    await repository.getByRole("heading", { name: "Stored observation", exact: true }).scrollIntoViewIfNeeded();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/repository-attribution-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await repository.getByRole("heading", { name: "Stored observation", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/repository-attribution-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await repository.getByRole("button", { name: "Clear future attribution", exact: true }).click();
    await expect(repository.getByRole("button", { name: "Clear future attribution", exact: true })).toHaveCount(0);
    expect((await sdk.budgets.dashboard({ repositoryId: 42 })).totals.calls).toBe(2);
    expect(lookups).toBe(2); expect(fixture.requests.length).toBe(2); expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
