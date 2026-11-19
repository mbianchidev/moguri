import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk, withPrAutomationOverride } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Pull request automation settings use generated hidden macOS windows.");

test("automation defaults save immediately, list repository exceptions and open the repository's inherit/on/off overrides", async () => {
  test.setTimeout(60_000);
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const projectId = fixture.session().projectId;
  const settings = () => sdk.getState().snapshot!.settings.values;
  const repo = () => sdk.getState().snapshot!.projectConfigurations.find((value) => value.projectId === projectId)!.values.repo;
  const { configuration } = await sdk.projects.configuration(projectId);
  await sdk.projects.configure(projectId, withPrAutomationOverride(configuration.values, "conflictResolution", "enabled"), configuration.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "GitHub workflows");
    const section = page.getByRole("region", { name: "Pull request automation", exact: true });
    const ci = section.getByRole("switch", { name: "Fix broken CI", exact: true });
    await expect(ci).not.toBeChecked();
    await expect(section.getByRole("switch", { name: "Automatic conflict resolution", exact: true })).not.toBeChecked();
    await ci.check();
    await expect.poll(() => settings().prAutomation).toEqual({ ciRetry: true, conflictResolution: false });
    const exceptions = section.getByRole("list", { name: "Repository exceptions", exact: true });
    await expect(exceptions.getByRole("listitem")).toHaveCount(1);
    await expect(exceptions).toContainText("Automatic conflict resolution on (default is off)");
    await exceptions.getByRole("button", { name: "Open project settings", exact: true }).click();

    const conflicts = page.getByRole("combobox", { name: "Automatic conflict resolution", exact: true });
    await expect(conflicts).toHaveValue("enabled");
    await expect(page.getByRole("status").filter({ hasText: "Now: On (repository override)" })).toHaveCount(1);
    const retries = page.getByRole("combobox", { name: "Fix broken CI", exact: true });
    await expect(retries).toHaveValue("inherit");
    await expect(page.getByRole("status").filter({ hasText: "Now: On (global default)" })).toHaveCount(1);
    await retries.selectOption("disabled");
    await expect.poll(() => repo().ciRetry).toBe("disabled");
    await conflicts.selectOption("inherit");
    await expect.poll(() => Object.hasOwn(repo(), "conflictResolution")).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "Now: Off (global default)" })).toHaveCount(1);

    await openSettingsSection(page, "GitHub workflows");
    await expect(exceptions.getByRole("listitem")).toHaveCount(1);
    await expect(exceptions).toContainText("Fix broken CI off (default is on)");
    await section.getByRole("switch", { name: "Fix broken CI", exact: true }).uncheck();
    await expect.poll(() => settings().prAutomation?.ciRetry).toBe(false);
    await expect(exceptions).toContainText("Fix broken CI off (same as the default, kept as an override)");
    expect(repo().ciRetry).toBe("disabled");
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
