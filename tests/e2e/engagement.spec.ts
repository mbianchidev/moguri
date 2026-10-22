import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DraftEditor, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedOAuthServer } from "../fixtures/oauth.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
test.skip(process.platform !== "darwin", "The desktop alpha is qualified on macOS.");
const launch = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});
test("project-free chats expose scoped suggestions, reviewed metachat and shared attention without acquiring a workspace", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const phrase = "Use generated headless checks instead of opening a browser.";
  for (let index = 0; index < 2; index++) {
    const created = await sdk.sessions.create(null), session = sdk.getState().snapshot!.sessions.find((session) => session.id === created.id)!;
    await sdk.command({ type: "session.configure", sessionId: session.id, expectedRevision: session.revision, controls: { ...session.controls, modelId: fixture.modelId } });
    const editor = new DraftEditor(sdk, session.id, session.draft);
    try { editor.edit(phrase); await editor.send("queue"); } finally { editor.dispose(); }
    await waitFor(() => fixture.service.controller.snapshot().sessions.find((value) => value.id === session.id)?.status === "completed");
  }
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "New project-free chat", exact: true }).click();
    const created = fixture.service.controller.snapshot().sessions.at(-1)!;
    expect(created.projectId).toBeNull();
    const prompt = page.getByLabel("Prompt", { exact: true });
    await page.getByRole("button", { name: "Attach", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: "Project text file", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Model:/ }).click();
    await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: /Generated Copilot model/ }).click();
    await page.keyboard.press("Escape");
    await prompt.fill("/rename Generated project-free chat"); await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeEnabled(); await prompt.press("Meta+Enter");
    await expect(page.getByRole("heading", { name: "Generated project-free chat", exact: true })).toBeVisible();
    await prompt.fill("/suggestions"); await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeEnabled(); await prompt.press("Meta+Enter");
    const suggestions = page.getByRole("region", { name: "Moguri suggestions", exact: true });
    await expect(suggestions).toContainText("Project-free chats only");
    await expect(suggestions.getByRole("button", { name: "Generate suggestions", exact: true })).toBeDisabled();
    await suggestions.getByRole("button", { name: "Propose instruction", exact: true }).click();
    await suggestions.getByRole("button", { name: "Review", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review configuration change", exact: true });
    await expect(review).toContainText("Global / instructions");
    await expect(review).toContainText(phrase.replace(/\.$/, ""));
    await expect(review.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "engagement-reviewed-proposal.png") });
    await review.getByLabel("I reviewed this exact scope and change, and approve the configuration risk.").check();
    await review.getByRole("button", { name: "Apply", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.instructions).toContain("generated headless checks");
    await suggestions.getByLabel("I approve sending these scoped excerpts to the selected model for suggestions.").check();
    await suggestions.getByRole("button", { name: "Generate suggestions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Moguri suggestions", exact: true })).toBeVisible();
    const meta = fixture.service.controller.snapshot().sessions.at(-1)!;
    expect(meta.projectId).toBeNull(); expect(meta.kind).toBe("metachat");
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === meta.id)?.status).toBe("completed");
    await prompt.fill("generated question"); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().attention.some((entry) => entry.sessionId === meta.id && entry.active && entry.kind === "question")).toBe(true);
    await expect(page.locator(".session-row.selected").getByLabel("Possible question", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Attention", exact: true }).click();
    await expect(page.getByRole("region", { name: "Attention list", exact: true })).toContainText("Possible question");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await page.screenshot({ path: join(artifacts, "engagement-attention-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(page.getByLabel("Show in-app attention dots and icons")).toBeChecked();
    await expect(page.getByLabel("Enable OS banners while Moguri desktop runs in the background")).not.toBeChecked();
    await expect(page.getByLabel("Include session title and message preview in OS banners")).not.toBeChecked();
    await page.getByLabel("Enable OS banners while Moguri desktop runs in the background").check();
    await expect.poll(() => sdk.settings.get()!.values.notifications.os).toBe(true);
    expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
test("MCP OAuth UI uses generated explicit consent and clears the connection without exposing a raw bearer form", async () => {
  const oauth = await generatedOAuthServer(), secrets = new Map<string, string>();
  const fixture = await setupFixture({ platform: { vault: { read: async (id) => secrets.get(id) ?? null, write: async (id, value) => { secrets.set(id, value); }, remove: async (id) => { secrets.delete(id); } } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, mcpServers: [{ id: "generated-ui-oauth", name: "Generated MCP OAuth", enabled: true, transport: { type: "http", url: oauth.url, auth: "oauth" } }] }, settings.revision);
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "MCP gateway", exact: true }).click();
    await page.getByLabel("Server", { exact: true }).selectOption("generated-ui-oauth");
    await expect(page.getByRole("button", { name: "Store in keychain", exact: true })).toHaveCount(0);
    const panel = page.getByRole("region", { name: "MCP OAuth", exact: true });
    await panel.getByRole("button", { name: "Connect OAuth", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Open authorization", exact: true })).toBeVisible();
    const login = fixture.service.controller.snapshot().oauthAuthorizations.at(-1)!;
    const status = await sdk.mcp.oauthStatus(login.id);
    await fetch(await oauth.callback(status.url!));
    await expect(panel.getByRole("status")).toContainText("connected");
    await page.getByRole("button", { name: "Discover tools", exact: true }).click();
    await expect(page.getByRole("button", { name: /^oauth_echo/ })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("generated-oauth-access");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "engagement-mcp-oauth.png") });
    await panel.getByRole("button", { name: "Clear OAuth connection", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("cleared");
    await page.getByRole("button", { name: "Check credential status", exact: true }).click();
    await expect(page.locator(".settings-result pre")).toContainText('"state": "required"');
    expect(secrets.size).toBe(0); expect(fixture.requests.length).toBe(0); expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); await oauth.close(); }
});
