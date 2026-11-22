/** A unified-diff hunk parsed into rows with old and new line numbers. */
export interface DiffRow { kind: "context" | "add" | "remove"; old: number | null; new: number | null; text: string }
export interface DiffHunk { oldStart: number; newStart: number; oldEnd: number; newEnd: number; rows: DiffRow[] }
export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | null = null, oldLine = 0, newLine = 0;
  for (const line of patch.replace(/\n$/, "").split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]); newLine = Number(header[3]);
      hunk = { oldStart: oldLine, newStart: newLine, oldEnd: oldLine - 1, newEnd: newLine - 1, rows: [] }; hunks.push(hunk); continue;
    }
    if (!hunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) hunk.rows.push({ kind: "add", old: null, new: newLine++, text: line.slice(1) });
    else if (line.startsWith("-")) hunk.rows.push({ kind: "remove", old: oldLine++, new: null, text: line.slice(1) });
    else hunk.rows.push({ kind: "context", old: oldLine++, new: newLine++, text: line.slice(1) });
    hunk.oldEnd = oldLine - 1; hunk.newEnd = newLine - 1;
  }
  return hunks;
}

/** Split file text into lines the way a diff counts them: a final newline does not start another line. */
export const fileLines = (text: string): string[] => text === "" ? [] : text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");

/** GitHub's per-file patch is only hunks; the diff renderer needs git headers, including /dev/null for added and removed files. */
export function gitFilePatch(path: string, state: string, patch: string): string {
  const added = state === "added", removed = state === "removed";
  return `diff --git a/${path} b/${path}\n${added ? "new file mode 100644\n" : removed ? "deleted file mode 100644\n" : ""}` +
    `--- ${added ? "/dev/null" : `a/${path}`}\n+++ ${removed ? "/dev/null" : `b/${path}`}\n${patch.replace(/\n?$/, "\n")}`;
}

/** The base-side file the patch was made against, rebuilt from the head file by undoing each hunk. Used to expand unchanged lines. */
export function reconstructOldFile(newText: string, patch: string): string {
  const lines = fileLines(newText), out: string[] = [];
  let next = 1;
  for (const hunk of parsePatch(patch)) {
    for (const start = Math.max(1, hunk.newStart); next < start; next++) out.push(lines[next - 1] ?? "");
    for (const row of hunk.rows) {
      if (row.kind !== "add") out.push(row.text);
      if (row.kind !== "remove") next++;
    }
  }
  for (; next <= lines.length; next++) out.push(lines[next - 1]!);
  return out.length ? out.join("\n") + (newText.endsWith("\n") ? "\n" : "") : "";
}
