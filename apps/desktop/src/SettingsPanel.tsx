import { SettingsAction, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";
import { useEffect, useRef, useState } from "react";
import { CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, defaultClaudeAgentSettings, defaultCodexAgentSettings, isAgentHarnessModel, parse, appearanceColors, themePalettes, shortcutLabel, voiceShortcutMode, GUIDANCE_GROUPS, readinessGuidance, routingModelReady, routingWorkingWindow, VerbositySchema, KupoModeSchema, kupoModes, SettingsSchema, AutomaticKupoSettingsSchema, CompoundSettingsSchema, defaultKupoSettings, defaultKupoCompaction, DEFAULT_ROUTER_PROMPT, SYSTEM_PROMPT_WARNING, effectiveToolPreferences, toolMethods, type ArtifactEditorRequest, type ControlDefaults, type Guidance, type ThemeMode, type ThemeColor, type MoguriSdk, type Project, type Session, type SettingsSection, type Snapshot, type UserSettings, type VoiceStatus, type VoiceModelInspection, type McpToolInfo, type RemoteReadiness, type ProfileCatalog, type ModelInfo } from "../../../packages/sdk/src/index.ts";
import { DependencyCachePanel } from "./DependencyCachePanel.tsx";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel.tsx";
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
import { UpdateSettings } from "./UpdateSettings.tsx";
import { searchSettings, type SettingsTab } from "./settings-catalog.ts";
import { SandboxSetupPanel } from "./SandboxSetupPanel.tsx";
import { SandboxPanel } from "./SandboxPanel.tsx";
import { ArtifactPanel } from "./ArtifactPanel.tsx";
import { CandidatePanel } from "./CandidatePanel.tsx";
import { SettingsFieldsProvider, SettingsHelp } from "./SettingsFields.tsx";
import { SkillGatewaySettings } from "./SkillGatewaySettings.tsx";
import { SkillAdmissionsPanel } from "./SkillAdmissionsPanel.tsx";
import { KupoModelProfiles } from "./KupoModelProfiles.tsx";
import { ProviderPricing } from "./ProviderPricing.tsx";
import { ModelAvailabilityPanel } from "./ModelAvailabilityPanel.tsx";
import { WebAllowlistPanel } from "./WebAllowlistPanel.tsx";
import { PolicyHint, policyLocations, type PolicyFocusRequest } from "./PolicyHint.tsx";
import { ReorderList } from "./ReorderList.tsx";
import { Alert } from "./Alert.tsx";

export type { SettingsTab } from "./settings-catalog.ts";
const modelBoundary = (model: ModelInfo) => model.endpointBoundary === "loopback" ? "execution-host loopback" : "network/hosted";
type AutomaticSection = "appearance" | "memory" | "subagents" | "evolution" | "voice" | "retention" | "artifacts" | "notifications" | "kupo" | "permissions" | "lifecycle" | "shortcuts" | "sandboxManagement" | "budgets" | "toolPreferences";
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
  const groups = searchSettings(search);
  const decisions = useDecisionStatus(sdk, session, snapshot, tab === "decisions");
  const [draft, setDraft] = useState(() => structuredClone(snapshot.settings.values));
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
  const automatic = <K extends AutomaticSection>(section: K, patch: Partial<UserSettings[K]>, replace = false) => {
    if (ownSave.current) { setError("Wait for the current settings save to finish. Your edits are preserved."); return; }
    if (raw[section] !== undefined) { setError("Save or reload this section's JSON before changing its controls. Your text is preserved."); return; }
    const value = replace ? patch : { ...committedValues.current[section], ...patch };
    setDraft((current) => ({ ...current, [section]: replace ? value : { ...current[section], ...patch } }));
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
  const saveRetentionAge = (key: "afterDays" | "archiveAfterDays") => {
    const value = draft.retention[key];
    void write({ ...committedValues.current, retention: { ...committedValues.current.retention, [key]: value } },
      () => setDraft((current) => ({ ...current, retention: { ...current.retention, [key]: value } })));
  };
  const voiceShortcut = () => {
    const shortcut = draft.voice.shortcut ?? "Control+Space";
    void write({ ...committedValues.current, voice: { ...committedValues.current.voice, shortcut } }, () => {});
  };
  const saveShortcut = (key: "commands" | "terminalCopy") => {
    const value = draft.shortcuts?.[key] ?? (key === "commands" ? "Primary+KeyK" : "Primary+Shift+KeyC");
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
      setDeletingSkill(null); setCapabilityProgress(`Deleted skill ${entry.name}. Sessions that admitted it lose access; no other capability or permission changed.`);
    }).finally(() => { capabilityPending.current = false; setCapabilityBusy(false); });
  };
  const toggleSkills = (entries: typeof registry, enabled: boolean) => {
    if (capabilityPending.current) return;
    capabilityPending.current = true; setCapabilityBusy(true);
    const progress = (count: number) => setCapabilityProgress(`${count} of ${entries.length} skill changes acknowledged. Existing source reviews and permissions are unchanged.`);
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
  return <SettingsFieldsProvider><section className="settings-page" aria-label="Moguri settings">
    <header className="settings-toolbar"><button className="icon-button" aria-label="Back to session" title="Back" disabled={saving || sandboxBusy || lineageBusy} onClick={() => { if (dirty || nestedDirty) setError("Save your edit or reload committed settings before leaving."); else onBack(); }}><Icon name="Back" /></button><h1>Settings</h1><span role="status">{saving ? "Saving..." : dirty || nestedDirty ? "Unsaved changes" : "Saved"}</span>{tab !== "project" && <button aria-label="Save settings" disabled={saving || lineageDirty || lineageBusy || !dirty || modelPromptChanged && !risk} className="primary" onClick={() => void save()}>Save</button>}</header>
    <div className="settings-layout" data-settings-tab={tab}><nav aria-label="Settings categories">
      <label className="settings-search"><span className="sr-only">Search settings</span><input type="search" aria-label="Search settings" placeholder="Search settings" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <span className="sr-only" role="status">{search.trim() ? `${groups.reduce((sum, group) => sum + group.items.length, 0)} settings sections found` : ""}</span>
      {groups.map((group) => <section className="settings-category" key={group.label} aria-label={`${group.label} settings`}><h2>{group.label}</h2>{group.items.map((item) => <button key={item.id} disabled={saving || sandboxBusy || lineageBusy} className={tab === item.id ? "selected" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => { if (nestedDirty) { setError("Save or reload this settings edit before changing sections."); return; } setTab(item.id); setOutput(""); setInput(""); }}>{item.label}</button>)}</section>)}
      {!groups.length && <p className="settings-search-empty">No matching settings. Your edits are preserved.</p>}
      <button className="restore-all" disabled={saving || lineageDirty || lineageBusy} onClick={() => void reset("all")}>Restore all defaults</button></nav>
      <div className="settings-content"><fieldset className="settings-fields" disabled={saving && tab !== "voice"}>
        {["artifacts", "candidates", "sendbox", "skills"].includes(tab) && <label className="setting-field">{tab === "skills" ? "Source chat for skill admission" : "Source chat (optional)"}<select aria-label="Settings source chat" value={resourceSessionId} onChange={(event) => {
          if (resourceDirty) { setError("Save or cancel the current resource edit before choosing another source chat."); return; }
          setResourceSessionId(event.target.value);
        }}><option value="">{tab === "skills" ? "Choose a source chat" : "Profile records"}</option>{resourceSessionId && !resourceSession && <option value={resourceSessionId} disabled>Source chat removed</option>}
          {snapshot.sessions.filter((value) => value.kind !== "subagent").map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}
        </select></label>}
        {tab === "artifacts" && <ArtifactPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} projectId={resourceSession?.projectId ?? project?.id ?? null} request={artifactRequest} onDirty={setResourceDirty} onRequestHandled={onArtifactRequestHandled} />}
        {tab === "candidates" && <CandidatePanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} onDirty={setResourceDirty} />}
        {tab === "general" && <><h2>General</h2><ApplicationSettings sdk={sdk} revision={snapshot.profileCatalogRevision ?? 0} onBusy={setApplicationBusy} />
          <OtlpSettings key={sdk.profileId} sdk={sdk} configuration={snapshot.telemetryExport} disabled={dirty || saving || otherNestedDirty || updateBusy || storageBusy} onDirty={setExportDirty} />
          <UpdateSettings sdk={sdk} revision={snapshot.profileCatalogRevision ?? 0} disabled={dirty || saving || otherNestedDirty || storageBusy || exportDirty} onBusy={setUpdateBusy} prepareMaintenance={prepareMaintenance} /><SettingsHelp label="About profiles" target={<h3>Profiles</h3>}>Each profile owns its accounts, projects, instructions and appearance. Switching never moves running work or copies credentials.</SettingsHelp>
          <ProfileSwitcher key={sdk.profileId} sdk={sdk} snapshot={snapshot} disabled={dirty || saving || projectDirty || profileBudgetDirty || globalBudgetDirty || lineageDirty || lineageBusy || exportDirty} expanded={profilesExpanded} setExpanded={setProfilesExpanded} onSwitch={onSwitchProfile} onDirty={setProfilesDirty} /></>}
        {tab === "repositories" && <RepositoryImportPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} onDirty={setRepositoriesDirty}
          configureProject={(id) => {
            if (dirty || saving || nestedDirty) { setError("Finish or discard the current edit before choosing a project. No configuration target was changed."); return; }
            selectConfigurationProject(id); setTab("project");
          }} />}
        {tab === "providers" && <><SettingsHelp label="About model providers" target={<h2>Model providers</h2>}>Model-provider authentication is separate from GitHub repository integration. Configure Local endpoints under Local models. No provider is substituted when a connection fails.</SettingsHelp>
          <p className="settings-lead">Connect the accounts and tools Moguri can use for models. Credentials stay in your OS keychain.</p>
          <SettingsHelp label="About hosted providers" target={<h3>Accounts</h3>}>Connect GitHub Copilot or your own OpenRouter, Anthropic API, OpenAI API or ChatGPT account. Keys and sign-in tokens stay in your OS keychain and never reach the renderer, logs or model context. API keys bill the provider's API; Sign in with ChatGPT uses your ChatGPT plan. Claude.ai subscription sign-in is not offered because Anthropic does not permit it for third-party apps.</SettingsHelp>
          <div className="provider-list">
            <ProviderConnect provider={snapshot.provider} client={sdk} run={run} />
            <HostedProviderConnect provider={snapshot.provider} client={sdk} run={run} disabled={dirty || saving || projectDirty || lineageBusy} />
          </div>
          <SettingsHelp label="About agent harnesses" target={<h3>Agent harnesses</h3>}>Off by default. Each harness runs your own installed command-line agent with your own sign-in; Moguri never installs it or collects its credentials. Local only, Unlimited budget, text and pasted text. Save, then refresh available models to recheck its version and sign-in.</SettingsHelp>
          <div className="provider-list">
            {([["claudeAgent", CLAUDE_AGENT_PROVIDER_ID, "Claude Agent", "claude-code", "Your installed Claude Code, with every tool call approved in Moguri."],
              ["codexAgent", CODEX_AGENT_PROVIDER_ID, "Codex Agent", "codex", "Your installed Codex CLI through codex app-server."]] as const).map(([key, id, name, logo, subtitle]) => {
              const value = { ...(key === "claudeAgent" ? defaultClaudeAgentSettings() : defaultCodexAgentSettings()), ...draft[key] };
              const entry = snapshot.provider.catalogue?.providers.find((provider) => provider.id === id), active = committed[key]?.enabled === true;
              const update = (patch: { enabled?: boolean; executablePath?: string | null }) => key === "claudeAgent" ?
                change("claudeAgent", { ...defaultClaudeAgentSettings(), ...draft.claudeAgent, ...patch }) : change("codexAgent", { ...defaultCodexAgentSettings(), ...draft.codexAgent, ...patch });
              return <ProviderCard key={id} label={`${name} harness`} logo={logo} name={name} subtitle={subtitle}
                status={value.enabled !== active ? undefined : active ? providerStatus(entry?.status, entry?.enabled ?? true) : "disabled"}
                help={{ label: `About ${name}`, content: key === "claudeAgent" ?
                  "Runs your own installed, unmodified Claude Code with your own sign-in. Sign in with `claude auth login` in your terminal; Moguri never installs Claude Code or collects Claude credentials. Claude Code makes its own model calls and runs its own tools after Moguri approves each call. Local only, Unlimited budget, text and pasted text." :
                  "Runs your own installed Codex CLI through `codex app-server` with your own `codex login` (ChatGPT or API key). Moguri never installs Codex or collects Codex credentials. Codex asks Moguri before commands and file changes; anything it runs without asking (its own exec-policy rules, or known-safe reads in older versions) is checked against your policy afterwards. Local only, Unlimited budget, text and pasted text." }}
                actions={<label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable ${name}`} checked={value.enabled === true}
                  onChange={(event) => update({ enabled: event.target.checked })} /><span className="sr-only">Enable {name}</span></label>}>
                {value.enabled && <div className="provider-card-fields">
                  {key === "claudeAgent" && <label className="setting-field">Claude Agent transport<select aria-label="Claude Agent transport" value={draft.claudeAgent?.transport ?? "sdk"}
                    onChange={(event) => change("claudeAgent", { ...defaultClaudeAgentSettings(), ...draft.claudeAgent, transport: event.target.value === "stream-json" ? "stream-json" : "sdk" })}>
                    <option value="sdk">Claude Agent SDK</option><option value="stream-json">Claude Code stream-json protocol</option>
                  </select></label>}
                  <label className="setting-field">{key === "claudeAgent" ? "Claude Code executable" : "Codex executable"}<SettingsInput aria-label={key === "claudeAgent" ? "Claude Code executable" : "Codex executable"}
                    placeholder="Found on PATH or in its install location" value={value.executablePath ?? ""}
                    onChange={(event) => update({ executablePath: event.target.value.trim() || null })} /></label>
                  <p className="fine-print">{key === "claudeAgent" ? "Both transports launch the same executable. Moguri never runs a Claude binary bundled with the SDK." :
                    "Codex models come from your login's `model/list`."} Save, then refresh available models to recheck its version and sign-in.</p>
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
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.chatTitles?.enabled !== false} onChange={(event) =>
            setDraft({ ...draft, chatTitles: { enabled: event.target.checked, modelId: draft.chatTitles?.modelId ?? null } })} />Summarize new chat topics automatically</label>
          <label className="setting-field">Naming model<select aria-label="Chat naming model" value={draft.chatTitles?.modelId ?? ""} onChange={(event) =>
            setDraft({ ...draft, chatTitles: { enabled: draft.chatTitles?.enabled !== false, modelId: event.target.value || null } })}>
            <option value="">Automatic in the original Env</option>
            {draft.chatTitles?.modelId && !snapshot.provider.models.some((model) => model.id === draft.chatTitles!.modelId) &&
              <option value={draft.chatTitles.modelId} disabled>Configured naming model unavailable</option>}
            {snapshot.provider.models.filter((model) => !model.synthetic && !isAgentHarnessModel(model)).map((model) => <option key={model.id} value={model.id}>{model.name} / {model.environments?.join(", ")}</option>)}
          </select></label>
          <p className="fine-print">One tool-less, separately charged call after the first reply, using the first prompt's text. It prefers a configured loopback model, a current price estimate, then the actual solver model. Your Env, budget and chosen names are preserved. Legacy chats are not renamed; saving this setting does not run a model.</p>
        </>}
        {tab === "accessibility" && <><SettingsHelp label="More about this setting" target={<h2>Keyboard shortcuts</h2>}>Record a qualified chord or enter one explicitly. Save applies only its field. Conflicting and protected editing/system chords are rejected; none disables an optional shortcut. Voice uses the same binding in both sections.</SettingsHelp><p>Shortcuts respect composition and text editing. Terminal input belongs to its focused console, not the chat.</p>

          <ShortcutEditor label="Commands shortcut" value={draft.shortcuts?.commands ?? "Primary+KeyK"} change={(commands) => change("shortcuts", { commands, terminalCopy: draft.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC" })} save={() => saveShortcut("commands")} dirty={draft.shortcuts?.commands !== committed.shortcuts?.commands} disabled={saving} />
          <ShortcutEditor label="Terminal copy shortcut" value={draft.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC"} change={(terminalCopy) => change("shortcuts", { commands: draft.shortcuts?.commands ?? "Primary+KeyK", terminalCopy })} save={() => saveShortcut("terminalCopy")} dirty={draft.shortcuts?.terminalCopy !== committed.shortcuts?.terminalCopy} disabled={saving} />
          <ShortcutEditor label="Voice shortcut" value={draft.voice.shortcut ?? "Control+Space"} change={(shortcut) => change("voice", { ...draft.voice, shortcut })} save={voiceShortcut} dirty={draft.voice.shortcut !== committed.voice.shortcut} disabled={saving} />
          <dl className="facts shortcut-map">
            <dt>Send or answer in chat</dt><dd><kbd>Enter</kbd></dd><dt>Insert a new line</dt><dd><kbd>Shift+Enter</kbd></dd>
            <dt>Hold a prompt without running</dt><dd><kbd>Cmd/Ctrl+Enter</kbd></dd><dt>Show held-prompt action</dt><dd>Hold Cmd or Ctrl</dd>
            <dt>Commands</dt><dd><kbd>{shortcutLabel(committed.shortcuts?.commands ?? "Primary+KeyK")}</kbd></dd><dt>Hold to dictate</dt><dd><kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd></dd>
            <dt>Copy terminal selection</dt><dd><kbd>{shortcutLabel(committed.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC")}</kbd></dd><dt>Close a dialog or popover</dt><dd><kbd>Escape</kbd></dd>
            <dt>Resize a focused sidebar separator</dt><dd><kbd>Left / Right</kbd>, <kbd>Home / End</kbd></dd>
            <dt>Move through popover choices</dt><dd><kbd>Up / Down</kbd>, <kbd>Home / End</kbd></dd>
            <dt>Move between controls</dt><dd><kbd>Tab / Shift+Tab</kbd></dd><dt>Activate a focused control</dt><dd><kbd>Enter / Space</kbd></dd>
          </dl></>}
        {tab === "github" && <><GitHubConnectionPanel sdk={sdk} openTerminal={session?.controls.env === "Local" && session.status !== "archived" && snapshot.policy.allowedEnvs.includes("Local") ? openTerminal : undefined} />
          <details><summary>Advanced reviewed Git and GitHub operations</summary><GitHubWorkflowPanel key={`${snapshot.profileId}:${project?.id}:${session?.id}`} sdk={sdk} project={project} session={session} snapshot={snapshot} /></details></>}
        {tab === "linear" && <><LinearConnectionPanel sdk={sdk} onDirty={setIntegrationDirty} />{project ? <LinearWorkflowPanel key={`${snapshot.profileId}:${project.id}`} sdk={sdk} project={project} session={session} snapshot={snapshot} /> : <p className="fine-print">Choose an actual project folder to configure its Linear team and reviewed workflows. No project or account is inherited.</p>}</>}
        {tab === "sql" && <><SettingsHelp label="More about this setting" target={<h2>sql-not-so-lite</h2>}>Connect to a daemon you already run. Moguri never starts it, triggers its Home scan, sends a database path, or exposes its private store. This is a control-plane host connection, not the selected agent's Remote endpoint.</SettingsHelp>
          <label className="setting-field">Existing daemon endpoint<SettingsInput aria-label="SQL daemon endpoint" type="url" value={draft.integrations?.sql.endpoint ?? "http://127.0.0.1:9147"} onChange={(event) => change("integrations", { sql: { enabled: draft.integrations?.sql.enabled ?? false, endpoint: event.target.value } })} /></label>
          <button type="button" className="primary" aria-label="Save SQL daemon endpoint" disabled={saving || draft.integrations?.sql.endpoint === committed.integrations?.sql.endpoint} onClick={() => {
            const endpoint = draft.integrations?.sql.endpoint ?? "http://127.0.0.1:9147";
            void write({ ...committedValues.current, integrations: { sql: { enabled: committedValues.current.integrations?.sql.enabled ?? false, endpoint } } }, () => {});
          }}>Save</button>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.integrations?.sql.enabled ?? false} onChange={(event) => {
            const enabled = event.target.checked, value = committedValues.current.integrations?.sql ?? { enabled: false, endpoint: "http://127.0.0.1:9147" };
            setDraft((current) => ({ ...current, integrations: { sql: { ...current.integrations?.sql ?? value, enabled } } }));
            void write({ ...committedValues.current, integrations: { sql: { ...value, enabled } } }, () => {});
          }} />Enable the explicitly configured existing daemon</label>
          <Alert as="p" tone="warning" className="settings-warning">Upstream's default listener has no authentication/TLS. Prefer loopback; network endpoints require HTTPS. The external daemon controls its own file access. Moguri does not grant it access to encrypted state or manage its scan policy.</Alert>
          <button type="button" disabled={saving || sectionDirty("integrations")} onClick={() => {
            const generation = ++sqlGeneration.current;
            void run(async () => { const value = await sdk.integrations.sqlStatus(); if (generation === sqlGeneration.current) setSql(value.connection); }, () => generation === sqlGeneration.current);
          }} aria-label="Verify daemon connection">Verify</button>
          <button type="button" disabled={saving || sectionDirty("integrations") || !committed.integrations?.sql.enabled} onClick={() => void run(() => window.moguri.openExternal(committed.integrations!.sql.endpoint))} aria-label="Open interface for existing daemon">Open interface</button>
          <p role="status">{sql ? `${sql.healthy ? "Daemon reports healthy" : "Not connected"}${sql.version ? ` / ${sql.version}` : ""}. ${sql.diagnostic}` : "Connection has not been observed. Saving configuration never claims the daemon is connected."}</p></>}
        {tab === "knowledge" && <KnowledgePanel key={`${snapshot.profileId}:${project?.id}:${session?.id}`} sdk={sdk} snapshot={snapshot} project={project} session={session} onDirty={setProjectDirty} />}
        {(tab === "hooks" || tab === "marketplace") && <ExtensionPanel key={`${snapshot.profileId}:${project?.id}:${tab}`} sdk={sdk} snapshot={snapshot} project={project} session={session} mode={tab} onDirty={setProjectDirty} />}
        {tab === "decisions" && <><SettingsHelp label="More about this setting" target={<h2 id="policy-decisions" data-policy-target tabIndex={-1}>Decision providers and Local Max</h2>}>Off by default, with no selected model. Explicitly select a bounded-model System One-compatible transport, exact model ID, output/deadline/call bounds and separate hosted-data consent. Saving never starts inference, selects a solver, changes Env or grants tools.<br /><br />Current Max automatically approves tools; reviewDelegatedTools applies only to retained legacy bounded configurations. Technical questions need kind: technical-choice, an exact question and identical offered choices, with freeform disabled. They are not user-only facts. Steering starts off and selects only original user-authored id/text alternatives; continue and askUser are reserved.</SettingsHelp>
          {jsonEditor("decisions", "Decision provider policy")}
          <details><summary>Available exact model IDs</summary><pre>{JSON.stringify(routingModels.map(({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary }) => ({ id, name, source, environments, contextWindow, maxTokens, endpointBoundary })), null, 2)}</pre></details>

          <Alert as="p" tone="warning" className="settings-warning">Confidence and selected probability are separate, uncalibrated advice. Jev remains unqualified because its documented API cannot enforce the required output-token bound. Remote/native Max stays blocked, never moved to the Local controller. No provider/model fallback, new permission or Git approval.</Alert>
          <SettingsHelp label="More about this setting" target={<h3>Saved-policy readiness</h3>}>After saving, explicitly select Autopilot Max in the composer. Inspect actual model actor, original request, raw output, charges and cancellation under Artifacts / Decision-provider observations. User answers and approvals always win races.</SettingsHelp><p className="fine-print" role="status">{decisions.reason}</p>

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
          }}><option value="auto">Automatic (configured models)</option><option value="single">Explicit Single policy</option><option value="compound">Reviewed worktree Cascade / Critique</option></select></label>
          {draft.kupo.workflow === "auto" ? <>
            <SettingsHelp label="About automatic Kupo" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable automatic Kupo" checked={draft.kupo.enabled} disabled={saving} onChange={(event) => automatic("kupo", { enabled: event.target.checked })} />Enable automatic Kupo for this profile</label>} descriptionFirst>Kupo uses your configured models automatically. No eligible model means no inference. One eligible model always runs directly in Single. With multiple models, Kupo chooses Single, gated Cascade or an eligible independent Critique with at most one revision.</SettingsHelp>
            <SettingsHelp label="About the configured model pool" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow hosted or network routing data" checked={draft.kupo.allowHosted} disabled={saving} onChange={(event) => automatic("kupo", { allowHosted: event.target.checked })} />Allow task history to configured hosted or network models</label>}>Selecting Kupo uses all eligible configured models by default, including models configured later. Turn off network routing to restrict it to execution-host loopback. An optional nonempty approvedModelIds list in the advanced policy narrows the pool. Disable Kupo to allow none. Configuration never starts inference or changes autonomy.</SettingsHelp>
            <SettingsHelp label="About declared model capabilities" target={<h3>Declared capability inventory</h3>}>Categories describe supported inputs, reasoning controls and context, not measured coding quality or latency. Unknown tool support stays unknown. No paid benchmark or extra provider inspection runs during discovery.</SettingsHelp>
            <table aria-label="Kupo model capabilities"><thead><tr><th>Model</th><th>Capabilities</th><th>Tools</th></tr></thead><tbody>
              {sdk.routing.capabilities().map((profile) => <tr key={profile.modelId}><td>{routingModels.find((model) => model.id === profile.modelId)?.name ?? profile.modelId}</td><td>{profile.categories.join(", ")}</td><td>{profile.toolInput === null ? "Unknown" : profile.toolInput ? "Declared" : "Disabled"}</td></tr>)}
            </tbody></table>
            {!sdk.routing.capabilities().length && <p>No eligible configured models. Inspect provider, privacy and environment diagnostics below.</p>}
            <h3>Automatic context compaction</h3>
            <label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable automatic Kupo compaction" disabled={saving}
              checked={draft.kupo.autoCompaction?.enabled === true} onChange={(event) => automatic("kupo", {
                autoCompaction: { ...defaultKupoCompaction(), ...(draft.kupo.workflow === "auto" ? draft.kupo.autoCompaction : {}), enabled: event.target.checked },
              })} />Allow bounded automatic text summaries at safe model boundaries</label>
            <p className="fine-print">Off by default. Enabling explicitly permits Kupo to spend metered compaction calls and apply source-bound summaries, not permissions or human answers. Complete recent turns and original history remain retained and readable. Images are not compacted or silently dropped. Advanced policy sets the exact compactor, trigger fraction, recent turns, output bound and per-turn call limit.</p>
            <Alert as="p" tone="warning" className="settings-warning">Only a selected original response reaches ordinary permissions. New modes require comparable reviewed Cascade evidence or an independent same-cost-class Critique pair. Missing System One/Max transports remain blocked. Sandbox needs fresh exact native-byte qualification; no Local fallback.</Alert>
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

            <SettingsHelp label="More about this setting" target={jsonEditor("kupo", "Complete compound routing policy", saving || lineageBusy)} descriptionFirst>Declare exact Cascade/Critique routes, approved concrete models, hosted-data consent and complete role bounds. The classifier chooses only an eligible declared route. Configuration never selects a model, spends budget, stages code or runs tests.<br /><br />Each Cascade route needs id, pattern: cascade, draftId and escalationId. Each Critique route needs id, pattern: critique, draftId, criticId and lineageReviewId. Use canonical model IDs below, not names or provider family strings. Up to four routes and eight approved role models.</SettingsHelp>

            <details><summary>Available exact model IDs</summary><pre>{JSON.stringify(routingModels, null, 2)}</pre></details>
            <CompoundLineageReview sdk={sdk} models={routingModels} disabled={saving} onDirty={setLineageDirty} onBusy={setLineageBusy}
              onPrepared={(review, draftId, criticId) => {
                const policy = parse(CompoundSettingsSchema, raw.kupo === undefined ? draft.kupo : JSON.parse(raw.kupo));
                const next = { ...policy, lineageReviews: [...policy.lineageReviews, review],
                  routes: policy.routes.map((route) => route.pattern === "critique" && route.draftId === draftId && route.criticId === criticId ? { ...route, lineageReviewId: review.id } : route) };
                setRaw((raw) => ({ ...raw, kupo: JSON.stringify(next, null, 2) }));
              }} />
            <Alert as="p" tone="warning" className="settings-warning">Public Compound requires exact selected-Env source/stages and a separate actual-user staging/test review. Local and pinned SSH use their original roots; native-private work remains physically unqualified until fresh exact-runtime evidence passes. Finite budgets need the selected-boundary reserved finishing policy. Max needs an explicit compatible Decision provider and cannot bypass reviews or hard policy. No fallback.</Alert>
          </> : <><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Enable kupo Single" checked={draft.kupo.enabled} disabled={saving} onChange={(event) => automatic("kupo", { enabled: event.target.checked })} />Enable kupo Single for this profile</label>} descriptionFirst>One tool-less classifier chooses one explicitly approved solver. Both calls are metered and use the existing agent, permissions and execution env. Configuration never selects a model or starts inference.</SettingsHelp>
          <label className="setting-field">Classifier<select aria-label="kupo classifier" value={draft.kupo.classifierModelId ?? ""} disabled={saving} onChange={(event) => automatic("kupo", { classifierModelId: event.target.value || null })}><option value="">Choose a configured classifier</option>
            {draft.kupo.classifierModelId && !routingModels.some((model) => model.id === draft.kupo.classifierModelId) && <option value={draft.kupo.classifierModelId} disabled>Saved unavailable model: {draft.kupo.classifierModelId}</option>}
            {routingModels.map((model) => <option key={model.id} value={model.id} disabled={!routingReady(model)}>{model.name} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}{!routingReady(model) ? " / unavailable for Kupo" : ""}</option>)}</select></label>
          <SettingsHelp label="More about this setting" target={<h3>Approved solvers</h3>}>Approve up to eight actual models. Availability, env, context capacity and output bounds are rechecked before each call; this list is not a guarantee of eligibility.</SettingsHelp>
          {routingModels.length === 0 && <p>No configured models. Connect Copilot or configure a local endpoint first.</p>}
          {routingModels.map((model) => {
            const ready = routingSolverReady(model), approved = draft.kupo.approvedModelIds.includes(model.id);
            return <div key={model.id}><label className="check-setting"><SettingsInput type="checkbox" role="checkbox" aria-label={`Approve solver ${model.name}`} checked={ready && approved} disabled={saving || !ready || !approved && draft.kupo.approvedModelIds.length >= 8}
              onChange={(event) => automatic("kupo", { approvedModelIds: event.target.checked ? [...draft.kupo.approvedModelIds, model.id] : draft.kupo.approvedModelIds.filter((id) => id !== model.id) })} /><span>{model.name}<br /><small className="path">{model.id} / {modelBoundary(model)} / {model.environments?.join(", ") ?? "Local"}{!ready ? " / unavailable for Kupo: inspect environment, privacy, context and output bounds" : ""}</small></span></label>
              {!ready && approved && <button type="button" disabled={saving} aria-label={`Remove unavailable solver ${model.id}`} onClick={() => automatic("kupo", { approvedModelIds: draft.kupo.approvedModelIds.filter((id) => id !== model.id) })}>Remove saved approval</button>}
            </div>;
          })}
          {draft.kupo.approvedModelIds.filter((id) => !routingModels.some((model) => model.id === id)).map((id) => <div key={id}>
            <label className="check-setting"><SettingsInput type="checkbox" role="checkbox" aria-label={`Unavailable solver ${id}`} checked={false} disabled /><span className="path">{id} / unavailable; saved approval is inactive</span></label>
            <button type="button" disabled={saving} aria-label={`Remove unavailable solver ${id}`} onClick={() => automatic("kupo", { approvedModelIds: draft.kupo.approvedModelIds.filter((value) => value !== id) })}>Remove saved approval</button>
          </div>)}
          <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" aria-label="Allow hosted or network routing data" checked={draft.kupo.allowHosted} disabled={saving} onChange={(event) => automatic("kupo", { allowHosted: event.target.checked })} />Allow approved task history to hosted or network classifiers and solvers</label>}>Leave this off for explicitly configured loopback endpoints. A provider's local label does not make a network URL local. Loopback is on the execution host, not proof that a configured proxy never forwards data. Model redirects are blocked. Remote also needs its separately approved SSH host and scoped Copilot grant.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<label className="setting-field">Classifier confidence threshold: {draft.kupo.minimumConfidence.toFixed(2)}<SettingsInput type="range" aria-label="Classifier confidence threshold" min={0} max={1} step={0.01} value={draft.kupo.minimumConfidence} disabled={saving} onChange={(event) => change("kupo", { ...draft.kupo, minimumConfidence: Number(event.target.value) })} /></label>}>This is model-supplied advice, not a calibrated probability or permission. Invalid or low-confidence plans pause without another model or fallback.</SettingsHelp>
          {saveButton("kupo", "Save routing threshold")}

          <Alert as="p" tone="warning" className="settings-warning">Finite Single needs an explicitly configured qualified finishing policy on its selected execution boundary. Images, documents and exact window/effort controls require every actual classifier/solver capability; unsupported context is preserved. This explicit policy remains Single; automatic Cascade/Critique and separately reviewed Compound have their own contracts. Native execution still needs fresh physical qualification. Hard policy is never lifted.</Alert>
          </>}
          <SettingsHelp label="More about this setting" target={<h3>Saved-policy availability</h3>}>After saving, explicitly select kupo in the composer. Changing this policy invalidates pending routed permissions; calls already in flight may still incur usage.</SettingsHelp>{snapshot.routingDiagnostics?.map((diagnostic) => <p className="fine-print" key={diagnostic}>{diagnostic}</p>)}

          {draft.kupo.workflow === "single" && <SettingsHelp label="More about this setting" target={<details><summary>Read the fixed classifier contract</summary><pre>{DEFAULT_ROUTER_PROMPT}</pre></details>}>The editable system prompt still governs the solver. Classifier output is validated data, never solver instructions or a user answer.</SettingsHelp>}
          <button type="button" disabled={saving || lineageDirty || lineageBusy} onClick={() => void reset("kupo")} aria-label="Restore defaults for Kupo">Restore defaults</button>
        </>}
        {tab === "budgets" && <><SettingsHelp label="More about this setting" target={<h2>Budgets and model estimates</h2>}>Session caps and profile policy share one cumulative all-role ledger. Unknown usage is not zero. Exact provider-billing caps are not qualified; finite controls require explicit estimate-based accounting.</SettingsHelp>
          <ProviderPricing sdk={sdk} snapshot={snapshot} />
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.budgets.providerEstimates !== false} disabled={saving || raw.budgets !== undefined} onChange={(event) => automatic("budgets", { providerEstimates: event.target.checked })} />Estimate model costs using originating-provider API prices</label>
          <SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.budgets.useProviderRatesForLimits === true} disabled={saving || raw.budgets !== undefined || draft.budgets.providerEstimates === false} onChange={(event) => automatic("budgets", { useProviderRatesForLimits: event.target.checked })} />I accept fresh API-equivalent estimates for finite USD limits, not exact billing caps</label>}>USD limits otherwise need your explicit dated model rate. Existing hard policy and unknown historical charges still apply. Cached input uses reported subsets; unspecified cache-write TTL uses the highest listed write rate. Reservations include that conservative headroom.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<h3>Explicit Local wind-down policy</h3>}>Off by default. Select an exact available model ID, separate hosted metadata consent and complete output/deadline bounds. A reserved metadata-only finishing role uses the existing all-role ledger; it receives no raw task, code or chat history. Unknown work or a newly stricter cap can still block it.<br /><br />Saving never selects a model or approves Git. Use Candidates / Budget wind-down checkpoints for a separate actual-user accepted-work/new-branch review. Source index/HEAD stay intact; no automatic push, merge or branch deletion. Remote/native wind-down remains unqualified.</SettingsHelp>
          {jsonEditor("winddown", "Budget wind-down policy")}

          <SettingsHelp label="More about this setting" target={<h3>Model-specific USD overrides</h3>}>Your canonical-model dated input/output rates take precedence over provider references. The override input rate applies to every input category, including cache. An expired override is not silently replaced. Missing/stale rates disable USD admission, not a free request.</SettingsHelp>
          {jsonEditor("budgets", "Budget model estimates")}
          <SettingsHelp label="More about this setting" target={<details><summary>Illustrative estimate configuration, not Copilot pricing</summary><pre>{JSON.stringify({ rates: [{ modelId: session?.controls.modelId ?? "replace-with-canonical-model-id", inputUsdPerMillion: 1, outputUsdPerMillion: 2, effectiveAt: new Date().toISOString().slice(0, 10), source: "user-estimate" }], maxPriceAgeDays: 30 }, null, 2)}</pre></details>}>Replace illustrative rates with your own approved estimate. An explicit zero rate is allowed; unknown metadata never supplies zero automatically.</SettingsHelp>
          <button type="button" disabled={saving} onClick={() => void reset("budgets")} aria-label="Restore defaults for price estimates">Restore defaults</button>
          <SettingsHelp label="More about this setting" target={<h3 id="policy-profile-budget" data-policy-target tabIndex={-1}>Current-profile hard policy</h3>}>Applies across this profile's sessions and model-created legs. Unlimited preferences, default resets, source deletion and restart cannot remove this policy or refund accounting. Removing the policy requires this explicit revision-bound action.</SettingsHelp>
          <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="profile" onDirty={setProfileBudgetDirty} disabled={dirty || saving} />
          <SettingsHelp label="More about this setting" target={<h3 id="policy-global-budget" data-policy-target tabIndex={-1}>Global hard policy</h3>}>Applies across every profile. Creating/switching profiles cannot refund global usage or escape unknown held calls. No other profile's task content is disclosed here.</SettingsHelp>
          {profileCatalog && <BudgetLimitEditor sdk={sdk} snapshot={snapshot} scope="global" globalPolicy={profileCatalog.globalBudget} onDirty={setGlobalBudgetDirty} disabled={dirty || saving} />}
        </>}
        {tab === "localModels" && <><SettingsHelp label="More about this setting" target={<h2>Configured local models</h2>}>Connect an OpenAI-compatible server you started, such as ds4, Ollama or llama.cpp. Saving performs bounded model discovery only against enabled URLs. It never scans hosts, downloads weights or selects a model automatically.</SettingsHelp>
          {jsonEditor("localModels", "Local model endpoints")}
          <SettingsHelp label="More about this setting" target={<details><summary>Endpoint configuration example</summary><pre>{JSON.stringify([{ id: "my-local", name: "My local server", enabled: true, baseUrl: "http://127.0.0.1:8080/v1", auth: "none", models: [{ id: "replace-with-advertised-model-id", name: "My local model", contextWindow: 32768, maxTokens: 4096, imageInput: false }] }], null, 2)}</pre></details>}>Declare the actual model limits and image support; discovery never guesses them. HTTP is loopback-only; other explicitly configured endpoints require HTTPS. Unavailable models never fall back to Copilot.</SettingsHelp>

          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("local.")).map((connection) => <div className="capability-row" key={connection.id}><div><strong>{connection.name}</strong><small>{connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</small></div></div>)}
          <button disabled={dirty || saving} onClick={() => void run(() => sdk.models.refresh())} aria-label="Refresh models">Refresh</button>
          <SettingsHelp label="More about this setting" target={<h3>Endpoint credentials</h3>}>Save bearer or header auth configuration first (`"auth": "header"` with `"authHeader": "api-key"` sends the key in that header). Keys bind to the exact endpoint and stay in the profile's secret backend, never this JSON or model context. Plain `headers` must not carry credentials; `"discovery": false` uses only the listed model IDs.</SettingsHelp>
          <label className="setting-field">Credential endpoint<select aria-label="Local model credential endpoint" value={modelEndpoint} onChange={(event) => { setModelEndpoint(event.target.value); setModelKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.localModels.filter((endpoint) => endpoint.enabled && endpoint.auth !== "none").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<SettingsInput type="password" autoComplete="off" value={modelKey} maxLength={32768} onChange={(event) => setModelKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || !modelEndpoint || !modelKey} onClick={() => void run(async () => { await sdk.models.setToken(modelEndpoint, modelKey); setModelKey(""); return "Credential stored. Inspect endpoint discovery status before selecting a model."; })} aria-label="Store endpoint key">Store</button><button disabled={dirty || saving || !modelEndpoint} onClick={() => void run(() => sdk.models.clearToken(modelEndpoint))} aria-label="Remove endpoint key">Remove</button></div></>}
        {tab === "remote" && <><SettingsHelp label="More about this setting" target={<h2>Remote SSH</h2>}>Run the agent, its file/command tools and inference on an explicitly approved SSH host. The local service keeps authority and history. SSH is not SendBox isolation.<br /><br />Set each project's canonical remotePath in Project settings. A localhost model endpoint belongs to the SSH host, not this Mac. Declare remote endpoints in models with the same explicit limits as Local models.<br /><br />Review Remote MCP resources and separate access-forwarding grants under MCP gateway. Selecting Remote never grants MCP access. Explicit user consoles use their own captured SSH owner/root, not a Local shell or SendBox isolation. Repository-memory retrieval and transferred Local scripts remain unavailable.</SettingsHelp>
          {jsonEditor("remote", "SSH target (null disables)")}
          <details><summary>Target configuration example</summary><pre>{JSON.stringify({ id: "my-ssh", name: "My SSH host", host: "replace-with-host.example", port: 22, user: "replace-with-ssh-user", hostKey: "ssh-ed25519 replace-with-verified-public-key", identityFile: "/absolute/local/path/to/private-identity", stateDir: "/absolute/private/remote-run-state", command: ["/absolute/remote/path/to/node26", "/absolute/remote/path/to/moguri/dist/remote-bridge.mjs"], allowCopilot: false, models: [] }, null, 2)}</pre></details>
          <Alert as="p" tone="warning" className="settings-warning">Verify the full public host key out of band. The identity stays on this machine; agent forwarding, tunnels and ambient SSH configuration are disabled. Install this exact Moguri build on the target. Setting allowCopilot grants short-lived model access to that verified host, never a refresh credential or your secret store.</Alert>

          <div className="button-row"><button aria-label="Probe SSH target" disabled={dirty || saving || remoteBusy || !snapshot.settings.values.remote} onClick={() => void run(async () => { setRemoteBusy(true); try { await sdk.remote.probe(); } finally { try { setRemoteState((await sdk.remote.status()).remote); } finally { setRemoteBusy(false); } } })}>{remoteBusy ? "Probing..." : "Probe"}</button><button disabled={saving || remoteBusy} onClick={() => void reset("remote")} aria-label="Restore defaults for Remote">Restore defaults</button></div>
          {remoteState && <p role="status">{remoteState.ready ? "Ready: " : "Not ready: "}{remoteState.diagnostic}</p>}
          {snapshot.provider.connections?.filter((connection) => connection.id.startsWith("remote.")).map((connection) => <p className="fine-print" key={connection.id}>{connection.name}: {connection.status}{connection.diagnostic ? ` / ${connection.diagnostic}` : ""}</p>)}
          <SettingsHelp label="More about this setting" target={<h3>Remote endpoint credentials</h3>}>Keys bind to the verified SSH identity and exact model URL. A host-local key is never silently reused on Remote.</SettingsHelp>
          <label className="setting-field">Credential endpoint<select aria-label="Remote model credential endpoint" value={remoteEndpoint} onChange={(event) => { setRemoteEndpoint(event.target.value); setRemoteKey(""); }}><option value="">Choose endpoint</option>{snapshot.settings.values.remote?.models.filter((endpoint) => endpoint.enabled && endpoint.auth === "bearer").map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select></label>
          <label className="setting-field">API key<SettingsInput aria-label="Remote model API key" type="password" autoComplete="off" maxLength={32768} value={remoteKey} onChange={(event) => setRemoteKey(event.target.value)} /></label>
          <div className="button-row"><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint || !remoteKey} onClick={() => void run(async () => { await sdk.remote.setToken(remoteEndpoint, remoteKey); setRemoteKey(""); return "Remote endpoint key stored in its explicit secret backend."; })} aria-label="Store endpoint key">Store</button><button disabled={dirty || saving || remoteBusy || !remoteState?.ready || !remoteEndpoint} onClick={() => void run(() => sdk.remote.clearToken(remoteEndpoint))} aria-label="Remove endpoint key">Remove</button></div>
          <SettingsHelp label="More about this setting" target={<h3>Owned execution recovery</h3>}>An SSH disconnect requests cancellation, not proof of cleanup. Reconcile existing receipts without replaying work. A partial turn never becomes successful just because late usage arrives.</SettingsHelp>
          {snapshot.executions.length === 0 && <p className="fine-print">No remote runs yet.</p>}
          {snapshot.executions.length > 0 && <label className="setting-field">Inspected remote run<select aria-label="Inspected remote run" value={remoteInspection} onChange={(event) => setRemoteInspection(event.target.value)}>
            <option value="">No remote process inspection confirmed</option>{snapshot.executions.slice(-16).reverse().map((execution) => <option key={execution.id} value={execution.id}>I inspected {execution.target.name} / {execution.id}</option>)}
          </select><span className="fine-print">Your inspection acknowledgement is not proof of containment or cleanup.</span></label>}
          {snapshot.executions.slice(-16).reverse().map((execution) => <details key={execution.id}><summary>{execution.target.name} / {execution.status} / {execution.cleanup}</summary><p className="path">Run <code>{execution.id}</code></p><p>{execution.diagnostic ?? "Owned worker status recorded."}</p>
            <button disabled={remoteBusy || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(() => sdk.remote.reconcile(execution.id))} aria-label="Reconcile receipts">Reconcile</button>
            <button disabled={remoteInspection !== execution.id || snapshot.sessions.some((session) => session.turnId === execution.turnId)} onClick={() => void run(async () => { await sdk.remote.acknowledge(execution.id, true); setRemoteInspection(""); })}>Record inspection</button></details>)}
          </>}
        {tab === "startup" && <><SettingsHelp label="More about this setting" target={<h2>New-session defaults</h2>}>Session overrides win over project, current-profile, shared global and factory values. Global preferences intentionally apply to every profile. Preferences never widen hard policy, and saving does not rewrite existing sessions.</SettingsHelp>
          <SettingsHelp label="More about this setting" target={<h3>Shared global model</h3>}>A fixed global choice applies to new chats in every profile unless overridden below or by the project/session. Changing its model resets its model-specific window/effort defaults, not existing chats. Last selected remembers only explicit selections in each profile, never the last inference or a different profile.</SettingsHelp>
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
            {!draft.startup.global.kupoMode && <option value="legacy" disabled>Retained policy; explicitly choose a mode</option>}
            {kupoModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name}</option>)}
          </select><small>Exact model, supported effort, evaluated class and current policy are checked before every paid request.</small></label> :
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
            `${kupoModes.find((mode) => mode.id === snapshot.lastModelSelection?.kupoMode)?.name ?? "Retained explicit policy"} mode` : `${snapshot.lastModelSelection.thinkingEffort ?? "provider default"} thinking`}.</p> :
            <p className="fine-print" role="status">No model is remembered in this profile. Choose a model explicitly; no model or provider will be guessed.</p>}
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
          </select></label>}>Verbosity changes response guidance, not permissions, context limits or accounting. Existing sessions keep their captured controls.</SettingsHelp>
          {jsonEditor("startup", "Global and current-profile startup defaults")}
          {session && <button onClick={() => change("startup", { ...draft.startup, profile: structuredClone(session.controls) })} aria-label="Use current controls for this profile">Use current controls</button>}
          <details><summary>Available model IDs</summary>{snapshot.provider.models.map((model) => <p className="fine-print path" key={model.id}>{model.name}: <code>{model.id}</code></p>)}</details>
          <button onClick={() => void reset("startup")} aria-label="Restore profile startup defaults">Restore profile</button>
          <button disabled={dirty || saving || nestedDirty || !profileCatalog} onClick={() => void run(async () => { if (!profileCatalog) throw new Error("Load the actual global preference revision first."); await sdk.profiles.defaults({}, profileCatalog.globalDefaults.revision); return "Shared global startup preferences restored. Existing sessions and hard policy were preserved."; })} aria-label="Restore global defaults">Restore global</button></>}
        {tab === "instructions" && <><SettingsHelp label="More about this setting" target={<h2>Global user guidance</h2>}>Applies across this profile's chats and projects, including project-free chats. Guidance cannot change hard permissions, authenticate a server or approve a tool.</SettingsHelp><label className="setting-field">User guidance<SettingsTextarea aria-label="Global user guidance" value={draft.instructions} onChange={(event) => change("instructions", event.target.value)} /></label><div className="button-row">{saveButton("instructions", "Save user guidance")}<button onClick={() => void reset("instructions")} aria-label="Restore defaults for user guidance">Restore defaults</button></div>
          <SettingsHelp label="More about this setting" target={<h3>Structured instruction templates</h3>}>Each Save applies only its adjacent field. Templates enter future model turns; running turns keep their recorded snapshot. Leave contacts and licenses unset until you choose them. Never put secrets here.</SettingsHelp>
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
          </select></label>}>Only registered projects in this profile. Choosing a configuration target never moves running work or changes a session's captured folder.</SettingsHelp>
          {configurationProjectId && !registeredConfigurationProject && <Alert as="p" tone="warning" role="alert">This project is no longer available in this profile; no replacement was selected. Pending edits remain read-only until you explicitly discard them.</Alert>}
          {configurationProject && (registeredConfigurationProject || discardedConfigurationProject !== configurationProjectId) ?
            <ProjectSettingsPanel key={configurationProject.id} sdk={sdk} project={configurationProject} available={Boolean(registeredConfigurationProject)}
              discardUnavailable={() => { setDiscardedConfigurationProject(configurationProjectId); setProjectDirty(false); queueMicrotask(() => configurationSelect.current?.focus()); }}
              session={session?.projectId === configurationProject.id ? session : undefined} snapshot={snapshot} onDirty={setProjectDirty} openTerminal={openTerminal} openSession={openSession} /> :
            !configurationProjectId && <p>{snapshot.projects.length ? "Choose a registered project to configure." : "No registered projects in this profile."}</p>}
        </>}
        {tab === "retention" && <><SettingsHelp label="More about this setting" target={<h2>Archived-session retention</h2>}>Off by default. Permanent session deletion, including archived-session expiry, also deletes every originating candidate and generation proposal, including their proposal records and retention grants. Archiving alone preserves candidates. Ordinary artifacts, applied code, worktrees and external PRs survive. Usage and required accounting remain.<br /><br />Fresh authoritative verification that the exact linked repository/PR merged also deletes its associated candidates, including archived-session candidates, under configured metadata-access policy. Closed or unverified PRs do not trigger deletion.</SettingsHelp>
          <h3>Encrypted storage</h3><p className="path">{runtime?.directory ?? "Reading the authoritative data directory..."}</p>
          <StorageSettings sdk={sdk} disabled={dirty || saving || otherNestedDirty} onBusy={setStorageBusy} prepareMaintenance={prepareMaintenance} />
          <h3>Keep awake</h3><label className="check-setting"><SettingsInput type="checkbox" checked={draft.lifecycle?.keepAwake ?? false} onChange={(event) => automatic("lifecycle", { keepAwake: event.target.checked })} />Prevent idle sleep while this profile owns work</label>
          <label className="setting-field">Minutes after owned work finishes<SettingsInput aria-label="Keep-awake tail minutes" type="number" min={0} max={1440} value={draft.lifecycle?.tailMinutes ?? 5} onChange={(event) => change("lifecycle", { keepAwake: draft.lifecycle?.keepAwake ?? false, tailMinutes: Number(event.target.value) })} /></label>
          <button type="button" className="primary" aria-label="Save keep-awake tail" disabled={saving || draft.lifecycle?.tailMinutes === committed.lifecycle?.tailMinutes} onClick={() => {
            const tailMinutes = draft.lifecycle?.tailMinutes ?? 5;
            void write({ ...committedValues.current, lifecycle: { keepAwake: committedValues.current.lifecycle?.keepAwake ?? false, tailMinutes } }, () => {});
          }}>Save</button>
          <p className="fine-print" role="status">Idle-sleep helper: {runtime?.power.status ?? "unobserved"}{runtime?.power.until ? ` until ${new Date(runtime.power.until).toLocaleTimeString()}` : ""}. {runtime?.power.diagnostic ?? "This does not override manual sleep, lid closure or a remote host's sleep policy."}</p>
          {runtime?.power.status === "failed" && <button onClick={() => void run(() => sdk.runtime.retryPower())} aria-label="Retry the owned idle-sleep helper">Retry</button>}
          <SettingsHelp label="More about this setting" target={<h3>Automatic retention</h3>}>Only actual completion qualifies. Unsent drafts, queues, user input, active descendants, live consoles and uncertain effects keep a session open. Archive and deletion each start off with seven-day factory thresholds.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmArchive ?? true} onChange={(event) => automatic("retention", { confirmArchive: event.target.checked })} />Confirm before archiving a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmDelete ?? true} onChange={(event) => automatic("retention", { confirmDelete: event.target.checked })} />Confirm before deleting a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmBulkArchive !== false} onChange={(event) => automatic("retention", { confirmBulkArchive: event.target.checked })} />Confirm before archiving multiple sessions</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.confirmBulkDelete !== false} onChange={(event) => automatic("retention", { confirmBulkDelete: event.target.checked })} />Confirm before deleting multiple sessions</label>
          <label className="setting-field">When archiving a session with subsessions<select aria-label="When archiving a session with subsessions" value={draft.retention.archiveChildren ?? "ask"}
            onChange={(event) => updateChildrenPreference("archive", event.target.value)}><option value="ask">Ask me each time</option><option value="archive">Archive all attached subsessions</option><option value="detach">Detach direct children</option></select></label>
          <label className="setting-field">When deleting a session with subsessions<select aria-label="When deleting a session with subsessions" value={draft.retention.deleteChildren ?? "ask"}
            onChange={(event) => updateChildrenPreference("delete", event.target.value)}><option value="ask">Ask me each time</option><option value="delete">Delete all attached subsessions</option><option value="detach">Detach direct children</option></select></label>
          <p className="fine-print">Cascade choices include nested descendants. Detaching preserves direct children and keeps their nested hierarchy intact; model-owned subagents cannot be detached. These choices do not bypass owned-work cleanup checks.</p>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.archiveCompleted ?? false} onChange={(event) => automatic("retention", { archiveCompleted: event.target.checked })} />Automatically archive completed sessions after the configured age</label>
          <label className="setting-field">Completed-session archive days<SettingsInput aria-label="Completed archive days" type="number" min={1} max={3650} value={draft.retention.archiveAfterDays ?? 7} onChange={(event) => change("retention", { ...draft.retention, archiveAfterDays: Number(event.target.value) })} /></label>
          <button type="button" className="primary" aria-label="Save archive age" disabled={saving || draft.retention.archiveAfterDays === committed.retention.archiveAfterDays} onClick={() => saveRetentionAge("archiveAfterDays")}>Save</button>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.retention.deleteArchived} onChange={(event) => automatic("retention", { deleteArchived: event.target.checked })} />Automatically delete archived sessions after the configured age</label>
          <label className="setting-field">Days<SettingsInput aria-label="Archived retention days" type="number" min={1} max={3650} value={draft.retention.afterDays} onChange={(event) => change("retention", { ...draft.retention, afterDays: Number(event.target.value) })} /></label>
          <button type="button" className="primary" aria-label="Save retention age" disabled={saving || draft.retention.afterDays === committed.retention.afterDays} onClick={() => saveRetentionAge("afterDays")}>Save</button>
          <Alert as="p" tone="warning" className="settings-warning">Save explicitly to delegate session and candidate deletion. Failed or unconfirmed owned work keeps cleanup visibly pending, never successful. This does not erase external backups, revert applied code or close a PR.</Alert>
          <button disabled={!snapshot.settings.values.retention.deleteArchived && !snapshot.settings.values.retention.archiveCompleted} onClick={() => void run(() => sdk.command({ type: "retention.run" }))} aria-label="Run cleanup with configured retention">Run cleanup</button>
          <SessionManagement sdk={sdk} snapshot={snapshot} openSession={openSession} onDirty={setSessionsDirty} />
          <h3>Structured answers</h3><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.artifacts.retainAnswers} onChange={(event) => automatic("artifacts", { retainAnswers: event.target.checked })} />Retain actual answers as independent artifacts</label>}>On by default. Source question/answer events remain canonical; model or delegated answers never become user instructions or tool permission.</SettingsHelp>
          <button onClick={() => void reset("artifacts")} aria-label="Restore defaults for answer retention">Restore defaults</button></>}
        {tab === "cache" && <>{session && session.controls.env !== "Local" && <Alert as="p" tone="warning" className="settings-warning">This panel explicitly manages the Local project/worktree cache, not packages on the selected {session.controls.env} agent. No remote or Sandbox install is implied.</Alert>}<DependencyCachePanel key={`${project?.id}-${session?.workspaceId}`} sdk={sdk} project={project} workspaceId={session?.projectId === project?.id ? session?.workspaceId ?? undefined : undefined} /></>}
        {error && <div className="alert-recovery"><Alert className="notice error" role="alert">{error}</Alert><button disabled={saving} onClick={reload} aria-label="Reload current settings">Reload</button></div>}
        {session?.pendingApproval && <div className="alert-recovery"><Alert as="p" className="settings-warning" tone="warning" role="status">The main session needs an approval.</Alert><button className="quiet" onClick={onBack} aria-label="Review exact action">Review</button></div>}
        {tab === "appearance" && <><SettingsHelp label="About appearance" target={<h2>Appearance</h2>}>Dark is Moguri's factory theme. This preference is shared by SDK clients; desktop resolves System against the operating system.</SettingsHelp>
          <label className="setting-field">Theme<select aria-label="Theme" value={draft.appearance.theme} onChange={(event) => automatic("appearance", { theme: event.target.value === "light" ? "light" : event.target.value === "system" ? "system" : "dark" })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label className="setting-field">Color palette<select aria-label="Color palette" value={draft.appearance.palette ?? "moguri"} onChange={(event) => {
            const palette = themePalettes.find((palette) => palette.id === event.target.value);
            if (palette) automatic("appearance", { palette: palette.id });
          }}>{themePalettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.name}</option>)}</select></label>
          <p className="fine-print">{themePalettes.find((palette) => palette.id === (draft.appearance.palette ?? "moguri"))?.description}. Every preset supports Dark and Light.</p>
          <SettingsHelp label="More about this setting" target={<details><summary>Custom element colors</summary>
            <label className="setting-field">Customize mode<select aria-label="Customize color mode" value={customMode} onChange={(event) => setCustomMode(event.target.value === "light" ? "light" : "dark")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
            <div className="theme-color-grid">{(Object.keys(appearanceColors(draft.appearance, customMode)) as ThemeColor[]).map((key) => <label className="setting-field" key={`${customMode}:${key}`}>{key.replace(/[A-Z]/g, (value) => ` ${value.toLowerCase()}`)}
              <SettingsInput type="color" aria-label={`Custom ${customMode} ${key}`} value={draft.appearance.custom?.[customMode]?.[key] ?? appearanceColors({ theme: customMode }, customMode)[key]} onChange={(event) => change("appearance", { ...draft.appearance,
                custom: { ...draft.appearance.custom, [customMode]: { ...draft.appearance.custom?.[customMode], [key]: event.target.value } } })} /></label>)}</div>
            {saveButton("appearance", "Save custom theme colors")}
          </details>}>Custom colors apply when Custom is selected. Saving validates text, control, focus, selection and semantic contrast in both modes; unreadable combinations are rejected, not silently replaced.</SettingsHelp>
          <button onClick={() => void reset("appearance")} aria-label="Restore defaults for appearance">Restore defaults</button></>}
        {tab === "interactions" && <><SettingsHelp label="More about this setting" target={<h2>Confirmations</h2>}>Saved in this profile. Hiding a terminal pane leaves its consoles running; the console's X button terminates it without confirmation. Snapshot and ownership checks always apply.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmSessionAttachments} onChange={(event) => change("interactions", { ...draft.interactions, confirmSessionAttachments: event.target.checked })} />Ask before attaching content from a session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmTerminalClose} onChange={(event) => change("interactions", { ...draft.interactions, confirmTerminalClose: event.target.checked })} />Ask before closing the terminal pane</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmSessionDetach !== false} onChange={(event) => change("interactions", { ...draft.interactions, confirmSessionDetach: event.target.checked })} />Confirm before detaching a child session</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.confirmRepositoryImport !== false} onChange={(event) => change("interactions", { ...draft.interactions, confirmRepositoryImport: event.target.checked })} />Ask before importing a repository a chat wrote code in</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.interactions.nativeRetryRestaging === true} onChange={(event) => change("interactions", { ...draft.interactions, nativeRetryRestaging: event.target.checked })} />Allow exact private-snapshot restaging for native model retries</label>
          <p className="fine-print">Off by default. Requires verified original guest cleanup and unchanged request, profile, Env and current permissions. Never captures changed live source or replays tools, Git or unknown work.</p>
          <label className="setting-field">Scheduling in an idle chat<select value={draft.interactions.idleScheduleAction ?? "ask"} onChange={(event) => change("interactions", { ...draft.interactions, idleScheduleAction: parse(SettingsSchema.properties.interactions.properties.idleScheduleAction, event.target.value) })}>
            <option value="ask">Ask whether to send now</option><option value="send">Send now without asking</option><option value="schedule">Open scheduling without asking</option>
          </select></label>
          <button type="button" onClick={() => void reset("interactions")} aria-label="Restore defaults for confirmations">Restore defaults</button></>}
        {tab === "systemPrompt" && <><SettingsHelp label="More about this setting" target={<h2>System prompt</h2>}>These are Moguri's actual model instructions, not a desktop-only copy. Edits apply to new turns; running turns keep their recorded instruction snapshot.</SettingsHelp>
          <Alert as="p" tone="warning" className="settings-warning">{SYSTEM_PROMPT_WARNING}</Alert>
          <label className="setting-field">Editable system prompt<SettingsTextarea aria-label="Editable system prompt" className="prompt-editor" value={draft.systemPrompt} onChange={(event) => change("systemPrompt", event.target.value)} disabled={saving} spellCheck={false} /></label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={risk} onChange={(event) => setRisk(event.target.checked)} />I understand this can break functionality. Hard permissions cannot be overridden.</label>
          <div className="button-row">{saveButton("systemPrompt", "Save system prompt")}<button onClick={() => void reset("systemPrompt")} aria-label="Restore defaults for system prompt">Restore defaults</button><button onClick={() => void run(async () => { const result = await sdk.prompt.preview(session?.id); setPreview(result.effective); })} aria-label="Preview effective committed prompt">Preview</button></div>
          {preview && <details open><summary>Effective committed instructions, including protected execution guidance and approved project knowledge</summary><pre>{preview}</pre></details>}</>}
        {tab === "permissions" && <><SettingsHelp label="About tool approvals" target={<h2 id="policy-tools" data-policy-target tabIndex={-1}>Guardrails and tool guidance</h2>}>Native file reads, searches, data queries and edits run without factory prompts. Scripts, external MCPs and unlisted websites ask in Manual/Guided unless explicitly delegated. Explicit Autopilot and Max selections automatically approve qualified tools and commands, including ask rules, without permission prompts. Hard denies, read-only modes, environment policy, authentication, source qualification and budgets still win. Questions requiring actual user facts are not tool permissions.</SettingsHelp>
          <label className="setting-field">Default tool permission<select aria-label="Default tool permission" value={draft.permissions.defaultDecision ?? "ask"} onChange={(event) => automatic("permissions", { defaultDecision: event.target.value === "deny" ? "deny" : "ask" })}><option value="ask">Ask for scripts and unlisted websites</option><option value="deny">Deny unless an explicit rule permits review or access</option></select></label>
          <label className="setting-field">Default autonomy<select aria-label="Default autonomy" value={draft.startup.profile.autonomy ?? "inherit"} onChange={(event) => {
            const autonomy = event.target.value;
            if (autonomy === "inherit") automaticDefaults({}, ["autonomy", "automaticApprovals"]);
            else if (autonomy === "Manual" || autonomy === "Guided" || autonomy === "Autopilot" || autonomy === "Autopilot Max") automaticDefaults({ autonomy, automaticApprovals: autonomy === "Autopilot" || autonomy === "Autopilot Max" });
          }}><option value="inherit">Use shared global ({draft.startup.global.autonomy ?? "Manual"})</option><option value="Manual">Manual</option><option value="Guided">Guided</option><option value="Autopilot">Autopilot</option><option value="Autopilot Max">Autopilot Max</option></select></label>
          <WebAllowlistPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={session} project={project}
            disabled={dirty || saving || nonWebNestedDirty} onBusy={setWebBusy} onDirty={setWebDirty} />
          <details className="candidate-section"><summary>Advanced tool and command rules</summary>
            {jsonEditor("permissions", "Tool and exact-command permissions")}</details>

          <SettingsHelp label="About remembered approvals" target={<h3>Remembered approvals</h3>} descriptionFirst>A tool rule has id, tool, decision (ask/allow/deny), and a project-relative pathPrefix. Remember commands or conservative command families from the approval card. MCP grants bind the actual server, tool and schema; annotations never count as approval.</SettingsHelp>{!snapshot.settings.values.permissions.remembered?.length && <p className="fine-print">No remembered approvals. Choose a scope when approving an action.</p>}
          {snapshot.settings.values.permissions.remembered?.map((grant) => { const scope = grant.scope; return <div className="remembered-approval" key={grant.id}><div><code>{grant.target.kind === "command" ? `${grant.target.command}${grant.target.match === "family" ? " (command family)" : ""}` :
            grant.target.kind === "mcp" ? `${grant.target.serverId}/${grant.target.tool}` : grant.target.tool}</code><small>{grant.env} / {grant.scope.kind === "global" ? "All projects in this profile" :
              scope.kind === "project" ? snapshot.projects.find((entry) => entry.id === scope.projectId)?.name ?? `Project ${scope.projectId}` : scope.kind === "session" ? `Session ${scope.sessionId}` : ""}</small></div>
            <button type="button" disabled={dirty || saving} onClick={() => void run(() => sdk.approvals.revoke(grant.id))}>Revoke</button></div>; })}
          <button type="button" onClick={() => void reset("permissions")} aria-label="Restore defaults for permissions">Restore defaults</button></>}
        {tab === "sendbox" && <><SettingsHelp label="About Sandbox" target={<h2 id="sandbox-configuration">Sandbox</h2>}>Sandbox is a real execution boundary, not a badge. Missing or unqualified prerequisites block protected turns, without Local fallback.</SettingsHelp>
          <SandboxSetupPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} value={draft.sandboxManagement} disabled={dirty || saving || otherNestedDirty} onBusy={setSandboxBusy} onDirty={setSandboxDraftDirty}
            update={(patch) => automatic("sandboxManagement", patch)} />
          <SettingsHelp label="More about this setting" target={<details className="candidate-section"><summary>Advanced manual configuration</summary>
          {jsonEditor("sandbox", "SendBox configuration")}

          <p className="fine-print" role="status">{snapshot.capabilities.find((capability) => capability.env === "Sandbox")?.reason}</p>
          <label className="check-setting"><SettingsInput type="checkbox" checked={sandboxReviewed} disabled={dirty || saving || sandboxBusy} onChange={(event) => setSandboxReviewed(event.target.checked)} />I reviewed these committed native artifacts, image and network hosts. Verification may start one model-free VM.</label>
          <div className="button-row"><button type="button" disabled={dirty || saving || sandboxBusy || !sandboxReviewed || !snapshot.policy.allowedEnvs.includes("Sandbox")} onClick={() => {
            setSandboxBusy(true);
            void run(async () => { await sdk.sandbox.probe(); return sdk.sandbox.status(); }).finally(() => setSandboxBusy(false));
          }} aria-label={sandboxBusy ? "Verifying original native guest..." : "Verify reviewed Sandbox"}>{sandboxBusy ? "Verifying..." : "Verify"}</button>
            <button type="button" disabled={sandboxBusy} onClick={() => void run(() => sdk.sandbox.status())} aria-label="Check Sandbox readiness">Check</button><button type="button" className="quiet" disabled={sandboxBusy} onClick={() => void reset("sandbox")} aria-label="Restore defaults for Sandbox">Restore defaults</button></div></details>}>Manual configurations keep their exact artifact and host scope. Managed setup supplies compatible pins and separately enables selected-provider aliases. Custom worker builds must match this app's protocol; changing JSON cannot upgrade old bytes.</SettingsHelp>
          {!snapshot.policy.allowedEnvs.includes("Sandbox") && <PolicyHint label="Why Sandbox verification is unavailable" target="environments" navigationBlocked={dirty || saving || sandboxDraftDirty || sandboxBusy ? "Save or reload the current configuration before opening execution policy." : undefined}>Global execution policy excludes Sandbox. Qualification does not override that policy; opening its setting starts no VM.</PolicyHint>}
          <SandboxPanel key={sdk.profileId} sdk={sdk} snapshot={snapshot} session={resourceSession} onDirty={setResourceDirty} setup={() => document.getElementById("sandbox-configuration")?.scrollIntoView({ block: "start" })} /></>}
        {tab === "permissions" && <>
          <SettingsHelp label="More about this setting" target={<h3 id="policy-environments" data-policy-target tabIndex={-1}>Allowed execution environments</h3>}>Changing global allowed-env policy is user-only. Excluding Local blocks new work; already-running Local turns may finish under their recorded revision.<br /><br />Local and ordinary SSH own known process groups, not arbitrary double-forked/setsid descendants. Whole-session containment requires the qualified owned VM and verified VM teardown; a CLI exit is not proof. Missing qualification blocks work instead of switching environments. Resetting ordinary settings never widens this separate policy.</SettingsHelp>
          <select aria-label="Global allowed environments" value={environmentChoice} onChange={(event) => void run(() => event.target.value === "sandbox" ? sdk.containment.requireSandbox(true) :
            sdk.command({ type: "policy.set", allowedEnvs: event.target.value === "all" ? ["Local", "Sandbox", "Remote"] : event.target.value === "remote" ? ["Remote"] : ["Sandbox", "Remote"] }))}>
            <option value="all">Allow Local, Sandbox and Remote</option><option value="protected">Require Sandbox or Remote</option>
            <option value="sandbox">Require qualified SendBox for whole-session containment</option><option value="remote">Require configured Remote SSH</option>
            {environmentChoice === "custom" && <option value="custom" disabled>Current explicit set: {allowed.join(", ")}</option>}
          </select>
          </>}
        {tab === "memory" && <><SettingsHelp label="More about this setting" target={<h2>Repository memory</h2>}>A persistent lexical-vector index and import/symbol graph, isolated by profile and actual repository identity. No hosted embedding provider or extra model key. Changed or ignored sources are marked stale, never silently treated as current.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.enabled} onChange={(event) => automatic("memory", { enabled: event.target.checked })} />Enable explicit repository indexing and retrieval</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.useInContext} onChange={(event) => automatic("memory", { useInContext: event.target.checked })} />Allow bounded retrieved source snippets to enter model context</label>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.memory.useTieredContext === true} onChange={(event) => automatic("memory", { useTieredContext: event.target.checked })} />Allow reviewed Sky/Terra/Glacier knowledge in model context</label>
          <p className="fine-print">Source capture and freshness checks follow the selected session's {memoryEnv} root. Without a session, project actions are explicitly Local. The derived text/vector cache stays on the control plane; selected snippets may enter the chosen model's context. Protected/ignored paths are excluded. Save before indexing; opening this page never scans or probes a host.</p>
          {memoryEnv === "Remote" && <Alert as="p" tone="warning" className="settings-warning">Pinned SSH repository memory, not a Local index or SendBox isolation. Inspect the bound index for its actual peer/root/build. Missing or changed hosts fail without fallback.</Alert>}
          <div className="button-row"><button disabled={memoryBlocked} aria-label={`Index ${memoryEnv} repository`} onClick={() => void runMemory(() => session ? sdk.memory.indexSession(session.id) : sdk.memory.index(project!.id))}>Index {memoryEnv}</button>
            <button disabled={memoryBlocked || !session} onClick={() => void runMemory(() => sdk.memory.state(session!.id))} aria-label="Inspect bound index">Inspect</button>
            <button disabled={memoryBlocked} onClick={() => void runMemory(() => session ? sdk.memory.graphSession(session.id) : sdk.memory.graph(project!.id))} aria-label="View graph of imports and symbols">View graph</button></div>
          <label className="setting-field">Search repository memory<SettingsInput value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={memoryBlocked || !input} onClick={() => void runMemory(() => session ? sdk.memory.searchSession(session.id, input) : sdk.memory.search(project!.id, input))} aria-label="Search vectors">Search</button>
          {memoryJobs.map((job) => <div className="call-record" key={job.id}><strong>{job.memory?.target.env ?? "Local"} repository index / {job.status}</strong>
            <p>{["running", "waiting_input"].includes(job.status) ? job.progress : job.status === "completed" ? "Complete captured index published. Inspect its binding and source digest." : "Index settled. Inspect its outcome and the last complete bound cache."}</p>{job.error && <Alert as="p" className="inline-error">{job.error}</Alert>}
            {job.memory && <small className="path">{job.memory.target.root}</small>}
            {["running", "waiting_input"].includes(job.status) && <button aria-label={`Stop index ${job.id.slice(0, 8)}`} onClick={() => void runMemory(() => sdk.jobs.cancel(job.id))}>Stop</button>}
          </div>)}
          <SettingsHelp label="More about this setting" target={<h3>Coding-style knowledge</h3>}>Save only non-sensitive project conventions. Knowledge outlives a session. Model observations require a proposal and your approval; they are never labeled user-authored facts.</SettingsHelp>
          <button disabled={!project || !input} onClick={() => void run(() => sdk.memory.remember(project!.id, input))} aria-label="Remember this project convention">Remember</button></>}
        {tab === "subagents" && <><SettingsHelp label="More about this setting" target={<h2>Optional subagents</h2>}>Off by default. When enabled, a depth-one child uses the same fixed model and approved context. It is read-only/tool-less, has separate usage, and belongs to the same cancellation tree.</SettingsHelp>
          <label className="check-setting"><SettingsInput type="checkbox" checked={draft.subagents.enabled} onChange={(event) => automatic("subagents", { enabled: event.target.checked })} />Enable optional read-only subagents</label>
          <label className="setting-field">Maximum parallel children<select aria-label="Maximum parallel children" value={draft.subagents.maxParallel} onChange={(event) => automatic("subagents", { maxParallel: Number(event.target.value) })}><option value={1}>1</option><option value={2}>2</option></select></label>
          <label className="setting-field">Read-only assignment<SettingsTextarea value={input} onChange={(event) => setInput(event.target.value)} /></label><button disabled={!session || !input || !snapshot.settings.values.subagents.enabled} onClick={() => void run(() => sdk.subagents.run(session!.id, input))} aria-label="Run bounded subagent">Run</button></>}
        {tab === "skills" && <><SkillGatewaySettings key={sdk.profileId} sdk={sdk} value={draft.skillSources ?? []} change={(sources) => change("skillSources", sources)}
          save={() => void save("skillSources")} dirty={sectionDirty("skillSources")} disabled={saving} onDirty={setIntegrationDirty} />
          {resourceSession ? <fieldset className="settings-fields" disabled={dirty || saving || integrationDirty}>
            {(dirty || integrationDirty) && <p className="fine-print">Save or cancel source changes before reviewing session admission.</p>}
            <SkillAdmissionsPanel key={`${sdk.profileId}:${resourceSession.id}`} sdk={sdk} session={resourceSession} snapshot={snapshot} />
          </fieldset> : <p className="fine-print">Choose a source chat to review exact skill admission. No session or workspace is inferred.</p>}</>}
        {(["skills", "scripts", "plugins"] as const).includes(tab as "skills" | "scripts" | "plugins") && <><h2>{tab === "skills" ? "Imported skills" : tab === "scripts" ? "Foundational and approved scripts" : "Plugins"}</h2>
          <p>{tab === "skills" ? "Import standard SKILL.md front matter and instructions. A skill grants no tool permissions." : tab === "scripts" ? "Built-in grep_logs, fetch_page, search_memory and memory_graph are exposed through the single internal MCP, without generated one-off scripts." : "Version-1 Moguri plugin manifests bundle declarative standard skills. Importing a plugin does not execute a JavaScript entrypoint or install dependencies."}</p>
          {tab !== "scripts" && <><label className="setting-field">Local {tab === "skills" ? "SKILL.md" : "plugin manifest"} path<SettingsInput value={input} onChange={(event) => setInput(event.target.value)} placeholder={tab === "skills" ? "/path/to/SKILL.md" : "/path/to/moguri-plugin.json"} /></label><button disabled={!project || !input} aria-label={`Import disabled ${tab === "skills" ? "skill" : "plugin"}`} onClick={() => void run(() => tab === "skills" ? sdk.capabilities.importSkill(project!.id, input) : sdk.capabilities.importPlugin(project!.id, input))}>Import</button></>}
          {tab === "skills" && <><button type="button" aria-label="Enable all skills" disabled={capabilityBusy || !registry.some((entry) => !entry.enabled)}
            onClick={() => toggleSkills(registry.filter((entry) => !entry.enabled), true)}>Enable all</button>
            <p className="fine-print" role="status" aria-label="Skill changes">{capabilityProgress}</p></>}
          {registry.map((entry) => <section className="capability-row" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.description}</small><code>{entry.source} / {entry.contentDigest.slice(0, 12)}</code></div><button onClick={() => void run(() => sdk.capabilities.content(entry.id))}>View source</button>
            {tab === "skills" ? <><label className="check-setting"><SettingsInput type="checkbox" aria-label={`Enable skill ${entry.name}`} checked={entry.enabled} disabled={capabilityBusy}
              onChange={(event) => toggleSkills([entry], event.target.checked)} /><span>{entry.enabled ? "Enabled" : "Disabled"}</span></label>
              {entry.ownerPluginId ? <span className="fine-print">Plugin bundle</span> : <button type="button" className="icon-button danger" aria-label={`Delete skill ${entry.name}`} title="Delete skill"
                aria-expanded={deletingSkill === entry.id} disabled={capabilityBusy} onClick={() => setDeletingSkill((current) => current === entry.id ? null : entry.id)}><Icon name="Trash" /></button>}</> :
              <button onClick={() => void run(() => sdk.capabilities.toggle(entry.id, !entry.enabled, entry.revision))}>{entry.enabled ? "Disable" : "Enable"}</button>}
            {deletingSkill === entry.id && <div className="capability-delete" role="group" aria-label={`Confirm deleting skill ${entry.name}`}>
              <span>Delete {entry.name}? Chats that admitted it lose access. Its version history stays in this profile's encrypted event history.</span>
              <button type="button" disabled={capabilityBusy} onClick={() => setDeletingSkill(null)}>Cancel</button>
              <button type="button" className="danger" disabled={capabilityBusy} onClick={() => deleteSkill(entry)}>Delete skill</button>
            </div>}</section>)}
          {tab === "scripts" && <Alert as="p" tone="warning" className="settings-warning">Approved custom scripts execute as Local host code, not in a fictional sandbox. Review the full source, enable it explicitly, and approve each call. Use only scripts you trust.</Alert>}
          <h3>Optional evolution</h3><SettingsHelp label="More about this setting" target={<label className="check-setting"><SettingsInput type="checkbox" checked={draft.evolution.enabled} onChange={(event) => automatic("evolution", { enabled: event.target.checked })} />Allow model-proposed skills, scripts and style knowledge for human review</label>}>Off by default. Nothing applies itself; approval installs disabled content and enabling/execution remain separate actions.</SettingsHelp>
          {pending.map((item) => <div className="proposal-row" key={item.id}><strong>{item.name}</strong><span>{item.kind} / {item.actor === "model" ? "Model suggestion" : "User-authored"}</span><button onClick={() => void run(async () => { const content = await sdk.capabilities.proposal(item.id); setProposal({ id: item.id, content: content.content, digest: content.digest }); setReviewed(false); })} aria-label="Review full proposal">Review</button></div>)}
          {proposal && <section className="proposal-review"><h3>Review exact proposed content</h3><pre>{proposal.content}</pre><code>SHA-256 {proposal.digest}</code><label className="check-setting"><SettingsInput type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this exact source. Approval does not grant execution permissions.</label><div className="button-row"><button disabled={!reviewed} onClick={() => void run(() => sdk.capabilities.decide(proposal.id, true, proposal.digest))} aria-label="Approve disabled capability">Approve disabled</button><button onClick={() => void run(() => sdk.capabilities.decide(proposal.id, false, proposal.digest))}>Reject</button></div></section>}</>}
        {tab === "mcpServers" && <><SettingsHelp label="More about this setting" target={<h2>Tools and MCP</h2>}>Rank equivalent available integration methods for this profile. The agent receives this preference, not new permissions, credentials or a different execution boundary. Discover exact MCP schemas before calls; models cannot authenticate, approve themselves or install a server.</SettingsHelp>
          <h3>Tool preference order</h3>
          <p>Drag a handle, or use Alt+Up/Down, to choose which available method the agent should try first. Changes save for this profile's clients.</p>
          <ReorderList items={effectiveToolPreferences(draft.toolPreferences).order.map((id) => toolMethods.find((method) => method.id === id)!)}
            scope={`${snapshot.profileId}:tool-preferences`} label="Tool preference order" name={(method) => method.name} disabled={saving}
            change={(methods) => automatic("toolPreferences", { order: methods.map((method) => method.id) })}>
            {(method, index) => <><strong>{index + 1}. {method.name}</strong><p className="fine-print">{method.description}</p></>}
          </ReorderList>
          <SettingsAction label="Reset tool preference order" icon="Refresh" disabled={saving} onClick={() => void reset("toolPreferences")} />
          {session?.controls.env === "Remote" ? <details><summary>Configure backend MCP servers</summary>{jsonEditor("mcpServers", "Configured MCP servers")}</details> : jsonEditor("mcpServers", "Configured MCP servers")}
          <SettingsHelp label="More about this setting" target={<label className="setting-field">Server<select aria-label="Server" value={serverId} onChange={(event) => { setServerId(event.target.value); setTools([]); setSelectedTool(null); }}><option value="builtin">Moguri internal scripts</option>{configuredServers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}{retainedServers.map((id) => <option key={id} value={id}>Stored Remote grant: {id}</option>)}</select></label>} descriptionFirst>Save configuration first. Supported transports: stdio or Streamable HTTP. OAuth uses an explicit authorization link with PKCE and resource-bound keychain credentials. Raw bearer credentials stay in the keychain, never settings.</SettingsHelp>
          {session?.controls.env === "Remote" && <RemoteMcpPanel key={`${snapshot.profileId}:${session.id}:${serverId}`} sdk={sdk} snapshot={snapshot} session={session} serverId={serverId} disabled={dirty || saving || nestedDirty} />}
          <div className="button-row"><button onClick={() => void run(() => sdk.mcp.servers(session?.id))} aria-label="List configured servers">List</button><button disabled={dirty || saving || serverId !== "builtin" && !selectedServer} onClick={() => void run(async () => { const result = await sdk.mcp.tools(serverId, "", 0, session?.id); setTools(result.tools); return result; })} aria-label="Discover tools">Discover</button><button disabled={serverId !== "builtin" && !selectedServer} onClick={() => void run(() => sdk.mcp.auth(serverId, session?.id))} aria-label="Verify credential status">Verify</button></div>
          {oauthSelected && <McpOAuthPanel key={serverId} sdk={sdk} serverId={serverId} sessionId={session?.id} snapshot={snapshot} />}
          {serverId !== "builtin" && !oauthSelected && <><label className="setting-field">Bearer credential (not saved in settings)<SettingsInput type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label><div className="button-row"><button disabled={!token} onClick={() => void run(async () => { await sdk.mcp.setToken(serverId, token, session?.id); setToken(""); return "Credential stored in the OS keychain."; })} aria-label="Store in keychain">Store</button><SettingsAction label="Remove credential" icon="Close" onClick={() => void run(() => sdk.mcp.clearToken(serverId, session?.id))} /></div></>}
          {tools.map((tool) => <button className="tool-discovery-row" key={tool.name} onClick={() => setSelectedTool(tool)}><strong>{tool.name}</strong><span>{tool.description}</span></button>)}
          {selectedTool && <><h3>{selectedTool.name}</h3>{selectedTool.scope && <p className="fine-print path">Remote SSH / {selectedTool.scope.root}. This catalog cannot authorize a Local or different-resource call.</p>}<pre>{JSON.stringify(selectedTool.inputSchema, null, 2)}</pre><label className="setting-field">Exact JSON arguments<SettingsTextarea className="json-editor short" aria-label="Exact MCP JSON arguments" value={argumentsJson} onChange={(event) => setArgumentsJson(event.target.value)} /></label><button disabled={dirty || saving || !session || !!session.turnId || session.kind !== "agent" || session.mode !== "agent" || session.pendingMode === "read-only"} onClick={() => void run(async () => { const args: unknown = JSON.parse(argumentsJson); if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object."); return sdk.mcp.call(session!.id, selectedTool.serverId, selectedTool.name, args as Record<string, unknown>, selectedTool.digest); })} aria-label="Request in main session with exact arguments">Request in main</button><p className="fine-print">Return to the main session to approve. It must be idle; no second agent is allowed to seize an active turn.</p></>}
          <pre>moguri mcp --session {session?.id ?? "SESSION_ID"}</pre></>}
        {tab === "voice" && <><SettingsHelp label="More about this setting" target={<h2>Local voice dictation</h2>}>Native NVIDIA Nemotron 3.5 ASR. Download the model once yourself; audio never goes to an ASR cloud or the Copilot provider.</SettingsHelp>
          <p>{voice?.diagnostic ?? "Reading local runtime status..."}</p>
          <h3>Model</h3>
          <p aria-label="Dictation model">{committed.voice.model ? `${committed.voice.model.name} (${committed.voice.model.architecture}, ${committed.voice.model.runtime === "transcribe" ? "transcribe.cpp" : "NeMo-Speech"})` : "Moguri-managed Nemotron 3.5 ASR Streaming 0.6B"}</p>
          {committed.voice.model && <p className="fine-print path">{committed.voice.model.path}<br />Trusted SHA-256 {committed.voice.model.sha256}</p>}
          {committed.voice.model && voice?.model?.trust === "changed" && <Alert as="p" className="inline-error" role="alert">This trusted file changed{voice.model.observedSha256 ? ` (SHA-256 is now ${voice.model.observedSha256})` : ""}. Dictation is blocked until you review and trust it again.</Alert>}
          <div className="button-row">
            <button type="button" disabled={saving || reviewJob?.status === "running"} onClick={() => void run(async () => { const path = await window.moguri.chooseVoiceModel(); if (path) reviewModel(path); })} aria-label="Use existing model file">Use existing model file…</button>
            {committed.voice.model && voice?.model?.trust === "changed" && <button type="button" disabled={saving || reviewJob?.status === "running"} onClick={() => reviewModel(committed.voice.model!.path)} aria-label="Review changed file before trusting it again">Review changed file</button>}
            {committed.voice.model && <button type="button" className="quiet" disabled={saving || Boolean(activeVoice)} onClick={() => void run(() => sdk.voice.useManagedModel())} aria-label="Use managed Nemotron model">Use managed Nemotron</button>}
          </div>
          <p className="fine-print">Reuse a streaming model you already have, such as Nemotron streaming (NeMo-Speech GGUF) or Handy's Parakeet and Moonshine streaming models (transcribe.cpp GGUF). Whisper can't stream, so it isn't accepted. Moguri hashes the file once for your approval, locks that SHA-256, asks again if the file ever changes, and never moves or deletes it.</p>
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
          <p className="fine-print">Disable closes this profile's owned voice work and deletes the sole Moguri-managed model. Enable downloads that pinned model again. The official model file is shared across profiles; external model files and other profiles' running work are never deleted or cancelled.</p>
          <label className="check-setting"><SettingsInput type="checkbox" aria-label="Prepare microphone while composer is focused" checked={Boolean(draft.voice.standby)} disabled={saving || committed.voice.enabled === false}
            onChange={(event) => automatic("voice", { standby: event.target.checked })} />Prepare microphone while a composer is focused</label>
          <p className="fine-print">Explicit standby consent opens the selected microphone only in the focused composer, without recording, if OS access is already granted. Focusing a chat never asks for microphone permission; activate dictation or Find microphones to authorize access first. The microphone icon marks readiness without adding a notice to every chat. Focus loss, switching owner/profile, sleep or disable closes it. Dictation is enabled by default, but no microphone opens or weights download until their explicit actions; unavailable models do not start preparation jobs.</p>
          <SettingsHelp label="More about this setting" target={<h3>Microphone and activation</h3>}>Device discovery is explicit and briefly opens audio solely to read permitted microphone labels, then stops it. Recording uses exact device selection and browser-normalized local 16-kHz PCM, never an ignored native CLI device flag.<br /><br />Microphone access is user-initiated and may require OS permission. Recording is bounded to two minutes. A conflicting draft is preserved rather than overwritten.</SettingsHelp>
          <div className="button-row"><button type="button" disabled={devicesBusy || Boolean(activeVoice)} onClick={() => {
            const request = new AbortController(); deviceRequest.current = request; setDevicesBusy(true);
            void run(async () => { try { setMicrophones(await listMicrophones(sdk.profileId, request.signal)); } finally { if (deviceRequest.current === request) { deviceRequest.current = null; setDevicesBusy(false); } } });
          }} aria-label="Find microphones with explicit audio access">Find microphones</button>{devicesBusy && <button type="button" onClick={() => deviceRequest.current?.abort()} aria-label="Cancel microphone discovery">Cancel</button>}</div>
          <label className="setting-field">Voice input device<select aria-label="Voice input device" value={draft.voice.inputDeviceId ?? "default"} disabled={saving || devicesBusy} onChange={(event) => automatic("voice", { inputDeviceId: event.target.value })}><option value="default">System default microphone</option>
            {draft.voice.inputDeviceId && draft.voice.inputDeviceId !== "default" && !microphones.some((device) => device.id === draft.voice.inputDeviceId) && <option value={draft.voice.inputDeviceId}>Saved device; refresh to verify availability</option>}
            {microphones.filter((device) => device.id !== "default").map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
          <ShortcutEditor label="Voice shortcut" value={draft.voice.shortcut ?? "Control+Space"} change={(shortcut) => change("voice", { ...draft.voice, shortcut })} save={voiceShortcut} dirty={draft.voice.shortcut !== committed.voice.shortcut} disabled={saving} />
          <label className="check-setting"><SettingsInput type="checkbox" aria-label="Hold dictation shortcut to talk" checked={voiceShortcutMode(draft.voice) === "hold"} disabled={saving}
            onChange={(event) => automatic("voice", { shortcutMode: event.target.checked ? "hold" : "toggle" })} />Hold the dictation shortcut to talk</label>
          <SettingsHelp label="About dictation controls" target={<p className="fine-print">Click the microphone to record, then click again to confirm. {committed.voice.shortcut === "none" ? "No dictation shortcut is assigned." :
            voiceShortcutMode(committed.voice) === "hold" ? <>Hold <kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd> for push-to-talk.</> :
              <>Press <kbd>{shortcutLabel(committed.voice.shortcut ?? "Control+Space")}</kbd> to record; press again to finish.</>}</p>}>Ctrl+Space defaults to held push-to-talk, independently of the microphone button. Release finishes the recording; releasing before capture starts discards that original pending capture. Uncheck Hold only to explicitly choose shortcut toggle mode. Both stream words into the owning composer without sending a message. Native/TUI capture supports Default only and explicitly rejects a selected desktop device.</SettingsHelp>
          <SettingsHelp label="About supported dictation languages" target={<label className="setting-field">Language<select aria-label="Dictation language" disabled={saving} value={draft.voice.language} onChange={(event) => automatic("voice", { language: event.target.value })}><option value="auto">Automatic language detection</option>{voice?.languageLocales.map((locale) => <option key={locale.code} value={locale.code} disabled={locale.tier === "adaptation"}>{locale.code} ({locale.tier})</option>)}</select></label>} descriptionFirst>{committed.voice.model ? "This choice applies to the managed Nemotron model. Your external model uses its own language handling." : "NVIDIA documents 40 locales: 19 ready, 13 broad coverage, 8 adaptation-only. The last group needs fine-tuning and is not advertised as ready."}</SettingsHelp>
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
          <label className="setting-field">Or use a local WAV path<SettingsInput value={input} onChange={(event) => setInput(event.target.value)} placeholder="/path/to/recording.wav" /></label><button disabled={saving || !session || !input || !voice?.modelReady} onClick={() => void run(() => sdk.voice.transcribe(session!.id, input))} aria-label="Transcribe local WAV">Transcribe</button>
          {completedVoice && <>{voiceTranscript?.error ? <Alert as="p" className="inline-error" role="alert">{voiceTranscript.error}</Alert> : <p aria-label="Dictation transcript">{voiceTranscript?.text ?? "Loading the local transcript..."}</p>}
            <div className="button-row"><button disabled={!session || !voiceTranscript?.text} onClick={() => void run(() => sdk.voice.insert(session!.id, completedVoice.id, session!.draft.revision))} aria-label="Insert into saved draft, never send">Insert</button></div></>}
          </>}
      </fieldset>
        {output && <details className="settings-result" open><summary>SDK response</summary><pre>{output}</pre></details>}
      </div></div>
  </section></SettingsFieldsProvider>;
}
