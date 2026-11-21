import { useEffect, useRef, useState } from "react";
import { SCRIPT_TOOL_CONTRACT, TOOL_SCRIPT_NAME, toolScriptPrompt, type CapabilityEntry, type GatewaySkill, type MoguriSdk, type Proposal, type Snapshot, type ToolsetCatalog, type ToolSuggestion, type UserSettings } from "../../../packages/sdk/src/index.ts";
import { McpInstallPanel } from "./McpInstallPanel.tsx";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";
import { SkillGatewaySettings } from "./SkillGatewaySettings.tsx";
import { SkillList } from "./SkillList.tsx";
import type { SettingsTab } from "./SettingsPanel.tsx";

export const skillsTabs = ["Skills", "Marketplace", "MCP", "Tools"] as const;
export type SkillsTab = typeof skillsTabs[number];
const scopeLabel = (snapshot: Snapshot, projectId: string | null) => projectId === null ? "All projects" : snapshot.projects.find((project) => project.id === projectId)?.name ?? "Removed project";
const originLabel = (entry: CapabilityEntry) => entry.ownerPluginId ? "Plugin bundle" : entry.marketplace ? "Repository marketplace" : entry.source === "approved-proposal" ? "Approved proposal" : "Installed by you";
const scriptTemplate = `// description: Describe when an agent should use this tool.
// arguments: { "input": "a path relative to the chat's working folder" }
import { readFileSync } from "node:fs";

const { arguments: args, projectRoot } = JSON.parse(readFileSync(0, "utf8"));
// Do the work here, then print the result.
process.stdout.write(JSON.stringify({ ok: true, input: args.input, projectRoot }));
`;
async function saveSettings(sdk: MoguriSdk, change: (values: UserSettings) => UserSettings) {
  const current = sdk.settings.get();
  if (!current) throw new Error("Reconnect this profile before changing settings. Nothing was saved.");
  await sdk.settings.update(change(current.values), current.revision);
}
/** One pending action at a time, with its error and outcome kept beside the controls that caused them. */
function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), pending = useRef(false);
  const act = (operation: () => Promise<string | void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    void operation().then((message) => { if (message) setNotice(message); })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "That didn't work. Nothing else changed."))
      .finally(() => { pending.current = false; setBusy(false); });
  };
  return { busy, error, notice, act };
}
function Feedback({ error, notice }: { error: string; notice: string }) {
  return <>{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <p className="fine-print" role="status">{notice}</p>}</>;
}

function CapabilityRow({ sdk, snapshot, entry, label }: { sdk: MoguriSdk; snapshot: Snapshot; entry: CapabilityEntry; label: string }) {
  const { busy, error, act } = useAction(), [source, setSource] = useState<string | null>(null);
  const pluginOff = Boolean(entry.ownerPluginId && !snapshot.registry.some((plugin) => plugin.id === entry.ownerPluginId && plugin.enabled));
  return <article className="capability-row skills-row">
    <div><strong>{entry.name}</strong><small>{entry.description}</small>
      <code>{originLabel(entry)} / {scopeLabel(snapshot, entry.projectId)} / {entry.contentDigest.slice(0, 12)}</code>
      {entry.retired && <small>Removed from its bundle. Install or roll back the whole bundle to use it again.</small>}
      {pluginOff && !entry.enabled && <small>Turn on its plugin in Settings / Integrations / Plugins first.</small>}
      {source !== null && <pre className="skills-source" aria-label={`${entry.name} source`}>{source}</pre>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}</div>
    <button type="button" disabled={busy} aria-expanded={source !== null} onClick={() => source !== null ? setSource(null) :
      act(async () => { setSource((await sdk.capabilities.content(entry.id)).content); })}>{source !== null ? "Hide source" : "View source"}</button>
    <label className="check-setting"><input type="checkbox" role="switch" aria-label={`${label} ${entry.name}`} checked={entry.enabled}
      disabled={busy || !entry.enabled && (entry.retired === true || pluginOff)}
      onChange={(event) => { const enabled = event.target.checked; act(async () => { await sdk.capabilities.toggle(entry.id, enabled, entry.revision); }); }} />
      <span>{entry.enabled ? "On" : "Off"}</span></label>
  </article>;
}
function CapabilityGroups({ sdk, snapshot, entries, label, empty }: { sdk: MoguriSdk; snapshot: Snapshot; entries: CapabilityEntry[]; label: string; empty: string }) {
  const scopes = [...new Set(entries.map((entry) => entry.projectId))].sort((a, b) => a === null ? -1 : b === null ? 1 : scopeLabel(snapshot, a).localeCompare(scopeLabel(snapshot, b)));
  if (!entries.length) return <p className="fine-print">{empty}</p>;
  return <>{scopes.map((scope) => <section className="skills-group" key={scope ?? "global"} aria-label={`${scopeLabel(snapshot, scope)} ${label}`}>
    <h4>{scopeLabel(snapshot, scope)}</h4>
    {entries.filter((entry) => entry.projectId === scope).sort((a, b) => a.name.localeCompare(b.name)).map((entry) =>
      <CapabilityRow key={entry.id} sdk={sdk} snapshot={snapshot} entry={entry} label={label} />)}
  </section>)}</>;
}
/** Pending skill or script proposals (from you or a model) with the exact content to review before installing a disabled copy. */
function PendingProposals({ sdk, snapshot, kind }: { sdk: MoguriSdk; snapshot: Snapshot; kind: Proposal["kind"] }) {
  const { busy, error, notice, act } = useAction();
  const [open, setOpen] = useState<{ id: string; content: string; digest: string } | null>(null), [reviewed, setReviewed] = useState(false);
  const pending = snapshot.proposals.filter((proposal) => proposal.kind === kind && proposal.status === "pending");
  if (!pending.length && !notice) return null;
  return <section className="skills-proposals" aria-label={`${kind} proposals waiting for review`}><h4>Waiting for your review</h4>
    <p className="fine-print">Approving installs a disabled copy. You turn it on separately.</p>
    <Feedback error={error} notice={notice} />
    {pending.map((proposal) => <article className="capability-row" key={proposal.id}>
      <div><strong>{proposal.name}</strong><small>{proposal.actor === "model" ? "Proposed by a model" : "Written by you"} / {scopeLabel(snapshot, proposal.projectId)}{proposal.baseDigest ? " / updates an existing one" : ""}</small>
        {open?.id === proposal.id && <><pre className="skills-source" aria-label={`Proposed ${kind} ${proposal.name}`}>{open.content}</pre><code>SHA-256 {open.digest}</code>
          <label className="check-setting"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source. Approving it doesn't run it.</label>
          <div className="button-row"><button type="button" className="primary" disabled={busy || !reviewed} onClick={() => act(async () => {
            await sdk.capabilities.decide(open.id, true, open.digest); setOpen(null); return `${proposal.name} is installed and off. Turn it on when you're ready.`;
          })}>Approve disabled</button><button type="button" disabled={busy} onClick={() => act(async () => {
            await sdk.capabilities.decide(open.id, false, open.digest); setOpen(null); return `${proposal.name} was rejected. Nothing was installed.`;
          })}>Reject</button></div></>}</div>
      <button type="button" disabled={busy} aria-expanded={open?.id === proposal.id} aria-label={`Review ${kind} ${proposal.name}`} onClick={() => open?.id === proposal.id ? setOpen(null) :
        act(async () => { const content = await sdk.capabilities.proposal(proposal.id); setOpen({ id: proposal.id, content: content.content, digest: content.digest }); setReviewed(false); })}>
        {open?.id === proposal.id ? "Hide" : "Review"}</button>
    </article>)}
  </section>;
}

/** Every known skill, grouped by where it came from and expanded here (D57); Settings / Skills shows the same list collapsed. */
function InstalledSkills({ sdk, snapshot, openSettings }: { sdk: MoguriSdk; snapshot: Snapshot; openSettings: (tab: SettingsTab) => void }) {
  return <>
    <div className="button-row"><button type="button" onClick={() => openSettings("skills")}>Import and review in Settings</button></div>
    <PendingProposals sdk={sdk} snapshot={snapshot} kind="skill" />
    <SkillList sdk={sdk} snapshot={snapshot} defaultExpanded />
  </>;
}

function Marketplace({ sdk, snapshot, openSettings }: { sdk: MoguriSdk; snapshot: Snapshot; openSettings: (tab: SettingsTab) => void }) {
  const [scope, setScope] = useState(""), [saving, setSaving] = useState(false), [sourceError, setSourceError] = useState(""), [, setGatewayDirty] = useState(false);
  const { busy, error, notice, act } = useAction(), projectId = scope || null;
  useEffect(() => { if (scope && !snapshot.projects.some((project) => project.id === scope)) setScope(""); }, [scope, snapshot.projects]);
  const install = (skill: GatewaySkill) => {
    if (skill.sourceId === null) return <span className="fine-print">Installed skill</span>;
    if (snapshot.registry.some((entry) => entry.kind === "skill" && entry.projectId === projectId && entry.contentDigest === skill.digest)) return <span className="fine-print">Installed</span>;
    return <button type="button" className="primary" disabled={busy} aria-label={`Install ${skill.name}`} onClick={() => act(async () => {
      const result = await sdk.skills.install(projectId, skill.id, skill.digest);
      return `${skill.name} is installed in ${scopeLabel(snapshot, projectId)} and off. Turn it on in Capabilities / Skills.${result.notice ? ` ${result.notice}` : ""}`;
    })}>Install</button>;
  };
  return <>
    <p className="fine-print">Install skills from the repositories, ZIP archives and folders you configure below. Moguri checks the exact contents again before installing; installed skills start off and never grant tools.</p>
    <label className="setting-field">Install into<select aria-label="Install skills into" value={scope} onChange={(event) => setScope(event.target.value)}>
      <option value="">All projects</option>{snapshot.projects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select></label>
    <Feedback error={error || sourceError} notice={notice} />
    <SkillGatewaySettings key={sdk.profileId} sdk={sdk} value={snapshot.settings.values.skillSources ?? []} dirty={saving} disabled={saving} onDirty={setGatewayDirty} install={install}
      change={(sources) => {
        setSaving(true); setSourceError("");
        void saveSettings(sdk, (values) => ({ ...values, skillSources: sources }))
          .catch((failure: unknown) => setSourceError(failure instanceof Error ? failure.message : "The skill source change wasn't saved."))
          .finally(() => setSaving(false));
      }} />
    <p className="fine-print">Publishing a catalog in one of your repositories instead? Use the <button type="button" className="quiet" onClick={() => openSettings("marketplace")}>repository marketplace</button>.</p>
  </>;
}

function ToolSuggestions({ suggestions, choose, refresh, busy }: { suggestions: ToolSuggestion[] | null; choose: (suggestion: ToolSuggestion) => void; refresh: () => void; busy: boolean }) {
  return <section className="skills-suggestions" aria-label="Suggested tools">
    <header className="panel-toolbar"><h3>Suggested tools</h3><button type="button" className="icon-button" aria-label="Check recent chats for repeated tasks" title="Check again" disabled={busy} onClick={refresh}><Icon name="Refresh" /></button></header>
    <p className="fine-print">Requests you repeated across recent chats that a script could do the same way every time. This is a local phrase match, not a model verdict.</p>
    {suggestions === null ? <p className="fine-print" role="status">Checking recent chats...</p> : !suggestions.length ? <p className="fine-print">No repeated tasks found yet.</p> :
      suggestions.map((suggestion) => <article className="suggestion-hint" key={suggestion.name}><strong>{suggestion.title}</strong>
        <p><code>{suggestion.name}</code> / asked in {suggestion.count} chats</p><small>“{suggestion.example}”</small>
        {suggestion.installed ? <small>A script with this name is already installed.</small> :
          <button type="button" onClick={() => choose(suggestion)}>Ask the agent to write it</button>}
      </article>)}
  </section>;
}

function Tools({ sdk, snapshot, openSession, openAutomations }: { sdk: MoguriSdk; snapshot: Snapshot; openSession: (id: string) => Promise<void>; openAutomations: () => void }) {
  const [catalog, setCatalog] = useState<ToolsetCatalog | null>(null), [catalogError, setCatalogError] = useState("");
  const [suggestions, setSuggestions] = useState<ToolSuggestion[] | null>(null), [checking, setChecking] = useState(false);
  const [name, setName] = useState(""), [purpose, setPurpose] = useState(""), [writeName, setWriteName] = useState(""), [source, setSource] = useState(scriptTemplate);
  const ask = useAction(), write = useAction(), evolution = useAction(), askName = useRef<HTMLInputElement>(null);
  const scripts = snapshot.registry.filter((entry) => entry.kind === "script"), evolutionOn = snapshot.settings.values.evolution.enabled;
  useEffect(() => {
    let active = true;
    void sdk.tools.toolsets().then((value) => { if (active) setCatalog(value); })
      .catch((error: unknown) => { if (active) setCatalogError(error instanceof Error ? error.message : "The toolset list is unavailable."); });
    return () => { active = false; };
  }, [sdk]);
  const refresh = () => {
    setChecking(true);
    void sdk.suggestions.preview(null, true).then((value) => setSuggestions(value.preview.tools))
      .catch((error: unknown) => { setSuggestions([]); setCatalogError(error instanceof Error ? error.message : "Repeated tasks couldn't be checked."); })
      .finally(() => setChecking(false));
  };
  useEffect(refresh, [sdk]);
  const nameValid = TOOL_SCRIPT_NAME.test(name), writeValid = TOOL_SCRIPT_NAME.test(writeName);
  return <>
    <p className="fine-print">Tools are the deterministic actions agents call instead of working things out every time, so repeated work doesn't cost tokens again. They aren't tied to a project. Listing them grants nothing: each chat still gets only what its environment, mode and policy allow, and calls still need your approval where policy says so.</p>
    {catalogError && <Alert as="p" className="inline-error" role="alert">{catalogError}</Alert>}
    <h3>Built-in toolsets</h3>
    {!catalog && !catalogError && <p className="fine-print" role="status">Loading toolsets...</p>}
    {catalog?.toolsets.map((set) => <details className="toolset" key={set.id}><summary><strong>{set.name}</strong><span>{set.tools.length} tools</span></summary>
      <p className="fine-print">{set.description}</p>
      <ul>{set.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code><span>{tool.summary}</span></li>)}</ul></details>)}
    {catalog && <details className="toolset"><summary><strong>Foundational scripts</strong><span>{catalog.scripts.length} scripts</span></summary>
      <p className="fine-print">Built into every project through Moguri's internal MCP server.</p>
      <ul>{catalog.scripts.map((script) => <li key={script.name}><code>{script.name}</code><span>{script.summary}</span></li>)}</ul></details>}

    <h3>Your scripts</h3>
    <p className="fine-print">Custom scripts run as code on this Mac, outside any sandbox. Scripts written here work in every chat; a project's own script with the same name takes precedence there. Review the source, turn on only scripts you trust and approve each call.</p>
    <PendingProposals sdk={sdk} snapshot={snapshot} kind="script" />
    <CapabilityGroups sdk={sdk} snapshot={snapshot} entries={scripts} label="Enable script" empty="No custom scripts yet. Write one below or ask the agent to write one." />

    <ToolSuggestions suggestions={suggestions} busy={checking} refresh={refresh} choose={(suggestion) => {
      setName(suggestion.name); setPurpose(suggestion.title.replace(/^./, (letter) => letter.toLowerCase()));
      requestAnimationFrame(() => askName.current?.focus());
    }} />
    <p className="fine-print">Want Moguri to look for these regularly? <button type="button" className="quiet" onClick={openAutomations}>Set up the repeated-task check in Automations</button>.</p>

    <section className="skills-form" aria-label="Ask the agent to write a script"><h3>Ask the agent to write a script</h3>
      <p className="fine-print">Opens a new chat without a project, with the request ready to send. The agent submits the script for your review; nothing runs or turns on by itself.</p>
      {!evolutionOn && <><label className="check-setting"><input type="checkbox" role="switch" checked={evolutionOn} disabled={evolution.busy}
        aria-label="Let models propose skills, scripts and style knowledge for your review"
        onChange={(event) => { const enabled = event.target.checked; evolution.act(async () => { await saveSettings(sdk, (values) => ({ ...values, evolution: { enabled } })); }); }} />
        Let models propose skills, scripts and style knowledge for your review</label>
        <p className="fine-print">Needed so the agent can submit the script. Proposals always wait for your approval.</p><Feedback error={evolution.error} notice={evolution.notice} /></>}
      <label className="setting-field">Tool name<input ref={askName} aria-label="Generated script name" value={name} maxLength={64} placeholder="markdown_into_pdf" onChange={(event) => setName(event.target.value)} /></label>
      {name && !nameValid && <p className="fine-print">Use 3 to 64 lowercase letters, digits or underscores, starting with a letter.</p>}
      <label className="setting-field">What should it do?<textarea aria-label="What the generated script should do" value={purpose} maxLength={2000} placeholder="turn a Markdown file into a PDF" onChange={(event) => setPurpose(event.target.value)} /></label>
      <Feedback error={ask.error} notice={ask.notice} />
      <button type="button" className="primary" disabled={ask.busy || !nameValid || !purpose.trim()} onClick={() => ask.act(async () => {
        const created = await sdk.sessions.create(null, `Write the ${name} tool`);
        if (!created.id) throw new Error("The new chat was not acknowledged. Nothing was sent.");
        const session = sdk.getState().snapshot?.sessions.find((value) => value.id === created.id);
        await sdk.command({ type: "draft.save", sessionId: created.id, expectedRevision: session?.draft.revision ?? 0, text: toolScriptPrompt(name, purpose), attachments: [] });
        setName(""); setPurpose("");
        await openSession(created.id);
      })}>Open a chat with this request</button>
    </section>

    <section className="skills-form" aria-label="Write a script"><h3>Write a script</h3>
      <p className="fine-print">{SCRIPT_TOOL_CONTRACT} Saving submits it for your review in this tab.</p>
      <label className="setting-field">Tool name<input aria-label="New script name" value={writeName} maxLength={64} placeholder="markdown_into_pdf" onChange={(event) => setWriteName(event.target.value)} /></label>
      {writeName && !writeValid && <p className="fine-print">Use 3 to 64 lowercase letters, digits or underscores, starting with a letter.</p>}
      <label className="setting-field">Source<textarea className="json-editor" aria-label="New script source" spellCheck={false} value={source} maxLength={64 * 1024} onChange={(event) => setSource(event.target.value)} /></label>
      <Feedback error={write.error} notice={write.notice} />
      <button type="button" className="primary" disabled={write.busy || !writeValid || !source.trim()} onClick={() => write.act(async () => {
        await sdk.capabilities.propose(null, "script", writeName, source);
        const saved = writeName; setWriteName(""); setSource(scriptTemplate);
        return `${saved} is waiting for your review under Your scripts.`;
      })}>Save for review</button>
    </section>
  </>;
}

export function SkillsWorkspace({ sdk, snapshot, tab, setTab, openSettings, openSession, openAutomations }: {
  sdk: MoguriSdk; snapshot: Snapshot; tab: SkillsTab; setTab: (tab: SkillsTab) => void;
  openSettings: (tab: SettingsTab) => void; openSession: (id: string) => Promise<void>; openAutomations: () => void;
}) {
  const index = skillsTabs.indexOf(tab);
  return <section className="skills-workspace" aria-label="Capabilities">
    <div className="pr-pane-tabs" role="tablist" aria-label="Capabilities sections" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? skillsTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + skillsTabs.length) % skillsTabs.length;
      setTab(skillsTabs[next]!); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{skillsTabs.map((name) => <button key={name} id={`skills-tab-${name}`} type="button" role="tab" aria-selected={tab === name} aria-controls="skills-tabpanel"
      tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div id="skills-tabpanel" role="tabpanel" aria-labelledby={`skills-tab-${tab}`} data-skills-tab={tab}>
      {tab === "Skills" && <InstalledSkills sdk={sdk} snapshot={snapshot} openSettings={openSettings} />}
      {tab === "Marketplace" && <Marketplace sdk={sdk} snapshot={snapshot} openSettings={openSettings} />}
      {tab === "MCP" && <McpInstallPanel servers={snapshot.settings.values.mcpServers} disabled={false} openSettings={() => openSettings("mcpServers")} save={async (mcpServers) => {
        const current = sdk.settings.get();
        if (!current) throw new Error("Settings aren't loaded yet. Try again in a moment.");
        await sdk.settings.update({ ...current.values, mcpServers }, current.revision);
      }} />}
      {tab === "Tools" && <Tools sdk={sdk} snapshot={snapshot} openSession={openSession} openAutomations={openAutomations} />}
    </div>
  </section>;
}
