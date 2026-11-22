import { useEffect, useMemo, useRef, useState } from "react";
import {
  activePersonaRun, outcomeLabel, personaPresets, skillListGroups,
  type GatewaySkill, type MoguriSdk, type Persona, type PersonaDefinition, type PersonaPreset, type PersonaRun, type Snapshot,
} from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { AnchoredMenu } from "./AnchoredMenu.tsx";
import { Icon } from "./Icon.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

type Run = (operation: () => Promise<unknown>) => Promise<void>;
const presetNames: Record<PersonaPreset, string> = { "product-manager": "Product Manager", maintenance: "Maintenance", docs: "Docs" };
const when = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const statusLabel = (persona: Persona) => persona.status === "enabled" ? { label: "On", tone: "running" as const } :
  persona.status === "paused" ? { label: "Paused", tone: "neutral" as const } : { label: "Off", tone: "neutral" as const };
const budgetText = (definition: PersonaDefinition) => !definition.budget || definition.budget.kind === "unlimited" ? "the chat's budget" :
  [definition.budget.tokens ? `${definition.budget.tokens.toLocaleString()} tokens` : "", definition.budget.usd ? `$${definition.budget.usd}` : ""].filter(Boolean).join(" / ") + " (estimated, stricter than the chat's wins)";

/** Taggable personas (#10). They start off; tagging an enabled one starts a linked subsession under Manual autonomy. */
export function PersonasPanel({ sdk, snapshot, run, openSession }: { sdk: MoguriSdk; snapshot: Snapshot; run: Run; openSession: (id: string) => void }) {
  const [editing, setEditing] = useState<Persona | PersonaPreset | "new" | null>(null);
  const personas = [...snapshot.personas].sort((a, b) => a.handle.localeCompare(b.handle));
  const unused = (Object.keys(personaPresets) as PersonaPreset[]).filter((preset) => !snapshot.personas.some((persona) => persona.handle === personaPresets[preset].handle));
  return <section className="automations-panel personas-panel" aria-label="Custom agents">
    <header><Icon name="User" /><h2>Custom agents</h2>
      <button type="button" className="primary" onClick={() => setEditing("new")}>New custom agent</button></header>
    <p className="fine-print">Tag an enabled custom agent with its @handle in a chat message. It starts in a linked subsession under that chat, which orchestrates and receives its reply.
      Tagging grants no permission: the subsession starts under Manual autonomy, and approvals, hard policy and budgets still apply. Read-only agents can work at the same time;
      writable ones take turns on the same files. To run one on a schedule, create an automation whose prompt tags it.</p>
    {unused.length > 0 && <div className="button-row" role="group" aria-label="Presets">{unused.map((preset) =>
      <button key={preset} type="button" onClick={() => setEditing(preset)}>Add {presetNames[preset]}</button>)}</div>}
    {!personas.length && <p>No custom agents yet. Custom agents start off until you turn them on.</p>}
    {personas.map((persona) => <PersonaCard key={persona.id} sdk={sdk} snapshot={snapshot} persona={persona} run={run} openSession={openSession} edit={() => setEditing(persona)} />)}
    <OrphanRuns sdk={sdk} snapshot={snapshot} run={run} openSession={openSession} />
    {editing && <PersonaDialog sdk={sdk} snapshot={snapshot} persona={typeof editing === "string" ? null : editing} preset={typeof editing === "string" && editing !== "new" ? editing : null}
      close={() => setEditing(null)} />}
  </section>;
}

function PersonaCard({ sdk, snapshot, persona, run, openSession, edit }: {
  sdk: MoguriSdk; snapshot: Snapshot; persona: Persona; run: Run; openSession: (id: string) => void; edit: () => void;
}) {
  const [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), pending = useRef(false);
  const runs = snapshot.personaRuns.filter((value) => value.personaId === persona.id).slice(0, 10), active = runs.filter(activePersonaRun);
  const project = persona.projectId ? snapshot.projects.find((value) => value.id === persona.projectId) : null;
  const model = persona.modelId ? snapshot.provider.models.find((value) => value.id === persona.modelId) : null;
  const act = (operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    void run(async () => { try { await operation(); } finally { pending.current = false; setBusy(false); } });
  };
  return <article className="automation-card persona-card" aria-label={`@${persona.handle}`} data-persona-id={persona.id}>
    <header><h3>@{persona.handle} <span className="fine-print">{persona.name}</span></h3>
      <StatusBadge status={statusLabel(persona)} />
      <label className="check-setting"><input type="checkbox" role="switch" checked={persona.status === "enabled"} disabled={busy}
        onChange={(event) => act(() => event.target.checked ? sdk.personas.enable(persona.id, persona.revision) : sdk.personas.pause(persona.id, persona.revision))} />On</label>
    </header>
    {persona.description && <p>{persona.description}</p>}
    <dl className="automation-facts">
      <dt>Where</dt><dd>{persona.projectId === null ? "Every project and chat" : project?.name ?? "Removed project"}</dd>
      <dt>Model</dt><dd>{persona.modelId === null ? "The tagging chat's model" : model?.name ?? persona.modelId}</dd>
      <dt>Tools</dt><dd>{persona.access === "read-only" ? "Read-only" : "Writable agent"}, Manual autonomy{persona.skills.length ? `; skills: ${persona.skills.join(", ")}` : ""}</dd>
      <dt>Budget</dt><dd>{budgetText(persona)}</dd>
      <dt>Stops after</dt><dd>{persona.timeoutMinutes} minutes</dd>
      <dt>Returns</dt><dd>{persona.output === "report" ? "A short report" : "A reply"}{persona.mention ? "" : "; mentions are off"}</dd>
    </dl>
    <details><summary>Instructions</summary><p className="persona-instructions">{persona.instructions}</p></details>
    <div className="automation-actions">
      <button type="button" disabled={busy} onClick={edit}>Edit</button>
      {confirming ? <>
        <span className="fine-print">{active.length ? "Stop its active runs and delete this custom agent? Its chats are kept." : "Delete this custom agent? Its chats are kept."}</span>
        <button type="button" className="danger" disabled={busy} onClick={() => act(() => sdk.personas.delete(persona.id, { stopRunning: active.length > 0, expectedRevision: persona.revision }))}>
          {active.length ? "Stop runs and delete" : "Delete"}</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </> : <button type="button" className="quiet" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>}
    </div>
    <h4>Recent runs</h4>
    {runs.length ? <ul className="automation-runs" aria-label="Recent runs">{runs.map((value) => <PersonaRunRow key={value.id} sdk={sdk} snapshot={snapshot} value={value} run={run} openSession={openSession} />)}</ul> :
      <p className="fine-print">No runs yet.</p>}
  </article>;
}

function OrphanRuns({ sdk, snapshot, run, openSession }: { sdk: MoguriSdk; snapshot: Snapshot; run: Run; openSession: (id: string) => void }) {
  const runs = snapshot.personaRuns.filter((value) => !snapshot.personas.some((persona) => persona.id === value.personaId)).slice(0, 10);
  return runs.length ? <section aria-label="Runs of deleted custom agents"><h4>Runs of deleted custom agents</h4>
    <ul className="automation-runs">{runs.map((value) => <PersonaRunRow key={value.id} sdk={sdk} snapshot={snapshot} value={value} run={run} openSession={openSession} />)}</ul></section> : null;
}

function PersonaRunRow({ sdk, snapshot, value, run, openSession }: { sdk: MoguriSdk; snapshot: Snapshot; value: PersonaRun; run: Run; openSession: (id: string) => void }) {
  const child = value.childSessionId ? snapshot.sessions.find((session) => session.id === value.childSessionId) : undefined;
  const source = snapshot.sessions.find((session) => session.id === value.source.sessionId);
  const label = value.status === "starting" ? { label: "Starting", tone: "running" as const } :
    value.status === "running" ? value.childTurnId ? { label: "Working", tone: "running" as const } : { label: "Queued", tone: "queued" as const } : outcomeLabel(value.status);
  return <li data-run-id={value.id}>
    <StatusBadge status={label} />
    <span>@{value.handle} {value.trigger === "automation" ? "from an automation" : "tagged"} in {source ? `“${source.title}”` : "a deleted chat"}, <time dateTime={value.createdAt}>{when(value.createdAt)}</time>
      {value.stopRequested && value.status === "running" && ", stop requested"}</span>
    {value.diagnostic && <p className="scheduled-prompt-diagnostic">{value.diagnostic}</p>}
    <span className="automation-run-actions">
      {source && <button type="button" className="quiet" onClick={() => openSession(source.id)}>Open tagging chat</button>}
      {child && <button type="button" className="quiet" onClick={() => openSession(child.id)}>Open agent chat</button>}
      {activePersonaRun(value) && !value.stopRequested && <button type="button" onClick={() => void run(() => sdk.personas.stopRun(value.id))}>Stop</button>}
    </span>
  </li>;
}

function PersonaDialog({ sdk, snapshot, persona, preset, close }: { sdk: MoguriSdk; snapshot: Snapshot; persona: Persona | null; preset: PersonaPreset | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const base: PersonaDefinition = persona ?? (preset ? personaPresets[preset] : { handle: "", name: "", description: "", instructions: "", projectId: null, modelId: null,
    access: "read-only", skills: [], budget: null, timeoutMinutes: 30, output: "reply", mention: true });
  const [handle, setHandle] = useState(base.handle), [name, setName] = useState(base.name), [description, setDescription] = useState(base.description);
  const [instructions, setInstructions] = useState(base.instructions), [projectId, setProjectId] = useState(base.projectId ?? "");
  const [modelId, setModelId] = useState(base.modelId ?? ""), [access, setAccess] = useState(base.access), [skills, setSkills] = useState(base.skills);
  const [tokens, setTokens] = useState(base.budget?.kind === "limited" && base.budget.tokens ? String(base.budget.tokens) : "");
  const [usd, setUsd] = useState(base.budget?.kind === "limited" && base.budget.usd ? String(base.budget.usd) : "");
  const [timeout, setTimeoutMinutes] = useState(String(base.timeoutMinutes)), [output, setOutput] = useState(base.output), [mention, setMention] = useState(base.mention);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const save = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const definition: PersonaDefinition = { handle: handle.trim().replace(/^@/, "").toLowerCase(), name: name.trim(), description: description.trim(), instructions,
        projectId: projectId || null, modelId: modelId || null, access, skills,
        budget: tokens || usd ? { kind: "limited", ...(tokens ? { tokens: Number(tokens) } : {}), ...(usd ? { usd: Number(usd) } : {}), basis: "estimate" } : null,
        timeoutMinutes: Number(timeout), output, mention };
      if (persona) await sdk.personas.update(persona.id, definition, persona.revision);
      else await sdk.personas.create(definition, preset ?? undefined);
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The custom agent was not saved."); }
    finally { pending.current = false; setBusy(false); }
  };
  const title = persona ? `Edit @${persona.handle}` : preset ? `Add ${presetNames[preset]}` : "New custom agent";
  return <dialog ref={dialog} className="workspace-dialog automation-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <header><h2>{title}</h2></header>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="setting-field">Handle<input value={handle} maxLength={33} required disabled={busy} placeholder="docs" onChange={(event) => setHandle(event.target.value)} /></label>
      <label className="setting-field">Name<input value={name} maxLength={80} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label className="setting-field">Description<input value={description} maxLength={500} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="setting-field">Instructions<textarea rows={5} value={instructions} maxLength={4000} required disabled={busy} onChange={(event) => setInstructions(event.target.value)} /></label>
      <label className="setting-field">Where it can be tagged<select value={projectId} disabled={busy} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">Every project and chat</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="setting-field">Model<select value={modelId} disabled={busy} onChange={(event) => setModelId(event.target.value)}>
        <option value="">The tagging chat's model</option>{snapshot.provider.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
      <label className="setting-field">Tools<select value={access} disabled={busy} onChange={(event) => setAccess(event.target.value as PersonaDefinition["access"])}>
        <option value="read-only">Read-only (investigate and recommend)</option><option value="agent">Writable agent (changes need approval)</option></select></label>
      <SkillPicker sdk={sdk} snapshot={snapshot} value={skills} change={setSkills} disabled={busy} />
      <label className="setting-field">Token cap per run (empty uses the chat's budget)<input type="number" min={1} value={tokens} disabled={busy} onChange={(event) => setTokens(event.target.value)} /></label>
      <label className="setting-field">USD cap per run (empty uses the chat's budget)<input type="number" min={0.01} step={0.01} value={usd} disabled={busy} onChange={(event) => setUsd(event.target.value)} /></label>
      {(tokens || usd) && <p className="fine-print">Caps count estimated usage; the stricter of these caps and the chat's budget applies.</p>}
      <label className="setting-field">Stop after (minutes)<input type="number" min={1} max={1440} value={timeout} required disabled={busy} onChange={(event) => setTimeoutMinutes(event.target.value)} /></label>
      <label className="setting-field">Returns<select value={output} disabled={busy} onChange={(event) => setOutput(event.target.value as PersonaDefinition["output"])}>
        <option value="reply">A reply</option><option value="report">A short report</option></select></label>
      <label className="check-setting"><input type="checkbox" checked={mention} disabled={busy} onChange={(event) => setMention(event.target.checked)} />Start when tagged with @handle</label>
      {!persona && <p className="fine-print">New custom agents start off. Turn one on from its card when you want it to answer tags.</p>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !handle.trim() || !name.trim() || !instructions.trim()}>{persona ? "Save changes" : "Create custom agent"}</button></footer>
    </form>
  </dialog>;
}

const MAX_SKILLS = 20;
/** Chooses skills from the profile's existing skills list (installed, bundled and source skills) with a searchable dropdown. */
function SkillPicker({ sdk, snapshot, value, change, disabled }: { sdk: MoguriSdk; snapshot: Snapshot; value: string[]; change: (skills: string[]) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [sourceSkills, setSourceSkills] = useState<GatewaySkill[] | null>(null), [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null), sources = snapshot.settings.values.skillSources ?? [];
  const reading = open && sourceSkills === null && sources.some((source) => source.enabled);
  useEffect(() => {
    if (!reading) return;
    const abort = new AbortController();
    void sdk.skills.sources(abort.signal).then((result) => { if (!abort.signal.aborted) setSourceSkills(result.skills); },
      (failure: unknown) => { if (!abort.signal.aborted) { setSourceSkills([]); setError(failure instanceof Error ? failure.message : "Skill sources couldn't be read; installed skills are still listed."); } });
    return () => abort.abort(new Error("The skill picker closed before its sources were read."));
  }, [reading, sdk]);
  const names = useMemo(() => [...new Set(skillListGroups({ registry: snapshot.registry, projects: snapshot.projects, sources, switches: snapshot.settings.values.skillSwitches,
    sourceSkills, failures: [] }).flatMap((group) => group.skills.map((skill) => skill.name)))].sort((a, b) => a.localeCompare(b)), [snapshot.registry, snapshot.projects, sources, snapshot.settings.values.skillSwitches, sourceSkills]);
  const shown = names.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (name: string) => change(value.includes(name) ? value.filter((entry) => entry !== name) : [...value, name]);
  const available = names.length > 0 || sources.some((source) => source.enabled);
  return <fieldset className="setting-field persona-skills" disabled={disabled}><legend>Skills to load when relevant</legend>
    {value.length > 0 ? <ul className="persona-skill-chips" aria-label="Chosen skills">{value.map((name) => <li key={name}><span>{name}</span>
      <button type="button" className="icon-button" aria-label={`Remove skill ${name}`} title="Remove" onClick={() => change(value.filter((entry) => entry !== name))}><Icon name="Close" /></button></li>)}</ul> :
      <p className="fine-print">No skills chosen. The agent still sees the chat's enabled skills.</p>}
    {available ? <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <Icon name="Plus" />Choose skills</button> : <p className="fine-print">No skills yet. Add some in Capabilities / Skills or Marketplace.</p>}
    {open && <AnchoredMenu label="Choose skills" trigger={trigger} close={() => { setOpen(false); setQuery(""); }} className="pr-meta-menu">
      <input type="search" aria-label="Filter skills" placeholder="Filter skills" value={query} onChange={(event) => setQuery(event.target.value)} />
      {reading && <p className="fine-print" role="status">Reading skill sources...</p>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <div role="group" aria-label="Skills">{shown.map((name) => {
        const selected = value.includes(name);
        return <button key={name} type="button" role="menuitemcheckbox" aria-checked={selected} disabled={!selected && value.length >= MAX_SKILLS} onClick={() => toggle(name)}>
          <span className="pr-meta-check" aria-hidden="true">{selected ? <Icon name="Check" /> : null}</span><span>{name}</span></button>;
      })}</div>
      {!reading && !shown.length && <p className="fine-print">{names.length ? "No matching skills." : "No skills found."}</p>}
      {value.length >= MAX_SKILLS && <p className="fine-print">A custom agent can list up to {MAX_SKILLS} skills.</p>}
    </AnchoredMenu>}
  </fieldset>;
}
