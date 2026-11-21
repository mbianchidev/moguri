import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk, type StoredEvent } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { assertOperationLatency } from "../fixtures/latency-budgets.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Background desktop lifecycle uses generated hidden macOS windows.");
const launch = (stateDir: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });

test("last-window close keeps the exact agent and user terminal working; reopening is prompt and explicit Quit stops them", async () => {
  test.setTimeout(45_000);
  const f = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_BACKGROUND_CONSOLE\\n'; exec cat"] } } });
  const stateDir = join(f.directory, "state"), sdk = await new MoguriSdk(f.service.connection).ready();
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let finished = false;
  try {
    app = await launch(stateDir);
    const page = await app.firstWindow();
    await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    const originalPublication = await readFile(join(stateDir, "connection.json"), "utf8");
    const opened = await sdk.terminal.open(f.sessionId), original = (await sdk.terminal.read(opened.id!)).terminal;
    await f.configure(); await f.send("generated slow agent work retained after window close");
    await expect.poll(() => f.requests.length).toBe(1);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    f.service.controller.on("change", (events: StoredEvent[]) => {
      if (events.some((event) => event.event_type === "turn.finished" && event.session_id === f.sessionId)) finished = true;
    });
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0]!.close(), 10); });
    await closed; app = undefined;
    expect(f.service.store.db.isOpen).toBe(true);
    expect(finished).toBe(false);
    expect(await readFile(join(stateDir, "connection.json"), "utf8")).toBe(originalPublication);
    const stillRunning = (await sdk.terminal.read(opened.id!)).terminal;
    expect(stillRunning.pid).toBe(original.pid); expect(stillRunning.ownerId).toBe(original.ownerId);
    expect(stillRunning.status).toBe("running");
    const began = performance.now();
    app = await launch(stateDir);
    const reopened = await app.firstWindow(), firstWindowMs = performance.now() - began;
    assertOperationLatency("startup.window", firstWindowMs);
    await expect(reopened.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    const readyMs = performance.now() - began;
    assertOperationLatency("startup.ready", readyMs);
    expect(await readFile(join(stateDir, "connection.json"), "utf8")).toBe(originalPublication);
    expect(f.requests.length).toBe(1); expect(finished).toBe(false);
    const quitting = app.waitForEvent("close");
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); });
    await quitting; app = undefined;
    expect(f.service.store.db.isOpen).toBe(false);
    expect(finished).toBe(true);
    await expect.poll(async () => {
      try { await readFile(join(stateDir, "connection.json")); return true; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
    }).toBe(false);
    console.log(JSON.stringify({ primitive: "desktop-background-original-owner", firstWindowMs, readyMs,
      originalAgentCalls: f.requests.length, exactTerminalPreservedOnWindowClose: true, explicitQuitStopped: true }));
  } finally { sdk.disconnect(); await app?.close(); await f.close(); }
});

test("the background preference is an actual root-owned opt-out, not a renderer-only close flag", async () => {
  const f = await setupFixture(), stateDir = join(f.directory, "state"), sdk = await new MoguriSdk(f.service.connection).ready();
  const app = await launch(stateDir);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const setting = page.getByLabel("Keep agents running when the last window closes", { exact: true });
    await expect(setting).toBeChecked();
    await setting.uncheck();
    await expect.poll(async () => (await sdk.application.status()).configuration.values.keepServiceOnWindowClose).toBe(false);
    await expect(setting).not.toBeChecked();
    await expect(setting).toBeEnabled();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(f.requests.length).toBe(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); sdk.disconnect(); await f.close();
  }
});

test("a cancelled unsaved Quit cannot turn a later window close into stopping the background agent", async () => {
  const f = await setupFixture(), stateDir = join(f.directory, "state"), sdk = await new MoguriSdk(f.service.connection).ready();
  const app = await launch(stateDir), processOwner = app.process();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    await f.configure(); await f.send("generated slow agent work after cancelled quit");
    await expect.poll(() => f.requests.length).toBe(1);
    const turnId = f.session().turnId;
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "User guidance");
    const guidance = page.getByLabel("Global user guidance", { exact: true }), saved = await guidance.inputValue();
    await guidance.fill("Generated uncommitted window-close guidance.");
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.once("will-prevent-unload", () => Reflect.set(globalThis, "generatedBackgroundQuitCancelled", true));
      setTimeout(() => app.quit(), 10);
    });
    await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "generatedBackgroundQuitCancelled"))).toBe(true);
    expect(f.service.store.db.isOpen).toBe(true);
    await guidance.fill(saved);
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    const closing = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0]!.close(), 10); });
    await closing;
    expect(f.service.store.db.isOpen).toBe(true);
    expect(f.session().turnId).toBe(turnId);
    expect(f.requests.length).toBe(1);
  } finally {
    if (processOwner.exitCode === null && processOwner.signalCode === null) {
      await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
      } });
      await app.close();
    }
    sdk.disconnect(); await f.close();
  }
});
