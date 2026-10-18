import type { Connection } from "../../../packages/protocol/src/index.ts";

export interface DesktopBridge {
  connection(): Promise<Connection>;
  chooseProject(): Promise<string | null>;
  chooseFile(projectPath: string): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  microphonePermission(): Promise<boolean>;
}
declare global { interface Window { moguri: DesktopBridge } }
