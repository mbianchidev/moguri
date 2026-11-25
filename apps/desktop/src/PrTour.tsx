import { Fragment, useEffect, useId, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import {
  agentHarnessName, agentHarnessOf, effectivePrTourPrompt, envLabel, prTourPromptSource, prTourSnippet, prTourStatus, prTourWorkflowPrompt,
  type GithubScope, type MoguriSdk, type PrTour as Tour, type PrTourLevel, type PrTourSnippet, type Session, type Snapshot,
} from "@moguri-dev/sdk";
import type { GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";

const LEVELS: Record<PrTourLevel, { label: string; filled: number }> = { low: { label: "Low", filled: 1 }, medium: { label: "Medium", filled: 3 }, high: { label: "High", filled: 5 } };
const METERS = [["risk", "Risk"], ["impact", "Impact"], ["attention", "Attention"]] as const;
const pad = (value: number) => String(value).padStart(2, "0");
const short = (sha: string) => sha.slice(0, 7);
const range = (snippet: PrTourSnippet) => snippet.startLine === undefined ? "" :
  snippet.endLine === undefined || snippet.endLine === snippet.startLine ? ` line ${snippet.startLine}` : ` lines ${snippet.startLine}-${snippet.endLine}`;
const snippetId = (step: number, index: number, snippet: PrTourSnippet) => `${step}:${index}:${snippet.path}:${snippet.startLine ?? ""}-${snippet.endLine ?? ""}`;
function ago(at: string, now: number): string {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "at an unknown time";
  return ms < 60_000 ? "just now" : ms < 3_600_000 ? `${Math.floor(ms / 60_000)} min ago` : ms < 86_400_000 ? `${Math.floor(ms / 3_600_000)} h ago` :
    `on ${new Date(at).toLocaleDateString()}`;
}
/** Tour prose may mark file names and identifiers with backticks; nothing else is interpreted. */
function inline(text: string): ReactNode {
  return text.split(/(`[^`\n]+`)/).map((part, index) => part.length > 2 && part.startsWith("`") && part.endsWith("`") ?
    <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>);
}
/** Why this chat can't run a tour turn, or "" when it can. */
function unavailable(session: Session, item: GithubSelection["item"]): string {
  if (!item.url || !item.number || !item.headSha) return "This pull request has no verified URL, number or head, so no tour can be requested.";
  if (session.status === "archived") return "This chat is archived. Restore it to generate a tour.";
  if (session.kind !== "agent") return "Tours run in a regular agent chat, not a side chat, subagent or settings chat.";
  if (!session.controls.modelId) return "Choose a model for this chat first. The tour runs with the chat's own model.";
  const harness = agentHarnessOf(session.controls.modelId);
  if (harness) return `${agentHarnessName(harness)} runs its own tools, so Moguri can't keep a tour turn read-only. Choose a Moguri model for this chat.`;
  if (session.controls.env !== "Local") return `Tours read the PR with github_read, which runs only in Local chats. This chat runs in ${envLabel(session.controls.env)}.`;
  return "";
}

type Patches = { key: string; files: Map<string, string | null> };

/**
 * A guided tour of the selected PR, written by this chat's agent in a read-only `pr-tour` workflow turn (D64). The tour is read
 * from the chat transcript, never stored separately; its snippets come from GitHub's patch at the exact selected head.
 */
export function PrTour({ sdk, session, snapshot, scope, selection, openSettings }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; scope: GithubScope; selection: GithubSelection; openSettings?: () => void;
}): JSX.Element {
  const live = snapshot.sessions.find((value) => value.id === session.id) ?? session;
  const { url, number, headSha: head } = selection.item, { repository, account } = selection.source;
  const status = useMemo(() => url ? prTourStatus(live, url) : { pending: null, latest: null, tour: null },
    [url, live.messages, live.queue, live.turnId, live.status, live.pendingApproval, live.pendingQuestionId]);
  const ready = status.tour, tour = ready?.tour;
  const outdated = Boolean(tour && head && tour.headSha !== head);
  const configuration = live.projectId ? snapshot.projectConfigurations.find((value) => value.projectId === live.projectId)?.values ?? null : null;
  const source = prTourPromptSource(snapshot.settings.values, configuration);
  const blocked = unavailable(live, selection.item);
  const [queuing, setQueuing] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now()), requestedAfter = useRef<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { setError(""); setNotice(""); }, [live.id, url]);
  useEffect(() => { if (status.pending) setNotice(""); }, [status.pending?.kind]);

  const generate = async () => {
    if (blocked || status.pending || queuing || !url || !number || !head) return;
    setQueuing(true); setError(""); setNotice("");
    try {
      const prompt = prTourWorkflowPrompt({ url, number, headSha: head, changedFiles: selection.item.changedFiles, prompt: effectivePrTourPrompt(snapshot.settings.values, configuration) });
      requestedAfter.current = status.latest?.turnId ?? null;
      await sdk.workflows.start(live.id, "pr-tour", prompt);
      setNotice("Queued in this chat. The tour runs as a read-only turn with the chat's model, Env, budget and approvals.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The tour wasn't queued."); }
    finally { setQueuing(false); }
  };

  const key = JSON.stringify([sdk.profileId, scope, selection.context.accountId, repository, number, head, ready?.turnId ?? null]);
  const [patches, setPatches] = useState<Patches | null>(null), [patchError, setPatchError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setPatches(null); setPatchError("");
    const needed = new Set(tour?.steps.flatMap((step) => step.snippets.map((snippet) => snippet.path)) ?? []);
    if (!tour || outdated || !number || !head || !needed.size) return;
    void (async () => {
      const files = new Map<string, string | null>();
      try {
        for (let page: number | null = 1; page !== null;) {
          const value = await sdk.github.files(scope, repository, account, number, head, page, 100);
          if (token !== generation.current) return;
          if (value.accountId !== selection.context.accountId) throw new Error("The file page belongs to a different GitHub account. No code was shown.");
          for (const item of value.items) if (item.path) files.set(item.path, item.patch ?? null);
          page = [...needed].every((path) => files.has(path)) ? null : value.nextPage;
        }
        if (token === generation.current) setPatches({ key, files });
      } catch (failure) {
        if (token === generation.current) setPatchError(failure instanceof Error ? failure.message : "The code at this head couldn't be read. No other head was used.");
      }
    })();
    return () => { generation.current++; };
  }, [key, outdated]);

  const storageKey = tour ? `moguri.prTour.reviewed:${sdk.profileId}:${url}:${tour.headSha}` : null;
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!storageKey) { setReviewed(new Set()); return; }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      setReviewed(new Set(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []));
    } catch { setReviewed(new Set()); }
  }, [storageKey]);
  const ids = tour?.steps.flatMap((step, stepIndex) => step.snippets.map((snippet, index) => snippetId(stepIndex, index, snippet))) ?? [];
  const reviewedCount = ids.filter((id) => reviewed.has(id)).length;
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(reviewed);
    if (checked) next.add(id); else next.delete(id);
    setReviewed(next);
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify([...next].filter((value) => ids.includes(value)))); } catch { /* the checkmarks stay for this view */ }
  };

  const pending = status.pending;
  const statusText = pending?.kind === "queued" ? "Queued in this chat" :
    pending?.kind === "running" ? pending.waiting ? "Waiting for your answer or approval in the chat" :
      `Generating${pending.toolCalls ? ` (${pending.toolCalls} tool call${pending.toolCalls === 1 ? "" : "s"} so far)` : ""}` :
      ready ? outdated ? `Generated for ${short(ready.tour.headSha)}; the PR changed` : `Updated ${ago(ready.at, now)}` : "";
  const busy = Boolean(pending) || queuing;
  const disabledReason = blocked || (pending ? "A tour is already queued or generating in this chat." : "");
  const failed = status.latest?.kind === "failed" ? status.latest : null;
  return <section className="pr-tour" aria-label="Pull request tour" aria-busy={busy || undefined}>
    <header className="pr-tour-toolbar">
      <span className="pr-tour-status" role="status">{pending && <span className="activity-spinner" aria-hidden="true"><Icon name="Progress" /></span>}{statusText}</span>
      {tour && <span className="pr-tour-counter">{reviewedCount}/{ids.length} snippets</span>}
      {(tour || failed) && <button type="button" className="icon-button" aria-label="Regenerate tour" title={disabledReason || "Regenerate tour"}
        disabled={Boolean(disabledReason) || queuing} onClick={() => void generate()}><Icon name="Refresh" /></button>}
      {openSettings && <button type="button" className="icon-button" aria-label="Tour prompt settings" title="Tour prompt settings" onClick={openSettings}><Icon name="Settings" /></button>}
    </header>
    {notice && !status.pending && (status.latest?.turnId ?? null) === requestedAfter.current && <p className="fine-print" role="status">{notice}</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
    {failed && <Alert as="div" role="alert" dismissKey={failed.turnId}>
      <p>The last tour request didn't produce a usable tour. {failed.error}</p>
      {!tour && <button type="button" disabled={Boolean(disabledReason) || queuing} onClick={() => void generate()}>Regenerate</button>}
    </Alert>}
    {outdated && ready && head && <Alert as="div" tone="warning" dismissKey={`${ready.turnId}:${head}`}>
      <p>Generated for {short(ready.tour.headSha)}; the PR changed to {short(head)}. Code snippets are hidden because GitHub only serves the current head's diff.</p>
      <button type="button" disabled={Boolean(disabledReason) || queuing} title={disabledReason || undefined} onClick={() => void generate()}>Regenerate</button>
    </Alert>}
    {!tour && <div className="pr-tour-empty">
      <h3>{pending ? "Writing a tour" : "No tour yet"}</h3>
      {pending ? <p>The chat's agent is reading this pull request at head {short(pending.request.headSha)}. The tour appears here when its reply arrives; you can follow the turn in the chat.</p> :
        <p>Ask this chat's agent to read the pull request{head ? ` at head ${short(head)}` : ""} and write a guided tour: what changed, how risky it is and which code to review first. It runs as a read-only turn with the chat's model, Env, budget and approvals.</p>}
      {!pending && <button type="button" className="primary" disabled={Boolean(blocked) || queuing} onClick={() => void generate()}>{queuing ? "Queuing..." : "Generate tour"}</button>}
      {blocked ? <p className="fine-print">{blocked}</p> :
        <p className="fine-print">Uses {source === "repository" ? "this repository's" : source === "global" ? "your global" : "the default"} tour prompt.{openSettings ? " Change it with the settings button." : ""}</p>}
    </div>}
    {tour && ready && <TourBody tour={tour} changedFiles={selection.item.changedFiles} outdated={outdated} patches={patches?.key === key ? patches : null}
      patchError={patchError} reviewed={reviewed} toggle={toggle} />}
  </section>;
}

function TourBody({ tour, changedFiles, outdated, patches, patchError, reviewed, toggle }: {
  tour: Tour; changedFiles: number | undefined; outdated: boolean; patches: Patches | null; patchError: string;
  reviewed: ReadonlySet<string>; toggle: (id: string, checked: boolean) => void;
}) {
  const prefix = useId();
  const stepId = (index: number) => `${prefix}-step-${index}`;
  const jump = (index: number) => {
    const heading = document.getElementById(stepId(index));
    heading?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    heading?.focus({ preventScroll: true });
  };
  const covered = new Set(tour.steps.flatMap((step) => step.snippets.map((snippet) => snippet.path))).size;
  const chains: number[][] = [], labels: string[][] = [];
  for (const edge of tour.edges) {
    const chain = chains.at(-1);
    if (chain && chain.at(-1) === edge.from) { chain.push(edge.to); labels.at(-1)!.push(edge.label); }
    else { chains.push([edge.from, edge.to]); labels.push([edge.label]); }
  }
  const node = (step: number) => <span className="pr-tour-node">{pad(step)} · {tour.steps[step - 1]!.title}</span>;
  return <>
    <dl className="pr-tour-meters">{METERS.map(([field, name]) => <div key={field} className="pr-tour-meter" data-level={tour[field]}>
      <dt>{name}</dt><dd>{LEVELS[tour[field]].label}</dd>
      <dd className="pr-tour-meter-bar" aria-hidden="true">{[1, 2, 3, 4, 5].map((segment) => <span key={segment} data-filled={segment <= LEVELS[tour[field]].filled || undefined} />)}</dd>
    </div>)}</dl>
    <h3>Overview</h3>
    <p className="pr-tour-prose">{inline(tour.overview)}</p>
    <ol className="pr-tour-steps" aria-label="Tour steps">{tour.steps.map((step, index) => <li key={index}>
      <button type="button" className="pr-tour-step-link" onClick={() => jump(index)}><span className="pr-tour-step-number">{pad(index + 1)}</span> {step.title}</button>
    </li>)}</ol>
    <p className="fine-print">This tour covers {covered} {changedFiles === undefined ? `changed file${covered === 1 ? "" : "s"}` : `of ${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`}.
      Generated files, lockfiles, assets and files GitHub can't show as text may be left out; the Diff view lists every file. The agent wrote this tour, so check the code yourself.</p>
    {chains.length > 0 && <>
      <h3>How the changes fit together</h3>
      <ol className="pr-tour-flow">{chains.map((chain, index) => <li key={index}>
        {chain.map((step, position) => <Fragment key={position}>
          {position > 0 && <span className="pr-tour-edge"><span aria-hidden="true">↓</span> {labels[index]![position - 1]}</span>}
          {node(step)}
        </Fragment>)}
      </li>)}</ol>
    </>}
    {patchError && !outdated && <Alert as="p" role="alert">Code snippets couldn't load: {patchError}</Alert>}
    {tour.steps.map((step, index) => <section key={index} className="pr-tour-step" aria-labelledby={stepId(index)}>
      <p className="pr-tour-step-count">{pad(index + 1)} / {pad(tour.steps.length)}</p>
      <h3 id={stepId(index)} tabIndex={-1}>{step.title}</h3>
      <p className="pr-tour-prose">{inline(step.summary)}</p>
      {step.snippets.map((snippet, position) => {
        const id = snippetId(index, position, snippet);
        return <TourSnippet key={id} snippet={snippet} outdated={outdated} loading={!patches && !patchError} patches={patches}
          reviewed={reviewed.has(id)} toggle={(checked) => toggle(id, checked)} />;
      })}
    </section>)}
  </>;
}

function TourSnippet({ snippet, outdated, loading, patches, reviewed, toggle }: {
  snippet: PrTourSnippet; outdated: boolean; loading: boolean; patches: Patches | null; reviewed: boolean; toggle: (checked: boolean) => void;
}) {
  const slash = snippet.path.lastIndexOf("/"), lines = range(snippet);
  const patch = patches?.files.get(snippet.path);
  const view = useMemo(() => typeof patch === "string" ? prTourSnippet(patch, snippet.startLine, snippet.endLine) : null, [patch, snippet.startLine, snippet.endLine]);
  const body = outdated ? <p className="fine-print">Code hidden: this tour was written for an older head.</p> :
    loading ? <p className="fine-print">Loading the code at this head...</p> :
      !patches ? null :
        patch === undefined ? <p className="fine-print">This file isn't among the PR's changed files at this head.</p> :
          patch === null ? <p className="fine-print">GitHub didn't provide a text patch for this file (binary, oversized or unavailable). No diff was reconstructed.</p> :
            !view?.found ? <p className="fine-print">{lines ? `${lines.trim().charAt(0).toUpperCase()}${lines.trim().slice(1)} ${lines.startsWith(" lines") ? "aren't" : "isn't"}` : "Nothing is"} part of this file's diff at this head.</p> :
              <>
                <div className="pr-tour-code" role="region" tabIndex={0} aria-label={`Diff of ${snippet.path}${lines}`}>
                  {view.lines.map((line, index) => <div key={index} className="pr-tour-line" data-kind={line.kind}>
                    <span className="pr-tour-ln">{line.oldLine ?? ""}</span><span className="pr-tour-ln">{line.newLine ?? ""}</span>
                    <span className="pr-tour-marker">{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : line.kind === "gap" ? "" : " "}</span>
                    <span className="pr-tour-text">{line.kind === "gap" ? "..." : line.text}</span>
                  </div>)}
                </div>
                {view.omitted > 0 && <p className="fine-print">{view.omitted} more line{view.omitted === 1 ? "" : "s"} in the Diff view.</p>}
              </>;
  return <figure className="pr-tour-snippet">
    <figcaption className="pr-tour-snippet-header">
      <Icon name="File" />
      <span className="pr-tour-path">{slash >= 0 && <span className="pr-tour-dir">{snippet.path.slice(0, slash + 1)}</span>}{snippet.path.slice(slash + 1)}</span>
      {lines && <span className="pr-tour-lines">{lines.trim()}</span>}
      {view?.found && <span className="pr-tour-additions">+{view.additions}</span>}
      {view?.found && view.deletions > 0 && <span className="pr-tour-deletions">-{view.deletions}</span>}
      <label className="pr-tour-reviewed"><input type="checkbox" checked={reviewed} aria-label={`Reviewed ${snippet.path}${lines}`}
        onChange={(event) => toggle(event.target.checked)} />Reviewed</label>
    </figcaption>
    {snippet.note && <p className="fine-print pr-tour-note">{inline(snippet.note)}</p>}
    {body}
  </figure>;
}
