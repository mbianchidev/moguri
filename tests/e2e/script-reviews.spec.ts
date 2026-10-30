import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptReviewFixture } from "../fixtures/script-review.ts";
import { focusByKeyboard } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual hidden desktop script review is qualified on macOS.");
test("unsafe findings require an explicit full-source user force and still cannot self-approve execution", async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  await fixture.send("Generated desktop unsafe script review."); await fixture.terminal();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), review = fixture.review()!, errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const panel = page.getByRole("region", { name: "Repository script reviews", exact: true });
    await panel.locator("summary").press("Enter");
    await expect(panel).toContainText("Agent assessment: unsafe");
    const read = panel.getByRole("button", { name: `Read full script review ${review.id}`, exact: true });
    await focusByKeyboard(read); await page.keyboard.press("Enter");
    await expect(panel.getByLabel(`Complete reviewed script ${review.id}`, { exact: true })).toHaveText(fixture.source);
    const force = panel.getByRole("button", { name: "Force unsafe script under normal policy", exact: true });
    await expect(force).toBeDisabled();
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toHaveCount(0);
    const checkbox = panel.getByRole("checkbox");
    await focusByKeyboard(checkbox); await page.keyboard.press("Space");
    await focusByKeyboard(force); await page.keyboard.press("Enter");
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toContainText("run_script");
    await expect(approval).toContainText("without sandbox isolation");
    await expect(approval.getByLabel("Tool matching", { exact: true })).toHaveCount(0);
    await expect.poll(() => fixture.review()?.force?.actor).toBe("user");
    await expect(access(join(fixture.project, "generated-script-result.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    await approval.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect(async () => { expect(await readFile(join(fixture.project, "generated-script-result.txt"), "utf8")).toBe("GENERATED_FORCED_RUN"); }).toPass();
    await expect(approval).toHaveCount(0);
    await expect(panel).toContainText("One original attempt is retained");
    expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
