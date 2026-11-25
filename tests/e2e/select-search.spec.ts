import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Generated dropdown search runs hidden on macOS.");

test("dropdowns with more than seven choices search, choose by keyboard and keep the field information beside its title", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const ids = new Map<string, string>();
  for (const name of ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"]) {
    const path = join(fixture.directory, `generated-${name}`); await mkdir(path);
    ids.set(name, (await sdk.command({ type: "project.add", path })).id!);
  }
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Project");
    const select = page.getByRole("combobox", { name: "Configuration project", exact: true });
    const row = page.locator(".settings-help-row").filter({ has: select });
    const title = await row.locator(".setting-field-title").boundingBox(), info = await row.getByRole("button", { name: "About configuration projects", exact: true }).boundingBox();
    expect(info!.x - title!.x - title!.width).toBeGreaterThanOrEqual(0); expect(info!.x - title!.x - title!.width).toBeLessThanOrEqual(12);
    expect(Math.abs(info!.y + info!.height / 2 - title!.y - title!.height / 2)).toBeLessThanOrEqual(2);

    await select.click();
    const search = page.getByRole("combobox", { name: "Search Configuration project", exact: true });
    const list = page.getByRole("listbox", { name: "Configuration project", exact: true });
    await expect(search).toBeFocused(); await expect(list.getByRole("option")).toHaveCount(11);
    await search.fill("HOTEL");
    await expect(list.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(list).toHaveCount(0); await expect(select).toHaveValue(ids.get("hotel")!);
    await expect(page.getByRole("heading", { name: "generated-hotel", exact: true })).toBeVisible();

    await expect(select).toBeEnabled(); await select.focus(); await page.keyboard.press("ArrowDown");
    await expect(search).toBeFocused(); await search.fill("generated-no-such-project");
    await expect(page.getByRole("status").filter({ hasText: "No matches" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0); await expect(select).toBeFocused(); await expect(select).toHaveValue(ids.get("hotel")!);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await expect(select).toBeEnabled(); await select.focus(); await page.keyboard.press("d");
    await expect(search).toHaveValue("d");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(select).not.toHaveValue(ids.get("hotel")!);

    const short = page.getByRole("combobox", { name: "Continue work from", exact: true });
    expect(await short.evaluate((element) => element.querySelectorAll("option:not(:disabled)").length)).toBeLessThanOrEqual(7);
    expect(await short.evaluate((element) => element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })))).toBe(true);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
