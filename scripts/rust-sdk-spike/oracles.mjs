import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { artifacts, directory, sdkUrl, nativePath, require, wasmModule } from "./paths.mjs";
import { delay } from "./process.mjs";
const { DraftEditor, ClientError, MoguriSdk } = await import(sdkUrl);
const native = require(nativePath), { mod: wasm } = await wasmModule();
const results = { draftScenarios: [], wireEdges: [] };
const normalize = (state) => ({ ...state, error: state.error === null ? null : state.conflict ? "revision_conflict" : "save_failed" });

function context() {
  let saved = { revision: 0, text: "", attachments: [] };
  const requests = [], pending = [];
  const transport = {
    getState: () => ({ snapshot: { sessions: [{ id: "s", draft: saved }] } }),
    command: (command) => {
      requests.push(command);
      return new Promise((resolve, reject) => pending.push({ command, resolve, reject }));
    },
  };
  const editor = new DraftEditor(transport, "s", saved);
  const cores = [new native.NativeDraft(JSON.stringify(saved)), new wasm.WasmDraft(JSON.stringify(saved))];
  const action = (value) => cores.map((core) => JSON.parse(core.actionJson(JSON.stringify(value))));
  const compare = () => { for (const core of cores) assert.deepEqual(JSON.parse(core.stateJson()), normalize(editor.getState())); };
  const edit = (text) => { editor.edit(text); action({ action: "edit", text }); compare(); };
  const receive = (draft) => { saved = draft; editor.receive(draft); action({ action: "receive", draft }); compare(); };
  const finish = () => { editor.dispose(); for (const core of cores) core.free?.(); };
  return { editor, requests, pending, cores, action, compare, edit, receive, finish };
}

{
  const f = context();
  try {
    f.edit("Generated local \u754c \u{1f34a}");
    f.receive({ revision: 1, text: "Generated other-client draft", attachments: [] });
    await assert.rejects(f.editor.flush(), /Another client/);
    for (const core of f.cores) assert.throws(() => core.actionJson('{"action":"begin"}'));
    const completion = f.editor.keepMine();
    f.action({ action: "keep" }); const proposed = f.action({ action: "begin" });
    assert.equal(proposed[0].effect.expectedRevision, 1); assert.equal(f.pending[0].command.expectedRevision, 1); f.compare();
    f.receive({ revision: 2, text: "Generated local \u754c \u{1f34a}", attachments: [] });
    f.pending.shift().resolve({ revision: 2 }); await completion;
    f.action({ action: "acknowledge", revision: 2 }); f.compare();
    results.draftScenarios.push({ name: "actual-draft-conflict-explicit-keep-same-effects", requests: f.requests.length, passed: true });
  } finally { f.finish(); }
}
{
  const f = context();
  try {
    f.edit("Generated A");
    const completion = f.editor.flush();
    f.action({ action: "begin" }); f.compare();
    f.edit("Generated B during save");
    f.receive({ revision: 1, text: "Generated A", attachments: [] });
    f.pending.shift().resolve({ revision: 1 }); await delay(0);
    f.action({ action: "acknowledge", revision: 1 }); const proposed = f.action({ action: "begin" }); f.compare();
    assert.equal(f.pending[0].command.text, proposed[0].effect.text);
    assert.equal(f.pending[0].command.expectedRevision, 1);
    f.receive({ revision: 2, text: "Generated B during save", attachments: [] });
    f.pending.shift().resolve({ revision: 2 }); await completion;
    f.action({ action: "acknowledge", revision: 2 }); f.compare();
    results.draftScenarios.push({ name: "actual-draft-edit-during-flight-next-revision", requests: f.requests.length, passed: true });
  } finally { f.finish(); }
}
{
  const f = context();
  try {
    f.edit("Generated initial local");
    const completion = f.editor.flush().then(() => assert.fail("Expected stale-write rejection"), () => {});
    f.action({ action: "begin" });
    f.receive({ revision: 2, text: "Generated winning remote", attachments: [] });
    f.edit("Generated later unsent");
    f.pending.shift().reject(new ClientError("revision_conflict", "Generated stale write"));
    await completion; f.action({ action: "fail", code: "revision_conflict" }); f.compare();
    assert.equal(f.editor.getState().text, "Generated later unsent");
    f.editor.reload(); f.action({ action: "reload" }); f.compare();
    results.draftScenarios.push({ name: "actual-draft-racing-remote-error-preserves-unsent", requests: f.requests.length, passed: true });
  } finally { f.finish(); }
}
{
  const f = context();
  try {
    f.edit("Generated network-failed save");
    const completion = f.editor.flush().then(() => assert.fail("Expected failure"), () => {});
    f.action({ action: "begin" });
    f.pending.shift().reject(new ClientError("request_failed", "Generated unavailable transport"));
    await completion; f.action({ action: "fail", code: "request_failed" }); f.compare();
    await delay(250); assert.equal(f.requests.length, 1);
    assert.ok(f.requests.every((request) => request.type === "draft.save"));
    results.draftScenarios.push({ name: "actual-draft-failure-no-automatic-retry-or-message-send", requests: f.requests.length, passed: true });
  } finally { f.finish(); }
}

const data = JSON.parse(await readFile(join(directory, "dataset.json"), "utf8"));
const oldFetch = globalThis.fetch;
try {
  for (const [name, seq] of [["safe-integer", 1], ["unsafe-integer", 9007199254740992], ["fractional-sequence", 1.5]]) {
    const snapshot = structuredClone(data.readySmall.snapshot); snapshot.seq = seq;
    globalThis.fetch = async () => Response.json(snapshot);
    const sdk = new MoguriSdk({ baseUrl: "http://127.0.0.1:1", wsUrl: "ws://127.0.0.1:1/v1/events",
      token: "generated-unused", pid: 999, protocolVersion: 43 });
    const cores = [new native.NativeCore("default", 43), new wasm.WasmCore("default", 43)];
    try {
      await sdk.refresh();
      const accepted = cores.map((core) => {
        try { core.applyJson(JSON.stringify({ type: "ready", snapshot }), 1); return true; } catch { return false; }
      });
      results.wireEdges.push({ name, actualTsSnapshotAccepted: Boolean(sdk.getState().snapshot),
        nativeAccepted: accepted[0], wasmAccepted: accepted[1] });
    } finally { sdk.disconnect(); for (const core of cores) core.free?.(); }
  }
} finally { globalThis.fetch = oldFetch; }
await writeFile(join(artifacts, "issue-22-sdk-oracles.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
