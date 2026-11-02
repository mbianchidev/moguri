import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native PR-pane qualification is macOS-only.");
test("multiple exact PRs have a count and selection; files, Actions, jobs, reviews and watch use the real bound head/account", async () => {
  const f = await githubApplicationFixture();
  f.addPull(12);
  const context = await f.sdk.github.project(f.scope);
  for (const number of [11, 12]) {
    const source = await f.sdk.github.source(f.scope, { kind: "pull", repository: context.repository, account: context.account, accountId: context.accountId, number });
    await f.sdk.sessions.associatePr(f.sessionId, { ...source.source, expectedDigest: source.digest });
  }
  const original = f.session().prUrl;
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const session = navigation.getByRole("button", { name: f.session().title, exact: true });
    await expect(session.locator(".pr-count")).toHaveText("2");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Code change", exact: true }).click();
    const pane = page.getByRole("region", { name: "Session code change", exact: true });
    await expect(pane.getByLabel("Associated pull request", { exact: true }).locator("option")).toHaveCount(2);
    const detail = pane.getByRole("region", { name: "Pull request files, Actions and reviews", exact: true });
    await expect(detail.locator(".unified-diff")).toContainText("new generated line");
    await detail.getByRole("tab", { name: "Actions", exact: true }).click();
    await expect(detail).toContainText("Generated CI");
    await detail.getByRole("button", { name: "Show jobs and steps", exact: true }).click();
    await expect(detail).toContainText("Generated install: completed / success");
    await detail.getByRole("button", { name: "Back to exact-head runs", exact: true }).click();
    await detail.getByRole("button", { name: "Review exact CI watch", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Start exact-head watch", exact: true })).toBeVisible();
    for (const checkbox of await detail.getByRole("checkbox").all()) await checkbox.check();
    await detail.getByRole("button", { name: "Start exact-head watch", exact: true }).click();
    await expect(detail.getByRole("status").filter({ hasText: "CI: success" })).toBeVisible();
    await detail.getByRole("tab", { name: "Reviews", exact: true }).click();
    await expect(detail).toContainText("Generated inline review comment.");
    await detail.getByLabel("PR review view", { exact: true }).selectOption("threads");
    await expect(detail).toContainText("Generated unresolved thread.");
    const firstUrl = original!;
    await pane.getByLabel("Associated pull request", { exact: true }).selectOption("https://github.com/generated-owner/fixture/pull/12");
    await expect(pane.getByRole("heading", { name: "#12 Generated PR 12", exact: true })).toBeVisible();
    await expect(pane.locator(".unified-diff")).toContainText("new generated line");
    await expect(pane.getByRole("region", { name: "Pull request files, Actions and reviews", exact: true })).toContainText(`/ head ${f.git(["rev-parse", "HEAD"])}`);
    expect(f.session().prUrl).toBe(firstUrl);
    expect(f.writes()).toEqual({ issues: 0, pulls: 0 });
    f.changeHead("c".repeat(40));
    await pane.getByRole("button", { name: "Refresh selected head", exact: true }).click();
    await expect(pane.getByRole("alert").filter({ hasText: /head changed|pane is stale/ })).toBeVisible();
    expect(f.calls.some((call) => call.path.includes("/files?"))).toBe(true);
    expect(f.calls.some((call) => call.path.includes("/jobs?"))).toBe(true);
  } finally { await app.close(); await f.close(); }
});
