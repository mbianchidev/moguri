import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Provider settings use generated hidden macOS windows.");

test("provider cards show each service's logo and text status, and the API key form opens and closes without saving", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Providers");
    const cards = [
      ["GitHub Copilot connection", "github-copilot", "Connected"],
      ["OpenRouter account", "openrouter", "Not connected"], ["Anthropic API account", "anthropic", "Not connected"],
      ["OpenAI API account", "openai", "Not connected"], ["ChatGPT account", "openai", "Not connected"],
      ["Google Gemini API account", "gemini", "Not connected"], ["Vertex AI account", "vertex-ai", "Not connected"],
      ["Amazon Bedrock account", "bedrock", "Not connected"], ["Azure OpenAI account", "azure", "Not connected"],
      ["xAI API account", "xai", "Not connected"], ["Mistral API account", "mistral", "Not connected"],
      ["Groq account", "groq", "Not connected"], ["DeepSeek API account", "deepseek", "Not connected"],
      ["Claude Agent harness", "claude-code", "Disabled"], ["Codex Agent harness", "codex", "Disabled"],
      ["Antigravity Agent harness", "antigravity", "Disabled"], ["Gemini CLI Agent harness", "gemini", "Disabled"],
    ] as const;
    for (const [name, logo, status] of cards) {
      const card = page.getByRole("region", { name, exact: true });
      await expect(card.locator(`[data-provider-logo="${logo}"]`)).toHaveCount(1);
      await expect(card.locator(".provider-status")).toHaveText(status);
    }
    const copilot = page.getByRole("region", { name: "GitHub Copilot connection", exact: true });
    await expect(copilot.getByText("Connected through your Copilot account.", { exact: true })).toBeVisible();
    await expect(copilot.getByRole("button", { name: "Refresh connection", exact: true })).toBeVisible();
    await expect(copilot.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    const availability = page.getByRole("region", { name: "Provider and model availability", exact: true });
    await expect(availability.locator('.model-provider-list [data-provider-logo="github-copilot"]')).toHaveCount(1);
    await expect(availability.locator('.model-group-toggle.provider [data-provider-logo="github-copilot"]')).toHaveCount(1);

    const anthropic = page.getByRole("region", { name: "Anthropic API account", exact: true });
    const add = anthropic.getByRole("button", { name: "Add API key", exact: true }), key = anthropic.getByLabel("Anthropic API key", { exact: true });
    await expect(add).toHaveAttribute("aria-expanded", "false");
    await expect(key).toHaveCount(0);
    await add.click();
    await expect(add).toHaveAttribute("aria-expanded", "true");
    await expect(key).toBeFocused();
    await expect(anthropic.getByRole("button", { name: "Save key", exact: true })).toBeDisabled();
    await key.fill("generated-not-a-real-key");
    await key.press("Escape");
    await expect(key).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.click();
    await expect(key).toHaveValue("");
    await anthropic.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(key).toHaveCount(0);
    expect(sdk.getState().snapshot!.settings.values.hostedProviders ?? []).toEqual([]);

    const claude = page.getByRole("region", { name: "Claude Agent harness", exact: true });
    await expect(claude.getByLabel("Claude Code executable", { exact: true })).toHaveCount(0);
    const toolbar = page.locator(".settings-toolbar").getByRole("status"), saved = () => sdk.getState().snapshot!.settings.values.claudeAgent;
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).check();
    await expect.poll(() => saved()?.enabled).toBe(true);
    await expect(toolbar).toHaveText("Saved");
    await claude.getByRole("combobox", { name: "Claude Agent transport", exact: true }).selectOption("stream-json");
    await expect.poll(() => saved()?.transport).toBe("stream-json");
    const executable = claude.getByLabel("Claude Code executable", { exact: true }), savePath = claude.getByRole("button", { name: "Save Claude Agent executable", exact: true });
    await expect(savePath).toBeDisabled();
    await executable.fill("/generated/bin/claude");
    await expect(toolbar).toHaveText("Unsaved changes");
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).uncheck();
    await expect.poll(() => saved()?.enabled).toBe(false);
    expect(saved()?.executablePath).toBeNull();
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).check();
    await expect(executable).toHaveValue("/generated/bin/claude");
    await savePath.click();
    await expect.poll(() => saved()?.executablePath).toBe("/generated/bin/claude");
    await expect(toolbar).toHaveText("Saved");
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).uncheck();
    await expect.poll(() => saved()).toEqual({ enabled: false, transport: "stream-json", executablePath: "/generated/bin/claude" });

    await page.getByRole("region", { name: "Local model servers", exact: true }).getByRole("button", { name: "Configure local models", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Configured local models", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("saving a hosted API key keeps it out of the window, connects the card and returns focus to its trigger", async () => {
  const server = createServer((request, response) => {
    if (request.method === "GET" && new URL(request.url ?? "/", "http://127.0.0.1").pathname.endsWith("/models")) {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: [{ id: "generated-anthropic-model" }] }));
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, secrets = new Map<string, string>();
  const vault = { read: async (id: string) => secrets.get(id) ?? null, write: async (id: string, value: string) => { secrets.set(id, value); }, remove: async (id: string) => { secrets.delete(id); } };
  const fixture = await setupFixture({ platform: { models: { vault, hosted: { baseUrls: { anthropic: base } } } } });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), key = "sk-ant-api03-generated-ui-key";
    await openSettingsSection(page, "Providers");
    const card = page.getByRole("region", { name: "Anthropic API account", exact: true });
    await card.getByRole("button", { name: "Add API key", exact: true }).click();
    await card.getByLabel("Anthropic API key", { exact: true }).fill(key);
    await card.getByLabel("Anthropic API key", { exact: true }).press("Enter");
    await expect(card.locator(".provider-status")).toHaveText("Connected");
    await expect(card.getByLabel("Anthropic API key", { exact: true })).toHaveCount(0);
    const trigger = card.getByRole("button", { name: "Replace key", exact: true });
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(card.getByRole("button", { name: "Sign out of Anthropic API and remove credential", exact: true })).toBeVisible();
    expect([...secrets.values()].some((value) => value.includes(key))).toBe(true);
    expect(await page.content()).not.toContain(key);
  } finally { await app.close(); await fixture.close(); server.close(); }
});

test("Bedrock and Azure keys are saved with their Region or endpoint and deployments, which a later key replaces", async () => {
  const secrets = new Map<string, string>();
  const vault = { read: async (id: string) => secrets.get(id) ?? null, write: async (id: string, value: string) => { secrets.set(id, value); }, remove: async (id: string) => { secrets.delete(id); } };
  const fixture = await setupFixture({ platform: { models: { vault, hosted: {} } } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), bedrockKey = "ABSK-generated-bedrock-ui-key", azureKey = "generated-azure-ui-key";
    await openSettingsSection(page, "Providers");
    const bedrock = page.getByRole("region", { name: "Amazon Bedrock account", exact: true });
    await bedrock.getByRole("button", { name: "Add API key", exact: true }).click();
    await bedrock.getByLabel("Amazon Bedrock API key", { exact: true }).fill(bedrockKey);
    await expect(bedrock.getByRole("button", { name: "Save key", exact: true })).toBeDisabled();
    await bedrock.getByLabel("AWS Region", { exact: true }).fill("eu-west-1");
    await bedrock.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(bedrock.locator(".provider-status")).toHaveText("Connected");
    await expect(bedrock.locator(".provider-card-meta")).toContainText("in eu-west-1");
    await expect.poll(() => sdk.getState().snapshot!.settings.values.hostedProviderOptions?.bedrock).toEqual({ region: "eu-west-1" });

    const azure = page.getByRole("region", { name: "Azure OpenAI account", exact: true });
    await azure.getByRole("button", { name: "Add API key", exact: true }).click();
    await azure.getByLabel("Azure OpenAI API key", { exact: true }).fill(azureKey);
    await azure.getByLabel("Azure resource endpoint", { exact: true }).fill("https://generated-resource.openai.azure.com");
    await azure.getByLabel("Azure deployments", { exact: true }).fill("generated-prod=gpt-5.4\ngenerated-mini=gpt-4.1-mini");
    await azure.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(azure.locator(".provider-status")).toHaveText("Connected");
    await expect(azure.locator(".provider-card-meta")).toContainText("to generated-resource.openai.azure.com. 2 models selectable.");
    await expect.poll(() => sdk.getState().snapshot!.settings.values.hostedProviderOptions?.azure).toEqual({ endpoint: "https://generated-resource.openai.azure.com",
      deployments: [{ name: "generated-prod", model: "gpt-5.4" }, { name: "generated-mini", model: "gpt-4.1-mini" }] });

    // Replace key reopens the form with the saved details, so a new Region goes out with the new key.
    await bedrock.getByRole("button", { name: "Replace key", exact: true }).click();
    await expect(bedrock.getByLabel("AWS Region", { exact: true })).toHaveValue("eu-west-1");
    await bedrock.getByLabel("AWS Region", { exact: true }).fill("us-west-2");
    await bedrock.getByLabel("Amazon Bedrock API key", { exact: true }).fill(`${bedrockKey}-2`);
    await bedrock.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(bedrock.locator(".provider-card-meta")).toContainText("in us-west-2");
    const content = await page.content();
    for (const key of [bedrockKey, azureKey]) expect(content).not.toContain(key);
    await azure.getByRole("button", { name: "Sign out of Azure OpenAI and remove credential", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.settings.values.hostedProviderOptions?.azure).toBeUndefined();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
