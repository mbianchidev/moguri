import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, RepositoryObservation, RepositoryPreview, Snapshot } from "../../../packages/sdk/src/index.ts";
import { envLabel, sessionTitle } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";

interface View { sdk: MoguriSdk; key: string; preview: RepositoryPreview | null; observation: RepositoryObservation | null; pending: boolean; error: string; jobId: string | null }
export function RepositoryMetadata({ sdk, snapshot }: { sdk: MoguriSdk; snapshot: Snapshot }) {
  const [sessionId, setSessionId] = useState(""), [view, setView] = useState<View | null>(null);
  const session = snapshot.sessions.find((session) => session.id === sessionId && session.projectId !== null);
  const configuration = snapshot.projectConfigurations.find((configuration) => configuration.projectId === session?.projectId);
  const key = JSON.stringify([sdk.profileId, session?.id, session?.controls.env, session?.workspaceId, configuration?.revision, snapshot.settings.revision, snapshot.policy.revision]);
  const current = useRef({ sdk, key }); current.current = { sdk, key };
  const visible = view?.sdk === sdk && view.key === key ? view : null;
  const job = visible?.jobId ? snapshot.jobs.find((job) => job.id === visible.jobId) : undefined;
  const jobs = session ? snapshot.jobs.filter((job) => job.kind === "repository.refresh" && job.sessionId === session.id).slice(-5).reverse() : [];
  const observations = snapshot.repositoryObservations.filter((observation) => observation.projectId === session?.projectId && observation.workspaceId === session?.workspaceId && observation.env === session?.controls.env).map((observation) => `${observation.id}:${observation.revision}:${observation.status}`).join("|");
  const owned = (owner: { sdk: MoguriSdk; key: string }) => current.current.sdk === owner.sdk && current.current.key === owner.key;
  const errorText = (error: unknown) => error instanceof Error ? error.message : "Repository metadata is unavailable. No identity or visibility was guessed.";
  const preview = async () => {
    if (!session) return;
    const owner = { sdk, key };
    setView({ ...owner, preview: null, observation: null, pending: true, error: "", jobId: null });
    try {
      const [result, state] = await Promise.all([sdk.repositories.preview(session.id), sdk.repositories.state(session.id)]);
      if (owned(owner)) setView({ ...owner, preview: result.preview, observation: state.observation, pending: false, error: "", jobId: null });
    } catch (error) { if (owned(owner)) setView({ ...owner, preview: null, observation: null, pending: false, error: errorText(error), jobId: null }); }
  };
  const refresh = async () => {
    if (!visible?.preview || !session) return;
    const captured = visible, owner = { sdk, key };
    setView({ ...captured, pending: true, error: "" });
    try {
      const result = await sdk.repositories.refresh(session.id, captured.preview!.bindingDigest, captured.preview!.revision, true);
      if (owned(owner)) setView({ ...captured, preview: null, pending: false, error: "", jobId: result.id ?? null });
    } catch (error) { if (owned(owner)) setView({ ...captured, pending: false, error: errorText(error) }); }
  };
  const clear = async () => {
    if (!session || !visible?.observation) return;
    const captured = visible, owner = { sdk, key };
    setView({ ...captured, pending: true, error: "" });
    try {
      await sdk.repositories.clear(session.id, captured.observation!.revision, true);
      if (owned(owner)) setView({ ...captured, preview: null, observation: null, pending: false, jobId: null, error: "" });
    } catch (error) { if (owned(owner)) setView({ ...captured, pending: false, error: errorText(error) }); }
  };
  const stop = async (id: string) => {
    const owner = { sdk, key };
    try { await sdk.jobs.cancel(id); }
    catch (error) { if (owned(owner)) setView((view) => view && view.sdk === sdk && view.key === key ? { ...view, error: errorText(error) } : { ...owner, preview: null, observation: null, pending: false, error: errorText(error), jobId: id }); }
  };
  useEffect(() => {
    if (!session || !visible || visible.pending || job && ["running", "waiting_input"].includes(job.status)) return;
    let active = true;
    const owner = { sdk, key };
    void sdk.repositories.state(session.id).then((result) => {
      if (active && owned(owner)) setView((view) => view && view.sdk === sdk && view.key === key ? { ...view, observation: result.observation } : view);
    }).catch((error: unknown) => { if (active && owned(owner)) setView((view) => view && view.sdk === sdk && view.key === key ? { ...view, error: errorText(error) } : view); });
    return () => { active = false; };
  }, [sdk, key, job?.id, job?.status, observations, visible?.pending]);
  return <details><summary>Repository attribution</summary><section aria-label="Repository attribution" aria-busy={visible?.pending ?? false}>
    <p className="fine-print">Optional, explicit metadata lookup. Review the actual bound root first; no GitHub request or model call runs just by opening this section. Stored facts label future admitted work, never old calls.</p>
    <label className="setting-field">Bound session<select aria-label="Repository scope session" value={session?.id ?? ""} onChange={(event) => setSessionId(event.target.value)}><option value="">Choose an explicit project session</option>{snapshot.sessions.filter((session) => session.projectId !== null).map((session) => <option key={session.id} value={session.id}>{sessionTitle(session)} / {envLabel(session.controls.env)}</option>)}</select></label>
    <button type="button" disabled={!session || visible?.pending || session.controls.env === "Sandbox"} onClick={() => void preview()}>Review repository binding</button>
    {visible?.pending && <p role="status">Checking this exact repository scope...</p>}{visible?.error && <Alert as="p" className="inline-error" role="alert">{visible.error}</Alert>}
    {visible?.preview && <><dl className="facts"><dt>Observed upstream</dt><dd>{visible.preview.repository}</dd><dt>Actual root</dt><dd className="path">{visible.preview.root}</dd><dt>Execution boundary</dt><dd>{visible.preview.env === "Remote" ? "Pinned SSH root" : "Local host"}</dd><dt>Metadata lookup</dt><dd>{visible.preview.lookupBoundary === "control-plane-public" ? "Public GitHub API from control plane; no credential" : visible.preview.lookupBoundary === "remote-gh-cli" ? "GitHub CLI account on captured SSH host" : "GitHub CLI account on this host"}</dd>
      {visible.preview.remote && <><dt>Captured SSH host</dt><dd>{visible.preview.remote.user}@{visible.preview.remote.host}:{visible.preview.remote.port}</dd><dt>Pinned host key</dt><dd>{visible.preview.remote.hostFingerprint}</dd></>}
    </dl>
      <p className="fine-print">Refresh sends this repository identity to GitHub using the displayed access. It enables future bound-root Git identity checks for attribution, not execution permissions, model input or background API polling. Remote host roots never use a host-local Git/CLI fallback.</p>
      <button type="button" disabled={visible.pending || jobs.some((job) => ["running", "waiting_input"].includes(job.status))} onClick={() => void refresh()}>Refresh verified metadata</button>
    </>}
    {visible?.observation?.repository && <><h3>Stored observation</h3><dl className="facts"><dt>Repository</dt><dd>{visible.observation.repository.fullName}</dd><dt>Owner kind</dt><dd>{visible.observation.repository.ownerKind}</dd><dt>Visibility as observed</dt><dd>{visible.observation.repository.visibility}</dd><dt>Detected license</dt><dd>{visible.observation.repository.licenseId ?? "Unknown"}</dd><dt>Public + OSI license</dt><dd>{visible.observation.repository.publicOsiLicensed === null ? "Unverified" : visible.observation.repository.publicOsiLicensed ? "Observed" : "Not observed"}</dd><dt>Observed at</dt><dd>{visible.observation.repository.observedAt}</dd>
      {visible.observation.remote && <><dt>Observation SSH host</dt><dd>{visible.observation.remote.user}@{visible.observation.remote.host}:{visible.observation.remote.port}</dd><dt>Observation SSH root</dt><dd className="path">{visible.observation.remote.root}</dd><dt>Observation host key</dt><dd>{visible.observation.remote.hostFingerprint}</dd></>}
    </dl>
      <p className="fine-print">Detected license metadata, not a legal/compliance review. Changes require another explicit refresh. Every admitted step rechecks its real Git origin; stale roots stay unassigned. Clearing affects future attribution only; historical names, visibility and charges remain retained.</p>
      {visible.preview && visible.preview.repository !== visible.observation.repository.url && <Alert as="p" tone="warning" className="settings-warning">This stored repository differs from the current upstream. It will not label new calls.</Alert>}
      <button type="button" disabled={visible.pending || jobs.some((job) => ["running", "waiting_input"].includes(job.status))} onClick={() => void clear()}>Clear future attribution</button>
    </>}
    {jobs.map((job) => <div className="call-record" key={job.id}><strong>Metadata refresh / {job.status}</strong>{job.error && <Alert as="p" className="inline-error">{job.error}</Alert>}<small>{job.id}</small>{["running", "waiting_input"].includes(job.status) && <button type="button" onClick={() => void stop(job.id)}>Stop this refresh</button>}</div>)}
  </section></details>;
}
