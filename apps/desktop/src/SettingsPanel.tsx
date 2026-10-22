import { useEffect, useRef, useState } from "react";
import { parse, SettingsSchema, CompoundSettingsSchema, DEFAULT_ROUTER_PROMPT, SYSTEM_PROMPT_WARNING, type MoguriSdk, type Project, type Session, type SettingsSection, type Snapshot, type UserSettings, type VoiceStatus, type McpToolInfo, type RemoteReadiness, type ProfileCatalog, type ModelInfo } from "../../../packages/sdk/src/index.ts";
import { DependencyCachePanel } from "./DependencyCachePanel.tsx";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel.tsx";
import { Icon } from "./Icon.tsx";
import { McpOAuthPanel } from "./McpOAuthPanel.tsx";
import { RemoteMcpPanel } from "./RemoteMcpPanel.tsx";
import { BudgetLimitEditor } from "./BudgetControls.tsx";
import { CompoundLineageReview } from "./CompoundLineageReview.tsx";
import { useDecisionStatus } from "./DecisionPanel.tsx";

export type SettingsTab = "appearance" | "systemPrompt" | "permissions" | "memory" | "subagents" | "skills" | "scripts" | "plugins" | "mcpServers" | "voice" | "cache" | "project" | "retention" | "instructions" | "notifications" | "localModels" | "startup" | "remote" | "budgets" | "kupo" | "decisions";
const tabs: { id: SettingsTab; label: string }[] = [
  { id: "appearance", label: "Appearance" }, { id: "systemPrompt", label: "System prompt" }, { id: "permissions", label: "Guardrails" },
  { id: "memory", label: "Repository memory" }, { id: "subagents", label: "Subagents" }, { id: "skills", label: "Skills" },
  { id: "scripts", label: "Scripts" }, { id: "plugins", label: "Plugins" }, { id: "mcpServers", label: "MCP gateway" }, { id: "voice", label: "Voice dictation" },
  { id: "cache", label: "Dependency cache" },
  { id: "project", label: "Project" }, { id: "retention", label: "Retention" },
  { id: "instructions", label: "User guidance" }, { id: "notifications", label: "Notifications" },
  { id: "localModels", label: "Local models" }, { id: "startup", label: "Startup defaults" },
  { id: "remote", label: "Remote SSH" },
  { id: "budgets", label: "Budgets" },
  { id: "kupo", label: "kupo routing" },
  { id: "decisions", label: "Decision providers" },
];
const modelBoundary = (model: ModelInfo) => model.endpointBoundary === "loopback" ? "execution-host loopback" : "network/hosted";
export function SettingsPanel({ sdk, snapshot, session, project, initialTab = "systemPrompt", onBack, onUnsavedChange, openTerminal, openSession }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; project?: Project; initialTab?: SettingsTab; onBack: () => void; onUnsavedChange: (unsaved: boolean) => void; openTerminal: () => void; openSession: (id: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const decisions = useDecisionStatus(sdk, session, snapshot, tab === "decisions");
  const [draft, setDraft] = useState(() => structuredClone(snapshot.settings.values));
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [projectDirty, setProjectDirty] = useState(false);
  const [profileBudgetDirty, setProfileBudgetDirty] = useState(false), [globalBudgetDirty, setGlobalBudgetDirty] = useState(false);
  const [lineageDirty, setLineageDirty] = useState(false), [lineageBusy, setLineageBusy] = useState(false);
  const [risk, setRisk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sandboxBusy, setSandboxBusy] = useState(false), [sandboxReviewed, setSandboxReviewed] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState("");
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [acceptLicense, setAcceptLicense] = useState(false);
  const [serverId, setServerId] = useState("builtin");
  const [token, setToken] = useState("");
  const [modelEndpoint, setModelEndpoint] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [remoteState, setRemoteState] = useState<RemoteReadiness | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteEndpoint, setRemoteEndpoint] = useState("");
  const [remoteKey, setRemoteKey] = useState("");
  const [remoteInspection, setRemoteInspection] = useState("");
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState<McpToolInfo | null>(null);
  const [argumentsJson, setArgumentsJson] = useState("{}");
  const [proposal, setProposal] = useState<{ id: string; content: string; digest: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [profileCatalog, setProfileCatalog] = useState<ProfileCatalog | null>(null);
  const baseRevision = useRef(snapshot.settings.revision);
  const ownSave = useRef(false);
  const memoryKey = JSON.stringify([sdk.profileId, project?.id, session?.id, session?.controls.env, session?.workspaceId,
    snapshot.projectConfigurations.find((configuration) => configuration.projectId === project?.id)?.revision, snapshot.settings.revision, snapshot.policy.revision]);
  const memoryScope = useRef({ sdk, key: memoryKey }); memoryScope.current = { sdk, key: memoryKey };
  const memoryEnv = session?.controls.env ?? "Local";
  const memoryBlocked = !project || !snapshot.settings.values.memory.enabled || dirty || saving || memoryEnv === "Sandbox";
  const memoryJobs = snapshot.jobs.filter((job) => job.kind === "memory.index" && job.projectId === project?.id &&
    (!job.sessionId || job.sessionId === session?.id)).slice(-4).reverse();
  useEffect(() => { setTab(initialTab); setOutput(""); setInput(""); }, [initialTab]);
  useEffect(() => { if (tab === "memory") { setOutput(""); setError(""); } }, [memoryKey, tab]);
  const nestedDirty = projectDirty || profileBudgetDirty || globalBudgetDirty || lineageDirty || lineageBusy;
  useEffect(() => { onUnsavedChange(dirty || saving || sandboxBusy || nestedDirty); return () => onUnsavedChange(false); }, [dirty, saving, sandboxBusy, nestedDirty, onUnsavedChange]);
  useEffect(() => {
    setPreview("");
    setSandboxReviewed(false);
    if (ownSave.current) return;
    if (!dirty) { baseRevision.current = snapshot.settings.revision; setDraft(structuredClone(snapshot.settings.values)); setRaw({}); }
    else if (baseRevision.current !== snapshot.settings.revision) setError("Another client changed settings. Your edit is preserved. Reload before applying it.");
  }, [snapshot.settings.revision]);
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => { if (dirty || nestedDirty || sandboxBusy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [dirty, nestedDirty, sandboxBusy]);
  const run = async (operation: () => Promise<unknown>, owned: () => boolean = () => true) => {
    setError("");
    try {
      const result = await operation();
      if (owned() && result !== undefined) setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    } catch (error) { if (owned()) setError(error instanceof Error ? error.message : "The operation failed. Uncommitted edits were preserved."); }
  };
  const runMemory = (operation: () => Promise<unknown>) => {
    const captured = memoryScope.current;
    return run(operation, () => memoryScope.current.sdk === captured.sdk && memoryScope.current.key === captured.key);
  };
  useEffect(() => {
    if (tab === "voice") void run(async () => { const result = await sdk.voice.status(); setVoice(result.voice); });
  }, [tab, snapshot.jobs.filter((job) => job.kind === "voice.download" && job.status === "completed").length]);
  useEffect(() => { if (tab === "remote") void run(async () => { setRemoteState((await sdk.remote.status()).remote); }); }, [tab, snapshot.settings.revision]);
  useEffect(() => { if (tab === "budgets" || tab === "startup") void run(async () => { setProfileCatalog((await sdk.profiles.list()).catalog); }); }, [tab, snapshot.profileCatalogRevision]);
  const change = <K extends SettingsSection>(section: K, value: UserSettings[K]) => { setDraft((draft) => ({ ...draft, [section]: value })); setDirty(true); };
  const reload = () => { baseRevision.current = snapshot.settings.revision; setDraft(structuredClone(snapshot.settings.values)); setRaw({}); setDirty(false); setRisk(false); setError(""); };
  const save = async () => {
    setError(""); setSaving(true); ownSave.current = true;
    try {
      const values = { ...draft };
      for (const [key, value] of Object.entries(raw)) Object.assign(values, { [key]: JSON.parse(value) });
      const settings = parse(SettingsSchema, values);
      const result = await sdk.settings.update(settings, baseRevision.current, risk);
      baseRevision.current = result.revision!;
      setDraft(structuredClone(settings)); setDirty(false); setRaw({}); setRisk(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Settings were not saved."); }
    finally { ownSave.current = false; setSaving(false); }
  };
  const reset = (section: SettingsSection | "all") => run(async () => {
    ownSave.current = true;
    try {
      const result = await sdk.settings.reset(section, baseRevision.current);
      baseRevision.current = result.revision!; setDraft(structuredClone(sdk.getState().snapshot!.settings.values)); setDirty(false); setRaw({}); setRisk(false);
      return `Restored ${section} defaults. Projects, history, credentials, knowledge and downloaded models were preserved.`;
    } finally { ownSave.current = false; }
  });
  const jsonEditor = (section: SettingsSection, label: string, disabled = saving) => <label className="setting-field">{label}<textarea className="json-editor" aria-label={label} value={raw[section] ?? JSON.stringify(draft[section], null, 2)} disabled={disabled}
    onChange={(event) => { setRaw((raw) => ({ ...raw, [section]: event.target.value })); setDirty(true); }} spellCheck={false} /></label>;
  const registry = snapshot.registry.filter((entry) => entry.projectId === (project?.id ?? null) && entry.kind === (tab === "skills" ? "skill" : tab === "scripts" ? "script" : "plugin"));
  const pending = snapshot.proposals.filter((proposal) => proposal.projectId === project?.id && proposal.status === "pending");
  const activeVoice = snapshot.jobs.findLast((job) => job.sessionId === session?.id && job.kind.startsWith("voice.") && job.status === "running");
  const completedVoice = snapshot.jobs.findLast((job) => job.sessionId === session?.id && ["voice.record", "voice.transcribe"].includes(job.kind) && job.status === "completed");
  const modelPromptChanged = draft.systemPrompt !== snapshot.settings.values.systemPrompt;
  const projectServers = session ? snapshot.projectConfigurations.find((configuration) => configuration.projectId === session.projectId)?.values.mcpServers ?? [] : [];
  const configuredServers = [...snapshot.settings.values.mcpServers, ...projectServers].filter((server, index, all) => server.enabled &&
    (!server.projectIds || session?.projectId && server.projectIds.includes(session.projectId)) && all.findIndex((entry) => entry.id === server.id && entry.enabled) === index);
  const retainedServers = [...new Set(snapshot.settings.values.remote?.mcpGrants?.map((grant) => grant.serverId) ?? [])].filter((id) => id !== "builtin" && !configuredServers.some((server) => server.id === id));
  const selectedServer = configuredServers.find((server) => server.id === serverId);
  const oauthSelected = selectedServer?.transport.type === "http" && selectedServer.transport.auth === "oauth";
  const routingModels = snapshot.provider.models.filter((model) => !model.synthetic);
  useEffect(() => { setTools([]); setSelectedTool(null); }, [snapshot.profileId, snapshot.settings.revision, snapshot.policy.revision, session?.id, session?.projectId,
    session?.workspaceId, session?.controls.env, session?.mode, session?.pendingMode, snapshot.projectConfigurations.find((configuration) => configuration.projectId === session?.projectId)?.revision]);
  return <section className="settings-page" aria-label="Moguri settings">
    <header className="settings-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" onClick={() => { if (dirty || nestedDirty) setError("Save your edit or reload committed settings before leaving."); else onBack(); }}><Icon name="Back" /></button><h1>Settings</h1><span role="status">{saving ? "Saving..." : dirty || nestedDirty ? "Unsaved changes" : "Saved"}</span>{tab !== "project" && <button aria-label="Save settings" disabled={saving || lineageDirty || lineageBusy || !dirty || modelPromptChanged && !risk} className="primary" onClick={() => void save()}>Save</button>}</header>
    <div className="settings-layout"><nav aria-label="Settings categories">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "selected" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => { if (nestedDirty) { setError("Save or reload this settings edit before changing sections."); return; } setTab(item.id); setOutput(""); setInput(""); }}>{item.label}</button>)}
      <button className="restore-all" disabled={lineageDirty || lineageBusy} onClick={() => void reset("all")}>Restore all defaults</button></nav>
      <div className="settings-content">
        {tab === "decisions" && <><h2>Decision providers and Local Max</h2>
          <p>Off by default, with no selected model. Explicitly select a bounded-model System One-compatible transport, exact model ID, output/deadline/call bounds and separate hosted-data consent. Saving never starts inference, selects a solver, changes Env or grants tools.</p>
          {jsonEditor("decisions", "Decision provider policy")}
          <details><summary>Available exact model IDs</summary><pre>{JSON.stringify(routingModels.map(({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary }) => ({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary })), null, 2)}</pre></details>
          <p className="fine-print">Tool review can only veto/escalate an action already allowed by an exact user rule. Technical questions need kind: technical-choice, an exact question and identical offered choices, with freeform disabled. They are not user-only facts. Steering starts off and selects only original user-authored id/text alternatives; continue and askUser are reserved.</p>
          <p className="settings-warning">Confidence and selected probability are separate, uncalibrated advice. Jev remains unqualified because its documented API cannot enforce the required output-token bound. Remote/native Max stays blocked, never moved to the Local controller. No provider/model fallback, new permission or Git approval.</p>
          <h3>Saved-policy readiness</h3><p className="fine-print" role="status">{decisions.reason}</p>
          <p className="fine-print">After saving, explicitly select Autopilot Max in the composer. Inspect actual model actor, original request, raw output, charges and cancellation under Artifacts / Decision-provider observations. User answers and approvals always win races.</p>
          <button type="button" disabled={saving} onClick={() => void reset("decisions")}>Restore decision-provider defaults</button>
        </>}
        {tab === "kupo" && <><h2>kupo {draft.kupo.workflow === "compound" ? "Compound (reviewed alpha)" : "Single (alpha)"}</h2>
          <label className="setting-field">Workflow policy<select aria-label="kupo workflow" value={draft.kupo.workflow} disabled={saving || lineageDirty || lineageBusy} onChange={(event) => {
            if (raw.kupo !== undefined) { setError("Save or reload the complete policy JSON before switching workflow shapes. Your unsaved policy was preserved."); return; }
            const { enabled, classifierModelId, approvedModelIds, allowHosted, minimumConfidence } = draft.kupo;
            const pool = { enabled, classifierModelId, approvedModelIds, allowHosted, minimumConfidence };
            change("kupo", event.target.value === "compound" ? { ...pool, workflow: "compound", routes: [], lineageReviews: [],
              limits: { routerTokens: 512, proposalTokens: 2048, criticTokens: 1024, timeoutMs: 300000 } } : { ...pool, workflow: "single" });
          }}><option value="single">Single</option><option value="compound">Reviewed Cascade / Critique</option></select></label>
          {draft.kupo.workflow === "compound" ? <>
            <p>Declare exact Cascade/Critique routes, approved concrete models, hosted-data consent and complete role bounds. The classifier chooses only an eligible declared route. Configuration never selects a model, spends budget, stages code or runs tests.</p>
            {jsonEditor("kupo", "Complete compound routing policy", saving || lineageBusy)}
            <p className="fine-print">Each Cascade route needs id, pattern: cascade, draftId and escalationId. Each Critique route needs id, pattern: critique, draftId, criticId and lineageReviewId. Use canonical model IDs below, not names or provider family strings. Up to four routes and eight approved role models.</p>
            <details><summary>Available exact model IDs</summary><pre>{JSON.stringify(routingModels, null, 2)}</pre></details>
            <CompoundLineageReview sdk={sdk} models={routingModels} disabled={saving} onDirty={setLineageDirty} onBusy={setLineageBusy}
              onPrepared={(review, draftId, criticId) => {
                const policy = parse(CompoundSettingsSchema, raw.kupo === undefined ? draft.kupo : JSON.parse(raw.kupo));
                const next = { ...policy, lineageReviews: [...policy.lineageReviews, review],
                  routes: policy.routes.map((route) => route.pattern === "critique" && route.draftId === draftId && route.criticId === criticId ? { ...route, lineageReviewId: review.id } : route) };
                setRaw((raw) => ({ ...raw, kupo: JSON.stringify(next, null, 2) })); setDirty(true);
              }} />
            <p className="settings-warning">Public compound staging/tests are explicitly Local and require a separate actual-user review in Candidates. Finite Local budgets require the separately configured reserved wind-down policy in Budgets. Local Max additionally needs an explicit compatible Decision provider; it cannot bypass compound reviews. Remote/Sandbox compound and Max remain unqualified. No fallback or hard-policy bypass.</p>
          </> : <><p>One tool-less classifier chooses one explicitly approved solver. Both calls are metered and use the existing agent, permissions and execution env. Configuration never selects a model or starts inference.</p>
          <label className="check-setting"><input type="checkbox" aria-label="Enable kupo Single" checked={draft.kupo.enabled} disabled={saving} onChange={(event) => change("kupo", { ...draft.kupo, enabled: event.target.checked })} />Enable kupo Single for this profile</label>
          <label className="setting-field">Classifier<select aria-label="kupo classifier" value={draft.kupo.classifierModelId ?? ""} disabled={saving} onChange={(event) => change("kupo", { ...draft.kupo, classifierModelId: event.target.value || null })}><option value="">Choose a configured classifier</option>
            {draft.kupo.classifierModelId && !routingModels.some((model) => model.id === draft.kupo.classifierModelId) && <option value={draft.kupo.classifierModelId}>Saved unavailable model: {draft.kupo.classifierModelId}</option>}
            {routingModels.map((model) => <option key={model.id} value={model.id}>{model.name} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}</option>)}</select></label>
          <h3>Approved solvers</h3><p className="fine-print">Approve up to eight actual models. Availability, env, context capacity and output bounds are rechecked before each call; this list is not a guarantee of eligibility.</p>
          {routingModels.length === 0 && <p>No configured models. Connect Copilot or configure a local endpoint first.</p>}
          {routingModels.map((model) => <label className="check-setting" key={model.id}><input type="checkbox" aria-label={`Approve solver ${model.name}`} checked={draft.kupo.approvedModelIds.includes(model.id)} disabled={saving || !draft.kupo.approvedModelIds.includes(model.id) && draft.kupo.approvedModelIds.length >= 8}
            onChange={(event) => change("kupo", { ...draft.kupo, approvedModelIds: event.target.checked ? [...draft.kupo.approvedModelIds, model.id] : draft.kupo.approvedModelIds.filter((id) => id !== model.id) })} /><span>{model.name}<br /><small className="path">{model.id} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}</small></span></label>)}
          {draft.kupo.approvedModelIds.filter((id) => !routingModels.some((model) => model.id === id)).map((id) => <label className="check-setting" key={id}><input type="checkbox" aria-label={`Keep unavailable solver ${id}`} checked disabled={saving} onChange={() => change("kupo", { ...draft.kupo, approvedModelIds: draft.kupo.approvedModelIds.filter((value) => value !== id) })} /><span className="path">{id} / unavailable; uncheck to remove</span></label>)}
          <label className="check-setting"><input type="checkbox" aria-label="Allow hosted or network routing data" checked={draft.kupo.allowHosted} disabled={saving} onChange={(event) => change("kupo", { ...draft.kupo, allowHosted: event.target.checked })} />Allow approved task history to hosted or network classifiers and solvers</label>
          <p className="fine-print">Leave this off for explicitly configured loopback endpoints. A provider's local label does not make a network URL local. Loopback is on the execution host, not proof that a configured proxy never forwards data. Model redirects are blocked. Remote also needs its separately approved SSH host and scoped Copilot grant.</p>
          <label className="setting-field">Classifier confidence threshold: {draft.kupo.minimumConfidence.toFixed(2)}<input type="range" aria-label="Classifier confidence threshold" min={0} max={1} step={0.01} value={draft.kupo.minimumConfidence} disabled={saving} onChange={(event) => change("kupo", { ...draft.kupo, minimumConfidence: Number(event.target.value) })} /></label>
          <p className="fine-print">This is model-supplied advice, not a calibrated probability or permission. Invalid or low-confidence plans pause without another model or fallback.</p>
          <p className="settings-warning">Without an explicitly configured qualified Local wind-down policy, Single needs Unlimited and no finite inherited cap. Finite Local turns reserve their finishing capacity before routing. Images and synthetic-model tuning stay blocked; Cascade/Critique needs its separate Compound policy. Hard policy is never lifted.</p>
          </>}
          <h3>Saved-policy availability</h3>{snapshot.routingDiagnostics?.map((diagnostic) => <p className="fine-print" key={diagnostic}>{diagnostic}</p>)}
          <p className="fine-print">After saving, explicitly select kupo in the composer. Changing this policy invalidates pending routed permissions; calls already in flight may still incur usage.</p>
          {draft.kupo.workflow === "single" && <details><summary>Read the fixed classifier contract</summary><pre>{DEFAULT_ROUTER_PROMPT}</pre><p className="fine-print">The editable system prompt still governs the solver. Classifier output is validated data, never solver instructions or a user answer.</p></details>}
          <button type="button" disabled={saving || lineageDirty || lineageBusy} onClick={() => void reset("kupo")}>Restore kupo defaults</button>
        </>}
        {tab === "budgets" && <><h2>Budgets and model estimates</h2><p>Session caps and profile policy share one cumulative all-role ledger. Unknown usage is not zero. Exact provider-billing caps are not qualified; finite controls require explicit estimate-based accounting.</p>
          <h3>Explicit Local wind-down policy</h3>
          <p>Off by default. Select an exact available model ID, separate hosted metadata consent and complete output/deadline bounds. A reserved metadata-only finishing role uses the existing all-role ledger; it receives no raw task, code or chat history. Unknown work or a newly stricter cap can still block it.</p>
          {jsonEditor("winddown", "Budget wind-down policy")}
          <p className="fine-print">Saving never selects a model or approves Git. Use Candidates / Budget wind-down checkpoints for a separate actual-user accepted-work/new-branch review. Source index/HEAD stay intact; no automatic push, merge or branch deletion. Remote/native wind-down remains unqualified.</p>
          <h3>Model-specific USD estimates</h3><p>Use canonical model IDs and approved input/output USD per million tokens. The input rate applies conservatively to every input category, including cache. A missing/stale rate disables USD admission, not a free request. Save these settings before applying policy.</p>
          {jsonEditor("budgets", "Budget model estimates")}
          <details><summary>Illustrative estimate configuration, not Copilot pricing</summary><pre>{JSON.stringify({ rates: [{ modelId: session?.controls.modelId ?? "replace-with-canonical-model-id", inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }], maxPriceAgeDays: 30 }, null, 2)}</pre><p>Replace illustrative rates with your own approved estimate. An explicit zero rate is allowed; unknown metadata never supplies zero automatically.</p></details>
          <button type="button" disabled={saving} onClick={() => void reset("budgets")}>Restore price-estimate defaults</button>
          <h3>Current-profile hard policy</h3><p>Applies across this profile's sessions and model-created legs. Unlimited preferences, default resets, source deletion and restart cannot remove this policy or refund accounting. Removing the policy requires this explicit revision-bound action.</p>
          <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="profile" onDirty={setProfileBudgetDirty} disabled={dirty || saving} />
          <h3>Global hard policy</h3><p>Applies across every profile. Creating/switching profiles cannot refund global usage or escape unknown held calls. No other profile's task content is disclosed here.</p>
          {profileCatalog && <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="global" globalPolicy={profileCatalog.globalBudget} onDirty={setGlobalBudgetDirty} disabled={dirty || saving} />}
        </>}
        {tab === "localModels" && <><h2>Configured local models</h2><p>Connect an OpenAI-compatible server you started, such as ds4, Ollama or llama.cpp. Saving performs bounded model discovery only against enabled URLs. It never scans hosts, downloads weights or selects a model automatically.</p>
          {jsonEditor("localModels", "Local model endpoints")}
          <details><summary>Endpoint configuration example</summary><pre>{JSON.stringify([{ id: "my-local", name: "My local server", enabled: true, baseUrl: "http://127.0.0.1:8080/v1", auth: "none", models: [{ id: "replace-with-advertised-model-id", name: "My local model", contextWindow: 32768, maxTokens: 4096, imageInput: false }] }], null, 2)}</pre></details>
          <p className="fine-print">Declare the actual model limits and image support; discovery never guesses them. HTTP is loopback-only; other explicitly configured endpoints require HTTPS. Unavailable models never fall back to Copilot.</p>
          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("local.")).map((connection) => <div className="capability-row" key={connection.id}><div><strong>{connection.name}</strong><small>{connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</small></div></div>)}
          <button disabled={dirty || saving} onClick={() => void run(() => sdk.models.refresh())}>Refresh models</button>
          <h3>Endpoint credentials</h3><p className="fine-print">Save bearer-auth configuration first. Keys bind to the exact endpoint and stay in the profile's secret backend, never this JSON or model context.</p>
          <label className="setting-field">Credential endpoint<select aria-label="Local model credential endpoint" value={modelEndpoint} onChange={(event) => { setModelEndpoint(event.target.value); setModelKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.localModels.filter((endpoint) => endpoint.enabled && endpoint.auth === "bearer").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<input type="password" autoComplete="off" value={modelKey} maxLength={32768} onChange={(event) => setModelKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || !modelEndpoint || !modelKey} onClick={() => void run(async () => { await sdk.models.setToken(modelEndpoint, modelKey); setModelKey(""); return "Credential stored. Inspect endpoint discovery status before selecting a model."; })}>Store endpoint key</button><button disabled={dirty || saving || !modelEndpoint} onClick={() => void run(() => sdk.models.clearToken(modelEndpoint))}>Clear endpoint key</button></div></>}
        {tab === "remote" && <><h2>Remote SSH</h2><p>Run the agent, its file/command tools and inference on an explicitly approved SSH host. The local service keeps authority and history. SSH is not SendBox isolation.</p>
          {jsonEditor("remote", "SSH target (null disables)")}
          <details><summary>Target configuration example</summary><pre>{JSON.stringify({ id: "my-ssh", name: "My SSH host", host: "replace-with-host.example", port: 22, user: "replace-with-ssh-user", hostKey: "ssh-ed25519 replace-with-verified-public-key", identityFile: "/absolute/local/path/to/private-identity", stateDir: "/absolute/private/remote-run-state", command: ["/absolute/remote/path/to/node26", "/absolute/remote/path/to/moguri/dist/remote-bridge.mjs"], allowCopilot: false, models: [] }, null, 2)}</pre></details>
          <p className="settings-warning">Verify the full public host key out of band. The identity stays on this machine; agent forwarding, tunnels and ambient SSH configuration are disabled. Install this exact Moguri build on the target. Setting allowCopilot grants short-lived model access to that verified host, never a refresh credential or your secret store.</p>
          <p>Set each project's canonical remotePath in Project settings. A localhost model endpoint belongs to the SSH host, not this Mac. Declare remote endpoints in models with the same explicit limits as Local models.</p>
          <div className="button-row"><button aria-label="Probe SSH target" disabled={dirty || saving || remoteBusy || !snapshot.settings.values.remote} onClick={() => void run(async () => { setRemoteBusy(true); try { await sdk.remote.probe(); } finally { try { setRemoteState((await sdk.remote.status()).remote); } finally { setRemoteBusy(false); } } })}>{remoteBusy ? "Probing..." : "Probe"}</button><button disabled={saving || remoteBusy} onClick={() => void reset("remote")}>Restore remote default</button></div>
          {remoteState && <p role="status">{remoteState.ready ? "Ready: " : "Not ready: "}{remoteState.diagnostic}</p>}
          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("remote.")).map((connection) => <p className="fine-print" key={connection.id}>{connection.name}: {connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</p>)}
          <h3>Remote endpoint credentials</h3><p className="fine-print">Keys bind to the verified SSH identity and exact model URL. A host-local key is never silently reused on Remote.</p>
          <label className="setting-field">Credential endpoint<select aria-label="Remote model credential endpoint" value={remoteEndpoint} onChange={(event) => { setRemoteEndpoint(event.target.value); setRemoteKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.remote?.models.filter((endpoint) => endpoint.enabled && endpoint.auth === "bearer").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<input aria-label="Remote model API key" type="password" autoComplete="off" maxLength={32768} value={remoteKey} onChange={(event) => setRemoteKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint || !remoteKey} onClick={() => void run(async () => { await sdk.remote.setToken(remoteEndpoint, remoteKey); setRemoteKey(""); return "Remote endpoint key stored in its explicit secret backend."; })}>Store endpoint key</button><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint} onClick={() => void run(() => sdk.remote.clearToken(remoteEndpoint))}>Clear endpoint key</button></div>
          <h3>Owned execution recovery</h3><p className="fine-print">An SSH disconnect requests cancellation, not proof of cleanup. Reconcile existing receipts without replaying work. A partial turn never becomes successful just because late usage arrives.</p>
          {snapshot.executions.length === 0 && <p className="fine-print">No remote runs yet.</p>}
          {snapshot.executions.slice(-16).reverse().map((execution) => <details key={execution.id}><summary>{execution.target.name} / {execution.status} / {execution.cleanup}</summary><p className="path">Run <code>{execution.id}</code></p><p>{execution.diagnostic ?? "Owned worker status recorded."}</p>
            <button disabled={remoteBusy || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(() => sdk.remote.reconcile(execution.id))}>Reconcile receipts</button>
            <label className="check-setting"><input type="checkbox" checked={remoteInspection === execution.id} onChange={(event) => setRemoteInspection(event.target.checked ? execution.id : "")} />I inspected this run's remote processes. This acknowledgement does not prove containment or cleanup.</label>
            <button disabled={remoteInspection !== execution.id || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(async () => { await sdk.remote.acknowledge(execution.id, true); setRemoteInspection(""); })}>Record inspection</button></details>)}
          <p className="fine-print">Review Remote MCP resources and separate access-forwarding grants under MCP gateway. Selecting Remote never grants MCP access. Explicit user consoles use their own captured SSH owner/root, not a Local shell or SendBox isolation. Repository-memory retrieval and transferred Local scripts remain unavailable.</p></>}
        {tab === "startup" && <><h2>New-session defaults</h2><p>Session overrides win over project, current-profile, shared global and factory values. Global preferences intentionally apply to every profile. Preferences never widen hard policy, and saving does not rewrite existing sessions.</p>
          {jsonEditor("startup", "Global and current-profile startup defaults")}
          {session && <button onClick={() => change("startup", { ...draft.startup, profile: structuredClone(session.controls) })}>Use current controls for this profile</button>}
          <details><summary>Available model IDs</summary>{snapshot.provider.models.map((model) => <p className="fine-print path" key={model.id}>{model.name}: <code>{model.id}</code></p>)}</details>
          <button onClick={() => void reset("startup")}>Restore profile startup defaults</button>
          <button disabled={dirty || saving || nestedDirty || !profileCatalog} onClick={() => void run(async () => { if (!profileCatalog) throw new Error("Load the actual global preference revision first."); await sdk.profiles.defaults({}, profileCatalog.globalDefaults.revision); return "Shared global startup preferences restored. Existing sessions and hard policy were preserved."; })}>Restore shared global defaults</button></>}
        {tab === "instructions" && <><h2>Global user guidance</h2><p>Applies across this profile's chats and projects, including project-free chats. Guidance cannot change hard permissions, authenticate a server or approve a tool.</p><label className="setting-field">User guidance<textarea aria-label="Global user guidance" className="json-editor short" value={draft.instructions} onChange={(event) => change("instructions", event.target.value)} /></label><button onClick={() => void reset("instructions")}>Restore guidance defaults</button></>}
        {tab === "notifications" && <><h2>Attention notifications</h2><p>Questions, pending approvals and completed/failed work use the shared service state. Reading a notification never answers or approves anything.</p>
          <label className="check-setting"><input type="checkbox" checked={draft.notifications.inApp} onChange={(event) => change("notifications", { ...draft.notifications, inApp: event.target.checked })} />Show in-app attention dots and icons</label>
          <label className="check-setting"><input type="checkbox" checked={draft.notifications.os} onChange={(event) => change("notifications", { ...draft.notifications, os: event.target.checked })} />Enable OS banners while Moguri desktop runs in the background</label>
          <label className="check-setting"><input type="checkbox" checked={draft.notifications.previewContent} onChange={(event) => change("notifications", { ...draft.notifications, previewContent: event.target.checked })} />Include session title and message preview in OS banners</label>
          <p className="settings-warning">OS banners are off by default and respect operating-system permissions/Do Not Disturb. Without content previews, banners use generic text. The OS may ask for permission when the first enabled banner appears. TUI indicators work without desktop; OS banners require it.</p></>}
        {tab === "project" && (project ? <ProjectSettingsPanel key={project.id} sdk={sdk} project={project} session={session?.projectId === project.id ? session : undefined} snapshot={snapshot} onDirty={setProjectDirty} openTerminal={openTerminal} openSession={openSession} /> : <p>Open a project to configure it.</p>)}
        {tab === "retention" && <><h2>Archived-session retention</h2><p>Off by default. Deletion stops owned work and removes session content while preserving independent project artifacts and external PRs. Diagnostic audit records remain.</p>
          <label className="check-setting"><input type="checkbox" checked={draft.retention.deleteArchived} onChange={(event) => change("retention", { ...draft.retention, deleteArchived: event.target.checked })} />Automatically delete archived sessions after the configured age</label>
          <label className="setting-field">Days<input aria-label="Archived retention days" type="number" min={1} max={3650} value={draft.retention.afterDays} onChange={(event) => change("retention", { ...draft.retention, afterDays: Number(event.target.value) })} /></label>
          <p className="settings-warning">Save explicitly to delegate deletion. Unconfirmed processes block cleanup. This does not erase external backups or close a PR.</p>
          <button disabled={!snapshot.settings.values.retention.deleteArchived} onClick={() => void run(() => sdk.command({ type: "retention.run" }))}>Run configured cleanup</button>
          <h3>Structured answers</h3><label className="check-setting"><input type="checkbox" checked={draft.artifacts.retainAnswers} onChange={(event) => change("artifacts", { retainAnswers: event.target.checked })} />Retain actual answers as independent artifacts</label>
          <p className="fine-print">On by default. Source question/answer events remain canonical; model or delegated answers never become user instructions or tool permission.</p>
          <button onClick={() => void run(() => sdk.settings.reset("artifacts", snapshot.settings.revision))}>Restore answer-retention default</button></>}
        {tab === "cache" && <DependencyCachePanel key={`${project?.id}-${session?.workspaceId}`} sdk={sdk} project={project} workspaceId={session?.projectId === project?.id ? session?.workspaceId ?? undefined : undefined} />}
        {error && <div className="notice error" role="alert"><span>{error}</span><button onClick={reload}>Reload current settings</button></div>}
        {session?.pendingApproval && <p className="settings-warning">The main session needs an approval. <button className="quiet" onClick={onBack}>Review exact action</button></p>}
        {tab === "appearance" && <><h2>Appearance</h2><p>Dark is Moguri's factory theme. This preference is shared by SDK clients; desktop resolves System against the operating system.</p>
          <label className="setting-field">Theme<select aria-label="Theme" value={draft.appearance.theme} onChange={(event) => change("appearance", { theme: event.target.value as UserSettings["appearance"]["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <button onClick={() => void reset("appearance")}>Restore appearance defaults</button></>}
        {tab === "systemPrompt" && <><h2>System prompt</h2><p>These are Moguri's actual model instructions, not a desktop-only copy. Edits apply to new turns; running turns keep their recorded instruction snapshot.</p>
          <p className="settings-warning">{SYSTEM_PROMPT_WARNING}</p>
          <label className="setting-field">Editable system prompt<textarea aria-label="Editable system prompt" className="prompt-editor" value={draft.systemPrompt} onChange={(event) => change("systemPrompt", event.target.value)} disabled={saving} spellCheck={false} /></label>
          <label className="check-setting"><input type="checkbox" checked={risk} onChange={(event) => setRisk(event.target.checked)} />I understand this can break functionality. Hard permissions cannot be overridden.</label>
          <div className="button-row"><button onClick={() => void reset("systemPrompt")}>Restore default system prompt</button><button onClick={() => void run(async () => { const result = await sdk.prompt.preview(session?.id); setPreview(result.effective); })}>View effective committed prompt</button></div>
          {preview && <details open><summary>Effective committed instructions, including protected execution guidance and approved project knowledge</summary><pre>{preview}</pre></details>}</>}
        {tab === "permissions" && <><h2>Guardrails and tool guidance</h2><p>Manual asks unless you explicitly preapprove a bounded tool or exact command. Deny rules win. Guided displays model advice but still needs you; Autopilot grants nothing beyond these rules.</p>
          {jsonEditor("permissions", "Tool and exact-command permissions")}
          <p className="fine-print">A tool rule has id, tool, decision (ask/allow/deny), and a project-relative pathPrefix. Shell grants must name the exact command; blanket shell/wildcard grants are rejected. MCP annotations never count as approval.</p>
          <h3>SendBox</h3><p>Sandbox is a real execution boundary, not a badge. Missing or unqualified prerequisites block protected turns, without Local fallback.</p>
          {jsonEditor("sandbox", "SendBox configuration")}
          <p className="fine-print">Save exact canonical 0.2.3 release/bundle/key paths and hashes, immutable image/worker/bridge pins, bounded resources and every reviewed DNS host. Use configPath null for the managed deny-first policy. Aliases are never inferred or granted; Copilot access is a separate opt-in.</p>
          <p className="fine-print" role="status">{snapshot.capabilities.find((capability) => capability.env === "Sandbox")?.reason}</p>
          <label className="check-setting"><input type="checkbox" checked={sandboxReviewed} disabled={dirty || saving || sandboxBusy} onChange={(event) => setSandboxReviewed(event.target.checked)} />I reviewed these committed native artifacts, image and network hosts. Verification may start one model-free VM.</label>
          <div className="button-row"><button type="button" disabled={dirty || saving || sandboxBusy || !sandboxReviewed || !snapshot.policy.allowedEnvs.includes("Sandbox")} onClick={() => {
            setSandboxBusy(true);
            void run(async () => { await sdk.sandbox.probe(); return sdk.sandbox.status(); }).finally(() => setSandboxBusy(false));
          }}>{sandboxBusy ? "Verifying original native guest..." : "Verify reviewed Sandbox"}</button>
            <button type="button" disabled={sandboxBusy} onClick={() => void run(() => sdk.sandbox.status())}>Check Sandbox readiness</button><button type="button" className="quiet" disabled={sandboxBusy} onClick={() => void reset("permissions")}>Restore permission defaults</button></div>
          <h3>Allowed execution environments</h3><p>Changing global allowed-env policy is user-only. Excluding Local blocks new work; already-running Local turns may finish under their recorded revision.</p>
          <select aria-label="Global allowed environments" value={snapshot.policy.allowedEnvs.includes("Local") ? "all" : "protected"} onChange={(event) => void run(() => sdk.command({ type: "policy.set", allowedEnvs: event.target.value === "all" ? ["Local", "Sandbox", "Remote"] : ["Sandbox", "Remote"] }))}><option value="all">Allow Local, Sandbox and Remote</option><option value="protected">Require Sandbox or Remote</option></select>
          <p className="fine-print">Resetting ordinary settings does not silently widen this separate security policy.</p></>}
        {tab === "memory" && <><h2>Repository memory</h2><p>A persistent lexical-vector index and import/symbol graph, isolated by profile and actual repository identity. No hosted embedding provider or extra model key. Changed or ignored sources are marked stale, never silently treated as current.</p>
          <label className="check-setting"><input type="checkbox" checked={draft.memory.enabled} onChange={(event) => change("memory", { ...draft.memory, enabled: event.target.checked })} />Enable explicit repository indexing and retrieval</label>
          <label className="check-setting"><input type="checkbox" checked={draft.memory.useInContext} onChange={(event) => change("memory", { ...draft.memory, useInContext: event.target.checked })} />Allow bounded retrieved source snippets to enter model context</label>
          <p className="fine-print">Source capture and freshness checks follow the selected session's {memoryEnv} root. Without a session, project actions are explicitly Local. The derived text/vector cache stays on the control plane; selected snippets may enter the chosen model's context. Protected/ignored paths are excluded. Save before indexing; opening this page never scans or probes a host.</p>
          {memoryEnv === "Remote" && <p className="settings-warning">Pinned SSH repository memory, not a Local index or SendBox isolation. Inspect the bound index for its actual peer/root/build. Missing or changed hosts fail without fallback.</p>}
          <div className="button-row"><button disabled={memoryBlocked} onClick={() => void runMemory(() => session ? sdk.memory.indexSession(session.id) : sdk.memory.index(project!.id))}>Index {memoryEnv} repository</button>
            <button disabled={memoryBlocked || !session} onClick={() => void runMemory(() => sdk.memory.state(session!.id))}>Inspect bound index</button>
            <button disabled={memoryBlocked} onClick={() => void runMemory(() => session ? sdk.memory.graphSession(session.id) : sdk.memory.graph(project!.id))}>Read import/symbol graph</button></div>
          <label className="setting-field">Search repository memory<input value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={memoryBlocked || !input} onClick={() => void runMemory(() => session ? sdk.memory.searchSession(session.id, input) : sdk.memory.search(project!.id, input))}>Search vectors</button>
          {memoryJobs.map((job) => <div className="call-record" key={job.id}><strong>{job.memory?.target.env ?? "Local"} repository index / {job.status}</strong>
            <p>{["running", "waiting_input"].includes(job.status) ? job.progress : job.status === "completed" ? "Complete captured index published. Inspect its binding and source digest." : "Index settled. Inspect its outcome and the last complete bound cache."}</p>{job.error && <p className="inline-error">{job.error}</p>}
            {job.memory && <small className="path">{job.memory.target.root}</small>}
            {["running", "waiting_input"].includes(job.status) && <button onClick={() => void runMemory(() => sdk.jobs.cancel(job.id))}>Stop index {job.id.slice(0, 8)}</button>}
          </div>)}
          <h3>Coding-style knowledge</h3><p>Save only non-sensitive project conventions. Knowledge outlives a session. Model observations require a proposal and your approval; they are never labeled user-authored facts.</p>
          <button disabled={!project || !input} onClick={() => void run(() => sdk.memory.remember(project!.id, input))}>Remember this project convention</button></>}
        {tab === "subagents" && <><h2>Optional subagents</h2><p>Off by default. When enabled, a depth-one child uses the same fixed model and approved context. It is read-only/tool-less, has separate usage, and belongs to the same cancellation tree.</p>
          <label className="check-setting"><input type="checkbox" checked={draft.subagents.enabled} onChange={(event) => change("subagents", { ...draft.subagents, enabled: event.target.checked })} />Enable optional read-only subagents</label>
          <label className="setting-field">Maximum parallel children<select value={draft.subagents.maxParallel} onChange={(event) => change("subagents", { ...draft.subagents, maxParallel: Number(event.target.value) })}><option value={1}>1</option><option value={2}>2</option></select></label>
          <label className="setting-field">Read-only assignment<textarea value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={!session || !input || !snapshot.settings.values.subagents.enabled} onClick={() => void run(() => sdk.subagents.run(session!.id, input))}>Run bounded subagent</button></>}
        {(["skills", "scripts", "plugins"] as const).includes(tab as "skills" | "scripts" | "plugins") && <><h2>{tab === "skills" ? "Standard skills" : tab === "scripts" ? "Foundational and approved scripts" : "Plugins"}</h2>
          <p>{tab === "skills" ? "Import standard SKILL.md front matter and instructions. A skill grants no tool permissions." : tab === "scripts" ? "Built-in grep_logs, fetch_page, search_memory and memory_graph are exposed through the single internal MCP, without generated one-off scripts." : "Version-1 Moguri plugin manifests bundle declarative standard skills. Importing a plugin does not execute a JavaScript entrypoint or install dependencies."}</p>
          {tab !== "scripts" && <><label className="setting-field">Local {tab === "skills" ? "SKILL.md" : "plugin manifest"} path<input value={input} onChange={(event) => setInput(event.target.value)} placeholder={tab === "skills" ? "/path/to/SKILL.md" : "/path/to/moguri-plugin.json"} /></label><button disabled={!project || !input} onClick={() => void run(() => tab === "skills" ? sdk.capabilities.importSkill(project!.id, input) : sdk.capabilities.importPlugin(project!.id, input))}>Import disabled {tab === "skills" ? "skill" : "plugin"}</button></>}
          {registry.map((entry) => <section className="capability-row" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.description}</small><code>{entry.source} / {entry.contentDigest.slice(0, 12)}</code></div><button onClick={() => void run(() => sdk.capabilities.content(entry.id))}>View source</button><button onClick={() => void run(() => sdk.capabilities.toggle(entry.id, !entry.enabled, entry.revision))}>{entry.enabled ? "Disable" : "Enable"}</button></section>)}
          {tab === "scripts" && <p className="settings-warning">Approved custom scripts execute as Local host code, not in a fictional sandbox. Review the full source, enable it explicitly, and approve each call. Use only scripts you trust.</p>}
          <h3>Optional evolution</h3><label className="check-setting"><input type="checkbox" checked={draft.evolution.enabled} onChange={(event) => change("evolution", { enabled: event.target.checked })} />Allow model-proposed skills, scripts and style knowledge for human review</label><p className="fine-print">Off by default. Nothing applies itself; approval installs disabled content and enabling/execution remain separate actions.</p>
          {pending.map((item) => <div className="proposal-row" key={item.id}><strong>{item.name}</strong><span>{item.kind} / {item.actor === "model" ? "Model suggestion" : "User-authored"}</span><button onClick={() => void run(async () => { const content = await sdk.capabilities.proposal(item.id); setProposal({ id: item.id, content: content.content, digest: content.digest }); setReviewed(false); })}>Review full proposal</button></div>)}
          {proposal && <section className="proposal-review"><h3>Review exact proposed content</h3><pre>{proposal.content}</pre><code>SHA-256 {proposal.digest}</code><label className="check-setting"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source. Approval does not grant execution permissions.</label><div className="button-row"><button disabled={!reviewed} onClick={() => void run(() => sdk.capabilities.decide(proposal.id, true, proposal.digest))}>Approve disabled capability</button><button onClick={() => void run(() => sdk.capabilities.decide(proposal.id, false, proposal.digest))}>Reject</button></div></section>}</>}
        {tab === "mcpServers" && <><h2>One native MCP gateway</h2><p>Discover configured MCPs and their tools on demand, check auth, request a call and read result pages. Models do not receive every schema up front and cannot change credentials, approve themselves or install a server.</p>
          {session?.controls.env === "Remote" ? <details><summary>Configure backend MCP servers</summary>{jsonEditor("mcpServers", "Configured MCP servers")}</details> : jsonEditor("mcpServers", "Configured MCP servers")}
          <p className="fine-print">Save configuration first. Supported transports: stdio or Streamable HTTP. OAuth uses an explicit authorization link with PKCE and resource-bound keychain credentials. Raw bearer credentials stay in the keychain, never settings.</p>
          <label className="setting-field">Server<select aria-label="Server" value={serverId} onChange={(event) => { setServerId(event.target.value); setTools([]); setSelectedTool(null); }}><option value="builtin">Moguri internal scripts</option>{configuredServers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}{retainedServers.map((id) => <option key={id} value={id}>Stored Remote grant: {id}</option>)}</select></label>
          {session?.controls.env === "Remote" && <RemoteMcpPanel key={`${snapshot.profileId}:${session.id}:${serverId}`} sdk={sdk} snapshot={snapshot} session={session} serverId={serverId} disabled={dirty || saving || nestedDirty} />}
          <div className="button-row"><button onClick={() => void run(() => sdk.mcp.servers(session?.id))}>List configured servers</button><button disabled={dirty || saving || serverId !== "builtin" && !selectedServer} onClick={() => void run(async () => { const result = await sdk.mcp.tools(serverId, "", 0, session?.id); setTools(result.tools); return result; })}>Discover tools</button><button disabled={serverId !== "builtin" && !selectedServer} onClick={() => void run(() => sdk.mcp.auth(serverId, session?.id))}>Check credential status</button></div>
          {oauthSelected && <McpOAuthPanel key={serverId} sdk={sdk} serverId={serverId} sessionId={session?.id} snapshot={snapshot} />}
          {serverId !== "builtin" && !oauthSelected && <><label className="setting-field">Bearer credential (not saved in settings)<input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label><div className="button-row"><button disabled={!token} onClick={() => void run(async () => { await sdk.mcp.setToken(serverId, token, session?.id); setToken(""); return "Credential stored in the OS keychain."; })}>Store in keychain</button><button onClick={() => void run(() => sdk.mcp.clearToken(serverId, session?.id))}>Remove credential</button></div></>}
          {tools.map((tool) => <button className="tool-discovery-row" key={tool.name} onClick={() => setSelectedTool(tool)}><strong>{tool.name}</strong><span>{tool.description}</span></button>)}
          {selectedTool && <><h3>{selectedTool.name}</h3>{selectedTool.scope && <p className="fine-print path">Remote SSH / {selectedTool.scope.root}. This catalog cannot authorize a Local or different-resource call.</p>}<pre>{JSON.stringify(selectedTool.inputSchema, null, 2)}</pre><label className="setting-field">Exact JSON arguments<textarea className="json-editor short" aria-label="Exact MCP JSON arguments" value={argumentsJson} onChange={(event) => setArgumentsJson(event.target.value)} /></label><button disabled={dirty || saving || !session || !!session.turnId || session.kind !== "agent" || session.mode !== "agent" || session.pendingMode === "read-only"} onClick={() => void run(async () => { const args: unknown = JSON.parse(argumentsJson); if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object."); return sdk.mcp.call(session!.id, selectedTool.serverId, selectedTool.name, args as Record<string, unknown>, selectedTool.digest); })}>Request exact call in main session</button><p className="fine-print">Return to the main session to approve. It must be idle; no second agent is allowed to seize an active turn.</p></>}
          <pre>moguri mcp --session {session?.id ?? "SESSION_ID"}</pre></>}
        {tab === "voice" && <><h2>Local voice dictation</h2><p>Native NVIDIA Nemotron 3.5 ASR. Download the model once yourself; audio never goes to an ASR cloud or the Copilot provider.</p>
          <p>{voice?.diagnostic ?? "Reading local runtime status..."}</p><p className="fine-print">NVIDIA documents 40 locales: 19 ready, 13 broad coverage, 8 adaptation-only. The last group needs fine-tuning and is not advertised as ready.</p>
          <label className="setting-field">Language<select value={draft.voice.language} onChange={(event) => change("voice", { ...draft.voice, language: event.target.value })}><option value="auto">Automatic language detection</option>{voice?.languageLocales.map((locale) => <option key={locale.code} value={locale.code} disabled={locale.tier === "adaptation"}>{locale.code} ({locale.tier})</option>)}</select></label>
          <label className="check-setting"><input type="checkbox" checked={acceptLicense} onChange={(event) => setAcceptLicense(event.target.checked)} />I reviewed OpenMDW-1.1 and approve the {voice ? Math.ceil(voice.bytes / 1024 / 1024) : 708} MiB local model download.</label>
          <div className="button-row"><button className="quiet" onClick={() => void run(() => window.moguri.openExternal("https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b"))}>Model card and license</button><button disabled={!acceptLicense || voice?.modelReady} onClick={() => void run(() => sdk.voice.download(true))}>Download model once</button></div>
          <h3>Dictate into this session</h3><div className="button-row"><button disabled={!session || !voice?.modelReady || !voice.runtimeReady || Boolean(activeVoice)} onClick={() => void run(async () => { if (!await window.moguri.microphonePermission()) throw new Error("Microphone permission was denied. No audio was recorded."); return sdk.voice.record(session!.id); })}>Start local microphone</button><button disabled={!activeVoice || activeVoice.kind !== "voice.record"} onClick={() => void run(() => sdk.voice.stop(activeVoice!.id))}>Stop and transcribe</button>{activeVoice && <button onClick={() => void run(() => sdk.jobs.cancel(activeVoice.id))}>Cancel and discard</button>}</div>
          <label className="setting-field">Or use a local WAV path<input value={input} onChange={(event) => setInput(event.target.value)} placeholder="/path/to/recording.wav" /></label><button disabled={!session || !input || !voice?.modelReady} onClick={() => void run(() => sdk.voice.transcribe(session!.id, input))}>Transcribe local WAV</button>
          {completedVoice && <div className="button-row"><button onClick={() => void run(() => sdk.mcp.readResult(completedVoice.id))}>Review transcript</button><button disabled={!session} onClick={() => void run(() => sdk.voice.insert(session!.id, completedVoice.id, session!.draft.revision))}>Insert into saved draft, never send</button></div>}
          <p className="fine-print">Microphone access is user-initiated and may require OS permission. Recording is bounded to two minutes. A conflicting draft is preserved rather than overwritten.</p></>}
        {snapshot.jobs.length > 0 && <details className="settings-jobs"><summary>Capability jobs and retained results</summary>{snapshot.jobs.slice(-12).reverse().map((job) => <div className="job-row" key={job.id}><div><strong>{job.kind}</strong><small>{job.status}: {job.error ?? job.progress}</small></div>{["running", "waiting_input"].includes(job.status) && <button onClick={() => void run(() => sdk.jobs.cancel(job.id))}>Cancel</button>}{job.resultDigest && <button onClick={() => void run(() => sdk.mcp.readResult(job.id))}>Read result</button>}</div>)}</details>}
        {output && <details className="settings-result" open><summary>SDK response</summary><pre>{output}</pre></details>}
      </div></div>
  </section>;
}
