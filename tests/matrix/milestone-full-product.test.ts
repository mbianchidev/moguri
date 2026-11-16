import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { fullMilestoneProduct, isManualKupoEffort, milestoneAxes, milestoneCellId, type MilestoneCell } from "../fixtures/milestone-combinations.ts";
import { concurrency, matrixDirectory, native, runNativeMatrix, runSourceMatrix } from "../fixtures/milestone-runner.ts";

const caseFile = "tests/matrix/milestone-full-product.test.ts";
const cells = fullMilestoneProduct();
const nativeGroups = process.env.MOGURI_NATIVE_GROUPS;
const nativeGroupMode = nativeGroups !== undefined;

test("the opt-in full product is the complete Cartesian set, with native cells retained separately", () => {
  assert.equal(cells.length, 10080);
  assert.equal(new Set(cells.map(milestoneCellId)).size, cells.length);
  assert.equal(cells.filter((cell) => cell.env !== "Sandbox").length, 6720);
  assert.equal(cells.filter((cell) => cell.env === "Sandbox").length, 3360);
  assert.equal(cells.filter((cell) => !isManualKupoEffort(cell)).length, 3168);
  assert.equal(cells.filter(isManualKupoEffort).length, 6912);
  for (const [axis, values] of Object.entries(milestoneAxes)) {
    for (const value of values) {
      assert.equal(cells.filter((cell) => cell[axis as keyof MilestoneCell] === value).length, cells.length / values.length);
    }
  }
});

test("reviewed native groups reject partial-cell and duplicate selections before creating a qualification journal", {
  skip: !native, timeout: 15000,
}, async () => {
  await mkdir(matrixDirectory, { recursive: true });
  const before = (await readdir(matrixDirectory)).filter((name) => name.startsWith("native-progress-")).sort();
  for (const [selection, diagnostic] of [
    [["critique/Autopilot/unlimited"], /Select only exact whole native groups/],
    [["critique/Autopilot", "critique/Autopilot"], /Duplicate group selection/],
    [[], /Select only exact whole native groups/],
  ] as const) {
    await assert.rejects(() => promisify(execFile)(process.execPath, [
      "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      "--test", "--test-name-pattern", "^reviewed native Sandbox groups execute",
      resolve(caseFile),
    ], { timeout: 10000, env: { ...process.env, NODE_TEST_CONTEXT: undefined, MOGURI_NATIVE_GROUPS: JSON.stringify(selection) } }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && error.code === 1);
      assert.ok("stdout" in error && typeof error.stdout === "string");
      assert.match(error.stdout, diagnostic); return true;
    });
  }
  assert.deepEqual((await readdir(matrixDirectory)).filter((name) => name.startsWith("native-progress-")).sort(), before);
});

test("full-product Local/SSH source cells execute every control/input combination through the service and SDK", {
  skip: process.platform !== "darwin", concurrency, timeout: 7200000,
}, (t) => runSourceMatrix(t, { method: "full-product", caseFile, cells,
  groupId: (cell) => `${cell.env}/${cell.selection}/${cell.autonomy}/${cell.budget}/${cell.effort}` }));

test(nativeGroupMode ? "reviewed native Sandbox groups execute every whole-group combination on the exact owned guest" :
  "full-product native Sandbox cells execute every control/input combination on the exact owned guest", {
  skip: !native, concurrency: 2, timeout: 14_400_000,
}, (t) => runNativeMatrix(t, { method: "full-product", caseFile, cells,
  groupId: (cell) => `${cell.selection}/${cell.autonomy}`, requestedGroups: nativeGroups }));
