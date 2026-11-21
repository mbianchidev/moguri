import test from "node:test";
import assert from "node:assert/strict";
import { readCollapsedNavigation, saveCollapsedNavigation } from "../apps/desktop/src/navigation-collapse.ts";

class GeneratedStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("sidebar collapse state round-trips per profile and drops removed projects and groups", () => {
  const storage = new GeneratedStorage();
  assert.deepEqual(readCollapsedNavigation(storage, "default"), { projects: new Set(), folders: new Set() });
  saveCollapsedNavigation(storage, "default", { projects: new Set(["generated-project", "generated-removed"]), folders: new Set(["generated-group"]) },
    { projects: new Set(["generated-project", "generated-other"]), folders: new Set(["generated-group"]) });
  assert.deepEqual(readCollapsedNavigation(storage, "default"), { projects: new Set(["generated-project"]), folders: new Set(["generated-group"]) });
  assert.deepEqual(readCollapsedNavigation(storage, "generated-profile"), { projects: new Set(), folders: new Set() });
});

test("invalid or unreadable saved collapse state starts expanded instead of failing the sidebar", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const storage = new GeneratedStorage();
  for (const text of ["not json", JSON.stringify({ schemaVersion: 2, projects: [], folders: [] }), JSON.stringify({ schemaVersion: 1, projects: [1], folders: [] })]) {
    storage.values.set("moguri.navigation.v1:default:collapsed", text);
    assert.deepEqual(readCollapsedNavigation(storage, "default"), { projects: new Set(), folders: new Set() });
  }
  const failing = { getItem: () => { throw new Error("Generated storage failure."); }, setItem: () => { throw new Error("Generated storage failure."); } };
  assert.deepEqual(readCollapsedNavigation(failing, "default"), { projects: new Set(), folders: new Set() });
  assert.doesNotThrow(() => saveCollapsedNavigation(failing, "default", { projects: new Set(), folders: new Set() }, { projects: new Set(), folders: new Set() }));
  assert.equal(warn.mock.callCount(), 5);
});
