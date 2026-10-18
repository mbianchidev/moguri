import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const app = resolve(process.argv[2] ?? `release/${version}/Moguri-darwin-arm64/Moguri.app`);
const root = join(app, "Contents", "Resources", "app");
const node = join(root, "node_modules", "node", "bin", "node");
execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
assert.match(execFileSync(node, ["--version"], { encoding: "utf8" }), /v26\.12\.0/);
assert.match(execFileSync(node, [join(root, "dist", "tui.mjs"), "--help"], { encoding: "utf8" }), /Moguri TUI/);
assert.match(execFileSync(node, [join(root, "dist", "cli.mjs"), "--help"], { encoding: "utf8" }), /Moguri CLI \+ SDK/);
assert.match(execFileSync(join(root, "dist", "native", "speech", "bin", "nemo-speech"), ["--version"], { encoding: "utf8" }), /0\.2\.0/);
const iconName = execFileSync("plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", join(app, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
const icon = join(app, "Contents", "Resources", iconName.endsWith(".icns") ? iconName : `${iconName}.icns`);
await access(icon);
assert.deepEqual(await readFile(icon), await readFile(join(root, "dist", "branding", "moguri.icns")));
const temporary = await mkdtemp(join(tmpdir(), "moguri-packaged-"));
let child;
let timer;
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
    const service=await createRuntime({stateDir:${JSON.stringify(join(temporary, "state"))},provider});
    process.send(service.connection);
    process.on("message",async(message)=>{if(message==="close"){await service.close();process.disconnect();}});
  `;
  child = spawn(node, ["--input-type=module", "--eval", source], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exit = new Promise((resolve) => child.once("exit", resolve));
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
  const opened = await send({ type: "project.add", path: project });
  await send({ type: "session.create", projectId: opened.id });
  const response = await fetch(`${connection.baseUrl}/v1/snapshot`, { headers });
  const snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.protocolVersion, 2);
  assert.equal(snapshot.settings.values.appearance.theme, "dark");
  assert.deepEqual(snapshot.sessions[0].controls, { env: "Local", modelId: null, autonomy: "Manual", budget: { kind: "unlimited" } });
  assert.equal((await fetch(`${connection.baseUrl}/v1/snapshot`)).status, 401);
  const status = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "voice.status" }) });
  assert.equal(status.status, 200);
  const { voice } = await status.json();
  assert.equal(voice.runtimeReady, true);
  assert.equal(voice.modelReady, false);
  assert.equal(voice.languageLocales.length, 40);
  child.send("close");
  assert.equal(await exit, 0);
  console.log("Verified ad-hoc signature, mascot icon, bundled Node, CLI/TUI, embedded SDK, authenticated service and native speech runtime without weights, microphone or a personal account.");
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null) child.kill("SIGTERM");
  await rm(temporary, { recursive: true, force: true });
}
