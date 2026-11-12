import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { candidateApiFixture } from "../fixtures/candidate-api.ts";
import { PROTOCOL_VERSION, type CandidateTransportRecord } from "../../packages/sdk/src/index.ts";
import { digest } from "../../apps/service/src/store.ts";
import { startService } from "../../apps/service/src/server.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native candidate clients are qualified on macOS.");

test("recovered partial peer status cannot masquerade as an acknowledged terminal frame", async () => {
  const f = await candidateApiFixture(), id = randomUUID(), hash = "a".repeat(64), resultDigest = f.service.store.putBlob("Generated retained partial result.");
  const initial: CandidateTransportRecord = { version: 1, id, ownerId: "generated-read", ownerKind: "read", profileId: "default",
    sessionId: f.sessionId, projectId: f.session().projectId, operationDigest: hash, authorityDigest: hash,
    boundary: { env: "Remote", sourceRoot: "/generated/original-peer", workerDigest: hash, configurationDigest: hash, peerDigest: hash },
    launchJson: JSON.stringify({ kind: "Remote" }), observationJson: null, revision: 0, sequence: 0,
    status: "running", resultDigest: null, stopRequested: false, terminalAcknowledged: false, cleanupConfirmed: false, diagnostic: null };
  const partial = { ...initial, revision: 1, status: "partial" as const, sequence: 5, diagnostic: "Generated original terminal ACK was lost." };
  const recovered: CandidateTransportRecord = { ...partial, revision: 2, sequence: 8, resultDigest, cleanupConfirmed: true,
    recovery: { version: 1, actor: "user", commandId: randomUUID(), commandDigest: hash, inspectedAt: new Date().toISOString(),
      evidence: { version: 1, fromSequence: 5, resultDigest,
        journal: { runId: id, root: initial.boundary.sourceRoot, workerDigest: hash, protocol: PROTOCOL_VERSION, workerPid: 123,
          acknowledged: 5, sequence: 8, status: "partial", cleanup: "owned-worker-stopped", proof: hash },
        frames: [{ sequence: 6, digest: hash, kind: "candidate.complete" }, { sequence: 7, digest: hash, kind: "ack" },
          { sequence: 8, digest: digest("Generated original partial terminal."), kind: "finished" }],
        terminal: { source: "frame", originalAcknowledged: false, peerAcknowledged: true, outcome: "partial",
          sequence: 8, digest: digest("Generated original partial terminal."), requestId: "generated-terminal" } } } };
  for (const transport of [initial, partial, recovered]) f.service.store.commit([{ event_type: "candidate.transport_recorded",
    profile_id: "default", project_id: f.session().projectId, session_id: f.sessionId, payload: { transport } }]);
  const stateDir = dirname(f.service.store.path);
  f.sdk.disconnect(); await f.service.close();
  const service = await startService({ stateDir, provider: f.provider, retentionKey: f.retentionKey,
    platform: { terminal: { defaultRoot: f.home, vault: f.terminalVault } } });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" } });
    const page = await app.firstWindow();
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Original candidate transport recovery", exact: true });
    await panel.getByLabel("Retained candidate transport", { exact: true }).selectOption(id);
    await expect(panel).toContainText("Original controller terminal-ACK event: false");
    await expect(panel).toContainText("Original peer status: partial");
    await expect(panel).toContainText("Peer ACK cursor: 5/8");
    await expect(panel).toContainText("Retained terminal frame: 8");
    await expect(panel).not.toContainText("Original peer terminal ACK: true");
    await expect(panel.getByRole("button", { name: "Reconcile original receipts read-only", exact: true })).toBeDisabled();
    expect(service.controller.snapshot().budgetEntries).toHaveLength(0); expect(f.requests).toHaveLength(0);
  } finally { try { await app?.close(); } finally { try { await service.close(); } finally { await f.close(); } } }
});

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
