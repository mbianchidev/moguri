import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk, type EventInput } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Conversation navigation uses generated hidden macOS windows.");

test("the turn sidebar navigates actual prompts and chosen question answers, never permission decisions, without changing a saved draft", async () => {
  const fixture = await setupFixture({ replyText: Array.from({ length: 60 }, (_, index) => `Generated response paragraph ${index + 1}.\n\n`).join("") });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("generated structured question choices only");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const navigation = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await expect(navigation.getByRole("button", { name: /^Prompt 1:/ })).toBeVisible();
    await expect(navigation.getByRole("button", { name: /^Answer / })).toHaveCount(0);
    await page.getByRole("region", { name: "User question", exact: true }).getByRole("button", { name: "Generated second choice", exact: true }).click();
    await fixture.terminal();
    const answer = navigation.getByRole("button", { name: /^Answer 2:/ });
    await expect(answer).toHaveAccessibleName(/Choose a generated fixture approach.*Generated second choice/);
    const prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    await prompt.fill("Generated saved draft preserved while navigating.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const first = navigation.getByRole("button", { name: /^Prompt 1:/ });
    await first.focus(); await page.keyboard.press("Enter");
    await expect(transcript.getByRole("article", { name: "User prompt", exact: true })).toBeFocused();
    await expect(first).toHaveAttribute("aria-current", "location");
    await answer.click();
    const answered = transcript.getByRole("article", { name: "Answered question", exact: true });
    await expect(answered).toBeFocused();
    await expect(answered).toContainText("Choose a generated fixture approach?");
    await expect(answered).toContainText("Generated second choice");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/conversation-navigation.png") });
    await expect(prompt).toHaveValue("Generated saved draft preserved while navigating.");
    expect(fixture.requests).toHaveLength(2);
    await fixture.send("generated tool navigation permission");
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toBeVisible();
    await expect(navigation.getByRole("button", { name: /^Prompt / })).toHaveCount(2);
    await expect(navigation.getByRole("button", { name: /^Answer / })).toHaveCount(1);
    await approval.getByRole("button", { name: "Deny", exact: true }).click(); await fixture.terminal();
    await page.reload();
    await expect(navigation.getByRole("button", { name: /^Prompt / })).toHaveCount(2);
    await expect(navigation.getByRole("button", { name: /^Answer / })).toHaveCount(1);
    expect(sdk.getState().snapshot?.questions.filter((question) => question.answer?.actor === "user")).toHaveLength(1);
    expect(sdk.settings.get()!.values.permissions.tools).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("older turn links reveal paged history and new streamed output does not pull navigation back to the latest turn", async () => {
  const fixture = await setupFixture({ stream: { chunks: ["Generated live first fragment. ", "Generated live second fragment. ", "Generated live final fragment."], delayMs: 120 } });
  await fixture.configure();
  const session = fixture.session(), events: EventInput[] = [];
  for (let index = 0; index < 160; index++) {
    const turnId = `generated-history-turn-${index}`;
    events.push({ event_type: "turn.started", profile_id: "default", project_id: session.projectId, session_id: session.id, turn_id: turnId,
      payload: { item: { id: `generated-history-message-${index}`, text: `Generated navigation prompt ${index + 1}.`, attachments: [], delivery: "queue" }, controls: session.controls, policyRevision: 0 } },
    { event_type: "turn.finished", profile_id: "default", project_id: session.projectId, session_id: session.id, turn_id: turnId, payload: { outcome: "completed", diagnostic: null } });
  }
  fixture.service.store.commit(events); fixture.service.controller.refreshProfile();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await expect(navigation.getByRole("button", { name: /^Prompt / })).toHaveCount(160);
    await expect(transcript.getByText("Generated navigation prompt 1.", { exact: true })).toHaveCount(0);
    const first = navigation.getByRole("button", { name: /^Prompt 1:/ });
    await first.click();
    const target = transcript.getByRole("article", { name: "User prompt", exact: true }).filter({ hasText: "Generated navigation prompt 1." });
    await expect(target).toBeFocused(); await expect(target).toBeInViewport({ ratio: 1 });
    await fixture.send("Generated new live navigation prompt.");
    await fixture.terminal();
    await expect(target).toBeInViewport({ ratio: 1 });
    await expect(first).toHaveAttribute("aria-current", "location");
    await expect(navigation.getByRole("button", { name: /^Prompt / })).toHaveCount(161);
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); await fixture.close(); }
});

test("main and read-only side-chat turn indexes remain independent and compact previews support keyboard dismissal", async () => {
  const fixture = await setupFixture({ responseMode: "text", replyText: "Generated independent conversation output.\n\n".repeat(60) });
  await fixture.configure(); await fixture.send("Generated main-only navigation prompt."); await fixture.terminal();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), main = page.getByRole("log", { name: "Session transcript", exact: true });
    const mainNavigation = page.getByRole("navigation", { name: "Conversation turns", exact: true });
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Side chat", exact: true }).click();
    const side = page.locator(".side-chat-panel"), prompt = side.getByLabel("Side question", { exact: true });
    await prompt.fill("Generated side-only navigation prompt."); await side.getByRole("button", { name: "Send", exact: true }).click();
    const sideTranscript = side.getByRole("log", { name: "Side chat transcript", exact: true });
    await expect(sideTranscript).toContainText("Generated independent conversation output.");
    await expect(side.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    const sideNavigation = side.getByRole("navigation", { name: "Side chat turns", exact: true });
    await expect(mainNavigation.getByRole("button", { name: /^Prompt 1:/ })).toHaveAccessibleName(/Generated main-only/);
    await expect(sideNavigation.getByRole("button", { name: /^Prompt 1:/ })).toHaveAccessibleName(/Generated side-only/);
    await expect(sideNavigation.getByRole("button", { name: /Generated main-only/ })).toHaveCount(0);
    await mainNavigation.getByRole("button", { name: /^Prompt 1:/ }).click();
    await expect(main.getByRole("article", { name: "User prompt", exact: true })).toBeFocused();
    const original = await main.evaluate((element) => element.scrollTop);
    const previews = sideNavigation.getByRole("button", { name: "Show turn previews", exact: true });
    await expect(previews).toHaveAttribute("aria-pressed", "false");
    await previews.focus(); await page.keyboard.press("Enter");
    await expect(previews).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(previews).toBeFocused(); await expect(previews).toHaveAttribute("aria-pressed", "false");
    await sideNavigation.getByRole("button", { name: /^Prompt 1:/ }).click();
    await expect(sideTranscript.getByRole("article", { name: "User prompt", exact: true })).toBeFocused();
    expect(await main.evaluate((element) => element.scrollTop)).toBe(original);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await expect(mainNavigation.getByRole("button", { name: "Show turn previews", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await sideTranscript.boundingBox())!.height).toBeGreaterThanOrEqual(60);
    await expect(sideTranscript).toBeInViewport({ ratio: 1 });
    await expect(sideNavigation.getByRole("button", { name: /^Prompt 1:/ })).toBeInViewport({ ratio: 1 });
    await expect(side.getByRole("button", { name: "Send", exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/conversation-navigation-compact-side.png") });
    expect(fixture.requests).toHaveLength(2);
  } finally { await app.close(); await fixture.close(); }
});
