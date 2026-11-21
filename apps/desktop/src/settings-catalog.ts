import { fuzzyMatch } from "../../../packages/sdk/src/index.ts";

// Settings pages (docs/design.md#settings-rail-structure). The rail lists only the groups; each group is one page that shows all
// of its items as sections. Item ids are stable deep-link targets: openSettings, policy hints and restored layouts scroll to an item.
export const SETTINGS_GROUPS = [
  { label: "General", items: [
    { id: "general", label: "General", keywords: "profiles create rename color accounts application menu bar automatic updates restart OpenTelemetry OTLP collector metadata export sampling", aliases: ["your name getting started onboarding setup"] },
    { id: "repositories", label: "Repositories", keywords: "bulk multiple import clone URL list bullet parent destination remote move organization", aliases: ["workspace folder sync trust"] },
    { id: "project", label: "Project", keywords: "Kanban board cards continue work show hide GitHub issues PR Linear folder upstream remote repository documentation merge conflicts CI planning debugging overrides", aliases: ["fix broken CI automatic conflict resolution override"] },
  ] },
  { label: "Models", items: [
    { id: "providers", label: "Providers", keywords: "GitHub Copilot login sign in connect subscription authentication enable disable models sources duplicates provider selection OpenRouter Anthropic OpenAI ChatGPT Claude Codex", aliases: ["chat topic naming", "small local naming model"] },
    { id: "localModels", label: "Local models", keywords: "Ollama llama.cpp ds4 endpoints provider API key credentials" },
    { id: "kupo", label: "Kupo routing", keywords: "automatic configured capabilities single cascade critique classifier solver" },
    { id: "decisions", label: "Decision providers", keywords: "System One Autopilot Max" },
  ] },
  { label: "Integrations", items: [
    { id: "github", label: "GitHub", keywords: "workflows GitHub CLI gh account login pull requests issues reviews branch prefix names", aliases: ["wrap up commit CI follow-up skill suggestions", "pull request automation fix broken CI rerun flaky jobs", "automatic conflict resolution repository exceptions"] },
    { id: "linear", label: "Linear", keywords: "workflows login team API key tickets" },
    { id: "mcpServers", label: "MCP gateway", keywords: "servers configs OAuth tools", aliases: ["tool preference order ranking", "MCP direct REST API CLI"] },
    { id: "sql", label: "sql-not-so-lite", keywords: "sqlnotsolite sqlite existing daemon connection health endpoint" },
    { id: "stainless", label: "Stainless", keywords: "browser preview headless playwright chromium" },
    { id: "plugins", label: "Plugins", keywords: "manifest import extensions" },
    { id: "marketplace", label: "Marketplace", keywords: "catalog extensions trusted sources" },
  ] },
  { label: "Boundaries", keywords: "execution permissions", items: [
    { id: "permissions", label: "Guardrails", keywords: "default tool permission allow deny ask autonomy manual guided autonomous autopilot execution environment policy local firewall website allowlist hosts session project global" },
    { id: "sendbox", label: "Sandbox", keywords: "sendbox native isolation managed VM image network bundled runtime automatic workspace DNS alias provider version update installer results publication" },
    { id: "remote", label: "Remote SSH", keywords: "remote host target identity credentials recovery" },
    { id: "subagents", label: "Subagents", keywords: "parallel children read only" },
    { id: "scripts", label: "Scripts", keywords: "execution capabilities approved host code" },
    { id: "hooks", label: "Lifecycle hooks", keywords: "commands execution events" },
    { id: "cache", label: "Dependency cache", keywords: "packages install lockfile advisory" },
  ] },
  { label: "Sessions", items: [
    { id: "startup", label: "Startup defaults", keywords: "default model thinking effort budget autonomy verbosity" },
    { id: "interactions", label: "Confirmations", keywords: "attach session content drag drop terminal close do not ask again", aliases: ["continue interrupted chats after restart", "send queued held prompts automatically next"] },
    { id: "retention", label: "Retention", keywords: "archive complete delete archived seven days storage sessions resume sleep keep alive confirmation ask again quota" },
    { id: "compaction", label: "Context compaction", keywords: "smart compact summarize long chats window" },
    { id: "budgets", label: "Budgets", keywords: "default tokens USD limits spend cost billing estimates provider API pricing Anthropic OpenAI Google xAI Copilot rates policy" },
    { id: "artifacts", label: "Artifacts", keywords: "retained documents answers reports plans export" },
    { id: "candidates", label: "Candidates", keywords: "review staging generation patches application" },
  ] },
  { label: "Instructions", items: [
    { id: "instructions", label: "User guidance", keywords: "global guidelines templates readme readiness issue PR tech stack bootstrap writing style contacts license AI policy documentation merge conflicts fixing CI planning feature debugging" },
    { id: "systemPrompt", label: "System prompt", keywords: "advanced protected model instructions" },
    { id: "skills", label: "Skills", keywords: "skill gateway SKILL.md import guidelines folder remote repository archive MCP discovery source reviews admission" },
    { id: "knowledge", label: "Knowledge tiers", keywords: "Sky Terra Glacier instructions" },
    { id: "memory", label: "Repository memory", keywords: "index vectors context snippets symbols" },
  ] },
  { label: "Interface", items: [
    { id: "appearance", label: "Appearance", keywords: "theme light dark mode system palettes custom colors contrast" },
    { id: "accessibility", label: "Keyboard shortcuts", keywords: "keybindings mapping remap actions accessibility" },
    { id: "voice", label: "Voice dictation", keywords: "microphone input device shortcut push to talk speech transcription language backend" },
    { id: "notifications", label: "Notifications", keywords: "sound needs input completed custom audio desktop banners attention" },
  ] },
] as const;

export type SettingsTab = typeof SETTINGS_GROUPS[number]["items"][number]["id"];
export type SettingsGroup = typeof SETTINGS_GROUPS[number];

export const settingsGroupOf = (tab: SettingsTab): SettingsGroup => SETTINGS_GROUPS.find((group) => group.items.some((item) => item.id === tab))!;
/** Rail entries without a search: one per group. */
export const settingsRailEntries = () => SETTINGS_GROUPS.map((group) => group.label);

export function searchSettings(query: string) {
  return SETTINGS_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => {
    const text = query.replace(/[_-]/g, " ");
    const label = "keywords" in group ? `${group.label} ${group.keywords}` : group.label;
    return fuzzyMatch(text, `${label} ${item.label} ${item.keywords}`) ||
      "aliases" in item && item.aliases.some((alias) => fuzzyMatch(text, `${group.label} ${alias}`));
  }) })).filter((group) => group.items.length > 0);
}
