import { useRef, useState } from "react";
import { shortcutFromEvent } from "../../../packages/sdk/src/index.ts";

export function ShortcutEditor({ label, value, change, save, dirty, disabled }: {
  label: string; value: string; change: (value: string) => void; save: () => void; dirty: boolean; disabled: boolean;
}) {
  const [recording, setRecording] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return <div className="setting-editor shortcut-field"><label className="setting-field">{label}<input ref={input} aria-label={label} value={value} disabled={disabled} readOnly={recording}
    aria-description={recording ? "Press a modifier chord. Escape or Tab cancels recording." : "Use a modifier chord such as Control+Space, or none."}
    onBlur={() => setRecording(false)} onChange={(event) => { change(event.target.value); setError(""); }} onKeyDown={(event) => {
      if (!recording) return;
      event.stopPropagation();
      if (event.key === "Tab") { setRecording(false); return; }
      event.preventDefault();
      if (event.key === "Escape") { setRecording(false); return; }
      if (event.nativeEvent.isComposing || event.repeat || ["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
      try { change(shortcutFromEvent(event)); setRecording(false); setError(""); }
      catch (error) { setError(error instanceof Error ? error.message : "Choose a qualified shortcut."); }
    }} /></label>
    <div className="button-row"><button type="button" disabled={disabled} aria-pressed={recording} onClick={() => { setRecording(true); setError(""); input.current?.focus(); }}>{recording ? "Press a shortcut..." : `Record ${label}`}</button>
      <button type="button" className="primary" aria-label={`Save ${label}`} disabled={disabled || !dirty || recording} onClick={save}>Save</button></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
