import initialize, { WasmCore, WasmValidator, WasmDraft, spliceUtf16 } from "./pkg-web/sdk_study_wasm.js";
import { JsCore } from "./js-core.mjs";
import { Check } from "./query-aot.mjs";

globalThis.runGeneratedStudy = async () => {
  const data = await (await fetch("./dataset.json")).json();
  const aotMatches = data.queries.every((query, index) => Check(query) === data.expectedQueries[index]);
  let instance;
  try { instance = await initialize(); } catch (error) {
    return { aotMatches, wasmInitialized: false, wasmError: String(error), nodeRequire: typeof require };
  }
  const core = new WasmCore("default", 43), js = new JsCore("default", 43);
  let framesMatch = true, freed = false;
  try {
    for (const frame of data.frames) {
      const text = JSON.stringify(frame);
      core.applyJson(text, 1); js.applyJson(text, 1);
      const state = core.stateValue(), expected = js.stateValue();
      framesMatch &&= state.events.length === expected.events.length && state.snapshot.profileId === expected.snapshot.profileId &&
        state.status === expected.status && state.events.at(-1)?.seq === expected.events.at(-1)?.seq;
    }
    const validator = new WasmValidator(JSON.stringify(data.querySchema));
    let validatorMatches;
    try { validatorMatches = data.queries.every((query, index) => validator.checkJson(JSON.stringify(query)) === data.expectedQueries[index]); }
    finally { validator.free(); }
    const draft = new WasmDraft('{"revision":0,"text":"","attachments":[]}');
    let conflictPreserved;
    try {
      draft.actionJson('{"action":"edit","text":"Generated browser-local"}');
      draft.actionJson('{"action":"receive","draft":{"revision":1,"text":"Generated other client","attachments":[]}}');
      const state = JSON.parse(draft.stateJson()); conflictPreserved = state.conflict && state.text === "Generated browser-local";
    } finally { draft.free(); }
    const before = instance.memory.buffer.byteLength;
    core.applyJson(JSON.stringify(data.readyHuge), 1);
    const afterLarge = instance.memory.buffer.byteLength;
    core.free(); freed = true;
    return { aotMatches, wasmInitialized: true, framesMatch, validatorMatches, conflictPreserved,
      unicodeOffset: spliceUtf16("A\u{1f34a}B", "X", 3, 3), nodeRequire: typeof require,
      memory: { before, afterLarge, afterFree: instance.memory.buffer.byteLength }, userAgent: navigator.userAgent };
  } catch (error) { if (!freed) core.free(); throw error; }
};
