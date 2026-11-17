import { useEffect, useRef, useState } from "react";
import { attentionDescription, attentionTypeLabels, AttentionFiltersSchema, filterInboxAttention, inboxAttention, parse, type AttentionFilters, type MoguriSdk, type Session, type Snapshot, type SuggestionPreview } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";
import { ScriptReviewsPanel } from "./ScriptReviewsPanel.tsx";

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
    {session?.projectId === null && <label className="check-setting"><input type="checkbox" role="switch" checked={allProjects} onChange={(event) => setAllProjects(event.target.checked)} />Include conversations from all projects</label>}
    <CapabilityProposals sdk={sdk} snapshot={snapshot} projectId={session?.projectId ?? null} />
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
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
/** Model-proposed skill, script, memory and hook improvements waiting for the user's review. */
function CapabilityProposals({ sdk, snapshot, projectId }: { sdk: MoguriSdk; snapshot: Snapshot; projectId: string | null }) {
  const [open, setOpen] = useState<{ id: string; content: string; digest: string } | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending" && (!projectId || proposal.projectId === projectId));
  if (!pending.length) return null;
  const run = (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    void action().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The proposal was not updated. Reload and try again.")).finally(() => setBusy(false));
  };
  const decide = (approve: boolean) => open && run(async () => { await sdk.capabilities.decide(open.id, approve, open.digest); setOpen(null); });
  return <section className="capability-proposals" aria-label="Suggested skill improvements">
    <h2>Suggested improvements</h2>
    <p className="fine-print">Proposed after a request that used them. Approving installs a disabled copy; you enable it separately.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <ul>{pending.map((proposal) => <li key={proposal.id}>
      <div><strong>{proposal.name}</strong><small>{proposal.kind} · {proposal.baseDigest ? "updates an existing one" : "new"} · {snapshot.projects.find((project) => project.id === proposal.projectId)?.name ?? "Project unavailable"}</small></div>
      <button type="button" disabled={busy} aria-pressed={open?.id === proposal.id} aria-label={`Review ${proposal.kind} ${proposal.name}`} onClick={() => open?.id === proposal.id ? setOpen(null) :
        run(async () => { const content = await sdk.capabilities.proposal(proposal.id); setOpen({ id: proposal.id, content: content.content, digest: content.digest }); setReviewed(false); })}>
        {open?.id === proposal.id ? "Hide" : "Review"}</button>
      {open?.id === proposal.id && <div className="capability-proposal-review">
        <pre>{open.content}</pre>
        <label className="check-setting"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this content. Approving it doesn't let it run.</label>
        <div className="button-row"><button type="button" className="primary" disabled={busy || !reviewed} onClick={() => decide(true)}>Approve disabled</button>
          <button type="button" disabled={busy} onClick={() => decide(false)}>Reject</button></div>
      </div>}
    </li>)}</ul>
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
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{data && <><p><strong>{project?.name ?? (data.proposal.projectId ? data.proposal.projectId : "Global")} / {data.proposal.section}</strong></p>{project && <p className="fine-print path">{project.path}</p>}<p>{data.proposal.reason}</p><details open><summary>Current base</summary><pre>{text(data.before)}</pre></details><details open><summary>Proposed value</summary><pre>{text(data.spec.value)}</pre></details>
      {data.proposal.evidence.length > 0 && <details><summary>Verified source references</summary>{data.proposal.evidence.map((source) => <article key={source.messageId}><strong>{source.title}</strong><pre>{source.text}</pre></article>)}</details>}
      <Alert as="p" tone="warning" className="settings-warning">{data.warning}</Alert><label className="check-setting"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this exact scope and change, and approve the configuration risk.</label>
      <footer><button disabled={busy} onClick={() => void decide(false)}>Reject</button><button className="primary" disabled={!confirmed || busy} onClick={() => void decide(true)}>{data.proposal.target === "skill" ? "Install disabled skill" : data.proposal.target === "repo-instructions" ? "Write instructions locally" : "Apply"}</button></footer>
    </>}
  </dialog>;
}
export function AttentionPanel({ sdk, snapshot, chooseSession, chooseWork }: { sdk: MoguriSdk; snapshot: Snapshot; chooseSession: (id: string) => Promise<void>; chooseWork?: (id: string) => void }) {
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<AttentionFilters>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), owner = useRef(sdk); owner.current = sdk;
  const active = inboxAttention(snapshot.attention);
  const filtered = filterInboxAttention(snapshot, filters);
  const scriptSessions = new Set<string | null>();
  const visible = filtered.filter((entry) => {
    if (entry.reason !== "script-review") return true;
    if (scriptSessions.has(entry.sessionId)) return false;
    scriptSessions.add(entry.sessionId); return true;
  });
  useEffect(() => { setError(""); setDeleting(null); setFilters({}); }, [sdk]);
  const read = async (ids: string[]) => {
    setError("");
    try { for (let offset = 0; offset < ids.length; offset += 100) await sdk.attention.acknowledge(ids.slice(offset, offset + 100)); }
    catch (error) { if (owner.current === sdk) setError(error instanceof Error ? error.message : "Read acknowledgement failed."); }
  };
  const remove = async (ids: string[], button: HTMLButtonElement) => {
    const buttons = [...container.current?.querySelectorAll<HTMLButtonElement>("[data-delete-notification]") ?? []];
    const index = buttons.indexOf(button), focused = document.activeElement === button;
    setError(""); setDeleting(ids[0]!);
    try {
      for (let offset = 0; offset < ids.length; offset += 100) await sdk.attention.delete(ids.slice(offset, offset + 100));
      requestAnimationFrame(() => {
        if (!focused || owner.current !== sdk || !container.current?.isConnected) return;
        const remaining = container.current.querySelectorAll<HTMLButtonElement>("[data-delete-notification]");
        const next = remaining[Math.min(index, remaining.length - 1)];
        (next ?? heading.current)?.focus();
      });
    } catch (error) { if (owner.current === sdk) setError(error instanceof Error ? error.message : "The notification was not deleted. Refresh Inbox."); }
    finally { if (owner.current === sdk) setDeleting(null); }
  };
  return <section ref={container} aria-label="Inbox notifications"><h2 ref={heading} tabIndex={-1}>Needs your attention</h2>
    <div className="inbox-filter-controls" aria-label="Notification filters">
      <label className="setting-field">Search<input type="search" aria-label="Search notifications" maxLength={200} value={filters.query ?? ""}
        placeholder="Search notifications" onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
      <label className="setting-field">Type<select aria-label="Notification type" value={filters.type ?? "all"}
        onChange={(event) => setFilters(parse(AttentionFiltersSchema, { ...filters, type: event.target.value }))}>
        <option value="all">All types</option>{Object.entries(attentionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <label className="setting-field">Read state<select aria-label="Notification read state" value={filters.state ?? "all"}
        onChange={(event) => setFilters(parse(AttentionFiltersSchema, { ...filters, state: event.target.value }))}>
        <option value="all">All notifications</option><option value="unread">Unread</option><option value="read">Read</option>
      </select></label>
      <button type="button" className="quiet" onClick={() => setFilters({})}>Clear filters</button>
    </div>
    <p className="fine-print" role="status">{filtered.length} of {active.length} notifications</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{!active.length ? <p className="fine-print">No notifications. Questions, approvals and completed work appear here. Reading or deleting never answers or approves.</p> :
      !filtered.length && <p className="fine-print">No matching notifications. Clear the filters to see all pending work.</p>}
    {visible.map((entry) => {
      const session = snapshot.sessions.find((session) => session.id === entry.sessionId);
      const group = entry.reason === "script-review" ? filtered.filter((other) => other.reason === "script-review" && other.sessionId === entry.sessionId) : [entry];
      const ids = group.map((other) => other.id);
      const operation = entry.reason === "ci" ? snapshot.githubOperations.find((operation) => operation.id === entry.messageId) : undefined;
      const work = entry.myWork ? snapshot.myWorkRefreshes.find((refresh) => refresh.id === entry.myWork?.refreshId)?.attention.find((value) => value.itemId === entry.messageId) : undefined;
      return <article className={`attention-item ${group.every((other) => other.acknowledged) ? "read" : "unread"}`} key={entry.reason === "script-review" ? `scripts:${entry.sessionId}` : entry.id}><Icon name={entry.kind === "question" ? "Question" : entry.kind === "done" ? "Waiting" : "Attention"} />
        <div><button className="quiet" disabled={work ? !chooseWork : !session} onClick={() => {
          if (work) chooseWork?.(work.itemId); else if (entry.sessionId) void chooseSession(entry.sessionId);
        }}>{work ? `${work.repository}#${work.number}` : session?.title ?? "Session removed"}</button>
          {entry.reason === "script-review" && session ? <ScriptReviewsPanel sdk={sdk} session={session} snapshot={snapshot}
            reviewIds={group.flatMap((other) => other.messageId ? [other.messageId] : [])} onReviewed={() => requestAnimationFrame(() => {
              if (owner.current !== sdk) return;
              (container.current?.querySelector<HTMLButtonElement>(".script-reviews button") ?? heading.current)?.focus();
            })} /> : <p>{attentionDescription(entry, snapshot)}</p>}
          {operation?.ci && <button type="button" className="quiet" onClick={() => {
            const target = operation.ci!.target;
            void window.moguri.openExternal(`https://github.com/${target.repository}/pull/${target.number}`)
              .catch((error: unknown) => setError(error instanceof Error ? error.message : "The original PR link could not be opened."));
          }}>Open original PR</button>}
          <small>{new Date(entry.createdAt).toLocaleString()}</small>
        </div>{group.some((other) => !other.acknowledged) && <button className="icon-button" aria-label={`Mark attention read ${entry.id}`} title="Mark read, not resolved" onClick={() => void read(ids)}><Icon name="Check" /></button>}
        <button type="button" className="icon-button" data-delete-notification={entry.id} disabled={deleting !== null} aria-label="Delete notification" title="Delete notification"
          onClick={(event) => void remove(ids, event.currentTarget)}><Icon name="Trash" /></button>
      </article>;
    })}
  </section>;
}
