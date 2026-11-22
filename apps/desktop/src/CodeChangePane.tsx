import { useEffect, useRef, useState, type ReactNode } from "react";
import { sessionPullRequestStates, sessionPullRequestUrls, type MoguriSdk, type PullRequestLink, type Session, type Snapshot } from "@moguri-dev/sdk";
import { GitHubStateIcon, githubStateMark } from "./GitHubPickers.tsx";
import { SessionGitHub } from "./SessionGitHub.tsx";
import { LinkedPullRequest } from "./PullRequestView.tsx";
import { PullRequestActions } from "./PullRequestActions.tsx";
import { PrAutomationPanel } from "./PrAutomationSettings.tsx";

export function CodeChangePane({ sdk, session, snapshot, onDirty, chooseSession, changes, openSettings }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; chooseSession: (id: string) => Promise<void>; changes: ReactNode;
  openSettings?: () => void;
}) {
  const urls = session.repositories ? [] : sessionPullRequestUrls(session, snapshot), [selected, setSelected] = useState<string | null>(urls[0] ?? null);
  const [linking, setLinking] = useState(false);
  const actual = selected && urls.includes(selected) ? selected : urls[0] ?? null;
  const known = useRef(urls.length), [live, setLive] = useState<Record<string, PullRequestLink>>({});
  // A newly opened PR becomes the one shown; associations only ever grow.
  useEffect(() => { if (urls.length > known.current && known.current > 0) setSelected(urls.at(-1)!); known.current = urls.length; }, [urls.length]);
  if (!actual || linking) return <section aria-label="Session code change" data-session-id={session.id} data-code-change="changes">
    <h2>Code change</h2>
    <p className="fine-print">{actual ? "Pull request linked. It opens here next time; this view keeps the current linking result." : "No pull request is linked yet. Showing this session's bound workspace changes."}</p>
    {changes}
    {!session.repositories && <details className="code-change-pr-link" open={linking} onToggle={(event) => setLinking(event.currentTarget.open)}>
      <summary>Link or open a pull request</summary>
      {linking && <SessionGitHub sdk={sdk} session={session} snapshot={snapshot} kind="pull" selectedUrl={null} onDirty={onDirty} chooseSession={chooseSession} />}
    </details>}
  </section>;
  return <section aria-label="Session code change" data-session-id={session.id} data-code-change="pull-request">
    <h2 className="sr-only">Code change{urls.length > 1 ? ` (${urls.length} PRs)` : ""}</h2>
    <PullRequestSwitcher urls={urls} states={[...Object.values(live), ...sessionPullRequestStates(session, snapshot).filter((link) => !live[link.url])]} selected={actual} select={setSelected} />
    <LinkedPullRequest key={`${sdk.profileId}:${actual}`} sdk={sdk} session={session} snapshot={snapshot} url={actual} onDirty={onDirty} openSettings={openSettings}
      observed={(item) => { const state = item.state; if (item.number && item.url && (state === "open" || state === "closed" || state === "merged")) setLive((values) => ({ ...values,
        [actual]: { url: actual, repo: item.url!.split("/").slice(3, 5).join("/"), number: item.number!, state, draft: item.draft ?? false, checkedAt: new Date().toISOString(), diagnostic: null } })); }} />
    <div className="code-change-follow-up">
      <PullRequestActions sdk={sdk} session={session} url={actual} />
      <PrAutomationPanel sdk={sdk} session={session} snapshot={snapshot} url={actual} />
    </div>
    <details className="code-change-pr-link"><summary>Open another pull request</summary>
      <SessionGitHub sdk={sdk} session={session} snapshot={snapshot} kind="pull" selectedUrl={null} onDirty={onDirty} chooseSession={chooseSession} createOnly /></details>
    <p className="fine-print">A linked pull request stays with this session. Open another one to work on more changes; switch between them above.</p>
  </section>;
}

/** The session's pull requests as tabs with their live state; every associated PR stays listed. */
function PullRequestSwitcher({ urls, states, selected, select }: { urls: string[]; states: PullRequestLink[]; selected: string; select: (url: string) => void }) {
  return <div className="pr-switcher" role="tablist" aria-label="Session pull requests">{urls.map((url) => {
    const link = states.find((value) => value.url === url), number = /\/pull\/(\d+)/.exec(url)?.[1] ?? "?";
    const verified = link && !link.diagnostic && link.state !== "unknown" && !(link.state === "open" && link.draft == null);
    const state = verified ? githubStateMark("pull", { state: link.state, draft: link.draft ?? false }).label : "State not verified yet";
    return <button key={url} type="button" role="tab" aria-selected={url === selected} aria-label={`Pull request #${number}, ${state.toLowerCase()}`} title={url} onClick={() => select(url)}>
      {verified ? <GitHubStateIcon kind="pull" item={{ state: link.state, draft: link.draft ?? false }} /> : <span className="github-state" data-github-state="unknown" aria-hidden="true">?</span>}PR #{number}</button>;
  })}</div>;
}
