import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { GithubItem, GithubScope, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import type { GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";
import { highlightLine, languageForPath } from "./CodeView.tsx";
import { diffGaps, fileLines, gapRows, parsePatch, type DiffGap, type DiffRow } from "./pr-diff-model.ts";
import { ReviewedWritePanel, useReviewedWrite, type ReviewedWrite } from "./reviewed-write.tsx";

interface Target { path: string; line: number; side: "LEFT" | "RIGHT"; row: string }
const HIGHLIGHT_BUDGET = 256 * 1024;
const rowKey = (row: DiffRow) => `${row.kind}:${row.old ?? ""}:${row.new ?? ""}`;
const badge = (path: string) => { const name = path.split("/").at(-1) ?? "", dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : "FILE"; };

/** Changed files at the exact PR head with expandable unchanged lines and inline review comments posted to GitHub. */
export default function PrDiff({ sdk, scope, selection, files, more, writable }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; files: GithubItem[]; more: boolean; writable: boolean;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]), [target, setTarget] = useState<Target | null>(null), [draft, setDraft] = useState(""), [posted, setPosted] = useState("");
  const write = useReviewedWrite(sdk, scope, async () => undefined);
  const paths = files.map((file) => file.path ?? file.title), allCollapsed = paths.length > 0 && paths.every((path) => collapsed.includes(path));
  const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0), deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const highlight = files.reduce((sum, file) => sum + (file.patch?.length ?? 0), 0) <= HIGHLIGHT_BUDGET;
  const open = (next: Target | null) => { if (write.busy) return; write.cancel(); write.setError(""); setDraft(""); setPosted(""); setTarget(next); };
  const submit = (current: Target) => {
    const body = draft.trim();
    if (!body || !selection.item.number) return;
    void write.start(`Comment on ${current.path} line ${current.line}`, { kind: "github.review.comment", repository: selection.source.repository, account: selection.source.account,
      number: selection.item.number, path: current.path, line: current.line, side: current.side, body }, () => {
      setTarget(null); setDraft(""); setPosted(`Comment posted on ${current.path} line ${current.line}. It shows under Reviews.`);
    });
  };
  return <div className="pr-diff">
    <div className="pr-diff-toolbar"><span className="pr-files-summary">{files.length}{more ? "+" : ""} files <span className="pr-added">+{additions}</span> <span className="pr-removed">-{deletions}</span></span>
      <button type="button" className="icon-button" aria-label={allCollapsed ? "Expand all files" : "Collapse all files"} title={allCollapsed ? "Expand all files" : "Collapse all files"}
        onClick={() => setCollapsed(allCollapsed ? [] : paths)}><Icon name={allCollapsed ? "Down" : "Up"} /></button></div>
    {posted && <Alert as="p" className="fine-print" role="status">{posted}</Alert>}
    {files.map((file) => {
      const path = file.path ?? file.title, folded = collapsed.includes(path);
      return <DiffFile key={path} sdk={sdk} scope={scope} selection={selection} file={file} path={path} folded={folded} highlight={highlight} writable={writable}
        toggle={() => setCollapsed((values) => folded ? values.filter((value) => value !== path) : [...values, path])}
        target={target?.path === path ? target : null} open={open} draft={draft} setDraft={setDraft} submit={submit} write={write} />;
    })}
    {more && <p className="fine-print">Showing the first {files.length} files.</p>}
  </div>;
}

function DiffFile({ sdk, scope, selection, file, path, folded, highlight, writable, toggle, target, open, draft, setDraft, submit, write }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; file: GithubItem; path: string; folded: boolean; highlight: boolean; writable: boolean;
  toggle: () => void; target: Target | null; open: (target: Target | null) => void; draft: string; setDraft: (value: string) => void; submit: (target: Target) => void; write: ReviewedWrite;
}) {
  const hunks = useMemo(() => parsePatch(file.patch ?? ""), [file.patch]), gaps = useMemo(() => diffGaps(hunks), [hunks]);
  const [lines, setLines] = useState<string[] | null>(null), [expanded, setExpanded] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const language = highlight ? languageForPath(path) : undefined, split = path.lastIndexOf("/");
  const expand = async (gap: DiffGap) => {
    if (lines) { setExpanded((values) => [...values, gap.id]); return; }
    if (!selection.item.headSha) return;
    setLoading(true); setError("");
    try {
      const value = await sdk.github.browse(scope, { resource: "contents", repository: selection.source.repository, account: selection.source.account, path, ref: selection.item.headSha, page: 1, perPage: 1 });
      const content = value.items[0];
      if (value.accountId !== selection.context.accountId || !content || content.state !== "file") throw new Error("The file at this head could not be read.");
      if (content.conclusion) throw new Error(content.conclusion === "binary" ? "This file is binary." : "This file is too large to show here.");
      setLines(fileLines(content.body)); setExpanded((values) => [...values, gap.id]);
    } catch (error) { setError(error instanceof Error ? error.message : "Unchanged lines could not be read."); }
    finally { setLoading(false); }
  };
  const row = (value: DiffRow, comment: boolean) => {
    const key = rowKey(value), line = value.kind === "remove" ? value.old : value.new, side = value.kind === "remove" ? "LEFT" as const : "RIGHT" as const, active = target?.row === key;
    return <Fragment key={key}>
      <div className="pr-diff-row" data-kind={value.kind} data-active={active || undefined}>
        <span className="pr-diff-num" aria-hidden="true">{value.old ?? ""}</span><span className="pr-diff-num" aria-hidden="true">{value.new ?? ""}</span>
        {comment && writable && line && <button type="button" className="pr-diff-add" aria-label={`Comment on ${side === "LEFT" ? "removed " : ""}line ${line} of ${path}`}
          title="Add a review comment" onClick={() => open(active ? null : { path, line, side, row: key })}><Icon name="Plus" /></button>}
        <span className="pr-diff-sign" aria-hidden="true">{value.kind === "add" ? "+" : value.kind === "remove" ? "-" : " "}</span>
        <code className={`pr-diff-code${language ? ` hljs language-${language}` : ""}`}><span className="sr-only">{value.kind === "add" ? "Added: " : value.kind === "remove" ? "Removed: " : ""}</span>{highlightLine(language, value.text)}</code>
      </div>
      {active && target && <form className="pr-diff-comment" aria-label={`Review comment on ${path} line ${target.line}`} onSubmit={(event) => { event.preventDefault(); submit(target); }}>
        <header><strong>{selection.context.account}</strong><span className="pr-muted">L{target.line}{target.side === "LEFT" ? " (removed)" : ""}</span></header>
        <textarea autoFocus aria-label="Review comment" placeholder="Leave a review comment on this line" maxLength={64 * 1024} rows={3} value={draft} disabled={write.busy || Boolean(write.pending)}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(target); } }} />
        <ReviewedWritePanel write={write} target={`${selection.source.repository}#${selection.item.number} / ${path}:${target.line}`} />
        {write.error && <Alert as="p" className="inline-error" role="alert">{write.error}</Alert>}
        {!write.pending && <div className="button-row"><button type="button" disabled={write.busy} onClick={() => open(null)}>Cancel</button>
          <button type="submit" className="primary" disabled={write.busy || !draft.trim()}>Comment</button></div>}
        <p className="fine-print">Posted to {selection.source.repository} as {selection.context.account}. It appears under Reviews.</p>
      </form>}
    </Fragment>;
  };
  const gapButton = (gap: DiffGap) => {
    const count = gap.newEnd === null ? lines ? Math.max(0, lines.length - gap.newStart + 1) : null : gap.newEnd - gap.newStart + 1;
    if (count === 0) return null;
    return <button key={gap.id} type="button" className="pr-diff-gap" disabled={loading || !selection.item.headSha || file.state === "removed"} onClick={() => void expand(gap)}>
      <Icon name={gap.newEnd === null ? "Down" : "Up"} />{count === null ? "Show the rest of the file" : `${count} unmodified line${count === 1 ? "" : "s"}`}</button>;
  };
  const body = () => {
    if (file.patch === null || file.patch === undefined) return <p className="fine-print pr-diff-note">No text patch from GitHub (binary, oversized or unavailable).</p>;
    const parts: ReactNode[] = [];
    hunks.forEach((hunk, index) => {
      const before = gaps.find((gap) => gap.id === `before-${index}`);
      if (before) parts.push(expanded.includes(before.id) && lines ? gapRows(before, lines).map((value) => row(value, false)) : gapButton(before));
      parts.push(hunk.rows.map((value) => row(value, true)));
    });
    const after = gaps.find((gap) => gap.id === "after");
    if (after) parts.push(expanded.includes(after.id) && lines ? gapRows(after, lines).map((value) => row(value, false)) : gapButton(after));
    return <div className="pr-diff-rows" role="region" tabIndex={0} aria-label={`Diff of ${path}`}>{parts}</div>;
  };
  return <section className="pr-file" aria-label={path}>
    <header><button type="button" className="pr-file-toggle" aria-expanded={!folded} onClick={toggle}>
      <Icon name={folded ? "ChevronRight" : "Down"} /><span className="pr-file-badge" aria-hidden="true">{badge(path)}</span>
      <span className="pr-file-path">{split >= 0 && <span className="pr-file-dir">{path.slice(0, split + 1)}</span>}<strong>{path.slice(split + 1)}</strong></span></button>
      <span className="pr-file-stats">{file.state !== "modified" && <span className="pr-file-status">{file.state}</span>}<span className="pr-added">+{file.additions ?? 0}</span><span className="pr-removed">-{file.deletions ?? 0}</span></span></header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {!folded && body()}
  </section>;
}
