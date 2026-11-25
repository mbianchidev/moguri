import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { generatedStainless } from "../fixtures/stainless.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Stainless runs on macOS.");

test("Stainless stays off until enabled, checks a generated bundle and opens Local previews through the shared service", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "moguri-stainless-e2e-"))), opened: string[] = [];
  const fixture = await setupFixture({ platform: { stainless: { applications: [join(folder, "none")], open: async (_app, url) => { opened.push(url); } } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const bundle = await generatedStainless(folder);
    const page = await app.firstWindow();
    const prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeEnabled();
    await prompt.fill("/browser http://127.0.0.1:4173/");
    await prompt.press("Enter");
    await expect(page.getByLabel("Preview URL", { exact: true })).toHaveValue("http://127.0.0.1:4173/");
    const strip = page.getByLabel("Stainless", { exact: true });
    await expect(strip.getByRole("status")).toHaveText("Stainless is not installed.");
    await expect(strip.getByRole("button", { name: "Open in Stainless", exact: true })).toHaveCount(0);
    await strip.getByRole("button", { name: "Stainless settings", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Stainless", exact: true })).toBeVisible();
    const enabled = page.getByLabel("Use Stainless", { exact: true });
    await expect(enabled).not.toBeChecked();
    const check = page.getByRole("button", { name: "Check compatibility", exact: true });
    await expect(check).toBeDisabled();
    await page.getByLabel("Stainless app location", { exact: true }).fill(bundle);
    await page.getByRole("button", { name: "Save Stainless app location", exact: true }).click();
    await expect(page.getByRole("status", { name: "Stainless status", exact: true })).toHaveText(/is installed\. Turn it on/);
    await enabled.check();
    await expect.poll(() => sdk.settings.get()?.values.integrations?.stainless?.enabled).toBe(true);
    await expect(page.getByRole("status", { name: "Stainless status", exact: true })).toHaveText(/untested\. Run Check compatibility/);
    await check.click();
    await expect(page.getByRole("status", { name: "Stainless status", exact: true })).toHaveText(/is ready \(checked on this Mac\)\./, { timeout: ciTime(30_000) });
    expect((await sdk.stainless.status()).automation).toBe("ready");

    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(prompt).toBeVisible();
    await expect(page.getByLabel("Preview URL", { exact: true })).toBeVisible();
    const open = page.getByLabel("Stainless", { exact: true }).getByRole("button", { name: "Open in Stainless", exact: true });
    await open.click();
    await expect.poll(() => opened).toEqual(["http://127.0.0.1:4173/"]);
    expect(fixture.requests.length).toBe(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); await rm(folder, { recursive: true, force: true }); }
});
