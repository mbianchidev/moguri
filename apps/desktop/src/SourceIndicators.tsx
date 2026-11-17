import { sourceIndicatorRule, type SourceIndicatorGate, type SourceIndicatorReport } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

const gateText: Record<SourceIndicatorGate, string> = {
  "model-script": "The agent can't mark this script safe; only you can force it.",
  "trusted-skill": "Not loaded automatically from a trusted folder; approve it here after reviewing.",
};

/** Deterministic indicator findings for a reviewed skill or script. Pattern matches only, never a safety verdict. */
export function SourceIndicators({ report, gate, label }: { report: SourceIndicatorReport | undefined; gate: SourceIndicatorGate; label: string }) {
  if (!report) return null;
  return <section aria-label={label}>
    {report.findings.length === 0 ? <p className="fine-print">No indicator rule matched (rules v{report.version}). That doesn't mean the source is safe.</p> : <>
      <Alert as="p" tone="warning">{report.findings.length} indicator {report.findings.length === 1 ? "rule" : "rules"} matched (rules v{report.version}). These are pattern matches, not a malware or safety verdict.</Alert>
      <ul>{report.findings.map((finding) => {
        const rule = sourceIndicatorRule(finding.rule);
        return <li key={finding.rule}><strong>{rule.label}</strong> ({finding.severity}, {finding.count} {finding.count === 1 ? "line" : "lines"}){rule.gate === gate ? `. ${gateText[gate]}` : ""}
          <ul>{finding.locations.map((location) => <li key={`${location.path}:${location.line}`}><code>{location.path}:{location.line}</code> {location.excerpt}</li>)}</ul>
        </li>;
      })}</ul>
    </>}
    <p className="fine-print">{report.limitation}</p>
  </section>;
}
