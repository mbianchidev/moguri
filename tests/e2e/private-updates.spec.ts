import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { startService } from "../../apps/service/src/server.ts";
import { generatedApplication, generatedUpdateFeed } from "../fixtures/updates.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop update qualification is macOS-only.");
test("automatic-check flags save without a pending PAT, and an explicit hidden check stages but never replaces or opens an app", async () => {
  const fixture = await setupFixture(); await fixture.service.close();
  const generated = await generatedApplication(join(fixture.directory, "release")), feed = generatedUpdateFeed(generated), values = new Map<string, string>();
  const vault = { read: async (id: string) => values.get(id) ?? null, write: async (id: string, value: string) => { values.set(id, value); }, remove: async (id: string) => { values.delete(id); } };
  const service = await startService({ stateDir: join(fixture.directory, "state"), provider: fixture.provider, retentionKey: fixture.retentionKey,
    updates: { version: "0.30.0-alpha.1", arch: "arm64", fetch: feed.fetcher, vault, quarantine: async () => {} } });
  const sdk = await new MoguriSdk(service.connection).ready(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const token = `ghp_${"g".repeat(30)}`;
    await page.getByLabel("Private release PAT", { exact: true }).fill(token);
    await page.getByLabel("Automatically check and stage updates at app startup and every four hours", { exact: true }).uncheck();
    await expect.poll(async () => (await sdk.application.status()).configuration.values.automaticUpdates).toBe(false);
    expect(values.size).toBe(0); expect(feed.requests.length).toBe(0);
    await expect(page.getByLabel("Private release PAT", { exact: true })).toHaveValue(token);
    await page.getByRole("button", { name: "Save private release PAT", exact: true }).click();
    await expect.poll(() => values.get("private-github-release")).toBe(token);
    await expect(page.getByLabel("Private release PAT", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Check for updates now", exact: true }).click();
    await expect.poll(async () => (await sdk.application.updates.status()).update.operation?.status).toBe("ready");
    await expect(page.getByText("Installing updates requires Moguri's packaged app.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "About source-runtime update limits", exact: true }).focus();
    await expect(page.getByRole("tooltip")).toContainText("This unpackaged/source runtime can inspect and stage releases, but cannot replace the checkout.");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Install verified update and restart", exact: true })).toHaveCount(0);
    expect(fixture.requests.length).toBe(0); expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await service.close(); await fixture.close(); }
});
