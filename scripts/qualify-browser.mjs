import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function qualifyBrowser({ packageRoot, directory }) {
  const root = resolve(packageRoot), started = performance.now(), stateDir = join(directory, "state");
  await mkdir(directory, { recursive: true });
  const { createRuntime } = await import(pathToFileURL(join(root, "dist/sdk/node.mjs")).href);
  const { MoguriSdk, BROWSER_MCP_TOOLS } = await import(pathToFileURL(join(root, "dist/sdk/index.mjs")).href);
  let calls = 0, runtime, sdk;
  const provider = {
    state: { status: "disconnected", models: [], login: null, diagnostic: null },
    onChange: () => {}, refresh: async () => {}, logout: async () => {}, cancel: async () => {},
    login: () => { throw new Error("Personal login is forbidden in browser SDK qualification."); },
    prepare: async () => { calls++; throw new Error("Inference is forbidden in browser SDK qualification."); },
  };
  const options = { stateDir, retentionKey: Buffer.alloc(32, 0x62), provider };
  try {
    runtime = await createRuntime(options); sdk = await new MoguriSdk(runtime.connection).ready();
    const session = await sdk.sessions.create(null, "Generated installed browser host");
    const owner = { sessionId: session.id, hostId: "generated-installed-browser", lease: "bd".repeat(32) };
    const before = (await sdk.browser.state(session.id)).browser;
    assert.equal(before.available, false); assert.equal(before.controlId, null);
    const found = await sdk.query({ type: "mcp.tools", sessionId: session.id, serverId: "builtin", query: "navigate", offset: 0 });
    assert.ok(found.tools.some((tool) => tool.name === "browser_navigate"));
    assert.equal(BROWSER_MCP_TOOLS.length, 6);
    await sdk.browser.host.attach(owner); await sdk.browser.host.control(owner, 1, true);
    const enabled = (await sdk.browser.state(session.id)).browser.controlId; assert.ok(enabled);
    const poll = await sdk.browser.host.poll(owner, "https://example.invalid/generated-installed", "Generated installed browser");
    assert.equal(poll.controlId, enabled); assert.equal(poll.request, null);
    await sdk.browser.host.control(owner, 3, false);
    await assert.rejects(() => sdk.browser.host.control(owner, 2, true), { code: "browser_control_stale" });
    await sdk.browser.host.control(owner, 4, true);
    assert.notEqual((await sdk.browser.state(session.id)).browser.controlId, enabled);
    sdk.disconnect(); await runtime.close(); runtime = await createRuntime(options);
    sdk = await new MoguriSdk(runtime.connection).ready();
    assert.equal((await sdk.browser.state(session.id)).browser.available, false);
    await assert.rejects(() => sdk.browser.host.poll(owner, "", ""), { code: "browser_owner" });
    assert.equal(calls, 0);
    return { status: "PASS", primitive: "Installed browser-safe SDK, builtin navigate discovery, rootless native-host lease, monotonic toggle revocation and actual service restart without replay",
      ms: performance.now() - started, modelCalls: calls, nativeBrowser: "qualified separately by hidden Electron; this probe uses generated host metadata only" };
  } finally { sdk?.disconnect(); await runtime?.close(); }
}
