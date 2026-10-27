import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Session navigation runs hidden on macOS.");

test("session search fuzzy-matches names across projects and project-free chats without changing the selected context", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "CAP project task" }, fixture.session().revision);
  await sdk.sessions.create(null, "App general task");
  await sdk.sessions.create(null, "Unrelated");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), search = page.getByRole("searchbox", { name: "Search sessions", exact: true });
    await search.fill("aP");
    await expect(page.getByRole("button", { name: "CAP project task", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "App general task", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unrelated", exact: true })).toHaveCount(0);
    await search.fill("UNR");
    await expect(page.getByRole("button", { name: "Unrelated", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "CAP project task", exact: true })).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("custom project color is a split-color pencil swatch instead of extra Custom and Default buttons", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.locator(`.project-name[data-project-id="${fixture.session().projectId}"]`).click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Project actions for project", exact: true });
    const custom = menu.getByRole("menuitemradio", { name: "Custom project color", exact: true });
    await expect(custom).toBeVisible();
    await expect(custom.locator("svg[data-icon='Edit']")).toBeVisible();
    await expect(custom.locator(".project-color-swatch")).toHaveCSS("background-image", /linear-gradient/);
    await expect(menu.getByText("Default color", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("Custom color...", { exact: true })).toHaveCount(0);
    await custom.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("the side-chat panel opens a ready read-only composer with inherited model controls, voice and parent context", async () => {
  const fixture = await setupFixture({ responseMode: "text", reasoning: true }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await sdk.refresh();
  await sdk.sessions.modelOptions(fixture.sessionId, { thinkingEffort: "low" });
  await fixture.send("Generated visible main context."); await fixture.terminal();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Side chat", exact: true }).click();
    const side = page.locator(".side-chat-panel");
    const prompt = side.getByLabel("Side question", { exact: true });
    await expect(prompt).toBeVisible();
    await expect(side.getByRole("button", { name: "Start local dictation", exact: true })).toBeVisible();
    await expect(side.locator("[data-composer-control='model']")).toBeVisible();
    await expect(side).toContainText("Read-only");
    const created = fixture.service.controller.snapshot().sessions.find((session) => session.kind === "side")!;
    expect(created.controls).toEqual(fixture.session().controls);
    await prompt.fill("Generated read-only side question.");
    await side.getByRole("button", { name: "Send", exact: true }).click();
    await expect(side.getByRole("log", { name: "Side chat transcript", exact: true })).toContainText("Generated Copilot response.");
    expect(JSON.stringify(fixture.requests.at(-1)?.messages)).toContain("Generated visible main context.");
    expect(fixture.service.controller.snapshot().sessions.filter((session) => session.kind === "side")).toHaveLength(1);
    expect(created.mode).toBe("read-only");
    await expect(side.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("switching parents while a side chat opens creates the new parent's own read-only composer without waiting for the old parent", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const other = await sdk.sessions.create(fixture.session().projectId, "Generated second parent");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let blocked = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.side" && raw.command.sessionId === fixture.sessionId) {
      blocked = true; await gate.promise;
    }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.locator(`button[data-session-id="${fixture.sessionId}"]`).click();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Side chat", exact: true }).click();
    await expect.poll(() => blocked).toBe(true);
    await page.locator(`button[data-session-id="${other.id}"]`).click();
    await expect(page.locator(".side-chat-panel").getByLabel("Side question", { exact: true })).toBeVisible();
    const current = fixture.service.controller.snapshot().sessions.find((session) => session.kind === "side")!;
    expect(current.createdParentSessionId).toBe(other.id);
    expect(current.mode).toBe("read-only");
    gate.resolve();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.filter((session) => session.kind === "side").length).toBe(2);
    await expect(page.locator(".side-chat-panel").getByRole("combobox", { name: "Question-only side session", exact: true })).toHaveValue(current.id);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("dropping a session on another session nests navigation in projects and project-free chats without inventing context grants", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const pairs: Array<{ source: string; target: string }> = [];
  for (const projectId of [fixture.session().projectId, null]) {
    const target = await sdk.sessions.create(projectId, `Generated target ${projectId ? "project" : "chat"}`);
    const source = await sdk.sessions.create(projectId, `Generated dragged ${projectId ? "project" : "chat"}`);
    pairs.push({ source: source.id!, target: target.id! });
  }
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    for (const pair of pairs) {
      const source = page.locator(`.session-row:has(> button[data-session-id="${pair.source}"])`);
      const target = page.locator(`.session-row:has(> button[data-session-id="${pair.target}"])`);
      await source.dragTo(target);
      await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === pair.source)?.parentSessionId).toBe(pair.target);
      expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === pair.source)?.createdParentSessionId).toBeUndefined();
    }
    expect(fixture.service.controller.snapshot().coordinationLinks).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("dropping a project on another names a folder, starts a captured multi-repo chat and controls group expansion without opening HOME", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const other = join(fixture.directory, "grouped-repository"); await mkdir(other);
  const added = await sdk.command({ type: "project.add", path: other });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    const source = page.locator(`.project-row:has(> button[data-project-id="${fixture.session().projectId}"])`);
    const target = page.locator(`.project-row:has(> button[data-project-id="${added.id}"])`);
    await source.dragTo(target);
    const dialog = page.getByRole("dialog", { name: "New project group", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill("Generated folder");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const folder = page.locator(".project-folder").filter({ hasText: "Generated folder" });
    await expect(folder.locator(".project-row")).toHaveCount(2);
    await folder.getByRole("button", { name: "New chat in Generated folder", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.some((session) => session.repositories?.length === 2)).toBe(true);
    const created = fixture.service.controller.snapshot().sessions.find((session) => session.repositories?.length === 2)!;
    await expect(folder.locator(`button[data-session-id="${created.id}"]`)).toBeVisible();
    await expect(page.getByText("2 captured repositories", { exact: true })).toBeVisible();
    await expect(page.getByText("No workspace access", { exact: true })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Files", exact: true }).click();
    const repositories = page.getByRole("combobox", { name: "Files repository", exact: true });
    await expect(repositories).toHaveValue("");
    await repositories.selectOption(fixture.session().projectId!);
    await expect(page.getByRole("region", { name: "Bound workspace files", exact: true })).toContainText("fixture.txt");
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Terminal repository", exact: true })).toHaveValue("");
    expect(fixture.service.controller.snapshot().terminals.filter((terminal) => terminal.sessionId === created.id)).toHaveLength(0);
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Code change", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose an individual repository chat", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Projects menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Collapse all groups", exact: true }).click();
    await expect(folder).not.toHaveAttribute("open");
    await page.getByRole("button", { name: "Projects menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Expand all groups", exact: true }).click();
    await expect(folder).toHaveAttribute("open", "");
    await folder.locator(":scope > summary").click({ position: { x: 55, y: 12 } });
    await expect(folder).not.toHaveAttribute("open");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("settings use switches and phase grips instead of text Up/Remove controls, saving actual dragged order", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.locator(`.project-name[data-project-id="${fixture.session().projectId}"]`).click();
    const board = page.getByRole("region", { name: "Board configuration", exact: true });
    await expect(board.getByRole("switch", { name: "Show Kanban in this project's sessions", exact: true })).toBeVisible();
    const phases = board.getByRole("list", { name: "Board phases", exact: true });
    const done = phases.getByRole("button", { name: "Reorder Done", exact: true });
    await done.dragTo(phases.locator('.reorder-item:has(button[data-reorder-id="backlog"])'), { targetPosition: { x: 45, y: 2 } });
    await expect(phases.getByRole("listitem").first()).toContainText("done");
    await board.getByRole("button", { name: "Save board configuration", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().boards.find((board) => board.projectId === fixture.session().projectId)?.columns[0]?.id).toBe("done");
    await expect(board.getByRole("button", { name: "Up", exact: true })).toHaveCount(0);
    await expect(board.getByRole("button", { name: "Remove Backlog phase", exact: true }).locator("svg[data-icon='Trash']")).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
