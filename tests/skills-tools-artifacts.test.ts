import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DraftEditor, MoguriSdk, artifactFileKind, scriptEntries, detectToolSuggestions, groupToolsets, messageLinks, scriptDescription, type EventInput, type Session, type Snapshot, type SuggestionPreview } from "../packages/sdk/src/index.ts";
import { artifactLibrary } from "../apps/service/src/artifact-library.ts";
import { ToolSuggestionAutomation } from "../apps/service/src/tool-suggestion-automation.ts";
import { setupFixture, waitFor } from "./fixture.ts";

const mac = { skip: process.platform !== "darwin", timeout: 30_000 };
const prompt = (sessionId: string, text: string) => ({ sessionId, messageId: `${sessionId}-message`, text });

test("repeated conversions need two chats and other repeated tasks need three; installed scripts are flagged", () => {
  const conversions = detectToolSuggestions([
    prompt("a", "Please turn this markdown into a PDF."), prompt("b", "can you convert the README.md file to pdf"),
    prompt("c", "Generate a PDF from these markdown notes"), prompt("a", "Resize the screenshots to 800px wide"),
    prompt("b", "resize the screenshots for the docs"),
  ], ["markdown_into_pdf"]);
  assert.deepEqual(conversions.map((value) => [value.name, value.count, value.installed]), [["markdown_into_pdf", 3, true]]);
  assert.equal(conversions[0]!.title, "Convert Markdown to PDF");
  const tasks = detectToolSuggestions(["a", "b", "c"].map((id) => prompt(id, "Please resize the screenshots to 800px wide")));
  assert.deepEqual(tasks.map((value) => [value.name, value.count, value.installed]), [["resize_screenshots", 3, false]]);
  assert.equal(detectToolSuggestions([prompt("a", "turn this markdown into a pdf"), prompt("a", "convert markdown to pdf again")]).length, 0);
  assert.equal(detectToolSuggestions([prompt("a", "explain the markdown parser"), prompt("b", "explain the markdown parser")]).length, 0);
});

test("script descriptions come from the header comment; toolsets keep every built-in tool visible", () => {
  assert.equal(scriptDescription("#!/usr/bin/env node\n// description: Convert Markdown to PDF.\nimport fs from 'node:fs';"), "Convert Markdown to PDF.");
  assert.equal(scriptDescription("/** @description Count lines. */\nexport {}"), "Count lines.");
  assert.equal(scriptDescription("console.log('no header')"), null);
  const sets = groupToolsets([{ name: "read_file", description: "Read a file. More detail." }, { name: "future_tool", description: "Something new" }]);
  assert.deepEqual(sets.map((set) => [set.id, set.tools.map((tool) => tool.summary)]), [["files", ["Read a file."]], ["other", ["Something new"]]]);
  assert.deepEqual(messageLinks("See https://github.com/o/r/pull/1, then (https://example.com/a?b=1). https://github.com/o/r/pull/1"),
    ["https://github.com/o/r/pull/1", "https://example.com/a?b=1"]);
  assert.deepEqual(["Moguri.dmg", "setup.EXE", "shot.png", "main.js", "notes.md"].map(artifactFileKind), ["installer", "installer", "image", null, "document"]);
});

test("the artifact library lists output folders and agent-written files with their sessions, never dependencies, sources or protected paths", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "moguri-generated-library-")));
  try {
    const project = join(directory, "project"), worktree = join(directory, "worktree");
    for (const folder of ["dist", "apps/desktop/release/mac/Generated.app/Contents", "node_modules/pkg/dist", "src", "docs"]) await mkdir(join(project, folder), { recursive: true });
    await mkdir(join(worktree, "out"), { recursive: true }); await mkdir(join(directory, "outside"));
    await writeFile(join(directory, "outside", "private.pdf"), "pdf"); await symlink(join(directory, "outside"), join(project, "linked"));
    await Promise.all([
      writeFile(join(project, "dist/Generated.dmg"), "dmg"), writeFile(join(project, "dist/main.js"), "js"), writeFile(join(project, "dist/.env"), "SECRET=1"),
      writeFile(join(project, "apps/desktop/release/mac/Generated.app/Contents/icon.png"), "png"), writeFile(join(project, "node_modules/pkg/dist/bundle.zip"), "zip"),
      writeFile(join(project, "src/logo.png"), "png"), writeFile(join(project, "docs/report.pdf"), "pdf"), writeFile(join(worktree, "out/setup.exe"), "exe"),
    ]);
    const call = (name: string, path: string) => ({ id: `${name}-${path}`, name, arguments: { path } });
    const sessions = [
      { id: "checkout", projectId: "project", workspaceId: null, controls: { env: "Local" }, updatedAt: "2026-01-02T00:00:00.000Z",
        messages: [{ role: "assistant", toolCalls: [call("write_document", "docs/report.pdf"), call("write_file", "src/index.ts"), call("write_file", "../escape.pdf"),
          call("write_document", "linked/private.pdf")] }] },
      { id: "worktree-session", projectId: "project", workspaceId: "workspace", controls: { env: "Local" }, updatedAt: "2026-01-01T00:00:00.000Z", messages: [] },
    ];
    const snapshot = { projects: [{ id: "project", path: project }], sessions,
      managedWorkspaces: [{ id: "workspace", projectId: "project", path: worktree, status: "ready" }] } as unknown as Snapshot;
    const library = await artifactLibrary({ snapshot: () => snapshot, sessionRoot: (session) => session.workspaceId ? worktree : project }, "project", AbortSignal.timeout(5000));
    assert.deepEqual(library.files.map((file) => [file.relativePath, file.kind, file.sessionId, file.origin]).sort(), [
      ["apps/desktop/release/mac/Generated.app", "installer", null, "output"],
      ["dist/Generated.dmg", "installer", null, "output"],
      ["docs/report.pdf", "document", "checkout", "agent"],
      ["out/setup.exe", "installer", "worktree-session", "output"],
    ]);
    assert.deepEqual(library.roots.map((root) => [root.path, root.sessionId, root.status]), [[project, null, "scanned"], [worktree, "worktree-session", "scanned"]]);
    assert.equal(library.truncated, false);
    await assert.rejects(() => artifactLibrary({ snapshot: () => snapshot, sessionRoot: () => null }, "missing", AbortSignal.timeout(5000)), /existing project/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the repeated-task automation is off by default, honours its interval and raises each tool name once", () => {
  let now = Date.parse("2026-01-01T00:00:00Z"), automations: Snapshot["settings"]["values"]["automations"];
  const attention: Snapshot["attention"] = [], committed: EventInput[][] = [];
  const tools: SuggestionPreview["tools"] = [
    { name: "markdown_into_pdf", title: "Convert Markdown to PDF", detail: "", count: 2, sessionIds: [], messageIds: [], example: "", installed: false },
    { name: "json_into_yaml", title: "Convert JSON to YAML", detail: "", count: 2, sessionIds: [], messageIds: [], example: "", installed: true },
  ];
  const automation = new ToolSuggestionAutomation({
    snapshot: () => ({ profileId: "default", attention, settings: { values: { automations } } }) as unknown as Snapshot,
    preview: () => ({ tools }) as SuggestionPreview,
    commit: (events) => { committed.push(events); for (const event of events) if (event.event_type === "attention.raised") attention.push(event.payload.attention); },
  }, 1000, () => now);
  assert.equal(automation.due(), false);
  automations = { toolSuggestions: { enabled: true, intervalHours: 6 } };
  assert.equal(automation.due(), true);
  assert.deepEqual(automation.check().raised, ["markdown_into_pdf"]);
  assert.equal(automation.due(), false);
  now += 6 * 3_600_000;
  assert.equal(automation.due(), true);
  assert.deepEqual(automation.check().raised, []);
  assert.equal(committed.length, 1);
  assert.deepEqual(attention.map((entry) => [entry.reason, entry.messageId, entry.sessionId, entry.source]), [["tool-suggestion", "markdown_into_pdf", null, "heuristic"]]);
});

async function send(sdk: MoguriSdk, session: Session, text: string) {
  const editor = new DraftEditor(sdk, session.id, session.draft);
  try { editor.edit(text); await editor.send("queue"); } finally { editor.dispose(); }
}
test("repeated requests reach the shared preview and the Inbox once, and settings persist the automation", mac, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    for (let index = 0; index < 2; index++) {
      const created = await sdk.sessions.create(null, `Generated conversion ${index}`), session = sdk.getState().snapshot!.sessions.find((value) => value.id === created.id)!;
      await sdk.command({ type: "session.configure", sessionId: session.id, expectedRevision: session.revision, controls: { ...session.controls, modelId: fixture.modelId } });
      await send(sdk, sdk.getState().snapshot!.sessions.find((value) => value.id === session.id)!, "Please turn this generated markdown into a PDF.");
      await waitFor(() => fixture.service.controller.snapshot().sessions.find((value) => value.id === session.id)?.status === "completed");
    }
    const { preview } = await sdk.suggestions.preview(null, true);
    assert.deepEqual(preview.tools.map((tool) => [tool.name, tool.count]), [["markdown_into_pdf", 2]]);
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, automations: { toolSuggestions: { enabled: true, intervalHours: 24 } } }, settings.revision);
    assert.deepEqual(fixture.service.controller.platform.toolSuggestions.check().raised, ["markdown_into_pdf"]);
    assert.deepEqual(fixture.service.controller.platform.toolSuggestions.check().raised, []);
    await waitFor(() => sdk.getState().snapshot!.attention.some((entry) => entry.reason === "tool-suggestion"));
    const entry = sdk.getState().snapshot!.attention.find((value) => value.reason === "tool-suggestion")!;
    assert.deepEqual([entry.messageId, entry.sessionId, entry.kind], ["markdown_into_pdf", null, "bell"]);
    assert.deepEqual(sdk.getState().snapshot!.settings.values.automations, { toolSuggestions: { enabled: true, intervalHours: 24 } });
    const catalog = await sdk.tools.toolsets();
    assert.ok(catalog.toolsets.find((set) => set.id === "files")?.tools.some((tool) => tool.name === "read_file"));
    assert.ok(catalog.scripts.some((script) => script.name === "grep_logs"));
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("installing a source skill is digest-bound, disabled and scoped to a project or every project", mac, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    const root = join(fixture.directory, "generated-marketplace"), folder = join(root, "generated-install");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "SKILL.md"), "---\nname: generated-install\ndescription: Generated marketplace skill\n---\nUse generated fixtures.\n");
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-market", name: "Generated market", kind: "local", path: root, enabled: true }] }, settings.revision);
    const skill = (await sdk.skills.find("", { sourceId: "generated-market" })).skills[0]!;
    const projectId = fixture.session().projectId!;
    await assert.rejects(() => sdk.skills.install(projectId, skill.id, "0".repeat(64)), /changed since discovery/);
    const installed = await sdk.skills.install(projectId, skill.id, skill.digest);
    const entry = sdk.getState().snapshot!.registry.find((value) => value.id === installed.id)!;
    assert.deepEqual([entry.kind, entry.name, entry.projectId, entry.enabled, entry.contentDigest, entry.source], ["skill", "generated-install", projectId, false, skill.digest, "user"]);
    await assert.rejects(() => sdk.skills.install(projectId, skill.id, skill.digest), /already installed/);
    const global = await sdk.skills.install(null, skill.id, skill.digest);
    assert.equal(sdk.getState().snapshot!.registry.find((value) => value.id === global.id)?.projectId, null);
    await assert.rejects(() => sdk.skills.install("generated-missing-project", skill.id, skill.digest), /project/i);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("Tools scripts can apply to every chat; a project's own script of the same name shadows it, and hooks or memory still need a project", mac, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    const projectId = fixture.session().projectId!;
    const approve = async (scope: string | null, content: string) => {
      const { id } = await sdk.capabilities.propose(scope, "script", "generated_lookup", content);
      const proposal = sdk.getState().snapshot!.proposals.find((value) => value.id === id)!;
      assert.equal(proposal.projectId, scope);
      await sdk.capabilities.decide(proposal.id, true, proposal.contentDigest);
      const entry = sdk.getState().snapshot!.registry.find((value) => value.kind === "script" && value.name === "generated_lookup" && value.projectId === scope)!;
      await sdk.capabilities.toggle(entry.id, true, entry.revision);
      return entry.id;
    };
    const global = await approve(null, "// description: Generated global lookup.\nconsole.log('global');\n");
    const registry = () => sdk.getState().snapshot!.registry;
    assert.deepEqual(scriptEntries(registry(), projectId).map((entry) => entry.id), [global]);
    assert.deepEqual(scriptEntries(registry(), null).map((entry) => entry.id), [global]);
    const chat = await sdk.sessions.create(null, "Generated project-free script chat"), session = () => fixture.service.controller.snapshot().sessions.find((value) => value.id === chat.id)!;
    assert.ok(session().homeRoot);
    const listed = (await sdk.mcp.tools("builtin", "script.", 0, chat.id!)).tools.find((tool) => tool.name === `script.${global}`);
    assert.ok(listed, "a project-free Local chat discovers every-chat scripts");
    const ran = await fixture.service.controller.platform.callMcp(session(), { action: "call", serverId: "builtin", tool: listed.name, schemaDigest: listed.digest, arguments: { arguments: {} } }, new AbortController().signal);
    assert.match(JSON.stringify(ran), /global/);
    const own = await approve(projectId, "// description: Generated project lookup.\nconsole.log('project');\n");
    assert.deepEqual(scriptEntries(registry(), projectId).map((entry) => entry.id), [own]);
    assert.deepEqual(scriptEntries(registry(), null).map((entry) => entry.id), [global]);
    for (const kind of ["memory", "hook"] as const) await assert.rejects(() => sdk.capabilities.propose(null, kind, "generated", "{}"), /Choose a project/);
  } finally { sdk.disconnect(); await fixture.close(); }
});
