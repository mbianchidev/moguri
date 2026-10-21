import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { remoteMemoryFixture } from "../fixtures/remote-memory-service.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native Remote repository memory UI is qualified on macOS.");

test("desktop explicitly indexes and searches its captured SSH repository and shows actual index outcomes without a model", async () => {
  const f = await remoteMemoryFixture();
  await writeFile(join(f.workspace, "knowledge.ts"), "export function generatedDesktopRemoteKnowledge() { return 'generated remote knowledge'; }\n");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByRole("button", { name: "Repository memory", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Repository memory", exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("Pinned SSH repository memory");
    expect(f.controller.snapshot().jobs.filter((job) => job.kind === "memory.index")).toHaveLength(0);
    await page.getByRole("button", { name: "Index Remote repository", exact: true }).click();
    await expect(page.locator("body")).toContainText("Remote repository index / completed");
    await page.getByLabel("Search repository memory", { exact: true }).fill("generatedDesktopRemoteKnowledge");
    await page.getByRole("button", { name: "Search vectors", exact: true }).click();
    await expect(page.locator("pre").filter({ hasText: "generatedDesktopRemoteKnowledge" })).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: '"env": "Remote"' })).toBeVisible();
    expect((await f.sdk.memory.state(f.sessionId)).index?.binding.root).toBe(f.workspace);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900));
    await page.locator(".settings-result").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-memory-desktop.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    await page.locator(".settings-result").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-memory-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(f.requests.length).toBe(0); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("a held Remote memory query cannot populate the new Local settings scope after its env changes", async () => {
  const f = await remoteMemoryFixture(), indexed = await f.sdk.memory.indexSession(f.sessionId); await f.sdk.jobs.wait(indexed.id!);
  let held = false, release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  const validate = f.controller.remote.validateMemory.bind(f.controller.remote);
  f.controller.remote.validateMemory = async (...args) => { const result = await validate(...args); held = true; await gate; return result; };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByRole("button", { name: "Repository memory", exact: true }).click();
    await page.getByLabel("Search repository memory", { exact: true }).fill("generated source");
    await page.getByRole("button", { name: "Search vectors", exact: true }).click();
    await expect.poll(() => held).toBe(true); await f.sdk.sessions.env(f.sessionId, "Local");
    await expect(page.getByRole("button", { name: "Index Local repository", exact: true })).toBeVisible();
    release(); await expect(page.locator("pre").filter({ hasText: '"env": "Remote"' })).toHaveCount(0);
    expect(f.requests.length).toBe(0);
  } finally { release(); f.controller.remote.validateMemory = validate; await app.close(); await f.close(); }
});
