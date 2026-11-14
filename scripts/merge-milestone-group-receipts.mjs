import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { link, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { milestoneCellId, requiredMilestoneCells } from "../tests/fixtures/milestone-combinations.ts";

const [basePath, groupPath, outputPath, extra] = process.argv.slice(2);
assert.ok(basePath && groupPath && outputPath && !extra,
  "Usage: node --import tsx scripts/merge-milestone-group-receipts.mjs BASE_REPORT GROUP_REPORT NEW_OUTPUT");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const caseFile = "tests/milestone-combinations.test.ts";
const inputPaths = ["package.json", "package-lock.json", "dist/worker.mjs", "dist/remote-bridge.mjs", "dist/mcp-worker.mjs",
  "dist/service.mjs", "dist/runtime.mjs", "dist/sdk/index.mjs", "scripts/worker-image/Containerfile", "apps/service/src/native-evidence.ts",
  caseFile, "tests/fixtures/single-routing.ts", "tests/fixtures/native-target.ts", "tests/fixtures/native-api.ts",
  "tests/fixture.ts", "tests/fixtures/native-milestone-api.ts", "tests/fixtures/milestone-combinations.ts",
  "tests/fixtures/milestone-response.ts", "tests/fixtures/native-milestone-provider.mjs"];
const workspaceRoot = await realpath(".");
const journalRoot = await realpath(".test-output/milestone-combinations");
const expected = new Map(requiredMilestoneCells().filter((cell) => cell.env === "Sandbox").map((cell) => [milestoneCellId(cell), cell]));
const groupOf = (cell) => `${cell.selection}/${cell.autonomy}`;
const allGroups = [...new Set([...expected.values()].map(groupOf))];

async function document(path) {
  assert.ok((await stat(path)).size <= 64 * 1024 * 1024, "A qualification artifact exceeds its complete-read bound.");
  const bytes = await readFile(path);
  return { path, sha256: sha256(bytes), value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
}

async function journal(report) {
  assert.ok(typeof report.journalPath === "string" && !isAbsolute(report.journalPath), "A report needs its repository-relative original journal.");
  const path = await realpath(resolve(report.journalPath));
  assert.ok(path.startsWith(`${journalRoot}${sep}`), "A journal cannot escape the qualification directory.");
  assert.ok((await stat(path)).size <= 64 * 1024 * 1024, "The complete original journal exceeds its bound.");
  const bytes = await readFile(path);
  const rows = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim().split("\n").map((line) => JSON.parse(line));
  const identities = rows.filter((row) => row.type === "identity");
  assert.equal(identities.length, 1);
  assert.deepEqual(identities[0].identity, report.identity);
  const groups = rows.filter((row) => row.type === "group-cleanup-confirmed").map((row) => row.group);
  assert.equal(new Set(groups).size, groups.length, "Repeated group cleanup cannot qualify repeated work.");
  assert.ok(groups.every((group) => allGroups.includes(group)), "An unknown group has no qualification scope.");
  return { path, sha256: sha256(bytes), rows, groups };
}

function region(source, start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0 && source.indexOf(start, offset + start.length) === -1, "The exact source start is missing or ambiguous.");
  const finish = source.indexOf(end, offset + start.length);
  assert.ok(finish > offset, "The exact source end is unavailable.");
  return source.slice(offset, finish + end.length);
}

function coreSource(source) {
  const firstTest = source.indexOf("\ntest(");
  assert.ok(firstTest > 0);
  return {
    setup: source.slice(0, firstTest).replace(
      "\nconst nativeGroups = process.env.MOGURI_NATIVE_GROUPS;\nconst nativeGroupMode = nativeGroups !== undefined;", ""),
    cell: region(source, "\nasync function runCell(", "\ntest(\"native qualification reads an oversized original signed witness"),
    group: region(source,
      "      const required = nativeCells.filter((cell) => groupId(cell) === group), first = required[0]!;",
      "      completedGroups.add(group);\n    })));"),
  };
}

function source(identity) {
  assert.ok(/^[a-f0-9]{40}$/.test(identity.commit) && identity.dirtyAtStart === false, "Qualification needs an exact clean source cut.");
  const value = execFileSync("git", ["--no-pager", "show", `${identity.commit}:${caseFile}`], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(sha256(value), identity.inputs[caseFile], "The report does not bind its actual committed harness.");
  return coreSource(value);
}

function receipt(cell, identity) {
  assert.ok(isRecord(cell) && expected.has(cell.id) && cell.outcome === "native-pass");
  const required = expected.get(cell.id);
  assert.equal(cell.coverage, required.selection !== "fixed" && required.effort !== "default" ? "manual-kupo-effort-rejected" : "execution");
  if (cell.coverage === "manual-kupo-effort-rejected") {
    assert.ok(required.selection !== "fixed" && required.effort !== "default");
    assert.equal(cell.controls?.modelId, "kupo");
    assert.equal(cell.controls.modelOptions?.thinkingEffort, required.effort);
    assert.equal(cell.controls.modelOptions.contextWindow, required.window === "maximum" ? 32768 : 16384);
    assert.equal(cell.cleanup, "not-started");
    assert.equal(cell.calls, 0); assert.equal(cell.reportedTokens, 0); assert.equal(cell.billedUsd, null);
    assert.deepEqual(cell.roles, []); assert.deepEqual(cell.models, []);
    assert.equal(cell.rejection?.code, "routing_effort");
    assert.ok(Number.isSafeInteger(cell.rejection.beforeSeq) && cell.rejection.beforeSeq >= 0);
    assert.equal(cell.rejection.afterSeq, cell.rejection.beforeSeq);
    for (const key of ["rootDigest", "peerDigest", "targetDigest", "rootLease", "workerDigest"]) assert.equal(cell[key], null);
    assert.equal(cell.nativeReceipt, undefined);
    return;
  }
  assert.equal(cell.cleanup, "owned-guest-stopped");
  assert.equal(cell.billedUsd, null, "Generated qualification must not invent billed telemetry.");
  assert.ok(Array.isArray(cell.roles) && Array.isArray(cell.models));
  assert.equal(cell.calls, cell.roles.length);
  assert.deepEqual(cell.models.map((model) => model.role), cell.roles);
  assert.ok(cell.models.every((model) => Number.isSafeInteger(model.reportedTokens) && model.reportedTokens >= 0));
  assert.equal(cell.models.reduce((sum, model) => sum + model.reportedTokens, 0), cell.reportedTokens);
  const value = cell.nativeReceipt;
  assert.ok(isRecord(value));
  assert.equal(value.image, identity.image);
  assert.equal(value.workerDigest, identity.inputs["dist/worker.mjs"]);
  assert.equal(value.journal?.status, "verified");
  assert.equal(value.ownedGuestAbsent, true);
  assert.equal(value.sourceUnchanged, true);
  assert.equal(value.rootDigest, cell.rootDigest);
  assert.ok(Number.isSafeInteger(value.uid) && value.uid > 0);
  assert.ok(Number.isSafeInteger(value.frameCursor) && value.frameCursor > 0);
  assert.match(value.nativeSessionId, /^[a-f0-9]{32}$/);
  for (const key of ["workerDigest", "configurationDigest", "planDigest", "signerFingerprint", "rootDigest", "sourceRootDigest",
    "inputDigest", "witnessSha256", "witnessAuditDigest", "witnessAfterId"]) assert.ok(digest(value[key]), `Missing exact native ${key}.`);
  assert.ok(Number.isSafeInteger(value.witnessBytes) && value.witnessBytes > 0 && value.witnessBytes <= 2 * 1024 * 1024);
  assert.deepEqual(value.network?.scope?.allowedDomains, ["api.githubcopilot.com"]);
}

function completeGroups(log, identity) {
  const selected = new Map();
  for (const row of log.rows.filter((entry) => entry.type === "cell")) {
    const cell = row.result;
    assert.ok(isRecord(cell) && expected.has(cell.id));
    if (!log.groups.includes(groupOf(expected.get(cell.id)))) continue;
    receipt(cell, identity);
    assert.equal(selected.has(cell.id), false, "A completed group repeats a required cell.");
    selected.set(cell.id, cell);
  }
  const required = [...expected].filter(([, cell]) => log.groups.includes(groupOf(cell))).map(([id]) => id);
  assert.deepEqual([...selected.keys()].sort(), required.sort(), "A group cleanup receipt cannot qualify missing or partial cells.");
  return selected;
}

const base = await document(basePath), fresh = await document(groupPath);
assert.equal(base.value.required, 3360);
assert.equal(base.value.nativeNominalStatus, "INCOMPLETE");
assert.equal(base.value.nativePassed, 0, "The original interrupted report must remain unqualified.");
assert.equal(fresh.value.format, "moguri-native-group-qualification");
assert.equal(fresh.value.groupStatus, "PASS");
assert.equal(fresh.value.wholeMatrixQualified, false);
assert.equal(fresh.value.groupUnqualified, 0);
assert.equal(fresh.value.identity?.scope?.kind, "reviewed-whole-groups");
assert.equal(fresh.value.identity.scope.wholeRequired, 3360);
assert.deepEqual(fresh.value.identity.scope.groups, fresh.value.selectedGroups);
assert.ok(isRecord(base.value.identity?.inputs) && isRecord(fresh.value.identity?.inputs));
for (const key of ["protocol", "node", "image", "qualification", "fixtureNetwork"]) {
  assert.deepEqual(base.value.identity[key], fresh.value.identity[key], `Native ${key} changed between complete groups.`);
}
assert.deepEqual(Object.keys(base.value.identity.inputs).sort(), Object.keys(fresh.value.identity.inputs).sort());
assert.deepEqual(Object.keys(fresh.value.identity.inputs).sort(), inputPaths.slice().sort(), "Unexpected inputs cannot grant filesystem access.");
for (const [path, value] of Object.entries(fresh.value.identity.inputs)) {
  assert.ok(digest(value));
  const actual = await realpath(path);
  assert.ok(actual.startsWith(`${workspaceRoot}${sep}`), "A qualification input cannot escape its workspace.");
  assert.equal(sha256(await readFile(actual)), value, `The qualified current input changed: ${path}`);
  if (path !== caseFile) assert.equal(base.value.identity.inputs[path], value, `Native input changed between complete groups: ${path}`);
}
const originalCore = source(base.value.identity), currentCore = source(fresh.value.identity);
assert.deepEqual(currentCore, originalCore, "The cell/setup/group executor changed; selective receipts cannot substitute for it.");
const original = await journal(base.value), selected = await journal(fresh.value);
assert.deepEqual(selected.groups.slice().sort(), fresh.value.selectedGroups.slice().sort());
assert.equal(original.groups.some((group) => selected.groups.includes(group)), false, "Only the missing whole groups may be combined.");
assert.deepEqual([...original.groups, ...selected.groups].sort(), allGroups.slice().sort());
const first = completeGroups(original, base.value.identity), second = completeGroups(selected, fresh.value.identity);
assert.equal(second.size, fresh.value.required);
assert.equal(second.size, fresh.value.groupPassed);
assert.equal(fresh.value.cells.length, second.size);
assert.equal(new Set(fresh.value.cells.map((cell) => cell.id)).size, second.size);
for (const cell of fresh.value.cells) assert.deepEqual(cell, second.get(cell.id), "The group report differs from its original journal.");
const cells = new Map([...first, ...second]);
assert.equal(cells.size, first.size + second.size);
assert.deepEqual([...cells.keys()].sort(), [...expected.keys()].sort());
const values = [...cells.values()];
const executions = values.filter((cell) => cell.coverage === "execution");
assert.equal(executions.length, [...expected.values()].filter((cell) => cell.selection === "fixed" || cell.effort === "default").length);
assert.equal(new Set(executions.map((cell) => cell.nativeReceipt.nativeSessionId)).size, executions.length);
const report = {
  format: "moguri-native-complete-group-coverage", version: 1, status: "PASS",
  createdAt: new Date().toISOString(),
  mergerSha256: sha256(await readFile(new URL(import.meta.url))),
  acceptanceMethod: "Explicitly user-reviewed combination of exact complete groups; original whole invocation remains INCOMPLETE.",
  required: expected.size, nativeCovered: values.length, completeGroups: allGroups,
  coverage: { executions: executions.length, controlRejections: values.length - executions.length },
  originalInvocation: { report: base.path, sha256: base.sha256, status: base.value.nativeNominalStatus,
    journal: original.path, journalSha256: original.sha256, groups: original.groups, identity: base.value.identity },
  reviewedGroupInvocation: { report: fresh.path, sha256: fresh.sha256, status: fresh.value.groupStatus,
    journal: selected.path, journalSha256: selected.sha256, groups: selected.groups, identity: fresh.value.identity },
  unchangedCoreSha256: Object.fromEntries(Object.entries(originalCore).map(([key, value]) => [key, sha256(value)])),
  observedWitnessesAbove128KiB: executions.filter((cell) => cell.nativeReceipt.witnessBytes > 128 * 1024).length,
  maximumWitnessBytes: Math.max(...executions.map((cell) => cell.nativeReceipt.witnessBytes)),
  totalReportedTokens: values.reduce((sum, cell) => sum + cell.reportedTokens, 0),
  billedUsd: null, cells: [...expected.keys()].map((id) => cells.get(id)),
};
const temporary = `${outputPath}.tmp`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
try { await link(temporary, outputPath); }
finally { await unlink(temporary); }
console.log(JSON.stringify({ output: outputPath, status: report.status, nativeCovered: report.nativeCovered,
  completeGroups: report.completeGroups.length, originalInvocationStatus: report.originalInvocation.status,
  observedWitnessesAbove128KiB: report.observedWitnessesAbove128KiB, maximumWitnessBytes: report.maximumWitnessBytes }));
