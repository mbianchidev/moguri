import assert from "node:assert/strict";
import test from "node:test";
import { fileLines, gitFilePatch, parsePatch, reconstructOldFile } from "../apps/desktop/src/pr-diff-model.ts";

test("patch rows carry old and new line numbers", () => {
  const hunks = parsePatch("@@ -2,3 +2,4 @@ context\n first\n-old\n+new\n+added\n kept\n\\ No newline at end of file\n@@ -10,2 +11,2 @@\n ten\n-gone\n+here\n");
  assert.deepEqual(hunks[0]!.rows.map((row) => [row.kind, row.old, row.new, row.text]), [
    ["context", 2, 2, "first"], ["remove", 3, null, "old"], ["add", null, 3, "new"], ["add", null, 4, "added"], ["context", 4, 5, "kept"]]);
  assert.deepEqual(hunks.map((hunk) => [hunk.oldEnd, hunk.newEnd]), [[4, 5], [11, 12]]);
  assert.deepEqual(fileLines(""), []);
  assert.equal(fileLines("a\nb\n").length, 2);
});

test("the base file is rebuilt exactly from the head file and its patch, so unchanged lines can expand", () => {
  const before = Array.from({ length: 14 }, (_, index) => `line ${index + 1}`);
  const after = [...before];
  after.splice(2, 1, "new", "added");
  after.splice(11, 1, "here");
  const patch = "@@ -2,3 +2,4 @@\n line 2\n-line 3\n+new\n+added\n line 4\n@@ -11,3 +12,3 @@\n line 11\n-line 12\n+here\n line 13\n";
  assert.equal(reconstructOldFile(`${after.join("\n")}\n`, patch), `${before.join("\n")}\n`);
  assert.equal(reconstructOldFile("a\nb\n", "@@ -0,0 +1,2 @@\n+a\n+b\n"), "");
});

test("GitHub per-file patches get git headers, with /dev/null for added and removed files", () => {
  assert.match(gitFilePatch("src/a.ts", "modified", "@@ -1 +1 @@\n-a\n+b"), /^diff --git a\/src\/a\.ts b\/src\/a\.ts\n--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts\n@@ -1 \+1 @@\n-a\n\+b\n$/);
  assert.match(gitFilePatch("n.ts", "added", "@@ -0,0 +1 @@\n+n\n"), /new file mode 100644\n--- \/dev\/null\n\+\+\+ b\/n\.ts\n/);
  assert.match(gitFilePatch("r.ts", "removed", "@@ -1 +0,0 @@\n-r\n"), /deleted file mode 100644\n--- a\/r\.ts\n\+\+\+ \/dev\/null\n/);
});
