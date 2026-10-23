import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { cloneRepositoryFixture } from "../fixtures/clone-repository.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } });
  await app.close();
};
test.skip(process.platform !== "darwin", "Native desktop console execution is qualified on macOS.");

test("one Start chooser creates project-free chats, project sessions, imported folders and explicit real clones", async () => {
  const fixture = await setupFixture(), source = await cloneRepositoryFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated original saved draft before Start.");
    await expect(page.getByRole("combobox", { name: "Project for new chat", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open project", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Chats", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const start = page.getByRole("dialog", { name: "Start", exact: true });
    await expect(start).toBeVisible(); await expect(start.getByLabel("Find a project", { exact: true })).toBeFocused();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/workspace-start.png") });
    await start.getByRole("button", { name: /^New chat/ }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.at(-1)?.projectId).toBeNull();
    await expect(start).toHaveCount(0);
    expect(fixture.session().draft.text).toBe("Generated original saved draft before Start.");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await start.locator(".start-projects").getByRole("button").click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.at(-1)?.projectId).toBe(fixture.session().projectId);
    const imported = join(fixture.directory, "imported-folder"); await mkdir(imported);
    await app.evaluate(({ ipcMain }, path) => { ipcMain.removeHandler("moguri:choose-project"); ipcMain.handle("moguri:choose-project", () => path); }, imported);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await start.getByRole("button", { name: "Import local folder", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().projects.length).toBe(2);
    expect(fixture.service.controller.snapshot().projects.at(-1)?.path).toBe(await realpath(imported));
    await app.evaluate(({ ipcMain }, path) => { ipcMain.removeHandler("moguri:choose-project"); ipcMain.handle("moguri:choose-project", () => path); }, fixture.directory);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await start.getByRole("button", { name: "Clone repository", exact: true }).click();
    await start.getByLabel("Repository URL", { exact: true }).fill(source.repository);
    await start.getByRole("button", { name: "Choose clone folder", exact: true }).click();
    await start.getByLabel("New clone folder name", { exact: true }).fill("generated-clone");
    await start.getByRole("button", { name: "Clone and start", exact: true }).click();
    await expect(start).toHaveCount(0);
    const snapshot = fixture.service.controller.snapshot(), clone = snapshot.projects.find((project) => project.name === "generated-clone")!;
    expect(snapshot.sessions.at(-1)?.projectId).toBe(clone.id);
    expect(snapshot.jobs.findLast((job) => job.kind === "project.clone")?.status).toBe("completed");
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); await fixture.close(); await source.close(); }
});

test("the composer send position becomes a red stop action without clearing a draft or conflating held prompts with cancellation", async () => {
  const fixture = await setupFixture(); await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" }), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("generated slow composer-stop task");
    const send = composer.getByRole("button", { name: "Send", exact: true }), bounds = await send.boundingBox();
    await send.click();
    const stop = composer.getByRole("button", { name: "Stop turn", exact: true });
    await expect(stop).toBeEnabled(); await expect(stop.locator("svg")).toHaveAttribute("data-icon", "Stop");
    expect((await stop.boundingBox())!.x).toBeCloseTo(bounds!.x, 1);
    await prompt.hover();
    await expect(stop).toHaveCSS("color", "rgb(255, 181, 169)");
    expect(await page.locator(".session-header").getByRole("button", { name: "Stop turn", exact: true }).count()).toBe(0);
    await prompt.fill("Generated held while a turn runs."); await prompt.press("Control+Enter");
    await expect.poll(() => fixture.session().queue.at(-1)?.held).toBe(true);
    await expect(stop).toBeVisible(); await expect.poll(() => fixture.requests.length).toBe(1);
    await prompt.fill("Generated draft preserved when stopped.");
    await page.screenshot({ path: resolve(".moguri/artifacts/composer-stop.png") });
    await stop.click(); await expect.poll(() => fixture.session().status).toBe("stopped");
    await expect(prompt).toHaveValue("Generated draft preserved when stopped.");
    await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    expect(fixture.session().queue.at(-1)?.held).toBe(true);
  } finally { await close(app); await fixture.close(); }
});

test("project-free Autopilot stays permissionless and a side chat can explicitly choose its missing model without changing the parent", async () => {
  const fixture = await setupFixture({ responseMode: "text" }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("dialog", { name: "Start", exact: true }).getByRole("button", { name: /^New chat/ }).click();
    const parentId = fixture.service.controller.snapshot().sessions.at(-1)!.id;
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const autonomy = page.getByRole("dialog", { name: "Autonomy level", exact: true });
    await expect(autonomy.getByRole("button", { name: /^Autopilot Undelegated/ })).toBeEnabled();
    await autonomy.getByRole("button", { name: /^Autopilot Undelegated/ }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === parentId)?.controls.autonomy).toBe("Autopilot");
    expect(fixture.service.controller.snapshot().settings.values.permissions).toEqual({ tools: [], commands: [] });
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Side chat", exact: true }).click();
    await page.getByRole("button", { name: "New side chat", exact: true }).click();
    const side = fixture.service.controller.snapshot().sessions.at(-1)!;
    expect(side.projectId).toBeNull(); expect(side.controls.modelId).toBeNull(); expect(side.mode).toBe("read-only");
    await page.getByLabel("Side question", { exact: true }).fill("Generated independent side question.");
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
    await page.getByLabel("Side chat model", { exact: true }).selectOption(fixture.modelId);
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
    await page.getByLabel("Side question", { exact: true }).press("Enter");
    await expect(page.getByRole("log", { name: "Side chat transcript" })).toContainText("Generated Copilot response.");
    await page.screenshot({ path: resolve(".moguri/artifacts/project-free-side-chat.png") });
    const snapshot = fixture.service.controller.snapshot();
    expect(snapshot.sessions.find((session) => session.id === parentId)?.controls.modelId).toBeNull();
    expect(snapshot.sessions.find((session) => session.id === side.id)?.controls.modelId).toBe(fixture.modelId);
    expect(/read_file|write_file|run_command/.test(JSON.stringify(fixture.requests[0]?.tools))).toBe(false);
  } finally { await close(app); await fixture.close(); }
});

test("a real global Ghostty console opens without any session and stays separate when a chat creates its own console", async () => {
  const root = await mkdtemp(join(tmpdir(), "moguri-generated-global-console-"));
  const fixture = await setupFixture({ platform: { terminal: { defaultRoot: root, executable: "/bin/sh", args: ["-c", "printf 'GENERATED_GLOBAL_UI_READY\\n'; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.delete(fixture.sessionId, true);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Global terminal", exact: true }).click();
    await page.getByRole("button", { name: "Open global terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.length).toBe(1);
    const terminal = fixture.service.controller.snapshot().terminals[0]!;
    expect(terminal.sessionId).toBeNull(); expect(terminal.projectId).toBeNull();
    const tty = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(tty).toHaveAttribute("aria-disabled", "false");
    await tty.focus(); await page.keyboard.type("GENERATED_GLOBAL_UI_INPUT"); await page.keyboard.press("Enter");
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_GLOBAL_UI_INPUT");
    await page.screenshot({ path: resolve(".moguri/artifacts/global-terminal.png") });
    await expect(page.getByRole("button", { name: "New global terminal", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("dialog", { name: "Start", exact: true }).getByRole("button", { name: /^New chat/ }).click();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Global terminal", exact: true }).click();
    await expect(tty).toHaveAttribute("aria-disabled", "false");
    expect(fixture.service.controller.snapshot().terminals.length).toBe(1);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("button", { name: "Open terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.length).toBe(2);
    const own = fixture.service.controller.snapshot().terminals[1]!;
    expect(own.sessionId).toBe(fixture.service.controller.snapshot().sessions[0]?.id);
    expect(own.projectId).toBeNull();
    await sdk.sessions.delete(own.sessionId!, true);
    expect((await sdk.terminal.read(terminal.id)).terminal.status).toBe("running");
    expect(JSON.stringify(fixture.service.controller.events(0))).not.toContain("GENERATED_GLOBAL_UI_INPUT");
    expect(fixture.requests.length).toBe(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

test("cancelling an actual clone in Start preserves the partial destination and creates no project chat", async () => {
  const fixture = await setupFixture(), source = await cloneRepositoryFixture(), app = await launch(fixture.directory);
  try {
    source.hold();
    const page = await app.firstWindow(), before = fixture.service.controller.snapshot().sessions.length;
    await app.evaluate(({ ipcMain }, path) => { ipcMain.removeHandler("moguri:choose-project"); ipcMain.handle("moguri:choose-project", () => path); }, fixture.directory);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const start = page.getByRole("dialog", { name: "Start", exact: true });
    await start.getByRole("button", { name: "Clone repository", exact: true }).click();
    await start.getByLabel("Repository URL", { exact: true }).fill(source.repository);
    await start.getByRole("button", { name: "Choose clone folder", exact: true }).click();
    await start.getByLabel("New clone folder name", { exact: true }).fill("generated-partial");
    await start.getByRole("button", { name: "Clone and start", exact: true }).click();
    await expect.poll(source.held).toBe(true);
    await start.getByRole("button", { name: "Cancel clone", exact: true }).click();
    await expect(start.getByRole("region", { name: "Repository clone status", exact: true })).toContainText("partial");
    expect(fixture.service.controller.snapshot().sessions.length).toBe(before);
    expect(fixture.service.controller.snapshot().projects.length).toBe(1);
    await start.getByRole("button", { name: "Back", exact: true }).click();
    await start.getByRole("button", { name: "Close Start", exact: true }).click();
  } finally { await close(app); await fixture.close(); await source.close(); }
});
