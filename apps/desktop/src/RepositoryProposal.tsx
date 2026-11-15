import { useState } from "react";
import { sessionRepositoryProposal, sessionSubtree, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";

export function RepositoryProposal({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  let owner = session;
  for (let depth = 0; owner.parentSessionId && depth < 8; depth++) owner = snapshot.sessions.find((value) => value.id === owner.parentSessionId) ?? owner;
  const proposal = sessionRepositoryProposal(owner, snapshot), subject = owner.id === session.id ? "This chat" : "This chat's parent tree";
  if (!proposal) return null;
  const root = proposal.root.root;
  if (proposal.project || !proposal.confirm) return <p className="continuation-status repository-proposal" role="status">
    {subject} wrote code in {root}. It moves under {proposal.project ? `project ${proposal.project.name}` : "a newly imported project"} once its current work settles.
  </p>;
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "The repository choice was not acknowledged. This chat was not moved."); }
    finally { setBusy(false); }
  };
  const importRepository = () => act(async () => {
    if (remember) {
      const settings = sdk.settings.get();
      if (!settings) throw new Error("Reconnect before saving the repository import preference. This chat was not moved.");
      await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmRepositoryImport: false } }, settings.revision);
    }
    await sdk.sessions.importRepository(owner.id, root, true);
  });
  const waiting = sessionSubtree(snapshot.sessions, owner.id).some((value) => Boolean(value.turnId));
  return <section className="continuation-status repository-proposal" aria-label="Move chat to repository">
    <Icon name="Files" />
    <div><strong>Move this chat to its repository?</strong>
      <p>{subject} wrote code in the Git repository {root}. Import it as a project and move the whole chat tree there; later turns run in that repository instead of Home.</p>
      <label className="check-setting"><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />Do not ask again; import repositories automatically</label>
      {waiting && <p>Available when the current turn finishes.</p>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    </div>
    <button type="button" disabled={busy} onClick={() => void act(() => sdk.sessions.dismissRepository(owner.id))}>Not now</button>
    <button type="button" className="primary" disabled={busy || waiting} onClick={() => void importRepository()}>Import and move</button>
  </section>;
}
