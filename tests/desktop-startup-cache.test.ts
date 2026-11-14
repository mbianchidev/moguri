import assert from "node:assert/strict";
import test from "node:test";
import {
  createStartupView, readStartupProfile, readStartupView, saveStartupView,
  STARTUP_CACHE_MAX_BYTES, type StartupContext,
} from "../apps/desktop/src/startup-cache.ts";
import { setupFixture } from "./fixture.ts";

const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
const scopeKey = "a".repeat(64), otherScope = "c".repeat(64);
const context: StartupContext = { scopeKey, profileId: "default", profileExplicit: false };

test("startup presentation persists only scoped model labels, effort names and a last-session hint", async () => {
  const f = await setupFixture();
  try {
    await f.configure();
    const snapshot = structuredClone(f.service.controller.snapshot()), storeId = f.service.connection.storeId!;
    const session = snapshot.sessions.find((session) => session.id === f.sessionId)!;
    session.draft.text = "Generated private unsent content excluded from presentation storage.";
    session.controls.modelOptions = { thinkingEffort: "high" };
    const model = snapshot.provider.models.find((model) => model.id === f.modelId)!;
    model.thinkingLevels = ["low", "high"];
    Reflect.set(model, "generatedCredential", "GENERATED_SECRET_NOT_CACHED");
    const view = createStartupView(scopeKey, storeId, snapshot, f.sessionId), cache = storage();
    saveStartupView(cache, view);
    assert.deepEqual(readStartupView(cache, scopeKey, "default"), view);
    assert.equal(readStartupProfile(cache, context), "default");
    assert.equal(view.session?.id, f.sessionId);
    assert.equal(view.session?.draftEmpty, undefined);
    assert.equal(view.session?.draftRevision, undefined);
    assert.equal(view.session?.modelId, f.modelId);
    assert.equal(view.session?.thinkingEffort, "high");
    assert.deepEqual(view.models.find((entry) => entry.id === f.modelId)?.thinkingLevels, ["low", "high"]);
    for (const text of cache.values.values()) for (const excluded of [
      session.draft.text, f.project, "GENERATED_SECRET_NOT_CACHED", f.service.connection.token,
      '"policy"', '"controls"', '"attachments"', '"messages"', '"provider"',
    ]) assert.equal(text.includes(excluded), false, excluded);
    assert.equal(readStartupView(cache, otherScope, "default"), null);
    assert.equal(readStartupView(cache, scopeKey, "generated-other-profile"), null);
    session.draft.revision++; session.draft.text = "Generated changed saved draft does not rewrite presentation metadata.";
    assert.deepEqual(createStartupView(scopeKey, storeId, snapshot, f.sessionId), view);
    const legacy = { ...view, session: { ...view.session!, draftRevision: 7, draftEmpty: false } };
    saveStartupView(cache, legacy);
    assert.deepEqual(readStartupView(cache, scopeKey, "default"), legacy);
    const connecting = structuredClone(snapshot);
    connecting.provider.status = "connecting"; connecting.provider.models = []; connecting.provider.connections = [];
    assert.deepEqual(createStartupView(scopeKey, storeId, connecting, f.sessionId, view).models, view.models);
    assert.deepEqual(createStartupView(otherScope, storeId, connecting, f.sessionId, view).models, []);
    const partial = structuredClone(snapshot);
    partial.provider.models = [];
    partial.provider.connections = snapshot.provider.connections?.map((provider) => ({ ...provider,
      status: provider.id === model.providerId ? "connecting" : "error" }));
    assert.equal(createStartupView(scopeKey, storeId, partial, f.sessionId, view).models.some((entry) => entry.id === f.modelId), true);
    partial.provider.connections = partial.provider.connections?.map((provider) => ({ ...provider, status: "error" }));
    assert.equal(createStartupView(scopeKey, storeId, partial, f.sessionId, view).models.some((entry) => entry.id === f.modelId), false);
    connecting.provider.status = "disconnected";
    assert.deepEqual(createStartupView(scopeKey, storeId, connecting, f.sessionId, view).models, []);
    const tooLarge = { ...view, models: Array.from({ length: 513 }, () => view.models[0]!) };
    assert.throws(() => saveStartupView(cache, tooLarge), /cache|cached|presentation/i);
    assert.equal(f.requests.length, 0);
  } finally { await f.close(); }
});
test("cached profile hints never override an explicit profile and corrupt or oversized views fail visibly", async () => {
  const f = await setupFixture();
  try {
    const snapshot = structuredClone(f.service.controller.snapshot()), cache = storage();
    snapshot.profileId = "generated-profile";
    const view = createStartupView(scopeKey, f.service.connection.storeId!, snapshot, null);
    saveStartupView(cache, view);
    assert.equal(readStartupProfile(cache, context), "generated-profile");
    assert.equal(readStartupProfile(cache, { ...context, profileExplicit: true }), "default");
    assert.equal(readStartupProfile(cache, { ...context, scopeKey: null }), "default");
    const key = [...cache.values.keys()].find((key) => key.includes("generated-profile"))!;
    const original = cache.values.get(key)!;
    for (const corrupt of [
      "not generated JSON",
      JSON.stringify({ ...view, schemaVersion: 999 }),
      JSON.stringify({ ...view, scopeKey: otherScope }),
      JSON.stringify({ ...view, profileId: "default" }),
      JSON.stringify({ ...view, generatedProviderPayload: { token: "generated forbidden" } }),
      " ".repeat(STARTUP_CACHE_MAX_BYTES + 1),
    ]) {
      cache.values.set(key, corrupt);
      assert.throws(() => readStartupView(cache, scopeKey, "generated-profile"), /cache|cached|presentation/i);
    }
    cache.values.set(key, original);
    assert.deepEqual(readStartupView(cache, scopeKey, "generated-profile"), view);
    assert.equal(f.requests.length, 0);
  } finally { await f.close(); }
});
