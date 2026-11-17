type DiffLineKind = "meta" | "hunk" | "add" | "remove" | "context";

const lineKind = (line: string): DiffLineKind =>
  /^(?:diff |index |--- |\+\+\+ |new file|deleted file|similarity |rename |old mode|new mode|Binary files)/.test(line) ? "meta" :
    line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : "context";

/** Exact unified-diff text with a role per line. The +/- prefixes stay in the text, so color never carries the meaning alone. */
export function UnifiedDiff({ text, label }: { text: string; label: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  return <pre className="unified-diff" tabIndex={0} role="region" aria-label={label}>
    {lines.map((line, index) => <span key={index} className="diff-line" data-kind={lineKind(line)}>{line}{index < lines.length - 1 ? "\n" : ""}</span>)}
  </pre>;
}
