import { app, BrowserWindow, Notification, WebContentsView, clipboard, dialog, ipcMain, protocol, session as electronSession, shell, systemPreferences } from "electron";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureConnection, saveArtifactExport, stateDirectory } from "../../../packages/sdk/src/node.ts";
import type { Connection } from "../../../packages/protocol/src/index.ts";
import { isRecord } from "../../../packages/protocol/src/index.ts";
import { MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { AttentionNotifier } from "./notifications.ts";

protocol.registerSchemesAsPrivileged([{ scheme: "moguri", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const require = createRequire(import.meta.url);
let connection: Connection;
let mainWindow: BrowserWindow | null = null;
let attentionClient: MoguriSdk | undefined;
const banners = new Map<string, Notification>();
let preview: { view: WebContentsView; sessionId: string; url: string } | null = null;
const previewUrl = (input: string) => {
  const url = new URL(input);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("Only explicit HTTPS or loopback HTTP previews are supported.");
  return url;
};
const hidePreview = () => {
  if (!preview) return;
  mainWindow?.contentView.removeChildView(preview.view);
  void preview.view.webContents.session.clearStorageData().catch((error: unknown) => console.error("Preview storage cleanup failed:", error instanceof Error ? error.message : "Unknown preview cleanup error"));
  preview.view.webContents.close(); preview = null;
};
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
    attentionClient = await new MoguriSdk(connection).ready();
    const notifier = new AttentionNotifier(attentionClient.getState().snapshot!.seq);
    attentionClient.subscribe(() => {
      const state = attentionClient?.getState();
      if (!state?.snapshot) return;
      notifier.observe(state.snapshot, state.events, Boolean(mainWindow?.isFocused()), (banner) => {
        if (process.env.MOGURI_TEST_WINDOW === "hidden" || !Notification.isSupported()) return;
        const notification = new Notification({ title: banner.title, body: banner.body, silent: false });
        banners.set(banner.id, notification);
        if (banners.size > 100) { const oldest = banners.keys().next().value!; banners.get(oldest)?.close(); banners.delete(oldest); }
        notification.on("click", () => { mainWindow?.show(); mainWindow?.focus(); mainWindow?.webContents.send("moguri:navigate-session", banner.sessionId); });
        notification.on("close", () => banners.delete(banner.id));
        notification.on("failed", (_event, error) => { banners.delete(banner.id); console.error("Moguri OS notification failed:", error); });
        notification.show();
      });
    });
    const rendererRoot = join(app.getAppPath(), "dist", "desktop", "renderer");
    protocol.handle("moguri", async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Unknown Moguri origin.", { status: 403 });
      if (url.pathname.startsWith("/v1/")) {
        if (!["GET", "POST"].includes(request.method) || !["/v1/snapshot", "/v1/commands", "/v1/query", "/v1/terminal", "/v1/health"].includes(url.pathname) || url.search) return new Response("Unsupported protocol route.", { status: 404 });
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
        const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
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
    ipcMain.handle("moguri:choose-attachment", async (event, kind: unknown) => {
      trusted(event);
      if (!["file", "image", "folder"].includes(String(kind))) throw new Error("Choose a supported explicit attachment type.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: kind === "folder" ? "Review a context folder" : "Attach explicit client context", properties: [kind === "folder" ? "openDirectory" : "openFile"], ...(kind === "image" ? { filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] } : {}) });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:open-external", async (event, input: unknown) => {
      trusted(event);
      if (typeof input !== "string") throw new Error("URL required.");
      const url = previewUrl(input);
      if (process.env.MOGURI_TEST_WINDOW !== "hidden") await shell.openExternal(url.toString());
    });
    ipcMain.handle("moguri:copy-text", (event, text: unknown) => {
      trusted(event);
      if (typeof text !== "string" || Buffer.byteLength(text) > 512 * 1024) throw new Error("Clipboard text must be bounded to 512 KiB.");
      if (process.env.MOGURI_TEST_WINDOW !== "hidden") clipboard.writeText(text);
    });
    ipcMain.handle("moguri:save-document", async (event, input: unknown) => {
      trusted(event);
      if (!isRecord(input) || typeof input.text !== "string" || Buffer.byteLength(input.text) > 8 * 1024 * 1024 || typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest) || input.mediaType !== "application/json" || typeof input.filename !== "string" || !/^[A-Za-z0-9._-]{1,200}\.json$/.test(input.filename)) throw new Error("Use an exact bounded SDK JSON export.");
      let path: string | undefined;
      if (process.env.MOGURI_TEST_WINDOW === "hidden") {
        const directory = process.env.MOGURI_TEST_EXPORT_DIR;
        if (!directory) throw new Error("Hidden export checks require a generated destination. No real save dialog was opened.");
        path = join(directory, input.filename);
      } else {
        const selected = await dialog.showSaveDialog(mainWindow!, { title: "Export to a new JSON file", defaultPath: input.filename, filters: [{ name: "Moguri artifact export", extensions: ["json"] }] });
        if (selected.canceled) return null;
        path = selected.filePath;
      }
      if (!path) throw new Error("No export destination was selected.");
      return saveArtifactExport(path, { filename: input.filename, mediaType: "application/json", text: input.text, digest: input.digest });
    });
    ipcMain.handle("moguri:preview", async (event, input: unknown) => {
      trusted(event);
      if (input === null) { hidePreview(); return; }
      if (!isRecord(input) || typeof input.sessionId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(input.sessionId) || typeof input.url !== "string" || !isRecord(input.bounds)) throw new Error("A scoped preview URL and bounds are required.");
      const url = previewUrl(input.url);
      const fields = ["x", "y", "width", "height"] as const;
      for (const field of fields) if (typeof input.bounds[field] !== "number" || !Number.isFinite(input.bounds[field])) throw new Error("Preview bounds must be finite numbers.");
      if (!preview || preview.sessionId !== input.sessionId) {
        hidePreview();
        const isolated = electronSession.fromPartition(`moguri-preview-${input.sessionId}`, { cache: false });
        isolated.setPermissionRequestHandler((_view, _permission, done) => done(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
        const view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
        view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        const navigation = (event: Electron.Event, target: string) => { try { previewUrl(target); } catch { event.preventDefault(); } };
        view.webContents.on("will-navigate", navigation);
        view.webContents.on("will-redirect", navigation);
        preview = { view, sessionId: input.sessionId, url: "" };
        mainWindow!.contentView.addChildView(view);
      }
      const available = mainWindow!.getContentBounds();
      const x = Math.max(0, Math.min(available.width - 1, Math.round(Number(input.bounds.x))));
      const y = Math.max(0, Math.min(available.height - 1, Math.round(Number(input.bounds.y))));
      preview.view.setBounds({ x, y, width: Math.max(1, Math.min(available.width - x, Math.round(Number(input.bounds.width)))), height: Math.max(1, Math.min(available.height - y, Math.round(Number(input.bounds.height)))) });
      if (preview.url !== url.href) { preview.url = url.href; await preview.view.webContents.loadURL(url.href); }
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
          type: "warning", title: "Unsaved changes", message: "Keep Moguri open to save your edits, or explicitly discard them.",
          buttons: ["Keep saving", "Discard unsaved edits"], defaultId: 0, cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
      });
      mainWindow.on("closed", () => { preview?.view.webContents.close(); preview = null; mainWindow = null; });
      await mainWindow.loadURL("moguri://app/");
    };
    await createWindow();
    app.on("activate", () => { if (!mainWindow) void createWindow(); });
  }).catch((error: unknown) => {
    console.error("Moguri desktop startup failed:", error instanceof Error ? error.message : "Unknown startup error.");
    if (process.env.MOGURI_TEST_WINDOW !== "hidden") dialog.showErrorBox("Moguri could not start", error instanceof Error ? error.message : "Inspect the service log.");
    app.quit();
  });
  app.on("window-all-closed", () => { attentionClient?.disconnect(); app.quit(); });
}
