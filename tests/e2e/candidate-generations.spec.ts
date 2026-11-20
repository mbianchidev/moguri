import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { candidateGenerationFixture, generatedCandidatePatch } from "../fixtures/candidate-generation-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native model-proposal clients are qualified on macOS.");

test("desktop explicitly meters one generated proposal and separately reviews staging and actual-user source application", async () => {
  const f = await candidateGenerationFixture(), index = await readFile(join(f.project, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByLabel("Candidate staging worktree", { exact: true }).selectOption(f.workspace.id);
    await panel.getByLabel("Candidate file path", { exact: true }).fill("fixture.txt"); await panel.getByRole("button", { name: "Load source file", exact: true }).click();
    await panel.getByText("Generate a proposal with a model", { exact: true }).click();
    await panel.getByLabel("Candidate generation task", { exact: true }).fill(f.input.task);
    await panel.getByRole("button", { name: "Review model generation", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact model generation review", exact: true });
    await expect(review.getByRole("button", { name: "Generate reviewed proposal", exact: true })).toBeDisabled(); expect(f.requests).toHaveLength(0);
    await review.getByLabel("Approve one generation call and proposal retention", { exact: true }).check();
    await review.getByRole("button", { name: "Generate reviewed proposal", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().candidateGenerations[0]?.status).toBe("proposed");
    const generation = f.service.controller.snapshot().candidateGenerations[0]!;
    await expect(panel.getByRole("region", { name: "Owned generation outcome", exact: true })).toContainText("Generated, not staged or accepted");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(await readFile(join(f.workspace.path, "fixture.txt"), "utf8")).toBe("generated original\n"); expect(f.requests).toHaveLength(1);
    await panel.getByRole("button", { name: "Load for review generated proposal", exact: true }).click();
    await expect(panel.getByLabel("Proposed file text", { exact: true })).toHaveValue(generatedCandidatePatch.edits[0]!.text);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/generated-candidate-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await page.screenshot({ path: resolve(".moguri/artifacts/generated-candidate-compact.png") });
    await panel.getByRole("button", { name: "Review staging", exact: true }).click();
    await panel.getByRole("button", { name: "Stage reviewed proposal", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().candidates[0]?.status).toBe("staged");
    expect(f.service.controller.snapshot().candidates[0]?.generationId).toBe(generation.id);
    await panel.getByRole("button", { name: "Review application to original source", exact: true }).click();
    await panel.getByRole("button", { name: "Apply reviewed files", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().candidates[0]?.status).toBe("applied");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe(generatedCandidatePatch.edits[0]!.text);
    expect(await readFile(join(f.project, ".git/index"))).toEqual(index); expect(f.requests).toHaveLength(1);
    expect(f.service.controller.snapshot().candidates[0]?.acceptance?.actor).toBe("user");
    await expect(panel.getByRole("button", { name: "Export candidate history", exact: true })).toBeEnabled();
    await openSettingsSection(page, "Artifacts");
    const artifacts = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await artifacts.getByLabel("Retained artifact", { exact: true }).selectOption(generation.id);
    await expect(artifacts.getByLabel("Artifact text", { exact: true })).toHaveAttribute("readonly", "");
    await artifacts.getByLabel("Artifact name", { exact: true }).fill("Generated immutable model proposal name");
    await artifacts.getByRole("button", { name: "Save artifact", exact: true }).click();
    await expect(artifacts).toContainText("Document saved"); expect(errors).toEqual([]);
    // Settings mounts every section of the page; let its saved state settle before closing so the unload guard sees no edit.
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
  } finally { await app.close(); await f.close(); }
});

test("a held generation review cannot spend in a changed read-only scope or discard the user's task", async () => {
  const f = await candidateGenerationFixture(); let held = false, release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), original = f.service.controller.platform.candidates.generationSource.bind(f.service.controller.platform.candidates);
  f.service.controller.platform.candidates.generationSource = async (...args) => { if (!held) { held = true; await gate; } return original(...args); };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByLabel("Candidate staging worktree", { exact: true }).selectOption(f.workspace.id);
    await panel.getByLabel("Candidate file path", { exact: true }).fill("fixture.txt"); await panel.getByRole("button", { name: "Load source file", exact: true }).click();
    await panel.getByText("Generate a proposal with a model", { exact: true }).click();
    await panel.getByLabel("Candidate generation task", { exact: true }).fill("Generated preserved task.");
    await panel.getByRole("button", { name: "Review model generation", exact: true }).click(); await expect.poll(() => held).toBe(true);
    await f.sdk.sessions.mode(f.sessionId, "read-only"); release();
    await expect(panel.getByLabel("Candidate generation task", { exact: true })).toHaveValue("Generated preserved task.");
    await expect(panel.getByRole("button", { name: "Generate reviewed proposal", exact: true })).toHaveCount(0); expect(f.requests).toHaveLength(0);
    await panel.getByRole("button", { name: "Discard generation task", exact: true }).click();
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  } finally { release(); f.service.controller.platform.candidates.generationSource = original; await app.close(); await f.close(); }
});
