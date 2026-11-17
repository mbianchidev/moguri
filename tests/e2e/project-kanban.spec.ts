import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { kanbanPreferences, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { fixtureProvider, setupFixture } from "../fixture.ts";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Generated hidden desktop qualification runs on macOS.");

test("project secondary-click and keyboard menus share Kanban visibility; dragging reorders projects without menu move actions", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const ids: string[] = [];
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    const path = join(fixture.directory, name); await mkdir(path);
    ids.push((await sdk.command({ type: "project.add", path, name })).id!);
  }
  const card = await sdk.issues.create(ids[0]!, { title: "Generated board card", body: "Generated card body.", kind: "feature", phaseId: "backlog", pullRequestUrl: null });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const alpha = page.locator(`.project-name[data-project-id="${ids[0]}"]`);
    await expect(alpha).toBeVisible(); await alpha.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Project actions for Alpha", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Move up", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Move down", exact: true })).toHaveCount(0);
    for (const name of ["Alpha", "Beta", "Gamma"]) await expect(page.getByRole("button", { name: `Kanban for ${name}`, exact: true })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Show Kanban", exact: true }).click();
    await expect(page.getByRole("button", { name: "Kanban for Alpha", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kanban for Beta", exact: true })).toHaveCount(0);
    await alpha.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Hide Kanban", exact: true }).click();
    await expect(page.getByRole("button", { name: "Kanban for Alpha", exact: true })).toHaveCount(0);
    await sdk.refresh(); expect(kanbanPreferences((await sdk.issues.board(ids[0]!)).board).visible).toBe(false);
    await alpha.focus(); await alpha.press("Shift+F10");
    await expect(menu.getByRole("menuitemradio", { name: "Custom project color", exact: true })).toBeFocused();
    await menu.getByRole("menuitem", { name: "Show Kanban", exact: true }).click();
    await page.getByRole("button", { name: "Kanban for Alpha", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kanban", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generated board card", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Work item", exact: true }).click();
    const picker = page.getByRole("combobox", { name: "Kanban work item", exact: true });
    await picker.selectOption(card.id!);
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.projectId === ids[0] && session.purpose === "kanban")?.workItemId).toBe(card.id);
    const source = page.locator(".project-row").filter({ has: page.locator(`.project-name[data-project-id="${ids[2]}"]`) });
    const target = page.locator(".project-row").filter({ has: alpha });
    await source.dragTo(target, { targetPosition: { x: 35, y: 3 } });
    const order = () => {
      const snapshot = fixture.service.controller.snapshot();
      return snapshot.projects.filter((project) => ids.includes(project.id)).sort((a, b) => (snapshot.projectConfigurations.find((configuration) => configuration.projectId === a.id)?.order ?? 0) -
        (snapshot.projectConfigurations.find((configuration) => configuration.projectId === b.id)?.order ?? 0) || a.name.localeCompare(b.name)).map((project) => project.id);
    };
    await expect.poll(order).toEqual([ids[2], ids[0], ids[1]]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Kanban for Alpha", exact: true })).toBeVisible();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.getByRole("navigation", { name: "Projects and sessions" }).screenshot({ path: ".moguri/artifacts/project-kanban-navigation.png" });
    expect(errors).toEqual([]); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Budgets shows originating-provider references and explicit finite-limit consent without provider login or inference", async () => {
  const fixture = await setupFixture({ platform: { pricing: { fetch: async () => new Response(`| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok | $20 / MTok |
`) } } });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Budgets", exact: true }).click();
    const region = page.getByRole("region", { name: "Provider API-equivalent prices", exact: true });
    await expect(region).toContainText("aren't your subscription cost");
    const consent = page.getByLabel("Use API-price estimates for USD limits (not exact billing caps)", { exact: true });
    await expect(consent).not.toBeChecked(); await consent.check();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.budgets.useProviderRatesForLimits).toBe(true);
    expect(fixture.service.controller.snapshot().budgetPolicy.limit).toBeNull();
    await region.getByRole("button", { name: "Refresh anthropic", exact: true }).click();
    await expect(region.getByRole("status")).toContainText("Official reference prices refreshed");
    expect(fixture.service.controller.snapshot().providerPriceRevision).toBe(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("typing continue work in the composer creates one visible autonomous task and exposes its actual PR without changing the parent", async () => {
  const provider = await fixtureProvider({ toolCalls: [
    { name: "run_command", args: { command: "printf 'generated desktop task\\n' > desktop-task.txt && git add -- desktop-task.txt && git -c commit.gpgsign=false commit --no-gpg-sign -m 'Generated desktop task'", timeoutMs: 15000 } },
    { name: "project_work", args: { action: "publish", title: "Generated desktop PR", body: "Generated full PR description." } },
  ] });
  const fixture = await githubApplicationFixture({ provider: provider.provider, ownedNetwork: true });
  await fixture.sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: provider.modelId });
  await fixture.sdk.issues.create(fixture.projectId, { title: "Generated desktop continuation", body: "Generated requested implementation.", kind: "feature", phaseId: "backlog", pullRequestUrl: null });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("continue work");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("dialog", { name: "Continue work", exact: true }).getByRole("button", { name: "Work from Kanban", exact: true }).click();
    const status = page.getByRole("status", { name: "Project work status", exact: true });
    await expect(status).toContainText("Generated desktop continuation");
    await expect(status).toContainText("completed", { timeout: 30000 });
    await expect(prompt).toHaveValue("");
    expect(fixture.session().controls.autonomy).toBe("Manual");
    expect(provider.requests).toHaveLength(2);
    await status.getByRole("button", { name: "Open task", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Generated desktop continuation", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Code change", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project pull requests", exact: true })).toContainText("Generated full PR description.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/project-kanban-continuation.png" });
  } finally { await app.close(); await fixture.close(); await provider.close(); }
});
