import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { directory, artifacts, nativePath, require } from "./paths.mjs";
const { _electron } = require("@playwright/test");
const root = resolve(directory), diagnostics = [];
const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'self'${url.pathname === "/blocked.html" ? "" : " 'wasm-unsafe-eval'"}; connect-src 'self'`);
    if (url.pathname.endsWith(".html")) {
      response.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><title>Generated SDK fixture</title><script type="module" src="/browser-study.mjs"></script>'); return;
    }
    const path = resolve(root, "." + url.pathname);
    if (!path.startsWith(root + "/")) { response.writeHead(403).end(); return; }
    const type = path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : "text/javascript";
    response.writeHead(200, { "Content-Type": type }).end(await readFile(path));
  })().catch((error) => { diagnostics.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(); });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
let application;
try {
  application = await _electron.launch({ executablePath: require("electron"),
    args: [join(directory, "browser-main.cjs")], cwd: directory, timeout: 30000,
    env: { ...process.env, MOGURI_GENERATED_SDK_URL: `http://127.0.0.1:${port}/blocked.html` } });
  const page = await application.firstWindow({ timeout: 15000 });
  page.on("pageerror", (error) => diagnostics.push(String(error)));
  await page.waitForFunction(() => typeof runGeneratedStudy === "function", undefined, { timeout: 10000 });
  const blocked = await page.evaluate(() => runGeneratedStudy());
  assert.equal(blocked.aotMatches, true); assert.equal(blocked.wasmInitialized, false); assert.equal(blocked.nodeRequire, "undefined");
  await page.goto(`http://127.0.0.1:${port}/allowed.html`);
  await page.waitForFunction(() => typeof runGeneratedStudy === "function", undefined, { timeout: 10000 });
  const allowed = await page.evaluate(() => runGeneratedStudy());
  assert.equal(allowed.aotMatches, true); assert.equal(allowed.wasmInitialized, true);
  assert.equal(allowed.framesMatch, true); assert.equal(allowed.validatorMatches, true);
  assert.equal(allowed.conflictPreserved, true); assert.equal(allowed.nodeRequire, "undefined");
  assert.equal(allowed.unicodeOffset, "A\u{1f34a}XB");
  assert.ok(allowed.memory.afterLarge >= allowed.memory.before);
  assert.equal(allowed.memory.afterFree, allowed.memory.afterLarge);
  const hostVersions = await application.evaluate(() => process.versions);
  const nativeMain = await application.evaluate((_, path) => {
    const r = process.getBuiltinModule("node:module").createRequire(process.cwd() + "/package.json");
    const binding = r(path), core = new binding.NativeCore("default", 43);
    const result = JSON.parse(core.summaryJson());
    return { loaded: result.profileId === "default", summary: result, nodeApi: process.versions.napi };
  }, nativePath);
  assert.equal(nativeMain.loaded, true);
  const results = { blocked, allowed, nativeMain, hostVersions, diagnostics };
  await writeFile(join(artifacts, "issue-22-sdk-browser.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await application?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
