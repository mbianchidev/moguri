import { useEffect, useRef, useState } from "react";
import { githubSourceOwner, type GithubItem, type GithubResponse, type GithubScope, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import type { GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { PrCiWatch } from "./PrCiWatch.tsx";

type Read = Extract<GithubResponse, { type: "github.browse" }>;
type Tab = "Files" | "Actions" | "Reviews";
export function PullRequestPane({ sdk, scope, session, snapshot, selection, reloadSource }: {
  sdk: MoguriSdk; scope: GithubScope; session: Session; snapshot: Snapshot; selection: GithubSelection; reloadSource: () => Promise<void>;
}) {
  const head = selection.item.headSha, number = selection.item.number, { repository, account } = selection.source;
  const key = JSON.stringify([sdk.profileId, scope, selection.context.accountId, repository, number, head, githubSourceOwner(selection.binding)]);
  const current = useRef(key); current.current = key;
  const generation = useRef(0), pending = useRef(false);
  const [tab, setTab] = useState<Tab>("Files"), [reviewResource, setReviewResource] = useState<"review-comments" | "reviews" | "threads">("review-comments");
  const [runId, setRunId] = useState<number | null>(null), [page, setPage] = useState<Read | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [logs, setLogs] = useState("");
  const verify = async () => {
    const fresh = await sdk.github.source(scope, selection.source);
    if (fresh.accountId !== selection.context.accountId || fresh.item.headSha !== head ||
      JSON.stringify(githubSourceOwner(fresh.binding)) !== JSON.stringify(githubSourceOwner(selection.binding))) {
      throw new Error("The exact PR head, account or root changed. This pane is stale; reload the selected PR. No alternate SHA/account was adopted.");
    }
  };
  const load = async (next = 1) => {
    if (!head || !number) { setError("This selected PR has no verified head/number. No SHA was guessed."); return; }
    const token = ++generation.current, captured = key; setBusy(true); setError(""); setLogs("");
    try {
      const value = tab === "Files" ? await sdk.github.files(scope, repository, account, number, head, next) :
        tab === "Reviews" ? await sdk.github.browse(scope, { resource: reviewResource, repository, account, number, page: next }) :
          runId ? await sdk.github.jobs(scope, repository, account, runId, head, next) : await sdk.github.runs(scope, repository, account, head, next);
      await verify();
      if (value.accountId !== selection.context.accountId) throw new Error("The data page belongs to a different account. Nothing was combined.");
      if (token === generation.current && current.current === captured) setPage(value);
    } catch (error) { if (token === generation.current && current.current === captured) { setPage(null); setError(error instanceof Error ? error.message : "PR observations unavailable. No successful or current state was inferred."); } }
    finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => { setPage(null); void load(); return () => { generation.current++; }; }, [key, tab, reviewResource, runId]);
  const operation = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "The original PR operation was not acknowledged. Inspect it before retrying."); }
    finally { pending.current = false; setBusy(false); }
  };
  const render = (item: GithubItem, index: number) => <article className="pr-observation" key={`${item.kind}:${item.id}:${index}`}>
    <header><strong>{item.path ?? (item.title || item.nodeId || item.kind)}</strong><span>{item.state}{item.conclusion ? ` / ${item.conclusion}` : ""}</span></header>
    {item.author && <p className="fine-print">{item.author}{item.line ? ` / line ${item.line}` : ""}{item.kind === "comment" && item.headSha && item.headSha !== head ? ` / original review commit ${item.headSha}, not the current head` : ""}</p>}
    {item.kind === "file" ? <><p className="fine-print">+{item.additions ?? "unknown"} / -{item.deletions ?? "unknown"}</p>
      {item.patch === null || item.patch === undefined ? <p className="fine-print">GitHub did not provide a text patch (binary, oversized or unavailable). No diff was reconstructed.</p> : <pre className="unified-diff">{item.patch}</pre>}</> : item.body && <pre className="pr-comment-body">{item.body}</pre>}
    {item.steps && <ol className="pr-job-steps">{item.steps.map((step, index) => <li key={index}>{step.name}: {step.status}{step.conclusion ? ` / ${step.conclusion}` : ""}</li>)}</ol>}
    {item.kind === "run" && head && <div className="button-row"><button type="button" disabled={busy} onClick={() => setRunId(item.id)}>Show jobs and steps</button>
      <button type="button" disabled={busy} onClick={() => void operation(async () => {
        const captured = key; const value = await sdk.github.logs(scope, repository, account, item.id); await verify();
        if (current.current === captured) setLogs(value.items[0]?.body ?? "This run returned no logs.");
      })}>Read run logs</button></div>}
  </article>;
  return <section className="pull-request-pane" aria-label="Pull request files, Actions and reviews">
    <p className="fine-print path">Session {session.id}. Exact account: {selection.context.accountId}. {repository}#{number ?? "unverified"} / head {head ?? "unverified"}.</p>
    <p className="fine-print">{selection.item.readyToMerge === true ? "GitHub reports this selected snapshot ready to merge. This is not merge authorization." :
      selection.item.readyToMerge === false ? `GitHub merge state: ${selection.item.mergeState ?? "blocked/not ready"}.` : "Merge readiness is not reported. Open/non-draft does not mean ready."}</p>
    <div className="pr-pane-tabs" role="tablist" aria-label="PR detail tabs" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = ["Files", "Actions", "Reviews"] as const, index = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
      setTab(tabs[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{(["Files", "Actions", "Reviews"] as const).map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
      tabIndex={tab === name ? 0 : -1} onClick={() => { setTab(name); setRunId(null); }}>{name}</button>)}</div>
    <div role="tabpanel" aria-label={`${tab} at selected PR head`}>
      <header className="panel-toolbar"><strong>{tab === "Actions" && runId ? `Run ${runId} jobs` : tab}</strong>
        <button type="button" disabled={busy} onClick={() => void load()}>Refresh selected head</button></header>
      {tab === "Reviews" && <label className="setting-field">Review view<select aria-label="PR review view" disabled={busy} value={reviewResource}
        onChange={(event) => setReviewResource(event.target.value === "reviews" ? "reviews" : event.target.value === "threads" ? "threads" : "review-comments")}>
        <option value="review-comments">Inline review comments</option><option value="reviews">Review summaries</option><option value="threads">Resolved/unresolved threads</option>
      </select></label>}
      {tab === "Actions" && runId && <button type="button" className="quiet" onClick={() => setRunId(null)}>Back to exact-head runs</button>}
      {busy && <p role="status">Reading the exact selected PR...</p>}
      {!busy && page && !page.items.length && <p className="fine-print">No {tab === "Actions" ? "Actions runs/jobs" : tab === "Reviews" ? "review observations" : "file patches"} reported in this page. Missing CI is not successful CI.</p>}
      {page?.items.map(render)}
      {page?.nextPage && <button type="button" disabled={busy} onClick={() => void load(page.nextPage!)}>Next observation page</button>}
      {logs && <pre className="pr-run-logs">{logs}</pre>}
      {tab === "Actions" && head && <PrCiWatch sdk={sdk} scope={scope} snapshot={snapshot} selection={selection} reloadSource={reloadSource} />}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <p className="fine-print">Read-only observations through this profile's exact GitHub CLI account. Review state and CI are not permissions or a merge decision. No alternate repository/fork CI is fetched automatically.</p>
    </div>
  </section>;
}
