import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDiskBytes, VIRTUAL_DISK_SIZES_GIB, type MoguriSdk, type VirtualDiskStatus } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { DiskUsageBar, diskUsage } from "./DiskUsageBar.tsx";
import { Tooltip } from "./Tooltip.tsx";

const DEFAULT_SIZE_GIB = 50;
const transitional = (status: string | undefined) => status === "creating" || status === "resizing" || status === "removing";

/** The disk status the service pushes live on the event connection (D76), with one read until the first push arrives. */
export function useVirtualDisk(sdk: MoguriSdk, enabled = true): VirtualDiskStatus | null {
  const live = useSyncExternalStore(sdk.subscribe, () => sdk.application.disk.current(), () => sdk.application.disk.current());
  const [read, setRead] = useState<VirtualDiskStatus | null>(null);
  useEffect(() => {
    if (!enabled || live) return;
    let current = true;
    void sdk.application.disk.status().then((result) => { if (current) setRead(result.disk); }, () => undefined);
    return () => { current = false; };
  }, [sdk, enabled, live]);
  return enabled ? live ?? read : null;
}

/** D76. The sidebar's text-free disk bar above the service status, shown only while the disk is on; a click opens Settings / Retention. */
export function SidebarDisk({ sdk, open }: { sdk: MoguriSdk; open: () => void }) {
  const status = useVirtualDisk(sdk), usage = diskUsage(status);
  if (!usage) return null;
  return <Tooltip content={usage.label}><button type="button" className="disk-usage-button" aria-label={`${usage.label}. Open Retention settings`} onClick={open}>
    <DiskUsageBar status={status} compact /></button></Tooltip>;
}

/** Settings / Retention: the optional fixed-size disk for new session worktrees (D47). Switch and size save immediately. */
export function VirtualDiskSettings({ sdk }: { sdk: MoguriSdk }) {
  const status = useVirtualDisk(sdk), [busy, setBusy] = useState(false), [error, setError] = useState("");
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
    <DiskUsageBar status={status} />
    <p className="fine-print" role="status">{status ? summary : "Reading the disk..."}</p>
    {status && !status.supported && <p className="fine-print">Virtual disks need macOS.</p>}
    {disk?.diagnostic && !transitional(disk.status) && <Alert as="p" tone="warning" className="settings-warning">{disk.diagnostic}</Alert>}
    <p className="fine-print">Existing worktrees stay where they are. Resizing needs no running work on the disk; turning it off needs no worktrees on it.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
