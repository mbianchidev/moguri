import type { ArtifactExport, BrowserState, Connection, SkillSource } from "../../../packages/sdk/src/index.ts";
import type { CliInstallationRequest, CliInstallationStatus } from "./cli-installation.ts";
import type { StartupContext } from "./startup-cache.ts";
import type { RendererTrayAction } from "./tray-menu.ts";

export type DesktopStartupPhase = "window" | "service" | "profile" | "preferences" | "native" | "ready" | "failed";
export interface DesktopStartupStatus {
  phase: DesktopStartupPhase;
  elapsedMs: number;
  totalMs: number;
  completed: Array<{ phase: DesktopStartupPhase; durationMs: number }>;
  revision: number;
  canReconnect: boolean;
  diagnostic: string | null;
}
export interface DesktopBridge {
  previewHtml(input: import("../../../packages/sdk/src/index.ts").HtmlPreviewInput, profileId: string): Promise<void>;
  onHtmlDismiss(listener: (attachmentId: string) => void): () => void;
  connection(): Promise<Connection>;
  startupContext(): Promise<StartupContext>;
  startupStatus(): Promise<DesktopStartupStatus>;
  reconnectStartup(revision: number): Promise<{ requested: true }>;
  profile(profileId?: string): Promise<string>;
  chooseProject(purpose?: "import" | "clone" | "workspace"): Promise<string | null>;
  chooseFile(projectPath: string): Promise<string | null>;
  chooseAttachment(kind: "file" | "image" | "folder" | "document"): Promise<string | null>;
  chooseVoiceModel(): Promise<string | null>;
  /** Native file or folder picker; typed paths remain available next to every picker. */
  choosePath(input: { kind: "file" | "folder"; title: string; extensions?: string[]; defaultPath?: string }): Promise<string | null>;
  /** The user's home folder, used to expand `~` in typed paths. */
  readonly homeDirectory: string;
  /** False in hidden generated test windows unless they opt in; Getting started then opens only from Settings. */
  readonly automaticOnboarding: boolean;
  loadNotificationSound(profileId: string, path: string): Promise<{ name: string; audio: string }>;
  openExternal(url: string): Promise<void>;
  projectLocation(profileId: string, projectId: string, expectedPath: string, action: "show-folder" | "open-remote"): Promise<{ opened: boolean; location: string }>;
  sessionLocation(profileId: string, sessionId: string, action: "show-folder" | "open-remote"): Promise<{ opened: boolean; location: string }>;
  /** Shows one file the service currently lists in the project's artifact library in Finder. Never opens or runs it. */
  revealArtifact(profileId: string, projectId: string | null, path: string): Promise<{ revealed: boolean; path: string }>;
  /** Moves listed artifact files to the Trash. Each result reports its own outcome; a failure never stops the report. */
  trashArtifacts(profileId: string, projectId: string | null, paths: string[]): Promise<{ path: string; trashed: boolean; error?: string }[]>;
  globalSkillSources(profileId: string): Promise<Array<Extract<SkillSource, { kind: "local" }>>>;
  createGlobalSkillFolder(profileId: string, id: string): Promise<Extract<SkillSource, { kind: "local" }>>;
  audioPermission(input: { profileId: string; purpose: "capture" | "devices"; sessionId?: string; jobId?: string }): Promise<string>;
  audioPermission(input: { profileId: string; purpose: "standby"; sessionId: string }): Promise<string | null>;
  releaseAudioPermission(id: string): Promise<void>;
  onAudioStop(listener: () => void): () => void;
  chooseNotificationSound(profileId: string): Promise<{ name: string; audio: string } | null>;
  previewNotificationSound(profileId: string, kind: "needs-input" | "completed", soundId: string): Promise<{ requested: boolean }>;
  onNotificationAudio(listener: (profileId: string, audio: string) => void): () => void;
  onNavigateInbox(listener: (attentionId: string, profileId: string) => void): () => void;
  onNavigateSuggestions(listener: (profileId: string) => void): () => void;
  onTrayAction(listener: (action: RendererTrayAction, profileId: string) => void): () => void;
  takeTrayAction(): Promise<{ action: RendererTrayAction; profileId: string } | null>;
  onNativeError(listener: (profileId: string, message: string) => void): () => void;
  applyApplicationPreferences(): Promise<{ menuBar: boolean; suppressed: boolean }>;
  cliInstallation(input: CliInstallationRequest): Promise<CliInstallationStatus>;
  onOpenSettings(listener: () => void): () => void;
  chooseStorageDirectory(): Promise<string | null>;
  relocateStorage(path: string, expectedDigest: string): Promise<{ id: string; directory: string; restarted: boolean }>;
  installUpdate(id: string, expectedDigest: string): Promise<void>;
  onUpdateAvailable(listener: (id: string, version: string) => void): () => void;
  copyText(text: string): Promise<void>;
  /** Tells the main process why the window refuses to close: drafts are saving, or an explicit-save edit is open. */
  unloadBlocked(reason: "drafts" | "edits"): void;
  /** Reports whether drafts saved before closing; on success the original close or quit continues. */
  draftsSettled(result: { ok: true } | { ok: false; error: string }): void;
  saveDocument(document: ArtifactExport): Promise<{ path: string; digest: string } | null>;
  preview(input: { sessionId: string; url: string | null; reload?: boolean; bounds: { x: number; y: number; width: number; height: number } } | null, profileId: string, closingSessionId?: string): Promise<void>;
  browserControl(sessionId: string, enabled: boolean, profileId: string): Promise<BrowserState>;
  onNavigateSession(listener: (sessionId: string, profileId: string) => void): () => void;
  onNavigateWork(listener: (itemId: string, profileId: string) => void): () => void;
}
declare global { interface Window { moguri: DesktopBridge } }
