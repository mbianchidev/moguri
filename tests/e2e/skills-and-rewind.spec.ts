import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSandboxManagement, MoguriSdk } from "@moguri-dev/sdk";
import { digest } from "@moguri-dev/sdk/testing";
import { distributionConfiguration, readSandboxDistribution } from "@moguri-dev/sdk/testing";
import { reviewNativeTools, setupFixture, waitFor } from "../fixture.ts";
import { remoteFixture } from "../fixtures/remote-service.ts";
import { nativeApiFixture } from "../fixtures/native-api.ts";
import { profileFixture } from "../fixtures/profiles.ts";
import { focusByKeyboard, openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
async function openRewind(page: Page) {
  await page.getByRole("navigation", { name: "Conversation turns", exact: true }).getByRole("button", { name: "Checkpoints and rewind", exact: true }).click();
  return page.getByRole("dialog", { name: "Checkpoints and rewind", exact: true }).getByRole("region", { name: "Checkpoints and rewind", exact: true });
}
test.skip(process.platform !== "darwin", "Hidden desktop acceptance uses the qualified macOS client.");
test("Local workspace review rejects stale external edits and requires a fresh explicit conflict decision before preserving the displaced bytes", async ({}) => {
  const f = await setupFixture({ toolCall: { name: "write_file", args: { path: "fixture.txt", text: "Generated desktop owned write.", expectedDigest: digest("generated original\n") } } });
  await reviewNativeTools(f, ["write_file"]); await f.configure(); await f.send("Generated desktop workspace checkpoint."); await f.approve(); await f.terminal();
  await waitFor(() => f.service.controller.snapshot().checkpoints[0]?.terminal?.afterDigest);
  await writeFile(join(f.project, "fixture.txt"), "Generated desktop external version.");
  const checkpoints = f.service.controller.platform.checkpoints, query = checkpoints.query.bind(checkpoints), gate = Promise.withResolvers<void>();
  let hold = false, entered = false;
  checkpoints.query = async (input, signal) => {
    if (hold && input.type === "rewind.preview") { hold = false; entered = true; await gate.promise; signal?.throwIfAborted(); }
    return query(input, signal);
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), panel = await openRewind(page);
    const review = panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first(), confirm = panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true });
    await review.click(); await expect(panel).toContainText("External bytes differ");
    await expect(confirm).toBeDisabled();
    await panel.getByRole("combobox", { name: "Rewind decision fixture.txt" }).selectOption("restore-checkpoint");
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    await writeFile(join(f.project, "fixture.txt"), "Generated desktop newer external version.");
    await confirm.click(); await expect(panel.getByRole("alert")).toContainText(/preview|changed|stale/i);
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("Generated desktop newer external version.");
    expect(f.service.controller.snapshot().rewinds).toHaveLength(0);
    hold = true; await review.click(); await waitFor(() => entered);
    await expect(panel.getByRole("region", { name: "Exact rewind preview", exact: true })).toHaveCount(0);
    gate.resolve();
    await expect(panel.getByRole("region", { name: "Exact rewind preview", exact: true })).toContainText(digest("Generated desktop newer external version."));
    await panel.getByRole("combobox", { name: "Rewind decision fixture.txt" }).selectOption("restore-checkpoint");
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check(); await confirm.click();
    await expect.poll(() => f.service.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    const record = f.service.controller.snapshot().rewinds[0]!;
    expect(await readFile(record.files[0]!.backup!, "utf8")).toBe("Generated desktop newer external version.");
  } finally { gate.resolve(); checkpoints.query = query; await app.close(); await f.close(); }
});

test("the hidden desktop restores the actual pinned SSH root without touching the controller checkout or starting another model", async ({}) => {
  const f = await remoteFixture({ toolCall: { name: "write_file", args: { path: "fixture.txt", text: "Generated desktop peer write.", expectedDigest: digest("generated actual remote source\n") } } });
  await reviewNativeTools(f, ["write_file"]); await f.probe(); await f.select(); await f.send("Generated desktop peer checkpoint."); await f.approve(); await f.terminal();
  await waitFor(() => f.controller.snapshot().checkpoints[0]?.terminal?.afterDigest);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  const remote = f.controller.remote, originalRead = remote.readWorkspace;
  try {
    const calls = f.requests.length, budget = structuredClone(f.controller.snapshot().budgetEntries);
    let hold = true, entered = false, cancelled = false;
    remote.readWorkspace = async (root, request, signal) => {
      if (request.query.type === "checkpoint.capture" && hold) {
        hold = false; entered = true;
        await new Promise<never>((_resolve, reject) => {
          const abort = () => { cancelled = true; reject(signal.reason); };
          if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
        });
      }
      return originalRead.call(remote, root, request, signal);
    };
    const page = await app.firstWindow();
    let panel = await openRewind(page);
    await panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first().click();
    await waitFor(() => entered);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Checkpoints and rewind", exact: true })).toHaveCount(0);
    await waitFor(() => cancelled);
    await waitFor(() => f.controller.snapshot().checkpointCaptures.some((capture) => capture.phase === "current" && capture.status === "failed"));
    expect(await readFile(join(f.workspace, "fixture.txt"), "utf8")).toBe("Generated desktop peer write.");
    expect(f.controller.snapshot().rewinds).toHaveLength(0);
    panel = await openRewind(page);
    await expect(panel.getByRole("region", { name: "Exact rewind preview", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first().click();
    await expect(panel.getByRole("region", { name: "Exact rewind preview" })).toContainText(f.workspace);
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    await panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(await readFile(join(f.workspace, "fixture.txt"), "utf8")).toBe("generated actual remote source\n");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(f.requests.length).toBe(calls); expect(f.controller.snapshot().budgetEntries).toEqual(budget);
  } finally { remote.readWorkspace = originalRead; await app.close(); await f.close(); }
});

test("the actual private Sandbox guest rewinds through hidden desktop confirmation without publishing its Local source", async ({}) => {
  const distribution = process.env.MOGURI_SANDBOX_DISTRIBUTION;
  test.skip(process.arch !== "arm64" || !distribution, "Actual native desktop acceptance needs this checkout's explicit current distribution and verified installed runtime.");
  const verified = await readSandboxDistribution(distribution!, AbortSignal.timeout(30000));
  const f = await nativeApiFixture(distributionConfiguration(verified.distribution), { distribution });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined, passed = false;
  try {
    const settings = f.sdk.settings.get()!;
    await f.sdk.settings.update({ ...settings.values, sandbox: f.reviewedConfiguration,
      sandboxManagement: { ...defaultSandboxManagement(), enabled: true, automaticUpdates: false } }, settings.revision);
    await f.qualify();
    const project = await f.sdk.projects.add(f.project), id = (await f.sdk.sessions.create(project.id!, "Generated desktop native rewind", { env: "Sandbox", modelId: f.provider.modelId })).id!;
    await f.sdk.sessions.autonomy(id, "Autopilot");
    const saved = await f.sdk.command({ type: "draft.save", sessionId: id, expectedRevision: 0, text: "generated native write for desktop rewind", attachments: [] });
    await f.sdk.command({ type: "message.send", sessionId: id, expectedRevision: saved.revision!, delivery: "queue" });
    await waitFor(() => f.service.controller.snapshot().checkpoints.find((checkpoint) => checkpoint.sessionId === id && checkpoint.terminal?.afterDigest), 30000);
    const budget = structuredClone(f.service.controller.snapshot().budgetEntries);
    app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: f.state, MOGURI_TEST_WINDOW: "hidden" } });
    const page = await app.firstWindow(), panel = await openRewind(page);
    await panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first().click();
    await expect(panel.getByRole("region", { name: "Exact rewind preview" })).toContainText("new owned private stage");
    for (const select of await panel.getByRole("combobox").all()) await select.selectOption("restore-checkpoint");
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    await panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated source original\n");
    expect(f.service.controller.snapshot().budgetEntries).toEqual(budget);
    expect(f.service.controller.snapshot().rewinds[0]?.nativeWorkspaceId).toBeTruthy();
    passed = true;
  } finally { await app?.close(); await f.close(passed); }
});

test("the desktop reviews an exact checkpoint and confirms a conversation branch without losing history or spend", async ({}, info) => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure(); await fixture.send("Generated desktop checkpoint turn."); await fixture.terminal();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    await expect(page.locator(".conversation-reviews").getByRole("region", { name: "Skill source admission", exact: true })).toHaveCount(0);
    await expect(page.locator(".conversation-reviews").getByRole("region", { name: "Checkpoints and rewind", exact: true })).toHaveCount(0);
    await navigation.getByRole("button", { name: /^Prompt 1:/ }).click();
    await expect(page.getByRole("log", { name: "Session transcript", exact: true }).getByRole("article", { name: "User prompt", exact: true })).toBeInViewport({ ratio: 1 });
    const prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    await prompt.fill("Generated saved draft survives sidebar review.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const trigger = navigation.getByRole("button", { name: "Checkpoints and rewind", exact: true });
    await focusByKeyboard(trigger); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Checkpoints and rewind", exact: true });
    const panel = dialog.getByRole("region", { name: "Checkpoints and rewind", exact: true });
    await panel.getByRole("button", { name: "Inspect checkpoint scope", exact: true }).first().click();
    await expect(panel.getByLabel("Checkpoint scope", { exact: true })).toContainText(fixture.project);
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await trigger.click();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const review = panel.getByRole("button", { name: "Review conversation rewind", exact: true }).first();
    await focusByKeyboard(review); await page.keyboard.press("Enter");
    await expect(panel.getByRole("region", { name: "Exact rewind preview" })).toContainText("External effects");
    const confirm = panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true });
    await expect(confirm).toBeDisabled();
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    const calls = fixture.requests.length, budget = structuredClone(fixture.service.controller.snapshot().budgetEntries);
    await focusByKeyboard(confirm); await page.keyboard.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(fixture.requests.length).toBe(calls); expect(fixture.service.controller.snapshot().budgetEntries).toEqual(budget);
    await expect(panel).toContainText("completed");
    await page.screenshot({ path: info.outputPath("reviewed-conversation-rewind.png"), animations: "disabled" });
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
    await expect(prompt).toHaveValue("Generated saved draft survives sidebar review.");
    await expect(page.getByRole("region", { name: "Checkpoints and rewind", exact: true })).toHaveCount(0);
  } finally { await app.close(); await fixture.close(); }
});

test("Local source review, explicit unverified publisher admission and revocation use the actual shared service", async ({}) => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const root = join(fixture.directory, "generated-desktop-skills");
  await mkdir(root);
  await writeFile(join(root, "SKILL.md"), "---\nname: generated-review\ndescription: Generated desktop source review\n---\nGenerated complete untrusted instructions.\n");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-source", name: "Generated desktop source", kind: "local", path: root, enabled: true }] }, settings.revision);
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("region", { name: "Skill source admission", exact: true })).toHaveCount(0);
    await openSettingsSection(page, "Skills");
    const panel = page.getByRole("region", { name: "Moguri settings", exact: true }).getByRole("region", { name: "Skill source admission", exact: true });
    await panel.locator("summary").press("Enter");
    expect(fixture.service.controller.snapshot().skillAdmissions).toHaveLength(0);
    await panel.getByRole("button", { name: "Find current skills", exact: true }).click();
    await panel.getByRole("button", { name: "Review source generated-review", exact: true }).click();
    await expect(panel).toContainText("Generated complete untrusted instructions.");
    const admit = panel.getByRole("button", { name: "Approve skill for this session", exact: true });
    await expect(admit).toBeDisabled();
    await panel.getByRole("checkbox", { name: "I reviewed all source files and acknowledge the publisher is not verified." }).check();
    await writeFile(join(root, "SKILL.md"), "---\nname: generated-review\ndescription: Generated desktop source review\n---\nGenerated changed untrusted instructions.\n");
    await admit.click(); await expect(panel.getByRole("alert")).toContainText(/changed|fresh|digest|stale/i);
    expect(fixture.service.controller.snapshot().skillAdmissions).toHaveLength(0);
    await panel.getByRole("button", { name: "Find current skills", exact: true }).click();
    await panel.getByRole("button", { name: "Review source generated-review", exact: true }).click();
    await expect(panel).toContainText("Generated changed untrusted instructions.");
    await expect(admit).toBeDisabled();
    await panel.getByRole("checkbox", { name: "I reviewed all source files and acknowledge the publisher is not verified." }).check();
    await admit.click();
    await expect.poll(() => fixture.service.controller.snapshot().skillAdmissions[0]?.state).toBe("active");
    expect(fixture.service.controller.snapshot().skillAdmissions[0]?.sessionId).toBe(fixture.session().id);
    await panel.getByRole("button", { name: "Revoke skill approval", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().skillAdmissions[0]?.state).toBe("revoked");
    await expect(panel).toContainText("revoked");
    expect(fixture.requests.length).toBe(0);
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});

test("Settings skill reviews clear across explicit source chats and profiles without inventing a missing session or loading instructions", async () => {
  const f = await profileFixture(), { profile } = await f.create("Generated empty skills profile");
  const root = join(f.directory, "generated-skills"), projectRoot = join(f.directory, "generated-project");
  await mkdir(root); await mkdir(projectRoot);
  await writeFile(join(root, "SKILL.md"), "---\nname: generated-scoped-review\ndescription: Generated scoped review\n---\nGenerated exact scoped source.\n");
  const project = await f.sdk.projects.add(projectRoot), first = (await f.sdk.sessions.create(project.id!, "Generated first source chat")).id!;
  const second = (await f.sdk.sessions.create(project.id!, "Generated second source chat")).id!;
  const settings = f.sdk.settings.get()!;
  await f.sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-scoped-source", name: "Generated scoped source", kind: "local", path: root, enabled: true }] }, settings.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.locator(`.session-link[data-session-id="${first}"]`).click();
    await openSettingsSection(page, "Skills");
    const source = page.getByRole("combobox", { name: "Settings source chat", exact: true });
    await expect(source).toHaveValue(first);
    const panel = page.getByRole("region", { name: "Skill source admission", exact: true });
    const inspect = async () => {
      await panel.locator("summary").press("Enter");
      await panel.getByRole("button", { name: "Find current skills", exact: true }).click();
      await panel.getByRole("button", { name: "Review source generated-scoped-review", exact: true }).click();
      await panel.getByRole("checkbox", { name: "I reviewed all source files and acknowledge the publisher is not verified." }).check();
    };
    await inspect();
    await source.selectOption(second);
    await expect(page.getByLabel("Complete skill source review", { exact: true })).toHaveCount(0);
    await inspect();
    await source.selectOption("");
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("Choose a chat above to review which skills it can use.", { exact: true })).toBeVisible();
    await source.selectOption(first); await inspect();
    const current = f.sdk.settings.get()!;
    await f.sdk.settings.update({ ...current.values, skillSources: [] }, current.revision);
    await expect(page.getByLabel("Complete skill source review", { exact: true })).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await openSettingsSection(page, "General");
    await page.getByRole("combobox", { name: "Active profile", exact: true }).selectOption(profile.id);
    await expect(page.getByRole("button", { name: /^Current profile: / })).toContainText("Generated empty skills profile");
    await expect(page.getByRole("button", { name: "Checkpoints and rewind", exact: true })).toHaveCount(0);
    await openSettingsSection(page, "Skills");
    await expect(source).toHaveValue("");
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("Choose a chat above to review which skills it can use.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(f.service.controller.snapshot().skillAdmissions).toHaveLength(0);
    expect(f.service.controller.snapshot().budgetEntries).toHaveLength(0);
    expect(f.providers.reduce((sum, provider) => sum + provider.requests.length, 0)).toBe(0);
  } finally { await app.close(); await f.close(); }
});

test("sidebar checkpoint inspection clears pruned evidence and a different empty session cannot reuse the original preview", async () => {
  const f = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure(); await f.send("Generated original checkpoint owner."); await f.terminal();
  const original = f.session().id, empty = (await sdk.sessions.create(f.session().projectId, "Generated empty checkpoint owner")).id!;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.locator(`.session-link[data-session-id="${original}"]`).click();
    const panel = await openRewind(page);
    await panel.getByRole("button", { name: "Inspect checkpoint scope", exact: true }).click();
    await expect(panel.getByLabel("Checkpoint scope", { exact: true })).toContainText(f.project);
    const checkpoint = f.service.controller.snapshot().checkpoints[0]!;
    await sdk.checkpoints.prune(original, checkpoint.id, checkpoint.revision);
    await expect(panel.getByLabel("Checkpoint scope", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Review workspace rewind", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.locator(`.session-link[data-session-id="${empty}"]`).click();
    const other = await openRewind(page);
    await expect(other).toContainText("No provable checkpoints are retained.");
    await expect(other.getByRole("region", { name: "Exact rewind preview", exact: true })).toHaveCount(0);
    await expect(other.getByRole("button", { name: "Confirm reviewed rewind", exact: true })).toHaveCount(0);
    expect(f.service.controller.snapshot().rewinds).toHaveLength(0);
    expect(f.requests).toHaveLength(1);
  } finally { sdk.disconnect(); await app.close(); await f.close(); }
});
