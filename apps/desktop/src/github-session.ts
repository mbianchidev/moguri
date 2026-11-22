import type { GithubScope, Session, Snapshot } from "@moguri-dev/sdk";

/** The exact Local project scope a session's GitHub reads and writes use, or null when the session has no Local project. */
export function sessionGithubScope(session: Session): GithubScope | null {
  return session.projectId && session.controls.env === "Local" ? { env: "Local", projectId: session.projectId,
    sessionId: session.id, ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}) } : null;
}
/** Whether the user may start reviewed GitHub writes from this session: a Local agent session that is not read-only or archived. */
export function sessionGithubWritable(session: Session, snapshot: Snapshot): boolean {
  return Boolean(sessionGithubScope(session) && snapshot.policy.allowedEnvs.includes("Local") && session.kind === "agent" && session.mode === "agent" &&
    session.pendingMode !== "read-only" && session.status !== "archived");
}
