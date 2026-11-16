import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { setupRemoteDecisions } from "../fixtures/decisions-api.ts";
import { remoteWinddownApiFixture } from "../fixtures/winddown-api.ts";
import { openSettingsSection } from "./navigation.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { MoguriError } from "../../packages/sdk/src/index.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Owned SSH/native model transports use generated macOS fixtures.");
test("hidden desktop retains actual SSH Kupo decision Env, role acknowledgement and provider actor without a Local worker label", async () => {
  const f = await setupRemoteDecisions(true);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await f.send("generated structured question choices only with hidden desktop SSH ownership");
    await expect.poll(async () => JSON.stringify({ status: f.service.controller.snapshot().decisions[0]?.status,
      session: f.session().status, diagnostic: f.session().lastError, queued: f.session().queue.length,
      captures: f.service.controller.snapshot().checkpointCaptures.map((capture) => ({ phase: capture.phase, status: capture.status, diagnostic: capture.diagnostic })),
      alerts: await page.getByRole("alert").allTextContents() })).toContain('"status":"applied"');
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
    await expect(panel.getByRole("button", { name: "Review accepted-work Git checkpoint", exact: true })).toBeDisabled();
    await expect(panel.getByLabel("Checkpoint new peer branch", { exact: true })).toBeVisible();
    await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, env: "Local", modelId: f.modelId });
    await expect(panel).toContainText("Env: Remote");
    await expect(panel.getByLabel("Checkpoint new local branch", { exact: true })).toHaveCount(0);
    expect(f.requests).toHaveLength(0); expect(f.solver.requests).toHaveLength(2); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

for (const lost of [false, true]) test(`hidden desktop separates SSH source acceptance, peer Git and ${lost ? "partial effect acknowledgement" : "completed publication"} while preserving index/HEAD`, async () => {
  const f = await remoteWinddownApiFixture(); expect(f.workspace).toBeTruthy();
  const git = initializeGeneratedRepository(f.workspace!);
  git(["config", "user.name", "Generated fixture"]); git(["config", "user.email", "fixture@example.invalid"]);
  const report = await f.run(); await writeFile(join(f.workspace!, "fixture.txt"), "Generated hidden peer accepted source.\n");
  const head = git(["rev-parse", "HEAD"]), index = await readFile(join(f.workspace!, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Budget wind-down checkpoints", exact: true });
    await panel.getByLabel("Retained budget checkpoint", { exact: true }).selectOption(report.winddown.id);
    await panel.getByLabel("Remote checkpoint source paths", { exact: true }).fill("fixture.txt");
    await panel.getByRole("button", { name: "Review peer source", exact: true }).click();
    const source = panel.getByRole("region", { name: "Exact peer source acceptance", exact: true });
    await expect(source).toContainText("Generated hidden peer accepted source.");
    await source.getByRole("button", { name: "Resume after source inspection", exact: true }).click();
    await source.getByLabel("Reviewed exact peer source", { exact: true }).check();
    await source.getByRole("button", { name: "Accept peer source", exact: true }).click();
    await expect(panel).toContainText("Actual user source acceptance:");
    await panel.getByLabel("Checkpoint new peer branch", { exact: true }).fill("moguri/generated-hidden-peer-checkpoint");
    await panel.getByRole("button", { name: "Review accepted-work Git checkpoint", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact accepted-work checkpoint Git review", exact: true });
    await expect(review).toContainText("original pinned SSH peer/root");
    await expect(review.getByRole("button", { name: "Commit on new branch from reviewed checkpoint", exact: true })).toBeDisabled();
    await review.getByLabel("Reviewed accepted-work checkpoint Git branch", { exact: true }).check();
    if (lost) {
      const original = f.service.controller.remote.checkpoint.bind(f.service.controller.remote);
      f.service.controller.remote.checkpoint = async (...args) => { await original(...args); throw new MoguriError("generated_lost_response", "Generated peer final response was lost.", 409); };
    }
    await review.getByRole("button", { name: "Commit on new branch from reviewed checkpoint", exact: true }).click();
    await expect.poll(() => f.sdk.winddown.list(f.sessionId)[0]?.status).toBe(lost ? "partial" : "completed");
    if (lost) {
      await expect(panel).toContainText("This original writer remains quarantined.");
      await panel.getByRole("button", { name: "Inspect original checkpoint effects", exact: true }).click();
      const inspection = panel.getByRole("region", { name: "Original checkpoint effect inspection", exact: true });
      await expect(inspection).toContainText("Current exact ref:");
      await expect(inspection.getByRole("button", { name: "Acknowledge original writer inspection", exact: true })).toBeDisabled();
      await inspection.getByLabel("Reviewed original checkpoint effects", { exact: true }).check();
      await inspection.getByRole("button", { name: "Acknowledge original writer inspection", exact: true }).click();
      await expect.poll(() => f.sdk.winddown.list(f.sessionId)[0]?.commit?.inspection?.actor).toBe("user");
      expect(f.sdk.winddown.list(f.sessionId)[0]?.status).toBe("partial"); expect(f.service.controller.ownedWriteRoots()).toEqual([]);
    }
    expect(git(["show", "moguri/generated-hidden-peer-checkpoint:fixture.txt"])).toBe("Generated hidden peer accepted source.");
    expect(git(["rev-parse", "HEAD"])).toBe(head); expect(await readFile(join(f.workspace!, ".git/index"))).toEqual(index);
    expect(f.requests).toHaveLength(0); expect(f.solver.requests).toHaveLength(2); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("hidden desktop leaves private native restaging off until the actual user enables and persists that policy", async () => {
  const f = await remoteWinddownApiFixture();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Confirmations");
    const policy = page.getByLabel("Allow exact private-snapshot restaging for native model retries", { exact: true });
    await expect(policy).not.toBeChecked(); await policy.check();
    await expect.poll(() => f.sdk.settings.get()!.values.interactions.nativeRetryRestaging).toBe(true);
    expect(f.requests).toHaveLength(0); expect(f.solver.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});
