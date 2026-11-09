import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startService } from "../../apps/service/src/server.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Established desktop reconnection uses generated hidden macOS windows.");

test("an established desktop authenticates a same-root/store explicit service restart and can still Quit its current owner", async () => {
  const f = await setupFixture(), stateDir = join(f.directory, "state");
  let next: Awaited<ReturnType<typeof startService>> | undefined;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  const processOwner = app.process();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    const original = await page.evaluate(() => window.moguri.connection());
    await f.service.close({ preserveTerminals: true });
    next = await startService({ stateDir, retentionKey: f.retentionKey, provider: f.provider,
      platform: { terminal: { vault: f.terminalVault, defaultRoot: f.home, executable: process.execPath, args: ["-e", "process.stdin.resume()"] } } });
    const live = await page.evaluate(() => window.moguri.connection());
    expect(live.pid).toBe(next.connection.pid);
    expect(live.storeId).toBe(original.storeId);
    expect(live.token).toBe(next.connection.token);
    expect(live.token).not.toBe(original.token);
    const health = await page.evaluate(async () => (await fetch("moguri://app/v1/health")).json());
    expect(health.pid).toBe(next.connection.pid);
    expect(health.lifecycle).toBeNull();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close();
    expect(next.store.db.isOpen).toBe(false);
    expect(f.requests.length).toBe(0);
  } finally {
    if (processOwner.exitCode === null && processOwner.signalCode === null) {
      await app.evaluate(({ app }) => { app.exit(0); });
    }
    await next?.close(); await f.close();
  }
});

test("an established desktop never adopts a different retained store through changed private metadata", async () => {
  const f = await setupFixture(), stateDir = join(f.directory, "state"), path = join(stateDir, "connection.json");
  const original = await readFile(path, "utf8");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    await writeFile(path, JSON.stringify({ ...f.service.connection, storeId: "f".repeat(64) }), { mode: 0o600 });
    const result = await page.evaluate(async () => {
      try { await window.moguri.connection(); return null; }
      catch (error) { return error instanceof Error ? error.message : "unconfirmed"; }
    });
    expect(result).toContain("store identity changed");
    expect(f.requests.length).toBe(0);
    expect(f.service.store.db.isOpen).toBe(true);
  } finally {
    await writeFile(path, original, { mode: 0o600 });
    await app.close(); await f.close();
  }
});
