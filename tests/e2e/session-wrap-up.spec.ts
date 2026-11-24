import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Wrap-up settings and suggestions use generated hidden macOS windows.");

test("wrap-up switches save immediately and a suggested skill improvement is reviewed in Suggestions", async () => {
  test.setTimeout(ciTime(60_000));
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const settings = () => sdk.getState().snapshot!.settings.values;
  await sdk.settings.update({ ...settings(), evolution: { enabled: true } }, sdk.getState().snapshot!.settings.revision);
  await fixture.configure(); await fixture.send("generated propose skill");
  await fixture.approve(); await fixture.terminal();
  await waitFor(() => sdk.getState().snapshot!.proposals.some((proposal) => proposal.status === "pending"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const nav = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await expect(nav.getByRole("button", { name: "Suggestions", exact: true })).toHaveAccessibleDescription("1 suggested improvement to review");
    await nav.getByRole("button", { name: "Suggestions", exact: true }).click();
    const proposals = page.getByRole("region", { name: "Suggested skill improvements", exact: true });
    await proposals.getByRole("button", { name: "Review skill generated-style", exact: true }).click();
    await expect(proposals.locator("pre")).toContainText("Prefer small typed functions.");
    const approve = proposals.getByRole("button", { name: "Approve disabled", exact: true });
    await expect(approve).toBeDisabled();
    await proposals.getByLabel("I reviewed this content. Approving it doesn't let it run.").check();
    await approve.click();
    await expect(proposals).toHaveCount(0);
    await expect.poll(() => sdk.getState().snapshot!.registry.some((entry) => entry.name === "generated-style" && entry.kind === "skill" && !entry.enabled)).toBe(true);

    await openSettingsSection(page, "GitHub");
    const section = page.getByRole("region", { name: "After each request", exact: true });
    const followUps = section.getByRole("switch", { name: "Follow up on new reviews and failed CI", exact: true });
    await expect(followUps).toBeChecked();
    await section.getByRole("switch", { name: "Wrap up when a request finishes", exact: true }).uncheck();
    await expect.poll(() => settings().wrapUp).toEqual({ enabled: false, followUps: true });
    await expect(followUps).toBeDisabled();
    await expect(section.getByRole("switch", { name: "Suggest skill improvements", exact: true })).toBeChecked();
    await openSettingsSection(page, "Providers");
    await page.getByRole("switch", { name: "Rename the chat when the topic changes", exact: true }).uncheck();
    await expect.poll(() => settings().chatTitles?.refresh).toBe(false);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
