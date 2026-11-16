import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { reviewNativeTools, setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native desktop questions are qualified on macOS.");
test("desktop labels current solver guidance as advice and still requires explicit actual-user answers and tool decisions", async () => {
  const fixture = await setupFixture({ questionRecommendation: { choiceIndex: 1, reason: "Generated Guided analysis favors the second option." }, toolAdvice: "Generated current-step guidance: read only the requested fixture." });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId, autonomy: "Guided" });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const prompt = page.getByRole("textbox", { name: "Prompt", exact: true }), card = page.getByRole("region", { name: "User question", exact: true });
    await prompt.fill("generated structured question choices only");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(card.getByRole("note", { name: "Model advice", exact: true })).toContainText("Model recommends: Generated second choice");
    await expect(card).toContainText("Generated Guided analysis favors");
    expect(sdk.getState().snapshot!.questions[0]?.answer).toBeNull(); expect(fixture.requests.length).toBe(1);
    await prompt.fill("Generated held followup while advice waits."); await prompt.press("Meta+Enter");
    await expect.poll(() => fixture.session().queue[0]?.held).toBe(true);
    expect(sdk.getState().snapshot!.questions[0]?.status).toBe("open"); expect(fixture.requests.length).toBe(1);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/guided-advice-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await expect(card.getByRole("button", { name: "Generated first choice", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole("button", { name: "Generated second choice", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Stop turn", exact: true })).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 840, height: 620 });
    await expect(card.getByRole("button", { name: "Generated first choice", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole("button", { name: "Generated second choice", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Stop turn", exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: resolve(".moguri/artifacts/guided-advice-compact.png") });
    await card.getByRole("button", { name: "Generated first choice", exact: true }).click(); await fixture.terminal();
    await expect.poll(() => sdk.getState().snapshot!.questions[0]?.answer?.text).toBe("Generated first choice");
    expect(sdk.getState().snapshot!.questions[0]?.answer?.actor).toBe("user"); expect(fixture.requests.length).toBe(2);
    await reviewNativeTools(fixture, ["read_file"]);
    await prompt.fill("generated tool guided recommendation");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval.getByRole("note", { name: "Model advice", exact: true })).toContainText("Generated current-step guidance");
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "tool.started" && event.payload.call.name === "read_file")).toBe(false);
    expect(fixture.requests.length).toBe(3);
    await approval.getByRole("button", { name: "Deny", exact: true }).click(); await fixture.terminal();
    expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("desktop keeps queue-only shortcuts distinct from actual user answers and retains provenance", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("generated structured question");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const card = page.getByRole("region", { name: "User question", exact: true }), prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
    await expect(card).toContainText("Choose a generated fixture approach?");
    await expect(page.getByRole("region", { name: "Tool approval" })).toHaveCount(0);
    const question = await waitFor(() => sdk.getState().snapshot?.questions.find((question) => question.status === "open"));
    await prompt.fill("Generated deliberately held followup.");
    await prompt.press("Meta+Enter");
    await expect.poll(() => sdk.getState().snapshot!.sessions[0]?.queue[0]?.held).toBe(true);
    expect(sdk.getState().snapshot!.questions[0]?.status).toBe("open");
    await prompt.fill("Generated real desktop answer.");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/structured-question-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/structured-question-compact.png") });
    await prompt.press("Enter");
    await expect.poll(() => sdk.getState().snapshot!.questions.find((value) => value.id === question.id)?.answer?.actor).toBe("user");
    await fixture.terminal();
    expect(sdk.getState().snapshot!.sessions[0]?.draft.text).toBe("");
    expect(sdk.getState().snapshot!.sessions[0]?.queue[0]?.held).toBe(true);
    const artifact = sdk.getState().snapshot!.artifacts.find((artifact) => artifact.questionId === question.id)!;
    expect(artifact.sources.map((source) => source.actor)).toEqual(["model", "user"]);
    expect((await sdk.artifacts.read(artifact.id)).text).toContain("Generated real desktop answer.");
    await fixture.send("generated structured question choices only");
    await expect.poll(() => sdk.getState().snapshot!.questions.filter((value) => value.id !== question.id && value.status === "open").length).toBe(1);
    const second = sdk.getState().snapshot!.questions.find((value) => value.id !== question.id && value.status === "open")!;
    await expect(card).toBeVisible();
    await prompt.fill("Generated unrelated saved draft.");
    await expect.poll(() => sdk.getState().snapshot!.sessions[0]?.draft.text).toBe("Generated unrelated saved draft.");
    await card.getByRole("button", { name: "Generated second choice", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.questions.find((value) => value.id === second.id)?.answer?.text).toBe("Generated second choice");
    await fixture.terminal();
    expect(sdk.getState().snapshot!.sessions[0]?.draft.text).toBe("Generated unrelated saved draft.");
    expect(sdk.getState().snapshot!.questions.find((value) => value.id === second.id)?.answer?.text).toBe("Generated second choice");
    expect(sdk.getState().snapshot!.settings.values.permissions.tools).toEqual([]);
    expect(failures).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("long offered answers form one scrollable list and clicking a choice sends its exact text without consuming a saved prompt", async ({}, info) => {
  const choices = Array.from({ length: 6 }, (_, index) =>
    `Generated option ${index + 1}: Inspect the generated input, retain the original fixture unchanged, and report the exact reviewed result before making another independent change.`);
  const fixture = await setupFixture({ questionChoices: [...choices, "Other", "Other, please specify"] });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("generated structured question choices only");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), card = page.getByRole("region", { name: "User question", exact: true });
    await page.setViewportSize({ width: 840, height: 620 });
    const list = card.getByRole("list", { name: "Offered answers", exact: true }), buttons = list.getByRole("button");
    await expect(buttons).toHaveCount(choices.length);
    await expect(card.getByRole("button", { name: "Other", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Other, please specify", exact: true })).toHaveCount(0);
    await expect(card.getByRole("textbox", { name: "Other answer", exact: true })).toHaveValue("");
    const layout = await buttons.evaluateAll((entries) => entries.map((entry) => {
      const { x, top, bottom } = entry.getBoundingClientRect(); return { x, top, bottom };
    }));
    for (let index = 1; index < layout.length; index++) {
      expect(Math.abs(layout[index]!.x - layout[0]!.x)).toBeLessThanOrEqual(1);
      expect(layout[index]!.top).toBeGreaterThanOrEqual(layout[index - 1]!.bottom);
    }
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight && element.clientHeight > 0)).toBe(true);
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Generated unrelated saved prompt.");
    await expect.poll(() => fixture.session().draft.text).toBe("Generated unrelated saved prompt.");
    await buttons.first().focus();
    for (let index = 1; index < choices.length; index++) await page.keyboard.press("Tab");
    await expect(buttons.last()).toBeFocused();
    await expect(buttons.last()).toBeInViewport({ ratio: 1 });
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(card.getByRole("textbox", { name: "Other answer", exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath("question-answer-list.png"), animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await list.evaluate((element) => { element.scrollTop = 0; });
    await card.screenshot({ path: info.outputPath("question-answer-list-wide.png"), animations: "disabled" });
    const question = fixture.service.controller.snapshot().questions.find((question) => question.status === "open")!;
    await buttons.last().click();
    await expect(card).toHaveCount(0);
    await fixture.terminal(); await sdk.refresh();
    const answer = sdk.getState().snapshot!.questions.find((entry) => entry.id === question.id)!.answer;
    expect(answer?.text).toBe(choices.at(-1)); expect(answer?.actor).toBe("user"); expect(answer?.other).toBeUndefined();
    expect(fixture.session().draft.text).toBe("Generated unrelated saved prompt.");
    expect(sdk.settings.get()!.values.permissions.tools).toEqual([]);
    await expect(page.getByRole("form", { name: "Message composer" }).getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Other starts blank, sends on plain Enter and preserves text for retry without answering on composition or queue shortcuts", async () => {
  const fixture = await setupFixture({ questionChoices: [] }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("generated structured question");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), card = page.getByRole("region", { name: "User question", exact: true });
    const other = card.getByRole("textbox", { name: "Other answer", exact: true });
    await expect(other).toHaveValue("");
    await other.press("Enter");
    expect(fixture.service.controller.snapshot().questions[0]?.status).toBe("open");
    await other.fill("Generated explicit alternative.");
    await other.press("Shift+Enter"); await other.pressSequentially("Generated second line.");
    const text = "Generated explicit alternative.\nGenerated second line.";
    await expect(other).toHaveValue(text);
    await other.press("Meta+Enter"); await other.press("Control+Enter");
    await other.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });
    expect(fixture.service.controller.snapshot().questions[0]?.status).toBe("open");
    expect(fixture.session().queue).toHaveLength(0); expect(fixture.requests).toHaveLength(1);
    fixture.service.store.db.exec("CREATE TRIGGER generated_other_answer_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='question.answered' BEGIN SELECT RAISE(ABORT,'Generated answer persistence failure'); END");
    try {
      await other.press("Enter");
      await expect(card.getByRole("alert")).toBeVisible();
      await expect(other).toBeEnabled(); await expect(other).toHaveValue(text);
      expect(fixture.service.controller.snapshot().questions[0]?.status).toBe("open");
      expect(fixture.requests).toHaveLength(1);
    } finally { fixture.service.store.db.exec("DROP TRIGGER generated_other_answer_failure"); }
    await other.press("Enter");
    await expect(card).toHaveCount(0);
    await fixture.terminal(); await sdk.refresh();
    const answer = sdk.getState().snapshot!.questions[0]!.answer;
    expect(answer?.text).toBe(text); expect(answer?.other).toBe(true); expect(answer?.actor).toBe("user");
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "question.answered")).toHaveLength(1);
    expect(sdk.settings.get()!.values.permissions.tools).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("offered answers are numbered, a digit in the empty composer chooses one while other digits type normally, and the card shares the composer's chat column", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByRole("textbox", { name: "Prompt", exact: true }), card = page.getByRole("region", { name: "User question", exact: true });
    await prompt.fill("generated structured question choices only");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const second = card.getByRole("button", { name: "Generated second choice", exact: true });
    await expect(second).toHaveAttribute("aria-keyshortcuts", "2"); await expect(second.locator("kbd")).toHaveText("2");
    const [cardBox, composerBox] = await Promise.all([card.boundingBox(), page.locator(".main-pane > .composer").boundingBox()]);
    expect(Math.round(cardBox!.x)).toBe(Math.round(composerBox!.x)); expect(Math.round(cardBox!.width)).toBe(Math.round(composerBox!.width));
    await page.screenshot({ path: test.info().outputPath("numbered-question.png") });
    await prompt.focus(); await page.keyboard.press("9");
    await expect(prompt).toHaveValue("9"); await prompt.fill("");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.keyboard.press("2");
    await expect.poll(() => sdk.getState().snapshot!.questions[0]?.answer?.text).toBe("Generated second choice");
    expect(sdk.getState().snapshot!.questions[0]?.answer?.actor).toBe("user");
    await expect(prompt).toHaveValue(""); await fixture.terminal();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the question card offers Skip in its top-right corner and an inline Other, specify field without a send button", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, modelId: fixture.modelId });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByRole("textbox", { name: "Prompt", exact: true }), card = page.getByRole("region", { name: "User question", exact: true });
    await prompt.fill("generated structured question choices only");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const other = card.getByRole("textbox", { name: "Other answer", exact: true }), skip = card.getByRole("button", { name: "Skip", exact: true });
    await expect(other).toHaveAttribute("placeholder", "Other, specify...");
    await expect(card.getByRole("button", { name: "Send answer", exact: true })).toHaveCount(0);
    await expect(card.getByText("Other", { exact: true })).toHaveCount(0);
    const [cardBox, skipBox, headingBox] = await Promise.all([card.boundingBox(), skip.boundingBox(), card.getByRole("heading", { name: "Your answer is needed" }).boundingBox()]);
    expect(cardBox!.x + cardBox!.width - (skipBox!.x + skipBox!.width)).toBeLessThan(24);
    expect(Math.abs((skipBox!.y + skipBox!.height / 2) - (headingBox!.y + headingBox!.height / 2))).toBeLessThan(6);
    await page.screenshot({ path: test.info().outputPath("question-skip.png") });
    await skip.click();
    await expect(card).toHaveCount(0);
    await expect.poll(() => sdk.getState().snapshot!.questions[0]?.answer?.skipped).toBe(true);
    await fixture.terminal();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
