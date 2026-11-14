import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { routedFixture } from "../fixtures/single-routing.ts";
import { defaultSingleKupoSettings } from "../../packages/sdk/src/index.ts";
import { openModelChoices } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The native desktop worker is qualified on macOS.");
test("desktop explicitly approves Single policy, labels its real roles and blocks unqualified controls", async () => {
  const fixture = await routedFixture({ configured: false });
  await fixture.sdk.routing.configure(defaultSingleKupoSettings(), fixture.sdk.settings.get()!.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const composer = page.getByRole("form", { name: "Message composer" }), modelButton = composer.getByRole("button", { name: /^Model:/ });
    await modelButton.click();
    const models = page.getByRole("dialog", { name: "Model", exact: true });
    await expect((await openModelChoices(page)).getByRole("menuitemradio", { name: /^Kupo Unavailable/ })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await models.getByText("Model details and setup", { exact: true }).click();
    await models.getByRole("button", { name: "kupo Single settings", exact: true }).click();
    await expect(page.getByLabel("Enable kupo Single", { exact: true })).not.toBeChecked();
    await page.getByLabel("Enable kupo Single", { exact: true }).check();
    await page.getByLabel("kupo classifier", { exact: true }).selectOption(fixture.modelId);
    await page.getByLabel("Approve solver Generated routed solver", { exact: true }).check();
    await page.getByLabel("Allow hosted or network routing data", { exact: true }).check();
    await expect.poll(() => fixture.sdk.routing.policy()).toMatchObject({
      enabled: true, classifierModelId: fixture.modelId, approvedModelIds: [fixture.solverId], allowHosted: true,
    });
    expect(fixture.session().controls.modelId).toBeNull(); expect(fixture.requests.length).toBe(0); expect(fixture.solver.requests.length).toBe(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/kupo-single-policy.png") });
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await modelButton.click();
    const kupo = (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Kupo Moguri/ });
    await expect(kupo).toContainText("Moguri / separately metered router and solver");
    await expect(kupo).not.toContainText("GitHub Copilot");
    await kupo.click();
    await expect.poll(() => fixture.session().controls.modelId).toBe("kupo");
    await expect(models.getByRole("button", { name: "Working context window", exact: true })).toBeDisabled();
    await expect(models.getByRole("button", { name: "Thinking effort", exact: true })).toHaveCount(0);
    await expect(models.getByRole("button", { name: "Kupo routing preference", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await composer.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await budget.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    await expect(budget.getByLabel("session budget mode", { exact: true })).toBeDisabled();
    await expect(budget).toContainText("Profile/global caps still apply");
    await page.keyboard.press("Escape");
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated actual desktop Single task."); await composer.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests.length).toBe(1); expect(fixture.solver.requests.length).toBe(1);
    expect(fixture.session().usage.map((usage) => usage.role)).toEqual(["router", "solver"]);
    expect(fixture.session().messages.some((message) => message.role === "assistant" && message.text.includes('"pattern"'))).toBe(false);
    await prompt.fill("/insights"); await composer.getByRole("button", { name: "Run command", exact: true }).click();
    await page.getByText("Kupo routing provenance", { exact: true }).click();
    await expect(page.locator(".context-pane")).toContainText(fixture.solverId);
    await page.getByText("Per-call accounting", { exact: true }).click();
    await expect(page.locator(".call-record")).toHaveCount(2);
    await expect(page.locator(".call-record").first()).toContainText("router");
    await expect(page.locator(".call-record").last()).toContainText("solver");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await expect(page.locator(".message.notice.info")).toContainText("Kupo single plan: Generated routed solver.");
    const latest = page.getByRole("log", { name: "Session transcript", exact: true }).getByRole("article", { name: "Command /insights", exact: true });
    await expect.poll(() => latest.evaluate((element) => {
      const bounds = element.getBoundingClientRect(), viewport = element.closest(".timeline")!.getBoundingClientRect();
      return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    })).toBe(true);
    const answer = page.getByText("Generated routed solver answer.", { exact: true });
    await answer.scrollIntoViewIfNeeded(); await expect(answer).toBeInViewport();
    await page.screenshot({ path: resolve(".moguri/artifacts/kupo-single-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
