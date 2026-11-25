import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Generated hidden desktop qualification is macOS-only.");

test("Local website settings manage real session, project and profile grants with concise actions and explicit errors", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Guardrails");
    const panel = page.getByRole("region", { name: "Local website allowlist", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("No websites are allowed yet.");
    const site = panel.getByRole("textbox", { name: "Allowed website", exact: true });
    const scope = panel.getByRole("combobox", { name: "Website allowance scope", exact: true });
    for (const [kind, value] of [["session", `session:${fixture.sessionId}`], ["project", `project:${fixture.session().projectId}`], ["global", "global"]] as const) {
      await site.fill(`${kind}.example.invalid`); await scope.selectOption(value);
      await panel.getByRole("button", { name: "Add", exact: true }).click();
      await expect(panel.getByRole("status")).toHaveText("Website added.");
      await expect(site).toHaveValue("");
    }
    await expect.poll(() => sdk.webAllowlist.list().length).toBe(3);
    expect(sdk.webAllowlist.list().map((entry) => entry.scope.kind)).toEqual(["session", "project", "global"]);
    await expect(panel).toContainText("Applies here");
    await site.fill("https://example.invalid/unreviewed-path");
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("exact");
    await expect(site).toHaveValue("https://example.invalid/unreviewed-path");
    expect(sdk.webAllowlist.list()).toHaveLength(3);
    await site.fill("");
    const remove = panel.getByRole("button", { name: /^Remove project\.example\.invalid/ });
    await expect(remove).toHaveText("");
    await remove.click();
    await expect.poll(() => sdk.webAllowlist.list().length).toBe(2);
    await expect(panel.getByRole("status")).toContainText("removed");
    await openSettingsSection(page, "General"); await openSettingsSection(page, "Guardrails");
    await expect(panel).toContainText("session.example.invalid");
    await expect(panel).toContainText("global.example.invalid");
    await expect(panel).not.toContainText("project.example.invalid");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(860, 680));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(860);
    expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/local-website-allowlist.png" });
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
