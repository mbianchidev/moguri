import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual hidden desktop qualification is macOS-only.");
const screenshots = process.env.MOGURI_SKILLS_CAPTURES;

test("Customize installs and toggles skills, lists toolsets and opens a project-free editable script request; Artifacts lists project outputs with their chat", async () => {
  test.setTimeout(90_000);
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const projectId = f.session().projectId!, projectPath = f.service.controller.snapshot().projects.find((project) => project.id === projectId)!.path;
  const market = join(f.directory, "generated-market", "generated-tab-skill");
  await mkdir(market, { recursive: true });
  await writeFile(join(market, "SKILL.md"), "---\nname: generated-tab-skill\ndescription: Generated marketplace skill for the Skills tab\n---\nUse generated fixtures.\n");
  await mkdir(join(f.directory, "project", "dist"), { recursive: true });
  await writeFile(join(f.directory, "project", "dist", "Generated.dmg"), "generated dmg");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, evolution: { enabled: true },
    skillSources: [{ id: "generated-market", name: "Generated market", kind: "local", path: join(f.directory, "generated-market"), enabled: true }] }, settings.revision);
  await sdk.sessions.rename(f.sessionId, "Generated artifact chat");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.setViewportSize({ width: 1280, height: 860 });
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await resources.getByRole("button", { name: "Customize", exact: true }).click();
    const workspace = page.getByRole("region", { name: "Customize", exact: true });
    await expect(workspace.getByRole("tab")).toHaveText(["Skills", "Marketplace", "Tools"]);
    await expect(workspace).toContainText("No skills installed yet");

    await workspace.getByRole("tab", { name: "Marketplace", exact: true }).click();
    await workspace.getByRole("combobox", { name: "Install skills into", exact: true }).selectOption({ label: "project" });
    await workspace.getByRole("button", { name: "Find skills", exact: true }).click();
    await workspace.getByRole("button", { name: "Install generated-tab-skill", exact: true }).click();
    await expect(workspace).toContainText("generated-tab-skill is installed in project and off");
    const installed = await waitFor(() => f.service.controller.snapshot().registry.find((entry) => entry.name === "generated-tab-skill"));
    expect([installed.projectId, installed.enabled]).toEqual([projectId, false]);
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-marketplace.png") });

    await workspace.getByRole("tab", { name: "Skills", exact: true }).click();
    await expect(workspace.getByRole("tab", { name: "Skills", exact: true })).toHaveAttribute("aria-selected", "true");
    await workspace.getByRole("switch", { name: "Enable skill generated-tab-skill", exact: true }).click();
    await waitFor(() => f.service.controller.snapshot().registry.find((entry) => entry.id === installed.id)?.enabled === true);
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-installed.png"), animations: "disabled" });

    await workspace.getByRole("tab", { name: "Tools", exact: true }).click();
    await expect(workspace.locator("details.toolset summary").first()).toContainText("Files");
    await expect(workspace).toContainText("Foundational scripts");
    await workspace.getByRole("textbox", { name: "Generated script name", exact: true }).fill("markdown_into_pdf");
    await workspace.getByRole("textbox", { name: "What the generated script should do", exact: true }).fill("turn a Markdown file into a PDF");
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-tools.png"), fullPage: true });
    const before = f.service.controller.snapshot().sessions.length, requests = f.requests.length;
    await workspace.getByRole("button", { name: "Open a chat with this request", exact: true }).click();
    const created = await waitFor(() => f.service.controller.snapshot().sessions.length > before ? f.service.controller.snapshot().sessions.find((session) => session.title === "Write the markdown_into_pdf tool") : undefined);
    expect(created.projectId).toBeNull();
    await waitFor(() => f.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.draft.text.includes("propose_script"));
    await expect(page.locator(".app-shell")).toHaveAttribute("data-session-id", created.id);
    expect(f.requests.length).toBe(requests);

    await resources.getByRole("button", { name: "Artifacts", exact: true }).click();
    const library = page.getByRole("region", { name: "Artifacts library", exact: true });
    await library.getByRole("combobox", { name: "Artifacts project", exact: true }).selectOption(projectId);
    const item = library.locator(".artifact-item", { hasText: "Generated.dmg" });
    await expect(item).toContainText("dist/Generated.dmg");
    await library.getByRole("button", { name: /Builds and installers/ }).click();
    await expect(library.locator(".artifact-item")).toHaveCount(1);
    if (screenshots) await page.screenshot({ path: join(screenshots, "artifacts.png") });
    await item.getByRole("button", { name: "Show in Finder", exact: true }).click();
    await expect(library).toContainText(`Located ${join(projectPath, "dist", "Generated.dmg")}`);

    await resources.getByRole("button", { name: "Automations", exact: true }).click();
    await page.getByRole("switch", { name: "Check for repeated tasks automatically", exact: true }).click();
    await waitFor(() => f.service.controller.snapshot().settings.values.automations?.toolSuggestions?.enabled === true);
    if (screenshots) await page.screenshot({ path: join(screenshots, "automations.png") });
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("Artifacts deletes selected saved notes and moves selected files to the Trash only after confirmation, keeping chats and other files", async () => {
  test.setTimeout(60_000);
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const projectId = f.session().projectId!, dist = join(f.directory, "project", "dist"), trash = join(f.directory, "generated-trash");
  await mkdir(dist, { recursive: true });
  for (const name of ["Generated-a.dmg", "Generated-b.zip", "Generated-keep.pdf"]) await writeFile(join(dist, name), `generated ${name}`);
  const note = await sdk.artifacts.create(f.sessionId, { kind: "report", name: "Generated deletable note", text: "Generated note body.", projectId });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_TRASH_DIR: trash } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Artifacts", exact: true }).click();
    const library = page.getByRole("region", { name: "Artifacts library", exact: true });
    await library.getByRole("combobox", { name: "Artifacts project", exact: true }).selectOption(projectId);
    await expect(library.locator(".artifact-item", { hasText: "Generated-keep.pdf" })).toBeVisible();
    const deleteSelected = library.getByRole("button", { name: /^Delete selected/ });
    await expect(deleteSelected).toBeDisabled();

    await library.getByRole("button", { name: "Move Generated-a.dmg to the Trash", exact: true }).click();
    const confirm = library.getByRole("alertdialog", { name: "Confirm artifact deletion", exact: true });
    await expect(confirm).toContainText("Move 1 file to the Trash?");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    expect(await readdir(dist)).toContain("Generated-a.dmg");

    await library.getByRole("checkbox", { name: "Select Generated-a.dmg", exact: true }).check();
    await library.getByRole("checkbox", { name: "Select Generated-b.zip", exact: true }).check();
    await library.getByRole("checkbox", { name: "Select Generated deletable note", exact: true }).check();
    await expect(deleteSelected).toHaveText("Delete selected (3)");
    await deleteSelected.click();
    await expect(confirm).toContainText("Move 2 files to the Trash and delete 1 saved note?");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(library.getByRole("status")).toContainText("Moved 2 files to the Trash. Deleted 1 saved note.");
    expect((await readdir(dist)).sort()).toEqual(["Generated-keep.pdf"]);
    expect((await readdir(trash)).map((name) => name.replace(/^[0-9a-f-]{36}-/, "")).sort()).toEqual(["Generated-a.dmg", "Generated-b.zip"]);
    await waitFor(() => !f.service.controller.snapshot().artifacts.some((artifact) => artifact.id === note.id));
    await expect(library.locator(".artifact-item", { hasText: "Generated-a.dmg" })).toHaveCount(0);
    await expect(library.locator(".artifact-item", { hasText: "Generated-keep.pdf" })).toBeVisible();
    expect(f.service.controller.snapshot().sessions.some((session) => session.id === f.sessionId)).toBe(true);
    expect(f.requests.length).toBe(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("Artifacts never offers or performs Trash for files in a workspace folder's own read-only checkout", async () => {
  test.setTimeout(60_000);
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const root = join(f.directory, "generated-folder"), alpha = join(root, "alpha"), trash = join(f.directory, "generated-trash");
  await mkdir(join(alpha, "dist"), { recursive: true });
  await writeFile(join(alpha, "fixture.txt"), "generated original\n"); await writeFile(join(alpha, "dist", "Generated.dmg"), "generated dmg");
  initializeGeneratedRepository(alpha);
  await sdk.projects.folders.import((await sdk.projects.folders.preview(root)).preview, ["alpha"], false, true);
  const project = await waitFor(() => f.service.controller.snapshot().projects.find((value) => value.name === "alpha" && value.workspaceFolderId));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_TRASH_DIR: trash } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button", { name: "Artifacts", exact: true }).click();
    const library = page.getByRole("region", { name: "Artifacts library", exact: true });
    await library.getByRole("combobox", { name: "Artifacts project", exact: true }).selectOption(project.id);
    const item = library.locator(".artifact-item", { hasText: "Generated.dmg" });
    await expect(item.getByRole("button", { name: "Show in Finder", exact: true })).toBeVisible();
    await expect(item.getByRole("checkbox")).toHaveCount(0);
    await expect(item.getByRole("button", { name: "Move Generated.dmg to the Trash", exact: true })).toHaveCount(0);
    const path = join(await realpath(alpha), "dist", "Generated.dmg");
    const results = await page.evaluate(([profileId, projectId, file]) => window.moguri.trashArtifacts(profileId, projectId, [file]), [sdk.profileId, project.id, path] as const);
    expect(results).toEqual([{ path, trashed: false, error: expect.stringContaining("workspace folder") }]);
    expect(await readdir(join(alpha, "dist"))).toEqual(["Generated.dmg"]);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
