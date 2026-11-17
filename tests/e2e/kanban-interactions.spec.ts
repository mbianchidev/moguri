import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { kanbanPreferences, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { githubBoardFixture } from "../fixtures/github-board.ts";
import { showKanban } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Generated Kanban desktop interactions run hidden on macOS.");

test("each column creates its own item while the toolbar exposes synchronization instead of action buttons", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await showKanban(sdk, fixture.session().projectId!);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Kanban for project", exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    await expect(board).toBeVisible();
    await expect(board.getByRole("button", { name: "New issue", exact: true })).toHaveCount(0);
    await expect(board.getByRole("button", { name: "Continue work", exact: true })).toHaveCount(0);
    await expect(board.getByRole("button", { name: "Refresh linked PRs", exact: true })).toHaveCount(0);
    const sync = board.getByRole("switch", { name: "Sync with GitHub", exact: true });
    await expect(sync).toBeChecked(); await sync.uncheck();
    await expect.poll(() => fixture.service.controller.snapshot().boards.find((value) => value.projectId === fixture.session().projectId)?.autoRefreshPrs).toBe(false);
    for (const phase of ["Backlog", "In progress", "Review", "Done"]) await expect(board.getByRole("button", { name: `Add item to ${phase}`, exact: true })).toBeVisible();
    await board.getByRole("button", { name: "Add item to In progress", exact: true }).click();
    const title = board.getByRole("textbox", { name: "New item in In progress", exact: true });
    await title.fill("Generated per-column task"); await title.press("Enter");
    await expect(board.getByRole("region", { name: "In progress issues", exact: true }).getByRole("button", { name: "Generated per-column task", exact: true })).toBeVisible();
    const card = (await sdk.issues.board(fixture.session().projectId!)).issues.find((value) => value.title === "Generated per-column task");
    expect(card?.phaseId).toBe("in-progress"); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("native card drags reorder their column and move to another phase without changing their content", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const projectId = fixture.session().projectId!;
  const { board: initial } = await sdk.issues.board(projectId);
  await sdk.issues.configure(projectId, { ...initial, autoRefreshPrs: false, kanban: { ...kanbanPreferences(initial), visible: true } }, initial.revision);
  const ids: string[] = [];
  for (const title of ["Generated first", "Generated dragged", "Generated review"]) ids.push((await sdk.issues.create(projectId, {
    title, body: "Generated immutable drag source.", kind: "feature", phaseId: title === "Generated review" ? "review" : "backlog", pullRequestUrl: null,
  })).id!);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Kanban for project", exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    await expect(board).toBeVisible();
    const dragged = board.getByRole("article", { name: "Card #2: Generated dragged", exact: true });
    const first = board.getByRole("article", { name: "Card #1: Generated first", exact: true });
    await dragged.dragTo(first, { targetPosition: { x: 30, y: 3 } });
    const sequence = () => fixture.service.controller.snapshot().issues.filter((issue) => issue.projectId === projectId && issue.phaseId === "backlog")
      .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)).map((issue) => issue.id);
    await expect.poll(sequence).toEqual([ids[1], ids[0]]);
    const review = board.getByRole("region", { name: "Review issues", exact: true }), bounds = await review.boundingBox();
    expect(bounds).not.toBeNull();
    await dragged.dragTo(review, { targetPosition: { x: 35, y: bounds!.height - 8 } });
    await expect.poll(() => fixture.service.controller.snapshot().issues.find((issue) => issue.id === ids[1])?.phaseId).toBe("review");
    await expect(review.getByRole("button", { name: "Generated dragged", exact: true })).toBeVisible();
    await dragged.focus(); await dragged.press("Alt+ArrowUp");
    await expect.poll(() => fixture.service.controller.snapshot().issues.filter((issue) => issue.phaseId === "review")
      .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)).map((issue) => issue.id)).toEqual([ids[1], ids[2]]);
    expect(fixture.service.controller.snapshot().issues.find((issue) => issue.id === ids[1])?.body).toBe("Generated immutable drag source.");
    await expect(board.getByRole("button", { name: "Project settings", exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole("button", { name: "Kanban for project", exact: true }).click();
    await expect(page.getByRole("region", { name: "Review issues", exact: true }).getByRole("button", { name: "Generated dragged", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("plain and slash continue-work prompts ask each time and cancel preserves the exact draft", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("continue work"); await page.getByRole("button", { name: "Send", exact: true }).click();
    const choice = page.getByRole("dialog", { name: "Continue work", exact: true });
    await expect(choice).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    await choice.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(prompt).toHaveValue("continue work");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await choice.getByRole("button", { name: "Send to model", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.service.controller.snapshot().projectWorkRuns).toHaveLength(0);
    await prompt.fill("continue work"); await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(choice).toBeVisible(); expect(fixture.requests).toHaveLength(1);
    await choice.getByRole("button", { name: "Cancel", exact: true }).click();
    await prompt.fill("/continue-work"); await page.getByRole("button", { name: "Run command", exact: true }).click();
    await expect(choice).toBeVisible();
    await choice.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(prompt).toHaveValue("/continue-work");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); await fixture.close(); }
});

test("the read-only sync toggle imports linked issues, displays real PR state and keeps synchronized columns authoritative", async () => {
  const fixture = await githubBoardFixture();
  await showKanban(fixture.sdk, fixture.projectId);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), project = fixture.service.controller.snapshot().projects.find((project) => project.id === fixture.projectId)!;
    await page.getByRole("button", { name: `Kanban for ${project.name}`, exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    await expect(board).toBeVisible();
    await board.getByRole("switch", { name: "Sync with GitHub", exact: true }).check();
    await expect(board.getByRole("button", { name: "Project settings", exact: true })).toBeEnabled();
    await board.getByRole("switch", { name: "Import open GitHub issues", exact: true }).check();
    const card = board.getByRole("article", { name: "Card #1: Generated GitHub issue", exact: true });
    await expect(board.getByRole("region", { name: "In progress issues", exact: true }).getByRole("button", { name: "Generated GitHub issue", exact: true })).toBeVisible();
    await expect(card).toContainText("Draft PR #1007");
    await expect(card.getByRole("combobox", { name: "Phase for issue 1", exact: true })).toBeDisabled();
    await expect(board).toContainText("generated-owner / generated-owner/fixture");
    fixture.state.cards[0]!.draft = false;
    expect((await fixture.refresh()).status).toBe("completed");
    await expect(board.getByRole("region", { name: "Review issues", exact: true }).getByRole("button", { name: "Generated GitHub issue", exact: true })).toBeVisible();
    await expect(card).toContainText("PR #1007");
    await expect(board.getByRole("button", { name: "Project settings", exact: true })).toBeEnabled();
    await board.getByRole("switch", { name: "Sync with GitHub", exact: true }).uncheck();
    await expect(card.getByRole("combobox", { name: "Phase for issue 1", exact: true })).toBeEnabled();
    await card.getByRole("combobox", { name: "Phase for issue 1", exact: true }).selectOption("backlog");
    await expect(board.getByRole("region", { name: "Backlog issues", exact: true }).getByRole("button", { name: "Generated GitHub issue", exact: true })).toBeVisible();
    await expect(board.getByRole("button", { name: "Project settings", exact: true })).toBeEnabled();
    expect(fixture.calls.every((call) => call.method === "GET")).toBe(true);
    expect(fixture.reads.every((read) => !read.query.includes("mutation"))).toBe(true);
  } finally { await app.close(); await fixture.close(); }
});
