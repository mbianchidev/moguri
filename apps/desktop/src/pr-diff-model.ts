/** A unified-diff hunk parsed into rows with old and new line numbers. */
export interface DiffRow { kind: "context" | "add" | "remove"; old: number | null; new: number | null; text: string }
export interface DiffHunk { oldStart: number; newStart: number; oldEnd: number; newEnd: number; rows: DiffRow[] }
/** Unchanged lines between hunks, in new-file numbering; old = new - offset. `newEnd` null means "to the end of the file". */
export interface DiffGap { id: string; newStart: number; newEnd: number | null; offset: number }

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

/** The collapsed unchanged ranges before, between and after hunks. */
export function diffGaps(hunks: readonly DiffHunk[]): DiffGap[] {
  const gaps: DiffGap[] = [];
  let newNext = 1, offset = 0;
  hunks.forEach((hunk, index) => {
    const start = hunk.newStart === 0 ? 1 : hunk.newStart;
    if (start > newNext) gaps.push({ id: `before-${index}`, newStart: newNext, newEnd: start - 1, offset: hunk.newStart - hunk.oldStart });
    newNext = hunk.newEnd + 1; offset = hunk.newEnd - hunk.oldEnd;
  });
  if (hunks.length) gaps.push({ id: "after", newStart: newNext, newEnd: null, offset });
  return gaps;
}

/** Context rows for a gap from the head file's lines (1-based). Lines past the end of the file are omitted. */
export function gapRows(gap: DiffGap, lines: readonly string[]): DiffRow[] {
  const end = Math.min(gap.newEnd ?? lines.length, lines.length), rows: DiffRow[] = [];
  for (let line = gap.newStart; line <= end; line++) rows.push({ kind: "context", old: line - gap.offset, new: line, text: lines[line - 1] ?? "" });
  return rows;
}

/** Split file text into lines the way a diff counts them: a final newline does not start another line. */
export const fileLines = (text: string): string[] => text === "" ? [] : text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
