import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopStartupPhase } from "./bridge.d.ts";
import type { OpeningDraft, StartupView } from "./startup-cache.ts";
import { Alert } from "./Alert.tsx";
import mascot from "../../../assets/moguri.svg?raw";
import { advanceFlight, flapFlight, flightScore, initialFlight, FLIGHT_FIELD } from "./startup-flight.ts";

const labels: Record<DesktopStartupPhase, string> = {
  window: "Preparing the desktop", service: "Waiting for the local service",
  profile: "Connecting the profile", preferences: "Reading application preferences",
  native: "Preparing native controls", ready: "Connecting the saved session", failed: "Startup did not complete",
};
const flightPosition = (x: number, height: number) => ({ transform: `translate(${x}%, ${100 - height / FLIGHT_FIELD.height * 100}%)` });
function StartupFlight() {
  const [flight, setFlight] = useState(initialFlight);
  const flap = useCallback(() => setFlight(flapFlight), []);
  const flying = flight.status === "flying";
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey ||
        event.target instanceof Element && event.target.closest("input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable=false])")) return;
      event.preventDefault(); flap();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [flap]);
  useEffect(() => {
    if (!flying) return;
    let previous = performance.now(), frame: number;
    const tick = (now: number) => {
      const elapsed = Math.max(0, (now - previous) / 1000); previous = now;
      setFlight((state) => advanceFlight(state, elapsed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flying]);
  return <div className="startup-flight">
    <h2 className="startup-flight-score" aria-label={`Flight score: ${flightScore(flight)}`}>Score <span>{flightScore(flight)}</span>
      {flight.bonus > 0 && <small className="startup-flight-bonus" role="status" aria-label="Flight bonus points">{flight.bonus} bonus points</small>}</h2>
    <button type="button" className="startup-flight-playfield" aria-label={flight.status === "lost" ? "Play again" : "Flap Moguri's wings"} aria-describedby="startup-flight-help startup-flight-result"
      onClick={flap} onKeyDown={(event) => {
        if (event.code !== "Space") return;
        event.preventDefault(); if (!event.repeat) flap();
      }} onKeyUp={(event) => { if (event.code === "Space") event.preventDefault(); }}>
      {flight.objects.map((object) => <span key={object.id} className={`startup-flight-object ${object.kind}`} style={flightPosition(object.x, object.height)} aria-hidden="true">
        <svg viewBox="0 0 32 32">{object.kind === "obstacle" ?
          <path d="M8 24a6 6 0 0 1-1-12 9 9 0 0 1 17-2 7 7 0 0 1 0 14H8Z" /> :
          <path d="m16 2 4.3 8.7 9.6 1.4-7 6.8 1.7 9.6-8.6-4.5-8.6 4.5 1.7-9.6-7-6.8 9.6-1.4Z" />}</svg>
      </span>)}
      <span className="startup-flight-avatar" style={flightPosition(FLIGHT_FIELD.playerX, flight.height)}>
        <span key={flight.flaps} className={flight.flaps ? "startup-flight-mascot flapped" : "startup-flight-mascot"}
          aria-hidden="true" dangerouslySetInnerHTML={{ __html: mascot }} />
      </span>
    </button>
    <p id="startup-flight-result" className="startup-flight-result" role="status" aria-label="Flight status">{flight.status === "lost" ?
      `Game over! ${flight.height === FLIGHT_FIELD.floor ? "Moguri fell." : "You hit a cloud."} Press Space or click to play again.` : ""}</p>
    <p id="startup-flight-help">Press <kbd>Space</kbd> or click to flap. Dodge clouds; collect stars for +50 points. Stay aloft, kupo!</p>
  </div>;
}
export function StartupWorkspace({ view, phase, error, cacheError, draft, change, unconfirmed = false, reconnect, reconnecting = false }: {
  view: StartupView | null; phase: DesktopStartupPhase; error: string | null; cacheError: string | null;
  draft: OpeningDraft | null; change: Dispatch<SetStateAction<OpeningDraft | null>>;
  unconfirmed?: boolean; reconnect?: () => void; reconnecting?: boolean;
}) {
  const cachedModel = view?.models.find((model) => model.id === view.session?.modelId);
  const update = (input: HTMLTextAreaElement) => {
    const text = input.value, focused = document.activeElement === input, selectionStart = input.selectionStart, selectionEnd = input.selectionEnd;
    change((previous) => ({
      id: previous?.id ?? crypto.randomUUID(), text, focused, selectionStart, selectionEnd,
      binding: previous ? previous.binding : view?.session ? { scopeKey: view.scopeKey, storeId: view.storeId,
        profileId: view.profileId, sessionId: view.session.id, draftRevision: view.session.draftRevision, draftEmpty: view.session.draftEmpty } : null,
    }));
  };
  return <section className="opening-workspace" aria-label="Opening workspace">
    <div className="opening-window-drag" aria-hidden="true" />
    <StartupFlight />
    <div className="opening-status">
        {(unconfirmed || error) && <h1>{unconfirmed ? "Startup not yet confirmed" : "Moguri could not connect"}</h1>}
        <p role="status" aria-label="Startup status">Opening your workspace... {labels[phase]}.</p>
        {error && <Alert as="p" className="inline-error" role="alert">{error} Your local opening draft is still here; nothing was sent.</Alert>}
        {reconnect && <button type="button" disabled={reconnecting} onClick={reconnect}>Reconnect to original service</button>}
        {cacheError && <p className="fine-print">{cacheError}</p>}
    </div>
    <details className="opening-tools">
      <summary>Draft while waiting</summary>
      <p className="fine-print">{view?.session ? "Last opened chat. " : ""}This local draft stays in this window until its exact saved destination is verified. Nothing is sent during startup.</p>
        {view && view.models.length > 0 && <details className="opening-models"><summary>Last known models and thinking efforts</summary>
          <p className="fine-print">Display only. Cached names do not establish current availability or authorize a model call.</p>
          <ul>{view.models.map((model) => <li key={model.id}>{model.name}: {model.thinkingLevels.length ? model.thinkingLevels.join(", ") : "no declared thinking effort"}</li>)}</ul>
        </details>}
      <form className="composer compact-composer opening-composer" aria-label="Opening draft composer" onSubmit={(event) => event.preventDefault()}>
        <textarea aria-label="Opening prompt" aria-describedby="opening-draft-help" value={draft?.text ?? ""} placeholder="Draft while Moguri reconnects..."
          onChange={(event) => update(event.currentTarget)}
          onSelect={(event) => { if (draft) update(event.currentTarget); }}
          onFocus={(event) => { if (draft) update(event.currentTarget); }}
          onBlur={(event) => { if (draft) update(event.currentTarget); }}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.preventDefault(); }} />
        <div className="composer-toolbar"><div className="composer-leading">
          <span className="fine-print">Last model: <strong>{cachedModel?.name ?? "not cached"}</strong>{view?.session?.thinkingEffort ? ` / ${view.session.thinkingEffort}` : ""}</span>
        </div><button type="submit" className="composer-send" disabled aria-label="Send">Send</button></div>
        <p id="opening-draft-help" className="composer-voice-status fine-print">Local draft only. Not saved, sent or queued.</p>
      </form>
    </details>
  </section>;
}
