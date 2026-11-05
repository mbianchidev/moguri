import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { buildDmg } from "./dmg-layout.ts";

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Development packaging is validated for macOS arm64 only.");
const { values } = parseArgs({ options: { qualifier: { type: "string" } } });
if (values.qualifier !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(values.qualifier)) throw new Error("Use a bounded lowercase build qualifier, without paths.");
const output = values.qualifier ? resolve("release/qualification-builds", values.qualifier) : resolve("release");
if (values.qualifier) {
  let present = false;
  try { await lstat(output); present = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (present) throw new Error("This qualified output already exists. Choose a new qualifier; previous artifacts were preserved.");
}
const require = createRequire(import.meta.url);
const { prepareSandboxDistribution } = await import("./prepare-sandbox-distribution.mjs");
const native = await prepareSandboxDistribution();
const electronVersion = require("electron/package.json").version;
const version = require("../package.json").version;
await access("dist/desktop/renderer/index.html");
await access("dist/moguri", constants.X_OK);
await mkdir(output, { recursive: true });
const paths = await packager({
  dir: ".", out: join(output, "builds.noindex", version), name: "Moguri", executableName: "Moguri", appBundleId: "dev.moguri.app",
  icon: "dist/branding/moguri.icns",
  extendInfo: { NSMicrophoneUsageDescription: "Moguri records speech only when you start dictation. Audio is transcribed locally and is never sent to an ASR cloud." },
  platform: "darwin", arch: "arm64", electronVersion, overwrite: true, prune: true,
  asar: false,
  ignore: [/^\/(?:\.git|\.moguri|\.native|\.impeccable|\.copilot|release|tests|test-results|playwright-report|apps|packages|scripts|docs)(?:\/|$)/, /^\/(?:README|AGENTS)\.md$/],
});
const app = resolve(paths[0], "Moguri.app");
await access(join(app, "Contents", "Resources", "app", "dist", "moguri"), constants.X_OK);
const nativeRoot = join(app, "Contents", "Resources", "moguri-native"); await mkdir(nativeRoot);
for (const path of ["manifest.json", native.distribution.vendor.installer.path, native.distribution.worker.archive.path, "SendBox.LICENSE", "AppleContainerization.LICENSE"]) {
  await copyFile(join(native.root, path), join(nativeRoot, path));
  await chmod(join(nativeRoot, path), 0o644);
}
execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--entitlements", "scripts/entitlements.mac.plist", app], { stdio: "inherit" });
const archive = join(output, `Moguri-${version}-macos-arm64.zip`);
await rm(archive, { force: true });
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive]);
const image = join(output, `Moguri-${version}-macos-arm64.dmg`);
await buildDmg(app, image, version);
const { bundleTreeSha512, fileSha512, verifyBundleIdentity, verifyStandaloneInstallerRuntime } = await import("../dist/update-tools.mjs");
await verifyBundleIdentity(app, version, "arm64");
await verifyStandaloneInstallerRuntime(join(app, "Contents", "Resources", "app", "node_modules", "node", "bin", "node"));
const manifest = join(output, `Moguri-${version}-macos-arm64.manifest.json`);
await writeFile(manifest, JSON.stringify({ schemaVersion: 1, repository: "mbianchidev/moguri", version, arch: "arm64", bundleId: "dev.moguri.app",
  archive: { name: `Moguri-${version}-macos-arm64.zip`, bytes: (await lstat(archive)).size, sha512: await fileSha512(archive) }, bundleSha512: await bundleTreeSha512(app) }, null, 2), { mode: 0o644 });
console.log(`Development app: ${app}\nDMG: ${image}\nZIP: ${archive}\nIntegrity manifest: ${manifest}\nAd-hoc signed only. Not notarized; integrity is not Apple signing or production release readiness.`);
