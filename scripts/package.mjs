import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
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
  ignore: [/^\/(?:\.git|\.moguri|\.native|release|tests|apps|packages|scripts|docs)(?:\/|$)/, /^\/(?:README|AGENTS)\.md$/],
});
const app = resolve(paths[0], "Moguri.app");
execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--entitlements", "scripts/entitlements.mac.plist", app], { stdio: "inherit" });
const archive = resolve(`release/Moguri-${version}-macos-arm64.zip`);
await rm(archive, { force: true });
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive]);
const image = resolve(`release/Moguri-${version}-macos-arm64.dmg`);
await rm(image, { force: true });
execFileSync("hdiutil", ["create", "-volname", "Moguri", "-srcfolder", app, "-ov", "-format", "UDZO", image], { stdio: "inherit" });
console.log(`Development app: ${app}\nDMG: ${image}\nZIP: ${archive}\nAd-hoc signed only. Not notarized; not a production release.`);
