import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { githubItemIdentity, sessionPullRequestUrls, type GithubAction, type GithubPreview, type GithubScope, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { GitHubItemPicker, type GithubProject, type GithubSelection } from "./GitHubPickers.tsx";
import { Alert } from "./Alert.tsx";
import { PullRequestPane } from "./PullRequestPane.tsx";
const RichMessage = lazy(() => import("./RichMessage.tsx"));

export function SessionGitHub({ sdk, session, snapshot, kind, onDirty, chooseSession, selectedUrl }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; kind: "issue" | "pull"; onDirty: (dirty: boolean) => void;
  chooseSession: (id: string) => Promise<void>;
  selectedUrl?: string | null;
}) {
  const [selection, setSelection] = useState<GithubSelection | null>(null), [context, setContext] = useState<GithubProject | null>(null);
  const [contextScope, setContextScope] = useState(""), [creationScope, setCreationScope] = useState("");
  const [creating, setCreating] = useState(false), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [base, setBase] = useState(""), [head, setHead] = useState(""), [draft, setDraft] = useState(true);
  const [review, setReview] = useState<GithubPreview | null>(null), [confirmed, setConfirmed] = useState<string[]>([]);
  const [operationId, setOperationId] = useState(""), [attempted, setAttempted] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [stopping, setStopping] = useState(false);
  const pending = useRef(false);
  const label = kind === "pull" ? "pull request" : "issue", bound = selectedUrl ?? (kind === "pull" ? session.prUrl : session.workItemUrl);
  const scope: GithubScope | null = session.projectId && session.controls.env === "Local" ? { env: "Local", projectId: session.projectId,
    sessionId: session.id, ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}) } : null;
  const scopeKey = JSON.stringify([sdk.profileId, scope, session.mode, session.pendingMode, session.status === "archived",
    snapshot.projects.find((entry) => entry.id === session.projectId)?.path,
    snapshot.managedWorkspaces.find((entry) => entry.id === session.workspaceId)?.path,
    snapshot.projectConfigurations.find((entry) => entry.projectId === session.projectId)?.revision,
    snapshot.policy.revision, snapshot.settings.permissionRevision]);
  const current = useRef(scopeKey); current.current = scopeKey;
  const formKey = JSON.stringify([title, body, base, head, draft, scopeKey, snapshot.policy.revision, snapshot.settings.values.permissions,
    snapshot.projectConfigurations.find((entry) => entry.projectId === session.projectId)?.revision]);
  const dirty = creating && Boolean(title || body);
  const scopeChanged = creating && creationScope !== scopeKey;
  const writeAllowed = Boolean(scope && snapshot.policy.allowedEnvs.includes("Local") && session.kind === "agent" && session.mode === "agent" &&
    session.pendingMode !== "read-only" && session.status !== "archived");
  const canWrite = writeAllowed && !scopeChanged;
  useEffect(() => { setReview(null); setConfirmed([]); }, [formKey]);
  useEffect(() => { onDirty(dirty || creating && busy); return () => onDirty(false); }, [dirty, creating, busy, onDirty]);
  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = scopeKey; setBusy(true); setError(""); setNotice("");
    try { await action(() => current.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "The original GitHub outcome is unconfirmed. Inspect its retained operation before creating anything again."); }
    finally { pending.current = false; setBusy(false); }
  };
  const attach = async (url: string) => {
    await sdk.refresh();
    const actual = sdk.getState().snapshot?.sessions.find((entry) => entry.id === session.id);
    if (!actual) throw new Error("The destination session was removed. The GitHub item was not deleted.");
    if (kind === "pull") {
      if (selection?.item.url === url) await sdk.sessions.associatePr(session.id, { ...selection.source, expectedDigest: selection.digest }, actual.revision);
      else {
        if (!scope || !context) throw new Error("The exact publication account/root is no longer available. The existing PR was preserved; reload it before associating.");
        const identity = githubItemIdentity(url);
        const reviewed = await sdk.github.source(scope, { kind: "pull", repository: identity.repository, number: identity.number, account: context.account, accountId: context.accountId });
        await sdk.sessions.associatePr(session.id, { ...reviewed.source, expectedDigest: reviewed.digest }, actual.revision);
      }
    } else await sdk.sessions.organize(session.id, { workItemUrl: url, workItemId: null }, actual.revision);
  };
  const operation = (): GithubAction => {
    if (!context) throw new Error("Load this project's GitHub repository and account first.");
    return kind === "pull" ? { kind: "github.pr.create", repository: context.repository, account: context.account, title, body, base, head, draft } :
      { kind: "github.issue.create", repository: context.repository, account: context.account, title, body };
  };
  const retainedOperation = snapshot.githubOperations.find((entry) => entry.id === operationId);
  const cancelOriginal = () => {
    if (!retainedOperation) return;
    setStopping(true);
    void sdk.github.cancel(retainedOperation.id).catch((error: unknown) => setError(error instanceof Error ? error.message : "Original GitHub cancellation was not confirmed. Inspect its retained result.")).finally(() => setStopping(false));
  };
  const discard = () => { setCreating(false); setTitle(""); setBody(""); setReview(null); };
  const kanban = kind === "issue" && session.projectId ? <KanbanWorkItem sdk={sdk} session={session} snapshot={snapshot} /> : null;
  if (!scope) return <section className="session-github"><p className="fine-print">GitHub {label} workflows need an explicit Local project. Remote and Sandbox do not borrow this Mac's account or checkout.</p>
    {kanban}
    {creating && <><Alert as="p" tone="warning" className="settings-warning">Your publication form is preserved. Restore its Local destination or copy/discard the edit explicitly.</Alert>
      <label className="setting-field">Preserved title<input readOnly value={title} /></label><label className="setting-field">Preserved body<textarea readOnly value={body} /></label>
      <button type="button" disabled={busy} onClick={discard}>Discard preserved form</button></>}
    {operationId && <p className="fine-print">Original operation: {operationId} / {retainedOperation?.status ?? "unobserved"}. Inspect its retained history; no different environment was used.</p>}
    {retainedOperation?.status === "running" && <button type="button" disabled={stopping} onClick={cancelOriginal}>Cancel original GitHub operation</button>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
  return <section className="session-github" aria-label={kind === "pull" ? "Project pull requests" : "Project work items"} aria-busy={busy}>
    {kanban}
    {bound && <p className="fine-print path">Linked {label}: <button type="button" className="quiet" disabled={busy} onClick={() => void run(async () => { await window.moguri.openExternal(bound); })}>{bound}</button></p>}
    <header className="panel-toolbar"><strong>{kind === "pull" ? "Pull requests" : "GitHub issues"}</strong>
      <button type="button" disabled={busy || !writeAllowed || !context || contextScope !== scopeKey || creating} onClick={() => { setCreating(true); setCreationScope(scopeKey); setTitle(""); setBody(""); setBase(context?.defaultBranch ?? ""); setHead(context?.branch === "(detached)" ? "" : context?.branch ?? ""); setAttempted(false); setOperationId(""); setNotice(""); }}>New {label}</button></header>
    {!creating && <GitHubItemPicker key={scopeKey} sdk={sdk} scope={scope} kind={kind} selectedUrl={bound} select={setSelection} contextChanged={(value) => { setContext(value); setContextScope(scopeKey); }} disabled={busy} />}
    {selection && !creating && <article className="github-item" aria-label={`${kind === "pull" ? "Pull request" : "Issue"} details`}>
      <h3>#{selection.item.number} {selection.item.title}</h3><p className="fine-print">{selection.item.draft ? "Draft" : selection.item.state}{selection.item.author ? ` / ${selection.item.author}` : ""}</p>
      <p className="fine-print path">Source workspace: {selection.binding.root.root}</p>
      {kind === "pull" && <p className="fine-print path">{selection.item.head} into {selection.item.base}</p>}
      <div className="github-item-body"><Suspense fallback={<p>{selection.item.body}</p>}><RichMessage text={selection.item.body || "No description."} openLink={(url) => void run(async () => { await window.moguri.openExternal(url); })} /></Suspense></div>
      <div className="button-row"><button type="button" disabled={busy || !selection.item.url} onClick={() => void run(async () => { await window.moguri.openExternal(selection.item.url!); })}>Open in GitHub</button>
        <button type="button" disabled={busy || selection.item.url === bound || kind === "pull" && sessionPullRequestUrls(session, snapshot).includes(selection.item.url ?? "")} onClick={() => void run(async () => { await attach(selection.item.url!); setNotice(`Linked ${label} #${selection.item.number}. Original PR associations and cleanup provenance were preserved; no checkout or model call was started.`); })}>{selection.item.url === bound || kind === "pull" && sessionPullRequestUrls(session, snapshot).includes(selection.item.url ?? "") ? "Linked to this session" : "Link to this session"}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { const started = await sdk.github.startSession(scope, selection.source, selection.digest); await chooseSession(started.id!); })}>Start session from {label}</button></div>
      {kind === "pull" && <PullRequestPane key={JSON.stringify([selection.source, selection.item.headSha, selection.binding])} sdk={sdk} scope={scope} session={session} snapshot={snapshot} selection={selection} />}
    </article>}
    {creating && <form className="github-create" aria-label={`Create ${label}`} onSubmit={(event) => { event.preventDefault(); void run(async (isCurrent) => {
      const value = await sdk.github.preview(scope, operation()); if (isCurrent()) setReview(value.preview);
    }); }}>
      <h3>Create {label}</h3><p className="fine-print">{context?.repository ?? "Load the project repository first."} / {context?.account}. The body below is sent only after your exact review.</p>
      {scopeChanged && <><Alert as="p" className="settings-warning" role="status">The project, workspace or policy changed. Your form is preserved; review the current destination before publishing.</Alert>
        <button type="button" disabled={busy || attempted || !writeAllowed} onClick={() => void run(async (isCurrent) => {
          const value = await sdk.github.project(scope); if (!isCurrent()) return;
          setContext(value); setContextScope(scopeKey); setCreationScope(scopeKey); setReview(null); setConfirmed([]);
        })}>Reload destination, keep form</button></>}
      <label className="setting-field">{kind === "pull" ? "Pull request title" : "GitHub issue title"}<input autoFocus required maxLength={256} value={title} disabled={busy || attempted} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="setting-field">{kind === "pull" ? "Pull request body" : "GitHub issue body"}<textarea aria-label={kind === "pull" ? "Pull request body" : "GitHub issue body"} maxLength={64 * 1024} value={body} disabled={busy || attempted} onChange={(event) => setBody(event.target.value)} /></label>
      {kind === "pull" && <><label className="setting-field">Base branch<input required value={base} disabled={busy || attempted} onChange={(event) => setBase(event.target.value)} /></label>
        <label className="setting-field">Head branch<input required value={head} disabled={busy || attempted} onChange={(event) => setHead(event.target.value)} /></label>
        <label className="check-setting"><input type="checkbox" role="switch" checked={draft} disabled={busy || attempted} onChange={(event) => setDraft(event.target.checked)} />Create as draft</label>
        <p className="fine-print">The head must already be pushed. Creating a PR never pushes a branch for you.</p></>}
      <div className="button-row"><button className="primary" type="submit" disabled={busy || attempted || !canWrite || !context || !title.trim()}>Review {label}</button>
        <button type="button" disabled={busy} onClick={discard}>Cancel</button></div>
      {review && <section className="github-write-review" aria-label={`Exact ${label} review`}><h4>Review exact publication</h4>
        <p className="fine-print path">{review.document.action.kind} / {review.document.accountId} / {review.document.root.root}</p>
        <pre>{JSON.stringify(review.document.action, null, 2)}</pre>
        {review.document.confirmations.map((confirmation) => <label className="check-setting" key={confirmation}><input type="checkbox" checked={confirmed.includes(confirmation)} disabled={busy || attempted}
          onChange={(event) => setConfirmed((values) => event.target.checked ? [...values, confirmation] : values.filter((value) => value !== confirmation))} />{confirmation}</label>)}
        <button className="primary" type="button" disabled={busy || attempted || !canWrite || review.document.confirmations.some((value) => !confirmed.includes(value))} onClick={() => void run(async (isCurrent) => {
          setAttempted(true);
          const started = await sdk.github.execute(review, review.document.confirmations, true);
          if (!started.id) throw new Error("The original write was not acknowledged. Inspect GitHub workflow history before a new publication.");
          setOperationId(started.id);
          const retained = await sdk.github.wait(started.id);
          if (retained.operation.status !== "completed" || !retained.result?.resource?.url) throw new Error(retained.operation.diagnostic ?? `The original publication is ${retained.operation.status}. Inspect its retained result; it was not replayed.`);
          if (!isCurrent()) return;
          const created = retained.result.resource;
          setCreating(false); setTitle(""); setBody(""); setReview(null);
          try { await attach(created.url!); }
          catch (error) { throw new Error(`Created ${label} #${created.number}, but session linking failed: ${error instanceof Error ? error.message : "refresh the session and link the existing item"}`); }
          setNotice(`Created and linked ${label} #${created.number}.`);
        })}>Create and link {label}</button></section>}
    </form>}
    {operationId && <p className="fine-print">Original GitHub operation: <code>{operationId}</code> / {retainedOperation?.status ?? "unobserved"}. Its result remains in GitHub workflow history.</p>}
    {retainedOperation?.status === "running" && <button type="button" disabled={stopping} onClick={cancelOriginal}>Cancel original GitHub operation</button>}
    {notice && <Alert as="p" className="fine-print" role="status">{notice}</Alert>}{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
function KanbanWorkItem({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const selected = snapshot.issues.find((issue) => issue.id === session.workItemId && issue.projectId === session.projectId);
  const cards = snapshot.issues.filter((issue) => issue.projectId === session.projectId && (!issue.archived || issue.id === selected?.id)).sort((a, b) => a.number - b.number);
  return <section className="kanban-work-item" aria-label="Kanban work item">
    <label className="setting-field">Kanban card<select aria-label="Kanban work item" disabled={busy} value={selected?.id ?? ""} onChange={(event) => {
      const workItemId = event.target.value || null; setBusy(true); setError("");
      void sdk.sessions.organize(session.id, { workItemId, ...(workItemId ? { workItemUrl: null } : {}) }).catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "The card was not linked. Reload the actual project.");
      }).finally(() => setBusy(false));
    }}><option value="">No Kanban card</option>{cards.map((issue) => <option key={issue.id} value={issue.id}>#{issue.number} {issue.title}{issue.linear ? ` / ${issue.linear.identifier}` : ""}{issue.archived ? " (archived)" : ""}</option>)}</select></label>
    {selected && <article className="github-item"><h3>Local work item #{selected.number}: {selected.title}</h3>
      {selected.linear && <p className="fine-print">Imported Linear item {selected.linear.identifier}; no remote write.</p>}
      <Suspense fallback={<p>{selected.body}</p>}><RichMessage text={selected.body} openLink={(url) => void window.moguri.openExternal(url).catch((error: unknown) => setError(error instanceof Error ? error.message : "The link could not be opened."))} /></Suspense>
    </article>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
