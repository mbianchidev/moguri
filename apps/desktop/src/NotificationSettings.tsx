import { useEffect, useState } from "react";
import { audioFromBase64, type MoguriSdk, type NotificationToneKind, type Snapshot, type UserSettings } from "../../../packages/sdk/src/index.ts";

type Preferences = UserSettings["notifications"];
const sounds = [{ key: "needsInputSound", kind: "needs-input", label: "Needs attention" }, { key: "completedSound", kind: "completed", label: "Session completed" }] as const;
export function NotificationSettings({ sdk, snapshot, values, disabled, onChange, onBusy, onError, onOutput }: {
  sdk: MoguriSdk; snapshot: Snapshot; values: Preferences; disabled: boolean;
  onChange: (patch: Partial<Preferences>) => void; onBusy: (busy: boolean) => void; onError: (error: string) => void; onOutput: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false), [remove, setRemove] = useState<string | null>(null);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); onError("");
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : "The sound operation failed. No alternate audio was substituted."); }
    finally { setBusy(false); }
  };
  const preview = (kind: NotificationToneKind, id: string) => run(async () => {
    const result = await window.moguri.previewNotificationSound(sdk.profileId, kind, id);
    onOutput(result.requested ? "Sound preview requested. Output depends on the system volume and device." : "Sound validated; playback is suppressed in the generated hidden window.");
  });
  return <><h2>Attention notifications</h2><p>Questions, pending approvals and completed/failed work use the shared service state. Reading a notification never answers or approves anything.</p>
    <label className="check-setting"><input type="checkbox" checked={values.inApp} disabled={disabled} onChange={(event) => onChange({ inApp: event.target.checked })} />Show in-app attention dots and icons</label>
    <label className="check-setting"><input type="checkbox" checked={values.os} disabled={disabled} onChange={(event) => onChange({ os: event.target.checked })} />Enable OS banners while Moguri desktop runs in the background</label>
    <label className="check-setting"><input type="checkbox" checked={values.previewContent} disabled={disabled} onChange={(event) => onChange({ previewContent: event.target.checked })} />Include session title and message preview in OS banners</label>
    <p className="settings-warning">OS banners start off and respect operating-system permissions and Do Not Disturb. Their sound is disabled to avoid duplicate alerts. Separate application sounds use the controls below and the system output volume.</p>
    <h3>Sounds</h3>
    {sounds.map(({ key, kind, label }) => {
      const choice = values[key] ?? { enabled: true, id: "default" };
      return <section key={key} aria-label={`${label} sound`}>
        <label className="check-setting"><input type="checkbox" checked={choice.enabled} disabled={disabled || busy} onChange={(event) => onChange({ [key]: { ...choice, enabled: event.target.checked } })} />Play a sound: {label.toLowerCase()}</label>
        <label className="setting-field">{label} sound<select aria-label={`${label} sound`} value={choice.id} disabled={disabled || busy} onChange={(event) => onChange({ [key]: { ...choice, id: event.target.value } })}>
          <option value="default">Moguri default</option>
          {choice.id !== "default" && !snapshot.notificationSounds.some((sound) => sound.id === choice.id) && <option value={choice.id} disabled>Saved sound unavailable; no substitute</option>}
          {snapshot.notificationSounds.map((sound) => <option value={sound.id} key={sound.id}>{sound.name}</option>)}
        </select></label>
        <button type="button" disabled={disabled || busy} aria-label={`Preview ${label.toLowerCase()} sound`} onClick={() => void preview(kind, choice.id)}>Preview</button>
      </section>;
    })}
    <label className="check-setting"><input type="checkbox" checked={values.soundWhileFocused ?? true} disabled={disabled || busy} onChange={(event) => onChange({ soundWhileFocused: event.target.checked })} />Play application sounds while Moguri is focused</label>
    <p className="fine-print">Attention audio requires an actual unanswered question, pending approval or failed/partial work, not an inferred badge. Completed audio excludes stopped, failed and partial work. Both sounds start enabled while focused and in the background; your saved mute/focus choices are preserved. Startup and reconnect do not replay old sounds.</p>
    <h3>Custom sounds</h3><p>Import an explicit mono 16-kHz PCM16 WAV of at most ten seconds. The encrypted snapshot belongs to this profile, independent of sessions and the original file. No compressed audio decoding or silent conversion.</p>
    <button type="button" disabled={disabled || busy || snapshot.notificationSounds.length >= 32} onClick={() => void run(async () => {
      const selection = await window.moguri.chooseNotificationSound(sdk.profileId);
      if (!selection) return;
      await sdk.notifications.importSound(selection.name, audioFromBase64(selection.audio));
      onOutput("Sound imported. Choose it separately for attention or completion alerts.");
    })}>Import notification sound</button>
    {snapshot.notificationSounds.map((sound) => {
      const selected = sounds.some(({ key }) => values[key]?.id === sound.id);
      return <section key={sound.id} aria-label={`Retained sound ${sound.name}`}>
        <p>{sound.name} <span className="fine-print">({sound.durationMs / 1000} seconds)</span></p>
        {selected ? <p className="fine-print">Choose another sound before removal.</p> : <><label className="check-setting"><input type="checkbox" checked={remove === sound.id} disabled={busy} onChange={(event) => setRemove(event.target.checked ? sound.id : null)} />Confirm removal of {sound.name}</label>
          <button type="button" disabled={disabled || busy || remove !== sound.id} onClick={() => void run(async () => {
            await sdk.notifications.removeSound(sound.id, sound.contentDigest, true); setRemove(null); onOutput("Unused sound removed from this profile's encrypted retention.");
          })}>Remove {sound.name}</button></>}
      </section>;
    })}
  </>;
}
