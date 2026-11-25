import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { isRecord, MoguriSdk } from "@moguri-dev/sdk";
import { readPrivateServiceFile } from "@moguri-dev/sdk/testing";
import { EventStore } from "@moguri-dev/sdk/testing";
import { setupFixture } from "../fixture.ts";
import { generatedIssueRevisions, generatedResponsiveHistory } from "../fixtures/responsive-history.ts";
import { assertOperationLatency, LATENCY_SAMPLES, latencyBudgetsEnforced, OPERATION_LATENCY_MS } from "../fixtures/latency-budgets.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Deferred startup uses a generated hidden desktop.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });

for (const outcome of ["exact", "peer", "deleted", "store"] as const) test(`game-only opening restores only the authenticated saved chat after ${outcome} reconciliation`, async () => {
  const peerChange = outcome === "peer";
  const f = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(f.service.connection).ready();
  const created = await sdk.sessions.create(null, "Generated remembered opening chat");
  if (!created.id) throw new Error("The generated remembered session was not acknowledged.");
  const sessionId = created.id;
  await sdk.sessions.selectModel(sessionId, f.modelId);
  const original = `Generated service-owned saved draft ${outcome}.`;
  await sdk.command({ type: "draft.save", sessionId, expectedRevision: 0, text: original, attachments: [] });
  const app = await launch(f.directory), gate = Promise.withResolvers<void>();
  const snapshot = f.service.profiles.snapshot.bind(f.service.profiles);
  let paused = false, entered = false;
  f.service.profiles.snapshot = async (...args: Parameters<typeof snapshot>) => {
    if (paused) { entered = true; await gate.promise; }
    return snapshot(...args);
  };
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Projects and sessions", exact: true })
      .getByRole("button", { name: "Generated remembered opening chat", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Generated remembered opening chat", exact: true })).toBeVisible();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((id) => Object.keys(localStorage).some((key) => {
      if (!key.startsWith("moguri.startup.v1:")) return false;
      const value = JSON.parse(localStorage.getItem(key) ?? "{}");
      return value.session?.id === id;
    }), sessionId)).toBe(true);
    if (outcome === "store") await page.evaluate((id) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("moguri.startup.v1:")) continue;
        const value = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (value.session?.id === id) localStorage.setItem(key, JSON.stringify({ ...value, storeId: "f".repeat(64) }));
      }
    }, sessionId);
    paused = true;
    const began = performance.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    await expect(opening.getByRole("button", { name: "Flap Moguri's wings", exact: true })).toBeVisible({ timeout: latencyBudgetsEnforced ? 1500 : ciTime(1500) });
    const interactiveMs = performance.now() - began;
    if (latencyBudgetsEnforced) expect(interactiveMs).toBeLessThanOrEqual(700);
    else if (interactiveMs > 700) console.log(`Latency budget not enforced on CI: the opening shell took ${interactiveMs.toFixed(2)} ms; budget is 700 ms.`);
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    await expect(opening.getByText("Draft while waiting", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Meta+Enter");
    await expect.poll(() => entered).toBe(true);
    expect(sdk.sessions.get(sessionId)?.draft.text).toBe(original);
    expect(sdk.sessions.get(sessionId)?.queue).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
    if (peerChange) {
      await f.service.controller.dispatch({ id: "generated-opening-peer-draft", profileId: "default",
        command: { type: "draft.save", sessionId, expectedRevision: 1, text: "Generated peer saved draft.", attachments: [] } });
    } else if (outcome === "deleted") {
      const current = f.service.controller.snapshot().sessions.find((session) => session.id === sessionId)!;
      await f.service.controller.dispatch({ id: "generated-opening-peer-delete", profileId: "default",
        command: { type: "session.delete", sessionId, expectedRevision: current.revision, confirm: true } });
    }
    if (outcome === "exact") await page.screenshot({ path: test.info().outputPath("opening-workspace.png") });
    gate.resolve();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-session-id", outcome === "deleted" || outcome === "store" ? f.sessionId : sessionId);
    await expect(opening).toHaveCount(0);
    const prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    await expect(prompt).toHaveValue(outcome === "exact" ? original : peerChange ? "Generated peer saved draft." : "");
    await expect(page.getByRole("region", { name: "Opening draft review", exact: true })).toHaveCount(0);
    expect(f.service.controller.events(0).filter((event) => event.event_type === "draft.saved" && event.session_id === sessionId &&
      event.payload.text === original)).toHaveLength(outcome === "deleted" ? 0 : 1);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.requests).toHaveLength(0);
    console.log(JSON.stringify({ primitive: "generated-deferred-opening", owner: "reused", outcome, interactiveMs,
      restoredExactSession: outcome === "exact" || outcome === "peer", modelCalls: 0, originalInputNotDispatched: true }));
  } finally {
    gate.resolve(); f.service.profiles.snapshot = snapshot;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); sdk.disconnect(); await f.close();
  }
});

test("a cache miss offers no early composer and restores the original saved draft without moving or dispatching it", async () => {
  const f = await setupFixture({ responseMode: "text" }), gate = Promise.withResolvers<void>();
  const original = "Generated saved first-launch draft with no cached destination.";
  await f.service.controller.dispatch({ id: "generated-first-launch-saved-draft", profileId: "default",
    command: { type: "draft.save", sessionId: f.sessionId, expectedRevision: 0, text: original, attachments: [] } });
  const snapshot = f.service.profiles.snapshot.bind(f.service.profiles);
  f.service.profiles.snapshot = async (...args: Parameters<typeof snapshot>) => { await gate.promise; return snapshot(...args); };
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    await expect(opening.getByRole("status", { name: "Startup status", exact: true })).toBeVisible();
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    expect(f.session().draft.text).toBe(original); expect(f.requests).toHaveLength(0);
    gate.resolve();
    await expect(page.getByRole("region", { name: "Opening draft review", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue(original);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.session().draft.text).toBe(original); expect(f.session().queue).toHaveLength(0); expect(f.requests).toHaveLength(0);
    expect(f.service.controller.events(0).filter((event) => event.event_type === "draft.saved" && event.session_id === f.sessionId &&
      event.payload.text === original)).toHaveLength(1);
  } finally {
    gate.resolve(); f.service.profiles.snapshot = snapshot;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); await f.close();
  }
});

test("cached model and effort labels remain read-only while current provider discovery is connecting", async () => {
  const f = await setupFixture({ responseMode: "text", reasoning: true });
  await f.configure();
  const original = f.provider.state, model = original.models.find((model) => model.id === f.modelId)!;
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("moguri.startup.v1:")
      && JSON.parse(localStorage.getItem(key) ?? "{}").session !== undefined))).toBe(true);
    f.provider.state = { ...original, status: "connecting", models: [], diagnostic: "Generated delayed model discovery, no inference." };
    f.provider.onChange();
    await expect.poll(() => f.service.controller.snapshot().provider.status).toBe("connecting");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".app-shell")).toHaveAttribute("data-session-id", f.sessionId);
    const trigger = page.getByRole("button", { name: /^Model: .*refreshing/ });
    await expect(trigger).toContainText(model.name);
    await trigger.click();
    await page.getByText("Last known models and thinking efforts", { exact: true }).click();
    await expect(page.getByRole("menuitemradio").filter({ hasText: model.name })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Generated draft while model discovery remains unavailable.");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    expect(f.requests).toHaveLength(0);
    f.provider.state = original; f.provider.onChange();
    await expect(page.getByRole("button", { name: /^Model: / })).not.toContainText("(refreshing)");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.requests).toHaveLength(0);
  } finally {
    f.provider.state = original; f.provider.onChange();
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); await f.close();
  }
});

for (let sample = 0; sample < LATENCY_SAMPLES; sample++) test(`real cold main/runtime opening ${sample + 1} renders the game-only shell before retained backend hydration finishes`, async () => {
  test.setTimeout(ciTime(60_000));
  const f = await setupFixture(), stateDir = join(f.directory, "state"), projectId = f.session().projectId;
  const sdk = await new MoguriSdk(f.service.connection).ready();
  const created = await sdk.sessions.create(null, "Generated cold remembered chat");
  if (!created.id) throw new Error("The generated cold remembered session was not acknowledged.");
  const sessionId = created.id;
  await sdk.sessions.selectModel(sessionId, f.modelId);
  const savedText = "Generated service-owned cold-opening draft.";
  await sdk.command({ type: "draft.save", sessionId, expectedRevision: 0, text: savedText, attachments: [] });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined = await launch(f.directory);
  let child: ReturnType<typeof spawn> | undefined;
  let ready = false, runtimeMs: number | null = null;
  try {
    const first = await app.firstWindow();
    await first.getByRole("navigation", { name: "Projects and sessions", exact: true })
      .getByRole("button", { name: "Generated cold remembered chat", exact: true }).click();
    await expect.poll(() => first.evaluate((id) => Object.keys(localStorage).some((key) => {
      if (!key.startsWith("moguri.startup.v1:")) return false;
      return JSON.parse(localStorage.getItem(key) ?? "{}").session?.id === id;
    }), sessionId)).toBe(true);
    await expect(first.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close(); app = undefined; sdk.disconnect(); await f.service.close();
    const store = new EventStore(join(stateDir, "state.sqlite"), f.retentionKey);
    try { store.commit([...generatedResponsiveHistory(f.sessionId, projectId), ...generatedIssueRevisions(projectId, 25_535)]); }
    finally { store.close(); }
    const began = performance.now();
    const bundledRoot = process.env.MOGURI_TEST_APP ? join(dirname(dirname(process.env.MOGURI_TEST_APP)), "Resources", "app") : process.cwd();
    const executable = process.env.MOGURI_TEST_APP ? join(bundledRoot, "node_modules", "node", "bin", "node") : process.execPath;
    const profiling = process.env.MOGURI_TEST_STARTUP_PROFILE_DIR;
    child = spawn(executable, [...(profiling ? ["--cpu-prof", `--cpu-prof-dir=${profiling}`] : []),
      join(process.cwd(), "tests/fixtures/cold-startup-service.mjs"), bundledRoot, stateDir, f.home],
      { stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, MOGURI_STATE_DIR: stateDir,
        MOGURI_STATE_DIR_EXPLICIT: "1", MOGURI_LOCATION_DIR: join(f.directory, "generated-locator") } });
    const processOwner = child;
    child.stdout?.on("data", (data) => process.stdout.write(data)); child.stderr?.on("data", (data) => process.stderr.write(data));
    child.on("message", (value: unknown) => {
      if (!isRecord(value) || value.type !== "ready" || value.pid !== processOwner.pid || typeof value.runtimeMs !== "number") {
        throw new Error("Generated cold service returned an invalid exact-owner readiness record.");
      }
      ready = true; runtimeMs = value.runtimeMs;
    });
    child.send({ type: "configure", provider: f.provider.state, retentionKey: f.retentionKey.toString("hex") });
    const lockPath = join(stateDir, "service.lock");
    await expect.poll(async () => {
      if (processOwner.exitCode !== null) throw new Error("The generated cold service exited before publishing its owned lock.");
      try { const file = await readPrivateServiceFile(lockPath); return file.text ? JSON.parse(file.text).pid : null; }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        if (error instanceof Error && error.message === `Moguri service metadata at ${lockPath} changed during inspection. No different owner was adopted.`) {
          console.log("Generated cold lock is still being published; await the exact owned child without accepting this changed file.");
          return null;
        }
        throw error;
      }
    }).toBe(child.pid);
    const launchBegan = performance.now();
    app = await launch(f.directory);
    const page = await app.firstWindow(), opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.setBackgroundThrottling(false));
    // Where budgets are enforced the shell must appear within startup.window; on CI this is only a scaled wait.
    const shellWait = latencyBudgetsEnforced ? OPERATION_LATENCY_MS["startup.window"] : ciTime(OPERATION_LATENCY_MS["startup.window"]);
    await expect(opening.getByRole("button", { name: "Flap Moguri's wings", exact: true })).toBeVisible({ timeout: shellWait });
    await expect(opening.getByRole("textbox")).toHaveCount(0);
    const shellMs = performance.now() - launchBegan, totalToShellMs = performance.now() - began;
    assertOperationLatency("startup.window", shellMs);
    expect(ready, "The opening game must be usable before the actual retained runtime is ready.").toBe(false);
    await page.evaluate(({ sessionId, text, deadline }) => new Promise<void>((resolve, reject) => {
      let framePending = false;
      const current = () => {
        const shell = document.querySelector<HTMLElement>(".app-shell[data-session-id]");
        const input = document.getElementById(`prompt-${sessionId}`);
        const composer = input?.closest("form");
        const send = composer?.querySelector<HTMLButtonElement>('button[aria-label="Send"]');
        return shell?.dataset.sessionId === sessionId && input instanceof HTMLTextAreaElement && input.value === text &&
          input.getBoundingClientRect().height > 0 && send && !send.disabled &&
          shell.querySelector(".connection-line")?.textContent?.trim() === "Local service connected" &&
          Array.from(composer?.querySelectorAll('[role="status"]') ?? []).some((node) => node.textContent?.trim() === "Draft saved");
      };
      const observer = new MutationObserver(() => check());
      const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error("The generated live editor and original saved draft did not finish rendering.")); }, deadline);
      const check = () => {
        if (framePending || !current()) return;
        framePending = true;
        requestAnimationFrame(() => { window.setTimeout(() => {
          framePending = false;
          if (!current()) return;
          observer.disconnect(); window.clearTimeout(timeout); resolve();
        }, 0); });
      };
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      check();
    // A harness wait only: the startup.ready budget below is the actual check (the service alone took 16 s on a shared runner).
    }), { sessionId, text: savedText, deadline: ciTime(10_000) });
    const fullyReadyMs = performance.now() - began;
    const startup = await page.evaluate(() => window.moguri.startupStatus());
    console.log(JSON.stringify({ primitive: "generated-real-cold-cached-opening", sample: sample + 1, shellMs, totalToShellMs, fullyReadyMs,
      retainedIssueRevisions: 25_535, retainedChats: 61, coldRuntimeMs: runtimeMs, startup, modelCalls: 0, renderedFrameAndSavedDraft: true }));
    assertOperationLatency("startup.ready", fullyReadyMs);
    expect(ready).toBe(true); expect(f.requests).toHaveLength(0);
  } finally {
    if (app) {
      await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
      } });
      await app.close();
    }
    if (child?.connected) { const finished = once(child, "exit"); child.send({ type: "close" }); await finished; }
    sdk.disconnect(); await f.close();
  }
});
