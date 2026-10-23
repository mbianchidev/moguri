import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { access, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Development packaging is validated for macOS arm64 only.");
const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const version = require("../package.json").version;
await access("dist/desktop/renderer/index.html");
await mkdir("release", { recursive: true });
const paths = await packager({
  dir: ".", out: `release/${version}`, name: "Moguri", executableName: "Moguri", appBundleId: "dev.moguri.app",
  icon: "dist/branding/moguri.icns",
  extendInfo: { NSMicrophoneUsageDescription: "Moguri records speech only when you start dictation. Audio is transcribed locally and is never sent to an ASR cloud." },
  platform: "darwin", arch: "arm64", electronVersion, overwrite: true, prune: true,
  asar: false,
  ignore: [/^\/(?:\.git|\.moguri|\.native|\.impeccable|\.copilot|release|tests|test-results|playwright-report|apps|packages|scripts|docs)(?:\/|$)/, /^\/(?:README|AGENTS)\.md$/],
});
const app = resolve(paths[0], "Moguri.app");
execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--entitlements", "scripts/entitlements.mac.plist", app], { stdio: "inherit" });
const archive = resolve(`release/Moguri-${version}-macos-arm64.zip`);
await rm(archive, { force: true });
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive]);
const image = resolve(`release/Moguri-${version}-macos-arm64.dmg`);
await rm(image, { force: true });
execFileSync("hdiutil", ["create", "-volname", "Moguri", "-srcfolder", app, "-ov", "-format", "UDZO", image], { stdio: "inherit" });
const { bundleTreeSha512, fileSha512, verifyBundleIdentity, verifyStandaloneInstallerRuntime } = await import("../dist/update-tools.mjs");
await verifyBundleIdentity(app, version, "arm64");
await verifyStandaloneInstallerRuntime(join(app, "Contents", "Resources", "app", "node_modules", "node", "bin", "node"));
const manifest = resolve(`release/Moguri-${version}-macos-arm64.manifest.json`);
await writeFile(manifest, JSON.stringify({ schemaVersion: 1, repository: "mbianchidev/moguri", version, arch: "arm64", bundleId: "dev.moguri.app",
  archive: { name: `Moguri-${version}-macos-arm64.zip`, bytes: (await lstat(archive)).size, sha512: await fileSha512(archive) }, bundleSha512: await bundleTreeSha512(app) }, null, 2), { mode: 0o644 });
console.log(`Development app: ${app}\nDMG: ${image}\nZIP: ${archive}\nIntegrity manifest: ${manifest}\nAd-hoc signed only. Not notarized; integrity is not Apple signing or production release readiness.`);
