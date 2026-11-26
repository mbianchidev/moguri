import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const run = promisify(execFile);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/dmg-layout.py");
export const DMG_LAYOUT = Object.freeze({
  width: 540, height: 380, x: 100, y: 100, iconSize: 80, textSize: 12,
  app: Object.freeze([130, 220]), applications: Object.freeze([410, 220]),
});
const volumeName = (version: string) => `Moguri ${version}-arm64`;

export async function prepareDmgTools() {
  const requirements = join(root, "scripts/requirements-dmg.txt"), text = await readFile(requirements, "utf8");
  const expected = Object.fromEntries([...text.matchAll(/^([\w-]+)==([^\s]+) --hash=sha256:[a-f0-9]{64}$/gm)].map((match) => [match[1], match[2]]));
  assert.equal(Object.keys(expected).length, 3, "DMG build requirements must pin all three wheels and their hashes.");
  let host: unknown;
  try { host = JSON.parse((await run("python3", ["-c", "import json,sys; print(json.dumps(list(sys.version_info[:2])))"], { timeout: 15_000 })).stdout); }
  catch (error) { throw new Error("macOS DMG packaging requires Python 3.10+ for its private, hash-locked build tools. No system packages were changed.", { cause: error }); }
  assert.ok(Array.isArray(host) && host[0] === 3 && typeof host[1] === "number" && host[1] >= 10, "macOS DMG packaging requires Python 3.10 or newer.");
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const directory = join(root, ".native", `dmgbuild-py${host.join(".")}-${digest}`), python = join(directory, "bin/python");
  let missing = false;
  try { await access(python); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; missing = true; }
  if (missing) {
    await mkdir(join(root, ".native"), { recursive: true });
    await run("python3", ["-m", "venv", directory], { timeout: 60_000 });
  }
  const versions = async (): Promise<unknown> => JSON.parse((await run(python, ["-c",
    "import importlib.metadata as m,json; names=['dmgbuild','ds_store','mac_alias']; print(json.dumps({n:m.version(n) for n in names if m.packages_distributions().get(n)}))",
  ], { timeout: 15_000, maxBuffer: 64 * 1024 })).stdout);
  const installed = await versions();
  assert.ok(isRecord(installed), "The private DMG tool inventory must be an exact version map.");
  if (Object.keys(installed).length !== 3) {
    const install = await run(python, ["-m", "pip", "--isolated", "--disable-pip-version-check", "install", "--no-input", "--no-deps",
      "--only-binary=:all:", "--require-hashes", "--index-url", "https://pypi.org/simple", "-r", requirements], { timeout: 180_000, maxBuffer: 1024 * 1024 });
    process.stdout.write(install.stdout); process.stderr.write(install.stderr);
  }
  assert.deepEqual(await versions(), expected, "The private DMG tooling does not match its exact locked manifest.");
  return python;
}

export async function dmgBackground(scale = 1) {
  assert.ok(scale === 1 || scale === 2);
  return new Resvg(await readFile(join(root, "assets/dmg-background.svg"), "utf8"),
    { fitTo: { mode: "width", value: DMG_LAYOUT.width * scale } }).render().asPng();
}

export async function buildDmg(app: string, destination: string, version: string) {
  const python = await prepareDmgTools(), parent = join(root, ".moguri"); await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, "dmg-layout-"));
  let complete = false;
  try {
    const background = join(temporary, "background.png"), settings = join(temporary, "settings.json"), candidate = join(temporary, "Moguri.dmg");
    await writeFile(background, await dmgBackground()); await writeFile(join(temporary, "background@2x.png"), await dmgBackground(2));
    await writeFile(settings, JSON.stringify({
      volume_name: volumeName(version), format: "UDZO", filesystem: "HFS+", files: [resolve(app)],
      symlinks: { Applications: "/Applications" }, icon: join(root, "dist/branding/moguri.icns"), background, default_view: "icon-view",
      window_rect: [[DMG_LAYOUT.x, DMG_LAYOUT.y], [DMG_LAYOUT.width, DMG_LAYOUT.height]],
      icon_locations: { "Moguri.app": DMG_LAYOUT.app, Applications: DMG_LAYOUT.applications },
      icon_size: DMG_LAYOUT.iconSize, text_size: DMG_LAYOUT.textSize, label_pos: "bottom", arrange_by: null,
      show_status_bar: false, show_tab_view: false, show_toolbar: false, show_pathbar: false, show_sidebar: false,
      show_item_info: false, show_icon_preview: false, include_icon_view_settings: true, include_list_view_settings: false,
    }));
    const built = await run(python, [script, "build", settings, candidate], { timeout: 300_000, maxBuffer: 1024 * 1024 });
    process.stdout.write(built.stdout); process.stderr.write(built.stderr);
    await rename(candidate, destination);
    complete = true;
  } catch (error) {
    throw new Error(`DMG generation did not complete. The previous image was not replaced; owned staging was retained at ${temporary} for inspection.`, { cause: error });
  } finally { if (complete) await rm(temporary, { recursive: true, force: true }); }
}

export async function verifyDmgLayout(mountpoint: string, version: string) {
  const store = await lstat(join(mountpoint, ".DS_Store"));
  assert.ok(store.isFile() && !store.isSymbolicLink() && store.size > 0 && store.size <= 128 * 1024, "The DMG needs bounded native Finder view metadata.");
  const python = await prepareDmgTools();
  const layout: unknown = JSON.parse((await run(python, [script, "inspect", mountpoint], { timeout: 15_000, maxBuffer: 64 * 1024 })).stdout);
  assert.ok(isRecord(layout) && isRecord(layout.window), "The actual Finder layout must contain native window metadata.");
  assert.equal(layout.view, "icnv"); assert.equal(layout.window.WindowBounds, "{{100, 100}, {540, 380}}", "The installer window must match the reference's 540x380-point bounds.");
  for (const key of ["ShowStatusBar", "ShowTabView", "ShowToolbar", "ShowPathbar", "ShowSidebar", "ContainerShowSidebar", "PreviewPaneVisibility"]) assert.equal(layout.window[key], false, key);
  assert.equal(layout.iconSize, 80); assert.equal(layout.textSize, 12); assert.equal(layout.arrangeBy, "none");
  assert.equal(layout.labelOnBottom, true); assert.equal(layout.showItemInfo, false); assert.equal(layout.showIconPreview, false);
  assert.deepEqual(layout.scroll, [0, 0]); assert.deepEqual(layout.positions, { "Moguri.app": [130, 220], Applications: [410, 220] });
  assert.equal(layout.backgroundType, 2); assert.equal(layout.backgroundFile, ".background.tiff"); assert.equal(layout.backgroundVolume, volumeName(version));
  const background = join(mountpoint, ".background.tiff"), entry = await lstat(background);
  assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size < 1024 * 1024);
  assert.equal(layout.backgroundId, entry.ino, "The Finder alias must resolve to this image's actual background, not a build-host file.");
  // The volume icon must be the shipped app's own icon; the Release workflow verifies without building, so no dist/branding exists there.
  const app = join(mountpoint, "Moguri.app"), iconFile = (await run("plutil", ["-extract", "CFBundleIconFile", "raw", join(app, "Contents/Info.plist")], { timeout: 15_000 })).stdout.trim();
  assert.match(iconFile, /^[A-Za-z0-9._-]+$/, "The app must name a plain bundled icon file.");
  assert.deepEqual(await readFile(join(mountpoint, ".VolumeIcon.icns")), await readFile(join(app, "Contents/Resources", iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`)));
  for (const page of [0, 1]) {
    const metadata = await sharp(background, { page }).metadata();
    assert.equal(metadata.pages, 2); assert.equal(metadata.density, 72 * (page + 1), "Retina artwork must preserve the same logical Finder size.");
    const expected = await sharp(await dmgBackground(page + 1)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const actual = await sharp(background, { page }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(actual.info.width, expected.info.width); assert.equal(actual.info.height, expected.info.height);
    assert.deepEqual(actual.data, expected.data, `The actual ${page + 1}x Finder background must match the source artwork.`);
  }
  return layout;
}
