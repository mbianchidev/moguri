import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DraftEditor, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { generatedGit, generatedRepository } from "../fixtures/git.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop navigation uses generated hidden macOS windows.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SKILL_HOME: directory } });

test("search opens explicitly and filters/order reset without changing drafts, grouping or stored session order", async () => {
  const f = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure(); await f.send("Generated finished navigation prompt."); await f.terminal();
  await sdk.sessions.rename(f.sessionId, "Generated finished chat");
  await sdk.sessions.create(null, "Generated older unsent chat");
  await sdk.sessions.create(null, "Generated newer unsent chat");
  const order = sdk.getState().snapshot!.sessions.map((session) => [session.id, session.order]);
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), search = page.getByRole("searchbox", { name: "Search sessions", exact: true });
    const trigger = page.getByRole("button", { name: "Search sessions", exact: true });
    await expect(search).toHaveCount(0); await trigger.click(); await expect(search).toBeFocused();
    await search.fill("Generated older unsent"); await expect(page.getByRole("button", { name: "Generated newer unsent chat", exact: true })).toHaveCount(0);
    await search.press("Escape"); await search.press("Escape"); await expect(search).toHaveCount(0); await expect(trigger).toBeFocused();
    const prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    await prompt.fill("Generated original navigation draft."); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("navigation-controls.png") });
    const project = page.getByRole("region", { name: "Project project", exact: true });
    await project.getByRole("button", { name: "Collapse project project", exact: true }).click();
    await page.getByRole("button", { name: "Filter sessions", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("session-filter-menu.png") });
    await page.getByRole("menu", { name: "Session status filters", exact: true }).getByRole("menuitemcheckbox", { name: "Finished", exact: true }).click();
    await expect(project.getByRole("button", { name: "Generated finished chat", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generated older unsent chat", exact: true })).toHaveCount(0);
    const reset = page.getByRole("button", { name: "Reset session filters and ordering", exact: true });
    await reset.click(); await expect(reset).toHaveCount(0);
    await expect(project.getByRole("button", { name: "Expand project project", exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Filter sessions", exact: true }).click();
    await page.getByRole("menu", { name: "Session status filters", exact: true }).getByRole("menuitemcheckbox", { name: "Error", exact: true }).click();
    await expect(page.getByText("No sessions match these filters. Change a status or reset filters.", { exact: true })).toBeVisible();
    await reset.click();
    const chats = page.getByRole("region", { name: "Chats", exact: true });
    for (const [label, expected] of [["Newest prompt first", "Generated newer unsent chat"], ["Oldest prompt first", "Generated older unsent chat"]] as const) {
      await page.getByRole("button", { name: "Order sessions", exact: true }).click();
      await page.getByRole("menu", { name: "Session ordering", exact: true }).getByRole("menuitemradio", { name: label, exact: true }).click();
      await expect(chats.locator(".session-link").first()).toHaveText(expected);
    }
    await reset.click(); await expect(reset).toHaveCount(0);
    await expect(prompt).toHaveValue("Generated original navigation draft.");
    expect(sdk.getState().snapshot!.sessions.map((session) => [session.id, session.order])).toEqual(order);
    expect(f.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("composer and queue align with the message column at wide/narrow widths and with turn previews open", async () => {
  const f = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure(); await f.send("Generated aligned prompt."); await f.terminal(); await sdk.refresh();
  const editor = new DraftEditor(sdk, f.sessionId, f.session().draft);
  try { editor.edit("Generated held alignment prompt."); await editor.send("queue", true); } finally { editor.dispose(); }
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    for (const [width, height] of [[1280, 900], [840, 620]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.width, size.height), { width, height });
      for (const expanded of [false, true]) {
        await expect(navigation).toHaveClass(expanded ? /expanded/ : /^(?!.*expanded)/);
        const bounds = await page.evaluate(() => {
          const message = document.querySelector<HTMLElement>('.main-pane .message.user')!.getBoundingClientRect();
          return [".main-pane > .composer", ".main-pane > .queue"].map((selector) => {
            const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
            return { left: Math.abs(box.left - message.left), right: Math.abs(box.right - message.right), width: box.width };
          });
        });
        for (const box of bounds) { expect(box.left).toBeLessThanOrEqual(1); expect(box.right).toBeLessThanOrEqual(1); expect(box.width).toBeGreaterThan(150); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        await page.screenshot({ path: test.info().outputPath(`alignment-${width}-${expanded ? "expanded" : "compact"}.png`) });
        await navigation.getByRole("button", { name: "Show turn previews", exact: true }).click();
      }
    }
    expect(f.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("project header shortcuts bind their actual Local folder and repository without opening a real OS window", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await generatedRepository(f.project); await generatedGit(f.project, "remote", "add", "origin", "git@github.com:generated/navigation.git");
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await page.locator(`.project-name[data-project-id="${f.session().projectId}"]`).click();
    const panel = page.getByRole("region", { name: "Per-project settings", exact: true });
    await panel.getByRole("button", { name: "Show local folder", exact: true }).click();
    await expect(panel).toContainText('"opened": false'); await expect(panel).toContainText(f.project);
    await panel.getByRole("button", { name: "Open remote", exact: true }).click();
    await expect(panel).toContainText("https://github.com/generated/navigation");
    await page.screenshot({ path: test.info().outputPath("project-location-actions.png") });
    const input = { profileId: sdk.profileId, projectId: f.session().projectId!, path: `${f.project}-foreign` };
    const error = await page.evaluate(async (value) => {
      try { await window.moguri.projectLocation(value.profileId, value.projectId, value.path, "show-folder"); return "unexpected success"; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    }, input);
    expect(error).toMatch(/changed|original|exact/i);
    await generatedGit(f.project, "remote", "remove", "origin");
    await panel.getByRole("button", { name: "Open remote", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("no supported repository remote");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("global skill folders require exact source confirmation and Save before discovery", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  for (const [folder, name] of [[".agents", "generated-agent-global"], [".moguri", "generated-moguri-global"]]) {
    const root = join(f.directory, folder!, "skills", "generated", "nested"); await mkdir(root, { recursive: true });
    await writeFile(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: Generated global source\n---\nGenerated instructions, not authority.\n`);
  }
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Skills");
    const settings = page.getByRole("region", { name: "Skill gateway settings", exact: true });
    const agents = settings.getByRole("switch", { name: "Use ~/.agents/skills", exact: true });
    const review = page.getByRole("dialog", { name: "Confirm global skill folder", exact: true });
    await agents.click(); await expect(review).toContainText(join(f.directory, ".agents", "skills"));
    await page.screenshot({ path: test.info().outputPath("global-skill-confirmation.png") });
    expect(sdk.settings.get()!.values.skillSources ?? []).toHaveLength(0);
    await review.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(agents).not.toBeChecked();
    for (const name of ["~/.agents/skills", "~/.moguri/skills"]) {
      await settings.getByRole("switch", { name: `Use ${name}`, exact: true }).click();
      await review.getByRole("button", { name: "Use this folder", exact: true }).click();
      expect(sdk.settings.get()!.values.skillSources ?? []).toHaveLength(name === "~/.agents/skills" ? 0 : 1);
      await settings.getByRole("button", { name: "Save skill sources", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    }
    await settings.getByRole("button", { name: "Find skills", exact: true }).click();
    await expect(settings).toContainText("generated-agent-global"); await expect(settings).toContainText("generated-moguri-global");
    expect(sdk.settings.get()!.values.skillSources).toHaveLength(2);
    expect(f.service.controller.snapshot().skillAdmissions).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
    await page.reload(); await openSettingsSection(page, "Skills"); await expect(agents).toBeChecked();
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
