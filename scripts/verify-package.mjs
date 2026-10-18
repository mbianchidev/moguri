import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const app = resolve(process.argv[2] ?? "release/Moguri-darwin-arm64/Moguri.app");
const root = join(app, "Contents", "Resources", "app");
const node = join(root, "node_modules", "node", "bin", "node");
execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
assert.match(execFileSync(node, ["--version"], { encoding: "utf8" }), /v26\.12\.0/);
assert.match(execFileSync(node, [join(root, "dist", "tui.mjs"), "--help"], { encoding: "utf8" }), /Moguri TUI/);
const temporary = await mkdtemp(join(tmpdir(), "moguri-packaged-"));
let child;
let timer;
try {
  const project = join(temporary, "generated-project");
  await mkdir(project);
  const source = `
    import {startService} from ${JSON.stringify(pathToFileURL(join(root, "dist", "service.mjs")).href)};
    const provider={
      state:{status:"disconnected",models:[],login:null,diagnostic:null},
      onChange:()=>{},refresh:async()=>provider.onChange(),
      login:()=>{throw new Error("No live authorization in package verification")},
      cancel:async()=>{},logout:async()=>{},prepare:async()=>{throw new Error("No paid inference in package verification")}
    };
    const service=await startService({stateDir:${JSON.stringify(join(temporary, "state"))},provider});
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
  assert.deepEqual(snapshot.sessions[0].controls, { env: "Local", modelId: null, autonomy: "Manual", budget: { kind: "unlimited" } });
  assert.equal((await fetch(`${connection.baseUrl}/v1/snapshot`)).status, 401);
  child.send("close");
  assert.equal(await exit, 0);
  console.log("Verified ad-hoc signature, bundled Node, native TUI entrypoint and authenticated packaged service. No personal account or model call used.");
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null) child.kill("SIGTERM");
  await rm(temporary, { recursive: true, force: true });
}
