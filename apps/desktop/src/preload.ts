import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./bridge.d.ts";

const bridge: DesktopBridge = {
  connection: () => ipcRenderer.invoke("moguri:connection"),
  profile: (profileId) => ipcRenderer.invoke("moguri:profile", profileId),
  chooseProject: (purpose) => ipcRenderer.invoke("moguri:choose-project", purpose),
  chooseFile: (path) => ipcRenderer.invoke("moguri:choose-file", path),
  chooseAttachment: (kind) => ipcRenderer.invoke("moguri:choose-attachment", kind),
  openExternal: (url) => ipcRenderer.invoke("moguri:open-external", url),
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
  onNativeError: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, profileId: unknown, message: unknown) => { if (typeof profileId === "string" && typeof message === "string" && message.length <= 2048) listener(profileId, message); };
    ipcRenderer.on("moguri:native-error", receive);
    return () => ipcRenderer.removeListener("moguri:native-error", receive);
  },
  applyApplicationPreferences: () => ipcRenderer.invoke("moguri:application-preferences"),
  chooseStorageDirectory: () => ipcRenderer.invoke("moguri:choose-storage-directory"),
  relocateStorage: (path, expectedDigest) => ipcRenderer.invoke("moguri:relocate-storage", path, expectedDigest),
  onOpenSettings: (listener) => {
    const receive = () => listener();
    ipcRenderer.on("moguri:open-settings", receive);
    return () => ipcRenderer.removeListener("moguri:open-settings", receive);
  },
  copyText: (text) => ipcRenderer.invoke("moguri:copy-text", text),
  saveDocument: (document) => ipcRenderer.invoke("moguri:save-document", document),
  preview: (input, profileId) => ipcRenderer.invoke("moguri:preview", input, profileId),
  onNavigateSession: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown, profileId: unknown) => {
      if (typeof id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(id) && typeof profileId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) listener(id, profileId);
    };
    ipcRenderer.on("moguri:navigate-session", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-session", receive);
  },
};
contextBridge.exposeInMainWorld("moguri", bridge);
