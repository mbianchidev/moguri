import { _electron as electron, expect, test } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native skill trust settings are qualified on macOS.");

test("desktop saves and blocks publisher keys, blocks one version and saves the script risk switch on change", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    await openSettingsSection(page, "Skills");
    await page.getByLabel("Saved publisher name", { exact: true }).fill("Generated desktop publisher");
    await page.getByLabel("Saved publisher public key", { exact: true }).fill(publicKey);
    const save = page.getByRole("button", { name: "Save publisher key", exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel("I got this key from the publisher through a channel I trust", { exact: true }).check();
    await save.click();
    await expect(page.getByText("Publisher key saved.", { exact: true })).toBeVisible();
    await sdk.refresh();
    const [saved] = sdk.getState().snapshot!.skillPublishers;
    expect(saved?.identity).toBe("Generated desktop publisher");
    await page.getByRole("button", { name: "Block publisher key Generated desktop publisher", exact: true }).click();
    const reason = page.getByLabel("Block reason", { exact: true });
    await reason.fill("Generated compromised key");
    await page.getByRole("button", { name: "Block key", exact: true }).click();
    await expect(page.getByText("Publisher key blocked.", { exact: true })).toBeVisible();
    await page.getByLabel("Skill version digest to block", { exact: true }).fill("b".repeat(64));
    await page.getByRole("button", { name: "Block this version", exact: true }).click();
    await page.getByLabel("Block reason", { exact: true }).fill("Generated withdrawn version");
    await page.getByRole("button", { name: "Block version", exact: true }).click();
    await expect(page.getByText("Skill version blocked.", { exact: true })).toBeVisible();
    await sdk.refresh();
    expect(sdk.getState().snapshot!.skillTrustBlocks.map((block) => [block.kind, block.digest])).toEqual([["key", saved!.fingerprint], ["artifact", "b".repeat(64)]]);

    await openSettingsSection(page, "Scripts");
    const risk = page.getByLabel("Let the agent approve scripts with download or decode findings", { exact: true });
    await expect(risk).not.toBeChecked();
    await risk.check();
    await expect.poll(async () => { await sdk.refresh(); return sdk.settings.get()?.values.scriptReview?.acceptScannerRisk; }).toBe(true);
    // Settings mounts every section of the page; let its saved state settle before closing so the unload guard sees no edit.
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
