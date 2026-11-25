import { ciTime } from "../fixtures/time-scale.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compactionFixture } from "../fixtures/compaction-service.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native compaction UI is qualified on macOS.");

test("desktop explicitly previews, generates, reviews, applies and restores context while retaining the draft", async () => {
  const f = await compactionFixture();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated desktop draft survives context changes.");
    await expect.poll(() => f.session().draft.text).toBe("Generated desktop draft survives context changes.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toContainText("Draft saved");
    await page.locator('[data-composer-control="model"]').click();
    await page.getByRole("dialog", { name: "Model", exact: true }).getByText("Model details and setup", { exact: true }).click();
    await page.getByRole("button", { name: "Review context and compactions", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Context review", exact: true });
    await expect(review).toContainText("No compactions yet");
    await review.getByLabel("Keep recent turns", { exact: true }).fill("1");
    const preview = review.getByRole("button", { name: "Preview source", exact: true });
    await preview.focus(); await preview.press("Enter");
    await expect(review.getByRole("button", { name: "Generate proposal", exact: true })).toBeEnabled();
    expect(f.requests.length).toBe(3);
    await review.getByText("Inspect compaction contract", { exact: true }).click();
    await expect(review).toContainText("read-only conversation compactor");
    await review.getByText("Inspect compaction contract", { exact: true }).click();
    await review.getByRole("button", { name: "Generate proposal", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().compactions.at(-1)?.status).toBe("proposed");
    await expect(review.getByLabel("Proposed context summary", { exact: true })).toContainText("Generated summary");
    const apply = review.getByRole("button", { name: "Apply reviewed summary", exact: true });
    await expect(apply).toBeDisabled();
    expect(f.session().activeCompactionId).toBeNull();
    await review.getByRole("checkbox", { name: "I reviewed this untrusted summary; original history stays retained.", exact: true }).check();
    await apply.click();
    await expect.poll(() => Boolean(f.session().activeCompactionId)).toBe(true);
    await expect(review).toContainText("Status: applied");
    expect(f.requests.length).toBe(4);
    expect(f.session().draft.text).toBe("Generated desktop draft survives context changes.");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/reviewed-compaction-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/reviewed-compaction-compact.png") });
    expect(await review.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await review.getByRole("button", { name: "Restore original context", exact: true }).click();
    await review.getByRole("button", { name: "Confirm restore originals", exact: true }).click();
    await expect.poll(() => f.session().activeCompactionId).toBeNull();
    await review.getByRole("button", { name: "Close context review", exact: true }).click();
    await expect(prompt).toHaveValue("Generated desktop draft survives context changes.");
    await expect(prompt).toBeFocused();
    expect(f.requests.length).toBe(4);
    expect((await f.sdk.budgets.calls({ role: "compaction" })).calls[0]?.reportedTokens).toBe(42);
    expect(failures).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("closing and reopening the review preserves the actual running compaction and its acknowledged stop", async () => {
  const f = await compactionFixture();
  // The summary stream must outlast closing and reopening the review; the test stops it explicitly.
  f.configuration.stream = { chunks: ["Generated partial desktop summary."], delayMs: ciTime(10_000) };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    const open = async () => {
      await page.locator('[data-composer-control="model"]').click();
      await page.getByRole("dialog", { name: "Model", exact: true }).getByText("Model details and setup", { exact: true }).click();
      await page.getByRole("button", { name: "Review context and compactions", exact: true }).click();
      return page.getByRole("dialog", { name: "Context review", exact: true });
    };
    let review = await open();
    await review.getByRole("button", { name: "Preview source", exact: true }).click();
    await review.getByRole("button", { name: "Generate proposal", exact: true }).click();
    await expect.poll(() => f.requests.length).toBe(4);
    await review.getByRole("button", { name: "Close context review", exact: true }).click();
    review = await open();
    await expect(review).toContainText("Owned compaction is running");
    await review.getByRole("button", { name: "Stop compaction", exact: true }).click();
    await expect.poll(() => f.session().status).toBe("stopped");
    await expect(review).toContainText("Status: stopped");
    expect(f.session().activeCompactionId).toBeNull();
    expect((await f.sdk.budgets.calls({ role: "compaction" })).calls[0]?.status).toBe("unknown");
    await review.getByRole("button", { name: "Close context review", exact: true }).click();
    expect(f.requests.length).toBe(4);
  } finally { await app.close(); await f.close(); }
});
