import type { SystemPreferences } from "electron";

export async function microphonePermission(purpose: "capture" | "devices" | "standby",
  permissions: Pick<SystemPreferences, "getMediaAccessStatus" | "askForMediaAccess">): Promise<{ allowed: boolean; prompted: boolean }> {
  if (permissions.getMediaAccessStatus("microphone") === "granted") return { allowed: true, prompted: false };
  if (purpose === "standby") return { allowed: false, prompted: false };
  return { allowed: await permissions.askForMediaAccess("microphone"), prompted: true };
}
