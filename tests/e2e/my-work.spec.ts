import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { myWorkFixture } from "../my-work-fixture.ts";
import { profileFixture } from "../fixtures/profiles.ts";
import { focusByKeyboard, openSettingsSection, waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "My Work desktop qualification uses generated hidden macOS windows.");
const launch = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } });
  await app.close();
};

test("hidden desktop explicitly configures sources, aggregates categories and filters/navigates without polling or writes", async () => {
  const f = await myWorkFixture(), app = await launch(f.stateDir);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message)); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Dashboard", exact: true }).press("Enter");
    const inbox = page.getByRole("region", { name: "GitHub My Work inbox", exact: true });
    await expect(inbox).toHaveAttribute("data-ready", "true");
    const before = f.calls.length;
    await expect(inbox.getByRole("button", { name: "Refresh configured repos", exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Active sessions", exact: true })).toBeVisible();
    expect(f.calls.length).toBe(before);
    await inbox.getByText("Configured repositories (0)", { exact: true }).click();
    await inbox.getByLabel("My Work source project", { exact: true }).selectOption(f.projectId);
    await inbox.getByRole("button", { name: "Review inbox source", exact: true }).press("Enter");
    const review = inbox.getByRole("region", { name: "Reviewed My Work source", exact: true });
    await expect(review).toContainText("generated-a:42"); await expect(review).toContainText(f.root);
    await review.getByRole("button", { name: "Confirm read-only source", exact: true }).press("Enter");
    await expect(review).toBeHidden();
    await f.configure(f.second); f.first.checks[0]!.conclusion = "startup_failure";
    await inbox.getByRole("button", { name: "Refresh configured repos", exact: true }).press("Enter");
    await expect.poll(() => f.service.controller.snapshot().myWorkRefreshes.at(-1)?.status).toBe("completed");
    await expect(inbox.locator(".my-work-card")).toHaveCount(2);
    const first = inbox.getByRole("button", { name: `Inspect ${f.first.repository}#11`, exact: true });
    await focusByKeyboard(first);
    await first.evaluate((node) => node.setAttribute("data-original-focus-node", "retained"));
    const repeated = await f.sdk.myWork.refresh(); await f.sdk.myWork.wait(repeated.id!);
    await expect(first).toHaveAttribute("data-original-focus-node", "retained");
    await expect(first).toBeFocused();
    await first.press("Enter");
    const detail = inbox.getByRole("region", { name: "My Work item details", exact: true });
    await expect(detail.getByRole("heading", { level: 3 })).toBeFocused();
    await expect(detail).toContainText("billing allowance"); await expect(detail).toContainText("Unresolved");
    expect(f.service.controller.snapshot().githubOperations).toHaveLength(0);
    const reads = f.calls.length;
    await inbox.getByLabel("My Work category", { exact: true }).selectOption("failed-ci");
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await inbox.getByLabel("My Work category", { exact: true }).selectOption("");
    await inbox.getByLabel("My Work account", { exact: true }).selectOption("generated-b:43");
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await expect(inbox.locator(".my-work-card")).toContainText("Generated inbox-b work");
    await inbox.getByLabel("My Work repository", { exact: true }).selectOption(f.second.repository);
    await inbox.getByLabel("My Work search", { exact: true }).fill("no-generated-match");
    await expect(inbox.locator(".my-work-card")).toHaveCount(0);
    await inbox.getByLabel("My Work search", { exact: true }).fill("");
    expect(f.calls.length).toBe(reads);
    f.second.pulls[0]!.state = "closed";
    const closed = await f.sdk.myWork.refresh(); await f.sdk.myWork.wait(closed.id!);
    await inbox.getByLabel("My Work PR state", { exact: true }).selectOption("closed");
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await expect(inbox.locator(".my-work-card")).toContainText("closed");
    expect(f.calls.every((call) => call.method === "GET" || call.path === "graphql")).toBe(true);
    expect(f.service.controller.events(0).some((event) => event.event_type === "model.started")).toBe(false);
    expect(errors).toEqual([]);
  } finally { await close(app); await f.close(); }
});

test("hidden inbox stop/outages preserve prior positive evidence and a separately reviewed follow-up creates only an idle draft", async () => {
  let block = false, entered = false;
  const f = await myWorkFixture({ beforeRead: async (_repo, path, signal) => {
    if (!block || !path.includes("/pulls?")) return; entered = true;
    await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  await f.configure(f.first); const first = await f.sdk.myWork.refresh(); await f.sdk.myWork.wait(first.id!);
  const app = await launch(f.stateDir);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    const inbox = page.getByRole("region", { name: "GitHub My Work inbox", exact: true });
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    block = true;
    await inbox.getByRole("button", { name: "Refresh configured repos", exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    await inbox.getByRole("button", { name: "Stop inbox refresh", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().myWorkRefreshes.at(-1)?.status).toBe("cancelled");
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await expect(inbox.getByRole("region", { name: "Repository observation status", exact: true })).toContainText("stale");
    block = false; f.first.revoked = true;
    const outage = await f.sdk.myWork.refresh(); await f.sdk.myWork.wait(outage.id!);
    await expect(inbox.getByRole("region", { name: "Repository observation status", exact: true })).toContainText("HTTP 403");
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    f.first.revoked = false;
    await inbox.getByRole("button", { name: `Inspect ${f.first.repository}#11`, exact: true }).click();
    const detail = inbox.getByRole("region", { name: "My Work item details", exact: true });
    await detail.getByRole("button", { name: "Review scoped follow-up", exact: true }).press("Enter");
    const review = detail.getByRole("region", { name: "Reviewed My Work follow-up", exact: true });
    await expect(review).toContainText("creates one idle source-bound session");
    expect(f.service.controller.snapshot().sessions).toHaveLength(1);
    await review.getByRole("button", { name: "Confirm idle follow-up session", exact: true }).press("Enter");
    await expect.poll(() => f.service.controller.snapshot().sessions.length).toBe(2);
    const session = f.service.controller.snapshot().sessions.at(-1)!;
    await expect(page.locator('.session-link[aria-current="page"]')).toHaveAttribute("data-session-id", session.id);
    expect(session.githubSource?.accountId).toBe("generated-a:42"); expect(session.turnId).toBeNull(); expect(session.queue).toHaveLength(0);
    expect(session.draft.text).toContain("Generated full PR body.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.service.controller.events(0).some((event) => event.event_type === "model.started")).toBe(false);
  } finally { await close(app); await f.close(); }
});

test("queued desktop /my-work and original native notification navigate the exact item without acknowledging or granting permission", async () => {
  const f = await myWorkFixture();
  await f.configure(f.first); await f.configure(f.second); f.first.checks[0]!.conclusion = "startup_failure";
  const refreshed = await f.sdk.myWork.refresh(); await f.sdk.myWork.wait(refreshed.id!);
  const app = await launch(f.stateDir);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill('/my-work query {"category":"failed-ci"}'); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await prompt.press("Enter");
    const inbox = page.getByRole("region", { name: "GitHub My Work inbox", exact: true });
    await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await expect.poll(() => f.service.controller.snapshot().commandExecutions.find((execution) => execution.name === "my-work")?.status).toBe("completed");
    const second = (await f.sdk.myWork.query({ accountId: "generated-b:43" })).entries[0]!;
    const reads = f.calls.length;
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:navigate-work", id, "default"), second.id);
    await expect(inbox.getByRole("region", { name: "My Work item details", exact: true })).toContainText("Generated inbox-b work");
    expect(f.calls.length).toBe(reads);
    expect(f.service.controller.snapshot().attention.find((entry) => entry.messageId === second.id)?.acknowledged).toBe(false);
    expect(f.service.controller.events(0).some((event) => event.event_type === "model.started")).toBe(false);
    expect(f.service.controller.snapshot().githubOperations).toHaveLength(0);
  } finally { await close(app); await f.close(); }
});

test("hidden My Work profile switching never exposes another profile's source/body or carries its filters", async () => {
  const f = await myWorkFixture(), profiles = await profileFixture(() => ({ github: { runProgram: f.githubProgram } }));
  const { profile, client: beta } = await profiles.create("Generated inbox profile");
  const project = await beta.projects.add(f.root);
  f.first.pulls[0]!.body = "GENERATED_PRIVATE_PROFILE_INBOX_BODY";
  const preview = await beta.myWork.previewSource({ env: "Local", projectId: project.id! }); await beta.myWork.configure(preview.preview, true);
  const refreshed = await beta.myWork.refresh(); await beta.myWork.wait(refreshed.id!);
  const app = await launch(profiles.stateDir);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const dashboard = () => page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    await dashboard();
    const inbox = page.getByRole("region", { name: "GitHub My Work inbox", exact: true });
    await expect(inbox).toContainText("Configure a repository"); await expect(inbox).not.toContainText("generated-a:42");
    await openSettingsSection(page, "General"); await page.getByLabel("Active profile", { exact: true }).selectOption(profile.id);
    await expect(page.getByRole("button", { name: /^Current profile: / })).toContainText(profile.name);
    await dashboard(); await expect(inbox.locator(".my-work-card")).toHaveCount(1);
    await inbox.getByRole("button", { name: `Inspect ${f.first.repository}#11`, exact: true }).click();
    await inbox.getByText("Complete retained PR body", { exact: true }).click();
    await expect(inbox).toContainText("GENERATED_PRIVATE_PROFILE_INBOX_BODY");
    await inbox.getByLabel("My Work search", { exact: true }).fill("GENERATED_BETA_FILTER");
    await openSettingsSection(page, "General"); await page.getByLabel("Active profile", { exact: true }).selectOption("default");
    await expect(page.getByRole("button", { name: /^Current profile: / })).toContainText("Default");
    await dashboard(); await expect(inbox.getByLabel("My Work search", { exact: true })).toHaveValue("");
    await expect(inbox).not.toContainText("GENERATED_PRIVATE_PROFILE_INBOX_BODY"); await expect(inbox).not.toContainText("generated-a:42");
  } finally { await close(app); await profiles.close(); await f.close(); }
});
