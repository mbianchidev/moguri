import { SettingsAction, SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import { audioFromBase64, type MoguriSdk, type NotificationToneKind, type Snapshot, type UserSettings } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { PathField, localPath } from "./PathField.tsx";

type Preferences = UserSettings["notifications"];
const sounds = [{ key: "needsInputSound", kind: "needs-input", label: "Needs attention" }, { key: "completedSound", kind: "completed", label: "Session completed" }] as const;
export function NotificationSettings({ sdk, snapshot, values, disabled, onChange, onBusy, onError, onOutput }: {
  sdk: MoguriSdk; snapshot: Snapshot; values: Preferences; disabled: boolean;
  onChange: (patch: Partial<Preferences>) => void; onBusy: (busy: boolean) => void; onError: (error: string) => void; onOutput: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false), [remove, setRemove] = useState<string | null>(null), [soundPath, setSoundPath] = useState("");
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); onError("");
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : "The sound action failed."); }
    finally { setBusy(false); }
  };
  const preview = (kind: NotificationToneKind, id: string) => run(async () => {
    const result = await window.moguri.previewNotificationSound(sdk.profileId, kind, id);
    onOutput(result.requested ? "Playing preview at the system volume." : "Sound validated; playback is suppressed in the generated hidden window.");
  });
  return <><SettingsHelp label="More about this setting" target={<h2>Attention notifications</h2>}>Alerts for questions, approvals, and finished or failed work. Reading an alert never answers or approves anything.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.inApp} disabled={disabled} onChange={(event) => onChange({ inApp: event.target.checked })} />Show in-app attention dots and icons</label>
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.os} disabled={disabled} onChange={(event) => onChange({ os: event.target.checked })} />Show OS banners when Moguri is in the background</label>
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.previewContent} disabled={disabled} onChange={(event) => onChange({ previewContent: event.target.checked })} />Include session title and message preview in OS banners</label>
    <Alert as="p" tone="warning" className="settings-warning">Banners follow your OS notification permissions and Do Not Disturb, and play no sound. Use the sounds below instead.</Alert>
    <SettingsHelp label="More about this setting" target={<h3>Sounds</h3>}>Needs attention plays for an unanswered question, a pending approval, or failed or partial work. Session completed plays only when work finishes successfully.</SettingsHelp>
    {sounds.map(({ key, kind, label }) => {
      const choice = values[key] ?? { enabled: true, id: "default" };
      return <section key={key} aria-label={`${label} sound`}>
        <label className="check-setting"><SettingsInput type="checkbox" checked={choice.enabled} disabled={disabled || busy} onChange={(event) => onChange({ [key]: { ...choice, enabled: event.target.checked } })} />Play a sound: {label.toLowerCase()}</label>
        <label className="setting-field">{label} sound<select aria-label={`${label} sound`} value={choice.id} disabled={disabled || busy} onChange={(event) => onChange({ [key]: { ...choice, id: event.target.value } })}>
          <option value="default">Moguri default</option>
          {choice.id !== "default" && !snapshot.notificationSounds.some((sound) => sound.id === choice.id) && <option value={choice.id} disabled>Saved sound unavailable</option>}
          {snapshot.notificationSounds.map((sound) => <option value={sound.id} key={sound.id}>{sound.name}</option>)}
        </select></label>
        <button type="button" disabled={disabled || busy} aria-label={`Preview ${label.toLowerCase()} sound`} onClick={() => void preview(kind, choice.id)}>Preview</button>
      </section>;
    })}
    <label className="check-setting"><SettingsInput type="checkbox" checked={values.soundWhileFocused ?? true} disabled={disabled || busy} onChange={(event) => onChange({ soundWhileFocused: event.target.checked })} />Play application sounds while Moguri is focused</label>
    <SettingsHelp label="More about this setting" target={<h3>Custom sounds</h3>}>Import a mono 16 kHz, 16-bit PCM WAV file up to ten seconds long. Moguri keeps its own copy for this profile.</SettingsHelp>
    <PathField label="Sound file" ariaLabel="Notification sound path" value={soundPath} onChange={setSoundPath} kind="file" extensions={["wav"]}
      title="Choose a mono 16 kHz PCM16 WAV" chooseAriaLabel="Choose sound file" placeholder="/path/to/sound.wav or ~/sound.wav" disabled={disabled || busy}>
      <button type="button" disabled={disabled || busy || snapshot.notificationSounds.length >= 32} onClick={() => void run(async () => {
        const selection = soundPath.trim() ? await window.moguri.loadNotificationSound(sdk.profileId, localPath(soundPath)) : await window.moguri.chooseNotificationSound(sdk.profileId);
        if (!selection) return;
        await sdk.notifications.importSound(selection.name, audioFromBase64(selection.audio));
        setSoundPath(""); onOutput("Sound imported. Choose it for either alert above.");
      })} aria-label="Import notification sound">Import</button>
    </PathField>
    {snapshot.notificationSounds.some((sound) => !sounds.some(({ key }) => values[key]?.id === sound.id)) && <label className="setting-field">Sound to remove
      <select aria-label="Sound reviewed for removal" value={remove ?? ""} disabled={busy} onChange={(event) => setRemove(event.target.value || null)}>
        <option value="">None selected</option>{snapshot.notificationSounds.filter((sound) => !sounds.some(({ key }) => values[key]?.id === sound.id)).map((sound) => <option key={sound.id} value={sound.id}>Remove {sound.name}</option>)}
      </select></label>}
    {snapshot.notificationSounds.map((sound) => {
      const selected = sounds.some(({ key }) => values[key]?.id === sound.id);
      return <section key={sound.id} aria-label={`Retained sound ${sound.name}`}>
        <p>{sound.name} <span className="fine-print">({sound.durationMs / 1000} seconds)</span></p>
        {selected ? <p className="fine-print">In use. Choose another sound before removing it.</p> : <SettingsAction label={`Remove ${sound.name}`} icon="Trash" disabled={disabled || busy || remove !== sound.id} onClick={() => void run(async () => {
            await sdk.notifications.removeSound(sound.id, sound.contentDigest, true); setRemove(null); onOutput("Sound removed.");
          })} />}
      </section>;
    })}
  </>;
}
