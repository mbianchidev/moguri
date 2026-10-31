import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupRemoteDecisions } from "../fixtures/decisions-api.ts";
import { remoteWinddownApiFixture } from "../fixtures/winddown-api.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Owned SSH/native model transports use generated macOS fixtures.");
test("hidden desktop retains actual SSH Kupo decision Env, role acknowledgement and provider actor without a Local worker label", async () => {
  const f = await setupRemoteDecisions(true);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await f.send("generated structured question choices only with hidden desktop SSH ownership");
    await expect.poll(() => f.service.controller.snapshot().decisions[0]?.status).toBe("applied");
    await expect.poll(() => f.session().status).toBe("completed");
    await openSettingsSection(page, "Artifacts");
    const panel = page.getByRole("region", { name: "Decision-provider observations", exact: true });
    await expect(panel).toContainText("Remote"); await expect(panel).toContainText("owned-role-acknowledged");
    await expect(panel).toContainText(f.service.controller.snapshot().executions[0]!.id);
    await expect(panel).toContainText("decision-provider"); await expect(panel).toContainText(f.solverId);
    expect(f.requests).toHaveLength(2); expect(f.solver.requests).toHaveLength(1); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("hidden desktop never offers Local Git for a retained SSH finishing report, even after the session changes to Local", async () => {
  const f = await remoteWinddownApiFixture(), report = await f.run();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Budget wind-down checkpoints", exact: true });
    await panel.getByLabel("Retained budget checkpoint", { exact: true }).selectOption(report.winddown.id);
    await expect(panel).toContainText("Env: Remote"); await expect(panel).toContainText("Local checkpoint helpers cannot publish a different root");
    await expect(panel.getByLabel("Checkpoint new local branch", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Review accepted-work Git checkpoint", exact: true })).toHaveCount(0);
    await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, env: "Local", modelId: f.modelId });
    await expect(panel).toContainText("Env: Remote");
    await expect(panel.getByLabel("Checkpoint new local branch", { exact: true })).toHaveCount(0);
    expect(f.requests).toHaveLength(0); expect(f.solver.requests).toHaveLength(2); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});
