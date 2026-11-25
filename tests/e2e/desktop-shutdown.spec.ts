import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk, PROTOCOL_VERSION, type StoredEvent } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop service shutdown qualification is macOS-only.");

test("opting out of background work makes last-window close stop its actual service and owned consoles", async () => {
  const fixture = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_APP_CLOSE_READY\\n'; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.application.configure({ keepServiceOnWindowClose: false }, (await sdk.application.status()).configuration.revision);
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const nativeProcess = app.process();
  try {
    await app.firstWindow();
    const opened = await sdk.terminal.open(fixture.sessionId), terminal = (await sdk.terminal.read(opened.id!)).terminal;
    let consoleClosed = false;
    fixture.service.controller.on("change", (events: StoredEvent[]) => {
      if (events.some((event) => event.event_type === "terminal.changed" && event.payload.terminal.id === opened.id && event.payload.terminal.status === "closed")) consoleClosed = true;
    });
    let turnOutcome: string | undefined;
    fixture.service.controller.on("change", (events: StoredEvent[]) => {
      const terminal = events.find((event) => event.event_type === "turn.finished" && event.session_id === fixture.sessionId);
      if (terminal?.event_type === "turn.finished") turnOutcome = terminal.payload.outcome;
    });
    await fixture.configure(); await fixture.send("generated slow work while the desktop closes");
    await expect.poll(() => fixture.requests.length).toBeGreaterThan(0);
    expect(terminal.status).toBe("running");
    const closing = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0]!.close(), 10); });
    await closing;
    expect(fixture.service.store.db.isOpen).toBe(false);
    expect(consoleClosed).toBe(true);
    expect(["stopped", "partial"]).toContain(turnOutcome);
    await expect.poll(async () => {
      try { await readFile(join(fixture.directory, "state", "connection.json")); return true; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
    }).toBe(false);
  } finally {
    sdk.disconnect();
    if (nativeProcess.exitCode === null && nativeProcess.signalCode === null) await app.close();
    await fixture.close();
  }
});

test("cancelled unsaved-window close leaves the connected service running", async () => {
  const fixture = await setupFixture(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const nativeProcess = app.process();
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "User guidance");
    await page.getByLabel("Global user guidance", { exact: true }).fill("Generated uncommitted close guard.");
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.once("will-prevent-unload", () => Reflect.set(globalThis, "generatedCloseWasCancelled", true));
      setTimeout(() => app.quit(), 10);
    });
    await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "generatedCloseWasCancelled"))).toBe(true);
    expect(fixture.service.store.db.isOpen).toBe(true);
    await expect(page.getByLabel("Global user guidance", { exact: true })).toHaveValue("Generated uncommitted close guard.");
    expect(await readFile(join(fixture.directory, "state", "connection.json"), "utf8")).toContain(fixture.service.connection.token);
  } finally {
    if (nativeProcess.exitCode === null && nativeProcess.signalCode === null) {
      await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault()); } });
      await app.close();
    }
    await fixture.close();
  }
});

test("failed owned cleanup blocks app exit and a later Quit retries the same service without starting another writer", async () => {
  const values = new Map<string, string>(); let rejectCleanup = true;
  const vault = { read: async (id: string) => values.get(id) ?? null, write: async (id: string, value: string) => { values.set(id, value); },
    remove: async (id: string) => { if (rejectCleanup) throw new Error("Generated app-close cleanup failure."); values.delete(id); } };
  const fixture = await setupFixture({ platform: { terminal: { vault, executable: "/bin/sh", args: ["-c", "printf 'GENERATED_APP_FAILURE_READY\\n'; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const nativeProcess = app.process(); let errors = "";
  nativeProcess.stderr!.on("data", (value: Buffer) => { errors = (errors + value.toString("utf8")).slice(-8192); });
  try {
    await app.firstWindow(); await sdk.terminal.open(fixture.sessionId);
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); });
    await expect.poll(() => errors).toContain("Moguri app shutdown is unconfirmed:");
    expect(nativeProcess.exitCode).toBeNull();
    expect(await readFile(join(fixture.directory, "state", "connection.json"), "utf8")).toContain(fixture.service.connection.token);
    rejectCleanup = false;
    const closing = app.waitForEvent("close");
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); }); await closing;
    await expect.poll(async () => {
      try { await readFile(join(fixture.directory, "state", "connection.json")); return true; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
    }).toBe(false);
  } finally {
    rejectCleanup = false; sdk.disconnect();
    if (nativeProcess.exitCode === null && nativeProcess.signalCode === null) await app.close();
    await fixture.close();
  }
});

test("quitting during connection admission waits for that exact service and does not open a late window or leave it running", async () => {
  const fixture = await setupFixture(), gate = Promise.withResolvers<void>(); let entered = false, stops = 0, lateClient = false;
  const closed = Promise.withResolvers<void>();
  void closed.promise.catch((error: unknown) => console.error("Generated admission-owner cleanup failed:", error instanceof Error ? error.message : "inspect generated registry/lock"));
  const server = createServer((request, response) => {
    if (!["/v1/health", "/v1/lifecycle"].includes(request.url ?? "")) { lateClient = true; response.writeHead(404).end(); return; }
    expect(request.headers.authorization).toBe(`Bearer ${fixture.service.connection.token}`);
    if (request.url === "/v1/health") {
      entered = true; void gate.promise.then(() => response.end(JSON.stringify({ pid: process.pid, protocolVersion: PROTOCOL_VERSION }))); return;
    }
    if (request.url === "/v1/lifecycle") {
      stops++; response.once("finish", () => {
        void (async () => {
          await unlink(join(fixture.directory, "state", "connection.json"));
          await unlink(join(fixture.directory, "state", "service.lock"));
          server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
        })().then(() => closed.resolve(), closed.reject);
      });
      response.end(JSON.stringify({ accepted: true, pid: process.pid })); return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Generated admission endpoint failed.");
  await fixture.service.close();
  await writeFile(join(fixture.directory, "state", "service.lock"), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  await writeFile(join(fixture.directory, "state", "connection.json"), JSON.stringify({ ...fixture.service.connection,
    baseUrl: `http://127.0.0.1:${address.port}`, wsUrl: `ws://127.0.0.1:${address.port}/v1/events` }), { mode: 0o600 });
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  }), nativeProcess = app.process();
  try {
    await expect.poll(() => entered).toBe(true);
    const startup = await app.firstWindow();
    await expect(startup.getByRole("status", { name: "Startup status", exact: true })).toContainText("Opening your workspace");
    const closing = app.waitForEvent("close");
    await app.evaluate(({ app, BrowserWindow }) => { if (BrowserWindow.getAllWindows().length !== 1) throw new Error("The generated startup window is missing or duplicated."); app.quit(); });
    gate.resolve(); await closing; await closed.promise;
    expect(stops).toBe(1); expect(lateClient).toBe(false);
    await expect.poll(async () => {
      try { await readFile(join(fixture.directory, "state", "connection.json")); return true; }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return false; throw error; }
    }).toBe(false);
  } finally {
    gate.resolve();
    if (nativeProcess.exitCode === null && nativeProcess.signalCode === null) await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve())); await fixture.close();
  }
});
