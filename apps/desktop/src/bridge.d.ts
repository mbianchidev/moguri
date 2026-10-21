import type { ArtifactExport, Connection } from "../../../packages/protocol/src/index.ts";

export interface DesktopBridge {
  connection(): Promise<Connection>;
  profile(profileId?: string): Promise<string>;
  chooseProject(): Promise<string | null>;
  chooseFile(projectPath: string): Promise<string | null>;
  chooseAttachment(kind: "file" | "image" | "folder"): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  microphonePermission(): Promise<boolean>;
  copyText(text: string): Promise<void>;
  saveDocument(document: ArtifactExport): Promise<{ path: string; digest: string } | null>;
  preview(input: { sessionId: string; url: string; bounds: { x: number; y: number; width: number; height: number } } | null, profileId: string): Promise<void>;
  onNavigateSession(listener: (sessionId: string, profileId: string) => void): () => void;
}
declare global { interface Window { moguri: DesktopBridge } }
