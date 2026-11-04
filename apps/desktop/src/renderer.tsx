import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Alert } from "./Alert.tsx";
import { MoguriSdk } from "../../../packages/sdk/src/index.ts";
import type { DesktopStartupPhase } from "./bridge.d.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const openingBegan = performance.now();
root.render(<main className="startup-screen" role="status"><h1>Moguri</h1><p>Opening your workspace...</p></main>);
const startupLabels: Record<DesktopStartupPhase, string> = {
  window: "Preparing the desktop", service: "Waiting for the local service",
  profile: "Connecting the profile", preferences: "Reading application preferences",
  native: "Preparing native controls", ready: "Connecting the workspace", failed: "Startup did not complete",
};
let opening = true, progressPending = false;
const progress = setInterval(() => {
  if (!opening || progressPending) return;
  progressPending = true;
  void window.moguri.startupStatus().then((status) => {
    if (opening) root.render(<main className="startup-screen"><h1>Moguri</h1><p role="status">Opening your workspace... {startupLabels[status.phase]}.</p>
      <p>{Math.floor((performance.now() - openingBegan) / 1000)} seconds opening this window</p></main>);
  }).catch((error: unknown) => {
    if (opening) root.render(<main className="startup-screen"><h1>Moguri</h1><p role="status">Opening your workspace...</p>
      <Alert as="p" role="alert">Startup progress could not be read: {error instanceof Error ? error.message : "Native diagnostics are unavailable."}</Alert></main>);
  }).finally(() => { progressPending = false; });
}, 500);
try {
  const connection = await window.moguri.connection();
  const profileId = await window.moguri.profile();
  const client = new MoguriSdk(connection, () => window.moguri.connection(), profileId);
  opening = false;
  root.render(<App client={client} />);
  await client.connect();
} catch (error) {
  opening = false;
  root.render(<main className="startup-error"><h1>Moguri could not connect</h1><p>{error instanceof Error ? error.message : "Inspect the local service log, then reopen Moguri."}</p></main>);
} finally { clearInterval(progress); }
