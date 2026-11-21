import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Workspace folders use generated repositories in hidden macOS windows.");

async function repository(path: string) {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "fixture.txt"), "generated original\n");
  initializeGeneratedRepository(path);
}

test("a trusted workspace folder adds chosen repositories as read-only projects and stays in sync", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const root = join(fixture.directory, "workspace");
  await repository(join(root, "generated-alpha")); await repository(join(root, "team", "generated-beta"));
  const canonical = await realpath(root);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, root);
    await openSettingsSection(page, "Repositories");
    const section = page.getByRole("region", { name: "Workspace folders", exact: true });
    await section.getByRole("button", { name: "Choose workspace folder", exact: true }).click();
    const review = page.getByRole("region", { name: "Workspace folder review", exact: true });
    await expect(review).toContainText(canonical);
    await expect(review.getByRole("checkbox", { name: /generated-alpha/ })).toBeChecked();
    await review.getByRole("checkbox", { name: /generated-beta/ }).uncheck();
    const add = review.getByRole("button", { name: "Add 1 project", exact: true });
    await expect(add).toBeDisabled();
    await review.getByRole("switch", { name: "I trust this folder and allow Moguri to read it", exact: true }).check();
    await add.click();
    await expect(review).toHaveCount(0);
    await expect(section.getByRole("status")).toHaveText("Added 1 project and kept the folder in sync.");
    await expect.poll(() => sdk.getState().snapshot!.projects.filter((project) => project.workspaceFolderId).map((project) => project.name)).toEqual(["generated-alpha"]);
    const folder = sdk.projects.folders.list()[0]!;
    expect(folder.excluded).toEqual(["team/generated-beta"]);

    const row = section.getByRole("list", { name: "Added workspace folders" }).getByRole("listitem");
    await expect(row).toContainText("1 project");
    await repository(join(root, "generated-gamma"));
    await row.getByRole("button", { name: `Check ${canonical} now`, exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.projects.filter((project) => project.workspaceFolderId).map((project) => project.name).sort()).toEqual(["generated-alpha", "generated-gamma"]);
    await expect(row).toContainText("2 projects");
    await expect(row).toContainText("added 1 repository");

    const sync = row.getByRole("switch", { name: `Keep ${canonical} in sync`, exact: true });
    await sync.uncheck();
    await expect.poll(() => sdk.projects.folders.list()[0]!.sync).toBe(false);
    await repository(join(root, "generated-delta"));
    await row.getByRole("button", { name: `Check ${canonical} now`, exact: true }).click();
    await expect(row).toContainText("1 new repository found.");
    await row.getByRole("button", { name: "Review new repositories", exact: true }).click();
    await expect(review.getByRole("checkbox", { name: /generated-delta/ })).toBeChecked();
    await expect(review.getByRole("checkbox", { name: /generated-beta/ })).not.toBeChecked();
    await expect(review.getByRole("radio", { name: /Import once/ })).toBeChecked();
    await review.getByRole("button", { name: "Cancel", exact: true }).click();

    const alpha = sdk.getState().snapshot!.projects.find((project) => project.name === "generated-alpha")!;
    await openSettingsSection(page, "Project");
    await page.getByRole("combobox", { name: "Configuration project", exact: true }).selectOption(alpha.id);
    await expect(page.getByText(`Added from ${canonical}. Moguri only reads this repository: every session works in its own worktree.`)).toBeVisible();
    const mode = page.getByRole("combobox", { name: "Default project workspace", exact: true });
    await expect(mode).toBeDisabled(); await expect(mode.locator("option")).toHaveText(["A new worktree (always)"]);
    await expect(page.getByText("Moguri doesn't change this repository's remotes because it only reads projects from a workspace folder.")).toBeVisible();
    // The General page mounts every section; let its saved state settle before closing so the unload guard sees no edit.
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
