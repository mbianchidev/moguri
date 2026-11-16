import { useCallback, useEffect, useRef, useState } from "react";
import type { CompactionPreview, CompactionResponse, ContextCompaction, MoguriSdk, Session, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

type ContextState = Extract<CompactionResponse, { type: "compaction.state" }>;
const count = (value: number) => new Intl.NumberFormat().format(value);
export function ContextCompactionReview({ sdk, session, snapshot, close }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true), readVersion = useRef(0);
  const [state, setState] = useState<ContextState | null>(null), [stateError, setStateError] = useState("");
  const [modelId, setModelId] = useState(snapshot.provider.models.find((model) => model.id === session.controls.modelId && !model.synthetic)?.id ?? "");
  const [keep, setKeep] = useState("2"), [preview, setPreview] = useState<CompactionPreview | null>(null);
  const [selectedId, setSelectedId] = useState(""), [content, setContent] = useState<string | null>(null), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [restoreReview, setRestoreReview] = useState(false);
  const signature = snapshot.compactions.filter((entry) => entry.sessionId === session.id).map((entry) => `${entry.id}:${entry.revision}`).join(",");
  const selected = state?.compactions.find((entry) => entry.id === selectedId);
  const models = snapshot.provider.models.filter((model) => !model.synthetic && model.source !== "claude-agent" && (!model.environments || model.environments.includes(session.controls.env)));
  const active = Boolean(session.turnId) || session.queue.some((item) => !item.held) || Boolean(state?.compactions.some((entry) => entry.status === "running"));
  const disabled = busy || active || !state || Boolean(stateError);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const current = await sdk.compactions.state(session.id);
      if (!mounted.current || version !== readVersion.current) return;
      setState(current); setStateError("");
      setSelectedId((id) => current.compactions.some((entry) => entry.id === id) ? id : current.compactions.at(-1)?.id ?? "");
    } catch (error) {
      if (mounted.current && version === readVersion.current) setStateError(error instanceof Error ? error.message : "Context is unavailable. Reload before changing it.");
    }
  }, [sdk, session.id]);
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal();
    return () => { mounted.current = false; readVersion.current++; };
  }, []);
  useEffect(() => { void refresh(); }, [refresh, signature, session.turnId, session.revision]);
  useEffect(() => {
    let current = true; setContent(null); setReviewed(false);
    if (selectedId) void sdk.compactions.read(session.id, selectedId).then((result) => {
      if (current) setContent(result.text);
    }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Proposal content could not be loaded. It was not applied."); });
    return () => { current = false; };
  }, [sdk, session.id, selectedId, selected?.revision]);
  const work = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); await refresh(); }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Context operation failed. Reload the actual state before retrying."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const validProposal = Boolean(selected && ["proposed", "restored"].includes(selected.status) && selected.replacementDigest);
  const stale = Boolean(selected && state && selected.sourceDigest !== state.sourceDigest);
  const title = (entry: ContextCompaction) => `${new Date(entry.createdAt).toLocaleString()} / ${entry.status}${entry.id === state?.activeId ? " / active" : ""}`;
  return <dialog ref={dialog} className="workspace-dialog context-review" aria-label="Context review" onClose={close} onKeyDown={(event) => {
    if (event.key === "Enter") { event.stopPropagation(); if (!(event.target instanceof Element) || !event.target.closest("button,summary,select")) event.preventDefault(); }
  }}>
    <header><h2>Context review</h2><button type="button" className="icon-button" aria-label="Close context review" onClick={() => dialog.current?.close()}><Icon name="Close" /></button></header>
    <p>Summaries are model-produced context, not user answers, source acceptance or permissions. Manual proposals require review; only an explicitly enabled Kupo policy may apply a qualified automatic text summary. Original history and your draft stay retained.</p>
    {state ? <><dl className="context-estimates"><dt>Active conversation</dt><dd>~{count(state.estimatedTokens)} tokens</dd><dt>Retained originals</dt><dd>~{count(state.originalEstimatedTokens)} tokens</dd></dl>
      <p className="fine-print">Conversation estimates exclude system prompt, tools and draft. They are not exact tokenization or billing. Env: {session.controls.env}{session.controls.env === "Remote" ? ", pinned SSH execution, not sandbox isolation" : session.controls.env === "Sandbox" ? ", qualified private native SendBox guest" : ", host execution, not sandboxed"}.</p></> : <p role="status">Loading retained context...</p>}
    {stateError && <Alert as="div" role="alert" className="inline-error">{stateError}</Alert>}
    <button type="button" className="quiet" disabled={busy} onClick={() => void refresh()}>Reload context</button>
    <details className="compaction-generation" open={!selected || !["proposed", "restored", "applied"].includes(selected.status)}>
      <summary>Generate a new proposal</summary>
      <div className="context-fields">
        <label>Compactor model<select aria-label="Compactor model" value={modelId} disabled={disabled} onChange={(event) => { setModelId(event.target.value); setPreview(null); }}>
          <option value="">Choose a real model</option>{modelId && !models.some((model) => model.id === modelId) && <option value={modelId} disabled>Saved model unavailable</option>}
          {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select></label>
        <label>Keep recent turns<input aria-label="Keep recent turns" type="number" min={1} max={20} step={1} value={keep} disabled={disabled} onChange={(event) => { setKeep(event.target.value); setPreview(null); }} /></label>
      </div>
      <p className="fine-print">Complete recent turns and tool pairs remain intact. Image history is not supported by this text-only compactor. Manual proposals use the exact model selected here; automatic Kupo stays within its explicitly enabled policy and eligible pool.</p>
      <div className="button-row"><button type="button" disabled={disabled || !modelId || !Number.isInteger(Number(keep)) || Number(keep) < 1 || Number(keep) > 20} onClick={() => void work(async () => { setPreview((await sdk.compactions.preview(session.id, { modelId, keepRecentTurns: Number(keep) })).preview); })}>Preview source</button>
        {preview && <button type="button" className="primary" disabled={disabled || preview.sourceDigest !== state?.sourceDigest} onClick={() => void work(async () => { const result = await sdk.compactions.generate(session.id, preview, true); setPreview(null); setSelectedId(result.id!); })}>Generate proposal</button>}</div>
      {preview && <div className="context-preview"><p>Compact {preview.prefixMessages} messages; retain {preview.retainedMessages}. Estimated request: ~{count(preview.estimatedInputTokens)} tokens, output at most {count(preview.maxOutputTokens)}. Generation may spend budget.</p>
        <details><summary>Inspect compaction contract</summary><pre>{preview.systemPrompt}</pre></details>
        {preview.sourceDigest !== state?.sourceDigest && <p role="status">Source changed. Preview again before authorizing a call.</p>}
      </div>}
    </details>
    <section aria-label="Compaction history">
      <h3>Compaction history</h3>
      {state?.compactions.length ? <label>Retained operation<select aria-label="Compaction history" value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setError(""); setRestoreReview(false); }}>{state.compactions.toReversed().map((entry) => <option key={entry.id} value={entry.id}>{title(entry)}</option>)}</select></label> : <p>No compactions yet. Previewing does not start inference.</p>}
      {selected && <><p className="fine-print">Actual model: {snapshot.provider.models.find((model) => model.id === selected.modelId)?.name ?? selected.modelId}. Status: <strong>{selected.status}</strong>. {selected.afterTokens === null ? "No accepted size reduction." : `~${count(selected.beforeTokens)} to ~${count(selected.afterTokens)} conversation tokens.`}</p>
        {selected.automatic && <p className="fine-print">Origin: actual-user-enabled Kupo policy, owning turn {selected.automatic.ownerTurnId}. Applying this model-produced context is not human content review or tool permission.</p>}
        {selected.status === "running" && <p role="status">Owned compaction is running. You can close this review without losing it.</p>}
        {selected.status === "running" && <button type="button" disabled={busy} onClick={() => void work(async () => { await sdk.compactions.stop(session.id, selected.id); })}>Stop compaction</button>}
        {selected.diagnostic && <Alert as="p" className="inline-error" role="alert">{selected.diagnostic}</Alert>}
        {content !== null && <><h3>Review model-produced summary</h3><pre className="compaction-summary" aria-label="Proposed context summary" tabIndex={0}>{content}</pre></>}
        {validProposal && <><p className="fine-print">This is lossy model-derived context. Inspect intent, constraints and unknowns before adopting it.</p>
          {stale && <p role="status">Source changed. This proposal cannot replace the current context.</p>}
          <label className="context-confirm"><input type="checkbox" checked={reviewed} disabled={disabled || stale || content === null} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this untrusted summary; original history stays retained.</label>
          <div className="button-row"><button type="button" className="primary" disabled={disabled || stale || !reviewed || content === null} onClick={() => void work(async () => { await sdk.compactions.apply(session.id, selected.id, selected.revision); setReviewed(false); })}>Apply reviewed summary</button>
            <button type="button" disabled={disabled} onClick={() => void work(async () => { await sdk.compactions.discard(session.id, selected.id, selected.revision); })}>Discard proposal</button></div>
        </>}
      </>}
    </section>
    {state?.activeId && <section className="context-restore"><h3>Original history is retained</h3><p>Restore the complete originals without a model call, replay or budget reset. Normal context-window limits still apply.</p>
      {restoreReview ? <div className="button-row"><button type="button" disabled={disabled} onClick={() => void work(async () => { await sdk.compactions.restore(session.id, state.activeId!, state.sourceDigest, true); setRestoreReview(false); })}>Confirm restore originals</button><button type="button" className="quiet" onClick={() => setRestoreReview(false)}>Cancel</button></div> :
        <button type="button" disabled={disabled} onClick={() => setRestoreReview(true)}>Restore original context</button>}
    </section>}
    {active && <p role="status" className="fine-print">Finish or stop active work and hold/remove queued prompts before changing context.</p>}
    {busy && <p role="status" className="fine-print">Waiting for the service. Your draft is preserved.</p>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </dialog>;
}
