import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { githubApplicationFixture, githubServiceFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The hidden native desktop Git checkpoint is qualified on macOS.");
test("desktop authenticated search uses the exact project account and shows a complete source page without writes", async () => {
  const f = await githubApplicationFixture(), app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "GitHub workflows", exact: true }).click();
    await page.getByText("Advanced Git and GitHub operations", { exact: true }).click();
    const panel = page.getByRole("region", { name: "Reviewed Git and GitHub workflows", exact: true });
    await expect(panel.getByLabel("GitHub repository (owner/name)", { exact: true })).toHaveValue("generated-owner/fixture");
    await panel.getByText("Read GitHub issues, PRs, reviews, checks, runs, logs and releases", { exact: true }).click();
    await panel.getByLabel("GitHub resource", { exact: true }).selectOption("search");
    await panel.getByLabel("Issue and PR search terms", { exact: true }).fill("is:issue is:open (UI OR UX OR redesign OR polish)");
    await panel.getByRole("button", { name: "Read GitHub page", exact: true }).click();
    await expect(panel.getByText("#7 Generated issue / open", { exact: true })).toBeVisible();
    expect(f.calls.filter((call) => call.path.startsWith("search/issues?"))).toHaveLength(1);
    expect(f.writes()).toEqual({ issues: 0, pulls: 0 }); expect(f.session().turnId).toBeNull();
  } finally { await app.close(); await f.close(); }
});
test("desktop exact Git review invalidates edits, separately confirms main push, and shares independently retained tag results with the SDK", async () => {
  const f = await githubServiceFixture();
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
      args: [`--user-data-dir=${join(f.directory, "electron-profile")}`, ...(process.env.MOGURI_TEST_APP ? [] : ["."])],
      env: { ...process.env, TMPDIR: f.directory, TMP: f.directory, TEMP: f.directory, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" },
    });
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "GitHub workflows", exact: true }).click();
    await page.getByText("Advanced Git and GitHub operations", { exact: true }).click();
    const panel = page.getByRole("region", { name: "Reviewed Git and GitHub workflows", exact: true });
    await expect(panel).toBeVisible();
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.tag.create");
    await panel.getByLabel("Tag name", { exact: true }).fill("generated-desktop-tag");
    const head = f.git(["rev-parse", "HEAD"]), index = await readFile(join(f.root, ".git/index"));
    await panel.getByLabel("Target branch, tag or commit", { exact: true }).fill(head);
    await panel.getByLabel("Annotated tag (otherwise lightweight)", { exact: true }).uncheck();
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact Git/GitHub operation review", exact: true });
    await expect(review).toContainText(f.root); await expect(review).toContainText(head);
    const execute = review.getByRole("button", { name: "Execute only this reviewed operation", exact: true });
    await expect(execute).toBeDisabled();
    await review.getByRole("switch").check();
    await panel.getByLabel("Tag name", { exact: true }).fill("generated-desktop-reviewed-tag");
    await expect(review).not.toBeVisible(); expect(f.git(["for-each-ref", "--format=%(refname)", "refs/tags/generated-desktop-tag"])).toBe("");
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    await review.getByRole("switch").check(); await execute.click();
    await expect(panel.getByRole("heading", { name: "Git/GitHub operation completed", exact: true })).toBeVisible();
    await f.sdk.refresh();
    const retained = await f.sdk.github.read(f.sdk.github.list(f.projectId)[0]!.id);
    expect(retained.operation.status).toBe("completed"); expect(retained.result?.kind).toBe("git.tag.create");
    expect(f.git(["rev-parse", "refs/tags/generated-desktop-reviewed-tag"])).toBe(head);
    expect(await readFile(join(f.root, ".git/index"))).toEqual(index);
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.push");
    await panel.getByLabel("Destination branch", { exact: true }).fill("main");
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    await expect(review).toContainText("I explicitly approve pushing protected/main branch main.");
    const confirmations = review.getByRole("checkbox"); expect(await confirmations.count()).toBe(3);
    await confirmations.nth(0).check(); await confirmations.nth(1).check(); await expect(execute).toBeDisabled();
    expect(f.sdk.github.list(f.projectId)).toHaveLength(1); expect(errors).toEqual([]);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible()))).toBe(false);
  } finally { try { await app?.close(); } finally { await f.close(); } }
});

test("desktop built-in branch creation, rename and history-preserving rollback use exact shared Git reviews", async () => {
  const f = await githubServiceFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: [`--user-data-dir=${join(f.directory, "electron-profile")}`, ...(process.env.MOGURI_TEST_APP ? [] : ["."])],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "GitHub workflows", exact: true }).click();
    await page.getByText("Advanced Git and GitHub operations", { exact: true }).click();
    const panel = page.getByRole("region", { name: "Reviewed Git and GitHub workflows", exact: true });
    const execute = async () => {
      const previous = new Set(f.service.controller.snapshot().githubOperations.map((operation) => operation.id));
      await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
      const review = panel.getByRole("region", { name: "Exact Git/GitHub operation review", exact: true });
      await expect(review).toBeVisible();
      for (const check of await review.locator('input[type="checkbox"]').all()) await check.check();
      await review.getByRole("button", { name: "Execute only this reviewed operation", exact: true }).click();
      await expect.poll(() => f.service.controller.snapshot().githubOperations.find((operation) => !previous.has(operation.id))?.status).toBe("completed");
      await expect(panel.getByRole("heading", { name: "Git/GitHub operation completed", exact: true })).toBeVisible();
    };
    const base = f.git(["rev-parse", "HEAD"]);
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.branch.create");
    await panel.getByLabel("New local branch", { exact: true }).fill("generated/desktop-built-in");
    await panel.getByLabel("Start from branch or commit", { exact: true }).fill(base);
    await panel.getByLabel("Also switch to the new branch (requires a clean checkout)", { exact: true }).check();
    await execute(); expect(f.git(["branch", "--show-current"])).toBe("generated/desktop-built-in");
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.branch.rename");
    await panel.getByLabel("Current branch", { exact: true }).fill("generated/desktop-built-in");
    await panel.getByLabel("New branch name", { exact: true }).fill("generated/desktop-renamed");
    await execute(); expect(f.git(["branch", "--show-current"])).toBe("generated/desktop-renamed");
    await writeFile(join(f.root, "fixture.txt"), "Generated hidden rollback target.\n");
    f.git(["add", "--", "fixture.txt"]); f.git(["commit", "--no-gpg-sign", "-m", "Generated hidden rollback target"]);
    const target = f.git(["rev-parse", "HEAD"]);
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.revert");
    await panel.getByLabel("Current commit SHA to revert", { exact: true }).fill(target);
    await execute();
    expect(f.git(["rev-parse", "HEAD^"])).toBe(target);
    expect(f.git(["rev-parse", "HEAD^{tree}"])).toBe(f.git(["rev-parse", `${base}^{tree}`]));
    await f.sdk.refresh(); expect(f.sdk.github.list(f.projectId).filter((operation) => operation.status === "completed")).toHaveLength(3);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible()))).toBe(false);
  } finally { await app.close(); await f.close(); }
});
