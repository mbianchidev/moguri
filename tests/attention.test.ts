import assert from "node:assert/strict";
import { test } from "node:test";
import { likelyQuestion } from "../apps/service/src/attention.ts";
import { AttentionNotifier, type Banner } from "../apps/desktop/src/notifications.ts";
import { MoguriSdk, type Snapshot, type StoredEvent } from "../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "./fixture.ts";

test("question hints work across languages and ignore fenced code, quotations, inline examples and URLs", () => {
  assert.equal(likelyQuestion("Which generated option would you prefer?"), true);
  assert.equal(likelyQuestion("Vuoi continuare con questa opzione?"), true);
  assert.equal(likelyQuestion("Generated explanation.\n\nReady to proceed?"), true);
  assert.equal(likelyQuestion("Generated complete response."), false);
  assert.equal(likelyQuestion("```ts\nconst sample = 'which option?';\n```"), false);
  assert.equal(likelyQuestion("> Would you choose this generated option?"), false);
  assert.equal(likelyQuestion("`Which generated option?`"), false);
  assert.equal(likelyQuestion("https://example.test/query?"), false);
});
test("attention shares atomic state, reading never answers/approves, and notification replay stays private and deduplicated", { skip: process.platform !== "darwin", timeout: 20_000 }, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const frames: StoredEvent[][] = []; fixture.service.controller.on("change", (events: StoredEvent[]) => frames.push(events));
  try {
    await fixture.configure(); await fixture.send("generated question");
    await fixture.terminal(); await sdk.refresh();
    const snapshot = sdk.getState().snapshot!;
    const attention = snapshot.attention.find((entry) => entry.active)!;
    assert.equal(attention.kind, "question"); assert.equal(attention.source, "heuristic"); assert.equal(attention.acknowledged, false);
    assert.ok(frames.some((events) => events.some((event) => event.event_type === "turn.finished") && events.some((event) => event.event_type === "attention.raised")));
    const events = fixture.service.controller.events(0), shown: Banner[] = [];
    const notify = new AttentionNotifier(0);
    notify.observe(snapshot, events, false, (banner) => shown.push(banner));
    assert.equal(shown.length, 0);
    const enabled: Snapshot = { ...snapshot, settings: { ...snapshot.settings, values: { ...snapshot.settings.values, notifications: { inApp: true, os: true, previewContent: false } } } };
    notify.observe(enabled, events, false, (banner) => shown.push(banner));
    assert.equal(shown.length, 0, "Enabling banners does not replay an old already-observed attention.");
    const fresh = new AttentionNotifier(0);
    fresh.observe(enabled, events, false, (banner) => shown.push(banner));
    assert.equal(shown.length, 1); assert.equal(shown[0]!.body, "A session may be asking a question.");
    fresh.observe(enabled, events, false, (banner) => shown.push(banner)); assert.equal(shown.length, 1);
    new AttentionNotifier(snapshot.seq).observe(enabled, events, false, (banner) => shown.push(banner)); assert.equal(shown.length, 1);
    const focused = new AttentionNotifier(0);
    focused.observe(enabled, events, true, (banner) => shown.push(banner)); focused.observe(enabled, events, false, (banner) => shown.push(banner)); assert.equal(shown.length, 1);
    const caughtUp = new AttentionNotifier(0);
    caughtUp.observe({ ...enabled, seq: 0 }, events, false, (banner) => shown.push(banner));
    caughtUp.observe(enabled, events, false, (banner) => shown.push(banner)); assert.equal(shown.length, 2);
    const users = fixture.session().messages.filter((message) => message.role === "user").length;
    await sdk.attention.acknowledge([attention.id]);
    assert.equal(sdk.getState().snapshot!.attention.find((entry) => entry.id === attention.id)?.active, true);
    assert.equal(fixture.session().messages.filter((message) => message.role === "user").length, users);
    assert.equal(fixture.session().pendingApproval, null);
    await fixture.send("generated tool");
    const approval = await waitFor(() => fixture.session().pendingApproval);
    await sdk.refresh();
    const bell = sdk.getState().snapshot!.attention.find((entry) => entry.active)!;
    assert.equal(bell.kind, "bell"); assert.equal(bell.reason, "approval");
    assert.equal(sdk.getState().snapshot!.attention.find((entry) => entry.id === attention.id)?.active, false);
    await sdk.attention.acknowledge([bell.id]);
    assert.equal(fixture.session().pendingApproval?.id, approval.id);
    await fixture.approve(false); await fixture.terminal(); await sdk.refresh();
    assert.equal(sdk.getState().snapshot!.attention.filter((entry) => entry.active).length, 1);
    assert.equal(sdk.getState().snapshot!.attention.find((entry) => entry.active)?.kind, "done");
  } finally { sdk.disconnect(); await fixture.close(); }
});
test("a completed turn with already-admitted follow-up work does not claim the agent is done and waiting", { skip: process.platform !== "darwin", timeout: 20_000 }, async () => {
  const fixture = await setupFixture();
  try {
    await fixture.configure(); await fixture.send("generated delayed first turn");
    await waitFor(() => fixture.requests.length === 1);
    await fixture.send("Generated queued follow-up.");
    await waitFor(() => fixture.requests.length === 2 && fixture.session().status === "completed");
    const raised = fixture.service.controller.events(0).filter((event) => event.event_type === "attention.raised");
    assert.equal(raised.length, 1);
    assert.equal(fixture.service.controller.snapshot().attention.find((entry) => entry.active)?.reason, "completed");
  } finally { await fixture.close(); }
});
