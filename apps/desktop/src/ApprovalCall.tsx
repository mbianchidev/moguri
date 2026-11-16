import { Fragment, type ReactNode } from "react";
import { describeActivityCall, type Snapshot, type ToolCall } from "../../../packages/sdk/src/index.ts";

const value = (input: unknown): ReactNode => {
  if (typeof input === "string") return input.includes("\n") || input.length > 120 ? <pre>{input}</pre> : <code>{input}</code>;
  if (input === null || typeof input === "number" || typeof input === "boolean") return <code>{String(input)}</code>;
  return <pre>{JSON.stringify(input, null, 2)}</pre>;
};

/** The exact call under review: what it does in words, its execution boundary, every argument and the raw JSON on demand. */
export function ApprovalCall({ call, snapshot, boundary }: { call: ToolCall; snapshot: Snapshot; boundary?: string | null }) {
  const { label, subject } = describeActivityCall(call, snapshot);
  const subjectKey = subject === null ? null : Object.entries(call.arguments).find(([, input]) => input === subject)?.[0] ?? null;
  const entries = Object.entries(call.arguments).filter(([key]) => key !== subjectKey);
  return <>
    <div className="approval-summary"><strong>{label}</strong><span className="approval-tool">{call.name}</span></div>
    {subject !== null && (subject.includes("\n") || subject.length > 120 ? <pre className="approval-subject">{subject}</pre> : <code className="approval-subject">{subject}</code>)}
    {boundary && <p className="approval-boundary">{boundary}</p>}
    {entries.length > 0 && <dl className="approval-args" aria-label="Exact arguments">
      {entries.map(([key, input]) => <Fragment key={key}><dt>{key}</dt><dd>{value(input)}</dd></Fragment>)}
    </dl>}
    <details className="approval-raw"><summary>Raw JSON</summary><pre>{JSON.stringify(call.arguments, null, 2)}</pre></details>
  </>;
}

export function approvalBoundary(call: ToolCall, env: string): string | null {
  if (call.name === "run_script") return env === "Sandbox" ? "Executes the exact reviewed bytes inside the approved SendBox boundary, not the Local source checkout. The agent's assessment is not permission or a safety guarantee." :
    "Executes the exact reviewed script on your Mac without sandbox isolation. The agent's assessment is not permission or a safety guarantee.";
  if (call.name === "run_command") return env === "Remote" ? "Runs on the configured SSH host, not inside SendBox." : env === "Sandbox" ? "Runs inside the approved SendBox boundary." : "Runs on your Mac without sandbox isolation.";
  if (call.name === "mcp_gateway") return "May access host code or external services through the configured MCP. Check the exact server, tool and arguments.";
  if (call.name === "run_subagent") return "Sends the approved context to a separate, tool-less model call.";
  if (call.name.startsWith("propose_")) return "Creates a pending proposal; it isn't applied or enabled.";
  return null;
}
