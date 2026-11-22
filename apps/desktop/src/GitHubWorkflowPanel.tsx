import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MoguriSdk, Project, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { createGithubApi } from "../../../packages/sdk/src/github.ts";
import { RepositorySettingsSchema, type GithubAction, type GithubBrowse, type GithubPreview, type GithubResponse, type GithubScope } from "../../../packages/protocol/src/github-workflows.ts";
import { parse } from "../../../packages/protocol/src/core.ts";
import { Alert } from "./Alert.tsx";

type Read = Extract<GithubResponse, { type: "github.read" }>;
type Browse = Extract<GithubResponse, { type: "github.browse" }>;
type PanelAction = Exclude<GithubAction["kind"], "git.remote.set">;
const actions: Array<[PanelAction, string]> = [
  ["git.branch.create", "Create local branch"], ["git.branch.rename", "Rename current branch"], ["git.switch", "Switch to existing local branch"],
  ["git.stage", "Stage files"], ["git.unstage", "Unstage files"], ["git.commit", "Commit staged files"],
  ["git.revert", "Revert current commit"],
  ["git.push", "Push branch (optional force-with-lease)"], ["git.rebase", "Rebase / continue / abort"],
  ["git.tag.create", "Create local tag"], ["git.tag.push", "Push tag"], ["git.tag.delete", "Delete tag"],
  ["github.issue.create", "Create GitHub issue"], ["github.issue.update", "Edit / close / reopen issue"], ["github.issue.comment", "Comment on issue"],
  ["github.pr.create", "Create pull request"], ["github.pr.update", "Edit / close / reopen pull request"], ["github.pr.comment", "Comment on pull request"],
  ["github.pr.draft", "Convert PR to draft / mark ready for review"], ["github.issue.labels", "Replace issue or PR labels"],
  ["github.issue.assignees", "Replace issue or PR assignees"], ["github.pr.reviewers", "Request / remove PR reviewers"],
  ["github.comment.update", "Edit issue, PR or review comment"], ["github.comment.delete", "Delete issue, PR or review comment"],
  ["github.review.submit", "Submit PR review"], ["github.review.comment", "Comment on PR diff lines"], ["github.review.reply", "Reply to review thread"], ["github.review.resolve", "Resolve / reopen review thread"],
  ["github.pr.merge", "Merge pull request"], ["github.branch.delete", "Delete a merged PR's branch"], ["github.pr.revert", "Revert a merged pull request"],
  ["github.release.create", "Create GitHub release"],
  ["github.release.update", "Update GitHub release"], ["github.release.publish", "Publish draft release"], ["github.ci.watch", "Watch CI for a commit"],
  ["github.repo.settings", "Change repository settings"],
];
export function GitHubWorkflowPanel({ sdk, project, session, snapshot }: { sdk: MoguriSdk; project?: Project | null; session?: Session; snapshot: Snapshot }) {
  const uid = useId();
  const api = useMemo(() => createGithubApi(sdk), [sdk]);
  const [kind, setKind] = useState<PanelAction>("git.push");
  const [repository, setRepository] = useState(""), [account, setAccount] = useState(""), [remote, setRemote] = useState("origin");
  const [branch, setBranch] = useState(""), [force, setForce] = useState(false), [onto, setOnto] = useState("");
  const [checkout, setCheckout] = useState(false), [pathsText, setPathsText] = useState("");
  const [rebaseMode, setRebaseMode] = useState<"start" | "continue" | "abort">("start");
  const [tag, setTag] = useState(""), [target, setTarget] = useState(""), [annotated, setAnnotated] = useState(true), [message, setMessage] = useState("");
  const [deleteLocation, setDeleteLocation] = useState<"local" | "remote">("local");
  const [number, setNumber] = useState(""), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editTitle, setEditTitle] = useState(false), [editBody, setEditBody] = useState(false), [state, setState] = useState<"" | "open" | "closed">("");
  const [base, setBase] = useState(""), [head, setHead] = useState(""), [draft, setDraft] = useState(true), [prerelease, setPrerelease] = useState(false);
  const [headRepository, setHeadRepository] = useState("");
  const [reviewEvent, setReviewEvent] = useState<"COMMENT" | "APPROVE" | "REQUEST_CHANGES">("COMMENT"), [commentId, setCommentId] = useState("");
  const [commentChannel, setCommentChannel] = useState<"conversation" | "review">("conversation");
  const [namesText, setNamesText] = useState(""), [reviewerOperation, setReviewerOperation] = useState<"request" | "remove">("request");
  const [diffPath, setDiffPath] = useState(""), [diffLine, setDiffLine] = useState(""), [diffStartLine, setDiffStartLine] = useState(""), [diffSide, setDiffSide] = useState<"LEFT" | "RIGHT">("RIGHT");
  const [threadId, setThreadId] = useState(""), [resolveThread, setResolveThread] = useState(true), [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [releaseId, setReleaseId] = useState(""), [headSha, setHeadSha] = useState(""), [seconds, setSeconds] = useState("120"), [runId, setRunId] = useState("");
  const [resource, setResource] = useState<GithubBrowse["resource"]>("issues"), [browsed, setBrowsed] = useState<{ result: Browse; scope: string } | null>(null);
  const [settingsText, setSettingsText] = useState('{\n  "delete_branch_on_merge": true\n}'), [contentPath, setContentPath] = useState(""), [contentRef, setContentRef] = useState(""), [checkRunId, setCheckRunId] = useState(""), [rulesBranch, setRulesBranch] = useState("");
  const [preview, setPreview] = useState<{ value: GithubPreview; scope: string } | null>(null), [confirmations, setConfirmations] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(""), [read, setRead] = useState<Read | null>(null), [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [inspectionReviewed, setInspectionReviewed] = useState(false);
  const pending = useRef(false), generation = useRef(0), resultHeading = useRef<HTMLHeadingElement>(null), focusResult = useRef(false);
  const inferred = useRef({ repository: "", account: "", base: "", head: "", branch: "" });
  const configuration = snapshot.projectConfigurations.find((value) => value.projectId === project?.id);
  const scope: GithubScope | null = project ? { env: "Local", projectId: project.id, ...(session?.workspaceId ? { workspaceId: session.workspaceId } : {}), ...(session ? { sessionId: session.id } : {}) } : null;
  const requiredScope = (): GithubScope => { if (!scope) throw new Error("Choose a Local project for new Git or GitHub work. Past results stay viewable without one."); return scope; };
  const scopeKey = JSON.stringify([sdk.profileId, project?.id, project?.path, scope, session?.controls.env, session?.kind, session?.mode, session?.pendingMode, session?.status,
    configuration?.revision, snapshot.policy.revision, snapshot.settings.permissionRevision, snapshot.settings.values.permissions,
    kind, repository, account, remote, branch, force, onto, checkout, pathsText, rebaseMode, tag, target, annotated, message, deleteLocation, number, title, body, editTitle, editBody,
    state, base, head, headRepository, draft, prerelease, reviewEvent, commentId, commentChannel, namesText, reviewerOperation, diffPath, diffLine, diffStartLine, diffSide, threadId, resolveThread, mergeMethod, releaseId, headSha, seconds, runId, resource, contentPath, contentRef, checkRunId, rulesBranch, settingsText]);
  const current = useRef(scopeKey); current.current = scopeKey;
  const allowed = Boolean(project && snapshot.policy.allowedEnvs.includes("Local") && (!session || session.projectId === project.id && session.controls.env === "Local" && session.status !== "archived"));
  const canWrite = allowed && (!session || session.kind === "agent" && session.mode === "agent" && session.pendingMode !== "read-only");
  const records = [...snapshot.githubOperations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    if (!allowed || !scope) return;
    let current = true;
    const previous = inferred.current;
    void api.project(scope).then((value) => {
      if (!current) return;
      const branch = value.branch === "(detached)" ? "" : value.branch;
      setRepository((current) => !current || current === previous.repository ? value.repository : current);
      setAccount((current) => !current || current === previous.account ? value.account : current);
      setBase((current) => !current || current === previous.base ? value.defaultBranch : current);
      setHead((current) => !current || current === previous.head ? branch : current);
      setBranch((current) => !current || current === previous.branch ? branch : current);
      inferred.current = { repository: value.repository, account: value.account, base: value.defaultBranch, head: branch, branch };
    }).catch((error: unknown) => { if (current) setNotice(`GitHub defaults unavailable: ${error instanceof Error ? error.message : "check the upstream remote and gh account"}. Git-only actions still work.`); });
    return () => { current = false; };
  }, [api, allowed, project?.id, session?.id, session?.workspaceId, configuration?.revision]);
  const selected = records.find((value) => value.id === selectedId), value = read?.operation.id === selected?.id && read?.operation.revision === selected?.revision ? read : null;
  const numbered = ["github.issue.update", "github.issue.comment", "github.pr.update", "github.pr.comment", "github.pr.merge",
    "github.review.submit", "github.review.reply", "github.review.resolve", "github.comment.update", "github.comment.delete",
    "github.pr.draft", "github.issue.labels", "github.issue.assignees", "github.pr.reviewers", "github.review.comment", "github.branch.delete", "github.pr.revert"].includes(kind);
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
    }).catch((error: unknown) => { if (generation.current === token) setError(error instanceof Error ? error.message : "The operation result could not be read."); });
    return () => { generation.current++; };
  }, [api, selected?.id, selected?.revision]);
  const run = async (label: string, action: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; const captured = scopeKey; setBusy(label); setError(""); setNotice("");
    try { await action(() => current.current === captured); }
    catch (error) { setError(error instanceof Error ? error.message : "The operation wasn't acknowledged. Check the history below; nothing was retried."); }
    finally { pending.current = false; setBusy(""); }
  };
  const positive = (value: string, label: string) => { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Enter a positive ${label}.`); return parsed; };
  const action = (): GithubAction => {
    const gh = { repository, account }, n = () => positive(number, "issue/PR number"), names = namesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    switch (kind) {
      case "git.branch.create": return { kind, branch, start: target, checkout };
      case "git.branch.rename": return { kind, from: branch, to: target };
      case "git.switch": return { kind, branch };
      case "git.revert": return { kind, commit: headSha };
      case "git.stage": case "git.unstage": return { kind, paths: pathsText.split(/\r?\n/).filter(Boolean) };
      case "git.commit": return { kind, paths: pathsText.split(/\r?\n/).filter(Boolean), message };
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
      case "github.review.comment": return { kind, ...gh, number: n(), path: diffPath, line: positive(diffLine, "line number"), side: diffSide,
        ...(diffStartLine ? { startLine: positive(diffStartLine, "first line number"), startSide: diffSide } : {}), body };
      case "github.review.resolve": return { kind, ...gh, number: n(), threadId, resolve: resolveThread };
      case "github.pr.merge": return { kind, ...gh, number: n(), method: mergeMethod };
      case "github.pr.draft": case "github.pr.revert": return { kind, ...gh, number: n(), draft };
      case "github.branch.delete": return { kind, ...gh, number: n(), branch };
      case "github.issue.labels": return { kind, ...gh, number: n(), labels: names };
      case "github.issue.assignees": return { kind, ...gh, number: n(), assignees: names };
      case "github.pr.reviewers": return { kind, ...gh, number: n(), operation: reviewerOperation, reviewers: names };
      case "github.release.create": return { kind, ...gh, tag, target, name: title, body, draft, prerelease };
      case "github.release.update": return { kind, ...gh, releaseId: positive(releaseId, "release ID"), tag, target, name: title, body, draft, prerelease };
      case "github.release.publish": return { kind, ...gh, releaseId: positive(releaseId, "release ID") };
      case "github.ci.watch": return { kind, ...gh, headSha, timeoutMs: positive(seconds, "CI deadline in seconds") * 1000, pollMs: 2000 };
      case "github.repo.settings": {
        let value: unknown;
        try { value = JSON.parse(settingsText); } catch { throw new Error("Repository settings must be a JSON object, for example {\"delete_branch_on_merge\": true}."); }
        return { kind, ...gh, settings: parse(RepositorySettingsSchema, value) };
      }
    }
  };
  const browse = (page = 1) => run("Reading GitHub...", async (isCurrent) => {
    const gh = { repository, account, page, perPage: 20 };
    let input: GithubBrowse;
    switch (resource) {
      case "search": input = { resource, ...gh, query: searchQuery }; break;
      case "issues": case "pulls": case "releases": input = { resource, ...gh }; break;
      case "issue": case "pull": case "reviews": case "comments": case "review-comments": case "threads": case "commits": case "timeline": input = { resource, ...gh, number: positive(number, "issue/PR number") }; break;
      case "files": input = { resource, ...gh, number: positive(number, "issue/PR number"), headSha }; break;
      case "jobs": input = { resource, ...gh, runId: positive(runId, "workflow run ID"), headSha }; break;
      case "checks": input = { resource, ...gh, headSha }; break;
      case "runs": input = { resource, ...gh, ...(headSha ? { headSha } : {}) }; break;
      case "run": case "logs": input = { resource, ...gh, runId: positive(runId, "workflow run ID") }; break;
      case "release": input = { resource, ...gh, releaseId: positive(releaseId, "release ID") }; break;
      case "tags": case "rulesets": case "release-latest": case "settings": case "labels": case "assignees": input = { resource, ...gh }; break;
      case "release-tag": input = { resource, ...gh, tag }; break;
      case "annotations": input = { resource, ...gh, checkRunId: positive(checkRunId, "check run ID"), headSha }; break;
      case "contents": input = { resource, ...gh, path: contentPath, ...(contentRef ? { ref: contentRef } : {}) }; break;
      case "branch-rules": input = { resource, ...gh, branch: rulesBranch }; break;
    }
    const result = await api.browse(requiredScope(), input); if (isCurrent()) setBrowsed({ result, scope: scopeKey });
  });
  return <section className="candidate-panel" aria-label="Reviewed Git and GitHub workflows" aria-busy={Boolean(busy)}>
    <SettingsHelp label="More about this setting" target={<h2>Git &amp; GitHub workflows</h2>}>Run Git and GitHub actions on a Local project; you review each write before it runs. Git hooks and config apply as usual and aren't sandboxed.</SettingsHelp>
    {!allowed && <Alert as="p" tone="warning" className="settings-warning">Choose an allowed Local project to run new Git or GitHub actions. Past results stay viewable without one.</Alert>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}<Alert as="p" role="status">{busy || notice}</Alert>
    <fieldset disabled={Boolean(busy)} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}><legend>Operation</legend>
      <label className="setting-field"><span id={`${uid}-operation`}>Git/GitHub operation</span><select aria-labelledby={`${uid}-operation`} value={kind} onChange={(event) => setKind(event.target.value as PanelAction)}>{actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="generation-review">
        <label className="setting-field">GitHub repository (owner/name)<SettingsInput value={repository} onChange={(event) => setRepository(event.target.value)} /></label>
        <label className="setting-field">gh account login<SettingsInput value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="off" /></label>
      </div>
      {(kind === "git.push" || kind === "git.tag.push" || kind === "git.tag.delete" && deleteLocation === "remote") && <label className="setting-field">Git remote<SettingsInput value={remote} onChange={(event) => setRemote(event.target.value)} /></label>}
      {kind === "github.branch.delete" && <label className="setting-field">Merged PR's head branch<SettingsInput value={branch} onChange={(event) => setBranch(event.target.value)} /></label>}
      {["git.branch.create", "git.branch.rename", "git.switch"].includes(kind) && <label className="setting-field">{kind === "git.branch.create" ? "New local branch" : kind === "git.branch.rename" ? "Current branch" : "Existing local branch"}<SettingsInput value={branch} onChange={(event) => setBranch(event.target.value)} /></label>}
      {(kind === "git.branch.create" || kind === "git.branch.rename") && <label className="setting-field">{kind === "git.branch.rename" ? "New branch name" : "Start from branch or commit"}<SettingsInput value={target} onChange={(event) => setTarget(event.target.value)} /></label>}
      {kind === "git.branch.create" && <label className="check-setting"><SettingsInput type="checkbox" checked={checkout} onChange={(event) => setCheckout(event.target.checked)} />Also switch to the new branch (requires a clean checkout)</label>}
      {["git.stage", "git.unstage", "git.commit"].includes(kind) && <label className="setting-field">File paths, one per line<SettingsTextarea value={pathsText} onChange={(event) => setPathsText(event.target.value)} /></label>}
      {kind === "git.commit" && <label className="setting-field">Commit message<SettingsTextarea value={message} maxLength={4096} onChange={(event) => setMessage(event.target.value)} /></label>}
      {kind === "git.revert" && <><label className="setting-field">Current commit SHA to revert<SettingsInput value={headSha} aria-describedby={`${uid}-revert-help`} onChange={(event) => setHeadSha(event.target.value)} /></label><small id={`${uid}-revert-help`}>Adds a new commit that undoes this one. History and uncommitted changes are kept.</small></>}
      {kind === "git.push" && <>
        <label className="setting-field">Destination branch<SettingsInput value={branch} placeholder={configuration?.values.repo.mainBranch} onChange={(event) => setBranch(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />Force push with lease (never a plain force push)</label>
      </>}
      {kind === "git.rebase" && <>
        <label className="setting-field"><span id={`${uid}-rebase`}>Rebase action</span><select aria-labelledby={`${uid}-rebase`} value={rebaseMode} onChange={(event) => setRebaseMode(event.target.value as typeof rebaseMode)}><option value="start">Start on a clean current branch</option><option value="continue">Continue after resolving and staging conflicts</option><option value="abort">Abort this rebase</option></select></label>
        {rebaseMode === "start" && <label className="setting-field">Rebase onto branch, tag or commit<SettingsInput value={onto} onChange={(event) => setOnto(event.target.value)} /></label>}
      </>}
      {(kind.startsWith("git.tag.") || releasing) && <label className="setting-field">Tag name<SettingsInput value={tag} onChange={(event) => setTag(event.target.value)} /></label>}
      {(kind === "git.tag.create" || releasing) && <label className="setting-field">Target branch, tag or commit<SettingsInput value={target} onChange={(event) => setTarget(event.target.value)} /></label>}
      {kind === "git.tag.create" && <>
        <label className="check-setting"><SettingsInput type="checkbox" checked={annotated} onChange={(event) => setAnnotated(event.target.checked)} />Annotated tag (otherwise lightweight)</label>
        {annotated && <label className="setting-field">Annotation message<SettingsTextarea value={message} maxLength={4096} onChange={(event) => setMessage(event.target.value)} /></label>}
      </>}
      {kind === "git.tag.delete" && <label className="setting-field"><span id={`${uid}-tag-location`}>Delete tag only in</span><select aria-labelledby={`${uid}-tag-location`} value={deleteLocation} onChange={(event) => setDeleteLocation(event.target.value as typeof deleteLocation)}><option value="local">Local repository</option><option value="remote">Remote</option></select></label>}
      {(numbered || ["issue", "pull", "reviews", "comments", "review-comments", "threads", "commits", "timeline"].includes(resource)) && <label className="setting-field">Issue/PR number<SettingsInput type="number" min={1} value={number} onChange={(event) => setNumber(event.target.value)} /></label>}
      {editing && <div className="button-row">
        <label className="check-setting"><SettingsInput type="checkbox" checked={editTitle} onChange={(event) => setEditTitle(event.target.checked)} />Change title</label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={editBody} onChange={(event) => setEditBody(event.target.checked)} />Change body</label>
        <label className="setting-field"><span id={`${uid}-state`}>State</span><select aria-labelledby={`${uid}-state`} value={state} onChange={(event) => setState(event.target.value as typeof state)}><option value="">Keep current state</option><option value="closed">Close</option><option value="open">Reopen</option></select></label>
      </div>}
      {(releasing || kind === "github.issue.create" || kind === "github.pr.create" || editing && editTitle) && <label className="setting-field">{releasing ? "Release name" : "Title"}<SettingsInput value={title} maxLength={256} onChange={(event) => setTitle(event.target.value)} /></label>}
      {(releasing || kind === "github.issue.create" || kind === "github.pr.create" || kind.endsWith(".comment") || kind === "github.review.submit" || kind === "github.review.reply" || kind === "github.comment.update" || editing && editBody) &&
        <label className="setting-field">Body<SettingsTextarea value={body} maxLength={64 * 1024} onChange={(event) => setBody(event.target.value)} /></label>}
      {kind === "github.pr.create" && <>
        <label className="setting-field">PR base branch<SettingsInput value={base} onChange={(event) => setBase(event.target.value)} /></label>
        <label className="setting-field">PR head branch (optional owner:branch)<SettingsInput value={head} onChange={(event) => setHead(event.target.value)} /></label>
        <label className="setting-field">Fork head repository (owner/name, blank for this repository)<SettingsInput value={headRepository} onChange={(event) => setHeadRepository(event.target.value)} /></label>
      </>}
      {(releasing || kind === "github.pr.create" || kind === "github.pr.revert") && <label className="check-setting"><SettingsInput type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />Draft (publishing needs a separate confirmation)</label>}
      {releasing && <label className="check-setting"><SettingsInput type="checkbox" checked={prerelease} onChange={(event) => setPrerelease(event.target.checked)} />Prerelease</label>}
      {kind === "github.pr.draft" && <label className="setting-field"><span id={`${uid}-draft-state`}>Change to</span><select aria-labelledby={`${uid}-draft-state`} value={draft ? "draft" : "ready"} onChange={(event) => setDraft(event.target.value === "draft")}><option value="ready">Ready for review</option><option value="draft">Draft</option></select></label>}
      {(kind === "github.issue.labels" || kind === "github.issue.assignees" || kind === "github.pr.reviewers") && <label className="setting-field">{kind === "github.issue.labels" ? "Labels, one per line (replaces every label; leave empty to remove all)" :
        kind === "github.issue.assignees" ? "Assignee logins, one per line (replaces every assignee; leave empty to remove all)" : "Reviewer logins, one per line"}<SettingsTextarea value={namesText} onChange={(event) => setNamesText(event.target.value)} /></label>}
      {kind === "github.pr.reviewers" && <label className="setting-field"><span id={`${uid}-reviewer-operation`}>Reviewers</span><select aria-labelledby={`${uid}-reviewer-operation`} value={reviewerOperation} onChange={(event) => setReviewerOperation(event.target.value as typeof reviewerOperation)}><option value="request">Request review</option><option value="remove">Remove review request</option></select></label>}
      {kind === "github.repo.settings" && <label className="setting-field">Settings to change (JSON)<SettingsTextarea className="json-editor short" spellCheck={false} value={settingsText} onChange={(event) => setSettingsText(event.target.value)} /></label>}
      {kind === "github.review.submit" && <label className="setting-field"><span id={`${uid}-review-outcome`}>Review outcome</span><select aria-labelledby={`${uid}-review-outcome`} value={reviewEvent} onChange={(event) => setReviewEvent(event.target.value as typeof reviewEvent)}><option value="COMMENT">Comment</option><option value="APPROVE">Approve</option><option value="REQUEST_CHANGES">Request changes</option></select></label>}
      {kind === "github.review.comment" && <>
        <label className="setting-field">File path in the repository<SettingsInput value={diffPath} onChange={(event) => setDiffPath(event.target.value)} /></label>
        <label className="setting-field"><span id={`${uid}-diff-side`}>Diff side</span><select aria-labelledby={`${uid}-diff-side`} value={diffSide} onChange={(event) => setDiffSide(event.target.value as typeof diffSide)}><option value="RIGHT">New file lines</option><option value="LEFT">Old file lines</option></select></label>
        <label className="setting-field">Line<SettingsInput type="number" min={1} value={diffLine} onChange={(event) => setDiffLine(event.target.value)} /></label>
        <label className="setting-field">First line (optional, for a multi-line comment)<SettingsInput type="number" min={1} value={diffStartLine} onChange={(event) => setDiffStartLine(event.target.value)} /></label>
      </>}
      {(kind === "github.review.reply" || kind === "github.comment.update" || kind === "github.comment.delete") && <label className="setting-field">Comment ID<SettingsInput type="number" min={1} value={commentId} onChange={(event) => setCommentId(event.target.value)} /></label>}
      {(kind === "github.comment.update" || kind === "github.comment.delete") && <label className="setting-field"><span id={`${uid}-comment-channel`}>Comment location</span><select aria-labelledby={`${uid}-comment-channel`} value={commentChannel} onChange={(event) => setCommentChannel(event.target.value as typeof commentChannel)}><option value="conversation">Issue/PR conversation</option><option value="review">Inline PR review</option></select></label>}
      {kind === "github.review.resolve" && <>
        <label className="setting-field">Review thread node ID<SettingsInput value={threadId} onChange={(event) => setThreadId(event.target.value)} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={resolveThread} onChange={(event) => setResolveThread(event.target.checked)} />Resolve thread (uncheck to reopen it)</label>
      </>}
      {kind === "github.pr.merge" && <label className="setting-field"><span id={`${uid}-merge-method`}>Merge method</span><select aria-labelledby={`${uid}-merge-method`} value={mergeMethod} onChange={(event) => setMergeMethod(event.target.value as typeof mergeMethod)}><option value="merge">Merge commit</option><option value="squash">Squash</option><option value="rebase">GitHub rebase merge</option></select></label>}
      {(kind === "github.release.update" || kind === "github.release.publish" || resource === "release") && <label className="setting-field">Release ID<SettingsInput type="number" min={1} value={releaseId} onChange={(event) => setReleaseId(event.target.value)} /></label>}
      {(kind === "github.ci.watch" || ["checks", "runs", "files", "jobs"].includes(resource)) && <label className="setting-field">{resource === "files" ? "PR head SHA" : "Commit SHA for CI"}<SettingsInput value={headSha} onChange={(event) => setHeadSha(event.target.value)} /></label>}
      {kind === "github.ci.watch" && <label className="setting-field">Wait up to (seconds, max 1800)<SettingsInput type="number" min={1} max={1800} value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label>}
      <button disabled={!(kind === "github.ci.watch" ? allowed : canWrite)} onClick={() => void run("Preparing review...", async (isCurrent) => {
        const result = await api.preview(requiredScope(), action()); if (isCurrent()) { setPreview({ value: result.preview, scope: scopeKey }); setConfirmations([]); }
      })} aria-label="Review exact operation">Review</button>
    </fieldset>
    {preview?.scope === scopeKey && <section className="candidate-section candidate-binding" aria-label="Exact Git/GitHub operation review">
      <h3>Review this operation</h3>
      <p className="fine-print path">Local root: {preview.value.document.root.root}<br />HEAD: {preview.value.document.git.head}<br />Index: {preview.value.document.git.indexDigest}<br />
        {preview.value.document.remote && <>Remote: {preview.value.document.remote.name} / {preview.value.document.remote.url}<br />Destination: {preview.value.document.remote.ref} / {preview.value.document.remote.sha ?? "absent"}<br /></>}
        {preview.value.document.accountId && <>GitHub account: {preview.value.document.accountId}<br /></>}Review digest: {preview.value.digest}</p>
      <pre>{JSON.stringify(preview.value.document.action, null, 2)}</pre>
      {preview.value.document.warnings.map((text) => <Alert as="p" tone="warning" className="settings-warning" key={text}>{text}</Alert>)}
      {preview.value.document.resource && <details><summary>Current remote content (untrusted)</summary><pre>{preview.value.document.resource.content}</pre></details>}
      {preview.value.document.confirmations.map((text) => <label className="check-setting" key={text}><SettingsInput type="checkbox" role={preview.value.document.confirmations.length > 1 ? "checkbox" : "switch"} checked={confirmations.includes(text)} disabled={Boolean(busy)}
        onChange={(event) => setConfirmations(event.target.checked ? [...confirmations, text] : confirmations.filter((value) => value !== text))} />{text}</label>)}
      <button className="primary" disabled={Boolean(busy) || !(kind === "github.ci.watch" ? allowed : canWrite) || preview.value.document.confirmations.some((text) => !confirmations.includes(text))}
        onClick={() => void run("Starting operation...", async (isCurrent) => {
          const captured = preview.value; setPreview(null); setConfirmations([]);
          const result = await api.execute(captured, captured.document.confirmations.filter((text) => confirmations.includes(text)), true);
          if (isCurrent() && result.id) { setSelectedId(result.id); focusResult.current = true; setNotice("Operation started. Check its result below; nothing is retried or cleaned up automatically."); }
        })} aria-label="Execute only this reviewed operation">Execute</button>
    </section>}
    <details><summary>Read GitHub issues, PRs, reviews, checks, runs, logs, releases, tags, files and settings</summary>
      <SettingsHelp label="More about this setting" target={<label className="setting-field"><span id={`${uid}-resource`}>GitHub resource</span><select aria-labelledby={`${uid}-resource`} disabled={Boolean(busy)} value={resource} onChange={(event) => setResource(event.target.value as typeof resource)}>
        {["search", "issues", "issue", "pulls", "pull", "files", "reviews", "comments", "review-comments", "threads", "checks", "runs", "run", "jobs", "logs", "annotations", "releases", "release", "release-latest", "release-tag", "tags", "contents", "settings", "rulesets", "branch-rules", "commits", "timeline", "labels", "assignees"].map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>} descriptionFirst>Read-only, one page at a time, using the repository and gh account above.</SettingsHelp>
      {resource === "search" && <label className="setting-field">Issue and PR search terms<SettingsInput value={searchQuery} maxLength={2000} placeholder="is:issue is:open (UI OR UX OR redesign OR polish)" onChange={(event) => setSearchQuery(event.target.value)} /></label>}
      {(resource === "run" || resource === "jobs" || resource === "logs") && <label className="setting-field">Workflow run ID<SettingsInput type="number" min={1} value={runId} onChange={(event) => setRunId(event.target.value)} /></label>}
      {resource === "annotations" && <><label className="setting-field">Check run ID<SettingsInput type="number" min={1} value={checkRunId} onChange={(event) => setCheckRunId(event.target.value)} /></label>
        <label className="setting-field">Check run head SHA<SettingsInput value={headSha} onChange={(event) => setHeadSha(event.target.value)} /></label></>}
      {resource === "release-tag" && <label className="setting-field">Release tag<SettingsInput value={tag} onChange={(event) => setTag(event.target.value)} /></label>}
      {resource === "contents" && <><label className="setting-field">Repository path<SettingsInput value={contentPath} placeholder="README.md" onChange={(event) => setContentPath(event.target.value)} /></label>
        <label className="setting-field">Branch, tag or commit (optional)<SettingsInput value={contentRef} onChange={(event) => setContentRef(event.target.value)} /></label></>}
      {resource === "branch-rules" && <label className="setting-field">Branch<SettingsInput value={rulesBranch} placeholder="main" onChange={(event) => setRulesBranch(event.target.value)} /></label>}
      <button disabled={Boolean(busy) || !allowed || !repository || !account} onClick={() => void browse()}>Read GitHub page</button>
      {browsed?.scope === scopeKey && <><p className="fine-print">{browsed.result.warning} Page {browsed.result.page}.</p>
        {browsed.result.items.map((item) => <details key={`${item.kind}-${item.nodeId ?? item.id}`}><summary>{item.number ? `#${item.number} ` : ""}{item.title || item.kind} / {item.state} {item.conclusion}</summary>
          <p className="fine-print path">{item.url}<br />Head: {item.headSha ?? "not disclosed"}</p><pre>{item.body}</pre></details>)}
        {browsed.result.page > 1 && <button disabled={Boolean(busy)} onClick={() => void browse(browsed.result.page - 1)}>Previous GitHub page</button>}
        {browsed.result.nextPage && <button disabled={Boolean(busy)} onClick={() => void browse(browsed.result.nextPage!)}>Next GitHub page</button>}
      </>}
    </details>
    <SettingsHelp label="More about this setting" target={<label className="setting-field"><span id={`${uid}-retained`}>Operation history</span><select aria-labelledby={`${uid}-retained`} value={selectedId} disabled={Boolean(busy)} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose an operation</option>{records.map((value) => <option key={value.id} value={value.id}>{value.kind} / {value.status} / {value.projectId} / {value.createdAt}</option>)}
    </select></label>}>Shows this profile's Git and GitHub operations from every project, including deleted ones.</SettingsHelp>
    {value && <section className="candidate-section" aria-label="Retained Git/GitHub outcome">
      <SettingsHelp label="More about this setting" target={<h3 tabIndex={-1} ref={resultHeading}>Git/GitHub operation {value.operation.status}</h3>}>Interrupted writes are marked partial and never retried or rolled back automatically. Each new write, including rebase continue or abort, needs its own review.</SettingsHelp>
      <p className="fine-print path">Command: {value.operation.commandId}<br />Root: {value.operation.root.root}<br />Job: {value.operation.jobId}<br />
        Dispatched: {String(value.operation.dispatched)}. Cancel requested: {String(value.operation.cancelRequested)}.</p>
      {value.operation.diagnostic && <Alert as="p" className="settings-warning" role="alert">{value.operation.diagnostic}</Alert>}
      {value.result?.ci && <p role="status">CI at {value.result.ci.headSha}: {value.result.ci.state}. {value.result.ci.deadlineReached ? "Wait time ran out; pending or missing checks don't count as success." : "Result for this commit only, not branch protection status."}</p>}
      {value.result && <details open><summary>Result (untrusted data)</summary><pre>{JSON.stringify(value.result, null, 2)}</pre></details>}
      <details><summary>Your review</summary><pre>{JSON.stringify(value.document, null, 2)}</pre></details>
      {value.operation.status === "partial" && value.operation.kind.startsWith("git.") && !value.operation.inspection && <section className="candidate-binding" aria-label="Partial Git inspection acknowledgement">
        <Alert as="p" tone="warning" className="settings-warning">Acknowledging only records that you checked the repository. The operation stays partial, and nothing is stopped, undone or retried.</Alert>
        <label className="check-setting"><SettingsInput type="checkbox" checked={inspectionReviewed} disabled={Boolean(busy)} onChange={(event) => setInspectionReviewed(event.target.checked)} />I checked this partial Git operation, its input and its possible effects on the repository</label>
        <button disabled={Boolean(busy) || !inspectionReviewed} onClick={() => void run("Recording your inspection...", async (isCurrent) => {
          await api.acknowledge(value.operation.id, value.operation.revision, value.operation.inputDigest, true);
          if (isCurrent()) { setInspectionReviewed(false); setNotice("Inspection recorded. The operation stays partial."); }
        })} aria-label="Confirm inspection of partial Git operation">Confirm inspection</button>
      </section>}
      {value.operation.inspection && <p className="fine-print" role="status">You inspected this at {value.operation.inspection.at} (revision {value.operation.inspection.observedRevision}). Status remains {value.operation.status}.</p>}
      {value.operation.status === "running" && <button disabled={Boolean(busy)} onClick={() => void run("Requesting cancellation...", async () => { await api.cancel(value.operation.id); })} aria-label="Cancel this owned operation">Cancel</button>}
    </section>}
  </section>;
}
