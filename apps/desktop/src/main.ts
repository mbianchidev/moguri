import { app, BrowserWindow, Menu, nativeImage, Notification, Tray, WebContentsView, globalShortcut, type MenuItemConstructorOptions, clipboard, dialog, ipcMain, powerMonitor, protocol, session as electronSession, shell, systemPreferences } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { DEFAULT_OPEN_APP_SHORTCUT, electronAccelerator, trayMenu, trayTemplate, type TrayAction } from "./tray-menu.ts";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { lstat, mkdir, readFile, realpath, rename } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGlobalSkillFolder, ensureConnection, globalSkillSources, loadNotificationSoundFile, readConnection, reviewServiceStartup, saveArtifactExport, ServiceUpgradeCancelled, stateDirectory, stopMoguriService, waitForStartupService, waitForStorageRelocation, waitForUpdateInstallArm } from "../../../packages/sdk/src/node.ts";
import type { Connection } from "../../../packages/protocol/src/index.ts";
import { browserUrl, GLOBAL_PROFILE_ID, HtmlPreviewInputSchema, isRecord, parse, PROFILE_ID } from "../../../packages/protocol/src/index.ts";
import { audioBase64, ClientError, defaultNotificationWav, MoguriSdk, QUERY_TIMEOUT_MS, QUERY_REPLY_GRACE_MS, sessionLocalFolder, shortcutLabel, type NotificationToneKind } from "../../../packages/sdk/src/index.ts";
import { AttentionNotifier, notificationToneAllowed, type NotificationTone } from "./notifications.ts";
import { SessionBrowserHost } from "./agent-browser.ts";
import { CliInstallation } from "./cli-installation.ts";
import { HtmlPreviewHost } from "./html-preview.ts";
import { microphonePermission } from "./microphone-permission.ts";
import type { DesktopStartupPhase, DesktopStartupStatus } from "./bridge.d.ts";
import { LoopDelay } from "../../service/src/loop-delay.ts";
import { DesktopServiceStartup } from "./service-startup.ts";

protocol.registerSchemesAsPrivileged([{ scheme: "moguri", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const require = createRequire(import.meta.url);
let connection: Connection;
let mainWindow: BrowserWindow | null = null;
let attentionClient: MoguriSdk | undefined;
let activeProfileId = process.env.MOGURI_PROFILE_ID ?? PROFILE_ID;
let profileEpoch = 0;
const htmlPreview = new HtmlPreviewHost();
let audioGrant: { id: string; profileId: string; epoch: number; expires: number; sessionId: string | null; jobId: string | null; purpose: "capture" | "devices" | "standby" } | null = null;
let audioPending = false;
let tray: Tray | null = null;
let trayMenuKey = "", trayRefresh: ReturnType<typeof setTimeout> | null = null;
let openShortcut: { value: string; accelerator: string | null } | null = null;
let pendingTrayAction: { action: TrayAction; profileId: string } | null = null;
let maintenancePending = false;
let closeRequested = false;
let serviceStoppedForRestart = false;
let updateTimer: ReturnType<typeof setInterval> | undefined;
let updateNoticed: string | null = null;
let serviceStartup: DesktopServiceStartup | undefined;
const nativeReady = Promise.withResolvers<void>();
const startupBegan = performance.now();
let startupPhase: DesktopStartupPhase = "window", startupPhaseBegan = startupBegan, startupFinished: number | undefined;
const startupCompleted: DesktopStartupStatus["completed"] = [];
const startupPhaseChanged = (phase: DesktopStartupPhase) => {
  const now = performance.now();
  startupCompleted.push({ phase: startupPhase, durationMs: now - startupPhaseBegan });
  startupPhase = phase; startupPhaseBegan = now;
  if (phase === "ready" || phase === "failed") startupFinished = now;
};
const startupStatus = (): DesktopStartupStatus => {
  const now = startupFinished ?? performance.now();
  return { phase: startupPhase, elapsedMs: now - startupPhaseBegan, totalMs: now - startupBegan, completed: structuredClone(startupCompleted),
    ...(serviceStartup?.status() ?? { revision: 0, canReconnect: false, diagnostic: null }) };
};
void nativeReady.promise.catch(() => console.error("Native startup did not complete; the startup window retains its connection diagnostic."));
const generatedAudio = () => process.env.MOGURI_TEST_WINDOW === "hidden" && app.commandLine.hasSwitch("use-fake-device-for-media-stream");
const audioGranted = () => {
  const grant = audioGrant, state = attentionClient?.getState();
  return Boolean(grant && grant.profileId === activeProfileId && grant.epoch === profileEpoch && Date.now() < grant.expires &&
    state?.status === "connected" && (grant.purpose !== "standby" ||
      (generatedAudio() || process.platform === "darwin" && systemPreferences.getMediaAccessStatus("microphone") === "granted") &&
      state.snapshot?.settings.values.voice.enabled !== false &&
      state.snapshot?.settings.values.voice.standby && state.snapshot.sessions.some((session) => session.id === grant.sessionId && session.status !== "archived")) &&
    (!grant.jobId || state.snapshot?.jobs.some((job) => job.id === grant.jobId && job.sessionId === grant.sessionId && job.kind === "voice.capture" && job.status === "running")));
};
const banners = new Map<string, Notification>();
let preview: { view: WebContentsView; storage: Electron.Session; profileId: string; sessionId: string; url: string; host?: SessionBrowserHost; registration?: Promise<void> } | null = null;
let previewGeneration = 0;
let previewAdmission: { profileId: string; sessionId: string } | null = null;
let previewCleanup: Promise<void> = Promise.resolve();
const previewUrl = browserUrl;
const blockPreviewDownload = (event: Electron.Event) => event.preventDefault();
const hidePreview = () => {
  previewGeneration++;
  if (!preview) return;
  const owned = preview; preview = null;
  owned.storage.removeListener("will-download", blockPreviewDownload);
  const detach = owned.host?.close() ?? owned.registration ?? Promise.resolve();
  const clear = owned.storage.clearStorageData();
  previewCleanup = Promise.all([previewCleanup, detach, clear]).then(() => {});
  void previewCleanup.catch((error: unknown) => console.error("Native browser private cleanup was not acknowledged; replacement remains blocked:", error instanceof Error ? error.message : "unknown browser cleanup failure"));
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(owned.view);
  if (!owned.view.webContents.isDestroyed()) owned.view.webContents.close();
};
const trusted = (event: Electron.IpcMainInvokeEvent) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith("moguri://app/")) {
    throw new Error("Only Moguri's main renderer may request native capabilities.");
  }
};
/** Moves one artifact to the system Trash. Hidden test windows use a generated folder so tests never touch the real Trash. */
const moveToTrash = async (path: string) => {
  if (process.env.MOGURI_TEST_WINDOW !== "hidden") return shell.trashItem(path);
  const trash = process.env.MOGURI_TEST_TRASH_DIR;
  if (!trash || !isAbsolute(trash)) throw new Error("Hidden test windows need MOGURI_TEST_TRASH_DIR. The real Trash was not used.");
  await mkdir(trash, { recursive: true });
  await rename(path, join(trash, `${randomUUID()}-${basename(path)}`));
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
    const responsiveness = new LoopDelay();
    app.once("will-quit", () => responsiveness.close());
    let connecting: Promise<Connection> | undefined;
    let openingDirectory: string | undefined;
    const selectedDirectory = () => openingDirectory ??= stateDirectory();
    let connectedOwner: { directory: string; connection: Connection } | undefined;
    let connectedRootId: string | undefined;
    let reopenOwner: typeof connectedOwner;
    let nativeInitialized = false;
    let explicitQuitRequested = false;
    // Close and quit first finish saving composer drafts and queued-prompt edits, then proceed without asking (D51).
    let unloadReason: "drafts" | "edits" | null = null, draftSave: ReturnType<typeof setTimeout> | null = null, discardNextUnload = false;
    // Set by the window's close event, which runs before beforeunload; any other blocked unload is a reload.
    let closeIntent = false, afterSave: "close" | "reload" = "close";
    const draftSaveFailed = (error: string) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (process.env.MOGURI_TEST_WINDOW === "hidden") {
        explicitQuitRequested = false;
        console.error(`Hidden generated window kept open because a draft was not saved: ${error}`);
        return;
      }
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "warning", title: "Draft not saved", message: "Moguri couldn't save a draft before closing.",
        detail: `${error} Keep Moguri open to try again, or close without the unsaved text.`,
        buttons: ["Keep Moguri open", "Close without saving"], defaultId: 0, cancelId: 0,
      });
      if (choice === 1) { discardNextUnload = true; mainWindow.close(); }
      else explicitQuitRequested = false;
    };
    let shutdownTask: Promise<void> | undefined, exitAllowed = false;
    const shutdown = (reason: "quit" | "window") => {
      if (shutdownTask) return;
      closeRequested = true; clearInterval(updateTimer); audioGrant = null;
      attentionClient?.disconnect();
      shutdownTask = (async () => {
        if (connecting && !connectedOwner) {
          const original = await serviceStartup!.originalForShutdown();
          connectedOwner = { directory: selectedDirectory(), connection: original };
        } else if (connecting) await connecting;
        const owner = connectedOwner;
        let keepRunning = false;
        if (reason === "window" && !serviceStoppedForRestart && owner) {
          const scoped = await new MoguriSdk(owner.connection, undefined, activeProfileId).ready();
          try {
            const { configuration } = await scoped.application.status();
            if (typeof configuration.values.keepServiceOnWindowClose !== "boolean") throw new Error("The original service did not confirm its window-close preference. No background or shutdown outcome was assumed.");
            keepRunning = configuration.values.keepServiceOnWindowClose;
            if (JSON.stringify(await readConnection(owner.directory)) !== JSON.stringify(owner.connection)) throw new Error("The original service changed during window-close review. No different owner was adopted or stopped.");
          } finally { scoped.disconnect(); }
        }
        if (!serviceStoppedForRestart && owner && !keepRunning) await stopMoguriService(owner.directory, { expectedConnection: owner.connection });
        serviceStartup?.cancelAfterShutdown();
        for (const banner of banners.values()) banner.close(); banners.clear();
        exitAllowed = true; app.quit();
      })().catch(async (error: unknown) => {
        shutdownTask = undefined;
        const message = error instanceof Error ? error.message : "The original Moguri service did not confirm shutdown. No unknown process was signalled.";
        console.error("Moguri app shutdown is unconfirmed:", message);
        const hidden = process.env.MOGURI_TEST_WINDOW === "hidden";
        if (hidden && process.env.MOGURI_TEST_SHUTDOWN_FAILURE !== "cancel") return;
        try {
          const choice = hidden ? { response: 1 } : await dialog.showMessageBox({
            type: "error", title: "Moguri is still shutting down", message,
            detail: "Moguri was not marked closed. Its original service/cleanup state is retained; no new service was started and no data was deleted.",
            buttons: ["Retry shutdown", "Cancel quit"], defaultId: 0, cancelId: 1, noLink: true,
          });
          if (choice.response === 0) shutdown(reason);
          else {
            const recoveryEpoch = profileEpoch;
            closeRequested = false; explicitQuitRequested = false; reopenOwner = connectedOwner;
            if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
            if (nativeInitialized && profileEpoch === recoveryEpoch) {
              const original = reopenOwner;
              if (original && JSON.stringify(await readConnection(original.directory)) !== JSON.stringify(original.connection)) throw new Error("The original service changed before cancelled-quit recovery. No different owner was adopted.");
              await activateProfile(activeProfileId);
              if (original && JSON.stringify(await readConnection(original.directory)) !== JSON.stringify(original.connection)) throw new Error("The original service changed during cancelled-quit recovery. No different owner was adopted.");
              reopenOwner = undefined;
            }
          }
        } catch (notificationError) { console.error("Shutdown recovery or notification failed; the original service remains retained:", notificationError instanceof Error ? notificationError.message : "native recovery failed"); }
      });
    };
    app.on("before-quit", (event) => {
      if (exitAllowed) return;
      explicitQuitRequested = true;
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      else shutdown("quit");
    });
    app.on("window-all-closed", () => shutdown(explicitQuitRequested ? "quit" : "window"));
    serviceStartup = new DesktopServiceStartup((startupReview) => ensureConnection({
      stateDir: selectedDirectory(), explicitStateDir: Boolean(process.env.MOGURI_STATE_DIR && process.env.MOGURI_STATE_DIR_EXPLICIT !== "0"),
      runtime: require.resolve("node/bin/node"), servicePath: join(app.getAppPath(), "dist", "service.mjs"),
      ...(startupReview ? { startupReview } : {}),
      confirmUpgrade: async (review) => {
        if (process.env.MOGURI_TEST_WINDOW === "hidden") {
          if (!["confirm", "cancel"].includes(process.env.MOGURI_TEST_SERVICE_UPGRADE ?? "")) throw new Error("Hidden service upgrades require an explicit generated confirmation response. No personal service or native dialog was opened.");
          return process.env.MOGURI_TEST_SERVICE_UPGRADE === "confirm";
        }
        const choice = await dialog.showMessageBox({
          type: "question", title: "Update the Moguri background service",
          message: `This app needs protocol ${review.requiredProtocol}, but the running service uses ${review.observedProtocol}.`,
          detail: "Restart the exact authenticated background service to finish the upgrade. Running agent/tool work will stop with its actual partial outcome. History, profiles, budgets and independent artifacts are kept. User terminals are preserved without replaying input. Cancel leaves the old service unchanged.",
          buttons: ["Restart service", "Cancel"], defaultId: 1, cancelId: 1, noLink: true,
        });
        return choice.response === 0;
      },
    }), waitForStartupService);
    const connect = async () => {
      if (maintenancePending || closeRequested) throw new Error("App shutdown or original store maintenance is pending. No stale root, automatic service start or profile rebind was attempted.");
      connecting ??= (async () => {
        const original = reopenOwner, directory = (original ?? connectedOwner)?.directory ?? selectedDirectory();
        let selectedConnection: Connection;
        if (original) selectedConnection = await readConnection(directory);
        else if (connectedOwner) {
          const review = await reviewServiceStartup(directory);
          if (review.rootId !== connectedRootId) throw new Error("The established service root changed. No different root or owner was adopted.");
          selectedConnection = await ensureConnection({ stateDir: directory, startupReview: review });
          if (selectedConnection.storeId !== connectedOwner.connection.storeId) throw new Error("The established service store identity changed. No different history or profile was adopted.");
        } else selectedConnection = await serviceStartup!.connect();
        if (original && JSON.stringify(selectedConnection) !== JSON.stringify(original.connection)) throw new Error("The captured service changed while quit was cancelled. No different owner was adopted or started.");
        const review = await reviewServiceStartup(directory);
        if (connectedRootId !== undefined && review.rootId !== connectedRootId ||
          JSON.stringify(await readConnection(directory)) !== JSON.stringify(selectedConnection)) throw new Error("The service root or connection changed during authenticated admission. No different owner was adopted.");
        connectedRootId ??= review.rootId;
        connection = selectedConnection;
        connectedOwner = { directory, connection: { ...connection } };
        return { ...connection, baseUrl: "moguri://app" };
      })().finally(() => { connecting = undefined; });
      return connecting;
    };
    const rendererRoot = join(app.getAppPath(), "dist", "desktop", "renderer");
    protocol.handle("moguri", async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== "app") return new Response("Unknown Moguri origin.", { status: 403 });
      if (url.pathname.startsWith("/v1/")) {
        if (!connection) return Response.json({ error: { code: "starting", message: "The original service is not connected yet." } }, { status: 503 });
        if (!["GET", "POST"].includes(request.method) || !["/v1/snapshot", "/v1/commands", "/v1/command-receipt", "/v1/query", "/v1/query-cancel", "/v1/terminal", "/v1/voice", "/v1/application", "/v1/health"].includes(url.pathname) || url.search) return new Response("Unsupported protocol route.", { status: 404 });
        const profileId = request.headers.get("X-Moguri-Profile") ?? PROFILE_ID;
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) return new Response("Profile scope denied.", { status: 403 });
        const began = performance.now();
        try {
          const body = request.method === "POST" ? await request.text() : undefined;
          const bodyMs = performance.now() - began, upstream = performance.now();
          const response = await fetch(`${connection.baseUrl}${url.pathname}`, {
            method: request.method,
            headers: { Authorization: `Bearer ${connection.token}`, Origin: "moguri://app", "Content-Type": "application/json", "X-Moguri-Profile": profileId,
              ...(request.headers.get("X-Moguri-Query-Id") ? { "X-Moguri-Query-Id": request.headers.get("X-Moguri-Query-Id")! } : {}) },
            ...(body !== undefined ? { body } : {}),
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(url.pathname === "/v1/query" ? QUERY_TIMEOUT_MS + QUERY_REPLY_GRACE_MS : 20_000)]),
            redirect: "error",
          });
          const headers = new Headers(response.headers);
          headers.append("Server-Timing", `moguri-proxy-body;dur=${bodyMs.toFixed(3)}, moguri-proxy-headers;dur=${(performance.now() - upstream).toFixed(3)}${responsiveness.timing("proxy")}`);
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        } catch (error) {
          if (!(error instanceof Error) || !["TypeError", "AbortError", "TimeoutError"].includes(error.name)) throw error;
          console.error("Moguri service proxy did not acknowledge its original request:", error.name);
          return Response.json({ error: { code: "request_failed",
            message: "The original Moguri service transport did not acknowledge this request. No request was replayed or different owner selected. Check Client request timings and the original service log; a mutation may already have an outcome in its exact command receipt." } }, {
            status: 502, headers: { "Server-Timing": `moguri-proxy-headers;dur=${(performance.now() - began).toFixed(3)}${responsiveness.timing("proxy")}` },
          });
        }
      }
      const path = resolve(rendererRoot, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      if (!path.startsWith(rendererRoot + sep)) return new Response("Path denied.", { status: 403 });
      try {
        const bytes = await readFile(path);
        const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
        return new Response(bytes, { headers: { "Content-Type": mime[extname(path)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
      } catch { return new Response("Moguri asset missing. Rebuild the app.", { status: 404 }); }
    });
    ipcMain.handle("moguri:connection", async (event) => { trusted(event); await nativeReady.promise; return connect(); });
    ipcMain.handle("moguri:startup-status", (event) => { trusted(event); return startupStatus(); });
    ipcMain.handle("moguri:startup-reconnect", (event, revision: unknown) => {
      trusted(event);
      if (maintenancePending || closeRequested || typeof revision !== "number" || !Number.isSafeInteger(revision)) throw new Error("The current startup is not available for reconnect. No different root or owner was selected.");
      serviceStartup!.reconnect(revision);
      return { requested: true };
    });
    ipcMain.handle("moguri:startup-context", async (event) => {
      trusted(event);
      const directory = connectedOwner?.directory ?? selectedDirectory();
      const profile = { profileId: activeProfileId, profileExplicit: Boolean(process.env.MOGURI_PROFILE_ID) };
      let metadata;
      try { metadata = await lstat(directory, { bigint: true }); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return { ...profile, scopeKey: null };
        throw error;
      }
      const uid = process.getuid?.();
      if (uid === undefined || !metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== BigInt(uid) || metadata.mode & 0o077n) {
        throw new Error("The startup presentation root is not the selected private user-owned directory. No cached view was selected.");
      }
      const root = await realpath(directory), current = await lstat(root, { bigint: true });
      if (current.dev !== metadata.dev || current.ino !== metadata.ino || !current.isDirectory() ||
        current.uid !== BigInt(uid) || current.mode & 0o077n) throw new Error("The startup presentation root changed during inspection. No cached view was selected.");
      return { ...profile, scopeKey: createHash("sha256").update(JSON.stringify([root, metadata.dev.toString(), metadata.ino.toString()])).digest("hex") };
    });
    app.on("activate", () => { if (!mainWindow && !closeRequested && !maintenancePending) void createWindow(); });
    const openingWindow = createWindow();
    void openingWindow.catch((error: unknown) => console.error("Initial window loading ended:", error instanceof Error ? error.message : "inspect native startup"));
    if (closeRequested) throw new Error("Initial workspace opening was cancelled by quit. Reopen Moguri after its original shutdown settles.");
    await mkdir(app.getPath("userData"), { recursive: true, mode: 0o700 });
    startupPhaseChanged("service");
    await connect();
    if (closeRequested) throw new Error("Initial workspace opening was cancelled by quit. Reopen Moguri after its original shutdown settles.");
    const applyApplicationPreferences = async () => {
      const scoped = attentionClient, epoch = profileEpoch;
      if (!scoped) throw new Error("The actual profile is not connected to the application store.");
      const { configuration } = await scoped.application.status();
      if (scoped !== attentionClient || epoch !== profileEpoch) throw new Error("Profile selection changed during application preference inspection.");
      const suppressed = process.env.MOGURI_TEST_WINDOW === "hidden";
      if (!configuration.values.menuBar && tray) { tray.destroy(); tray = null; }
      if (configuration.values.menuBar && !tray && !suppressed) {
        const image = nativeImage.createFromPath(join(app.getAppPath(), "dist", "branding", "moguri-tray.png"));
        if (image.isEmpty()) throw new Error("Moguri's menu-bar image is missing. The configured flag is retained; no empty icon was reported as visible.");
        image.setTemplateImage(true);
        tray = new Tray(image); tray.setToolTip("Moguri"); trayMenuKey = "";
        refreshTray();
        // macOS opens the context menu on click; other platforms bring the window forward.
        if (process.platform !== "darwin") tray.on("click", showMain);
      }
      return { menuBar: Boolean(tray), suppressed };
    };
    function showMain() {
      if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
      else if (!closeRequested && !maintenancePending) void createWindow().catch((error: unknown) => console.error("Moguri window could not reopen:", error instanceof Error ? error.message : "window"));
    }
    /** Renderer flows own confirmations and unsaved-edit guards; a fresh window takes the action once it mounts. */
    const rendererAction = (action: TrayAction, profileId: string) => {
      if (mainWindow && !mainWindow.webContents.isLoading()) { showMain(); mainWindow.webContents.send("moguri:tray-action", action, profileId); }
      else { pendingTrayAction = { action, profileId }; showMain(); }
    };
    const trayAction = (action: TrayAction, profileId: string) => {
      if (action.kind === "open-app") showMain();
      else if (action.kind === "settings") { showMain(); mainWindow?.webContents.send("moguri:open-settings"); }
      else if (action.kind === "open-session") { showMain(); mainWindow?.webContents.send("moguri:navigate-session", action.sessionId, profileId); }
      else if (action.kind === "stop") {
        const scoped = attentionClient;
        if (!scoped || scoped.profileId !== profileId) { soundError(profileId, new Error("That session belongs to a profile that is no longer active. Nothing was stopped.")); return; }
        void scoped.command({ type: "session.stop", sessionId: action.sessionId }).catch((error: unknown) => soundError(profileId, error));
      } else rendererAction(action, profileId);
    };
    /** Registers the system-wide Open Moguri shortcut from the active profile's settings. */
    const syncOpenShortcut = (value: string, profileId: string) => {
      if (openShortcut?.value === value) return;
      if (openShortcut?.accelerator) globalShortcut.unregister(openShortcut.accelerator);
      let accelerator: string | null = null;
      try { accelerator = electronAccelerator(value); } catch { accelerator = null; }
      if (accelerator && process.env.MOGURI_TEST_WINDOW !== "hidden" && !globalShortcut.register(accelerator, showMain)) {
        soundError(profileId, new Error(`${shortcutLabel(value)} is already used by another app, so the Open Moguri shortcut is off. Choose another one in Settings / Interface / Keyboard shortcuts.`));
        accelerator = null;
      }
      openShortcut = { value, accelerator: process.env.MOGURI_TEST_WINDOW === "hidden" ? null : accelerator };
      trayMenuKey = "";
    };
    function refreshTray() {
      const scoped = attentionClient, state = scoped?.getState();
      if (scoped && state?.snapshot && state.status === "connected") syncOpenShortcut(state.snapshot.settings.values.shortcuts?.openApp ?? DEFAULT_OPEN_APP_SHORTCUT, scoped.profileId);
      if (!tray || !scoped) return;
      const items = trayMenu(state?.status === "connected" ? state.snapshot ?? null : null, { openShortcut: openShortcut?.accelerator ?? null });
      const key = `${scoped.profileId}:${JSON.stringify(items)}`;
      if (key === trayMenuKey) return;
      trayMenuKey = key;
      tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(items, (action) => trayAction(action, scoped.profileId)) as MenuItemConstructorOptions[]));
    }
    const scheduleTray = () => { if (!trayRefresh) trayRefresh = setTimeout(() => { trayRefresh = null; refreshTray(); }, 400); };
    ipcMain.handle("moguri:take-tray-action", (event) => { trusted(event); const value = pendingTrayAction; pendingTrayAction = null; return value; });
    const soundError = (profileId: string, error: unknown) => {
      const message = error instanceof Error ? error.message : "Notification audio failed. No alternate sound was substituted.";
      console.error("Moguri native capability:", message);
      if (profileId === activeProfileId) mainWindow?.webContents.send("moguri:native-error", profileId, message.slice(0, 2048));
    };
    const inspectUpdate = async (scoped: MoguriSdk, epoch: number) => {
      const value = (await scoped.application.updates.status()).update.operation;
      if (scoped !== attentionClient || epoch !== profileEpoch || !value?.release || value.status !== "ready" || value.id === updateNoticed) return;
      updateNoticed = value.id;
      mainWindow?.webContents.send("moguri:update-available", value.id, value.release.manifest.version);
    };
    const requestSound = async (scoped: MoguriSdk, epoch: number, kind: NotificationToneKind, soundId: string, automatic?: NotificationTone) => {
      const audio = soundId === "default" ? audioBase64(defaultNotificationWav(kind)) : (await scoped.notifications.sound(soundId)).audio;
      if (attentionClient !== scoped || epoch !== profileEpoch || scoped.getState().status !== "connected" || !mainWindow || mainWindow.isDestroyed()) return { requested: false };
      if (automatic) {
        const snapshot = scoped.getState().snapshot;
        if (!snapshot || !notificationToneAllowed(snapshot, automatic, mainWindow.isFocused())) return { requested: false };
      }
      if (process.env.MOGURI_TEST_WINDOW === "hidden") return { requested: false };
      mainWindow.webContents.send("moguri:notification-audio", scoped.profileId, audio);
      return { requested: true };
    };
    const activateProfile = async (profileId: string) => {
      if (maintenancePending || closeRequested) throw new Error("Shutdown or whole-store maintenance owns this application. No profile selection or running work was moved.");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) throw new Error("Choose one explicit user profile; no Default fallback.");
      if (attentionClient?.profileId === profileId && attentionClient.getState().status === "connected") return profileId;
      const epoch = ++profileEpoch;
      audioGrant = null;
      mainWindow?.webContents.send("moguri:audio-stop");
      const scoped = await new MoguriSdk(connection, async () => { await connect(); return connection; }, profileId).ready();
      if (epoch !== profileEpoch || closeRequested) { scoped.disconnect(); throw new Error("Another profile selection or app shutdown replaced this request. No scope was rebound."); }
      attentionClient?.disconnect();
      attentionClient = scoped; activeProfileId = profileId;
      for (const banner of banners.values()) banner.close(); banners.clear();
      const notifier = new AttentionNotifier(scoped.getState().snapshot!.seq);
      let applicationRevision = -1, wasConnected = true;
      scoped.subscribe(() => {
        if (attentionClient !== scoped) return;
        scheduleTray();
        const state = scoped.getState();
        if (!state.snapshot || state.status !== "connected") { wasConnected = false; return; }
        if (!wasConnected) { notifier.synchronize(state.snapshot.seq); wasConnected = true; }
        if (applicationRevision !== state.snapshot.profileCatalogRevision) {
          applicationRevision = state.snapshot.profileCatalogRevision ?? 0;
          void applyApplicationPreferences().catch((error: unknown) => soundError(profileId, error));
          void inspectUpdate(scoped, epoch).catch((error: unknown) => soundError(profileId, error));
        }
        notifier.observe(state.snapshot, state.events, Boolean(mainWindow?.isFocused()), (banner) => {
          if (process.env.MOGURI_TEST_WINDOW === "hidden" || !Notification.isSupported()) return;
          const notification = new Notification({ title: banner.title, body: banner.body, silent: true });
          banners.set(banner.id, notification);
          if (banners.size > 100) { const oldest = banners.keys().next().value!; banners.get(oldest)?.close(); banners.delete(oldest); }
          notification.on("click", () => {
            mainWindow?.show(); mainWindow?.focus();
            if (banner.itemId) mainWindow?.webContents.send("moguri:navigate-work", banner.itemId, profileId);
            else if (banner.inbox) mainWindow?.webContents.send("moguri:navigate-inbox", banner.id, profileId);
            else if (banner.suggestions) mainWindow?.webContents.send("moguri:navigate-suggestions", profileId);
            else if (banner.sessionId) mainWindow?.webContents.send("moguri:navigate-session", banner.sessionId, profileId);
          });
          notification.on("close", () => banners.delete(banner.id));
          notification.on("failed", (_event, error) => { banners.delete(banner.id); console.error("Moguri OS notification failed:", error); });
          notification.show();
        }, (tone) => { void requestSound(scoped, epoch, tone.kind, tone.soundId, tone).catch((error: unknown) => soundError(profileId, error)); });
      });
      if (startupPhase === "profile") startupPhaseChanged("preferences");
      await applyApplicationPreferences();
      return profileId;
    };
    startupPhaseChanged("profile");
    await activateProfile(activeProfileId);
    startupPhaseChanged("native");
    ipcMain.handle("moguri:application-preferences", async (event) => { trusted(event); return applyApplicationPreferences(); });
    const hidden = process.env.MOGURI_TEST_WINDOW === "hidden";
    const cliInstallation = new CliInstallation(
      hidden && process.env.MOGURI_TEST_CLI_APP_ROOT ? process.env.MOGURI_TEST_CLI_APP_ROOT : process.platform === "darwin" && app.isPackaged ? app.getAppPath() : null,
      hidden ? process.env.MOGURI_TEST_CLI_HOME ?? join(stateDirectory(), "generated-cli-home") : app.getPath("home"),
    );
    let cliChangePending = false;
    ipcMain.handle("moguri:cli-installation", async (event, input: unknown) => {
      trusted(event);
      if (!isRecord(input) || typeof input.action !== "string" || !["status", "install", "remove"].includes(input.action) ||
        Object.keys(input).some((key) => key !== "action" && !(input.action === "remove" && key === "expectedDigest")) ||
        input.action === "remove" && (typeof input.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedDigest))) throw new Error("Choose one explicit command installation action with its original removal review. Unsupported paths or fields are not accepted.");
      if (cliChangePending) throw new Error("Another command installation change is still pending. Refresh after it finishes.");
      cliChangePending = true;
      try {
        if (input.action === "status") return await cliInstallation.status();
        if (input.action === "install") return await cliInstallation.install();
        return await cliInstallation.remove(String(input.expectedDigest));
      } catch (error) {
        console.error("Moguri command installation:", error instanceof Error ? error.message : String(error));
        throw error;
      } finally { cliChangePending = false; }
    });
    ipcMain.handle("moguri:choose-storage-directory", async (event) => {
      trusted(event);
      if (process.env.MOGURI_TEST_WINDOW === "hidden") {
        const destination = process.env.MOGURI_TEST_STORAGE_DESTINATION;
        if (!destination) throw new Error("Hidden relocation checks require a generated destination. No personal folder picker was opened.");
        return destination;
      }
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Choose the parent folder for Moguri's encrypted data", properties: ["openDirectory"] });
      return result.canceled || !result.filePaths[0] ? null : join(result.filePaths[0], "Moguri Data");
    });
    ipcMain.handle("moguri:relocate-storage", async (event, path: unknown, expectedDigest: unknown) => {
      trusted(event);
      if (typeof path !== "string" || typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("Review the exact destination and current relocation digest first.");
      const scoped = attentionClient, epoch = profileEpoch;
      if (!scoped) throw new Error("Connect the actual application store before relocating it.");
      if (maintenancePending) throw new Error("Inspect the original maintenance before requesting another copy or restart.");
      const storage = (await scoped.application.storage.status()).storage;
      if (!storage.locatorDirectory) throw new Error("The actual store has no configured location authority.");
      maintenancePending = true;
      let accepted;
      try { accepted = await scoped.application.storage.relocate(path, expectedDigest, true); }
      catch (error) {
        if (error instanceof ClientError && ["storage_authority", "storage_override", "storage_destination", "storage_overlap", "storage_review_changed", "profile_missing"].includes(error.code)) maintenancePending = false;
        throw error;
      }
      scoped.disconnect();
      const location = await waitForStorageRelocation(storage.locatorDirectory, accepted.id, accepted.keyId);
      serviceStoppedForRestart = true;
      if (scoped !== attentionClient || epoch !== profileEpoch) throw new Error("Storage was relocated, but profile selection changed before restart. Reopen Moguri using the published location; no second copy was started.");
      const hidden = process.env.MOGURI_TEST_WINDOW === "hidden";
      if (!hidden) { app.relaunch(); app.exit(0); }
      return { id: accepted.id, directory: location.dataDir, restarted: false };
    });
    ipcMain.handle("moguri:install-update", async (event, id: unknown, expectedDigest: unknown) => {
      trusted(event);
      if (process.env.MOGURI_TEST_WINDOW === "hidden" || !app.isPackaged) throw new Error("A generated hidden or unpackaged window cannot replace the running application. Verify the helper using generated bundles instead.");
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id) || typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedDigest) || maintenancePending) throw new Error("Review one exact staged update before its native restart.");
      const scoped = attentionClient;
      if (!scoped) throw new Error("The actual store is not connected.");
      maintenancePending = true;
      let accepted;
      try { accepted = await scoped.application.updates.install(id, expectedDigest, process.pid, true); }
      catch (error) {
        if (error instanceof ClientError && ["update_install_review_changed", "update_install_state", "update_install_unqualified", "update_install_root"].includes(error.code)) maintenancePending = false;
        throw error;
      }
      scoped.disconnect(); await waitForUpdateInstallArm(accepted.journal, accepted.id, accepted.intentDigest);
      serviceStoppedForRestart = true;
      app.exit(0);
    });
    ipcMain.handle("moguri:profile", async (event, profileId: unknown) => {
      trusted(event);
      if (profileId === undefined) return activeProfileId;
      if (typeof profileId !== "string") throw new Error("An explicit profile ID is required.");
      hidePreview(); await htmlPreview.close(); return activateProfile(profileId);
    });
    ipcMain.handle("moguri:choose-project", async (event, purpose: unknown) => {
      trusted(event);
      if (purpose !== undefined && purpose !== "import" && purpose !== "clone" && purpose !== "workspace") throw new Error("Choose an import, clone or workspace folder explicitly.");
      const title = purpose === "clone" ? "Choose the parent folder for this clone" : purpose === "workspace" ? "Choose the workspace folder that holds your repositories" : "Import a local project folder";
      const result = await dialog.showOpenDialog(mainWindow!, { title, message: purpose === "workspace" ? "Moguri will read this folder to find Git repositories." : undefined, buttonLabel: purpose === "workspace" ? "Choose folder" : undefined, properties: ["openDirectory"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-file", async (event, projectPath: unknown) => {
      trusted(event);
      if (typeof projectPath !== "string") throw new Error("Project path required.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Attach a project text file", defaultPath: projectPath, properties: ["openFile"] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-path", async (event, input: unknown) => {
      trusted(event);
      if (!isRecord(input) || input.kind !== "file" && input.kind !== "folder" || typeof input.title !== "string" || input.title.length > 200 ||
        input.extensions !== undefined && (!Array.isArray(input.extensions) || input.extensions.length > 10 || input.extensions.some((value) => typeof value !== "string" || !/^[a-z0-9]{1,10}$/i.test(value))) ||
        input.defaultPath !== undefined && (typeof input.defaultPath !== "string" || !input.defaultPath.startsWith("/") || input.defaultPath.length > 4096)) {
        throw new Error("Choose a file or folder with a short title.");
      }
      const extensions = input.extensions as string[] | undefined;
      const result = await dialog.showOpenDialog(mainWindow!, { title: input.title, properties: [input.kind === "folder" ? "openDirectory" : "openFile"],
        ...(typeof input.defaultPath === "string" ? { defaultPath: input.defaultPath } : {}),
        ...(extensions?.length ? { filters: [{ name: "Supported files", extensions }] } : {}) });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:load-notification-sound", async (event, profileId: unknown, path: unknown) => {
      trusted(event);
      const epoch = profileEpoch;
      if (profileId !== activeProfileId) throw new Error("Import a sound only for the active profile.");
      if (typeof path !== "string" || !path.startsWith("/") || path.length > 4096) throw new Error("Enter the sound file's full path, or one starting with ~/.");
      const sound = await loadNotificationSoundFile(path);
      if (epoch !== profileEpoch || profileId !== activeProfileId) throw new Error("The original profile changed while reading the sound. No audio was rebound.");
      return sound;
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
    ipcMain.handle("moguri:choose-voice-model", async (event) => {
      trusted(event);
      if (process.env.MOGURI_TEST_WINDOW === "hidden") {
        if (!process.env.MOGURI_TEST_VOICE_MODEL_FILE) throw new Error("Hidden model checks require a generated model file. No personal file picker was opened.");
        return process.env.MOGURI_TEST_VOICE_MODEL_FILE;
      }
      const result = await dialog.showOpenDialog(mainWindow!, { title: "Choose a speech model file or a folder of models", properties: ["openFile", "openDirectory"], filters: [{ name: "Speech models", extensions: ["gguf", "bin"] }] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:choose-attachment", async (event, kind: unknown) => {
      trusted(event);
      if (!["file", "image", "folder", "document"].includes(String(kind))) throw new Error("Choose a supported explicit attachment type.");
      const result = await dialog.showOpenDialog(mainWindow!, { title: kind === "folder" ? "Review a context folder" : kind === "file" ? "Attach any file" : "Attach explicit client context", properties: [kind === "folder" ? "openDirectory" : "openFile"], ...(kind === "image" ? { filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] } : kind === "document" ? { filters: [{ name: "Documents", extensions: ["pdf", "xlsx", "docx"] }] } : {}) });
      return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("moguri:open-external", async (event, input: unknown) => {
      trusted(event);
      if (typeof input !== "string") throw new Error("URL required.");
      const url = previewUrl(input);
      if (process.env.MOGURI_TEST_WINDOW !== "hidden") await shell.openExternal(url.toString());
    });
    const skillHome = () => process.env.MOGURI_TEST_WINDOW === "hidden" ? process.env.MOGURI_TEST_SKILL_HOME ?? join(stateDirectory(), "generated-skill-home") : undefined;
    const skillProfile = (profileId: unknown) => {
      if (profileId !== activeProfileId || attentionClient?.profileId !== profileId) throw new Error("Global skill folders belong to the original active profile. Reopen Skills after profile loading.");
    };
    ipcMain.handle("moguri:global-skill-sources", (event, profileId: unknown) => {
      trusted(event); skillProfile(profileId);
      return globalSkillSources(skillHome());
    });
    ipcMain.handle("moguri:create-global-skill-folder", (event, profileId: unknown, id: unknown) => {
      trusted(event); skillProfile(profileId);
      if (typeof id !== "string") throw new Error("Global skill folder required.");
      return createGlobalSkillFolder(id, skillHome());
    });
    const verifiedFolder = async (path: string, identity: { device: string; inode: string } | null) => {
      const metadata = await lstat(path, { bigint: true }).catch(() => null);
      if (!metadata?.isDirectory() || metadata.isSymbolicLink() || await realpath(path).catch(() => null) !== path ||
        identity && (String(metadata.dev) !== identity.device || String(metadata.ino) !== identity.inode)) throw new Error("The exact Local folder is unavailable or changed identity. No replacement was opened.");
      return path;
    };
    const repositoryUrl = (repository: string | null, subject: string) => {
      if (!repository) throw new Error(`${subject} has no supported repository remote. No URL or SSH account was inferred.`);
      return previewUrl(repository).toString();
    };
    const deliverLocation = async (action: "show-folder" | "open-remote", location: string) => {
      if (process.env.MOGURI_TEST_WINDOW === "hidden") return { opened: false, location };
      if (action === "show-folder") {
        const error = await shell.openPath(location);
        if (error) throw new Error(`The Local folder could not be opened: ${error}`);
      } else await shell.openExternal(location);
      return { opened: true, location };
    };
    const locationAction = (action: unknown): action is "show-folder" | "open-remote" => action === "show-folder" || action === "open-remote";
    ipcMain.handle("moguri:project-location", async (event, profileId: unknown, projectId: unknown, expectedPath: unknown, action: unknown) => {
      trusted(event);
      if (typeof projectId !== "string" || typeof expectedPath !== "string" || !locationAction(action)) throw new Error("Choose an exact project folder or repository action.");
      const client = attentionClient, epoch = profileEpoch;
      if (!client) throw new Error("The original profile is not connected. No location was opened.");
      const current = () => {
        const state = client?.getState(), project = state?.snapshot?.projects.find((project) => project.id === projectId);
        if (!client || client !== attentionClient || profileId !== activeProfileId || profileId !== client.profileId || epoch !== profileEpoch ||
          state?.status !== "connected" || !project || project.path !== expectedPath) throw new Error("The original profile or exact project folder changed. No other location was opened.");
        return project;
      };
      current(); await client.refresh(); current();
      const location = action === "show-folder" ? await verifiedFolder(expectedPath, null) :
        repositoryUrl((await client.projects.git(projectId, false)).repository, "This Local project");
      current();
      return deliverLocation(action, location);
    });
    ipcMain.handle("moguri:reveal-artifact", async (event, profileId: unknown, projectId: unknown, path: unknown) => {
      trusted(event);
      if (typeof path !== "string" || !isAbsolute(path) || projectId !== null && typeof projectId !== "string") throw new Error("Choose an exact listed artifact file.");
      const client = attentionClient, epoch = profileEpoch;
      const current = () => {
        if (!client || client !== attentionClient || profileId !== activeProfileId || profileId !== client.profileId || epoch !== profileEpoch ||
          client.getState().status !== "connected") throw new Error("The original profile changed or disconnected. Nothing was shown.");
      };
      current();
      const library = await client!.artifacts.library(projectId);
      current();
      if (!library.files.some((file) => file.path === path)) throw new Error("This file is no longer in the artifact library. Refresh Artifacts; nothing was shown.");
      const metadata = await lstat(path).catch(() => null);
      if (!metadata || metadata.isSymbolicLink() || await realpath(path).catch(() => null) !== path) throw new Error("The exact file is unavailable or changed. Nothing was shown.");
      if (process.env.MOGURI_TEST_WINDOW === "hidden") return { revealed: false, path };
      shell.showItemInFolder(path);
      return { revealed: true, path };
    });
    ipcMain.handle("moguri:trash-artifacts", async (event, profileId: unknown, projectId: unknown, paths: unknown) => {
      trusted(event);
      if (!Array.isArray(paths) || !paths.length || paths.length > 100 || new Set(paths).size !== paths.length ||
        paths.some((path) => typeof path !== "string" || !isAbsolute(path)) || projectId !== null && typeof projectId !== "string") throw new Error("Choose up to 100 exact listed artifact files.");
      const client = attentionClient, epoch = profileEpoch;
      const current = () => {
        if (!client || client !== attentionClient || profileId !== activeProfileId || profileId !== client.profileId || epoch !== profileEpoch ||
          client.getState().status !== "connected") throw new Error("The original profile changed or disconnected. Nothing more was moved to the Trash.");
      };
      current();
      const library = await client!.artifacts.library(projectId);
      current();
      const project = projectId === null ? null : client!.getState().snapshot?.projects.find((value) => value.id === projectId);
      if (projectId !== null && !project) throw new Error("This project is no longer in the profile. Nothing was moved to the Trash.");
      const results: { path: string; trashed: boolean; error?: string }[] = [];
      for (const path of paths as string[]) {
        current();
        const file = library.files.find((entry) => entry.path === path);
        let error: string | null = null;
        if (!file) error = "It's no longer in the artifact library. Refresh Artifacts.";
        else if (project?.workspaceFolderId && file.root === project.path) error = "Moguri doesn't change files in a workspace folder's own checkout. Use Show in Finder instead.";
        else {
          const metadata = await lstat(path).catch(() => null);
          if (!metadata || metadata.isSymbolicLink() || await realpath(path).catch(() => null) !== path) error = "The exact file is unavailable or changed.";
        }
        if (!error) try { await moveToTrash(path); } catch (failure) { error = failure instanceof Error ? failure.message : "It couldn't be moved to the Trash."; }
        if (error) console.error("Moguri artifact Trash:", path, error);
        results.push({ path, trashed: !error, ...(error ? { error } : {}) });
      }
      return results;
    });
    ipcMain.handle("moguri:session-location", async (event, profileId: unknown, sessionId: unknown, action: unknown) => {
      trusted(event);
      if (typeof sessionId !== "string" || !locationAction(action)) throw new Error("Choose an exact session folder or repository action.");
      const client = attentionClient, epoch = profileEpoch;
      if (!client) throw new Error("The original profile is not connected. No location was opened.");
      const current = () => {
        const state = client?.getState(), snapshot = state?.snapshot, session = snapshot?.sessions.find((entry) => entry.id === sessionId);
        if (!client || client !== attentionClient || profileId !== activeProfileId || profileId !== client.profileId || epoch !== profileEpoch ||
          state?.status !== "connected" || !snapshot || !session || session.status === "archived") throw new Error("The original profile or exact session changed. No other location was opened.");
        const folder = sessionLocalFolder(session, snapshot);
        return { session, folder, key: JSON.stringify([session.projectId, session.workspaceId, session.controls.env, folder.path ?? null, folder.identity ?? null]) };
      };
      const before = current().key; await client.refresh();
      const { session, folder, key } = current();
      if (key !== before) throw new Error("The session's bound folder changed while it was being checked. No other location was opened.");
      let location: string;
      if (action === "show-folder") {
        if (folder.diagnostic !== undefined) throw new Error(folder.diagnostic);
        location = await verifiedFolder(folder.path, folder.identity);
      } else {
        if (!session.projectId || session.repositories || session.controls.env === "Sandbox") throw new Error("Open remote needs one project session in Local or Remote Env. No base checkout or other repository was substituted.");
        location = repositoryUrl((await client.workspaces.git(sessionId, false)).repository, "This session's checkout");
      }
      if (current().key !== key) throw new Error("The session's bound folder changed while it was being checked. No other location was opened.");
      return deliverLocation(action, location);
    });
    ipcMain.on("moguri:unload-blocked", (event, reason: unknown) => {
      try { trusted(event); if (reason === "drafts" || reason === "edits") unloadReason = reason; }
      finally { event.returnValue = true; }
    });
    ipcMain.on("moguri:drafts-settled", (event, result: unknown) => {
      trusted(event);
      if (!draftSave || !mainWindow || mainWindow.isDestroyed()) return;
      clearTimeout(draftSave); draftSave = null;
      const value = typeof result === "object" && result !== null ? result as { ok?: unknown; error?: unknown } : {};
      if (value.ok === true) { if (afterSave === "close") mainWindow.close(); else mainWindow.webContents.reload(); }
      else draftSaveFailed(typeof value.error === "string" ? value.error.slice(0, 1000) : "The draft could not be saved.");
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
    ipcMain.handle("moguri:preview", async (event, input: unknown, profileId: unknown, closingSessionId: unknown) => {
      trusted(event);
      if (typeof profileId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(profileId) || profileId === GLOBAL_PROFILE_ID) throw new Error("A user profile is required for a native preview.");
      if (input === null) {
        if (preview?.profileId === profileId && preview.sessionId === closingSessionId) hidePreview();
        else if (previewAdmission?.profileId === profileId && previewAdmission.sessionId === closingSessionId) { previewGeneration++; previewAdmission = null; }
        return;
      }
      if (profileId !== activeProfileId) throw new Error("The preview belongs to an inactive profile. No scope was rebound.");
      if (!isRecord(input) || typeof input.sessionId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(input.sessionId) || input.url !== null && typeof input.url !== "string" || !isRecord(input.bounds)) throw new Error("A scoped preview URL and bounds are required.");
      if (input.reload !== undefined && typeof input.reload !== "boolean") throw new Error("Choose an explicit preview reload.");
      const url = input.url === null ? null : previewUrl(input.url);
      const fields = ["x", "y", "width", "height"] as const;
      for (const field of fields) if (typeof input.bounds[field] !== "number" || !Number.isFinite(input.bounds[field])) throw new Error("Preview bounds must be finite numbers.");
      if (!preview || preview.profileId !== profileId || preview.sessionId !== input.sessionId) {
        const scoped = attentionClient;
        if (!scoped || scoped.profileId !== profileId) throw new Error("The preview profile is not connected.");
        const admission = { profileId, sessionId: input.sessionId }, originalGeneration = previewGeneration;
        previewAdmission = admission;
        if (!scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId)) await scoped.refresh();
        if (previewAdmission !== admission || previewGeneration !== originalGeneration) return;
        if (attentionClient !== scoped || activeProfileId !== profileId || !scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId)) throw new Error("This preview session is outside the active profile.");
        hidePreview();
        const generation = previewGeneration;
        await previewCleanup;
        if (previewAdmission !== admission || previewGeneration !== generation || attentionClient !== scoped || activeProfileId !== profileId || !mainWindow || mainWindow.isDestroyed()) return;
        const isolated = electronSession.fromPartition(`moguri-preview-${profileId}-${input.sessionId}`, { cache: false });
        isolated.setPermissionRequestHandler((_view, _permission, done) => done(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", blockPreviewDownload);
        const view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
        view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        const navigation = (event: Electron.Event, target: string) => { try { previewUrl(target); } catch { event.preventDefault(); } };
        view.webContents.on("will-navigate", navigation);
        view.webContents.on("will-redirect", navigation);
        const owned: NonNullable<typeof preview> = { view, storage: isolated, profileId, sessionId: input.sessionId, url: "" };
        preview = owned;
        previewAdmission = null;
        mainWindow!.contentView.addChildView(view);
        await view.webContents.loadURL("about:blank");
        if (preview !== owned || activeProfileId !== profileId) return;
      }
      const owned = preview, scoped = attentionClient;
      const ownerSession = scoped?.getState().snapshot?.sessions.find((session) => session.id === owned.sessionId);
      if (!owned.host && !owned.registration && scoped && ownerSession?.controls.env === "Local" && scoped.getState().snapshot?.policy.allowedEnvs.includes("Local")) {
        owned.registration = (async () => {
          const host = await SessionBrowserHost.attach(scoped, owned.sessionId, owned.view.webContents,
            () => preview === owned && activeProfileId === owned.profileId,
            (message) => console.error(message));
          if (preview !== owned || activeProfileId !== owned.profileId) { await host.close(); return; }
          owned.host = host;
        })();
      }
      await owned.registration;
      if (preview !== owned) return;
      const available = mainWindow!.getContentBounds();
      const x = Math.max(0, Math.min(available.width - 1, Math.round(Number(input.bounds.x))));
      const y = Math.max(0, Math.min(available.height - 1, Math.round(Number(input.bounds.y))));
      preview.view.setBounds({ x, y, width: Math.max(1, Math.min(available.width - x, Math.round(Number(input.bounds.width)))), height: Math.max(1, Math.min(available.height - y, Math.round(Number(input.bounds.height)))) });
      if (url && (input.reload || preview.url !== url.href)) {
        if (owned.host) await owned.host.navigateByUser(url.href);
        else await owned.view.webContents.loadURL(url.href);
        if (preview === owned) owned.url = url.href;
      }
    });
    ipcMain.handle("moguri:browser-control", async (event, sessionId: unknown, enabled: unknown, profileId: unknown) => {
      trusted(event);
      const owned = preview;
      if (!owned || owned.profileId !== profileId || activeProfileId !== profileId || owned.sessionId !== sessionId || typeof enabled !== "boolean") throw new Error("Choose the actual active session Browser pane. No other browser was controlled.");
      await owned.registration;
      if (preview !== owned || !owned.host) throw new Error("The original browser closed before control changed.");
      return owned.host.control(enabled);
    });
    ipcMain.handle("moguri:html-preview", async (event, raw: unknown, profileId: unknown) => {
      trusted(event);
      const window = mainWindow, sdk = attentionClient, epoch = profileEpoch;
      if (!window || !sdk || profileId !== activeProfileId || sdk.profileId !== profileId) throw new Error("The original HTML profile/window is no longer active. No page was shown.");
      const input = parse(HtmlPreviewInputSchema, raw);
      if (input.type === "hide") { await htmlPreview.hide(sdk.profileId, input); return; }
      await htmlPreview.show(window, sdk, input, () => mainWindow === window && attentionClient === sdk && profileEpoch === epoch && !maintenancePending);
    });
    ipcMain.handle("moguri:audio-permission", async (event, input: unknown) => {
      trusted(event);
      if (!isRecord(input) || input.profileId !== activeProfileId || input.purpose !== "capture" && input.purpose !== "devices" && input.purpose !== "standby" ||
        Object.keys(input).some((key) => !["profileId", "purpose", "sessionId", "jobId"].includes(key)) ||
        input.purpose === "devices" && (input.sessionId !== undefined || input.jobId !== undefined) ||
        input.purpose === "standby" && input.jobId !== undefined) throw new Error("Choose an explicit audio-only action in the active profile.");
      const purpose = input.purpose;
      if (audioPending) throw new Error("Another explicitly owned audio permission request is still pending.");
      audioPending = true;
      try {
      const scoped = attentionClient, epoch = profileEpoch;
      if (!scoped) throw new Error("The actual profile is not connected.");
      await scoped.refresh();
      const generated = generatedAudio();
      const validCapture = () => purpose === "devices" || purpose === "standby" ?
        purpose === "devices" || typeof input.sessionId === "string" && (generated || mainWindow?.isFocused()) &&
          scoped.getState().snapshot?.settings.values.voice.enabled !== false && scoped.getState().snapshot?.settings.values.voice.standby === true &&
          scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId && session.status !== "archived") :
        typeof input.sessionId === "string" && typeof input.jobId === "string" &&
        scoped.getState().snapshot?.sessions.some((session) => session.id === input.sessionId && session.status !== "archived") &&
        scoped.getState().snapshot?.jobs.some((job) => job.id === input.jobId && job.sessionId === input.sessionId && job.kind === "voice.capture" && job.status === "running");
      if (attentionClient !== scoped || epoch !== profileEpoch || !validCapture()) throw new Error("The original audio owner changed. No microphone access was granted.");
      if (audioGranted()) throw new Error("Another explicit microphone permission request is still owned. Finish or cancel it first.");
      if (process.env.MOGURI_TEST_WINDOW === "hidden" && !generated) throw new Error("Hidden audio checks require Chromium's generated media device. No real microphone permission was requested.");
      const permission = !generated && process.platform === "darwin" ? await microphonePermission(purpose, systemPreferences) :
        { allowed: generated || purpose !== "standby", prompted: false };
      if (!permission.allowed) {
        if (purpose === "standby") return null;
        throw new Error("Microphone access was denied. The saved draft was not changed.");
      }
      if (permission.prompted) await scoped.refresh();
      if (event.sender !== mainWindow?.webContents || attentionClient !== scoped || epoch !== profileEpoch || !validCapture()) throw new Error("Audio permission finished for a stale owner. No late microphone was opened.");
      const id = randomUUID();
      audioGrant = { id, profileId: activeProfileId, epoch, expires: Date.now() + 30_000,
        sessionId: purpose === "devices" ? null : String(input.sessionId), jobId: purpose === "capture" ? String(input.jobId) : null, purpose };
      return id;
      } finally { audioPending = false; }
    });
    ipcMain.handle("moguri:audio-release", (event, id: unknown) => {
      trusted(event);
      if (typeof id !== "string") throw new Error("The original audio permission lease is required.");
      if (audioGrant?.id === id) audioGrant = null;
    });
    powerMonitor.on("suspend", () => { audioGrant = null; mainWindow?.webContents.send("moguri:audio-stop"); });
    async function createWindow() {
      mainWindow = new BrowserWindow({
        title: "Moguri", width: 1440, height: 940, minWidth: 840, minHeight: 620,
        show: process.env.MOGURI_TEST_WINDOW !== "hidden", titleBarStyle: "hiddenInset", backgroundColor: "#000000",
        icon: join(app.getAppPath(), "dist", "branding", "moguri.png"),
        webPreferences: { preload: join(dirname(fileURLToPath(import.meta.url)), "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
          additionalArguments: [`--moguri-home=${homedir()}`] },
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
        const reason = unloadReason, closing = closeIntent;
        unloadReason = null; closeIntent = false;
        if (discardNextUnload) { discardNextUnload = false; event.preventDefault(); return; }
        if (reason === "drafts") {
          afterSave = closing ? "close" : "reload";
          // The renderer is saving; it reports back and the original close or quit continues.
          if (draftSave) clearTimeout(draftSave);
          draftSave = setTimeout(() => { draftSave = null; draftSaveFailed("Saving didn't finish within 15 seconds."); }, 15_000);
          return;
        }
        if (process.env.MOGURI_TEST_WINDOW === "hidden") {
          explicitQuitRequested = false;
          console.error("Hidden generated window kept open for pending edits. No native confirmation dialog was opened.");
          return;
        }
        const choice = dialog.showMessageBoxSync(mainWindow!, {
          type: "warning", title: "Unsaved changes", message: "Keep Moguri open to save your edits, or explicitly discard them.",
          buttons: ["Keep saving", "Discard unsaved edits"], defaultId: 0, cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
        else explicitQuitRequested = false;
      });
      mainWindow.on("close", () => { closeIntent = true; });
      mainWindow.on("closed", () => { audioGrant = null; hidePreview(); mainWindow = null;
        void htmlPreview.close().catch((error: unknown) => console.error("Original HTML window cleanup is unconfirmed:", error instanceof Error ? error.message : "unknown cleanup")); });
      mainWindow.on("blur", () => { audioGrant = null; mainWindow?.webContents.send("moguri:audio-stop"); });
      await mainWindow.loadURL("moguri://app/");
    }
    nativeInitialized = true; startupPhaseChanged("ready"); nativeReady.resolve();
    await openingWindow;
    if (closeRequested) return;
    const checkUpdates = async () => {
      const scoped = attentionClient;
      if (!scoped || maintenancePending || process.env.MOGURI_TEST_WINDOW === "hidden") return;
      const configuration = (await scoped.application.status()).configuration;
      if (!configuration.values.automaticUpdates) return;
      try { await scoped.application.updates.check(true); }
      catch (error) { if (!(error instanceof ClientError && error.code === "update_automatic_blocked")) soundError(scoped.profileId, error); }
    };
    if (process.env.MOGURI_TEST_WINDOW !== "hidden") {
      void checkUpdates().catch((error: unknown) => soundError(activeProfileId, error));
      updateTimer = setInterval(() => { void checkUpdates().catch((error: unknown) => soundError(activeProfileId, error)); }, 4 * 60 * 60_000);
    }
  }).catch((error: unknown) => {
    startupPhaseChanged("failed");
    nativeReady.reject(error);
    if (error instanceof ServiceUpgradeCancelled || closeRequested) { app.quit(); return; }
    console.error("Moguri desktop startup failed:", error instanceof Error ? error.message : "Unknown startup error.");
    if (process.env.MOGURI_TEST_WINDOW !== "hidden") dialog.showErrorBox("Moguri could not start", error instanceof Error ? error.message : "Inspect the service log.");
  });
  app.on("will-quit", () => { clearInterval(updateTimer); if (trayRefresh) clearTimeout(trayRefresh); globalShortcut.unregisterAll(); tray?.destroy(); tray = null; });
}
