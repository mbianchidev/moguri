import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { stageUpdateArchive } from "../apps/service/src/update-archive.ts";
import { parse, UpdateManifestSchema } from "../packages/protocol/src/index.ts";

if (process.platform !== "darwin") throw new Error("Actual macOS update-package roundtrip is not Linux release qualification.");
const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const manifestPath = resolve(process.argv[2] ?? `release/Moguri-${version}-macos-arm64.manifest.json`);
const manifest = parse(UpdateManifestSchema, JSON.parse(await readFile(manifestPath, "utf8")));
assert.equal(basename(manifest.archive.name), manifest.archive.name);
const archive = join(dirname(manifestPath), manifest.archive.name);
const parent = resolve(".moguri"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "update-roundtrip-")), started = performance.now();
try {
  await stageUpdateArchive(archive, join(directory, "staged"), manifest, new AbortController().signal);
  console.log(JSON.stringify({ status: "PASS", primitive: "Actual packaged ZIP/manifest through bounded production update consumer",
    version: manifest.version, arch: manifest.arch, archiveBytes: manifest.archive.bytes, ms: performance.now() - started,
    applicationExecuted: false, personalCredentials: false, quarantineBypassed: false }));
} finally { await rm(directory, { recursive: true, force: true }); }
