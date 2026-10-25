import { useEffect, useRef, useState } from "react";
import type { GatewaySkill, MoguriSdk, SkillSource } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Icon } from "./Icon.tsx";

export function SkillGatewaySettings({ sdk, value, change, save, dirty, disabled, onDirty }: {
  sdk: MoguriSdk; value: SkillSource[]; change: (sources: SkillSource[]) => void; save: () => void;
  dirty: boolean; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<"local" | "remote">("local"), [name, setName] = useState(""), [location, setLocation] = useState("");
  const [query, setQuery] = useState(""), [sourceId, setSourceId] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<MoguriSdk["skills"]["find"]>> | null>(null), [body, setBody] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), request = useRef<AbortController | null>(null), scope = JSON.stringify([sdk.profileId, value]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const draft = Boolean(name || location);
  useEffect(() => { onDirty(draft || busy); return () => onDirty(false); }, [draft, busy, onDirty]);
  useEffect(() => { generation.current++; request.current?.abort(); setResult(null); setBody(""); }, [sdk, scope]);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  const run = async (operation: (current: () => boolean, signal: AbortSignal) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setBody("");
    const token = ++generation.current, captured = scope, abort = new AbortController(); request.current = abort;
    const current = () => generation.current === token && currentScope.current === captured;
    try { await operation(current, abort.signal); }
    catch (error) { if (current()) { setResult(null); setError(error instanceof Error ? error.message : "Skill sources could not be refreshed. No stale result was returned."); } }
    finally { if (request.current === abort) request.current = null; pending.current = false; setBusy(false); }
  };
  const find = (offset = 0) => run(async (current, signal) => {
    const found = await sdk.skills.find(query, { signal, ...(sourceId ? { sourceId } : {}), offset, ...(offset && result ? { expectedCatalogDigest: result.catalogDigest } : {}) });
    if (current()) { setResult(found); setBody(""); }
  });
  const read = (skill: GatewaySkill) => run(async (current, signal) => {
    const loaded = await sdk.skills.read(skill.id, skill.digest, undefined, signal);
    if (current()) setBody(`${loaded.authority}\n\n${loaded.body}`);
  });
  return <section className="skill-gateway-settings" aria-label="Skill gateway settings">
    <h2>Skill gateway</h2><SettingsHelp label="About the skill gateway">Point Moguri at a local skill folder, a public GitHub repository, or a direct HTTPS ZIP archive. Each search and read refreshes and validates the source. No scripts run, no skills are silently installed, and skill text cannot grant permissions. Sources belong only to this profile and currently use the Local control plane.</SettingsHelp>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {value.map((source) => <article className="skill-source" key={source.id}>
      <label className="check-setting"><input type="checkbox" aria-label={`Enable skill source ${source.name}`} checked={source.enabled} disabled={disabled || busy}
        onChange={(event) => change(value.map((entry) => entry.id === source.id ? { ...entry, enabled: event.target.checked } : entry))} /><strong>{source.name}</strong></label>
      <code>{source.kind === "local" ? source.path : source.url}</code>
      <button type="button" className="icon-button" aria-label={`Remove skill source ${source.name}`} disabled={disabled || busy}
        onClick={() => change(value.filter((entry) => entry.id !== source.id))}><Icon name="Trash" /></button>
    </article>)}
    <div className="skill-source-editor">
      <label className="setting-field">Source type<select aria-label="Skill source type" value={kind} disabled={disabled || busy} onChange={(event) => setKind(event.target.value === "remote" ? "remote" : "local")}><option value="local">Local folder</option><option value="remote">GitHub repository / HTTPS ZIP</option></select></label>
      <label className="setting-field">Name<SettingsInput aria-label="Skill source name" value={name} maxLength={80} disabled={disabled || busy} onChange={(event) => setName(event.target.value)} /></label>
      <label className="setting-field">{kind === "local" ? "Folder" : "Repository or ZIP URL"}<SettingsInput aria-label="Skill source location" value={location} type={kind === "remote" ? "url" : "text"} disabled={disabled || busy}
        placeholder={kind === "local" ? "/absolute/path/to/skills" : "https://github.com/owner/skills"} onChange={(event) => setLocation(event.target.value)} /></label>
      <div className="button-row"><button type="button" disabled={disabled || busy || !name.trim() || !location.trim() || value.length >= 16} onClick={() => {
        change([...value, { id: crypto.randomUUID(), name: name.trim(), enabled: true,
          ...(kind === "local" ? { kind: "local" as const, path: location.trim() } : { kind: "remote" as const, url: location.trim() }) }]);
        setName(""); setLocation("");
      }}>Add source</button><button type="button" className="primary" aria-label="Save skill sources" disabled={disabled || busy || !dirty} onClick={save}>Save sources</button>
      {draft && <button type="button" className="quiet" onClick={() => { setName(""); setLocation(""); }}>Cancel new source</button>}</div>
    </div>
    <h3>Find skills</h3><SettingsHelp label="About skill discovery">Only saved, enabled sources are read. All downloads are checked again when a selected skill is opened; a changed body needs a fresh search. Preview is not permission to run instructions or to access a different execution host.</SettingsHelp>
    <label className="setting-field">Source<select aria-label="Search skill source" value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setResult(null); setBody(""); }}><option value="">All enabled sources and skills</option>{value.filter((source) => source.enabled).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
    <label className="setting-field">Search<SettingsInput aria-label="Find skills" value={query} maxLength={200} disabled={busy} onChange={(event) => { setQuery(event.target.value); setResult(null); setBody(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !busy && !disabled && !dirty) { event.preventDefault(); void find(); } }} /></label>
    <button type="button" disabled={disabled || busy || dirty} onClick={() => void find()}>Find skills</button>
    {dirty && <p className="fine-print">Save source changes before discovery.</p>}{busy && <><p role="status">Refreshing and validating skill sources...</p><button type="button" onClick={() => request.current?.abort(new Error("Skill lookup cancelled. No content was applied."))}>Cancel lookup</button></>}
    {result && <><p className="fine-print">{result.total} matching skills. This search used fresh source bytes.</p>{result.skills.map((skill) => <article className="skill-result" key={skill.id}><div><strong>{skill.name}</strong><p>{skill.description}</p><small>{skill.sourceName}{skill.path ? ` / ${skill.path}` : ""}</small></div><button type="button" disabled={busy} onClick={() => void read(skill)}>Read skill</button></article>)}
      {result.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void find(result.nextOffset!)}>Next skills</button>}</>}
    {body && <details className="settings-result" open><summary>Checked skill content</summary><pre>{body}</pre></details>}
  </section>;
}
