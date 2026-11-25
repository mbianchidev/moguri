import { useEffect, useRef, useState } from "react";
import { defaultStainlessSettings, stainlessSummary, type MoguriSdk, type Session, type StainlessSettings, type StainlessStatus } from "@moguri-dev/sdk";
import { IntegrationTitle } from "./IntegrationLogo.tsx";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

const RELEASES = "https://github.com/mbianchidev/stainless/releases";

/** Reads the shared Stainless status and refreshes it whenever settings change. */
function useStainlessStatus(sdk: MoguriSdk, revision: number) {
  const [status, setStatus] = useState<StainlessStatus | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = () => {
    const current = ++generation.current;
    void sdk.stainless.status().then((value) => { if (current === generation.current) { setStatus(value); setError(""); } },
      (failure: unknown) => { if (current === generation.current) setError(failure instanceof Error ? failure.message : "Stainless status is unavailable."); });
  };
  useEffect(refresh, [sdk, revision]);
  return { status, setStatus, error, setError, refresh, generation };
}

export function StainlessSettingsPanel({ sdk, revision, settings, saving, save }: {
  sdk: MoguriSdk; revision: number; settings: StainlessSettings | undefined; saving: boolean; save: (settings: StainlessSettings) => Promise<void>;
}) {
  const committed = settings ?? defaultStainlessSettings();
  const { status, setStatus, error, setError, generation } = useStainlessStatus(sdk, revision);
  const [appPath, setAppPath] = useState(committed.appPath ?? "");
  const [checking, setChecking] = useState(false);
  useEffect(() => setAppPath(committed.appPath ?? ""), [committed.appPath]);
  const pathDirty = appPath.trim() !== (committed.appPath ?? "");
  const check = async () => {
    const current = ++generation.current;
    setChecking(true); setError("");
    try { const value = await sdk.stainless.check(); if (current === generation.current) setStatus(value); }
    catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : "The compatibility check did not finish."); }
    finally { setChecking(false); }
  };
  const installation = status?.installation;
  return <>
    <SettingsHelp label="More about this setting" target={<h2><IntegrationTitle id="stainless">Stainless</IntegrationTitle></h2>}>Use your installed Stainless browser for previews and agent browser automation. Opening a preview hands one URL to Stainless; agents get a new headless Stainless with a throwaway profile, never your profiles, windows or cookies. While on, every agent browser automation runs in Stainless instead of another Chromium, and stops before launching if Stainless isn't ready. Off by default.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" checked={committed.enabled} disabled={saving} onChange={(event) => void save({ ...committed, enabled: event.target.checked })} />Use Stainless</label>
    <form className="branch-prefix-form" onSubmit={(event) => { event.preventDefault(); if (pathDirty) void save({ ...committed, appPath: appPath.trim() || null }); }}>
      <label className="setting-field">Stainless app location<SettingsInput aria-label="Stainless app location" value={appPath} placeholder="/Applications/Stainless.app" spellCheck={false}
        onChange={(event) => setAppPath(event.target.value)} /></label>
      <button type="submit" className="primary" aria-label="Save Stainless app location" disabled={saving || !pathDirty}>Save</button>
    </form>
    <p className="fine-print">Leave empty to look in /Applications, then ~/Applications. A saved location is used exactly; nothing else is searched.</p>
    <p role="status" aria-label="Stainless status">{status ? stainlessSummary(status) : "Reading Stainless status..."}</p>
    {installation && <dl className="facts">
      <dt>Version</dt><dd>{installation.version ?? "Not declared"}{installation.build !== null ? ` (build ${installation.build})` : ""}{installation.channel ? `, ${installation.channel}` : ""}</dd>
      <dt>Chromium</dt><dd>{installation.chromium}</dd>
      <dt>Location</dt><dd className="path">{installation.appPath}</dd>
      <dt>Tested with Moguri</dt><dd>{status.tested ? "Yes" : "No"}</dd>
      <dt>Last check</dt><dd>{status.check ? `${status.check.outcome === "passed" ? "Passed" : "Failed"} in ${(status.check.durationMs / 1000).toFixed(1)} s` : "Not run since Moguri started"}</dd>
    </dl>}
    {status?.check?.diagnostic && <Alert as="p" tone="warning" className="settings-warning">{status.check.diagnostic}</Alert>}
    {status?.availability === "missing" && status.supported && <button type="button" onClick={() => void window.moguri.openExternal(RELEASES).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The download page could not open."))}>Get Stainless</button>}
    <button type="button" disabled={saving || checking || !committed.enabled || status?.availability !== "found"} onClick={() => void check()}>{checking ? "Checking..." : "Check compatibility"}</button>
    <p className="fine-print">The check starts a hidden Stainless with a throwaway profile, loads a generated page on this Mac and closes it. Nothing is sent to a model.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </>;
}

/** Stainless strip in the session Browser panel: status, setup link and "Open in Stainless" for Local previews. */
export function StainlessBrowserRow({ sdk, session, revision, url, openSettings }: {
  sdk: MoguriSdk; session: Session; revision: number; url: string | null | undefined; openSettings: () => void;
}) {
  const { status, error, setError } = useStainlessStatus(sdk, revision);
  const [opening, setOpening] = useState(false);
  if (!status) return null;
  const local = session.controls.env === "Local";
  const usable = status.enabled && status.availability === "found";
  const open = async () => {
    setOpening(true); setError("");
    try { await sdk.stainless.open(session.id, url!); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Stainless did not open the page."); }
    finally { setOpening(false); }
  };
  return <div className="browser-stainless" aria-label="Stainless">
    {usable && local ? <button type="button" disabled={!url || opening} onClick={() => void open()}>{opening ? "Opening..." : "Open in Stainless"}</button> :
      <button type="button" onClick={openSettings}>Stainless settings</button>}
    <span className="fine-print" role="status">{usable && !local ? `Stainless opens Local previews only. This session runs in ${session.controls.env}; no Local replacement is used.` : stainlessSummary(status)}</span>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </div>;
}
