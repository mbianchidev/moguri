import { ciTime } from "../fixtures/time-scale.ts";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import {
  LINEAR_FIXTURE_TOKEN, linearFixtureIds as ids, linearServiceFixture,
} from "../fixtures/linear-workflows.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The hidden native desktop Linear checkpoint is qualified on macOS.");

test("Settings Linear workflows explicitly reviews an issue write and ticket pull, redacts reflected credentials, and retains receipts after source deletion", async () => {
  test.setTimeout(ciTime(45_000));
  const f = await linearServiceFixture();
  let app: ElectronApplication | undefined;
  try {
    await f.enable();
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" },
    });
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await expect(page.getByRole("navigation", { name: "Projects and sessions", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "Linear");
    const panel = page.getByRole("region", { name: "Reviewed Linear workflows", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`Enabled team ${ids.team}`);
    await expect(panel).toContainText("Local tickets stay local");

    const form = panel.getByRole("form", { name: "Linear operation fields", exact: true });
    await form.getByLabel("Operation", { exact: true }).selectOption("issue.create");
    await form.getByLabel("Issue title", { exact: true }).fill("Generated Electron Linear issue");
    await form.getByLabel("Description", { exact: true }).fill("Generated body from the exact desktop review.");
    const mutations = () => f.provider.requests.filter((entry) => entry.query.startsWith("mutation"));
    expect(mutations()).toHaveLength(0);
    await form.getByRole("button", { name: "Preview exact Linear operation", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact Linear review", exact: true });
    await expect(review).toContainText("Generated author");
    await expect(review).toContainText("Generated workspace");
    await expect(review).toContainText(f.root);
    await expect(review).toContainText("Generated Electron Linear issue");
    const send = review.getByRole("button", { name: "Send reviewed operation to Linear", exact: true });
    await expect(send).toBeDisabled();
    expect(mutations()).toHaveLength(0);
    await review.getByRole("switch").check();
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(() => f.service.controller.snapshot().linearOperations.find((entry) => entry.action === "issue.create")?.status).toBe("completed");
    const created = f.service.controller.snapshot().linearOperations.find((entry) => entry.action === "issue.create")!;
    const createdReceipt = await f.sdk.linear.read(created.id);
    expect(created.sessionId).toBe(f.sessionId);
    expect(created.acceptance.actor).toBe("user");
    expect(createdReceipt.result?.acknowledgement).toBe("verified");
    expect(createdReceipt.result?.remote[0]).toMatchObject({ kind: "issue", title: "Generated Electron Linear issue" });
    expect(mutations().map((entry) => entry.name)).toEqual(["MoguriLinearIssueCreate"]);

    f.provider.changeIssue(ids.issue, {
      title: "Generated remote title for desktop pull", stateId: ids.done,
      description: `Generated provider reflection ${LINEAR_FIXTURE_TOKEN}`,
    });
    const imported = await f.sdk.linear.import(f.projectId);
    expect((await f.sdk.jobs.wait(imported.id!, { timeoutMs: 5000 })).status).toBe("completed");
    const linked = (await f.sdk.issues.board(f.projectId)).issues.find((entry) => entry.linear?.id === ids.issue)!;
    expect(linked).toBeTruthy();
    await f.sdk.issues.update(linked.id, {
      title: "Generated local title before pull", body: "Generated original local body", kind: "bug", phaseId: "backlog", pullRequestUrl: null,
    }, linked.revision);
    const local = (await f.sdk.issues.board(f.projectId)).issues.find((entry) => entry.id === linked.id)!;
    await form.getByLabel("Operation", { exact: true }).selectOption("ticket.sync");
    await form.getByLabel("Local ticket", { exact: true }).selectOption(local.id);
    await expect(form.getByLabel("Local ticket", { exact: true }).locator("option:checked")).toContainText(`revision ${local.revision}`);
    await form.getByLabel("Direction", { exact: true }).selectOption("pull");
    const mapping = form.getByRole("group", { name: "Map board phases to Linear states", exact: true });
    await mapping.getByLabel("Backlog", { exact: true }).fill(ids.state);
    await mapping.getByLabel("Done", { exact: true }).fill(ids.done);
    await form.getByRole("button", { name: "Preview exact Linear operation", exact: true }).click();
    await expect(review).toContainText("Review before pulling into local");
    await expect(review).toContainText("Generated local title before pull");
    await expect(review).toContainText("Generated remote title for desktop pull");
    await expect(review).toContainText(`revision ${local.revision}`);
    await expect(review).toContainText("[redacted]");
    await expect(review).not.toContainText(LINEAR_FIXTURE_TOKEN);
    const pull = review.getByRole("button", { name: "Apply locally: reviewed Linear pull", exact: true });
    await expect(pull).toBeDisabled();
    expect(f.service.controller.snapshot().issues.find((entry) => entry.id === local.id)?.title).toBe("Generated local title before pull");
    expect(mutations()).toHaveLength(1);
    await review.getByRole("switch").check();
    await pull.click();
    await expect.poll(() => f.service.controller.snapshot().linearOperations.find((entry) => entry.action === "ticket.sync")?.status).toBe("completed");
    const pulled = f.service.controller.snapshot().issues.find((entry) => entry.id === local.id)!;
    expect(pulled).toMatchObject({
      title: "Generated remote title for desktop pull", body: "Generated provider reflection [redacted]", phaseId: "done",
      kind: "bug", revision: local.revision + 1, linear: { id: ids.issue, identifier: "GEN-1", url: linked.linear!.url },
    });
    const sync = f.service.controller.snapshot().linearOperations.find((entry) => entry.action === "ticket.sync")!;
    expect(sync.dispatched).toBe(false);
    expect(mutations().map((entry) => entry.name)).toEqual(["MoguriLinearIssueCreate"]);

    await f.sdk.sessions.create(f.projectId, "Generated retained Linear viewer");
    await f.sdk.sessions.delete(f.sessionId, true);
    await expect.poll(() => f.service.controller.snapshot().sessions.some((entry) => entry.id === f.sessionId)).toBe(false);
    await expect(panel).toBeVisible();
    const createdRow = panel.getByRole("listitem").filter({ has: page.locator("strong").filter({ hasText: /^issue\.create$/ }) });
    await createdRow.getByRole("button", { name: "View receipt and original inputs", exact: true }).click();
    const retained = panel.locator("details").filter({
      has: page.locator("summary").filter({ hasText: `Operation ${created.id}: completed` }),
    });
    await expect(retained).toBeVisible();
    await expect(retained).toContainText("Generated Electron Linear issue");
    await expect(retained).toContainText(f.sessionId);
    await expect(retained).toContainText(createdReceipt.result!.remote[0]!.id);
    const independent = await f.sdk.linear.read(created.id);
    expect(independent.operation.sessionId).toBe(f.sessionId);
    expect(independent.operation.status).toBe("completed");
    expect(independent.job?.status).toBe("completed");
    expect(independent.result?.remote[0]?.id).toBe(createdReceipt.result!.remote[0]!.id);
    expect(f.vault.value).toBe(LINEAR_FIXTURE_TOKEN);
    expect(await page.content()).not.toContain(LINEAR_FIXTURE_TOKEN);
    expect(JSON.stringify(f.service.controller.events(0))).not.toContain(LINEAR_FIXTURE_TOKEN);
    expect(JSON.stringify(independent)).not.toContain(LINEAR_FIXTURE_TOKEN);
    expect(f.modelCalls).toEqual([]);
    expect(failures).toEqual([]);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible()))).toBe(false);
  } finally { await app?.close(); await f.close(); }
});
