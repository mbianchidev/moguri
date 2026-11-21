import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { compareSessions, isRecord, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { operationProjection } from "../../apps/service/src/operation-telemetry.ts";
import { setupFixture } from "../fixture.ts";
import { assertOperationLatency } from "../fixtures/latency-budgets.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native desktop interaction qualification is macOS-only.");

test("panel controls maximize over chat without covering navigation, mode is a bottom toggle and Commands stays keyboard-only", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    expect(await app.evaluate(() => process.versions.electron)).toBe(require("electron/package.json").version);
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await expect(page.getByRole("button", { name: /^Commands\b/ })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Session mode", exact: true })).toHaveCount(0);
    await expect(page.locator(".session-header").getByRole("button", { name: "Archive", exact: true })).toHaveCount(0);
    const mode = composer.getByRole("switch", { name: "Agent mode", exact: true });
    await expect(mode).toBeEnabled();
    const attach = composer.getByRole("button", { name: "Attach", exact: true });
    await attach.focus(); await expect(attach).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mode).toBeFocused();
    const attachBounds = await composer.getByRole("button", { name: "Attach", exact: true }).boundingBox(), modeBounds = await mode.boundingBox();
    expect(modeBounds!.x).toBeGreaterThanOrEqual(attachBounds!.x + attachBounds!.width);
    await expect(mode).toHaveAttribute("aria-checked", "true"); await mode.click();
    await expect.poll(() => fixture.session().mode).toBe("read-only");
    await expect(mode.locator("svg")).toHaveAttribute("data-icon", "BookOpen");
    await mode.click(); await expect.poll(() => fixture.session().mode).toBe("agent");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveAttribute("aria-disabled", "false");
    const pane = page.getByRole("complementary", { name: "Session sidebar" }), nav = page.getByRole("navigation", { name: "Projects and sessions" });
    const initial = await pane.boundingBox();
    await pane.getByRole("button", { name: "Maximize session sidebar", exact: true }).click();
    const expanded = await pane.boundingBox(), left = await nav.boundingBox();
    expect(expanded!.width).toBeGreaterThan(initial!.width);
    expect(expanded!.x).toBeGreaterThanOrEqual(left!.x + left!.width - 1);
    await expect(composer).toBeHidden();
    const terminalId = fixture.service.controller.snapshot().terminals[0]!.id;
    const palette = page.getByRole("dialog", { name: "Commands", exact: true });
    await page.keyboard.press("Meta+k");
    await expect(palette).toBeVisible(); await expect(palette).toHaveJSProperty("open", true);
    expect(await palette.evaluate((element) => element.closest("#session-sidebar"))).toBeNull();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0); await expect(composer).toBeHidden();
    expect(fixture.service.controller.snapshot().terminals[0]?.id).toBe(terminalId);
    expect(fixture.service.controller.snapshot().terminals[0]?.status).toBe("running");
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/desktop-session-panel-expanded.png" });
    await pane.getByRole("button", { name: "Restore session sidebar", exact: true }).click();
    await expect(composer).toBeVisible();
    await pane.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    await page.getByRole("dialog", { name: "Close terminal pane", exact: true }).getByRole("button", { name: "Hide terminal", exact: true }).click();
    await expect(pane).toBeHidden();
    expect(fixture.service.controller.snapshot().terminals[0]?.status).toBe("running");
    await page.getByLabel("Prompt", { exact: true }).focus(); await page.keyboard.press("Meta+k");
    await expect(palette).toBeVisible(); await expect(pane).toBeHidden();
    await page.keyboard.press("Escape"); await expect(palette).toHaveCount(0);
    await expect(page.getByLabel("Prompt", { exact: true })).toBeFocused();
  } finally { await app.close(); await fixture.close(); }
});

test("closed Ghostty terminals disappear from the selector without erasing retained owner records", async () => {
  const gate = Promise.withResolvers<void>(), values = new Map<string, string>();
  const vault = { read: async (key: string) => values.get(key) ?? null, write: async (key: string, value: string) => { await gate.promise; values.set(key, value); }, remove: async (key: string) => { values.delete(key); } };
  const fixture = await setupFixture({ platform: { terminal: { vault, executable: process.execPath, args: ["-e", "process.stdin.resume();process.stdout.write('GENERATED_TERMINAL_LIST_READY\\n');"] } } });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    const pane = page.getByRole("region", { name: "Embedded Ghostty terminal", exact: true });
    await expect(pane.getByRole("button", { name: "Open terminal", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("button", { name: "New terminal", exact: true })).toBeDisabled();
    gate.resolve();
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toHaveAttribute("aria-disabled", "false");
    expect(fixture.service.controller.snapshot().terminals).toHaveLength(1);
    await pane.getByRole("button", { name: "Close terminal", exact: true }).click();
    await expect(pane.getByRole("combobox", { name: "Selected terminal" })).toHaveValue("");
    await expect(pane.getByRole("combobox", { name: "Selected terminal" }).locator("option")).toHaveText(["No terminal"]);
    expect(fixture.service.controller.snapshot().terminals[0]?.status).toBe("closed");
    expect(fixture.service.controller.snapshot().terminalOwners).toHaveLength(1);
  } finally { gate.resolve(); await app.close(); await fixture.close(); }
});

test("project and project-free sessions rename inline without a dialog or changing their workspace or draft", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const chat = await sdk.sessions.create(null, "Generated project-free rename");
  const cases = [
    { id: fixture.sessionId, renamed: "Generated renamed project session" },
    { id: chat.id!, renamed: "Generated renamed project-free session" },
  ];
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const form = page.getByRole("form", { name: "Rename chat inline", exact: true }), name = form.getByRole("textbox", { name: "Chat name", exact: true });
    for (const entry of cases) {
      const original = sdk.getState().snapshot!.sessions.find((session) => session.id === entry.id)!;
      const link = navigation.getByRole("button", { name: original.title, exact: true });
      await link.click();
      await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();
      await expect(form).toHaveCount(0);
      await link.dblclick();
      await expect(page.getByRole("dialog", { name: "Rename", exact: true })).toHaveCount(0);
      await expect(name).toHaveValue(original.title); await expect(name).toBeFocused();
      await name.fill("Generated cancelled rename"); await name.press("Escape");
      await expect(form).toHaveCount(0); await expect(link).toBeFocused();
      expect(sdk.getState().snapshot!.sessions.find((session) => session.id === entry.id)!.title).toBe(original.title);
      await link.dblclick(); await expect(name).toBeFocused(); await page.keyboard.insertText(entry.renamed);
      const renamedAt = performance.now();
      await name.press("Enter");
      await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => session.id === entry.id)?.title).toBe(entry.renamed);
      await expect(navigation.getByRole("button", { name: entry.renamed, exact: true })).toBeVisible();
      assertOperationLatency("session.organize", performance.now() - renamedAt);
      const renamed = sdk.getState().snapshot!.sessions.find((session) => session.id === entry.id)!;
      expect(renamed.projectId).toBe(original.projectId); expect(renamed.workspaceId).toBe(original.workspaceId);
      expect(renamed.controls).toEqual(original.controls); expect(renamed.draft).toEqual(original.draft);
    }
    const link = navigation.getByRole("button", { name: cases[1]!.renamed, exact: true });
    await link.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Rename", exact: true }).click();
    await expect(name).toHaveValue(cases[1]!.renamed);
    await form.getByRole("button", { name: "Cancel chat rename", exact: true }).click();
    await page.reload();
    for (const entry of cases) await expect(navigation.getByRole("button", { name: entry.renamed, exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("inline rename preserves a proposed name across a peer conflict and submits a fresh exact title quickly", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions", exact: true });
    const original = fixture.session().title;
    await navigation.getByRole("button", { name: original, exact: true }).focus();
    await page.keyboard.press("F2");
    const form = navigation.getByRole("form", { name: "Rename chat inline", exact: true }), field = form.getByLabel("Chat name", { exact: true });
    await expect(field).toBeFocused();
    await field.fill("Generated preserved proposed name.");
    await sdk.sessions.rename(fixture.sessionId, "Generated peer name.");
    await form.getByRole("button", { name: "Save chat name", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Another client changed");
    await expect(field).toHaveValue("Generated preserved proposed name.");
    expect(fixture.session().title).toBe("Generated peer name.");
    await field.press("Escape");
    const peer = navigation.getByRole("button", { name: "Generated peer name.", exact: true });
    await expect(peer).toBeFocused(); await peer.press("F2");
    await field.fill("Generated acknowledged inline name.");
    const began = performance.now(); await field.press("Enter");
    await expect(navigation.getByRole("button", { name: "Generated acknowledged inline name.", exact: true })).toBeVisible();
    assertOperationLatency("session.organize", performance.now() - began);
    await expect(page.getByRole("dialog", { name: "Rename", exact: true })).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("session names open context actions, archive confirmations can be remembered and remain configurable", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated second context chat"), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".session-row summary")).toHaveCount(0);
    const first = page.getByRole("button", { name: fixture.session().title, exact: true });
    await first.click({ button: "right" });
    const menu = page.getByRole("menu", { name: `Actions for ${fixture.session().title}`, exact: true });
    await menu.getByRole("menuitem", { name: "Archive", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Archive session", exact: true });
    await dialog.getByLabel("Do not ask again when archiving sessions", { exact: true }).check();
    await dialog.getByRole("button", { name: "Archive session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.settings.values.retention.confirmArchive).toBe(false);
    const next = page.getByRole("button", { name: "Generated second context chat", exact: true });
    await next.click(); await next.click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Archive", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === second.id)?.status).toBe("archived");
    await expect(page.getByRole("dialog", { name: "Archive session", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "Retention");
    await expect(page.getByLabel("Confirm before archiving a session", { exact: true })).not.toBeChecked();
    await page.getByLabel("Confirm before archiving a session", { exact: true }).check();
    await expect.poll(() => sdk.getState().snapshot?.settings.values.retention.confirmArchive).toBe(true);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("archiving or deleting a running session always warns, even with confirmations turned off", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, retention: { ...settings.values.retention, confirmArchive: false, confirmDelete: false } }, settings.revision);
  await fixture.send("generated slow task");
  await expect.poll(() => Boolean(fixture.session().turnId && fixture.requests.length === 1)).toBe(true);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), title = fixture.session().title;
    const open = async (action: "Archive" | "Delete") => {
      await page.getByRole("button", { name: title, exact: true }).click({ button: "right" });
      await page.getByRole("menu", { name: `Actions for ${title}`, exact: true }).getByRole("menuitem", { name: action, exact: true }).click();
    };
    await open("Delete");
    const deletion = page.getByRole("dialog", { name: "Delete session", exact: true });
    await expect(deletion.getByText(`"${title}" is still running. Deleting stops its current work.`)).toBeVisible();
    const stopDelete = deletion.getByRole("button", { name: "Stop work and delete", exact: true });
    await expect(stopDelete).toBeDisabled();
    await deletion.getByRole("button", { name: "Cancel deletion", exact: true }).click();
    await expect(deletion).toHaveCount(0);
    expect(fixture.session().turnId).toBeTruthy();
    await open("Archive");
    const archive = page.getByRole("dialog", { name: "Archive session", exact: true });
    await expect(archive.getByText(`"${title}" is still running. Archiving stops its current work.`)).toBeVisible();
    await archive.getByRole("button", { name: "Stop work and archive", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("archived");
    expect(fixture.session().turnId).toBeNull();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("desktop slash archive reviews the child tree and remembers its chosen disposition", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const firstChild = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated archive child");
  const secondTitle = "Generated remembered archive parent", second = await sdk.sessions.create(fixture.session().projectId, secondTitle);
  const secondChild = await sdk.sessions.spawn(second.id!, "agent", "Generated remembered archive child");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("/archive");
    await page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Run command", exact: true }).click();
    const firstDialog = page.getByRole("dialog", { name: "Archive session", exact: true });
    await expect(firstDialog.getByRole("radio", { name: /Archive attached sessions/ })).toBeVisible();
    await firstDialog.getByRole("radio", { name: /Archive attached sessions/ }).check();
    await firstDialog.getByLabel("Don't ask me again about child sessions when archiving", { exact: true }).check();
    await firstDialog.getByRole("button", { name: "Archive session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === fixture.sessionId)?.status).toBe("archived");
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === firstChild.id)?.status).toBe("archived");
    expect(sdk.settings.get()?.values.retention.archiveChildren).toBe("archive");
    expect(sdk.settings.get()?.values.retention.confirmArchive).toBe(true);

    await page.getByRole("button", { name: secondTitle, exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: `Actions for ${secondTitle}`, exact: true }).getByRole("menuitem", { name: "Archive", exact: true }).click();
    const rememberedDialog = page.getByRole("dialog", { name: "Archive session", exact: true });
    await expect(rememberedDialog.locator(".session-children-choice")).toHaveCount(0);
    await expect(rememberedDialog).toContainText("selected preference will also archive all 1 attached sessions");
    await rememberedDialog.getByRole("button", { name: "Archive session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === second.id)?.status).toBe("archived");
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === secondChild.id)?.status).toBe("archived");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "Retention");
    await page.getByLabel("When archiving a session with subsessions", { exact: true }).selectOption("ask");
    await expect.poll(() => sdk.settings.get()?.values.retention.archiveChildren).toBeUndefined();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("deleting subsessions supports cascade review and a remembered child disposition", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const firstChild = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated delete child");
  const secondTitle = "Generated remembered delete parent", second = await sdk.sessions.create(fixture.session().projectId, secondTitle);
  const secondChild = await sdk.sessions.spawn(second.id!, "agent", "Generated remembered delete child");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: fixture.session().title, exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: `Actions for ${fixture.session().title}`, exact: true }).getByRole("menuitem", { name: "Delete", exact: true }).click();
    const firstDialog = page.getByRole("dialog", { name: "Delete session", exact: true });
    await firstDialog.getByRole("radio", { name: /Delete attached sessions/ }).check();
    await firstDialog.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
    await firstDialog.getByLabel("Don't ask me again about child sessions when deleting", { exact: true }).check();
    await firstDialog.getByRole("button", { name: "Delete session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.some((session) => session.id === fixture.sessionId || session.id === firstChild.id)).toBe(false);
    expect(sdk.settings.get()?.values.retention.deleteChildren).toBe("delete");
    expect(sdk.settings.get()?.values.retention.confirmDelete).toBe(true);

    await page.getByRole("button", { name: secondTitle, exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: `Actions for ${secondTitle}`, exact: true }).getByRole("menuitem", { name: "Delete", exact: true }).click();
    const rememberedDialog = page.getByRole("dialog", { name: "Delete session", exact: true });
    await expect(rememberedDialog.locator(".session-children-choice")).toHaveCount(0);
    await expect(rememberedDialog).toContainText("selected preference will also delete all 1 attached sessions");
    await rememberedDialog.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
    await rememberedDialog.getByRole("button", { name: "Delete session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.some((session) => session.id === second.id || session.id === secondChild.id)).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("blocked deletion opens the exact partial tool result for inspection without implicitly resuming", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), session = fixture.session();
  const scope = { profile_id: sdk.profileId, project_id: session.projectId, session_id: session.id, turn_id: "generated-unconfirmed-turn" };
  const call = { id: "generated-unconfirmed-call", name: "run_command", arguments: { command: "generated fixture only" } };
  const events = fixture.service.store.commit([
    { ...scope, event_type: "turn.started", payload: {
      item: { id: "generated-unconfirmed-input", text: "Generated request for operation inspection.", attachments: [], delivery: "queue" },
      controls: session.controls, policyRevision: sdk.getState().snapshot!.policy.revision,
    } },
    { ...scope, step_id: "generated-unconfirmed-step", event_type: "tool.started", payload: { call } },
    { ...scope, event_type: "process.started", payload: { callId: "generated-unconfirmed-call", pid: 2147000000, processGroup: 2147000000 } },
    { ...scope, step_id: "generated-unconfirmed-step", event_type: "tool.completed", payload: {
      call,
      text: "Generated partial tool result.", isError: true, outcome: "unconfirmed",
    } },
    { ...scope, event_type: "turn.finished", payload: { outcome: "partial", diagnostic: "Generated cleanup is unconfirmed." } },
    { profile_id: sdk.profileId, project_id: session.projectId, session_id: session.id, event_type: "session.blocked", payload: { diagnostic: "Generated inspection boundary." } },
  ]);
  fixture.service.store.commit(operationProjection(events, sdk.profileId).map((entry) => ({
    event_type: "operation.recorded", profile_id: sdk.profileId, payload: { entry },
  })));
  fixture.service.controller.refreshProfile(); await sdk.refresh();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: session.title, exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: `Actions for ${session.title}`, exact: true }).getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete session", exact: true });
    await dialog.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
    await dialog.getByRole("button", { name: "Delete session", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Owned tool/process effects remain unconfirmed");
    const inspect = dialog.getByRole("button", { name: "Open session to inspect", exact: true });
    await expect(inspect).toBeVisible(); await inspect.click();
    await expect(dialog).toHaveCount(0);
    const composer = page.getByRole("form", { name: "Message composer", exact: true });
    await expect(composer.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    const operation = page.getByRole("log", { name: "Session transcript", exact: true }).locator(".activity-row[data-kind='command']");
    await operation.locator("summary").click();
    await expect(operation.getByRole("region", { name: "Operation result", exact: true })).toContainText("Generated partial tool result.");
    await expect(operation).toContainText("genuinely uncertain effects or cleanup keep further writes fenced");
    expect(sdk.getState().snapshot?.sessions.some((value) => value.id === session.id)).toBe(true);
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "session.resumed" && event.session_id === session.id)).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("native rows reorder siblings, explicit menus attach, and reviewed drags detach without changing roots", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated drag second");
  const third = await sdk.sessions.create(fixture.session().projectId, "Generated drag third"), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), projectId = fixture.session().projectId;
    const row = (name: string) => page.locator(".session-row").filter({ has: page.getByRole("button", { name, exact: true }) });
    const order = () => sdk.getState().snapshot!.sessions.filter((session) => session.projectId === projectId && !session.parentSessionId).sort(compareSessions).map((session) => session.title);
    await row("Generated drag third").dragTo(row(fixture.session().title), { targetPosition: { x: 30, y: 2 } });
    await expect.poll(order).toEqual(["Generated drag third", fixture.session().title, "Generated drag second"]);
    const link = page.getByRole("button", { name: "Generated drag third", exact: true });
    await link.focus(); await link.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Attach to session", exact: true }).click();
    const attach = page.getByRole("dialog", { name: "Attach session", exact: true });
    await attach.getByLabel("Destination", { exact: true }).selectOption(second.id!);
    await attach.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === third.id)?.parentSessionId).toBe(second.id);
    const attached = sdk.getState().snapshot!.sessions.find((session) => session.id === third.id)!;
    expect(attached.projectId).toBe(projectId); expect(attached.workspaceId).toBeNull(); expect(attached.controls.env).toBe("Local");
    await page.getByRole("button", { name: "Generated drag second", exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Attach to session", exact: true }).click();
    await attach.getByLabel("Destination", { exact: true }).selectOption(third.id!);
    await attach.getByRole("button", { name: "Save", exact: true }).click();
    await expect(attach.getByRole("alert")).toContainText("acyclic");
    await attach.getByRole("button", { name: "Cancel", exact: true }).click();
    const project = sdk.getState().snapshot!.projects.find((project) => project.id === projectId)!;
    await row("Generated drag third").dragTo(page.getByRole("region", { name: `Project ${project.name}`, exact: true }).locator(":scope > header"));
    await page.getByRole("dialog", { name: "Detach session", exact: true }).getByRole("button", { name: "Detach session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.find((session) => session.id === third.id)?.parentSessionId ?? null).toBeNull();
    await link.focus(); await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: "Actions for Generated drag third", exact: true });
    await expect(menu.getByRole("menuitem", { name: "Select", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown"); await expect(menu.getByRole("menuitem", { name: "Rename", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown"); await expect(menu.getByRole("menuitem", { name: "Pin", exact: true })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(link).toBeFocused();
    await link.press("Shift+F10"); await expect(menu.getByRole("menuitem", { name: "Move down", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape"); await link.press("Alt+ArrowDown");
    await expect.poll(order).toEqual([fixture.session().title, "Generated drag third", "Generated drag second"]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("remembered delete confirmation applies only to explicit deletion and preserves independent documents", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const title = fixture.session().title;
  await mkdir(join(fixture.project, "docs")); await writeFile(join(fixture.project, "docs", "plan.md"), "Generated independently retained document.");
  const artifact = await sdk.plans.capture(fixture.sessionId);
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated delete second"), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: title, exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete session", exact: true });
    await dialog.getByLabel("I confirm deletion of this session, its unsent content and originating candidates.", { exact: true }).check();
    await dialog.getByLabel("Do not ask again when deleting sessions", { exact: true }).check();
    await dialog.getByRole("button", { name: "Delete session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.some((session) => session.id === fixture.sessionId)).toBe(false);
    expect(sdk.settings.get()?.values.retention.confirmDelete).toBe(false);
    expect((await sdk.plans.artifact(artifact.id!)).text).toBe("Generated independently retained document.");
    await page.getByRole("button", { name: "Generated delete second", exact: true }).click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot?.sessions.some((session) => session.id === second.id)).toBe(false);
    await expect(page.getByRole("dialog", { name: "Delete session", exact: true })).toHaveCount(0);
    expect((await sdk.plans.artifact(artifact.id!)).text).toBe("Generated independently retained document.");
    expect(sdk.settings.get()?.values.retention.deleteArchived).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("holding the primary button during an active turn queues one draft then restores Stop without cancelling", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let entered = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "message.send" && raw.command.held === true) { entered = true; await gate.promise; }
    return dispatch(raw);
  };
  try {
    await fixture.configure(); await fixture.send("generated slow model task");
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.getByRole("button", { name: "Stop turn", exact: true })).toBeVisible();
    const turnId = fixture.session().turnId;
    await prompt.fill("Generated held next turn"); await page.keyboard.down("Meta");
    const hold = page.getByRole("button", { name: "Queue prompt without starting work", exact: true });
    await expect(hold.locator("svg")).toHaveAttribute("data-icon", "Clock"); await hold.click();
    await page.keyboard.up("Meta");
    await expect.poll(() => entered).toBe(true);
    await expect(hold).toBeVisible(); await expect(hold).toBeDisabled();
    expect(fixture.session().queue).toHaveLength(0);
    gate.resolve();
    await expect.poll(() => fixture.session().queue.some((item) => item.text === "Generated held next turn" && item.held)).toBe(true);
    await expect(prompt).toHaveValue("");
    await expect(page.getByRole("button", { name: "Stop turn", exact: true })).toBeVisible();
    expect(fixture.session().turnId).toBe(turnId); expect(fixture.session().status).not.toBe("stopping");
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); await fixture.close(); }
});

test("only explicit multi-step model plans show a checklist, exclusively in the Plan sidebar", async () => {
  const fixture = await setupFixture({ holdAfterTool: true, taskProgress: { action: "plan", title: "Generated explicit change",
    steps: [{ text: "Inspect generated inputs", status: "done" }, { text: "Implement generated change", status: "pending" }] } });
  await mkdir(join(fixture.project, "docs")); await writeFile(join(fixture.project, "docs", "plan.md"), "- [x] Existing repository example\n- [ ] Not the task plan\n");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await expect(composer.getByRole("region", { name: "Estimated task completion" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("region", { name: "Model task plan", exact: true })).toContainText("No task plan");
    await fixture.configure(); await fixture.send("generated task progress explicit plan");
    const plan = page.getByRole("region", { name: "Model task plan", exact: true });
    await expect(plan).toContainText("Generated explicit change");
    await expect(plan).toContainText("Inspect generated inputs");
    await expect(plan.getByRole("progressbar", { name: "Plan checklist", exact: true })).toHaveAttribute("value", "50");
    await expect(composer.getByRole("progressbar")).toHaveCount(0);
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.getByLabel("Prompt", { exact: true }).focus();
    await page.screenshot({ path: ".moguri/artifacts/desktop-model-plan-sidebar.png" });
    await plan.getByRole("button", { name: "Task progress details", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Task progress details", exact: true });
    await expect(details).toContainText("Checklist rechecked every 15 seconds");
    await expect(details).toContainText("Actual plan source:");
    await details.getByRole("button", { name: "Close details", exact: true }).click();
  } finally { await app.close(); await fixture.close(); }
});

test("every model choice question has an explicit Other textbox that preserves the chat draft", async () => {
  const fixture = await setupFixture({ holdAfterTool: true, questionChoices: ["Generated first choice", "Other, please specify"] }), app = await launch(fixture.directory);
  try {
    await fixture.configure(); await fixture.send("generated structured question choices only");
    const page = await app.firstWindow(), question = page.getByRole("region", { name: "User question", exact: true });
    await page.getByLabel("Prompt", { exact: true }).fill("Generated unrelated draft");
    await expect(question.getByRole("textbox", { name: "Other answer", exact: true })).toHaveValue("");
    await question.getByRole("textbox", { name: "Other answer", exact: true }).fill("Generated distinct actual user choice");
    await question.getByRole("textbox", { name: "Other answer", exact: true }).press("Enter");
    await expect(question).toHaveCount(0);
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated unrelated draft");
    const answered = fixture.service.controller.snapshot().questions.at(-1)!;
    expect(answered.answer?.actor).toBe("user"); expect(answered.answer?.other).toBe(true);
  } finally { await app.close(); await fixture.close(); }
});

test("question-only side chats expose the same explicit Other answer without changing the parent or read-only boundary", async () => {
  const fixture = await setupFixture({ holdAfterTool: true }), app = await launch(fixture.directory);
  try {
    await fixture.configure();
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated parent draft stays separate");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Side chat", exact: true }).click();
    const side = page.locator(".side-chat-panel");
    await side.getByRole("textbox", { name: "Side question", exact: true }).fill("generated structured question choices only");
    await side.getByRole("button", { name: "Send", exact: true }).click();
    const question = side.getByRole("region", { name: "User question", exact: true });
    await expect(question.getByRole("textbox", { name: "Other answer", exact: true })).toHaveValue("");
    await question.getByRole("textbox", { name: "Other answer", exact: true }).fill("Generated explicit side alternative");
    await question.getByRole("textbox", { name: "Other answer", exact: true }).press("Enter");
    await expect(question).toHaveCount(0);
    const state = fixture.service.controller.snapshot(), child = state.sessions.find((session) => session.kind === "side")!;
    const answered = state.questions.find((entry) => entry.sessionId === child.id)!;
    expect(answered.answer?.other).toBe(true); expect(answered.answer?.actor).toBe("user");
    expect(child.mode).toBe("read-only");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated parent draft stays separate");
    await expect(side.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); await fixture.close(); }
});
