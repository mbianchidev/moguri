import assert from "node:assert/strict";
import { spawn, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, rm, mkdir, readFile, writeFile, access, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generatedOAuthServer } from "../tests/fixtures/oauth.ts";
import { tsImport } from "tsx/esm/api";
import { generatedRepositoryMetadata } from "../tests/fixtures/repository-info.ts";
import { qualifyCandidateGeneration } from "./qualify-candidate-generation.mjs";
import { qualifyModelEvidence } from "./qualify-model-evidence.mjs";

const { fixtureProvider } = await tsImport("../tests/fixture.ts", import.meta.url);
const { createSshTarget } = await tsImport("../tests/fixtures/ssh-target.ts", import.meta.url);
const { generatedRemoteGithub } = await tsImport("../tests/fixtures/remote-github.ts", import.meta.url);

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const app = resolve(process.argv[2] ?? `release/${version}/Moguri-darwin-arm64/Moguri.app`);
const root = join(app, "Contents", "Resources", "app");
for (const path of [".moguri", ".native", ".impeccable", ".copilot", "test-results", "playwright-report"]) await assert.rejects(() => access(join(root, path)), { code: "ENOENT" });
const node = join(root, "node_modules", "node", "bin", "node");
execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
const { PROTOCOL_VERSION, BROWSER_MCP_TOOLS, defaultSettings } = await import(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href);
assert.match(execFileSync(node, ["--version"], { encoding: "utf8" }), /v26\.12\.0/);
assert.match(execFileSync(node, [join(root, "dist", "tui.mjs"), "--help"], { encoding: "utf8" }), /Moguri TUI/);
assert.match(execFileSync(node, [join(root, "dist", "cli.mjs"), "--help"], { encoding: "utf8" }), /Moguri CLI \+ SDK/);
await access(join(root, "dist", "moguri"), constants.X_OK);
assert.match(execFileSync(join(root, "dist", "moguri"), ["--help"], { encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin" } }), /Moguri CLI \+ SDK/);
await access(join(root, "dist", "remote-bridge.mjs"));
if (PROTOCOL_VERSION >= 23) for (const path of ["terminal-broker.mjs", "runtime.mjs"]) await access(join(root, "dist", path));
if (PROTOCOL_VERSION >= 25) await access(join(root, "dist", "terminal-bridge.mjs"));
if (PROTOCOL_VERSION >= 87) execFileSync(node, [resolve("tests/fixtures/installed-session-controls.mjs"), root], { stdio: "inherit", timeout: 60_000 });
const nodeSdk = await import(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href);
if (typeof nodeSdk.restartMoguriService === "function") execFileSync(node, [resolve("tests/fixtures/installed-service-recovery.mjs"), root, app], { stdio: "inherit", timeout: 90_000 });
if (PROTOCOL_VERSION >= 88) execFileSync(node, [resolve("tests/fixtures/installed-service-negotiation.mjs"), root, app], { stdio: "inherit", timeout: 45_000 });
assert.match(execFileSync(node, [join(root, "node_modules", "pnpm", "bin", "pnpm.mjs"), "--version"], { encoding: "utf8" }), /12\.14\.0/);
assert.match(execFileSync(join(root, "dist", "native", "speech", "bin", "nemo-speech"), ["--version"], { encoding: "utf8" }), /0\.2\.0/);
const iconName = execFileSync("plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", join(app, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
const icon = join(app, "Contents", "Resources", iconName.endsWith(".icns") ? iconName : `${iconName}.icns`);
await access(icon);
assert.deepEqual(await readFile(icon), await readFile(join(root, "dist", "branding", "moguri.icns")));
const rendererAssets = await readdir(join(root, "dist", "desktop", "renderer", "assets"));
assert.ok(rendererAssets.some((path) => /^ghostty-vt-.*\.wasm$/.test(path)));
assert.ok(rendererAssets.some((path) => /^(?:GhosttyTerminal|SessionTerminal)-.*\.js$/.test(path)));
const temporary = await mkdtemp(join(tmpdir(), "moguri-packaged-"));
const oauth = await generatedOAuthServer();
let modelFixture;
let ssh;
let github;
let child;
let timer;
let exit;
const modelOptions = { maxOutputTokens: 128, responseMode: "text", replyText: "Generated packaged summary: preserve the retained task, observed outcomes and unresolved work." };
try {
  modelFixture = await fixtureProvider(modelOptions);
  if (PROTOCOL_VERSION >= 34) console.log(await qualifyModelEvidence({ node, packageRoot: root, directory: join(temporary, "generated-explicit-model-evidence") }));
  const preparedModel = await modelFixture.provider.prepare(modelFixture.modelId, AbortSignal.timeout(5000));
  const sshRoot = join(temporary, "generated-ssh"), remoteRoot = join(temporary, "generated-remote-project");
  await mkdir(sshRoot, { mode: 0o700 }); await mkdir(remoteRoot, { mode: 0o700 });
  ssh = await createSshTarget(sshRoot);
  ssh.target.command = [node, join(root, "bin", "moguri.mjs"), "worker", "--stdio"]; ssh.target.allowCopilot = false;
  if (PROTOCOL_VERSION >= 26) {
    github = await generatedRemoteGithub(sshRoot, ssh.target, { bridge: join(root, "dist", "remote-bridge.mjs"), node });
    ssh.target = github.target;
  }
  const project = join(temporary, "generated-project");
  await mkdir(project);
  const home = join(temporary, "generated-home"); await mkdir(home);
  await writeFile(join(project, "generated.ts"), "export function packagedSdkKnowledge() { return 'generated'; }");
  const generatedBin = join(temporary, "generated-bin"); await mkdir(generatedBin);
  await writeFile(join(generatedBin, "gh"), `#!/bin/sh\nprintf '%s' '${JSON.stringify(generatedRepositoryMetadata())}'\n`, { mode: 0o700 });
  const source = `
    import {createRuntime} from ${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href)};
    const provider={
      state:${JSON.stringify(modelFixture.provider.state)},
      onChange:()=>{},refresh:async()=>provider.onChange(),
      login:()=>{throw new Error("No live authorization in package verification")},
      cancel:async()=>{},logout:async()=>{},prepare:async(id)=>{
        const prepared=${JSON.stringify(preparedModel)};
        if(id!==prepared.model.id)throw new Error("Unknown generated packaged model; no provider fallback");
        return prepared;
      }
    };
    const credentials=new Map();
    const vault={read:async(id)=>credentials.get(id)??null,write:async(id,value)=>{credentials.set(id,value);},remove:async(id)=>{credentials.delete(id);}};
    const options={stateDir:${JSON.stringify(join(temporary, "state"))},provider,retentionKey:Buffer.alloc(32,0x67),platform:{vault,remote:{vault,modelsVault:vault},terminal:{vault,defaultRoot:${JSON.stringify(home)},executable:"/bin/sh",args:["-c","printf 'GENERATED_PACKAGED_PTY_READY\\n'; exec cat"]}}};
    let service=await createRuntime(options);
    process.send(service.connection);
    const close=async()=>{await service.close();if(process.connected)process.disconnect();};
    process.on("message",async(message)=>{
      if(message==="close")await close();
      else if(message==="restart"||message==="stop-reopen"){
        await service.close({preserveTerminals:message==="restart"});service=await createRuntime(options);
        process.send({kind:"restarted",connection:service.connection});
      }
    });
    process.once("SIGTERM",()=>void close());
  `;
  child = spawn(node, ["--input-type=module", "--eval", source], { stdio: ["ignore", "ignore", "inherit", "ipc"], env: { ...process.env, PATH: `${generatedBin}:${process.env.PATH}` } });
  exit = new Promise((resolve) => child.once("exit", resolve));
  let connection = await new Promise((resolve, reject) => {
    child.once("message", resolve); child.once("error", reject);
    timer = setTimeout(() => reject(new Error("Packaged service did not become ready.")), 10_000);
  });
  clearTimeout(timer);
  const headers = { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" };
  const replaceService = async (preserve) => {
    const ready = new Promise((resolve, reject) => {
      child.once("message", (value) => {
        clearTimeout(timer);
        if (value?.kind !== "restarted" || !value.connection) { reject(new Error("Actual bundled service returned no replacement connection.")); return; }
        resolve(value.connection);
      });
      timer = setTimeout(() => reject(new Error("Actual bundled controller replacement did not complete.")), 10_000);
    });
    child.send(preserve ? "restart" : "stop-reopen"); connection = await ready; headers.Authorization = `Bearer ${connection.token}`;
  };
  const send = async (command) => {
    const response = await fetch(`${connection.baseUrl}/v1/commands`, { method: "POST", headers, body: JSON.stringify({ id: randomUUID(), profileId: "default", command }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const query = async (input) => {
    const response = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(response.status, 200); return response.json();
  };
  const opened = await send({ type: "project.add", path: project });
  const created = await send({ type: "session.create", projectId: opened.id });
  const response = await fetch(`${connection.baseUrl}/v1/snapshot`, { headers });
  const snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.protocolVersion, PROTOCOL_VERSION);
  assert.equal(snapshot.settings.values.appearance.theme, "dark");
  assert.equal((await query({ type: "remote.status" })).remote.ready, false);
  assert.deepEqual(snapshot.sessions[0].controls, { env: "Local", modelId: null, autonomy: "Manual", budget: { kind: "unlimited" } });
  assert.equal((await fetch(`${connection.baseUrl}/v1/snapshot`)).status, 401);
  const general = await send({ type: "session.create" });
  const preview = await query({ type: "suggestions.preview", sessionId: general.id, allProjects: false });
  assert.equal(preview.preview.scope, "project-free"); assert.equal(preview.preview.sources.length, 0);
  const generalTools = await query({ type: "mcp.tools", serverId: "builtin", sessionId: general.id, query: "", offset: 0 });
  assert.deepEqual(generalTools.tools.map((tool) => tool.name), [...(PROTOCOL_VERSION >= 56 ? BROWSER_MCP_TOOLS.map((tool) => tool.name) : []), "fetch_page"]);
  const meta = await send({ type: "metachat.create", projectId: null, parentSessionId: general.id, prompt: "Generated packaged settings request." });
  const proposed = await send({ type: "configuration.propose", sessionId: meta.id, proposal: { target: "global", section: "instructions", value: "Generated packaged guidance.", reason: "Generated packaged exact review." } });
  const reviewed = await query({ type: "configuration.review", proposalId: proposed.id });
  assert.equal(reviewed.before, "");
  await send({ type: "configuration.decide", proposalId: proposed.id, approve: true, expectedDigest: reviewed.proposal.contentDigest, acknowledgeRisk: true });
  const configured = await (await fetch(`${connection.baseUrl}/v1/snapshot`, { headers })).json();
  assert.equal(configured.settings.values.instructions, "Generated packaged guidance.");
  assert.deepEqual(configured.settings.values.notifications, defaultSettings().notifications);
  const { MoguriSdk } = await import(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href);
  const sdk = await new MoguriSdk(connection).ready();
  try {
    if (PROTOCOL_VERSION >= 72) {
      const owner = await sdk.sessions.create(null, "Generated actual packaged Home execution"), binding = (await sdk.workspaces.home(owner.id)).root;
      assert.equal(binding.root, await realpath(home)); assert.equal(sdk.getState().snapshot.sessions.find((session) => session.id === owner.id).projectId, null);
      const file = (await sdk.tools.catalog(owner.id, "write_file")).tools.find((tool) => tool.name === "write_file");
      const written = await sdk.tools.execute(owner.id, file.name, { path: "generated-packaged-home.txt", text: "GENERATED_PACKAGED_HOME\n", expectedDigest: "absent" }, file.schemaDigest);
      const approval = sdk.getState().snapshot.sessions.find((session) => session.id === owner.id).pendingApproval;
      if (PROTOCOL_VERSION >= 73) assert.equal(approval, null);
      else { assert.ok(approval); await sdk.approvals.respond(owner.id, approval.id, true); }
      assert.equal((await sdk.jobs.wait(written.id)).status, "completed");
      assert.equal((await sdk.workspaces.file(owner.id, "generated-packaged-home.txt")).text, "GENERATED_PACKAGED_HOME\n");
      const command = (await sdk.tools.catalog(owner.id, "run_command")).tools.find((tool) => tool.name === "run_command");
      const started = await sdk.tools.execute(owner.id, command.name, { command: "pwd", timeoutMs: 2000 }, command.schemaDigest);
      const pending = sdk.getState().snapshot.sessions.find((session) => session.id === owner.id).pendingApproval;
      assert.ok(pending); await sdk.approvals.respond(owner.id, pending.id, true);
      assert.equal((await sdk.jobs.wait(started.id)).status, "completed");
      const actual = (await sdk.agentTerminals.list(owner.id)).activity.entries[0];
      assert.ok((await sdk.agentTerminals.read(owner.id, actual.id)).content.text.includes(binding.root));
      assert.equal(sdk.getState().snapshot.chatWriters.filter((writer) => writer.sessionId === owner.id && writer.status === "settled").length, 2);
      assert.equal(modelFixture.requests.length, 0);
      console.log("Actual bundled protocol-72 service/SDK/Node executes approved Home files and commands, retains exact writer settlement and original Agent output with a real null project and no inference.");
      if (PROTOCOL_VERSION >= 73) {
        await sdk.webAllowlist.add("session.example.invalid", { kind: "session", sessionId: owner.id });
        await sdk.webAllowlist.add("global.example.invalid", { kind: "global" });
        assert.deepEqual(sdk.webAllowlist.list(owner.id).map((entry) => entry.site), ["session.example.invalid", "global.example.invalid"]);
        const shared = await sdk.slash(owner.id, "/firewall list", "tui");
        assert.equal(shared.kind, "text"); assert.equal(JSON.parse(shared.text).effective.length, 2);
        const read = (await sdk.tools.catalog(owner.id, "read_file")).tools.find((tool) => tool.name === "read_file");
        const refreshed = await sdk.tools.execute(owner.id, read.name, { path: "generated-packaged-home.txt", expectedDigest: "0".repeat(64) }, read.schemaDigest);
        assert.equal((await sdk.jobs.wait(refreshed.id)).status, "completed");
        const result = JSON.parse((await sdk.mcp.readResult(refreshed.id)).text), view = JSON.parse(result.text);
        assert.equal(result.isError, false); assert.equal(view.text, "GENERATED_PACKAGED_HOME\n");
        assert.equal(view.sourceVersion.refreshed, true); assert.equal(view.sourceVersion.requestedDigest, "0".repeat(64));
        assert.match(view.sourceRef.expectedDigest, /^[a-f0-9]{64}$/); assert.notEqual(view.sourceRef.expectedDigest, "0".repeat(64));
        const decisions = sdk.getState().events.filter((event) => event.session_id === owner.id && event.event_type === "tool.decided");
        assert.deepEqual(decisions.map((event) => event.payload.actor), ["policy", "user", "policy"]);
        for (const entry of [...sdk.webAllowlist.list()]) await sdk.webAllowlist.remove(entry.id);
        assert.equal(modelFixture.requests.length, 0);
        console.log("Actual bundled protocol-73 SDK/shared TUI preserve exact Local website scopes, policy-versus-user attribution and fresh-source digests without another approval or model call.");
      }
    }
    const settings = sdk.settings.get();
    await sdk.settings.update({ ...settings.values, mcpServers: [{ id: "generated-packaged-oauth", name: "Generated packaged OAuth", enabled: true, transport: { type: "http", url: oauth.url, auth: "oauth" } }] }, settings.revision);
    const login = await sdk.mcp.oauthBegin("generated-packaged-oauth", general.id);
    const state = await sdk.mcp.oauthStatus(login.id);
    assert.equal((await fetch(await oauth.callback(state.url))).status, 200);
    const tools = (await sdk.mcp.tools("generated-packaged-oauth", "", 0, general.id)).tools;
    assert.equal(tools[0].name, "oauth_echo");
    assert.match(tools[0].description, /\[redacted\]/);
    const called = await sdk.mcp.call(general.id, "generated-packaged-oauth", "oauth_echo", {}, tools[0].digest);
    let approval;
    for (let index = 0; index < 100 && !approval; index++) {
      approval = sdk.getState().snapshot.sessions.find((session) => session.id === general.id)?.pendingApproval;
      if (!approval) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(approval);
    await sdk.command({ type: "approval.respond", sessionId: general.id, approvalId: approval.id, allow: true });
    assert.equal((await sdk.jobs.wait(called.id, { timeoutMs: 10_000 })).status, "completed");
    if (PROTOCOL_VERSION >= 21) {
      const outcomes = await sdk.telemetry.operations({ sessionId: general.id, family: "mcp" });
      assert.equal(outcomes.totals.completed, 1); assert.equal(outcomes.entries[0].actor, "external");
      assert.equal(outcomes.entries[0].name, "oauth_echo");
      assert.equal(Object.hasOwn(outcomes.entries[0], "text"), false);
      assert.equal(Object.hasOwn(outcomes.entries[0], "arguments"), false);
      const retained = (await sdk.telemetry.storage()).storage;
      assert.ok(retained.bytes.total > 0); assert.equal(retained.physicalBytes, null);
    }
    assert.match((await sdk.mcp.readResult(called.id)).text, /Generated OAuth tool response \[redacted\]/);
    await sdk.mcp.oauthClear("generated-packaged-oauth", general.id);
    assert.equal((await sdk.mcp.auth("generated-packaged-oauth")).state, "required");
  } finally { sdk.disconnect(); }
  const compactor = await send({ type: "session.create", title: "Generated packaged compaction", overrides: { modelId: modelFixture.modelId } });
  const currentSnapshot = async () => (await fetch(`${connection.baseUrl}/v1/snapshot`, { headers })).json();
  for (let turn = 0; turn < 3; turn++) {
    const session = (await currentSnapshot()).sessions.find((value) => value.id === compactor.id);
    await send({ type: "draft.save", sessionId: compactor.id, expectedRevision: session.draft.revision, text: `Generated packaged turn ${turn}. ` + "Generated retained packaged context. ".repeat(100), attachments: [] });
    await send({ type: "message.send", sessionId: compactor.id, expectedRevision: session.draft.revision + 1, delivery: "queue" });
    let outcome;
    for (let index = 0; index < 400; index++) {
      outcome = (await currentSnapshot()).sessions.find((value) => value.id === compactor.id);
      if (!outcome.turnId) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(outcome.status, "completed");
  }
  const compactionPreview = (await query({ type: "compaction.preview", sessionId: compactor.id, keepRecentTurns: 1 })).preview;
  const requested = await send({ type: "compaction.generate", sessionId: compactor.id, modelId: compactionPreview.modelId, keepRecentTurns: 1, expectedDigest: compactionPreview.digest, confirmCost: true });
  let compactionState, proposal;
  for (let index = 0; index < 400; index++) {
    compactionState = await query({ type: "compaction.state", sessionId: compactor.id });
    proposal = compactionState.compactions.find((value) => value.id === requested.id);
    if (proposal && proposal.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(proposal.status, "proposed");
  assert.match((await query({ type: "compaction.read", sessionId: compactor.id, compactionId: proposal.id })).text, /Generated packaged summary/);
  await send({ type: "compaction.apply", sessionId: compactor.id, compactionId: proposal.id, expectedRevision: proposal.revision });
  compactionState = await query({ type: "compaction.state", sessionId: compactor.id });
  assert.equal(compactionState.activeId, proposal.id);
  assert.ok(compactionState.estimatedTokens < compactionState.originalEstimatedTokens);
  const calls = (await query({ type: "budget.calls", sessionId: compactor.id, role: "compaction" })).calls;
  assert.equal(calls.length, 1); assert.equal(calls[0].reportedTokens, 42);
  await send({ type: "compaction.restore", sessionId: compactor.id, expectedActiveId: proposal.id, expectedSourceDigest: compactionState.sourceDigest, confirm: true });
  assert.equal((await query({ type: "compaction.state", sessionId: compactor.id })).activeId, null);
  assert.equal(modelFixture.requests.length, 4);
  let remoteSdk = await new MoguriSdk(connection).ready();
  try {
    const settings = remoteSdk.settings.get();
    await remoteSdk.settings.update({ ...settings.values, remote: ssh.target }, settings.revision); await remoteSdk.remote.probe();
    const configuration = (await remoteSdk.projects.configuration(opened.id)).configuration;
    await remoteSdk.projects.configure(opened.id, { ...configuration.values, remotePath: await realpath(remoteRoot) }, configuration.revision);
    const session = await remoteSdk.sessions.create(opened.id, "Generated actual packaged Remote save", { env: "Remote", modelId: null });
    const plan = await remoteSdk.plans.read(session.id);
    const text = "Generated actual packaged service/SSH worker plan bytes.\n";
    const saved = await remoteSdk.plans.save(session.id, text, plan.digest, plan.bindingDigest);
    assert.equal(await readFile(join(remoteRoot, "docs/plan.md"), "utf8"), text);
    await assert.rejects(() => readFile(join(project, "docs/plan.md")), { code: "ENOENT" });
    const artifact = await remoteSdk.artifacts.read(saved.id);
    assert.equal(artifact.text, text); assert.equal(artifact.artifact.sources[0].boundary.env, "Remote");
    const operation = (await remoteSdk.plans.saves(session.id)).saves[0];
    assert.equal(operation.status, "completed"); assert.equal(operation.fileOutcome, "written");
    if (PROTOCOL_VERSION >= 24) {
      const preview = (await remoteSdk.mcp.remotePreview(session.id, "builtin")).preview;
      assert.equal(preview.granted, false);
      await remoteSdk.mcp.grantRemote(session.id, "builtin", preview.digest, preview.settingsRevision, false, true);
      await remoteSdk.remote.probe();
      const tool = (await remoteSdk.mcp.tools("builtin", "grep", 0, session.id)).tools.find((tool) => tool.name === "grep_logs");
      assert.equal(tool.scope.root, await realpath(remoteRoot));
      const pending = await remoteSdk.mcp.call(session.id, "builtin", tool.name, { path: "docs/plan.md", query: "Generated actual packaged" }, tool.digest);
      const waiting = (await remoteSdk.mcp.remoteCalls(session.id)).calls[0];
      if (PROTOCOL_VERSION < 73) assert.equal(waiting.executionId, null);
      assert.equal(waiting.actor, "external"); assert.equal(waiting.accessForwarded, false);
      const approval = remoteSdk.getState().snapshot.sessions.find((value) => value.id === session.id).pendingApproval;
      if (PROTOCOL_VERSION >= 73) assert.equal(approval, null);
      else await remoteSdk.command({ type: "approval.respond", sessionId: session.id, approvalId: approval.id, allow: true });
      assert.equal((await remoteSdk.jobs.wait(pending.id)).status, "completed");
      const call = (await remoteSdk.mcp.remoteCalls(session.id)).calls[0];
      assert.equal(call.status, "completed");
      assert.match(JSON.stringify((await remoteSdk.mcp.remoteCall(session.id, call.id)).result), /Generated actual packaged service/);
      assert.equal(remoteSdk.getState().snapshot.executions.find((value) => value.id === call.executionId).cleanup, "owned-worker-stopped");
      await remoteSdk.mcp.revokeRemote(session.id, "builtin", remoteSdk.settings.get().revision, true);
      assert.match((await remoteSdk.mcp.readResult(pending.id)).text, /Generated actual packaged service/);
    }
    if (PROTOCOL_VERSION >= 25) {
      await remoteSdk.remote.probe(); assert.ok((await remoteSdk.remote.status()).remote.terminalBuild);
      const opened = await remoteSdk.terminal.open(session.id);
      let before;
      for (let index = 0; index < 100; index++) { before = await remoteSdk.terminal.read(opened.id); if (before.data.includes("GENERATED_PACKAGED_PTY_READY")) break; await new Promise((resolve) => setTimeout(resolve, 15)); }
      assert.equal(before.terminal.env, "Remote"); assert.equal(before.terminal.binding.root, await realpath(remoteRoot));
      const owner = remoteSdk.getState().snapshot.terminalOwners.find((value) => value.id === before.terminal.ownerId);
      assert.equal(owner.remote.target.command[0], node);
      await remoteSdk.terminal.input(opened.id, "GENERATED_ACTUAL_PACKAGED_REMOTE_INPUT\n");
      for (let index = 0; index < 100; index++) { if ((await remoteSdk.terminal.read(opened.id)).data.includes("GENERATED_ACTUAL_PACKAGED_REMOTE_INPUT")) break; await new Promise((resolve) => setTimeout(resolve, 15)); }
      remoteSdk.disconnect(); await replaceService(true); remoteSdk = await new MoguriSdk(connection).ready();
      const after = await remoteSdk.terminal.read(opened.id);
      assert.equal(after.terminal.pid, before.terminal.pid); assert.notEqual(after.terminal.attachmentId, before.terminal.attachmentId);
      assert.equal(remoteSdk.getState().snapshot.terminalOwners.find((value) => value.id === owner.id).pid, owner.pid);
      assert.match(after.data, /GENERATED_ACTUAL_PACKAGED_REMOTE_INPUT/); assert.equal(after.data.split("GENERATED_PACKAGED_PTY_READY").length - 1, 1);
      assert.equal((await remoteSdk.remote.status()).remote.ready, false);
      await remoteSdk.terminal.input(opened.id, "GENERATED_PACKAGED_REMOTE_AFTER_RESTART\n");
      let resumed = "";
      for (let index = 0; index < 100 && !resumed.includes("GENERATED_PACKAGED_REMOTE_AFTER_RESTART"); index++) { resumed = (await remoteSdk.terminal.read(opened.id)).data; if (!resumed.includes("GENERATED_PACKAGED_REMOTE_AFTER_RESTART")) await new Promise((resolve) => setTimeout(resolve, 15)); }
      assert.match(resumed, /GENERATED_PACKAGED_REMOTE_AFTER_RESTART/);
      await remoteSdk.terminal.close(opened.id);
    }
    if (PROTOCOL_VERSION >= 26) {
      const git = (args) => execFileSync("/usr/bin/git", ["--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], { cwd: remoteRoot, encoding: "utf8" });
      git(["init", "--initial-branch=generated-remote-metadata"]); git(["add", "--", "docs/plan.md"]);
      git(["-c", "user.name=Generated fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "Generated bundled SSH repository"]);
      git(["remote", "add", "origin", "https://github.com/generated/example.git"]);
      const config = (await remoteSdk.projects.configuration(opened.id)).configuration;
      await remoteSdk.projects.configure(opened.id, { ...config.values, repo: { ...config.values.repo, githubAccess: "gh-cli" } }, config.revision);
      await remoteSdk.remote.probe();
      const preview = (await remoteSdk.repositories.preview(session.id)).preview;
      assert.equal(preview.lookupBoundary, "remote-gh-cli"); assert.equal(preview.remote.root, await realpath(remoteRoot));
      const refresh = await remoteSdk.repositories.refresh(session.id, preview.bindingDigest, preview.revision, true);
      assert.equal((await remoteSdk.jobs.wait(refresh.id)).status, "completed");
      const retained = (await remoteSdk.repositories.state(session.id)).observation;
      assert.equal(retained.repository.visibility, "private"); assert.deepEqual(retained.remote, preview.remote);
      const cli = execFileSync(node, [join(root, "bin", "moguri.mjs"), "slash", "/repository state", "--session", session.id], { env: { ...process.env, MOGURI_STATE_DIR: join(temporary, "state") }, encoding: "utf8" });
      assert.match(cli, /remote-gh-cli/);
      remoteSdk.disconnect(); await replaceService(true); remoteSdk = await new MoguriSdk(connection).ready();
      await remoteSdk.remote.probe(); assert.deepEqual((await remoteSdk.repositories.state(session.id)).observation, retained);
      const calls = await github.records(); assert.equal(calls.length, 1); assert.equal(calls[0].home, github.home); assert.equal(calls[0].cwd, await realpath(remoteRoot));
    }
    if (PROTOCOL_VERSION >= 27) {
      const settings = structuredClone(remoteSdk.settings.get().values); settings.memory.enabled = true;
      await remoteSdk.settings.update(settings, remoteSdk.settings.get().revision);
      const local = await remoteSdk.memory.index(opened.id); assert.equal((await remoteSdk.jobs.wait(local.id)).status, "completed");
      await assert.rejects(() => remoteSdk.memory.searchSession(session.id, "Generated actual packaged"), { code: "memory_missing" });
      const command = { type: "memory.index", sessionId: session.id }, commandId = randomUUID();
      const indexed = await remoteSdk.command(command, commandId); assert.equal((await remoteSdk.jobs.wait(indexed.id)).status, "completed");
      const before = (await remoteSdk.memory.state(session.id)).index; assert.equal(before.binding.env, "Remote"); assert.equal(before.binding.root, await realpath(remoteRoot));
      const hits = await remoteSdk.memory.searchSession(session.id, "Generated actual packaged service");
      assert.ok(hits.items.some((hit) => hit.text.includes("Generated actual packaged service") && !hit.stale));
      const cli = execFileSync(node, [join(root, "bin", "moguri.mjs"), "memory", "search", "Generated actual packaged service", "--session", session.id],
        { env: { ...process.env, MOGURI_STATE_DIR: join(temporary, "state") }, encoding: "utf8" });
      assert.match(cli, /Generated actual packaged service/);
      remoteSdk.disconnect(); await replaceService(true); remoteSdk = await new MoguriSdk(connection).ready();
      assert.equal((await remoteSdk.command(command, commandId)).id, indexed.id); assert.equal((await remoteSdk.remote.status()).remote.ready, false);
      await remoteSdk.remote.probe(); assert.deepEqual((await remoteSdk.memory.state(session.id)).index, before);
      const preview = (await remoteSdk.mcp.remotePreview(session.id, "builtin")).preview;
      await remoteSdk.mcp.grantRemote(session.id, "builtin", preview.digest, preview.settingsRevision, false, true); await remoteSdk.remote.probe();
      const tool = (await remoteSdk.mcp.tools("builtin", "memory", 0, session.id)).tools.find((tool) => tool.name === "search_memory");
      const requested = await remoteSdk.mcp.call(session.id, "builtin", tool.name, { query: "Generated actual packaged service" }, tool.digest);
      const approval = remoteSdk.getState().snapshot.sessions.find((value) => value.id === session.id).pendingApproval;
      if (PROTOCOL_VERSION >= 73) assert.equal(approval, null);
      else await remoteSdk.command({ type: "approval.respond", sessionId: session.id, approvalId: approval.id, allow: true });
      assert.equal((await remoteSdk.jobs.wait(requested.id)).status, "completed");
      assert.match((await remoteSdk.mcp.readResult(requested.id)).text, /Generated actual packaged service/);
    }
    assert.equal(remoteSdk.getState().snapshot.sessions.find((value) => value.id === session.id).usage.length, 0);
    assert.equal(modelFixture.requests.length, 4);
  } finally { remoteSdk.disconnect(); }
  if (PROTOCOL_VERSION >= 25) {
    await replaceService(false);
    const response = await fetch(`${connection.baseUrl}/v1/snapshot`, { headers }); assert.equal(response.status, 200);
    const stopped = await response.json();
    assert.equal(stopped.terminalOwners.filter((owner) => owner.status !== "stopped" && owner.status !== "acknowledged").length, 0);
    assert.ok(stopped.terminalOwners.every((owner) => owner.cleanup === "removed"));
  }
  const terminal = await send({ type: "terminal.open", sessionId: created.id, cols: 80, rows: 24 });
  const input = await fetch(`${connection.baseUrl}/v1/terminal`, { method: "POST", headers, body: JSON.stringify({ action: "input", terminalId: terminal.id, data: "GENERATED_PACKAGED_PTY_INPUT\n" }) });
  assert.equal(input.status, 200);
  let output = "";
  for (let index = 0; index < 50 && !(output.includes("GENERATED_PACKAGED_PTY_READY") && output.includes("GENERATED_PACKAGED_PTY_INPUT")); index++) {
    const response = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "terminal.read", terminalId: terminal.id, offset: 0, limit: 65536 }) });
    assert.equal(response.status, 200); output = (await response.json()).data;
    if (!(output.includes("GENERATED_PACKAGED_PTY_READY") && output.includes("GENERATED_PACKAGED_PTY_INPUT"))) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /GENERATED_PACKAGED_PTY_READY/); assert.match(output, /GENERATED_PACKAGED_PTY_INPUT/);
  await send({ type: "terminal.close", terminalId: terminal.id });
  const status = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "voice.status" }) });
  assert.equal(status.status, 200);
  const { voice } = await status.json();
  assert.equal(voice.runtimeReady, true);
  assert.equal(voice.modelReady, false);
  assert.equal(voice.languageLocales.length, 40);
  const issue = await send({ type: "issue.create", projectId: opened.id, title: "Generated packaged SDK ticket", body: "Generated", kind: "feature", phaseId: "backlog", pullRequestUrl: null });
  assert.ok(issue.id);
  const boardResponse = await fetch(`${connection.baseUrl}/v1/query`, { method: "POST", headers, body: JSON.stringify({ type: "board.get", projectId: opened.id }) });
  const board = await boardResponse.json();
  assert.equal(board.issues[0].title, "Generated packaged SDK ticket");
  if (PROTOCOL_VERSION >= 22) {
    const repositoryRoot = join(temporary, "generated-attribution-project"); await mkdir(repositoryRoot); await writeFile(join(repositoryRoot, "fixture.txt"), "Generated attributed packaged source.\n");
    const git = (args) => execFileSync("git", ["--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], { cwd: repositoryRoot, encoding: "utf8" });
    git(["init", "--initial-branch=main"]); git(["add", "--", "fixture.txt"]); git(["-c", "user.name=Generated fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "Generated packaged attribution"]);
    git(["remote", "add", "origin", "https://github.com/generated/example.git"]);
    const project = await send({ type: "project.add", path: repositoryRoot }), sdk = await new MoguriSdk(connection).ready();
    try {
      const configuration = (await sdk.projects.configuration(project.id)).configuration;
      await sdk.projects.configure(project.id, { ...configuration.values, repo: { ...configuration.values.repo, githubAccess: "gh-cli" } }, configuration.revision);
      const session = await sdk.sessions.create(project.id, "Generated real packaged attributed call", { modelId: modelFixture.modelId, env: "Local" });
      const preview = (await sdk.repositories.preview(session.id)).preview, refresh = await sdk.repositories.refresh(session.id, preview.bindingDigest, preview.revision, true);
      assert.equal((await sdk.jobs.wait(refresh.id)).status, "completed");
      await sdk.command({ type: "draft.save", sessionId: session.id, expectedRevision: 0, text: "Generated actual bundled repository-attributed model call.", attachments: [] });
      await sdk.command({ type: "message.send", sessionId: session.id, expectedRevision: 1, delivery: "queue" });
      let current;
      for (let index = 0; index < 400; index++) { current = sdk.getState().snapshot.sessions.find((value) => value.id === session.id); if (!current.turnId) break; await new Promise((resolve) => setTimeout(resolve, 20)); }
      assert.equal(current.status, "completed");
      const calls = await sdk.budgets.calls({ sessionId: session.id, repositoryId: 42, organization: "generated", visibility: "open-source" });
      assert.equal(calls.calls.length, 1); assert.equal(calls.calls[0].repository.fullName, "generated/example"); assert.equal(calls.calls[0].repository.osiApproved, true);
      assert.equal(modelFixture.requests.length, 5);
    } finally { sdk.disconnect(); }
  }
  if (PROTOCOL_VERSION >= 23) {
    let consoleSdk = await new MoguriSdk(connection).ready(), desktop;
    const consoles = [];
    try {
      const first = await consoleSdk.terminal.open(created.id);
      consoles.push((await consoleSdk.terminal.read(first.id)).terminal);
      const owner = consoleSdk.getState().snapshot.terminalOwners.find((owner) => owner.id === consoles[0].ownerId);
      assert.equal(owner.remote, undefined);
      const { _electron } = await import("@playwright/test");
      desktop = await _electron.launch({ executablePath: join(app, "Contents", "MacOS", "Moguri"), args: [],
        env: { ...process.env, MOGURI_STATE_DIR: join(temporary, "state"), MOGURI_TEST_WINDOW: "hidden" } });
      const page = await desktop.firstWindow();
      await page.getByLabel("Prompt", { exact: true }).waitFor();
      await desktop.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0].webContents.send("moguri:navigate-session", id, "default"), created.id);
      await page.getByRole("button", { name: "Terminal", exact: true }).click();
      await page.locator(".ghostty-host canvas").first().waitFor({ state: "visible" });
      const rss = (pids) => {
        const rows = execFileSync("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], { encoding: "utf8" }).trim().split("\n").map((row) => row.trim().split(/\s+/).map(Number));
        assert.equal(rows.length, pids.length); assert.ok(rows.every(([pid, kib]) => pids.includes(pid) && Number.isFinite(kib) && kib > 0));
        return { kib: rows.reduce((total, [, kib]) => total + kib, 0), processes: rows.map(([pid, kib]) => ({ pid, mib: kib / 1024 })) };
      };
      const footprint = async (tabs) => {
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await desktop.evaluate(({ app }) => app.getAppMetrics());
        const electronKiB = metrics.reduce((total, metric) => total + metric.memory.workingSetSize, 0);
        const runtime = rss([child.pid, owner.pid]), userPrograms = rss(consoles.map((terminal) => terminal.pid));
        const desktopMiB = electronKiB / 1024, moguriMiB = (electronKiB + runtime.kib) / 1024;
        console.log(JSON.stringify({ qualification: "actual-packaged-user-consoles", tabs, owners: consoleSdk.getState().snapshot.terminalOwners.filter((owner) => owner.status === "running").length,
          desktopMiB, moguriMiB, electron: metrics.map((metric) => ({ pid: metric.pid, type: metric.type, mib: metric.memory.workingSetSize / 1024 })), runtime: runtime.processes,
          userProgramsMiB: userPrograms.kib / 1024, desktopBudgetMiB: 600, budgetScope: "Electron shell aggregate, matching scripts/spikes.mjs; control-plane/broker and combined totals reported separately" }));
        assert.ok(desktopMiB < 600, `Actual packaged desktop working set ${desktopMiB.toFixed(2)} MiB exceeded the 600-MiB Electron-shell budget.`);
      };
      await footprint(1);
      for (let index = 0; index < 3; index++) {
        const opened = await consoleSdk.terminal.open(created.id); consoles.push((await consoleSdk.terminal.read(opened.id)).terminal);
      }
      assert.equal(new Set(consoles.map((terminal) => terminal.ownerId)).size, 1);
      assert.equal(consoleSdk.getState().snapshot.terminalOwners.filter((owner) => owner.status === "running").length, 1);
      await footprint(4);
      const previousAttachments = new Map(await Promise.all(consoles.map(async (terminal) => {
        const current = (await consoleSdk.terminal.read(terminal.id)).terminal;
        assert.equal(current.pid, terminal.pid); assert.equal(current.ownerId, owner.id);
        return [terminal.id, current.attachmentId];
      })));
      consoleSdk.disconnect();
      await replaceService(true);
      consoleSdk = await new MoguriSdk(connection).ready();
      for (const terminal of consoles) {
        const observed = await consoleSdk.terminal.read(terminal.id);
        assert.equal(observed.terminal.pid, terminal.pid); assert.equal(observed.terminal.ownerId, owner.id);
        assert.notEqual(observed.terminal.attachmentId, previousAttachments.get(terminal.id));
        assert.equal(observed.data.split("GENERATED_PACKAGED_PTY_READY").length - 1, 1);
      }
      assert.equal(consoleSdk.getState().snapshot.terminalOwners.find((value) => value.id === owner.id).pid, owner.pid);
      await consoleSdk.terminal.input(consoles[0].id, "GENERATED_PACKAGED_REATTACHED_INPUT\n");
      let observed = "";
      for (let index = 0; index < 50 && !observed.includes("GENERATED_PACKAGED_REATTACHED_INPUT"); index++) {
        observed = (await consoleSdk.terminal.read(consoles[0].id)).data;
        if (!observed.includes("GENERATED_PACKAGED_REATTACHED_INPUT")) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.match(observed, /GENERATED_PACKAGED_REATTACHED_INPUT/);
      for (const terminal of consoles) await consoleSdk.terminal.close(terminal.id);
      assert.equal(modelFixture.requests.length, 5);
      await desktop.close(); desktop = undefined;
      await replaceService(false);
    } finally { await desktop?.close(); consoleSdk.disconnect(); }
  }
  if (PROTOCOL_VERSION >= 29) {
    const { MoguriSdk } = await import(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href);
    const { DatabaseSync } = await import("node:sqlite");
    const directory = join(temporary, "generated-packaged-candidate"); await mkdir(directory);
    const original = "Generated actual packaged candidate base.\n", proposed = "Generated actual packaged reviewed bytes.\n";
    await writeFile(join(directory, "candidate.txt"), original);
    const git = (args) => execFileSync("git", ["--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], { cwd: directory, encoding: "utf8" });
    git(["init", "--initial-branch=main"]); git(["add", "--", "candidate.txt"]);
    git(["-c", "user.name=Generated fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "Generated packaged candidate base"]);
    let client = await new MoguriSdk(connection).ready();
    try {
      const beforeCalls = modelFixture.requests.length, project = await client.command({ type: "project.add", path: directory });
      const source = await client.sessions.create(project.id, "Generated packaged candidate source", { env: "Local", modelId: null });
      const created = await client.workspaces.create(project.id, "moguri/generated-packaged-candidate"), stage = await client.workspaces.wait(created.id);
      const index = await readFile(join(directory, ".git/index")), head = git(["rev-parse", "HEAD"]);
      const patch = { kind: "patch", summary: "Generated actual packaged candidate.", edits: [{ path: "candidate.txt", baseDigest: (await import("node:crypto")).createHash("sha256").update(original).digest("hex"), text: proposed }] };
      const path = join(temporary, "generated-packaged-patch.json"); await writeFile(path, JSON.stringify(patch));
      const cli = join(root, "bin", "moguri.mjs"), env = { ...process.env, MOGURI_STATE_DIR: join(temporary, "state") };
      const preview = JSON.parse(execFileSync(node, [cli, "candidate", "preview", path, "--session", source.id, "--workspace", stage.id], { env, encoding: "utf8" })).preview;
      const staged = JSON.parse(execFileSync(node, [cli, "candidate", "stage", path, "--session", source.id, "--workspace", stage.id, "--digest", preview.digest, "--confirm-write"], { env, encoding: "utf8" }));
      assert.equal(staged.candidate.status, "staged"); assert.equal(await readFile(join(directory, "candidate.txt"), "utf8"), original);
      const review = (await client.candidates.applyPreview(staged.candidate.id, source.id)).preview, commandId = randomUUID();
      const command = { type: "candidate.apply", candidateId: staged.candidate.id, sessionId: source.id, expectedRevision: staged.candidate.revision, expectedDigest: review.digest, confirm: true };
      await client.command(command, commandId); assert.equal((await client.candidates.wait(staged.candidate.id)).candidate.status, "applied");
      assert.deepEqual(await readFile(join(directory, ".git/index")), index); assert.equal(git(["rev-parse", "HEAD"]), head);
      assert.equal(JSON.parse((await client.artifacts.export(staged.candidate.id)).export.text).schemaVersion, Array.isArray(client.getState().snapshot.candidateOwners) ? 10 : 2);
      client.disconnect(); await replaceService(true); client = await new MoguriSdk(connection).ready();
      const raw = new DatabaseSync(join(temporary, "state", "state.sqlite"));
      try { raw.exec("PRAGMA busy_timeout=5000"); raw.prepare("DELETE FROM receipts WHERE profile_id=? AND id=?").run("default", commandId); } finally { raw.close(); }
      await writeFile(join(directory, "candidate.txt"), "Generated later actual-packaged user edit.\n");
      assert.equal((await client.command(command, commandId)).id, staged.candidate.id);
      assert.equal(await readFile(join(directory, "candidate.txt"), "utf8"), "Generated later actual-packaged user edit.\n");
      assert.equal(modelFixture.requests.length, beforeCalls);
      console.log("Actual bundled Node/service/SDK and CLI candidate stage, separate user review/application, raw index/HEAD, ownership-bearing history and lost-receipt restart replay qualification passed without a model.");
    } finally { client.disconnect(); }
  }
  if (PROTOCOL_VERSION >= 31) {
    const { MoguriSdk } = await import(pathToFileURL(join(root, "dist", "sdk", "index.mjs")).href);
    let client = await new MoguriSdk(connection).ready();
    const originalReply = modelOptions.replyText;
    try {
      const proof = await qualifyCandidateGeneration({ sdk: client, node, cli: join(root, "bin", "moguri.mjs"), directory: join(temporary, "generated-packaged-generation"),
        stateDir: join(temporary, "state"), modelId: modelFixture.modelId, setReply: (value) => { modelOptions.replyText = value ?? originalReply; }, requests: modelFixture.requests });
      client.disconnect(); await replaceService(true); client = await new MoguriSdk(connection).ready(); await proof.verifyRecovery(client);
      console.log("Actual bundled Node/service/SDK/CLI generation, one owned metered model draft, immutable provenance and ownership-bearing export, separate reviewed stage/apply and missing-receipt restart replay passed without personal inference.");
    } finally { client.disconnect(); modelOptions.replyText = originalReply; }
  }
  if (PROTOCOL_VERSION >= 32) {
    const state = join(temporary, "generated-bundled-role-state");
    const evidence = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", resolve("tests/fixtures/role-sequence-export.ts"), state, String(PROTOCOL_VERSION)], { encoding: "utf8" }));
    const program = `
      import assert from "node:assert/strict";
      import {execFile} from "node:child_process";
      import {promisify} from "node:util";
      import {createRuntime,connectMoguri} from ${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href)};
      const evidence=${JSON.stringify(evidence)},provider={state:{status:"disconnected",models:[],login:null,diagnostic:null},onChange:()=>{},
        refresh:async()=>{},cancel:async()=>{},logout:async()=>{},login:()=>{throw Error("No personal authorization in role inspection.");},prepare:async()=>{throw Error("No model calls in retained role inspection.");}};
      const options={stateDir:evidence.stateDir,retentionKey:Buffer.alloc(32,0x67),provider,platform:{sandbox:{setup:{automatic:false,fetch:async()=>Response.json([])}}}};
      let runtime=await createRuntime(options),sdk=await connectMoguri({stateDir:options.stateDir,autoStart:false});
      try{
        console.log("GENERATED_PACKAGED_ROLE_RUNTIME_READY");
        const value=await sdk.roleSequences.read(evidence.sequenceId,1);
        assert.equal(value.sequence.status,"completed");assert.equal(value.sequence.inputDigest,evidence.inputDigest);assert.ok(value.step.result.includes(evidence.rawMarker));
        assert.equal(sdk.getState().snapshot.projects.length,0);assert.equal(sdk.getState().snapshot.sessions.some(session=>session.id===evidence.originSessionId),false);
        const cli=${JSON.stringify(join(root, "bin", "moguri.mjs"))};
        const called=JSON.parse((await promisify(execFile)(process.execPath,[cli,"roles",evidence.sequenceId,"1"],{env:{...process.env,MOGURI_STATE_DIR:options.stateDir}})).stdout);
        console.log("GENERATED_PACKAGED_ROLE_CLI_READY");
        assert.ok(called.step.result.includes(evidence.rawMarker));assert.equal(JSON.parse((await sdk.artifacts.export(evidence.sequenceId)).export.text).schemaVersion,4);
        sdk.disconnect();await runtime.close();runtime=await createRuntime(options);sdk=await connectMoguri({stateDir:options.stateDir,autoStart:false});
        console.log("GENERATED_PACKAGED_ROLE_REOPEN_READY");
        assert.equal((await sdk.roleSequences.read(evidence.sequenceId,1)).sequence.status,"completed");
        const artifact=(await sdk.artifacts.read(evidence.sequenceId)).artifact;await sdk.artifacts.delete(evidence.sequenceId,artifact.revision,true);
        await assert.rejects(()=>sdk.roleSequences.read(evidence.sequenceId),{code:"role_sequence_missing"});
        assert.throws(()=>runtime.controller.platform.roles.original(evidence.commandId,evidence.commandDigest),{code:"role_sequence_deleted"});
        assert.equal((await sdk.budgets.calls()).calls.length,2);
      }finally{sdk.disconnect();await runtime.close();}
    `;
    const started = performance.now();
    await promisify(execFile)(node, ["--input-type=module", "--eval", program], { timeout: 15_000 });
    console.log(JSON.stringify({ primitive: "Actual bundled retained-role inspection with two independently verified distribution starts", ms: performance.now() - started, timeoutMs: 15_000 }));
    console.log("Actual bundled Node/runtime/SDK/CLI role inspection preserves source-independent raw data, version-4 export, reopen and minimal deletion intent without model preparation or replay.");
  }
  if (PROTOCOL_VERSION >= 33) {
    const fixture = await (async () => {
      if (PROTOCOL_VERSION >= 35) {
        const { roleContractFixture } = await tsImport("../tests/fixtures/role-contract-api.ts", import.meta.url);
        const value = await roleContractFixture();
        try {
          const created = await value.run(), sequence = await value.settled(created.id);
          assert.equal(sequence.status, "completed"); assert.equal(sequence.inputVersion, 2);
          return { ...value, sequence };
        } catch (error) { await value.close(); throw error; }
      }
      const { roleProposalFixture } = await tsImport("../tests/fixtures/role-proposal-api.ts", import.meta.url);
      return roleProposalFixture();
    })();
    try {
      const proposal = await fixture.sdk.candidates.roleProposal(fixture.sequence.id);
      const evidence = { stateDir: join(fixture.directory, "state"), sequenceId: fixture.sequence.id, sessionId: fixture.sessionId,
        projectId: fixture.sequence.projectId, workspaceId: fixture.workspace.id, sourceRoot: fixture.project, patch: fixture.patch,
        origin: proposal.document.roleOrigin, commandId: fixture.sequence.commandId, commandDigest: fixture.sequence.commandDigest,
        inputVersion: fixture.sequence.inputVersion ?? 1, expectedCalls: PROTOCOL_VERSION >= 35 ? 4 : 3 };
      fixture.sdk.disconnect();
      if (PROTOCOL_VERSION === 33 || PROTOCOL_VERSION === 34) {
        const { writeLegacyState } = await tsImport("../tests/fixtures/legacy-state.ts", import.meta.url);
        await writeLegacyState(fixture.service, PROTOCOL_VERSION);
      } else await fixture.service.close();
      const program = `
        import assert from "node:assert/strict";
        import {execFile,execFileSync} from "node:child_process";
        import {readFile} from "node:fs/promises";
        import {join} from "node:path";
        import {promisify} from "node:util";
        import {createRuntime,connectMoguri} from ${JSON.stringify(pathToFileURL(join(root, "dist", "sdk", "node.mjs")).href)};
        const evidence=${JSON.stringify(evidence)},provider={state:{status:"disconnected",models:[],login:null,diagnostic:null},onChange:()=>{},
          refresh:async()=>{},cancel:async()=>{},logout:async()=>{},login:()=>{throw Error("No personal authorization in native role proposals.");},
          prepare:async()=>{throw Error("No model preparation in native role proposals.");}};
        const options={stateDir:evidence.stateDir,retentionKey:Buffer.alloc(32,0x67),provider,platform:{sandbox:{setup:{automatic:false,fetch:async()=>Response.json([])}}}},cli=${JSON.stringify(join(root, "bin", "moguri.mjs"))};
        const invoke=async args=>JSON.parse((await promisify(execFile)(process.execPath,[cli,"candidate",...args],{env:{...process.env,MOGURI_STATE_DIR:options.stateDir}})).stdout);
        const git=args=>execFileSync("git",["--no-pager","-c","core.hooksPath=/dev/null","-c","core.fsmonitor=false",...args],{cwd:evidence.sourceRoot,encoding:"utf8"});
        const index=await readFile(join(evidence.sourceRoot,".git/index")),head=git(["rev-parse","HEAD"]);
        let runtime=await createRuntime(options),sdk=await connectMoguri({stateDir:options.stateDir,autoStart:false});
        try{
          if(evidence.inputVersion===2){
            const gate=await sdk.roleSequences.contract(evidence.sequenceId,2);
            assert.equal(gate.inputVersion,2);assert.equal(gate.result.status,"valid");assert.equal(gate.result.value.verdict,"revise");
            assert.deepEqual(gate.contextRoleIndices,[1]);assert.match(gate.warning,/not.*quality/);
            const cliGate=JSON.parse((await promisify(execFile)(process.execPath,[cli,"roles","contract",evidence.sequenceId,"2"],{env:{...process.env,MOGURI_STATE_DIR:options.stateDir}})).stdout);
            assert.deepEqual(cliGate,gate);
            assert.equal(JSON.parse((await sdk.slash(evidence.sessionId,"/roles contract "+evidence.sequenceId+" 2","tui")).text).result.status,"valid");
          }
          assert.deepEqual((await sdk.candidates.roleProposal(evidence.sequenceId)).document.roleOrigin,evidence.origin);
          assert.deepEqual((await invoke(["role-proposal",evidence.sequenceId])).document.patch,evidence.patch);
          const reference={roleSequenceId:evidence.sequenceId},review=(await sdk.candidates.preview(evidence.sessionId,evidence.workspaceId,evidence.patch,reference)).preview;
          assert.ok(review.warning);assert.notEqual(review.digest,(await sdk.candidates.preview(evidence.sessionId,evidence.workspaceId,evidence.patch)).preview.digest);
          const staged=await sdk.candidates.wait((await sdk.candidates.stage(evidence.sessionId,evidence.workspaceId,evidence.patch,review.digest,reference)).id);
          assert.equal(staged.candidate.status,"staged");assert.equal(staged.candidate.acceptance,null);assert.deepEqual(staged.candidate.roleOrigin,evidence.origin);
          assert.equal(await readFile(join(evidence.sourceRoot,"fixture.txt"),"utf8"),"generated original\\n");
          const report=(await sdk.artifacts.read(evidence.sequenceId)).artifact;await sdk.artifacts.delete(report.id,report.revision,true);
          await sdk.refresh();const sessionOwned=Array.isArray(sdk.getState().snapshot.candidateOwners);
          if(sessionOwned)await sdk.command({type:"session.archive",sessionId:evidence.sessionId});
          else await sdk.sessions.delete(evidence.sessionId,true,sdk.getState().snapshot.sessions.find(session=>session.id===evidence.sessionId).revision);
          sdk.disconnect();await runtime.close();runtime=await createRuntime(options);sdk=await connectMoguri({stateDir:options.stateDir,autoStart:false});
          assert.deepEqual((await sdk.candidates.read(staged.candidate.id)).candidate.roleOrigin,evidence.origin);
          const copy=JSON.parse((await sdk.artifacts.export(staged.candidate.id)).export.text);assert.equal(copy.schemaVersion,sessionOwned?10:5);
          for(const digest of [evidence.origin.sequenceInputDigest,evidence.origin.roleInputDigest,evidence.origin.resultDigest])
            assert.ok(copy.documents[0].candidate.results.some(result=>result.digest===digest&&result.text.length));
          const user=await sdk.sessions.create(evidence.projectId,"Generated native role-copy reviewer",{env:"Local"});
          const apply=(await sdk.candidates.applyPreview(staged.candidate.id,user.id)).preview;
          const applied=await invoke(["apply",staged.candidate.id,"--session",user.id,"--revision",String(staged.candidate.revision),"--digest",apply.digest,"--confirm-write"]);
          assert.equal(applied.candidate.status,"applied");assert.equal(applied.candidate.acceptance.actor,"user");assert.deepEqual(applied.candidate.roleOrigin,evidence.origin);
          assert.equal(await readFile(join(evidence.sourceRoot,"fixture.txt"),"utf8"),evidence.patch.edits[0].text);
          assert.deepEqual(await readFile(join(evidence.sourceRoot,".git/index")),index);assert.equal(git(["rev-parse","HEAD"]),head);
          if(sessionOwned){
            await sdk.sessions.delete(evidence.sessionId,true);
            await assert.rejects(()=>sdk.candidates.read(staged.candidate.id),{code:"candidate_missing"});
            for(const digest of [evidence.origin.sequenceInputDigest,evidence.origin.roleInputDigest,evidence.origin.resultDigest])
              assert.throws(()=>runtime.controller.store.blob(digest),/Missing or deleted/);
          }
          assert.equal((await sdk.budgets.calls()).calls.length,evidence.expectedCalls);assert.equal((await sdk.budgets.dashboard()).totals.knownReportedTokens,evidence.expectedCalls*42);
          assert.throws(()=>runtime.controller.platform.roles.original(evidence.commandId,evidence.commandDigest),{code:"role_sequence_deleted"});
        }finally{sdk.disconnect();await runtime.close();}
      `;
      await promisify(execFile)(node, ["--input-type=module", "--eval", program], { timeout: 30_000 });
      assert.equal(fixture.requests.length, evidence.expectedCalls);
      console.log("Actual bundled Node/runtime/SDK/CLI final-role proposal resolution, exact origin-bound review, separate stage/application, source-role deletion, ownership-bearing raw-copy exports/reopen, real-user acceptance and exact retention boundaries passed with model preparation forbidden.");
      if (PROTOCOL_VERSION >= 35) console.log("Actual bundled Node/runtime/SDK/CLI derives original version-2 role contracts and exact selected-context advice from retained actual role inputs/results, without model preparation or code-quality/approval claims.");
    } finally { await fixture.close(); }
  }
  child.send("close");
  assert.equal(await exit, 0);
  console.log("Verified ad-hoc signature, mascot icon, bundled Node, CLI/TUI, actual packaged service/worker compaction, repository-attributed model call and provider-free pinned SSH plan/MCP, private Remote gh account/provenance/restart/CLI, session-bound Remote memory/index/CLI/restart/original intent and approved owned MCP retrieval without Local cache reuse, user-console restart/input/original PID/ordinary-stop semantics, independent artifacts, project-free metachat/config SDK, real packaged OAuth and approved HTTP tool call, sanitized MCP outcomes and key-backed storage, PTY transport, exact four-Local-console owner reattachment and measured native/bundled terminal overhead without reading Remote PIDs as Local, Ghostty assets and native speech runtime without weights, microphone or a personal account.");
} finally {
  let confirmed = false;
  try {
    clearTimeout(timer);
    if (child && child.exitCode === null) {
      if (child.connected) child.send("close"); else child.kill("SIGTERM");
      try {
        await Promise.race([exit, new Promise((_, reject) => { timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Packaged cleanup was not acknowledged; generated diagnostics retained at ${temporary}.`)); }, 6500); })]);
      } finally { clearTimeout(timer); }
    }
    confirmed = true;
  } finally {
    try { await oauth.close(); } finally {
      try { await modelFixture?.close(); } finally { await ssh?.close(); if (confirmed) await rm(temporary, { recursive: true, force: true }); }
    }
  }
}
