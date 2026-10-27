import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } });
  await app.close();
};
test.skip(process.platform !== "darwin", "Hidden native desktop workflow qualification is macOS-only.");

test("repository and project-item dropdowns show the actual account, full source and unsent session drafts", async () => {
  const fixture = await githubApplicationFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "New", exact: true }).click();
    const start = page.getByRole("dialog", { name: "New", exact: true });
    await start.getByRole("button", { name: "Clone repository", exact: true }).click();
    const repositories = start.getByLabel("GitHub repository", { exact: true });
    await expect(repositories).toBeEnabled(); await repositories.selectOption("41");
    await expect(start.getByLabel("Repository URL", { exact: true })).toHaveValue(fixture.repository.ssh_url);
    await expect(start.getByLabel("New clone folder name", { exact: true })).toHaveValue("fixture");
    await expect(start).toContainText("Signed in as generated-owner");
    await start.getByRole("button", { name: "Close New", exact: true }).click();
    await page.getByLabel("Project actions for checkout", { exact: true }).click();
    await page.getByRole("menuitem", { name: "From PR", exact: true }).click();
    const fromPr = page.getByRole("dialog", { name: "Session from PR", exact: true });
    await expect(fromPr.getByLabel("Pull request", { exact: true })).toBeEnabled();
    await fromPr.getByLabel("Pull request", { exact: true }).selectOption("11");
    await expect(fromPr.getByRole("region", { name: "Reviewed session source", exact: true })).toContainText("pull request body");
    await fromPr.getByRole("button", { name: "Start session", exact: true }).click();
    await expect(fromPr).not.toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.at(-1)?.prUrl).toBe("https://github.com/generated-owner/fixture/pull/11");
    expect(fixture.service.controller.snapshot().sessions.at(-1)?.draft.text).toContain("Generated **pull request body**.");
    expect(fixture.service.controller.snapshot().sessions.at(-1)?.turnId).toBeNull();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.getByLabel("Project actions for checkout", { exact: true }).click();
    await page.getByRole("menuitem", { name: "From work item", exact: true }).click();
    const fromIssue = page.getByRole("dialog", { name: "Session from work item", exact: true });
    await expect(fromIssue.getByLabel("GitHub issue", { exact: true })).toBeEnabled();
    await fromIssue.getByLabel("GitHub issue", { exact: true }).selectOption("7");
    await expect(fromIssue.getByRole("region", { name: "Reviewed session source", exact: true })).toContainText("issue body");
    await fromIssue.getByRole("button", { name: "Start session", exact: true }).click();
    await expect(fromIssue).not.toBeVisible();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Work item", exact: true }).click();
    const panel = page.getByRole("region", { name: "Project work items", exact: true });
    await expect(panel.getByRole("article", { name: "Issue details", exact: true })).toContainText("issue body");
    await panel.getByRole("button", { name: "Start session from issue", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.length).toBe(4);
    const sourceSession = fixture.service.controller.snapshot().sessions.at(-1)!;
    await expect(page.locator('.session-link[aria-current="page"]')).toHaveAttribute("data-session-id", sourceSession.id);
    expect(fixture.git(["branch", "--show-current"])).toBe("generated-feature"); expect(fixture.writes()).toEqual({ issues: 0, pulls: 0 });
    expect(errors).toEqual([]);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  } finally { await close(app); await fixture.close(); }
});

test("a concurrent project-policy change preserves publication text and requires a new explicit destination review", async () => {
  const fixture = await githubApplicationFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Work item", exact: true }).click();
    const panel = page.getByRole("region", { name: "Project work items", exact: true });
    await expect(panel.getByRole("button", { name: "New issue", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "New issue", exact: true }).click();
    await panel.getByLabel("GitHub issue title", { exact: true }).fill("Generated preserved issue");
    await panel.getByLabel("GitHub issue body", { exact: true }).fill("Generated unsaved publication body.");
    const configuration = (await fixture.sdk.projects.configuration(fixture.projectId)).configuration;
    await fixture.sdk.projects.configure(fixture.projectId, { ...configuration.values, instructions: "Generated changed project policy." }, configuration.revision);
    await expect(panel).toContainText("Your form is preserved");
    await expect(panel.getByLabel("GitHub issue body", { exact: true })).toHaveValue("Generated unsaved publication body.");
    await expect(panel.getByRole("button", { name: "Review issue", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "Reload destination, keep form", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Review issue", exact: true })).toBeEnabled();
    await expect(panel.getByLabel("GitHub issue title", { exact: true })).toHaveValue("Generated preserved issue");
    expect(fixture.writes()).toEqual({ issues: 0, pulls: 0 });
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally { await close(app); await fixture.close(); }
});

test("Code change and Work item publish reviewed PRs/issues once, retain full bodies and link the real results", async () => {
  const fixture = await githubApplicationFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const rail = page.getByRole("navigation", { name: "Sidebar panels" });
    await rail.getByRole("button", { name: "Code change", exact: true }).click();
    const pulls = page.getByRole("region", { name: "Project pull requests", exact: true });
    await expect(pulls.getByLabel("Pull request", { exact: true })).toBeEnabled();
    await pulls.getByLabel("Pull request", { exact: true }).selectOption("11");
    await expect(pulls.getByRole("article", { name: "Pull request details", exact: true })).toContainText("pull request body");
    await pulls.getByRole("button", { name: "New pull request", exact: true }).click();
    await expect(pulls.getByLabel("Base branch", { exact: true })).toHaveValue("main");
    await expect(pulls.getByLabel("Head branch", { exact: true })).toHaveValue("generated-feature");
    const draft = pulls.getByRole("switch", { name: "Create as draft", exact: true });
    await expect(draft).toBeChecked(); await draft.uncheck(); await expect(draft).not.toBeChecked(); await draft.check();
    await pulls.getByLabel("Pull request title", { exact: true }).fill("Generated reviewed PR");
    await pulls.getByLabel("Pull request body", { exact: true }).fill("Generated complete PR description.");
    await pulls.getByRole("button", { name: "Review pull request", exact: true }).click();
    const prReview = pulls.getByRole("region", { name: "Exact pull request review", exact: true });
    await expect(prReview.getByRole("switch")).toHaveCount(0);
    await expect(prReview).toBeVisible(); await expect(prReview.getByRole("button", { name: "Create and link pull request", exact: true })).toBeDisabled();
    for (const check of await prReview.getByRole("checkbox").all()) await check.check();
    await prReview.getByRole("button", { name: "Create and link pull request", exact: true }).click();
    await expect(pulls).toContainText("Created and linked pull request #31.");
    await expect(pulls.getByRole("article", { name: "Pull request details", exact: true })).toContainText("Generated complete PR description.");
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === fixture.sessionId)?.prUrl).toBe("https://github.com/generated-owner/fixture/pull/31");
    await rail.getByRole("button", { name: "Work item", exact: true }).click();
    const issues = page.getByRole("region", { name: "Project work items", exact: true });
    await expect(issues.getByRole("button", { name: "New issue", exact: true })).toBeEnabled();
    await issues.getByRole("button", { name: "New issue", exact: true }).click();
    await issues.getByLabel("GitHub issue title", { exact: true }).fill("Generated reviewed issue");
    await issues.getByLabel("GitHub issue body", { exact: true }).fill("Generated complete issue description.");
    await issues.getByRole("button", { name: "Review issue", exact: true }).click();
    const issueReview = issues.getByRole("region", { name: "Exact issue review", exact: true });
    await expect(issueReview).toBeVisible();
    for (const check of await issueReview.getByRole("checkbox").all()) await check.check();
    await issueReview.getByRole("button", { name: "Create and link issue", exact: true }).click();
    await expect(issues).toContainText("Created and linked issue #21.");
    await expect(issues.getByRole("article", { name: "Issue details", exact: true })).toContainText("Generated complete issue description.");
    expect(fixture.writes()).toEqual({ issues: 1, pulls: 1 });
    expect(fixture.service.controller.snapshot().githubOperations.every((operation) => operation.status === "completed")).toBe(true);
    expect(errors).toEqual([]);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/session-github-workflows.png") });
  } finally { await close(app); await fixture.close(); }
});

test("approval scopes persist across turns, Autopilot explicitly enables unattended approvals and update token help stays read-only", async () => {
  const fixture = await setupFixture(); await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await fixture.send("generated tool with remembered desktop approval");
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toBeVisible(); await approval.getByLabel("Approval scope", { exact: true }).selectOption("project");
    await approval.getByRole("button", { name: "Approve for this project", exact: true }).click();
    await fixture.terminal();
    expect(fixture.service.controller.snapshot().settings.values.permissions.remembered).toHaveLength(1);
    await fixture.send("generated tool with remembered desktop approval again"); await fixture.terminal();
    await expect(approval).not.toBeVisible();
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await page.getByRole("dialog", { name: "Autonomy level", exact: true }).getByRole("button", { name: /^Autopilot Automatically approve/ }).click();
    await expect.poll(() => fixture.session().controls.automaticApprovals).toBe(true);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("Create a token with the right permissions", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Private application updates", exact: true })).toContainText("Contents, Read-only");
    await expect(page.getByRole("button", { name: "Create token for read-only updates", exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().settings.values.permissions.tools).toEqual([]);
  } finally { await close(app); await fixture.close(); }
});
