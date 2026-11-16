import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { ApplicationConfiguration, ApplicationPreferences, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { CliCommandSettings } from "./CliCommandSettings.tsx";
import { Alert } from "./Alert.tsx";

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
      const changes: Partial<ApplicationPreferences> = { [key]: value };
      await sdk.application.configure(changes, configuration.revision);
      setConfiguration((await sdk.application.status()).configuration);
      if (key !== "automaticUpdates") await window.moguri.applyApplicationPreferences();
      setPending((current) => { const { [key]: _, ...rest } = current; return rest; });
    } catch (error) { setError(error instanceof Error ? error.message : "The application setting was not applied."); }
    finally { setBusy(false); }
  };
  return <><section aria-label="Application preferences">
    <SettingsHelp label="More about this setting" target={<h3>Application</h3>}>These apply to every profile. Appearance and voice are set per profile.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" checked={pending.menuBar ?? configuration?.values.menuBar ?? false} disabled={!configuration || busy} onChange={(event) => void preference("menuBar", event.target.checked)} />Show Moguri in the menu bar</label>
    <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox"
      checked={pending.keepServiceOnWindowClose ?? configuration?.values.keepServiceOnWindowClose ?? true} disabled={!configuration || busy}
      onChange={(event) => void preference("keepServiceOnWindowClose", event.target.checked)} />Keep agents running when the last window closes</label>}>
      Agents and terminals keep running in the background, and reopening Moguri reconnects to them. Quit always stops them.
    </SettingsHelp>
    <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={pending.automaticUpdates ?? configuration?.values.automaticUpdates ?? false} disabled={!configuration || busy} onChange={(event) => void preference("automaticUpdates", event.target.checked)} />Check for and download updates automatically</label>}>Checks run at startup and every four hours, using the update token below. Installing and restarting always waits for your confirmation.</SettingsHelp>
    {error && <><Alert as="p" className="inline-error" role="alert">{error}</Alert><button type="button" disabled={busy} onClick={() => {
      setBusy(true); void sdk.application.status().then(async (value) => { setConfiguration(value.configuration); await window.moguri.applyApplicationPreferences(); setPending({}); setError(""); })
        .catch((error: unknown) => setError(error instanceof Error ? error.message : "The saved preference could not be applied.")).finally(() => setBusy(false));
    }} aria-label="Reload and apply saved application preference">Reload and apply</button></>}
  </section><CliCommandSettings onBusy={setCliBusy} /></>;
}
