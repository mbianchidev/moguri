import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isRecord, MoguriError, MoguriSdk, sessionTitle } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";
import { finishIdleSchedule } from "./navigation.ts";

const require = createRequire(import.meta.url);
const recoveryFixture = () => setupFixture({ workerPath: resolve(".moguri/artifacts/generated-resume-missing-worker.mjs") });
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Composer recovery is qualified with generated hidden macOS fixtures.");

async function pauseSession(sdk: MoguriSdk, sessionId: string, modelId: string) {
  const current = () => sdk.getState().snapshot!.sessions.find((entry) => entry.id === sessionId)!;
  await sdk.sessions.configure(sessionId, { ...current().controls, modelId }, current().revision);
  await sdk.command({ type: "draft.save", sessionId, expectedRevision: current().draft.revision, text: "Generated unconfirmed worker startup.", attachments: [] });
  await sdk.command({ type: "message.send", sessionId, expectedRevision: current().draft.revision, delivery: "queue" });
  await waitFor(() => !current().turnId && current().status === "partial");
  const snapshot = sdk.getState().snapshot!, session = current();
  if (session.workspaceId) expect(snapshot.blockedWorkspaces).toContain(session.workspaceId);
  else if (session.projectId) expect(snapshot.blockedProjects).toContain(session.projectId);
  else expect(snapshot.blockedSessions).toContain(session.id);
  return current;
}

for (const scope of ["project root", "project-free chat", "shared project root", "managed worktree"] as const) {
  test(`blocked ${scope} uses the primary Resume control without sending a prompt`, async () => {
    const fixture = await recoveryFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
    let app: ElectronApplication | undefined;
    try {
      let sourceId = fixture.sessionId;
      if (scope === "project-free chat") sourceId = (await sdk.sessions.create(null, "Generated isolated recovery")).id!;
      if (scope === "managed worktree") {
        initializeGeneratedRepository(fixture.project);
        const workspace = await sdk.workspaces.wait((await sdk.workspaces.create(fixture.session().projectId, "moguri/generated-recovery")).id!);
        sourceId = (await sdk.sessions.create(fixture.session().projectId, "Generated worktree recovery", undefined, workspace.id)).id!;
      }
      const source = await pauseSession(sdk, sourceId, fixture.modelId);
      const targetId = scope === "shared project root" ?
        (await sdk.sessions.create(fixture.session().projectId, "Generated same-root recovery")).id! : sourceId;
      const current = () => sdk.getState().snapshot!.sessions.find((entry) => entry.id === targetId)!;
      expect(fixture.requests).toHaveLength(0);
      app = await launch(fixture.directory);
      const page = await app.firstWindow();
      await expect(page.getByRole("form", { name: "Message composer", exact: true })).toBeVisible();
      if (targetId !== fixture.sessionId) {
        if (scope === "project-free chat" || scope === "managed worktree") await expect(page.getByRole("button", { name: "Resume", exact: true })).toHaveCount(0);
        await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: current().title, exact: true }).click();
      }
      await expect(page.getByRole("heading", { name: sessionTitle(current()), exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Resume after inspection", exact: true })).toHaveCount(0);
      const composer = page.getByRole("form", { name: "Message composer", exact: true }), resume = composer.getByRole("button", { name: "Resume", exact: true });
      await expect(resume).toBeEnabled(); await expect(resume).toHaveText("Resume");
      await expect(resume.locator("svg")).toHaveAttribute("data-icon", "Play");
      await expect(composer.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
      if (scope === "project root") {
        await mkdir(".moguri/artifacts", { recursive: true });
        await composer.screenshot({ path: ".moguri/artifacts/desktop-composer-resume.png" });
      }
      if (scope === "project-free chat") await page.getByLabel("Prompt", { exact: true }).press("Enter"); else await resume.click();
      await expect(resume).toHaveCount(0);
      await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
      await sdk.refresh();
      const snapshot = sdk.getState().snapshot!;
      expect(snapshot.blockedSessions).not.toContain(targetId);
      if (source().workspaceId) expect(snapshot.blockedWorkspaces).not.toContain(source().workspaceId);
      else if (source().projectId) expect(snapshot.blockedProjects).not.toContain(source().projectId);
      expect(current().draft.text).toBe(""); expect(current().queue).toHaveLength(0);
      expect(fixture.requests).toHaveLength(0);
      expect(fixture.service.controller.events(0).filter((event) => event.event_type === "session.resumed").at(-1)?.session_id).toBe(targetId);
    } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
  });
}

test("a pending or refused Resume preserves edited draft/context, admits once and retries only after an explicit action", async () => {
  const fixture = await recoveryFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let app: ElectronApplication | undefined, calls = 0;
  try {
    const current = await pauseSession(sdk, fixture.sessionId, fixture.modelId);
    await sdk.attachments.file(fixture.sessionId, join(fixture.project, "fixture.txt"));
    const attachments = current().draft.attachments.map((entry) => entry.id);
    fixture.service.controller.dispatch = async (raw: unknown) => {
      if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.resume") {
        calls++;
        if (calls === 1) { await gate.promise; throw new MoguriError("generated_resume_refusal", "Generated resume refused before changing the inspection boundary.", 503); }
      }
      return dispatch(raw);
    };
    app = await launch(fixture.directory);
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer", exact: true });
    const prompt = page.getByLabel("Prompt", { exact: true }), resume = composer.getByRole("button", { name: "Resume", exact: true });
    await prompt.fill("Generated unsent recovery draft.");
    await expect(page.getByRole("status").filter({ hasText: /^Draft saved$/ })).toHaveCount(1);
    await resume.click(); await waitFor(() => calls === 1);
    await expect(resume).toBeDisabled(); await expect(resume).toHaveAttribute("aria-busy", "true");
    await prompt.fill("Generated edited recovery draft remains unsent.");
    await prompt.press("Enter");
    await composer.evaluate((element) => {
      if (!(element instanceof HTMLFormElement)) throw new Error("Generated composer is not a form.");
      element.requestSubmit(); element.requestSubmit();
    });
    await expect(page.getByRole("status").filter({ hasText: /^Draft saved$/ })).toHaveCount(1);
    expect(calls).toBe(1); expect(fixture.requests).toHaveLength(0);
    gate.resolve();
    await expect(page.getByRole("alert").filter({ hasText: "Generated resume refused" })).toBeVisible();
    await expect(resume).toBeEnabled();
    expect(sdk.getState().snapshot!.blockedProjects).toContain(fixture.session().projectId);
    expect(current().draft.text).toBe("Generated edited recovery draft remains unsent.");
    expect(current().draft.attachments.map((entry) => entry.id)).toEqual(attachments);
    await composer.evaluate((element) => {
      if (!(element instanceof HTMLFormElement)) throw new Error("Generated composer is not a form.");
      element.requestSubmit();
    });
    await expect(resume).toHaveCount(0);
    await expect(composer.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    expect(calls).toBe(2); expect(current().draft.text).toBe("Generated edited recovery draft remains unsent.");
    expect(current().draft.attachments.map((entry) => entry.id)).toEqual(attachments);
    expect(current().queue).toHaveLength(0); expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("recovery preserves explicit hold, Shift+Enter and slash actions instead of interpreting them as Resume", async () => {
  const fixture = await recoveryFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    const current = await pauseSession(sdk, fixture.sessionId, fixture.modelId);
    app = await launch(fixture.directory);
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer", exact: true });
    const prompt = page.getByLabel("Prompt", { exact: true });
    await expect(composer.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    await prompt.fill("Generated held recovery prompt."); await prompt.press("Meta+Enter");
    await finishIdleSchedule(page);
    await expect.poll(() => sdk.scheduledPrompts.list(fixture.sessionId)[0]?.status).toBe("scheduled");
    await expect(composer.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    expect(sdk.getState().snapshot!.blockedProjects).toContain(fixture.session().projectId);
    expect(fixture.requests).toHaveLength(0);
    await prompt.fill("/rename Generated recovery rename");
    await expect(composer.getByRole("button", { name: "Run command", exact: true })).toBeEnabled();
    await prompt.press("Enter");
    await expect(page.getByRole("heading", { name: "Generated recovery rename", exact: true })).toBeVisible();
    await prompt.fill("Generated newline"); await prompt.press("Shift+Enter");
    await expect(prompt).toHaveValue("Generated newline\n");
    await expect(page.getByRole("status").filter({ hasText: /^Draft saved$/ })).toHaveCount(1);
    expect(current().queue).toHaveLength(0); expect(sdk.scheduledPrompts.list(fixture.sessionId)).toHaveLength(1); expect(fixture.requests).toHaveLength(0);
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "session.resumed")).toHaveLength(0);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});
