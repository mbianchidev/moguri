import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { startService } from "@moguri-dev/sdk/testing";
import { remoteFixture } from "../fixtures/remote-service.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
const program = { executable: process.execPath, args: ["-e", "process.stdin.setRawMode(true); process.stdin.on('data',d=>process.stdout.write(d)); process.stdout.write('GENERATED_REMOTE_GHOSTTY_READY\\n'+process.cwd()+'\\n');"] };
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
async function resizeHiddenWindow(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.webContents.setBackgroundThrottling(false);
    window.setContentSize(size.width, size.height);
  }, { width, height });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentSize())).toEqual([width, height]);
  await page.setViewportSize({ width, height });
}
test.skip(process.platform !== "darwin", "Native Remote console UI is qualified on macOS.");

test("Ghostty explicitly opens a no-model Remote console, shows its real boundary and discards detached queued input without replacement", async () => {
  const f = await remoteFixture({ exposeModels: false, platform: { terminal: program } }), sdk = await new MoguriSdk(f.service.connection).ready();
  let app: ElectronApplication | undefined, release = () => {};
  const manager = f.controller.platform.sessions.terminals, input = manager.input.bind(manager), received: string[] = [];
  let held = false; const barrier = new Promise<void>((resolve) => { release = resolve; });
  try {
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
    await f.probe(); await sdk.sessions.env(f.sessionId, "Remote"); app = await launch(f.directory);
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await resizeHiddenWindow(app, page, 840, 760);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true });
    await expect.poll(() => f.controller.snapshot().terminals.length).toBe(1);
    // The record appears before its remote process starts; capture it once it has the pid that must survive reconnecting.
    await expect.poll(() => f.controller.snapshot().terminals[0]?.pid ?? null).not.toBeNull();
    const terminal = f.controller.snapshot().terminals[0]!;
    const tty = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(tty).toHaveAttribute("aria-disabled", "false");
    await expect(panel).toContainText("Remote SSH console"); await expect(panel).toContainText(f.workspace);
    expect(terminal.env).toBe("Remote"); expect(terminal.binding?.root).toBe(f.workspace); expect(f.session().controls.modelId).toBeNull();
    manager.input = async (request) => {
      await input(request);
      if (request.action === "input") { received.push(request.data); if (!held) { held = true; await barrier; } }
    };
    await tty.focus(); await page.keyboard.type("AQUEUED_REMOTE_NEVER_SEND"); await expect.poll(() => held).toBe(true);
    await page.getByRole("button", { name: "Hide session sidebar", exact: true }).click(); release();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await panel.getByRole("button", { name: "Reconnect existing terminal", exact: true }).click();
    await expect(tty).toHaveAttribute("aria-disabled", "false"); await tty.focus(); await page.keyboard.type("B");
    await expect.poll(() => received.join("")).toBe("AB");
    const actual = await sdk.terminal.read(terminal.id);
    expect(actual.terminal.pid).toBe(terminal.pid); expect(actual.data).not.toContain("QUEUED_REMOTE_NEVER_SEND");
    expect(f.controller.snapshot().terminals).toHaveLength(1);
    await panel.getByText("Shared Remote owner / running", { exact: true }).click();
    await expect(panel).toContainText("Captured SSH host"); await expect(panel).toContainText(`:${f.ssh.target.port}`);
    await mkdir(artifacts, { recursive: true });
    const compactCols = (await sdk.terminal.read(terminal.id)).terminal.cols;
    await resizeHiddenWindow(app, page, 1440, 900);
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).terminal.cols).toBeGreaterThan(compactCols);
    const wideCols = (await sdk.terminal.read(terminal.id)).terminal.cols;
    await page.screenshot({ path: join(artifacts, "remote-console-desktop.png") });
    await resizeHiddenWindow(app, page, 840, 760);
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).terminal.cols).toBeLessThan(wideCols);
    await page.screenshot({ path: join(artifacts, "remote-console-compact.png") });
    expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await panel.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().terminals[0]?.status).toBe("closed");
    expect(errors).toEqual([]); expect(f.requests).toHaveLength(0);
  } finally { release(); manager.input = input; await app?.close(); sdk.disconnect(); await f.close(); }
});

test("desktop reopens the same Remote owner after service restart without a probe and makes a changed env a read-only captured view", async () => {
  const f = await remoteFixture({ exposeModels: false, platform: { terminal: program } }), sdk = await new MoguriSdk(f.service.connection).ready();
  let app: ElectronApplication | undefined, restarted: Awaited<ReturnType<typeof startService>> | undefined, peer: MoguriSdk | undefined;
  const entered = join(f.directory, "remote-native-restart-held"), resume = join(f.directory, "remote-native-restart-resume");
  let nativeHeld: Promise<Error | null> | undefined, nativeError: Error | null = null;
  try {
    await f.probe(); await sdk.sessions.env(f.sessionId, "Remote"); app = await launch(f.directory);
    let page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().terminals.length).toBe(1);
    await expect.poll(() => f.controller.snapshot().terminals[0]?.pid != null && f.controller.snapshot().terminalOwners[0]?.pid != null).toBe(true);
    const terminal = f.controller.snapshot().terminals[0]!, owner = f.controller.snapshot().terminalOwners[0]!;
    let tty = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(tty).toHaveAttribute("aria-disabled", "false"); await tty.focus(); await page.keyboard.type("GENERATED_REMOTE_NATIVE_BEFORE_RESTART");
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_REMOTE_NATIVE_BEFORE_RESTART");
    nativeHeld = app.evaluate((_electron, paths) => {
      const fs: typeof import("node:fs") = process.getBuiltinModule("fs");
      fs.writeFileSync(paths.entered, "Generated Remote native restart hold.");
      const deadline = Date.now() + 10_000, wait = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(paths.resume) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 10);
      if (!fs.existsSync(paths.resume)) throw new Error("Generated Remote restart hold expired.");
    }, { entered, resume }).then(() => null, (error: Error) => { nativeError = error; return error; });
    await expect.poll(async () => {
      if (nativeError) throw nativeError;
      try { return await readFile(entered, "utf8"); } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""; throw error; }
    }).toContain("Generated Remote native restart hold.");
    sdk.disconnect(); await f.service.close({ preserveTerminals: true });
    restarted = await startService({ stateDir: join(f.directory, "state"), provider: f.provider, retentionKey: f.retentionKey, platform: { terminal: { ...program, vault: f.terminalVault } } });
    peer = await new MoguriSdk(restarted.connection).ready();
    expect((await peer.remote.status()).remote.ready).toBe(false);
    await writeFile(resume, "Generated Remote replacement ready."); expect(await nativeHeld).toBeNull();
    await page.getByRole("button", { name: "Reconnect existing terminal", exact: true }).click();
    tty = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(tty).toHaveAttribute("aria-disabled", "false"); await tty.focus(); await page.keyboard.type("GENERATED_REMOTE_NATIVE_AFTER_RESTART");
    await expect.poll(async () => (await peer!.terminal.read(terminal.id)).data).toContain("GENERATED_REMOTE_NATIVE_AFTER_RESTART");
    const after = await peer.terminal.read(terminal.id);
    expect(after.terminal.pid).toBe(terminal.pid); expect(after.terminal.ownerId).toBe(owner.id);
    expect(restarted.controller.snapshot().terminalOwners[0]?.pid).toBe(owner.pid);
    expect(after.data.split("GENERATED_REMOTE_GHOSTTY_READY").length - 1).toBe(1);
    await peer.sessions.env(f.sessionId, "Local");
    await expect(tty).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true })).toContainText("captured Remote console");
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => restarted!.controller.snapshot().terminals[0]?.status).toBe("closed");
    expect(restarted.controller.snapshot().terminalOwners).toHaveLength(1); expect(f.requests).toHaveLength(0);
  } finally {
    if (app && !restarted && nativeHeld) app.process().kill("SIGTERM");
    else await writeFile(resume, "Generated Remote teardown release.");
    await nativeHeld; await app?.close(); sdk.disconnect(); peer?.disconnect(); await restarted?.close(); await f.close();
  }
});
