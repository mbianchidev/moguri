export const SETTINGS_GROUPS = [
  { label: "General", items: [
    { id: "general", label: "General", keywords: "profiles create rename color accounts application menu bar automatic updates restart" },
  ] },
  { label: "Models", items: [
    { id: "providers", label: "Providers", keywords: "GitHub Copilot login sign in connect subscription authentication" },
    { id: "localModels", label: "Local models", keywords: "Ollama llama.cpp ds4 endpoints provider API key credentials" },
    { id: "kupo", label: "kupo routing", keywords: "single cascade critique classifier solver" },
    { id: "decisions", label: "Decision providers", keywords: "System One Autopilot Max" },
  ] },
  { label: "Integrations", items: [
    { id: "github", label: "GitHub workflows", keywords: "GitHub CLI gh account login pull requests issues reviews" },
    { id: "linear", label: "Linear workflows", keywords: "login team API key tickets" },
    { id: "mcpServers", label: "MCP gateway", keywords: "servers configs OAuth tools integrations" },
    { id: "sql", label: "sql-not-so-lite", keywords: "sqlnotsolite sqlite existing daemon connection health endpoint" },
    { id: "plugins", label: "Plugins", keywords: "manifest import extensions" },
    { id: "marketplace", label: "Marketplace", keywords: "catalog extensions trusted sources" },
  ] },
  { label: "Execution & permissions", items: [
    { id: "permissions", label: "Guardrails", keywords: "default tool permission allow deny ask autonomy execution environment policy" },
    { id: "sendbox", label: "SendBox", keywords: "sandbox native isolation managed VM image network bundled runtime automatic workspace DNS alias provider version update installer" },
    { id: "remote", label: "Remote SSH", keywords: "host target identity credentials recovery" },
    { id: "subagents", label: "Subagents", keywords: "parallel children read only" },
    { id: "scripts", label: "Scripts", keywords: "execution capabilities approved host code" },
    { id: "hooks", label: "Lifecycle hooks", keywords: "commands execution events" },
    { id: "cache", label: "Dependency cache", keywords: "packages install lockfile advisory" },
  ] },
  { label: "Sessions", items: [
    { id: "startup", label: "Startup defaults", keywords: "default model thinking effort budget autonomy verbosity" },
    { id: "retention", label: "Retention", keywords: "archive complete delete archived seven days storage sessions resume sleep keep alive confirmation ask again" },
    { id: "budgets", label: "Budgets", keywords: "default tokens USD limits spend cost estimates policy" },
  ] },
  { label: "Instructions", items: [
    { id: "instructions", label: "User guidance", keywords: "global guidelines templates readme readiness issue PR tech stack bootstrap writing style contacts license AI policy documentation merge conflicts fixing CI planning feature debugging" },
    { id: "systemPrompt", label: "System prompt", keywords: "advanced protected model instructions" },
    { id: "skills", label: "Skills", keywords: "SKILL.md import guidelines" },
    { id: "knowledge", label: "Knowledge tiers", keywords: "Sky Terra Glacier instructions" },
    { id: "memory", label: "Repository memory", keywords: "index vectors context snippets symbols" },
  ] },
  { label: "Per-project configuration", items: [
    { id: "project", label: "Project", keywords: "folder upstream remote repository documentation merge conflicts CI planning debugging overrides" },
  ] },
  { label: "Appearance", items: [
    { id: "appearance", label: "Appearance", keywords: "theme light dark mode system palettes custom colors contrast" },
  ] },
  { label: "Voice", items: [
    { id: "voice", label: "Voice dictation", keywords: "microphone input device shortcut push to talk speech transcription language backend" },
  ] },
  { label: "Accessibility", items: [
    { id: "accessibility", label: "Keyboard shortcuts", keywords: "keybindings mapping remap actions accessibility" },
  ] },
  { label: "Notifications", items: [
    { id: "notifications", label: "Notifications", keywords: "sound needs input completed custom audio desktop banners attention" },
  ] },
] as const;

export type SettingsTab = typeof SETTINGS_GROUPS[number]["items"][number]["id"];

export function searchSettings(query: string) {
  const words = query.toLowerCase().trim().split(/[\s_-]+/).filter(Boolean);
  return SETTINGS_GROUPS.map((group) => ({ label: group.label, items: group.items.filter((item) => {
    const text = `${group.label} ${item.label} ${item.keywords}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }) })).filter((group) => group.items.length > 0);
}
