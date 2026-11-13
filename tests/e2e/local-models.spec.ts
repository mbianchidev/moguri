import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openModelChoices } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop execution is qualified on macOS.");
test("local model setup is independent of Copilot and startup controls are inherited without rewriting sessions", async () => {
  const fixture = await setupFixture({ exposeModels: true, modelMetadata: { owned_by: "ds4.c", context_length: 32768 },
    usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42,
      prompt_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 } } });
  await fixture.provider.logout();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    expect(fixture.provider.state.status).toBe("disconnected");
    await expect(page.locator(".nav-footer").getByText("GitHub Copilot", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "Local models", exact: true }).click();
    await page.getByLabel("Local model endpoints", { exact: true }).fill(JSON.stringify([{ id: "generated-ui-local", name: "Generated local endpoint", enabled: true, baseUrl: `${fixture.baseUrl}/v1`, auth: "none", models: [{ id: fixture.modelId, name: "Generated local solver", contextWindow: fixture.contextWindow, maxTokens: 4096, imageInput: false }] }]));
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.provider.models.some((model) => model.source === "local")).toBe(true);
    expect(fixture.requests.length).toBe(0);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /Generated local solver/ }).click();
    await page.keyboard.press("Escape");
    await page.getByLabel("Prompt", { exact: true }).fill("Generated local desktop task.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.headers[0]).toBeUndefined();
    expect(fixture.session().usage[0]?.source).toBe("local");
    expect(fixture.session().usage[0]?.cacheWriteTokens).toBe(0);
    expect(fixture.provider.state.status).toBe("disconnected");
    await expect(page.locator(".nav-footer").getByText("GitHub Copilot", { exact: true })).toHaveCount(0);
    await page.getByRole("region", { name: "Assistant response", exact: true }).getByRole("button", { name: "Turn information", exact: true }).click();
    const info = page.getByRole("region", { name: "Turn information", exact: true });
    await info.getByText("Original turn details", { exact: true }).click();
    await expect(info).toContainText("10 read / 0 write");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await categories.getByRole("button", { name: "Startup defaults", exact: true }).click();
    await page.getByRole("button", { name: "Use current controls for this profile", exact: true }).click();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await categories.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByLabel("Project startup control overrides", { exact: true }).fill('{"modelOptions":{"contextWindow":16384}}');
    await page.getByRole("button", { name: "Save project settings", exact: true }).click();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("dialog", { name: "New", exact: true }).locator(".start-projects").getByRole("button").click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.length).toBe(2);
    const current = fixture.service.controller.snapshot().sessions.at(-1)!;
    expect(current.controls.modelId).toBe(fixture.session().controls.modelId);
    expect(current.controls.modelOptions?.contextWindow).toBe(16384);
    expect(current.defaults?.sources.modelId).toBe("profile");
    expect(current.defaults?.sources.modelOptions).toBe("project");
    expect(fixture.session().controls.modelOptions).toBeUndefined();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/local-model-inherited-session.png") });
    expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
