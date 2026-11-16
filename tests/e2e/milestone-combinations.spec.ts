import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KUPO_MODEL_ID } from "../../packages/sdk/src/index.ts";
import { reviewNativeTools } from "../fixture.ts";
import { routedFixture } from "../fixtures/single-routing.ts";
import { generatedDocx } from "../fixtures/documents.ts";
import { configureMilestoneRouting, milestoneCellId, milestoneCalls, milestoneClientCells, milestoneResponses } from "../fixtures/milestone-combinations.ts";
import { nativeConfiguration } from "../fixtures/native-target.ts";
import { nativeMilestoneFixture } from "../fixtures/native-milestone-api.ts";
import { chooseContextWindow } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Required client combinations use a generated hidden macOS app, not physical native qualification.");

const native = await nativeConfiguration(true);
for (const cell of milestoneClientCells()) {
const { env, selection } = cell;
test(`desktop ${env}/${selection} preserves its document draft while configuring exact controls and separately approving the selected tool`, async () => {
  test.skip(env === "Sandbox" && !native, "This client needs exact reviewed native installation/current payload receipts.");
  test.setTimeout(45000);
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await configureMilestoneRouting(fixture, selection);
    await fixture.sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, env,
      modelId: selection === "fixed" ? fixture.solverId : KUPO_MODEL_ID });
    await reviewNativeTools(fixture, ["read_document"]);
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: dirname(fixture.service.store.path), MOGURI_TEST_WINDOW: "hidden" },
    });
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    const text = `Generated real desktop matrix document question. ${milestoneCellId(cell)}`;
    await prompt.fill(text);
    const path = join(fixture.directory, "generated-desktop-matrix.docx");
    await writeFile(path, generatedDocx());
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
    await page.getByRole("button", { name: "Attach", exact: true }).click();
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: /^Local file/ }).click();
    await expect(page.getByRole("button", { name: "Preview document generated-desktop-matrix.docx", exact: true })).toBeVisible();
    const documentId = fixture.session().draft.attachments.find((attachment) => attachment.kind === "document")!.id;
    const observed = milestoneResponses(fixture, cell, documentId);
    await page.getByRole("button", { name: /^Model:/ }).click();
    await chooseContextWindow(page, "16,384 tokens");
    if (selection === "fixed") {
      await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: "Thinking effort", exact: true }).click();
      await page.getByRole("menu", { name: "Thinking effort", exact: true }).getByRole("menuitemradio", { name: "High", exact: true }).click();
    } else await expect(page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: /effort|thinking override/i })).toHaveCount(0);
    await expect.poll(() => fixture.session().controls.modelOptions).toEqual({ contextWindow: 16384, ...(selection === "fixed" ? { thinkingEffort: "high" } : {}) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await budget.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    const controls = budget.getByRole("region", { name: "Session budget controls", exact: true });
    await controls.getByLabel("session budget mode", { exact: true }).selectOption("limited");
    const tokenCap = controls.getByLabel("session token cap", { exact: true });
    await tokenCap.fill("1000000");
    await expect(tokenCap).toHaveValue("1000000");
    await controls.getByLabel("session USD cap", { exact: true }).fill("10");
    await expect(tokenCap).toHaveValue("1000000");
    await controls.getByRole("checkbox", { name: "I understand costs are estimates and a cap can stop a chat mid-task.", exact: true }).check();
    await controls.getByRole("button", { name: "Save session budget", exact: true }).click();
    await expect.poll(() => fixture.session().controls.budget).toEqual({ kind: "limited", basis: "estimate", tokens: 1000000, usd: 10 });
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue(text);
    expect(observed).toHaveLength(0);
    await page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().pendingApproval?.call.name).toBe("read_document");
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "tool.started")).toBe(false);
    await page.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    await expect(page.getByText("Generated selected milestone response.", { exact: true })).toBeVisible();
    const calls = await milestoneCalls(fixture, observed);
    expect(calls.length).toBeGreaterThan(0);
    if (selection === "fixed") expect(calls.every((call) => call.request.reasoning_effort === "high")).toBe(true);
    else expect(fixture.session().controls.modelOptions?.thinkingEffort).toBeUndefined();
    expect((await fixture.sdk.budgets.status(fixture.sessionId)).status.totals.knownReportedTokens).toBe(calls.length * 42);
    expect(fixture.session().controls.env).toBe(env);
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "tool.decided" && event.payload.actor === "user")).toHaveLength(1);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { try { await app?.close(); } finally { await fixture.close(); } }
});
}

test("unchanged model snapshots do not restart finishing readiness or erase pending caps; actual policy changes still block them", async () => {
  const fixture = await routedFixture({ env: "Remote", configured: false, legacy: false, reasoningRoles: true, imageInput: true, toolInput: true });
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const query = fixture.service.controller.platform.query.bind(fixture.service.controller.platform);
  let readinessReads = 0;
  fixture.service.controller.platform.query = (...args: Parameters<typeof query>) => {
    if (args[0].type === "winddown.status") readinessReads++;
    return query(...args);
  };
  try {
    await configureMilestoneRouting(fixture, "critique");
    await fixture.select();
    app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const budget = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await budget.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    const controls = budget.getByRole("region", { name: "Session budget controls", exact: true });
    await controls.getByLabel("session budget mode", { exact: true }).selectOption("limited");
    await controls.getByLabel("session token cap", { exact: true }).fill("1000000");
    const baseline = readinessReads;
    expect(baseline).toBeGreaterThan(0);
    await fixture.sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: fixture.session().draft.revision,
      text: "Generated second-client draft, not model context.", attachments: [] });
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated second-client draft, not model context.");
    await controls.getByLabel("session USD cap", { exact: true }).fill("10");
    await expect(controls.getByLabel("session token cap", { exact: true })).toHaveValue("1000000");
    expect(readinessReads).toBe(baseline);
    const settings = fixture.sdk.settings.get()!;
    await fixture.sdk.settings.update({ ...settings.values, winddown: { ...settings.values.winddown, enabled: false } }, settings.revision);
    await expect(controls.getByLabel("session budget mode", { exact: true })).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Save session budget", exact: true })).toBeDisabled();
    await expect(controls.getByLabel("session token cap", { exact: true })).toHaveValue("1000000");
    await expect(controls.getByLabel("session USD cap", { exact: true })).toHaveValue("10");
    expect(fixture.session().controls.budget).toEqual({ kind: "unlimited" });
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.solver.requests).toHaveLength(0);
    await controls.getByRole("button", { name: "Reload budget", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { try { await app?.close(); } finally { await fixture.close(); } }
});
