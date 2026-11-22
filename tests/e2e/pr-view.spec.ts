import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";
import { fixtureProvider } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native PR view qualification is macOS-only.");

const tourReply = (request: Record<string, unknown>) => {
  const messages = Array.isArray(request.messages) ? request.messages as { role?: string; content?: unknown }[] : [];
  const prompt = JSON.stringify(messages.filter((message) => message.role === "user").at(-1)?.content ?? "");
  const [, number, head] = /\(#(\d+)\) at head ([a-f0-9]{40})/.exec(prompt) ?? [];
  if (!number || !head) return { text: "Generated reply without a tour." };
  const tour = { version: 1, pr: Number(number), headSha: head, risk: "medium", impact: "low", attention: "high",
    overview: "Generated overview of `generated.ts`.", edges: [{ from: 1, to: 2, label: "generated dependency" }],
    steps: [{ title: "Generated first step", summary: "Generated first step summary.", snippets: [{ path: "generated.ts", startLine: 1, endLine: 1 }] },
      { title: "Generated second step", summary: "Generated second step summary.", snippets: [] }] };
  return { text: `Generated tour follows.\n\n\`\`\`moguri-tour\n${JSON.stringify(tour)}\n\`\`\`` };
};

test("a linked PR opens as tabs: reviewed edits, draft state, files with an agent tour, activity filters, Actions checks and commits", async () => {
  const provider = await fixtureProvider({ respond: (request) => tourReply(request) });
  const f = await githubApplicationFixture({ provider: provider.provider });
  f.addPull(12);
  await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, modelId: provider.modelId }, f.session().revision);
  const context = await f.sdk.github.project(f.scope);
  for (const number of [11, 12]) {
    const source = await f.sdk.github.source(f.scope, { kind: "pull", repository: context.repository, account: context.account, accountId: context.accountId, number });
    await f.sdk.sessions.associatePr(f.sessionId, { ...source.source, expectedDigest: source.digest });
  }
  const original = f.session().prUrl;
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    await expect(navigation.getByRole("button", { name: f.session().title, exact: true }).locator(".pr-count")).toHaveText("2");
    // Hidden windows never open a browser; record the requested URL instead (after startup registered the real handler).
    await app.evaluate(({ ipcMain }) => {
      const opened: string[] = []; (globalThis as { opened?: string[] }).opened = opened;
      ipcMain.removeHandler("moguri:open-external"); ipcMain.handle("moguri:open-external", (_event, url: unknown) => { opened.push(String(url)); });
    });
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Code change", exact: true }).click();
    const pane = page.getByRole("region", { name: "Session code change", exact: true });
    const switcher = pane.getByRole("tablist", { name: "Session pull requests", exact: true });
    await expect(switcher.getByRole("tab")).toHaveCount(2);
    await expect(switcher.getByRole("tab", { name: /^Pull request #11,/ })).toHaveAttribute("aria-selected", "true");
    const view = pane.getByRole("region", { name: "Pull request 11", exact: true }), title = view.getByRole("heading", { level: 3 });
    await expect(title).toContainText("Generated pull request");
    await expect(view.getByRole("button", { name: "Open pull request #11 on GitHub", exact: true })).toBeVisible();
    await expect(view.getByRole("tabpanel")).toContainText("pull request body");
    await expect(view.getByRole("tab", { name: "Files, 1 changed", exact: true })).toBeVisible();
    await expect(view.getByRole("tab", { name: "Commits, 2", exact: true })).toBeVisible();
    await expect(view.getByRole("button", { name: "Reviewers: generated-reviewer", exact: true })).toBeVisible();
    await expect(view.getByRole("button", { name: "Assignees: generated-owner", exact: true })).toBeVisible();
    const review = view.getByRole("region", { name: "Review GitHub change", exact: true });
    const confirm = async () => {
      await expect(review).toBeVisible();
      for (const check of await review.getByRole("checkbox").all()) await check.check();
      await review.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(review).toHaveCount(0);
    };

    await view.getByRole("button", { name: "Labels: generated-label", exact: true }).click();
    await page.getByRole("dialog", { name: "Labels", exact: true }).getByRole("menuitemcheckbox", { name: "generated-docs" }).click();
    await expect(review).toContainText("Add label generated-docs");
    await confirm();
    await expect(view.getByRole("button", { name: "Labels: generated-label, generated-docs", exact: true })).toBeVisible();
    expect(f.workItem(11)!.labels.map((label) => label.name)).toEqual(["generated-label", "generated-docs"]);

    await view.getByRole("button", { name: "Edit title and description", exact: true }).click();
    const editor = view.getByRole("form", { name: "Edit pull request", exact: true });
    await editor.getByLabel("Title", { exact: true }).fill("Generated renamed pull request");
    await editor.getByRole("button", { name: "Review changes", exact: true }).click();
    await confirm();
    await expect(title).toContainText("Generated renamed pull request");
    await expect(editor).toHaveCount(0);

    await view.getByRole("button", { name: "Draft. Change pull request state", exact: true }).click();
    await page.getByRole("dialog", { name: "Pull request state", exact: true }).getByRole("menuitem", { name: /Ready for review/ }).click();
    await expect(review).toContainText("Mark pull request #11 ready for review.");
    await confirm();
    await expect(view.getByRole("button", { name: "Ready for review. Change pull request state", exact: true })).toBeVisible();
    expect(f.workItem(11)!.draft).toBe(false);
    await expect(switcher.getByRole("tab", { name: "Pull request #11, open pull request", exact: true })).toBeVisible();

    await view.getByRole("tab", { name: /^Files/ }).click();
    const diff = view.getByRole("region", { name: "Diff of generated.ts", exact: true });
    await expect(diff).toContainText("new generated line");
    // @pierre/diffs colours Shiki tokens with inline styles inside its shadow root (D70).
    await expect.poll(() => diff.locator('[data-line-type="change-addition"] span[style]').count()).toBeGreaterThan(0);
    await view.getByRole("button", { name: "Show the full file generated.ts", exact: true }).click();
    await expect(diff).toContainText("generated third line");
    await view.getByRole("button", { name: "Comment on generated.ts", exact: true }).click();
    const comment = diff.getByRole("form", { name: "Review comment on generated.ts line 1", exact: true });
    await comment.getByLabel("Review comment", { exact: true }).fill("Generated inline review note.");
    await comment.getByRole("button", { name: "Comment", exact: true }).click();
    const inlineReview = comment.getByRole("region", { name: "Review GitHub change", exact: true });
    await expect(inlineReview).toContainText("Post a review comment on generated.ts line 1 of pull request #11.");
    for (const check of await inlineReview.getByRole("checkbox").all()) await check.check();
    await inlineReview.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(view.getByText("Comment posted on generated.ts line 1. It shows under Reviews.", { exact: true })).toBeVisible();
    await expect(comment).toHaveCount(0);
    expect(f.reviewComments(11).map((value) => [value.path, value.line, value.side, value.body])).toEqual([["generated.ts", 1, "RIGHT", "Generated inline review note."]]);
    await page.screenshot({ path: resolve(".moguri/artifacts/pr-view-diff.png") });
    await view.getByRole("button", { name: "Tour", exact: true }).click();
    const tour = view.getByRole("region", { name: "Pull request tour", exact: true });
    await tour.getByRole("button", { name: "Generate tour", exact: true }).click();
    await expect(tour.getByRole("list", { name: "Tour steps", exact: true })).toContainText("Generated first step", { timeout: 20_000 });
    await expect(tour).toContainText("Generated overview of");
    await expect(tour).toContainText("generated dependency");
    await expect(tour.getByRole("region", { name: /^Diff of generated\.ts/ })).toContainText("new generated line");
    await tour.getByRole("checkbox", { name: /^Reviewed generated\.ts/ }).check();
    await expect(tour).toContainText("1/1 snippets");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.getByRole("button", { name: "Maximize session sidebar", exact: true }).click();
    await tour.screenshot({ path: resolve(".moguri/artifacts/pr-view-tour.png") });
    await view.getByRole("tab", { name: "Description", exact: true }).click();
    await page.screenshot({ path: resolve(".moguri/artifacts/pr-view-description.png") });
    await view.getByRole("tab", { name: /^Files/ }).click();

    await view.getByRole("tab", { name: "Reviews", exact: true }).click();
    const activity = view.getByRole("list", { name: "Pull request activity", exact: true });
    await expect(activity).toContainText("Generated approved review.");
    await expect(activity).toContainText("changed the title from");
    await expect(activity).toContainText("Generated head commit");
    await expect(activity).toContainText("Generated inline review note.");
    await view.getByRole("button", { name: "Filter and sort activity", exact: true }).click();
    await page.getByRole("dialog", { name: "Filter and sort activity", exact: true }).getByRole("menuitemradio", { name: "Unresolved" }).click();
    await expect(activity).toContainText("Generated unresolved thread.");
    await expect(activity).not.toContainText("Generated approved review.");

    await view.getByRole("tab", { name: /^Checks/ }).click();
    await expect(view.getByText("All checks have passed", { exact: true })).toBeVisible();
    const check = view.getByRole("button", { name: "Generated CI / Generated checks, successful. Open the workflow run in GitHub Actions", exact: true });
    await check.click();
    await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual([expect.stringMatching(/\/actions\/runs\/80\/job\//)]);
    await page.screenshot({ path: resolve(".moguri/artifacts/pr-view-checks.png") });

    await view.getByRole("tab", { name: /^Commits/ }).click();
    await expect(view.getByRole("button", { name: /^Generated head commit, [a-f0-9]{7}\. Open on GitHub$/ })).toBeVisible();
    await expect(view.getByRole("button", { name: /^Generated first commit, / })).toBeVisible();
    await view.getByRole("tab", { name: "Reviews", exact: true }).click();
    await view.getByRole("button", { name: "Filter and sort activity", exact: true }).click();
    await page.getByRole("dialog", { name: "Filter and sort activity", exact: true }).getByRole("menuitemradio", { name: "All" }).click();
    await page.screenshot({ path: resolve(".moguri/artifacts/pr-view-reviews.png") });

    await switcher.getByRole("tab", { name: /^Pull request #12,/ }).click();
    await expect(pane.getByRole("region", { name: "Pull request 12", exact: true }).getByRole("heading", { level: 3 })).toContainText("Generated PR 12");
    await switcher.getByRole("tab", { name: /^Pull request #11,/ }).click();
    await expect(pane.getByRole("region", { name: "Pull request 11", exact: true })).toBeVisible();
    await pane.getByText("Open another pull request", { exact: true }).click();
    await expect(pane.getByRole("button", { name: "New pull request", exact: true })).toBeVisible();
    await expect(pane.getByRole("listbox", { name: "Pull request", exact: true })).toHaveCount(0);
    expect(f.session().prUrl).toBe(original);
    expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); await provider.close(); }
});
