import type { Dispatch, SetStateAction } from "react";
import type { DesktopStartupPhase } from "./bridge.d.ts";
import type { OpeningDraft, StartupView } from "./startup-cache.ts";
import { Alert } from "./Alert.tsx";
import mascot from "../../../assets/moguri.svg";

const labels: Record<DesktopStartupPhase, string> = {
  window: "Preparing the desktop", service: "Waiting for the local service",
  profile: "Connecting the profile", preferences: "Reading application preferences",
  native: "Preparing native controls", ready: "Connecting the saved session", failed: "Startup did not complete",
};
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
  return <section className="app-shell opening-workspace" aria-label="Opening workspace">
    <header className="titlebar"><div className="wordmark"><img className="brand-mascot" src={mascot} alt="" /><strong>moguri</strong><span className="alpha">alpha</span></div>
      <span className="titlebar-project">Chats</span></header>
    <nav className="project-nav" aria-label="Opening navigation">
      <div className="nav-heading"><span>Workspace</span></div>
      <button className="new-session start-trigger" disabled>+ New</button>
      <div className="nav-scroll"><div className="nav-heading">Chats</div>
        {view?.session && <button className="session-link" disabled aria-current="page">Last opened chat</button>}
      </div>
      <div className="nav-footer"><div className="connection-line">Connecting to the original service</div></div>
    </nav>
    <main className="main-pane">
      <header className="session-header"><div className="session-heading">
        <h1>{unconfirmed ? "Startup not yet confirmed" : error ? "Moguri could not connect" : view?.session ? "Last opened chat" : "Your workspace"}</h1>
        <span>{view ? "Last-known view. Live session and model availability are being verified." : "Your saved workspace is loading."}</span>
      </div></header>
      <div className="opening-content">
        <p role="status">Opening your workspace... {labels[phase]}.</p>
        {error && <Alert as="p" className="inline-error" role="alert">{error} Your local opening draft is still here; nothing was sent.</Alert>}
        {reconnect && <button type="button" disabled={reconnecting} onClick={reconnect}>Reconnect to original service</button>}
        {cacheError && <p className="fine-print">{cacheError}</p>}
        <p className="fine-print">You can type while the backend loads. This draft stays in this window until its exact saved destination is verified.</p>
        {view && view.models.length > 0 && <details className="opening-models"><summary>Last known models and thinking efforts</summary>
          <p className="fine-print">Display only. Cached names do not establish current availability or authorize a model call.</p>
          <ul>{view.models.map((model) => <li key={model.id}>{model.name}: {model.thinkingLevels.length ? model.thinkingLevels.join(", ") : "no declared thinking effort"}</li>)}</ul>
        </details>}
      </div>
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
    </main>
  </section>;
}
