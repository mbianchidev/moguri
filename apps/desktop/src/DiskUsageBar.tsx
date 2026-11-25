import { formatDiskBytes, type VirtualDiskStatus } from "@moguri-dev/sdk";

type Tone = "ready" | "paused" | "changing" | "unavailable";

/** D76. The disk's state for its usage bar: null while the disk is off or unsupported, so callers render nothing. */
export function diskUsage(status: VirtualDiskStatus | null): { tone: Tone; label: string; used: number; total: number; reserve: number } | null {
  const disk = status?.disk;
  if (!status?.supported || !disk || disk.status === "off") return null;
  const usage = status.usage, total = usage?.totalBytes ?? 0, used = usage ? Math.max(0, usage.totalBytes - usage.freeBytes) : 0;
  const base = { used, total, reserve: usage?.reserveBytes ?? 0 };
  if (disk.status === "creating" || disk.status === "resizing" || disk.status === "removing") {
    return { ...base, tone: "changing", label: `Session disk: ${disk.status === "creating" ? "being created" : disk.status === "resizing" ? "being resized" : "turning off"}` };
  }
  if (disk.status !== "ready" || !usage) return { ...base, tone: "unavailable", label: `Session disk: ${disk.status === "unmounted" ? "not mounted" : "unavailable"}` };
  const text = `Session disk: ${formatDiskBytes(used)} used of ${formatDiskBytes(total)}, ${formatDiskBytes(usage.freeBytes)} free`;
  return disk.pressure?.paused ? { ...base, tone: "paused", label: `${text}. Full: work on the disk is paused` } : { ...base, tone: "ready", label: text };
}

/** A live usage bar for the session disk (D47, D76), with the reserve marked. `compact` is the sidebar's text-free variant. */
export function DiskUsageBar({ status, compact = false }: { status: VirtualDiskStatus | null; compact?: boolean }) {
  const usage = diskUsage(status);
  if (!usage) return null;
  const percent = usage.total ? Math.min(100, Math.round(usage.used / usage.total * 1000) / 10) : 0;
  const reserve = usage.total && usage.reserve ? Math.max(0, Math.min(100, (usage.total - usage.reserve) / usage.total * 100)) : null;
  return <div className="disk-usage-bar" data-compact={compact || undefined} data-disk-tone={usage.tone} role="meter" aria-label="Session disk usage"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={usage.label} aria-hidden={compact || undefined}>
    <span className="disk-usage-fill" style={{ width: usage.tone === "ready" || usage.tone === "paused" ? `${percent}%` : undefined }} />
    {reserve !== null && usage.tone !== "changing" && <span className="disk-usage-reserve" style={{ left: `${reserve}%` }} />}
  </div>;
}
