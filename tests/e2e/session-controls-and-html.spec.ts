import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createServer } from "node:http";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: require("electron"), args: ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Hidden native desktop qualification is macOS-only.");

test("stable IDs and mentions use reviewed context; project bulk attach/detach/archive/delete is real and scoped", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure();
  const projectId = f.session().projectId!;
  const a = (await sdk.sessions.create(projectId, "Generated bulk A")).id!, b = (await sdk.sessions.create(projectId, "Generated bulk B")).id!;
  const keep = (await sdk.sessions.create(projectId, "Generated untouched session")).id!;
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    const insights = page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Insights", exact: true });
    await expect(insights).toBeVisible();
    if (await insights.getAttribute("aria-pressed") !== "true") await insights.click();
    await expect(page.locator(".facts").getByText(f.sessionId, { exact: true })).toBeVisible();
    const prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill(`Read context from ${keep} without changing its workspace.`);
    await prompt.press("Enter");
    const source = page.getByRole("dialog", { name: "Review attachment", exact: true });
    await expect(source).toContainText(keep);
    await source.getByRole("checkbox", { name: "I reviewed this source snapshot and destination.", exact: true }).check();
    await source.getByRole("button", { name: "Attach", exact: true }).click();
    await expect.poll(() => f.session().draft.attachments.some((attachment) => attachment.kind === "session" && attachment.source.location === keep)).toBe(true);
    expect(f.requests).toHaveLength(0);
    const navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const select = async (names: string[]) => {
      await navigation.getByRole("button", { name: /^Project actions for / }).click();
      await page.getByRole("menuitem", { name: "Select sessions", exact: true }).click();
      for (const name of names) await navigation.getByLabel(`Select session ${name}`, { exact: true }).check();
    };
    await select(["Generated bulk A", "Generated bulk B"]);
    await navigation.getByRole("button", { name: "Attach selected", exact: true }).click();
    const attach = page.getByRole("dialog", { name: "attach selected sessions", exact: true });
    await attach.getByLabel("Bulk attachment target", { exact: true }).selectOption(f.sessionId);
    await attach.getByRole("button", { name: "Apply to selected sessions", exact: true }).click();
    await expect.poll(() => sdk.sessions.get(a)?.parentSessionId).toBe(f.sessionId);
    await expect.poll(() => sdk.sessions.get(b)?.parentSessionId).toBe(f.sessionId);
    await select(["Generated bulk A", "Generated bulk B"]);
    await navigation.getByRole("button", { name: "Detach selected", exact: true }).click();
    await page.getByRole("dialog", { name: "detach selected sessions", exact: true }).getByRole("button", { name: "Apply to selected sessions", exact: true }).click();
    await expect.poll(() => sdk.sessions.get(a)?.parentSessionId ?? null).toBe(null);
    await select(["Generated bulk A", "Generated bulk B"]);
    await navigation.getByRole("button", { name: "Archive selected", exact: true }).click();
    const archive = page.getByRole("dialog", { name: "archive selected sessions", exact: true });
    await archive.getByRole("checkbox", { name: "Do not ask me again for multiple archiving", exact: true }).check();
    await archive.getByRole("button", { name: "Apply to selected sessions", exact: true }).click();
    await expect.poll(() => sdk.sessions.get(a)?.status).toBe("archived");
    await expect.poll(() => sdk.settings.get()?.values.retention.confirmBulkArchive).toBe(false);
    const d = (await sdk.sessions.create(projectId, "Generated deletion D")).id!, e = (await sdk.sessions.create(projectId, "Generated deletion E")).id!;
    await select(["Generated deletion D", "Generated deletion E"]);
    await navigation.getByRole("button", { name: "Delete selected", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "delete selected sessions", exact: true });
    await deletion.getByRole("checkbox", { name: "I confirm permanent deletion of this exact selected set.", exact: true }).check();
    await deletion.getByRole("checkbox", { name: "Do not ask me again for multiple deletion", exact: true }).check();
    await deletion.getByRole("button", { name: "Apply to selected sessions", exact: true }).click();
    await expect.poll(() => Boolean(sdk.sessions.get(d) || sdk.sessions.get(e))).toBe(false);
    expect(sdk.sessions.get(keep)?.projectId).toBe(projectId);
    expect(sdk.settings.get()!.values.retention.confirmBulkDelete).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("retained HTML really interacts in a separate renderer without preload, network, file pickers or privileged APIs", async () => {
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.end("Generated forbidden network"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Generated loopback server missing.");
  const html = `<button id="counter">0</button><script>document.querySelector("#counter").onclick=e=>e.target.textContent=Number(e.target.textContent)+1;fetch("http://127.0.0.1:${address.port}/blocked").catch(()=>globalThis.blockedNetwork=true);</script>`;
  const f = await setupFixture({ toolCall: { name: "render_html", args: { title: "Generated interactive counter", html } } });
  await f.configure();
  const sdk = await new MoguriSdk(f.service.connection).ready();
  await sdk.sessions.autonomy(f.sessionId, "Autopilot");
  await f.send("Generate the owned interactive counter."); await f.terminal();
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), output = page.getByRole("region", { name: "Interactive page Generated interactive counter", exact: true });
    await expect(output).toBeVisible();
    await output.getByRole("button", { name: "Open interactive page", exact: true }).click();
    await page.mouse.move(0, 0);
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("data:text/html;base64,")))).toBe(true);
    const proof = await app.evaluate(async ({ webContents, BrowserWindow }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith("data:text/html;base64,"));
      if (!child) throw new Error("The actual isolated output renderer was not created.");
      const data = await child.executeJavaScript(`document.querySelector("#counter").click(); ({count:document.querySelector("#counter").textContent,bridge:typeof window.moguri,node:typeof require,rtc:typeof RTCPeerConnection,worker:typeof Worker,picker:typeof showOpenFilePicker})`);
      return { data, childPid: child.getOSProcessId(), mainPid: BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId() };
    });

    expect(proof.data).toEqual({ count: "1", bridge: "undefined", node: "undefined", rtc: "undefined", worker: "undefined", picker: "undefined" });
    expect(proof.childPid).not.toBe(proof.mainPid);
    expect(requests).toBe(0);
    await output.getByRole("button", { name: "View original HTML", exact: true }).click();
    await expect(output.locator("pre")).toHaveText(html);
    await output.getByRole("button", { name: "Close interactive page", exact: true }).click();
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("data:text/html;base64,")))).toBe(false);
    const message = f.session().messages.findLast((message) => message.role === "assistant" && message.attachments?.some((attachment) => attachment.kind === "html"));
    expect(message?.attachments?.find((attachment) => attachment.kind === "html")?.source.kind).toBe("model-tool-output");
  } finally { await app.close(); sdk.disconnect(); await f.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("pinned descendants and Chats are promoted without changing their roots or authoritative project priority", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await sdk.sessions.selectModel(f.sessionId, f.modelId);
  await sdk.sessions.organize(f.sessionId, { title: "Generated finished session" });
  await f.send("Generated finished task."); await f.terminal();
  const projectId = f.session().projectId;
  const failed = (await sdk.sessions.create(projectId, "Generated failed session", f.session().controls)).id!;
  await sdk.command({ type: "draft.save", sessionId: failed, text: "generated provider failure", attachments: [], expectedRevision: 0 });
  await sdk.command({ type: "message.send", sessionId: failed, expectedRevision: sdk.sessions.get(failed)!.draft.revision, delivery: "queue" });
  await expect.poll(() => sdk.sessions.get(failed)?.status).toBe("failed");
  const question = (await sdk.sessions.create(projectId, "Generated actual question", f.session().controls)).id!;
  await sdk.command({ type: "session.resume", sessionId: question });
  await sdk.command({ type: "draft.save", sessionId: question, text: "generated structured question", attachments: [], expectedRevision: 0 });
  await sdk.command({ type: "message.send", sessionId: question, expectedRevision: sdk.sessions.get(question)!.draft.revision, delivery: "queue" });
  await expect.poll(() => sdk.sessions.get(question)?.pendingQuestionId).not.toBeNull();
  const child = (await sdk.sessions.create(projectId, "Generated pinned child")).id!;
  await sdk.sessions.organize(child, { parentSessionId: f.sessionId, pinned: true });
  const unpinnedChat = (await sdk.sessions.create(null, "Generated unpinned chat")).id!, pinnedChat = (await sdk.sessions.create(null, "Generated pinned chat")).id!;
  await sdk.sessions.organize(pinnedChat, { pinned: true });
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), project = page.getByRole("region", { name: "Project project", exact: true });
    const names = () => project.locator(".session-row .session-link-text > span").allTextContents();
    await expect.poll(names).toEqual(["Generated pinned child", "Generated actual question", "Generated finished session", "Generated failed session"]);
    await expect.poll(() => page.getByRole("region", { name: "Chats", exact: true }).locator(".session-row .session-link-text > span").allTextContents())
      .toEqual(["Generated pinned chat", "Generated unpinned chat"]);
    await sdk.sessions.organize(child, { pinned: false });
    await expect.poll(names).toEqual(["Generated actual question", "Generated finished session", "Generated pinned child", "Generated failed session"]);
    expect(sdk.sessions.get(child)?.parentSessionId).toBe(f.sessionId);
    expect(sdk.sessions.get(child)?.projectId).toBe(projectId);
    expect(sdk.sessions.get(pinnedChat)?.projectId).toBeNull();
    expect(sdk.sessions.get(unpinnedChat)?.projectId).toBeNull();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("a late original HTML read cannot replace or close the user's newer isolated page", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await sdk.sessions.autonomy(f.sessionId, "Autopilot");
  const firstHtml = '<button id="first">First original page</button>', secondHtml = '<button id="second">Second current page</button>';
  const pages: [string, string][] = [["Generated first page", firstHtml], ["Generated second page", secondHtml]];
  for (const [title, html] of pages) {
    expect((await sdk.jobs.wait((await sdk.chatOutputs.renderHtml(f.sessionId, title, html)).id!)).status).toBe("completed");
  }
  const first = f.session().messages.flatMap((message) => message.attachments ?? []).find((attachment) => attachment.kind === "html")!;
  const query = f.service.controller.platform.inputs.query.bind(f.service.controller.platform.inputs);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), admitted = new Promise<void>((resolve) => { entered = resolve; });
  let delayed = false;
  f.service.controller.platform.inputs.query = async (input) => {
    if (input.type === "attachment.read" && input.attachmentId === first.id && !delayed) { delayed = true; entered(); await gate; }
    return query(input);
  };
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 1400));
    await page.getByRole("region", { name: "Interactive page Generated first page", exact: true }).getByRole("button", { name: "Open interactive page", exact: true }).click();
    await expect.poll(() => delayed).toBe(true);
    await admitted;
    await page.getByRole("region", { name: "Interactive page Generated second page", exact: true }).getByRole("button", { name: "Open interactive page", exact: true }).click();
    const currentPage = () => app.evaluate(async ({ webContents }) => {
      const current = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith("data:text/html;base64,"));
      return current?.executeJavaScript("document.querySelector('#second')?.textContent");
    });
    await expect.poll(currentPage).toBe("Second current page");
    release();
    await expect.poll(currentPage).toBe("Second current page");
    await page.getByRole("region", { name: "Interactive page Generated second page", exact: true }).getByRole("button", { name: "Close interactive page", exact: true }).click();
  } finally { release(); await app.close(); sdk.disconnect(); await f.close(); }
});
