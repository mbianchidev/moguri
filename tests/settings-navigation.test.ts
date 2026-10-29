import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_GROUPS, searchSettings } from "../apps/desktop/src/settings-catalog.ts";

test("settings have coherent unique groups and stable routable sections", () => {
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.label), [
    "General", "Models", "Integrations", "Execution & permissions", "Sessions", "Instructions",
    "Per-project configuration", "Appearance", "Voice", "Accessibility", "Notifications",
  ]);
  const ids = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(searchSettings("  "), SETTINGS_GROUPS);
});

test("settings search combines category and control aliases without reading user content", () => {
  const ids = (query: string) => searchSettings(query).flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(ids("MODEL local"), ["providers", "localModels", "kupo", "permissions", "sendbox", "budgets", "instructions", "project"]);
  for (const query of ["MCP direct", "tool preference order", "REST CLI"]) assert.ok(ids(query).includes("mcpServers"));
  assert.deepEqual(ids("firewall"), ["permissions", "project"]);
  assert.deepEqual(ids("thinking effort"), ["startup"]);
  assert.deepEqual(ids("execution permission"), SETTINGS_GROUPS.find((group) => group.label === "Execution & permissions")!.items.map((item) => item.id));
  assert.deepEqual(ids("readme readiness"), ["permissions", "sendbox", "retention", "instructions", "skills", "project"]);
  assert.deepEqual(ids("GitHub CLI"), ["providers", "github", "instructions", "project"]);
  assert.deepEqual(ids("input device"), ["providers", "permissions", "sendbox", "skills", "voice"]);
  assert.deepEqual(ids("zzzzzzzz-no-such-setting"), []);
  assert.ok(ids("voice").includes("voice"));
});
