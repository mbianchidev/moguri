import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Installer preferences use generated projects in hidden macOS windows.");

test("a finished session asks once per project whether to build its installer and saves the answer in project settings", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await writeFile(join(fixture.project, "package.json"), JSON.stringify({ scripts: { "package:mac": "electron-builder --mac", "dist:win": "electron-builder --win" } }));
  await fixture.configure(); await fixture.send("Generated finished task");
  await waitFor(() => fixture.session().status === "completed");
  const projectId = fixture.session().projectId, preferences = () => sdk.getState().snapshot!.projectConfigurations.find((entry) => entry.projectId === projectId)?.values.repo ?? {} as Record<string, unknown>;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const card = page.getByRole("region", { name: "Installer preference", exact: true });
    await expect(card).toContainText("Build an installer when work is done?");
    const command = card.getByRole("combobox", { name: "Installer command to use", exact: true });
    await expect(command.locator("option")).toHaveText(["npm run package:mac", "npm run dist:win"]);
    await card.getByRole("button", { name: "Build at the end", exact: true }).click();
    await expect.poll(() => [preferences().installers, preferences().installerCommand]).toEqual(["build", "npm run package:mac"]);
    await expect(card).toHaveCount(0);

    await openSettingsSection(page, "Project");
    await expect(page.getByRole("combobox", { name: "Installer when session work is done", exact: true })).toHaveValue("build");
    await expect(page.getByLabel("Installer command", { exact: true })).toHaveValue("npm run package:mac");
    await page.getByRole("combobox", { name: "Screenshots of UI changes", exact: true }).selectOption("off");
    await expect.poll(() => preferences().screenshots).toBe("off");
    await page.getByRole("combobox", { name: "Installer when session work is done", exact: true }).selectOption("ask");
    await expect.poll(() => preferences().installers).toBeUndefined();
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
