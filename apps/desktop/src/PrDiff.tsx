import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { processFile, type DiffLineAnnotation, type FileDiffContentsLoader, type FileDiffMetadata, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff, type FileDiffOptions } from "@pierre/diffs/react";
import type { GithubItem, GithubScope, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import type { GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";
import { gitFilePatch, parsePatch, reconstructOldFile } from "./pr-diff-model.ts";
import { ReviewedWritePanel, useReviewedWrite, type ReviewedWrite } from "./reviewed-write.tsx";

interface Target { path: string; line: number; side: "LEFT" | "RIGHT" }
const badge = (path: string) => { const name = path.split("/").at(-1) ?? "", dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : "FILE"; };
const THEMES = { dark: "pierre-dark", light: "pierre-light" } as const;

/** The app's current light/dark mode, which the renderer's syntax theme follows. */
function subscribeTheme(change: () => void) {
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const useAppTheme = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "light" ? "light" as const : "dark" as const);
/** The renderer's expand controls are pointer-only `div role="button"`s: give them a name, a tab stop and Enter/Space. */
function keyboardExpanders(node: HTMLElement) {
  for (const button of node.shadowRoot?.querySelectorAll<HTMLElement>("[data-expand-button]") ?? []) {
    if (button.dataset.keyboard === "ready") continue;
    const lines = button.closest("[data-separator]")?.querySelector("[data-unmodified-lines]")?.textContent?.trim() || "unmodified lines";
    const where = button.hasAttribute("data-expand-up") ? " above" : button.hasAttribute("data-expand-down") ? " below" : "";
    button.tabIndex = 0; button.dataset.keyboard = "ready";
    button.setAttribute("aria-label", button.hasAttribute("data-expand-all-button") ? `Show all ${lines}` : `Show ${lines}${where}`);
    button.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); button.click(); } });
  }
}

/** Changed files at the exact PR head, highlighted by @pierre/diffs (D70), with expandable unchanged lines and inline review comments. */
export default function PrDiff({ sdk, scope, selection, files, more, writable }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; files: GithubItem[]; more: boolean; writable: boolean;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]), [target, setTarget] = useState<Target | null>(null), [draft, setDraft] = useState(""), [posted, setPosted] = useState("");
  const write = useReviewedWrite(sdk, scope, async () => undefined), theme = useAppTheme();
  const paths = files.map((file) => file.path ?? file.title), allCollapsed = paths.length > 0 && paths.every((path) => collapsed.includes(path));
  const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0), deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const latest = useRef(write); latest.current = write;
  // Stable so each file's renderer options stay memoized across renders.
  const open = useCallback((next: Target | null) => {
    const current = latest.current;
    if (current.busy) return;
    current.cancel(); current.setError(""); setDraft(""); setPosted(""); setTarget(next);
  }, []);
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
      return <DiffFile key={path} sdk={sdk} scope={scope} selection={selection} file={file} path={path} folded={folded} writable={writable} theme={theme}
        toggle={() => setCollapsed((values) => folded ? values.filter((value) => value !== path) : [...values, path])}
        target={target?.path === path ? target : null} open={open} draft={draft} setDraft={setDraft} submit={submit} write={write} />;
    })}
    {more && <p className="fine-print">Showing the first {files.length} files.</p>}
  </div>;
}

function DiffFile({ sdk, scope, selection, file, path, folded, writable, theme, toggle, target, open, draft, setDraft, submit, write }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; file: GithubItem; path: string; folded: boolean; writable: boolean; theme: "dark" | "light";
  toggle: () => void; target: Target | null; open: (target: Target | null) => void; draft: string; setDraft: (value: string) => void; submit: (target: Target) => void; write: ReviewedWrite;
}) {
  const patch = file.patch, head = selection.item.headSha, split = path.lastIndexOf("/");
  const [full, setFull] = useState<FileDiffMetadata | null>(null), [loadingFull, setLoadingFull] = useState(false), [fullError, setFullError] = useState("");
  const partial = useMemo(() => patch === null || patch === undefined ? undefined :
    processFile(gitFilePatch(path, file.state, patch), { isGitDiff: true, cacheKey: `${head ?? "unknown"}:${path}` }), [patch, path, file.state, head]);
  const fileDiff = full ?? partial;
  const firstLine = useMemo(() => {
    const rows = parsePatch(patch ?? "").flatMap((hunk) => hunk.rows), row = rows.find((value) => value.kind === "add") ?? rows.find((value) => value.kind === "remove");
    return row ? { line: (row.kind === "remove" ? row.old : row.new) ?? 1, side: row.kind === "remove" ? "LEFT" as const : "RIGHT" as const } : { line: 1, side: "RIGHT" as const };
  }, [patch]);
  // Unchanged lines expand from the head file; the base side is rebuilt by undoing this exact patch.
  const loadDiffFiles = useCallback<FileDiffContentsLoader>(async () => {
    if (!head || patch === null || patch === undefined) throw new Error("This pull request has no verified head. Unchanged lines were not guessed.");
    const value = await sdk.github.browse(scope, { resource: "contents", repository: selection.source.repository, account: selection.source.account, path, ref: head, page: 1, perPage: 1 });
    const content = value.items[0];
    if (value.accountId !== selection.context.accountId || !content || content.state !== "file") throw new Error("The file at this head could not be read.");
    if (content.conclusion) throw new Error(content.conclusion === "binary" ? "This file is binary." : "This file is too large to show here.");
    return { oldFile: { name: path, contents: reconstructOldFile(content.body, patch) }, newFile: { name: path, contents: content.body } };
  }, [sdk, scope, selection, path, head, patch]);
  const expandable = file.state !== "added" && file.state !== "removed";
  // A patch never says how long the file is, so lines after the last hunk need the whole file.
  const showFull = async () => {
    if (!patch || loadingFull) return;
    setLoadingFull(true); setFullError("");
    try {
      const files = await loadDiffFiles(partial!);
      if (!files.oldFile) throw new Error("The unchanged lines of this file could not be rebuilt.");
      setFull(processFile(gitFilePatch(path, file.state, patch), { isGitDiff: true, oldFile: files.oldFile, newFile: files.newFile, cacheKey: `${head ?? "unknown"}:${path}:full` }) ?? null);
    } catch (error) { setFullError(error instanceof Error ? error.message : "Unchanged lines could not be read."); }
    finally { setLoadingFull(false); }
  };
  const options = useMemo<FileDiffOptions<Target, undefined>>(() => ({
    theme: THEMES, themeType: theme, diffStyle: "unified", diffIndicators: "classic", hunkSeparators: "line-info", overflow: "scroll", disableFileHeader: true,
    lineHoverHighlight: "both", expansionLineCount: 50, enableGutterUtility: writable,
    onPostRender: (node: HTMLElement, _instance: unknown, phase: string) => { if (phase !== "unmount") keyboardExpanders(node); },
    onGutterUtilityClick: (range: SelectedLineRange) => open({ path, line: range.end, side: (range.endSide ?? range.side) === "deletions" ? "LEFT" : "RIGHT" }),
    ...(full ? { expandUnchanged: true } : expandable ? { loadDiffFiles } : {}),
  }), [theme, writable, expandable, loadDiffFiles, path, open, full]);
  const annotations = useMemo<DiffLineAnnotation<Target>[]>(() => target ? [{ side: target.side === "LEFT" ? "deletions" : "additions", lineNumber: target.line, metadata: target }] : [], [target]);
  const form = (current: Target) => <form className="pr-diff-comment" aria-label={`Review comment on ${path} line ${current.line}`} onSubmit={(event) => { event.preventDefault(); submit(current); }}>
    <header><strong>{selection.context.account}</strong>
      <label className="pr-diff-comment-line">Line<input type="number" min={1} value={current.line} disabled={write.busy || Boolean(write.pending)}
        onChange={(event) => { const line = Number(event.target.value); if (Number.isSafeInteger(line) && line > 0) open({ ...current, line }); }} /></label>
      <label className="pr-diff-comment-line">Side<select value={current.side} disabled={write.busy || Boolean(write.pending)} onChange={(event) => open({ ...current, side: event.target.value === "LEFT" ? "LEFT" : "RIGHT" })}>
        <option value="RIGHT">New</option><option value="LEFT">Removed</option></select></label></header>
    <textarea autoFocus aria-label="Review comment" placeholder="Leave a review comment on this line" maxLength={64 * 1024} rows={3} value={draft} disabled={write.busy || Boolean(write.pending)}
      onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(current); } }} />
    <ReviewedWritePanel write={write} target={`${selection.source.repository}#${selection.item.number} / ${path}:${current.line}`} />
    {write.error && <Alert as="p" className="inline-error" role="alert">{write.error}</Alert>}
    {!write.pending && <div className="button-row"><button type="button" disabled={write.busy} onClick={() => open(null)}>Cancel</button>
      <button type="submit" className="primary" disabled={write.busy || !draft.trim()}>Comment</button></div>}
    <p className="fine-print">Posted to {selection.source.repository} as {selection.context.account}. It appears under Reviews.</p>
  </form>;
  return <section className="pr-file" aria-label={path}>
    <header><button type="button" className="pr-file-toggle" aria-expanded={!folded} onClick={toggle}>
      <Icon name={folded ? "ChevronRight" : "Down"} /><span className="pr-file-badge" aria-hidden="true">{badge(path)}</span>
      <span className="pr-file-path">{split >= 0 && <span className="pr-file-dir">{path.slice(0, split + 1)}</span>}<strong>{path.slice(split + 1)}</strong></span></button>
      <span className="pr-file-stats">{file.state !== "modified" && <span className="pr-file-status">{file.state}</span>}<span className="pr-added">+{file.additions ?? 0}</span><span className="pr-removed">-{file.deletions ?? 0}</span>
        {expandable && partial && !full && <button type="button" className="icon-button" aria-label={`Show the full file ${path}`} title="Show the full file" disabled={loadingFull || !head}
          onClick={() => void showFull()}><Icon name="Maximize" /></button>}
        {writable && fileDiff && <button type="button" className="icon-button" aria-label={`Comment on ${path}`} title="Add a review comment"
          onClick={() => open(target ? null : { path, ...firstLine })}><Icon name="Plus" /></button>}</span></header>
    {fullError && <Alert as="p" className="inline-error" role="alert">{fullError}</Alert>}
    {!folded && (fileDiff ? <div className="pr-diff-rows" role="region" tabIndex={0} aria-label={`Diff of ${path}`}>
      <FileDiff<Target> fileDiff={fileDiff} options={options} lineAnnotations={annotations} renderAnnotation={(annotation) => form(annotation.metadata)} />
    </div> : <p className="fine-print pr-diff-note">No text patch from GitHub (binary, oversized or unavailable).</p>)}
  </section>;
}
