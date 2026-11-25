import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { generatedRepository } from "../fixtures/git.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Desktop interaction qualification is macOS-only.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });

test("sidebar rail counts open their owned views, preserve edits and expose background agents without starting a user console", async () => {
  const fixture = await setupFixture({ responseMode: "text", taskProgress: { action: "plan", title: "Generated shortcut task",
    steps: [{ text: "Inspect generated source", status: "done" }, { text: "Implement generated change", status: "in_progress" }, { text: "Review generated result", status: "pending" }] },
    platform: { integrations: { fetch: async () => Response.json({ number: 66, html_url: "https://github.com/generated/project/pull/66",
      state: "open", draft: true, merged: false, merged_at: null }) } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    await generatedRepository(fixture.project);
    await writeFile(join(fixture.project, "fixture.txt"), "Generated replacement.\nGenerated addition.\n");
    await mkdir(join(fixture.project, "docs")); await writeFile(join(fixture.project, "docs/plan.md"), "Generated workspace plan.\n");
    await fixture.configure(); await fixture.send("generated task progress shortcuts"); await fixture.terminal(); await sdk.refresh();
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, subagents: { ...settings.values.subagents, enabled: true } }, settings.revision);
    const created = await sdk.subagents.run(fixture.sessionId, "generated slow background subagent");
    const child = await waitFor(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id && session.status === "running"));
    app = await launch(fixture.directory);
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    const pane = page.getByRole("complementary", { name: "Session sidebar", exact: true }), prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    const code = rail.getByRole("button", { name: "Code change", exact: true }), plan = rail.getByRole("button", { name: "Plan", exact: true });
    const terminal = rail.getByRole("button", { name: "Terminal", exact: true });
    await expect(page.getByRole("navigation", { name: "Session shortcuts", exact: true })).toHaveCount(0);
    await expect(code.locator(".panel-badge")).toHaveText("2");
    await expect(plan.locator(".panel-badge")).toHaveText("3");
    await expect(terminal.locator(".panel-badge")).toHaveText("1");
    await expect(rail.getByRole("button", { name: "Insights", exact: true }).locator(".panel-badge")).toHaveCount(0);
    const requests = fixture.requests.length;
    await prompt.fill("Generated saved shortcut draft.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    for (const [width, height] of [[1280, 900], [840, 620]] as const) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size.width, size.height), { width, height });
      expect(await rail.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll(".panel-badge")].every((badge) => {
          const item = badge.getBoundingClientRect();
          return item.left >= bounds.left && item.right <= bounds.right;
        });
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`session-rail-badges-${width}.png`) });
    }
    await code.click();
    const change = pane.getByRole("region", { name: "Session code change", exact: true });
    await expect(change).toHaveAttribute("data-code-change", "changes");
    await expect(pane.locator(".unified-diff")).toContainText("Generated addition.");
    await sdk.sessions.organize(fixture.sessionId, { prUrl: "https://github.com/generated/project/pull/66" }, fixture.session().revision);
    await expect(change).toHaveAttribute("data-code-change", "pull-request");
    await expect(change).toContainText("https://github.com/generated/project/pull/66");
    await plan.click();
    await expect(pane.getByRole("region", { name: "Model task plan", exact: true })).toContainText("Review generated result");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("session-plan-840.png") });
    await pane.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    const planFile = pane.getByRole("textbox", { name: "Project plan", exact: true });
    await expect(planFile).toHaveValue("Generated workspace plan.\n"); await planFile.fill("Generated unsaved workspace edit.");
    await terminal.click();
    await expect(planFile).toHaveValue("Generated unsaved workspace edit.");
    await expect(page.getByRole("tab", { name: "Agent", exact: true })).toHaveCount(0);
    await pane.getByRole("button", { name: "Reload plan", exact: true }).click(); await expect(planFile).toHaveValue("Generated workspace plan.\n");
    await terminal.press("Enter");
    await expect(pane.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(pane.getByRole("region", { name: "Background subagents", exact: true })).toContainText(child.title);
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveCount(0);
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(0);
    await expect(prompt).toHaveValue("Generated saved shortcut draft.");
    await pane.getByRole("button", { name: `Open background agent ${child.title}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: child.title, exact: true })).toBeVisible();
    await expect(pane.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(0);
    expect(fixture.session().draft.text).toBe("Generated saved shortcut draft.");
    expect(fixture.requests).toHaveLength(requests);
  } finally { await app?.close(); sdk.disconnect(); await fixture.close(); }
});

test("a late original-root diff never becomes another chat's change count and project-free chats keep only chat panels", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), gate = Promise.withResolvers<void>();
  await generatedRepository(fixture.project); await writeFile(join(fixture.project, "fixture.txt"), "Generated old-root change.\n");
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let entered = false, settled = false;
  fixture.service.controller.platform.query = async (...args: Parameters<typeof query>) => {
    if (args[0].type !== "session.git" || args[0].sessionId !== fixture.sessionId) return query(...args);
    entered = true; await gate.promise;
    try { return await query(...args); } finally { settled = true; }
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect.poll(() => entered).toBe(true);
    const other = await sdk.sessions.create(null, "Generated alternate metadata");
    await page.locator(".session-link").filter({ hasText: "Generated alternate metadata" }).click();
    await expect(page.locator(".session-header")).toHaveAttribute("data-session-id", other.id!);
    const rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    gate.resolve(); await expect.poll(() => settled).toBe(true);
    await expect.poll(() => rail.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(["Terminal", "Browser", "Insights", "Plan", "Side chat"]);
    await expect(rail.locator(".panel-badge")).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.platform.query = query; await app.close(); sdk.disconnect(); await fixture.close(); }
});
