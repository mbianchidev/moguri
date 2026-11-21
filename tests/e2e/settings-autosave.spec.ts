import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openKupoAdvanced, openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Settings choices use generated hidden macOS windows.");

test("settings choices save as soon as they change, without the toolbar Save", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [], values = () => sdk.getState().snapshot!.settings.values;
    const toolbar = page.locator(".settings-toolbar").getByRole("status"), save = page.getByRole("button", { name: "Save settings", exact: true });
    page.on("pageerror", (error) => errors.push(error.message));

    await openSettingsSection(page, "Confirmations");
    await page.getByLabel("Ask before attaching content from a session", { exact: true }).uncheck();
    await expect.poll(() => values().interactions.confirmSessionAttachments).toBe(false);
    await page.getByLabel("Scheduling in an idle chat", { exact: true }).selectOption("schedule");
    await expect.poll(() => values().interactions.idleScheduleAction).toBe("schedule");
    await expect(toolbar).toHaveText("Saved"); await expect(save).toBeDisabled();

    await openSettingsSection(page, "Providers");
    await page.getByRole("switch", { name: "Summarize new chat topics automatically", exact: true }).uncheck();
    await expect.poll(() => values().chatTitles).toEqual({ enabled: false, modelId: null });
    await page.getByLabel("Chat naming model", { exact: true }).selectOption(fixture.modelId);
    await expect.poll(() => values().chatTitles).toEqual({ enabled: false, modelId: fixture.modelId });
    await expect(toolbar).toHaveText("Saved");

    await openSettingsSection(page, "Kupo routing");
    await openKupoAdvanced(page);
    await page.getByLabel("kupo workflow", { exact: true }).selectOption("single");
    await expect.poll(() => values().kupo.workflow).toBe("single");
    const threshold = page.getByLabel("Classifier confidence threshold", { exact: true }), before = values().kupo.minimumConfidence;
    await threshold.focus(); await page.keyboard.press("ArrowRight");
    await expect.poll(() => values().kupo.minimumConfidence).toBeCloseTo(before + 0.01, 5);
    await expect(page.getByRole("button", { name: "Save routing threshold", exact: true })).toHaveCount(0);
    await expect(toolbar).toHaveText("Saved");

    await page.locator(`.project-name[data-project-id="${fixture.session().projectId}"]`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const board = page.getByRole("region", { name: "Board configuration", exact: true });
    await board.getByLabel("GitHub backlog column", { exact: true }).selectOption("review");
    await expect.poll(() => fixture.service.controller.snapshot().boards.find((entry) => entry.projectId === fixture.session().projectId)?.githubSync?.phases.backlog).toBe("review");
    await expect(board.getByRole("button", { name: "Save GitHub mapping", exact: true })).toHaveCount(0);
    await expect(board.getByRole("status")).toHaveText("Saved. Your other unsaved edits are kept.");
    await expect(toolbar).toHaveText("Saved");
    expect(fixture.requests).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
