import { useState } from "react";
import { sessionPullRequestUrls, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { SessionGitHub } from "./SessionGitHub.tsx";

export function CodeChangePane({ sdk, session, snapshot, onDirty, chooseSession }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; onDirty: (dirty: boolean) => void; chooseSession: (id: string) => Promise<void>;
}) {
  const urls = sessionPullRequestUrls(session, snapshot), [selected, setSelected] = useState<string | null>(urls[0] ?? null);
  const actual = selected && urls.includes(selected) ? selected : urls[0] ?? null;
  return <section aria-label="Session code change" data-session-id={session.id}>
    <h2>Code change{urls.length > 1 ? ` (${urls.length} PRs)` : ""}</h2>
    {!actual && <p>This session has no linked pull request. Select or create one using its exact repository and account.</p>}
    {urls.length > 1 && <label className="setting-field">Associated pull request<select aria-label="Associated pull request" value={actual ?? ""}
      onChange={(event) => setSelected(event.target.value)}>{urls.map((url) => <option key={url} value={url}>{url}</option>)}</select></label>}
    <SessionGitHub sdk={sdk} session={session} snapshot={snapshot} kind="pull" selectedUrl={actual} onDirty={onDirty} chooseSession={chooseSession} />
    <p className="fine-print">Selecting a PR changes only this pane. The first candidate/PR cleanup association is not relinked.</p>
  </section>;
}
