import { useEffect, useRef, useState } from "react";
import { sessionSubtree, type BulkSessionAction, type BulkSessionInput, type BulkSessionPreview, type MoguriSdk, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

export function BulkSessionActions({ sdk, snapshot, ids, clear, prepare, modal }: {
  sdk: MoguriSdk; snapshot: Snapshot; ids: string[]; clear: () => void;
  prepare?: (id: string) => Promise<void>; modal: (open: boolean) => void;
}) {
  const selected = ids.map((id) => snapshot.sessions.find((session) => session.id === id));
  const allDetached = selected.every((session) => session && !session.parentSessionId);
  const allAttached = selected.every((session) => session?.parentSessionId);
  const [input, setInput] = useState<BulkSessionInput | null>(null), [preview, setPreview] = useState<BulkSessionPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [remember, setRemember] = useState(false), [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), generation = useRef(0), pending = useRef(false), preparing = useRef(false);
  const original = input?.sessionIds ?? [], originalSet = new Set(original);
  const descendants = [...new Map(original.flatMap((id) => sessionSubtree(snapshot.sessions, id)).map((session) => [session.id, session])).values()]
    .filter((session) => !originalSet.has(session.id));
  const lifecycle = input?.action === "archive" || input?.action === "delete";
  const needsChoice = lifecycle && descendants.length > 0;
  const policy = snapshot.settings.values.retention;
  const asks = input?.action === "delete" ? policy.confirmBulkDelete !== false : input?.action === "archive" ? policy.confirmBulkArchive !== false : true;
  const stale = Boolean(preview && preview.selected.some((source) => {
    const session = snapshot.sessions.find((session) => session.id === source.id);
    return !session || session.revision !== source.revision || session.parentSessionId !== source.parentSessionId || session.status !== source.status;
  }));
  useEffect(() => { modal(Boolean(input || busy)); return () => modal(false); }, [input, busy, modal]);
  useEffect(() => { if (input && !dialog.current?.open) { dialog.current?.showModal(); cancel.current?.focus(); } }, [Boolean(input)]);
  useEffect(() => {
    if (!input || input.action === "attach" && !input.targetSessionId || needsChoice && !input.children) { setPreview(null); return; }
    const current = ++generation.current;
    setPreview(null); setError("");
    void sdk.sessions.bulkPreview(input).then((value) => { if (generation.current === current) setPreview(value.preview); })
      .catch((error: unknown) => { if (generation.current === current) setError(error instanceof Error ? error.message : "The complete selection could not be reviewed. No session was changed."); });
    return () => { generation.current++; };
  }, [sdk, JSON.stringify(input)]);
  const close = () => { if (!pending.current) { generation.current++; setInput(null); setPreview(null); } };
  const perform = async (review: BulkSessionPreview, rememberChoice: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await sdk.sessions.bulk(review, true);
      if (rememberChoice && ["archive", "delete"].includes(review.input.action)) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("The session action completed, but its profile confirmation preference could not be saved.");
        await sdk.settings.update({ ...settings.values, retention: { ...settings.values.retention,
          [review.input.action === "archive" ? "confirmBulkArchive" : "confirmBulkDelete"]: false } }, settings.revision);
      }
      setInput(null); setPreview(null); clear();
    } catch (error) { setError(error instanceof Error ? error.message : "The bulk action did not complete. Original sessions and unconfirmed work were preserved."); }
    finally { pending.current = false; setBusy(false); }
  };
  const begin = async (action: BulkSessionAction) => {
    if (pending.current || preparing.current) return;
    preparing.current = true;
    setError(""); setBusy(true);
    try {
      for (const id of ids) await prepare?.(id);
      await sdk.refresh();
      const state = sdk.getState().snapshot;
      if (!state) throw new Error("Reconnect the original profile before reviewing its selected sessions.");
      const hasChildren = ids.some((id) => sessionSubtree(state.sessions, id).some((session) => !ids.includes(session.id)));
      const request: BulkSessionInput = { action, sessionIds: [...ids] };
      const ask = action === "delete" ? state.settings.values.retention.confirmBulkDelete !== false :
        action === "archive" ? state.settings.values.retention.confirmBulkArchive !== false : true;
      if (!ask && !hasChildren) { await perform((await sdk.sessions.bulkPreview(request)).preview, false); return; }
      setRemember(false); setConfirmed(false); setPreview(null); setInput(request);
    } catch (error) { setError(error instanceof Error ? error.message : "The original selection could not be prepared. Saved drafts were preserved."); }
    finally { preparing.current = false; setBusy(false); }
  };
  return <section className="bulk-session-actions" aria-label="Selected session actions">
    <p role="status">{ids.length} selected in this project. Pins override priority; stored order breaks priority ties.</p>
    <div className="button-row">
      <button type="button" disabled={busy || ids.length < 2 || !allDetached} onClick={() => void begin("attach")}>Attach selected</button>
      <button type="button" disabled={busy || ids.length < 2 || !allAttached} onClick={() => void begin("detach")}>Detach selected</button>
      <button type="button" disabled={busy || ids.length < 2 || selected.some((session) => !session || session.status === "archived")} onClick={() => void begin("archive")}>Archive selected</button>
      <button type="button" className="danger" disabled={busy || ids.length < 2} onClick={() => void begin("delete")}>Delete selected</button>
      <button type="button" disabled={busy} onClick={clear}>Done selecting</button>
    </div>
    {!allAttached && !allDetached && <p className="fine-print">Attach/detach needs all selected sessions in the same attachment state.</p>}
    {!input && error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {input && <dialog ref={dialog} className="workspace-dialog" aria-label={`${input.action} selected sessions`} onClose={close} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <form onSubmit={(event) => { event.preventDefault(); if (preview && !stale && (input.action !== "delete" || !asks || confirmed)) void perform(preview, remember); }}>
        <h2>{input.action === "attach" ? "Attach" : input.action === "detach" ? "Detach" : input.action === "archive" ? "Archive" : "Delete"} {original.length} selected sessions</h2>
        <ul>{original.map((id) => <li key={id}>{snapshot.sessions.find((session) => session.id === id)?.title ?? "Removed session"} <code>{id}</code></li>)}</ul>
        {input.action === "attach" && <label className="setting-field">Attach to session<select aria-label="Bulk attachment target" value={input.targetSessionId ?? ""} disabled={busy}
          onChange={(event) => setInput({ ...input, targetSessionId: event.target.value || undefined })}><option value="">Choose an exact target</option>
          {snapshot.sessions.filter((session) => session.projectId === selected[0]?.projectId && !originalSet.has(session.id) && session.kind !== "subagent" && session.status !== "archived")
            .map((session) => <option key={session.id} value={session.id}>{session.title} / {session.id}</option>)}</select></label>}
        {needsChoice && <fieldset><legend>{descendants.length} unselected attached sessions</legend>
          <label className="check-setting"><input type="radio" name="bulk-children" checked={input.children === "cascade"} disabled={busy} onChange={() => setInput({ ...input, children: "cascade" })} />Also {input.action} the complete attached tree</label>
          <label className="check-setting"><input type="radio" name="bulk-children" checked={input.children === "detach"} disabled={busy} onChange={() => setInput({ ...input, children: "detach" })} />Settle owned work, then detach unselected direct children</label>
          <details><summary>Review unselected children</summary><ul>{descendants.map((session) => <li key={session.id}>{session.title} / <code>{session.id}</code></li>)}</ul></details>
        </fieldset>}
        <p>Workspace and execution authority stay unchanged. Archive preserves drafts and history. Delete removes selected conversation content and candidates only after confirmed cleanup; independent artifacts, code, worktrees and external PRs survive.</p>
        {input.action === "delete" && asks && <label className="check-setting"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I confirm permanent deletion of this exact selected set.</label>}
        {lifecycle && asks && <label className="check-setting"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
          Do not ask me again for multiple {input.action === "delete" ? "deletion" : "archiving"}</label>}
        {lifecycle && <p className="fine-print">This profile preference skips only the bulk confirmation. Child choices, changed selections, policy and cleanup still require review.</p>}
        {stale && <Alert as="p" className="inline-error" role="alert">The selected set changed. Close and review it again.</Alert>}
        {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
        <footer><button ref={cancel} type="button" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className={input.action === "delete" ? "danger" : "primary"} disabled={busy || !preview || stale || input.action === "delete" && asks && !confirmed}>{busy ? "Settling owned work..." : "Apply to selected sessions"}</button></footer>
      </form>
    </dialog>}
  </section>;
}
