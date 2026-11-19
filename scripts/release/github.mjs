#!/usr/bin/env node
// GitHub release state shared by scripts/release.sh and scripts/release/publish.mjs. Uses the authenticated gh CLI.
import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assetNames, fileDigest, REPOSITORY } from "./assets.mjs";
import { normalizeVersion } from "./version-policy.mjs";

const run = promisify(execFile);
export const gh = async (...args) => (await run("gh", args, { maxBuffer: 64 * 1024 * 1024 })).stdout;

export async function releaseFor(tag) {
  const pages = JSON.parse(await gh("api", "--paginate", "--slurp", `repos/${REPOSITORY}/releases?per_page=100`));
  const matches = pages.flat().filter((release) => release.tag_name === tag);
  if (matches.length > 1) throw new Error(`Found ${matches.length} releases for ${tag}; resolve the duplicates on GitHub first.`);
  return matches[0] ?? null;
}

export async function publishedVersions() {
  const pages = JSON.parse(await gh("api", "--paginate", "--slurp", `repos/${REPOSITORY}/releases?per_page=100`));
  return pages.flat().filter((release) => !release.draft).flatMap((release) => {
    try { return [normalizeVersion(release.tag_name).version]; } catch { return []; }
  });
}

export async function downloadAsset(asset, path) {
  const child = spawn("gh", ["api", "-H", "Accept: application/octet-stream", `repos/${REPOSITORY}/releases/assets/${asset.id}`], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise((done, reject) => child.on("error", reject).on("exit", done));
  await pipeline(child.stdout, createWriteStream(path, { mode: 0o644 }));
  if (await exited !== 0) throw new Error(`Downloading ${asset.name} failed.`);
}

// Compares a release's assets with the expected names and local SHA-256 values. Missing assets may be uploaded; anything else blocks.
export function compareAssets(release, version, local) {
  const expected = Object.values(assetNames(version)), problems = [], missing = [];
  for (const asset of release.assets) {
    if (!expected.includes(asset.name)) problems.push(`unexpected asset ${asset.name}`);
    else if (asset.state !== "uploaded") problems.push(`${asset.name} is not a complete upload`);
    else if (local && asset.digest !== `sha256:${local[asset.name]}`) problems.push(`${asset.name} differs from the local release asset`);
  }
  for (const name of expected) if (!release.assets.some((asset) => asset.name === name)) missing.push(name);
  return { problems, missing };
}

export async function verifyPublished(tag, commit) {
  const { version, prerelease } = normalizeVersion(tag), names = assetNames(version);
  const release = await releaseFor(tag);
  if (!release) throw new Error(`No GitHub release exists for ${tag}.`);
  if (release.draft) throw new Error(`${tag} is still a draft.`);
  if (release.prerelease !== prerelease) throw new Error(`${tag} has prerelease=${release.prerelease}; expected ${prerelease}.`);
  const { problems, missing } = compareAssets(release, version);
  if (problems.length || missing.length) throw new Error(`Published assets are wrong: ${[...problems, ...missing.map((name) => `missing ${name}`)].join("; ")}.`);
  const digests = Object.fromEntries(release.assets.map((asset) => [asset.name, asset.digest]));
  const directory = await mkdtemp(join(tmpdir(), "moguri-release-check-"));
  try {
    for (const name of [names.sums, names.provenance]) {
      const asset = release.assets.find((entry) => entry.name === name);
      await downloadAsset(asset, join(directory, name));
      if (`sha256:${await fileDigest(join(directory, name))}` !== digests[name]) throw new Error(`${name} does not match its GitHub digest.`);
    }
    const sums = (await readFile(join(directory, names.sums), "utf8")).trimEnd().split("\n");
    const expected = [names.dmg, names.zip, names.manifest, names.provenance].map((name) => `${digests[name].slice("sha256:".length)}  ${name}`);
    if (JSON.stringify(sums) !== JSON.stringify(expected)) throw new Error("SHA256SUMS does not match the digests GitHub reports.");
    const provenance = JSON.parse(await readFile(join(directory, names.provenance), "utf8"));
    if (provenance.sourceCommit !== commit || provenance.tag !== tag || provenance.version !== version) throw new Error(`Provenance does not record ${tag} at ${commit}.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return release;
}

async function main([command, ...args]) {
  if (command === "release") {
    const release = await releaseFor(args[0]);
    process.stdout.write(release ? `${release.id}\t${release.draft}\t${release.prerelease}\t${release.target_commitish}\t${release.html_url}\n` : "none\n");
  } else if (command === "published") {
    for (const version of await publishedVersions()) process.stdout.write(`${version}\n`);
  } else if (command === "assets") {
    // assets TAG DIR: prints missing asset names; fails when any existing asset is unexpected, incomplete or differs.
    const [tag, dir] = args, { version } = normalizeVersion(tag), release = await releaseFor(tag);
    if (!release) throw new Error(`No GitHub release exists for ${tag}.`);
    const local = {};
    for (const name of Object.values(assetNames(version))) local[name] = await fileDigest(join(resolve(dir), name));
    const { problems, missing } = compareAssets(release, version, local);
    if (problems.length) throw new Error(`The existing ${tag} release does not match this attempt: ${problems.join("; ")}. Review it on GitHub; nothing was replaced.`);
    for (const name of missing) process.stdout.write(`${name}\n`);
  } else if (command === "verify-published") {
    const release = await verifyPublished(args[0], args[1]);
    process.stdout.write(`${release.html_url}\n`);
  } else {
    throw new Error("Usage: github.mjs release TAG | published | assets TAG DIR | verify-published TAG COMMIT");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`ERROR: ${error.message}\n`); process.exit(1); });
}
