import { useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { StartupWorkspace } from "./StartupWorkspace.tsx";
import { SelectSearch } from "./SelectSearch.tsx";
import type { StartupView } from "./startup-cache.ts";
import type { AppProps } from "./App.tsx";
import type { MoguriSdk } from "@moguri-dev/sdk";
import type { DesktopStartupPhase } from "./bridge.d.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
// Classic (always shown) scroll bars take layout width and overlay ones take none; columns that line up across a scroller add it (#101).
const measureScrollbar = () => {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden";
  document.body.append(probe);
  document.documentElement.style.setProperty("--scrollbar-width", `${probe.offsetWidth - probe.clientWidth}px`);
  probe.remove();
};
measureScrollbar();
// The macOS scroll bar setting can change while Moguri runs; it is read again when the window returns to focus.
window.addEventListener("focus", measureScrollbar);
function DesktopStartup() {
  const [phase, setPhase] = useState<DesktopStartupPhase>("window");
  const [error, setError] = useState<string | null>(null), [cacheError, setCacheError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<{ revision: number; diagnostic: string } | null>(null);
  const [reconnecting, setReconnecting] = useState(false), [reconnectError, setReconnectError] = useState<string | null>(null);
  const [live, setLive] = useState<{ App: ComponentType<AppProps>; client: MoguriSdk; scopeKey: string | null; view: StartupView | null } | null>(null);
  useEffect(() => {
    let active = true, failed = false, client: MoguriSdk | undefined;
    const begin = async () => {
      const context = await window.moguri.startupContext();
      if (!active) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const [{ App }, loaded] = await Promise.all([import("./App.tsx"), (async () => {
        const [sdk, cache, connection] = await Promise.all([
          import("@moguri-dev/sdk"), import("./startup-cache.ts"), window.moguri.connection(),
        ]);
        if (!active || failed) return null;
        let profileId = context.profileId, cached: StartupView | null = null;
        try {
          profileId = cache.readStartupProfile(localStorage, context);
          cached = context.scopeKey ? cache.readStartupView(localStorage, context.scopeKey, profileId) : null;
        } catch (error) {
          console.error("Moguri startup presentation cache is unavailable:", error instanceof Error ? error.message : "invalid cache");
          setCacheError("The last-known view cache is unavailable. Authenticated live data will be loaded without replacing saved drafts.");
        }
        const selected = await window.moguri.profile();
        if (profileId !== selected) await window.moguri.profile(profileId);
        if (!active || failed) return null;
        client = new sdk.MoguriSdk(connection, () => window.moguri.connection(), profileId);
        await client.ready();
        if (!active || failed) { client.disconnect(); return null; }
        return { client, cached };
      })()]);
      if (!active || !loaded) return;
      const { client: ready, cached } = loaded;
      const liveContext = await window.moguri.startupContext();
      if (!active) { ready.disconnect(); return; }
      const matching = cached && cached.scopeKey === liveContext.scopeKey && cached.storeId === ready.connection.storeId && cached.profileId === ready.profileId ? cached : null;
      if (cached && !matching) console.error("The cached startup view belongs to different retained state. No cached selection was restored.");
      setLive({ App, client: ready, scopeKey: liveContext.scopeKey, view: matching });
    };
    void begin().catch((error: unknown) => {
      failed = true; client?.disconnect();
      if (active) { setPhase("failed"); setError(error instanceof Error ? error.message : "Inspect the original service log; no request was replayed."); }
    });
    return () => { active = false; client?.disconnect(); };
  }, []);
  useEffect(() => {
    if (live || error) return;
    let active = true, pending = false;
    const progress = setInterval(() => {
      if (pending) return; pending = true;
      void window.moguri.startupStatus().then((status) => {
        if (!active) return;
        setPhase(status.phase);
        setWaiting(status.canReconnect && status.diagnostic ? { revision: status.revision, diagnostic: status.diagnostic } : null);
      })
        .catch((error: unknown) => { console.error("Startup progress is unavailable:", error instanceof Error ? error.message : "native diagnostics failed"); })
        .finally(() => { pending = false; });
    }, 500);
    return () => { active = false; clearInterval(progress); };
  }, [live, error]);
  const reconnect = async () => {
    if (!waiting || reconnecting) return;
    setReconnecting(true); setReconnectError(null);
    try {
      await window.moguri.reconnectStartup(waiting.revision);
      setWaiting(null); setPhase("service");
    } catch (error) { setReconnectError(error instanceof Error ? error.message : "The original service reconnect was not admitted. Saved drafts remain with the original service."); }
    finally { setReconnecting(false); }
  };
  return live ? <live.App client={live.client} startupScope={live.scopeKey} startupView={live.view} /> :
    <StartupWorkspace phase={phase} error={error ?? reconnectError ?? waiting?.diagnostic ?? null} cacheError={cacheError}
      unconfirmed={Boolean(waiting && !error)} reconnect={waiting ? () => { void reconnect(); } : undefined} reconnecting={reconnecting} />;
}
root.render(<><DesktopStartup /><SelectSearch /></>);
