import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { startService } from "../../apps/service/src/server.ts";
import { remoteFixture } from "../fixtures/remote-service.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
const program = { executable: process.execPath, args: ["-e", "process.stdin.setRawMode(true); process.stdin.on('data',d=>process.stdout.write(d)); process.stdout.write('GENERATED_REMOTE_GHOSTTY_READY\\n'+process.cwd()+'\\n');"] };
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native Remote console UI is qualified on macOS.");

test("Ghostty explicitly opens a no-model Remote console, shows its real boundary and discards detached queued input without replacement", async () => {
  const f = await remoteFixture({ exposeModels: false, platform: { terminal: program } }), sdk = await new MoguriSdk(f.service.connection).ready();
  let app: ElectronApplication | undefined, release = () => {};
  const manager = f.controller.platform.sessions.terminals, input = manager.input.bind(manager), received: string[] = [];
  let held = false; const barrier = new Promise<void>((resolve) => { release = resolve; });
  try {
    await f.probe(); await sdk.sessions.env(f.sessionId, "Remote"); app = await launch(f.directory);
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true });
    expect(f.controller.snapshot().terminals).toHaveLength(0);
    await panel.getByRole("button", { name: "Open Remote terminal", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().terminals.length).toBe(1);
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
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900));
    const wideCols = (await sdk.terminal.read(terminal.id)).terminal.cols;
    await page.screenshot({ path: join(artifacts, "remote-console-desktop.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
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
  try {
    await f.probe(); await sdk.sessions.env(f.sessionId, "Remote"); app = await launch(f.directory);
    let page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("button", { name: "Open Remote terminal", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().terminals.length).toBe(1);
    const terminal = f.controller.snapshot().terminals[0]!, owner = f.controller.snapshot().terminalOwners[0]!;
    let tty = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(tty).toHaveAttribute("aria-disabled", "false"); await tty.focus(); await page.keyboard.type("GENERATED_REMOTE_NATIVE_BEFORE_RESTART");
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_REMOTE_NATIVE_BEFORE_RESTART");
    await app.close(); app = undefined; sdk.disconnect(); await f.service.close({ preserveTerminals: true });
    restarted = await startService({ stateDir: join(f.directory, "state"), provider: f.provider, retentionKey: f.retentionKey, platform: { terminal: { ...program, vault: f.terminalVault } } });
    peer = await new MoguriSdk(restarted.connection).ready();
    expect((await peer.remote.status()).remote.ready).toBe(false);
    app = await launch(f.directory); page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
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
  } finally { await app?.close(); sdk.disconnect(); peer?.disconnect(); await restarted?.close(); await f.close(); }
});
