import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { scriptReviewFixture } from "../fixtures/script-review.ts";
import { openSettingsSection, waitForWorkspace, openProjectMenu } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual hidden desktop qualification is macOS-only.");
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});

test("repository trust is an explicit keyboard-usable baseline decision, independently revocable and never an execution grant", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await writeFile(join(f.project, "generated-existing.sh"), "printf GENERATED_EXISTING\n");
  initializeGeneratedRepository(f.project, ["fixture.txt", "generated-existing.sh"]);
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await openSettingsSection(page, "Project");
    await expect(page.getByLabel("Default project workspace", { exact: true })).toHaveValue("worktree");
    await expect(page.getByLabel("Default pull request workflow", { exact: true })).toHaveValue("draft");
    const panel = page.getByRole("region", { name: "Repository script trust", exact: true });
    await panel.getByRole("button", { name: "Review repo trust", exact: true }).press("Enter");
    await expect(panel).toContainText(f.project);
    await panel.getByText("Scripts to trust", { exact: true }).click();
    await expect(panel.getByLabel("Repository trust source baseline", { exact: true })).toContainText("generated-existing.sh");
    const approve = panel.getByRole("button", { name: "Trust existing repo scripts", exact: true });
    await expect(approve).toBeDisabled();
    expect(sdk.repositoryTrust.get(f.session().projectId)).toBeUndefined();
    await panel.getByRole("checkbox").press("Space");
    await approve.press("Enter");
    await expect.poll(() => sdk.repositoryTrust.get(f.session().projectId)?.status).toBe("trusted");
    await expect(panel).toContainText("Trusted: 1 existing script");
    expect(sdk.repositoryTrust.get(f.session().projectId)?.actor).toBe("user");
    expect(f.requests).toHaveLength(0); expect(sdk.approvals.list()).toHaveLength(0);
    await panel.getByRole("button", { name: "Revoke repo trust", exact: true }).press("Enter");
    await expect.poll(() => sdk.repositoryTrust.get(f.session().projectId)?.status).toBe("revoked");
    await expect(panel).toContainText("Not trusted.");
    await page.getByLabel("Default pull request workflow", { exact: true }).selectOption("none");
    await expect.poll(() => sdk.getState().snapshot?.projectConfigurations.find((configuration) => configuration.projectId === f.session().projectId)?.values.repo.pullRequests).toBe("none");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(await readFile(join(f.project, "generated-existing.sh"), "utf8")).toBe("printf GENERATED_EXISTING\n");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("New chat creates a real default worktree and its desktop console never falls back to the original checkout", async () => {
  const f = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_DEFAULT_ROOT\\n'; pwd; exec cat"] } } });
  const git = initializeGeneratedRepository(f.project), index = git(["write-tree"]), sdk = await new MoguriSdk(f.service.connection).ready();
  await writeFile(join(f.project, "generated-user-edit.txt"), "Generated user edit remains on the original root.\n");
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await openProjectMenu(page, "project");
    await page.getByRole("menuitem", { name: "New session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.workspaceOrigin === "default-worktree")?.workspaceId).toBeTruthy();
    const session = sdk.getState().snapshot!.sessions.find((session) => session.workspaceOrigin === "default-worktree")!;
    const workspace = await sdk.workspaces.wait(session.workspaceId!);
    await openProjectMenu(page, "project");
    await page.getByRole("menuitem", { name: "Open project terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.terminals.find((terminal) => terminal.sessionId === session.id)?.workspaceId).toBe(workspace.id);
    const terminal = sdk.getState().snapshot!.terminals.find((terminal) => terminal.sessionId === session.id)!;
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain(workspace.path);
    await sdk.terminal.close(terminal.id);
    expect(git(["branch", "--show-current"])).toBe("main"); expect(git(["write-tree"])).toBe(index);
    expect(await readFile(join(f.project, "generated-user-edit.txt"), "utf8")).toBe("Generated user edit remains on the original root.\n");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("Inbox search, type and read filters select original script/error notifications without answering, approving or starting inference", async () => {
  const f = await scriptReviewFixture({ autopilot: true, findings: ["Generated harbor observation only."] });
  await f.send("Generated safe script notification."); await f.terminal();
  const failed = await f.sdk.sessions.create(null, "Generated error notification", { modelId: f.modelId });
  const saved = await f.sdk.command({ type: "draft.save", sessionId: failed.id!, expectedRevision: 0, text: "generated provider failure", attachments: [] });
  await f.sdk.command({ type: "message.send", sessionId: failed.id!, expectedRevision: saved.revision!, delivery: "queue" });
  await waitFor(() => f.sdk.sessions.get(failed.id!)?.status === "failed");
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Inbox", exact: true }).click();
    const inbox = page.getByRole("region", { name: "Inbox notifications", exact: true }), calls = f.requests.length;
    const search = inbox.getByRole("searchbox", { name: "Search notifications", exact: true });
    await inbox.getByLabel("Notification type", { exact: true }).selectOption("script-review");
    await search.fill("GENERATED-SCRIPT.SH harbor");
    await expect(inbox.locator(".attention-item")).toHaveCount(1);
    await expect(inbox.getByRole("region", { name: "Repository script reviews", exact: true })).toBeVisible();
    expect(f.review()?.approval).toBeUndefined();
    await inbox.getByLabel("Notification type", { exact: true }).selectOption("failed");
    await search.fill("unavailable provider");
    await expect(inbox.locator(".attention-item")).toHaveCount(1);
    await expect(inbox).toContainText("Generated unavailable provider");
    await inbox.getByLabel("Notification read state", { exact: true }).selectOption("unread");
    await inbox.getByRole("button", { name: /^Mark attention read / }).press("Enter");
    await expect(inbox).toContainText("No matching notifications");
    await inbox.getByLabel("Notification read state", { exact: true }).selectOption("read");
    await expect(inbox.locator(".attention-item")).toHaveCount(1);
    await search.fill("not-present-in-generated-notifications");
    await expect(inbox).toContainText("No matching notifications");
    await inbox.getByRole("button", { name: "Clear filters", exact: true }).press("Enter");
    await expect(search).toHaveValue("");
    await expect(inbox.getByRole("region", { name: "Repository script reviews", exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 740));
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(f.review()?.approval).toBeUndefined();
    expect(f.requests).toHaveLength(calls);
  } finally { await app.close(); await f.close(); }
});
