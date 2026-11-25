#!/usr/bin/env node
// Stages and verifies the exact GitHub Release asset set. Used by scripts/release.sh before upload and by the release workflow before publishing.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { normalizeVersion } from "./version-policy.mjs";

/** The release repository after its transfer to moguri-dev (#93), then its pre-transfer name. Keep in sync with MOGURI_RELEASE_REPOSITORIES in moguri-sdk's packages/protocol/src/application-updates.ts. */
export const RELEASE_REPOSITORIES = Object.freeze(["moguri-dev/moguri", "mbianchidev/moguri"]);
/** scripts/release.sh sets MOGURI_RELEASE_REPOSITORY from its verified origin; the Release workflow has GITHUB_REPOSITORY. */
export function releaseRepository(env = process.env) {
  const repository = env.MOGURI_RELEASE_REPOSITORY || env.GITHUB_REPOSITORY || RELEASE_REPOSITORIES[0];
  if (!RELEASE_REPOSITORIES.includes(repository)) throw new Error(`${repository} is not a Moguri release repository (${RELEASE_REPOSITORIES.join(" or ")}).`);
  return repository;
}
export const REPOSITORY = releaseRepository();
export const ARCH = "arm64";

export function assetNames(version) {
  const base = `Moguri-${version}-macos-${ARCH}`;
  return { dmg: `${base}.dmg`, zip: `${base}.zip`, manifest: `${base}.manifest.json`, provenance: `Moguri-${version}-provenance.json`, sums: "SHA256SUMS" };
}

export async function fileDigest(path, algorithm = "sha256") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function regularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0) throw new Error(`${path} must be a nonempty regular file.`);
  return metadata.size;
}

const summed = (names) => [names.dmg, names.zip, names.manifest, names.provenance];

export async function stageAssets({ source, out, version, tag, commit, tree, prerelease, builtAt = new Date().toISOString() }) {
  const names = assetNames(version);
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length) throw new Error(`${out} must be empty before staging; earlier assets were preserved.`);
  for (const name of [names.dmg, names.zip, names.manifest]) {
    await regularFile(join(source, name));
    await copyFile(join(source, name), join(out, name));
  }
  const assets = {};
  for (const name of [names.dmg, names.zip, names.manifest]) assets[name] = { bytes: await regularFile(join(out, name)), sha256: await fileDigest(join(out, name)) };
  const provenance = { schemaVersion: 1, repository: REPOSITORY, version, tag, prerelease, sourceCommit: commit, sourceTree: tree, dirty: false,
    signing: "ad-hoc", notarized: false, builtAt, builder: { platform: process.platform, arch: process.arch, node: process.version }, assets };
  await writeFile(join(out, names.provenance), `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o644 });
  const lines = [];
  for (const name of summed(names)) lines.push(`${await fileDigest(join(out, name))}  ${name}`);
  await writeFile(join(out, names.sums), `${lines.join("\n")}\n`, { mode: 0o644 });
  return names;
}

// digests: optional { name: "sha256:<hex>" } from the GitHub release API.
export async function verifyAssets({ dir, version, tag, commit, tree, prerelease, digests }) {
  const names = assetNames(version), expected = Object.values(names).sort();
  const actual = (await readdir(dir)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Release assets must be exactly ${expected.join(", ")}; found ${actual.join(", ") || "none"}.`);
  const sha256 = {};
  for (const name of expected) {
    await regularFile(join(dir, name));
    sha256[name] = await fileDigest(join(dir, name));
    if (digests) {
      if (digests[name] !== `sha256:${sha256[name]}`) throw new Error(`${name} does not match the digest GitHub reports for the uploaded asset.`);
    }
  }
  const sums = (await readFile(join(dir, names.sums), "utf8")).trimEnd().split("\n");
  const expectedSums = summed(names).map((name) => `${sha256[name]}  ${name}`);
  if (JSON.stringify(sums) !== JSON.stringify(expectedSums)) throw new Error("SHA256SUMS does not list the exact SHA-256 of every other asset.");
  const provenance = JSON.parse(await readFile(join(dir, names.provenance), "utf8"));
  const identity = { schemaVersion: 1, repository: REPOSITORY, version, tag, prerelease, sourceCommit: commit, sourceTree: tree, dirty: false };
  for (const [key, value] of Object.entries(identity)) {
    if (provenance[key] !== value) throw new Error(`Provenance ${key} is ${JSON.stringify(provenance[key])}, expected ${JSON.stringify(value)}.`);
  }
  for (const name of [names.dmg, names.zip, names.manifest]) {
    const recorded = provenance.assets?.[name];
    if (!recorded || recorded.sha256 !== sha256[name] || recorded.bytes !== (await lstat(join(dir, name))).size) throw new Error(`Provenance does not record the exact bytes of ${name}.`);
  }
  const manifest = JSON.parse(await readFile(join(dir, names.manifest), "utf8"));
  const zipBytes = (await lstat(join(dir, names.zip))).size;
  if (manifest.schemaVersion !== 1 || manifest.repository !== REPOSITORY || manifest.version !== version || manifest.arch !== ARCH || manifest.bundleId !== "dev.moguri.app" ||
    manifest.archive?.name !== names.zip || manifest.archive.bytes !== zipBytes || manifest.archive.sha512 !== await fileDigest(join(dir, names.zip), "sha512")) {
    throw new Error("The update manifest does not match this version, architecture and ZIP archive.");
  }
  return { names, sha256 };
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    version: { type: "string" }, commit: { type: "string" }, tree: { type: "string" }, source: { type: "string" }, dir: { type: "string" },
  } });
  const [command] = positionals;
  if (!values.version) throw new Error("--version is required.");
  const { version, tag, prerelease } = normalizeVersion(values.version);
  if (command === "names") {
    process.stdout.write(`${Object.values(assetNames(version)).join("\n")}\n`);
    return;
  }
  for (const option of ["commit", "tree"]) if (!/^[0-9a-f]{40}$/.test(values[option] ?? "")) throw new Error(`--${option} must be a full 40-character SHA.`);
  if (!values.dir) throw new Error("--dir is required.");
  const dir = resolve(values.dir), identity = { version, tag, prerelease, commit: values.commit, tree: values.tree };
  if (command === "stage") {
    if (!values.source) throw new Error("--source is required.");
    await stageAssets({ ...identity, source: resolve(values.source), out: dir });
    await verifyAssets({ ...identity, dir });
  } else if (command === "verify") {
    await verifyAssets({ ...identity, dir });
  } else {
    throw new Error("Usage: assets.mjs names|stage|verify --version V [--commit SHA --tree SHA --dir DIR [--source DIR]]");
  }
  process.stdout.write(`Verified ${tag} release assets in ${dir}.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`ERROR: ${error.message}\n`); process.exit(1); });
}
