import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
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
      ["Claude Agent harness", "claude-code", "Disabled"], ["Codex Agent harness", "codex", "Disabled"],
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
    await expect(page.getByRole("region", { name: "Provider and model availability", exact: true }).locator('[data-provider-logo="github-copilot"]')).toHaveCount(1);

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
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).check();
    await expect(claude.getByLabel("Claude Code executable", { exact: true })).toBeVisible();
    await expect(claude.getByRole("combobox", { name: "Claude Agent transport", exact: true })).toHaveValue("sdk");
    await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
    await claude.getByRole("switch", { name: "Enable Claude Agent", exact: true }).uncheck();
    await expect(claude.getByLabel("Claude Code executable", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await expect.poll(() => sdk.getState().snapshot!.settings.values.claudeAgent?.enabled).toBe(false);

    await page.getByRole("region", { name: "Local model servers", exact: true }).getByRole("button", { name: "Configure local models", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Configured local models", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
