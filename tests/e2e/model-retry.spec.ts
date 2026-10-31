import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { GeneratedIntakeClock } from "../fixtures/intake-clock.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution uses generated macOS fixtures.");

test("the last upstream failure exposes the two-arrow retry action and red X without requiring or sending a new draft", async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128,
    httpFailure: { status: 408, message: "Timed out reading generated request body.", remaining: 1 }, platform: { intakeClock: clock } });
  await fixture.configure(); await fixture.send("Generated original desktop upstream failure."); await fixture.terminal();
  const original = fixture.requests[0]!.messages;
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    const retry = page.getByRole("button", { name: "Retry last model request", exact: true });
    await expect(retry).toBeEnabled(); await expect(retry.locator("svg")).toHaveAttribute("data-icon", "Refresh");
    await expect(page.locator('[data-session-state="failed"] svg')).toHaveAttribute("data-icon", "Close");
    await expect(prompt).toHaveValue(""); expect(fixture.requests).toHaveLength(1);
    await prompt.fill("Generated new draft must not be retried or discarded.");
    await retry.click(); await expect.poll(() => fixture.session().status).toBe("completed");
    await expect(prompt).toHaveValue("Generated new draft must not be retried or discarded.");
    await expect(retry).toHaveCount(0); expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[1]!.messages).toEqual(original);
    expect(fixture.session().messages.filter((message) => message.role === "user")).toHaveLength(1);
    clock.advanceBy(180000); expect(fixture.requests).toHaveLength(2);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("exhaustion retains the red X and an explicit keyboard retry while preserving held work", async () => {
  const clock = new GeneratedIntakeClock(), failure = { status: 503, message: "Generated upstream service unavailable.", remaining: 5 };
  const fixture = await setupFixture({ httpFailure: failure, responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  await fixture.configure(); await fixture.send("Generated exhausted original desktop request."); await fixture.terminal();
  for (const [delay, count] of [[30000, 2], [60000, 3], [30000, 4], [60000, 5]] as const) {
    clock.advanceBy(delay);
    await expect.poll(() => fixture.requests.length).toBe(count);
    await expect.poll(() => fixture.service.controller.snapshot().modelFailures[0]?.status).not.toBe("retrying");
  }
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.getByRole("button", { name: "Retry last model request", exact: true })).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "exhausted all four rounds" })).toBeVisible();
    await expect(page.locator('[data-session-state="failed"] svg')).toHaveAttribute("data-icon", "Close");
    await prompt.fill("Generated new keyboard draft.");
    await prompt.press("Enter");
    await expect.poll(() => fixture.session().status).toBe("completed");
    await expect(prompt).toHaveValue("Generated new keyboard draft.");
    expect(fixture.requests).toHaveLength(6);
    expect(fixture.service.controller.snapshot().modelFailures[0]?.status).toBe("recovered");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});
