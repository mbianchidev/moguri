import { useEffect, useState } from "react";
import { githubItemIdentity, sessionBackgroundWork, sessionPullRequestUrls, type MoguriSdk, type Session, type SessionPanel, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { useTaskProgress } from "../../../packages/sdk/src/react.ts";

export interface PanelBadge { value: string; hint: string }
export type PanelBadges = Partial<Record<SessionPanel, PanelBadge>>;

export function usePanelBadges(sdk: MoguriSdk, session: Session | undefined, snapshot: Snapshot | null): PanelBadges {
  const connected = sdk.getState().status === "connected";
  const project = snapshot?.projects.find((value) => value.id === session?.projectId);
  const workspace = snapshot?.managedWorkspaces.find((value) => value.id === session?.workspaceId);
  const scope = JSON.stringify([sdk.profileId, sdk.connection.storeId, connected, session?.id, session?.projectId, session?.repositories, session?.controls, session?.workspaceId,
    session?.sandboxWorkspaceId, project?.path, workspace?.revision, snapshot?.projectConfigurations.find((value) => value.projectId === session?.projectId)?.revision,
    snapshot?.policy.revision, snapshot?.settings.revision, snapshot?.settings.permissionRevision, session?.turnId, session?.status]);
  const [changes, setChanges] = useState<{ scope: string; files: number } | null>(null);
  useEffect(() => {
    let active = true;
    if (!session?.projectId || session.repositories || !connected) return;
    void sdk.workspaces.git(session.id, false).then((value) => {
      if (active) setChanges({ scope, files: value.status.split("\n").filter(Boolean).length });
    }).catch((error: unknown) => {
      console.error("Code change count is unavailable:", error instanceof Error ? error.message : "workspace read failed");
      if (active) setChanges(null);
    });
    return () => { active = false; };
  }, [sdk, scope]);
  const turnId = session?.turnId ?? session?.messages.findLast((message) => message.role === "user")?.turnId;
  const plan = useTaskProgress(sdk, session?.taskPlan && session.taskPlan.turnId === turnId ? session : undefined, connected);
  if (!session || !snapshot) return {};
  const badges: PanelBadges = {};
  const background = sessionBackgroundWork(session, snapshot, null);
  const jobCalls = new Set(background.jobs.map((job) => JSON.stringify([job.parentTurnId, job.commandJob.callId])));
  const commands = new Set(session.processes.filter((process) => process.outcome === "running" && process.turnId === session.turnId &&
    !jobCalls.has(JSON.stringify([process.turnId, process.callId]))).map((process) => process.callId)).size;
  const running = background.agents.length + background.jobs.length + commands;
  if (running > 0) badges.Terminal = { value: String(running),
    hint: `${background.agents.length} running subagents, ${commands} running agent commands and ${background.jobs.length} active command/watch jobs. Opens Terminal / Agent, never a User console.` };
  const steps = plan.progress?.plan?.steps.length;
  if (steps) badges.Plan = { value: String(steps), hint: `${steps} model-reported plan items, not proof of acceptance or successful completion.` };
  const files = changes?.scope === scope ? changes.files : 0;
  const prUrl = session.repositories ? undefined : sessionPullRequestUrls(session, snapshot)[0];
  let pr: number | null = null;
  try { if (prUrl) { const identity = githubItemIdentity(prUrl); if (identity.kind === "pull") pr = identity.number; } }
  catch (error) { console.error("Linked pull request is unreadable:", error instanceof Error ? error.message : "invalid association"); }
  if (files > 0) badges["Code change"] = { value: String(files),
    hint: `${files} changed ${files === 1 ? "file" : "files"} in this session's bound workspace${pr === null ? "" : `; linked PR #${pr}`}. Excludes protected paths.` };
  return badges;
}
