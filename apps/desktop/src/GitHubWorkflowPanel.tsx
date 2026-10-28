import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MoguriSdk, Project, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { createGithubApi } from "../../../packages/sdk/src/github.ts";
import type { GithubAction, GithubBrowse, GithubPreview, GithubResponse, GithubScope } from "../../../packages/protocol/src/github-workflows.ts";

type Read = Extract<GithubResponse, { type: "github.read" }>;
type Browse = Extract<GithubResponse, { type: "github.browse" }>;
const actions: Array<[GithubAction["kind"], string]> = [
  ["git.push", "Push branch / exact force-with-lease"], ["git.rebase", "Rebase / continue / abort"],
  ["git.tag.create", "Create local tag"], ["git.tag.push", "Push exact tag"], ["git.tag.delete", "Delete explicit tag"],
  ["github.issue.create", "Create GitHub issue"], ["github.issue.update", "Edit / close / reopen issue"], ["github.issue.comment", "Comment on issue"],
  ["github.pr.create", "Create pull request"], ["github.pr.update", "Edit / close / reopen pull request"], ["github.pr.comment", "Comment on pull request"],
  ["github.comment.update", "Edit existing issue/PR/review comment"], ["github.comment.delete", "Delete existing issue/PR/review comment"],
  ["github.review.submit", "Submit exact-head PR review"], ["github.review.reply", "Reply inside review thread"], ["github.review.resolve", "Resolve / reopen review thread"],
  ["github.pr.merge", "Merge exact-head pull request"], ["github.release.create", "Create GitHub release"],
  ["github.release.update", "Update GitHub release"], ["github.release.publish", "Publish reviewed draft release"], ["github.ci.watch", "Watch CI at exact head"],
];
export function GitHubWorkflowPanel({ sdk, project, session, snapshot }: { sdk: MoguriSdk; project?: Project | null; session?: Session; snapshot: Snapshot }) {
  const uid = useId();
  const api = useMemo(() => createGithubApi(sdk), [sdk]);
  const [kind, setKind] = useState<GithubAction["kind"]>("git.push");
  const [repository, setRepository] = useState(""), [account, setAccount] = useState(""), [remote, setRemote] = useState("origin");
  const [branch, setBranch] = useState(""), [force, setForce] = useState(false), [onto, setOnto] = useState("");
  const [rebaseMode, setRebaseMode] = useState<"start" | "continue" | "abort">("start");
  const [tag, setTag] = useState(""), [target, setTarget] = useState(""), [annotated, setAnnotated] = useState(true), [message, setMessage] = useState("");
  const [deleteLocation, setDeleteLocation] = useState<"local" | "remote">("local");
  const [number, setNumber] = useState(""), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [editTitle, setEditTitle] = useState(false), [editBody, setEditBody] = useState(false), [state, setState] = useState<"" | "open" | "closed">("");
  const [base, setBase] = useState(""), [head, setHead] = useState(""), [draft, setDraft] = useState(true), [prerelease, setPrerelease] = useState(false);
  const [headRepository, setHeadRepository] = useState("");
  const [reviewEvent, setReviewEvent] = useState<"COMMENT" | "APPROVE" | "REQUEST_CHANGES">("COMMENT"), [commentId, setCommentId] = useState("");
  const [commentChannel, setCommentChannel] = useState<"conversation" | "review">("conversation");
  const [threadId, setThreadId] = useState(""), [resolveThread, setResolveThread] = useState(true), [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [releaseId, setReleaseId] = useState(""), [headSha, setHeadSha] = useState(""), [seconds, setSeconds] = useState("120"), [runId, setRunId] = useState("");
  const [resource, setResource] = useState<GithubBrowse["resource"]>("issues"), [browsed, setBrowsed] = useState<{ result: Browse; scope: string } | null>(null);
  const [preview, setPreview] = useState<{ value: GithubPreview; scope: string } | null>(null), [confirmations, setConfirmations] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<Read | null>(null), [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [inspectionReviewed, setInspectionReviewed] = useState(false);
  const pending = useRef(false), generation = useRef(0), resultHeading = useRef<HTMLHeadingElement>(null), focusResult = useRef(false);
  const configuration = snapshot.projectConfigurations.find((value) => value.projectId === project?.id);
  const scope: GithubScope | null = project ? { env: "Local", projectId: project.id, ...(session?.workspaceId ? { workspaceId: session.workspaceId } : {}), ...(session ? { sessionId: session.id } : {}) } : null;
  const requiredScope = (): GithubScope => { if (!scope) throw new Error("Choose an explicit Local project for new Git/GitHub work. Retained inspection needs no source root."); return scope; };
  const scopeKey = JSON.stringify([sdk.profileId, project?.id, project?.path, scope, session?.controls.env, session?.kind, session?.mode, session?.pendingMode, session?.status,
    configuration?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision, snapshot.settings.values.permissions,
    kind, repository, account, remote, branch, force, onto, rebaseMode, tag, target, annotated, message, deleteLocation, number, title, body, editTitle, editBody,
    state, base, head, headRepository, draft, prerelease, reviewEvent, commentId, commentChannel, threadId, resolveThread, mergeMethod, releaseId, headSha, seconds, runId, resource]);
  const current = useRef(scopeKey); current.current = scopeKey;
  const allowed = Boolean(project && snapshot.policy.allowedEnvs.includes("Local") && (!session || session.projectId === project.id && session.controls.env === "Local" && session.status !== "archived"));
  const canWrite = allowed && (!session || session.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only");
  const records = [...snapshot.githubOperations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    if (!allowed || !scope) return;
    let current = true;
    void api.project(scope).then((value) => {
      if (!current) return;
      setRepository((previous) => previous || value.repository); setAccount((previous) => previous || value.account);
      setBase((previous) => previous || value.defaultBranch); setHead((previous) => previous || (value.branch === "(detached)" ? "" : value.branch));
      setBranch((previous) => previous || (value.branch === "(detached)" ? "" : value.branch));
    }).catch((error: unknown) => { if (current) setNotice(`GitHub defaults unavailable: ${error instanceof Error ? error.message : "check the exact upstream and CLI account"}. Explicit Git-only inputs remain available.`); });
    return () => { current = false; };
  }, [api, allowed, project?.id, session?.id, session?.workspaceId]);
  const selected = records.find((value) => value.id === selectedId), value = read?.operation.id === selected?.id && read?.operation.revision === selected?.revision ? read : null;
  const numbered = ["github.issue.update", "github.issue.comment", "github.pr.update", "github.pr.comment", "github.pr.merge",
    "github.review.submit", "github.review.reply", "github.review.resolve", "github.comment.update", "github.comment.delete"].includes(kind);
  const editing = kind === "github.issue.update" || kind === "github.pr.update", releasing = kind === "github.release.create" || kind === "github.release.update";
  useEffect(() => { setPreview(null); setConfirmations([]); }, [scopeKey]);
  useEffect(() => { setInspectionReviewed(false); }, [sdk.profileId, selected?.id, selected?.revision, selected?.inputDigest]);
  useEffect(() => {
    const token = ++generation.current;
    if (!selected) { setRead(null); return; }
    void api.read(selected.id).then((value) => {
      if (generation.current !== token) return;
      setRead(value);
      if (focusResult.current && value.operation.status !== "running") { focusResult.current = false; requestAnimationFrame(() => resultHeading.current?.focus()); }
    }).catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "The independently retained Git/GitHub result could not be read."); });
    return () => { generation.current++; };
  }, [api, selected?.id, selected?.revision]);
  const run = async (label: string, action: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = scopeKey; setBusy(label); setError(""); setNotice("");
    try { await action(() => current.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "The original operation was not acknowledged. Inspect retained history; no input was replayed."); }
    finally { pending.current = false; setBusy(""); }
  };
  const positive = (value: string, label: string) => { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Enter an explicit positive ${label}.`); return parsed; };
  const action = (): GithubAction => {
    const gh = { repository, account }, n = () => positive(number, "issue/PR number");
    switch (kind) {
      case "git.push": return { kind, remote, branch, forceWithLease: force };
      case "git.rebase": return rebaseMode === "start" ? { kind, mode: "start", onto } : { kind, mode: rebaseMode };
      case "git.tag.create": return { kind, tag, target, annotated, message: annotated ? message : "" };
      case "git.tag.push": return { kind, remote, tag };
      case "git.tag.delete": return deleteLocation === "local" ? { kind, tag, location: "local" } : { kind, tag, location: "remote", remote };
      case "github.issue.create": return { kind, ...gh, title, body };
      case "github.issue.update": case "github.pr.update": return { kind, ...gh, number: n(), ...(editTitle ? { title } : {}), ...(editBody ? { body } : {}), ...(state ? { state } : {}) };
      case "github.issue.comment": case "github.pr.comment": return { kind, ...gh, number: n(), body };
      case "github.comment.update": return { kind, ...gh, number: n(), channel: commentChannel, commentId: positive(commentId, "comment ID"), body };
      case "github.comment.delete": return { kind, ...gh, number: n(), channel: commentChannel, commentId: positive(commentId, "comment ID") };
      case "github.pr.create": return { kind, ...gh, title, body, base, head, ...(headRepository ? { headRepository } : {}), draft };
      case "github.review.submit": return { kind, ...gh, number: n(), event: reviewEvent, body };
      case "github.review.reply": return { kind, ...gh, number: n(), commentId: positive(commentId, "review comment ID"), body };
      case "github.review.resolve": return { kind, ...gh, number: n(), threadId, resolve: resolveThread };
      case "github.pr.merge": return { kind, ...gh, number: n(), method: mergeMethod };
      case "github.release.create": return { kind, ...gh, tag, target, name: title, body, draft, prerelease };
      case "github.release.update": return { kind, ...gh, releaseId: positive(releaseId, "release ID"), tag, target, name: title, body, draft, prerelease };
      case "github.release.publish": return { kind, ...gh, releaseId: positive(releaseId, "release ID") };
      case "github.ci.watch": return { kind, ...gh, headSha, timeoutMs: positive(seconds, "CI deadline in seconds") * 1000, pollMs: 2000 };
    }
  };
  const browse = (page = 1) => run("Reading bounded GitHub metadata", async (isCurrent) => {
    const gh = { repository, account, page, perPage: 20 };
    let input: GithubBrowse;
    switch (resource) {
      case "issues": case "pulls": case "releases": input = { resource, ...gh }; break;
      case "issue": case "pull": case "reviews": case "comments": case "review-comments": case "threads": input = { resource, ...gh, number: positive(number, "issue/PR number") }; break;
      case "checks": input = { resource, ...gh, headSha }; break;
      case "runs": input = { resource, ...gh, ...(headSha ? { headSha } : {}) }; break;
      case "run": case "logs": input = { resource, ...gh, runId: positive(runId, "workflow run ID") }; break;
      case "release": input = { resource, ...gh, releaseId: positive(releaseId, "release ID") }; break;
    }
    const result = await api.browse(requiredScope(), input); if (isCurrent()) setBrowsed({ result, scope: scopeKey });
  });
  return <section className="candidate-panel" aria-label="Reviewed Git and GitHub workflows" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h2>Git &amp; GitHub workflows</h2>}>Explicit Local project/workspace operations. Review exact HEAD, index, remote/resource revision and protected actions before each write. Git hooks/configuration are honored, not sandboxed. GitHub uses only the named controller gh account, never SSH credentials.</SettingsHelp>
    {!allowed && <p className="settings-warning">New work requires an explicitly allowed Local project. No Remote/Sandbox fallback or inherited root. Independently retained inspection remains available without a source project.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}<p role="status">{busy || notice}</p>
    <fieldset disabled={Boolean(busy)} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}><legend>Exact operation inputs</legend>
      <label className="setting-field"><span id={`${uid}-operation`}>Git/GitHub operation</span><select aria-labelledby={`${uid}-operation`} value={kind} onChange={(event) => setKind(event.target.value as GithubAction["kind"])}>{actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="generation-review">
        <label className="setting-field">GitHub repository (owner/name)<SettingsInput value={repository} onChange={(event) => setRepository(event.target.value)} /></label>
        <label className="setting-field">Explicit controller gh login<SettingsInput value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="off" /></label>
      </div>
      {(kind === "git.push" || kind === "git.tag.push" || kind === "git.tag.delete" && deleteLocation === "remote") && <label className="setting-field">Configured Git remote<SettingsInput value={remote} onChange={(event) => setRemote(event.target.value)} /></label>}
      {kind === "git.push" && <>
        <label className="setting-field">Exact destination branch<SettingsInput value={branch} placeholder={configuration?.values.repo.mainBranch} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />Request force-with-lease at the exact captured remote SHA (never raw force)</label>
      </>}
      {kind === "git.rebase" && <>
        <label className="setting-field"><span id={`${uid}-rebase`}>Rebase action</span><select aria-labelledby={`${uid}-rebase`} value={rebaseMode} onChange={(event) => setRebaseMode(event.target.value as typeof rebaseMode)}><option value="start">Start on a clean current branch</option><option value="continue">Continue explicitly resolved/staged conflicts</option><option value="abort">Explicitly abort this rebase</option></select></label>
        {rebaseMode === "start" && <label className="setting-field">Exact onto branch/tag/commit<SettingsInput value={onto} onChange={(event) => setOnto(event.target.value)} /></label>}
      </>}
      {(kind.startsWith("git.tag.") || releasing) && <label className="setting-field">Exact tag name<SettingsInput value={tag} onChange={(event) => setTag(event.target.value)} /></label>}
      {(kind === "git.tag.create" || releasing) && <label className="setting-field">Exact target branch/tag/commit<SettingsInput value={target} onChange={(event) => setTarget(event.target.value)} /></label>}
      {kind === "git.tag.create" && <>
        <label className="check-setting"><SettingsInput type="checkbox" checked={annotated} onChange={(event) => setAnnotated(event.target.checked)} />Annotated tag (otherwise lightweight)</label>
        {annotated && <label className="setting-field">Exact annotation<SettingsTextarea value={message} maxLength={4096} onChange={(event) => setMessage(event.target.value)} /></label>}
      </>}
      {kind === "git.tag.delete" && <label className="setting-field"><span id={`${uid}-tag-location`}>Delete tag only in</span><select aria-labelledby={`${uid}-tag-location`} value={deleteLocation} onChange={(event) => setDeleteLocation(event.target.value as typeof deleteLocation)}><option value="local">Local repository</option><option value="remote">Explicit remote</option></select></label>}
      {(numbered || ["issue", "pull", "reviews", "comments", "review-comments", "threads"].includes(resource)) && <label className="setting-field">Issue/PR number<SettingsInput type="number" min={1} value={number} onChange={(event) => setNumber(event.target.value)} /></label>}
      {editing && <div className="button-row">
        <label className="check-setting"><SettingsInput type="checkbox" checked={editTitle} onChange={(event) => setEditTitle(event.target.checked)} />Change title</label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={editBody} onChange={(event) => setEditBody(event.target.checked)} />Change body</label>
        <label className="setting-field"><span id={`${uid}-state`}>State</span><select aria-labelledby={`${uid}-state`} value={state} onChange={(event) => setState(event.target.value as typeof state)}><option value="">Preserve current state</option><option value="closed">Close</option><option value="open">Reopen</option></select></label>
      </div>}
      {(releasing || kind === "github.issue.create" || kind === "github.pr.create" || editing && editTitle) && <label className="setting-field">{releasing ? "Release name" : "Exact title"}<SettingsInput value={title} maxLength={256} onChange={(event) => setTitle(event.target.value)} /></label>}
      {(releasing || kind === "github.issue.create" || kind === "github.pr.create" || kind.endsWith(".comment") || kind === "github.review.submit" || kind === "github.review.reply" || kind === "github.comment.update" || editing && editBody) &&
        <label className="setting-field">Exact body<SettingsTextarea value={body} maxLength={64 * 1024} onChange={(event) => setBody(event.target.value)} /></label>}
      {kind === "github.pr.create" && <>
        <label className="setting-field">PR base branch<SettingsInput value={base} onChange={(event) => setBase(event.target.value)} /></label>
        <label className="setting-field">PR head branch (optional owner:branch)<SettingsInput value={head} onChange={(event) => setHead(event.target.value)} /></label>
        <label className="setting-field">Explicit head repository for a fork (owner/name; blank means this repository)<SettingsInput value={headRepository} onChange={(event) => setHeadRepository(event.target.value)} /></label>
      </>}
      {(releasing || kind === "github.pr.create") && <label className="check-setting"><SettingsInput type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />Draft (publishing requires separate explicit confirmation)</label>}
      {releasing && <label className="check-setting"><SettingsInput type="checkbox" checked={prerelease} onChange={(event) => setPrerelease(event.target.checked)} />Prerelease</label>}
      {kind === "github.review.submit" && <label className="setting-field"><span id={`${uid}-review-outcome`}>Review outcome</span><select aria-labelledby={`${uid}-review-outcome`} value={reviewEvent} onChange={(event) => setReviewEvent(event.target.value as typeof reviewEvent)}><option value="COMMENT">Comment</option><option value="APPROVE">Approve</option><option value="REQUEST_CHANGES">Request changes</option></select></label>}
      {(kind === "github.review.reply" || kind === "github.comment.update" || kind === "github.comment.delete") && <label className="setting-field">Original comment ID<SettingsInput type="number" min={1} value={commentId} onChange={(event) => setCommentId(event.target.value)} /></label>}
      {(kind === "github.comment.update" || kind === "github.comment.delete") && <label className="setting-field"><span id={`${uid}-comment-channel`}>Original comment channel</span><select aria-labelledby={`${uid}-comment-channel`} value={commentChannel} onChange={(event) => setCommentChannel(event.target.value as typeof commentChannel)}><option value="conversation">Issue/PR conversation</option><option value="review">Inline PR review</option></select></label>}
      {kind === "github.review.resolve" && <>
        <label className="setting-field">Exact GitHub review-thread node ID<SettingsInput value={threadId} onChange={(event) => setThreadId(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={resolveThread} onChange={(event) => setResolveThread(event.target.checked)} />Resolve thread (unchecked explicitly reopens it)</label>
      </>}
      {kind === "github.pr.merge" && <label className="setting-field"><span id={`${uid}-merge-method`}>Explicit merge method</span><select aria-labelledby={`${uid}-merge-method`} value={mergeMethod} onChange={(event) => setMergeMethod(event.target.value as typeof mergeMethod)}><option value="merge">Merge commit</option><option value="squash">Squash</option><option value="rebase">GitHub rebase merge</option></select></label>}
      {(kind === "github.release.update" || kind === "github.release.publish" || resource === "release") && <label className="setting-field">Exact release ID<SettingsInput type="number" min={1} value={releaseId} onChange={(event) => setReleaseId(event.target.value)} /></label>}
      {(kind === "github.ci.watch" || resource === "checks" || resource === "runs") && <label className="setting-field">Exact CI head SHA<SettingsInput value={headSha} onChange={(event) => setHeadSha(event.target.value)} /></label>}
      {kind === "github.ci.watch" && <label className="setting-field">Bounded CI deadline (seconds, at most 1800)<SettingsInput type="number" min={1} max={1800} value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label>}
      <button disabled={!(kind === "github.ci.watch" ? allowed : canWrite)} onClick={() => void run("Reviewing exact Git/GitHub intent", async (isCurrent) => {
        const result = await api.preview(requiredScope(), action()); if (isCurrent()) { setPreview({ value: result.preview, scope: scopeKey }); setConfirmations([]); }
      })} aria-label="Review exact operation">Review</button>
    </fieldset>
    {preview?.scope === scopeKey && <section className="candidate-section candidate-binding" aria-label="Exact Git/GitHub operation review">
      <h3>Review exact scope and effects</h3>
      <p className="fine-print path">Local root: {preview.value.document.root.root}<br />HEAD: {preview.value.document.git.head}<br />Index: {preview.value.document.git.indexDigest}<br />
        {preview.value.document.remote && <>Remote: {preview.value.document.remote.name} / {preview.value.document.remote.url}<br />Destination: {preview.value.document.remote.ref} / {preview.value.document.remote.sha ?? "absent"}<br /></>}
        {preview.value.document.accountId && <>Controller GitHub identity: {preview.value.document.accountId}<br /></>}Review digest: {preview.value.digest}</p>
      <pre>{JSON.stringify(preview.value.document.action, null, 2)}</pre>
      {preview.value.document.warnings.map((text) => <p className="settings-warning" key={text}>{text}</p>)}
      {preview.value.document.resource && <details><summary>Exact untrusted remote resource revision</summary><pre>{preview.value.document.resource.content}</pre></details>}
      {preview.value.document.confirmations.map((text) => <label className="check-setting" key={text}><SettingsInput type="checkbox" role={preview.value.document.confirmations.length > 1 ? "checkbox" : "switch"} checked={confirmations.includes(text)} disabled={Boolean(busy)}
        onChange={(event) => setConfirmations(event.target.checked ? [...confirmations, text] : confirmations.filter((value) => value !== text))} />{text}</label>)}
      <button className="primary" disabled={Boolean(busy) || !(kind === "github.ci.watch" ? allowed : canWrite) || preview.value.document.confirmations.some((text) => !confirmations.includes(text))}
        onClick={() => void run("Admitting original reviewed Git/GitHub operation", async (isCurrent) => {
          const captured = preview.value; setPreview(null); setConfirmations([]);
          const result = await api.execute(captured, captured.document.confirmations.filter((text) => confirmations.includes(text)), true);
          if (isCurrent() && result.id) { setSelectedId(result.id); focusResult.current = true; setNotice("Original reviewed intent admitted. Inspect its retained result; no retry or branch cleanup is automatic."); }
        })} aria-label="Execute only this reviewed operation">Execute</button>
    </section>}
    <details><summary>Read GitHub issues, PRs, reviews, checks, runs, logs and releases</summary>
      <SettingsHelp label="More about this setting" target={<label className="setting-field"><span id={`${uid}-resource`}>GitHub resource</span><select aria-labelledby={`${uid}-resource`} disabled={Boolean(busy)} value={resource} onChange={(event) => setResource(event.target.value as typeof resource)}>
        {["issues", "issue", "pulls", "pull", "reviews", "comments", "review-comments", "threads", "checks", "runs", "run", "logs", "releases", "release"].map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>} descriptionFirst>Read-only, bounded pages. Enter the explicit repository/account above. No endpoint editor, account substitution or implicit refresh.</SettingsHelp>
      {(resource === "run" || resource === "logs") && <label className="setting-field">Exact workflow run ID<SettingsInput type="number" min={1} value={runId} onChange={(event) => setRunId(event.target.value)} /></label>}
      <button disabled={Boolean(busy) || !allowed || !repository || !account} onClick={() => void browse()}>Read GitHub page</button>
      {browsed?.scope === scopeKey && <><p className="fine-print">{browsed.result.warning} Page {browsed.result.page}.</p>
        {browsed.result.items.map((item) => <details key={`${item.kind}-${item.nodeId ?? item.id}`}><summary>{item.number ? `#${item.number} ` : ""}{item.title || item.kind} / {item.state} {item.conclusion}</summary>
          <p className="fine-print path">{item.url}<br />Head: {item.headSha ?? "not disclosed"}</p><pre>{item.body}</pre></details>)}
        {browsed.result.page > 1 && <button disabled={Boolean(busy)} onClick={() => void browse(browsed.result.page - 1)}>Previous GitHub page</button>}
        {browsed.result.nextPage && <button disabled={Boolean(busy)} onClick={() => void browse(browsed.result.nextPage!)}>Next GitHub page</button>}
      </>}
    </details>
    <SettingsHelp label="More about this setting" target={<label className="setting-field"><span id={`${uid}-retained`}>Independently retained Git/GitHub operation</span><select aria-labelledby={`${uid}-retained`} value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose retained operation</option>{records.map((value) => <option key={value.id} value={value.id}>{value.kind} / {value.status} / {value.projectId} / {value.createdAt}</option>)}
    </select></label>}>History includes this profile's independently retained operations from all projects, including deleted sources. Selecting history never grants that source root.</SettingsHelp>
    {value && <section className="candidate-section" aria-label="Retained Git/GitHub outcome">
      <SettingsHelp label="More about this setting" target={<h3 tabIndex={-1} ref={resultHeading}>Git/GitHub operation {value.operation.status}</h3>}>Deletion of a source session does not erase this operation. Interrupted/ambiguous writes are partial, never automatically replayed, rolled back or reported successful. Conflict resolution, rebase continue/abort and every new write need their own fresh review.</SettingsHelp>
      <p className="fine-print path">Original command: {value.operation.commandId}<br />Root: {value.operation.root.root}<br />Job: {value.operation.jobId}<br />
        Dispatched: {String(value.operation.dispatched)}. Cancel requested: {String(value.operation.cancelRequested)}.</p>
      {value.operation.diagnostic && <p className="settings-warning" role="alert">{value.operation.diagnostic}</p>}
      {value.result?.ci && <p role="status">CI at {value.result.ci.headSha}: {value.result.ci.state}. {value.result.ci.deadlineReached ? "Bounded deadline reached; pending/no-checks is not success." : "Observed exact-head result, not branch-protection clearance."}</p>}
      {value.result && <details open><summary>Original acknowledged/partial result (untrusted data)</summary><pre>{JSON.stringify(value.result, null, 2)}</pre></details>}
      <details><summary>Original independently retained user review</summary><pre>{JSON.stringify(value.document, null, 2)}</pre></details>
      {value.operation.status === "partial" && value.operation.kind.startsWith("git.") && !value.operation.inspection && <section className="candidate-binding" aria-label="Partial Git inspection acknowledgement">
        <p className="settings-warning">Inspection acknowledgement is NOT cleanup proof or success. It does not stop, signal, replay, undo or resume work, infer PID ownership, or clear other root uncertainty. The original operation stays partial.</p>
        <label className="check-setting"><SettingsInput type="checkbox" checked={inspectionReviewed} disabled={Boolean(busy)} onChange={(event) => setInspectionReviewed(event.target.checked)} />I inspected this exact retained partial Git operation, original input and possible effects; record only my inspection acknowledgement.</label>
        <button disabled={Boolean(busy) || !inspectionReviewed} onClick={() => void run("Recording actual-user inspection without source authority", async (isCurrent) => {
          await api.acknowledge(value.operation.id, value.operation.revision, value.operation.inputDigest, true);
          if (isCurrent()) { setInspectionReviewed(false); setNotice("Inspection recorded only. The original operation remains partial; no cleanup, execution, signal or replay was performed."); }
        })} aria-label="Confirm inspection of partial Git operation">Confirm inspection</button>
      </section>}
      {value.operation.inspection && <p className="fine-print" role="status">Inspected by actual user at {value.operation.inspection.at}, observed revision {value.operation.inspection.observedRevision}. This acknowledgement is not cleanup proof, success or permission to replay; status remains {value.operation.status}.</p>}
      {value.operation.status === "running" && <button disabled={Boolean(busy)} onClick={() => void run("Requesting cancellation of original operation", async () => { await api.cancel(value.operation.id); })} aria-label="Cancel this owned operation">Cancel</button>}
    </section>}
  </section>;
}
