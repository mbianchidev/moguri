import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, MoguriError, MoguriSdk, UPDATE_TOKEN_CREATION_URL } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { profileFixture } from "../fixtures/profiles.ts";
import { focusByKeyboard, openSettingsSection, waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Settings and Dashboard use generated hidden macOS windows.");
const launch = (stateDir: string, profileId = "default") => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_PROFILE_ID: profileId, MOGURI_TEST_WINDOW: "hidden" },
});
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } });
  await app.close();
};
async function send(sdk: MoguriSdk, sessionId: string, text: string, held = false) {
  const session = sdk.getState().snapshot?.sessions.find((session) => session.id === sessionId);
  if (!session) throw new Error("The generated original session is unavailable.");
  const saved = await sdk.command({ type: "draft.save", sessionId, text, attachments: [], expectedRevision: session.draft.revision });
  await sdk.command({ type: "message.send", sessionId, expectedRevision: saved.revision!, delivery: "queue", ...(held ? { held: true } : {}) });
}

test("imported skill switches persist and Enable all reports a partial failure without enabling another project", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const otherRoot = join(fixture.directory, "generated-other-skill-project"); await mkdir(otherRoot);
  const otherProject = (await sdk.projects.add(otherRoot)).id!;
  for (const [name, projectId, root] of [["generated-alpha", fixture.session().projectId, fixture.project],
    ["generated-beta", fixture.session().projectId, fixture.project], ["generated-other", otherProject, otherRoot]] as const) {
    const directory = join(root, name); await mkdir(directory);
    const path = join(directory, "SKILL.md");
    await writeFile(path, `---\nname: ${name}\ndescription: Generated skill switch fixture.\n---\nUse generated fixtures; no tool permissions.\n`);
    await sdk.capabilities.importSkill(projectId, path);
  }
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let changes = 0;
  fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
    if (isRecord(args[0]) && isRecord(args[0].command) && args[0].command.type === "capability.toggle" && ++changes === 2) {
      throw new MoguriError("generated_conflict", "Generated skill revision conflict; refresh and retry.", 409);
    }
    return dispatch(...args);
  };
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Skills");
    // Settings lists every skill with its groups collapsed (D57); imported skills sit under their project.
    const expand = () => page.getByRole("region", { name: "Project - project", exact: true }).getByRole("button", { name: /^Project - project / }).click();
    await expand();
    const alpha = page.getByRole("switch", { name: "Enable skill generated-alpha", exact: true });
    const beta = page.getByRole("switch", { name: "Enable skill generated-beta", exact: true });
    await expect(alpha).not.toBeChecked(); await expect(beta).not.toBeChecked();
    const enableAll = page.getByRole("button", { name: "Enable all skills", exact: true });
    await enableAll.click();
    await expect(page.getByRole("alert")).toContainText("Generated skill revision conflict");
    await expect(page.getByRole("status", { name: "Skill changes", exact: true })).toContainText("1 of 2");
    await expect(alpha).toBeChecked(); await expect(beta).not.toBeChecked();
    expect(sdk.getState().snapshot?.registry.find((entry) => entry.projectId === otherProject && entry.kind === "skill")?.enabled).toBe(false);
    await enableAll.click(); await expect(beta).toBeChecked(); await expect(enableAll).toBeDisabled();
    await alpha.focus(); await page.keyboard.press("Space"); await expect(alpha).not.toBeChecked();
    await expect.poll(() => sdk.getState().snapshot?.registry.find((entry) => entry.name === "generated-alpha")?.enabled).toBe(false);
    await page.reload(); await openSettingsSection(page, "Skills"); await expand();
    await expect(alpha).not.toBeChecked(); await expect(beta).toBeChecked();
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.service.controller.snapshot().skillAdmissions).toHaveLength(0);
  } finally { fixture.service.controller.dispatch = dispatch; await close(app); sdk.disconnect(); await fixture.close(); }
});

test("an imported skill is deleted only after inline confirmation, while plugin-owned skills stay with their bundle", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), projectId = fixture.session().projectId;
  for (const name of ["generated-removable", "generated-retained"]) {
    const directory = join(fixture.project, name); await mkdir(directory);
    await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: Generated deletion fixture.\n---\nUse generated fixtures; no tool permissions.\n`);
    await sdk.capabilities.importSkill(projectId, join(directory, "SKILL.md"));
  }
  const pluginPath = join(fixture.project, "plugin.json");
  await writeFile(pluginPath, JSON.stringify({ schemaVersion: 1, name: "generated-bundle", version: "1.0.0", description: "Generated plugin",
    skills: ["---\nname: generated-bundled\ndescription: Bundled skill\n---\nGenerated bundled instructions.\n"] }));
  await sdk.capabilities.importPlugin(projectId, pluginPath);
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Skills");
    await page.getByRole("region", { name: "Project - project", exact: true }).getByRole("button", { name: /^Project - project / }).click();
    const remove = page.getByRole("button", { name: "Delete skill generated-removable", exact: true });
    await expect(page.getByRole("button", { name: "Delete skill generated-bundle/generated-bundled", exact: true })).toHaveCount(0);
    await remove.click();
    const confirmation = page.getByRole("group", { name: "Confirm deleting skill generated-removable", exact: true });
    await expect(confirmation).toContainText("Chats that use it lose access");
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(sdk.getState().snapshot!.registry.some((entry) => entry.name === "generated-removable")).toBe(true);
    await remove.click(); await page.screenshot({ path: test.info().outputPath("skill-delete-confirmation.png") });
    await confirmation.getByRole("button", { name: "Delete skill", exact: true }).click();
    await expect(page.getByRole("status", { name: "Skill list status", exact: true })).toContainText("Deleted skill generated-removable");
    await expect(page.getByRole("switch", { name: "Enable skill generated-removable", exact: true })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Enable skill generated-retained", exact: true })).toBeVisible();
    await expect.poll(() => sdk.getState().snapshot!.registry.some((entry) => entry.name === "generated-removable")).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});

test("project configuration lists registered projects, preserves concurrent edits and keeps a removed target without replacement", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const path = join(fixture.directory, "generated-second-project"); await mkdir(path);
  const second = (await sdk.projects.add(path)).id!, original = structuredClone(fixture.session());
  await sdk.projects.configure(second, { ...(await sdk.projects.configuration(second)).configuration.values, instructions: "Generated second-project instructions." }, 0);
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Project");
    const select = page.getByRole("combobox", { name: "Configuration project", exact: true });
    await expect(select).toHaveValue(original.projectId);
    expect(await select.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(["", original.projectId, second]);
    await focusByKeyboard(select); await select.selectOption(second);
    const instructions = page.getByLabel("Project instruction override", { exact: true });
    await expect(instructions).toHaveValue("Generated second-project instructions.");
    await instructions.fill("Generated pending second-project edit."); await expect(select).toBeDisabled();
    const current = (await sdk.projects.configuration(second)).configuration;
    await sdk.projects.configure(second, { ...current.values, port: 4321 }, current.revision);
    await expect(page.getByRole("alert")).toContainText("Another client changed project settings");
    await page.getByRole("button", { name: "Save project instructions", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/revision|changed/i);
    await expect(instructions).toHaveValue("Generated pending second-project edit.");
    expect((await sdk.projects.configuration(second)).configuration.values.instructions).toBe("Generated second-project instructions.");
    const latest = (await sdk.projects.configuration(second)).configuration, preview = (await sdk.artifacts.projectPreview(second)).preview;
    await sdk.projects.remove(second, true, latest.revision, { action: "retain", expectedDigest: preview.digest });
    await expect(select).toHaveValue(second);
    await expect(select.locator("option:checked")).toContainText("Unavailable project");
    await expect(instructions).toHaveValue("Generated pending second-project edit."); await expect(instructions).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: "no longer in this profile" })).toBeVisible();
    await page.getByRole("button", { name: "Discard unavailable project edit", exact: true }).click();
    await expect(select).toBeEnabled(); await expect(select).toBeFocused(); await select.selectOption(original.projectId);
    await expect(select).toHaveValue(original.projectId);
    await expect(instructions).toHaveValue("");
    await expect(instructions, (await page.getByRole("alert").allTextContents()).join("\n")).toBeEnabled();
    await instructions.fill("Generated saved original-project instructions.");
    await page.getByRole("button", { name: "Save project instructions", exact: true }).click();
    await expect.poll(async () => (await sdk.projects.configuration(original.projectId)).configuration.values.instructions).toBe("Generated saved original-project instructions.");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    expect(fixture.session().projectId).toBe(original.projectId); expect(fixture.session().workspaceId).toBe(original.workspaceId);
    expect(fixture.session().controls).toEqual(original.controls); expect(fixture.requests).toHaveLength(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});

test("project configuration has an honest empty state and never lists another profile's projects", async () => {
  const fixture = await profileFixture(), { profile, client: other } = await fixture.create("Generated configuration profile");
  const path = join(fixture.directory, "generated-profile-project"); await mkdir(path);
  const project = (await other.projects.add(path)).id!;
  const app = await launch(fixture.stateDir);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Project");
    const select = page.getByRole("combobox", { name: "Configuration project", exact: true });
    await expect(select).toBeDisabled(); await expect(select).toHaveValue("");
    await expect(page.getByText("No registered projects in this profile.", { exact: true })).toBeVisible();
    await expect(select.locator(`option[value="${project}"]`)).toHaveCount(0);
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
    const active = page.getByRole("region", { name: "Active sessions", exact: true });
    await expect(active).toContainText("No active sessions in this profile.");
    await expect(active.getByRole("status")).toContainText("0 active");
    await openSettingsSection(page, "General"); await page.getByLabel("Active profile", { exact: true }).selectOption(profile.id);
    await expect(page.getByLabel("Current profile", { exact: true })).toContainText(profile.name);
    await openSettingsSection(page, "Project");
    await expect(select).toBeEnabled(); await expect(select).toHaveValue("");
    expect(await select.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(["", project]);
    await select.selectOption(project);
    await expect(page.getByRole("region", { name: "Per-project settings", exact: true })).toContainText("generated-profile-project");
  } finally { await close(app); await fixture.close(); }
});

test("Settings search has no Copy value control while ordinary settings retain theirs", async () => {
  const fixture = await setupFixture(), app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "User guidance");
    const search = page.getByRole("searchbox", { name: "Search settings", exact: true });
    await focusByKeyboard(search); await search.fill("theme");
    await expect(page.getByRole("button", { name: "Copy Search settings", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy Global user guidance", exact: true })).toHaveCount(1);
    await search.fill(""); await expect(page.getByLabel("Global user guidance", { exact: true })).toHaveValue("");
    expect(fixture.requests).toHaveLength(0);
  } finally { await close(app); await fixture.close(); }
});

test("project-group menu collapses and expands only its actual member projects with keyboard focus restored", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), ids = [fixture.session().projectId];
  for (const name of ["generated-member", "generated-unrelated-a", "generated-unrelated-b", "generated-standalone"]) {
    const path = join(fixture.directory, name); await mkdir(path); ids.push((await sdk.projects.add(path)).id!);
  }
  const selected = (await sdk.projects.group("Generated selected group", ids.slice(0, 2).map((projectId) => ({ projectId, revision: 0 })))).id!;
  await sdk.projects.group("Generated unrelated group", ids.slice(2, 4).map((projectId) => ({ projectId, revision: 0 })));
  await sdk.sessions.create(ids[1]!, "Generated second member session");
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated draft preserved by group folding.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const folder = page.locator("details.project-folder").filter({ has: page.locator("summary .folder-name", { hasText: "Generated selected group" }) });
    const unrelated = page.locator("details.project-folder").filter({ has: page.locator("summary .folder-name", { hasText: "Generated unrelated group" }) });
    await unrelated.locator("summary").click();
    await expect(folder.getByRole("button", { name: "Project group actions for Generated selected group", exact: true })).toHaveCount(0);
    const actions = folder.locator("summary");
    await actions.press("Shift+F10");
    const menu = page.getByRole("menu", { name: "Project group actions for Generated selected group", exact: true });
    await menu.getByRole("menuitem", { name: "Collapse all projects", exact: true }).press("Enter");
    await expect(actions).toBeFocused();
    await expect(page.getByRole("status", { name: "Workspace navigation updates", exact: true })).toHaveText("Collapsed 2 projects in Generated selected group.");
    for (const id of ids.slice(0, 2)) {
      const project = sdk.getState().snapshot!.projects.find((project) => project.id === id)!;
      await expect(folder.getByRole("button", { name: project.name, exact: true })).toHaveAttribute("aria-expanded", "false");
    }
    await expect(folder.getByRole("button", { name: "Generated second member session", exact: true })).toHaveCount(0);
    await expect(unrelated).not.toHaveAttribute("open");
    await expect(page.getByRole("button", { name: "generated-standalone", exact: true })).toHaveAttribute("aria-expanded", "true");
    await folder.locator("summary").click(); await folder.locator("summary").press("Shift+F10");
    await menu.getByRole("menuitem", { name: "Expand all projects", exact: true }).press("Enter");
    await expect(folder.locator("summary")).toBeFocused(); await expect(folder).toHaveAttribute("open", "");
    await expect(folder.getByRole("button", { name: "Generated second member session", exact: true })).toBeVisible();
    await expect(unrelated).not.toHaveAttribute("open");
    expect(sdk.getState().snapshot!.projectConfigurations.filter((configuration) => configuration.folderId === selected).map((configuration) => configuration.projectId).sort()).toEqual(ids.slice(0, 2).sort());
    await actions.click({ button: "right" });
    const moved = (await sdk.projects.configuration(ids[1]!)).configuration;
    await sdk.projects.organize(ids[1]!, { folderId: null, order: moved.order, color: moved.color }, moved.revision);
    const outside = page.getByRole("region", { name: "Project generated-member", exact: true });
    await expect(folder.getByRole("region", { name: "Project generated-member", exact: true })).toHaveCount(0);
    await expect(outside.getByRole("button", { name: "generated-member", exact: true })).toHaveAttribute("aria-expanded", "true");
    await menu.getByRole("menuitem", { name: "Collapse all projects", exact: true }).click();
    await expect(page.getByRole("status", { name: "Workspace navigation updates", exact: true })).toHaveText("Collapsed 1 project in Generated selected group.");
    await expect(outside.getByRole("button", { name: "generated-member", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(outside.getByRole("button", { name: "Generated second member session", exact: true })).toBeVisible();
    await expect(unrelated).not.toHaveAttribute("open");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated draft preserved by group folding.");
    expect(fixture.session().draft.text).toBe("Generated draft preserved by group folding."); expect(fixture.requests).toHaveLength(0);
  } finally { await close(app); sdk.disconnect(); await fixture.close(); }
});

test("private update setup exposes supported owner/Contents prefill and discloses manual repository selection without authenticating", async () => {
  const fixture = await setupFixture(), app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    await waitForWorkspace(page);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:open-external");
      ipcMain.handle("moguri:open-external", (_event, url: string) => { process.env.MOGURI_GENERATED_UPDATE_URL = url; });
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const update = page.getByRole("region", { name: "Application updates", exact: true });
    const setup = update.getByRole("button", { name: "Set up read-only update access", exact: true });
    await expect(setup).toBeVisible();
    await expect(update.getByText(/Opens GitHub with read-only Contents access prefilled/)).toBeVisible();
    await expect(update.getByText(/Only select repositories/).first()).toBeVisible();
    await focusByKeyboard(setup); await page.keyboard.press("Enter");
    const opened = await app.evaluate(() => process.env.MOGURI_GENERATED_UPDATE_URL);
    expect(opened).toBe(UPDATE_TOKEN_CREATION_URL);
    const url = new URL(opened!);
    expect(url.origin).toBe("https://github.com"); expect(url.pathname).toBe("/settings/personal-access-tokens/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: "Moguri updates", description: "Read Moguri release assets", target_name: "mbianchidev", expires_in: "30", contents: "read" });
    await expect(update.getByLabel("Release access token", { exact: true })).toHaveValue("");
    expect(fixture.service.store.events().some((event) => event.event_type === "application.update_recorded")).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  } finally { await close(app); await fixture.close(); }
});

test("Dashboard active sessions follow actual waiting/running/stopping events and navigate exactly without losing drafts or consuming held prompts", async ({}, info) => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const path = join(fixture.directory, "generated-active-project"); await mkdir(path);
  const projectId = (await sdk.projects.add(path)).id!;
  const waiting = (await sdk.sessions.create(fixture.session().projectId, "Generated active question", { modelId: fixture.modelId })).id!;
  await send(sdk, waiting, "generated structured question for dashboard");
  await waitFor(() => sdk.getState().snapshot?.sessions.find((session) => session.id === waiting)?.pendingQuestionId);
  const held = (await sdk.sessions.create(null, "Generated held, not active", { modelId: fixture.modelId })).id!;
  await send(sdk, held, "Generated held dashboard prompt", true);
  const running = (await sdk.sessions.create(projectId, "Generated active elsewhere", { modelId: fixture.modelId })).id!;
  const gate = Promise.withResolvers<void>(), prepare = fixture.provider.prepare.bind(fixture.provider);
  let preparing = false;
  fixture.provider.prepare = async (id, signal) => { preparing = true; await gate.promise; return prepare(id, signal); };
  await send(sdk, running, "Generated gated dashboard request"); await waitFor(() => preparing);
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated preserved dashboard draft.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.screenshot({ path: info.outputPath("active-sessions.png"), animations: "disabled" });
    const active = page.getByRole("region", { name: "Active sessions", exact: true });
    await expect(active).toBeVisible(); await expect(active.getByRole("status")).toContainText("2 active");
    await expect(active).toContainText("Question needs your answer"); await expect(active).toContainText("Session in progress");
    await expect(page.getByRole("region", { name: "My work dashboard", exact: true })).toBeVisible();
    const inProgress = page.getByText("In progress", { exact: true }).locator("..").locator("strong");
    await expect(inProgress).toHaveText("2");
    await page.screenshot({ path: info.outputPath("active-sessions.png"), animations: "disabled" });
    await expect(active.getByRole("button", { name: "Open session Generated held, not active", exact: true })).toHaveCount(0);
    await page.getByLabel("Dashboard project", { exact: true }).selectOption(projectId);
    await expect(active.getByRole("button", { name: "Open session Generated active question", exact: true })).toHaveCount(0);
    await expect(active.getByRole("button", { name: "Open session Generated active elsewhere", exact: true })).toBeVisible();
    await page.getByLabel("Dashboard date range", { exact: true }).selectOption("custom");
    await page.getByLabel("Dashboard range from", { exact: true }).fill("2024-01-01");
    await page.getByLabel("Dashboard range through", { exact: true }).fill("2024-01-02");
    await page.getByRole("button", { name: "Apply range", exact: true }).click();
    await expect(active.getByRole("button", { name: "Open session Generated active elsewhere", exact: true })).toBeVisible();
    await sdk.command({ type: "session.stop", sessionId: running });
    await expect(active).toContainText("Stopping active work");
    gate.resolve(); await waitFor(() => !sdk.getState().snapshot?.sessions.find((session) => session.id === running)?.turnId);
    await expect(active.getByRole("button", { name: "Open session Generated active elsewhere", exact: true })).toHaveCount(0);
    await page.getByLabel("Dashboard project", { exact: true }).selectOption("");
    await expect(inProgress).toHaveText("1");
    const before = structuredClone(sdk.getState().snapshot!), question = before.sessions.find((session) => session.id === waiting)!;
    await page.screenshot({ path: info.outputPath("active-sessions-filtered.png"), animations: "disabled" });
    const target = active.getByRole("button", { name: "Open session Generated active question", exact: true });
    await focusByKeyboard(target); await expect(target).toHaveCSS("outline-style", "solid"); await expect(target).toHaveCSS("outline-width", "2px"); await page.keyboard.press("Enter");
    await expect(page.locator(".session-header h1")).toHaveText("Generated active question");
    await expect(page.locator(".session-header h1")).toBeFocused();
    expect(sdk.getState().snapshot!.sessions).toHaveLength(before.sessions.length);
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === waiting)?.turnId).toBe(question.turnId);
    expect(sdk.getState().snapshot!.questions.find((entry) => entry.id === question.pendingQuestionId)).toEqual(before.questions.find((entry) => entry.id === question.pendingQuestionId));
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === held)?.queue).toEqual(before.sessions.find((session) => session.id === held)!.queue);
    expect(fixture.session().draft.text).toBe("Generated preserved dashboard draft.");
    await page.getByRole("navigation", { name: "Projects and sessions", exact: true }).getByRole("button", { name: fixture.session().title, exact: true }).click();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated preserved dashboard draft.");
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
    await fixture.service.close();
    await expect(active).toContainText(/Last observed.*not connected/);
    for (const button of await active.getByRole("button").all()) await expect(button).toBeDisabled();
    expect(fixture.requests).toHaveLength(1);
  } finally { gate.resolve(); await close(app); sdk.disconnect(); await fixture.close(); }
});
