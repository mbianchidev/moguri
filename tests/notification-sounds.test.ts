import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../apps/service/src/store.ts";
import { factoryControls, projectEvents, PROTOCOL_VERSION, type Attention, type Snapshot } from "../packages/protocol/src/index.ts";
import { AttentionNotifier } from "../apps/desktop/src/notifications.ts";

test("completion sounds follow actual terminal work once, independently from desktop banners and startup replay", () => {
  const store = new EventStore(":memory:");
  try {
    store.commit([
      { profile_id: "default", session_id: "generated-session", event_type: "session.created", payload: { title: "Generated sound owner", controls: factoryControls() } },
      { profile_id: "default", session_id: "generated-session", turn_id: "generated-completed-turn", event_type: "turn.finished", payload: { outcome: "completed", diagnostic: null } },
    ]);
    const events = store.events();
    const snapshot: Snapshot = { ...projectEvents(events), protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
      provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
    snapshot.settings.values.notifications = { ...snapshot.settings.values.notifications, completedSound: { enabled: true, id: "default" } };
    const notifier = new AttentionNotifier(0), sounds: string[] = [], banners: string[] = [];
    notifier.observe(snapshot, events, false, (banner) => banners.push(banner.id), (sound) => sounds.push(sound.kind));
    notifier.observe(snapshot, events, false, (banner) => banners.push(banner.id), (sound) => sounds.push(sound.kind));
    assert.deepEqual(sounds, ["completed"]); assert.deepEqual(banners, []);
    new AttentionNotifier(snapshot.seq).observe(snapshot, events, false, () => {}, (sound) => sounds.push(sound.kind));
    assert.equal(sounds.length, 1);
  } finally { store.close(); }
});

test("needs-input sounds require actual pending input, never heuristic questions, read acknowledgements or model confidence", () => {
  const store = new EventStore(":memory:");
  try {
    const attention: Attention = { id: "generated-approval-attention", sessionId: "generated-session", projectId: null, kind: "bell", reason: "approval",
      source: "state", acknowledged: false, active: true, messageId: "generated-exact-approval", createdAt: new Date().toISOString() };
    store.commit([
      { profile_id: "default", session_id: attention.sessionId, event_type: "session.created", payload: { title: "Generated input sound", controls: factoryControls() } },
      { profile_id: "default", session_id: attention.sessionId, event_type: "attention.raised", payload: { attention } },
      { profile_id: "default", session_id: attention.sessionId, event_type: "attention.raised", payload: { attention: { ...attention, id: "generated-heuristic", kind: "question", reason: "question", source: "heuristic" } } },
    ]);
    const events = store.events(), snapshot: Snapshot = { ...projectEvents(events), protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
      provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
    snapshot.sessions[0]!.turnId = "generated-actual-turn";
    snapshot.sessions[0]!.pendingApproval = { id: "generated-exact-approval", stepId: "generated-step", policyRevision: 0, call: { id: "generated-call", name: "read_file", arguments: { path: "fixture.txt" } } };
    const sounds: string[] = [];
    new AttentionNotifier(0).observe(snapshot, events, false, () => {}, (sound) => sounds.push(sound.kind));
    assert.deepEqual(sounds, ["needs-input"]);
    snapshot.attention[0]!.acknowledged = true;
    new AttentionNotifier(0).observe(snapshot, events, false, () => {}, (sound) => sounds.push(sound.kind));
    assert.deepEqual(sounds, ["needs-input"]);
    assert.notEqual(snapshot.sessions[0]!.pendingApproval, null);
  } finally { store.close(); }
});

test("failed, stopped and partial turns never play completion audio; focus, disabling and held queues use actual state", () => {
  for (const outcome of ["completed", "failed", "stopped", "partial"] as const) for (const focused of [false, true]) {
    const store = new EventStore(":memory:");
    try {
      store.commit([
        { profile_id: "default", session_id: "generated-outcome", event_type: "session.created", payload: { title: "Generated outcome", controls: factoryControls() } },
        { profile_id: "default", session_id: "generated-outcome", turn_id: "generated-turn", event_type: "turn.finished", payload: { outcome, diagnostic: null } },
      ]);
      const events = store.events(), snapshot: Snapshot = { ...projectEvents(events), protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
        provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
      const sounds: string[] = [], observe = () => new AttentionNotifier(0).observe(snapshot, events, focused, () => {}, (sound) => sounds.push(sound.kind));
      observe(); assert.equal(sounds.length, outcome === "completed" && !focused ? 1 : 0);
      snapshot.settings.values.notifications.soundWhileFocused = true;
      sounds.length = 0; observe(); assert.equal(sounds.length, outcome === "completed" ? 1 : 0);
      snapshot.settings.values.notifications.completedSound = { enabled: false, id: "default" };
      sounds.length = 0; observe(); assert.equal(sounds.length, 0);
    } finally { store.close(); }
  }
});
