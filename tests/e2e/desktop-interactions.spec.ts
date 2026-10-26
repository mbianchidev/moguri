import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { compareSessionOrder, DraftEditor, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { NEMOTRON_MODEL } from "../../apps/service/src/voice.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
const launch = (directory: string) => electron.launch({ executablePath: require("electron"), args: [".", "--use-fake-device-for-media-stream"], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
async function dropSession(page: Page, title: string) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await page.locator(".session-link").filter({ hasText: title }).dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.getByRole("form", { name: "Message composer" }).dispatchEvent("drop", { dataTransfer: transfer });
    await page.locator(".session-link").filter({ hasText: title }).dispatchEvent("dragend", { dataTransfer: transfer });
  } finally { await transfer.dispose(); }
}
test.skip(process.platform !== "darwin", "Desktop interactions are qualified in hidden macOS Electron.");

test("attachment menu matches the five-source layout, previews retained files/images and removes them without changing the source", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const rail = page.getByRole("navigation", { name: "Sidebar panels" });
    await expect(rail.getByRole("button")).toHaveCount(8);
    expect(await rail.getByRole("button").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")))).toEqual(["Terminal", "Browser", "Insights", "Changes", "Work item", "Files", "Plan", "Side chat"]);
    await expect(page.getByRole("navigation", { name: "Profile resources", exact: true }).getByRole("button")).toHaveText(["Dashboard", "Artifacts", "Candidates", "Sandbox", "Suggestions", "Global Terminal"]);
    const prompt = page.getByLabel("Prompt", { exact: true }); await prompt.fill("Generated complete unsent prompt.");
    const path = join(fixture.directory, "generated-preview.txt"); await writeFile(path, "Generated immutable attached file.");
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
    await page.getByRole("button", { name: "Attach", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Attach", exact: true });
    await expect(menu.getByRole("button")).toHaveText(["Project file or folder...@", "Issue or pull request...#", "Session...:", "Local file...^", "Local folder...^"]);
    await mkdir(artifacts, { recursive: true }); await page.screenshot({ path: join(artifacts, "desktop-attach-menu.png") });
    await menu.getByRole("button", { name: /^Local file/ }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(1);
    await writeFile(path, "Generated changed source, never reread by preview.");
    await page.getByRole("button", { name: "Preview attachment generated-preview.txt", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Attachment preview generated-preview.txt", exact: true });
    await expect(preview.getByLabel("Attached content")).toHaveText("Generated immutable attached file.");
    await preview.getByRole("button", { name: "Remove attachment", exact: true }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(0);
    await expect(prompt).toHaveValue("Generated complete unsent prompt.");
    const png = join(fixture.directory, "generated-preview.png");
    await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 40, g: 80, b: 70, alpha: 1 } } }).png().toFile(png);
    await prompt.fill(`^${png}`); await prompt.press("Tab");
    await page.getByRole("button", { name: "Preview attachment generated-preview.png", exact: true }).click();
    const image = page.getByRole("dialog", { name: "Attachment preview generated-preview.png", exact: true });
    await expect(image.getByRole("img", { name: "generated-preview.png" })).toBeVisible();
    await image.getByRole("button", { name: "Remove attachment", exact: true }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(0);
    await expect(prompt).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    const sideChat = rail.getByRole("button", { name: "Side chat", exact: true });
    await sideChat.scrollIntoViewIfNeeded(); await expect(sideChat).toBeInViewport();
    await expect(page.getByRole("button", { name: "Attention notifications", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("dragging sessions attaches reviewed JSON, remembers opt-out and the colon dropdown excludes archived sessions", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const sourceId = (await sdk.sessions.create(null, "remove-component")).id!;
  const source = sdk.getState().snapshot!.sessions.find((session) => session.id === sourceId)!;
  await sdk.sessions.configure(sourceId, { ...source.controls, modelId: fixture.modelId });
  const editor = new DraftEditor(sdk, sourceId, source.draft);
  try { editor.edit("Generated source session JSON content."); await editor.send("queue"); } finally { editor.dispose(); }
  await waitFor(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === sourceId)?.status === "completed");
  const archivedId = (await sdk.sessions.create(null, "remove-archived")).id!;
  await sdk.command({ type: "session.archive", sessionId: archivedId });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated preserved destination draft.");
    await dropSession(page, "remove-component");
    const review = page.getByRole("dialog", { name: "Review attachment", exact: true });
    await expect(review).toContainText("Generated source session JSON content.");
    await expect(review.getByRole("button", { name: "Attach", exact: true })).toBeDisabled();
    await review.getByLabel("I reviewed this source snapshot and destination.").check();
    await review.getByLabel("Do not ask me again when attaching content from a session").check();
    await review.getByRole("button", { name: "Attach", exact: true }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(1);
    expect(fixture.service.controller.snapshot().settings.values.interactions.confirmSessionAttachments).toBe(false);
    await page.getByRole("button", { name: "Preview attachment remove-component", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Attachment preview remove-component", exact: true });
    await expect(preview.getByLabel("Attached content")).toContainText('"messages":');
    await preview.getByRole("button", { name: "Remove attachment", exact: true }).click();
    await dropSession(page, "remove-component");
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(1);
    await expect(review).toHaveCount(0); await expect(prompt).toHaveValue("Generated preserved destination draft.");
    await prompt.fill(":remove-");
    const choices = page.getByRole("listbox", { name: "Active context sessions" });
    await expect(choices).toContainText("remove-component"); await expect(choices).not.toContainText("remove-archived");
    await prompt.press("Tab");
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(2);
    await expect(prompt).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
test("project and GitHub file shortcuts choose explicit sources while retaining immutable content", async () => {
  const text = "Generated GitHub README snapshot.", data = Buffer.from(text);
  const file = { type: "file", path: "README.md", encoding: "base64", content: data.toString("base64"), size: data.length,
    sha: createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"), html_url: "https://github.com/generated/example/blob/main/README.md" };
  const fixture = await setupFixture({ platform: { integrations: { githubCliRead: async () => file } } }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("@project/fixture.txt"); await prompt.press("Tab");
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: "Attach project file or folder", exact: true }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(1); await expect(prompt).toHaveValue("");
    await page.getByRole("button", { name: "Preview attachment fixture.txt", exact: true }).click();
    const local = page.getByRole("dialog", { name: "Attachment preview fixture.txt", exact: true });
    await expect(local.getByLabel("Attached content")).toContainText("generated original");
    await local.getByRole("button", { name: "Close preview", exact: true }).click();
    await prompt.fill("@generated/example/README.md"); await prompt.press("Tab");
    await page.getByRole("dialog", { name: "Attach", exact: true }).getByRole("button", { name: "Preview reference", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review attachment", exact: true });
    await expect(review).toContainText(text);
    await review.getByLabel("I reviewed this source snapshot and destination.").check();
    await review.getByRole("button", { name: "Attach", exact: true }).click();
    await expect.poll(() => fixture.session().draft.attachments.length).toBe(2); await expect(prompt).toHaveValue("");
    await page.getByRole("button", { name: "Preview attachment generated/example/README.md", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Attachment preview generated/example/README.md", exact: true }).getByLabel("Attached content")).toHaveText(text);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("native session dragging reorders only at drop, and keyboard reordering uses the same durable sibling order", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.rename(fixture.sessionId, "Generated first");
  const second = (await sdk.sessions.create(fixture.session().projectId, "Generated second")).id!;
  const third = (await sdk.sessions.create(fixture.session().projectId, "Generated third")).id!;
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), firstRow = page.locator(".session-link").filter({ hasText: "Generated first" }), thirdRow = page.locator(".session-link").filter({ hasText: "Generated third" });
    await thirdRow.dragTo(firstRow, { targetPosition: { x: 40, y: 3 } });
    await expect.poll(() => fixture.service.controller.snapshot().sessions.slice().sort(compareSessionOrder).map((session) => session.id)).toEqual([third, fixture.sessionId, second]);
    await firstRow.press("Alt+ArrowDown");
    await expect.poll(() => fixture.service.controller.snapshot().sessions.slice().sort(compareSessionOrder).map((session) => session.id)).toEqual([third, second, fixture.sessionId]);
    await page.reload();
    await expect(page.locator(".session-link")).toHaveText(["Generated third", "Generated second", "Generated first"]);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("global terminals auto-start only on explicit opening, confirm pane hides, preserve owners and never auto-replay X termination", async () => {
  const program = { executable: process.execPath, args: ["-e", "process.stdin.setRawMode(true); process.stdin.on('data',d=>process.stdout.write(d)); process.stdout.write('GENERATED_GLOBAL_READY\\n'+process.cwd()+'\\n');"], brokerPath: resolve("dist/terminal-broker.mjs") };
  const fixture = await setupFixture({ platform: { terminal: program } }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await rail.getByRole("button", { name: "Global Terminal", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Ghostty terminal", exact: true });
    await expect(input).toHaveAttribute("aria-disabled", "false");
    const terminal = fixture.service.controller.snapshot().terminals[0]!;
    expect(terminal.sessionId).toBeNull(); expect(terminal.projectId).toBeNull(); expect(terminal.binding?.root).toBe(await realpath(join(fixture.directory, "state")));
    await expect(page.getByRole("button", { name: "Open terminal", exact: true })).toHaveCount(0);
    await rail.getByRole("button", { name: "Global Terminal", exact: true }).click();
    await page.getByRole("dialog", { name: "Close terminal pane", exact: true }).getByRole("button", { name: "Keep open", exact: true }).click();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Sessions", exact: true }).click();
    await page.getByRole("dialog", { name: "Close terminal pane", exact: true }).getByRole("button", { name: "Keep open", exact: true }).click();
    await expect(page.getByRole("region", { name: "Global terminal workspace", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to chat", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Close terminal pane", exact: true });
    await expect(confirm).toContainText("keep running"); await confirm.getByRole("button", { name: "Keep open", exact: true }).click();
    await expect(input).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Back to chat", exact: true }).click();
    await confirm.getByLabel("Do not ask me again when closing terminal").check();
    await confirm.getByRole("button", { name: "Hide terminal", exact: true }).click();
    await expect(input).not.toBeVisible(); expect(fixture.service.controller.snapshot().terminals[0]?.status).toBe("running");
    await rail.getByRole("button", { name: "Global Terminal", exact: true }).click(); await expect(input).toHaveAttribute("aria-disabled", "false");
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(1);
    await page.getByRole("button", { name: "Back to chat", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await rail.getByRole("button", { name: "Global Terminal", exact: true }).click(); await expect(input).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals[0]?.status).toBe("closed");
    await expect(confirm).toHaveCount(0);
    await page.reload(); await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(1);
    await rail.getByRole("button", { name: "Global Terminal", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().terminals.length).toBe(2);
    expect(fixture.service.controller.snapshot().settings.values.interactions.confirmTerminalClose).toBe(false);
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    await page.getByLabel("Project actions for project", { exact: true }).click();
    await page.getByRole("button", { name: "Open project terminal", exact: true }).click();
    await expect(input).toHaveAttribute("aria-disabled", "false");
    const projectConsole = fixture.service.controller.snapshot().terminals.find((terminal) => terminal.sessionId === null && terminal.status === "running");
    expect(projectConsole?.projectId).toBeNull();
    expect(projectConsole?.binding?.root).toBe(await realpath(fixture.project));
    await page.getByRole("button", { name: "Close terminal", exact: true }).click();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("settings use one font family, omit capability-job history and left navigation toggles back to the conversation", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), settings = page.getByRole("button", { name: "Settings", exact: true });
    await settings.click(); await expect(page.getByRole("region", { name: "Moguri settings" })).toBeVisible();
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "Confirmations", exact: true }).click();
    await page.getByLabel("Ask before closing the terminal pane").uncheck();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await categories.getByRole("button", { name: "Startup defaults", exact: true }).click();
    const fonts = await page.locator(".settings-page").evaluate((element) => [...element.querySelectorAll("p, textarea, pre, code, select")].map((element) => getComputedStyle(element).fontFamily));
    expect(new Set(fonts).size).toBe(1);
    await expect(page.getByText("Capability jobs and retained results", { exact: true })).toHaveCount(0);
    await settings.click(); await expect(page.getByRole("region", { name: "Moguri settings" })).toHaveCount(0);
    await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Issues", exact: true }).click();
    await expect(page.getByRole("region", { name: "Project issue board" })).toBeVisible();
    await page.getByRole("button", { name: "Issues", exact: true }).click(); await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
  } finally { await app.close(); await fixture.close(); }
});

test("generated browser dictation preserves typing until the user inserts the completed local transcript", async () => {
  const weights = Buffer.from("Generated desktop recognizer model.");
  const fixture = await setupFixture({ platform: { speech: {
    executable: process.execPath, prefixArgs: [resolve("tests/fixtures/fake-speech.mjs"), "--transcribe-delay", "3400"],
    model: { ...NEMOTRON_MODEL, filename: "generated-ui.gguf", bytes: weights.length, sha256: createHash("sha256").update(weights).digest("hex") },
    fetch: async () => new Response(weights),
  } } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const download = await sdk.voice.download(true); expect((await sdk.jobs.wait(download.id!)).status).toBe("completed");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    const prompt = page.getByLabel("Prompt", { exact: true }); await prompt.fill("Generated existing draft.");
    await page.getByRole("button", { name: "Start local dictation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop local dictation", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Stop local dictation", exact: true }).click();
    await prompt.fill("Generated typing during finalization.");
    await expect.poll(() => fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    await expect(prompt).toHaveValue("Generated typing during finalization.");
    await page.locator(".composer-transcript").getByRole("button", { name: "Insert", exact: true }).click();
    await expect(prompt).toHaveValue("Generated typing during finalization.\nGenerated local dictation.");
    await expect.poll(() => fixture.session().draft.text).toBe("Generated typing during finalization.\nGenerated local dictation.");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(fixture.service.controller.snapshot().jobs.findLast((job) => job.kind === "voice.capture")?.status).toBe("completed");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
