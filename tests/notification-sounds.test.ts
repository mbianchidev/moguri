import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../apps/service/src/store.ts";
import { defaultSettings, factoryControls, projectEvents, PROTOCOL_VERSION, type Attention, type Snapshot } from "../packages/protocol/src/index.ts";
import { AttentionNotifier, notificationToneAllowed } from "../apps/desktop/src/notifications.ts";

test("completion sounds follow actual terminal work once, independently from desktop banners and startup replay", () => {
  const store = new EventStore(":memory:");
  try {
    store.commit([
      { profile_id: "default", session_id: "generated-session", event_type: "session.created", payload: { title: "Generated sound owner", controls: factoryControls() } },
      { profile_id: "default", session_id: "generated-session", turn_id: "generated-completed-turn", event_type: "turn.finished", payload: { outcome: "completed", diagnostic: null } },
    ]);
    const events = store.events();
    const snapshot: Snapshot = { ...projectEvents(events), sessionTelemetry: {}, protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
      provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
    snapshot.settings.values.notifications = { ...snapshot.settings.values.notifications, completedSound: { enabled: true, id: "default" } };
    const notifier = new AttentionNotifier(0), sounds: string[] = [], banners: string[] = [];
    notifier.observe(snapshot, events, true, (banner) => banners.push(banner.id), (sound) => sounds.push(sound.kind));
    notifier.observe(snapshot, events, true, (banner) => banners.push(banner.id), (sound) => sounds.push(sound.kind));
    assert.deepEqual(sounds, ["completed"]); assert.deepEqual(banners, []);
    new AttentionNotifier(snapshot.seq).observe(snapshot, events, false, () => {}, (sound) => sounds.push(sound.kind));
    assert.equal(sounds.length, 1);
  } finally { store.close(); }
});

test("factory notification sounds are audible while focused and failed work raises attention audio, not completion", () => {
  assert.equal(defaultSettings().notifications.soundWhileFocused, true);
  const store = new EventStore(":memory:");
  try {
    const attention: Attention = { id: "generated-failure-attention", sessionId: "generated-failed-session", projectId: null,
      kind: "bell", reason: "failed", source: "state", acknowledged: false, active: true, messageId: null, createdAt: new Date().toISOString() };
    store.commit([
      { profile_id: "default", session_id: attention.sessionId, event_type: "session.created", payload: { title: "Generated failed work", controls: factoryControls() } },
      { profile_id: "default", session_id: attention.sessionId, turn_id: "generated-failed-turn", event_type: "turn.finished", payload: { outcome: "failed", diagnostic: "Generated failure." } },
      { profile_id: "default", session_id: attention.sessionId, event_type: "attention.raised", payload: { attention } },
    ]);
    const events = store.events(), snapshot: Snapshot = { ...projectEvents(events), sessionTelemetry: {}, protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
      provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
    const sounds: string[] = [], notifier = new AttentionNotifier(0);
    const observe = () => notifier.observe(snapshot, events, true, () => {}, (sound) => sounds.push(sound.kind));
    observe(); observe();
    assert.deepEqual(sounds, ["needs-input"]);
    const tone = { sessionId: attention.sessionId, kind: "needs-input", soundId: "default", attentionId: attention.id } as const;
    assert.equal(notificationToneAllowed(snapshot, tone, true), true);
    snapshot.attention[0]!.acknowledged = true;
    assert.equal(notificationToneAllowed(snapshot, tone, true), false);
    snapshot.attention[0]!.acknowledged = false;
    snapshot.settings.values.notifications.soundWhileFocused = false;
    sounds.length = 0;
    new AttentionNotifier(0).observe(snapshot, events, true, () => {}, (sound) => sounds.push(sound.kind));
    assert.deepEqual(sounds, []);
  } finally { store.close(); }
});

test("reconnect synchronizes the notification baseline without replaying offline completion", () => {
  const store = new EventStore(":memory:");
  try {
    store.commit([
      { profile_id: "default", session_id: "generated-reconnected", event_type: "session.created", payload: { title: "Generated reconnect", controls: factoryControls() } },
      { profile_id: "default", session_id: "generated-reconnected", turn_id: "generated-offline-turn", event_type: "turn.finished", payload: { outcome: "completed", diagnostic: null } },
    ]);
    const notifier = new AttentionNotifier(0), sounds: string[] = [];
    const snapshot = (): Snapshot => ({ ...projectEvents(store.events()), sessionTelemetry: {}, protocolVersion: PROTOCOL_VERSION, seq: store.events().at(-1)!.seq, profileId: "default",
      provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] });
    notifier.synchronize(snapshot().seq);
    notifier.observe(snapshot(), store.events(), false, () => {}, (tone) => sounds.push(tone.kind));
    assert.equal(sounds.length, 0);
    store.commit([{ profile_id: "default", session_id: "generated-reconnected", turn_id: "generated-fresh-turn", event_type: "turn.finished", payload: { outcome: "completed", diagnostic: null } }]);
    notifier.observe(snapshot(), store.events(), false, () => {}, (tone) => sounds.push(tone.kind));
    assert.deepEqual(sounds, ["completed"]);
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
    const events = store.events(), snapshot: Snapshot = { ...projectEvents(events), sessionTelemetry: {}, protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
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
      const events = store.events(), snapshot: Snapshot = { ...projectEvents(events), sessionTelemetry: {}, protocolVersion: PROTOCOL_VERSION, seq: events.at(-1)!.seq, profileId: "default",
        provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [] };
      snapshot.settings.values.notifications.soundWhileFocused = false;
      const sounds: string[] = [], observe = () => new AttentionNotifier(0).observe(snapshot, events, focused, () => {}, (sound) => sounds.push(sound.kind));
      observe(); assert.equal(sounds.length, outcome === "completed" && !focused ? 1 : 0);
      snapshot.settings.values.notifications.soundWhileFocused = true;
      sounds.length = 0; observe(); assert.equal(sounds.length, outcome === "completed" ? 1 : 0);
      snapshot.settings.values.notifications.completedSound = { enabled: false, id: "default" };
      sounds.length = 0; observe(); assert.equal(sounds.length, 0);
    } finally { store.close(); }
  }
});
