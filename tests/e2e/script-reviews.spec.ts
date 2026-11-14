import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptReviewFixture } from "../fixtures/script-review.ts";
import { focusByKeyboard, waitForWorkspace } from "./navigation.ts";
import { nativeConfiguration } from "../fixtures/native-target.ts";
import { nativeMilestoneFixture } from "../fixtures/native-milestone-api.ts";
import { waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const native = await nativeConfiguration(true);
test.skip(process.platform !== "darwin", "Actual hidden desktop script review is qualified on macOS.");
test("unsafe findings require an explicit full-source user force and still cannot self-approve execution", async ({}, info) => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  await fixture.send("Generated desktop unsafe script review."); await fixture.terminal();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), review = fixture.review()!, errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByRole("region", { name: "Repository script reviews", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    const panel = page.getByRole("region", { name: "Repository script reviews", exact: true });
    await expect(panel).toContainText("Agent assessment: unsafe");
    const read = panel.getByRole("button", { name: `Read full script review ${review.id}`, exact: true });
    await focusByKeyboard(read); await page.keyboard.press("Enter");
    await expect(panel.getByLabel(`Complete reviewed script ${review.id}`, { exact: true })).toHaveText(fixture.source);
    await page.screenshot({ path: info.outputPath("unsafe-script-review.png"), animations: "disabled" });
    const force = panel.getByRole("button", { name: "Force unsafe script under normal policy", exact: true });
    await expect(force).toBeDisabled();
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toHaveCount(0);
    const checkbox = panel.getByRole("checkbox");
    await focusByKeyboard(checkbox); await page.keyboard.press("Space");
    await focusByKeyboard(force); await page.keyboard.press("Enter");
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect.poll(() => fixture.review()?.force?.actor).toBe("user");
    await expect(panel).toHaveCount(0);
    await expect(access(join(fixture.project, "generated-script-result.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    await page.getByRole("navigation", { name: "Projects and sessions", exact: true }).getByRole("button", { name: fixture.session().title, exact: true }).click();
    await expect(approval).toBeVisible();
    await expect(approval).toContainText("run_script");
    await expect(approval).toContainText("without sandbox isolation");
    await expect(approval.getByLabel("Tool matching", { exact: true })).toHaveCount(0);
    await approval.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect(async () => { expect(await readFile(join(fixture.project, "generated-script-result.txt"), "utf8")).toBe("GENERATED_FORCED_RUN"); }).toPass();
    await expect(approval).toHaveCount(0);
    await expect.poll(() => Boolean(fixture.review()?.attempt)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("Inbox groups script assessments, collapses exact source and clears the group only after both explicit approvals", async ({}, info) => {
  const f = await scriptReviewFixture({ autopilot: true, findings: ["Generated descriptive observation: prints only the fixture marker."] });
  await f.send("Generated first safe script."); await f.terminal();
  f.resetReview(); await f.send("Generated second safe script."); await f.terminal();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), calls = f.requests.length;
    await waitForWorkspace(page);
    const reviews = f.service.controller.snapshot().scriptReviews.filter((review) => review.sessionId === f.sessionId);
    expect(reviews).toHaveLength(2);
    await expect(page.getByRole("region", { name: "Repository script reviews", exact: true })).toHaveCount(0);
    const notification = f.service.controller.snapshot().attention.find((entry) => entry.reason === "script-review" && entry.messageId === reviews[0]!.id)!;
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:navigate-inbox", id, "default"), notification.id);
    const panel = page.getByRole("region", { name: "Repository script reviews", exact: true });
    await expect(panel).toHaveCount(1); await expect(panel).toContainText("Repository script reviews (2)");
    const first = reviews[0]!;
    const read = panel.getByRole("button", { name: `Read full script review ${first.id}`, exact: true });
    await expect(read).toHaveAttribute("aria-expanded", "false");
    await expect(read).not.toHaveAttribute("aria-controls", /.+/);
    await read.press("Enter");
    const source = panel.getByLabel(`Complete reviewed script ${first.id}`, { exact: true });
    await expect(source).toHaveText(f.source);
    await expect(panel.getByRole("button", { name: `Collapse script review ${first.id}`, exact: true })).toHaveAttribute("aria-controls", `script-source-${first.id}`);
    await page.screenshot({ path: info.outputPath("script-review-inbox.png"), animations: "disabled" });
    await panel.getByRole("button", { name: `Collapse script review ${first.id}`, exact: true }).press("Enter");
    await expect(source).toHaveCount(0);
    await panel.getByRole("button", { name: `Read full script review ${first.id}`, exact: true }).press("Enter");
    await panel.getByRole("button", { name: `Approve script review ${first.id}`, exact: true }).press("Enter");
    await expect(panel).toContainText("Repository script reviews (1)");
    const second = reviews[1]!;
    await panel.getByRole("button", { name: `Read full script review ${second.id}`, exact: true }).press("Enter");
    await panel.getByRole("button", { name: `Approve script review ${second.id}`, exact: true }).press("Enter");
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Needs your attention", exact: true })).toBeFocused();
    await expect.poll(() => f.service.controller.snapshot().scriptReviews.filter((review) => review.approval?.actor === "user").length).toBe(2);
    expect(f.requests).toHaveLength(calls);
  } finally { await app.close(); await f.close(); }
});

test("the actual native desktop force discloses a model-free guest and still requires separate normal execution approval", async () => {
  test.skip(!native, "Requires the explicitly reviewed current native image and receipt inputs.");
  test.setTimeout(180000);
  const f = await nativeMilestoneFixture(native!, "scripts");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, modelId: f.modelId });
    const source = "printf GENERATED_NATIVE_DESKTOP > generated-script-result.txt\n";
    await writeFile(join(f.project, "generated-script.sh"), source);
    const saved = await f.sdk.command({ type: "draft.save", sessionId: f.sessionId, expectedRevision: f.session().draft.revision,
      text: "generated native script unsafe desktop", attachments: [] });
    await f.sdk.command({ type: "message.send", sessionId: f.sessionId, expectedRevision: saved.revision!, delivery: "queue" });
    await waitFor(() => !f.session().turnId && f.session().status === "completed", 60000);
    const review = f.service.controller.snapshot().scriptReviews.findLast((review) => review.sessionId === f.sessionId)!;
    const modelCalls = f.service.controller.snapshot().budgetEntries.length;
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: f.state, MOGURI_TEST_WINDOW: "hidden" },
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    const panel = page.getByRole("region", { name: "Repository script reviews", exact: true });
    await panel.getByRole("button", { name: `Read full script review ${review.id}`, exact: true }).click();
    await expect(panel.getByLabel(`Complete reviewed script ${review.id}`, { exact: true })).toHaveText(source);
    await expect(panel).toContainText("new model-free guest");
    const force = panel.getByRole("button", { name: "Force unsafe script under normal policy", exact: true });
    await expect(force).toBeDisabled();
    await panel.getByRole("checkbox").check(); await force.click();
    await page.getByRole("navigation", { name: "Projects and sessions", exact: true }).getByRole("button", { name: f.session().title, exact: true }).click();
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toContainText("approved SendBox boundary");
    await expect(approval).not.toContainText("on your Mac");
    await assertFileAbsent();
    await approval.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().scriptReviews.find((value) => value.id === review.id)?.nativeExecution?.resultDigest).toBeTruthy();
    await expect.poll(() => f.session().status).toBe("completed");
    expect((await f.sdk.scriptReviews.read(f.sessionId, review.id)).executionResult?.outcome).toBe("completed");
    expect(f.service.controller.snapshot().budgetEntries).toHaveLength(modelCalls);
    await assertFileAbsent();
    async function assertFileAbsent() { await expect(access(join(f.project, "generated-script-result.txt"))).rejects.toMatchObject({ code: "ENOENT" }); }
  } finally { await app?.close(); await f.close(); }
});
