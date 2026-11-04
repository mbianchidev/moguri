import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startService } from "../../apps/service/src/server.ts";
import { ControlPlane } from "../../apps/service/src/controller.ts";
import { EventStore } from "../../apps/service/src/store.ts";
import { GLOBAL_PROFILE_ID, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedResponsiveHistory } from "../fixtures/responsive-history.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop startup qualification is macOS-only.");
const executablePath = () => process.env.MOGURI_TEST_APP ?? require("electron");
const args = () => process.env.MOGURI_TEST_APP ? [] : ["."];

test("the startup window appears before service recovery and new-chat clicks settle promptly with retained multi-chat history", async () => {
  test.setTimeout(45_000);
  const f = await setupFixture(), stateDir = join(f.directory, "state"), gate = Promise.withResolvers<void>();
  const events = generatedResponsiveHistory(f.sessionId, f.session().projectId);
  await f.service.close();
  const store = new EventStore(join(stateDir, "state.sqlite"), f.retentionKey);
  try {
    store.commit(events);
    const global = store.view(GLOBAL_PROFILE_ID);
    try { global.commit([{ event_type: "global.budget_changed", profile_id: GLOBAL_PROFILE_ID,
      payload: { revision: 1, limit: { basis: "estimate", tokens: 1_000_000_000 } } }]); }
    finally { global.close(); }
  } finally { store.close(); }
  let preparing = false;
  const initialize = ControlPlane.prototype.initialize;
  ControlPlane.prototype.initialize = async function() {
    if (this.store.path === join(stateDir, "state.sqlite")) { preparing = true; await gate.promise; }
    await initialize.call(this);
  };
  const provider = { state: f.provider.state, onChange: () => {}, refresh: () => f.provider.refresh(),
    login: () => { throw new Error("Personal authorization is forbidden in generated startup checks."); },
    cancel: () => f.provider.cancel(), logout: () => f.provider.logout(),
    prepare: (...input: Parameters<typeof f.provider.prepare>) => f.provider.prepare(...input) };
  const coldStarted = performance.now(), starting = startService({ stateDir, provider, retentionKey: f.retentionKey });
  let runtime: Awaited<ReturnType<typeof startService>> | undefined, app: Awaited<ReturnType<typeof electron.launch>> | undefined, sdk: MoguriSdk | undefined;
  try {
    await waitFor(() => preparing);
    const began = performance.now();
    app = await electron.launch({ executablePath: executablePath(), args: args(), env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });
    const page = await app.firstWindow();
    await expect(page.getByRole("status")).toContainText("Opening your workspace");
    const firstWindowMs = performance.now() - began;
    expect(firstWindowMs).toBeLessThan(1500);
    expect(await page.getByRole("navigation", { name: "Projects and sessions" }).count()).toBe(0);
    await expect(page.getByRole("status")).toContainText("Waiting for the local service");
    const waiting = await page.evaluate(() => window.moguri.startupStatus());
    expect(waiting.phase).toBe("service");
    expect(waiting.totalMs).toBeGreaterThanOrEqual(waiting.elapsedMs);
    expect(JSON.stringify(waiting)).not.toContain(f.retentionKey.toString("hex"));
    gate.resolve(); runtime = await starting;
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    sdk = await new MoguriSdk(runtime.connection).ready();
    const navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const chats = navigation.getByRole("region", { name: "Chats", exact: true });
    const create = chats.locator("header").getByRole("button", { name: "New chat", exact: true });
    await expect(create).toBeEnabled();
    expect((await page.evaluate(() => window.moguri.startupStatus())).phase).toBe("ready");
    const completeStartupMs = performance.now() - coldStarted;
    expect(completeStartupMs).toBeLessThan(3000);
    const timings: number[] = [];
    for (let index = 0; index < 3; index++) {
      const count = sdk.getState().snapshot!.sessions.length, click = performance.now();
      await create.click();
      await expect.poll(() => sdk!.getState().snapshot!.sessions.length).toBe(count + 1);
      await expect(page.getByRole("heading", { name: "New chat", exact: true })).toBeVisible();
      await expect(create).toBeEnabled();
      timings.push(performance.now() - click);
    }
    console.log(JSON.stringify({ primitive: "desktop-end-to-end-new-chat", retainedSessions: 61, retainedEvents: events.length,
      historyBytes: Buffer.byteLength(JSON.stringify(events)), finiteGlobalPolicy: true, firstWindowMs, completeStartupMs, clickToAcknowledgedVisibleChatMs: timings, modelCalls: 0 }));
    expect(timings.every((ms) => ms < 1000)).toBe(true);
    const count = sdk.getState().snapshot!.sessions.length;
    await create.evaluate((button) => { if (!(button instanceof HTMLButtonElement)) throw new Error("The generated new-chat action is not a native button."); button.click(); button.click(); });
    await expect.poll(() => sdk!.getState().snapshot!.sessions.length).toBe(count + 1);
    await expect(create).toBeEnabled();
    expect(sdk.sessions.get(f.sessionId)?.draft.text).toBe("Generated retained responsive draft.");
    expect(f.requests).toHaveLength(0);
  } finally { gate.resolve(); ControlPlane.prototype.initialize = initialize; sdk?.disconnect(); await app?.close(); runtime ??= await starting; await runtime.close(); await f.close(); }
});

test("cancelling failed quit restores an accessible connected window without stopping or replacing its original owner", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const app = await electron.launch({ executablePath: executablePath(), args: args(),
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SHUTDOWN_FAILURE: "cancel" } });
  try {
    const page = await app.firstWindow(); await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    const original = { ...f.service.connection }, reopened = app.waitForEvent("window");
    await app.evaluate(({ app }) => {
      const fetch = globalThis.fetch; let failed = false;
      globalThis.fetch = async (...input: Parameters<typeof fetch>) => {
        if (!failed && String(input[0]).endsWith("/v1/health")) {
          failed = true; globalThis.fetch = fetch;
          throw new TypeError("Generated original health transport failure.", { cause: Object.assign(new Error("Generated refusal"), { code: "ECONNREFUSED" }) });
        }
        return fetch(...input);
      };
      setTimeout(() => app.quit(), 10);
    });

    const restored = await reopened;
    await expect(restored.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    expect(f.service.store.db.isOpen).toBe(true);
    expect(f.service.connection).toEqual(original);
    await restored.getByRole("region", { name: "Chats", exact: true }).locator("header").getByRole("button", { name: "New chat", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.length).toBe(2);
    expect(f.requests).toHaveLength(0);
  } finally { sdk.disconnect(); await app.close(); await f.close(); }
});

test("cancelled quit cannot adopt or proxy through a replaced private registry owner", async () => {
  const f = await setupFixture(), path = join(f.directory, "state", "connection.json"), original = await readFile(path, "utf8");
  let foreignRequests = 0;
  const foreign = createServer((_request, response) => { foreignRequests++; response.writeHead(403).end("{}"); });
  await new Promise<void>((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  const address = foreign.address(); if (!address || typeof address === "string") throw new Error("Generated foreign endpoint missing.");
  const app = await electron.launch({ executablePath: executablePath(), args: args(),
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SHUTDOWN_FAILURE: "cancel" } });
  try {
    const page = await app.firstWindow(); await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await writeFile(path, JSON.stringify({ ...f.service.connection, token: "generated-foreign-registry",
      baseUrl: `http://127.0.0.1:${address.port}`, wsUrl: `ws://127.0.0.1:${address.port}/v1/events` }), { mode: 0o600 });
    const reopening = app.waitForEvent("window");
    await app.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); });
    const restored = await reopening;
    await expect(restored.getByRole("heading", { name: "Moguri could not connect", exact: true })).toBeVisible();
    await expect(restored.locator(".startup-error")).toContainText("captured service changed");
    const health = await restored.evaluate(async () => { const response = await fetch("moguri://app/v1/health"); return { status: response.status, body: await response.json() }; });
    expect(health.status).toBe(200); expect(health.body.pid).toBe(f.service.connection.pid); expect(health.body.lifecycle).toBeNull();
    expect(foreignRequests).toBe(0);
    expect(f.service.store.db.isOpen).toBe(true);
    expect(f.requests).toHaveLength(0);
  } finally { await writeFile(path, original, { mode: 0o600 }); await app.close(); await new Promise<void>((resolve) => foreign.close(() => resolve())); await f.close(); }
});
