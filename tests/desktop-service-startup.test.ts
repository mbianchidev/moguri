import assert from "node:assert/strict";
import test from "node:test";
import { DesktopServiceStartup } from "../apps/desktop/src/service-startup.ts";
import { ServiceStartupUnconfirmed, type ServiceStartupReview } from "@moguri-dev/sdk/node";
import { PROTOCOL_VERSION, type Connection } from "@moguri-dev/sdk";
import { waitFor } from "./fixture.ts";

const review: ServiceStartupReview = {
  stateDir: "/generated/original-state", rootId: "1:2", pid: 42,
  lockFingerprint: "a".repeat(64), connectionFingerprint: null, staleConnectionFingerprint: null,
};
const connection: Connection = {
  protocolVersion: PROTOCOL_VERSION, pid: 42, token: "generated-original-startup-token",
  baseUrl: "http://127.0.0.1:12345", wsUrl: "ws://127.0.0.1:12345/v1/events",
};

test("an unconfirmed deadline suspends native readiness until the exact current reconnect action", async () => {
  const gate = Promise.withResolvers<void>(), unconfirmed = new ServiceStartupUnconfirmed(review);
  let attempts = 0, settled = false;
  const startup = new DesktopServiceStartup(async (captured) => {
    attempts++;
    if (!captured) throw unconfirmed;
    assert.deepEqual(captured, review);
    await gate.promise;
    return connection;
  }, async () => { throw new Error("No shutdown inspection was requested."); });
  const ready = startup.connect().then((value) => { settled = true; return value; });
  await waitFor(() => startup.status().canReconnect);
  const original = startup.status();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(attempts, 1); assert.equal(settled, false);
  assert.throws(() => startup.reconnect(original.revision + 1), /current.*startup/);
  startup.reconnect(original.revision);
  assert.throws(() => startup.reconnect(original.revision), /current.*startup/);
  await waitFor(() => attempts === 2);
  assert.equal(startup.status().canReconnect, false); assert.equal(settled, false);
  gate.resolve();
  assert.deepEqual(await ready, connection);
  assert.equal(startup.status().diagnostic, null);
  assert.equal(attempts, 2);
});

test("quit can inspect only the captured owner without releasing failed native startup or replaying admission", async () => {
  let inspections = 0, attempts = 0;
  const startup = new DesktopServiceStartup(async () => {
    attempts++; throw new ServiceStartupUnconfirmed(review);
  }, async (captured) => { inspections++; assert.deepEqual(captured, review); return connection; });
  const rejected = assert.rejects(startup.connect(), /cancelled.*lifecycle/);
  await waitFor(() => startup.status().canReconnect);
  assert.deepEqual(await startup.originalForShutdown(), connection);
  assert.equal(attempts, 1); assert.equal(inspections, 1);
  assert.equal(startup.status().canReconnect, true);
  startup.cancelAfterShutdown();
  await rejected;
  assert.throws(() => startup.reconnect(startup.status().revision), /current.*startup/);
});

test("failed quit inspection preserves the original suspended readiness and allows a later explicit reconnect", async () => {
  let attempts = 0;
  const startup = new DesktopServiceStartup(async (captured) => {
    attempts++; if (!captured) throw new ServiceStartupUnconfirmed(review);
    return connection;
  }, async () => { throw new Error("Generated original cleanup is unconfirmed."); });
  const ready = startup.connect();
  await waitFor(() => startup.status().canReconnect);
  await assert.rejects(startup.originalForShutdown(), /original cleanup is unconfirmed/);
  assert.equal(startup.status().canReconnect, true);
  startup.reconnect(startup.status().revision);
  assert.deepEqual(await ready, connection);
  assert.equal(attempts, 2);
});

test("a genuine startup failure remains fatal rather than acquiring a resumable or alternate owner", async () => {
  const startup = new DesktopServiceStartup(async () => { throw new Error("Generated retained migration failure."); },
    async () => { throw new Error("A different owner must not be inspected."); });
  await assert.rejects(startup.connect(), /retained migration failure/);
  assert.equal(startup.status().canReconnect, false);
  await assert.rejects(startup.originalForShutdown(), /retained migration failure/);
});
