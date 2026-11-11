import assert from "node:assert/strict";
import test from "node:test";
import { advanceFlight, flapFlight, initialFlight, flightScore } from "../apps/desktop/src/startup-flight.ts";

test("Space impulses lift Moguri, earn altitude points and retain the best score after landing", () => {
  let state = initialFlight();
  assert.equal(flightScore(state), 0);
  state = flapFlight(state);
  for (let frame = 0; frame < 10; frame++) state = advanceFlight(state, 1 / 60);
  assert.ok(state.height > 0);
  const first = state.height;
  state = flapFlight(state);
  for (let frame = 0; frame < 10; frame++) state = advanceFlight(state, 1 / 60);
  assert.ok(state.height > first);
  assert.ok(flightScore(state) > 0);
  const score = flightScore(state);
  for (let frame = 0; frame < 600; frame++) state = advanceFlight(state, 1 / 60);
  assert.equal(state.height, 0); assert.equal(state.velocity, 0);
  assert.ok(flightScore(state) >= score);
  assert.equal(state.flaps, 2);
});

test("flight physics is frame-rate independent and a suspended window cannot gain unplayed altitude", () => {
  const simulate = (step: number, frames: number) => {
    let state = flapFlight(initialFlight());
    for (let frame = 0; frame < frames; frame++) state = advanceFlight(state, step);
    return state;
  };
  const slower = simulate(1 / 30, 10), faster = simulate(1 / 120, 40);
  assert.ok(Math.abs(slower.height - faster.height) < 0.000001);
  const state = flapFlight(initialFlight());
  assert.deepEqual(advanceFlight(state, 60), advanceFlight(state, 0.05));
  assert.deepEqual(advanceFlight(state, 0), state);
});
