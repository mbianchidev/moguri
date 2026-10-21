import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { candidateApiFixture } from "../fixtures/candidate-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native candidate clients are qualified on macOS.");

test("desktop stages source edits separately, applies only a fresh exact review and keeps candidate documents immutable", async () => {
  const f = await candidateApiFixture(), index = await readFile(join(f.project, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Candidates", exact: true }).click();
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByLabel("Candidate summary", { exact: true }).fill("Generated desktop reviewed change");
    await panel.getByLabel("Candidate staging worktree", { exact: true }).selectOption(f.workspace.id);
    await panel.getByLabel("Candidate file path", { exact: true }).fill("fixture.txt");
    await panel.getByRole("button", { name: "Load source file", exact: true }).click();
    await panel.getByLabel("Proposed file text", { exact: true }).fill("Generated desktop candidate bytes.\n");
    await panel.getByRole("button", { name: "Review staging", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Stage reviewed proposal", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Stage reviewed proposal", exact: true }).click();
    await expect.poll(() => f.sdk.getState().snapshot!.candidates[0]?.status).toBe("staged");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(await readFile(join(f.workspace.path, "fixture.txt"), "utf8")).toBe("Generated desktop candidate bytes.\n");
    await expect(panel).toContainText("Proposed, not accepted");
    await panel.getByRole("button", { name: "Review source application", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Apply reviewed files", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Apply reviewed files", exact: true }).click();
    await expect.poll(() => f.sdk.getState().snapshot!.candidates[0]?.status).toBe("applied");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("Generated desktop candidate bytes.\n");
    expect(await readFile(join(f.project, ".git/index"))).toEqual(index);
    const candidate = f.sdk.getState().snapshot!.candidates[0]!;
    expect(candidate.acceptance?.actor).toBe("user"); expect(f.requests).toHaveLength(0);
    await expect(panel.getByRole("button", { name: "Export candidate history", exact: true })).toBeEnabled();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/candidates-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/candidates-compact.png") });
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Artifacts", exact: true }).click();
    const artifacts = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await artifacts.getByLabel("Retained artifact", { exact: true }).selectOption(candidate.id);
    await expect(artifacts.getByLabel("Artifact text", { exact: true })).toHaveAttribute("readonly", "");
    await artifacts.getByLabel("Artifact name", { exact: true }).fill("Generated renamed immutable candidate");
    await artifacts.getByRole("button", { name: "Save artifact", exact: true }).click();
    await expect.poll(() => f.sdk.getState().snapshot!.artifacts.find((artifact) => artifact.id === candidate.id)?.revision).toBe(1);
    expect((await f.sdk.candidates.read(candidate.id)).candidate.documentDigest).toBe(candidate.documentDigest);
    expect(failures).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("a held desktop preview cannot stage into a changed read-only scope or discard unsaved proposed text", async () => {
  const f = await candidateApiFixture(); let held = false, release!: () => void, armed = false;
  const gate = new Promise<void>((resolve) => { release = resolve; }), original = f.service.controller.platform.managed.assert.bind(f.service.controller.platform.managed);
  f.service.controller.platform.managed.assert = async (...args) => { if (armed && !held) { held = true; await gate; } return original(...args); };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Candidates", exact: true }).click();
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByLabel("Candidate staging worktree", { exact: true }).selectOption(f.workspace.id);
    await panel.getByLabel("Candidate file path", { exact: true }).fill("fixture.txt");
    await panel.getByRole("button", { name: "Load source file", exact: true }).click();
    await panel.getByLabel("Proposed file text", { exact: true }).fill("Generated preserved unsaved proposal.\n");
    armed = true; await panel.getByRole("button", { name: "Review staging", exact: true }).click(); await expect.poll(() => held).toBe(true);
    await f.sdk.sessions.mode(f.sessionId, "read-only"); release();
    await expect(panel.getByLabel("Proposed file text", { exact: true })).toHaveValue("Generated preserved unsaved proposal.\n");
    await expect(panel.getByRole("button", { name: "Stage reviewed proposal", exact: true })).toBeDisabled();
    expect(f.sdk.getState().snapshot!.candidates).toHaveLength(0);
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n"); expect(f.requests).toHaveLength(0);
    await panel.getByRole("button", { name: "Discard local proposal", exact: true }).click();
    await expect(panel.getByLabel("Proposed file text", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    })).toBe(false);
  } finally { release(); f.service.controller.platform.managed.assert = original; await app.close(); await f.close(); }
});
