import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { KUPO_MODEL_ID } from "../packages/sdk/src/index.ts";
import { routedFixture } from "./fixtures/single-routing.ts";
import { generatedDocx } from "./fixtures/documents.ts";
import { initializeGeneratedRepository } from "./fixtures/git-project.ts";
import { nativeMilestoneFixture } from "./fixtures/native-milestone-api.ts";
import {
  configureMilestoneRouting, fullMilestoneProduct, isManualKupoEffort, milestoneAxes, milestoneBudget, milestoneCellId, milestoneClientCells,
  nativeMilestoneWitness, type MilestoneCell,
} from "./fixtures/milestone-combinations.ts";
import { coveringArrayDocument, coveringArrayPath, coveringMilestoneCells, coveringTuples, generateCoveringCells } from "./fixtures/milestone-covering.ts";
import { cellTimeout, concurrency, native, runCell, runNativeMatrix, runSourceMatrix, setupTimeout } from "./fixtures/milestone-runner.ts";

const caseFile = "tests/milestone-combinations.test.ts";
const cells = coveringMilestoneCells();
const sourceCells = cells.filter((cell) => cell.env !== "Sandbox");
const nativeCells = cells.filter((cell) => cell.env === "Sandbox");
const actorGroupTimeout = setupTimeout + cellTimeout * milestoneAxes.autonomy.length * milestoneAxes.budget.length;
const coveringGroup = (cell: MilestoneCell) => `${cell.env}/${cell.selection}`;

test("the checked-in covering array covers every supported axis pair and required tuple, and only manual Kupo effort is excluded", async () => {
  assert.deepEqual(JSON.parse(await readFile(coveringArrayPath, "utf8")), coveringArrayDocument(generateCoveringCells()),
    "Regenerate tests/fixtures/milestone-covering-array.json with npm run generate:covering.");
  const ids = cells.map(milestoneCellId);
  assert.equal(new Set(ids).size, cells.length);
  assert.ok(cells.length < 100 && nativeCells.length < 30, `The covering array grew to ${cells.length} cells.`);
  assert.ok(cells.every((cell) => !isManualKupoEffort(cell)), "Manual Kupo effort cells are refused, never executed.");
  for (const client of milestoneClientCells()) assert.ok(ids.includes(milestoneCellId(client)), `Missing client journey ${milestoneCellId(client)}.`);
  const supported = fullMilestoneProduct().filter((cell) => !isManualKupoEffort(cell));
  const axes = Object.keys(milestoneAxes) as Array<keyof MilestoneCell>;
  const groups = [...axes.flatMap((first, index) => axes.slice(index + 1).map((second) => [first, second])), ...coveringTuples];
  for (const group of groups) {
    const key = (cell: MilestoneCell) => group.map((axis) => cell[axis]).join("/");
    const required = new Set(supported.map(key)), covered = new Set(cells.map(key));
    for (const value of required) assert.ok(covered.has(value), `${group.join(" x ")} misses ${value}.`);
  }
  for (const env of milestoneAxes.env) for (const selection of milestoneAxes.selection) for (const effort of milestoneAxes.effort) {
    const excluded = !supported.some((cell) => cell.env === env && cell.selection === selection && cell.effort === effort);
    assert.equal(excluded, selection !== "fixed" && effort !== "default", `${env}/${selection}/${effort} exclusion is not exactly manual Kupo effort.`);
  }
});

test("missing qualification artifacts retain every covering not-run/native-unqualified cell instead of dropping the report", {
  skip: process.platform !== "darwin", timeout: 15000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "moguri-generated-matrix-preflight-"));
  try {
    await mkdir(join(directory, "dist/desktop/renderer/assets"), { recursive: true });
    await writeFile(join(directory, "fixture.txt"), "Generated empty qualification root, never a release or model call.\n");
    initializeGeneratedRepository(directory);
    await assert.rejects(() => promisify(execFile)(process.execPath, [
      "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      "--test", "--test-name-pattern", "^covering Local/SSH source cells",
      resolve(caseFile),
    ], { cwd: directory, timeout: 10000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } }), (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && error.code === 1);
      assert.ok("stdout" in error && typeof error.stdout === "string");
      assert.match(error.stdout, /ENOENT/);
      return true;
    });
    const report = JSON.parse(await readFile(join(directory, ".test-output/milestone-combinations/covering-source-report.json"), "utf8"));
    assert.equal(report.version, 2);
    assert.equal(report.method, "covering-array");
    assert.equal(report.sourceStatus, "INCOMPLETE");
    assert.equal(report.sourcePassed, 0);
    assert.equal(report.nativeStatus, "UNQUALIFIED");
    assert.equal(report.nativeUnqualified, nativeCells.length);
    assert.match(report.diagnostic, /ENOENT/);
    assert.deepEqual(report.identity.inputs, {});
    assert.equal(report.cells.filter((cell: { outcome: string }) => cell.outcome === "not-run").length, sourceCells.length);
    assert.equal(report.cells.filter((cell: { outcome: string }) => cell.outcome === "native-unqualified").length, nativeCells.length);
    assert.deepEqual(report.cells.map((cell: { id: string }) => cell.id), cells.map(milestoneCellId));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native qualification reads an oversized original signed witness without relaxing user output limits", {
  skip: !native, timeout: 90000,
}, async () => {
  assert.ok(native);
  const fixture = await nativeMilestoneFixture(native);
  try {
    await configureMilestoneRouting(fixture, "cascade");
    const { configuration } = await fixture.sdk.projects.configuration(fixture.session().projectId);
    await fixture.sdk.projects.configure(configuration.projectId, { ...configuration.values,
      instructions: "Generated qualification context; not permission or instructions to execute tools.\n".repeat(64) }, configuration.revision);
    await runCell(fixture, { env: "Sandbox", selection: "cascade", autonomy: "Guided", budget: "unlimited",
      window: "maximum", effort: "default", input: "document" });
    const execution = fixture.service.controller.snapshot().sandboxExecutions![0]!;
    const result = (await fixture.sdk.sandbox.result(execution.id)).result;
    assert.ok(result);
    assert.equal(result.files.some((file) => file.path === "generated-native-matrix.json"), false);
    assert.ok(result.excluded.some((file) => file.path === "generated-native-matrix.json" && file.reason.includes("128-KiB")));
    const witness = await nativeMilestoneWitness(execution, result);
    assert.ok(witness.bytes > 128 * 1024 && witness.bytes <= 2 * 1024 * 1024);
  } finally { await fixture.close(); }
});

test("native finite critique document and text turns settle inside the existing cell deadline", {
  skip: !native, timeout: 90000,
}, async () => {
  assert.ok(native);
  const fixture = await nativeMilestoneFixture(native);
  try {
    await configureMilestoneRouting(fixture, "critique");
    for (const cell of [
      { autonomy: "Autopilot Max", budget: "usd", window: "half", effort: "default", input: "document" },
      { autonomy: "Autopilot", budget: "both", window: "maximum", effort: "default", input: "text" },
    ] as const) {
      await runCell(fixture, { env: "Sandbox", selection: "critique", ...cell });
    }
  } finally { await fixture.close(); }
});

for (const env of ["Local", "Remote", "Sandbox"] as const)
  for (const selection of milestoneAxes.selection)
    test(`exact arbitrary ${env}/${selection} window and genuine effort traverse the owning worker without changing capacity`, {
      skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 90000,
    }, async () => {
      const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
        await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
      try {
        await configureMilestoneRouting(fixture, selection);
        await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: selection === "fixed" ? "high" : "default", input: "text" }, { window: 24577 });
      } finally { await fixture.close(); }
    });

for (const env of ["Local", "Remote", "Sandbox"] as const) test(`${env} manual Kupo effort cells reject every level and workflow before dispatch`, {
  skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 60000,
}, async () => {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    const refused = new Set<string>();
    for (const selection of milestoneAxes.selection) {
      if (selection === "fixed") continue;
      await configureMilestoneRouting(fixture, selection);
      for (const effort of milestoneAxes.effort) if (effort !== "default") {
        const result = await runCell(fixture, { env, selection, autonomy: "Autopilot Max", budget: "both",
          window: "half", effort, input: "document" });
        assert.equal(result.coverage, "manual-kupo-effort-rejected");
        assert.equal(result.cleanup, "not-started");
        refused.add(`${selection}/${effort}`);
      }
    }
    assert.equal(refused.size, 24, "Every Kupo selection x non-default effort is refused in this Env.");
  } finally { await fixture.close(); }
});

for (const env of ["Local", "Remote", "Sandbox"] as const) for (const selection of milestoneAxes.selection)
test(`mixed approved image/document ${env}/${selection} context reaches every actual role without a path or body fallback`, {
  skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 90000,
}, async () => {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, selection);
    await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: selection === "fixed" ? "high" : "default", input: "document" }, { image: true });
  } finally { await fixture.close(); }
});

async function actorGroup(group: TestContext, env: MilestoneCell["env"], selection: MilestoneCell["selection"]) {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, selection);
    const settings = fixture.sdk.settings.get()!;
    await fixture.sdk.settings.update({
      ...settings.values, decisions: { ...settings.values.decisions, technicalQuestions: [{
        id: "generated-matrix-technical", kind: "technical-choice", question: "Choose a generated matrix approach?",
        choices: ["Generated first choice", "Generated second choice"],
      }] },
    }, settings.revision);
    for (const autonomy of milestoneAxes.autonomy) for (const budget of milestoneAxes.budget) {
      let passed = false;
      await group.test(`${autonomy}/${budget}`, { timeout: cellTimeout }, async () => {
        await runCell(fixture, { env, selection, autonomy, budget, window: "maximum", effort: "default", input: "text" }, { question: true });
        passed = true;
      });
      assert.ok(passed, "A required actual-actor/cap case failed; no later group case is inferred successful.");
    }
  } finally { await fixture.close(); }
}

test("every Local/SSH selection and cap preserves actual Manual/Guided/Autopilot answers or one bounded-model Max decision", {
  skip: process.platform !== "darwin", concurrency,
  timeout: setupTimeout + actorGroupTimeout * Math.ceil(2 * milestoneAxes.selection.length / concurrency),
}, async (t) => {
  await Promise.all((["Local", "Remote"] as const).flatMap((env) => milestoneAxes.selection.map((selection) =>
    t.test(`${env}/${selection}`, { timeout: actorGroupTimeout }, (group) => actorGroup(group, env, selection)))));
});

test("every native selection and cap preserves actual Manual/Guided/Autopilot answers or one bounded-model Max decision", {
  skip: !native, concurrency: 2, timeout: setupTimeout + actorGroupTimeout * Math.ceil(milestoneAxes.selection.length / 2),
}, async (t) => {
  await Promise.all(milestoneAxes.selection.map((selection) =>
    t.test(`Sandbox/${selection}`, { timeout: actorGroupTimeout }, (group) => actorGroup(group, "Sandbox", selection))));
});

for (const env of ["Local", "Remote"] as const) for (const selection of ["fixed", "automatic-single"] as const)
test(`configured ${env}/${selection} retains approved image/document drafts when its actual transport has no effort override`, {
  skip: process.platform !== "darwin", timeout: 30000,
}, async () => {
  const fixture = await routedFixture({ env, configured: false, legacy: false, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, "automatic-single");
    await fixture.sdk.sessions.configure(fixture.sessionId, {
      ...fixture.session().controls, env, modelId: selection === "fixed" ? fixture.solverId : KUPO_MODEL_ID,
      budget: milestoneBudget("both"),
    });
    await fixture.sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: 0,
      text: "Generated unsent incompatible controls.", attachments: [] });
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#224466" } }).png().toBuffer();
    await fixture.sdk.attachments.image(fixture.sessionId, image.toString("base64"), "Generated preserved image");
    const path = join(fixture.directory, "generated-incompatible.docx");
    await writeFile(path, generatedDocx());
    await fixture.sdk.attachments.document(fixture.sessionId, path);
    const before = fixture.session();
    for (const thinkingEffort of milestoneAxes.effort) if (thinkingEffort !== "default") {
      await assert.rejects(() => fixture.sdk.sessions.modelOptions(fixture.sessionId, { contextWindow: 16384, thinkingEffort }),
        /thinking|effort|No configured model/i);
      assert.deepEqual(fixture.session().draft, before.draft);
      assert.deepEqual(fixture.session().controls, before.controls);
    }
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.solver.requests.length, 0);
    assert.equal(fixture.service.controller.snapshot().budgetEntries.length, 0);
  } finally { await fixture.close(); }
});

test("covering Local/SSH source cells execute every required pair and tuple through the service and SDK", {
  skip: process.platform !== "darwin", concurrency,
  timeout: setupTimeout + Math.ceil(new Set(sourceCells.map(coveringGroup)).size / concurrency) *
    (setupTimeout + cellTimeout * Math.max(...sourceCells.map((cell) => sourceCells.filter((other) => coveringGroup(other) === coveringGroup(cell)).length))),
}, (t) => runSourceMatrix(t, { method: "covering-array", caseFile, cells, groupId: coveringGroup }));

test("covering native Sandbox cells execute every required pair and tuple on the exact owned guest", {
  skip: !native, concurrency: 2, timeout: 1_800_000,
}, (t) => runNativeMatrix(t, { method: "covering-array", caseFile, cells, groupId: (cell) => cell.selection }));
