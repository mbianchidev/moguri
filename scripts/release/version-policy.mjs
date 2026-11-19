#!/usr/bin/env node
// SemVer policy for scripts/release.sh. Exit codes: 0 ok, 2 invalid/backwards input, 3 same identity as a published release.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export const TAG_PREFIX = "v";

export class VersionPolicyError extends Error {
  constructor(message, code = 2) { super(message); this.code = code; }
}

export function normalizeVersion(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > 200) throw new VersionPolicyError("Give a version such as 1.2.3, v1.2.3 or 1.2.3-rc.1.");
  const version = input.startsWith(TAG_PREFIX) ? input.slice(TAG_PREFIX.length) : input;
  const match = SEMVER.exec(version);
  if (!match) throw new VersionPolicyError(`"${input}" is not a SemVer 2.0.0 version. Use MAJOR.MINOR.PATCH with an optional -prerelease, and at most one lowercase "v" prefix.`);
  if (match[5] !== undefined) throw new VersionPolicyError(`"${input}" has build metadata (+${match[5]}). npm and Moguri's updater drop build metadata, so the release would not match its tag. Choose a version without "+".`);
  return { version, tag: `${TAG_PREFIX}${version}`, prerelease: match[4] !== undefined };
}

const numericTail = (identifiers) => {
  const last = identifiers.at(-1);
  return typeof last === "number" ? { prefix: identifiers.slice(0, -1).join("."), counter: last } : null;
};

export function gapWarnings(previous, chosen) {
  const a = semver.parse(previous), b = semver.parse(chosen), warnings = [];
  const from = [a.major, a.minor, a.patch], to = [b.major, b.minor, b.patch];
  const index = from.findIndex((value, position) => value !== to[position]);
  if (index >= 0 && to[index] - from[index] > 1) {
    warnings.push(`${chosen} skips ${["major", "minor", "patch"][index]} versions after ${previous} (${from[index]} -> ${to[index]}).`);
  }
  if (index < 0 && a.prerelease.length && b.prerelease.length) {
    const before = numericTail(a.prerelease), after = numericTail(b.prerelease);
    if (before && after && before.prefix === after.prefix && after.counter - before.counter > 1) {
      warnings.push(`${chosen} skips prerelease ${before.prefix || "counter"} values after ${previous} (${before.counter} -> ${after.counter}).`);
    }
  }
  return warnings;
}

// published: versions or tags of published GitHub releases; current: the release base's package.json version.
export function checkRelease(input, { published = [], current } = {}) {
  const chosen = normalizeVersion(input);
  const releases = published.map((value) => normalizeVersion(value).version);
  const same = releases.find((value) => semver.eq(value, chosen.version));
  if (same) throw new VersionPolicyError(`${chosen.tag} is already a published release. Finish or verify it; changed code needs a new version.`, 3);
  const highest = releases.sort(semver.rcompare)[0] ?? null;
  if (highest && semver.lt(chosen.version, highest)) throw new VersionPolicyError(`${chosen.version} is lower than the latest published release ${highest}. Releases cannot go backwards.`);
  if (current !== undefined) normalizeVersion(current);
  const baseline = highest ?? current ?? null;
  return { ...chosen, previous: highest, baseline, firstRelease: highest === null,
    warnings: baseline && semver.gt(chosen.version, baseline) ? gapWarnings(baseline, chosen.version) : [] };
}

function main([command, input, ...rest]) {
  if (command === "normalize") {
    const value = normalizeVersion(input);
    process.stdout.write(`${value.version}\t${value.tag}\t${value.prerelease}\n`);
    return;
  }
  if (command === "compare") {
    process.stdout.write(`${semver.compare(normalizeVersion(input).version, normalizeVersion(rest[0]).version)}\n`);
    return;
  }
  if (command !== "check") throw new VersionPolicyError("Usage: version-policy.mjs normalize VERSION | check VERSION [--published VERSION]... [--current VERSION] | compare A B");
  const options = { published: [] };
  for (let index = 0; index < rest.length; index += 2) {
    if (rest[index] === "--published") options.published.push(rest[index + 1]);
    else if (rest[index] === "--current") options.current = rest[index + 1];
    else throw new VersionPolicyError(`Unknown argument ${rest[index]}.`);
  }
  const value = checkRelease(input, options);
  for (const warning of value.warnings) process.stderr.write(`WARNING: ${warning}\n`);
  process.stdout.write(`${value.version}\t${value.tag}\t${value.prerelease}\t${value.previous ?? "none"}\t${value.baseline ?? "none"}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exit(error instanceof VersionPolicyError ? error.code : 1);
  }
}
