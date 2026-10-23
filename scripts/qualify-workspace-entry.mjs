import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { cloneRepositoryFixture } from "../tests/fixtures/clone-repository.ts";

export async function qualifyWorkspaceEntry({ packageRoot, directory }) {
  const root = resolve(packageRoot), stateDir = join(directory, "state"), consoleRoot = join(directory, "console"), started = performance.now();
  await mkdir(consoleRoot, { recursive: true });
  const { createRuntime } = await import(pathToFileURL(join(root, "dist/sdk/node.mjs")).href);
  const { MoguriSdk } = await import(pathToFileURL(join(root, "dist/sdk/index.mjs")).href);
  const source = await cloneRepositoryFixture(), secrets = new Map();
  const vault = { read: async (id) => secrets.get(id) ?? null, write: async (id, value) => { secrets.set(id, value); }, remove: async (id) => { secrets.delete(id); } };
  const provider = {
    state: { status: "disconnected", models: [], login: null, diagnostic: null }, onChange: () => {},
    refresh: async () => {}, logout: async () => {}, cancel: async () => {},
    login: () => { throw new Error("Personal login is forbidden in generated entry qualification."); },
    prepare: async () => { throw new Error("No model request is allowed in generated entry qualification."); },
  };
  let runtime, sdk;
  try {
    runtime = await createRuntime({ stateDir, retentionKey: Buffer.alloc(32, 0x76), provider,
      platform: { vault, terminal: { vault, defaultRoot: consoleRoot, executable: "/bin/sh", args: ["-c", "printf 'GENERATED_INSTALLED_GLOBAL_READY\\n'; exec cat"] } } });
    sdk = await new MoguriSdk(runtime.connection).ready();
    const general = await sdk.sessions.create(null, "Generated installed project-free chat");
    const session = sdk.getState().snapshot.sessions.find((session) => session.id === general.id);
    if (process.platform === "darwin") await sdk.sessions.configure(session.id, { ...session.controls, autonomy: "Autopilot" });
    assert.deepEqual(sdk.settings.get().values.permissions, { tools: [], commands: [] });
    const clone = await sdk.projects.clone(source.repository, join(directory, "sdk-clone"), true);
    const job = await sdk.jobs.wait(clone.id); assert.equal(job.status, "completed");
    assert.equal(await readFile(join(directory, "sdk-clone", "generated.txt"), "utf8"), "Generated repository clone contents.\n");
    const cli = join(root, "bin/moguri.mjs");
    const run = (args) => promisify(execFile)(process.execPath, [cli, ...args], { env: { ...process.env, MOGURI_STATE_DIR: stateDir }, timeout: 15_000 });
    await run(["project", "clone", source.repository, join(directory, "cli-clone"), "--confirm-write"]);
    assert.equal(await readFile(join(directory, "cli-clone", "generated.txt"), "utf8"), "Generated repository clone contents.\n");
    if (process.platform === "darwin") {
      const disclosed = await sdk.terminal.defaultRoot(); assert.equal(disclosed.root, await realpath(consoleRoot));
      const opened = await sdk.terminal.openGlobal(disclosed.root);
      const console = await sdk.terminal.read(opened.id);
      assert.equal(console.terminal.sessionId, null); assert.equal(console.terminal.projectId, null);
      await sdk.terminal.input(opened.id, "GENERATED_INSTALLED_GLOBAL_INPUT\n");
      const list = JSON.parse((await run(["terminal", "list"])).stdout); assert.equal(list.terminals[0].id, opened.id);
      const shared = await sdk.slash(general.id, "/terminals", "tui");
      assert.equal(shared.kind, "text"); assert.equal(JSON.parse(shared.text).terminals[0].id, opened.id);
      await sdk.terminal.close(opened.id);
    }
    assert.equal((await sdk.budgets.calls()).calls.length, 0);
    return { status: "PASS", primitive: "Installed protocol-44 SDK/CLI/shared project clone, project-free Autopilot and independent Local console",
      ms: performance.now() - started, network: "generated loopback Git only", modelCalls: 0, nativeControls: process.platform === "darwin" ? "passed" : "not qualified" };
  } finally { sdk?.disconnect(); try { await runtime?.close(); } finally { await source.close(); } }
}
