import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, OtlpConfiguration, OtlpExportStatus, OtlpReview } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

const formFor = (configuration: OtlpConfiguration) => ({
  enabled: configuration.enabled, endpoint: configuration.endpoint ?? "", sampling: String(configuration.samplingRatio),
});
export function OtlpSettings({ sdk, configuration, disabled, onDirty }: {
  sdk: MoguriSdk; configuration: OtlpConfiguration; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [base, setBase] = useState(configuration), [form, setForm] = useState(() => formFor(configuration));
  const [review, setReview] = useState<OtlpReview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<OtlpExportStatus | null>(null);
  const alive = useRef(false), pending = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(formFor(base)), stale = configuration.revision > base.revision;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [sdk]);
  useEffect(() => { onDirty(dirty || busy || review !== null); return () => onDirty(false); }, [dirty, busy, review, onDirty]);
  useEffect(() => {
    if (pending.current || configuration.revision <= base.revision) return;
    if (dirty || review) {
      setError("Another client changed export settings. Your edit is preserved; reload the saved configuration before reviewing again.");
      setReview(null); setConfirmed(false);
    } else { setBase(configuration); setForm(formFor(configuration)); }
  }, [configuration.revision, base.revision, dirty, review]);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await sdk.telemetry.export.status();
        if (active) { setStatus(next); if (next.configuration.enabled) timer = setTimeout(() => void refresh(), 1000); }
      } catch {
        if (active) setError("Exporter status is unavailable from the owning service. No destination or provider was substituted.");
      }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [sdk, configuration.revision]);
  const change = (next: typeof form) => { setForm(next); setReview(null); setConfirmed(false); setSaved(false); };
  const reload = () => { setBase(configuration); setForm(formFor(configuration)); setReview(null); setConfirmed(false); setError(""); setSaved(false); };
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "The original export settings operation failed. Your edit was preserved."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  return <section aria-label="Metadata-only OpenTelemetry export">
    <SettingsHelp label="About metadata-only OTLP export" target={<h3>OpenTelemetry export</h3>}>
      Off by default and isolated to this profile. Reviewed traces and current accounting/operation gauges leave the Local control plane, including accepted Remote/Sandbox records.
      No prompts, responses, tool data, terminal data, raw diagnostics, paths or private names are exported. No credentials or OTEL environment settings are borrowed.
    </SettingsHelp>
    <fieldset disabled={disabled || busy}>
      <label className="setting-toggle"><SettingsInput type="checkbox" checked={form.enabled} onChange={(event) => change({ ...form, enabled: event.target.checked })} />Enable metadata-only OTLP export</label>
      <label className="setting-field">OTLP collector origin<SettingsInput aria-label="OTLP collector origin" type="url" value={form.endpoint}
        placeholder="http://127.0.0.1:4318" onChange={(event) => change({ ...form, endpoint: event.target.value })} /></label>
      <p className="fine-print">HTTPS origin or literal loopback HTTP. Uses /v1/traces and /v1/metrics; no custom path, query, credentials, headers or redirects.</p>
      <label className="setting-field">OTLP trace sampling ratio<SettingsInput aria-label="OTLP trace sampling ratio" type="number" min="0" max="1" step="0.01"
        value={form.sampling} onChange={(event) => change({ ...form, sampling: event.target.value })} /></label>
      <p className="fine-print">0 disables trace sampling, not canonical gauge export. Sampled traces are never billing or complete execution totals.</p>
      <button type="button" disabled={stale} onClick={() => void run(async () => {
        if (!form.sampling.trim()) throw new Error("Enter an explicit trace sampling ratio between 0 and 1.");
        const result = await sdk.telemetry.export.review({ enabled: form.enabled, endpoint: form.endpoint || null, samplingRatio: Number(form.sampling) });
        if (alive.current) { setReview(result.review); setConfirmed(false); }
      })}>Review metadata export</button>
      {(dirty || review || stale) && <button type="button" onClick={reload}>Reload saved export settings</button>}
      {review && <div>
        <p>Profile: {review.profileId}. Collector: {review.endpoint ?? "None"}. Traces and current canonical gauges. Export {review.enabled ? "enabled" : "disabled"}; trace ratio {review.samplingRatio}.</p>
        <p className="fine-print">Metadata-only disclosure {review.disclosureVersion}. Best-effort bounded export, no retries or history backfill. Previously sent metadata cannot be unsent.</p>
        <label className="setting-toggle"><SettingsInput type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this profile, collector and metadata-only disclosure</label>
        <button type="button" disabled={!confirmed || stale} onClick={() => void run(async () => {
          await sdk.telemetry.export.apply(review);
          const current = await sdk.telemetry.export.status();
          if (alive.current) { setBase(current.configuration); setForm(formFor(current.configuration)); setReview(null); setConfirmed(false); setStatus(current); setSaved(true); }
        })}>Apply reviewed metadata export</button>
      </div>}
    </fieldset>
    {saved && <p role="status">Export settings saved</p>}
    {status && <p className="fine-print">Exporter: {status.phase}. Receiver-acknowledged spans: {status.acceptedSpans}; dropped/unconfirmed: {status.droppedSpans}; sampled out: {status.sampledOut}; failed requests: {status.failedRequests}.
      {status.lastFailure && ` Last failure: ${status.lastFailure.code}${status.lastFailure.httpStatus ? ` (${status.lastFailure.httpStatus})` : ""}.`}
      {" "}Receiver acceptance does not prove backend ingestion. Queue {status.queuedSpans}/{status.limits.queuedSpans}; request deadline {status.limits.requestMs} ms.</p>}
    {error && <Alert role="alert">{error}</Alert>}
  </section>;
}
