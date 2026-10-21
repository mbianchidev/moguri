import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const root = await mkdtemp(resolve(".moguri/session-spike-"));
const results = [];
try {
  const db = new DatabaseSync(join(root, "retention.sqlite"));
  db.exec("PRAGMA secure_delete=ON; CREATE TABLE events (id INTEGER PRIMARY KEY,scope TEXT NOT NULL,data BLOB NOT NULL,iv BLOB NOT NULL,tag BLOB NOT NULL); CREATE TABLE keys (scope TEXT PRIMARY KEY,key BLOB NOT NULL); CREATE TRIGGER immutable BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append-only'); END");
  const encrypt = (scope, value) => {
    let row = db.prepare("SELECT key FROM keys WHERE scope=?").get(scope);
    if (!row) { row = { key: randomBytes(32) }; db.prepare("INSERT INTO keys VALUES (?,?)").run(scope, row.key); }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", row.key, iv); cipher.setAAD(Buffer.from(scope));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    db.prepare("INSERT INTO events(scope,data,iv,tag) VALUES (?,?,?,?)").run(scope, data, iv, cipher.getAuthTag());
  };
  const started = performance.now();
  for (let index = 0; index < 500; index++) encrypt(index % 2 ? "session-generated" : "project-artifact", `Generated retained content ${index}`);
  assert.throws(() => db.exec("DELETE FROM events"), /append-only/);
  const retained = db.prepare("SELECT count(*) AS total FROM events").get().total;
  db.prepare("DELETE FROM keys WHERE scope=?").run("session-generated");
  let readable = 0;
  for (const row of db.prepare("SELECT * FROM events").all()) {
    const key = db.prepare("SELECT key FROM keys WHERE scope=?").get(row.scope);
    if (!key) continue;
    const decipher = createDecipheriv("aes-256-gcm", key.key, row.iv); decipher.setAAD(Buffer.from(row.scope)); decipher.setAuthTag(row.tag);
    assert.match(Buffer.concat([decipher.update(row.data), decipher.final()]).toString(), /Generated retained content/);
    readable++;
  }
  assert.equal(retained, 500); assert.equal(readable, 250);
  results.push({ name: "Append-only events with independently erasable retention compartments", status: "PASS", events: retained, retainedArtifacts: readable, elapsedMs: performance.now() - started });
  db.close();
  const wasm = await readFile(require.resolve("ghostty-web/ghostty-vt.wasm"));
  const bundle = await build({
    stdin: { contents: `import {Ghostty,Terminal,FitAddon} from "ghostty-web";
      const start=performance.now(); const ghostty=await Ghostty.load(location.origin+"/ghostty-vt.wasm");
      const terminal=new Terminal({ghostty,cols:80,rows:24,fontSize:13,theme:{background:"#141922",foreground:"#e1e8f0"}});
      terminal.open(document.querySelector("main")); const fit=new FitAddon(); terminal.loadAddon(fit); fit.fit();
      let input=""; terminal.onData(data=>input+=data);
      terminal.write("\\x1b[31mGenerated Ghostty terminal\\x1b[0m\\r\\n");
      terminal.input("generated-user-input",true);
      window.spike={terminal,fit,read:()=>({text:terminal.buffer.active.getLine(0)?.translateToString(true),input,cols:terminal.cols,rows:terminal.rows,elapsedMs:performance.now()-start})};
    `, resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", write: false,
  });
  const server = createServer((request, response) => {
    if (request.url === "/ghostty-vt.wasm") { response.setHeader("content-type", "application/wasm"); response.end(wasm); }
    else if (request.url === "/spike.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].contents); }
    else {
      response.setHeader("content-type", "text/html");
      response.setHeader("Content-Security-Policy", "default-src 'self';script-src 'self' 'wasm-unsafe-eval';style-src 'self';connect-src 'self';object-src 'none';frame-src 'none'");
      response.end('<!doctype html><title>Generated Ghostty spike</title><main></main><script type="module" src="/spike.js"></script>');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let app;
  try {
    const entry = join(root, "electron.cjs");
    await writeFile(entry, `const{app,BrowserWindow}=require("electron");
      app.whenReady().then(()=>{const w=new BrowserWindow({show:false,width:900,height:680,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
      w.webContents.session.setPermissionRequestHandler((a,b,c)=>c(false));w.webContents.setWindowOpenHandler(()=>({action:"deny"}));
      w.loadURL("http://127.0.0.1:${server.address().port}/");});app.on("window-all-closed",()=>app.quit());`);
    app = await electron.launch({ executablePath: require("electron"), args: [entry] });
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.spike?.read().text?.includes("Generated Ghostty terminal"));
    const result = await page.evaluate(() => window.spike.read());
    assert.equal(result.input, "generated-user-input");
    assert.ok(result.cols > 0 && result.rows > 0);
    assert.equal(await page.locator("canvas").count(), 1);
    results.push({ name: "Real Ghostty WASM in hidden sandboxed Electron under strict CSP", status: "PASS", wasmBytes: wasm.length, ...result });
    await page.evaluate(() => window.spike.terminal.dispose());
  } finally { await app?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  console.log(JSON.stringify(results, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
