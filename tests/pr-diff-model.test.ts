import assert from "node:assert/strict";
import test from "node:test";
import { diffGaps, fileLines, gapRows, parsePatch } from "../apps/desktop/src/pr-diff-model.ts";

test("patch rows carry old and new line numbers and the gaps between hunks map back to the old file", () => {
  const hunks = parsePatch("@@ -2,3 +2,4 @@ context\n first\n-old\n+new\n+added\n kept\n\\ No newline at end of file\n@@ -10,2 +11,2 @@\n ten\n-gone\n+here\n");
  assert.deepEqual(hunks[0]!.rows.map((row) => [row.kind, row.old, row.new, row.text]), [
    ["context", 2, 2, "first"], ["remove", 3, null, "old"], ["add", null, 3, "new"], ["add", null, 4, "added"], ["context", 4, 5, "kept"]]);
  assert.deepEqual(hunks.map((hunk) => [hunk.oldEnd, hunk.newEnd]), [[4, 5], [11, 12]]);
  const gaps = diffGaps(hunks);
  assert.deepEqual(gaps, [
    { id: "before-0", newStart: 1, newEnd: 1, offset: 0 },
    { id: "before-1", newStart: 6, newEnd: 10, offset: 1 },
    { id: "after", newStart: 13, newEnd: null, offset: 1 },
  ]);
  const lines = fileLines(Array.from({ length: 14 }, (_, index) => `line ${index + 1}`).join("\n") + "\n");
  assert.equal(lines.length, 14);
  assert.deepEqual(gapRows(gaps[1]!, lines).map((row) => [row.old, row.new, row.text]), [[5, 6, "line 6"], [6, 7, "line 7"], [7, 8, "line 8"], [8, 9, "line 9"], [9, 10, "line 10"]]);
  assert.deepEqual(gapRows(gaps[2]!, lines).map((row) => [row.old, row.new]), [[12, 13], [13, 14]]);
});

test("a new file starts at line 1 without a leading gap and an empty patch has none", () => {
  assert.deepEqual(diffGaps(parsePatch("@@ -0,0 +1,2 @@\n+a\n+b")).map((gap) => gap.id), ["after"]);
  assert.deepEqual(diffGaps(parsePatch("")), []);
  assert.deepEqual(fileLines(""), []);
});
