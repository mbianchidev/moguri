import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { kanbanPreferences, MoguriSdk } from "@moguri-dev/sdk";
import { reviewNativeTools, setupFixture, waitFor } from "../fixture.ts";
import { githubBoardFixture } from "../fixtures/github-board.ts";
import { openSettingsSection, showKanban } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Generated alert interaction uses hidden Electron.");
async function savedSession(page: Page) {
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeVisible();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
}

test("card moves are informational, keyboard-dismissible and do not resurrect on an ordinary snapshot update", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const projectId = f.session().projectId!, { board: initial } = await sdk.issues.board(projectId);
  await sdk.issues.configure(projectId, { ...initial, autoRefreshPrs: false, kanban: { ...kanbanPreferences(initial), visible: true } }, initial.revision);
  const created = await sdk.issues.create(projectId, { title: "Generated alert card", body: "Generated original content.", kind: "feature", phaseId: "in-progress", pullRequestUrl: null });
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await page.getByRole("button", { name: "Kanban for project", exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    const card = board.getByRole("article", { name: "Card #1: Generated alert card", exact: true });
    await card.focus(); await card.press("Alt+ArrowRight");
    const notice = board.getByRole("status").filter({ hasText: "Card moved in Review." });
    await expect(notice).toBeVisible(); await expect(notice).toHaveAttribute("data-alert-tone", "info"); await expect(notice).toHaveClass(/info/);
    await expect(board.getByRole("alert").filter({ hasText: "Card moved" })).toHaveCount(0);
    const button = notice.getByRole("button", { name: "Dismiss alert", exact: true });
    await button.focus(); await button.press("Enter");
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    const current = (await sdk.issues.board(projectId)).issues.find((issue) => issue.id === created.id)!;
    await sdk.issues.update(current.id, { title: current.title, body: "Generated newer local content.", kind: current.kind, phaseId: current.phaseId, pullRequestUrl: null }, current.revision);
    await expect(card).toContainText("Generated alert card"); await expect(notice).toHaveCount(0);
    expect((await sdk.issues.board(projectId)).issues[0]?.phaseId).toBe("review");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("settings alerts dismiss without saving/discarding edits and a new conflict reappears with recovery still available", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready(), app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "User guidance");
    await page.getByLabel("README sections", { exact: true }).fill("Generated unsent preference.");
    f.service.store.db.exec("CREATE TRIGGER generated_alert_save_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='settings.updated' BEGIN SELECT RAISE(ABORT,'Generated alert save failure'); END;");
    await page.getByRole("button", { name: "Save README sections", exact: true }).click();
    const failure = page.getByRole("alert");
    await expect(failure).toBeVisible();
    await failure.getByRole("button", { name: "Dismiss alert", exact: true }).click();
    await expect(failure).toHaveCount(0);
    await expect(page.getByLabel("README sections", { exact: true })).toHaveValue("Generated unsent preference.");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Unsaved changes");
    await expect(page.getByRole("button", { name: "Reload current settings", exact: true })).toBeVisible();
    expect(sdk.settings.get()?.values.guidance?.readmeSections).not.toBe("Generated unsent preference.");
    f.service.store.db.exec("DROP TRIGGER generated_alert_save_failure");
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, appearance: { ...settings.values.appearance, theme: "light" } }, settings.revision);
    await expect(failure).toContainText("Another client changed settings");
    await failure.getByRole("button", { name: "Dismiss alert", exact: true }).focus();
    await page.keyboard.press("Space"); await expect(failure).toHaveCount(0);
    await expect(page.getByLabel("README sections", { exact: true })).toHaveValue("Generated unsent preference.");
    await page.getByRole("button", { name: "Reload current settings", exact: true }).click();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.getByRole("button", { name: "Back to session", exact: true }).click(); await savedSession(page);
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("a dismissed draft-save failure preserves the exact text and leaves its real retry outside the alert", async () => {
  const f = await setupFixture(), app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await savedSession(page);
    f.service.store.db.exec("CREATE TRIGGER generated_alert_draft_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='draft.saved' BEGIN SELECT RAISE(ABORT,'Generated draft save failure'); END;");
    const input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("Generated exact unsent text.");
    const alert = page.getByRole("alert"); await expect(alert).toBeVisible();
    await alert.getByRole("button", { name: "Dismiss alert", exact: true }).click();
    await expect(alert).toHaveCount(0); await expect(input).toHaveValue("Generated exact unsent text.");
    await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
    expect(f.session().draft.text).not.toBe("Generated exact unsent text."); expect(f.requests).toHaveLength(0);
    f.service.store.db.exec("DROP TRIGGER generated_alert_draft_failure");
    await page.getByRole("button", { name: "Retry save", exact: true }).click(); await savedSession(page);
    expect(f.session().draft.text).toBe("Generated exact unsent text."); expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("Kanban refresh survives presentation changes and dismissing a real sync error never acknowledges or changes its failed job", async () => {
  const f = await githubBoardFixture(); await f.configure(true); expect((await f.refresh()).status).toBe("completed"); await showKanban(f.sdk, f.projectId);
  const original = (await f.sdk.issues.board(f.projectId)).board.githubSource, app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), project = f.service.controller.snapshot().projects.find((project) => project.id === f.projectId)!;
    await page.getByRole("button", { name: `Kanban for ${project.name}`, exact: true }).click();
    const board = page.getByRole("region", { name: "Local project issue board", exact: true });
    await expect(board.getByRole("article", { name: "Card #1: Generated GitHub issue", exact: true })).toBeVisible();
    const configuration = (await f.sdk.projects.configuration(f.projectId)).configuration;
    await f.sdk.projects.organize(f.projectId, { folderId: configuration.folderId, color: "#3b82f6", order: configuration.order }, configuration.revision);
    f.state.cards[0]!.draft = false; expect((await f.refresh()).status).toBe("completed");
    await expect(board.getByRole("region", { name: "Review issues", exact: true })).toContainText("Generated GitHub issue");
    f.changeAccount(99); const failed = await f.refresh(); expect(failed.status).toBe("failed");
    const alert = board.getByRole("alert").filter({ hasText: "GitHub sync failed" });
    await expect(alert).toBeVisible(); await alert.getByRole("button", { name: "Dismiss alert", exact: true }).click(); await expect(alert).toHaveCount(0);
    expect(f.service.controller.snapshot().jobs.find((job) => job.id === failed.id)?.status).toBe("failed");
    await expect(board.getByRole("switch", { name: "Sync with GitHub", exact: true })).toBeChecked();
    expect((await f.sdk.issues.board(f.projectId)).board.githubSource).toEqual(original);
    f.changeAccount(42); expect((await f.refresh()).status).toBe("completed");
    await expect(board.getByRole("status").filter({ hasText: "GitHub sync completed" })).toBeVisible();
    expect((await f.sdk.issues.board(f.projectId)).issues).toHaveLength(1);
    expect(f.calls.every((call) => call.method === "GET")).toBe(true);
  } finally { await app.close(); await f.close(); }
});

test("dismissing an approval warning does not answer or approve the original action and keeps Review available", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await reviewNativeTools(f, ["read_file"]); await f.configure(); await f.send("generated tool awaiting original approval");
  const approval = await waitFor(() => f.session().pendingApproval), app = await launch(f.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "General");
    const warning = page.getByRole("status").filter({ hasText: "The main session needs an approval." });
    await expect(warning).toBeVisible(); await warning.getByRole("button", { name: "Dismiss alert", exact: true }).click(); await expect(warning).toHaveCount(0);
    expect(f.session().pendingApproval?.id).toBe(approval.id); expect(f.requests).toHaveLength(1);
    await expect(page.getByRole("button", { name: "Review exact action", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review exact action", exact: true }).click();
    await sdk.approvals.respond(f.sessionId, approval.id, false); await f.terminal(); await savedSession(page);
    expect(f.service.controller.events(0).some((event) => event.event_type === "tool.decided" && event.payload.allow)).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
