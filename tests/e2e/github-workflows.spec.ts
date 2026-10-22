import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { githubServiceFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The hidden native desktop Git checkpoint is qualified on macOS.");
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
    const panel = page.getByRole("region", { name: "Reviewed Git and GitHub workflows", exact: true });
    await expect(panel).toBeVisible();
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.tag.create");
    await panel.getByLabel("Exact tag name", { exact: true }).fill("generated-desktop-tag");
    const head = f.git(["rev-parse", "HEAD"]), index = await readFile(join(f.root, ".git/index"));
    await panel.getByLabel("Exact target branch/tag/commit", { exact: true }).fill(head);
    await panel.getByLabel("Annotated tag (otherwise lightweight)", { exact: true }).uncheck();
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact Git/GitHub operation review", exact: true });
    await expect(review).toContainText(f.root); await expect(review).toContainText(head);
    const execute = review.getByRole("button", { name: "Execute only this reviewed operation", exact: true });
    await expect(execute).toBeDisabled();
    await review.getByRole("checkbox").check();
    await panel.getByLabel("Exact tag name", { exact: true }).fill("generated-desktop-reviewed-tag");
    await expect(review).not.toBeVisible(); expect(f.git(["for-each-ref", "--format=%(refname)", "refs/tags/generated-desktop-tag"])).toBe("");
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    await review.getByRole("checkbox").check(); await execute.click();
    await expect(panel.getByRole("heading", { name: "Git/GitHub operation completed", exact: true })).toBeVisible();
    await f.sdk.refresh();
    const retained = await f.sdk.github.read(f.sdk.github.list(f.projectId)[0]!.id);
    expect(retained.operation.status).toBe("completed"); expect(retained.result?.kind).toBe("git.tag.create");
    expect(f.git(["rev-parse", "refs/tags/generated-desktop-reviewed-tag"])).toBe(head);
    expect(await readFile(join(f.root, ".git/index"))).toEqual(index);
    await panel.getByLabel("Git/GitHub operation", { exact: true }).selectOption("git.push");
    await panel.getByLabel("Exact destination branch", { exact: true }).fill("main");
    await panel.getByRole("button", { name: "Review exact operation", exact: true }).click();
    await expect(review).toContainText("I explicitly approve pushing protected/main branch main.");
    const confirmations = review.getByRole("checkbox"); expect(await confirmations.count()).toBe(3);
    await confirmations.nth(0).check(); await confirmations.nth(1).check(); await expect(execute).toBeDisabled();
    expect(f.sdk.github.list(f.projectId)).toHaveLength(1); expect(errors).toEqual([]);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible()))).toBe(false);
  } finally { try { await app?.close(); } finally { await f.close(); } }
});
