import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export async function qualifyModelDefaults({ packageRoot, directory }) {
  const root = resolve(packageRoot), stateDir = join(directory, "state"), started = performance.now();
  await mkdir(directory, { recursive: true });
  const { createRuntime } = await import(pathToFileURL(join(root, "dist/sdk/node.mjs")).href);
  const { MoguriSdk, PROTOCOL_VERSION } = await import(pathToFileURL(join(root, "dist/sdk/index.mjs")).href);
  const modelId = "generated-installed-model-default";
  let calls = 0;
  const provider = {
    state: { status: "connected", models: [{ id: modelId, name: "Generated installed preference model", contextWindow: 32768,
      maxTokens: 4096, imageInput: false, toolInput: true, thinkingLevels: ["low", "high"], environments: ["Local"] }], login: null, diagnostic: null },
    onChange: () => {}, refresh: async () => {}, logout: async () => {}, cancel: async () => {},
    login: () => { throw new Error("Personal login is forbidden in installed model-default qualification."); },
    prepare: async () => { calls++; throw new Error("Inference is forbidden in installed model-default qualification."); },
  };
  const options = { stateDir, retentionKey: Buffer.alloc(32, 0x6d), provider };
  let runtime, sdk;
  try {
    runtime = await createRuntime(options); sdk = await new MoguriSdk(runtime.connection).ready();
    const source = await sdk.sessions.create(null, "Generated installed explicit model");
    const current = (id) => sdk.getState().snapshot.sessions.find((session) => session.id === id);
    assert.equal(current(source.id).controls.modelId, null);
    await sdk.sessions.selectModel(source.id, modelId);
    await sdk.sessions.modelOptions(source.id, { thinkingEffort: "high", contextWindow: 16384 }, undefined, true);
    const inherited = await sdk.sessions.create(null, "Generated installed remembered model");
    assert.equal(current(inherited.id).controls.modelId, modelId);
    assert.deepEqual(current(inherited.id).controls.modelOptions, { thinkingEffort: "high" });
    assert.equal(current(inherited.id).defaults.sources.modelId, "last-used");
    const cli = join(root, "bin/moguri.mjs"), modelFile = join(directory, "generated-model-options.json");
    const run = (args) => promisify(execFile)(process.execPath, [cli, ...args], { env: { ...process.env, MOGURI_STATE_DIR: stateDir }, timeout: 15_000 });
    await writeFile(modelFile, JSON.stringify({ thinkingEffort: "low" }));
    await run(["session", "model-settings", modelFile, "--session", source.id, "--revision", String(current(source.id).revision)]);
    await sdk.refresh();
    assert.deepEqual(sdk.getState().snapshot.lastModelSelection, { modelId, thinkingEffort: "low" });
    const fromCli = JSON.parse((await run(["session", "create"])).stdout);
    await sdk.refresh(); assert.deepEqual(current(fromCli.id).controls.modelOptions, { thinkingEffort: "low" });
    await sdk.slash(source.id, '/model-settings {"thinkingEffort":"high"}', "tui");
    await sdk.profiles.defaults({ modelId, modelOptions: { thinkingEffort: "low" } }, (await sdk.profiles.list()).catalog.globalDefaults.revision);
    const fixed = await sdk.sessions.create(null, "Generated installed fixed model");
    assert.deepEqual(current(fixed.id).controls.modelOptions, { thinkingEffort: "low" });
    assert.deepEqual(current(source.id).controls.modelOptions, { thinkingEffort: "high" });
    await sdk.profiles.defaults({}, (await sdk.profiles.list()).catalog.globalDefaults.revision);
    await sdk.sessions.delete(source.id, true);
    sdk.disconnect(); await runtime.close(); runtime = await createRuntime(options);
    sdk = await new MoguriSdk(runtime.connection).ready();
    const recovered = await sdk.sessions.create(null, "Generated installed retained model preference");
    assert.deepEqual(current(recovered.id).controls.modelOptions, { thinkingEffort: "high" });
    assert.equal(current(recovered.id).controls.modelId, modelId);
    assert.equal((await sdk.budgets.calls()).calls.length, 0); assert.equal(calls, 0);
    return { status: "PASS", primitive: `Installed protocol-${PROTOCOL_VERSION} model defaults, explicit SDK/CLI/TUI selection, fixed-global precedence and source-independent restart`,
      ms: performance.now() - started, modelCalls: 0, network: "owned loopback control plane only; no inference or personal credentials" };
  } finally { sdk?.disconnect(); await runtime?.close(); }
}
