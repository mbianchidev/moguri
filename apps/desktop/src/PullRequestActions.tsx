import { useEffect, useRef, useState } from "react";
import { ClientError, PR_ACTION_KINDS, PR_ACTION_LABELS, prActionPrompt, type MoguriSdk, type PrAction, type PrStatus, type Session } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";

/**
 * Address-review, fix-conflicts and fix-CI actions for one linked PR. A fresh read decides which apply; a click queues that workflow
 * in this chat with its normal model, environment, budget and approvals. Nothing pushes or replies without the usual tool approval.
 */
export function PullRequestActions({ sdk, session, url }: { sdk: MoguriSdk; session: Session; url: string }) {
  const [status, setStatus] = useState<PrStatus | null>(null), [checking, setChecking] = useState(false), [queuing, setQueuing] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [publicAccess, setPublicAccess] = useState(false), [switching, setSwitching] = useState(false);
  const generation = useRef(0);
  const load = async () => {
    const current = ++generation.current;
    setChecking(true); setError(""); setPublicAccess(false);
    try {
      const result = await sdk.sessions.prStatus(session.id, url);
      if (generation.current === current) setStatus(result.status);
    } catch (failure) {
      if (generation.current === current) {
        setStatus(null); setError(failure instanceof Error ? failure.message : "The pull request status couldn't be read. Nothing was queued.");
        setPublicAccess(failure instanceof ClientError && failure.code === "github_public_access" && Boolean(session.projectId));
      }
    } finally { if (generation.current === current) setChecking(false); }
  };
  useEffect(() => { setStatus(null); setNotice(""); void load(); return () => { generation.current++; }; }, [session.id, url]);
  const start = async (action: PrAction) => {
    if (!status || !action.available || queuing) return;
    setQueuing(true); setError(""); setNotice("");
    try {
      await sdk.workflows.start(session.id, action.kind, prActionPrompt(status, action.kind));
      setNotice(`Queued "${PR_ACTION_LABELS[action.kind]}" in this chat. Pushes and replies still need your usual approval.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The action wasn't queued."); }
    finally { setQueuing(false); }
  };
  // An explicit project setting change: linked PRs, status and follow-ups then read through the signed-in GitHub CLI account.
  const useGithubCli = async () => {
    if (!session.projectId || switching) return;
    setSwitching(true); setError("");
    try {
      const { configuration } = await sdk.projects.configuration(session.projectId);
      await sdk.projects.configure(session.projectId, { ...configuration.values, repo: { ...configuration.values.repo, githubAccess: "gh-cli" } }, configuration.revision);
      setNotice("This project now reads GitHub through your GitHub CLI account."); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The project's GitHub read access wasn't changed."); }
    finally { setSwitching(false); }
  };
  const archived = session.status === "archived";
  const actions: PrAction[] = status?.actions ?? PR_ACTION_KINDS.map((kind) => ({ kind, available: false, reason: checking ? "Checking the pull request..." : "Status unavailable." }));
  return <section aria-label="Pull request follow-up" aria-busy={checking || undefined}>
    <header className="panel-toolbar"><strong>Follow-up</strong>
      <button type="button" className="icon-button" aria-label="Refresh pull request status" title="Refresh pull request status" disabled={checking} onClick={() => void load()}><Icon name="Refresh" /></button></header>
    {status && <p className="fine-print" role="status">{`Checked ${new Date(status.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: ${status.state} on ${status.headRef}; ` +
      `${status.totalChecks} check${status.totalChecks === 1 ? "" : "s"} (${status.failedChecks.length} failing, ${status.runningChecks} running).`}</p>}
    <div className="button-row">{actions.map((action) => <button key={action.kind} type="button" disabled={checking || queuing || archived || !action.available}
      title={archived ? "Restore this chat first." : action.reason} onClick={() => void start(action)}>{PR_ACTION_LABELS[action.kind]}</button>)}</div>
    <ul className="fine-print" aria-label="Why each action is available">{actions.map((action) => <li key={action.kind}>{PR_ACTION_LABELS[action.kind]}: {action.reason}</li>)}</ul>
    {notice && <p className="fine-print" role="status">{notice}</p>}
    {error && <Alert as="p" role="alert">{error}</Alert>}
    {publicAccess && <button type="button" disabled={switching} onClick={() => void useGithubCli()}>Use my GitHub CLI account for this project</button>}
  </section>;
}
