import assert from "node:assert/strict";
import test from "node:test";
import { activityDuration } from "../apps/desktop/src/ChatActivity.tsx";

test("activity timers advance in whole elapsed seconds regardless of the initial sampling offset", () => {
  assert.deepEqual([200, 1200, 2200].map(activityDuration), ["0s", "1s", "2s"]);
  assert.equal(activityDuration(59_999), "59s");
  assert.equal(activityDuration(60_200), "1m 0s");
  assert.equal(activityDuration(null), "Unavailable");
});
