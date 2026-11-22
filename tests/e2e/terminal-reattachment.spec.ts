import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { MoguriSdk } from "@moguri-dev/sdk";
import { startService } from "@moguri-dev/sdk/testing";
import { setupFixture } from "../fixture.ts";
import { sdkPath } from "../fixtures/sdk-paths.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
const program = { executable: process.execPath, args: ["-e", "process.stdin.setRawMode(true); process.stdin.on('data',d=>process.stdout.write(d)); process.stdout.write('GENERATED_GHOSTTY_REATTACH_READY\\n');"],
  brokerPath: sdkPath("dist/terminal-broker.mjs") };
const launch = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});
test.skip(process.platform !== "darwin", "Native user terminal reattachment is qualified on macOS only.");

test("Ghostty detachment discards queued input, reconnects one existing PTY and never replaces a closed console", async () => {
  const fixture = await setupFixture({ platform: { terminal: program } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await launch(join(fixture.directory, "state")), manager = fixture.service.controller.platform.sessions.terminals, original = manager.input.bind(manager);
  const read = manager.read.bind(manager);
  let held = false, emptyPages = 0, release = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; }), received: string[] = [];
  try {
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
    const page = await app.firstWindow(), failures: string[] = []; page.on("pageerror", (error) => failures.push(error.message));
    manager.read = async (...args) => { const result = await read(...args); if (!result.data.length && result.terminal.status === "running") emptyPages++; return result; };
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(input).toBeAttached();
    const terminal = fixture.service.controller.snapshot().terminals[0]!;
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_GHOSTTY_REATTACH_READY");
    await expect.poll(() => emptyPages).toBeGreaterThanOrEqual(2);
    await expect(input).toHaveAttribute("aria-disabled", "false");
    manager.input = async (request) => {
      await original(request);
      if (request.action === "input") { received.push(request.data); if (!held) { held = true; await barrier; } }
    };
    await input.focus(); await page.keyboard.type("AQUEUED_NEVER_SUBMIT"); await expect.poll(() => held).toBe(true);
    await page.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    release();
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("button", { name: "Reconnect existing terminal", exact: true }).click();
    await expect(input).toHaveAttribute("aria-disabled", "false"); await input.focus(); await page.keyboard.type("B");
    await expect.poll(() => received.join("")).toBe("AB");
    const actual = await sdk.terminal.read(terminal.id);
    expect(actual.terminal.pid).toBe(terminal.pid); expect(fixture.service.controller.snapshot().terminals).toHaveLength(1);
    expect(actual.data).not.toContain("QUEUED_NEVER_SUBMIT");
    expect(JSON.stringify(fixture.service.controller.events(0))).not.toContain("QUEUED_NEVER_SUBMIT");
    await mkdir(artifacts, { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900));
    await page.screenshot({ path: join(artifacts, "terminal-reattached-desktop.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    await page.screenshot({ path: join(artifacts, "terminal-reattached-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals[0]?.status).toBe("closed");
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(1);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.length).toBe(2);
    expect(fixture.service.controller.snapshot().terminals[0]?.status).toBe("closed");
    await page.getByRole("button", { name: "New terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.length).toBe(3);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    expect(fixture.requests).toHaveLength(0); expect(failures).toEqual([]);
  } finally { release(); manager.input = original; manager.read = read; sdk.disconnect(); await app.close(); await fixture.close(); }
});

test("the native desktop reconnects after an actual service restart to the same authenticated owner and PTY", async () => {
  const fixture = await setupFixture({ platform: { terminal: program } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await launch(join(fixture.directory, "state")), entered = join(fixture.directory, "native-reconnect-held"), resume = join(fixture.directory, "native-reconnect-resume");
  let restarted: Awaited<ReturnType<typeof startService>> | undefined, peer: MoguriSdk | undefined;
  let nativeHeld: Promise<Error | null> | undefined, nativeHoldError: Error | null = null;
  try {
    const page = await app.firstWindow(), failures: string[] = []; page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true }); await expect(input).toBeAttached();
    const terminal = fixture.service.controller.snapshot().terminals[0]!, owner = fixture.service.controller.snapshot().terminalOwners[0]!;
    await expect(input).toHaveAttribute("aria-disabled", "false");
    await input.focus(); await page.keyboard.type("GENERATED_BEFORE_NATIVE_RESTART");
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_BEFORE_NATIVE_RESTART");
    // Hold only this generated Electron main while replacing its fixture service,
    // so production auto-start cannot touch a personal secret backend in the test.
    nativeHeld = app.evaluate((_electron, paths) => {
      const fs: typeof import("node:fs") = process.getBuiltinModule("fs");
      fs.writeFileSync(paths.entered, "Generated native main hold.");
      const deadline = Date.now() + 10_000, wait = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(paths.resume) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 10);
      if (!fs.existsSync(paths.resume)) throw new Error("Generated native reconnect hold expired.");
    }, { entered, resume }).then(() => null, (error: Error) => { nativeHoldError = error; return error; });
    await expect.poll(async () => { if (nativeHoldError) throw nativeHoldError; try { return await readFile(entered, "utf8"); } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return ""; throw error; } }).toContain("Generated native main hold.");
    sdk.disconnect(); await fixture.service.close({ preserveTerminals: true });
    restarted = await startService({ stateDir: join(fixture.directory, "state"), provider: fixture.provider, retentionKey: fixture.retentionKey, platform: { terminal: { ...program, vault: fixture.terminalVault } } });
    peer = await new MoguriSdk(restarted.connection).ready();
    await writeFile(resume, "Generated service replacement ready."); expect(await nativeHeld).toBeNull();
    await expect(page.getByRole("button", { name: "Reconnect existing terminal", exact: true })).toBeEnabled();
    await expect(input).toHaveAttribute("aria-disabled", "false"); await input.focus(); await page.keyboard.type("GENERATED_AFTER_NATIVE_RESTART");
    await expect.poll(async () => (await peer!.terminal.read(terminal.id)).data).toContain("GENERATED_AFTER_NATIVE_RESTART");
    const after = await peer.terminal.read(terminal.id);
    expect(after.terminal.pid).toBe(terminal.pid); expect(restarted.controller.snapshot().terminalOwners[0]?.pid).toBe(owner.pid);
    expect(restarted.controller.snapshot().terminals).toHaveLength(1);
    expect(after.data.split("GENERATED_GHOSTTY_REATTACH_READY").length - 1).toBe(1);
    expect(after.data.split("GENERATED_BEFORE_NATIVE_RESTART").length - 1).toBe(1);
    expect(failures).toEqual([]); expect(fixture.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => restarted!.controller.snapshot().terminals[0]?.status).toBe("closed");
  } finally {
    if (!restarted && nativeHeld) app.process().kill("SIGTERM");
    else await writeFile(resume, "Generated teardown release.");
    await nativeHeld; sdk.disconnect(); peer?.disconnect();
    if (app.process().exitCode === null && app.process().signalCode === null) await app.close();
    await restarted?.close(); await fixture.close();
  }
});
