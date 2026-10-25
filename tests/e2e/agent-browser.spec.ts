import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { join } from "node:path";
import sharp from "sharp";
import { MoguriSdk, isRecord } from "../../packages/sdk/src/index.ts";
import { setupFixture, type GeneratedProviderOptions } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The native browser is qualified on macOS.");

async function browserFixture(options: GeneratedProviderOptions = {}, openUrl = true) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/slow") return;
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Generated browser</title>
      <h1>Generated browser page</h1><label>Generated text <input id="text"></label>
      <label>Generated password <input type="password" value="generated-secret"></label>
      <button onclick="this.dataset.count=String(Number(this.dataset.count || 0)+1);document.querySelector('output').textContent=document.querySelector('#text').value || 'Clicked'">Apply generated text</button>
      <output>Not applied</output><a href="/next">Generated next page</a>
      <button onclick="document.querySelector('output').textContent=confirm('Generated page confirmation')?'Confirmed':'Dismissed'">Generated page dialog</button>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Generated browser bind failed.");
  const url = `http://127.0.0.1:${address.port}/`;
  const fixture = await setupFixture(options);
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const page = await app.firstWindow();
  const prompt = page.getByLabel("Prompt", { exact: true });
  await expect(prompt).toBeEnabled();
  if (openUrl) {
    await prompt.fill(`/browser ${url}`);
    await prompt.press("Meta+Enter");
    await expect(page.getByLabel("Preview URL", { exact: true })).toHaveValue(url);
    await expect.poll(() => app.evaluate(({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url), url)).toBe(true);
  } else await page.getByRole("button", { name: "Browser", exact: true }).click();
  return { fixture, app, page, url, requests, close: async () => {
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await app.close(); await fixture.close();
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}

async function callBrowser(owned: Awaited<ReturnType<typeof browserFixture>>, sdk: MoguriSdk, tool: string, args: Record<string, unknown>) {
  const catalog = await sdk.query({ type: "mcp.tools", serverId: "builtin", sessionId: owned.fixture.sessionId, query: tool, offset: 0 });
  const definition = catalog.tools.find((candidate) => candidate.name === tool);
  if (!definition) throw new Error(`Generated browser tool ${tool} was not discoverable.`);
  const started = await sdk.command({ type: "mcp.call", sessionId: owned.fixture.sessionId, serverId: "builtin", tool, arguments: args, schemaDigest: definition.digest });
  await owned.fixture.approve();
  await expect.poll(() => owned.fixture.service.controller.snapshot().jobs.find((job) => job.id === started.id)?.status).not.toMatch(/^(running|waiting_input)$/);
  const job = owned.fixture.service.controller.snapshot().jobs.find((job) => job.id === started.id);
  if (!job?.resultDigest) throw new Error(`Generated browser result was not retained: ${job?.error ?? "unknown result"}`);
  const saved = await sdk.query({ type: "result.read", resultId: job.id, offset: 0, limit: 32768 });
  const result: unknown = JSON.parse(saved.text);
  if (!isRecord(result) || !Array.isArray(result.content) || !isRecord(result.content[0]) || typeof result.content[0].text !== "string") throw new Error("Generated browser result has no original MCP text.");
  return { job, result, text: result.content[0].text };
}

function snapshotData(text: string) {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.snapshotId !== "string" || !Array.isArray(value.nodes)) throw new Error("Generated browser snapshot has no exact element handles.");
  const nodes = value.nodes.filter(isRecord);
  const element = (role: string, name: string) => {
    const node = nodes.find((node) => node.role === role && typeof node.name === "string" && node.name.trim() === name);
    if (typeof node?.ref !== "string") throw new Error(`Generated browser ${role} ${name} has no exact ref.`);
    return node.ref;
  };
  return { snapshotId: value.snapshotId, element, nodes };
}

async function captureBrowserPane(owned: Awaited<ReturnType<typeof browserFixture>>, path: string) {
  const captured = await owned.app.evaluate(async ({ BrowserWindow, WebContentsView }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    const view = window.contentView.children.find((child) => child instanceof WebContentsView);
    if (!(view instanceof WebContentsView)) throw new Error("The generated native browser view is missing.");
    const chrome = await window.webContents.capturePage(), page = await view.webContents.capturePage();
    return { chrome: chrome.toPNG().toString("base64"), page: page.toPNG().toString("base64"), bounds: view.getBounds(), width: window.getContentBounds().width };
  });
  const chrome = Buffer.from(captured.chrome, "base64"), page = Buffer.from(captured.page, "base64");
  const metadata = await sharp(chrome).metadata();
  if (!metadata.width) throw new Error("The generated app capture has no pixel width.");
  const scale = metadata.width / captured.width;
  const native = await sharp(page).resize(Math.round(captured.bounds.width * scale), Math.round(captured.bounds.height * scale)).png().toBuffer();
  expect((await sharp(native).stats()).channels.some((channel) => channel.stdev > 1)).toBe(true);
  await sharp(chrome).composite([{ input: native, left: Math.round(captured.bounds.x * scale), top: Math.round(captured.bounds.y * scale) }]).png().toFile(path);
}

test("native browser primitives expose real Chromium accessibility and exact-page interaction", async () => {
  const owned = await browserFixture();
  try {
    const result = await owned.app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((contents) => contents.getURL() === url);
      if (!contents) throw new Error("Generated native preview missing.");
      contents.debugger.attach("1.3");
      try {
        const tree = await contents.debugger.sendCommand("Accessibility.getFullAXTree", { depth: 12 });
        const button = tree.nodes.find((node: { role?: { value: string }; name?: { value: string } }) => node.role?.value === "button" && node.name?.value === "Apply generated text");
        if (!button?.backendDOMNodeId) throw new Error("Generated button has no native DOM identity.");
        const resolved = await contents.debugger.sendCommand("DOM.resolveNode", { backendNodeId: button.backendDOMNodeId });
        await contents.debugger.sendCommand("Runtime.callFunctionOn", { objectId: resolved.object.objectId, functionDeclaration: "function(){this.click()}", returnByValue: true });
        return { clicked: await contents.executeJavaScript("document.querySelector('output').textContent"),
          bridge: await contents.executeJavaScript("typeof window.moguri + ':' + typeof process"),
          namedInput: tree.nodes.some((node: { role?: { value: string }; name?: { value: string } }) => node.role?.value === "textbox" && node.name?.value.trim() === "Generated text"),
          nativeDebuggerAttached: contents.debugger.isAttached() };
      } finally { contents.debugger.detach(); }
    }, owned.url);
    expect(result).toEqual({ clicked: "Clicked", bridge: "undefined:undefined", namedInput: true, nativeDebuggerAttached: true });
    expect(owned.fixture.requests.length).toBe(0);
  } finally { await owned.close(); }
});

test("the session browser has a user-controlled agent access toggle", async () => {
  const owned = await browserFixture();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  } finally { await owned.close(); }
});

test("approved browser tools navigate, inspect, fill, click and press keys in the existing pane", async () => {
  const owned = await browserFixture(), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const controlId = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    const inspected = await callBrowser(owned, sdk, "browser_snapshot", { controlId });
    expect(inspected.job.status).toBe("completed"); expect(inspected.text).not.toContain("generated-secret");
    const first = snapshotData(inspected.text);
    const filled = await callBrowser(owned, sdk, "browser_fill", { controlId, snapshotId: first.snapshotId, ref: first.element("textbox", "Generated text"), text: "Generated agent input" });
    expect(filled.job.status).toBe("completed");
    const fresh = snapshotData((await callBrowser(owned, sdk, "browser_snapshot", { controlId })).text);
    expect((await callBrowser(owned, sdk, "browser_click", { controlId, snapshotId: fresh.snapshotId, ref: fresh.element("button", "Apply generated text") })).job.status).toBe("completed");
    const readPage = () => owned.app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((contents) => contents.getURL() === url);
      return contents?.executeJavaScript("({text:document.querySelector('output').textContent,count:document.querySelector('button').dataset.count,bridge:typeof window.moguri,node:typeof process})");
    }, owned.url);
    await expect.poll(readPage).toEqual({ text: "Generated agent input", count: "1", bridge: "undefined", node: "undefined" });
    const keyed = snapshotData((await callBrowser(owned, sdk, "browser_snapshot", { controlId })).text);
    expect((await callBrowser(owned, sdk, "browser_press_key", { controlId, snapshotId: keyed.snapshotId, ref: keyed.element("button", "Apply generated text"), key: "Enter" })).job.status).toBe("completed");
    await expect.poll(readPage).toEqual({ text: "Generated agent input", count: "2", bridge: "undefined", node: "undefined" });
    expect((await callBrowser(owned, sdk, "browser_navigate", { controlId, url: `${owned.url}next` })).job.status).toBe("completed");
    await expect(owned.page.getByLabel("Preview URL", { exact: true })).toHaveValue(`${owned.url}next`);
    await owned.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1080, 780));
    await expect(owned.page.getByLabel("Preview URL", { exact: true })).toHaveValue(`${owned.url}next`);
    await owned.page.getByLabel("Preview URL", { exact: true }).fill(owned.url);
    await owned.page.getByRole("button", { name: "Load preview", exact: true }).click();
    await expect.poll(() => owned.app.evaluate(({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url), owned.url)).toBe(true);
    expect(owned.fixture.requests.length).toBe(0);
    await captureBrowserPane(owned, ".moguri/artifacts/agent-browser-control.png");
  } finally { sdk.disconnect(); await owned.close(); }
});

test("turning off during navigation cancels with a partial result and a fresh enable never replays old authority", async () => {
  const owned = await browserFixture(), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const old = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    const action = callBrowser(owned, sdk, "browser_navigate", { controlId: old, url: `${owned.url}slow` });
    await expect.poll(() => owned.requests.includes("/slow")).toBe(true);
    await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).toBeNull();
    const cancelled = await action;
    expect(cancelled.job.status).toBe("partial"); expect(cancelled.result.outcome).toBe("partial");
    await sdk.command({ type: "session.resume", sessionId: owned.fixture.sessionId });
    await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const current = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    expect(current).not.toBe(old);
    const stale = await callBrowser(owned, sdk, "browser_navigate", { controlId: old, url: `${owned.url}not-replayed` });
    expect(stale.job.status).toBe("failed"); expect(owned.requests).not.toContain("/not-replayed");
    await sdk.command({ type: "session.resume", sessionId: owned.fixture.sessionId });
    expect((await callBrowser(owned, sdk, "browser_navigate", { controlId: current, url: `${owned.url}fresh` })).job.status).toBe("completed");
    expect(owned.requests.filter((url) => url === "/slow")).toHaveLength(1);
    expect(owned.fixture.requests.length).toBe(0);
  } finally { sdk.disconnect(); await owned.close(); }
});

test("a normal model turn can use the discoverable builtin browser through exact approval", async () => {
  const options: GeneratedProviderOptions = { toolCall: { name: "mcp_gateway", args: {} } };
  const owned = await browserFixture(options), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const controlId = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    const tools = await sdk.query({ type: "mcp.tools", serverId: "builtin", sessionId: owned.fixture.sessionId, query: "navigate", offset: 0 });
    const tool = tools.tools.find((tool) => tool.name === "browser_navigate")!;
    options.toolCall!.args = { action: "call", serverId: "builtin", tool: tool.name, schemaDigest: tool.digest, arguments: { controlId, url: `${owned.url}model` } };
    await owned.fixture.configure(); await owned.fixture.send("Generated approved browser operation");
    await expect.poll(() => owned.fixture.session().pendingApproval?.call.name).toBe("mcp_gateway");
    expect(owned.requests).not.toContain("/model");
    await owned.fixture.approve();
    const completed = await owned.fixture.terminal();
    expect(completed.status).toBe("completed"); expect(owned.requests).toContain("/model");
    expect(owned.fixture.requests).toHaveLength(2);
    expect(JSON.stringify(owned.fixture.requests[1])).toContain("untrusted-browser-result");
  } finally { sdk.disconnect(); await owned.close(); }
});

test("default-off, denied approval, password fields and stale document refs cannot bypass browser boundaries", async () => {
  const owned = await browserFixture(), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const status = JSON.parse((await callBrowser(owned, sdk, "browser_status", {})).text);
    expect(status.controlId).toBeNull(); expect(status.url).toBeNull();
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const controlId = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    const catalog = await sdk.query({ type: "mcp.tools", serverId: "builtin", sessionId: owned.fixture.sessionId, query: "browser_navigate", offset: 0 });
    const tool = catalog.tools.find((tool) => tool.name === "browser_navigate")!;
    const denied = await sdk.command({ type: "mcp.call", sessionId: owned.fixture.sessionId, serverId: "builtin", tool: tool.name,
      schemaDigest: tool.digest, arguments: { controlId, url: `${owned.url}denied` } });
    await owned.fixture.approve(false);
    await expect.poll(() => owned.fixture.service.controller.snapshot().jobs.find((job) => job.id === denied.id)?.status).toBe("cancelled");
    expect(owned.requests).not.toContain("/denied");
    const inspected = snapshotData((await callBrowser(owned, sdk, "browser_snapshot", { controlId })).text);
    const password = await callBrowser(owned, sdk, "browser_fill", { controlId, snapshotId: inspected.snapshotId, ref: inspected.element("textbox", "Generated password"), text: "generated-refused-password" });
    expect(password.result.isError).toBe(true); expect(password.job.status).not.toBe("completed");
    await sdk.command({ type: "session.resume", sessionId: owned.fixture.sessionId });
    const fresh = snapshotData((await callBrowser(owned, sdk, "browser_snapshot", { controlId })).text);
    await owned.page.getByLabel("Preview URL", { exact: true }).fill(`${owned.url}manual`);
    await owned.page.getByRole("button", { name: "Load preview", exact: true }).click();
    await expect.poll(() => owned.requests.includes("/manual")).toBe(true);
    const stale = await callBrowser(owned, sdk, "browser_click", { controlId, snapshotId: fresh.snapshotId, ref: fresh.element("button", "Apply generated text") });
    expect(stale.job.status).toBe("failed");
    await sdk.command({ type: "session.resume", sessionId: owned.fixture.sessionId });
    await toggle.click();
    expect((await callBrowser(owned, sdk, "browser_status", {})).text).not.toContain("Generated browser");
  } finally { sdk.disconnect(); await owned.close(); }
});

test("hiding and reopening the same browser clears its private state and never re-enables agent control", async () => {
  const owned = await browserFixture(), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const original = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId;
    await owned.app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((contents) => contents.getURL() === url)!;
      await contents.executeJavaScript("localStorage.setItem('generated-browser-private','generated-value')");
    }, owned.url);
    const button = owned.page.getByRole("button", { name: "Browser", exact: true });
    for (let index = 0; index < 3; index++) {
      await button.click(); await expect(toggle).not.toBeVisible();
      await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.available).toBe(false);
      await button.click(); await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked();
      await expect.poll(() => owned.app.evaluate(({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url), owned.url)).toBe(true);
    }
    const stored = await owned.app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((contents) => contents.getURL() === url)!;
      return contents.executeJavaScript("localStorage.getItem('generated-browser-private')");
    }, owned.url);
    expect(stored).toBeNull();
    await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    expect((await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBe(original);
    expect(owned.fixture.requests.length).toBe(0);
  } finally { sdk.disconnect(); await owned.close(); }
});

test("an empty pane supports approved agent navigation and rapid off wins without a personal browser", async () => {
  const owned = await browserFixture({}, false), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); expect(owned.requests.length).toBe(0);
    await owned.page.evaluate(async ({ sessionId, profileId }) => {
      await Promise.allSettled([
        window.moguri.browserControl(sessionId, true, profileId),
        window.moguri.browserControl(sessionId, false, profileId),
      ]);
    }, { sessionId: owned.fixture.sessionId, profileId: sdk.profileId });
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).toBeNull();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const controlId = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    expect((await callBrowser(owned, sdk, "browser_navigate", { controlId, url: owned.url })).job.status).toBe("completed");
    await expect(owned.page.getByLabel("Preview URL", { exact: true })).toHaveValue(owned.url);
    await expect(owned.page.getByRole("button", { name: "Open preview in default browser", exact: true })).toBeEnabled();
  } finally { sdk.disconnect(); await owned.close(); }
});

test("agent page confirmation dialogs are dismissed, never accepted or allowed to block the control switch", async () => {
  const owned = await browserFixture(), sdk = await new MoguriSdk(owned.fixture.service.connection).ready();
  try {
    const toggle = owned.page.getByRole("switch", { name: "Agent browser control", exact: true });
    await expect(toggle).toBeEnabled(); await toggle.click();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).not.toBeNull();
    const controlId = (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId!;
    const inspected = snapshotData((await callBrowser(owned, sdk, "browser_snapshot", { controlId })).text);
    const result = await callBrowser(owned, sdk, "browser_click", { controlId, snapshotId: inspected.snapshotId, ref: inspected.element("button", "Generated page dialog") });
    expect(result.job.status).toBe("completed");
    await expect.poll(() => owned.app.evaluate(async ({ webContents }, url) => {
      const contents = webContents.getAllWebContents().find((contents) => contents.getURL() === url)!;
      return contents.executeJavaScript("document.querySelector('output').textContent");
    }, owned.url)).toBe("Dismissed");
    await toggle.click(); await expect(toggle).not.toBeChecked();
    await expect.poll(async () => (await sdk.browser.state(owned.fixture.sessionId)).browser.controlId).toBeNull();
  } finally { sdk.disconnect(); await owned.close(); }
});
