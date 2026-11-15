import { useState, type ReactNode } from "react";
import { sessionPullRequestUrls, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { SessionGitHub } from "./SessionGitHub.tsx";

export function CodeChangePane({ sdk, session, snapshot, onDirty, chooseSession, changes }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; chooseSession: (id: string) => Promise<void>; changes: ReactNode;
}) {
  const urls = session.repositories ? [] : sessionPullRequestUrls(session, snapshot), [selected, setSelected] = useState<string | null>(urls[0] ?? null);
  const [linking, setLinking] = useState(false);
  const actual = selected && urls.includes(selected) ? selected : urls[0] ?? null;
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
    <h2>Code change{urls.length > 1 ? ` (${urls.length} PRs)` : ""}</h2>
    {urls.length > 1 && <label className="setting-field">Associated pull request<select aria-label="Associated pull request" value={actual}
      onChange={(event) => setSelected(event.target.value)}>{urls.map((url) => <option key={url} value={url}>{url}</option>)}</select></label>}
    <SessionGitHub sdk={sdk} session={session} snapshot={snapshot} kind="pull" selectedUrl={actual} onDirty={onDirty} chooseSession={chooseSession} />
    <p className="fine-print">Selecting a PR changes only this pane. The first candidate/PR cleanup association is not relinked.</p>
  </section>;
}
