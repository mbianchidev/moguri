import assert from "node:assert/strict";
import test from "node:test";
import { electronAccelerator, trayMenu, type TrayItem } from "../apps/desktop/src/tray-menu.ts";
import { validateShortcutSet, type Snapshot } from "../packages/sdk/src/index.ts";
import { setupFixture } from "./fixture.ts";

const labels = (items: TrayItem[]) => items.map((item) => item.type === "separator" ? "---" : item.type === "submenu" ? `${item.label} >` : item.label);
const submenu = (items: TrayItem[], label: string) => {
  const item = items.find((value) => value.type === "submenu" && value.label.startsWith(label));
  if (item?.type !== "submenu") throw new Error(`Generated tray item ${label} is missing.`);
  return item.items;
};

test("the tray lists open chats by project in sidebar order with status, then create, open, settings and quit", async () => {
  const fixture = await setupFixture();
  try {
    const base: Snapshot = structuredClone(fixture.service.controller.snapshot()), session = base.sessions[0]!, project = base.projects[0]!;
    const at = (minutes: number) => new Date(Date.parse("2030-01-01T10:00:00.000Z") + minutes * 60_000).toISOString();
    const make = (id: string, values: Partial<typeof session>) => ({ ...structuredClone(session), id, titleSource: "user" as const, parentSessionId: undefined, createdAt: at(0), updatedAt: at(0), ...values });
    const snapshot: Snapshot = { ...base, projects: [project, { ...project, id: "generated-alpha", name: "alpha", path: "/generated/alpha" }],
      sessions: [
        make("generated-working", { title: "Add folder size alerts with progress reporting", turnId: "generated-turn", status: "running", createdAt: at(1) }),
        make("generated-done", { title: "Roadmap priorities", status: "completed", createdAt: at(2) }),
        make("generated-child", { title: "Generated child", status: "completed", parentSessionId: "generated-done" }),
        make("generated-archived", { title: "Generated archived", status: "archived" }),
        make("generated-board", { title: "Generated board", purpose: "kanban" }),
        make("generated-alpha-chat", { title: "Generated alpha task", projectId: "generated-alpha", status: "completed" }),
        make("generated-free", { title: "Copilot worktree disk usage", projectId: null, workspaceId: null, status: "completed" }),
      ] };
    const items = trayMenu(snapshot, { openShortcut: "CommandOrControl+Shift+O" });
    assert.deepEqual(labels(items), [
      "4 sessions", "---",
      "alpha", "Generated alpha task >",
      project.name, "Roadmap priorities >", "Add folder size alerts with p… · Working >",
      "Chats", "Copilot worktree disk usage >",
      "---", "Create Session… >", "New Chat", "New Project",
      "---", "Open Moguri", "Settings…", "---", "Quit",
    ]);
    const open = items.find((item) => item.type === "action" && item.label === "Open Moguri");
    assert.equal(open?.type === "action" && open.accelerator, "CommandOrControl+Shift+O");
    const working = submenu(items, "Add folder size alerts");
    assert.deepEqual(labels(working), ["Session in progress", "---", "Open", "Stop"]);
    assert.deepEqual(working.flatMap((item) => item.type === "action" ? [item.action] : []),
      [{ kind: "open-session", sessionId: "generated-working" }, { kind: "stop", sessionId: "generated-working" }]);
    assert.deepEqual(labels(submenu(items, "Roadmap priorities")), ["Session completed", "---", "Open", "Archive…"]);
    assert.deepEqual(submenu(items, "Create Session").flatMap((item) => item.type === "action" ? [item.label, item.action] : []),
      ["alpha", { kind: "new-session", projectId: "generated-alpha" }, project.name, { kind: "new-session", projectId: project.id }]);

    const capped = trayMenu(snapshot, { openShortcut: null, limit: 2 });
    assert.ok(labels(capped).includes("Add folder size alerts with p… · Working >"), "Working sessions survive the cap.");
    assert.ok(labels(capped).includes("2 more in Moguri…"));
    const plain = trayMenu(snapshot, { openShortcut: null }).find((item) => item.type === "action" && item.label === "Open Moguri");
    assert.equal(plain?.type === "action" && plain.accelerator, undefined);
    assert.deepEqual(labels(trayMenu({ ...snapshot, sessions: [], projects: [] }, { openShortcut: null })).slice(0, 4), ["No sessions", "---", "Create Session… >", "New Chat"]);
    assert.deepEqual(labels(trayMenu(null, { openShortcut: null })), ["Connecting…", "---", "Open Moguri", "Settings…", "---", "Quit"]);
  } finally { await fixture.close(); }
});

test("the Open Moguri shortcut maps to an Electron accelerator and joins conflict checks", () => {
  assert.equal(electronAccelerator("Primary+Shift+KeyO"), "CommandOrControl+Shift+O");
  assert.equal(electronAccelerator("Control+Alt+Digit5"), "Control+Alt+5");
  assert.equal(electronAccelerator("none"), null);
  assert.deepEqual(validateShortcutSet({ commands: "Primary+KeyK", openApp: "Primary+Shift+KeyO" }), []);
  assert.match(validateShortcutSet({ terminalCopy: "Primary+Shift+KeyO", openApp: "Primary+Shift+KeyO" })[0]!, /openApp conflicts with terminalCopy/);
});
