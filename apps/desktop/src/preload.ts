import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./bridge.d.ts";

const bridge: DesktopBridge = {
  connection: () => ipcRenderer.invoke("moguri:connection"),
  chooseProject: () => ipcRenderer.invoke("moguri:choose-project"),
  chooseFile: (path) => ipcRenderer.invoke("moguri:choose-file", path),
  chooseAttachment: (kind) => ipcRenderer.invoke("moguri:choose-attachment", kind),
  openExternal: (url) => ipcRenderer.invoke("moguri:open-external", url),
  microphonePermission: () => ipcRenderer.invoke("moguri:microphone-permission"),
  copyText: (text) => ipcRenderer.invoke("moguri:copy-text", text),
  preview: (input) => ipcRenderer.invoke("moguri:preview", input),
  onNavigateSession: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, id: unknown) => { if (typeof id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(id)) listener(id); };
    ipcRenderer.on("moguri:navigate-session", receive);
    return () => ipcRenderer.removeListener("moguri:navigate-session", receive);
  },
};
contextBridge.exposeInMainWorld("moguri", bridge);
