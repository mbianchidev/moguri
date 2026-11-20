import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_GROUPS, searchSettings, settingsGroupOf, settingsRailEntries } from "../apps/desktop/src/settings-catalog.ts";

test("settings have coherent unique groups and stable routable sections", () => {
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.label), [
    "General", "Models", "Integrations", "Boundaries", "Sessions", "Instructions", "Interface",
  ]);
  const ids = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
  // #84: every pre-existing item id stays a deep-link target (now a section on its group's page); only the rail shrinks.
  assert.deepEqual([...ids].sort(), ["accessibility", "appearance", "artifacts", "budgets", "cache", "candidates", "compaction", "decisions", "general", "github",
    "hooks", "instructions", "interactions", "knowledge", "kupo", "linear", "localModels", "marketplace", "mcpServers", "memory", "notifications", "permissions",
    "plugins", "project", "providers", "remote", "repositories", "retention", "scripts", "sendbox", "skills", "sql", "stainless", "startup", "subagents",
    "systemPrompt", "voice"]);
  // The rail lists only the seven pages; each page shows all of its items as sections, so no group is tabbed or nested.
  assert.deepEqual(settingsRailEntries(), SETTINGS_GROUPS.map((group) => group.label));
  assert.ok(SETTINGS_GROUPS.every((group) => !("tabbed" in group)));
  assert.equal(settingsGroupOf("mcpServers").label, "Integrations"); assert.equal(settingsGroupOf("project").label, "General");
  for (const group of SETTINGS_GROUPS) for (const item of group.items) {
    assert.ok(searchSettings(item.label).some((match) => match.label === group.label && match.items.some((value) => value.id === item.id)), item.label);
  }
  assert.deepEqual(searchSettings("  "), SETTINGS_GROUPS);
});

test("settings search combines category and control aliases without reading user content", () => {
  const ids = (query: string) => searchSettings(query).flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(ids("MODEL local"), ["general", "project", "providers", "localModels", "kupo", "permissions", "sendbox", "budgets", "instructions"]);
  for (const query of ["MCP direct", "tool preference order", "REST CLI"]) assert.ok(ids(query).includes("mcpServers"));
  assert.deepEqual(ids("firewall"), ["permissions"]);
  assert.deepEqual(ids("thinking effort"), ["startup"]);
  const boundaries = SETTINGS_GROUPS.find((group) => group.label === "Boundaries")!.items.map((item) => item.id);
  assert.deepEqual(ids("execution permission"), boundaries);
  for (const id of boundaries) assert.ok(ids("Boundaries").includes(id));
  assert.deepEqual(ids("readme readiness"), ["project", "permissions", "sendbox", "retention", "instructions", "skills", "accessibility", "notifications"]);
  assert.deepEqual(ids("GitHub CLI"), ["project", "providers", "github", "instructions"]);
  for (const query of ["GitHub workflows", "Linear workflows"]) assert.ok(ids(query).includes(query.startsWith("GitHub") ? "github" : "linear"));
  assert.deepEqual(ids("input device"), ["providers", "permissions", "sendbox", "skills", "voice"]);
  assert.deepEqual(ids("zzzzzzzz-no-such-setting"), []);
  assert.ok(ids("voice").includes("voice"));
  assert.ok(ids("chat naming").includes("providers"));
  for (const query of ["OTLP", "OpenTelemetry", "collector metadata export"]) assert.ok(ids(query).includes("general"));
  for (const query of ["interrupted chats", "continue after restart"]) assert.ok(ids(query).includes("interactions"));
});
