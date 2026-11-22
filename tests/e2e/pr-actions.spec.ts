import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { GENERATED_PR_BRANCH, GENERATED_PR_URL, generatedPrCliRead, generatedPrFetch, type GeneratedPrState } from "../fixtures/pr-status.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native desktop interaction qualification is macOS-only.");

test("Code change enables only the PR follow-ups that apply and queues the chosen one in this chat", async () => {
  let pr: GeneratedPrState = { mergeable: true, mergeableState: "clean", reviews: [], checks: [{ name: "generated-test", status: "completed", conclusion: "failure" }] };
  const f = await setupFixture({ platform: { integrations: { fetch: generatedPrFetch(() => pr), githubCliRead: generatedPrCliRead(() => pr) } } }), sdk = await new MoguriSdk(f.service.connection).ready();
  const git = initializeGeneratedRepository(f.project); git(["checkout", "-b", GENERATED_PR_BRANCH]);
  await f.configure();
  await sdk.sessions.organize(f.sessionId, { prUrl: GENERATED_PR_URL }, f.session().revision);
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Code change", exact: true }).click();
    const followUp = page.getByRole("region", { name: "Pull request follow-up", exact: true });
    const review = followUp.getByRole("button", { name: "Address code review", exact: true }), conflicts = followUp.getByRole("button", { name: "Fix merge conflicts", exact: true });
    const ci = followUp.getByRole("button", { name: "Fix CI", exact: true });
    await expect(ci).toBeEnabled();
    await expect(review).toBeDisabled(); await expect(conflicts).toBeDisabled();
    await expect(followUp).toContainText("Fix CI: Failing checks: generated-test.");
    await expect(followUp).toContainText("Fix merge conflicts: No merge conflicts.");
    pr = { ...pr, mergeable: false, mergeableState: "dirty", reviews: [{ id: 3, state: "COMMENTED", author: "generated-reviewer", submittedAt: "2026-11-17T10:00:00Z" }] };
    await followUp.getByRole("button", { name: "Refresh pull request status", exact: true }).click();
    await expect(conflicts).toBeEnabled(); await expect(review).toBeEnabled();
    await expect(followUp).toContainText("Address code review: Changes requested or comments from generated-reviewer.");
    await conflicts.click();
    await expect(followUp.getByRole("status").filter({ hasText: 'Queued "Fix merge conflicts" in this chat.' })).toBeVisible();
    await expect.poll(() => f.service.controller.events(0).some((event) => event.event_type === "turn.started" && event.payload.item.workflow?.kind === "fix-conflicts")).toBe(true);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
