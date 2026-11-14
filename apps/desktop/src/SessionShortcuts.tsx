import { useEffect, useMemo, useState } from "react";
import { githubItemIdentity, sessionBackgroundWork, sessionPullRequestUrls, workspaceDiffSummary, type MoguriSdk, type Session, type SessionActivity, type SessionPanel, type Snapshot, type WorkspaceDiffSummary } from "../../../packages/sdk/src/index.ts";
import { useTaskProgress } from "../../../packages/sdk/src/react.ts";
import { Icon } from "./Icon.tsx";
import { Tooltip } from "./Tooltip.tsx";

export function SessionShortcuts({ sdk, session, snapshot, activity, activityError, open }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; activity: SessionActivity | null; activityError: string | null;
  open: (panel: SessionPanel, ownership?: "agent") => Promise<void>;
}) {
  const project = snapshot.projects.find((value) => value.id === session.projectId);
  const workspace = snapshot.managedWorkspaces.find((value) => value.id === session.workspaceId);
  const scope = JSON.stringify([sdk.profileId, sdk.connection.storeId, sdk.getState().status, session.id, session.projectId, session.repositories, session.controls, session.workspaceId, session.sandboxWorkspaceId,
    project?.path, workspace?.revision, snapshot.projectConfigurations.find((value) => value.projectId === session.projectId)?.revision,
    snapshot.policy.revision, snapshot.settings.revision, snapshot.settings.permissionRevision, session.turnId, session.status]);
  const [git, setGit] = useState<{ sdk: MoguriSdk; scope: string; summary: WorkspaceDiffSummary | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (!session.projectId || session.repositories || sdk.getState().status !== "connected") return;
    void sdk.workspaces.git(session.id).then((value) => {
      const summary = workspaceDiffSummary(value.diff);
      if (active) setGit({ sdk, scope, summary, error: null });
    }).catch((error: unknown) => {
      if (active) setGit({ sdk, scope, summary: null, error: error instanceof Error ? error.message : "Workspace changes are unavailable. Open Changes to inspect the bound root." });
    });
    return () => { active = false; };
  }, [sdk, scope]);
  const currentGit = git?.sdk === sdk && git.scope === scope ? git : null, summary = currentGit?.summary;
  const gitHint = !session.projectId && !session.repositories ? "Changes needs an explicit project." : session.repositories ?
    "Choose an exact repository in Changes. No first repository was assumed." : currentGit?.error ??
      (summary ? `Last observed ${summary.additions} added and ${summary.deletions} removed tracked text lines relative to HEAD; excludes untracked/protected files.${summary.binaryFiles ? ` ${summary.binaryFiles} binary file changes have no line totals.` : ""}` :
        "Reading changes from this session's bound workspace.");
  const turnId = session.turnId ?? session.messages.findLast((message) => message.role === "user")?.turnId;
  const plan = useTaskProgress(sdk, session.taskPlan && session.taskPlan.turnId === turnId ? session : undefined, sdk.getState().status === "connected");
  const planCount = plan.progress?.plan?.steps.length;
  const planHint = plan.error ?? (planCount === undefined ? "Open Plan. No current owning-turn model plan has been observed." : `${planCount} model-reported plan items, not proof of acceptance or successful completion.`);
  const prUrl = sessionPullRequestUrls(session, snapshot)[0];
  const pr = useMemo(() => {
    if (!prUrl) return { number: null, hint: "Open Code change. This session has no linked pull request." };
    try {
      const identity = githubItemIdentity(prUrl);
      if (identity.kind !== "pull") throw new Error("The linked source is not a pull request.");
      return { number: identity.number, hint: `Open linked PR #${identity.number}. This retained association is not a merge-readiness claim.` };
    } catch (error) {
      return { number: null, hint: `The linked PR could not be identified: ${error instanceof Error ? error.message : "Inspect the original association in Code change."}` };
    }
  }, [prUrl]);
  const background = sessionBackgroundWork(session, snapshot, activityError ? null : activity);
  const backgroundHint = activityError ? `Running command activity is unavailable: ${activityError}. Known agents and watch jobs remain visible.` :
    `${background.agents.length} active agents, ${background.commands.length} observed running commands and ${background.jobs.length} active command/watch jobs.${background.complete ? "" : " Activity is incomplete; the count is a lower bound."} Opens Terminal / Agent, never a User console.`;
  const artifacts = snapshot.artifacts.filter((artifact) => artifact.status !== "archived").length;
  const artifactsHint = `${artifacts} active retained artifacts in this profile, including other chats. Opens the existing artifact resource.`;
  return <nav className="session-shortcuts" aria-label="Session shortcuts" data-session-id={session.id}>
    <Tooltip dismissOnClick content={gitHint}><button type="button" aria-label="Open changes" aria-description={gitHint} onClick={() => void open("Changes")}>
      <Icon name={currentGit?.error ? "Info" : "Changes"} />Changes
      {summary && (summary.additions > 0 || summary.deletions > 0) && <><span className="shortcut-additions">+{summary.additions}</span><span className="shortcut-deletions">-{summary.deletions}</span></>}
      {summary && summary.binaryFiles > 0 && <span className="shortcut-count">{summary.binaryFiles} binary</span>}
    </button></Tooltip>
    <Tooltip dismissOnClick content={pr.hint}><button type="button" aria-label="Open linked pull request" aria-description={pr.hint} onClick={() => void open("Code change")}>
      <Icon name="PR" />PR{pr.number !== null && <span>#{pr.number}</span>}
    </button></Tooltip>
    <Tooltip dismissOnClick content={planHint}>
      <button type="button" aria-label="Open model plan" aria-description={planHint} onClick={() => void open("Plan")}><Icon name="Plan" />Plan{planCount !== undefined && <span className="shortcut-count">{planCount}</span>}</button>
    </Tooltip>
    <Tooltip dismissOnClick content={backgroundHint}><button type="button" aria-label="Open background activity" aria-description={backgroundHint} onClick={() => void open("Terminal", "agent")}>
      <Icon name="Terminal" />Background{background.complete || background.count > 0 ? <span className="shortcut-count">{background.count}{!background.complete && "+"}</span> : null}
    </button></Tooltip>
    <Tooltip dismissOnClick content={artifactsHint}>
      <button type="button" aria-label="Open artifacts" aria-description={artifactsHint} onClick={() => void open("Artifacts")}><Icon name="Artifacts" />Artifacts<span className="shortcut-count">{artifacts}</span></button>
    </Tooltip>
  </nav>;
}
