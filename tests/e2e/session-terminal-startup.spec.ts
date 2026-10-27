import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isRecord, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { remoteFixture } from "../fixtures/remote-service.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native session-terminal admission qualification is macOS-only.");

test("explicit session navigation opens the newly selected console, preserves exact roots and does not renew an X-closed same-session intent", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated project console" });
  const chat = await sdk.sessions.create(null, "Generated project-free console"), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const terminal = page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true });
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await terminal.click(); await expect(input).toHaveAttribute("aria-disabled", "false");
    const first = sdk.getState().snapshot!.terminals.find((entry) => entry.sessionId === fixture.sessionId)!;
    await navigation.getByRole("button", { name: "Generated project-free console", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((entry) => entry.sessionId === chat.id).length).toBe(1);
    await expect(input).toHaveAttribute("aria-disabled", "false");
    const second = sdk.getState().snapshot!.terminals.find((entry) => entry.sessionId === chat.id)!;
    expect(second.id).not.toBe(first.id); expect(second.projectId).toBeNull();
    expect(second.binding?.root).toBe(await realpath(homedir()));
    expect(first.binding?.root).toBe(await realpath(fixture.project));
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.find((entry) => entry.id === second.id)?.status).toBe("closed");
    await navigation.getByRole("button", { name: "Generated project-free console", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated same-session selection cannot replay a launch.");
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((entry) => entry.id === chat.id)?.draft.text).toBe("Generated same-session selection cannot replay a launch.");
    expect(sdk.getState().snapshot!.terminals).toHaveLength(2);
    const plus = page.getByRole("button", { name: "New terminal", exact: true });
    await expect(plus).toBeEnabled(); await plus.click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.length).toBe(3);
    await expect(input).toHaveAttribute("aria-disabled", "false");
    await navigation.getByRole("button", { name: "Generated project console", exact: true }).click();
    await expect(input).toHaveAttribute("aria-disabled", "false");
    expect(sdk.getState().snapshot!.terminals.find((entry) => entry.id === first.id)?.pid).toBe(first.pid);
    expect(sdk.getState().snapshot!.terminals).toHaveLength(3);
    const sessionCount = sdk.getState().snapshot!.sessions.length;
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("dialog", { name: "New", exact: true }).getByRole("button", { name: /^New chat/ }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.length).toBe(sessionCount + 1);
    const created = sdk.getState().snapshot!.sessions.at(-1)!;
    await expect.poll(() => sdk.getState().snapshot!.terminals.some((entry) => entry.sessionId === created.id)).toBe(true);
    expect(sdk.getState().snapshot!.terminals.find((entry) => entry.sessionId === created.id)?.binding?.root).toBe(await realpath(homedir()));
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("pending session read metadata cannot block automatic console opening or the plus action", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated delayed read console");
  await sdk.sessions.organize(second.id!, { unread: true });
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let entered = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.organize" && raw.command.sessionId === second.id &&
      isRecord(raw.command.changes) && raw.command.changes.unread === false) { entered = true; await gate.promise; }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Generated delayed read console", exact: true }).click();
    await waitFor(() => entered);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true }), plus = page.getByRole("button", { name: "New terminal", exact: true });
    await expect(input).toHaveAttribute("aria-disabled", "false");
    await expect(plus).toBeEnabled(); await plus.click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((entry) => entry.sessionId === second.id).length).toBe(2);
    gate.resolve(); await expect(page.getByRole("button", { name: "New", exact: true })).toBeEnabled();
    expect(sdk.getState().snapshot!.terminals).toHaveLength(2);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("hidden Chats selection cannot arm a restored pane, but visible Chats navigation opens its exact console", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    const chat = await sdk.sessions.create(null, "Generated hidden console selection"), settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
    app = await launch(fixture.directory);
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const terminal = page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true });
    const dashboard = page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true });
    await terminal.click();
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals[0]?.status).toBe("closed");
    await dashboard.click(); await navigation.getByRole("button", { name: "Chats", exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await dashboard.click();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated passive return cannot launch a console.");
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((entry) => entry.id === chat.id)?.draft.text).toBe("Generated passive return cannot launch a console.");
    expect(sdk.getState().snapshot!.terminals).toHaveLength(1);
    await navigation.getByRole("button", { name: fixture.session().title, exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.length).toBe(2);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((entry) => entry.status === "closed").length).toBe(2);
    await navigation.getByRole("button", { name: "Chats", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.length).toBe(3);
    const opened = sdk.getState().snapshot!.terminals.find((entry) => entry.status === "running")!;
    expect(opened.sessionId).toBe(chat.id); expect(opened.binding?.root).toBe(await realpath(homedir()));
    expect(fixture.requests).toHaveLength(0);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("allowed-env policy still blocks startup and plus without substituting another environment", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    await sdk.command({ type: "policy.set", allowedEnvs: ["Remote"] }); app = await launch(fixture.directory);
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true });
    await expect(panel).toContainText("Terminal unavailable under the current environment, project or owner policy.");
    await expect(panel.getByRole("button", { name: "New terminal", exact: true })).toBeDisabled();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated blocked draft cannot trigger execution.");
    await waitFor(() => fixture.session().draft.text === "Generated blocked draft cannot trigger execution.");
    await expect(page.getByRole("status").filter({ hasText: /^Draft saved$/ })).toHaveCount(1);
    expect(fixture.session().controls.env).toBe("Local");
    expect(sdk.getState().snapshot!.terminals).toHaveLength(0); expect(fixture.requests).toHaveLength(0);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("a Remote console probe settles its own gate before the pending explicit open is consumed", async () => {
  const fixture = await remoteFixture({ exposeModels: false }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.probe(); await sdk.sessions.env(fixture.sessionId, "Remote");
  const query = fixture.controller.platform.query.bind(fixture.controller.platform), dispatch = fixture.controller.dispatch.bind(fixture.controller);
  let probed = false, opens = 0;
  fixture.controller.platform.query = async (input) => {
    const result = await query(input);
    if (input.type === "remote.status" && result.type === "remote.status" && !probed) {
      const { terminalBuild: _, ...remote } = result.remote;
      return { ...result, remote };
    }
    return result;
  };
  fixture.controller.dispatch = async (raw: unknown) => {
    const result = await dispatch(raw);
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "remote.probe") probed = true;
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "terminal.open") opens++;
    return result;
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("button", { name: "Probe SSH target", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveAttribute("aria-disabled", "false");
    await expect.poll(() => opens).toBe(1);
    const terminal = sdk.getState().snapshot!.terminals[0]!;
    expect(terminal.env).toBe("Remote"); expect(terminal.binding?.root).toBe(fixture.workspace);
    expect(sdk.getState().snapshot!.terminalOwners.find((owner) => owner.id === terminal.ownerId)?.remote).toBeDefined();
    expect(fixture.requests).toHaveLength(0);
  } finally { fixture.controller.platform.query = query; fixture.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("one delayed startup owns the gate, a definite refusal stays visible without auto-retry, and plus can explicitly recover", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let calls = 0;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "terminal.open") {
      calls++;
      if (calls === 1) { await gate.promise; throw new MoguriError("generated_terminal_refusal", "Generated console admission was refused before any PTY launch.", 503); }
    }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await waitFor(() => calls === 1);
    const plus = page.getByRole("button", { name: "New terminal", exact: true });
    await expect(plus).toBeDisabled(); gate.resolve();
    await expect(page.getByRole("alert")).toContainText("Generated console admission was refused");
    await expect(plus).toBeEnabled();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated unsent text does not retry terminal launch.");
    await waitFor(() => fixture.session().draft.text === "Generated unsent text does not retry terminal launch.");
    expect(calls).toBe(1); expect(sdk.getState().snapshot!.terminals).toHaveLength(0);
    await plus.click();
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveAttribute("aria-disabled", "false");
    expect(calls).toBe(2); await expect.poll(() => sdk.getState().snapshot!.terminals.length).toBe(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});
