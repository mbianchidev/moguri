import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import { formatDiskBytes, VIRTUAL_DISK_SIZES_GIB, type MoguriSdk, type Snapshot, type VirtualDiskStatus } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

const DEFAULT_SIZE_GIB = 50;
const transitional = (status: string | undefined) => status === "creating" || status === "resizing" || status === "removing";

/** The disk status, read again whenever the snapshot changes and every few seconds while the disk is being changed. */
export function useVirtualDisk(sdk: MoguriSdk, snapshot: Snapshot | null, enabled = true): VirtualDiskStatus | null {
  const [status, setStatus] = useState<VirtualDiskStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const read = () => void sdk.application.disk.status().then((result) => { if (current) setStatus(result.disk); }, () => undefined);
    read();
    const timer = transitional(status?.disk?.status) ? setInterval(read, 1500) : undefined;
    return () => { current = false; if (timer) clearInterval(timer); };
  }, [sdk, snapshot, status?.disk?.status, enabled]);
  return enabled ? status : null;
}

/** Settings / Retention: the optional fixed-size disk for new session worktrees (D47). Switch and size save immediately. */
export function VirtualDiskSettings({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const status = useVirtualDisk(sdk, snapshot), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const disk = status?.disk, active = Boolean(disk && disk.status !== "off"), changing = busy || transitional(disk?.status);
  const configure = async (sizeGiB: number | null) => {
    setBusy(true); setError("");
    try { await sdk.application.disk.configure(sizeGiB, disk?.revision ?? 0); }
    catch (error) { setError(error instanceof Error ? error.message : "The virtual disk couldn't be changed. Nothing was removed."); }
    finally { setBusy(false); }
  };
  const size = active && disk ? disk.sizeGiB : DEFAULT_SIZE_GIB;
  const sizes = [...new Set([...VIRTUAL_DISK_SIZES_GIB, size])].sort((a, b) => a - b);
  const usage = status?.usage;
  const summary = !disk || disk.status === "off" ? "Off. Session worktrees use the regular data folder." :
    disk.status === "creating" ? "Creating the disk..." : disk.status === "resizing" ? `Resizing the disk... ${disk.diagnostic ?? ""}` :
    disk.status === "removing" ? "Turning the disk off..." : disk.status === "ready" && usage ?
      `${disk.pressure?.paused ? "Full: work on the disk is paused." : "Ready."} ${formatDiskBytes(usage.totalBytes - usage.freeBytes)} used of ${formatDiskBytes(usage.totalBytes)}, ${formatDiskBytes(usage.freeBytes)} free. ${status?.worktrees ?? 0} worktree${status?.worktrees === 1 ? "" : "s"} on it.` :
    disk.status === "unmounted" ? "Not mounted." : "Unavailable.";
  return <section aria-label="Session disk"><SettingsHelp label="More about this setting" target={<h3>Session disk</h3>}>A fixed-size disk image for new session worktrees, so sessions can't fill your Mac. When it's nearly full, Moguri first removes the oldest archived worktrees that are clean and fully pushed, then pauses work on the disk until there's space. Uncommitted or unpushed work is never removed.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" aria-label="Limit session worktrees to a virtual disk" checked={active} disabled={!status?.supported || changing}
      onChange={(event) => void configure(event.target.checked ? size : null)} />Limit session worktrees to a virtual disk</label>
    <label className="setting-field">Disk size<select aria-label="Virtual disk size" value={size} disabled={!active || changing || disk?.status !== "ready"}
      onChange={(event) => void configure(Number(event.target.value))}>{sizes.map((value) => <option key={value} value={value}>{value} GB</option>)}</select></label>
    <p className="fine-print" role="status">{status ? summary : "Reading the disk..."}</p>
    {status && !status.supported && <p className="fine-print">Virtual disks need macOS.</p>}
    {disk?.diagnostic && !transitional(disk.status) && <Alert as="p" tone="warning" className="settings-warning">{disk.diagnostic}</Alert>}
    <p className="fine-print">Existing worktrees stay where they are. Resizing needs no running work on the disk; turning it off needs no worktrees on it.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
