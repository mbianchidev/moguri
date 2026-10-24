import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { winddownApiFixture } from "../fixtures/winddown-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual Local finishing/Git lifecycle is qualified on macOS.");
test("desktop exposes qualified finite kupo and separately reviews actual-user accepted checkpoint bytes/new branch without another model or index/HEAD mutation", async () => {
  const f = await winddownApiFixture({ git: true }), accepted = await f.accept(), checkpoint = await f.run(); await f.unrelated(); expect(f.git).toBeTruthy();
  const index = await readFile(join(f.project, ".git/index")), head = f.git!(["rev-parse", "HEAD"]);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const composer = page.getByRole("form", { name: "Message composer" });
    await composer.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await budget.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    await expect(budget.getByLabel("session budget mode", { exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Candidates", exact: true }).click();
    const panel = page.getByRole("region", { name: "Budget wind-down checkpoints", exact: true });
    await panel.getByLabel("Retained budget checkpoint", { exact: true }).selectOption(checkpoint.winddown.id);
    await panel.getByLabel(`Include accepted checkpoint candidate ${accepted.candidate.id}`, { exact: true }).check();
    await panel.getByLabel("Checkpoint new local branch", { exact: true }).fill("moguri/generated-desktop-budget-checkpoint");
    await panel.getByLabel("Checkpoint commit message", { exact: true }).fill("chore: retain explicitly accepted desktop checkpoint");
    await panel.getByRole("button", { name: "Review accepted-work Git checkpoint", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact accepted-work checkpoint Git review", exact: true });
    await expect(review).toContainText(accepted.document.patch.edits[0]!.text.trim());
    await expect(review.getByRole("button", { name: "Create reviewed local checkpoint branch", exact: true })).toBeDisabled();
    await review.getByLabel("Reviewed accepted-work checkpoint Git branch", { exact: true }).check();
    await review.getByRole("button", { name: "Create reviewed local checkpoint branch", exact: true }).click();
    await expect.poll(() => f.sdk.winddown.list(f.sessionId)[0]?.status).toBe("completed");
    expect(f.git!(["rev-parse", "HEAD"])).toBe(head); expect(await readFile(join(f.project, ".git/index"))).toEqual(index);
    expect(f.requests).toHaveLength(1); expect(f.checkpoint.requests).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});
