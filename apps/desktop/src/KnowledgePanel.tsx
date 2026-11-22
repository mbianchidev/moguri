import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { KnowledgeRecord, KnowledgeTier, MoguriSdk, Project, Session, Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

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
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Couldn't update the note. Your draft is kept."); }
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
    <SettingsHelp label="More about this setting" target={<h2>Sky, Terra, Glacier</h2>}>Sky notes last for a turn or session, Terra notes belong to a project, and Glacier notes are reviewed summaries shared across this profile. Notes never run a model or move between tiers on their own.</SettingsHelp>
    <p className="fine-print">Notes in model context: {snapshot.settings.values.memory.enabled && snapshot.settings.values.memory.useTieredContext === true ? "on" : "off"}. Change this in Repository memory.</p>
    {error && <Alert as="p" role="alert" className="notice error">{error}</Alert>}
    {status && <Alert as="p" role="status">{status}</Alert>}
    {stale && <Alert as="p" role="alert" className="settings-warning">This note expired or changed in another window. Your edit is kept; reload the note before saving.</Alert>}
    <label className="setting-field">Knowledge tier<select aria-label="Knowledge tier" value={tier} disabled={busy || dirty} onChange={(event) => { reset(); setTier(event.target.value as KnowledgeTier); }}>
      <option value="Sky">Sky: current session</option><option value="Terra">Terra: current project</option><option value="Glacier">Glacier: this profile</option>
    </select></label>
    <div className="button-row">{records.map((record) => <button key={record.id} disabled={busy || dirty} onClick={() => void run(() => read(record.id))}>{record.title} (r{record.revision})</button>)}</div>
    {!records.length && <p>No notes in this tier yet.</p>}
    <button disabled={busy} onClick={reset} aria-label="Discard / New note">Discard / New note</button>
    <label className="setting-field">Knowledge title<SettingsInput aria-label="Knowledge title" value={title} disabled={!canWrite || busy} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} /></label>
    <label className="setting-field">Knowledge text<SettingsTextarea aria-label="Knowledge text" value={text} disabled={!canWrite || busy} onChange={(event) => { setText(event.target.value); setDirty(true); }} /></label>
    {tier === "Sky" && <label className="setting-field">Sky lifetime<select aria-label="Sky lifetime" value={lifetime} disabled={busy || Boolean(selected)} onChange={(event) => { setLifetime(event.target.value as "turn" | "session"); setDirty(true); }}>
      <option value="session">Until the session is archived or deleted</option><option value="turn">Until the current turn ends</option>
    </select></label>}
    {tier === "Glacier" && <Alert as="p" tone="warning" className="settings-warning">Glacier notes come from promoting a Sky or Terra note. Here you can review, roll back or forget existing ones.</Alert>}
    <button disabled={!canWrite || busy || stale || !title.trim() || !text.trim()} onClick={() => void run(async () => {
      const input = tier === "Sky" ? { tier: "Sky" as const, sessionId: session!.id, lifetime, title, text } :
        { tier: "Terra" as const, projectId: project!.id, ...(selected?.record.workItemId ? { workItemId: selected.record.workItemId } : {}), title, text };
      const result = await sdk.knowledge.save(input, selected?.record.id, selected?.record.revision ?? 0);
      await read(result.id!); setStatus("Note saved.");
    })} aria-label="Save knowledge">Save</button>
    {selected && <>
      <p className="fine-print">Owner: {selected.record.sessionId ?? selected.record.projectId ?? snapshot.profileId} · SHA-256 <code>{selected.record.contentDigest}</code></p>
      <button disabled={busy || dirty || stale} onClick={() => void run(async () => { setHistory((await sdk.knowledge.history(selected.record.id)).records); })} aria-label="Review knowledge history">History</button>
      <div className="button-row">{history.map((record) => <button key={record.revision} disabled={busy} onClick={() => void run(async () => { setHistorical(await sdk.knowledge.version(record.id, record.contentDigest)); setRollback(false); })}>Revision {record.revision}</button>)}</div>
      {historical && <><pre>{historical.text}</pre><label className="check-setting"><SettingsInput type="checkbox" checked={rollback} onChange={(event) => setRollback(event.target.checked)} />I reviewed this earlier version.</label>
        <button disabled={!rollback || busy || dirty || stale} onClick={() => void run(async () => { await sdk.knowledge.rollback(selected.record.id, selected.record.revision, historical.record.contentDigest, true); await read(selected.record.id); setStatus("Rolled back as a new revision. History is kept."); })} aria-label="Roll back reviewed knowledge">Roll back</button></>}
      {selected.record.tier !== "Glacier" && <fieldset disabled={busy || dirty || stale}><legend>Promote</legend>
        <label className="setting-field">Promotion tier<select aria-label="Promotion tier" value={target} onChange={(event) => { setTarget(event.target.value as "Terra" | "Glacier"); setReviewed(false); }}>
          {selected.record.tier === "Sky" && selected.record.projectId && <option value="Terra">Terra: same project</option>}<option value="Glacier">Glacier: profile-wide</option>
        </select></label>
        <label className="setting-field">Promoted title<SettingsInput aria-label="Promoted title" value={promotionTitle} onChange={(event) => { setPromotionTitle(event.target.value); setReviewed(false); }} /></label>
        <label className="setting-field">Summary<SettingsTextarea aria-label="Reviewed compressed text" value={summary} onChange={(event) => { setSummary(event.target.value); setReviewed(false); }} /></label>
        <label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the note and this summary. {target === "Glacier" ? "The copy is shared across this profile." : "The copy stays in this project."}</label>
        <button disabled={!reviewed || !summary.trim() || !promotionTitle.trim()} onClick={() => void run(async () => {
          const result = await sdk.knowledge.promote(selected.record.id, selected.record.revision, selected.record.contentDigest, { tier: target, title: promotionTitle, text: summary }, true);
          await read(result.id!); setStatus("Promoted as a separate note. The original is unchanged.");
        })} aria-label="Promote reviewed knowledge">Promote</button>
      </fieldset>}
      <label className="check-setting"><SettingsInput type="checkbox" checked={forget} onChange={(event) => setForget(event.target.checked)} />I want to forget this note and all its revisions. Promoted copies are kept.</label>
      <button disabled={!forget || busy || dirty || stale} onClick={() => void run(async () => { await sdk.knowledge.forget(selected.record.id, selected.record.revision, true); reset(); setStatus("Note forgotten and its encryption key revoked. Disk space isn't necessarily freed."); })} aria-label="Forget selected knowledge">Forget</button>
    </>}
  </section>;
}
