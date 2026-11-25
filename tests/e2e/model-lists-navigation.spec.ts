import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection, waitForWorkspace } from "./navigation.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop navigation uses generated hidden macOS windows.");

test("model lists group by provider and AI lab, order by price and filter; Settings links sections; Capabilities installs MCP servers", async () => {
  test.setTimeout(ciTime(90_000));
  const fixture = await setupFixture(), original = fixture.provider.state.models[0]!;
  const generated = [["gpt-6-astra", "Generated GPT Astra"], ["gpt-6-luna", "Generated GPT Luna"], ["gpt-5-nano", "Generated GPT Nano"], ["gpt-generated-beta", "Generated GPT Beta"],
    ["claude-opus-5.5", "Generated Claude Opus"]].map(([id, name]) => ({ ...original, id: id!, apiModelId: id!, name: name! }));
  fixture.provider.state.models.push(...generated); fixture.provider.onChange(); await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await openSettingsSection(page, "Providers");
    const panel = page.getByRole("region", { name: "Provider and model availability", exact: true });
    const providerToggle = panel.locator(".model-group-toggle.provider", { hasText: "GitHub Copilot" });
    await expect(providerToggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByRole("switch", { name: "Enable model gpt-6-astra", exact: true })).toHaveCount(0);
    await providerToggle.click();
    const openai = panel.locator(".model-group-toggle.lab", { hasText: "OpenAI" });
    await expect(openai).toHaveAttribute("aria-expanded", "false");
    await expect(panel.locator(".model-group-toggle.lab", { hasText: "Anthropic" })).toHaveAttribute("aria-expanded", "false");
    await openai.click();
    const openaiRows = panel.getByRole("group", { name: "GitHub Copilot OpenAI models", exact: true }).locator(".model-availability-row strong");
    await expect(openaiRows).toHaveText(["Generated GPT Astra", "Generated GPT Beta", "Generated GPT Luna", "Generated GPT Nano"]);
    await panel.getByRole("button", { name: "Order by price", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Order by price", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(openaiRows).toHaveText(["Generated GPT Nano", "Generated GPT Luna", "Generated GPT Astra", "Generated GPT Beta"]);
    await expect(panel.getByRole("group", { name: "GitHub Copilot OpenAI models", exact: true })).toContainText("Price unknown");
    await panel.getByRole("button", { name: /^Filter by ai labs/ }).click();
    await panel.getByRole("group", { name: "AI labs", exact: true }).getByLabel(/^Anthropic/).check();
    await expect(panel.getByRole("switch", { name: "Enable model claude-opus-5.5", exact: true })).toBeVisible();
    await expect(panel.getByRole("switch", { name: "Enable model gpt-6-astra", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Clear ai labs", exact: true }).click();

    const rail = page.getByRole("navigation", { name: "Settings categories", exact: true });
    const sections = rail.getByRole("list", { name: "Models sections", exact: true });
    await expect(sections.getByRole("link")).toHaveText(["Providers", "Local models", "Kupo routing", "Decision providers"]);
    await sections.getByRole("link", { name: "Kupo routing", exact: true }).click();
    await expect(sections.getByRole("link", { name: "Kupo routing", exact: true })).toHaveAttribute("aria-current", "location");
    await page.locator("#settings-section-localModels").evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect(sections.getByRole("link", { name: "Local models", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(page.locator("#settings-section-kupo")).toBeInViewport();
    await expect(rail.getByRole("button", { name: "Boundaries", exact: true })).toBeVisible();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();

    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await resources.getByRole("button", { name: "Capabilities", exact: true }).click();
    const capabilities = page.getByRole("region", { name: "Capabilities", exact: true });
    await capabilities.getByRole("tab", { name: "MCP", exact: true }).click();
    await capabilities.getByLabel("MCP server name", { exact: true }).fill("Generated MCP tools");
    await capabilities.getByLabel("MCP server command", { exact: true }).fill("node");
    await capabilities.getByLabel("MCP server arguments", { exact: true }).fill("generated-server.mjs");
    await capabilities.getByRole("button", { name: "Add server", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.mcpServers.map((server) => [server.id, server.enabled, server.transport])).toEqual([
      ["generated-mcp-tools", true, { type: "stdio", command: "node", args: ["generated-server.mjs"] }]]);
    await capabilities.getByRole("switch", { name: "Enable MCP server Generated MCP tools", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.mcpServers[0]?.enabled).toBe(false);
    await capabilities.getByRole("button", { name: "Remove MCP server Generated MCP tools", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.mcpServers).toEqual([]);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Archived lists only projects with archived chats, and ask Moguri opens its own top-level chat", async () => {
  const fixture = await setupFixture(); await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const nav = page.getByRole("navigation", { name: "Projects and sessions", exact: true });
    const project = nav.getByRole("region", { name: /^Project / });
    await expect(project).toHaveCount(1);
    await page.locator(".nav-tabs").getByRole("button", { name: "Archived", exact: true }).click();
    await expect(project).toHaveCount(0);
    await expect(nav).toContainText("No archived sessions.");
    const extra = await sdk.sessions.create(fixture.session().projectId, "Generated archived chat");
    await sdk.command({ type: "session.archive", sessionId: extra.id! });
    await expect(project).toHaveCount(1);
    await page.locator(".nav-tabs").getByRole("button", { name: "Sessions", exact: true }).click();
    await page.locator(".nav-tabs").getByRole("button", { name: "Issues", exact: true }).click();
    await expect(project).toHaveCount(0);
    await expect(nav).toContainText("No project has Kanban issues yet.");
    await sdk.issues.create(fixture.session().projectId!, { title: "Generated Kanban issue", body: "", kind: "feature", phaseId: "backlog", pullRequestUrl: null });
    await expect(project).toHaveCount(1);
    await page.locator(".nav-tabs").getByRole("button", { name: "Sessions", exact: true }).click();
    const before = new Set(sdk.getState().snapshot!.sessions.map((session) => session.id));
    await page.getByRole("button", { name: "ask Moguri", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => !before.has(session.id))?.kind).toBe("metachat");
    const created = sdk.getState().snapshot!.sessions.find((session) => !before.has(session.id))!;
    expect(created.parentSessionId).toBeUndefined();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
