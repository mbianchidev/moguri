import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile, writeFile, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generatedOAuthServer } from "../tests/fixtures/oauth.ts";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const app = resolve(process.argv[2] ?? `release/${version}/Moguri-darwin-arm64/Moguri.app`);
const root = join(app, "Contents", "Resources", "app");
const node = join(root, "node_modules", "node", "bin", "node");
execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
assert.match(execFileSync(node, ["--version"], { encoding: "utf8" }), /v26\.12\.0/);
assert.match(execFileSync(node, [join(root, "dist", "tui.mjs"), "--help"], { encoding: "utf8" }), /Moguri TUI/);
assert.match(execFileSync(node, [join(root, "dist", "cli.mjs"), "--help"], { encoding: "utf8" }), /Moguri CLI \+ SDK/);
await access(join(root, "dist", "remote-bridge.mjs"));
assert.match(execFileSync(node, [join(root, "node_modules", "pnpm", "bin", "pnpm.mjs"), "--version"], { encoding: "utf8" }), /12\.14\.0/);
assert.match(execFileSync(join(root, "dist", "native", "speech", "bin", "nemo-speech"), ["--version"], { encoding: "utf8" }), /0\.2\.0/);
const iconName = execFileSync("plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", join(app, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
const icon = join(app, "Contents", "Resources", iconName.endsWith(".icns") ? iconName : `${iconName}.icns`);
await access(icon);
assert.deepEqual(await readFile(icon), await readFile(join(root, "dist", "branding", "moguri.icns")));
const rendererAssets = await readdir(join(root, "dist", "desktop", "renderer", "assets"));
assert.ok(rendererAssets.some((path) => /^ghostty-vt-.*\.wasm$/.test(path)));
assert.ok(rendererAssets.some((path) => /^GhosttyTerminal-.*\.js$/.test(path)));
const temporary = await mkdtemp(join(tmpdir(), "moguri-packaged-"));
const oauth = await generatedOAuthServer();
let child;
let timer;
let exit;
try {
  const project = join(temporary, "generated-project");
  await mkdir(project);
  await writeFile(join(project, "generated.ts"), "export function packagedSdkKnowledge() { return 'generated'; }");
  const source = `
    import {createRuntime} from ${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href)};
    const provider={
      state:{status:"disconnected",models:[],login:null,diagnostic:null},
      onChange:()=>{},refresh:async()=>provider.onChange(),
      login:()=>{throw new Error("No live authorization in package verification")},
      cancel:async()=>{},logout:async()=>{},prepare:async()=>{throw new Error("No paid inference in package verification")}
    };
    const credentials=new Map();
    const service=await createRuntime({stateDir:${JSON.stringify(join(temporary, "state"))},provider,retentionKey:Buffer.alloc(32,0x67),platform:{vault:{read:async(id)=>credentials.get(id)??null,write:async(id,value)=>{credentials.set(id,value);},remove:async(id)=>{credentials.delete(id);}},terminal:{executable:"/bin/sh",args:["-c","printf 'GENERATED_PACKAGED_PTY_READY\\n'; exec cat"]}}});
    process.send(service.connection);
    const close=async()=>{await service.close();if(process.connected)process.disconnect();};
    process.on("message",async(message)=>{if(message==="close")await close();});
    process.once("SIGTERM",()=>void close());
  `;
  child = spawn(node, ["--input-type=module", "--eval", source], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  exit = new Promise((resolve) => child.once("exit", resolve));
  const connection = await new Promise((resolve, reject) => {
    child.once("message", resolve); child.once("error", reject);
    timer = setTimeout(() => reject(new Error("Packaged service did not become ready.")), 10_000);
  });
  clearTimeout(timer);
  const headers = { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" };
  const send = async (command) => {
    const response = await fetch(`${connection.baseUrl}/v1/commands`, { method: "POST", headers, body: JSON.stringify({ id: randomUUID(), profileId: "default", command }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const query = async (input) => {
    const response = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(response.status, 200); return response.json();
  };
  const opened = await send({ type: "project.add", path: project });
  const created = await send({ type: "session.create", projectId: opened.id });
  const response = await fetch(`${connection.baseUrl}/v1/snapshot`, { headers });
  const snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.protocolVersion, 8);
  assert.equal(snapshot.settings.values.appearance.theme, "dark");
  assert.equal((await query({ type: "remote.status" })).remote.ready, false);
  assert.deepEqual(snapshot.sessions[0].controls, { env: "Local", modelId: null, autonomy: "Manual", budget: { kind: "unlimited" } });
  assert.equal((await fetch(`${connection.baseUrl}/v1/snapshot`)).status, 401);
  const general = await send({ type: "session.create" });
  const preview = await query({ type: "suggestions.preview", sessionId: general.id, allProjects: false });
  assert.equal(preview.preview.scope, "project-free"); assert.equal(preview.preview.sources.length, 0);
  const generalTools = await query({ type: "mcp.tools", serverId: "builtin", sessionId: general.id, query: "", offset: 0 });
  assert.deepEqual(generalTools.tools.map((tool) => tool.name), ["fetch_page"]);
  const meta = await send({ type: "metachat.create", projectId: null, parentSessionId: general.id, prompt: "Generated packaged settings request." });
  const proposed = await send({ type: "configuration.propose", sessionId: meta.id, proposal: { target: "global", section: "instructions", value: "Generated packaged guidance.", reason: "Generated packaged exact review." } });
  const reviewed = await query({ type: "configuration.review", proposalId: proposed.id });
  assert.equal(reviewed.before, "");
  await send({ type: "configuration.decide", proposalId: proposed.id, approve: true, expectedDigest: reviewed.proposal.contentDigest, acknowledgeRisk: true });
  const configured = await (await fetch(`${connection.baseUrl}/v1/snapshot`, { headers })).json();
  assert.equal(configured.settings.values.instructions, "Generated packaged guidance.");
  assert.deepEqual(configured.settings.values.notifications, { inApp: true, os: false, previewContent: false });
  const { MoguriSdk } = await import(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href);
  const sdk = await new MoguriSdk(connection).ready();
  try {
    const settings = sdk.settings.get();
    await sdk.settings.update({ ...settings.values, mcpServers: [{ id: "generated-packaged-oauth", name: "Generated packaged OAuth", enabled: true, transport: { type: "http", url: oauth.url, auth: "oauth" } }] }, settings.revision);
    const login = await sdk.mcp.oauthBegin("generated-packaged-oauth", general.id);
    const state = await sdk.mcp.oauthStatus(login.id);
    assert.equal((await fetch(await oauth.callback(state.url))).status, 200);
    const tools = (await sdk.mcp.tools("generated-packaged-oauth", "", 0, general.id)).tools;
    assert.equal(tools[0].name, "oauth_echo");
    assert.match(tools[0].description, /\[redacted\]/);
    const called = await sdk.mcp.call(general.id, "generated-packaged-oauth", "oauth_echo", {}, tools[0].digest);
    let approval;
    for (let index = 0; index < 100 && !approval; index++) {
      approval = sdk.getState().snapshot.sessions.find((session) => session.id === general.id)?.pendingApproval;
      if (!approval) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(approval);
    await sdk.command({ type: "approval.respond", sessionId: general.id, approvalId: approval.id, allow: true });
    assert.equal((await sdk.jobs.wait(called.id, { timeoutMs: 10_000 })).status, "completed");
    assert.match((await sdk.mcp.readResult(called.id)).text, /Generated OAuth tool response \[redacted\]/);
    await sdk.mcp.oauthClear("generated-packaged-oauth", general.id);
    assert.equal((await sdk.mcp.auth("generated-packaged-oauth")).state, "required");
  } finally { sdk.disconnect(); }
  const terminal = await send({ type: "terminal.open", sessionId: created.id, cols: 80, rows: 24 });
  const input = await fetch(`${connection.baseUrl}/v1/terminal`, { method: "POST", headers, body: JSON.stringify({ action: "input", terminalId: terminal.id, data: "GENERATED_PACKAGED_PTY_INPUT\n" }) });
  assert.equal(input.status, 200);
  let output = "";
  for (let index = 0; index < 50 && !(output.includes("GENERATED_PACKAGED_PTY_READY") && output.includes("GENERATED_PACKAGED_PTY_INPUT")); index++) {
    const response = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "terminal.read", terminalId: terminal.id, offset: 0, limit: 65536 }) });
    assert.equal(response.status, 200); output = (await response.json()).data;
    if (!(output.includes("GENERATED_PACKAGED_PTY_READY") && output.includes("GENERATED_PACKAGED_PTY_INPUT"))) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /GENERATED_PACKAGED_PTY_READY/); assert.match(output, /GENERATED_PACKAGED_PTY_INPUT/);
  await send({ type: "terminal.close", terminalId: terminal.id });
  const status = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "voice.status" }) });
  assert.equal(status.status, 200);
  const { voice } = await status.json();
  assert.equal(voice.runtimeReady, true);
  assert.equal(voice.modelReady, false);
  assert.equal(voice.languageLocales.length, 40);
  const issue = await send({ type: "issue.create", projectId: opened.id, title: "Generated packaged SDK ticket", body: "Generated", kind: "feature", phaseId: "backlog", pullRequestUrl: null });
  assert.ok(issue.id);
  const boardResponse = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "board.get", projectId: opened.id }) });
  const board = await boardResponse.json();
  assert.equal(board.issues[0].title, "Generated packaged SDK ticket");
  child.send("close");
  assert.equal(await exit, 0);
  console.log("Verified ad-hoc signature, mascot icon, bundled Node, CLI/TUI, project-free metachat/config SDK, real packaged OAuth and approved HTTP tool call, PTY transport, Ghostty assets and native speech runtime without weights, microphone or a personal account.");
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null) {
    if (child.connected) child.send("close"); else child.kill("SIGTERM");
    try {
      await Promise.race([exit, new Promise((_, reject) => { timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Packaged cleanup was not acknowledged; generated diagnostics retained at ${temporary}.`)); }, 6500); })]);
    } finally { clearTimeout(timer); }
  }
  await oauth.close();
  await rm(temporary, { recursive: true, force: true });
}
