import type { MoguriSdk, Project } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function ProjectLocationActions({ sdk, project, disabled = false, menu = false, run }: {
  sdk: MoguriSdk; project: Project; disabled?: boolean; menu?: boolean; run: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  return <>{([{ action: "show-folder", label: "Show local folder", icon: "Files" }, { action: "open-remote", label: "Open remote", icon: "Link" }] as const).map(({ action, label, icon }) =>
    <button key={action} type="button" role={menu ? "menuitem" : undefined} disabled={disabled}
      onClick={() => void run(() => window.moguri.projectLocation(sdk.profileId, project.id, project.path, action))}><Icon name={icon} />{label}</button>)}</>;
}
