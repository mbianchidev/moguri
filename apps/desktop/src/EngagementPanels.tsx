import { useEffect, useRef, useState } from "react";
import { type MoguriSdk, type Session, type Snapshot, type SuggestionPreview } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export function SuggestionsPanel({ sdk, session, snapshot, allProjects: initialAll, chooseSession, modal }: {
  sdk: MoguriSdk; session?: Session; snapshot: Snapshot; allProjects: boolean; chooseSession: (id: string) => Promise<void>; modal: (open: boolean) => void;
}) {
  const [allProjects, setAllProjects] = useState(initialAll);
  const [preview, setPreview] = useState<SuggestionPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = async () => {
    const request = ++generation.current;
    setPreview(null); setError(""); setConfirmed(false); setBusy(true);
    try { const result = await sdk.suggestions.preview(session?.id ?? null, allProjects); if (request === generation.current) setPreview(result.preview); }
    catch (error) { if (request === generation.current) setError(error instanceof Error ? error.message : "Source preview is unavailable."); }
    finally { if (request === generation.current) setBusy(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [sdk, session?.id, allProjects, snapshot.settings.revision, snapshot.sessions.map((value) => `${value.id}:${value.updatedAt}`).join(",")]);
  const generate = async () => {
    if (!preview || !confirmed) return;
    setBusy(true); setError("");
    try {
      const result = await sdk.suggestions.generate(session?.id ?? null, preview.digest, allProjects, true);
      if (!result.id) throw new Error("The settings chat was not acknowledged. No result session was guessed.");
      await chooseSession(result.id);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Suggestions were not generated. Source review is preserved."); }
    finally { setBusy(false); }
  };
  return <section className="suggestions-panel" aria-label="Moguri suggestions"><header className="panel-toolbar"><strong>Improve your Moguri workflow</strong><button className="icon-button" aria-label="Refresh suggestion sources" title="Refresh sources" disabled={busy} onClick={() => void load()}><Icon name="Down" /></button></header>
    <p className="fine-print">Scope: {session?.projectId ? snapshot.projects.find((project) => project.id === session.projectId)?.name : allProjects ? "All projects in this profile" : "Project-free chats only"}. Preview is local; nothing is sent automatically.</p>
    {session?.projectId === null && <label className="check-setting"><input type="checkbox" checked={allProjects} onChange={(event) => setAllProjects(event.target.checked)} />Include conversations from all projects</label>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {preview && <><p className="fine-print">{preview.diagnostic}</p>
      <h2>Usage gaps</h2>{preview.gaps.length ? preview.gaps.map((gap) => <article className="suggestion-hint" key={gap.id}><strong>{gap.title}</strong><p>{gap.detail}</p></article>) : <p className="fine-print">No gaps detected by the current local checks. This is not a workflow-quality score.</p>}
      {preview.repeated.length > 0 && <><h2>Repeated guidance</h2>{allProjects && <p className="fine-print">Cross-project hints can become proposals in a settings chat after you approve the source scope below.</p>}{preview.repeated.map((hint) => <article className="suggestion-hint" key={hint.text}><p>{hint.text}</p><small>{hint.count} previous sessions / local phrase match, not a model verdict</small><button disabled={busy || allProjects || !session} onClick={() => {
        setBusy(true); setError("");
        void (async () => {
          if (!session) throw new Error("Choose an owning source chat before proposing scoped instructions.");
          const source = session.projectId ? await sdk.projects.sources(session.projectId) : null;
          const before = source?.instructions ?? snapshot.settings.values.instructions;
          await sdk.configuration.propose(session.id, { target: session.projectId ? "repo-instructions" : "global", section: session.projectId ? "AGENTS.md" : "instructions", value: `${before.trim()}\n\n${hint.text}\n`.trim() + "\n", reason: `Repeated user guidance across ${hint.count} previous sessions. Review before applying.`, evidence: hint.messageIds });
        })().catch((error: unknown) => setError(error instanceof Error ? error.message : "Instruction proposal was not created.")).finally(() => setBusy(false));
      }}>Propose instruction</button></article>)}</>}
      <details className="suggestion-sources"><summary>Review {preview.sources.length} bounded source prompts</summary>{preview.sources.map((source) => <article key={`${source.sessionId}-${source.messageId}`}><strong>{source.title}</strong><small>{source.projectId ? snapshot.projects.find((project) => project.id === source.projectId)?.name ?? "Project" : "No project"}</small><pre>{source.text}</pre></article>)}</details>
      {preview.sources.length || preview.gaps.length ? <><label className="check-setting"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I approve sending these usage gaps and scoped excerpts to the selected model for suggestions.</label><button className="primary" disabled={busy || !confirmed || !preview.modelId} onClick={() => void generate()}>Generate suggestions</button>{!preview.modelId && <p className="fine-print">Choose a chat with a model, or configure a profile startup model first. Preview and local checks make no model call.</p>}</> : <p className="fine-print">No earlier prompts or usage gaps in this scope yet.</p>}
    </>}
    {session && <ConfigurationProposals sdk={sdk} session={session} snapshot={snapshot} modal={modal} scope />}
  </section>;
}
export function ConfigurationProposals({ sdk, session, snapshot, modal, scope = false }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; modal: (open: boolean) => void; scope?: boolean;
}) {
  const [review, setReview] = useState<string | null>(null);
  useEffect(() => { modal(review !== null); return () => modal(false); }, [review, modal]);
  const proposals = snapshot.configurationProposals.filter((proposal) => proposal.status === "pending" && (scope ? proposal.projectId === session.projectId : proposal.sessionId === session.id));
  if (!proposals.length && !review) return null;
  return <section className="configuration-proposals" aria-label="Reviewed configuration proposals"><h2>Pending configuration review</h2>{proposals.slice(-8).map((proposal) => <div className="configuration-proposal-row" key={proposal.id}><div><strong>{proposal.target} / {proposal.section}</strong><small>{proposal.actor === "model" ? "Model suggestion, not user approval" : "User-authored proposal"} / {proposal.projectId ? "Project scope" : "Global scope"}</small></div><button onClick={() => setReview(proposal.id)}>Review</button></div>)}
    {review && <ConfigurationReview sdk={sdk} id={review} close={() => setReview(null)} />}
  </section>;
}
function ConfigurationReview({ sdk, id, close }: { sdk: MoguriSdk; id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Awaited<ReturnType<MoguriSdk["configuration"]["review"]>> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); void sdk.configuration.review(id).then(setData).catch((error: unknown) => setError(error instanceof Error ? error.message : "Proposal review is unavailable.")); }, [id]);
  const decide = async (approve: boolean) => {
    if (!data) return;
    setBusy(true); setError("");
    try { await sdk.configuration.decide(id, approve, data.proposal.contentDigest, approve && confirmed); close(); }
    catch (error) { setError(error instanceof Error ? error.message : "The proposal was not applied. Reload its current base."); }
    finally { setBusy(false); }
  };
  const text = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const project = sdk.getState().snapshot?.projects.find((project) => project.id === data?.proposal.projectId);
  return <dialog ref={dialog} className="workspace-dialog configuration-review" onClose={close} aria-label="Review configuration change"><header><h2>Review exact change</h2><button className="icon-button" aria-label="Close configuration review" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}{data && <><p><strong>{project?.name ?? (data.proposal.projectId ? data.proposal.projectId : "Global")} / {data.proposal.section}</strong></p>{project && <p className="fine-print path">{project.path}</p>}<p>{data.proposal.reason}</p><details open><summary>Current base</summary><pre>{text(data.before)}</pre></details><details open><summary>Proposed value</summary><pre>{text(data.spec.value)}</pre></details>
      {data.proposal.evidence.length > 0 && <details><summary>Verified source references</summary>{data.proposal.evidence.map((source) => <article key={source.messageId}><strong>{source.title}</strong><pre>{source.text}</pre></article>)}</details>}
      <p className="settings-warning">{data.warning}</p><label className="check-setting"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this exact scope and change, and approve the configuration risk.</label>
      <footer><button disabled={busy} onClick={() => void decide(false)}>Reject</button><button className="primary" disabled={!confirmed || busy} onClick={() => void decide(true)}>{data.proposal.target === "skill" ? "Install disabled skill" : data.proposal.target === "repo-instructions" ? "Write instructions locally" : "Apply"}</button></footer>
    </>}
  </dialog>;
}
export function AttentionPanel({ sdk, snapshot, chooseSession }: { sdk: MoguriSdk; snapshot: Snapshot; chooseSession: (id: string) => Promise<void> }) {
  const [error, setError] = useState("");
  const active = snapshot.attention.filter((entry) => entry.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const read = async (id: string) => { try { await sdk.attention.acknowledge([id]); } catch (error) { setError(error instanceof Error ? error.message : "Read acknowledgement failed."); } };
  return <section aria-label="Attention list"><h2>Needs your attention</h2>{error && <p className="inline-error" role="alert">{error}</p>}{!active.length && <p className="fine-print">No pending attention. Read acknowledgement never answers a question or approves a tool.</p>}
    {active.map((entry) => { const session = snapshot.sessions.find((session) => session.id === entry.sessionId); return <article className={`attention-item ${entry.acknowledged ? "read" : "unread"}`} key={entry.id}><Icon name={entry.kind === "question" ? "Question" : entry.kind === "done" ? "Waiting" : "Attention"} /><div><button className="quiet" onClick={() => void chooseSession(entry.sessionId)}>{session?.title ?? "Session removed"}</button><p>{entry.kind === "question" ? "Possible question" : entry.kind === "done" ? "Agent done and waiting" : entry.reason === "approval" ? "Exact tool approval needed" : "Inspect incomplete or failed work"}</p><small>{new Date(entry.createdAt).toLocaleString()}</small></div>{!entry.acknowledged && <button className="icon-button" aria-label={`Mark attention read ${entry.id}`} title="Mark read, not resolved" onClick={() => void read(entry.id)}><Icon name="Check" /></button>}</article>; })}
  </section>;
}
