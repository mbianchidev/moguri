import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isRecord } from "../../packages/sdk/src/index.ts";
import { remotePlanFixture } from "../fixtures/remote-plan-service.ts";
import { createRemoteFrameGate } from "../fixtures/remote-frame-gate.ts";

const require = createRequire(import.meta.url);
const openApp = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native Remote plan UI is qualified on macOS.");

test("desktop saves a reviewed SSH plan without a selected model, preserves the prompt and exposes retained boundary provenance", async () => {
  const f = await remotePlanFixture();
  let app: ElectronApplication | undefined;
  try {
    app = await openApp(f.directory);
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByLabel("Prompt", { exact: true }).fill("Generated unsent prompt survives a manual plan save.");
    await expect.poll(() => f.session().draft.text).toBe("Generated unsent prompt survives a manual plan save.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toContainText("Draft saved");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const plan = page.getByRole("region", { name: "Bound project plan", exact: true }), text = "Generated manually reviewed Remote desktop plan.\n\nNo model or Local fallback.\n";
    await expect(plan).toContainText("SSH destination and binding");
    await plan.getByLabel("Project plan", { exact: true }).fill(text);
    await plan.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().planSaves.at(-1)?.status).toBe("completed");
    await expect(plan).not.toContainText("Saving exact owned plan.");
    await expect(plan.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await plan.getByText("Remote save: completed", { exact: true }).click();
    await expect(plan).toContainText("owned-worker-stopped");
    await expect(plan).toContainText("Independent retained snapshot");
    expect(await readFile(join(f.workspace, "docs/plan.md"), "utf8")).toBe(text);
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated unsent prompt survives a manual plan save.");
    expect(f.session().controls.modelId).toBeNull(); expect(f.requests.length).toBe(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-plan-save-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-plan-save-compact.png") });
    expect(await plan.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    const save = f.controller.snapshot().planSaves.at(-1)!;
    await openSettingsSection(page, "Artifacts");
    await page.getByLabel("Retained artifact", { exact: true }).selectOption(save.artifactId!);
    await expect(page.getByText("User-requested Remote file snapshot, not a chat answer or permission.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Artifact text", { exact: true })).toHaveValue(text);
    expect(failures).toEqual([]);
  } finally { await app?.close(); await f.close(); }
});

test("desktop exact save stop after written bytes preserves the editor and reports a partial retained result", async () => {
  const f = await remotePlanFixture(), launch = f.controller.remote.launch.bind(f.controller.remote), gate = createRemoteFrameGate("user-plan.complete");
  f.controller.remote.launch = (...args) => gate.wrap(launch(...args));
  let app: ElectronApplication | undefined;
  try {
    app = await openApp(f.directory);
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const plan = page.getByRole("region", { name: "Bound project plan", exact: true }), text = "Generated Remote bytes before explicit desktop stop.\n";
    await plan.getByLabel("Project plan", { exact: true }).fill(text);
    await plan.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => gate.held).toBe(true);
    await plan.getByText("Remote save: running", { exact: true }).click();
    await plan.getByRole("button", { name: "Stop Remote save", exact: true }).click();
    await expect.poll(() => f.session().status).toBe("stopping");
    gate.release();
    await expect.poll(() => f.controller.snapshot().planSaves.at(-1)?.status).toBe("partial");
    await expect(plan.getByLabel("Project plan", { exact: true })).toHaveValue(text);
    await expect(plan).toContainText("Unsaved edit");
    await expect(plan).toContainText("no rollback");
    const saved = f.controller.snapshot().planSaves.at(-1)!;
    expect(saved.fileOutcome).toBe("written"); expect(saved.artifactId).toBeTruthy();
    expect(await readFile(join(f.workspace, "docs/plan.md"), "utf8")).toBe(text);
    await plan.getByRole("button", { name: "Reload plan", exact: true }).click();
    await expect(plan).not.toContainText("Unsaved edit");
    expect(f.requests.length).toBe(0);
  } finally { gate.release(); f.controller.remote.launch = launch; await app?.close(); await f.close(); }
});

test("a settled original save cannot load a new mapping over the dirty editor while its RPC response is held", async () => {
  const f = await remotePlanFixture(), dispatch = f.controller.dispatch.bind(f.controller);
  let release = () => {}, held = false;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  f.controller.dispatch = async (raw: unknown) => {
    const result = await dispatch(raw);
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "plan.save") { held = true; await barrier; }
    return result;
  };
  let app: ElectronApplication | undefined;
  try {
    app = await openApp(f.directory);
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const plan = page.getByRole("region", { name: "Bound project plan", exact: true }), text = "Generated original binding edit preserved after settlement.\n";
    await plan.getByLabel("Project plan", { exact: true }).fill(text);
    await plan.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    const other = join(f.workspace, "..", "generated-ui-new-plan-root"); await mkdir(other); await mkdir(join(other, "docs"));
    await writeFile(join(other, "docs/plan.md"), "Generated different new-root plan.\n");
    const configuration = (await f.sdk.projects.configuration(f.session().projectId)).configuration;
    await f.sdk.projects.configure(configuration.projectId, { ...configuration.values, remotePath: other }, configuration.revision);
    release();
    await expect(plan).toContainText("original save settled, but the workspace changed");
    await expect(plan.getByLabel("Project plan", { exact: true })).toHaveValue(text);
    await expect(plan.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(await readFile(join(f.workspace, "docs/plan.md"), "utf8")).toBe(text);
    expect(await readFile(join(other, "docs/plan.md"), "utf8")).toBe("Generated different new-root plan.\n");
    await plan.getByRole("button", { name: "Reload plan", exact: true }).click();
    await expect(plan.getByLabel("Project plan", { exact: true })).toHaveValue("Generated different new-root plan.\n");
    expect(f.requests.length).toBe(0);
  } finally { release(); f.controller.dispatch = dispatch; await app?.close(); await f.close(); }
});
