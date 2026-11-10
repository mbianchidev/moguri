export interface FlightState { height: number; velocity: number; best: number; flaps: number }
export const initialFlight = (): FlightState => ({ height: 0, velocity: 0, best: 0, flaps: 0 });
export const flapFlight = (state: FlightState): FlightState => ({ ...state, velocity: 4.2, flaps: state.flaps + 1 });
export const flightScore = (state: FlightState): number => Math.floor(state.best * 10);
export function advanceFlight(state: FlightState, elapsed: number): FlightState {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Flight time must be a finite nonnegative duration.");
  const seconds = Math.min(elapsed, 0.05);
  if (!seconds || state.height === 0 && state.velocity === 0) return state;
  const gravity = 7, height = Math.max(0, state.height + state.velocity * seconds - gravity * seconds * seconds / 2);
  return { ...state, height, velocity: height === 0 ? 0 : state.velocity - gravity * seconds, best: Math.max(state.best, height) };
}
