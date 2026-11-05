import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Retained activity navigation uses a generated hidden desktop.");

test("returning from Dashboard reuses unchanged owned activity and draft saves do not reload operations", async () => {
  const f = await setupFixture();
  await f.configure(); await f.send("generated tool: inspect the generated file."); await f.terminal();
  const query = f.service.controller.platform.query.bind(f.service.controller.platform);
  let reads = 0;
  f.service.controller.platform.query = async (...args: Parameters<typeof query>) => {
    if (args[0].type === "activity.list" && args[0].sessionId === f.sessionId) reads++;
    return query(...args);
  };
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), operations = page.getByRole("log", { name: "Session transcript", exact: true }).locator(".activity-row[data-kind='read-file']");
    await expect(operations).toBeVisible();
    await expect(page.getByText("Loading retained operations...", { exact: true })).toHaveCount(0);
    const initial = reads;
    expect(initial).toBeGreaterThan(0);
    const navigation = page.getByRole("navigation", { name: "Projects and sessions", exact: true });
    for (let index = 0; index < 3; index++) {
      await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Dashboard pages", exact: true })).toBeVisible();
      await navigation.getByRole("button", { name: f.session().title, exact: true }).click();
      await expect(operations).toBeVisible();
      expect(reads).toBe(initial);
    }
    await page.getByLabel("Prompt", { exact: true }).fill("Generated unrelated saved draft.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(reads).toBe(initial);
    expect(f.requests).toHaveLength(2);
  } finally { f.service.controller.platform.query = query; await app.close(); await f.close(); }
});
