import { app, BrowserWindow, dialog, ipcMain, protocol, shell, systemPreferences } from "electron";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureConnection, stateDirectory } from "../../../packages/sdk/src/node.ts";
import type { Connection } from "../../../packages/protocol/src/index.ts";

protocol.registerSchemesAsPrivileged([{ scheme: "moguri", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const require = createRequire(import.meta.url);
let connection: Connection;
let mainWindow: BrowserWindow | null = null;
const trusted = (event: Electron.IpcMainInvokeEvent) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith("moguri://app/")) {
    throw new Error("Only Moguri's main renderer may request native capabilities.");
  }
};
if (process.env.MOGURI_STATE_DIR) {
  const userData = join(stateDirectory(), "electron");
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  app.setPath("userData", userData);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  void app.whenReady().then(async () => {
    const connect = async () => {
      connection = await ensureConnection({ runtime: require.resolve("node/bin/node"), servicePath: join(app.getAppPath(), "dist", "service.mjs") });
      return { ...connection, baseUrl: "moguri://app" };
    };
    await mkdir(app.getPath("userData"), { recursive: true, mode: 0o700 });
    await connect();
    const rendererRoot = join(app.getAppPath(), "dist", "desktop", "renderer");
    protocol.handle("moguri", async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Unknown Moguri origin.", { status: 403 });
      if (url.pathname.startsWith("/v1/")) {
        if (!["GET", "POST"].includes(request.method) || !["/v1/snapshot", "/v1/commands", "/v1/query", "/v1/health"].includes(url.pathname) || url.search) return new Response("Unsupported protocol route.", { status: 404 });
        return fetch(`${connection.baseUrl}${url.pathname}`, {
          method: request.method,
          headers: { Authorization: `Bearer ${connection.token}`, Origin: "moguri://app", "Content-Type": "application/json" },
          ...(request.method === "POST" ? { body: await request.text() } : {}),
          signal: AbortSignal.timeout(20_000),
        });
      }
      const path = resolve(rendererRoot, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      if (!path.startsWith(rendererRoot + sep)) return new Response("Path denied.", { status: 403 });
      try {
        const bytes = await readFile(path);
        const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
        return new Response(bytes, { headers: { "Content-Type": mime[extname(path)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
      } catch { return new Response("Moguri asset missing. Rebuild the app.", { status: 404 }); }
    });
    ipcMain.handle("moguri:connection", async (event) => { trusted(event); return connect(); });
    ipcMain.handle("moguri:choose-project", async (event) => {
      trusted(event);
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Open a Moguri project", properties: ["openDirectory"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-file", async (event, projectPath: unknown) => {
      trusted(event);
      if (typeof projectPath !== "string") throw new Error("Project path required.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Attach a project text file", defaultPath: projectPath, properties: ["openFile"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:open-external", async (event, input: unknown) => {
      trusted(event);
      if (typeof input !== "string") throw new Error("URL required.");
      const url = new URL(input);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only explicit HTTPS links can be opened.");
      await shell.openExternal(url.toString());
    });
    ipcMain.handle("moguri:microphone-permission", async (event) => {
      trusted(event);
      return process.platform === "darwin" ? systemPreferences.askForMediaAccess("microphone") : true;
    });
    const createWindow = async () => {
      mainWindow = new BrowserWindow({
        title: "Moguri", width: 1440, height: 940, minWidth: 840, minHeight: 620,
        show: process.env.MOGURI_TEST_WINDOW !== "hidden", titleBarStyle: "hiddenInset", backgroundColor: "#141922",
        icon: join(app.getAppPath(), "dist", "branding", "moguri.png"),
        webPreferences: { preload: join(dirname(fileURLToPath(import.meta.url)), "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
      });
      mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      mainWindow.webContents.session.setPermissionCheckHandler(() => false);
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      mainWindow.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("moguri://app/")) event.preventDefault(); });
      mainWindow.webContents.on("will-prevent-unload", (event) => {
        const choice = dialog.showMessageBoxSync(mainWindow!, {
          type: "warning", title: "Draft edits are not saved yet", message: "Keep Moguri open until the draft is saved, or explicitly discard the unsaved edits.",
          buttons: ["Keep saving", "Discard unsaved edits"], defaultId: 0, cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
      });
      mainWindow.on("closed", () => { mainWindow = null; });
      await mainWindow.loadURL("moguri://app/");
    };
    await createWindow();
    app.on("activate", () => { if (!mainWindow) void createWindow(); });
  }).catch((error: unknown) => {
    console.error("Moguri desktop startup failed:", error instanceof Error ? error.message : "Unknown startup error.");
    if (process.env.MOGURI_TEST_WINDOW !== "hidden") dialog.showErrorBox("Moguri could not start", error instanceof Error ? error.message : "Inspect the service log.");
    app.quit();
  });
  app.on("window-all-closed", () => app.quit());
}
