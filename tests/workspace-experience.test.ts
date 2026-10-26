import assert from "node:assert/strict";
import test from "node:test";
import { MoguriSdk } from "../packages/sdk/src/index.ts";
import { searchSettings } from "../apps/desktop/src/settings-catalog.ts";
import { setupFixture } from "./fixture.ts";

test("artifacts, candidates and the unified Sandbox remain searchable settings destinations", () => {
  const ids = (query: string) => searchSettings(query).flatMap((group) => group.items.map((item) => item.id));
  assert.ok(ids("artifacts").includes("artifacts"));
  assert.ok(ids("candidates").includes("candidates"));
  assert.equal(searchSettings("sendbox").flatMap((group) => group.items).find((item) => item.id === "sendbox")?.label, "Sandbox");
});

test("global suggestions expose usage gaps without selecting or creating a hidden chat", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    const before = fixture.service.controller.snapshot().sessions.length;
    const { preview } = await sdk.suggestions.preview(null, true);
    assert.equal(preview.scope, "all-projects");
    assert.ok(preview.gaps.some((gap) => gap.id === "skills"));
    assert.equal(fixture.service.controller.snapshot().sessions.length, before);
    assert.equal(fixture.requests.length, 0);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("the shared dashboard starts at seven UTC days and has no fabricated productivity baseline", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    const { dashboard } = await sdk.dashboard.overview();
    assert.equal(dashboard.days.length, 7);
    assert.equal(dashboard.work.total, 1);
    assert.equal(dashboard.velocity.completedTurns, 0);
    assert.equal(dashboard.velocity.medianCompletionMs, null);
    assert.equal(dashboard.velocity.productivityIncrease, null);
    assert.equal(dashboard.totals.calls, 0);
    assert.equal(fixture.requests.length, 0);
  } finally { sdk.disconnect(); await fixture.close(); }
});
