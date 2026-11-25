import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { packageRoots, writeThirdPartyNotices } from "../scripts/third-party-notices.mjs";

async function generatedPackage(root: string, path: string, metadata: Record<string, unknown>, files: Record<string, string> = {}) {
  const directory = join(root, path); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify(metadata));
  for (const [name, text] of Object.entries(files)) await writeFile(join(directory, name), text);
}

test("bundler module IDs resolve to their exact scoped, nested and virtual package roots", () => {
  const base = "/generated/app";
  assert.deepEqual(packageRoots([
    "node_modules/generated-plain/dist/index.js",
    "/generated/app/node_modules/@generated/scoped/lib/a.js?commonjs-proxy",
    "\0/generated/app/node_modules/generated-outer/node_modules/generated-inner/index.js",
    "apps/desktop/src/main.tsx", "\0commonjsHelpers.js", "node_modules/@generated",
  ], base), [
    "/generated/app/node_modules/@generated/scoped",
    "/generated/app/node_modules/generated-outer/node_modules/generated-inner",
    "/generated/app/node_modules/generated-plain",
  ]);
});

test("notices reproduce every license file once and flag bundled components without an OSI-approved license", async () => {
  const root = await mkdtemp(join(tmpdir(), "moguri-notices-"));
  try {
    await generatedPackage(root, "node_modules/generated-mit", { name: "generated-mit", version: "1.0.0", license: "MIT" }, { LICENSE: "Generated MIT notice" });
    await generatedPackage(root, "node_modules/@generated/dual", { name: "@generated/dual", version: "2.0.0", license: "(MIT OR Apache-2.0)" }, { "LICENSE-MIT": "Generated dual MIT", NOTICE: "Generated dual notice" });
    await generatedPackage(root, "node_modules/generated-proprietary", { name: "generated-proprietary", version: "3.0.0", license: "SEE LICENSE IN README.md" }, { "LICENSE.md": "Generated all rights reserved" });
    await generatedPackage(root, "node_modules/generated-undeclared", { name: "generated-undeclared", version: "4.0.0" });
    await generatedPackage(root, "node_modules/@moguri-dev/sdk", { name: "@moguri-dev/sdk", version: "0.0.1", license: "MIT" }, { "LICENSE.md": "Generated own Moguri license" });
    const outfile = join(root, "NOTICES.md");
    const entries = await writeThirdPartyNotices([
      "node_modules/generated-mit/index.js", "node_modules/generated-mit/other.js",
      "node_modules/@generated/dual/index.js", "node_modules/generated-proprietary/sdk.mjs", "node_modules/generated-undeclared/index.js",
      "node_modules/@moguri-dev/sdk/dist/sdk/index.mjs",
    ], outfile, root);
    assert.deepEqual(entries.map(({ name, openSource }) => [name, openSource]), [
      ["@generated/dual", true], ["generated-mit", true], ["generated-proprietary", false], ["generated-undeclared", false],
    ]);
    const text = await readFile(outfile, "utf8");
    assert.equal(text.match(/Generated MIT notice/g)?.length, 1);
    assert.equal(text.includes("Generated own Moguri license"), false, "Moguri's own @moguri-dev packages are covered by LICENSE.md");
    for (const expected of ["Generated dual MIT", "Generated dual notice", "Generated all rights reserved", "The package ships no license file"]) assert.ok(text.includes(expected), expected);
    const restricted = text.slice(text.indexOf("## Components without an OSI-approved license"), text.indexOf("## @generated/dual"));
    assert.match(restricted, /`generated-proprietary` 3\.0\.0: SEE LICENSE IN README\.md/);
    assert.match(restricted, /`generated-undeclared` 4\.0\.0: UNKNOWN/);
    assert.doesNotMatch(restricted, /generated-mit|@generated\/dual/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
