import { useEffect, useRef, useState } from "react";
import type { GithubAction, GithubItem, GithubPreview, GithubScope, MoguriSdk } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

/** `after` receives the resource GitHub acknowledged, for example the pull request a revert opened. */
export interface PendingWrite { label: string; preview: GithubPreview; confirmed: string[]; after?: (resource: GithubItem | null) => void }
const failure = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** One reviewed GitHub write at a time: exact preview, the user's confirmations, then execute and wait for the retained result. */
export function useReviewedWrite(sdk: MoguriSdk, scope: GithubScope, reload: () => Promise<void>) {
  const [pending, setPending] = useState<PendingWrite | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const start = async (label: string, action: GithubAction, after?: (resource: GithubItem | null) => void) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setPending(null);
    try { const { preview } = await sdk.github.preview(scope, action); setPending({ label, preview, confirmed: [], ...(after ? { after } : {}) }); }
    catch (error) { setError(failure(error, "The change could not be reviewed. Nothing was sent.")); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const started = await sdk.github.execute(pending.preview, pending.preview.document.confirmations, true);
      if (!started.id) throw new Error("GitHub did not acknowledge the change. Inspect GitHub workflow history before trying again.");
      const retained = await sdk.github.wait(started.id);
      if (retained.operation.status !== "completed") throw new Error(retained.operation.diagnostic ?? `The change is ${retained.operation.status}. Inspect its retained result; it was not replayed.`);
      setNotice(`${pending.label}: done.`); setPending(null); pending.after?.(retained.result?.resource ?? null);
      await reload();
    } catch (error) { setError(failure(error, "The change's outcome is unconfirmed. Inspect GitHub workflow history before trying again.")); }
    finally { setBusy(false); }
  };
  return { pending, busy, error, notice, start, confirm, cancel: () => setPending(null), setPending, setError, setNotice };
}
export type ReviewedWrite = ReturnType<typeof useReviewedWrite>;

/** The exact review of a pending write: its target, warnings and every confirmation the user must tick before Confirm. */
export function ReviewedWritePanel({ write, target }: { write: ReviewedWrite; target: string }) {
  const { pending, busy } = write, panel = useRef<HTMLElement>(null);
  useEffect(() => { if (pending) panel.current?.scrollIntoView({ block: "nearest" }); }, [pending?.preview.digest]);
  if (!pending) return null;
  const confirmations = pending.preview.document.confirmations;
  return <section ref={panel} className="github-write-review pr-write-review" aria-label="Review GitHub change"><h4>{pending.label}</h4>
    <p className="fine-print path">{pending.preview.document.action.kind} / {target}</p>
    {pending.preview.document.warnings.map((warning) => <Alert as="p" tone="warning" key={warning}>{warning}</Alert>)}
    {confirmations.map((confirmation) => <label className="check-setting" key={confirmation}><input type="checkbox" checked={pending.confirmed.includes(confirmation)} disabled={busy}
      onChange={(event) => write.setPending({ ...pending, confirmed: event.target.checked ? [...pending.confirmed, confirmation] : pending.confirmed.filter((value) => value !== confirmation) })} />{confirmation}</label>)}
    <div className="button-row"><button type="button" className="primary" disabled={busy || confirmations.some((value) => !pending.confirmed.includes(value))} onClick={() => void write.confirm()}>Confirm</button>
      <button type="button" disabled={busy} onClick={write.cancel}>Cancel</button></div></section>;
}
