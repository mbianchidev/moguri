import { useEffect, useRef, useState } from "react";
import type { GatewaySkill, MoguriSdk, SkillSource } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

/** Source list changes (add, enable, remove, confirmed global folder) save immediately through `change`; only the new-source fields are typed before Add. */
export function SkillGatewaySettings({ sdk, value, change, dirty, disabled, onDirty }: {
  sdk: MoguriSdk; value: SkillSource[]; change: (sources: SkillSource[]) => void;
  dirty: boolean; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<"local" | "remote">("local"), [name, setName] = useState(""), [location, setLocation] = useState("");
  const [query, setQuery] = useState(""), [sourceId, setSourceId] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<MoguriSdk["skills"]["find"]>> | null>(null), [body, setBody] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [globalSources, setGlobalSources] = useState<{ sdk: MoguriSdk; sources: Array<Extract<SkillSource, { kind: "local" }>> } | null>(null);
  const [globalError, setGlobalError] = useState(""), [globalRevision, setGlobalRevision] = useState(0);
  const [globalReview, setGlobalReview] = useState<{ sdk: MoguriSdk; source: Extract<SkillSource, { kind: "local" }>; scope: string; trigger: HTMLInputElement } | null>(null);
  const generation = useRef(0), pending = useRef(false), request = useRef<AbortController | null>(null), scope = JSON.stringify([sdk.profileId, value]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const draft = Boolean(name || location);
  useEffect(() => { onDirty(draft || busy || Boolean(globalReview)); return () => onDirty(false); }, [draft, busy, globalReview, onDirty]);
  useEffect(() => { generation.current++; request.current?.abort(); setResult(null); setBody(""); setGlobalReview(null); }, [sdk, scope]);
  useEffect(() => {
    let active = true; setGlobalError(""); setGlobalSources(null);
    void window.moguri.globalSkillSources(sdk.profileId).then((sources) => { if (active) setGlobalSources({ sdk, sources }); })
      .catch((error: unknown) => { if (active) setGlobalError(error instanceof Error ? error.message : "Global folder presets are unavailable. No directory was scanned."); });
    return () => { active = false; };
  }, [sdk, globalRevision]);
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
    <SettingsHelp label="About the skill gateway" target={<h2>Skill gateway</h2>}>Point Moguri at a local skill folder, a public GitHub repository, or a direct HTTPS ZIP archive. Each search and read refreshes and validates the source. No scripts run, no skills are silently installed, and skill text cannot grant permissions. Sources belong only to this profile and currently use the Local control plane.</SettingsHelp>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <h3>Global skill folders</h3>
    <p className="fine-print">Use either folder or both. Confirming a folder creates it if missing and saves it. A missing folder offers no skills and never blocks the others.</p>
    {globalError && <div className="alert-recovery"><Alert as="p" role="alert">{globalError}</Alert><button type="button" onClick={() => setGlobalRevision((value) => value + 1)}>Retry global folders</button></div>}
    {globalSources?.sdk === sdk && globalSources.sources.map((source) => {
      const existing = value.find((entry) => entry.kind === "local" && entry.path === source.path);
      const label = source.id === "global-agents" ? "~/.agents/skills" : "~/.moguri/skills";
      return <label className="check-setting global-skill-source" key={source.id}><SettingsInput type="checkbox" role="switch" aria-label={`Use ${label}`}
        checked={existing?.enabled ?? false} disabled={disabled || busy || !existing && value.length >= 16} onChange={(event) => {
          if (event.target.checked) setGlobalReview({ sdk, source, scope, trigger: event.currentTarget });
          else if (existing) change(value.map((entry) => entry.id === existing.id ? { ...entry, enabled: false } : entry));
        }} /><span><strong>{label}</strong><code>{source.path}</code></span></label>;
    })}
    {value.filter((source) => !(source.kind === "local" && globalSources?.sdk === sdk && globalSources.sources.some((preset) => preset.path === source.path))).map((source) => <article className="skill-source" key={source.id}>
      <label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable skill source ${source.name}`} checked={source.enabled} disabled={disabled || busy}
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
          ...(kind === "local" ? { kind: "local" as const, path: location } : { kind: "remote" as const, url: location }) }]);
        setName(""); setLocation("");
      }}>Add source</button>
      {draft && <button type="button" className="quiet" onClick={() => { setName(""); setLocation(""); }}>Cancel new source</button>}</div>
    </div>
    <SettingsHelp label="About skill discovery" target={<h3>Find skills</h3>}>Only saved, enabled sources are read. All downloads are checked again when a selected skill is opened; a changed body needs a fresh search. Preview is not permission to run instructions or to access a different execution host.</SettingsHelp>
    <label className="setting-field">Source<select aria-label="Search skill source" value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setResult(null); setBody(""); }}><option value="">All enabled sources and skills</option>{value.filter((source) => source.enabled).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
    <label className="setting-field">Search<SettingsInput aria-label="Find skills" value={query} maxLength={200} disabled={busy} onChange={(event) => { setQuery(event.target.value); setResult(null); setBody(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !busy && !disabled && !dirty) { event.preventDefault(); void find(); } }} /></label>
    <button type="button" disabled={disabled || busy || dirty} onClick={() => void find()}>Find skills</button>
    {dirty && <p className="fine-print" role="status">{disabled ? "Saving source changes..." : "The last source change was not saved. Change a source to retry or reload settings to discard it."}</p>}{busy && <><p role="status">Refreshing and validating skill sources...</p><button type="button" onClick={() => request.current?.abort(new Error("Skill lookup cancelled. No content was applied."))}>Cancel lookup</button></>}
    {result && <><p className="fine-print">{result.total} matching skills. This search used fresh source bytes.</p>{result.skills.map((skill) => <article className="skill-result" key={skill.id}><div><strong>{skill.name}</strong><p>{skill.description}</p><small>{skill.sourceName}{skill.path ? ` / ${skill.path}` : ""}</small></div><button type="button" disabled={busy} onClick={() => void read(skill)}>Read skill</button></article>)}
      {result.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void find(result.nextOffset!)}>Next skills</button>}</>}
    {body && <details className="settings-result" open><summary>Checked skill content</summary><pre>{body}</pre></details>}
    {globalReview && <GlobalSkillConfirmation source={globalReview.source} close={() => {
      const trigger = globalReview.trigger; setGlobalReview(null); queueMicrotask(() => { if (trigger.isConnected) trigger.focus(); });
    }} confirm={async () => {
      const review = globalReview;
      if (sdk !== review.sdk || currentScope.current !== review.scope) { setError("The original skill settings changed. Review the current folder before enabling it."); setGlobalReview(null); return; }
      try { await window.moguri.createGlobalSkillFolder(review.sdk.profileId, review.source.id); }
      catch (error) { setError(`${review.source.path} could not be created: ${error instanceof Error ? error.message : "unknown error"}. The folder was not enabled.`); setGlobalReview(null); return; }
      if (sdk !== review.sdk || currentScope.current !== review.scope) { setError("The original skill settings changed. Review the current folder before enabling it."); setGlobalReview(null); return; }
      const existing = value.find((source) => source.kind === "local" && source.path === review.source.path);
      change(existing ? value.map((source) => source.id === existing.id ? { ...source, enabled: true } : source) :
        [...value, { ...review.source, id: crypto.randomUUID(), enabled: true }]);
      setGlobalReview(null);
    }} />}
  </section>;
}

function GlobalSkillConfirmation({ source, close, confirm }: { source: Extract<SkillSource, { kind: "local" }>; close: () => void; confirm: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null), [pending, setPending] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="workspace-dialog" aria-label="Confirm global skill folder" onClose={close}>
    <h2>Use this global skill folder?</h2><p>Once you confirm, skill discovery will read this exact Local folder for this profile:</p>
    <p className="path">{source.path}</p><p>Moguri creates the folder if it doesn't exist. No folder is scanned now. Adding it does not install skills, run instructions or grant model/tool permissions.</p>
    <div className="button-row"><button type="button" disabled={pending} onClick={close}>Cancel</button><button type="button" className="primary" disabled={pending}
      onClick={() => { setPending(true); void confirm().finally(() => setPending(false)); }}>Use this folder</button></div>
  </dialog>;
}
