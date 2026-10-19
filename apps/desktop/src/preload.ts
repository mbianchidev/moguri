import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./bridge.d.ts";

const bridge: DesktopBridge = {
  connection: () => ipcRenderer.invoke("moguri:connection"),
  chooseProject: () => ipcRenderer.invoke("moguri:choose-project"),
  chooseFile: (path) => ipcRenderer.invoke("moguri:choose-file", path),
  openExternal: (url) => ipcRenderer.invoke("moguri:open-external", url),
  microphonePermission: () => ipcRenderer.invoke("moguri:microphone-permission"),
  copyText: (text) => ipcRenderer.invoke("moguri:copy-text", text),
  preview: (input) => ipcRenderer.invoke("moguri:preview", input),
};
contextBridge.exposeInMainWorld("moguri", bridge);
