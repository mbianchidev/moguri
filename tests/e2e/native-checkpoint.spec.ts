import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { nativeConfiguration } from "../fixtures/native-target.ts";
import { nativeCheckpointFixture } from "../fixtures/native-checkpoint.ts";
import { openSettingsSection } from "./navigation.ts";
import { join } from "node:path";

const require = createRequire(import.meta.url), configuration = await nativeConfiguration();
test("hidden desktop publishes separately accepted native work only through its disclosed original Local-Git review", async () => {
  test.skip(!configuration, "Provide the exact generated native installation/workload receipts; a skipped case is not native qualification.");
  if (!configuration) return;
  const f = await nativeCheckpointFixture(configuration);
  let passed = false, app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const accepted = await f.accept(), head = f.git(["rev-parse", "HEAD"]), index = await readFile(join(f.project, ".git/index"));
    app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: f.state, MOGURI_TEST_WINDOW: "hidden" } });
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Budget wind-down checkpoints", exact: true });
    await panel.getByLabel("Retained budget checkpoint", { exact: true }).selectOption(f.record.id);
    await expect(panel).toContainText("Env: Sandbox");
    await expect(panel.getByLabel("Checkpoint new peer branch", { exact: true })).toHaveCount(0);
    await panel.getByLabel(`Include accepted native publication ${accepted.publication.id}`, { exact: true }).check();
    await panel.getByLabel("Checkpoint new local branch", { exact: true }).fill("moguri/generated-hidden-native-checkpoint");
    await panel.getByRole("button", { name: "Review accepted-work Git checkpoint", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact accepted-work checkpoint Git review", exact: true });
    await expect(review).toContainText("native-model work"); await expect(review).toContainText("Local Git on its original repository");
    await expect(review).toContainText(f.project);
    await expect(review.getByRole("button", { name: "Commit on new branch from reviewed checkpoint", exact: true })).toBeDisabled();
    await review.getByLabel("Reviewed accepted-work checkpoint Git branch", { exact: true }).check();
    await review.getByRole("button", { name: "Commit on new branch from reviewed checkpoint", exact: true }).click();
    await expect.poll(() => f.sdk.winddown.list(f.sessionId)[0]?.status).toBe("completed");
    expect(f.git(["show", "moguri/generated-hidden-native-checkpoint:fixture.txt"])).toBe("Generated separately accepted native checkpoint bytes.");
    expect(f.git(["rev-parse", "HEAD"])).toBe(head); expect(await readFile(join(f.project, ".git/index"))).toEqual(index);
    expect(f.provider.requests).toHaveLength(0); expect(errors).toEqual([]); passed = true;
  } finally { try { await app?.close(); } finally { await f.close(passed); } }
});
