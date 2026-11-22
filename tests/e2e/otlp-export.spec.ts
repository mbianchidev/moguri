import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native OTLP settings are qualified on macOS.");

test("desktop requires exact metadata review, retains concurrent edits and shares profile configuration with the SDK", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const enabled = page.getByLabel("Enable metadata-only OTLP export", { exact: true });
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await page.getByLabel("OTLP collector origin", { exact: true }).fill("http://127.0.0.1:4318");
    await page.getByLabel("OTLP trace sampling ratio", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "Review metadata export", exact: true }).click();
    const apply = page.getByRole("button", { name: "Apply export settings", exact: true });
    await expect(apply).toBeDisabled();
    expect((await sdk.telemetry.export.status()).configuration.enabled).toBe(false);
    await page.getByLabel("I reviewed this collector and want to send this profile's metadata to it", { exact: true }).check();
    await apply.click();
    await expect(page.getByText("Export settings saved", { exact: true })).toBeVisible();
    const saved = (await sdk.telemetry.export.status()).configuration;
    expect(saved.enabled).toBe(true); expect(saved.samplingRatio).toBe(0.5);
    await page.getByLabel("OTLP collector origin", { exact: true }).fill("http://127.0.0.1:4319");
    await sdk.telemetry.export.apply((await sdk.telemetry.export.review({ enabled: false, endpoint: saved.endpoint, samplingRatio: 0.5 })).review);
    await expect(page.getByText(/Another client changed export settings/)).toBeVisible();
    await expect(page.getByLabel("OTLP collector origin", { exact: true })).toHaveValue("http://127.0.0.1:4319");
    await page.getByRole("button", { name: "Reload saved export settings", exact: true }).click();
    await expect(enabled).not.toBeChecked();
    await expect(page.getByLabel("OTLP collector origin", { exact: true })).toHaveValue("http://127.0.0.1:4318");
    expect(fixture.requests.length).toBe(0);
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("desktop reviews the log signal and credential header names, then stores each value only in the profile's secret backend", async () => {
  const secrets = new Map<string, string>(), vault = { read: async (id: string) => secrets.get(id) ?? null,
    write: async (id: string, value: string) => { secrets.set(id, value); }, remove: async (id: string) => { secrets.delete(id); } };
  const fixture = await setupFixture({ platform: { telemetry: { vault } } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("OTLP collector origin", { exact: true }).fill("http://127.0.0.1:4318");
    await page.getByLabel("Also send diagnostic logs", { exact: true }).check();
    await page.getByLabel("OTLP credential header names", { exact: true }).fill("Authorization");
    await page.getByRole("button", { name: "Review metadata export", exact: true }).click();
    await expect(page.getByText(/Sends traces, metrics, logs\..*Credential headers: authorization\./)).toBeVisible();
    await page.getByLabel("I reviewed this collector and want to send this profile's metadata to it", { exact: true }).check();
    await page.getByRole("button", { name: "Apply export settings", exact: true }).click();
    await expect(page.getByText("Export settings saved", { exact: true })).toBeVisible();
    const value = page.getByLabel("OTLP authorization value", { exact: true });
    await expect(value).toHaveAttribute("type", "password");
    await value.fill("Bearer GENERATED_PRIVATE_DESKTOP_TOKEN");
    await page.getByRole("button", { name: "Save authorization value", exact: true }).click();
    await expect(page.getByText("authorization (stored)", { exact: true })).toBeVisible();
    await expect(value).toHaveValue("");
    expect([...secrets.values()]).toEqual(["Bearer GENERATED_PRIVATE_DESKTOP_TOKEN"]);
    const status = await sdk.telemetry.export.status();
    expect(status.configuration.logs).toBe(true); expect(status.headers).toEqual([{ name: "authorization", stored: true }]);
    expect(JSON.stringify(fixture.service.controller.events(0)).includes("GENERATED_PRIVATE_DESKTOP_TOKEN")).toBe(false);
    expect(fixture.requests.length).toBe(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
