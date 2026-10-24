import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { directory, artifacts, repo, node, nativePath, cli, require, wasmModule, sdkUrl, packageImport } from "./paths.mjs";
import { JsCore } from "./js-core.mjs";
import { JsonProcess, summary, delay } from "./process.mjs";

const data = JSON.parse(await readFile(join(directory, "dataset.json"), "utf8"));
const actual = await import(sdkUrl);
assert.equal(actual.PROTOCOL_VERSION, 43, "This retained experiment requires protocol 43.");
const { Value } = await packageImport("typebox/value");
const { Compile } = await packageImport("typebox/compile");
const aot = await import(pathToFileURL(join(directory, "query-aot.mjs")).href);
const native = require(nativePath), { mod: wasm, instance } = await wasmModule();
const schema = JSON.stringify(data.querySchema);
const compileStarted = performance.now(), compiled = Compile(actual.QuerySchema);
const compileMs = performance.now() - compileStarted;
const nativeStarted = performance.now(), nv = new native.NativeValidator(schema), nativeCompileMs = performance.now() - nativeStarted;
const wasmStarted = performance.now(), wv = new wasm.WasmValidator(schema), wasmCompileMs = performance.now() - wasmStarted;
let wasmValidatorReleased = false;
const results = { source: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  protocol: actual.PROTOCOL_VERSION, node: process.version,
  conformance: {}, semanticEdges: [], startup: {}, startupSamples: {}, throughput: {}, realSdk: {},
  compilation: { typeboxMs: compileMs, typeboxAccelerated: compiled.IsAccelerated(), nativeMs: nativeCompileMs, wasmMs: wasmCompileMs } };
const reportPath = join(artifacts, "issue-22-sdk-results.json");

function failure(action) {
  try { return { ok: true, value: action() }; } catch (error) { return { ok: false, error: String(error.message ?? error) }; }
}
function independentState(core) {
  return typeof core.stateValue === "function" ? core.stateValue() : JSON.parse(core.stateJson());
}
function compareState(cores) {
  const expected = independentState(cores[0]);
  for (const core of cores.slice(1)) assert.deepEqual(independentState(core), expected);
  const summaryExpected = JSON.parse(cores[0].summaryJson());
  for (const core of cores.slice(1)) assert.deepEqual(JSON.parse(core.summaryJson()), summaryExpected);
}

try {
  const mismatches = [];
  for (let index = 0; index < data.queries.length; index++) {
    const query = data.queries[index], json = JSON.stringify(query), expected = data.expectedQueries[index];
    const values = { compiled: compiled.Check(query), aot: aot.Check(query),
      nativeJson: nv.checkJson(json), nativeValue: nv.checkValue(query),
      wasmJson: wv.checkJson(json), wasmValue: wv.checkValue(query) };
    for (const [implementation, value] of Object.entries(values)) if (value !== expected) mismatches.push({ index, query, implementation, value, expected });
  }
  results.conformance.queryCases = data.queries.length;
  results.conformance.queryWireMismatches = mismatches;
  assert.equal(mismatches.length, 0, JSON.stringify(mismatches.slice(0, 3)));

  let seed = 0x4d4f4755, operations = 0;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trace = 0; trace < 100; trace++) {
    const cores = [new JsCore("default", 43), new native.NativeCore("default", 43), new wasm.WasmCore("default", 43)];
    try {
      for (let index = 0; index < 100; index++) {
        let frame;
        if (!index || random() % 13 === 0) {
          frame = structuredClone(data.readySmall); frame.type = index ? "snapshot" : "ready";
          frame.snapshot.seq = index;
          if (random() % 3 === 0) frame.snapshot.sessions = [];
        } else {
          frame = { type: "event", event: { seq: index, schema_version: 1, profile_id: "default",
            project_id: "p", session_id: random() % 5 ? "s" : "other",
            event_type: random() % 11 ? "assistant.delta" : "session.deleted",
            payload: { text: `Generated ${trace}/${index} \u754c \u{1f34a}`, deletedSessionId: "other" } } };
        }
        const json = JSON.stringify(frame);
        for (const core of cores) core.applyJson(json, 1);
        compareState(cores); operations++;
      }
    } finally { for (const core of cores) core.free?.(); }
  }
  results.conformance.frameTraces = 100; results.conformance.frameOperations = operations;

  const invalidFrames = [
    { type: "ready", snapshot: { ...data.readySmall.snapshot, profileId: "foreign" } },
    { type: "ready", snapshot: { ...data.readySmall.snapshot, protocolVersion: 42 } },
    { type: "event", event: { seq: 3, schema_version: 1, profile_id: "foreign", event_type: "assistant.delta", payload: {} } },
    { type: "event", event: { seq: 3, schema_version: 2, profile_id: "default", event_type: "assistant.delta", payload: {} } },
    { type: "event", event: { seq: 3.5, schema_version: 1, profile_id: "default", event_type: "assistant.delta", payload: {} } },
    { type: "event", event: { seq: 3, schema_version: 1, profile_id: "default", event_type: "assistant.delta", payload: [] } },
  ];
  for (const Constructor of [JsCore, native.NativeCore, wasm.WasmCore]) {
    for (const profile of ["_global", "bad scope", ""]) assert.throws(() => new Constructor(profile, 43));
    const core = new Constructor("default", 43);
    try {
      core.applyJson(JSON.stringify(data.readySmall), 1);
      const before = JSON.parse(core.summaryJson());
      for (const frame of invalidFrames) {
        assert.equal(failure(() => core.applyJson(JSON.stringify(frame), 1)).ok, false);
        assert.deepEqual(JSON.parse(core.summaryJson()), before);
      }
      assert.equal(failure(() => core.applyJson("{", 1)).ok, false);
      for (const frame of data.frames) core.applyJson(JSON.stringify(frame), 1);
      const state = independentState(core);
      assert.equal(state.events.length, 200); assert.equal(state.events[0].seq, 201); assert.equal(state.events.at(-1).seq, 400);
    } finally { core.free?.(); }
  }
  results.conformance.invalidFrameCasesPerBinding = invalidFrames.length + 1;
  results.conformance.invalidProfileCasesPerBinding = 3;
  results.conformance.boundedHistory = { capacity: 200, firstSeq: 201, lastSeq: 400 };

  const cores = [new JsCore("default", 43), new native.NativeCore("default", 43), new wasm.WasmCore("default", 43)];
  for (const core of cores) {
    core.applyJson(JSON.stringify(data.readySmall), 1);
    core.controlJson(JSON.stringify({ action: "dispatch", commandId: "generated-owned" }));
    core.controlJson(JSON.stringify({ action: "unknown", commandId: "generated-owned" }));
    const reconnect = JSON.parse(core.controlJson('{"action":"reconnect"}'));
    assert.deepEqual(reconnect.dispatches, []);
    assert.equal(failure(() => core.applyJson(JSON.stringify(data.readySmall), 1)).ok, false);
    core.applyJson(JSON.stringify(data.readySmall), 2);
    assert.equal(failure(() => core.controlJson('{"action":"dispatch","commandId":"generated-owned"}')).ok, false);
    core.controlJson('{"action":"stop","commandId":"generated-owned"}');
    assert.equal(failure(() => core.controlJson('{"action":"acknowledge","commandId":"generated-owned"}')).ok, false);
    core.controlJson('{"action":"stopped","commandId":"generated-owned"}');
    assert.equal(JSON.parse(core.summaryJson()).calls["generated-owned"], "stopped");
  }
  compareState(cores); for (const core of cores) core.free?.();
  results.conformance.uncertainReplayGenerationCancellation = true;

  const drafts = [new native.NativeDraft('{"revision":0,"text":"","attachments":[]}'), new wasm.WasmDraft('{"revision":0,"text":"","attachments":[]}')];
  const draftActions = [
    { action: "edit", text: "Generated unsent \u754c \u{1f34a}" },
    { action: "receive", draft: { revision: 1, text: "Generated remote", attachments: [] } },
    { action: "keep" }, { action: "begin" },
    { action: "edit", text: "Generated edited during flight" }, { action: "acknowledge", revision: 2 },
    { action: "begin" }, { action: "receive", draft: { revision: 3, text: "Generated conflicting remote", attachments: [] } },
    { action: "fail", code: "revision_conflict" }, { action: "reload" },
  ];
  for (const action of draftActions) {
    const json = JSON.stringify(action), expected = JSON.parse(drafts[0].actionJson(json));
    assert.deepEqual(JSON.parse(drafts[1].actionJson(json)), expected);
  }
  for (const draft of drafts) draft.free?.();
  results.conformance.sharedDraftActions = draftActions.length;

  for (const edge of data.edges) {
    const query = JSON.parse(edge.queryJson);
    results.semanticEdges.push({ name: edge.name, actualTs: Value.Check(actual.QuerySchema, query),
      aot: aot.Check(query),
      nativeJson: failure(() => nv.checkJson(edge.queryJson)), nativeValue: failure(() => nv.checkValue(query)),
      wasmJson: failure(() => wv.checkJson(edge.queryJson)), wasmValue: failure(() => wv.checkValue(query)) });
  }
  const hostEdges = [
    ["unknown-undefined-property", { type: "profile.list", extra: undefined }],
    ["known-optional-undefined", { type: "compaction.preview", sessionId: "s", modelId: undefined }],
    ["date-object-before-serialization", { type: "memory.search", projectId: "p", text: new Date("2024-01-01T00:00:00Z"), limit: 6 }],
  ];
  for (const [name, query] of hostEdges) results.semanticEdges.push({
    name, actualTs: Value.Check(actual.QuerySchema, query), aot: aot.Check(query),
    nativeJson: failure(() => nv.checkJson(JSON.stringify(query))), nativeValue: failure(() => nv.checkValue(query)),
    wasmJson: failure(() => wv.checkJson(JSON.stringify(query))), wasmValue: failure(() => wv.checkValue(query)),
  });
  for (const offset of [3, 2]) {
    const text = "A\u{1f34a}B";
    results.semanticEdges.push({ name: `utf16-offset-${offset}`, actualJs: text.slice(0, offset) + "X" + text.slice(offset),
      native: failure(() => native.spliceUtf16(text, "X", offset, offset)),
      wasm: failure(() => wasm.spliceUtf16(text, "X", offset, offset)) });
  }
  results.semanticEdges.push({ name: "unpaired-surrogate-binding-input", actualJs: "X\ud800",
    native: failure(() => native.spliceUtf16("\ud800", "X", 0, 0)),
    wasm: failure(() => wasm.spliceUtf16("\ud800", "X", 0, 0)) });
  console.log(JSON.stringify({ phase: "conformance", result: results.conformance, semanticEdges: results.semanticEdges }));

  const nativeProcess = new JsonProcess(cli, []);
  try {
    await nativeProcess.ready;
    const response = await nativeProcess.ask({ action: "bench", path: join(directory, "dataset.json"), repetitions: 20, rounds: 9 });
    assert.equal(response.ok, true, response.error);
    results.nativeStandalone = response.result;
    results.nativeStandalone.frameBatchMs = summary(response.result.frameBatchMs);
    results.nativeStandalone.queryBatchMs = summary(response.result.queryBatchMs);
  } finally { await nativeProcess.close(); }

  const frameStrings = data.frames.map(JSON.stringify), queryStrings = data.queries.map(JSON.stringify);
  const methods = [
    ["js-json", () => new JsCore("default", 43), (core, i) => core.applyJson(frameStrings[i], 1)],
    ["native-json", () => new native.NativeCore("default", 43), (core, i) => core.applyJson(frameStrings[i], 1)],
    ["native-value", () => new native.NativeCore("default", 43), (core, i) => core.applyValue(data.frames[i], 1)],
    ["wasm-json", () => new wasm.WasmCore("default", 43), (core, i) => core.applyJson(frameStrings[i], 1)],
    ["wasm-value", () => new wasm.WasmCore("default", 43), (core, i) => core.applyValue(data.frames[i], 1)],
  ];
  const frameTimes = Object.fromEntries(methods.map(([name]) => [name, []]));
  let checksum = 0;
  for (let round = 0; round <= 9; round++) {
    for (let index = 0; index < methods.length; index++) {
      const [name, create, apply] = methods[(index + round) % methods.length], start = performance.now();
      for (let repetition = 0; repetition < 20; repetition++) {
        const core = create();
        try { for (let i = 0; i < data.frames.length; i++) checksum += apply(core, i); } finally { core.free?.(); }
      }
      if (round) frameTimes[name].push(performance.now() - start);
    }
  }
  results.throughput.frames = Object.fromEntries(Object.entries(frameTimes).map(([name, values]) => [name, summary(values)]));
  results.throughput.frameOperationsPerBatch = data.frames.length * 20;

  const queryMethods = [
    ["typebox-current", (i) => Value.Check(actual.QuerySchema, data.queries[i])],
    ["typebox-compiled", (i) => compiled.Check(data.queries[i])],
    ["typebox-aot", (i) => aot.Check(data.queries[i])],
    ["native-json", (i) => nv.checkJson(queryStrings[i])],
    ["native-object-to-json", (i) => nv.checkJson(JSON.stringify(data.queries[i]))],
    ["native-value", (i) => nv.checkValue(data.queries[i])],
    ["wasm-json", (i) => wv.checkJson(queryStrings[i])],
    ["wasm-value", (i) => wv.checkValue(data.queries[i])],
  ];
  const queryTimes = Object.fromEntries(queryMethods.map(([name]) => [name, []]));
  for (let round = 0; round <= 9; round++) {
    for (let index = 0; index < queryMethods.length; index++) {
      const [name, check] = queryMethods[(index + round) % queryMethods.length], start = performance.now();
      for (let repetition = 0; repetition < 20; repetition++) for (let i = 0; i < data.queries.length; i++) checksum += Number(check(i));
      if (round) queryTimes[name].push(performance.now() - start);
    }
  }
  results.throughput.queries = Object.fromEntries(Object.entries(queryTimes).map(([name, values]) => [name, summary(values)]));
  results.throughput.queryOperationsPerBatch = data.queries.length * 20;

  const exportMethods = [
    ["js-object", () => new JsCore("default", 43), (core, text) => { core.applyJson(text, 1); return core.stateValue(); }],
    ["native-json", () => new native.NativeCore("default", 43), (core, text) => { core.applyJson(text, 1); return JSON.parse(core.stateJson()); }],
    ["native-value", () => new native.NativeCore("default", 43), (core, text) => { core.applyJson(text, 1); return core.stateValue(); }],
    ["wasm-json", () => new wasm.WasmCore("default", 43), (core, text) => { core.applyJson(text, 1); return JSON.parse(core.stateJson()); }],
    ["wasm-value", () => new wasm.WasmCore("default", 43), (core, text) => { core.applyJson(text, 1); return core.stateValue(); }],
  ];
  results.throughput.snapshotExport = {};
  for (const [size, frame, repetitions] of [["small", data.readySmall, 100], ["large", data.readyLarge, 10]]) {
    const text = JSON.stringify(frame), times = Object.fromEntries(exportMethods.map(([name]) => [name, []]));
    for (let round = 0; round <= 9; round++) {
      for (let index = 0; index < exportMethods.length; index++) {
        const [name, create, apply] = exportMethods[(index + round) % exportMethods.length], core = create(), start = performance.now();
        try {
          for (let repetition = 0; repetition < repetitions; repetition++) checksum += apply(core, text).snapshot.sessions[0].messages.length;
        } finally { core.free?.(); }
        if (round) times[name].push(performance.now() - start);
      }
    }
    results.throughput.snapshotExport[size] = { bytes: Buffer.byteLength(text), operationsPerBatch: repetitions,
      results: Object.fromEntries(Object.entries(times).map(([name, values]) => [name, summary(values)])) };
  }
  results.throughput.checksum = checksum;
  const wasmCore = new wasm.WasmCore("default", 43);
  results.wasmLinearMemory = { before: instance.memory.buffer.byteLength };
  wasmCore.applyJson(JSON.stringify(data.readyHuge), 1);
  results.wasmLinearMemory.afterLarge = instance.memory.buffer.byteLength;
  wasmCore.free(); wv.free(); wasmValidatorReleased = true;
  results.wasmLinearMemory.afterFree = instance.memory.buffer.byteLength;
  console.log(JSON.stringify({ phase: "throughput", throughput: results.throughput, memory: results.wasmLinearMemory }));

  const fixture = new JsonProcess(node, [join(directory, "sdk-fixture.mjs")]);
  try {
    const info = await fixture.ready;
    const modes = ["empty", "sdk-root", "sdk-node", "sdk-connected", "js-core", "native-core", "native-validated", "wasm-core", "wasm-validated"];
    for (let round = 0; round <= 15; round++) {
      for (let index = 0; index < modes.length; index++) {
        const mode = modes[(index + round) % modes.length];
        const child = new JsonProcess(node, [join(directory, "startup.mjs"), mode, JSON.stringify(info.connection)]);
        try {
          const ready = await child.ready; await delay(100);
          const memory = await child.ask({ action: "memory" });
          if (round) (results.startupSamples[mode] ??= []).push({ wallMs: child.startupMs, initMs: ready.initMs,
            rssMiB: Number(execFileSync("ps", ["-o", "rss=", "-p", String(child.child.pid)], { encoding: "utf8" }).trim()) / 1024,
            heapMiB: memory.memory.heapUsed / 1048576, wasmMiB: (memory.wasmBytes ?? 0) / 1048576 });
        } finally { await child.close(); }
      }
    }
    for (const mode of modes) results.startup[mode] = {
      wallMs: summary(results.startupSamples[mode].map((x) => x.wallMs)),
      initMs: summary(results.startupSamples[mode].map((x) => x.initMs)),
      rssMiB: summary(results.startupSamples[mode].map((x) => x.rssMiB)),
      wasmMiB: summary(results.startupSamples[mode].map((x) => x.wasmMiB)),
    };
    const sdk = await new actual.MoguriSdk(info.connection).ready();
    try {
      const queries = [{ type: "session.progress", sessionId: info.sessionId }, { type: "budget.status", sessionId: info.sessionId }];
      for (const query of queries) {
        const times = [];
        for (let index = 0; index < 120; index++) {
          const start = performance.now(); await sdk.query(query);
          if (index >= 20) times.push(performance.now() - start);
        }
        let accepted = 0; const start = performance.now();
        for (let index = 0; index < 100000; index++) accepted += Number(Value.Check(actual.QuerySchema, query));
        assert.equal(accepted, 100000);
        results.realSdk[query.type] = { roundTripMs: summary(times), currentValidationUs: (performance.now() - start) * 1000 / 100000 };
      }
      class GuardSdk extends actual.MoguriSdk {
        constructor(connection, guard) { super(connection); this.guard = guard; }
        async query(query) {
          if (!this.guard(query)) throw new actual.MoguriError("invalid_request", "The request does not match the protocol schema.");
          const result = await this.request("/v1/query", query);
          if (!actual.isRecord(result) || result.type !== query.type) throw new actual.ClientError("invalid_response", "The service returned an incompatible capability response.");
          return result;
        }
      }
      const retainedWasmValidator = new wasm.WasmValidator(schema);
      const candidates = [
        ["current", sdk],
        ["aot-js", await new GuardSdk(info.connection, (q) => aot.Check(q)).ready()],
        ["native-value", await new GuardSdk(info.connection, (q) => nv.checkValue(q)).ready()],
        ["wasm-json", await new GuardSdk(info.connection, (q) => retainedWasmValidator.checkJson(JSON.stringify(q))).ready()],
      ];
      results.realSdk.alternatingGuardRoundTrips = {};
      try {
        for (const query of queries) {
          const times = Object.fromEntries(candidates.map(([name]) => [name, []]));
          for (let round = 0; round < 120; round++) {
            for (let index = 0; index < candidates.length; index++) {
              const [name, candidate] = candidates[(round + index) % candidates.length], start = performance.now();
              const response = await candidate.query(query);
              assert.equal(response.type, query.type);
              if (round >= 20) times[name].push(performance.now() - start);
            }
          }
          results.realSdk.alternatingGuardRoundTrips[query.type] = Object.fromEntries(Object.entries(times).map(([name, values]) => [name, summary(values)]));
        }
      } finally { for (const [, candidate] of candidates.slice(1)) candidate.disconnect(); retainedWasmValidator.free(); }
      const times = [];
      for (let index = 0; index < 50; index++) {
        const session = sdk.getState().snapshot.sessions.find((s) => s.id === info.sessionId);
        const start = performance.now();
        await sdk.command({ type: "draft.save", sessionId: info.sessionId, expectedRevision: session.draft.revision,
          text: `Generated SDK-only draft ${index}`, attachments: [] });
        times.push(performance.now() - start);
      }
      results.realSdk.draftSaveWithRefreshMs = summary(times);
      const observed = await fixture.ask({ action: "observe" });
      assert.equal(observed.requests, 0); results.realSdk.providerCalls = observed.requests;
    } finally { sdk.disconnect(); }
  } finally { await fixture.close(); }
  results.artifacts = {};
  for (const [name, path] of [
    ["nativeAddon", nativePath], ["nativeExecutable", cli], ["wasm", join(directory, "pkg-web/sdk_study_wasm_bg.wasm")],
    ["aotValidator", join(directory, "query-aot.mjs")], ["cargoLock", join(directory, "Cargo.lock")],
  ]) {
    const bytes = await readFile(path);
    results.artifacts[name] = { bytes: (await stat(path)).size, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ phase: "complete", startup: results.startup, realSdk: results.realSdk, artifacts: results.artifacts }));
} catch (error) {
  results.failure = { message: String(error.message ?? error), stack: error.stack };
  await writeFile(join(artifacts, "issue-22-sdk-partial.json"), JSON.stringify(results, null, 2));
  throw error;
} finally { if (!wasmValidatorReleased) wv.free(); }
