import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { kanbanPreferences, MoguriSdk, sessionTitle } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { githubBoardFixture } from "../fixtures/github-board.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
test.skip(process.platform !== "darwin", "Workspace actions use generated hidden macOS windows.");

test("session lists page ten project-free roots, five project roots and five children without counting children as roots", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const project = sdk.getState().snapshot!.projects.find((entry) => entry.id === fixture.session().projectId)!;
  const roots = [fixture.sessionId];
  for (let index = 1; index < 8; index++) roots.push((await sdk.sessions.create(project.id, `Generated project root ${index}`)).id!);
  for (let index = 0; index < 12; index++) await sdk.sessions.create(null, `Generated root chat ${index}`);
  for (let index = 0; index < 7; index++) await sdk.sessions.spawn(fixture.sessionId, "agent", `Generated nested child ${index}`);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const chats = page.getByRole("region", { name: "Chats", exact: true });
    const projects = page.getByRole("region", { name: `Project ${project.name}`, exact: true });
    const projectRoots = projects.locator(roots.map((id) => `button[data-session-id="${id}"]`).join(","));
    await expect(chats.getByRole("button", { name: /^Generated root chat / })).toHaveCount(10);
    await expect(projectRoots).toHaveCount(5);
    await expect(projects.getByRole("button", { name: /^Generated nested child / })).toHaveCount(5);
    const moreChats = chats.getByRole("button", { name: "Show more chats", exact: true });
    await moreChats.focus(); await page.keyboard.press("Enter");
    await expect(chats.getByRole("button", { name: /^Generated root chat / })).toHaveCount(12);
    await projects.getByRole("button", { name: `Show more sessions in ${project.name}`, exact: true }).click();
    await expect(projectRoots).toHaveCount(8);
    await projects.getByRole("button", { name: `Show more subsessions of ${fixture.session().title}`, exact: true }).click();
    await expect(projects.getByRole("button", { name: /^Generated nested child / })).toHaveCount(7);
    expect(sdk.getState().snapshot!.sessions.filter((session) => session.parentSessionId === fixture.sessionId)).toHaveLength(7);
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("an individual project collapses only its navigation sessions and remains expandable and searchable", async () => {
  const fixture = await setupFixture(), project = fixture.service.controller.snapshot().projects[0]!, app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), section = page.getByRole("region", { name: `Project ${project.name}`, exact: true });
    const session = section.getByRole("button", { name: fixture.session().title, exact: true });
    await expect(session).toBeVisible();
    await section.getByRole("button", { name: `Collapse project ${project.name}`, exact: true }).click();
    await expect(session).not.toBeVisible();
    await expect(section.getByRole("button", { name: project.name, exact: true })).toBeVisible();
    await section.getByRole("button", { name: `Expand project ${project.name}`, exact: true }).focus();
    await page.keyboard.press("Enter"); await expect(session).toBeVisible();
    await section.getByRole("button", { name: `Collapse project ${project.name}`, exact: true }).click();
    await page.getByRole("searchbox", { name: "Search sessions", exact: true }).fill(sessionTitle(fixture.session(), 160, "New chat"));
    await expect(session).toBeVisible();
    expect(fixture.service.controller.snapshot().sessions[0]!.id).toBe(fixture.sessionId);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("copy icons acknowledge only completed clipboard writes and surface failures without optimistic success", async () => {
  const text = "Generated clipboard acknowledgement.";
  const fixture = await setupFixture({ responseMode: "text", replyText: text });
  await fixture.configure(); await fixture.send("Generated copy acknowledgement prompt."); await fixture.terminal();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await waitForWorkspace(page);
    await app.evaluate(({ ipcMain }, expected) => {
      const gate = Promise.withResolvers<void>();
      ipcMain.once("generated-copy-release", () => gate.resolve());
      ipcMain.removeHandler("moguri:copy-text");
      ipcMain.handle("moguri:copy-text", async (_event, value: unknown) => {
        if (value !== expected) throw new Error("Generated copy received another source.");
        await gate.promise;
      });

    }, text);
    const copy = page.getByRole("button", { name: "Copy response", exact: true });
    await copy.click(); await expect(copy).toBeFocused(); await expect(copy.locator("svg")).toHaveAttribute("data-icon", "Copy");
    await app.evaluate(({ ipcMain }) => { ipcMain.emit("generated-copy-release"); });
    await expect(copy.locator("svg")).toHaveAttribute("data-icon", "Check");
    await expect(page.getByRole("status").filter({ hasText: "Copied" })).toContainText("Copied");
    await expect(copy.locator("svg")).toHaveAttribute("data-icon", "Copy");
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:copy-text");
      ipcMain.handle("moguri:copy-text", () => { throw new Error("Generated clipboard unavailable."); });
    });
    await copy.click(); await expect(page.getByRole("alert")).toContainText("Generated clipboard unavailable.");
    await expect(copy.locator("svg")).toHaveAttribute("data-icon", "Copy");
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.evaluate(({ ipcMain }) => { ipcMain.emit("generated-copy-release"); }); await app.close(); await fixture.close(); }
});

test("inline code stays ordinary text while fenced Markdown alone has an explicit exact copy button", async () => {
  const path = "/generated/scripts/qualify.mjs", code = "node /generated/scripts/qualify.mjs\nprintf 'Generated exact output'\n";
  const text = `Run \`${path}\`.\n\n\`\`\`sh\n${code}\`\`\`\n\n[\`${path}\`](https://example.invalid/generated-script)`;
  const thoughtCode = "const generated = true;\n";
  const fixture = await setupFixture({ responseMode: "text", replyText: text, reasoning: true,
    reasoningText: `Consider \`MoguriFlight\` and \`<use href>\` as ordinary inline examples.\n\n\`\`\`js\n${thoughtCode}\`\`\`` });
  await fixture.configure(); await fixture.send("Generated Markdown snippet request."); await fixture.terminal();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:copy-text"); ipcMain.removeHandler("moguri:open-external");
      const copies: string[] = [], links: string[] = [];
      ipcMain.handle("moguri:copy-text", (_event, value: unknown) => { if (typeof value !== "string") throw new Error("Generated snippet is not text."); copies.push(value); });
      ipcMain.handle("moguri:open-external", (_event, value: unknown) => { if (typeof value !== "string") throw new Error("Generated link is not text."); links.push(value); });
      ipcMain.on("generated-snippet-observation", (_event, reply: (value: { copies: string[]; links: string[] }) => void) => reply({ copies, links }));
    });
    const response = page.locator(".message.assistant").last(), copies = response.getByRole("button", { name: "Copy code block", exact: true });
    await expect(copies).toHaveCount(1);
    await expect(response.locator("a button")).toHaveCount(0);
    const inline = response.locator("p > code");
    await expect(inline.getByRole("button")).toHaveCount(0);
    await inline.click();
    await copies.focus(); await page.keyboard.press("Enter");
    await expect(copies.locator("svg")).toHaveAttribute("data-icon", "Check");
    const thought = page.locator("details.activity-thought");
    await thought.locator("summary").press("Enter");
    const inlineThought = thought.locator("p > code").first();
    await expect(inlineThought.getByRole("button")).toHaveCount(0); await inlineThought.click();
    const thoughtCopy = thought.getByRole("button", { name: "Copy code block", exact: true });
    await expect(thoughtCopy.locator("svg")).toHaveAttribute("data-icon", "Copy");
    await thoughtCopy.press("Enter");
    for (const control of [copies, thoughtCopy]) {
      await expect(control.locator("svg")).toBeVisible();
      const placement = await control.evaluate((button) => {
        const block = button.closest("pre");
        if (!block) throw new Error("The generated fenced-code control has no owning block.");
        const box = block.getBoundingClientRect(), copy = button.getBoundingClientRect();
        return { top: copy.top - box.top, right: box.right - copy.right };
      });
      expect(placement.top).toBeGreaterThanOrEqual(0); expect(placement.top).toBeLessThanOrEqual(12);
      expect(placement.right).toBeGreaterThanOrEqual(0); expect(placement.right).toBeLessThanOrEqual(12);
    }
    await response.locator("a > code").click();
    const values = await app.evaluate(({ ipcMain }) => new Promise<{ copies: string[]; links: string[] }>((resolve) => { ipcMain.emit("generated-snippet-observation", null, resolve); }));
    expect(values).toEqual({ copies: [code, thoughtCode], links: ["https://example.invalid/generated-script"] });
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); await fixture.close(); }
});

test("Kanban Add item aligns its plus with the label and still creates in the chosen phase", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Kanban for project", exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    const add = board.getByRole("button", { name: "Add item to In progress", exact: true });
    const offset = await add.evaluate((button) => {
      const icon = button.querySelector("svg")?.getBoundingClientRect();
      const node = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Add item"));
      if (!icon || !node) throw new Error("Generated Add item control lacks its icon or text.");
      const range = document.createRange(); range.selectNodeContents(node); const text = range.getBoundingClientRect();
      return Math.abs(icon.top + icon.height / 2 - text.top - text.height / 2);
    });
    expect(offset).toBeLessThanOrEqual(2);
    await add.click();
    const title = board.getByRole("textbox", { name: "New item in In progress", exact: true });
    await title.fill("Generated aligned item"); await title.press("Enter");
    await expect(board.getByRole("region", { name: "In progress issues", exact: true }).getByRole("button", { name: "Generated aligned item", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("the project menu hides a synced Kanban without recapturing a stale GitHub binding or removing cards", async () => {
  const fixture = await githubBoardFixture();
  await fixture.configure(true); expect((await fixture.refresh()).status).toBe("completed");
  const configuration = (await fixture.sdk.projects.configuration(fixture.projectId)).configuration;
  await fixture.sdk.projects.organize(fixture.projectId, { folderId: configuration.folderId, color: "#3b82f6", order: configuration.order }, configuration.revision);
  const original = await fixture.sdk.issues.board(fixture.projectId), calls = fixture.calls.length, reads = fixture.reads.length;
  const project = fixture.service.controller.snapshot().projects.find((project) => project.id === fixture.projectId)!, app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), section = page.getByRole("region", { name: `Project ${project.name}`, exact: true });
    await section.getByRole("button", { name: `Project actions for ${project.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Hide Kanban", exact: true }).click();
    await expect.poll(async () => kanbanPreferences((await fixture.sdk.issues.board(fixture.projectId)).board).visible).toBe(false);
    await expect(section.getByRole("button", { name: `Kanban for ${project.name}`, exact: true })).not.toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const hidden = await fixture.sdk.issues.board(fixture.projectId);
    expect(hidden.board.githubSource).toEqual(original.board.githubSource); expect(hidden.issues).toEqual(original.issues);
    expect(fixture.calls).toHaveLength(calls); expect(fixture.reads).toHaveLength(reads);
  } finally { await app.close(); await fixture.close(); }
});

test("project groups expose keyboard colors and ungroup into the standard list while their captured chat stays reachable", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const path = join(fixture.directory, "generated-group-member"); await mkdir(path);
  const first = fixture.session().projectId!, second = (await sdk.projects.add(path)).id!;
  const group = await sdk.projects.group("Generated group controls", [{ projectId: first, revision: 0 }, { projectId: second, revision: 0 }]);
  const chat = await sdk.sessions.createFolder(group.id!, "Generated retained group chat");
  const original = fixture.service.controller.snapshot().sessions.find((session) => session.id === chat.id)!.repositories;
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), folder = page.locator("details.project-folder").filter({ hasText: "Generated group controls" });
    const actions = folder.getByRole("button", { name: "Project group actions for Generated group controls", exact: true });
    await actions.press("Enter");
    const menu = page.getByRole("menu", { name: "Project group actions for Generated group controls", exact: true });
    const violet = menu.getByRole("menuitemradio", { name: "Violet", exact: true });
    await violet.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().projectFolders.find((folder) => folder.id === group.id)?.color).toBe("#a855f7");
    await expect(folder.locator('summary .folder-icon > svg[data-icon="Files"]')).toHaveCSS("color", "rgb(168, 85, 247)");
    await actions.click(); await menu.getByRole("menuitemradio", { name: "Custom group color", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Project group color", exact: true });
    await dialog.getByLabel("Custom group color", { exact: true }).fill("#1f72a3"); await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().projectFolders.find((folder) => folder.id === group.id)?.color).toBe("#1f72a3");
    await actions.focus(); await page.keyboard.press("Enter"); await menu.getByRole("menuitem", { name: "Ungroup", exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(folder).toHaveCount(0); await expect(page.getByRole("button", { name: "Projects menu", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: "Chats", exact: true }).getByRole("button", { name: "Generated retained group chat", exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().projectConfigurations.filter((entry) => [first, second].includes(entry.projectId)).every((entry) => entry.folderId === null)).toBe(true);
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === chat.id)!.repositories).toEqual(original);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a policy explanation offers real keyboard navigation to its exact setting without granting permission or losing a saved prompt", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.command({ type: "policy.set", allowedEnvs: ["Sandbox", "Remote"] });
  const policy = structuredClone(sdk.getState().snapshot!.policy), text = "Generated preserved policy-navigation draft.";
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill(text);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    const why = page.getByRole("button", { name: "Why Local is unavailable", exact: true });
    await expect(why).toBeVisible(); await why.focus(); await page.keyboard.press("Enter");
    const hint = page.getByRole("region", { name: "Why Local is unavailable", exact: true });
    const policyLink = hint.getByRole("button", { name: "Open execution policy", exact: true });
    await expect(hint).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(policyLink).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(hint).toBeVisible(); await expect(why).toBeFocused();
    await page.keyboard.press("Tab"); await expect(policyLink).toBeFocused();
    await page.keyboard.press("Tab"); await expect(hint).toBeVisible();
    await expect(page.getByRole("button", { name: "Sandbox Set up SendBox", exact: true })).toBeFocused();
    await policyLink.focus();
    await page.keyboard.press("Escape"); await expect(hint).not.toBeVisible(); await expect(why).toBeFocused();
    await why.click(); await expect(hint).toBeVisible(); await page.mouse.move(2, 2); await expect(hint).toBeVisible();
    await policyLink.click();
    const heading = page.getByRole("heading", { name: "Allowed execution environments", exact: true });
    await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
    await expect(page.getByRole("combobox", { name: "Global allowed environments", exact: true })).toHaveValue("protected");
    expect(fixture.session().draft.text).toBe(text); expect(fixture.service.controller.snapshot().policy).toEqual(policy);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the disabled Local clone explanation can leave its own modal and focus execution policy without a clone or login", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.command({ type: "policy.set", allowedEnvs: ["Remote"] });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "New", exact: true }).click();
    const start = page.getByRole("dialog", { name: "New", exact: true });
    await expect(start.getByRole("button", { name: "Clone repository", exact: true })).toBeDisabled();
    await start.getByRole("button", { name: "Why cloning is unavailable", exact: true }).focus(); await page.keyboard.press("Enter");
    const hint = page.getByRole("region", { name: "Why cloning is unavailable", exact: true });
    await hint.getByRole("button", { name: "Open execution policy", exact: true }).click();
    await expect(start).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Allowed execution environments", exact: true })).toBeFocused();
    expect(fixture.service.controller.snapshot().policy.allowedEnvs).toEqual(["Remote"]);
    expect(fixture.service.controller.snapshot().jobs.some((job) => job.kind === "project.clone")).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

for (const scope of ["profile", "global"] as const) test(`the ${scope} hard-cap hint focuses the actual policy and never removes its accounting`, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const limit = { basis: "estimate" as const, tokens: 10000 };
  if (scope === "profile") await sdk.budgets.policy(limit, sdk.getState().snapshot!.budgetPolicy.revision, true);
  else {
    const { catalog } = await sdk.profiles.list();
    await sdk.profiles.globalBudget(limit, catalog.globalBudget.revision, true);
  }
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    await page.getByRole("button", { name: `About ${scope} budget policy`, exact: true }).focus(); await page.keyboard.press("Enter");
    const hint = page.getByRole("region", { name: `About ${scope} budget policy`, exact: true });
    await hint.getByRole("button", { name: `Open ${scope} budget policy`, exact: true }).click();
    await expect(page.getByRole("heading", { name: scope === "profile" ? "Current-profile hard policy" : "Global hard policy", exact: true })).toBeFocused();
    await sdk.refresh();
    expect(scope === "profile" ? sdk.getState().snapshot!.budgetPolicy.limit : sdk.getState().snapshot!.globalBudgetPolicy!.limit).toEqual(limit);
    expect(fixture.service.controller.snapshot().budgetEntries).toHaveLength(0); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("policy navigation never discards an unsaved session budget edit hidden behind compact usage", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.budgets.policy({ basis: "estimate", tokens: 10000 }, sdk.getState().snapshot!.budgetPolicy.revision, true);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    await page.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    await page.getByRole("combobox", { name: "session budget mode", exact: true }).selectOption("limited");
    const tokenCap = page.getByRole("spinbutton", { name: "session token cap", exact: true });
    await tokenCap.fill("23456");
    await page.getByRole("button", { name: "Back to compact usage", exact: true }).click();
    await page.getByRole("button", { name: "About profile budget policy", exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("tooltip")).toContainText("Save or reload the session budget edit");
    await expect(page.getByRole("button", { name: "Open profile budget policy", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    await expect(tokenCap).toHaveValue("23456");
    expect(fixture.session().controls.budget.kind).toBe("unlimited"); expect(fixture.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Reload budget", exact: true }).click();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
