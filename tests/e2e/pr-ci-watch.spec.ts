import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native PR-watch qualification is macOS-only.");

test("the selected PR restores an existing watch after reopening and another PR at the same head never inherits it", async () => {
  const f = await githubApplicationFixture();
  f.addPull(12);
  const project = await f.sdk.github.project(f.scope);
  const source = { kind: "pull" as const, repository: project.repository, account: project.account, accountId: project.accountId, number: 11 };
  for (const number of [11, 12]) {
    const selected = await f.sdk.github.source(f.scope, { ...source, number });
    await f.sdk.sessions.associatePr(f.sessionId, { ...selected.source, expectedDigest: selected.digest });
  }
  const review = await f.sdk.github.previewCi(f.scope, source, { timeoutMs: 1000, pollMs: 50 });
  const started = await f.sdk.github.execute(review, review.document.confirmations, true);
  await f.sdk.github.wait(started.id!, { timeoutMs: 5000 });
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    const rail = page.getByRole("navigation", { name: "Sidebar panels" });
    await rail.getByRole("button", { name: "Code change", exact: true }).click();
    const pane = page.getByRole("region", { name: "Session code change", exact: true });
    const watch = async (number: number) => {
      const view = pane.getByRole("region", { name: `Pull request ${number}`, exact: true });
      await view.getByRole("tab", { name: /^Checks/ }).click();
      await view.getByText("Watch CI on this head", { exact: true }).click();
      return view;
    };
    let detail = await watch(11);
    await expect(detail).toContainText(started.id!);
    await expect(detail.getByRole("status").filter({ hasText: "CI: success" })).toBeVisible();
    await rail.getByRole("button", { name: "Code change", exact: true }).click();
    await rail.getByRole("button", { name: "Code change", exact: true }).click();
    detail = await watch(11);
    await expect(detail).toContainText(started.id!);
    await pane.getByRole("tablist", { name: "Session pull requests", exact: true }).getByRole("tab", { name: /^Pull request #12,/ }).click();
    detail = await watch(12);
    await expect(detail).not.toContainText(started.id!);
    await expect(detail).toContainText("No retained PR watch");
    expect(f.service.controller.snapshot().githubOperations.filter((operation) => operation.kind === "github.ci.watch")).toHaveLength(1);
    expect(f.writes()).toEqual({ issues: 0, pulls: 0 });
  } finally { await app.close(); await f.close(); }
});

test("CI attention names the original PR and stays unread when opening the conversation until explicitly marked read", async () => {
  const f = await githubApplicationFixture();
  const project = await f.sdk.github.project(f.scope), head = f.git(["rev-parse", "HEAD"]);
  const source = { kind: "pull" as const, repository: project.repository, account: project.account, accountId: project.accountId, number: 11 };
  f.setCi({ checks: [{ id: 82, name: "Generated failed check", status: "completed", conclusion: "failure", head_sha: head }], runs: [], statuses: [] });
  const review = await f.sdk.github.previewCi(f.scope, source, { timeoutMs: 1000, pollMs: 50 });
  const started = await f.sdk.github.execute(review, review.document.confirmations, true);
  await f.sdk.github.wait(started.id!, { timeoutMs: 5000 });
  const attention = f.sdk.getState().snapshot!.attention.find((entry) => entry.reason === "ci")!;
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), trigger = page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Inbox", exact: true });
    await trigger.click();
    const panel = page.getByRole("region", { name: "Inbox notifications", exact: true });
    await expect(panel).toContainText("PR #11");
    await expect(panel).toContainText("CI failure");
    await panel.getByRole("button", { name: f.session().title, exact: true }).click();
    await trigger.click();
    await expect(panel.getByRole("button", { name: `Mark attention read ${attention.id}`, exact: true })).toBeVisible();
    await panel.getByRole("button", { name: `Mark attention read ${attention.id}`, exact: true }).click();
    await expect(panel.locator(".attention-item.read")).toHaveCount(1);
    expect(f.session().pendingApproval).toBeNull();
    expect(f.session().pendingQuestionId).toBeNull();
    expect(f.writes()).toEqual({ issues: 0, pulls: 0 });
  } finally { await app.close(); await f.close(); }
});
