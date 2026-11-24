import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Getting started is qualified on macOS.");
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_ONBOARDING: "1" },
});

test("Getting started opens until finished, saves each answer as it goes and restarts from Settings", async () => {
  test.setTimeout(ciTime(120_000));
  const fixture = await setupFixture();
  const values = () => fixture.service.controller.snapshot().settings.values;
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    const setup = page.getByRole("region", { name: "Getting started" });
    await expect(setup).toBeVisible();
    await setup.getByRole("textbox", { name: "Your name" }).fill("  Generated User ");
    await setup.getByRole("button", { name: "Continue" }).click();
    await expect.poll(() => values().user?.name).toBe("Generated User");
    await expect(setup.getByText("Generated User, let's pick an accent color.")).toBeVisible();
    await setup.getByRole("radio", { name: "Amber" }).click();
    await expect.poll(() => values().appearance.palette).toBe("amber");
    await expect(setup.getByRole("radio", { name: "Amber" })).toHaveAttribute("aria-checked", "true");
    await setup.getByRole("button", { name: "Continue" }).click();
    await setup.getByRole("radio", { name: "Light" }).click();
    await expect.poll(() => values().appearance.theme).toBe("light");
    await setup.getByRole("button", { name: "Continue" }).click();
    await setup.getByRole("switch", { name: /Send the next queued prompt/ }).click();
    await expect.poll(() => values().interactions.autoSendQueue).toBe(false);
    await expect(setup.getByRole("switch", { name: /Send the next queued prompt/ })).not.toBeChecked();
    await setup.getByRole("button", { name: "Change accent color" }).click();
    await expect(setup.getByRole("radiogroup", { name: "Accent color" })).toBeVisible();
    for (let step = 0; step < 3; step++) await setup.getByRole("button", { name: "Continue" }).click();
    expect(values().onboarding).toBeUndefined();
    await setup.getByRole("button", { name: "Finish" }).click();
    await expect(setup).toHaveCount(0);
    await expect.poll(() => values().onboarding?.completedAt).toBeTruthy();
    const finished = values().onboarding!.completedAt;
    await expect(page.getByRole("heading", { name: "What are we working on, Generated User?" })).toBeVisible();

    await page.reload(); await waitForWorkspace(page);
    await expect(page.getByRole("heading", { name: "What are we working on, Generated User?" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const name = page.getByRole("textbox", { name: "Your name" });
    await expect(name).toHaveValue("Generated User");
    await name.fill("Generated Person");
    await expect(page.getByRole("button", { name: "Restart Getting started" })).toBeDisabled();
    await page.getByRole("button", { name: "Save your name" }).click();
    await expect.poll(() => values().user?.name).toBe("Generated Person");
    await expect(page.locator(".settings-toolbar")).toContainText("Saved");
    await page.getByRole("button", { name: "Restart Getting started" }).click();
    const restarted = page.getByRole("region", { name: "Getting started" });
    await expect(restarted.getByRole("textbox", { name: "Your name" })).toHaveValue("Generated Person");
    await restarted.getByRole("button", { name: "Skip setup" }).click();
    await expect(restarted).toHaveCount(0);
    await expect.poll(() => values().onboarding?.completedAt).not.toBe(finished);
    expect(values().user?.name).toBe("Generated Person");
  } finally { await app.close(); await fixture.close(); }
});
