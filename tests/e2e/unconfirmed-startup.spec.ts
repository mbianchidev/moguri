import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { readPrivateConnection } from "../../packages/client/src/node.ts";
import { setupFixture } from "../fixture.ts";
import { assertOperationLatency } from "../fixtures/latency-budgets.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Original-owner deferred startup uses generated hidden macOS windows.");
const launch = (stateDir: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });

test("the real unconfirmed deadline preserves saved drafts without a startup composer and reconnects only to the late original service", async () => {
  test.setTimeout(95_000);
  const f = await setupFixture(), stateDir = join(f.directory, "state"), sdk = await new MoguriSdk(f.service.connection).ready();
  const provider = structuredClone(f.provider.state);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined, child: ReturnType<typeof spawn> | undefined;
  let childExit: ReturnType<typeof once> | undefined, live: MoguriSdk | undefined;
  try {
    await f.configure(); await sdk.refresh();
    const original = "Generated saved draft across the actual 60-second unconfirmed startup.";
    await sdk.command({ type: "draft.save", sessionId: f.sessionId, expectedRevision: 0, text: original, attachments: [] });
    app = await launch(stateDir);
    const warm = await app.firstWindow();
    await expect(warm.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    await expect.poll(() => warm.evaluate((id) => Object.keys(localStorage).some((key) => key.startsWith("moguri.startup.v1:")
      && JSON.parse(localStorage.getItem(key) ?? "{}").session?.id === id), f.sessionId)).toBe(true);
    await expect(warm.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close(); app = undefined; sdk.disconnect(); await f.service.close();
    const packageRoot = process.env.MOGURI_TEST_APP ? join(dirname(dirname(process.env.MOGURI_TEST_APP)), "Resources", "app") : process.cwd();
    const node = process.env.MOGURI_TEST_APP ? join(packageRoot, "node_modules/node/bin/node") : process.execPath;
    await writeFile(join(stateDir, "generated-owned-startup.json"), JSON.stringify({
      delayMs: 65_000, packageRoot, home: f.home, provider,
    }), { mode: 0o600 });
    child = spawn(node, [resolve("tests/fixtures/delayed-owned-startup.mjs")], {
      stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_STATE_DIR_EXPLICIT: "1",
        MOGURI_LOCATION_DIR: join(f.directory, "generated-locator") },
    });
    childExit = once(child, "exit");
    child.stderr?.on("data", (data: Buffer) => process.stderr.write(data));
    const expectedOwner = JSON.stringify({ pid: child.pid });
    await expect.poll(async () => {
      try { return (await readFile(join(stateDir, "generated-owned-startup-owners.jsonl"), "utf8")).trim() === expectedOwner; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
    }).toBe(true);
    const began = performance.now();
    app = await launch(stateDir);
    const page = await app.firstWindow();
    assertOperationLatency("startup.window", performance.now() - began);
    const opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    await expect(opening.getByText("Draft while waiting", { exact: true })).toHaveCount(0);
    await expect(opening.getByRole("heading", { name: "Startup not yet confirmed", exact: true })).toBeVisible({ timeout: 65_000 });
    const unconfirmedMs = performance.now() - began;
    const status = await page.evaluate(() => window.moguri.startupStatus());
    expect(status.phase).toBe("service"); expect(status.canReconnect).toBe(true);
    expect(status.completed.some((phase) => phase.phase === "failed")).toBe(false);
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    await expect(opening.getByRole("button", { name: "Reconnect to original service", exact: true })).toBeEnabled();
    await expect.poll(async () => {
      try { return (await readPrivateConnection(stateDir)).pid; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return null; throw error; }
    }, { timeout: 10_000 }).toBe(child.pid);
    const connection = await readPrivateConnection(stateDir);
    live = await new MoguriSdk(connection).ready();
    expect(live.sessions.get(f.sessionId)?.draft.text).toBe(original);
    expect(live.sessions.get(f.sessionId)?.queue).toHaveLength(0);
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    const reconnect = performance.now();
    await opening.getByRole("button", { name: "Reconnect to original service", exact: true }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-session-id", f.sessionId);
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue(original);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const reconnectMs = performance.now() - reconnect;
    assertOperationLatency("startup.ready", reconnectMs);
    expect(live.sessions.get(f.sessionId)?.queue).toHaveLength(0);
    expect(live.getState().snapshot?.budgetEntries).toHaveLength(0);
    expect((await readPrivateConnection(stateDir)).pid).toBe(child.pid);
    expect((await readFile(join(stateDir, "generated-owned-startup-owners.jsonl"), "utf8")).trim()).toBe(expectedOwner);
    expect(f.requests.length).toBe(0);
    console.log(JSON.stringify({ primitive: "desktop-original-unconfirmed-reconnect", unconfirmedMs, reconnectMs,
      originalOwnerOnly: true, localDraftNotDispatched: true, modelCalls: 0 }));
  } finally {
    live?.disconnect(); sdk.disconnect(); await app?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const { stopMoguriService } = await import("../../packages/sdk/src/node.ts");
      const original = await readPrivateConnection(stateDir);
      if (original.pid !== child.pid) throw new Error("Generated startup owner changed; no different process was stopped or fixture root deleted.");
      await stopMoguriService(stateDir, { expectedConnection: original });
    }
    if (childExit) await childExit;
    await f.close();
  }
});
