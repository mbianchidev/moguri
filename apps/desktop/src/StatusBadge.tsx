import type { StatusLabel } from "../../../packages/sdk/src/index.ts";

/** Dot plus a text label from the shared status vocabulary; the tone only selects the status color role. */
export function StatusBadge({ status, className, title }: { status: StatusLabel; className?: string; title?: string }) {
  return <span className={className ? `status-badge ${className}` : "status-badge"} data-tone={status.tone} title={title}>
    <span className="status-badge-dot" aria-hidden="true" />{status.label}
  </span>;
}
