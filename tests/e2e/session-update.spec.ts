import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
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
