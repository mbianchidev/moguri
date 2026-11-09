import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSandboxManagement, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { digest } from "../../apps/service/src/store.ts";
import { distributionConfiguration, readSandboxDistribution } from "../../apps/service/src/sandbox-distribution.ts";
import { reviewNativeTools, setupFixture, waitFor } from "../fixture.ts";
import { remoteFixture } from "../fixtures/remote-service.ts";
import { nativeApiFixture } from "../fixtures/native-api.ts";
import { focusByKeyboard } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop acceptance uses the qualified macOS client.");
test("Local workspace review rejects stale external edits and requires a fresh explicit conflict decision before preserving the displaced bytes", async ({}) => {
  const f = await setupFixture({ toolCall: { name: "write_file", args: { path: "fixture.txt", text: "Generated desktop owned write.", expectedDigest: digest("generated original\n") } } });
  await reviewNativeTools(f, ["write_file"]); await f.configure(); await f.send("Generated desktop workspace checkpoint."); await f.approve(); await f.terminal();
  await writeFile(join(f.project, "fixture.txt"), "Generated desktop external version.");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), panel = page.getByRole("region", { name: "Checkpoints and rewind", exact: true });
    await panel.locator("summary").press("Enter");
    const review = panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first(), confirm = panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true });
    await review.click(); await expect(panel).toContainText("External bytes differ");
    await expect(confirm).toBeDisabled();
    await panel.getByRole("combobox", { name: "Rewind decision fixture.txt" }).selectOption("restore-checkpoint");
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    await writeFile(join(f.project, "fixture.txt"), "Generated desktop newer external version.");
    await confirm.click(); await expect(panel.getByRole("alert")).toContainText(/preview|changed|stale/i);
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("Generated desktop newer external version.");
    expect(f.service.controller.snapshot().rewinds).toHaveLength(0);
    await review.click(); await panel.getByRole("combobox", { name: "Rewind decision fixture.txt" }).selectOption("restore-checkpoint");
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check(); await confirm.click();
    await expect.poll(() => f.service.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    const record = f.service.controller.snapshot().rewinds[0]!;
    expect(await readFile(record.files[0]!.backup!, "utf8")).toBe("Generated desktop newer external version.");
  } finally { await app.close(); await f.close(); }
});

test("the hidden desktop restores the actual pinned SSH root without touching the controller checkout or starting another model", async ({}) => {
  const f = await remoteFixture({ toolCall: { name: "write_file", args: { path: "fixture.txt", text: "Generated desktop peer write.", expectedDigest: digest("generated actual remote source\n") } } });
  await reviewNativeTools(f, ["write_file"]); await f.probe(); await f.select(); await f.send("Generated desktop peer checkpoint."); await f.approve(); await f.terminal();
  await waitFor(() => f.controller.snapshot().checkpoints[0]?.terminal?.afterDigest);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const calls = f.requests.length, budget = structuredClone(f.controller.snapshot().budgetEntries);
    const page = await app.firstWindow(), panel = page.getByRole("region", { name: "Checkpoints and rewind", exact: true });
    await panel.locator("summary").press("Enter"); await panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first().click();
    await expect(panel.getByRole("region", { name: "Exact rewind preview" })).toContainText(f.workspace);
    await panel.getByRole("checkbox", { name: "I reviewed this exact target and file decisions." }).check();
    await panel.getByRole("button", { name: "Confirm reviewed rewind", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().rewinds[0]?.status).toBe("completed");
    expect(await readFile(join(f.workspace, "fixture.txt"), "utf8")).toBe("generated actual remote source\n");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(f.requests.length).toBe(calls); expect(f.controller.snapshot().budgetEntries).toEqual(budget);
  } finally { await app.close(); await f.close(); }
});

test("the actual private Sandbox guest rewinds through hidden desktop confirmation without publishing its Local source", async ({}) => {
  const distribution = process.env.MOGURI_SANDBOX_DISTRIBUTION;
  test.skip(process.arch !== "arm64" || !distribution, "Actual native desktop acceptance needs this checkout's explicit current distribution and verified installed runtime.");
  const verified = await readSandboxDistribution(distribution!, AbortSignal.timeout(30000));
  const f = await nativeApiFixture(distributionConfiguration(verified.distribution, "/opt/moguri/sendbox/0.2.4"), { distribution });
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
    const page = await app.firstWindow(), panel = page.getByRole("region", { name: "Checkpoints and rewind", exact: true });
    await panel.locator("summary").press("Enter"); await panel.getByRole("button", { name: "Review workspace rewind", exact: true }).first().click();
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
    const page = await app.firstWindow(), panel = page.getByRole("region", { name: "Checkpoints and rewind", exact: true });
    await panel.locator("summary").press("Enter");
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
    const page = await app.firstWindow(), panel = page.getByRole("region", { name: "Skill source admission", exact: true });
    await panel.locator("summary").press("Enter");
    await panel.getByRole("button", { name: "Find current skills", exact: true }).click();
    await panel.getByRole("button", { name: "Review source generated-review", exact: true }).click();
    await expect(panel).toContainText("Generated complete untrusted instructions.");
    const admit = panel.getByRole("button", { name: "Admit exact source for this session", exact: true });
    await expect(admit).toBeDisabled();
    await panel.getByRole("checkbox", { name: "I reviewed all source files and acknowledge the publisher is not verified." }).check();
    await admit.click();
    await expect.poll(() => fixture.service.controller.snapshot().skillAdmissions[0]?.state).toBe("active");
    await panel.getByRole("button", { name: "Revoke source admission", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().skillAdmissions[0]?.state).toBe("revoked");
    await expect(panel).toContainText("revoked");
    expect(fixture.requests.length).toBe(0);
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});
