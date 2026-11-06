import { useEffect, useId, useRef, useState } from "react";
import {
  isModelReadinessReportCurrent, type ModelReadinessMode, type ModelReadinessReport, type ModelReadinessTarget,
  type ReadinessEvidence, type ReadinessNumberFact, type ReadinessTextFact,
} from "../../../packages/protocol/src/model-readiness.ts";
import { Alert } from "./Alert.tsx";
import { SettingsHelp } from "./SettingsFields.tsx";

export interface ModelReadinessPanelRequest { target: ModelReadinessTarget; mode: ModelReadinessMode; signal: AbortSignal }
export type ModelReadinessPanelProbe = (request: ModelReadinessPanelRequest) => Promise<ModelReadinessReport>;
export interface ModelReadinessPanelProps {
  target: ModelReadinessTarget; onProbe: ModelReadinessPanelProbe; mode?: ModelReadinessMode;
  initialReport?: ModelReadinessReport; now?: () => number;
}
interface ObservationRow {
  id: string; label: string; value: string | number | null; status: string; evidence: ReadinessEvidence; bytes?: boolean;
}
function formatBytes(value: number): string {
  for (const [name, unit] of [["TiB", 1024 ** 4], ["GiB", 1024 ** 3], ["MiB", 1024 ** 2], ["KiB", 1024]] as const)
    if (value >= unit && value % unit === 0) return `${value / unit} ${name}`;
  return `${value.toLocaleString("en-US")} bytes`;
}
const statusLabel = (status: string) => ({
  observed: "Observed", declared: "Declared", estimated: "Estimated", missing: "Missing", refused: "Refused",
  pass: "Requirement matched", fail: "Does not match", unknown: "Unknown", "not-requested": "Not requested",
}[status] ?? "Unknown");
const checkLabel = (id: string) => ({
  runtime: "Runtime executable identity", "runtime-kind": "Configured runtime kind", "runtime-os": "Runtime container / OS",
  "runtime-architecture": "Runtime / process architecture", "runtime-version": "Runtime version", "runtime-build": "Llama.cpp build",
  "model-file": "Exact model file", "model-format": "Model format", "model-size": "Model file size",
  "model-digest": "Model byte digest", requirements: "Explicit model requirements",
  "operating-system": "Operating system", architecture: "Architecture", accelerator: "Accelerator",
  driver: "Driver version", ram: "System RAM", "free-ram": "Free system RAM", vram: "Device VRAM",
  "free-vram": "Device free VRAM", disk: "Filesystem capacity", "free-disk": "Available filesystem space",
}[id] ?? id);
function observationRows(report: ModelReadinessReport): ObservationRow[] {
  const rows: ObservationRow[] = [];
  const add = (id: string, label: string, fact: ReadinessTextFact | ReadinessNumberFact, bytes = false) => rows.push({
    id, label, value: fact.value, status: fact.status === "observed" ? fact.evidence.kind : fact.status, evidence: fact.evidence, bytes,
  });
  const host = report.observations.host, runtime = report.observations.runtime, model = report.observations.model;
  add("os", "Operating system", host.operatingSystem); add("arch", "Process architecture", host.architecture);
  add("os-release", "Numeric OS / kernel release", host.osRelease);
  add("ram", "System RAM", host.ramBytes, true); add("free-ram", "Free system RAM snapshot", host.freeRamBytes, true);
  add("disk", "Captured filesystem capacity", host.diskBytes, true); add("free-disk", "Available filesystem space", host.freeDiskBytes, true);
  if (runtime) {
    add("runtime-version", "Runtime version / build", runtime.version);
    rows.push({ id: "runtime-file", label: "Runtime executable SHA-256", value: runtime.executable.sha256,
      status: runtime.executable.sha256 ? runtime.executable.status : "unknown", evidence: runtime.executable.evidence });
    rows.push({ id: "runtime-header", label: "Executable container / architectures",
      value: runtime.binary.format === "unknown" ? null : `${runtime.binary.format}: ${runtime.binary.architectures.join(", ") || "unknown architecture"}`,
      status: runtime.binary.evidence.kind, evidence: runtime.binary.evidence });
  }
  if (model) {
    add("model-format", "Observed model format", model.format);
    rows.push({ id: "model-size", label: "Exact model file size", value: model.file.sizeBytes, status: model.file.status,
      evidence: model.file.evidence, bytes: true });
  }
  for (const device of report.observations.accelerators) {
    const prefix = `${device.kind}-${device.slot}`, name = `${device.kind.toUpperCase()} device ${device.slot}`;
    rows.push({ id: `${prefix}-support`, label: `${name} support`, value: device.support === "observed" ? "Local device/support field present" : null,
      status: device.support, evidence: device.evidence });
    add(`${prefix}-driver`, `${name} driver version`, device.driverVersion);
    add(`${prefix}-vram`, `${name} VRAM (${device.memoryKind} memory)`, device.vramBytes, true);
    add(`${prefix}-free-vram`, `${name} free VRAM snapshot`, device.freeVramBytes, true);
  }
  rows.push({ id: "capacity", label: "Estimated model capacity / performance", value: null,
    status: report.capacity.status, evidence: report.capacity.evidence });
  return rows;
}
function safeFailure(error: unknown): string {
  const messages: Record<string, string> = {
    model_readiness_cancelled: "The probe was cancelled; no fresh report was published.",
    model_readiness_timeout: "The probe timed out. Late work or unconfirmed cleanup is not successful evidence.",
    model_readiness_output_limit: "Probe output exceeded its bound; no truncated report was accepted.",
    model_readiness_stale: "The owning profile, session, model or execution binding changed. Refresh the current owner.",
    model_readiness_provenance: "The probe did not belong to this exact execution owner; no Local or provider fallback was used.",
    model_readiness_invalid: "The readiness input was invalid; no probe or model change was authorized.",
    model_readiness_required: "Required runtime/model evidence is missing, incompatible or unknown. Inspect informational observations; no inference or model policy changed.",
    model_readiness_native: "Only the original active qualified guest can supply native hardware evidence. No new guest or controller fallback was started.",
  };
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "";
  return messages[code] ?? "Readiness collection failed. No fresh report, model substitution or execution permission was produced.";
}
function bindingKey(target: ModelReadinessTarget, mode: ModelReadinessMode): string {
  return JSON.stringify([target.profileId, target.sessionId, target.modelId, target.env, target.rootDigest, target.peerDigest,
    target.buildDigest, target.endpointBindingDigest, target.modelBindingDigest, mode]);
}

export function ModelReadinessPanel({ target, onProbe, mode = "informational", initialReport, now = Date.now }: ModelReadinessPanelProps) {
  const heading = useId(), key = bindingKey(target, mode);
  const [retained, setRetained] = useState<{ key: string; probe: ModelReadinessPanelProbe; report: ModelReadinessReport } | null>(
    () => initialReport ? { key, probe: onProbe, report: initialReport } : null);
  const [pending, setPending] = useState<{ key: string; probe: ModelReadinessPanelProbe } | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [, setExpiryTick] = useState(0);
  const operation = useRef(0), controller = useRef<AbortController | null>(null);
  const current = useRef({ key, probe: onProbe }); current.current = { key, probe: onProbe };
  const busy = pending?.key === key && pending.probe === onProbe;
  const owned = retained?.key === key && retained.probe === onProbe ? retained.report : null;
  const loaded = owned?.mode === mode && isModelReadinessReportCurrent(owned, target, now()) ? owned : null;
  useEffect(() => {
    operation.current++; controller.current?.abort(); controller.current = null;
    setPending(null); setError(""); setMessage("");
    setRetained(initialReport ? { key, probe: onProbe, report: initialReport } : null);
    return () => { operation.current++; controller.current?.abort(); controller.current = null; };
  }, [key, onProbe, initialReport]);
  useEffect(() => {
    if (!owned) return;
    const delay = Math.max(0, Date.parse(owned.freshness.expiresAt) - now());
    const timer = setTimeout(() => {
      setMessage("The retained evidence expired; refresh this exact owner."); setExpiryTick((tick) => tick + 1);
    }, Math.min(delay, 300_000));
    return () => clearTimeout(timer);
  }, [owned, now]);
  const refresh = async () => {
    if (busy) return;
    const token = ++operation.current, capturedKey = key, capturedProbe = onProbe, abort = new AbortController();
    controller.current?.abort(); controller.current = abort;
    setPending({ key, probe: onProbe }); setRetained(null); setError(""); setMessage("Collecting bounded read-only evidence...");
    const isCurrent = () => operation.current === token && current.current.key === capturedKey && current.current.probe === capturedProbe;
    try {
      const report = await capturedProbe({ target: structuredClone(target), mode, signal: abort.signal });
      if (!isCurrent() || abort.signal.aborted) return;
      if (report.mode !== mode || !isModelReadinessReportCurrent(report, target, now())) {
        setMessage(""); setError("The service returned stale evidence or another owner/model/mode. No report was displayed."); return;
      }
      setRetained({ key: capturedKey, probe: capturedProbe, report }); setMessage("Read-only evidence received; not inference or loaded-model health.");
    } catch (error) {
      if (isCurrent()) {
        if (abort.signal.aborted) setMessage("The probe was cancelled; no fresh report was published.");
        else { setMessage(""); setError(safeFailure(error)); }
      }
    } finally {
      if (isCurrent()) { setPending(null); controller.current = null; }
    }
  };
  const cancel = () => {
    controller.current?.abort(); controller.current = null; operation.current++;
    setPending(null); setRetained(null); setError(""); setMessage("The probe was cancelled; late output cannot become a fresh report.");
  };
  const summary = loaded ? loaded.evaluation.status === "satisfied" ? "Explicit requirements matched; not inference or loaded-model health." :
    loaded.evaluation.status === "incompatible" ? "At least one explicit requirement does not match." :
      "Required compatibility or capacity evidence is unknown; no model availability was changed." :
    owned ? "The retained evidence is stale or belongs to another mode. Refresh this exact owner." : "No current runtime or hardware observation.";
  return <details className="model-tuning" aria-busy={busy}>
    <summary id={heading}>Local runtime and hardware readiness</summary>
    <SettingsHelp label="Read-only model readiness"
      target={<button type="button" disabled={busy} onClick={() => void refresh()}>Refresh readiness</button>}>
      Explicit read-only probes only. No server start, inference, network scan, installation or weights download.
    </SettingsHelp>
    <button type="button" disabled={!busy} onClick={cancel}>Cancel probe</button>
    <p className="fine-print">Env: {target.env}. {mode === "required" ? "Required mode must reject missing, incompatible or unknown required evidence." :
      "Informational mode does not disable an endpoint or grant execution/provider permissions."}</p>
    <p className="fine-print" role="status" aria-atomic="true">{message || summary}</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {loaded && <section aria-labelledby={heading}>
      <p className="fine-print">{summary}</p>
      <p className="fine-print">Configured runtime declaration: {loaded.configuration.kind ?? "not supplied"}. Observed {loaded.freshness.observedAt}; expires {loaded.freshness.expiresAt}.</p>
      <table className="model-readiness-table">
        <caption>Current runtime and hardware observations</caption>
        <thead><tr><th scope="col">Fact</th><th scope="col">Status</th><th scope="col">Value</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{observationRows(loaded).map((row) => <tr key={row.id}>
          <th scope="row">{row.label}</th><td>{statusLabel(row.status)}</td>
          <td>{row.value === null ? "Unknown / not observed" : row.bytes && typeof row.value === "number" ? formatBytes(row.value) : row.value}</td>
          <td>{row.evidence.kind}: {row.evidence.source} / {row.evidence.code}<br />{row.evidence.detail}</td>
        </tr>)}</tbody>
      </table>
      <details><summary>Explicit requirement comparison</summary>
        <table className="model-readiness-table">
          <caption>Explicit requirement comparison</caption>
          <thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Observed / required</th><th scope="col">Evidence</th></tr></thead>
          <tbody>{loaded.evaluation.checks.map((check) => <tr key={check.id}>
            <th scope="row">{checkLabel(check.id)}</th><td>{statusLabel(check.status)}</td>
            <td>{check.observed ?? "Unknown"} / {check.expected ?? "Not supplied"}{check.required ? " (required)" : ""}</td>
            <td>{check.evidence.kind}: {check.evidence.source} / {check.evidence.code}<br />{check.evidence.detail}</td>
          </tr>)}</tbody>
        </table>
        <p className="fine-print">Binding: {loaded.configurationDigest}. Requirements are user-supplied declarations, not quality or permission advice.</p>
      </details>
      {loaded.warnings.map((warning) => <p className="fine-print" key={warning}>{warning}</p>)}
    </section>}
  </details>;
}
