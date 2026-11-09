import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setupFixture } from "../fixture.ts";
import { cloneRepositoryFixture } from "../fixtures/clone-repository.ts";
import { githubServiceFixture } from "../github-workflows-fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
async function close(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } }); await app.close();
}
test.skip(process.platform !== "darwin", "Repository Settings use generated hidden macOS windows.");

test("Settings reviews and imports an actual generated 38-URL bullet list, retains results on reload and never starts a model", async () => {
  test.setTimeout(60_000);
  const source = await cloneRepositoryFixture(Array.from({ length: 38 }, (_, index) => `/generated-${index}/project.git`)), f = await setupFixture();
  let app: ElectronApplication | undefined;
  try {
    app = await launch(f.directory);
    const page = await app.firstWindow(); await openSettingsSection(page, "Repositories");
    const panel = page.getByRole("region", { name: "Repository management", exact: true });
    await panel.getByLabel("Repository URLs", { exact: true }).fill(source.repositories.map((url) => `- ${url}`).join("\n"));
    await panel.getByLabel("Import parent folder", { exact: true }).fill(f.directory);
    const preview = panel.getByRole("button", { name: "Preview repository import", exact: true });
    await preview.focus(); await page.keyboard.press("Enter");
    const reviewed = panel.getByRole("region", { name: "Repository import preview", exact: true });
    await expect(reviewed.locator("li")).toHaveCount(38); expect(source.requests()).toBe(0);
    await expect(reviewed.getByRole("button", { name: "Import reviewed repositories", exact: true })).toBeDisabled();
    await reviewed.getByRole("switch").check();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/repository-import-review.png") });
    await reviewed.getByRole("button", { name: "Import reviewed repositories", exact: true }).click();
    const results = panel.getByRole("region", { name: "Repository import results", exact: true });
    await expect(results.getByRole("status")).toContainText("completed: 38 of 38", { timeout: 40_000 });
    expect(f.service.controller.snapshot().projects).toHaveLength(39);
    const batch = f.service.controller.snapshot().repositoryImports[0]!;
    for (const item of batch.items) expect(await readFile(join(item.path, "generated.txt"), "utf8")).toContain("Generated repository clone contents.");
    await page.reload(); await openSettingsSection(page, "Repositories");
    await expect(page.getByRole("region", { name: "Repository import results", exact: true }).getByRole("status")).toContainText("completed: 38 of 38");
    expect(f.service.controller.snapshot().repositoryImports).toHaveLength(1); expect(f.requests).toHaveLength(0);
    await page.screenshot({ path: resolve(".moguri/artifacts/repository-import-results.png") });
  } finally { if (app) await close(app); await f.close(); await source.close(); }
});

test("Settings cancel preserves a partial destination and original service-owned batch across client reload", async () => {
  const source = await cloneRepositoryFixture(), f = await setupFixture();
  let app: ElectronApplication | undefined;
  try {
    app = await launch(f.directory);
    source.hold(); const page = await app.firstWindow(); await openSettingsSection(page, "Repositories");
    await page.getByLabel("Repository URLs", { exact: true }).fill(source.repository);
    await page.getByLabel("Import parent folder", { exact: true }).fill(f.directory);
    await page.getByRole("button", { name: "Preview repository import", exact: true }).click();
    await page.getByRole("region", { name: "Repository import preview", exact: true }).getByRole("switch").check();
    await page.getByRole("button", { name: "Import reviewed repositories", exact: true }).click();
    await expect.poll(source.held).toBe(true);
    await page.getByRole("button", { name: "Cancel repository import", exact: true }).click();
    await expect(page.getByRole("region", { name: "Repository import results", exact: true }).getByRole("status")).toContainText("partial:");
    const batch = f.service.controller.snapshot().repositoryImports[0]!, requests = source.requests();
    expect(await realpath(batch.items[0]!.path)).toBe(batch.items[0]!.path);
    await page.reload(); await openSettingsSection(page, "Repositories");
    await expect(page.getByRole("button", { name: "Acknowledge inspected entry 1", exact: true })).toBeDisabled();
    expect(f.service.controller.snapshot().repositoryImports[0]!.id).toBe(batch.id);
    expect(source.requests()).toBe(requests); expect(f.service.controller.snapshot().projects).toHaveLength(1);
    expect(f.requests).toHaveLength(0);
  } finally { if (app) await close(app); await f.close(); await source.close(); }
});

test("Project Settings changes a shared remote only after exact confirmation and preserves staged/dirty bytes", async () => {
  const f = await githubServiceFixture();
  let app: ElectronApplication | undefined;
  try {
    app = await launch(f.directory);
    const linked = join(f.directory, "linked"); f.git(["worktree", "add", "-b", "generated-settings-linked", linked]);
    // Seed the generated branch cache before exact config review, not during a workspace observer's later write.
    f.git(["config", "branch.generated-settings-linked.vscode-merge-base", "origin/main"]);
    await writeFile(join(f.root, "fixture.txt"), "Generated Settings staged bytes.\n"); f.git(["add", "--", "fixture.txt"]);
    await writeFile(join(f.root, "fixture.txt"), "Generated Settings dirty bytes.\n");
    const before = await readFile(join(f.root, ".git", "index")), page = await app.firstWindow();
    await openSettingsSection(page, "Project");
    for (const terminal of f.service.controller.snapshot().terminals) if (!["closed", "failed", "acknowledged"].includes(terminal.status)) await f.sdk.terminal.close(terminal.id);
    const panel = page.getByRole("region", { name: "Repository remote URL", exact: true });
    await panel.getByLabel("New remote URL", { exact: true }).fill("git@github.com:generated-settings-org/fixture.git");
    await panel.getByRole("button", { name: "Preview remote URL change", exact: true }).click();
    const review = panel.getByRole("region", { name: "Remote URL change review", exact: true });
    await expect(review.locator("li")).toHaveCount(2); await expect(review).toContainText(linked);
    await expect(review.getByRole("button", { name: "Apply reviewed remote URL", exact: true })).toBeDisabled();
    expect(f.git(["remote", "get-url", "origin"])).toBe(f.remote);
    for (const checkbox of await review.getByRole("switch").all()) { await checkbox.focus(); await page.keyboard.press("Space"); }
    await mkdir(resolve(".moguri/artifacts"), { recursive: true }); await page.screenshot({ path: resolve(".moguri/artifacts/repository-remote-review.png") });
    await review.getByRole("button", { name: "Apply reviewed remote URL", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("completed", { timeout: 15_000 });
    expect(f.git(["remote", "get-url", "origin"])).toBe("git@github.com:generated-settings-org/fixture.git");
    expect(await readFile(join(f.root, ".git", "index"))).toEqual(before);
    expect(await readFile(join(f.root, "fixture.txt"), "utf8")).toBe("Generated Settings dirty bytes.\n");
    await expect(panel.getByLabel("New remote URL", { exact: true })).toHaveValue("");
    await panel.getByRole("button", { name: "Inspect remote change", exact: true }).click();
    await expect(panel.getByText("Original remote change and retained outcome", { exact: true })).toBeVisible();
  } finally { if (app) await close(app); await f.close(); }
});
