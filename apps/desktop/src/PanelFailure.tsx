import { createContext, useContext } from "react";
import { Alert } from "./Alert.tsx";

export interface PanelFailure { message: string; code: string | null }
export type ProjectFolderAction = (projectId: string, action: "relocate" | "remove-project") => void;
export const ProjectFolderActions = createContext<ProjectFolderAction | null>(null);

export function panelFailure(error: unknown, fallback: string): PanelFailure {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
  return { message: error instanceof Error ? error.message : fallback, code };
}

export function PanelError({ failure, projectId }: { failure: PanelFailure | null; projectId: string | null }) {
  const act = useContext(ProjectFolderActions);
  if (!failure) return null;
  const missing = failure.code === "project_folder_missing" && projectId && act;
  return <Alert as="div" className="inline-error" role="alert">
    <p>{failure.message}</p>
    {missing && <div className="button-row">
      <button type="button" onClick={() => act(projectId, "relocate")}>Change attached folder…</button>
      <button type="button" className="danger" onClick={() => act(projectId, "remove-project")}>Remove project…</button>
    </div>}
  </Alert>;
}
