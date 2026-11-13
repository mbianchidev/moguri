export const FLIGHT_FIELD = { width: 100, height: 60, floor: 8, playerX: 30, playerRadius: 5, obstacleRadius: 4, powerupRadius: 3 } as const;
export interface FlightObject { id: number; kind: "obstacle" | "powerup"; x: number; height: number }
export interface FlightState {
  status: "ready" | "flying" | "lost";
  height: number; velocity: number; best: number; flaps: number; elapsed: number; bonus: number;
  objects: FlightObject[]; nextSpawnAt: number; spawned: number; seed: number;
}
const nextSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
export const initialFlight = (seed = Math.floor(Math.random() * 0x100000000)): FlightState => ({
  status: "ready", height: FLIGHT_FIELD.floor, velocity: 0, best: 0, flaps: 0, elapsed: 0, bonus: 0,
  objects: [], nextSpawnAt: 0.8, spawned: 0, seed: seed >>> 0,
});
export const flapFlight = (state: FlightState): FlightState => {
  const round = state.status === "lost" ? initialFlight(nextSeed(state.seed)) : state;
  return { ...round, status: "flying", velocity: 24, flaps: state.flaps + 1 };
};
export const flightScore = (state: FlightState): number => Math.floor(state.best * 10 + state.elapsed * 5) + state.bonus;
export function advanceFlight(state: FlightState, elapsed: number): FlightState {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Flight time must be a finite nonnegative duration.");
  const seconds = Math.min(elapsed, 0.05);
  if (!seconds || state.status !== "flying") return state;
  const gravity = 36, speed = 18, time = state.elapsed + seconds, ceiling = FLIGHT_FIELD.height - FLIGHT_FIELD.floor;
  const height = Math.max(FLIGHT_FIELD.floor, Math.min(ceiling, state.height + state.velocity * seconds - gravity * seconds * seconds / 2));
  let status: FlightState["status"] = height === FLIGHT_FIELD.floor ? "lost" : "flying";
  let objects = state.objects.map((object) => ({ ...object, x: object.x - speed * seconds }))
    .filter((object) => object.x >= -FLIGHT_FIELD.obstacleRadius);
  let { seed, nextSpawnAt, spawned, bonus } = state;
  if (status === "flying" && time >= nextSpawnAt) {
    const random = () => { seed = nextSeed(seed); return seed / 0x100000000; };
    const kind = random() < 0.7 ? "obstacle" : "powerup";
    const objectHeight = FLIGHT_FIELD.floor + 6 + random() * (ceiling - FLIGHT_FIELD.floor - 12);
    objects.push({ id: spawned++, kind, x: FLIGHT_FIELD.width + FLIGHT_FIELD.obstacleRadius - speed * (time - nextSpawnAt), height: objectHeight });
    nextSpawnAt += 1.8 + random() * 1.4;
  }
  const touches = (object: FlightObject) => Math.hypot(object.x - FLIGHT_FIELD.playerX, object.height - height) <=
    FLIGHT_FIELD.playerRadius + (object.kind === "obstacle" ? FLIGHT_FIELD.obstacleRadius : FLIGHT_FIELD.powerupRadius);
  if (objects.some((object) => object.kind === "obstacle" && touches(object))) status = "lost";
  if (status === "flying") objects = objects.filter((object) => {
    if (object.kind !== "powerup" || !touches(object)) return true;
    bonus += 50; return false;
  });
  return { ...state, status, height, velocity: status === "lost" || height === ceiling ? 0 : state.velocity - gravity * seconds,
    best: Math.max(state.best, height - FLIGHT_FIELD.floor), elapsed: time, objects, nextSpawnAt, spawned, seed, bonus };
}
