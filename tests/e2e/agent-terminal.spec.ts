import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriError, MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native Agent terminal UI is qualified on macOS.");

test("the session Agent tab renders actual approved command output in read-only Ghostty, separate from the private User terminal", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf 'GENERATED_AGENT_CONSOLE\\n'", timeoutMs: 2000 } },
    platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_PRIVATE_USER_CONSOLE\\n'; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("Generated dedicated Agent terminal."); await fixture.approve(); await fixture.terminal();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true }).click();
    const tabs = page.getByRole("tablist", { name: "Terminal ownership", exact: true });
    await expect(tabs).toHaveCount(1);
    await expect(tabs.getByRole("tab", { name: "User", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((terminal) => terminal.sessionId === fixture.sessionId).length).toBe(1);
    const userId = sdk.getState().snapshot!.terminals.find((terminal) => terminal.sessionId === fixture.sessionId)!.id;
    await tabs.getByRole("tab", { name: "Agent", exact: true }).click();
    const agent = page.getByRole("region", { name: "Agent terminal", exact: true });
    await expect(agent.getByLabel("Agent command transcript", { exact: true })).toContainText("GENERATED_AGENT_CONSOLE");
    await expect(agent.locator(".agent-ghostty-host canvas")).toBeVisible();
    // The User tab's freed emulator leaves its WASM heap dirty; nothing may be painted past the longest output line.
    const painted = () => agent.locator(".agent-ghostty-host canvas").evaluate((canvas: HTMLCanvasElement, line: string) => {
      const measure = document.createElement("canvas").getContext("2d")!; measure.font = "12px monospace";
      const end = Math.ceil(Math.ceil(measure.measureText("M").width) * line.length * canvas.width / canvas.getBoundingClientRect().width) + 2;
      const count = (left: number, right: number) => {
        const data = canvas.getContext("2d")!.getImageData(left, 0, right - left, canvas.height).data; let pixels = 0;
        for (let index = 0; index < data.length; index += 4) if (data[index] !== 0x0e || data[index + 1] !== 0x0e || data[index + 2] !== 0x10) pixels++;
        return pixels;
      };
      return { text: count(0, end), beyond: count(end, canvas.width) };
    }, "GENERATED_AGENT_CONSOLE");
    await expect.poll(async () => (await painted()).text).toBeGreaterThan(0);
    expect((await painted()).beyond).toBe(0);
    await expect(agent.getByRole("textbox", { name: "Agent terminal output", exact: true })).toHaveAttribute("aria-readonly", "true");
    await expect(agent).not.toContainText("GENERATED_PRIVATE_USER_CONSOLE");
    await expect(agent).toContainText("completed");
    await expect(agent).toContainText("Local");
    const follow = agent.getByRole("switch", { name: "Follow latest output", exact: true });
    await expect(follow).toBeChecked(); await follow.uncheck(); await expect(follow).not.toBeChecked(); await follow.check();
    expect((await sdk.agentTerminals.list(fixture.sessionId)).activity.entries.length).toBe(1);
    expect(sdk.getState().snapshot!.terminals.length).toBe(1);
    await agent.getByRole("textbox", { name: "Agent terminal output", exact: true }).focus();
    await page.keyboard.type("GENERATED_NOT_STDIN");
    await page.keyboard.press("Tab");
    await expect(agent.getByRole("textbox", { name: "Agent terminal output", exact: true })).not.toBeFocused();
    expect((await sdk.terminal.read(userId)).data.includes("GENERATED_NOT_STDIN")).toBe(false);
    expect(JSON.stringify(fixture.requests).includes("GENERATED_NOT_STDIN")).toBe(false);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/agent-terminal-desktop.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await page.screenshot({ path: resolve(".moguri/artifacts/agent-terminal-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await tabs.getByRole("tab", { name: "Agent", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.getByRole("tab", { name: "User", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toBeAttached();
    expect(sdk.getState().snapshot!.terminals[0]!.id).toBe(userId);
    expect(fixture.requests.length).toBe(2); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("live Agent output follows its actual command and stopping it preserves the private User console", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf 'GENERATED_AGENT_LIVE\\n'; sleep 30", timeoutMs: 30000 } },
    platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf GENERATED_PRIVATE_READY; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated live Agent command.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const terminalButton = page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true });
    const background = terminalButton.locator(".panel-badge");
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toBeVisible();
    await expect(background).toHaveCount(0);
    await terminalButton.click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.length).toBe(1);
    const userId = sdk.getState().snapshot!.terminals[0]!.id;
    await fixture.approve();
    await expect.poll(() => fixture.session().processes.length).toBe(1);
    await expect(background).toHaveText("1");
    await expect(terminalButton).toHaveAttribute("aria-description", /1 running agent commands/);
    await expect(page.getByRole("tab", { name: "User", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(sdk.getState().snapshot!.terminals.map((terminal) => terminal.id)).toEqual([userId]);
    const agent = page.getByRole("region", { name: "Agent terminal", exact: true });
    await expect(agent.getByLabel("Agent command transcript", { exact: true })).toContainText("GENERATED_AGENT_LIVE");
    await expect(agent.getByLabel("Current operation", { exact: true })).toBeVisible();
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    await expect(background).toHaveCount(0);
    await expect(agent.getByLabel("Current operation", { exact: true })).toHaveCount(0);
    await expect(agent.locator(".agent-command-meta > strong")).not.toHaveText("completed");
    await expect(agent.getByLabel("Agent command transcript", { exact: true })).toContainText("GENERATED_AGENT_LIVE");
    expect((await sdk.terminal.read(userId)).terminal.status).toBe("running");
    expect(fixture.requests.length).toBe(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a held Agent output read never populates another session", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf GENERATED_FIRST_AGENT_OUTPUT", timeoutMs: 2000 } },
    platform: { terminal: { executable: "/bin/sh", args: ["-c", "exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("Generated first command."); await fixture.approve(); await fixture.terminal();
  await sdk.sessions.rename(fixture.sessionId, "Generated first Agent session");
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated empty Agent session");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let held = false, settled = false, release = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  fixture.service.controller.platform.query = async (input) => {
    const result = await query(input);
    if (input.type === "activity.read" && input.toolName === "run_command" && input.sessionId === fixture.sessionId && !held) { held = true; await barrier; settled = true; }
    return result;
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.locator(".session-link").filter({ hasText: "Generated first Agent session" }).click();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.locator(".session-link").filter({ hasText: "Generated empty Agent session" }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    const agent = page.getByRole("region", { name: "Agent terminal", exact: true });
    await expect(agent).toContainText("No approved agent commands yet");
    release(); await expect.poll(() => settled).toBe(true);
    await expect(agent).not.toContainText("GENERATED_FIRST_AGENT_OUTPUT");
    await expect(agent.locator(".agent-ghostty-host")).toHaveCount(0);
    expect((await sdk.agentTerminals.list(second.id!)).activity.entries).toEqual([]);
    expect(fixture.requests.length).toBe(2);
  } finally { release(); fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("an unavailable Agent source is an explicit error, not an empty command history", async () => {
  const fixture = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "exec cat"] } } });
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  fixture.service.controller.platform.query = async (input) => {
    if (input.type === "activity.list" && input.toolName === "run_command") throw new MoguriError("generated_agent_source", "Generated Agent source is unavailable; retained history was preserved.", 503);
    return query(input);
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    const agent = page.getByRole("region", { name: "Agent terminal", exact: true });
    await expect(agent.getByRole("alert")).toContainText("Generated Agent source is unavailable");
    await expect(agent).not.toContainText("No approved agent commands yet");
    fixture.service.controller.platform.query = query;
    await page.getByRole("tab", { name: "User", exact: true }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    await expect(agent).toContainText("No approved agent commands yet");
    expect(fixture.requests.length).toBe(0);
  } finally { fixture.service.controller.platform.query = query; await app.close(); await fixture.close(); }
});
