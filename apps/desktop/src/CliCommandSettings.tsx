import { SettingsAction, SettingsHelp } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import type { CliInstallationRequest, CliInstallationStatus } from "./cli-installation.ts";
import { Alert } from "./Alert.tsx";

export function CliCommandSettings({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [status, setStatus] = useState<CliInstallationStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    const request = ++generation.current;
    void window.moguri.cliInstallation({ action: "status" }).then((value) => { if (request === generation.current) setStatus(value); })
      .catch((error: unknown) => { if (request === generation.current) setError(error instanceof Error ? error.message : "The command installation could not be inspected."); });
    return () => { generation.current++; };
  }, []);
  const run = async (input: CliInstallationRequest) => {
    if (busy) return;
    const request = ++generation.current;
    setBusy(true); setError("");
    try {
      const value = await window.moguri.cliInstallation(input);
      if (request === generation.current) setStatus(value);
    } catch (error) {
      if (request === generation.current) setError(error instanceof Error ? error.message : "The command installation did not complete. Refresh its actual status before retrying.");
    } finally { if (request === generation.current) setBusy(false); }
  };
  return <section aria-label="Command line installation">
    <SettingsHelp label="More about this setting" target={<h3>Command line</h3>}>Install the bundled CLI and TUI launcher for this macOS user, across profiles. It uses the app's Node runtime, needs no administrator access and does not edit shell startup files. The app must stay at its installed location.</SettingsHelp>
    {status && <p className="fine-print">Command: <code>{status.path}</code></p>}
    <Alert as="p" role="status">{status?.detail ?? "Reading command installation..."}</Alert>
    <div className="button-row">
      <button type="button" disabled={busy || !status?.available || status.state !== "absent"} aria-label="Install moguri command" onClick={() => void run({ action: "install" })}>Install</button>
      <SettingsAction label="Remove moguri command" icon="Trash" disabled={busy || !status?.digest} onClick={() => { if (status?.digest) void run({ action: "remove", expectedDigest: status.digest }); }} />
      <SettingsAction label="Refresh command status" icon="Refresh" disabled={busy} onClick={() => void run({ action: "status" })} />
    </div>
    <p className="fine-print">After installation, run this in your terminal to add the command to your current shell's PATH:</p>
    <pre><code>{'export PATH="$HOME/.local/bin:$PATH"'}</code></pre>
    <p className="fine-print">For future zsh shells, add that line once to <code>~/.zshrc</code>. Run <code>moguri</code> to start the TUI. If you move the app, remove this managed command and install again from the new location. Existing commands, including manual workarounds, are never replaced.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
