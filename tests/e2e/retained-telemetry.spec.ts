import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Retained chat telemetry uses hidden generated macOS windows.");

test("turn and compact usage information open from saved chat state without turn, budget or context detail requests", async () => {
  const fixture = await setupFixture({ responseMode: "text",
    usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42, prompt_tokens_details: { cached_tokens: 10 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, budgets: { ...settings.values.budgets, rates: [{ modelId: fixture.modelId,
    inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }] } }, settings.revision);
  await fixture.configure(); await fixture.send("Generated saved turn information."); await fixture.terminal();
  const other = await sdk.sessions.create(null, "Generated alternate telemetry chat");
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform), attempts: string[] = [];
  fixture.service.controller.platform.query = async (input, ...rest) => {
    if (["activity.turn", "budget.status", "session.context"].includes(input.type)) {
      attempts.push(input.type); throw new MoguriError("generated_no_lazy_telemetry", "Generated detail reads are blocked; use the retained snapshot.", 503);
    }
    return query(input, ...rest);
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    const original = page.locator(`button[data-session-id="${fixture.sessionId}"]`);
    await original.click();
    await page.getByRole("log", { name: "Session transcript", exact: true }).getByRole("button", { name: "Turn information", exact: true }).click();
    const details = page.getByRole("region", { name: "Turn information", exact: true });
    await expect(details.getByText("Loading original turn information...", { exact: true })).toHaveCount(0);
    await expect(details).toContainText("30 in / 12 out");
    await expect(details).toContainText("10 read");
    await expect(details).toContainText("0.000054");
    await page.keyboard.press("Escape");
    await page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Budget and usage", exact: true }).click();
    const usage = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await expect(usage).toContainText("10 cached");
    await expect(usage).toContainText("0.000054");
    await expect(usage.getByText("Loading...", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.locator(`button[data-session-id="${other.id}"]`).click(); await original.click();
    await page.reload();
    await page.getByRole("log", { name: "Session transcript", exact: true }).getByRole("button", { name: "Turn information", exact: true }).click();
    await expect(details).toContainText("30 in / 12 out");
    await expect(details).toContainText("10 read");
    expect(attempts).toEqual([]);
    expect(fixture.requests).toHaveLength(1);
    await page.keyboard.press("Escape");
  } finally { fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("an open usage display follows saved streamed tokens, context and estimates, then retains final cache after reload", async () => {
  const fixture = await setupFixture({ stream: { chunks: Array.from({ length: 6 }, (_, index) => `Generated retained fragment ${index}. `.repeat(12)), delayMs: 350 },
    usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42, prompt_tokens_details: { cached_tokens: 10 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, budgets: { ...settings.values.budgets, rates: [{ modelId: fixture.modelId,
    inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }] } }, settings.revision);
  await fixture.configure();
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform), attempts: string[] = [];
  fixture.service.controller.platform.query = async (input, ...rest) => {
    if (["activity.turn", "budget.status", "session.context"].includes(input.type)) {
      attempts.push(input.type); throw new MoguriError("generated_no_lazy_telemetry", "Generated detail reads are blocked during streaming.", 503);
    }
    return query(input, ...rest);
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await fixture.send("Generated continuously saved token information.");
    await expect(page.getByRole("log", { name: "Session transcript", exact: true })).toContainText("Generated retained fragment 0.");
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const usage = page.getByRole("dialog", { name: "Budget and usage", exact: true }), tokens = usage.locator(".compact-token-lines");
    await expect(tokens).toContainText("~");
    await expect(usage.locator(".compact-cost-row")).toContainText("~$");
    const initial = await tokens.innerText();
    await expect.poll(() => tokens.innerText()).not.toBe(initial);
    await expect(usage.getByRole("meter", { name: "Estimated context window", exact: true })).toBeVisible();
    await fixture.terminal();
    await expect(tokens).toContainText("10 cached");
    await expect(tokens).not.toContainText("~");
    await expect(usage.locator(".compact-cost-row")).toContainText("$0.000054");
    await page.keyboard.press("Escape"); await page.reload();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    await expect(usage).toContainText("10 cached");
    await expect(usage).toContainText("$0.000054");
    expect(attempts).toEqual([]); expect(fixture.requests).toHaveLength(1);
    await page.keyboard.press("Escape");
  } finally { fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});
