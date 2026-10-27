import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { candidateApiFixture } from "../fixtures/candidate-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native candidate clients are qualified on macOS.");

test("candidate creation stays disabled for plain folders and project-free chats after a Git project was selected", async () => {
  const f = await candidateApiFixture(), folder = join(f.directory, "generated-folder");
  await mkdir(folder); await writeFile(join(folder, "fixture.txt"), "Generated folder-only file.\n");
  const project = await f.sdk.command({ type: "project.add", path: folder });
  const plain = await f.sdk.sessions.create(project.id!, "Generated folder source"), free = await f.sdk.sessions.create(null, "Generated project-free source");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Candidates");
    const source = page.getByLabel("Settings source chat", { exact: true }), panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await source.selectOption(f.sessionId);
    await expect(panel.getByLabel("Candidate summary", { exact: true })).toBeEnabled();
    for (const sessionId of [plain.id!, free.id!]) {
      await source.selectOption(sessionId);
      await expect(panel.getByLabel("Candidate summary", { exact: true })).toBeDisabled();
      await expect(panel.getByRole("button", { name: "Load source file", exact: true })).toBeDisabled();
      await expect(panel.getByRole("button", { name: "Review compound input", exact: true })).toBeDisabled();
      await expect(panel).toContainText(/Git-backed project|exact Git working tree|project session/);
    }
    expect(f.service.controller.snapshot().candidates).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("desktop retries a failed permanent cleanup after preserving an unsent edit without admitting another candidate", async () => {
  const f = await candidateApiFixture(), candidate = await f.stage(), title = f.session().title;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: title, exact: true }).click();
    f.service.store.db.exec(`CREATE TRIGGER generated_desktop_cleanup_failure BEFORE INSERT ON events
      WHEN json_extract(NEW.data,'$.event_type')='session.deleted'
      BEGIN SELECT RAISE(ABORT,'Generated desktop cleanup failure'); END;`);
    const deletion = page.getByRole("dialog", { name: "Delete session", exact: true });
    const requestDeletion = async () => {
      await page.getByRole("button", { name: title, exact: true }).click({ button: "right" });
      await page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true }).click();
      await deletion.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
      await deletion.getByRole("button", { name: "Delete session", exact: true }).click();
    };
    await requestDeletion();
    await expect(deletion.getByRole("alert")).toContainText("Deletion is incomplete");
    expect((await f.sdk.candidates.read(candidate.candidate.id)).candidate.status).toBe("staged");
    await deletion.getByRole("button", { name: "Cancel deletion", exact: true }).click();
    f.service.store.db.exec("DROP TRIGGER generated_desktop_cleanup_failure");
    await page.getByLabel("Prompt", { exact: true }).fill("Generated unsent cleanup retry edit.");
    await expect.poll(() => f.session().draft.text).toBe("Generated unsent cleanup retry edit.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await requestDeletion();
    await expect(deletion).toHaveCount(0);
    await expect.poll(() => f.service.controller.snapshot().sessions.some((session) => session.id === f.sessionId)).toBe(false);
    expect(f.service.controller.snapshot().candidates).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("desktop stages source edits separately, applies only a fresh exact review and keeps candidate documents immutable", async () => {
  const f = await candidateApiFixture(), index = await readFile(join(f.project, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByLabel("Candidate summary", { exact: true }).fill("Generated desktop reviewed change");
    await panel.getByLabel("Candidate staging worktree", { exact: true }).selectOption(f.workspace.id);
    await panel.getByLabel("Candidate file path", { exact: true }).fill("fixture.txt");
    await panel.getByRole("button", { name: "Load source file", exact: true }).click();
    const remove = panel.getByRole("button", { name: "Remove file from proposal", exact: true });
    await expect(remove).toHaveText(""); await expect(remove.locator("svg[data-icon='Trash']")).toBeVisible();
    await remove.click(); await expect(panel.getByLabel("Proposed file text", { exact: true })).toHaveCount(0);
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
    await panel.getByRole("button", { name: "Review application to original source", exact: true }).click();
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
    await openSettingsSection(page, "Artifacts");
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
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
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
