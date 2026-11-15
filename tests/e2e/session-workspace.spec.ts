import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { DraftEditor, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedRepository } from "../fixtures/git.ts";
import { finishIdleSchedule, openModelChoices } from "./navigation.ts";

const require = createRequire(import.meta.url);
const artifacts = resolve(".moguri/artifacts");
test.skip(process.platform !== "darwin", "The desktop release is qualified on macOS.");
const launch = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});

async function holdPrompt(sdk: MoguriSdk, sessionId: string, text: string) {
  const session = sdk.getState().snapshot?.sessions.find((session) => session.id === sessionId);
  if (!session) throw new Error("The generated held prompt requires its original session.");
  const editor = new DraftEditor(sdk, sessionId, session.draft);
  try { editor.edit(text); await editor.send("queue", true); } finally { editor.dispose(); }
}

async function queuedActions(page: Page, index: number) {
  const more = page.getByRole("button", { name: `More actions for queued message ${index}`, exact: true });
  await more.focus(); await more.press("Enter");
  return page.getByRole("dialog", { name: `Queued message ${index} actions`, exact: true });
}

test("queued prompts hide without losing edits, dispatching work or hiding incoming queue counts", async () => {
  const fixture = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("Generated original queue transcript"); await fixture.terminal(); await sdk.refresh();
  await sdk.sessions.rename(fixture.sessionId, "Generated original queue");
  await holdPrompt(sdk, fixture.sessionId, "Generated first hidden queue prompt");
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), queue = page.getByRole("region", { name: "Message queue", exact: true });
    const hide = queue.getByRole("button", { name: "Hide queued prompts", exact: true });
    const show = queue.getByRole("button", { name: "Show queued prompts", exact: true });
    const edit = queue.getByRole("textbox", { name: "Edit queued message", exact: true });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    const row = queue.getByRole("listitem").first(), actions = row.locator(".queue-actions");
    await expect(row.locator(".queue-bubble")).toHaveCSS("border-top-style", "dashed");
    await expect(actions).toHaveCSS("opacity", "0");
    await row.hover(); await expect(actions).toHaveCSS("opacity", "1");
    await page.screenshot({ path: test.info().outputPath("queued-prompt-hover.png") });
    await queue.getByRole("button", { name: "More actions for queued message 1", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Queued message 1 actions", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(queue.getByRole("button", { name: "More actions for queued message 1", exact: true })).toBeFocused();
    await (await queuedActions(page, 1)).getByRole("button", { name: "Edit queued message 1", exact: true }).press("Enter");
    await expect(edit).toBeFocused();
    await edit.fill("Generated unsaved queued edit");
    const original = structuredClone(fixture.session().queue), revision = fixture.session().queueRevision;
    await hide.press("Enter");
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await expect(show).toBeFocused();
    await expect(edit).toBeHidden();
    await expect(queue.getByRole("list", { name: "Queued prompt order" })).toBeHidden();
    await expect(show).toHaveText("1 queued message");
    expect(fixture.session().queue).toEqual(original); expect(fixture.session().queueRevision).toBe(revision);
    await page.keyboard.press("Tab");
    await expect(queue.getByRole("button", { name: "Resume queued work", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await show.press("Space");
    await expect(hide).toBeFocused();
    await expect(edit).toHaveValue("Generated unsaved queued edit");
    await hide.click();
    await holdPrompt(sdk, fixture.sessionId, "Generated incoming hidden queue prompt");
    await expect(show).toHaveText("2 queued messages");
    await page.screenshot({ path: test.info().outputPath("queued-prompts-collapsed.png") });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await expect(queue.getByRole("button", { name: "Run queued message 2", exact: true })).toBeHidden();
    await show.click();
    await expect(edit).toHaveValue("Generated unsaved queued edit");
    await expect(queue.getByText("Generated incoming hidden queue prompt", { exact: true })).toBeVisible();
    await queue.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.session().queue[0]?.text).toBe("Generated unsaved queued edit");
    await hide.click();
    const other = await sdk.sessions.create(null, "Generated separate queue");
    await holdPrompt(sdk, other.id!, "Generated separate queued prompt");
    await page.locator(".session-link").filter({ hasText: "Generated separate queue" }).click();
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await expect(queue.getByText("Generated separate queued prompt", { exact: true })).toBeVisible();
    await expect(page.getByRole("log", { name: "Session transcript", exact: true })).not.toContainText("Generated original queue transcript");
    expect(fixture.session().queue.every((item) => item.held)).toBe(true);
    expect(fixture.session().queue).toHaveLength(2); expect(fixture.requests).toHaveLength(1);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});

test("main and side chats have independent queued prompt visibility in a compact window", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await holdPrompt(sdk, fixture.sessionId, "Generated main queue visibility prompt");
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    const main = page.getByRole("region", { name: "Message queue", exact: true }).filter({ hasText: "Generated main queue visibility prompt" });
    await main.getByRole("button", { name: "Hide queued prompts", exact: true }).click();
    await page.getByRole("button", { name: "Side chat", exact: true }).click();
    const sideSession = await waitFor(() => sdk.getState().snapshot?.sessions.find((session) => session.kind === "side"));
    await holdPrompt(sdk, sideSession.id, "Generated side queue visibility prompt");
    const side = page.locator(".side-chat-panel").getByRole("region", { name: "Message queue", exact: true });
    await expect(side.getByRole("button", { name: "Hide queued prompts", exact: true })).toHaveAttribute("aria-expanded", "true");
    const more = side.getByRole("button", { name: "More actions for queued message 1", exact: true });
    await more.focus(); await more.press("Enter");
    const menu = page.getByRole("dialog", { name: "Queued message 1 actions", exact: true });
    await expect(menu).toHaveAttribute("data-source-session-id", sideSession.id);
    await menu.getByRole("button", { name: "Edit queued message 1", exact: true }).press("Enter");
    await side.getByRole("textbox", { name: "Edit queued message", exact: true }).fill("Generated preserved side queue edit");
    await side.getByRole("button", { name: "Hide queued prompts", exact: true }).click();
    await main.getByRole("button", { name: "Show queued prompts", exact: true }).click();
    await expect(main.getByText("Generated main queue visibility prompt", { exact: true })).toBeVisible();
    await expect(side.getByRole("button", { name: "Show queued prompts", exact: true })).toHaveAttribute("aria-expanded", "false");
    await side.getByRole("button", { name: "Show queued prompts", exact: true }).click();
    await expect(side.getByRole("textbox", { name: "Edit queued message", exact: true })).toHaveValue("Generated preserved side queue edit");
    expect(fixture.session().queue[0]?.text).toBe("Generated main queue visibility prompt");
    expect(sdk.getState().snapshot?.sessions.find((session) => session.id === sideSession.id)?.queue[0]?.text).toBe("Generated side queue visibility prompt");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    for (const queue of [main, side]) {
      expect(await queue.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    }
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByText("Draft saved", { exact: true }).first()).toBeVisible();
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});

test("held prompts, shared slash actions, nested sessions, real Ghostty and project settings work end to end", async () => {
  const fixture = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf '\\033[32mGENERATED_GHOSTTY_READY\\033[0m\\n'; exec cat"] } } });
  await generatedRepository(fixture.project);
  await writeFile(join(fixture.project, "fixture.txt"), "Generated local diff.\n");
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("generated slow existing desktop queue owner"); await waitFor(() => fixture.requests.length === 1);
  const app = await launch(join(fixture.directory, "state"));
  const longName = "Generated long session name covering bounded titles and compact navigation ".repeat(2).trim();
  try {
    await mkdir(artifacts, { recursive: true });
    const page = await app.firstWindow();
    const failures: string[] = []; page.on("pageerror", (error) => failures.push(error.message));
    const prompt = page.getByLabel("Prompt", { exact: true });
    const slash = async (value: string) => {
      await prompt.fill(value);
      await expect(page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Run command", exact: true })).toBeEnabled();
      await prompt.press("Enter");
    };
    const hold = async (text: string, modifier: "Meta" | "Control") => {
      await prompt.fill(text); await page.keyboard.down(modifier);
      try {
        await expect(page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Queue prompt without starting work", exact: true })).toBeEnabled();
        await page.keyboard.press("Enter");
      } finally { await page.keyboard.up(modifier); }
      await expect(prompt).toHaveValue("");
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    };
    await hold("Generated first held prompt", "Meta");
    await expect.poll(() => fixture.session().queue.length).toBe(1);
    await hold("Generated second held prompt", "Control");
    await expect.poll(() => fixture.session().queue.length).toBe(2);
    expect(fixture.session().queue.every((item) => item.held)).toBe(true);
    expect(fixture.requests.length).toBe(1);
    await (await queuedActions(page, 1)).getByRole("button", { name: "Edit queued message 1", exact: true }).click();
    await page.getByLabel("Edit queued message", { exact: true }).fill("Generated edited held prompt");
    await page.getByRole("region", { name: "Message queue" }).getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.session().queue[0]?.text).toBe("Generated edited held prompt");
    const reorder = page.getByRole("button", { name: "Reorder queued message 2", exact: true });
    await expect(reorder).toBeEnabled();
    await reorder.press("Alt+ArrowUp");
    await expect.poll(() => fixture.session().queue[0]?.text).toBe("Generated second held prompt");
    await expect(page.getByRole("region", { name: "Message queue" }).getByRole("listitem").first()).toContainText("Generated second held prompt");
    await (await queuedActions(page, 1)).getByRole("button", { name: "Copy queued message 1", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Remove queued message 2", exact: true }).focus();
    await page.getByRole("button", { name: "Remove queued message 2", exact: true }).click();
    await expect.poll(() => fixture.session().queue.length).toBe(1);
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    await slash("/read-only");
    await expect.poll(() => fixture.session().mode).toBe("read-only");
    await slash(`/rename ${longName}`);
    await expect(page.getByRole("heading", { name: longName, exact: true })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "desktop-held-queue.png") });
    await page.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe(fixture.modelId);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Run queued message 1", exact: true }).focus();
    await page.getByRole("button", { name: "Run queued message 1", exact: true }).press("Enter");
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests.length).toBe(2);
    await page.locator(".message.user").last().hover();
    await page.locator(".message.user").last().getByRole("button", { name: /^Copy sent prompt / }).click();
    await slash("/agent");
    await expect.poll(() => fixture.session().mode).toBe("agent");
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const plan = page.getByLabel("Project plan", { exact: true });
    await plan.fill("Generated independent desktop plan.");
    await page.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    await expect(plan).toHaveValue("Generated independent desktop plan.");
    await page.locator('.main-pane > .app-alert[role="alert"]').getByRole("button", { name: "Dismiss alert", exact: true }).click();
    await page.getByRole("complementary", { name: "Session sidebar" }).getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().artifacts.length).toBe(1);
    const artifactId = fixture.service.controller.snapshot().artifacts[0]!.id;
    await page.getByRole("button", { name: "Code change", exact: true }).click();
    await expect(page.locator(".unified-diff")).toContainText("Generated local diff.");
    await slash("/subsession Generated attached session");
    await expect(page.getByRole("heading", { name: "Generated attached session", exact: true })).toBeVisible();
    const child = fixture.service.controller.snapshot().sessions.find((session) => session.title === "Generated attached session")!;
    expect(child.parentSessionId).toBe(fixture.sessionId);
    await slash("/side");
    const sideQuestion = page.getByLabel("Side question", { exact: true });
    await sideQuestion.fill("generated tool question");
    const sidePanel = page.locator(".side-chat-panel");
    await sidePanel.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("log", { name: "Side chat transcript" })).toContainText("The requested fixture operation is complete.");
    const side = fixture.service.controller.snapshot().sessions.find((session) => session.kind === "side")!;
    expect(side.parentSessionId).toBe(child.id); expect(side.mode).toBe("read-only");
    expect(side.pendingApproval).toBeNull();
    await sideQuestion.fill("Generated held side question"); await sideQuestion.press("Meta+Enter");
    await finishIdleSchedule(page);
    await expect.poll(() => fixture.service.controller.snapshot().scheduledPrompts.find((prompt) => prompt.sessionId === side.id)?.status).toBe("scheduled");
    await expect(sidePanel.getByRole("article", { name: "Unsent scheduled prompt", exact: true })).toContainText("Generated held side question");
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(input).toBeAttached();
    await expect(page.locator(".ghostty-host canvas").first()).toBeVisible();
    await input.focus(); await page.keyboard.type("GENERATED_GHOSTTY_INPUT"); await page.keyboard.press("Enter");
    const terminal = fixture.service.controller.snapshot().terminals.find((terminal) => terminal.sessionId === child.id)!;
    await expect.poll(async () => (await sdk.terminal.read(terminal.id)).data).toContain("GENERATED_GHOSTTY_INPUT");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    await page.screenshot({ path: join(artifacts, "desktop-ghostty-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.find((entry) => entry.id === terminal.id)?.status).toBe("closed");
    await page.getByLabel("Project actions for project", { exact: true }).click();
    await page.getByRole("menu", { name: "Project actions for project", exact: true }).getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("region", { name: "Per-project settings" })).toBeVisible();
    await page.getByLabel("Preview port", { exact: true }).fill("4321");
    await page.getByLabel("Denied folders", { exact: true }).fill("private");
    await page.getByRole("button", { name: "Save project settings", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().projectConfigurations[0]?.values.port).toBe(4321);
    await page.screenshot({ path: join(artifacts, "desktop-project-settings-compact.png") });
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "Retention", exact: true }).click();
    await expect(page.getByLabel("Automatically delete archived sessions after the configured age")).not.toBeChecked();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Open parent session", exact: true }).click();
    await expect(page.getByRole("heading", { name: longName, exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().terminals.filter((entry) => entry.sessionId === child.id)).toHaveLength(1);
    await page.getByRole("button", { name: longName, exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Archive", exact: true }).click();
    const archive = page.getByRole("dialog", { name: "Archive session", exact: true });
    await archive.getByRole("radio", { name: /Settle owned work, then detach direct children/ }).check();
    await archive.getByRole("button", { name: "Archive session", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("archived");
    await page.getByRole("button", { name: "Archived", exact: true }).click();
    await page.getByRole("button", { name: longName, exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Unarchive", exact: true }).click();
    await expect.poll(() => fixture.session().status).not.toBe("archived");
    await page.getByRole("button", { name: "Sessions", exact: true }).click();
    await page.getByRole("button", { name: longName, exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Delete session", exact: true });
    await expect(deletion).toContainText("Ordinary independent artifacts");
    await expect(deletion).toContainText("every selected candidate or generation proposal");
    await deletion.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
    await deletion.getByRole("button", { name: "Delete session", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.some((session) => session.id === fixture.sessionId)).toBe(false);
    expect((await sdk.plans.artifact(artifactId)).text).toBe("Generated independent desktop plan.");
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === child.id)?.parentSessionId).toBeUndefined();
    expect(JSON.stringify(fixture.service.controller.events(0))).not.toContain("GENERATED_GHOSTTY_INPUT");
    expect(failures).toEqual([]);
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});

test("the isolated native browser has no Moguri/Node bridge and hides under dialogs", async () => {
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Generated preview</title><h1>Generated isolated preview</h1>"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Generated preview bind failed.");
  const url = `http://127.0.0.1:${address.port}/`;
  const fixture = await setupFixture();
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill(`/browser ${url}`);
    await page.getByLabel("Prompt", { exact: true }).press("Enter");
    await expect(page.getByLabel("Preview URL", { exact: true })).toHaveValue(url);
    const previewUrls = () => app.evaluate(({ BrowserWindow, WebContentsView }) => BrowserWindow.getAllWindows()[0]!.contentView.children.filter((child) => child instanceof WebContentsView).map((child) => child.webContents.getURL()));
    await expect.poll(previewUrls).toContain(url);
    const boundary = await app.evaluate(async ({ BrowserWindow, WebContentsView }, url) => {
      const view = BrowserWindow.getAllWindows()[0]!.contentView.children.find((child) => child instanceof WebContentsView && child.webContents.getURL() === url);
      if (!(view instanceof WebContentsView)) throw new Error("Generated preview view missing.");
      return view.webContents.executeJavaScript("({text:document.querySelector('h1')?.textContent,bridge:typeof window.moguri,node:typeof process,require:typeof require})");
    }, url);
    expect(boundary).toEqual({ text: "Generated isolated preview", bridge: "undefined", node: "undefined", require: "undefined" });
    await page.getByLabel("Prompt", { exact: true }).focus();
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect.poll(previewUrls).not.toContain(url);
    await page.keyboard.press("Escape");
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); await fixture.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
