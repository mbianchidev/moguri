import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk, sessionTitle } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

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
