import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./bridge.d.ts";
import type { RendererTrayAction } from "./tray-menu.ts";

const bridge: DesktopBridge = {
  previewHtml: (input, profileId) => ipcRenderer.invoke("moguri:html-preview", input, profileId),
  onHtmlDismiss: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown) => { if (typeof id === "string" && id.length <= 128) listener(id); };
    ipcRenderer.on("moguri:html-dismiss", receive);
    return () => ipcRenderer.removeListener("moguri:html-dismiss", receive);
  },
  connection: () => ipcRenderer.invoke("moguri:connection"),
  startupContext: () => ipcRenderer.invoke("moguri:startup-context"),
  startupStatus: () => ipcRenderer.invoke("moguri:startup-status"),
  reconnectStartup: (revision) => ipcRenderer.invoke("moguri:startup-reconnect", revision),
  profile: (profileId) => ipcRenderer.invoke("moguri:profile", profileId),
  chooseProject: (purpose) => ipcRenderer.invoke("moguri:choose-project", purpose),
  chooseFile: (path) => ipcRenderer.invoke("moguri:choose-file", path),
  chooseAttachment: (kind) => ipcRenderer.invoke("moguri:choose-attachment", kind),
  chooseVoiceModel: () => ipcRenderer.invoke("moguri:choose-voice-model"),
  choosePath: (input) => ipcRenderer.invoke("moguri:choose-path", input),
  homeDirectory: process.argv.find((value) => value.startsWith("--moguri-home="))?.slice("--moguri-home=".length) ?? "",
  automaticOnboarding: process.argv.includes("--moguri-onboarding=automatic"),
  loadNotificationSound: (profileId, path) => ipcRenderer.invoke("moguri:load-notification-sound", profileId, path),
  openExternal: (url) => ipcRenderer.invoke("moguri:open-external", url),
  projectLocation: (profileId, projectId, expectedPath, action) => ipcRenderer.invoke("moguri:project-location", profileId, projectId, expectedPath, action),
  sessionLocation: (profileId, sessionId, action) => ipcRenderer.invoke("moguri:session-location", profileId, sessionId, action),
  revealArtifact: (profileId, projectId, path) => ipcRenderer.invoke("moguri:reveal-artifact", profileId, projectId, path),
  trashArtifacts: (profileId, projectId, paths) => ipcRenderer.invoke("moguri:trash-artifacts", profileId, projectId, paths),
  globalSkillSources: (profileId) => ipcRenderer.invoke("moguri:global-skill-sources", profileId),
  createGlobalSkillFolder: (profileId, id) => ipcRenderer.invoke("moguri:create-global-skill-folder", profileId, id),
  audioPermission: (input) => ipcRenderer.invoke("moguri:audio-permission", input),
  releaseAudioPermission: (id) => ipcRenderer.invoke("moguri:audio-release", id),
  onAudioStop: (listener) => {
    const receive = () => listener();
    ipcRenderer.on("moguri:audio-stop", receive);
    return () => ipcRenderer.removeListener("moguri:audio-stop", receive);
  },
  chooseNotificationSound: (profileId) => ipcRenderer.invoke("moguri:choose-notification-sound", profileId),
  previewNotificationSound: (profileId, kind, soundId) => ipcRenderer.invoke("moguri:preview-notification-sound", profileId, kind, soundId),
  onNotificationAudio: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, profileId: unknown, audio: unknown) => { if (typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId) && typeof audio === "string" && audio.length <= 430_000) listener(profileId, audio); };
    ipcRenderer.on("moguri:notification-audio", receive);
    return () => ipcRenderer.removeListener("moguri:notification-audio", receive);
  },
  onNavigateInbox: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown, profileId: unknown) => {
      if (typeof id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(id) &&
        typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(id, profileId);
    };
    ipcRenderer.on("moguri:navigate-inbox", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-inbox", receive);
  },
  onTrayAction: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, action: unknown, profileId: unknown) => {
      if (trayAction(action) && typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(action, profileId);
    };
    ipcRenderer.on("moguri:tray-action", receive);
    return () => ipcRenderer.removeListener("moguri:tray-action", receive);
  },
  takeTrayAction: async () => {
    const value: unknown = await ipcRenderer.invoke("moguri:take-tray-action");
    return value && typeof value === "object" && "action" in value && "profileId" in value && trayAction(value.action) &&
      typeof value.profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value.profileId) ? { action: value.action, profileId: value.profileId } : null;
  },
  onNavigateSuggestions: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, profileId: unknown) => {
      if (typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(profileId);
    };
    ipcRenderer.on("moguri:navigate-suggestions", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-suggestions", receive);
  },
  onNativeError: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, profileId: unknown, message: unknown) => { if (typeof profileId === "string" && typeof message === "string" && message.length <= 2048) listener(profileId, message); };
    ipcRenderer.on("moguri:native-error", receive);
    return () => ipcRenderer.removeListener("moguri:native-error", receive);
  },
  applyApplicationPreferences: () => ipcRenderer.invoke("moguri:application-preferences"),
  cliInstallation: (input) => ipcRenderer.invoke("moguri:cli-installation", input),
  chooseStorageDirectory: () => ipcRenderer.invoke("moguri:choose-storage-directory"),
  relocateStorage: (path, expectedDigest) => ipcRenderer.invoke("moguri:relocate-storage", path, expectedDigest),
  installUpdate: (id, expectedDigest) => ipcRenderer.invoke("moguri:install-update", id, expectedDigest),
  onUpdateAvailable: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown, version: unknown) => {
      if (typeof id === "string" && /^[a-f0-9-]{36}$/.test(id) && typeof version === "string" && version.length <= 100) listener(id, version);
    };
    ipcRenderer.on("moguri:update-available", receive);
    return () => ipcRenderer.removeListener("moguri:update-available", receive);
  },
  onOpenSettings: (listener) => {
    const receive = () => listener();
    ipcRenderer.on("moguri:open-settings", receive);
    return () => ipcRenderer.removeListener("moguri:open-settings", receive);
  },
  copyText: (text) => ipcRenderer.invoke("moguri:copy-text", text),
  unloadBlocked: (reason) => { ipcRenderer.sendSync("moguri:unload-blocked", reason); },
  draftsSettled: (result) => ipcRenderer.send("moguri:drafts-settled", result),
  saveDocument: (document) => ipcRenderer.invoke("moguri:save-document", document),
  preview: (input, profileId, closingSessionId) => ipcRenderer.invoke("moguri:preview", input, profileId, closingSessionId),
  browserControl: (sessionId, enabled, profileId) => ipcRenderer.invoke("moguri:browser-control", sessionId, enabled, profileId),
  onNavigateSession: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown, profileId: unknown) => {
      if (typeof id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(id) && typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(id, profileId);
    };
    ipcRenderer.on("moguri:navigate-session", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-session", receive);
  },
  onNavigateWork: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown, profileId: unknown) => {
      if (typeof id === "string" && /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/.test(id) &&
        typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(id, profileId);
    };
    ipcRenderer.on("moguri:navigate-work", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-work", receive);
  },
};
const RENDERER_TRAY_ACTIONS = new Set(["new-chat", "new-project", "new-session", "archive"]);
/** Only the window-owned tray actions cross into the renderer, with well-formed IDs. */
function trayAction(value: unknown): value is RendererTrayAction {
  if (!value || typeof value !== "object" || !("kind" in value) || typeof value.kind !== "string" || !RENDERER_TRAY_ACTIONS.has(value.kind)) return false;
  const id = (key: string) => key in value && typeof (value as Record<string, unknown>)[key] === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(String((value as Record<string, unknown>)[key]));
  return value.kind === "new-session" ? id("projectId") : value.kind === "archive" ? id("sessionId") : true;
}
contextBridge.exposeInMainWorld("moguri", bridge);
