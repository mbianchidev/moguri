import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk, type ManagedWorkspace } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop execution is qualified on macOS.");
test("desktop worktree creation, new chat, files, diff, plan and terminal all use the same owned root", async () => {
  const fixture = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_WORKTREE_CONSOLE\\n'; pwd; exec cat"] } } });
  const git = initializeGeneratedRepository(fixture.project), baseIndex = git(["write-tree"]);
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Project", exact: true }).click();
    await page.getByLabel("Managed worktree branch", { exact: true }).fill("moguri/generated-desktop");
    await page.getByLabel("Managed worktree base", { exact: true }).fill("main");
    await page.getByRole("button", { name: "Create worktree", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.managedWorkspaces[0]?.status).toBe("ready");
    const workspace = sdk.getState().snapshot!.managedWorkspaces[0]!;
    const record = page.locator(".workspace-record").filter({ hasText: workspace.branch });
    await record.locator("summary").click();
    await page.getByRole("button", { name: "Discover Git worktrees", exact: true }).click();
    await expect(page.getByRole("region", { name: "Managed worktrees" }).locator(".settings-result")).toContainText(workspace.id);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.getByLabel("Managed worktree branch", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/managed-workspace-settings.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.getByLabel("Managed worktree branch", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/managed-workspace-settings-compact.png") });
    await page.setViewportSize({ width: 1440, height: 940 });
    await writeFile(join(workspace.path, "workspace-only.txt"), "Generated file exists only in the owned checkout.");
    await writeFile(join(workspace.path, "fixture.txt"), "Generated desktop worktree change.\n");
    await record.getByRole("button", { name: "New chat", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.at(-1)?.workspaceId).toBe(workspace.id);
    const selected = sdk.getState().snapshot!.sessions.at(-1)!;
    const panels = page.getByRole("navigation", { name: "Sidebar panels" });
    await panels.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "workspace-only.txt", exact: true }).click();
    await expect(page.locator(".workspace-file-content")).toContainText("Generated file exists only in the owned checkout.");
    await panels.getByRole("button", { name: "Code change", exact: true }).click();
    await expect(page.locator(".unified-diff")).toContainText("Generated desktop worktree change");
    await panels.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    await page.getByLabel("Project plan", { exact: true }).fill("Generated isolated desktop plan.");
    await page.locator(".plan-panel").getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => readFile(join(workspace.path, "docs/plan.md"), "utf8").catch(() => "")).toBe("Generated isolated desktop plan.");
    await expect(readFile(join(fixture.project, "docs/plan.md"))).rejects.toThrow(/ENOENT/);
    await page.getByLabel("Project actions for project", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Open project terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.find((terminal) => terminal.sessionId === selected.id)?.workspaceId).toBe(workspace.id);
    const terminal = sdk.getState().snapshot!.terminals.find((terminal) => terminal.sessionId === selected.id)!;
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain(workspace.path);
    await panels.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("dialog", { name: "Close terminal pane", exact: true }).getByRole("button", { name: "Hide terminal", exact: true }).click();
    await page.getByRole("button", { name: "fixture.txt", exact: true }).click();
    await page.screenshot({ path: resolve(".moguri/artifacts/managed-workspace-files.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/managed-workspace-compact.png") });
    await sdk.terminal.close(terminal.id);
    await sdk.command({ type: "session.archive", sessionId: selected.id });
    expect(sdk.getState().snapshot!.managedWorkspaces[0]?.status).toBe("ready");
    expect(git(["branch", "--show-current"])).toBe("main"); expect(git(["write-tree"])).toBe(baseIndex);
    expect(await readFile(join(fixture.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("worktree removal uses one explicit dropdown target and a bin action while preserving every branch and unselected checkout", async () => {
  const fixture = await setupFixture(), git = initializeGeneratedRepository(fixture.project);
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), workspaces: ManagedWorkspace[] = [];
  for (const branch of ["moguri/generated-removal-first", "moguri/generated-removal-second"]) {
    const created = await sdk.workspaces.create(fixture.session().projectId, branch, { baseRef: "main" });
    workspaces.push(await sdk.workspaces.wait(created.id!));
  }
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Project", exact: true }).click();
    const panel = page.getByRole("region", { name: "Managed worktrees", exact: true });
    for (const workspace of workspaces) await panel.locator(".workspace-record").filter({ hasText: workspace.branch }).locator("summary").click();
    const target = panel.getByRole("combobox", { name: "Workspace reviewed for removal", exact: true });
    await expect(target).toHaveValue("");
    const first = panel.getByRole("button", { name: `Remove worktree ${workspaces[0]!.branch}`, exact: true });
    const second = panel.getByRole("button", { name: `Remove worktree ${workspaces[1]!.branch}`, exact: true });
    await target.selectOption(workspaces[0]!.id);
    await expect(first).toBeEnabled(); await expect(second).toBeDisabled();
    await target.selectOption(workspaces[1]!.id);
    await expect(first).toBeDisabled(); await expect(second.locator("svg[data-icon='Trash']")).toBeVisible();
    await second.click();
    await expect.poll(() => sdk.getState().snapshot?.managedWorkspaces.find((workspace) => workspace.id === workspaces[1]!.id)?.status).toBe("removed");
    expect(sdk.getState().snapshot?.managedWorkspaces.find((workspace) => workspace.id === workspaces[0]!.id)?.status).toBe("ready");
    expect(git(["branch", "--list", workspaces[1]!.branch])).toContain(workspaces[1]!.branch);
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
