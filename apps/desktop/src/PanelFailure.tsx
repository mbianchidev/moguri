import { createContext, useContext } from "react";
import { Alert } from "./Alert.tsx";

export interface PanelFailure { message: string; code: string | null }
export type ProjectFolderAction = (projectId: string, action: "relocate" | "remove-project") => void;
export const ProjectFolderActions = createContext<ProjectFolderAction | null>(null);

export function panelFailure(error: unknown, fallback: string): PanelFailure {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
  return { message: error instanceof Error ? error.message : fallback, code };
}

/** Git reports a folder without a repository as a failed read; panels show it as an expected empty state with the exact detail on demand. */
export const notGitRepository = (failure: PanelFailure) => /\bnot a git repository\b/i.test(failure.message);

export function PanelError({ failure, projectId }: { failure: PanelFailure | null; projectId: string | null }) {
  const act = useContext(ProjectFolderActions);
  if (!failure) return null;
  if (notGitRepository(failure)) return <div className="panel-empty" role="status">
    <p>This folder isn't a Git repository, so there are no branches, file changes or linked GitHub items to show.</p>
    <details className="panel-empty-detail"><summary>Details</summary><p className="path">{failure.message}</p></details>
  </div>;
  const missing = failure.code === "project_folder_missing" && projectId && act;
  return <Alert as="div" className="inline-error" role="alert">
    <p>{failure.message}</p>
    {missing && <div className="button-row">
      <button type="button" onClick={() => act(projectId, "relocate")}>Change attached folder…</button>
      <button type="button" className="danger" onClick={() => act(projectId, "remove-project")}>Remove project…</button>
    </div>}
  </Alert>;
}
