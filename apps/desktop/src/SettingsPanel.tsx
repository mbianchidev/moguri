import { SettingsAction, SettingsCommitInput, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { automaticCompactionPolicy, defaultSettings, builtinClashNotice, builtinSlashClash, defaultCompactionSettings, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, RETENTION_DAY_CHOICES, BRANCH_PREFIX_PATTERN, DEFAULT_SESSION_LIFECYCLE, DEFAULT_PR_AUTOMATION, defaultClaudeAgentSettings, defaultCodexAgentSettings, isAgentHarnessModel, parse, appearanceColors, themePalettes, shortcutLabel, voiceShortcutMode, GUIDANCE_GROUPS, readinessGuidance, routingModelReady, routingWorkingWindow, VerbositySchema, KupoModeSchema, kupoModes, SettingsSchema, AutomaticKupoSettingsSchema, CompoundSettingsSchema, defaultKupoSettings, defaultKupoCompaction, DEFAULT_ROUTER_PROMPT, SYSTEM_PROMPT_WARNING, effectiveToolPreferences, toolMethods, type ArtifactEditorRequest, type ControlDefaults, type Guidance, type ThemeMode, type ThemeColor, type MoguriSdk, type Project, type Session, type SettingsSection, type Snapshot, type UserSettings, type VoiceStatus, type VoiceModelInspection, type VoiceModelDiscovery, type McpToolInfo, type RemoteReadiness, type ProfileCatalog, type ModelInfo, type LinearConnection } from "../../../packages/sdk/src/index.ts";
import { DependencyCachePanel } from "./DependencyCachePanel.tsx";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel.tsx";
import { PrAutomationDefaults } from "./PrAutomationSettings.tsx";
import { RepositoryImportPanel } from "./RepositoryImportPanel.tsx";
import { Icon } from "./Icon.tsx";
import { McpOAuthPanel } from "./McpOAuthPanel.tsx";
import { RemoteMcpPanel } from "./RemoteMcpPanel.tsx";
import { BudgetLimitEditor } from "./BudgetControls.tsx";
import { CompoundLineageReview } from "./CompoundLineageReview.tsx";
import { useDecisionStatus } from "./DecisionPanel.tsx";
import { KnowledgePanel } from "./KnowledgePanel.tsx";
import { ExtensionPanel } from "./ExtensionPanel.tsx";
import { GitHubWorkflowPanel } from "./GitHubWorkflowPanel.tsx";
import { LinearWorkflowPanel } from "./LinearWorkflowPanel.tsx";
import { ProfileSwitcher } from "./ProfileSwitcher.tsx";
import { ProviderConnect } from "./ProviderConnect.tsx";
import { HostedProviderConnect } from "./HostedProviderConnect.tsx";
import { ProviderCard, providerStatus } from "./ProviderLogo.tsx";
import { SessionManagement } from "./SessionManagement.tsx";
import { GitHubConnectionPanel, LinearConnectionPanel } from "./IntegrationConnections.tsx";
import { useDictation, useDictationTranscript } from "./useDictation.ts";
import { listMicrophones, type MicrophoneChoice } from "./browser-audio.ts";
import { ShortcutEditor } from "./ShortcutEditor.tsx";
import { NotificationSettings } from "./NotificationSettings.tsx";
import { ApplicationSettings } from "./ApplicationSettings.tsx";
import { OtlpSettings } from "./OtlpSettings.tsx";
import { StorageSettings } from "./StorageSettings.tsx";
import { VirtualDiskSettings } from "./VirtualDiskSettings.tsx";
import { UpdateSettings } from "./UpdateSettings.tsx";
import { isTabbedGroup, searchSettings, settingsGroupOf, type SettingsTab } from "./settings-catalog.ts";
import { SandboxSetupPanel } from "./SandboxSetupPanel.tsx";
import { SandboxPanel } from "./SandboxPanel.tsx";
import { ArtifactPanel } from "./ArtifactPanel.tsx";
import { CandidatePanel } from "./CandidatePanel.tsx";
import { SettingsFieldsProvider, SettingsHelp } from "./SettingsFields.tsx";
import { SkillGatewaySettings } from "./SkillGatewaySettings.tsx";
import { SkillAdmissionsPanel } from "./SkillAdmissionsPanel.tsx";
import { SkillPublishersSettings } from "./SkillPublishersSettings.tsx";
import { KupoModelProfiles } from "./KupoModelProfiles.tsx";
import { ProviderPricing } from "./ProviderPricing.tsx";
import { ModelAvailabilityPanel } from "./ModelAvailabilityPanel.tsx";
import { WebAllowlistPanel } from "./WebAllowlistPanel.tsx";
import { PolicyHint, policyLocations, type PolicyFocusRequest } from "./PolicyHint.tsx";
import { ReorderList } from "./ReorderList.tsx";
import { Alert } from "./Alert.tsx";
import { StainlessSettingsPanel } from "./StainlessPanel.tsx";
import { PathField, localPath } from "./PathField.tsx";

export type { SettingsTab } from "./settings-catalog.ts";
const modelBoundary = (model: ModelInfo) => model.endpointBoundary === "loopback" ? "execution-host loopback" : "network/hosted";
const linearConnectionLabel = (connection: LinearConnection) => connection.account ? "Connected" : connection.credential === "configured" ? "Key saved" : "Not connected";
/** Sections whose choices save as soon as they change. Written values (text, numbers, JSON) keep an explicit Save. */
type AutomaticSection = "scriptReview" | "compaction" | "appearance" | "memory" | "subagents" | "evolution" | "voice" | "retention" | "artifacts" | "notifications" | "kupo" | "permissions" | "lifecycle" | "shortcuts" | "sandboxManagement" | "budgets" | "toolPreferences" | "interactions" | "claudeAgent" | "codexAgent" | "chatTitles" | "wrapUp" | "prAutomation";
export function SettingsPanel({ sdk, snapshot, session, project, configurationProjectId, selectConfigurationProject, initialTab = "general", policyFocus = null, artifactRequest = null, onArtifactRequestHandled = () => {}, onBack, onUnsavedChange, openTerminal, openSession, onSwitchProfile, prepareMaintenance }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; project?: Project; initialTab?: SettingsTab; onBack: () => void; onUnsavedChange: (unsaved: boolean) => void; openTerminal: () => void; openSession: (id: string) => void;
  configurationProjectId: string | null; selectConfigurationProject: (id: string) => void;
  onSwitchProfile: (id: string) => Promise<void>;
  prepareMaintenance: () => Promise<void>;
  policyFocus?: PolicyFocusRequest | null;
  artifactRequest?: ArtifactEditorRequest | null; onArtifactRequestHandled?: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState<ThemeMode>("dark");
  const [profilesExpanded, setProfilesExpanded] = useState(true), [profilesDirty, setProfilesDirty] = useState(false);
  const [sessionsDirty, setSessionsDirty] = useState(false);
  const [integrationDirty, setIntegrationDirty] = useState(false);
  const [soundsBusy, setSoundsBusy] = useState(false);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [exportDirty, setExportDirty] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [webBusy, setWebBusy] = useState(false), [webDirty, setWebDirty] = useState(false);
  const [sql, setSql] = useState<Awaited<ReturnType<MoguriSdk["integrations"]["sqlStatus"]>>["connection"] | null>(null);
  const sqlGeneration = useRef(0);
  const groups = searchSettings(search), searching = search.trim().length > 0;
  const activeGroup = settingsGroupOf(tab), tabbed = isTabbedGroup(activeGroup);
  const groupTabs = useRef(new Map<string, SettingsTab>());
  useEffect(() => { groupTabs.current.set(activeGroup.label, tab); }, [tab]);
  const [githubStatus, setGithubStatus] = useState("Not checked"), [linearStatus, setLinearStatus] = useState("Not checked");
  useEffect(() => { setGithubStatus("Not checked"); setLinearStatus("Not checked"); }, [sdk]);
  const integrationsOpen = activeGroup.label === "Integrations";
  useEffect(() => {
    if (!integrationsOpen) return;
    let current = true;
    void sdk.linear.connection().then((value) => { if (current) setLinearStatus(linearConnectionLabel(value.connection)); }, () => { if (current) setLinearStatus("Not checked"); });
    return () => { current = false; };
  }, [sdk, integrationsOpen]);
  const decisions = useDecisionStatus(sdk, session, snapshot, tab === "decisions");
  const [draft, setDraft] = useState(() => structuredClone(snapshot.settings.values));
  const latestDraft = useRef(draft); latestDraft.current = draft;
  const [committed, setCommitted] = useState(() => structuredClone(snapshot.settings.values));
  const [raw, setRaw] = useState<Record<string, string>>({});
  const dirty = Object.keys(raw).length > 0 || JSON.stringify(draft) !== JSON.stringify(committed);
  const [projectDirty, setProjectDirty] = useState(false);
  const [repositoriesDirty, setRepositoriesDirty] = useState(false);
  const configurationSelect = useRef<HTMLSelectElement>(null);
  const registeredConfigurationProject = snapshot.projects.find((value) => value.id === configurationProjectId);
  const retainedConfigurationProject = useRef<{ sdk: MoguriSdk; id: string | null; project?: Project }>({ sdk, id: configurationProjectId });
  if (retainedConfigurationProject.current.sdk !== sdk || retainedConfigurationProject.current.id !== configurationProjectId) {
    retainedConfigurationProject.current = { sdk, id: configurationProjectId };
  }
  if (registeredConfigurationProject) retainedConfigurationProject.current.project = registeredConfigurationProject;
  const configurationProject = registeredConfigurationProject ?? retainedConfigurationProject.current.project;
  const [discardedConfigurationProject, setDiscardedConfigurationProject] = useState<string | null>(null);
  const [resourceDirty, setResourceDirty] = useState(false), [resourceSessionId, setResourceSessionId] = useState(session?.id ?? "");
  const resourceSession = snapshot.sessions.find((value) => value.id === resourceSessionId);
  const [profileBudgetDirty, setProfileBudgetDirty] = useState(false), [globalBudgetDirty, setGlobalBudgetDirty] = useState(false);
  const [lineageDraftDirty, setLineageDirty] = useState(false), [lineageDraftBusy, setLineageBusy] = useState(false);
  const [modelProfileDirty, setModelProfileDirty] = useState(false), [modelProfileBusy, setModelProfileBusy] = useState(false);
  const lineageDirty = lineageDraftDirty || modelProfileDirty, lineageBusy = lineageDraftBusy || modelProfileBusy;
  const [risk, setRisk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capabilityBusy, setCapabilityBusy] = useState(false), [capabilityProgress, setCapabilityProgress] = useState("");
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null);
  const capabilityPending = useRef(false);
  const [sandboxBusy, setSandboxBusy] = useState(false), [sandboxReviewed, setSandboxReviewed] = useState(false);
  const [sandboxDraftDirty, setSandboxDraftDirty] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState("");
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [modelReview, setModelReview] = useState<{ jobId: string; inspection: VoiceModelInspection | null } | null>(null);
  const [modelPath, setModelPath] = useState(""), [modelSearch, setModelSearch] = useState<{ discovery: VoiceModelDiscovery; installed: boolean } | null>(null);
  const [searchingModels, setSearchingModels] = useState(false);
  const dictation = useDictation(sdk, session, snapshot, { active: tab === "voice" });
  const [microphones, setMicrophones] = useState<MicrophoneChoice[]>([]), [devicesBusy, setDevicesBusy] = useState(false);
  const deviceRequest = useRef<AbortController | null>(null);
  const [runtime, setRuntime] = useState<Awaited<ReturnType<MoguriSdk["runtime"]["status"]>>["runtime"] | null>(null);
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
  const committedValues = useRef(committed);
  const ownSave = useRef(false);
  const memoryKey = JSON.stringify([sdk.profileId, project?.id, session?.id, session?.controls.env, session?.workspaceId,
    snapshot.projectConfigurations.find((configuration) => configuration.projectId === project?.id)?.revision, snapshot.settings.revision, snapshot.policy.revision]);
  const memoryScope = useRef({ sdk, key: memoryKey }); memoryScope.current = { sdk, key: memoryKey };
  const memoryEnv = session?.controls.env ?? "Local";
  const memoryBlocked = !project || !snapshot.settings.values.memory.enabled || dirty || saving || memoryEnv === "Sandbox";
  const memoryJobs = snapshot.jobs.filter((job) => job.kind === "memory.index" && job.projectId === project?.id &&
    (!job.sessionId || job.sessionId === session?.id)).slice(-4).reverse();
  useEffect(() => { setTab(initialTab); setOutput(""); setInput(""); }, [initialTab]);
  useEffect(() => {
    if (!policyFocus || tab !== policyLocations[policyFocus.target].tab) return;
    setSearch("");
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(policyLocations[policyFocus.target].heading);
      target?.scrollIntoView({ block: "start" }); target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [policyFocus?.id, tab]);
  useEffect(() => { if (tab === "memory") { setOutput(""); setError(""); } }, [memoryKey, tab]);
  const nonWebNestedDirty = projectDirty || repositoriesDirty || profileBudgetDirty || globalBudgetDirty || lineageDirty || lineageBusy || modelProfileDirty || modelProfileBusy || profilesDirty || sessionsDirty || integrationDirty || soundsBusy || applicationBusy || modelsBusy || capabilityBusy;
  const otherNestedDirty = nonWebNestedDirty || webBusy || webDirty;
  const nestedDirty = otherNestedDirty || storageBusy || updateBusy || sandboxDraftDirty || resourceDirty || exportDirty;
  const selectTab = (next: SettingsTab): boolean => {
    if (nestedDirty) { setError("Save or reload this settings edit before changing sections."); return false; }
    setTab(next); setOutput(""); setInput(""); return true;
  };
  useEffect(() => { sqlGeneration.current++; setSql(null); }, [sdk, JSON.stringify(committed.integrations)]);
  useEffect(() => { onUnsavedChange(dirty || saving || sandboxBusy || devicesBusy || nestedDirty); return () => onUnsavedChange(false); }, [dirty, saving, sandboxBusy, devicesBusy, nestedDirty, onUnsavedChange]);
  useEffect(() => () => deviceRequest.current?.abort(), [sdk, tab]);
  useEffect(() => {
    setPreview("");
    setSandboxReviewed(false);
    if (ownSave.current || baseRevision.current === snapshot.settings.revision) return;
    if (!dirty) {
      baseRevision.current = snapshot.settings.revision; committedValues.current = snapshot.settings.values;
      setCommitted(structuredClone(snapshot.settings.values)); setDraft(structuredClone(snapshot.settings.values)); setRaw({});
    }
    else if (baseRevision.current !== snapshot.settings.revision) setError("Another client changed settings. Your edit is preserved. Reload before applying it.");
  }, [snapshot.settings.revision, saving]);
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
  }, [tab, snapshot.settings.values.voice.enabled, snapshot.settings.values.voice.model?.sha256, snapshot.settings.values.voice.model?.trustedAt,
    snapshot.jobs.filter((job) => ["voice.download", "voice.disable", "voice.prepare", "voice.capture", "voice.record", "voice.transcribe"].includes(job.kind) && job.status !== "running").length]);
  const reviewJob = modelReview ? snapshot.jobs.find((job) => job.id === modelReview.jobId) : undefined;
  useEffect(() => {
    if (!modelReview || modelReview.inspection || reviewJob?.status !== "completed") return;
    let current = true;
    void sdk.voice.inspection(modelReview.jobId).then((inspection) => { if (current) setModelReview((value) => value?.jobId === modelReview.jobId ? { ...value, inspection } : value); },
      (failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : "The model review could not be read. Nothing was trusted."); });
    return () => { current = false; };
  }, [sdk, modelReview, reviewJob?.status]);
  const reviewModel = (path: string) => void run(async () => {
    const result = await sdk.voice.inspectModel(path);
    if (!result.id) throw new Error("The model review was not acknowledged. Nothing was trusted.");
    setModelReview({ jobId: result.id, inspection: null });
  });
  /** Searches the default caches (no path) or one typed/chosen file or folder. A single usable file goes straight to review. */
  const findModels = (path?: string) => void run(async () => {
    setSearchingModels(true);
    try {
      const discovery = await sdk.voice.discoverModels(path === undefined ? undefined : localPath(path));
      const target = discovery.searched[0];
      if (path !== undefined && !target?.found) throw new Error("Nothing exists at that path. Check it and try again.");
      if (path !== undefined && target?.kind === "file") {
        const model = discovery.models[0];
        if (!model) throw new Error("This file isn't a speech model Moguri can use. Choose a streaming GGUF such as Nemotron, Parakeet or Moonshine.");
        if (model.status === "unsupported") throw new Error(model.reason ?? "This model can't stream dictation.");
        setModelSearch(null); reviewModel(model.path); return;
      }
      setModelSearch({ discovery, installed: path === undefined });
    } finally { setSearchingModels(false); }
  });
  useEffect(() => { if (tab === "remote") void run(async () => { setRemoteState((await sdk.remote.status()).remote); }); }, [tab, snapshot.settings.revision]);
  useEffect(() => {
    if (tab !== "retention") return;
    let current = true;
    const load = () => { void sdk.runtime.status().then((value) => { if (current) setRuntime(value.runtime); })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Runtime status is unavailable. No awake state was inferred."); }); };
    load(); const timer = setInterval(load, 3000);
    return () => { current = false; clearInterval(timer); };
  }, [sdk, tab, snapshot.settings.revision]);
  useEffect(() => { if (tab === "budgets" || tab === "startup") void run(async () => { setProfileCatalog((await sdk.profiles.list()).catalog); }); }, [tab, snapshot.profileCatalogRevision]);
  const change = <K extends SettingsSection>(section: K, value: UserSettings[K]) => setDraft((draft) => ({ ...draft, [section]: value }));
  const sectionDirty = (section: SettingsSection) => raw[section] !== undefined || JSON.stringify(draft[section]) !== JSON.stringify(committed[section]);
  const reload = () => {
    baseRevision.current = snapshot.settings.revision; committedValues.current = snapshot.settings.values;
    setCommitted(structuredClone(snapshot.settings.values)); setDraft(structuredClone(snapshot.settings.values)); setRaw({}); setRisk(false); setError("");
  };
  const write = async (values: UserSettings, saved: (settings: UserSettings) => void, acknowledge = false) => {
    if (ownSave.current) { setError("Wait for the current settings save to finish. Your edits are preserved."); return; }
    setError(""); setSaving(true); ownSave.current = true;
    try {
      const settings = parse(SettingsSchema, values);
      const result = await sdk.settings.update(settings, baseRevision.current, acknowledge);
      baseRevision.current = result.revision!; committedValues.current = settings; setCommitted(structuredClone(settings));
      saved(settings);
    } catch (error) { setError(error instanceof Error ? error.message : "Settings were not saved."); }
    finally { ownSave.current = false; setSaving(false); }
  };
  const save = async (section?: SettingsSection) => {
    try {
      const values = section ? { ...committedValues.current, [section]: draft[section] } : { ...draft };
      for (const [key, value] of Object.entries(raw)) if (!section || key === section) Object.assign(values, { [key]: JSON.parse(value) });
      await write(values, (settings) => {
        setDraft((current) => section ? { ...current, [section]: structuredClone(settings[section]) } : structuredClone(settings));
        setRaw((current) => { if (!section) return {}; const { [section]: _, ...rest } = current; return rest; });
        if (!section || section === "systemPrompt") setRisk(false);
      }, risk);
    } catch (error) { setError(error instanceof Error ? error.message : "Settings were not saved. Your text is preserved."); }
  };
  /** Saves one choice immediately on top of the committed values, leaving any other unsaved text in the draft. `fallback` fills an optional section that was never saved. */
  const automatic = <K extends AutomaticSection>(section: K, patch: Partial<NonNullable<UserSettings[K]>>, replace = false, fallback?: NonNullable<UserSettings[K]>) => {
    if (ownSave.current) { setError("Wait for the current settings save to finish. Your edits are preserved."); return; }
    if (raw[section] !== undefined) { setError("Save or reload this section's JSON before changing its controls. Your text is preserved."); return; }
    const value = replace ? patch : { ...fallback, ...committedValues.current[section], ...patch };
    setDraft((current) => ({ ...current, [section]: replace ? value : { ...fallback, ...current[section], ...patch } }));
    void write({ ...committedValues.current, [section]: value }, () => {});
  };
  /** Saves a whole section immediately, for list choices such as adding, enabling or removing a skill source. */
  const commitSection = <K extends SettingsSection>(section: K, value: UserSettings[K]) => {
    if (ownSave.current) { setError("Wait for the current settings save to finish. Your edits are preserved."); return; }
    if (raw[section] !== undefined) { setError("Save or reload this section's JSON before changing its controls. Your text is preserved."); return; }
    setDraft((current) => ({ ...current, [section]: value }));
    void write({ ...committedValues.current, [section]: value }, () => {});
  };
  const updateChildrenPreference = (action: "archive" | "delete", input: string) => {
    if (ownSave.current) { setError("Wait for the current settings save to finish. Your edits are preserved."); return; }
    if (raw.retention !== undefined) { setError("Save or reload retention JSON before changing its controls. Your text is preserved."); return; }
    const saved = { ...committedValues.current.retention };
    if (action === "archive") {
      if (input === "ask") delete saved.archiveChildren;
      else if (input === "archive" || input === "detach") saved.archiveChildren = input;
      else return;
    } else {
      if (input === "ask") delete saved.deleteChildren;
      else if (input === "delete" || input === "detach") saved.deleteChildren = input;
      else return;
    }
    setDraft((current) => {
      const retention = { ...current.retention };
      if (action === "archive") {
        if (input === "ask") delete retention.archiveChildren;
        else if (input === "archive" || input === "detach") retention.archiveChildren = input;
      } else if (input === "ask") delete retention.deleteChildren;
      else if (input === "delete" || input === "detach") retention.deleteChildren = input;
      return { ...current, retention };
    });
    void write({ ...committedValues.current, retention: saved }, () => {});
  };
  const automaticDefaults = (patch: ControlDefaults, remove: (keyof ControlDefaults)[] = [], scope: "global" | "profile" = "profile") => {
    if (ownSave.current || raw.startup !== undefined) { setError("Save or reload the startup JSON before changing default controls. Your text is preserved."); return; }
    const merge = (profile: ControlDefaults) => {
      const value = { ...profile, ...patch, ...(patch.modelOptions ? { modelOptions: { ...profile.modelOptions, ...patch.modelOptions } } : {}) };
      for (const key of remove) delete value[key];
      return value;
    };
    const startup = { ...committedValues.current.startup, [scope]: merge(committedValues.current.startup[scope]) };
    setDraft((current) => ({ ...current, startup: { ...current.startup, [scope]: merge(current.startup[scope]) } }));
    void write({ ...committedValues.current, startup }, () => {});
  };
  const saveGuidance = (key: keyof Guidance) => {
    const value = draft.guidance?.[key] ?? "";
    void write({ ...committedValues.current, guidance: { ...committedValues.current.guidance, [key]: value } },
      () => setDraft((current) => ({ ...current, guidance: { ...current.guidance, [key]: value } })));
  };
  const retentionDays = (current: number | undefined) => [...new Set<number>([...RETENTION_DAY_CHOICES, current ?? 7])].sort((a, b) => a - b);
  const retentionRule = (label: string, enabled: boolean, toggle: (checked: boolean) => void, days: number | undefined, daysLabel: string, setDays: (value: number) => void) =>
    <div className="retention-rule">
      <label className="check-setting"><SettingsInput type="checkbox" checked={enabled} disabled={saving} onChange={(event) => toggle(event.target.checked)} />{label}</label>
      <label className="retention-age">After<select aria-label={daysLabel} value={days ?? 7} disabled={saving} onChange={(event) => setDays(Number(event.target.value))}>
        {retentionDays(days).map((value) => <option key={value} value={value}>{value === 1 ? "1 day" : `${value} days`}</option>)}
      </select></label>
    </div>;
  const voiceShortcut = () => {
    const shortcut = draft.voice.shortcut ?? "Control+Space";
    void write({ ...committedValues.current, voice: { ...committedValues.current.voice, shortcut } }, () => {});
  };
  const saveShortcut = (key: "commands" | "terminalCopy" | "openApp") => {
    const value = draft.shortcuts?.[key] ?? (key === "commands" ? "Primary+KeyK" : key === "openApp" ? "Primary+Shift+KeyO" : "Primary+Shift+KeyC");
    const shortcuts = { commands: "Primary+KeyK", terminalCopy: "Primary+Shift+KeyC", ...committedValues.current.shortcuts, [key]: value };
    void write({ ...committedValues.current, shortcuts }, () => {});
  };
  const reset = (section: SettingsSection | "all") => run(async () => {
    if (ownSave.current) throw new Error("Wait for the current settings save to finish.");
    ownSave.current = true; setSaving(true);
    try {
      const result = await sdk.settings.reset(section, baseRevision.current);
      const settings = sdk.getState().snapshot!.settings.values;
      baseRevision.current = result.revision!; committedValues.current = settings; setCommitted(structuredClone(settings));
      setDraft((current) => section === "all" ? structuredClone(settings) : { ...current, [section]: structuredClone(settings[section]) });
      setRaw((current) => { if (section === "all") return {}; const { [section]: _, ...rest } = current; return rest; });
      if (section === "all" || section === "systemPrompt") setRisk(false);
      return `Restored ${section} defaults. Projects, history, credentials, knowledge and downloaded models were preserved.`;
    } finally { ownSave.current = false; setSaving(false); }
  });
  const saveButton = (section: SettingsSection, label: string, disabled = false) => <button type="button" className="primary" aria-label={label}
    disabled={disabled || saving || lineageDirty || lineageBusy || !sectionDirty(section) || section === "systemPrompt" && !risk} onClick={() => void save(section)}>Save</button>;
  const jsonEditor = (section: SettingsSection, label: string, disabled = saving) => <div className="setting-editor"><label className="setting-field">{label}<SettingsTextarea className="json-editor" aria-label={label} value={raw[section] ?? JSON.stringify(draft[section], null, 2)} disabled={disabled}
    onChange={(event) => setRaw((raw) => ({ ...raw, [section]: event.target.value }))} spellCheck={false} /></label>{saveButton(section, `Save ${label}`, disabled)}</div>;
  const registry = snapshot.registry.filter((entry) => entry.projectId === (project?.id ?? null) && entry.kind === (tab === "skills" ? "skill" : tab === "scripts" ? "script" : "plugin"));
  useEffect(() => { setCapabilityProgress(""); setDeletingSkill(null); }, [sdk, project?.id, tab]);
  const deleteSkill = (entry: (typeof registry)[number]) => {
    if (capabilityPending.current) return;
    capabilityPending.current = true; setCapabilityBusy(true);
    void run(async () => {
      await sdk.capabilities.delete(entry.id, entry.revision, true);
      setDeletingSkill(null); setCapabilityProgress(`Deleted skill ${entry.name}. Chats that used it lose access.`);
    }).finally(() => { capabilityPending.current = false; setCapabilityBusy(false); });
  };
  const toggleSkills = (entries: typeof registry, enabled: boolean) => {
    if (capabilityPending.current) return;
    capabilityPending.current = true; setCapabilityBusy(true);
    const progress = (count: number) => setCapabilityProgress(`${count} of ${entries.length} skill changes saved.`);
    progress(0);
    void run(async () => {
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        await sdk.capabilities.toggle(entry.id, enabled, entry.revision);
        progress(index + 1);
      }
    }).finally(() => { capabilityPending.current = false; setCapabilityBusy(false); });
  };
  const pending = snapshot.proposals.filter((proposal) => proposal.projectId === project?.id && proposal.status === "pending");
  const activeVoice = snapshot.jobs.findLast((job) => job.sessionId === session?.id && job.kind.startsWith("voice.") && job.status === "running");
  const voiceDownload = snapshot.jobs.findLast((job) => job.kind === "voice.download" && job.status === "running");
  const voiceDisable = snapshot.jobs.findLast((job) => job.kind === "voice.disable" && job.status === "running");
  const lastVoice = snapshot.jobs.findLast((job) => job.sessionId === session?.id && ["voice.record", "voice.transcribe", "voice.capture"].includes(job.kind));
  const completedVoice = lastVoice?.status === "completed" ? lastVoice : undefined;
  const voiceTranscript = useDictationTranscript(sdk, session?.id, tab === "voice" ? completedVoice?.id : undefined);
  const modelPromptChanged = draft.systemPrompt !== committed.systemPrompt;
  const projectServers = session ? snapshot.projectConfigurations.find((configuration) => configuration.projectId === session.projectId)?.values.mcpServers ?? [] : [];
  const configuredServers = [...snapshot.settings.values.mcpServers, ...projectServers].filter((server, index, all) => server.enabled &&
    (!server.projectIds || session?.projectId && server.projectIds.includes(session.projectId)) && all.findIndex((entry) => entry.id === server.id && entry.enabled) === index);
  const retainedServers = [...new Set(snapshot.settings.values.remote?.mcpGrants?.map((grant) => grant.serverId) ?? [])].filter((id) => id !== "builtin" && !configuredServers.some((server) => server.id === id));
  const selectedServer = configuredServers.find((server) => server.id === serverId);
  const oauthSelected = selectedServer?.transport.type === "http" && selectedServer.transport.auth === "oauth";
  const routingModels = snapshot.provider.models.filter((model) => !model.synthetic && !isAgentHarnessModel(model));
  const routingReady = (model: ModelInfo) => snapshot.policy.allowedEnvs.some((env) =>
    env !== "Sandbox" && routingModelReady(model, draft.kupo, env));
  const routingSolverReady = (model: ModelInfo) => routingReady(model) && model.maxTokens !== undefined &&
    routingWorkingWindow(model) >= model.maxTokens + 4096;
  const explicitDefaultModelId = Object.hasOwn(draft.startup.profile, "modelId") ? draft.startup.profile.modelId : draft.startup.global.modelId;
  const defaultModelId = explicitDefaultModelId === undefined ? snapshot.lastModelSelection?.modelId : explicitDefaultModelId;
  const defaultModel = snapshot.provider.models.find((model) => model.id === defaultModelId);
  const defaultOptions = Object.hasOwn(draft.startup.profile, "modelOptions") ? draft.startup.profile.modelOptions : draft.startup.global.modelOptions;
  const defaultEffort = defaultOptions?.thinkingEffort ?? (explicitDefaultModelId === undefined && !Object.hasOwn(draft.startup.profile, "modelOptions") &&
    !Object.hasOwn(draft.startup.global, "modelOptions") ? snapshot.lastModelSelection?.thinkingEffort : undefined);
  const globalDefaultModel = snapshot.provider.models.find((model) => model.id === draft.startup.global.modelId);
  const globalDefaultEffort = draft.startup.global.modelOptions?.thinkingEffort;
  const rememberedModel = snapshot.provider.models.find((model) => model.id === snapshot.lastModelSelection?.modelId);
  const allowed = snapshot.policy.allowedEnvs, environmentChoice = allowed.length === 3 ? "all" : allowed.length === 2 && !allowed.includes("Local") ? "protected" :
    allowed.length === 1 && allowed[0] === "Sandbox" ? "sandbox" : allowed.length === 1 && allowed[0] === "Remote" ? "remote" : "custom";
  useEffect(() => { setTools([]); setSelectedTool(null); }, [snapshot.profileId, snapshot.settings.revision, snapshot.policy.revision, session?.id, session?.projectId,
    session?.workspaceId, session?.controls.env, session?.mode, session?.pendingMode, snapshot.projectConfigurations.find((configuration) => configuration.projectId === session?.projectId)?.revision]);
  const railBusy = saving || sandboxBusy || lineageBusy;
  const enabledCount = (count: number, noun = "enabled") => count ? `${count} ${noun}` : `None ${noun}`;
  const tabStatus: Partial<Record<SettingsTab, string>> = {
    github: githubStatus, linear: linearStatus,
    mcpServers: enabledCount(committed.mcpServers.filter((server) => server.enabled).length),
    sql: committed.integrations?.sql.enabled ? "On" : "Off",
    stainless: committed.integrations?.stainless?.enabled ? "On" : "Off",
    plugins: enabledCount(snapshot.registry.filter((entry) => entry.kind === "plugin" && entry.enabled && !entry.retired).length),
    marketplace: enabledCount(snapshot.registry.filter((entry) => entry.marketplace && !entry.retired).length, "installed"),
  };
  return <SettingsFieldsProvider><section className="settings-page" aria-label="Moguri settings">
    <header className="settings-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" disabled={saving || sandboxBusy || lineageBusy} onClick={() => { if (dirty || nestedDirty) setError("Save your edit or reload committed settings before leaving."); else onBack(); }}><Icon name="Back" /></button><h1>Settings</h1><span role="status">{saving ? "Saving..." : dirty || nestedDirty ? "Unsaved changes" : "Saved"}</span>{tab !== "project" && <button aria-label="Save settings" disabled={saving || lineageDirty || lineageBusy || !dirty || modelPromptChanged && !risk} className="primary" onClick={() => void save()}>Save</button>}</header>
    <div className="settings-layout" data-settings-tab={tab}><nav aria-label="Settings categories">
      <label className="settings-search"><span className="sr-only">Search settings</span><input type="search" aria-label="Search settings" placeholder="Search settings" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <span className="sr-only" role="status">{search.trim() ? `${groups.reduce((sum, group) => sum + group.items.length, 0)} settings sections found` : ""}</span>
      {groups.map((group) => isTabbedGroup(group) && !searching ? <section className="settings-category settings-category-tabbed" key={group.label} aria-label={`${group.label} settings`}>
        <button disabled={railBusy} className={activeGroup.label === group.label ? "selected" : ""} aria-current={activeGroup.label === group.label ? "page" : undefined}
          onClick={() => selectTab(activeGroup.label === group.label ? tab : groupTabs.current.get(group.label) ?? group.items[0]!.id)}>{group.label}</button></section> :
        <section className="settings-category" key={group.label} aria-label={`${group.label} settings`}><h2>{group.label}</h2>{group.items.map((item) => <button key={item.id} disabled={railBusy} className={tab === item.id ? "selected" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => selectTab(item.id)}>{item.label}</button>)}</section>)}
      {!groups.length && <p className="settings-search-empty">No matching settings. Your edits are preserved.</p>}
      <button className="restore-all" disabled={saving || lineageDirty || lineageBusy} onClick={() => void reset("all")}>Restore all defaults</button></nav>
      <div className="settings-content">
        {tabbed && <div className="pr-pane-tabs settings-tabs" role="tablist" aria-label={activeGroup.label} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const items = activeGroup.items, index = items.findIndex((item) => item.id === tab);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
          if (selectTab(items[next]!.id)) event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{activeGroup.items.map((item) => {
          const status = tabStatus[item.id];
          return <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="settings-tabpanel"
            tabIndex={tab === item.id ? 0 : -1} disabled={railBusy} aria-label={item.label} aria-describedby={status ? `settings-tab-status-${item.id}` : undefined}
            onClick={() => selectTab(item.id)}><span>{item.label}</span>{status && <span id={`settings-tab-status-${item.id}`} className="settings-tab-status">{status}</span>}</button>;
        })}</div>}
        <div id="settings-tabpanel" role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? `settings-tab-${tab}` : undefined}><fieldset className="settings-fields" disabled={saving && tab !== "voice"}>
        {["artifacts", "candidates", "sendbox", "skills"].includes(tab) && <div className="settings-page-header">
          {tab === "sendbox" ? <SettingsHelp label="About Sandbox" target={<h2 id="sandbox-configuration">Sandbox</h2>}>Sandbox runs the agent in an isolated VM on this Mac. If setup is incomplete, Sandbox turns are blocked instead of running in Local.</SettingsHelp> :
            <h2>{tab === "artifacts" ? "Artifacts" : tab === "candidates" ? "Candidates" : "Skills"}</h2>}
          <label className="settings-scope">{tab === "skills" ? "Chat for skill review" : "Source chat (optional)"}<select aria-label="Settings source chat" value={resourceSessionId} onChange={(event) => {
            if (resourceDirty) { setError("Save or cancel the current resource edit before choosing another source chat."); return; }
            setResourceSessionId(event.target.value);
          }}><option value="">{tab === "skills" ? "Choose a source chat" : "Profile records"}</option>{resourceSessionId && !resourceSession && <option value={resourceSessionId} disabled>Source chat removed</option>}
            {snapshot.sessions.filter((value) => value.kind !== "subagent").map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}
          </select></label>
        </div>}
        {tab === "artifacts" && <ArtifactPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} projectId={resourceSession?.projectId ?? project?.id ?? null} request={artifactRequest} onDirty={setResourceDirty} onRequestHandled={onArtifactRequestHandled} />}
        {tab === "candidates" && <CandidatePanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} onDirty={setResourceDirty} />}
        {tab === "general" && <><h2>General</h2><ApplicationSettings sdk={sdk} revision={snapshot.profileCatalogRevision ?? 0} onBusy={setApplicationBusy} />
          <OtlpSettings key={sdk.profileId} sdk={sdk} configuration={snapshot.telemetryExport} disabled={dirty || saving || otherNestedDirty || updateBusy || storageBusy} onDirty={setExportDirty} />
          <UpdateSettings sdk={sdk} revision={snapshot.profileCatalogRevision ?? 0} disabled={dirty || saving || otherNestedDirty || storageBusy || exportDirty} onBusy={setUpdateBusy} prepareMaintenance={prepareMaintenance} /><SettingsHelp label="About profiles" target={<h3>Profiles</h3>}>Each profile owns its accounts, projects, instructions and appearance. Switching never moves running work or copies credentials.</SettingsHelp>
          <ProfileSwitcher key={sdk.profileId} sdk={sdk} snapshot={snapshot} disabled={dirty || saving || projectDirty || profileBudgetDirty || globalBudgetDirty || lineageDirty || lineageBusy || exportDirty} expanded={profilesExpanded} setExpanded={setProfilesExpanded} onSwitch={onSwitchProfile} onDirty={setProfilesDirty} /></>}
        {tab === "repositories" && <RepositoryImportPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} onDirty={setRepositoriesDirty}
          configureProject={(id) => {
            if (dirty || saving || nestedDirty) { setError("Finish or discard the current edit before choosing a project. No configuration target was changed."); return; }
            if (id) selectConfigurationProject(id);
            setTab("project");
          }} />}
        {tab === "providers" && <><SettingsHelp label="About model providers" target={<h2>Model providers</h2>}>Signing in here is separate from GitHub repository access. If a provider fails, Moguri doesn't switch to another one.</SettingsHelp>
          <p className="settings-lead">Connect the accounts and tools Moguri uses for models; credentials stay in your OS keychain.</p>
          <SettingsHelp label="About hosted providers" target={<h3>Accounts</h3>}>API keys are billed by the provider's API; Sign in with ChatGPT uses your ChatGPT plan. Claude.ai subscription sign-in isn't offered because Anthropic doesn't allow it in third-party apps.</SettingsHelp>
          <div className="provider-list">
            <ProviderConnect provider={snapshot.provider} client={sdk} run={run} />
            <HostedProviderConnect provider={snapshot.provider} client={sdk} run={run} disabled={dirty || saving || projectDirty || lineageBusy} />
          </div>
          <SettingsHelp label="About agent harnesses" target={<h3>Agent harnesses</h3>}>Each harness runs your own installed command-line agent with your own sign-in; Moguri never installs it or reads its credentials. Harnesses run Local only, with an Unlimited budget and text input.</SettingsHelp>
          <div className="provider-list">
            {([["claudeAgent", CLAUDE_AGENT_PROVIDER_ID, "Claude Agent", "claude-code", "Your installed Claude Code, with every tool call approved in Moguri."],
              ["codexAgent", CODEX_AGENT_PROVIDER_ID, "Codex Agent", "codex", "Your installed Codex CLI through codex app-server."]] as const).map(([key, id, name, logo, subtitle]) => {
              const value = { ...(key === "claudeAgent" ? defaultClaudeAgentSettings() : defaultCodexAgentSettings()), ...draft[key] };
              const entry = snapshot.provider.catalogue?.providers.find((provider) => provider.id === id), active = committed[key]?.enabled === true;
              const choose = (patch: { enabled?: boolean; transport?: "sdk" | "stream-json" }) => key === "claudeAgent" ?
                automatic("claudeAgent", patch, false, defaultClaudeAgentSettings()) : automatic("codexAgent", { enabled: patch.enabled }, false, defaultCodexAgentSettings());
              const path = value.executablePath ? localPath(value.executablePath) || null : null, savedPath = committed[key]?.executablePath ?? null;
              const savePath = () => void write({ ...committedValues.current, [key]: { ...(key === "claudeAgent" ? defaultClaudeAgentSettings() : defaultCodexAgentSettings()), ...committedValues.current[key], executablePath: path } },
                () => setDraft((current) => ({ ...current, [key]: { ...(key === "claudeAgent" ? defaultClaudeAgentSettings() : defaultCodexAgentSettings()), ...current[key], executablePath: path } })));
              return <ProviderCard key={id} label={`${name} harness`} logo={logo} name={name} subtitle={subtitle}
                status={active ? providerStatus(entry?.status, entry?.enabled ?? true) : "disabled"}
                help={{ label: `About ${name}`, content: key === "claudeAgent" ?
                  "Sign in with `claude auth login` in your terminal. Claude Code makes its own model calls and runs its tools after Moguri approves each call." :
                  "Sign in with `codex login` (ChatGPT or API key). Codex asks Moguri before commands and file changes; anything it runs without asking is checked against your policy afterwards." }}
                actions={<label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable ${name}`} checked={value.enabled === true}
                  disabled={saving} onChange={(event) => choose({ enabled: event.target.checked })} /><span className="sr-only">Enable {name}</span></label>}>
                {value.enabled && <div className="provider-card-fields">
                  {key === "claudeAgent" && <label className="setting-field">Claude Agent transport<select aria-label="Claude Agent transport" value={draft.claudeAgent?.transport ?? "sdk"} disabled={saving}
                    onChange={(event) => choose({ transport: event.target.value === "stream-json" ? "stream-json" : "sdk" })}>
                    <option value="sdk">Claude Agent SDK</option><option value="stream-json">Claude Code stream-json protocol</option>
                  </select></label>}
                  <form className="provider-key-form" onSubmit={(event) => { event.preventDefault(); if (path !== savedPath) savePath(); }}>
                    <PathField label={key === "claudeAgent" ? "Claude Code executable" : "Codex executable"} ariaLabel={key === "claudeAgent" ? "Claude Code executable" : "Codex executable"}
                      kind="file" title={`Choose the ${name} executable`} chooseAriaLabel={`Choose ${name} executable`}
                      placeholder="Found on PATH or in its install location" value={value.executablePath ?? ""} disabled={saving}
                      onChange={(text) => {
                        const executablePath = text || null;
                        if (key === "claudeAgent") change("claudeAgent", { ...defaultClaudeAgentSettings(), ...draft.claudeAgent, executablePath });
                        else change("codexAgent", { ...defaultCodexAgentSettings(), ...draft.codexAgent, executablePath });
                      }}>
                      <button type="submit" className="primary" aria-label={`Save ${name} executable`} disabled={saving || path === savedPath}>Save</button>
                    </PathField>
                  </form>
                  <p className="fine-print">{key === "claudeAgent" ? "Both transports run this executable." : "Models come from your Codex login."} Refresh available models after a change.</p>
                </div>}
                {active && entry?.diagnostic && <Alert as="p" className="inline-error" role="status">{entry.diagnostic}</Alert>}
              </ProviderCard>;
            })}
          </div>
          <h3>Local models</h3>
          <div className="provider-list">
            <ProviderCard label="Local model servers" logo={null} fallback="House" name="Local model servers"
              subtitle="OpenAI-compatible servers you run, such as ds4, Ollama or llama.cpp."
              actions={<button disabled={saving || sandboxBusy || lineageBusy} onClick={() => {
                if (nestedDirty) { setError("Save or reload this settings edit before changing sections."); return; }
                setTab("localModels"); setOutput(""); setInput("");
              }}>Configure local models</button>} />
          </div>
          <ModelAvailabilityPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} disabled={dirty || saving || projectDirty || lineageBusy} onBusy={setModelsBusy} />
          <h3>Chat names</h3>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.chatTitles?.enabled !== false} disabled={saving} onChange={(event) =>
            automatic("chatTitles", { enabled: event.target.checked }, false, { enabled: true, modelId: null })} />Summarize new chat topics automatically</label>
          <label className="setting-field">Naming model<select aria-label="Chat naming model" value={draft.chatTitles?.modelId ?? ""} disabled={saving} onChange={(event) =>
            automatic("chatTitles", { modelId: event.target.value || null }, false, { enabled: true, modelId: null })}>
            <option value="">Automatic (chat's Env)</option>
            {draft.chatTitles?.modelId && !snapshot.provider.models.some((model) => model.id === draft.chatTitles!.modelId) &&
              <option value={draft.chatTitles.modelId} disabled>Configured naming model unavailable</option>}
            {snapshot.provider.models.filter((model) => !model.synthetic && !isAgentHarnessModel(model)).map((model) => <option key={model.id} value={model.id}>{model.name} / {model.environments?.join(", ")}</option>)}
          </select></label>
          <label className="check-setting"><SettingsInput type="checkbox" role="switch" checked={draft.chatTitles?.enabled !== false && draft.chatTitles?.refresh !== false}
            disabled={saving || draft.chatTitles?.enabled === false} onChange={(event) =>
            automatic("chatTitles", { refresh: event.target.checked }, false, { enabled: true, modelId: null })} />Rename the chat when the topic changes</label>
          <p className="fine-print">After the first reply, Moguri makes one billed model call with your first prompt to name the chat. When a later request clearly changes topic, it may rename it, up to three times. Names you set yourself are kept.</p>
        </>}
        {tab === "accessibility" && <><SettingsHelp label="More about this setting" target={<h2>Keyboard shortcuts</h2>}>Record a shortcut or type one, then Save. Shortcuts that clash with editing or system keys are rejected; enter none to turn an optional shortcut off.</SettingsHelp><p>Shortcuts never interrupt typing, and a focused terminal keeps its own keys.</p>

          <ShortcutEditor label="Commands shortcut" value={draft.shortcuts?.commands ?? "Primary+KeyK"} change={(commands) => change("shortcuts", { ...draft.shortcuts, commands, terminalCopy: draft.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC" })} save={() => saveShortcut("commands")} dirty={draft.shortcuts?.commands !== committed.shortcuts?.commands} disabled={saving} />
          <ShortcutEditor label="Terminal copy shortcut" value={draft.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC"} change={(terminalCopy) => change("shortcuts", { ...draft.shortcuts, commands: draft.shortcuts?.commands ?? "Primary+KeyK", terminalCopy })} save={() => saveShortcut("terminalCopy")} dirty={draft.shortcuts?.terminalCopy !== committed.shortcuts?.terminalCopy} disabled={saving} />
          <ShortcutEditor label="Open Moguri shortcut" value={draft.shortcuts?.openApp ?? "Primary+Shift+KeyO"} change={(openApp) => change("shortcuts", { commands: draft.shortcuts?.commands ?? "Primary+KeyK", terminalCopy: draft.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC", ...draft.shortcuts, openApp })} save={() => saveShortcut("openApp")} dirty={(draft.shortcuts?.openApp ?? "Primary+Shift+KeyO") !== (committed.shortcuts?.openApp ?? "Primary+Shift+KeyO")} disabled={saving} />
          <p className="fine-print">Open Moguri works from any app while Moguri runs, and shows in the menu-bar menu. Enter none to turn it off.</p>
          <ShortcutEditor label="Voice shortcut" value={draft.voice.shortcut ?? "Control+Space"} change={(shortcut) => change("voice", { ...draft.voice, shortcut })} save={voiceShortcut} dirty={draft.voice.shortcut !== committed.voice.shortcut} disabled={saving} />
          <dl className="facts shortcut-map">
            <dt>Send or answer in chat</dt><dd><kbd>Enter</kbd></dd><dt>Insert a new line</dt><dd><kbd>Shift+Enter</kbd></dd>
            <dt>Hold a prompt without running</dt><dd><kbd>Cmd/Ctrl+Enter</kbd></dd><dt>Show held-prompt action</dt><dd>Hold Cmd or Ctrl</dd>
            <dt>Commands</dt><dd><kbd>{shortcutLabel(committed.shortcuts?.commands ?? "Primary+KeyK")}</kbd></dd><dt>Hold to dictate</dt><dd><kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd></dd>
            <dt>Copy terminal selection</dt><dd><kbd>{shortcutLabel(committed.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC")}</kbd></dd><dt>Open Moguri from any app</dt><dd><kbd>{shortcutLabel(committed.shortcuts?.openApp ?? "Primary+Shift+KeyO")}</kbd></dd><dt>Close a dialog or popover</dt><dd><kbd>Escape</kbd></dd>
            <dt>Resize a focused sidebar separator</dt><dd><kbd>Left / Right</kbd>, <kbd>Home / End</kbd></dd>
            <dt>Move through popover choices</dt><dd><kbd>Up / Down</kbd>, <kbd>Home / End</kbd></dd>
            <dt>Move between controls</dt><dd><kbd>Tab / Shift+Tab</kbd></dd><dt>Activate a focused control</dt><dd><kbd>Enter / Space</kbd></dd>
          </dl></>}
        {tab === "github" && <><GitHubConnectionPanel sdk={sdk} onStatus={(connected) => setGithubStatus(connected ? "Connected" : "Not connected")} openTerminal={session?.controls.env === "Local" && session.status !== "archived" && snapshot.policy.allowedEnvs.includes("Local") ? openTerminal : undefined} />
          {(() => {
            const prefix = draft.git?.branchPrefix ?? "", saved = committed.git?.branchPrefix ?? "", valid = new RegExp(BRANCH_PREFIX_PATTERN).test(prefix);
            const wrapUp = draft.wrapUp ?? DEFAULT_SESSION_LIFECYCLE;
            return <><section aria-label="After each request">
              <SettingsHelp label="About wrapping up" target={<h3>After each request</h3>}>Runs in the chat as a short extra turn, with the same model, autonomy and approvals. Moguri never merges, force-pushes or deletes branches on its own.</SettingsHelp>
              <label className="check-setting"><SettingsInput type="checkbox" role="switch" checked={wrapUp.enabled} disabled={saving} onChange={(event) =>
                automatic("wrapUp", { enabled: event.target.checked }, false, DEFAULT_SESSION_LIFECYCLE)} />Wrap up when a request finishes</label>
              <p className="fine-print">After changes in a Moguri worktree: resolve conflicts, commit, push, open or update the draft PR, then check CI and reviews. Delegated chats report back to their parent.</p>
              <label className="check-setting"><SettingsInput type="checkbox" role="switch" checked={wrapUp.enabled && wrapUp.followUps} disabled={saving || !wrapUp.enabled} onChange={(event) =>
                automatic("wrapUp", { followUps: event.target.checked }, false, DEFAULT_SESSION_LIFECYCLE)} />Follow up on new reviews and failed CI</label>
              <p className="fine-print">For a day after wrapping up, Moguri checks the PR every few minutes. It fixes a failing check once and asks you if the same failure comes back.</p>
              <label className="check-setting"><SettingsInput type="checkbox" role="switch" checked={draft.evolution.enabled} disabled={saving} onChange={(event) =>
                automatic("evolution", { enabled: event.target.checked })} />Suggest skill improvements</label>
              <p className="fine-print">When a skill used in the request was wrong or incomplete, Moguri proposes a fix. You review it in Suggestions; nothing installs on its own.</p>
            </section>
            <PrAutomationDefaults values={draft.prAutomation} snapshot={snapshot} disabled={saving}
              onChange={(patch) => automatic("prAutomation", patch, false, DEFAULT_PR_AUTOMATION)}
              openProject={(projectId) => {
                if (dirty || nestedDirty) { setError("Save or reload this settings edit before opening a repository's settings."); return; }
                selectConfigurationProject(projectId); setTab("project"); setOutput(""); setInput("");
              }} />
            <section aria-label="Branch names">
              <SettingsHelp label="About branch names" target={<h3>Branch names</h3>}>Applies to branches Moguri creates for new tasks, Kanban work and suggested worktrees. Existing branches keep their names.</SettingsHelp>
              <form className="branch-prefix-form" onSubmit={(event) => {
                event.preventDefault();
                if (!valid || prefix === saved) return;
                void write({ ...committedValues.current, git: prefix ? { branchPrefix: prefix } : undefined }, () => setDraft((current) => ({ ...current, git: prefix ? { branchPrefix: prefix } : undefined })));
              }}>
                <label className="setting-field">Branch name prefix<SettingsInput aria-label="Branch name prefix" value={prefix} placeholder="yourname/" maxLength={60} spellCheck={false}
                  onChange={(event) => change("git", { branchPrefix: event.target.value })} /></label>
                <button type="submit" className="primary" aria-label="Save branch name prefix" disabled={saving || !valid || prefix === saved}>Save</button>
              </form>
              {!valid ? <Alert as="p" className="inline-error" role="alert">Use letters, numbers, ".", "_" and "-", with "/" between parts, such as yourname/ or team-.</Alert> :
                <p className="fine-print">{prefix ? `New branches look like ${prefix}moguri/fix-login-1a2b3c4d.` : "Optional. New branches look like moguri/fix-login-1a2b3c4d."}</p>}
            </section></>;
          })()}
          <details><summary>Advanced Git and GitHub operations</summary><GitHubWorkflowPanel key={`${snapshot.profileId}:${project?.id}:${session?.id}`} sdk={sdk} project={project} session={session} snapshot={snapshot} /></details></>}
        {tab === "linear" && <><LinearConnectionPanel sdk={sdk} onDirty={setIntegrationDirty} onStatus={(connection) => setLinearStatus(linearConnectionLabel(connection))} />{project ? <LinearWorkflowPanel key={`${snapshot.profileId}:${project.id}`} sdk={sdk} project={project} session={session} snapshot={snapshot} /> : <p className="fine-print">Choose a project to set up its Linear team and workflows.</p>}</>}
        {tab === "sql" && <><SettingsHelp label="More about this setting" target={<h2>sql-not-so-lite</h2>}>Connects to a sql-not-so-lite daemon you already run; Moguri never starts it or triggers its scans. The connection is made from this Mac, not from a Remote host.</SettingsHelp>
          <label className="setting-field">Existing daemon endpoint<SettingsInput aria-label="SQL daemon endpoint" type="url" value={draft.integrations?.sql.endpoint ?? "http://127.0.0.1:9147"} onChange={(event) => change("integrations", { ...draft.integrations, sql: { enabled: draft.integrations?.sql.enabled ?? false, endpoint: event.target.value } })} /></label>
          <button type="button" className="primary" aria-label="Save SQL daemon endpoint" disabled={saving || draft.integrations?.sql.endpoint === committed.integrations?.sql.endpoint} onClick={() => {
            const endpoint = draft.integrations?.sql.endpoint ?? "http://127.0.0.1:9147";
            void write({ ...committedValues.current, integrations: { ...committedValues.current.integrations, sql: { enabled: committedValues.current.integrations?.sql.enabled ?? false, endpoint } } }, () => {});
          }}>Save</button>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.integrations?.sql.enabled ?? false} onChange={(event) => {
            const enabled = event.target.checked, value = committedValues.current.integrations?.sql ?? { enabled: false, endpoint: "http://127.0.0.1:9147" };
            setDraft((current) => ({ ...current, integrations: { ...current.integrations, sql: { ...current.integrations?.sql ?? value, enabled } } }));
            void write({ ...committedValues.current, integrations: { ...committedValues.current.integrations, sql: { ...value, enabled } } }, () => {});
          }} />Use this daemon</label>
          <Alert as="p" tone="warning" className="settings-warning">The daemon's default listener has no authentication or TLS, so keep it on loopback. Network endpoints need HTTPS.</Alert>
          <button type="button" disabled={saving || sectionDirty("integrations")} onClick={() => {
            const generation = ++sqlGeneration.current;
            void run(async () => { const value = await sdk.integrations.sqlStatus(); if (generation === sqlGeneration.current) setSql(value.connection); }, () => generation === sqlGeneration.current);
          }} aria-label="Verify daemon connection">Verify</button>
          <button type="button" disabled={saving || sectionDirty("integrations") || !committed.integrations?.sql.enabled} onClick={() => void run(() => window.moguri.openExternal(committed.integrations!.sql.endpoint))} aria-label="Open interface for existing daemon">Open interface</button>
          <p role="status">{sql ? `${sql.healthy ? "Daemon reports healthy" : "Not connected"}${sql.version ? ` / ${sql.version}` : ""}. ${sql.diagnostic}` : "Connection not verified yet."}</p></>}
        {tab === "stainless" && <StainlessSettingsPanel sdk={sdk} revision={snapshot.settings.revision} settings={draft.integrations?.stainless} saving={saving}
          save={(stainless) => {
            setDraft((current) => ({ ...current, integrations: { ...(current.integrations ?? defaultSettings().integrations!), stainless } }));
            return write({ ...committedValues.current, integrations: { ...(committedValues.current.integrations ?? defaultSettings().integrations!), stainless } }, () => {});
          }} />}
        {tab === "knowledge" && <KnowledgePanel key={`${snapshot.profileId}:${project?.id}:${session?.id}`} sdk={sdk} snapshot={snapshot} project={project} session={session} onDirty={setProjectDirty} />}
        {(tab === "hooks" || tab === "marketplace") && <ExtensionPanel key={`${snapshot.profileId}:${project?.id}:${tab}`} sdk={sdk} snapshot={snapshot} project={project} session={session} mode={tab} onDirty={setProjectDirty} />}
        {tab === "decisions" && <><SettingsHelp label="More about this setting" target={<h2 id="policy-decisions" data-policy-target tabIndex={-1}>Decision providers and Local Max</h2>}>Autopilot Max asks a decision model to pick answers to technical-choice questions for you. It stays off until you set its provider, model, limits and hosted-data consent below.</SettingsHelp>
          {jsonEditor("decisions", "Decision provider policy")}
          <details><summary>Available model IDs</summary><pre>{JSON.stringify(routingModels.map(({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary }) => ({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary })), null, 2)}</pre></details>

          <Alert as="p" tone="warning" className="settings-warning">Decision confidence is uncalibrated advice. Max runs in Local only, and the decision model never gains permissions or approves Git actions.</Alert>
          <SettingsHelp label="More about this setting" target={<h3>Saved-policy readiness</h3>}>After saving, choose Autopilot Max in the composer. Each decision call, its output and its cost appear under Artifacts, and your own answers always take priority.</SettingsHelp><p className="fine-print" role="status">{decisions.reason}</p>

          <button type="button" disabled={saving} onClick={() => void reset("decisions")} aria-label="Restore defaults for decision providers">Restore defaults</button>
        </>}
        {tab === "kupo" && <><h2 id="policy-kupo" data-policy-target tabIndex={-1}>Kupo</h2>
          <label className="setting-field">Workflow policy<select aria-label="kupo workflow" value={draft.kupo.workflow} disabled={saving || lineageDirty || lineageBusy || modelProfileDirty || modelProfileBusy} onChange={(event) => {
            if (sectionDirty("kupo")) { setError("Save or reload the complete policy before switching workflow shapes. Your unsaved policy was preserved."); return; }
            const { enabled, classifierModelId, approvedModelIds, allowHosted, minimumConfidence } = draft.kupo;
            const pool = { enabled, classifierModelId, approvedModelIds, allowHosted, minimumConfidence };
            if (event.target.value !== "auto" && approvedModelIds.length > 8) { setError("Legacy Single and reviewed Compound accept at most eight explicit models. Narrow the advanced pool first; no IDs were silently dropped."); return; }
            automatic("kupo", event.target.value === "auto" ? { ...defaultKupoSettings(), ...pool,
              lineageReviews: draft.kupo.workflow === "single" ? [] : draft.kupo.lineageReviews } : event.target.value === "compound" ? { ...pool, workflow: "compound", routes: [], lineageReviews: [],
              limits: { routerTokens: 512, proposalTokens: 2048, criticTokens: 1024, timeoutMs: 300000 } } : { ...pool, workflow: "single" }, true);
          }}><option value="auto">Automatic (configured models)</option><option value="single">Single (approved solvers)</option><option value="compound">Cascade / Critique in a worktree</option></select></label>
          {draft.kupo.workflow === "auto" ? <>
            <SettingsHelp label="About automatic Kupo" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable automatic Kupo" checked={draft.kupo.enabled} disabled={saving} onChange={(event) => automatic("kupo", { enabled: event.target.checked })} />Enable automatic Kupo for this profile</label>} descriptionFirst>Kupo picks from your configured models for each task. With one eligible model it uses that model directly; with several it chooses Single, Cascade or Critique (at most one revision).</SettingsHelp>
            <SettingsHelp label="About the configured model pool" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow hosted or network routing data" checked={draft.kupo.allowHosted} disabled={saving} onChange={(event) => automatic("kupo", { allowHosted: event.target.checked })} />Allow task history to configured hosted or network models</label>}>Kupo uses every eligible configured model, including ones you add later. Turn this off to keep task history on loopback models, or narrow the pool in the advanced policy.</SettingsHelp>
            <SettingsHelp label="About declared model capabilities" target={<h3>Model capabilities</h3>}>What each model declares it supports (inputs, reasoning and context), not measured quality or speed.</SettingsHelp>
            <table aria-label="Kupo model capabilities"><thead><tr><th>Model</th><th>Capabilities</th><th>Tools</th></tr></thead><tbody>
              {sdk.routing.capabilities().map((profile) => <tr key={profile.modelId}><td>{routingModels.find((model) => model.id === profile.modelId)?.name ?? profile.modelId}</td><td>{profile.categories.join(", ")}</td><td>{profile.toolInput === null ? "Unknown" : profile.toolInput ? "Declared" : "Disabled"}</td></tr>)}
            </tbody></table>
            {!sdk.routing.capabilities().length && <p>No eligible configured models. See the diagnostics below.</p>}
            <h3>Automatic context compaction</h3>
            <label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable automatic Kupo compaction" disabled={saving}
              checked={automaticCompactionPolicy(draft, true) !== null} onChange={(event) => automatic("kupo", {
                autoCompaction: { ...defaultKupoCompaction(), ...(draft.kupo.workflow === "auto" ? draft.kupo.autoCompaction : {}), enabled: event.target.checked },
              })} />Summarize long chats automatically</label>
            <p className="fine-print">When a chat gets long, Kupo summarizes older turns at safe points. Each summary is a billed model call; the full history stays saved. {draft.kupo.workflow === "auto" && !draft.kupo.autoCompaction ? "Follows Context compaction until you change it here." : ""}</p>
            <Alert as="p" tone="warning" className="settings-warning">Only Kupo's selected response can use tools, under your normal approvals. Cascade and Critique also need reviewed model evaluations, and Sandbox needs a verified setup (no Local fallback).</Alert>
            <KupoModelProfiles sdk={sdk} models={routingModels} disabled={saving || lineageBusy} onDirty={setModelProfileDirty} onBusy={setModelProfileBusy}
              onPrepared={(profile) => {
                const policy = parse(AutomaticKupoSettingsSchema, raw.kupo === undefined ? draft.kupo : JSON.parse(raw.kupo));
                setRaw((raw) => ({ ...raw, kupo: JSON.stringify({ ...policy, modelProfiles: [...(policy.modelProfiles ?? []).filter((entry) => entry.modelId !== profile.modelId), profile] }, null, 2) }));
              }} />
            <details><summary>Advanced model pool and lineage policy</summary>
              {jsonEditor("kupo", "Advanced automatic routing policy", saving || lineageBusy)}
              <CompoundLineageReview sdk={sdk} models={routingModels} disabled={saving} onDirty={setLineageDirty} onBusy={setLineageBusy}
                onPrepared={(review) => {
                  const policy = parse(AutomaticKupoSettingsSchema, raw.kupo === undefined ? draft.kupo : JSON.parse(raw.kupo));
                  setRaw((raw) => ({ ...raw, kupo: JSON.stringify({ ...policy, lineageReviews: [...policy.lineageReviews, review] }, null, 2) }));
                }} />
            </details>
          </> : draft.kupo.workflow === "compound" ? <>

            <SettingsHelp label="More about this setting" target={jsonEditor("kupo", "Complete compound routing policy", saving || lineageBusy)} descriptionFirst>Declare up to four Cascade or Critique routes and up to eight approved models, using the model IDs below. The classifier only picks among routes you declare.</SettingsHelp>

            <details><summary>Available model IDs</summary><pre>{JSON.stringify(routingModels, null, 2)}</pre></details>
            <CompoundLineageReview sdk={sdk} models={routingModels} disabled={saving} onDirty={setLineageDirty} onBusy={setLineageBusy}
              onPrepared={(review, draftId, criticId) => {
                const policy = parse(CompoundSettingsSchema, raw.kupo === undefined ? draft.kupo : JSON.parse(raw.kupo));
                const next = { ...policy, lineageReviews: [...policy.lineageReviews, review],
                  routes: policy.routes.map((route) => route.pattern === "critique" && route.draftId === draftId && route.criticId === criticId ? { ...route, lineageReviewId: review.id } : route) };
                setRaw((raw) => ({ ...raw, kupo: JSON.stringify(next, null, 2) }));
              }} />
            <Alert as="p" tone="warning" className="settings-warning">Compound proposals need your staging and test review before they reach your source, and aren't available in Sandbox yet. Finite budgets need a wind-down policy, and Max needs a decision provider.</Alert>
          </> : <><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable kupo Single" checked={draft.kupo.enabled} disabled={saving} onChange={(event) => automatic("kupo", { enabled: event.target.checked })} />Enable kupo Single for this profile</label>} descriptionFirst>A classifier model picks one of your approved solvers for each task. Both calls are billed and use your normal permissions and Env.</SettingsHelp>
          <label className="setting-field">Classifier<select aria-label="kupo classifier" value={draft.kupo.classifierModelId ?? ""} disabled={saving} onChange={(event) => automatic("kupo", { classifierModelId: event.target.value || null })}><option value="">Choose a configured classifier</option>
            {draft.kupo.classifierModelId && !routingModels.some((model) => model.id === draft.kupo.classifierModelId) && <option value={draft.kupo.classifierModelId} disabled>Saved unavailable model: {draft.kupo.classifierModelId}</option>}
            {routingModels.map((model) => <option key={model.id} value={model.id} disabled={!routingReady(model)}>{model.name} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}{!routingReady(model) ? " / unavailable for Kupo" : ""}</option>)}</select></label>
          <SettingsHelp label="More about this setting" target={<h3>Approved solvers</h3>}>Approve up to eight models. Each is rechecked for availability, Env, context and output limits before every call.</SettingsHelp>
          {routingModels.length === 0 && <p>No configured models. Connect a provider or add a local model first.</p>}
          {routingModels.map((model) => {
            const ready = routingSolverReady(model), approved = draft.kupo.approvedModelIds.includes(model.id);
            return <div key={model.id}><label className="check-setting"><SettingsInput type="checkbox" role="checkbox" aria-label={`Approve solver ${model.name}`} checked={ready && approved} disabled={saving || !ready || !approved && draft.kupo.approvedModelIds.length >= 8}
              onChange={(event) => automatic("kupo", { approvedModelIds: event.target.checked ? [...draft.kupo.approvedModelIds, model.id] : draft.kupo.approvedModelIds.filter((id) => id !== model.id) })} /><span>{model.name}<br /><small className="path">{model.id} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}{!ready ? " / unavailable for Kupo (check Env, privacy, context and output limits)" : ""}</small></span></label>
              {!ready && approved && <button type="button" disabled={saving} aria-label={`Remove unavailable solver ${model.id}`} onClick={() => automatic("kupo", { approvedModelIds: draft.kupo.approvedModelIds.filter((id) => id !== model.id) })}>Remove saved approval</button>}
            </div>;
          })}
          {draft.kupo.approvedModelIds.filter((id) => !routingModels.some((model) => model.id === id)).map((id) => <div key={id}>
            <label className="check-setting"><SettingsInput type="checkbox" role="checkbox" aria-label={`Unavailable solver ${id}`} checked={false} disabled /><span className="path">{id} / unavailable; saved approval is inactive</span></label>
            <button type="button" disabled={saving} aria-label={`Remove unavailable solver ${id}`} onClick={() => automatic("kupo", { approvedModelIds: draft.kupo.approvedModelIds.filter((value) => value !== id) })}>Remove saved approval</button>
          </div>)}
          <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow hosted or network routing data" checked={draft.kupo.allowHosted} disabled={saving} onChange={(event) => automatic("kupo", { allowHosted: event.target.checked })} />Allow task history to hosted or network classifiers and solvers</label>}>Leave this off to use only loopback endpoints on the execution host. A loopback proxy can still forward data elsewhere.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<label className="setting-field">Classifier confidence threshold: {draft.kupo.minimumConfidence.toFixed(2)}<SettingsCommitInput type="range" aria-label="Classifier confidence threshold" min={0} max={1} step={0.01} value={draft.kupo.minimumConfidence} disabled={saving}
            onChange={(event) => change("kupo", { ...draft.kupo, minimumConfidence: Number(event.target.value) })} onCommit={(value) => automatic("kupo", { minimumConfidence: Number(value) })} /></label>}>The classifier's confidence is uncalibrated. Below this threshold the turn pauses instead of trying another model.</SettingsHelp>

          <Alert as="p" tone="warning" className="settings-warning">Finite budgets need a wind-down policy. Images, documents and window or effort settings work only if the classifier and every solver support them.</Alert>
          </>}
          <SettingsHelp label="More about this setting" target={<h3>Saved-policy availability</h3>}>After saving, choose kupo in the composer. Changing the policy invalidates pending routed approval requests; calls already running may still be billed.</SettingsHelp>{snapshot.routingDiagnostics?.map((diagnostic) => <p className="fine-print" key={diagnostic}>{diagnostic}</p>)}

          {draft.kupo.workflow === "single" && <SettingsHelp label="More about this setting" target={<details><summary>Read the classifier prompt</summary><pre>{DEFAULT_ROUTER_PROMPT}</pre></details>}>Your system prompt still governs the solver; the classifier's output only selects a solver and never reaches it as instructions.</SettingsHelp>}
          <button type="button" disabled={saving || lineageDirty || lineageBusy} onClick={() => void reset("kupo")} aria-label="Restore defaults for Kupo">Restore defaults</button>
        </>}
        {tab === "budgets" && <><SettingsHelp label="More about this setting" target={<h2>Budgets and model estimates</h2>}>Limits count every model call, including routing and review calls. They use cost estimates, not your provider's bill, and unknown usage never counts as zero.</SettingsHelp>
          <ProviderPricing sdk={sdk} snapshot={snapshot} />
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.budgets.providerEstimates !== false} disabled={saving || raw.budgets !== undefined} onChange={(event) => automatic("budgets", { providerEstimates: event.target.checked })} />Estimate costs from each model's provider API prices</label>
          <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.budgets.useProviderRatesForLimits === true} disabled={saving || raw.budgets !== undefined || draft.budgets.providerEstimates === false} onChange={(event) => automatic("budgets", { useProviderRatesForLimits: event.target.checked })} />Use API-price estimates for USD limits (not exact billing caps)</label>}>Otherwise, USD limits need a dated rate you set for each model below.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<h3>Local wind-down policy</h3>}>Reserves budget for one final model call that wraps up the work before a limit is reached. It sees metadata only, not your code or chat; review its checkpoint under Candidates.</SettingsHelp>
          {jsonEditor("winddown", "Budget wind-down policy")}

          <SettingsHelp label="More about this setting" target={<h3>Model-specific USD overrides</h3>}>Your dated input and output rates replace provider prices for that model, including cached input. Without a current rate, USD limits block the call instead of treating it as free.</SettingsHelp>
          {jsonEditor("budgets", "Budget model estimates")}
          <SettingsHelp label="More about this setting" target={<details><summary>Example rates (not Copilot pricing)</summary><pre>{JSON.stringify({ rates: [{ modelId: session?.controls.modelId ?? "replace-with-canonical-model-id", inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }], maxPriceAgeDays: 30 }, null, 2)}</pre></details>}>Replace the example rates with your own. A rate of zero is allowed, but Moguri never assumes zero.</SettingsHelp>
          <button type="button" disabled={saving} onClick={() => void reset("budgets")} aria-label="Restore defaults for price estimates">Restore defaults</button>
          <SettingsHelp label="More about this setting" target={<h3 id="policy-profile-budget" data-policy-target tabIndex={-1}>Current-profile hard policy</h3>}>A hard limit for every session in this profile. Session settings, resets and restarts can't lift it; only removing it here does.</SettingsHelp>
          <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="profile" onDirty={setProfileBudgetDirty} disabled={dirty || saving} />
          <SettingsHelp label="More about this setting" target={<h3 id="policy-global-budget" data-policy-target tabIndex={-1}>Global hard policy</h3>}>A hard limit across every profile. Creating or switching profiles doesn't reset its usage.</SettingsHelp>
          {profileCatalog && <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="global" globalPolicy={profileCatalog.globalBudget} onDirty={setGlobalBudgetDirty} disabled={dirty || saving} />}
        </>}
        {tab === "localModels" && <><SettingsHelp label="More about this setting" target={<h2>Configured local models</h2>}>Connect an OpenAI-compatible server you run, such as ds4, Ollama or llama.cpp. Saving lists the models on enabled URLs; Moguri never scans your network or downloads weights.</SettingsHelp>
          {jsonEditor("localModels", "Local model endpoints")}
          <SettingsHelp label="More about this setting" target={<details><summary>Endpoint configuration example</summary><pre>{JSON.stringify([{ id: "my-local", name: "My local server", enabled: true, baseUrl: "http://127.0.0.1:8080/v1", auth: "none", models: [{ id: "replace-with-advertised-model-id", name: "My local model", contextWindow: 32768, maxTokens: 4096, imageInput: false }] }], null, 2)}</pre></details>}>Set each model's context window, output limit and image support yourself. Use http:// only on localhost or 127.0.0.1; other URLs need HTTPS.</SettingsHelp>

          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("local.")).map((connection) => <div className="capability-row" key={connection.id}><div><strong>{connection.name}</strong><small>{connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</small></div></div>)}
          <button disabled={dirty || saving} onClick={() => void run(() => sdk.models.refresh())} aria-label="Refresh models">Refresh</button>
          <SettingsHelp label="More about this setting" target={<h3>Endpoint credentials</h3>}>Save the endpoint with bearer or header auth first, then store its key here. Keys stay in this profile's secret store, never in the JSON.</SettingsHelp>
          <label className="setting-field">Credential endpoint<select aria-label="Local model credential endpoint" value={modelEndpoint} onChange={(event) => { setModelEndpoint(event.target.value); setModelKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.localModels.filter((endpoint) => endpoint.enabled && endpoint.auth !== "none").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<SettingsInput type="password" autoComplete="off" value={modelKey} maxLength={32768} onChange={(event) => setModelKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || !modelEndpoint || !modelKey} onClick={() => void run(async () => { await sdk.models.setToken(modelEndpoint, modelKey); setModelKey(""); return "Key stored. Check the endpoint status before choosing a model."; })} aria-label="Store endpoint key">Store</button><button disabled={dirty || saving || !modelEndpoint} onClick={() => void run(() => sdk.models.clearToken(modelEndpoint))} aria-label="Remove endpoint key">Remove</button></div></>}
        {tab === "remote" && <><SettingsHelp label="More about this setting" target={<h2>Remote SSH</h2>}>Runs the agent, its tools and model calls on an SSH host you approve, while history stays on this Mac. Set each project's remotePath in Project settings.</SettingsHelp>
          {jsonEditor("remote", "SSH target (null disables)")}
          <details><summary>Target configuration example</summary><pre>{JSON.stringify({ id: "my-ssh", name: "My SSH host", host: "replace-with-host.example", port: 22, user: "replace-with-ssh-user", hostKey: "ssh-ed25519 replace-with-verified-public-key", identityFile: "/absolute/local/path/to/private-identity", stateDir: "/absolute/private/remote-run-state", command: ["/absolute/remote/path/to/node26", "/absolute/remote/path/to/moguri/dist/remote-bridge.mjs"], allowCopilot: false, models: [] }, null, 2)}</pre></details>
          <Alert as="p" tone="warning" className="settings-warning">Verify the host key yourself and install this same Moguri build on the host. SSH isn't Sandbox isolation, and allowCopilot gives the host short-lived Copilot access.</Alert>

          <div className="button-row"><button aria-label="Probe SSH target" disabled={dirty || saving || remoteBusy || !snapshot.settings.values.remote} onClick={() => void run(async () => { setRemoteBusy(true); try { await sdk.remote.probe(); } finally { try { setRemoteState((await sdk.remote.status()).remote); } finally { setRemoteBusy(false); } } })}>{remoteBusy ? "Probing..." : "Probe"}</button><button disabled={saving || remoteBusy} onClick={() => void reset("remote")} aria-label="Restore defaults for Remote">Restore defaults</button></div>
          {remoteState && <p role="status">{remoteState.ready ? "Ready: " : "Not ready: "}{remoteState.diagnostic}</p>}
          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("remote.")).map((connection) => <p className="fine-print" key={connection.id}>{connection.name}: {connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</p>)}
          <SettingsHelp label="More about this setting" target={<h3>Remote endpoint credentials</h3>}>Keys are tied to this SSH host and model URL; Local keys are never reused here.</SettingsHelp>
          <label className="setting-field">Credential endpoint<select aria-label="Remote model credential endpoint" value={remoteEndpoint} onChange={(event) => { setRemoteEndpoint(event.target.value); setRemoteKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.remote?.models.filter((endpoint) => endpoint.enabled && endpoint.auth === "bearer").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<SettingsInput aria-label="Remote model API key" type="password" autoComplete="off" maxLength={32768} value={remoteKey} onChange={(event) => setRemoteKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint || !remoteKey} onClick={() => void run(async () => { await sdk.remote.setToken(remoteEndpoint, remoteKey); setRemoteKey(""); return "Remote endpoint key stored."; })} aria-label="Store endpoint key">Store</button><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint} onClick={() => void run(() => sdk.remote.clearToken(remoteEndpoint))} aria-label="Remove endpoint key">Remove</button></div>
          <SettingsHelp label="More about this setting" target={<h3>Remote runs</h3>}>If SSH disconnects, Moguri asks the host to stop the run but can't confirm cleanup. Reconcile reads the host's records without rerunning anything.</SettingsHelp>
          {snapshot.executions.length === 0 && <p className="fine-print">No remote runs yet.</p>}
          {snapshot.executions.length > 0 && <label className="setting-field">Inspected remote run<select aria-label="Inspected remote run" value={remoteInspection} onChange={(event) => setRemoteInspection(event.target.value)}>
            <option value="">Not inspected</option>{snapshot.executions.slice(-16).reverse().map((execution) => <option key={execution.id} value={execution.id}>I inspected {execution.target.name} / {execution.id}</option>)}
          </select><span className="fine-print">Recording an inspection doesn't prove the process stopped.</span></label>}
          {snapshot.executions.slice(-16).reverse().map((execution) => <details key={execution.id}><summary>{execution.target.name} / {execution.status} / {execution.cleanup}</summary><p className="path">Run <code>{execution.id}</code></p><p>{execution.diagnostic ?? "Status recorded."}</p>
            <button disabled={remoteBusy || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(() => sdk.remote.reconcile(execution.id))} aria-label="Reconcile receipts">Reconcile</button>
            <button disabled={remoteInspection !== execution.id || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(async () => { await sdk.remote.acknowledge(execution.id, true); setRemoteInspection(""); })}>Record inspection</button></details>)}
          </>}
        {tab === "startup" && <><SettingsHelp label="More about this setting" target={<h2>New-session defaults</h2>}>Defaults apply to new chats only. A session's own choice wins, then the project, this profile, the shared global default and the factory default.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<h3>Shared global model</h3>}>Applies to new chats in every profile unless overridden below. "Last selected" remembers the model you last picked in each profile.</SettingsHelp>
          <label className="setting-field">Global default model<select aria-label="Global default model" disabled={saving} value={!Object.hasOwn(draft.startup.global, "modelId") ? "last-used" : draft.startup.global.modelId ?? "none"} onChange={(event) => {
            const value = event.target.value;
            if (value === "last-used") automaticDefaults({}, ["modelId", "modelOptions"], "global");
            else automaticDefaults({ modelId: value === "none" ? null : value, ...(value === "kupo" ? { kupoMode: draft.startup.global.kupoMode ?? "balanced" } : {}) }, ["modelOptions"], "global");
          }}>
            <option value="last-used">Last selected model and thinking effort</option><option value="none">No selected model</option>
            {draft.startup.global.modelId && !globalDefaultModel && <option value={draft.startup.global.modelId}>Saved unavailable model: {draft.startup.global.modelId}</option>}
            {snapshot.provider.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}
          </select></label>
          {globalDefaultModel?.synthetic ? <label className="setting-field">Global default Kupo mode<select aria-label="Global default Kupo mode" disabled={saving}
            value={draft.startup.global.kupoMode ?? "legacy"} onChange={(event) => automaticDefaults({ kupoMode: parse(KupoModeSchema, event.target.value) }, ["modelOptions"], "global")}>
            {!draft.startup.global.kupoMode && <option value="legacy" disabled>Saved policy; choose a mode</option>}
            {kupoModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name}</option>)}
          </select><small>Kupo rechecks the model, effort and policy before every billed call.</small></label> :
          draft.startup.global.modelId && <label className="setting-field">Global default thinking effort<select aria-label="Global default thinking effort" disabled={saving || !globalDefaultModel?.thinkingLevels?.length && !globalDefaultEffort} value={globalDefaultEffort ?? "default"} onChange={(event) => {
            const value = event.target.value;
            if (value === "default") automaticDefaults({ modelOptions: { thinkingEffort: undefined } }, [], "global");
            else {
              const thinkingEffort = globalDefaultModel?.thinkingLevels?.find((effort) => effort === value);
              if (thinkingEffort) automaticDefaults({ modelOptions: { thinkingEffort } }, [], "global");
              else setError("This global default model does not expose that thinking effort. No unsupported option was saved.");
            }
          }}><option value="default">Provider default</option>
            {globalDefaultEffort && !globalDefaultModel?.thinkingLevels?.includes(globalDefaultEffort) && <option value={globalDefaultEffort} disabled>Saved unsupported effort: {globalDefaultEffort}</option>}
            {globalDefaultModel?.thinkingLevels?.map((effort) => <option value={effort} key={effort}>{effort}</option>)}
          </select></label>}

          {snapshot.lastModelSelection ? <p className="fine-print" role="status">Last selected in this profile: {rememberedModel?.name ?? `Saved unavailable model: ${snapshot.lastModelSelection.modelId}`} / {snapshot.lastModelSelection.modelId === "kupo" ?
            `${kupoModes.find((mode) => mode.id === snapshot.lastModelSelection?.kupoMode)?.name ?? "Saved policy"} mode` : `${snapshot.lastModelSelection.thinkingEffort ?? "provider default"} thinking`}.</p> :
            <p className="fine-print" role="status">No model remembered in this profile yet. Moguri won't guess one.</p>}
          <h3>Current-profile overrides</h3>
          <label className="setting-field">Default model<select aria-label="Default model" value={!Object.hasOwn(draft.startup.profile, "modelId") ? "inherit" : draft.startup.profile.modelId ?? "none"} onChange={(event) => event.target.value === "inherit" ? automaticDefaults({}, ["modelId"]) : automaticDefaults({ modelId: event.target.value === "none" ? null : event.target.value,
            ...(event.target.value === "kupo" ? { kupoMode: draft.startup.profile.kupoMode ?? draft.startup.global.kupoMode ?? "balanced", modelOptions: {} } : {}) })}>
            <option value="inherit">Use shared global / last selected model</option><option value="none">No selected model</option>
            {defaultModelId && !defaultModel && <option value={defaultModelId}>Saved unavailable model: {defaultModelId}</option>}
            {snapshot.provider.models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}
          </select></label>
          {defaultModel?.synthetic ? <label className="setting-field">Default Kupo mode<select aria-label="Default Kupo mode" disabled={saving} value={draft.startup.profile.kupoMode ?? "inherit"}
            onChange={(event) => event.target.value === "inherit" ? automaticDefaults({}, ["kupoMode"]) : automaticDefaults({ kupoMode: parse(KupoModeSchema, event.target.value) }, ["modelOptions"])}>
            <option value="inherit">Use shared global / last selected mode</option>{kupoModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name}</option>)}
          </select></label> : <label className="setting-field">Default thinking effort<select aria-label="Default thinking effort" disabled={!defaultModel?.thinkingLevels?.length && !defaultEffort} value={defaultEffort ?? "default"} onChange={(event) => {
            const value = event.target.value;
            if (value === "default") automaticDefaults({ modelOptions: { thinkingEffort: undefined } });
            else {
              const thinkingEffort = defaultModel?.thinkingLevels?.find((effort) => effort === value);
              if (thinkingEffort) automaticDefaults({ modelOptions: { thinkingEffort } });
              else setError("This default model does not expose that thinking effort. No unsupported option was saved.");
            }
          }}>
            <option value="default">Provider default</option>{defaultEffort && !defaultModel?.thinkingLevels?.includes(defaultEffort) && <option value={defaultEffort} disabled>Saved unsupported effort: {defaultEffort}</option>}{defaultModel?.thinkingLevels?.map((effort) => <option value={effort} key={effort}>{effort}</option>)}
          </select></label>}
          <SettingsHelp label="More about this setting" target={<label className="setting-field">Default response verbosity<select aria-label="Default response verbosity" value={draft.startup.profile.verbosity ?? "inherit"} onChange={(event) => event.target.value === "inherit" ? automaticDefaults({}, ["verbosity"]) : automaticDefaults({ verbosity: parse(VerbositySchema, event.target.value) })}>
            <option value="inherit">Use shared global ({draft.startup.global.verbosity ?? "balanced"})</option>
            <option value="dry">Dry</option><option value="minimal">Minimal</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
          </select></label>}>Changes how much the model writes, nothing else. Existing chats keep their setting.</SettingsHelp>
          {jsonEditor("startup", "Global and current-profile startup defaults")}
          {session && <button disabled={saving} onClick={() => {
            if (ownSave.current || raw.startup !== undefined) { setError("Save or reload the startup JSON before changing default controls. Your text is preserved."); return; }
            const profile = structuredClone(session.controls);
            setDraft((current) => ({ ...current, startup: { ...current.startup, profile } }));
            void write({ ...committedValues.current, startup: { ...committedValues.current.startup, profile } }, () => {});
          }} aria-label="Use current controls for this profile">Use current controls</button>}
          <details><summary>Available model IDs</summary>{snapshot.provider.models.map((model) => <p className="fine-print path" key={model.id}>{model.name}: <code>{model.id}</code></p>)}</details>
          <button onClick={() => void reset("startup")} aria-label="Restore profile startup defaults">Restore profile</button>
          <button disabled={dirty || saving || nestedDirty || !profileCatalog} onClick={() => void run(async () => { if (!profileCatalog) throw new Error("Load the actual global preference revision first."); await sdk.profiles.defaults({}, profileCatalog.globalDefaults.revision); return "Shared global startup defaults restored. Existing chats are unchanged."; })} aria-label="Restore global defaults">Restore global</button></>}
        {tab === "instructions" && <><SettingsHelp label="More about this setting" target={<h2>Global user guidance</h2>}>Applies to every chat and project in this profile. Guidance can't change permissions or approve tools.</SettingsHelp><label className="setting-field">User guidance<SettingsTextarea aria-label="Global user guidance" value={draft.instructions} onChange={(event) => change("instructions", event.target.value)} /></label><div className="button-row">{saveButton("instructions", "Save user guidance")}<button onClick={() => void reset("instructions")} aria-label="Restore defaults for user guidance">Restore defaults</button></div>
          <SettingsHelp label="More about this setting" target={<h3>Structured instruction templates</h3>}>Each field saves on its own and applies to new turns. Don't put secrets here.</SettingsHelp>
          <button type="button" onClick={() => change("guidance", { ...readinessGuidance, ...draft.guidance })} aria-label="Load starter for readiness into draft">Load starter</button>
          {GUIDANCE_GROUPS.map((group) => <section className="guidance-group" key={group.label} aria-label={group.label}><h3>{group.label}</h3>{group.fields.map(({ key, label }) => <div className="setting-editor" key={key}>
            <label className="setting-field">{label}<SettingsTextarea aria-label={label} maxLength={65536} value={draft.guidance?.[key] ?? ""} onChange={(event) => change("guidance", { ...draft.guidance, [key]: event.target.value })} /></label>
            <button type="button" className="primary" aria-label={`Save ${label}`} disabled={saving || (draft.guidance?.[key] ?? "") === (committed.guidance?.[key] ?? "")} onClick={() => saveGuidance(key)}>Save</button>
          </div>)}</section>)}</>}
        {tab === "notifications" && <NotificationSettings sdk={sdk} snapshot={snapshot} values={draft.notifications} disabled={saving} onChange={(patch) => automatic("notifications", patch)} onBusy={setSoundsBusy} onError={setError} onOutput={setOutput} />}
        {tab === "project" && <>
          <SettingsHelp label="About configuration projects" target={<label className="setting-field">Project<select ref={configurationSelect} aria-label="Configuration project"
            value={configurationProjectId ?? ""} disabled={dirty || saving || nestedDirty || !snapshot.projects.length} onChange={(event) => {
              const state = sdk.getState(), id = event.target.value;
              if (dirty || nestedDirty || state.status !== "connected" || state.snapshot?.profileId !== snapshot.profileId || !state.snapshot.projects.some((value) => value.id === id)) {
                setError("Choose an available project in this connected profile after saving or discarding edits. No replacement project was selected."); return;
              }
              setDiscardedConfigurationProject(null); selectConfigurationProject(id);
            }}>
            <option value="" disabled>Choose a project</option>
            {snapshot.projects.map((value) => <option key={value.id} value={value.id}>{value.name} ({value.path})</option>)}
            {configurationProjectId && !registeredConfigurationProject && <option value={configurationProjectId} disabled>Unavailable project ({configurationProject?.name ?? configurationProjectId})</option>}
          </select></label>}>Lists the projects in this profile. Choosing one here doesn't affect running chats.</SettingsHelp>
          {configurationProjectId && !registeredConfigurationProject && <Alert as="p" tone="warning" role="alert">This project is no longer in this profile. Your pending edits stay read-only until you discard them.</Alert>}
          {configurationProject && (registeredConfigurationProject || discardedConfigurationProject !== configurationProjectId) ?
            <ProjectSettingsPanel key={configurationProject.id} sdk={sdk} project={configurationProject} available={Boolean(registeredConfigurationProject)}
              discardUnavailable={() => { setDiscardedConfigurationProject(configurationProjectId); setProjectDirty(false); queueMicrotask(() => configurationSelect.current?.focus()); }}
              session={session?.projectId === configurationProject.id ? session : undefined} snapshot={snapshot} onDirty={setProjectDirty} openTerminal={openTerminal} openSession={openSession} /> :
            !configurationProjectId && <p>{snapshot.projects.length ? "Choose a registered project to configure." : "No registered projects in this profile."}</p>}
        </>}
        {tab === "retention" && <><SettingsHelp label="More about this setting" target={<h2>Archived-session retention</h2>}>Deleting a session, or merging its linked PR, also deletes its candidate proposals; archiving keeps them. Artifacts, applied code, worktrees and PRs stay.</SettingsHelp>
          <h3>Encrypted storage</h3><p className="path">{runtime?.directory ?? "Reading the data directory..."}</p>
          <StorageSettings sdk={sdk} disabled={dirty || saving || otherNestedDirty} onBusy={setStorageBusy} prepareMaintenance={prepareMaintenance} />
          <VirtualDiskSettings sdk={sdk} snapshot={snapshot} />
          <h3>Keep awake</h3><label className="check-setting"><SettingsInput type="checkbox" checked={draft.lifecycle?.keepAwake ?? false} onChange={(event) => automatic("lifecycle", { keepAwake: event.target.checked })} />Prevent idle sleep while this profile has work running</label>
          <label className="setting-field">Minutes to stay awake after work finishes<SettingsInput aria-label="Keep-awake tail minutes" type="number" min={0} max={1440} value={draft.lifecycle?.tailMinutes ?? 5} onChange={(event) => change("lifecycle", { keepAwake: draft.lifecycle?.keepAwake ?? false, tailMinutes: Number(event.target.value) })} /></label>
          <button type="button" className="primary" aria-label="Save keep-awake tail" disabled={saving || draft.lifecycle?.tailMinutes === committed.lifecycle?.tailMinutes} onClick={() => {
            const tailMinutes = draft.lifecycle?.tailMinutes ?? 5;
            void write({ ...committedValues.current, lifecycle: { keepAwake: committedValues.current.lifecycle?.keepAwake ?? false, tailMinutes } }, () => {});
          }}>Save</button>
          <p className="fine-print" role="status">Idle-sleep helper: {runtime?.power.status ?? "unobserved"}{runtime?.power.until ? ` until ${new Date(runtime.power.until).toLocaleTimeString()}` : ""}. {runtime?.power.diagnostic ?? "Closing the lid or sleeping manually still works."}</p>
          {runtime?.power.status === "failed" && <button onClick={() => void run(() => sdk.runtime.retryPower())} aria-label="Retry the owned idle-sleep helper">Retry</button>}
          <SettingsHelp label="More about this setting" target={<h3>Automatic retention</h3>}>Only finished sessions qualify; drafts, queued prompts, running subsessions or open consoles keep a session open. Both options start off, with a 7-day default.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmArchive ?? true} onChange={(event) => automatic("retention", { confirmArchive: event.target.checked })} />Confirm before archiving a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmDelete ?? true} onChange={(event) => automatic("retention", { confirmDelete: event.target.checked })} />Confirm before deleting a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmBulkArchive !== false} onChange={(event) => automatic("retention", { confirmBulkArchive: event.target.checked })} />Confirm before archiving multiple sessions</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmBulkDelete !== false} onChange={(event) => automatic("retention", { confirmBulkDelete: event.target.checked })} />Confirm before deleting multiple sessions</label>
          <p className="fine-print">Running sessions always ask before their work stops, even with these confirmations off.</p>
          <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.archiveBranchCleanup !== false} onChange={(event) => automatic("retention", { archiveBranchCleanup: event.target.checked })} />Remove pushed worktrees and branches when archiving</label>}>When an archived session's worktree is clean and every commit is on a remote branch, Moguri removes the worktree and deletes its local branch. Uncommitted, untracked or unpushed work, and ignored files like .env, are always kept. Restoring the session recreates the worktree from the remote branch.</SettingsHelp>
          <label className="setting-field">When archiving a session with subsessions<select aria-label="When archiving a session with subsessions" value={draft.retention.archiveChildren ?? "ask"}
            onChange={(event) => updateChildrenPreference("archive", event.target.value)}><option value="ask">Ask me each time</option><option value="archive">Archive all attached subsessions</option><option value="detach">Detach direct children</option></select></label>
          <label className="setting-field">When deleting a session with subsessions<select aria-label="When deleting a session with subsessions" value={draft.retention.deleteChildren ?? "ask"}
            onChange={(event) => updateChildrenPreference("delete", event.target.value)}><option value="ask">Ask me each time</option><option value="delete">Delete all attached subsessions</option><option value="detach">Detach direct children</option></select></label>
          <p className="fine-print">Archiving or deleting all includes nested subsessions. Detaching keeps direct children and their own subsessions; subagents can't be detached.</p>
          <fieldset className="retention-rules"><legend>Automatic cleanup</legend>
            {retentionRule("Archive completed sessions", draft.retention.archiveCompleted ?? false, (checked) => automatic("retention", { archiveCompleted: checked }),
              draft.retention.archiveAfterDays, "Completed archive days", (value) => automatic("retention", { archiveAfterDays: value }))}
            {retentionRule("Archive sessions whose pull request merged", draft.retention.archiveMerged ?? false, (checked) => automatic("retention", { archiveMerged: checked }),
              draft.retention.archiveMergedAfterDays, "Merged archive days", (value) => automatic("retention", { archiveMergedAfterDays: value }))}
            {retentionRule("Delete archived sessions", draft.retention.deleteArchived, (checked) => automatic("retention", { deleteArchived: checked }),
              draft.retention.afterDays, "Archived retention days", (value) => automatic("retention", { afterDays: value }))}
            <p className="fine-print">Merged sessions count from when Moguri saw the pull request merge. Sessions with unsent drafts or running work are skipped.</p>
          </fieldset>
          <Alert as="p" tone="warning" className="settings-warning">Automatic deletion is permanent and includes candidate proposals. It doesn't touch backups, applied code or PRs.</Alert>
          <button disabled={!snapshot.settings.values.retention.deleteArchived && !snapshot.settings.values.retention.archiveCompleted && !snapshot.settings.values.retention.archiveMerged} onClick={() => void run(() => sdk.command({ type: "retention.run" }))} aria-label="Run cleanup with configured retention">Run cleanup</button>
          <SessionManagement sdk={sdk} snapshot={snapshot} openSession={openSession} onDirty={setSessionsDirty} />
          <h3>Structured answers</h3><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.artifacts.retainAnswers} onChange={(event) => automatic("artifacts", { retainAnswers: event.target.checked })} />Keep my answers to questions as artifacts</label>}>Only your own answers are kept; answers from a model or Autopilot never count as your instructions or permissions.</SettingsHelp>
          <button onClick={() => void reset("artifacts")} aria-label="Restore defaults for answer retention">Restore defaults</button></>}
        {tab === "cache" && <>{session && session.controls.env !== "Local" && <Alert as="p" tone="warning" className="settings-warning">This manages the Local project cache, not packages on the {session.controls.env} host.</Alert>}<DependencyCachePanel key={`${project?.id}-${session?.workspaceId}`} sdk={sdk} project={project} workspaceId={session?.projectId === project?.id ? session?.workspaceId ?? undefined : undefined} /></>}
        {error && <div className="alert-recovery"><Alert className="notice error" role="alert">{error}</Alert><button disabled={saving} onClick={reload} aria-label="Reload current settings">Reload</button></div>}
        {session?.pendingApproval && <div className="alert-recovery"><Alert as="p" className="settings-warning" tone="warning" role="status">The main session needs an approval.</Alert><button className="quiet" onClick={onBack} aria-label="Review exact action">Review</button></div>}
        {tab === "appearance" && <><SettingsHelp label="About appearance" target={<h2>Appearance</h2>}>Dark is Moguri's default theme. System follows your operating system, and the terminal UI shares this choice.</SettingsHelp>
          <label className="setting-field">Theme<select aria-label="Theme" value={draft.appearance.theme} onChange={(event) => automatic("appearance", { theme: event.target.value === "light" ? "light" : event.target.value === "system" ? "system" : "dark" })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label className="setting-field">Color palette<select aria-label="Color palette" value={draft.appearance.palette ?? "moguri"} onChange={(event) => {
            const palette = themePalettes.find((palette) => palette.id === event.target.value);
            if (palette) automatic("appearance", { palette: palette.id });
          }}>{themePalettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.name}</option>)}</select></label>
          <p className="fine-print">{themePalettes.find((palette) => palette.id === (draft.appearance.palette ?? "moguri"))?.description}. Every preset supports Dark and Light.</p>
          <SettingsHelp label="More about this setting" target={<details><summary>Custom element colors</summary>
            <label className="setting-field">Customize mode<select aria-label="Customize color mode" value={customMode} onChange={(event) => setCustomMode(event.target.value === "light" ? "light" : "dark")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
            <div className="theme-color-grid">{(Object.keys(appearanceColors(draft.appearance, customMode)) as ThemeColor[]).map((key) => <label className="setting-field" key={`${customMode}:${key}`}>{key.replace(/[A-Z]/g, (value) => ` ${value.toLowerCase()}`)}
              <SettingsCommitInput type="color" disabled={saving} aria-label={`Custom ${customMode} ${key}`} value={draft.appearance.custom?.[customMode]?.[key] ?? appearanceColors({ theme: customMode }, customMode)[key]} onChange={(event) => change("appearance", { ...draft.appearance,
                custom: { ...draft.appearance.custom, [customMode]: { ...draft.appearance.custom?.[customMode], [key]: event.target.value } } })}
                onCommit={(value) => {
                  // Colors are validated as a set, so commit every pending pick together; a rejected pick stays and is rechecked with the next one.
                  const custom = latestDraft.current.appearance.custom;
                  automatic("appearance", { custom: { ...custom, [customMode]: { ...custom?.[customMode], [key]: value } } });
                }} /></label>)}</div>
          </details>}>Custom colors apply when Custom is selected and save when you pick a color. Combinations with unreadable contrast are rejected.</SettingsHelp>
          <button onClick={() => void reset("appearance")} aria-label="Restore defaults for appearance">Restore defaults</button></>}
        {tab === "compaction" && (() => {
          const value = draft.compaction ?? defaultCompactionSettings(), off = saving || !value.automatic;
          const set = (patch: Partial<typeof value>) => automatic("compaction", patch, false, defaultCompactionSettings());
          const choices = <T extends number>(values: T[], current: T) => [...new Set([...values, current])].sort((a, b) => a - b);
          return <><SettingsHelp label="More about this setting" target={<h2>Context compaction</h2>}>When a chat nears its model's working window, Moguri summarizes older turns with that chat's model. Each summary is a billed model call; the full history stays saved.</SettingsHelp>
            <label className="check-setting"><SettingsInput type="checkbox" aria-label="Compact long chats automatically" checked={value.automatic} disabled={saving} onChange={(event) => set({ automatic: event.target.checked })} />Compact long chats automatically</label>
            <label className="setting-field">Start compacting at<select aria-label="Start compacting at" value={value.triggerFraction} disabled={off} onChange={(event) => set({ triggerFraction: Number(event.target.value) })}>
              {choices([0.5, 0.6, 0.7, 0.75, 0.8, 0.9], value.triggerFraction).map((fraction) => <option key={fraction} value={fraction}>{Math.round(fraction * 100)}% of the working window</option>)}</select></label>
            <label className="setting-field">Token ceiling<select aria-label="Token ceiling" value={value.triggerTokens ?? "none"} disabled={off} onChange={(event) => set({ triggerTokens: event.target.value === "none" ? null : Number(event.target.value) })}>
              {choices([100_000, 200_000, 400_000], value.triggerTokens ?? 200_000).map((tokens) => <option key={tokens} value={tokens}>Start by {tokens.toLocaleString()} tokens</option>)}<option value="none">No ceiling</option></select></label>
            <label className="setting-field">Keep recent turns<select aria-label="Keep recent turns" value={value.keepRecentTurns} disabled={off} onChange={(event) => set({ keepRecentTurns: Number(event.target.value) })}>
              {choices([1, 2, 3, 4, 5], value.keepRecentTurns).map((turns) => <option key={turns} value={turns}>{turns} {turns === 1 ? "turn" : "turns"}</option>)}</select></label>
            <label className="setting-field">Summary length<select aria-label="Summary length" value={value.outputTokens} disabled={off} onChange={(event) => set({ outputTokens: Number(event.target.value) })}>
              {choices([1024, 2048, 4096], value.outputTokens).map((tokens) => <option key={tokens} value={tokens}>Up to {tokens.toLocaleString()} tokens</option>)}</select></label>
            <p className="fine-print">A summary replaces older turns only when it is complete and smaller. Images are never compacted. Type /compact to compact now and /compact restore to bring the original history back.</p>
          </>;
        })()}
        {tab === "interactions" && <><SettingsHelp label="More about this setting" target={<h2>Confirmations</h2>}>Saved per profile. Hiding the terminal pane leaves its consoles running; a console's X button closes it without asking.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmSessionAttachments} disabled={saving} onChange={(event) => automatic("interactions", { confirmSessionAttachments: event.target.checked })} />Ask before attaching content from a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmTerminalClose} disabled={saving} onChange={(event) => automatic("interactions", { confirmTerminalClose: event.target.checked })} />Ask before closing the terminal pane</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmSessionDetach !== false} disabled={saving} onChange={(event) => automatic("interactions", { confirmSessionDetach: event.target.checked })} />Confirm before detaching a child session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmRepositoryImport !== false} disabled={saving} onChange={(event) => automatic("interactions", { confirmRepositoryImport: event.target.checked })} />Ask before importing a repository a chat wrote code in</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.nativeRetryRestaging === true} disabled={saving} onChange={(event) => automatic("interactions", { nativeRetryRestaging: event.target.checked })} />Allow Sandbox model retries from the saved workspace snapshot</label>
          <p className="fine-print">Only when the previous Sandbox VM was cleaned up and nothing else changed. Retries never rerun tools or Git.</p>
          <label className="setting-field">Scheduling in an idle chat<select aria-label="Scheduling in an idle chat" value={draft.interactions.idleScheduleAction ?? "ask"} disabled={saving} onChange={(event) => automatic("interactions", { idleScheduleAction: parse(SettingsSchema.properties.interactions.properties.idleScheduleAction, event.target.value) })}>
            <option value="ask">Ask whether to send now</option><option value="send">Send now without asking</option><option value="schedule">Open scheduling without asking</option>
          </select></label>
          <label className="setting-field">Interrupted chats after a restart<select aria-label="Interrupted chats after a restart" value={draft.interactions.continueInterrupted ?? "ask"} disabled={saving} onChange={(event) => automatic("interactions", { continueInterrupted: parse(SettingsSchema.properties.interactions.properties.continueInterrupted, event.target.value) })}>
            <option value="ask">Ask whether to continue them</option><option value="always">Continue all automatically</option>
          </select></label>
          <p className="fine-print">Continuing asks the agent to check where it left off; nothing it already did is repeated.</p>
          <button type="button" onClick={() => void reset("interactions")} aria-label="Restore defaults for confirmations">Restore defaults</button></>}
        {tab === "systemPrompt" && <><SettingsHelp label="More about this setting" target={<h2>System prompt</h2>}>These are the instructions Moguri sends to models from every client. Edits apply to new turns.</SettingsHelp>
          <Alert as="p" tone="warning" className="settings-warning">{SYSTEM_PROMPT_WARNING}</Alert>
          <label className="setting-field">Editable system prompt<SettingsTextarea aria-label="Editable system prompt" className="prompt-editor" value={draft.systemPrompt} onChange={(event) => change("systemPrompt", event.target.value)} disabled={saving} spellCheck={false} /></label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={risk} onChange={(event) => setRisk(event.target.checked)} />I understand editing this can break Moguri. Permissions still apply.</label>
          <div className="button-row">{saveButton("systemPrompt", "Save system prompt")}<button onClick={() => void reset("systemPrompt")} aria-label="Restore defaults for system prompt">Restore defaults</button><button onClick={() => void run(async () => { const result = await sdk.prompt.preview(session?.id); setPreview(result.effective); })} aria-label="Preview effective committed prompt">Preview</button></div>
          {preview && <details open><summary>Full instructions sent to the model, including execution guidance and approved project knowledge</summary><pre>{preview}</pre></details>}</>}
        {tab === "permissions" && <><SettingsHelp label="About tool approvals" target={<h2 id="policy-tools" data-policy-target tabIndex={-1}>Guardrails and tool guidance</h2>}>File reads, searches and edits run without asking. Scripts, external MCP tools and unlisted websites ask in Manual and Guided; Autopilot and Max approve them, but deny rules, read-only mode and budgets still apply.</SettingsHelp>
          <label className="setting-field">Default tool permission<select aria-label="Default tool permission" value={draft.permissions.defaultDecision ?? "ask"} onChange={(event) => automatic("permissions", { defaultDecision: event.target.value === "deny" ? "deny" : "ask" })}><option value="ask">Ask for scripts and unlisted websites</option><option value="deny">Deny unless a rule allows it</option></select></label>
          <label className="setting-field">Default autonomy<select aria-label="Default autonomy" value={draft.startup.profile.autonomy ?? "inherit"} onChange={(event) => {
            const autonomy = event.target.value;
            if (autonomy === "inherit") automaticDefaults({}, ["autonomy", "automaticApprovals"]);
            else if (autonomy === "Manual" || autonomy === "Guided" || autonomy === "Autopilot" || autonomy === "Autopilot Max") automaticDefaults({ autonomy, automaticApprovals: autonomy === "Autopilot" || autonomy === "Autopilot Max" });
          }}><option value="inherit">Use shared global ({draft.startup.global.autonomy ?? "Manual"})</option><option value="Manual">Manual</option><option value="Guided">Guided</option><option value="Autopilot">Autopilot</option><option value="Autopilot Max">Autopilot Max</option></select></label>
          <WebAllowlistPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={session} project={project}
            disabled={dirty || saving || nonWebNestedDirty} onBusy={setWebBusy} onDirty={setWebDirty} />
          <details className="candidate-section"><summary>Advanced tool and command rules</summary>
            {jsonEditor("permissions", "Tool and exact-command permissions")}</details>

          <SettingsHelp label="About remembered approvals" target={<h3>Remembered approvals</h3>} descriptionFirst>Approvals you chose to remember from an approval card. Revoke one to be asked again.</SettingsHelp>{!snapshot.settings.values.permissions.remembered?.length && <p className="fine-print">No remembered approvals. Choose a scope when approving an action.</p>}
          {snapshot.settings.values.permissions.remembered?.map((grant) => { const scope = grant.scope; return <div className="remembered-approval" key={grant.id}><div><code>{grant.target.kind === "command" ? `${grant.target.command}${grant.target.match === "family" ? " (command family)" : ""}` :
            grant.target.kind === "mcp" ? `${grant.target.serverId}/${grant.target.tool}` : grant.target.tool}</code><small>{grant.env} / {grant.scope.kind === "global" ? "All projects in this profile" :
              scope.kind === "project" ? snapshot.projects.find((entry) => entry.id === scope.projectId)?.name ?? `Project ${scope.projectId}` : scope.kind === "session" ? `Session ${scope.sessionId}` : ""}</small></div>
            <button type="button" disabled={dirty || saving} onClick={() => void run(() => sdk.approvals.revoke(grant.id))}>Revoke</button></div>; })}
          <button type="button" onClick={() => void reset("permissions")} aria-label="Restore defaults for permissions">Restore defaults</button></>}
        {tab === "sendbox" && <>
          <SandboxSetupPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} value={draft.sandboxManagement} disabled={dirty || saving || otherNestedDirty} onBusy={setSandboxBusy} onDirty={setSandboxDraftDirty}
            update={(patch) => automatic("sandboxManagement", patch)} />
          <SettingsHelp label="More about this setting" target={<details className="candidate-section"><summary>Advanced manual configuration</summary>
          {jsonEditor("sandbox", "SendBox configuration")}

          <p className="fine-print" role="status">{snapshot.capabilities.find((capability) => capability.env === "Sandbox")?.reason}</p>
          <label className="check-setting"><SettingsInput type="checkbox" checked={sandboxReviewed} disabled={dirty || saving || sandboxBusy} onChange={(event) => setSandboxReviewed(event.target.checked)} />I reviewed the saved SendBox artifacts, image and network hosts. Verify may start one VM, without model calls.</label>
          <div className="button-row"><button type="button" disabled={dirty || saving || sandboxBusy || !sandboxReviewed || !snapshot.policy.allowedEnvs.includes("Sandbox")} onClick={() => {
            setSandboxBusy(true);
            void run(async () => { await sdk.sandbox.probe(); return sdk.sandbox.status(); }).finally(() => setSandboxBusy(false));
          }} aria-label={sandboxBusy ? "Verifying original native guest..." : "Verify reviewed Sandbox"}>{sandboxBusy ? "Verifying..." : "Verify"}</button>
            <button type="button" disabled={sandboxBusy} onClick={() => void run(() => sdk.sandbox.status())} aria-label="Check Sandbox readiness">Check</button><button type="button" className="quiet" disabled={sandboxBusy} onClick={() => void reset("sandbox")} aria-label="Restore defaults for Sandbox">Restore defaults</button></div></details>}>For custom SendBox builds. Most setups should use the managed setup above.</SettingsHelp>
          {!snapshot.policy.allowedEnvs.includes("Sandbox") && <PolicyHint label="Why Sandbox verification is unavailable" target="environments" navigationBlocked={dirty || saving || sandboxDraftDirty || sandboxBusy ? "Save or reload the current configuration before opening execution policy." : undefined}>Your allowed execution environments exclude Sandbox.</PolicyHint>}
          <SandboxPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} onDirty={setResourceDirty} setup={() => document.getElementById("sandbox-configuration")?.scrollIntoView({ block: "start" })} /></>}
        {tab === "permissions" && <>
          <SettingsHelp label="More about this setting" target={<h3 id="policy-environments" data-policy-target tabIndex={-1}>Allowed execution environments</h3>}>Only you can change this, and it applies to every profile. Excluding Local blocks new Local work; running Local turns may finish.</SettingsHelp>
          <select aria-label="Global allowed environments" value={environmentChoice} onChange={(event) => void run(() => event.target.value === "sandbox" ? sdk.containment.requireSandbox(true) :
            sdk.command({ type: "policy.set", allowedEnvs: event.target.value === "all" ? ["Local", "Sandbox", "Remote"] : event.target.value === "remote" ? ["Remote"] : ["Sandbox", "Remote"] }))}>
            <option value="all">Allow Local, Sandbox and Remote</option><option value="protected">Require Sandbox or Remote</option>
            <option value="sandbox">Require Sandbox (whole-session containment)</option><option value="remote">Require Remote SSH</option>
            {environmentChoice === "custom" && <option value="custom" disabled>Custom: {allowed.join(", ")}</option>}
          </select>
          </>}
        {tab === "memory" && <><SettingsHelp label="More about this setting" target={<h2>Repository memory</h2>}>Builds a local search index and import/symbol graph of your repository. It needs no hosted embedding service or extra API key.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.enabled} onChange={(event) => automatic("memory", { enabled: event.target.checked })} />Enable repository indexing and search</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.useInContext} onChange={(event) => automatic("memory", { useInContext: event.target.checked })} />Add relevant source snippets to model context</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.useTieredContext === true} onChange={(event) => automatic("memory", { useTieredContext: event.target.checked })} />Add reviewed Sky/Terra/Glacier knowledge to model context</label>
          <p className="fine-print">Indexes the selected session's {memoryEnv} checkout, or Local without a session. The index stays on this Mac and skips ignored and protected paths.</p>
          {memoryEnv === "Remote" && <Alert as="p" tone="warning" className="settings-warning">Remote memory indexes the repository on the SSH host. If the host is missing or changes, indexing fails instead of using a Local copy.</Alert>}
          <div className="button-row"><button disabled={memoryBlocked} aria-label={`Index ${memoryEnv} repository`} onClick={() => void runMemory(() => session ? sdk.memory.indexSession(session.id) : sdk.memory.index(project!.id))}>Index {memoryEnv}</button>
            <button disabled={memoryBlocked || !session} onClick={() => void runMemory(() => sdk.memory.state(session!.id))} aria-label="Inspect bound index">Inspect</button>
            <button disabled={memoryBlocked} onClick={() => void runMemory(() => session ? sdk.memory.graphSession(session.id) : sdk.memory.graph(project!.id))} aria-label="View graph of imports and symbols">View graph</button></div>
          <label className="setting-field">Search repository memory<SettingsInput value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={memoryBlocked || !input} onClick={() => void runMemory(() => session ? sdk.memory.searchSession(session.id, input) : sdk.memory.search(project!.id, input))} aria-label="Search vectors">Search</button>
          {memoryJobs.map((job) => <div className="call-record" key={job.id}><strong>{job.memory?.target.env ?? "Local"} repository index / {job.status}</strong>
            <p>{["running", "waiting_input"].includes(job.status) ? job.progress : job.status === "completed" ? "Index complete. Use Inspect to see what it covers." : "Index stopped. Use Inspect to see the last complete index."}</p>{job.error && <Alert as="p" className="inline-error">{job.error}</Alert>}
            {job.memory && <small className="path">{job.memory.target.root}</small>}
            {["running", "waiting_input"].includes(job.status) && <button aria-label={`Stop index ${job.id.slice(0, 8)}`} onClick={() => void runMemory(() => sdk.jobs.cancel(job.id))}>Stop</button>}
          </div>)}
          <SettingsHelp label="More about this setting" target={<h3>Coding-style knowledge</h3>}>Save project conventions that aren't sensitive; they outlast the session. Model suggestions need your approval first.</SettingsHelp>
          <button disabled={!project || !input} onClick={() => void run(() => sdk.memory.remember(project!.id, input))} aria-label="Remember this project convention">Remember</button></>}
        {tab === "subagents" && <><SettingsHelp label="More about this setting" target={<h2>Optional subagents</h2>}>A subagent uses its chat's model and context, can't use tools or change files, and stops when the chat stops. Its usage is tracked separately.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.subagents.enabled} onChange={(event) => automatic("subagents", { enabled: event.target.checked })} />Enable read-only subagents</label>
          <label className="setting-field">Maximum parallel children<select aria-label="Maximum parallel children" value={draft.subagents.maxParallel} onChange={(event) => automatic("subagents", { maxParallel: Number(event.target.value) })}><option value={1}>1</option><option value={2}>2</option></select></label>
          <label className="setting-field">Read-only assignment<SettingsTextarea value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={!session || !input || !snapshot.settings.values.subagents.enabled} onClick={() => void run(() => sdk.subagents.run(session!.id, input))} aria-label="Run bounded subagent">Run</button></>}
        {tab === "skills" && <><SkillGatewaySettings key={sdk.profileId} sdk={sdk} value={draft.skillSources ?? []} change={(sources) => commitSection("skillSources", sources)}
          dirty={sectionDirty("skillSources")} disabled={saving} onDirty={setIntegrationDirty} />
          {resourceSession ? <fieldset className="settings-fields" disabled={dirty || saving || integrationDirty}>
            {(dirty || integrationDirty) && <p className="fine-print">Save or cancel folder changes before reviewing skills for a chat.</p>}
            <SkillAdmissionsPanel key={`${sdk.profileId}:${resourceSession.id}`} sdk={sdk} session={resourceSession} snapshot={snapshot} />
          </fieldset> : <p className="fine-print">Choose a chat above to review which skills it can use.</p>}
          <SkillPublishersSettings key={`${sdk.profileId}:publishers`} sdk={sdk} snapshot={snapshot} /></>}
        {(["skills", "scripts", "plugins"] as const).includes(tab as "skills" | "scripts" | "plugins") && <>{tab === "skills" ? <h3>Imported skills</h3> : <h2>{tab === "scripts" ? "Scripts" : "Plugins"}</h2>}
          <p>{tab === "skills" ? "Import a standard SKILL.md file. Skills add instructions, not tool permissions." : tab === "scripts" ? "Built-in scripts (grep_logs, fetch_page, search_memory and memory_graph) reach the agent through Moguri's internal MCP server." : "A Moguri plugin bundles standard skills. Importing one doesn't run its code or install dependencies."}</p>
          {tab !== "scripts" && <><label className="setting-field">Local {tab === "skills" ? "SKILL.md" : "plugin manifest"} path<SettingsInput value={input} onChange={(event) => setInput(event.target.value)} placeholder={tab === "skills" ? "/path/to/SKILL.md" : "/path/to/moguri-plugin.json"} /></label><button disabled={!project || !input} aria-label={`Import disabled ${tab === "skills" ? "skill" : "plugin"}`} onClick={() => void run(async () => {
            if (tab !== "skills") return sdk.capabilities.importPlugin(project!.id, input);
            const result = await sdk.capabilities.importSkill(project!.id, input);
            setCapabilityProgress(result.notice ?? "Skill imported disabled. Enable it to use it.");
          })}>Import</button></>}
          {tab === "skills" && <><button type="button" aria-label="Enable all skills" disabled={capabilityBusy || !registry.some((entry) => !entry.enabled)}
            onClick={() => toggleSkills(registry.filter((entry) => !entry.enabled), true)}>Enable all</button>
            <p className="fine-print" role="status" aria-label="Skill changes">{capabilityProgress}</p></>}
          {registry.map((entry) => <section className="capability-row" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.description}</small><code>{entry.source} / {entry.contentDigest.slice(0, 12)}</code>
            {tab === "skills" && builtinSlashClash(entry.name) && <Alert as="p" tone="warning" className="skill-clash">{builtinClashNotice(entry.name, builtinSlashClash(entry.name)!)}</Alert>}</div><button onClick={() => void run(() => sdk.capabilities.content(entry.id))}>View source</button>
            {tab === "skills" ? <><label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable skill ${entry.name}`} checked={entry.enabled} disabled={capabilityBusy}
              onChange={(event) => toggleSkills([entry], event.target.checked)} /><span>{entry.enabled ? "Enabled" : "Disabled"}</span></label>
              {entry.ownerPluginId ? <span className="fine-print">Plugin bundle</span> : <button type="button" className="icon-button danger" aria-label={`Delete skill ${entry.name}`} title="Delete skill"
                aria-expanded={deletingSkill === entry.id} disabled={capabilityBusy} onClick={() => setDeletingSkill((current) => current === entry.id ? null : entry.id)}><Icon name="Trash" /></button>}</> :
              <button onClick={() => void run(() => sdk.capabilities.toggle(entry.id, !entry.enabled, entry.revision))}>{entry.enabled ? "Disable" : "Enable"}</button>}
            {deletingSkill === entry.id && <div className="capability-delete" role="group" aria-label={`Confirm deleting skill ${entry.name}`}>
              <span>Delete {entry.name}? Chats that use it lose access.</span>
              <button type="button" disabled={capabilityBusy} onClick={() => setDeletingSkill(null)}>Cancel</button>
              <button type="button" className="danger" disabled={capabilityBusy} onClick={() => deleteSkill(entry)}>Delete skill</button>
            </div>}</section>)}
          {tab === "scripts" && <Alert as="p" tone="warning" className="settings-warning">Custom scripts run as code on this Mac, outside any sandbox. Review the source, approve each call and use only scripts you trust.</Alert>}
          {tab === "scripts" && <><h3>Script reviews</h3>
            <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Let the agent approve scripts with download or decode findings"
              checked={draft.scriptReview?.acceptScannerRisk === true} onChange={(event) => automatic("scriptReview", { acceptScannerRisk: event.target.checked })} />Let the agent approve scripts with download or decode findings</label>}>
              Moguri flags scripts that download and run code, install packages at run time or decode hidden content. By default only you can run those, by forcing them in the review. Turning this on accepts the risk that the agent's own "safe" verdict runs them; normal approvals still apply.</SettingsHelp></>}
          <h3>Optional evolution</h3><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.evolution.enabled} onChange={(event) => automatic("evolution", { enabled: event.target.checked })} />Let models propose skills, scripts and style knowledge for your review</label>}>Approved proposals install disabled; you enable them separately.</SettingsHelp>
          {pending.map((item) => <div className="proposal-row" key={item.id}><strong>{item.name}</strong><span>{item.kind} / {item.actor === "model" ? "Model suggestion" : "User-authored"}</span><button onClick={() => void run(async () => { const content = await sdk.capabilities.proposal(item.id); setProposal({ id: item.id, content: content.content, digest: content.digest }); setReviewed(false); })} aria-label="Review full proposal">Review</button></div>)}
          {proposal && <section className="proposal-review"><h3>Review proposed content</h3><pre>{proposal.content}</pre><code>SHA-256 {proposal.digest}</code><label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this source. Approving it doesn't let it run.</label><div className="button-row"><button disabled={!reviewed} onClick={() => void run(() => sdk.capabilities.decide(proposal.id, true, proposal.digest))} aria-label="Approve disabled capability">Approve disabled</button><button onClick={() => void run(() => sdk.capabilities.decide(proposal.id, false, proposal.digest))}>Reject</button></div></section>}</>}
        {tab === "mcpServers" && <><SettingsHelp label="More about this setting" target={<h2>Tools and MCP</h2>}>Configure MCP servers and choose which integration method the agent tries first. The order is a preference only; it grants no permissions or credentials.</SettingsHelp>
          <h3>Tool preference order</h3>
          <p>Drag a handle or press Alt+Up/Down to reorder. Changes save automatically.</p>
          <ReorderList items={effectiveToolPreferences(draft.toolPreferences).order.map((id) => toolMethods.find((method) => method.id === id)!)}
            scope={`${snapshot.profileId}:tool-preferences`} label="Tool preference order" name={(method) => method.name} disabled={saving}
            change={(methods) => automatic("toolPreferences", { order: methods.map((method) => method.id) })}>
            {(method, index) => <><strong>{index + 1}. {method.name}</strong><p className="fine-print">{method.description}</p></>}
          </ReorderList>
          <SettingsAction label="Reset tool preference order" icon="Refresh" disabled={saving} onClick={() => void reset("toolPreferences")} />
          {session?.controls.env === "Remote" ? <details><summary>Configure backend MCP servers</summary>{jsonEditor("mcpServers", "Configured MCP servers")}</details> : jsonEditor("mcpServers", "Configured MCP servers")}
          <SettingsHelp label="More about this setting" target={<label className="setting-field">Server<select aria-label="Server" value={serverId} onChange={(event) => { setServerId(event.target.value); setTools([]); setSelectedTool(null); }}><option value="builtin">Moguri internal scripts</option>{configuredServers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}{retainedServers.map((id) => <option key={id} value={id}>Stored Remote grant: {id}</option>)}</select></label>} descriptionFirst>Save the server configuration first. Supports stdio and Streamable HTTP; OAuth and bearer credentials stay in your keychain.</SettingsHelp>
          {session?.controls.env === "Remote" && <RemoteMcpPanel key={`${snapshot.profileId}:${session.id}:${serverId}`} sdk={sdk} snapshot={snapshot} session={session} serverId={serverId} disabled={dirty || saving || nestedDirty} />}
          <div className="button-row"><button onClick={() => void run(() => sdk.mcp.servers(session?.id))} aria-label="List configured servers">List</button><button disabled={dirty || saving || serverId !== "builtin" && !selectedServer} onClick={() => void run(async () => { const result = await sdk.mcp.tools(serverId, "", 0, session?.id); setTools(result.tools); return result; })} aria-label="Discover tools">Discover</button><button disabled={serverId !== "builtin" && !selectedServer} onClick={() => void run(() => sdk.mcp.auth(serverId, session?.id))} aria-label="Verify credential status">Verify</button></div>
          {oauthSelected && <McpOAuthPanel key={serverId} sdk={sdk} serverId={serverId} sessionId={session?.id} snapshot={snapshot} />}
          {serverId !== "builtin" && !oauthSelected && <><label className="setting-field">Bearer credential (not saved in settings)<SettingsInput type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label><div className="button-row"><button disabled={!token} onClick={() => void run(async () => { await sdk.mcp.setToken(serverId, token, session?.id); setToken(""); return "Credential stored in the OS keychain."; })} aria-label="Store in keychain">Store</button><SettingsAction label="Remove credential" icon="Close" onClick={() => void run(() => sdk.mcp.clearToken(serverId, session?.id))} /></div></>}
          {tools.map((tool) => <button className="tool-discovery-row" key={tool.name} onClick={() => setSelectedTool(tool)}><strong>{tool.name}</strong><span>{tool.description}</span></button>)}
          {selectedTool && <><h3>{selectedTool.name}</h3>{selectedTool.scope && <p className="fine-print path">Remote SSH / {selectedTool.scope.root}. Callable only on this host and root.</p>}<pre>{JSON.stringify(selectedTool.inputSchema, null, 2)}</pre><label className="setting-field">JSON arguments<SettingsTextarea className="json-editor short" aria-label="Exact MCP JSON arguments" value={argumentsJson} onChange={(event) => setArgumentsJson(event.target.value)} /></label><button disabled={dirty || saving || !session || !!session.turnId || session.kind !== "agent" || session.mode !== "agent" || session.pendingMode === "read-only"} onClick={() => void run(async () => { const args: unknown = JSON.parse(argumentsJson); if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object."); return sdk.mcp.call(session!.id, selectedTool.serverId, selectedTool.name, args as Record<string, unknown>, selectedTool.digest); })} aria-label="Request in main session with exact arguments">Request in main</button><p className="fine-print">Approve the call in the main session, which must be idle.</p></>}
          <pre>moguri mcp --session {session?.id ?? "SESSION_ID"}</pre></>}
        {tab === "voice" && <><SettingsHelp label="More about this setting" target={<h2>Local voice dictation</h2>}>Transcribes speech on this Mac with NVIDIA Nemotron 3.5 ASR. Audio is never sent to a cloud speech service or model provider.</SettingsHelp>
          <p>{voice?.diagnostic ?? "Reading local runtime status..."}</p>
          <h3>Model</h3>
          <p aria-label="Dictation model">{committed.voice.model ? `${committed.voice.model.name} (${committed.voice.model.architecture}, ${committed.voice.model.runtime === "transcribe" ? "transcribe.cpp" : "NeMo-Speech"})` : "Moguri-managed Nemotron 3.5 ASR Streaming 0.6B"}</p>
          {committed.voice.model && <p className="fine-print path">{committed.voice.model.path}<br />Trusted SHA-256 {committed.voice.model.sha256}</p>}
          {committed.voice.model && voice?.model?.trust === "changed" && <Alert as="p" className="inline-error" role="alert">This trusted file changed{voice.model.observedSha256 ? ` (SHA-256 is now ${voice.model.observedSha256})` : ""}. Dictation is blocked until you review and trust it again.</Alert>}
          {(committed.voice.model && voice?.model?.trust === "changed" || committed.voice.model) && <div className="button-row">
            {committed.voice.model && voice?.model?.trust === "changed" && <button type="button" disabled={saving || reviewJob?.status === "running"} onClick={() => reviewModel(committed.voice.model!.path)} aria-label="Review changed file before trusting it again">Review changed file</button>}
            {committed.voice.model && <button type="button" className="quiet" disabled={saving || Boolean(activeVoice)} onClick={() => void run(() => sdk.voice.useManagedModel())} aria-label="Use managed Nemotron model">Use managed Nemotron</button>}
          </div>}
          <SettingsHelp label="About using your own model" target={<h4>Use a model you already have</h4>}>Moguri reads Nemotron, Parakeet, Moonshine and other streaming speech GGUFs in place. It asks again if the file changes, and never copies, moves or deletes it.</SettingsHelp>
          <PathField label="Model file or folder" ariaLabel="Speech model path" value={modelPath} onChange={(value) => { setModelPath(value); setModelSearch(null); }}
            kind="file-or-folder" choose={() => window.moguri.chooseVoiceModel()} chooseLabel="Choose…" chooseAriaLabel="Choose model file or folder"
            onChosen={(path) => findModels(path)} disabled={saving || searchingModels || reviewJob?.status === "running"}
            placeholder="~/.cache/huggingface/… or /path/to/model.gguf">
            <button type="button" disabled={saving || searchingModels || !modelPath.trim() || reviewJob?.status === "running"} onClick={() => findModels(modelPath)} aria-label="Review model at this path">Review</button>
            <button type="button" disabled={saving || searchingModels || reviewJob?.status === "running"} onClick={() => findModels()}>Find installed models</button>
          </PathField>
          <p className="fine-print">Find installed models checks Handy's model folder and your Hugging Face cache, only when you click it.</p>
          {searchingModels && <p role="status">Looking for speech models...</p>}
          {modelSearch && <section className="voice-model-results" aria-label="Found speech models">
            <p className="fine-print">{modelSearch.discovery.models.length ? `Found ${modelSearch.discovery.models.length} speech ${modelSearch.discovery.models.length === 1 ? "model" : "models"}.` : "No speech models found."}
              {modelSearch.discovery.skipped > 0 ? ` Skipped ${modelSearch.discovery.skipped} other model ${modelSearch.discovery.skipped === 1 ? "file" : "files"}, such as language models.` : ""}</p>
            <p className="fine-print path voice-model-searched">Searched: {modelSearch.discovery.searched.map((entry) => entry.found ? entry.path : `${entry.path} (not found)`).join(" · ")}</p>
            {modelSearch.discovery.diagnostic && <Alert as="p" tone="warning">{modelSearch.discovery.diagnostic}</Alert>}
            {modelSearch.discovery.models.length > 0 && <ul className="voice-model-list">{modelSearch.discovery.models.map((model) => {
              const inUse = committed.voice.model?.path === model.path;
              return <li key={model.path} className={model.status === "unsupported" ? "unsupported" : undefined}>
                <div><span className="model-title"><strong>{model.name}</strong><span className={`model-status ${model.status}`}>{inUse ? "In use" : model.status === "streaming" ? "Streaming" : model.status === "review" ? "Checked on review" : "Can't stream"}</span></span>
                  <small>{model.architecture} · {Math.max(1, Math.round(model.bytes / 1024 / 1024))} MiB</small>
                  <small className="path">{model.path}</small>
                  {model.reason && <small>{model.reason}</small>}</div>
                {model.status !== "unsupported" && !inUse && <button type="button" disabled={saving || reviewJob?.status === "running"} aria-label={`Review ${model.name}`} onClick={() => { setModelPath(model.path); reviewModel(model.path); }}>Review</button>}
              </li>;
            })}</ul>}
            {modelSearch.installed && !modelSearch.discovery.models.length && <p className="fine-print">Enter the folder where your models were downloaded, or choose it.</p>}
          </section>}
          {reviewJob?.status === "running" && <div className="button-row"><p role="status">{reviewJob.progress}</p><button type="button" onClick={() => void run(() => sdk.jobs.cancel(reviewJob.id))} aria-label="Cancel model review">Cancel</button></div>}
          {reviewJob && ["failed", "cancelled", "partial"].includes(reviewJob.status) && <Alert as="p" className="inline-error" role="alert">{reviewJob.error ?? `Model review ${reviewJob.status}. Nothing was trusted.`}</Alert>}
          {modelReview?.inspection && <section className="voice-model-review" aria-label="Model review">
            <p><strong>{modelReview.inspection.name}</strong> · {modelReview.inspection.architecture} · {modelReview.inspection.runtime === "transcribe" ? "transcribe.cpp" : "NeMo-Speech"} · streaming · {Math.ceil(modelReview.inspection.bytes / 1024 / 1024)} MiB{modelReview.inspection.license ? ` · license ${modelReview.inspection.license}` : ""}</p>
            <p className="fine-print path">{modelReview.inspection.path}<br />SHA-256 {modelReview.inspection.sha256}</p>
            <div className="button-row"><button type="button" disabled={saving || Boolean(activeVoice)} onClick={() => void run(async () => { await sdk.voice.trustModel(modelReview.jobId); setModelReview(null); })} aria-label="Trust this model">Trust this model</button>
              <button type="button" className="quiet" onClick={() => setModelReview(null)}>Discard review</button></div>
          </section>}
          <label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable voice dictation" checked={committed.voice.enabled !== false}
            disabled={saving || Boolean(voiceDownload || voiceDisable)} onChange={(event) => {
              const enabled = event.target.checked;
              if (enabled && committed.voice.model) { void run(() => sdk.settings.update({ ...committed, voice: { ...committed.voice, enabled: true } }, snapshot.settings.revision)); return; }
              if (enabled && !acceptLicense) { setError("Review the pinned model license and download below before enabling dictation."); return; }
              void run(async () => {
                const result = enabled ? await sdk.voice.enable(true) : await sdk.voice.disable(true);
                if (!result.id) throw new Error("The exact voice lifecycle job was not acknowledged.");
                const job = await sdk.jobs.wait(result.id, { timeoutMs: 300_000 });
                if (job.status !== "completed") throw new Error(job.error ?? `Voice lifecycle ${job.status}. No cleanup or installation success was inferred.`);
              });
            }} />Enable voice dictation</label>
          <p className="fine-print">Turning this off stops dictation in this profile and deletes the managed model, which other profiles share. Your own model files are never deleted.</p>
          <label className="check-setting"><SettingsInput type="checkbox" aria-label="Prepare microphone while composer is focused" checked={Boolean(draft.voice.standby)} disabled={saving || committed.voice.enabled === false}
            onChange={(event) => automatic("voice", { standby: event.target.checked })} />Prepare microphone while a composer is focused</label>
          <p className="fine-print">Keeps the microphone open, without recording, while a composer has focus so dictation starts faster. Requires microphone access you already granted.</p>
          <SettingsHelp label="More about this setting" target={<h3>Microphone and activation</h3>}>Find microphones briefly opens audio to read device names. Recordings stop after two minutes and never overwrite a draft you changed meanwhile.</SettingsHelp>
          <div className="button-row"><button type="button" disabled={devicesBusy || Boolean(activeVoice)} onClick={() => {
            const request = new AbortController(); deviceRequest.current = request; setDevicesBusy(true);
            void run(async () => { try { setMicrophones(await listMicrophones(sdk.profileId, request.signal)); } finally { if (deviceRequest.current === request) { deviceRequest.current = null; setDevicesBusy(false); } } });
          }} aria-label="Find microphones with explicit audio access">Find microphones</button>{devicesBusy && <button type="button" onClick={() => deviceRequest.current?.abort()} aria-label="Cancel microphone discovery">Cancel</button>}</div>
          <label className="setting-field">Voice input device<select aria-label="Voice input device" value={draft.voice.inputDeviceId ?? "default"} disabled={saving || devicesBusy} onChange={(event) => automatic("voice", { inputDeviceId: event.target.value })}><option value="default">System default microphone</option>
            {draft.voice.inputDeviceId && draft.voice.inputDeviceId !== "default" && !microphones.some((device) => device.id === draft.voice.inputDeviceId) && <option value={draft.voice.inputDeviceId}>Saved device; find microphones to check it</option>}
            {microphones.filter((device) => device.id !== "default").map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
          <ShortcutEditor label="Voice shortcut" value={draft.voice.shortcut ?? "Control+Space"} change={(shortcut) => change("voice", { ...draft.voice, shortcut })} save={voiceShortcut} dirty={draft.voice.shortcut !== committed.voice.shortcut} disabled={saving} />
          <label className="check-setting"><SettingsInput type="checkbox" aria-label="Hold dictation shortcut to talk" checked={voiceShortcutMode(draft.voice) === "hold"} disabled={saving}
            onChange={(event) => automatic("voice", { shortcutMode: event.target.checked ? "hold" : "toggle" })} />Hold the dictation shortcut to talk</label>
          <SettingsHelp label="About dictation controls" target={<p className="fine-print">Click the microphone to record, then click again to confirm. {committed.voice.shortcut === "none" ? "No dictation shortcut is assigned." :
            voiceShortcutMode(committed.voice) === "hold" ? <>Hold <kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd> for push-to-talk.</> :
              <>Press <kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd> to record; press again to finish.</>}</p>}>Release the shortcut to finish; uncheck Hold to make it a toggle instead. Dictated words go into the composer and are never sent automatically.</SettingsHelp>
          <SettingsHelp label="About supported dictation languages" target={<label className="setting-field">Language<select aria-label="Dictation language" disabled={saving} value={draft.voice.language} onChange={(event) => automatic("voice", { language: event.target.value })}><option value="auto">Automatic language detection</option>{voice?.languageLocales.map((locale) => <option key={locale.code} value={locale.code} disabled={locale.tier === "adaptation"}>{locale.code} ({locale.tier})</option>)}</select></label>} descriptionFirst>{committed.voice.model ? "Applies to the managed Nemotron model only; your own model handles language itself." : "NVIDIA documents 40 locales: 19 ready, 13 with broad coverage and 8 that need fine-tuning, which stay disabled here."}</SettingsHelp>
          <label className="setting-field">Native speech backend<select aria-label="Native speech backend" disabled={saving} value={draft.voice.backend} onChange={(event) => automatic("voice", { backend: event.target.value === "cpu" ? "cpu" : event.target.value === "metal" ? "metal" : "auto" })}><option value="auto">Automatic</option><option value="cpu">CPU</option><option value="metal" disabled={navigator.platform !== "MacIntel"}>Metal (macOS)</option></select></label>
          {!committed.voice.model && <><label className="check-setting"><SettingsInput type="checkbox" checked={acceptLicense} onChange={(event) => setAcceptLicense(event.target.checked)} />I reviewed OpenMDW-1.1 and approve the {voice ? Math.ceil(voice.bytes / 1024 / 1024) : 708} MiB local model download.</label>
          <div className="button-row"><button className="quiet" onClick={() => void run(() => window.moguri.openExternal("https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b"))} aria-label="View license and model card">View license</button><button disabled={!acceptLicense || voice?.modelReady || Boolean(voiceDownload || voiceDisable)} onClick={() => void run(() => sdk.voice.enable(true))} aria-label="Enable and download voice model">Enable and download</button></div></>}
          {voiceDownload && <div className="button-row"><p role="status">{voiceDownload.progress}</p><button type="button" onClick={() => void run(() => sdk.jobs.cancel(voiceDownload.id))} aria-label="Cancel model download">Cancel</button></div>}
          {voiceDisable && <p role="status">{voiceDisable.progress}</p>}
          {snapshot.jobs.findLast((job) => job.kind === "voice.disable")?.error && <Alert as="p" className="inline-error" role="alert">{snapshot.jobs.findLast((job) => job.kind === "voice.disable")!.error}</Alert>}
          <h3>Dictate into this session</h3><div className="button-row"><button disabled={saving || !session || !voice?.modelReady || !voice.runtimeReady || Boolean(activeVoice) || dictation.state.phase === "starting" || dictation.state.cleanupPending} onClick={() => void dictation.start()} aria-label="Record local microphone">Record</button>
            <button disabled={dictation.state.phase !== "starting" && dictation.state.phase !== "recording" && activeVoice?.kind !== "voice.record"} onClick={() => { if (activeVoice?.kind === "voice.record") void run(() => sdk.voice.stop(activeVoice.id)); else void dictation.finish(); }}>Stop and transcribe</button>
            {(activeVoice || dictation.state.phase === "starting" || dictation.state.cleanupPending) && <button onClick={() => { if (activeVoice && activeVoice.id !== dictation.state.id) void run(() => sdk.jobs.cancel(activeVoice.id)); else void dictation.cancel(); }}>Cancel and discard</button>}</div>
          <p role="status" aria-label="Local microphone status">Microphone: {dictation.state.phase}. {activeVoice?.progress}</p>
          {dictation.state.error && <Alert as="p" className="inline-error" role="alert">{dictation.state.error}</Alert>}
          {lastVoice?.status === "failed" && lastVoice.error !== dictation.state.error && <Alert as="p" className="inline-error" role="alert">{lastVoice.error}</Alert>}
          <PathField label="Or transcribe a WAV file" ariaLabel="Local WAV path" value={input} onChange={setInput} kind="file" extensions={["wav"]} title="Choose a WAV recording"
            placeholder="/path/to/recording.wav or ~/recording.wav">
            <button disabled={saving || !session || !input.trim() || !voice?.modelReady} onClick={() => void run(() => sdk.voice.transcribe(session!.id, localPath(input)))} aria-label="Transcribe local WAV">Transcribe</button>
          </PathField>
          {completedVoice && <>{voiceTranscript?.error ? <Alert as="p" className="inline-error" role="alert">{voiceTranscript.error}</Alert> : <p aria-label="Dictation transcript">{voiceTranscript?.text ?? "Loading the local transcript..."}</p>}
            <div className="button-row"><button disabled={!session || !voiceTranscript?.text} onClick={() => void run(() => sdk.voice.insert(session!.id, completedVoice.id, session!.draft.revision))} aria-label="Insert into saved draft, never send">Insert</button></div></>}
          </>}
      </fieldset></div>
        {output && <details className="settings-result" open><summary>SDK response</summary><pre>{output}</pre></details>}
      </div></div>
  </section></SettingsFieldsProvider>;
}
