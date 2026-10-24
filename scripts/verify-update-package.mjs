import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import { stageUpdateArchive } from "../apps/service/src/update-archive.ts";
import { parse, UpdateManifestSchema } from "../packages/protocol/src/index.ts";
import { bundleTreeSha512, verifyBundleIdentity } from "../apps/service/src/bundle-tree.ts";
import { verifyDmgLayout } from "./dmg-layout.ts";

if (process.platform !== "darwin") throw new Error("Actual macOS update-package roundtrip is not Linux release qualification.");
const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const { values, positionals } = parseArgs({ allowPositionals: true, options: { "dmg-only": { type: "boolean" } } });
const manifestPath = resolve(positionals[0] ?? `release/Moguri-${version}-macos-arm64.manifest.json`);
const manifest = parse(UpdateManifestSchema, JSON.parse(await readFile(manifestPath, "utf8")));
assert.equal(basename(manifest.archive.name), manifest.archive.name);
const archive = join(dirname(manifestPath), manifest.archive.name);
const parent = resolve(".moguri"); await mkdir(parent, { recursive: true });
const directory = await mkdtemp(join(parent, "update-roundtrip-")), started = performance.now();
const mountpoint = join(directory, "volume"), run = promisify(execFile);
let mounted = false;
try {
  if (!values["dmg-only"]) {
    await stageUpdateArchive(archive, join(directory, "staged"), manifest, new AbortController().signal);
    console.log(JSON.stringify({ status: "PASS", primitive: "Actual packaged ZIP/manifest through bounded production update consumer",
      version: manifest.version, arch: manifest.arch, archiveBytes: manifest.archive.bytes, ms: performance.now() - started,
      applicationExecuted: false, personalCredentials: false, quarantineBypassed: false }));
  }
  await mkdir(mountpoint);
  const image = join(dirname(manifestPath), manifest.archive.name.replace(/\.zip$/, ".dmg"));
  const attachment = await run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountpoint, "-plist", image], { timeout: 120_000, maxBuffer: 64 * 1024 });
  const details = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], { input: attachment.stdout, encoding: "utf8" }));
  assert.ok(details["system-entities"]?.some((entity) => entity["mount-point"] === mountpoint), "Verification requires its own mount; an already-open user volume will not be detached.");
  mounted = true;
  const application = await lstat(join(mountpoint, "Moguri.app"));
  assert.ok(application.isDirectory() && !application.isSymbolicLink(), "The DMG must contain the actual Moguri.app bundle, not a link to the build workspace.");
  const applications = join(mountpoint, "Applications");
  assert.ok((await lstat(applications)).isSymbolicLink(), "The DMG must offer an Applications shortcut for drag-to-install.");
  assert.equal(await readlink(applications), "/Applications", "The install shortcut must target the system Applications folder.");
  const layout = await verifyDmgLayout(mountpoint, manifest.version);
  await verifyBundleIdentity(join(mountpoint, "Moguri.app"), manifest.version, manifest.arch);
  assert.equal(await bundleTreeSha512(join(mountpoint, "Moguri.app")), manifest.bundleSha512, "The styled DMG must preserve the exact signed application bytes from the update manifest.");
  console.log(JSON.stringify({ status: "PASS", primitive: "Actual DMG Finder geometry, native icons, 1x/2x background and unchanged signed application",
    version: manifest.version, window: layout.window.WindowBounds, iconSize: layout.iconSize, positions: layout.positions, applicationExecuted: false, finderOpened: false }));
} finally {
  if (mounted) await run("/usr/bin/hdiutil", ["detach", mountpoint], { timeout: 30_000, maxBuffer: 4096 });
  let safe = true;
  try { safe = (await stat(mountpoint)).dev === (await stat(directory)).dev; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!safe) throw new Error("DMG detach was not confirmed. Its exact verification directory was retained, not recursively removed.");
  await rm(directory, { recursive: true, force: true });
}
