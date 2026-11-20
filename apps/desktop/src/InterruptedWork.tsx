import { useEffect, useRef, useState } from "react";
import { describeInterruption, interruptedSessions, sessionTitle, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

const key = (session: Session) => `${session.id}:${session.interruption?.at ?? ""}`;
const message = (error: unknown) => error instanceof Error ? error.message : "The chat could not be continued.";

/** After a restart, asks once per interruption whether to continue chats that a quit, restart or crash stopped (D51). */
export function InterruptedWorkPrompt({ sdk, snapshot, open, modal }: { sdk: MoguriSdk; snapshot: Snapshot; open: (id: string) => void; modal: (open: boolean) => void }) {
  const [seen, setSeen] = useState(() => new Set<string>());
  const sessions = interruptedSessions(snapshot.sessions);
  const unseen = sessions.filter((session) => !seen.has(key(session)));
  if (snapshot.settings.values.interactions.continueInterrupted === "always" || !unseen.length) return null;
  return <InterruptedWorkDialog sdk={sdk} snapshot={snapshot} sessions={sessions} open={open} modal={modal}
    close={() => setSeen((current) => new Set([...current, ...sessions.map(key)]))} />;
}

function InterruptedWorkDialog({ sdk, snapshot, sessions, open, modal, close }: {
  sdk: MoguriSdk; snapshot: Snapshot; sessions: Session[]; open: (id: string) => void; modal: (open: boolean) => void; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), primary = useRef<HTMLButtonElement>(null), pending = useRef(false);
  const [always, setAlways] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal(); primary.current?.focus(); modal(true);
    return () => { modal(false); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [modal]);
  const act = async (work: () => Promise<string | void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const failure = await work(); if (failure) setError(failure); }
    catch (cause) { setError(message(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const continueAll = () => act(async () => {
    if (always) {
      const settings = sdk.settings.get();
      if (!settings) throw new Error("Reconnect this profile before saving the restart choice.");
      await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, continueInterrupted: "always" } }, settings.revision);
    }
    const failed = (await sdk.sessions.continueAllInterrupted()).filter((result) => result.error);
    if (!failed.length) { close(); return; }
    const title = (id: string) => { const session = sessions.find((value) => value.id === id); return session ? sessionTitle(session) : id; };
    return failed.map((result) => `${title(result.sessionId)}: ${result.error}`).join(" ");
  });
  const project = (session: Session) => snapshot.projects.find((value) => value.id === session.projectId)?.name;
  return <dialog ref={dialog} className="workspace-dialog interrupted-work-dialog" aria-label="Continue interrupted work"
    onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <header><h2>Continue interrupted work?</h2></header>
    <p>These chats were working when Moguri stopped. Continuing asks the agent to check where it left off first; nothing it already did is repeated, and prompts you held stay held.</p>
    <ul className="interrupted-work-list" aria-label="Interrupted chats">{sessions.map((session) => <li key={session.id}>
      <div><strong>{sessionTitle(session)}</strong>{project(session) && <span className="fine-print"> in {project(session)}</span>}
        <p className="fine-print">{describeInterruption(session.interruption!)}</p></div>
      <div className="interrupted-work-actions">
        <button type="button" className="quiet" disabled={busy} onClick={() => { open(session.id); close(); }}>Open</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => sdk.sessions.dismissInterruption(session.id).then(() => undefined))}>Dismiss</button>
        <button type="button" disabled={busy} onClick={() => void act(() => sdk.sessions.continueInterrupted(session.id).then(() => undefined))}>Continue</button>
      </div>
    </li>)}</ul>
    <label className="check-setting"><input type="checkbox" checked={always} disabled={busy} onChange={(event) => setAlways(event.target.checked)} />Don't ask again: continue all automatically after a restart</label>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <footer><button type="button" disabled={busy} onClick={close}>Not now</button>
      <button ref={primary} type="button" className="primary" disabled={busy} onClick={() => void continueAll()}>Continue all</button></footer>
  </dialog>;
}

/** In-chat reminder with Continue and Dismiss while this chat's interrupted work waits. */
export function InterruptedNotice({ sdk, session, run }: { sdk: MoguriSdk; session: Session; run: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!session.interruption) return null;
  const act = (operation: () => Promise<unknown>) => { setBusy(true); void run(operation).finally(() => setBusy(false)); };
  return <section className="continuation-status interrupted-notice" role="status" aria-label="Interrupted work">
    <div><strong>Interrupted when Moguri stopped</strong><p>{describeInterruption(session.interruption)}. Continue asks the agent to check where it left off first.</p></div>
    <div className="interrupted-work-actions">
      <button type="button" className="quiet" disabled={busy} onClick={() => act(() => sdk.sessions.dismissInterruption(session.id))}>Dismiss</button>
      <button type="button" disabled={busy} onClick={() => act(() => sdk.sessions.continueInterrupted(session.id))}>Continue</button>
    </div>
  </section>;
}
