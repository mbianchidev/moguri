#!/usr/bin/env node
// Run by .github/workflows/release.yml on a pushed release tag. It never builds: it re-verifies the draft release that
// scripts/release.sh uploaded from the merged commit, then is the only step that publishes (undrafts) it.
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { assetNames, REPOSITORY, verifyAssets } from "./assets.mjs";
import { compareAssets, downloadAsset, gh, releaseFor } from "./github.mjs";
import { normalizeVersion } from "./version-policy.mjs";

const run = promisify(execFile);
const { values } = parseArgs({ options: { tag: { type: "string" }, dir: { type: "string" }, "verify-only": { type: "boolean" } } });
const fail = (message) => { throw new Error(message); };
const git = async (...args) => (await run("git", args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const step = (message) => console.log(`==> ${message}`);

async function exitCode(command, args) {
  return await new Promise((done, reject) => spawn(command, args, { stdio: "inherit" }).on("error", reject).on("exit", (code, signal) => done(signal ? 128 : code)));
}

async function requiredRelease(tag) {
  return await releaseFor(tag) ?? fail(`No release exists for ${tag}. scripts/release.sh creates the draft before pushing the tag.`);
}

async function remoteTagObject() {
  const ref = JSON.parse(await gh("api", `repos/${REPOSITORY}/git/ref/tags/${tag}`));
  if (ref.object?.type !== "tag") fail(`${tag} must be an annotated tag.`);
  return ref.object.sha;
}

async function checkRemoteTag() {
  if (await remoteTagObject() !== tagObject) fail(`The remote ${tag} changed during verification.`);
}

const assetIdentity = (release) => JSON.stringify(release.assets.map(({ id, name, size, digest, updated_at }) => ({ id, name, size, digest, updated_at })).sort((a, b) => a.name.localeCompare(b.name)));

const tag = values.tag ?? fail("--tag is required.");
const { version, prerelease } = normalizeVersion(tag);
if (`v${version}` !== tag) fail(`Release tags must be "v" plus the SemVer version; got ${tag}.`);
const dir = resolve(values.dir ?? fail("--dir is required."));

step(`Verifying ${tag} source identity`);
// actions/checkout can rewrite an annotated tag as a lightweight one locally, so the tag identity comes from GitHub.
const tagObject = await remoteTagObject();
const annotated = JSON.parse(await gh("api", `repos/${REPOSITORY}/git/tags/${tagObject}`));
if (annotated.object?.type !== "commit") fail(`${tag} must point to a commit.`);
const commit = annotated.object.sha, tree = await git("rev-parse", `${commit}^{tree}`);
if (await git("rev-parse", "HEAD") !== commit) fail(`The workflow checkout is not ${tag}'s commit.`);
if (JSON.parse(await readFile("package.json", "utf8")).version !== version) fail(`package.json at ${tag} is not version ${version}.`);
const ancestor = await exitCode("git", ["merge-base", "--is-ancestor", commit, "refs/remotes/origin/main"]);
if (ancestor === 1) fail(`${tag} points to ${commit}, which is not on main. Releases tag the merged release bump.`);
if (ancestor !== 0) fail("Could not determine whether the tag commit is on main.");

step(`Checking the ${tag} GitHub release`);
const release = await requiredRelease(tag);
if (release.prerelease !== prerelease) fail(`The release prerelease flag is ${release.prerelease}; ${version} requires ${prerelease}.`);
if (release.draft && release.target_commitish !== commit) fail(`The draft targets ${release.target_commitish}, not ${commit}.`);
const { problems, missing } = compareAssets(release, version);
if (problems.length || missing.length) fail(`Release assets are wrong: ${[...problems, ...missing.map((name) => `missing ${name}`)].join("; ")}.`);
for (const asset of release.assets) if (!/^sha256:[0-9a-f]{64}$/.test(asset.digest ?? "")) fail(`GitHub reports no SHA-256 digest for ${asset.name}.`);

step("Downloading release assets");
await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
for (const asset of release.assets) await downloadAsset(asset, join(dir, asset.name));

step("Verifying checksums, digests, provenance and the update manifest");
await verifyAssets({ dir, version, tag, commit, tree, prerelease, digests: Object.fromEntries(release.assets.map((asset) => [asset.name, asset.digest])) });

step("Verifying the ZIP through the production updater and the DMG layout and app bundle");
if (await exitCode(process.execPath, ["--import", "tsx", "scripts/verify-update-package.mjs", join(dir, assetNames(version).manifest)]) !== 0) fail("The packaged app did not pass update/DMG verification.");

if (!release.draft) {
  step(`${tag} is already published; its assets were re-verified. Nothing to publish.`);
  process.exit(0);
}
if (values["verify-only"]) { step("Verification passed (--verify-only)."); process.exit(0); }

step("Rechecking that the draft did not change during verification");
const current = await requiredRelease(tag);
if (!current.draft || assetIdentity(current) !== assetIdentity(release) || current.target_commitish !== release.target_commitish || current.prerelease !== release.prerelease) {
  fail("The draft release changed while it was being verified. Nothing was published; rerun after reviewing it.");
}
await checkRemoteTag();

step(`Publishing ${tag}`);
await gh("api", "-X", "PATCH", `repos/${REPOSITORY}/releases/${release.id}`, "-F", "draft=false", "-f", `make_latest=${prerelease ? "false" : "true"}`);
const published = await requiredRelease(tag);
if (published.draft || published.tag_name !== tag || assetIdentity(published) !== assetIdentity(release)) fail("The published release does not match the verified draft.");
await checkRemoteTag();
step(`Published ${published.html_url}`);
