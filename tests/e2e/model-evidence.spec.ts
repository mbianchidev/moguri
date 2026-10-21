import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { modelEvidenceFixture } from "../fixtures/model-evidence-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Model evidence UI is qualified on macOS.");

test("desktop explicitly inspects provider claims without inference or changing its prompt/model and shows unknown family honestly", async () => {
  const f = await modelEvidenceFixture();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.getByLabel("Prompt", { exact: true }).fill("Generated draft survives metadata inspection.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const menu = page.getByRole("dialog", { name: "Model", exact: true });
    await menu.getByText("Provider-declared model metadata", { exact: true }).click();
    expect(f.reads()).toBe(0);
    await menu.getByRole("button", { name: "Read Copilot model declarations", exact: true }).click();
    const report = menu.getByRole("region", { name: "Provider-declared model evidence", exact: true });
    await expect(report).toContainText("generated-provider-declared-family");
    await expect(report).toContainText("not independently verified");
    expect(f.reads()).toBe(1); expect(f.requests).toHaveLength(0);
    await report.getByText("Exact observation and limits", { exact: true }).click();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/model-evidence-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await page.screenshot({ path: resolve(".moguri/artifacts/model-evidence-compact.png") });
    expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    f.catalogue({ data: [{ id: f.modelId, capabilities: { family: "x".repeat(256) }, vendor: "v".repeat(256), version: "1".repeat(256) }] });
    await menu.getByRole("button", { name: "Read Copilot model declarations", exact: true }).click();
    await expect(report).toContainText("x".repeat(256));
    expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    f.catalogue({ data: [{ id: f.modelId }] });
    await menu.getByRole("button", { name: "Read Copilot model declarations", exact: true }).click();
    await expect(report).toContainText("Provider family is unknown");
    await expect(report).not.toContainText("generated-provider-declared-family");
    expect(f.reads()).toBe(3); expect(f.session().controls.modelId).toBe(f.modelId); expect(f.requests).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated draft survives metadata inspection.");
    await expect.poll(() => f.session().draft.text).toBe("Generated draft survives metadata inspection.");
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
    expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("a held old-model evidence response cannot populate a changed model or erase the composer draft", async () => {
  const f = await modelEvidenceFixture(), gate = Promise.withResolvers<void>(); f.hold(gate.promise);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated held-inspection draft.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const menu = page.getByRole("dialog", { name: "Model", exact: true });
    await menu.getByText("Provider-declared model metadata", { exact: true }).click();
    await menu.getByRole("button", { name: "Read Copilot model declarations", exact: true }).click();
    await expect.poll(() => f.reads()).toBe(1);
    await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, modelId: null }, f.session().revision);
    gate.resolve();
    await expect(menu.getByRole("region", { name: "Provider-declared model evidence", exact: true })).toHaveCount(0);
    await expect(menu).toContainText("Choose an available concrete Copilot model");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated held-inspection draft.");
    await expect.poll(() => f.session().draft.text).toBe("Generated held-inspection draft.");
    expect(f.session().controls.modelId).toBeNull(); expect(f.requests).toHaveLength(0);
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  } finally { gate.resolve(); await app.close(); await f.close(); }
});
