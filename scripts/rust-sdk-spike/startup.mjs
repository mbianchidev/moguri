import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { directory, sdkUrl, nodeUrl, nativePath, require, wasmModule } from "./paths.mjs";

const mode = process.argv[2], connection = process.argv[3] ? JSON.parse(process.argv[3]) : null;
const start = performance.now();
let client, core, validator, binding, instance;
if (mode === "sdk-root" || mode === "sdk-connected") {
  const { MoguriSdk } = await import(sdkUrl);
  if (mode === "sdk-connected") { client = new MoguriSdk(connection); await client.ready(); }
} else if (mode === "sdk-node") await import(nodeUrl);
else if (mode === "js-core") {
  const { JsCore } = await import("./js-core.mjs"); core = new JsCore("default", 43);
} else if (mode.startsWith("native")) {
  binding = require(nativePath); core = new binding.NativeCore("default", 43);
  if (mode.endsWith("validated")) validator = new binding.NativeValidator(await readFile(join(directory, "query-schema.json"), "utf8"));
} else if (mode.startsWith("wasm")) {
  ({ mod: binding, instance } = await wasmModule()); core = new binding.WasmCore("default", 43);
  if (mode.endsWith("validated")) validator = new binding.WasmValidator(await readFile(join(directory, "query-schema.json"), "utf8"));
} else if (mode !== "empty") throw new Error("Unknown startup mode.");
console.log(JSON.stringify({ type: "ready", mode, initMs: performance.now() - start,
  memory: process.memoryUsage(), wasmBytes: instance?.memory.buffer.byteLength ?? null }));
for await (const line of createInterface({ input: process.stdin })) {
  const input = JSON.parse(line);
  if (input.action === "quit") {
    client?.disconnect(); core?.free?.(); validator?.free?.();
    console.log(JSON.stringify({ id: input.id, ok: true })); break;
  }
  if (input.action === "memory") console.log(JSON.stringify({ id: input.id, ok: true,
    memory: process.memoryUsage(), wasmBytes: instance?.memory.buffer.byteLength ?? null }));
}
