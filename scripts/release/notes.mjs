#!/usr/bin/env node
// Composes GitHub Release notes for scripts/release.sh from GitHub's generated change list.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assetNames, REPOSITORY } from "./assets.mjs";
import { normalizeVersion } from "./version-policy.mjs";

export function releaseNotes({ version, previous, commit, changes }) {
  const { tag, prerelease } = normalizeVersion(version), names = assetNames(version);
  const docs = (path) => `https://github.com/${REPOSITORY}/blob/${tag}/${path}`;
  return [
    `Moguri ${version} for macOS on Apple silicon (arm64).`,
    "",
    prerelease ? "> [!WARNING]\n> This is an alpha prerelease. Expect breaking changes, and keep backups of work you care about.\n" : "",
    "## Changes",
    "",
    changes.trim() || (previous ? `See the commits since ${previous}.` : "First published release."),
    "",
    "## Install",
    "",
    `1. Download \`${names.dmg}\` and \`${names.sums}\` from this release.`,
    "2. Verify the download in the folder that contains both files:",
    "",
    "   ```sh",
    `   shasum -a 256 --check --ignore-missing ${names.sums}`,
    "   ```",
    "",
    `3. Open the DMG and drag **Moguri** onto **Applications**.`,
    "4. Open Moguri from Applications. This build is ad-hoc signed and **not notarized**, so macOS blocks the first launch.",
    "   Only for a download whose checksum you verified: open **System Settings > Privacy & Security**, click **Open Anyway**, then confirm **Open**",
    "   ([Apple's guidance](https://support.apple.com/en-us/102445)). Never disable Gatekeeper globally.",
    "",
    `The [installation guide](${docs("docs/installation.md")}) covers first use, the \`moguri\` command line tool, upgrades, launch troubleshooting and removal.`,
    "",
    "## Upgrade",
    "",
    "- **In-app updater:** Moguri checks this repository's public releases at startup and every four hours, with no token, and verifies the ZIP against the integrity manifest. You confirm the install and restart under Settings > General > GitHub updates.",
    `- **Manually:** quit Moguri, then install the new DMG over the old app.`,
    "- Moguri migrates its local state forward on first start. Migrations are one-way: an older Moguri refuses newer state rather than deleting it, so downgrading is not supported.",
    "",
    "## Known limitations",
    "",
    "- macOS arm64 only. Builds are ad-hoc signed, not Developer ID signed or notarized.",
    `- Remaining roadmap work and unavailable capabilities: [remaining milestone gaps](${docs("docs/remaining-milestone-gaps.md")}).`,
    "",
    "## Verification",
    "",
    `Built locally from \`${commit}\` by \`scripts/release.sh\`. The release workflow re-verified the checksums, GitHub asset digests, provenance, update manifest, DMG layout and app bundle identity before publishing.`,
    "This proves the uploaded bytes are consistent with this tag. It does not prove they reproduce bit-for-bit from source.",
    "",
    "| Asset | Purpose |",
    "| --- | --- |",
    `| \`${names.dmg}\` | Drag-to-Applications installer |`,
    `| \`${names.zip}\` | In-app updater archive |`,
    `| \`${names.manifest}\` | Updater integrity manifest (SHA-512 of the ZIP and app bundle) |`,
    `| \`${names.provenance}\` | Source commit, tree and per-asset SHA-256 |`,
    `| \`${names.sums}\` | SHA-256 of every other asset |`,
    "",
    `Third-party licenses: \`Moguri.app/Contents/Resources/app/dist/THIRD_PARTY_NOTICES.md\` and [docs/third-party.md](${docs("docs/third-party.md")}).`,
  ].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n").trimEnd() + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { values } = parseArgs({ options: { version: { type: "string" }, previous: { type: "string" }, commit: { type: "string" }, changes: { type: "string" } } });
  try {
    if (!values.version || !/^[0-9a-f]{40}$/.test(values.commit ?? "")) throw new Error("Usage: notes.mjs --version V --commit SHA [--previous TAG] [--changes FILE]");
    const changes = values.changes ? await readFile(values.changes, "utf8") : "";
    process.stdout.write(releaseNotes({ version: values.version, previous: values.previous && values.previous !== "none" ? values.previous : null, commit: values.commit, changes }));
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`); process.exit(1);
  }
}
