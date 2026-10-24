import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export const directory = dirname(fileURLToPath(import.meta.url));
export const artifacts = join(directory, "results");
export const repo = resolve(directory, "../..");
export const node = join(repo, "node_modules/node/bin/node");
export const require = createRequire(join(repo, "package.json"));
export const sdkUrl = pathToFileURL(join(repo, "dist/sdk/index.mjs")).href;
export const nodeUrl = pathToFileURL(join(repo, "dist/sdk/node.mjs")).href;
export const nativePath = join(directory, "sdk-native.node");
export const cli = join(directory, "target/release/sdk-study-cli");
export async function packageImport(name) { return import(pathToFileURL(require.resolve(name)).href); }
export async function wasmModule() {
  const { readFile } = await import("node:fs/promises");
  const mod = await import(pathToFileURL(join(directory, "pkg-web/sdk_study_wasm.js")).href);
  const instance = mod.initSync({ module: await readFile(join(directory, "pkg-web/sdk_study_wasm_bg.wasm")) });
  return { mod, instance };
}
