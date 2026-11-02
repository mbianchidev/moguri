import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { DraftEditor, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { finishIdleSchedule } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The desktop checkpoint is qualified on macOS.");
test("long clipboard text becomes an exact scoped file and modifier queueing never injects its body or starts inference", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Before \u{1f34a} SELECT After");
    const text = Array.from({ length: 51 }, (_, index) => `Generated exact clipboard ${index} \u{1f34a}`).join("\r\n");
    await prompt.evaluate((element, text) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error("Generated composer is not a textarea.");
      element.setSelectionRange(10, 16);
      const transfer = new DataTransfer(); transfer.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, text);
    await expect(prompt).toHaveValue("Before \u{1f34a}  After");
    await expect(page.locator(".attachment-list")).toContainText("moguri-attachment/");
    const attachment = fixture.session().draft.attachments[0]!;
    expect(attachment.kind).toBe("paste_file");
    expect((await sdk.attachments.read(fixture.sessionId, attachment.id)).content).toEqual({ kind: "text", text });
    await prompt.press("Meta+Enter");
    await finishIdleSchedule(page);
    await expect.poll(() => sdk.scheduledPrompts.list(fixture.sessionId)[0]?.status).toBe("scheduled");
    expect(sdk.scheduledPrompts.list(fixture.sessionId)[0]?.text).toBe("Before \u{1f34a}  After");
    expect(sdk.scheduledPrompts.list(fixture.sessionId)[0]?.attachments[0]?.digest).toBe(attachment.digest);
    expect(fixture.requests.length).toBe(0);
    expect(errors).toEqual([]);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("clipboard images, exact folder review and typed GitHub/session triggers preserve explicit context", async () => {
  const fixture = await setupFixture({ imageInput: true, platform: { integrations: {
    githubCliRead: async () => { throw new MoguriError("github_cli_unavailable", "Generated unavailable account.", 403); },
    fetch: async () => Response.json({ number: 7, html_url: "https://github.com/generated/example/issues/7", title: "Generated attachment issue", body: "Generated immutable reference.", state: "open", updated_at: "2026-01-01T00:00:00Z" }),
  } } });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const source = await sdk.sessions.create(null, "Generated source chat");
  const sourceSession = sdk.getState().snapshot!.sessions.find((session) => session.id === source.id)!;
  await sdk.sessions.configure(source.id!, { ...sourceSession.controls, modelId: fixture.modelId });
  const sourceEditor = new DraftEditor(sdk, source.id!, sourceSession.draft);
  try { sourceEditor.edit("Generated source conversation text."); await sourceEditor.send("queue"); } finally { sourceEditor.dispose(); }
  await waitFor(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === source.id)?.status === "completed");
  const folder = join(fixture.directory, "generated-ui-folder"); await mkdir(folder);
  await writeFile(join(folder, "allowed.txt"), "Generated context folder."); await writeFile(join(folder, ".env"), "GENERATED_EXCLUDED=not-a-real-secret");
  const png = await sharp({ create: { width: 24, height: 20, channels: 4, background: { r: 40, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated clipboard image task.");
    await prompt.evaluate((element, encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
      const transfer = new DataTransfer(); transfer.items.add(new File([bytes], "Generated clipboard.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, png.toString("base64"));
    await expect(page.locator(".attachment-list").getByRole("img", { name: "Generated clipboard.png", exact: true })).toBeVisible();
    expect(fixture.requests.length).toBe(1);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    await expect(page.locator(".message-images").getByRole("img", { name: "Generated clipboard.png", exact: true })).toBeVisible();
    expect(JSON.stringify(fixture.requests.at(-1)!.messages)).toContain("data:image/png;base64,");
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, folder);
    await prompt.fill("^"); await prompt.press("Tab");
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: /^Local folder/ }).click();
    const review = page.getByRole("dialog", { name: "Review attachment", exact: true });
    await expect(review).toContainText("allowed.txt");
    await expect(review.getByRole("button", { name: "Attach", exact: true })).toBeDisabled();
    await review.getByLabel("I reviewed this source snapshot and destination.").check();
    await review.getByRole("button", { name: "Attach", exact: true }).click();
    await expect(review).toBeHidden();
    await expect(prompt).toHaveValue("");
    await expect.poll(() => fixture.session().draft.attachments.some((attachment) => attachment.kind === "folder")).toBe(true);
    await prompt.fill(`#https://github.com/generated/example/issues/7`); await prompt.press("Tab");
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: "Preview reference", exact: true }).click();
    await expect(review).toContainText("Generated attachment issue");
    await review.getByLabel("I reviewed this source snapshot and destination.").check();
    await review.getByRole("button", { name: "Attach", exact: true }).click();
    await expect(review).toBeHidden();
    await expect(prompt).toHaveValue("");
    await prompt.fill(`:${source.id}`); await prompt.press("Tab");
    await expect(review).toContainText("Generated source conversation text.");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/typed-context-review.png") });
    await review.getByLabel("I reviewed this source snapshot and destination.").check();
    await review.getByRole("button", { name: "Attach", exact: true }).click();
    await expect(review).toBeHidden();
    await expect.poll(() => fixture.session().draft.attachments.map((attachment) => attachment.kind)).toEqual(["folder", "github_issue", "session"]);
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === source.id)?.status).toBe("completed");
    expect(fixture.requests.length).toBe(2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await page.screenshot({ path: resolve(".moguri/artifacts/typed-context-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
