import { useId, useState, type ReactNode } from "react";
import { SettingsInput } from "./SettingsFields.tsx";

/** Expands a leading `~` and strips quotes around a pasted path. Other characters, including spaces, are kept exactly. */
export function localPath(value: string, home = window.moguri?.homeDirectory ?? ""): string {
  const trimmed = value.replace(/^(['"])(.*)\1$/, "$2");
  if (!home) return trimmed;
  return trimmed === "~" ? home : trimmed.startsWith("~/") ? `${home.replace(/\/$/, "")}/${trimmed.slice(2)}` : trimmed;
}

/**
 * A local path that can be typed (absolute, or starting with `~/`) or chosen with the native picker.
 * Every setting that needs a file or folder on this Mac uses it, so both ways always work.
 */
export function PathField({ label, ariaLabel, value, onChange, kind, title, extensions, choose, chooseLabel, chooseAriaLabel, onChosen,
  placeholder, disabled, children }: {
  label: ReactNode; ariaLabel: string; value: string; onChange: (value: string) => void;
  kind: "file" | "folder" | "file-or-folder"; title?: string; extensions?: string[];
  /** Custom picker; defaults to the generic native file or folder picker. */
  choose?: () => Promise<string | null>;
  chooseLabel?: string; chooseAriaLabel?: string;
  /** Runs after the picker returns a path, for flows that act on the choice right away. */
  onChosen?: (path: string) => void;
  placeholder?: string; disabled?: boolean; children?: ReactNode;
}) {
  const [error, setError] = useState(""), hint = useId();
  const picker = choose ?? (() => window.moguri.choosePath({ kind: kind === "folder" ? "folder" : "file", title: title ?? (kind === "folder" ? "Choose a folder" : "Choose a file"),
    ...(extensions ? { extensions } : {}), ...(value.startsWith("/") ? { defaultPath: value } : {}) }));
  const caption = chooseLabel ?? (kind === "folder" ? "Choose folder…" : "Choose file…");
  return <div className="path-field">
    <label className="setting-field">{label}<SettingsInput aria-label={ariaLabel} aria-describedby={hint} value={value} disabled={disabled} spellCheck={false} autoCapitalize="off" autoCorrect="off"
      placeholder={placeholder ?? (kind === "folder" ? "/path/to/folder or ~/folder" : "/path/to/file or ~/file")}
      onChange={(event) => { setError(""); onChange(event.target.value); }}
      onBlur={(event) => { const next = localPath(event.target.value); if (next !== event.target.value) onChange(next); }} /></label>
    <div className="button-row path-field-actions">
      <button type="button" disabled={disabled} aria-label={chooseAriaLabel ?? caption.replace(/…$/, "")} onClick={() => {
        setError("");
        void picker().then((path) => { if (path) { onChange(path); onChosen?.(path); } },
          (failure: unknown) => setError(failure instanceof Error ? failure.message : "The file picker didn't open. Type the path instead."));
      }}>{caption}</button>
      {children}
    </div>
    <p id={hint} className="sr-only">Type a full path, a path starting with ~/, or use {caption.replace(/…$/, "")}.</p>
    {error && <p className="fine-print path-field-error" role="alert">{error}</p>}
  </div>;
}
