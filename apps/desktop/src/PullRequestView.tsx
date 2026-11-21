import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { githubItemIdentity, githubSourceOwner, type GithubAction, type GithubBrowse, type GithubItem, type GithubResponse, type GithubScope,
  type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { GitHubStateIcon, githubStateMark, type GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { AnchoredMenu } from "./AnchoredMenu.tsx";
import { Icon } from "./Icon.tsx";
import { PrCiWatch } from "./PrCiWatch.tsx";
import { PrTour } from "./PrTour.tsx";
import { sessionGithubScope, sessionGithubWritable } from "./github-session.ts";
import { ReviewedWritePanel, useReviewedWrite } from "./reviewed-write.tsx";
const RichMessage = lazy(() => import("./RichMessage.tsx"));
const PrDiff = lazy(() => import("./PrDiff.tsx"));

type Browse = Extract<GithubResponse, { type: "github.browse" }>;
type Tab = "Description" | "Files" | "Reviews" | "Checks" | "Commits";
const TABS: readonly Tab[] = ["Description", "Files", "Reviews", "Checks", "Commits"];
const MAX_PAGES = 10;
const FAILED = new Set(["failure", "timed_out", "startup_failure", "action_required", "cancelled", "stale"]);
const open = (url: string | null | undefined) => { if (url) void window.moguri.openExternal(url); };
const failure = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** "GitHub" for github.com links, otherwise the upstream host, so the link names where it opens. */
export function upstreamLabel(url: string | null | undefined): string {
  try { const host = new URL(url ?? "").hostname.toLowerCase(); return host === "github.com" ? "GitHub" : host.includes("gitlab") ? "GitLab" : host; }
  catch { return "the upstream"; }
}
/** Compact age: "now", "4m", "8h", "3d", then the date. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const at = Date.parse(iso ?? ""); if (!Number.isFinite(at)) return "";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 30 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
/** "Today", "Yesterday" or a short date, by local calendar day. */
export function dayLabel(iso: string | null | undefined, now = Date.now()): string {
  const at = Date.parse(iso ?? ""); if (!Number.isFinite(at)) return "Unknown date";
  const start = (value: number) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date.getTime(); };
  const days = Math.round((start(now) - start(at)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = new Date(at);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
}
export function duration(startedAt: string | null | undefined, completedAt: string | null | undefined, now = Date.now()): string {
  const start = Date.parse(startedAt ?? ""), end = completedAt ? Date.parse(completedAt) : completedAt === null ? now : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export type CheckGroup = "failing" | "pending" | "skipped" | "passed" | "unknown";
/** Groups a check run like GitHub does. A completed check without a known conclusion is unknown, never successful. */
export function checkGroup(item: Pick<GithubItem, "state" | "conclusion">): CheckGroup {
  if (item.state !== "completed") return "pending";
  if (!item.conclusion) return "unknown";
  if (FAILED.has(item.conclusion)) return "failing";
  if (item.conclusion === "skipped" || item.conclusion === "neutral") return "skipped";
  return item.conclusion === "success" ? "passed" : "unknown";
}
const GROUPS: { id: CheckGroup; label: string; icon: string }[] = [
  { id: "failing", label: "Failing", icon: "CheckFailed" }, { id: "pending", label: "In progress", icon: "Progress" },
  { id: "unknown", label: "Unknown result", icon: "CheckPending" }, { id: "skipped", label: "Skipped", icon: "CheckSkipped" },
  { id: "passed", label: "Successful", icon: "CheckPassed" },
];
/** A GitHub label's own color (six hex digits from GitHub), shown only as a swatch next to its name. */
const labelColor = (color: string | null | undefined) => color && /^[0-9a-f]{6}$/i.test(color) ? { backgroundColor: `#${color}` } : undefined;
const initial = (name: string | null | undefined) => (name?.replace(/\[bot\]$/, "").trim()[0] ?? "?").toUpperCase();
function Avatar({ name }: { name: string | null | undefined }) { return <span className="pr-avatar" aria-hidden="true">{initial(name)}</span>; }

/** Reads every page up to a bound, checking that each page belongs to the selected account. */
async function readPages(read: (page: number) => Promise<Browse>, accountId: string): Promise<{ items: GithubItem[]; more: boolean }> {
  const items: GithubItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const value = await read(page);
    if (value.accountId !== accountId) throw new Error("A page belongs to a different GitHub account. Nothing was combined.");
    items.push(...value.items);
    if (!value.nextPage) return { items, more: false };
  }
  return { items, more: true };
}

/** Loads the session's linked PR through the project's exact account, then shows it. */
export function LinkedPullRequest({ sdk, session, snapshot, url, onDirty, openSettings, observed }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; url: string; onDirty: (dirty: boolean) => void; openSettings?: () => void;
  /** Receives each fresh read of this PR so surrounding views can show its live state. */
  observed?: (item: GithubItem) => void;
}) {
  const scope = sessionGithubScope(session);
  const [selection, setSelection] = useState<GithubSelection | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), key = JSON.stringify([sdk.profileId, scope, url]);
  const load = async () => {
    if (!scope) return;
    const token = ++generation.current; setLoading(true); setError("");
    try {
      const context = await sdk.github.project(scope), identity = githubItemIdentity(url);
      if (identity.kind !== "pull" || identity.repository.toLowerCase() !== context.repository.toLowerCase()) {
        throw new Error("This pull request belongs to another repository. It was not read with this project's account.");
      }
      const source = { kind: "pull" as const, repository: context.repository, account: context.account, accountId: context.accountId, number: identity.number };
      const value = await sdk.github.source(scope, source);
      if (value.accountId !== context.accountId) throw new Error("The GitHub account changed while reading this pull request. Reload it.");
      if (token === generation.current) { setSelection({ context, source, binding: value.binding, item: value.item, digest: value.digest }); observed?.(value.item); }
    } catch (error) { if (token === generation.current) setError(failure(error, "The pull request could not be read. Check this project's upstream and GitHub CLI sign-in.")); }
    finally { if (token === generation.current) setLoading(false); }
  };
  useEffect(() => { setSelection(null); void load(); return () => { generation.current++; }; }, [key]);
  if (!scope) return <p className="fine-print">Pull request views need a Local project. Remote host and Sandbox do not borrow this Mac's GitHub account.</p>;
  if (!selection) return <div className="pr-view-loading"><p className="fine-print path">{url}</p>{loading && <p className="fine-print" role="status">Reading the pull request...</p>}
    {error && <><Alert as="p" className="inline-error" role="alert">{error}</Alert><button type="button" onClick={() => void load()}>Try again</button></>}</div>;
  return <>{error && <Alert as="p" className="inline-error" role="alert">{error} The last successful read is shown.</Alert>}
    <PullRequestView sdk={sdk} session={session} snapshot={snapshot} scope={scope} selection={selection} reload={load} onDirty={onDirty} openSettings={openSettings} /></>;
}

/** One pull request: header with state control and Description, Files, Reviews, Checks and Commits tabs. */
export function PullRequestView({ sdk, session, snapshot, scope, selection, reload, onDirty, openSettings, footer }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; scope: GithubScope; selection: GithubSelection; reload: () => Promise<void>;
  onDirty?: (dirty: boolean) => void; openSettings?: () => void; footer?: ReactNode;
}) {
  const { item } = selection, { repository, account } = selection.source, number = item.number, head = item.headSha;
  const key = JSON.stringify([sdk.profileId, scope, selection.context.accountId, repository, number, head, githubSourceOwner(selection.binding)]);
  const writable = sessionGithubWritable(session, snapshot) && item.state === "open";
  const [tab, setTab] = useState<Tab>("Description"), [checks, setChecks] = useState<{ items: GithubItem[]; runs: Map<number, string>; more: boolean } | null>(null);
  const reviewed = useReviewedWrite(sdk, scope, reload), { pending, busy, error, notice, setError } = reviewed;
  const [stateMenu, setStateMenu] = useState(false);
  const stateButton = useRef<HTMLButtonElement>(null), current = useRef(key); current.current = key;
  const loadChecks = async () => {
    if (!head) { setError("This pull request has no verified head. No checks were guessed."); return; }
    const captured = key;
    try {
      const [runs, values] = await Promise.all([
        readPages((page) => sdk.github.runs(scope, repository, account, head, page, 100), selection.context.accountId),
        readPages((page) => sdk.github.checks(scope, repository, account, head, page, 100), selection.context.accountId),
      ]);
      if (current.current === captured) setChecks({ items: values.items, runs: new Map(runs.items.map((run) => [run.id, run.title])), more: values.more });
    } catch (error) { if (current.current === captured) { setChecks(null); setError(failure(error, "Checks could not be read. Missing CI is not successful CI.")); } }
  };
  useEffect(() => { setChecks(null); reviewed.cancel(); setError(""); void loadChecks(); }, [key]);
  const write = (label: string, action: GithubAction, after?: () => void) => reviewed.start(label, action, after);
  const mark = githubStateMark("pull", item), host = upstreamLabel(item.url);
  const failing = checks?.items.filter((check) => checkGroup(check) === "failing").length ?? 0;
  const badge: Partial<Record<Tab, ReactNode>> = {
    Files: item.changedFiles !== undefined ? <span className="pr-tab-count">{item.changedFiles}</span> : null,
    Commits: item.commits !== undefined ? <span className="pr-tab-count">{item.commits}</span> : null,
    Checks: checks && checks.items.length ? <span className="pr-tab-count" data-failing={failing > 0 || undefined}>
      {failing ? <><Icon name="CheckFailed" />{`${checks.items.length - failing}/${checks.items.length}`}</> : checks.items.length}</span> : null,
  };
  const spoken: Partial<Record<Tab, string>> = {
    Files: item.changedFiles !== undefined ? `${item.changedFiles} changed` : "", Commits: item.commits !== undefined ? `${item.commits}` : "",
    Checks: checks && checks.items.length ? failing ? `${failing} failing of ${checks.items.length}` : `${checks.items.length}` : "",
  };
  return <section className="pr-view" aria-label={`Pull request ${number}`} aria-busy={busy || undefined}>
    <header className="pr-view-header">
      <div className="pr-view-topline"><span className="pr-view-meta">{repository}{item.createdAt ? ` on ${new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}{item.author ? ` by ${item.author}` : ""}</span>
        {item.state === "open" ? <div className="pr-state-control">
          <button ref={stateButton} type="button" className="pr-state-button" aria-haspopup="dialog" aria-expanded={stateMenu} disabled={busy}
            aria-label={`${item.draft ? "Draft" : "Ready for review"}. Change pull request state`} onClick={() => setStateMenu((value) => !value)}>
            <Icon name={item.draft ? "PRDraft" : "PR"} /><span>{item.draft ? "Draft" : "Ready"}</span><Icon name="Down" /></button>
          {stateMenu && <AnchoredMenu label="Pull request state" trigger={stateButton} close={() => setStateMenu(false)} className="pr-state-menu">
            <button type="button" role="menuitem" disabled={!writable || busy} title={writable ? undefined : "This session can't change GitHub. Use an agent session that is not read-only."}
              onClick={() => { setStateMenu(false); void write(item.draft ? "Mark ready for review" : "Convert to draft", { kind: "github.pr.draft", repository, account, number: number!, draft: !item.draft }); }}>
              <Icon name={item.draft ? "PR" : "PRDraft"} /><span><strong>{item.draft ? "Ready for review" : "Convert to draft"}</strong>
                <small>{item.draft ? "Reviewers are notified and the PR can be merged." : "Reviewers are not asked to review until it is ready again."}</small></span></button>
          </AnchoredMenu>}
        </div> : <span className="pr-state-badge" data-github-state={mark.tone}><GitHubStateIcon kind="pull" item={item} />{mark.label.replace(" pull request", "")}</span>}
      </div>
      <h3 className="pr-view-title">{item.title} <button type="button" className="pr-view-number" disabled={!item.url} title={`Open on ${host}`}
        aria-label={`Open pull request #${number} on ${host}`} onClick={() => open(item.url)}>#{number}</button></h3>
      <p className="pr-view-branches"><span className="pr-state-pill" data-github-state={mark.tone}><GitHubStateIcon kind="pull" item={item} />{item.draft ? "Draft" : item.state === "open" ? "Open" : mark.label.split(" ")[0]}</span>
        <code title={item.headRepository && item.headRepository.toLowerCase() !== repository.toLowerCase() ? item.headRepository : undefined}>{item.head}</code><span aria-hidden="true">→</span><span className="sr-only">into</span><code>{item.base}</code>
        <button type="button" className="icon-button" aria-label="Refresh pull request" title="Refresh pull request" disabled={busy} onClick={() => void reload().catch(() => undefined)}><Icon name="Refresh" /></button></p>
    </header>
    <div className="pr-pane-tabs pr-view-tabs" role="tablist" aria-label="Pull request tabs" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = TABS.indexOf(tab), next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
      setTab(TABS[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} aria-label={spoken[name] ? `${name}, ${spoken[name]}` : name}
      onClick={() => setTab(name)}>{name}{badge[name]}</button>)}</div>
    <ReviewedWritePanel write={reviewed} target={`${repository}#${number} / ${selection.context.account}`} />
    {notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div role="tabpanel" aria-label={tab} className="pr-view-panel">
      {tab === "Description" && <DescriptionTab key={key} sdk={sdk} scope={scope} selection={selection} writable={writable && !busy && !pending} write={write} onDirty={onDirty} />}
      {tab === "Files" && <FilesTab key={key} sdk={sdk} session={session} snapshot={snapshot} scope={scope} selection={selection} writable={writable} openSettings={openSettings} />}
      {tab === "Reviews" && <ReviewsTab key={key} sdk={sdk} scope={scope} selection={selection} />}
      {tab === "Checks" && <ChecksTab checks={checks} reload={() => { setChecks(null); setError(""); void loadChecks(); }}
        watch={head ? <PrCiWatch sdk={sdk} scope={scope} snapshot={snapshot} selection={selection} reloadSource={reload} /> : null} />}
      {tab === "Commits" && <CommitsTab key={key} sdk={sdk} scope={scope} selection={selection} />}
    </div>
    {footer}
  </section>;
}

function DescriptionTab({ sdk, scope, selection, writable, write, onDirty }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; writable: boolean; write: (label: string, action: GithubAction) => Promise<void>; onDirty?: (dirty: boolean) => void;
}) {
  const { item } = selection, { repository, account } = selection.source, number = item.number!;
  const [editing, setEditing] = useState(false), [submitted, setSubmitted] = useState(false), [title, setTitle] = useState(item.title), [body, setBody] = useState(item.body);
  const dirty = editing && (title !== item.title || body !== item.body);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { if (!editing) { setTitle(item.title); setBody(item.body); } }, [item.title, item.body, editing]);
  useEffect(() => { if (submitted && item.title === title && item.body === body) { setEditing(false); setSubmitted(false); } }, [item.title, item.body]);
  const people = (kind: "reviewers" | "assignees", login: string, selected: boolean) => {
    if (kind === "reviewers") void write(selected ? `Remove review request for ${login}` : `Request review from ${login}`,
      { kind: "github.pr.reviewers", repository, account, number, operation: selected ? "remove" : "request", reviewers: [login] });
    else {
      const next = selected ? (item.assignees ?? []).filter((value) => value !== login) : [...(item.assignees ?? []), login];
      void write(selected ? `Unassign ${login}` : `Assign ${login}`, { kind: "github.issue.assignees", repository, account, number, assignees: next });
    }
  };
  const label = (name: string, selected: boolean) => {
    const current = (item.labels ?? []).map((value) => value.name);
    void write(selected ? `Remove label ${name}` : `Add label ${name}`, { kind: "github.issue.labels", repository, account, number,
      labels: selected ? current.filter((value) => value !== name) : [...current, name] });
  };
  return <div className="pr-description">
    <div className="pr-meta-chips" aria-label="Reviewers, assignees and labels" role="group">
      <MetaPicker sdk={sdk} scope={scope} selection={selection} kind="reviewers" label="Reviewers" icon="User" values={item.reviewers ?? []} disabled={!writable}
        toggle={(login, selected) => people("reviewers", login, selected)} />
      <MetaPicker sdk={sdk} scope={scope} selection={selection} kind="assignees" label="Assignees" icon="User" values={item.assignees ?? []} disabled={!writable}
        toggle={(login, selected) => people("assignees", login, selected)} />
      <MetaPicker sdk={sdk} scope={scope} selection={selection} kind="labels" label="Labels" icon="Tag" values={(item.labels ?? []).map((value) => value.name)} disabled={!writable}
        toggle={label} />
    </div>
    {editing ? <form className="pr-description-editor" aria-label="Edit pull request" onSubmit={(event) => {
      event.preventDefault();
      void write("Update title and description", { kind: "github.pr.update", repository, account, number,
        ...(title !== item.title ? { title } : {}), ...(body !== item.body ? { body } : {}) }).then(() => setSubmitted(true));
    }}>
      <label className="setting-field">Title<input required maxLength={256} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="setting-field">Description<textarea aria-label="Description" maxLength={64 * 1024} rows={14} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="button-row"><button className="primary" type="submit" disabled={!writable || !dirty || !title.trim()}>Review changes</button>
        <button type="button" onClick={() => { setEditing(false); setSubmitted(false); setTitle(item.title); setBody(item.body); }}>Cancel</button></div>
    </form> : <div className="pr-description-body">
      <button type="button" className="icon-button pr-edit-button" aria-label="Edit title and description" title={writable ? "Edit title and description" : "This session can't change GitHub"}
        disabled={!writable} onClick={() => setEditing(true)}><Icon name="Edit" /></button>
      <div className="github-item-body"><Suspense fallback={<p>{item.body}</p>}><RichMessage text={item.body || "No description provided."} openLink={open} /></Suspense></div>
    </div>}
  </div>;
}

function MetaPicker({ sdk, scope, selection, kind, label, icon, values, disabled, toggle }: {
  sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection; kind: "reviewers" | "assignees" | "labels"; label: string; icon: string;
  values: string[]; disabled: boolean; toggle: (value: string, selected: boolean) => void;
}) {
  const [menu, setMenu] = useState(false), [options, setOptions] = useState<GithubItem[] | null>(null), [query, setQuery] = useState(""), [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu || options) return;
    const resource: GithubBrowse["resource"] = kind === "labels" ? "labels" : "assignees";
    void readPages((page) => sdk.github.browse(scope, { resource, repository: selection.source.repository, account: selection.source.account, page, perPage: 100 } as GithubBrowse),
      selection.context.accountId).then((value) => setOptions(value.items)).catch((error: unknown) => setError(failure(error, `${label} could not be read.`)));
  }, [menu]);
  const names = [...new Set([...values, ...(options ?? []).map((option) => option.title)])].filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const color = (name: string) => options?.find((option) => option.title === name)?.state ?? selection.item.labels?.find((value) => value.name === name)?.color ?? null;
  return <span className="pr-meta-chip-wrap">
    <button ref={trigger} type="button" className="pr-meta-chip" aria-haspopup="dialog" aria-expanded={menu} disabled={disabled && !values.length}
      aria-label={`${label}: ${values.length ? values.join(", ") : "none"}`} onClick={() => setMenu((value) => !value)}>
      <Icon name={icon} />{values.length ? <><span className="pr-meta-chip-label">{label}</span><span>{values.join(", ")}</span></> : <span>{label}</span>}</button>
    {menu && <AnchoredMenu label={label} trigger={trigger} close={() => setMenu(false)} className="pr-meta-menu">
      <input type="search" aria-label={`Filter ${label.toLowerCase()}`} placeholder={`Filter ${label.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} />
      {error && <p className="inline-error">{error}</p>}
      {!options && !error && <p className="fine-print" role="status">Loading...</p>}
      <div role="group" aria-label={label}>{names.map((name) => {
        const selected = values.includes(name);
        return <button key={name} type="button" role="menuitemcheckbox" aria-checked={selected} disabled={disabled} onClick={() => { setMenu(false); toggle(name, selected); }}>
          <span className="pr-meta-check" aria-hidden="true">{selected ? <Icon name="Check" /> : null}</span>
          {kind === "labels" ? <span className="pr-label-dot" aria-hidden="true" style={labelColor(color(name))} /> : <Avatar name={name} />}<span>{name}</span></button>;
      })}</div>
      {options && !names.length && <p className="fine-print">No matches.</p>}
      {disabled && <p className="fine-print">Read-only here. Use an agent session that is not read-only to change {label.toLowerCase()}.</p>}
    </AnchoredMenu>}
  </span>;
}

function FilesTab({ sdk, session, snapshot, scope, selection, writable, openSettings }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; scope: GithubScope; selection: GithubSelection; writable: boolean; openSettings?: () => void;
}) {
  const [view, setView] = useState<"diff" | "tour">("diff"), [files, setFiles] = useState<{ items: GithubItem[]; more: boolean } | null>(null), [error, setError] = useState("");
  const { repository, account } = selection.source, number = selection.item.number!, head = selection.item.headSha;
  useEffect(() => {
    if (view !== "diff" || files) return;
    if (!head) { setError("This pull request has no verified head. No diff was guessed."); return; }
    let live = true;
    void readPages((page) => sdk.github.files(scope, repository, account, number, head, page, 100), selection.context.accountId)
      .then((value) => { if (live) setFiles(value); }).catch((error: unknown) => { if (live) setError(failure(error, "Changed files could not be read.")); });
    return () => { live = false; };
  }, [view]);
  return <div className="pr-files">
    <div className="pr-files-toolbar"><div className="pr-segmented" role="group" aria-label="Files view">
      <button type="button" aria-pressed={view === "diff"} onClick={() => setView("diff")}>Diff</button>
      <button type="button" aria-pressed={view === "tour"} onClick={() => setView("tour")}>Tour</button></div></div>
    {view === "tour" ? <PrTour sdk={sdk} session={session} snapshot={snapshot} scope={scope} selection={selection} openSettings={openSettings} /> : <>
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      {!files && !error && <p className="fine-print" role="status">Reading changed files at this head...</p>}
      {files && <Suspense fallback={<p className="fine-print" role="status">Preparing the diff...</p>}>
        <PrDiff sdk={sdk} scope={scope} selection={selection} files={files.items} more={files.more} writable={writable} /></Suspense>}
    </>}
  </div>;
}

type ReviewFilter = "all" | "comments" | "reviews" | "unresolved" | "events";
const REVIEW_FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "comments", label: "Comments" }, { id: "reviews", label: "Reviews" }, { id: "unresolved", label: "Unresolved" }, { id: "events", label: "Events" },
];
const EVENT_TEXT: Record<string, string> = {
  labeled: "added the label", unlabeled: "removed the label", assigned: "assigned", unassigned: "unassigned", review_requested: "requested a review from",
  review_request_removed: "removed the review request for", ready_for_review: "marked this pull request as ready for review", convert_to_draft: "converted this pull request to draft",
  closed: "closed this pull request", reopened: "reopened this pull request", merged: "merged this pull request", head_ref_force_pushed: "force-pushed the branch",
  head_ref_deleted: "deleted the branch", head_ref_restored: "restored the branch", base_ref_changed: "changed the base branch to", referenced: "referenced this in a commit",
  cross_referenced: "mentioned this in", mentioned: "was mentioned", subscribed: "subscribed", auto_merge_enabled: "enabled auto-merge", auto_merge_disabled: "disabled auto-merge",
};
const REVIEW_TEXT: Record<string, string> = { APPROVED: "approved these changes", CHANGES_REQUESTED: "requested changes", COMMENTED: "reviewed", DISMISSED: "had a review dismissed" };

function ReviewsTab({ sdk, scope, selection }: { sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection }) {
  const [filter, setFilter] = useState<ReviewFilter>("all"), [newest, setNewest] = useState(false), [menu, setMenu] = useState(false);
  const [timeline, setTimeline] = useState<{ items: GithubItem[]; more: boolean } | null>(null), [threads, setThreads] = useState<GithubItem[] | null>(null), [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null), { repository, account } = selection.source, number = selection.item.number!;
  useEffect(() => {
    let live = true;
    const read = filter === "unresolved" ? threads ? null : readPages((page) => sdk.github.threads(scope, repository, account, number, page, 100), selection.context.accountId)
      .then((value) => { if (live) setThreads(value.items); }) : timeline ? null :
      readPages((page) => sdk.github.browse(scope, { resource: "timeline", repository, account, number, page, perPage: 100 }), selection.context.accountId)
        .then((value) => { if (live) setTimeline(value); });
    void read?.catch((error: unknown) => { if (live) setError(failure(error, "Review activity could not be read.")); });
    return () => { live = false; };
  }, [filter]);
  const source = filter === "unresolved" ? (threads ?? []).filter((thread) => thread.state === "unresolved") : (timeline?.items ?? []).filter((entry) =>
    filter === "all" || filter === "comments" && entry.kind === "comment" || filter === "reviews" && entry.kind === "review" || filter === "events" && (entry.kind === "event" || entry.kind === "commit"));
  const ordered = source.map((entry, index) => ({ entry, index })).sort((a, b) => {
    const at = Date.parse(a.entry.updatedAt ?? ""), bt = Date.parse(b.entry.updatedAt ?? "");
    const order = Number.isFinite(at) && Number.isFinite(bt) ? at - bt : a.index - b.index;
    return newest ? -order : order;
  }).map(({ entry }) => entry);
  const loading = filter === "unresolved" ? !threads : !timeline;
  const pick = (next: () => void) => { setMenu(false); next(); };
  return <div className="pr-reviews">
    <div className="pr-reviews-toolbar"><span className="pr-reviews-summary">{REVIEW_FILTERS.find((value) => value.id === filter)!.label} activity, {newest ? "newest" : "oldest"} first</span>
      <button ref={trigger} type="button" className="icon-button" aria-label="Filter and sort activity" title="Filter and sort" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu((value) => !value)}><Icon name="Filter" /></button>
      {menu && <AnchoredMenu label="Filter and sort activity" trigger={trigger} close={() => setMenu(false)} className="pr-filter-menu">
        <p className="pr-menu-heading">Filter</p>
        <div role="group" aria-label="Filter">{REVIEW_FILTERS.map((value) => <button key={value.id} type="button" role="menuitemradio" aria-checked={filter === value.id}
          onClick={() => pick(() => setFilter(value.id))}><span className="pr-meta-check" aria-hidden="true">{filter === value.id && <Icon name="Check" />}</span>{value.label}</button>)}</div>
        <p className="pr-menu-heading">Sort</p>
        <div role="group" aria-label="Sort">{([false, true] as const).map((value) => <button key={String(value)} type="button" role="menuitemradio" aria-checked={newest === value}
          onClick={() => pick(() => setNewest(value))}><span className="pr-meta-check" aria-hidden="true">{newest === value && <Icon name="Check" />}</span>{value ? "Newest first" : "Oldest first"}</button>)}</div>
      </AnchoredMenu>}</div>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {loading && !error && <p className="fine-print" role="status">Reading review activity...</p>}
    {!loading && !ordered.length && <p className="fine-print">{filter === "unresolved" ? "No unresolved review threads." : "No activity of this kind yet."}</p>}
    <ol className="pr-timeline" aria-label="Pull request activity">{ordered.map((entry, index) => <TimelineEntry key={`${entry.kind}:${entry.id}:${entry.headSha ?? ""}:${index}`} entry={entry} />)}</ol>
    {filter !== "unresolved" && timeline?.more && <p className="fine-print">Showing the first {timeline.items.length} entries. Open the pull request on {upstreamLabel(selection.item.url)} for older activity.</p>}
  </div>;
}

function TimelineEntry({ entry }: { entry: GithubItem }) {
  const when = relativeTime(entry.updatedAt), time = when && <time dateTime={entry.updatedAt ?? undefined} title={entry.updatedAt ?? undefined}>{when === "now" ? "just now" : /^\d/.test(when) ? `${when} ago` : when}</time>;
  if (entry.kind === "commit") return <li className="pr-timeline-entry" data-kind="commit"><Avatar name={entry.author} /><p><span className="pr-muted">{entry.title}</span>
    {entry.headSha && <button type="button" className="pr-sha" disabled={!entry.url} onClick={() => open(entry.url)} aria-label={`Open commit ${entry.headSha.slice(0, 7)}`}>{entry.headSha.slice(0, 7)}</button>}{time}</p></li>;
  if (entry.kind === "event") return <li className="pr-timeline-entry" data-kind="event"><span className="pr-event-icon" aria-hidden="true"><Icon name={entry.state === "renamed" ? "Edit" : entry.state.includes("label") ? "Tag" : "Circle"} /></span>
    <p><strong>{entry.author ?? "Someone"}</strong> {entry.state === "renamed" ? <>changed the title from <del>{entry.body}</del> to <strong>{entry.title}</strong></> :
      <>{EVENT_TEXT[entry.state] ?? entry.state.replaceAll("_", " ")}{entry.title && entry.state !== "renamed" ? <> <strong>{entry.title}</strong></> : null}</>}{time}</p></li>;
  const heading = entry.kind === "review" ? REVIEW_TEXT[entry.state] ?? `reviewed (${entry.state.toLowerCase()})` : entry.path ? <>commented on <code>{entry.path}{entry.line ? `:${entry.line}` : ""}</code></> :
    entry.state === "unresolved" || entry.state === "resolved" ? <>{entry.state} thread{entry.path ? <> on <code>{entry.path}</code></> : null}</> : "commented";
  return <li className="pr-timeline-entry" data-kind={entry.kind}><Avatar name={entry.author} /><div className="pr-timeline-card">
    <p><strong>{entry.author ?? "Someone"}</strong> {heading}{time}{entry.url && <button type="button" className="icon-button" aria-label={`Open on ${upstreamLabel(entry.url)}`} title={`Open on ${upstreamLabel(entry.url)}`} onClick={() => open(entry.url)}><Icon name="External" /></button>}</p>
    {entry.body && <div className="github-item-body"><Suspense fallback={<p>{entry.body}</p>}><RichMessage text={entry.body} openLink={open} /></Suspense></div>}
  </div></li>;
}

function ChecksTab({ checks, reload, watch }: { checks: { items: GithubItem[]; runs: Map<number, string>; more: boolean } | null; reload: () => void; watch: ReactNode }) {
  const [folded, setFolded] = useState<CheckGroup[]>([]);
  if (!checks) return <p className="fine-print" role="status">Reading checks on this head...</p>;
  const grouped = GROUPS.map((group) => ({ ...group, items: checks.items.filter((check) => checkGroup(check) === group.id) })).filter((group) => group.items.length);
  const failing = grouped.find((group) => group.id === "failing")?.items.length ?? 0, pending = grouped.find((group) => group.id === "pending")?.items.length ?? 0;
  const summary = !checks.items.length ? { icon: "CheckPending", tone: "unknown", text: "No checks reported on this head. Missing CI is not successful CI." } :
    failing ? { icon: "CheckFailed", tone: "failing", text: "Some checks were not successful" } : pending ? { icon: "Progress", tone: "pending", text: "Some checks haven't completed yet" } :
      grouped.some((group) => group.id === "unknown") ? { icon: "CheckPending", tone: "unknown", text: "Some checks finished without a known result" } : { icon: "CheckPassed", tone: "passed", text: "All checks have passed" };
  return <div className="pr-checks">
    <p className="pr-checks-summary" data-check-group={summary.tone}><Icon name={summary.icon} /><span>{summary.text}</span>
      <button type="button" className="icon-button" aria-label="Refresh checks" title="Refresh checks" onClick={reload}><Icon name="Refresh" /></button></p>
    {grouped.map((group) => {
      const closed = folded.includes(group.id);
      return <section key={group.id} className="pr-check-group" aria-label={`${group.label} checks`}>
        <h4><button type="button" aria-expanded={!closed} onClick={() => setFolded((values) => closed ? values.filter((value) => value !== group.id) : [...values, group.id])}>
          <Icon name={closed ? "ChevronRight" : "Down"} />{group.label}<span className="pr-tab-count">{group.items.length}</span></button></h4>
        {!closed && <ul>{group.items.map((check) => {
          const workflow = check.runId ? checks.runs.get(check.runId) : undefined, name = workflow ? `${workflow} / ${check.title}` : check.title;
          const actions = check.app === "github-actions" || Boolean(check.runId), took = duration(check.startedAt, check.state === "completed" ? check.updatedAt ?? undefined : null);
          return <li key={`${check.id}:${check.title}`}><button type="button" className="pr-check" data-check-group={group.id} disabled={!check.url}
            aria-label={`${name}, ${group.label.toLowerCase()}. ${actions ? "Open the workflow run in GitHub Actions" : "Open check details"}`} onClick={() => open(check.url)}>
            <span className="pr-check-icon" aria-hidden="true"><Icon name={group.icon} /></span><span className="pr-check-name">{name}</span>{took && <span className="pr-muted">{took}</span>}
            <Icon name="External" /></button></li>;
        })}</ul>}
      </section>;
    })}
    {checks.more && <p className="fine-print">Showing the first {checks.items.length} checks.</p>}
    {watch && <details className="pr-ci-watch-details"><summary>Watch CI on this head</summary>{watch}</details>}
  </div>;
}

function CommitsTab({ sdk, scope, selection }: { sdk: MoguriSdk; scope: GithubScope; selection: GithubSelection }) {
  const [commits, setCommits] = useState<{ items: GithubItem[]; more: boolean } | null>(null), [error, setError] = useState(""), [folded, setFolded] = useState<string[]>([]);
  const { repository, account } = selection.source, number = selection.item.number!;
  useEffect(() => {
    let live = true;
    void readPages((page) => sdk.github.browse(scope, { resource: "commits", repository, account, number, page, perPage: 100 }), selection.context.accountId)
      .then((value) => { if (live) setCommits(value); }).catch((error: unknown) => { if (live) setError(failure(error, "Commits could not be read.")); });
    return () => { live = false; };
  }, []);
  if (error) return <Alert as="p" className="inline-error" role="alert">{error}</Alert>;
  if (!commits) return <p className="fine-print" role="status">Reading commits...</p>;
  if (!commits.items.length) return <p className="fine-print">No commits reported.</p>;
  const newest = [...commits.items].reverse(), groups: { day: string; items: GithubItem[] }[] = [];
  for (const commit of newest) {
    const day = dayLabel(commit.updatedAt), last = groups.at(-1);
    if (last?.day === day) last.items.push(commit); else groups.push({ day, items: [commit] });
  }
  return <div className="pr-commits">{groups.map((group) => {
    const closed = folded.includes(group.day);
    return <section key={group.day} className="pr-check-group" aria-label={`Commits ${group.day}`}>
      <h4><button type="button" aria-expanded={!closed} onClick={() => setFolded((values) => closed ? values.filter((value) => value !== group.day) : [...values, group.day])}>
        <Icon name={closed ? "ChevronRight" : "Down"} />{group.day}<span className="pr-tab-count">{group.items.length}</span></button></h4>
      {!closed && <ul>{group.items.map((commit) => <li key={commit.headSha ?? commit.id}><button type="button" className="pr-commit" disabled={!commit.url}
        aria-label={`${commit.title}, ${commit.headSha?.slice(0, 7) ?? "unknown commit"}. Open on ${upstreamLabel(commit.url)}`} onClick={() => open(commit.url)}>
        <Avatar name={commit.author} /><span className="pr-commit-title">{commit.title}</span><code className="pr-muted">{commit.headSha?.slice(0, 7)}</code>
        <span className="pr-muted">{relativeTime(commit.updatedAt)}</span></button></li>)}</ul>}
    </section>;
  })}{commits.more && <p className="fine-print">Showing the first {commits.items.length} commits.</p>}</div>;
}
