import type { ArtifactExport, BrowserState, Connection } from "../../../packages/protocol/src/index.ts";
import type { CliInstallationRequest, CliInstallationStatus } from "./cli-installation.ts";
import type { StartupContext } from "./startup-cache.ts";

export type DesktopStartupPhase = "window" | "service" | "profile" | "preferences" | "native" | "ready" | "failed";
export interface DesktopStartupStatus {
  phase: DesktopStartupPhase;
  elapsedMs: number;
  totalMs: number;
  completed: Array<{ phase: DesktopStartupPhase; durationMs: number }>;
}
export interface DesktopBridge {
  previewHtml(input: import("../../../packages/sdk/src/index.ts").HtmlPreviewInput, profileId: string): Promise<void>;
  onHtmlDismiss(listener: (attachmentId: string) => void): () => void;
  connection(): Promise<Connection>;
  startupContext(): Promise<StartupContext>;
  startupStatus(): Promise<DesktopStartupStatus>;
  profile(profileId?: string): Promise<string>;
  chooseProject(purpose?: "import" | "clone"): Promise<string | null>;
  chooseFile(projectPath: string): Promise<string | null>;
  chooseAttachment(kind: "file" | "image" | "folder" | "document"): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  audioPermission(input: { profileId: string; purpose: "capture" | "devices"; sessionId?: string; jobId?: string }): Promise<string>;
  audioPermission(input: { profileId: string; purpose: "standby"; sessionId: string }): Promise<string | null>;
  releaseAudioPermission(id: string): Promise<void>;
  onAudioStop(listener: () => void): () => void;
  chooseNotificationSound(profileId: string): Promise<{ name: string; audio: string } | null>;
  previewNotificationSound(profileId: string, kind: "needs-input" | "completed", soundId: string): Promise<{ requested: boolean }>;
  onNotificationAudio(listener: (profileId: string, audio: string) => void): () => void;
  onNativeError(listener: (profileId: string, message: string) => void): () => void;
  applyApplicationPreferences(): Promise<{ menuBar: boolean; suppressed: boolean }>;
  cliInstallation(input: CliInstallationRequest): Promise<CliInstallationStatus>;
  onOpenSettings(listener: () => void): () => void;
  chooseStorageDirectory(): Promise<string | null>;
  relocateStorage(path: string, expectedDigest: string): Promise<{ id: string; directory: string; restarted: boolean }>;
  installUpdate(id: string, expectedDigest: string): Promise<void>;
  onUpdateAvailable(listener: (id: string, version: string) => void): () => void;
  copyText(text: string): Promise<void>;
  saveDocument(document: ArtifactExport): Promise<{ path: string; digest: string } | null>;
  preview(input: { sessionId: string; url: string | null; reload?: boolean; bounds: { x: number; y: number; width: number; height: number } } | null, profileId: string, closingSessionId?: string): Promise<void>;
  browserControl(sessionId: string, enabled: boolean, profileId: string): Promise<BrowserState>;
  onNavigateSession(listener: (sessionId: string, profileId: string) => void): () => void;
}
declare global { interface Window { moguri: DesktopBridge } }
