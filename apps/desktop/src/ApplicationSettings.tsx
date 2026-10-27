import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { ApplicationConfiguration, ApplicationPreferences, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { CliCommandSettings } from "./CliCommandSettings.tsx";

export function ApplicationSettings({ sdk, revision, onBusy }: { sdk: MoguriSdk; revision: number; onBusy: (busy: boolean) => void }) {
  const [configuration, setConfiguration] = useState<ApplicationConfiguration | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pending, setPending] = useState<Partial<ApplicationPreferences>>({});
  const [cliBusy, setCliBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => { onBusy(busy || cliBusy || Object.keys(pending).length > 0); return () => onBusy(false); }, [busy, cliBusy, pending, onBusy]);
  useEffect(() => {
    const generation = ++request.current;
    void sdk.application.status().then((value) => { if (generation === request.current) setConfiguration(value.configuration); })
      .catch((error: unknown) => { if (generation === request.current) setError(error instanceof Error ? error.message : "Application preferences could not be read."); });
    return () => { request.current++; };
  }, [sdk, revision]);
  const preference = async (key: keyof ApplicationPreferences, value: boolean) => {
    if (!configuration || busy) return;
    setBusy(true); setError(""); setPending((current) => ({ ...current, [key]: value }));
    try {
      await sdk.application.configure(key === "menuBar" ? { menuBar: value } : { automaticUpdates: value }, configuration.revision);
      setConfiguration((await sdk.application.status()).configuration);
      if (key === "menuBar") await window.moguri.applyApplicationPreferences();
      setPending((current) => { const { [key]: _, ...rest } = current; return rest; });
    } catch (error) { setError(error instanceof Error ? error.message : "The menu-bar setting was not applied."); }
    finally { setBusy(false); }
  };
  return <><section aria-label="Application preferences">
    <SettingsHelp label="More about this setting" target={<h3>Application</h3>}>These preferences belong to this encrypted store and apply across profiles. Profile appearance and voice settings stay separate.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" checked={pending.menuBar ?? configuration?.values.menuBar ?? false} disabled={!configuration || busy} onChange={(event) => void preference("menuBar", event.target.checked)} />Show Moguri in the menu bar</label>
    <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={pending.automaticUpdates ?? configuration?.values.automaticUpdates ?? false} disabled={!configuration || busy} onChange={(event) => void preference("automaticUpdates", event.target.checked)} />Automatically check and stage updates at app startup and every four hours</label>}>Checks need the separate private-release credential below. Installation and restart always require actual confirmation; disabling checks affects future admissions, not already owned downloads.</SettingsHelp>
    {error && <><p className="inline-error" role="alert">{error}</p><button type="button" disabled={busy} onClick={() => {
      setBusy(true); void sdk.application.status().then(async (value) => { setConfiguration(value.configuration); await window.moguri.applyApplicationPreferences(); setPending({}); setError(""); })
        .catch((error: unknown) => setError(error instanceof Error ? error.message : "The actual saved native preference could not be applied.")).finally(() => setBusy(false));
    }} aria-label="Reload and apply saved application preference">Reload and apply</button></>}
  </section><CliCommandSettings onBusy={setCliBusy} /></>;
}
