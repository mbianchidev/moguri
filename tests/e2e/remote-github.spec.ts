import { openUsageDetails } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { remoteGithubFixture } from "../fixtures/remote-github-service.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native Remote metadata UI is qualified on macOS.");

test("desktop reviews the exact SSH account before a no-model private lookup and retains its original host provenance", async () => {
  const f = await remoteGithubFixture();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openUsageDetails(page);
    const dashboard = page.getByRole("region", { name: "Profile usage dashboard", exact: true });
    await dashboard.getByText("Repository attribution", { exact: true }).click();
    const repository = dashboard.getByRole("region", { name: "Repository attribution", exact: true });
    await repository.getByLabel("Repository scope session", { exact: true }).selectOption(f.sessionId);
    await repository.getByRole("button", { name: "Review repository binding", exact: true }).click();
    await expect(repository).toContainText("GitHub CLI account on captured SSH host");
    await expect(repository).toContainText(`${f.github.target.user}@${f.github.target.host}:${f.github.target.port}`);
    await expect(repository).toContainText("Pinned host key"); await expect(repository).toContainText(f.workspace);
    expect(await access(f.github.calls).then(() => true, () => false)).toBe(false);
    await repository.getByRole("button", { name: "Refresh verified metadata", exact: true }).click();
    await expect(repository).toContainText("Stored observation"); await expect(repository).toContainText("private");
    await expect(repository).toContainText("Observation SSH host"); await expect(repository).toContainText(f.workspace);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900));
    await repository.getByRole("heading", { name: "Stored observation", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-github-desktop.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    await repository.getByRole("heading", { name: "Stored observation", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-github-compact.png") });
    expect(await repository.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    expect((await f.github.records()).length).toBe(1); expect(f.requests.length).toBe(0); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("a held SSH lookup cannot publish a stale desktop observation after the session environment changes", async () => {
  const f = await remoteGithubFixture(); await f.github.configure("gate");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openUsageDetails(page);
    await page.getByText("Repository attribution", { exact: true }).click();
    const repository = page.getByRole("region", { name: "Repository attribution", exact: true });
    await repository.getByLabel("Repository scope session", { exact: true }).selectOption(f.sessionId);
    await repository.getByRole("button", { name: "Review repository binding", exact: true }).click();
    await repository.getByRole("button", { name: "Refresh verified metadata", exact: true }).click();
    await expect.poll(async () => access(f.github.ready).then(() => true, () => false)).toBe(true);
    await f.sdk.sessions.env(f.sessionId, "Local"); await f.github.release();
    await expect(repository).toContainText("failed"); await expect(repository).not.toContainText("Stored observation");
    expect(f.controller.snapshot().repositoryObservations.length).toBe(0);
    expect((await f.github.records()).length).toBe(1); expect(f.requests.length).toBe(0);
  } finally { await app.close(); await f.close(); }
});
