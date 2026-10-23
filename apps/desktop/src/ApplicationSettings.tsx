import { useEffect, useRef, useState } from "react";
import type { ApplicationConfiguration, MoguriSdk } from "../../../packages/sdk/src/index.ts";

export function ApplicationSettings({ sdk, revision, onBusy }: { sdk: MoguriSdk; revision: number; onBusy: (busy: boolean) => void }) {
  const [configuration, setConfiguration] = useState<ApplicationConfiguration | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pendingMenuBar, setPendingMenuBar] = useState<boolean | null>(null);
  const request = useRef(0);
  useEffect(() => { onBusy(busy || pendingMenuBar !== null); return () => onBusy(false); }, [busy, pendingMenuBar, onBusy]);
  useEffect(() => {
    const generation = ++request.current;
    void sdk.application.status().then((value) => { if (generation === request.current) setConfiguration(value.configuration); })
      .catch((error: unknown) => { if (generation === request.current) setError(error instanceof Error ? error.message : "Application preferences could not be read."); });
    return () => { request.current++; };
  }, [sdk, revision]);
  const menuBar = async (value: boolean) => {
    if (!configuration || busy) return;
    setBusy(true); setError(""); setPendingMenuBar(value);
    try {
      await sdk.application.configure({ menuBar: value }, configuration.revision);
      setConfiguration((await sdk.application.status()).configuration);
      await window.moguri.applyApplicationPreferences();
      setPendingMenuBar(null);
    } catch (error) { setError(error instanceof Error ? error.message : "The menu-bar setting was not applied."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Application preferences"><h3>Application</h3>
    <p className="fine-print">These preferences belong to this encrypted store and apply across profiles. Profile appearance and voice settings stay separate.</p>
    <label className="check-setting"><input type="checkbox" checked={pendingMenuBar ?? configuration?.values.menuBar ?? false} disabled={!configuration || busy} onChange={(event) => void menuBar(event.target.checked)} />Show Moguri in the menu bar</label>
    {error && <><p className="inline-error" role="alert">{error}</p><button type="button" disabled={busy} onClick={() => {
      setBusy(true); void sdk.application.status().then(async (value) => { setConfiguration(value.configuration); await window.moguri.applyApplicationPreferences(); setPendingMenuBar(null); setError(""); })
        .catch((error: unknown) => setError(error instanceof Error ? error.message : "The actual saved native preference could not be applied.")).finally(() => setBusy(false));
    }}>Reload and apply saved application preference</button></>}
  </section>;
}
