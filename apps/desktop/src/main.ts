import { app, BrowserWindow, Notification, WebContentsView, clipboard, dialog, ipcMain, powerMonitor, protocol, session as electronSession, shell, systemPreferences } from "electron";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureConnection, loadNotificationSoundFile, saveArtifactExport, stateDirectory } from "../../../packages/sdk/src/node.ts";
import type { Connection } from "../../../packages/protocol/src/index.ts";
import { GLOBAL_PROFILE_ID, isRecord, PROFILE_ID } from "../../../packages/protocol/src/index.ts";
import { audioBase64, defaultNotificationWav, MoguriSdk, type NotificationToneKind } from "../../../packages/sdk/src/index.ts";
import { AttentionNotifier } from "./notifications.ts";

protocol.registerSchemesAsPrivileged([{ scheme: "moguri", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const require = createRequire(import.meta.url);
let connection: Connection;
let mainWindow: BrowserWindow | null = null;
let attentionClient: MoguriSdk | undefined;
let activeProfileId = process.env.MOGURI_PROFILE_ID ?? PROFILE_ID;
let profileEpoch = 0;
let audioGrant: { id: string; profileId: string; epoch: number; expires: number; sessionId: string | null; jobId: string | null } | null = null;
let audioPending = false;
const audioGranted = () => {
  const grant = audioGrant, state = attentionClient?.getState();
  return Boolean(grant && grant.profileId === activeProfileId && grant.epoch === profileEpoch && Date.now() < grant.expires &&
    state?.status === "connected" && (!grant.jobId || state.snapshot?.jobs.some((job) => job.id === grant.jobId && job.sessionId === grant.sessionId && job.kind === "voice.capture" && job.status === "running")));
};
const banners = new Map<string, Notification>();
let preview: { view: WebContentsView; profileId: string; sessionId: string; url: string } | null = null;
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
    const soundError = (profileId: string, error: unknown) => {
      const message = error instanceof Error ? error.message : "Notification audio failed. No alternate sound was substituted.";
      console.error("Moguri notification audio:", message);
      if (profileId === activeProfileId) mainWindow?.webContents.send("moguri:native-error", profileId, message.slice(0, 2048));
    };
    const requestSound = async (scoped: MoguriSdk, epoch: number, kind: NotificationToneKind, soundId: string, sessionId?: string) => {
      const audio = soundId === "default" ? audioBase64(defaultNotificationWav(kind)) : (await scoped.notifications.sound(soundId)).audio;
      if (attentionClient !== scoped || epoch !== profileEpoch || !mainWindow || mainWindow.isDestroyed()) return { requested: false };
      if (sessionId) {
        const snapshot = scoped.getState().snapshot, preferences = snapshot?.settings.values.notifications;
        const choice = kind === "needs-input" ? preferences?.needsInputSound : preferences?.completedSound;
        if (!snapshot?.sessions.some((session) => session.id === sessionId) || !choice?.enabled || choice.id !== soundId ||
          mainWindow.isFocused() && !preferences?.soundWhileFocused) return { requested: false };
      }
      if (process.env.MOGURI_TEST_WINDOW === "hidden") return { requested: false };
      mainWindow.webContents.send("moguri:notification-audio", scoped.profileId, audio);
      return { requested: true };
    };
    const activateProfile = async (profileId: string) => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) throw new Error("Choose one explicit user profile; no Default fallback.");
      if (attentionClient?.profileId === profileId && attentionClient.getState().status === "connected") return profileId;
      const epoch = ++profileEpoch;
      audioGrant = null;
      mainWindow?.webContents.send("moguri:audio-stop");
      const scoped = await new MoguriSdk(connection, async () => { await connect(); return connection; }, profileId).ready();
      if (epoch !== profileEpoch) { scoped.disconnect(); throw new Error("Another profile selection replaced this request. No scope was rebound."); }
      attentionClient?.disconnect();
      attentionClient = scoped; activeProfileId = profileId;
      for (const banner of banners.values()) banner.close(); banners.clear();
      const notifier = new AttentionNotifier(scoped.getState().snapshot!.seq);
      scoped.subscribe(() => {
        if (attentionClient !== scoped) return;
        const state = scoped.getState();
        if (!state.snapshot) return;
        notifier.observe(state.snapshot, state.events, Boolean(mainWindow?.isFocused()), (banner) => {
          if (process.env.MOGURI_TEST_WINDOW === "hidden" || !Notification.isSupported()) return;
          const notification = new Notification({ title: banner.title, body: banner.body, silent: true });
          banners.set(banner.id, notification);
          if (banners.size > 100) { const oldest = banners.keys().next().value!; banners.get(oldest)?.close(); banners.delete(oldest); }
          notification.on("click", () => { mainWindow?.show(); mainWindow?.focus(); mainWindow?.webContents.send("moguri:navigate-session", banner.sessionId, profileId); });
          notification.on("close", () => banners.delete(banner.id));
          notification.on("failed", (_event, error) => { banners.delete(banner.id); console.error("Moguri OS notification failed:", error); });
          notification.show();
        }, (tone) => { void requestSound(scoped, epoch, tone.kind, tone.soundId, tone.sessionId).catch((error: unknown) => soundError(profileId, error)); });
      });
      return profileId;
    };
    await activateProfile(activeProfileId);
    const rendererRoot = join(app.getAppPath(), "dist", "desktop", "renderer");
    protocol.handle("moguri", async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Unknown Moguri origin.", { status: 403 });
      if (url.pathname.startsWith("/v1/")) {
        if (!["GET", "POST"].includes(request.method) || !["/v1/snapshot", "/v1/commands", "/v1/query", "/v1/terminal", "/v1/voice", "/v1/health"].includes(url.pathname) || url.search) return new Response("Unsupported protocol route.", { status: 404 });
        const profileId = request.headers.get("X-Moguri-Profile") ?? PROFILE_ID;
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) return new Response("Profile scope denied.", { status: 403 });
        return fetch(`${connection.baseUrl}${url.pathname}`, {
          method: request.method,
          headers: { Authorization: `Bearer ${connection.token}`, Origin: "moguri://app", "Content-Type": "application/json", "X-Moguri-Profile": profileId },
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
    ipcMain.handle("moguri:profile", async (event, profileId: unknown) => {
      trusted(event);
      if (profileId === undefined) return activeProfileId;
      if (typeof profileId !== "string") throw new Error("An explicit profile ID is required.");
      const selected = await activateProfile(profileId); hidePreview(); return selected;
    });
    ipcMain.handle("moguri:choose-project", async (event, purpose: unknown) => {
      trusted(event);
      if (purpose !== undefined && purpose !== "import" && purpose !== "clone") throw new Error("Choose an import or clone folder explicitly.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: purpose === "clone" ? "Choose the parent folder for this clone" : "Import a local project folder", properties: ["openDirectory"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-file", async (event, projectPath: unknown) => {
      trusted(event);
      if (typeof projectPath !== "string") throw new Error("Project path required.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Attach a project text file", defaultPath: projectPath, properties: ["openFile"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-notification-sound", async (event, profileId: unknown) => {
      trusted(event);
      const epoch = profileEpoch;
      if (profileId !== activeProfileId) throw new Error("Choose a sound only for the active profile.");
      let path: string | undefined;
      if (process.env.MOGURI_TEST_WINDOW === "hidden") {
        path = process.env.MOGURI_TEST_SOUND_FILE;
        if (!path) throw new Error("Hidden sound checks require a generated WAV. No personal file picker was opened.");
      } else {
        const result = await dialog.showOpenDialog(mainWindow!, { title: "Choose a short mono 16-kHz PCM16 notification WAV", properties: ["openFile"], filters: [{ name: "PCM WAV", extensions: ["wav"] }] });
        if (result.canceled) return null;
        path = result.filePaths[0];
      }
      if (!path || epoch !== profileEpoch || profileId !== activeProfileId) throw new Error("The original sound selection changed. No file was imported into another profile.");
      const sound = await loadNotificationSoundFile(path);
      if (epoch !== profileEpoch || profileId !== activeProfileId) throw new Error("The original profile changed while reading the sound. No audio was rebound.");
      return sound;
    });
    ipcMain.handle("moguri:preview-notification-sound", async (event, profileId: unknown, kind: unknown, soundId: unknown) => {
      trusted(event);
      if (profileId !== activeProfileId || !attentionClient || (kind !== "needs-input" && kind !== "completed") ||
        typeof soundId !== "string" || soundId !== "default" && !/^[a-f0-9-]{36}$/.test(soundId)) throw new Error("Choose an exact sound in the active profile.");
      return requestSound(attentionClient, profileEpoch, kind, soundId);
    });
    ipcMain.handle("moguri:choose-attachment", async (event, kind: unknown) => {
      trusted(event);
      if (!["file", "image", "folder", "document"].includes(String(kind))) throw new Error("Choose a supported explicit attachment type.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: kind === "folder" ? "Review a context folder" : "Attach explicit client context", properties: [kind === "folder" ? "openDirectory" : "openFile"], ...(kind === "image" ? { filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] } : kind === "document" ? { filters: [{ name: "Documents", extensions: ["pdf", "xlsx", "docx"] }] } : {}) });
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
    ipcMain.handle("moguri:preview", async (event, input: unknown, profileId: unknown) => {
      trusted(event);
      if (typeof profileId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) throw new Error("A user profile is required for a native preview.");
      if (input === null) { if (preview?.profileId === profileId) hidePreview(); return; }
      if (profileId !== activeProfileId) throw new Error("The preview belongs to an inactive profile. No scope was rebound.");
      if (!isRecord(input) || typeof input.sessionId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(input.sessionId) || typeof input.url !== "string" || !isRecord(input.bounds)) throw new Error("A scoped preview URL and bounds are required.");
      const url = previewUrl(input.url);
      const fields = ["x", "y", "width", "height"] as const;
      for (const field of fields) if (typeof input.bounds[field] !== "number" || !Number.isFinite(input.bounds[field])) throw new Error("Preview bounds must be finite numbers.");
      if (!preview || preview.profileId !== profileId || preview.sessionId !== input.sessionId) {
        const scoped = attentionClient;
        if (!scoped || scoped.profileId !== profileId) throw new Error("The preview profile is not connected.");
        if (!scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId)) await scoped.refresh();
        if (attentionClient !== scoped || activeProfileId !== profileId || !scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId)) throw new Error("This preview session is outside the active profile.");
        hidePreview();
        const isolated = electronSession.fromPartition(`moguri-preview-${profileId}-${input.sessionId}`, { cache: false });
        isolated.setPermissionRequestHandler((_view, _permission, done) => done(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
        const view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
        view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        const navigation = (event: Electron.Event, target: string) => { try { previewUrl(target); } catch { event.preventDefault(); } };
        view.webContents.on("will-navigate", navigation);
        view.webContents.on("will-redirect", navigation);
        preview = { view, profileId, sessionId: input.sessionId, url: "" };
        mainWindow!.contentView.addChildView(view);
      }
      const available = mainWindow!.getContentBounds();
      const x = Math.max(0, Math.min(available.width - 1, Math.round(Number(input.bounds.x))));
      const y = Math.max(0, Math.min(available.height - 1, Math.round(Number(input.bounds.y))));
      preview.view.setBounds({ x, y, width: Math.max(1, Math.min(available.width - x, Math.round(Number(input.bounds.width)))), height: Math.max(1, Math.min(available.height - y, Math.round(Number(input.bounds.height)))) });
      if (preview.url !== url.href) { preview.url = url.href; await preview.view.webContents.loadURL(url.href); }
    });
    ipcMain.handle("moguri:audio-permission", async (event, input: unknown) => {
      trusted(event);
      if (!isRecord(input) || input.profileId !== activeProfileId || !["capture", "devices"].includes(String(input.purpose)) ||
        Object.keys(input).some((key) => !["profileId", "purpose", "sessionId", "jobId"].includes(key)) ||
        input.purpose === "devices" && (input.sessionId !== undefined || input.jobId !== undefined)) throw new Error("Choose an explicit audio-only action in the active profile.");
      if (audioPending) throw new Error("Another explicitly owned audio permission request is still pending.");
      audioPending = true;
      try {
      const scoped = attentionClient, epoch = profileEpoch;
      if (!scoped) throw new Error("The actual profile is not connected.");
      await scoped.refresh();
      const validCapture = () => input.purpose === "devices" || typeof input.sessionId === "string" && typeof input.jobId === "string" &&
        scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId && session.status !== "archived") &&
        scoped.getState().snapshot?.jobs.some((job) => job.id === input.jobId && job.sessionId === input.sessionId && job.kind === "voice.capture" && job.status === "running");
      if (attentionClient !== scoped || epoch !== profileEpoch || !validCapture()) throw new Error("The original audio owner changed. No microphone access was granted.");
      if (audioGranted()) throw new Error("Another explicit microphone permission request is still owned. Finish or cancel it first.");
      const generated = process.env.MOGURI_TEST_WINDOW === "hidden" && app.commandLine.hasSwitch("use-fake-device-for-media-stream");
      if (process.env.MOGURI_TEST_WINDOW === "hidden" && !generated) throw new Error("Hidden audio checks require Chromium's generated media device. No real microphone permission was requested.");
      const allowed = generated || process.platform !== "darwin" || await systemPreferences.askForMediaAccess("microphone");
      if (!allowed) throw new Error("Microphone access was denied. The saved draft was not changed.");
      await scoped.refresh();
      if (event.sender !== mainWindow?.webContents || attentionClient !== scoped || epoch !== profileEpoch || !validCapture()) throw new Error("Audio permission finished for a stale owner. No late microphone was opened.");
      const id = randomUUID();
      audioGrant = { id, profileId: activeProfileId, epoch, expires: Date.now() + 30_000,
        sessionId: input.purpose === "capture" ? String(input.sessionId) : null, jobId: input.purpose === "capture" ? String(input.jobId) : null };
      return id;
      } finally { audioPending = false; }
    });
    ipcMain.handle("moguri:audio-release", (event, id: unknown) => {
      trusted(event);
      if (typeof id !== "string") throw new Error("The original audio permission lease is required.");
      if (audioGrant?.id === id) audioGrant = null;
    });
    powerMonitor.on("suspend", () => { audioGrant = null; mainWindow?.webContents.send("moguri:audio-stop"); });
    const createWindow = async () => {
      mainWindow = new BrowserWindow({
        title: "Moguri", width: 1440, height: 940, minWidth: 840, minHeight: 620,
        show: process.env.MOGURI_TEST_WINDOW !== "hidden", titleBarStyle: "hiddenInset", backgroundColor: "#141922",
        icon: join(app.getAppPath(), "dist", "branding", "moguri.png"),
        webPreferences: { preload: join(dirname(fileURLToPath(import.meta.url)), "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
      });
      mainWindow.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(
        contents === mainWindow?.webContents && permission === "media" && details.isMainFrame && details.requestingUrl.startsWith("moguri://app/") &&
        "mediaTypes" in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every((type) => type === "audio") && audioGranted()));
      mainWindow.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) =>
        contents === mainWindow?.webContents && permission === "media" && (origin === "moguri://app" || origin === "moguri://app/") &&
        details.isMainFrame && Boolean(details.requestingUrl?.startsWith("moguri://app/")) && details.mediaType === "audio" && audioGranted());
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      mainWindow.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("moguri://app/")) event.preventDefault(); });
      mainWindow.webContents.on("will-prevent-unload", (event) => {
        if (process.env.MOGURI_TEST_WINDOW === "hidden") {
          console.error("Hidden generated window kept open for pending edits. No native confirmation dialog was opened.");
          return;
        }
        const choice = dialog.showMessageBoxSync(mainWindow!, {
          type: "warning", title: "Unsaved changes", message: "Keep Moguri open to save your edits, or explicitly discard them.",
          buttons: ["Keep saving", "Discard unsaved edits"], defaultId: 0, cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
      });
      mainWindow.on("closed", () => { audioGrant = null; preview?.view.webContents.close(); preview = null; mainWindow = null; });
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
