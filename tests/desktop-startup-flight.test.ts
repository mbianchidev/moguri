import assert from "node:assert/strict";
import test from "node:test";
import { advanceFlight, flapFlight, initialFlight, flightScore, FLIGHT_FIELD } from "../apps/desktop/src/startup-flight.ts";

test("Moguri loses after falling without flaps, freezes the score and can start a fresh round", () => {
  let state = initialFlight(123);
  assert.equal(flightScore(state), 0);
  assert.deepEqual(advanceFlight(state, 1), state);
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
  assert.equal(state.status, "lost");
  assert.equal(state.height, FLIGHT_FIELD.floor); assert.equal(state.velocity, 0);
  assert.ok(flightScore(state) >= score);
  assert.equal(state.flaps, 2);
  assert.deepEqual(advanceFlight(state, 1 / 60), state);
  const restarted = flapFlight(state);
  assert.equal(restarted.status, "flying");
  assert.equal(restarted.flaps, state.flaps + 1); assert.equal(flightScore(restarted), 0);
  assert.deepEqual(restarted.objects, []);
});

test("flight physics is frame-rate independent and a suspended window cannot gain unplayed altitude", () => {
  const simulate = (step: number, frames: number) => {
    let state = flapFlight(initialFlight(1));
    for (let frame = 0; frame < frames; frame++) state = advanceFlight(state, step);
    return state;
  };
  const slower = simulate(1 / 30, 10), faster = simulate(1 / 120, 40);
  assert.ok(Math.abs(slower.height - faster.height) < 0.000001);
  const state = flapFlight(initialFlight(1));
  assert.deepEqual(advanceFlight(state, 60), advanceFlight(state, 0.05));
  assert.deepEqual(advanceFlight(state, 0), state);
  for (const elapsed of [-1, NaN, Infinity]) assert.throws(() => advanceFlight(state, elapsed), RangeError);
});

test("seeded rounds spawn varied, spaced obstacles and powerups while flight stays inside the arena", () => {
  const simulate = (seed: number) => {
    let state = flapFlight(initialFlight(seed));
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 20 === 0) state = flapFlight(state);
      state = advanceFlight(state, 1 / 60);
    }
    return state;
  };
  assert.deepEqual(simulate(1), simulate(1));
  assert.notDeepEqual(simulate(1).objects, simulate(0x9e3779b9).objects);
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const state = simulate(Math.imul(seed, 0x9e3779b9));
    assert.equal(state.status, "flying");
    assert.ok(state.height <= FLIGHT_FIELD.height - FLIGHT_FIELD.floor);
    assert.ok(state.objects.length > 0 && state.objects.length <= 4);
    for (const object of state.objects) {
      kinds.add(object.kind);
      assert.ok(object.x > FLIGHT_FIELD.playerX);
      assert.ok(object.height > FLIGHT_FIELD.floor && object.height < FLIGHT_FIELD.height - FLIGHT_FIELD.floor);
    }
    if (state.objects.length > 1) assert.ok(Math.abs(state.objects[0]!.x - state.objects[1]!.x) > FLIGHT_FIELD.playerRadius * 2);
  }
  assert.deepEqual(kinds, new Set(["obstacle", "powerup"]));
});

test("hitting an obstacle ends the round, near misses stay playable and offscreen objects leave", () => {
  const state = { ...flapFlight(initialFlight(1)), height: 24, velocity: 0, nextSpawnAt: 100 };
  const obstacle = { id: 1, kind: "obstacle" as const, x: FLIGHT_FIELD.playerX, height: 24 };
  const hit = advanceFlight({ ...state, objects: [obstacle] }, 1 / 60);
  assert.equal(hit.status, "lost"); assert.ok(hit.height > FLIGHT_FIELD.floor);
  assert.deepEqual(advanceFlight(hit, 1 / 60), hit);
  const missed = advanceFlight({ ...state, objects: [{ ...obstacle, height: 44 }] }, 1 / 60);
  assert.equal(missed.status, "flying");
  const cleared = advanceFlight({ ...state, objects: [{ ...obstacle, x: -10 }] }, 1 / 60);
  assert.deepEqual(cleared.objects, []);
});

test("collecting a powerup awards fifty extra points exactly once without ending the round", () => {
  const state = { ...flapFlight(initialFlight(1)), height: 24, velocity: 0, nextSpawnAt: 100 };
  const ordinary = advanceFlight(state, 1 / 60);
  const collected = advanceFlight({ ...state, objects: [{ id: 1, kind: "powerup", x: FLIGHT_FIELD.playerX, height: 24 }] }, 1 / 60);
  assert.equal(collected.status, "flying");
  assert.equal(flightScore(collected) - flightScore(ordinary), 50);
  assert.deepEqual(collected.objects, []);
  assert.equal(flightScore(advanceFlight(collected, 1 / 60)) - flightScore(advanceFlight(ordinary, 1 / 60)), 50);
});
