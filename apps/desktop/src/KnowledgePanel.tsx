import { useEffect, useState } from "react";
import type { KnowledgeRecord, KnowledgeTier, MoguriSdk, Project, Session, Snapshot } from "../../../packages/sdk/src/index.ts";

export function KnowledgePanel({ sdk, snapshot, project, session, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; project?: Project; session?: Session; onDirty: (value: boolean) => void;
}) {
  const [tier, setTier] = useState<KnowledgeTier>(session ? "Sky" : project ? "Terra" : "Glacier");
  const [lifetime, setLifetime] = useState<"turn" | "session">("session");
  const [title, setTitle] = useState(""), [text, setText] = useState("");
  const [selected, setSelected] = useState<{ record: KnowledgeRecord; text: string } | null>(null);
  const [history, setHistory] = useState<KnowledgeRecord[]>([]);
  const [historical, setHistorical] = useState<{ record: KnowledgeRecord; text: string } | null>(null);
  const [summary, setSummary] = useState(""), [promotionTitle, setPromotionTitle] = useState("");
  const [target, setTarget] = useState<"Terra" | "Glacier">("Glacier");
  const [reviewed, setReviewed] = useState(false), [forget, setForget] = useState(false), [rollback, setRollback] = useState(false);
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Knowledge operation failed. Your draft was preserved."); }
    finally { setBusy(false); }
  };
  const reset = () => {
    setSelected(null); setHistorical(null); setHistory([]); setTitle(""); setText(""); setSummary(""); setPromotionTitle("");
    setReviewed(false); setForget(false); setRollback(false); setDirty(false); setStatus("");
  };
  const read = async (id: string) => {
    const value = await sdk.knowledge.read(id);
    setSelected(value); setTitle(value.record.title); setText(value.text); setTier(value.record.tier);
    setLifetime(value.record.expiresTurnId ? "turn" : "session"); setHistory([]); setHistorical(null);
    setSummary(""); setPromotionTitle(value.record.title); setTarget("Glacier"); setReviewed(false); setForget(false); setRollback(false); setDirty(false);
  };
  const records = snapshot.knowledge.filter((record) => record.tier === tier && (tier === "Sky" ? record.sessionId === session?.id : tier === "Terra" ? record.projectId === project?.id : true));
  const actual = selected && snapshot.knowledge.find((record) => record.id === selected.record.id);
  const stale = Boolean(selected && (!actual || actual.revision !== selected.record.revision));
  const canWrite = tier === "Sky" ? Boolean(session && session.status !== "archived") : tier === "Terra" && Boolean(project);
  return <section aria-label="Sky Terra Glacier knowledge">
    <h2>Sky, Terra, Glacier</h2>
    <p>Sky expires with its actual turn or session. Terra retains project/work-item knowledge. Glacier holds explicitly reviewed compressed knowledge across this profile. None of these grants tools, runs a model, or self-promotes.</p>
    <p className="fine-print">Tiered context injection is {snapshot.settings.values.memory.enabled && snapshot.settings.values.memory.useTieredContext === true ? "explicitly enabled" : "off"}. Enable it separately in Repository memory. Selection is bounded and deterministic, not a claim of semantic understanding.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {stale && <p role="alert" className="settings-warning">The selected note expired or changed in another client. Your edit remains here; reload the current note before applying it.</p>}
    <label className="setting-field">Knowledge tier<select aria-label="Knowledge tier" value={tier} disabled={busy || dirty} onChange={(event) => { reset(); setTier(event.target.value as KnowledgeTier); }}>
      <option value="Sky">Sky: current session</option><option value="Terra">Terra: current project</option><option value="Glacier">Glacier: this profile</option>
    </select></label>
    <div className="button-row">{records.map((record) => <button key={record.id} disabled={busy || dirty} onClick={() => void run(() => read(record.id))}>{record.title} (r{record.revision})</button>)}</div>
    {!records.length && <p>No retained notes in this exact scope.</p>}
    <button disabled={busy} onClick={reset}>Discard editor / New note</button>
    <label className="setting-field">Knowledge title<input aria-label="Knowledge title" value={title} disabled={!canWrite || busy} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} /></label>
    <label className="setting-field">Knowledge text<textarea aria-label="Knowledge text" value={text} disabled={!canWrite || busy} onChange={(event) => { setText(event.target.value); setDirty(true); }} /></label>
    {tier === "Sky" && <label className="setting-field">Sky lifetime<select aria-label="Sky lifetime" value={lifetime} disabled={busy || Boolean(selected)} onChange={(event) => { setLifetime(event.target.value as "turn" | "session"); setDirty(true); }}>
      <option value="session">Until session archival/deletion</option><option value="turn">Until the actual current turn ends</option>
    </select></label>}
    {tier === "Glacier" && <p className="settings-warning">Create Glacier notes only by reviewing and compressing an exact Sky/Terra source. Existing Glacier revisions can be reviewed, rolled back or forgotten, not silently re-attributed.</p>}
    <button disabled={!canWrite || busy || stale || !title.trim() || !text.trim()} onClick={() => void run(async () => {
      const input = tier === "Sky" ? { tier: "Sky" as const, sessionId: session!.id, lifetime, title, text } :
        { tier: "Terra" as const, projectId: project!.id, ...(selected?.record.workItemId ? { workItemId: selected.record.workItemId } : {}), title, text };
      const result = await sdk.knowledge.save(input, selected?.record.id, selected?.record.revision ?? 0);
      await read(result.id!); setStatus("Exact note saved. No model was called and no other tier changed.");
    })}>Save knowledge</button>
    {selected && <>
      <p className="fine-print">Original owner: {selected.record.sessionId ?? selected.record.projectId ?? snapshot.profileId}. SHA-256 <code>{selected.record.contentDigest}</code></p>
      <button disabled={busy || dirty || stale} onClick={() => void run(async () => { setHistory((await sdk.knowledge.history(selected.record.id)).records); })}>Review knowledge history</button>
      <div className="button-row">{history.map((record) => <button key={record.revision} disabled={busy} onClick={() => void run(async () => { setHistorical(await sdk.knowledge.version(record.id, record.contentDigest)); setRollback(false); })}>Inspect revision {record.revision}</button>)}</div>
      {historical && <><pre>{historical.text}</pre><label className="check-setting"><input type="checkbox" checked={rollback} onChange={(event) => setRollback(event.target.checked)} />I reviewed these exact historical bytes.</label>
        <button disabled={!rollback || busy || dirty || stale} onClick={() => void run(async () => { await sdk.knowledge.rollback(selected.record.id, selected.record.revision, historical.record.contentDigest, true); await read(selected.record.id); setStatus("A new rollback revision was retained; history was not rewritten."); })}>Roll back reviewed knowledge</button></>}
      {selected.record.tier !== "Glacier" && <fieldset disabled={busy || dirty || stale}><legend>Explicit promotion</legend>
        <label className="setting-field">Promotion tier<select aria-label="Promotion tier" value={target} onChange={(event) => { setTarget(event.target.value as "Terra" | "Glacier"); setReviewed(false); }}>
          {selected.record.tier === "Sky" && selected.record.projectId && <option value="Terra">Terra: same project</option>}<option value="Glacier">Glacier: profile-wide</option>
        </select></label>
        <label className="setting-field">Promoted title<input aria-label="Promoted title" value={promotionTitle} onChange={(event) => { setPromotionTitle(event.target.value); setReviewed(false); }} /></label>
        <label className="setting-field">Reviewed compressed text<textarea aria-label="Reviewed compressed text" value={summary} onChange={(event) => { setSummary(event.target.value); setReviewed(false); }} /></label>
        <label className="check-setting"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source and summary. {target === "Glacier" ? "The new copy will be available across this profile." : "The new copy stays in the source project."}</label>
        <button disabled={!reviewed || !summary.trim() || !promotionTitle.trim()} onClick={() => void run(async () => {
          const result = await sdk.knowledge.promote(selected.record.id, selected.record.revision, selected.record.contentDigest, { tier: target, title: promotionTitle, text: summary }, true);
          await read(result.id!); setStatus("Reviewed knowledge promoted with independent retention. Original source was not changed.");
        })}>Promote reviewed knowledge</button>
      </fieldset>}
      <label className="check-setting"><input type="checkbox" checked={forget} onChange={(event) => setForget(event.target.checked)} />I approve forgetting this note and all its retained revisions. Independent promoted copies are not deleted.</label>
      <button disabled={!forget || busy || dirty || stale} onClick={() => void run(async () => { await sdk.knowledge.forget(selected.record.id, selected.record.revision, true); reset(); setStatus("The note's encryption grant was forgotten. This is not a claim of physical disk reclamation."); })}>Forget selected knowledge</button>
    </>}
  </section>;
}
