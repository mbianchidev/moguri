import { useEffect, useRef, useState } from "react";
import type { MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { GitHubRepositoryPicker } from "./GitHubPickers.tsx";
import { PolicyHint } from "./PolicyHint.tsx";
import { Alert } from "./Alert.tsx";

export function StartDialog({ sdk, snapshot, start, close, modal, openRepositories }: {
  sdk: MoguriSdk; snapshot: Snapshot; start: (projectId: string | null) => Promise<void>; close: () => void; modal: (open: boolean) => void;
  /** Opens Settings > Repositories, where workspace folders are added. */
  openRepositories?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), opening = useRef<string | null>(null);
  const [mode, setMode] = useState<"choose" | "clone">("choose"), [search, setSearch] = useState("");
  const [repository, setRepository] = useState(""), [parent, setParent] = useState(""), [folder, setFolder] = useState("");
  const [jobId, setJobId] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const job = snapshot.jobs.find((job) => job.id === jobId), cloning = job?.status === "running" || job?.status === "waiting_input";
  const localAllowed = snapshot.policy.allowedEnvs.includes("Local");
  const destination = parent && folder ? `${parent.replace(/\/$/, "")}/${folder}` : "";
  const projects = snapshot.projects.filter((project) => `${project.name} ${project.path}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  useEffect(() => {
    const element = dialog.current; element?.showModal(); modal(true);
    return () => { if (element?.open) element.close(); modal(false); };
  }, [modal]);
  useEffect(() => { dialog.current?.querySelector<HTMLInputElement>(mode === "clone" ? '[aria-label="Repository URL"]' : '[aria-label="Find a project"]')?.focus(); }, [mode]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Starting this chat failed. Existing work and files were preserved."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!job || job.status !== "completed" || !job.projectClone || opening.current === job.id) return;
    const project = snapshot.projects.find((project) => project.id === job.projectClone?.projectId && project.path === job.projectClone.path);
    if (!project) { setError("The clone finished without its exact registered project. Inspect the original job and destination; nothing was retried."); return; }
    opening.current = job.id;
    void run(() => start(project.id));
  }, [job?.status, job?.id, snapshot.projects]);
  return <dialog ref={dialog} className="workspace-dialog start-dialog" aria-label="New" onClose={close} onCancel={(event) => { if (busy || cloning) event.preventDefault(); }}>
    <header><h2>{mode === "clone" ? "Clone repository" : "New"}</h2><button type="button" className="icon-button" aria-label="Close New" disabled={busy || cloning} onClick={close}><Icon name="Close" /></button></header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {mode === "choose" ? <>
      <button type="button" className="start-option" disabled={busy} onClick={() => void run(() => start(null))}><Icon name="Side chat" /><span><strong>New chat</strong><small>No project or workspace access</small></span></button>
      <label className="setting-field">Project<input aria-label="Find a project" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a project" /></label>
      <div className="start-projects" aria-label="Existing projects">{projects.map((project) => <button type="button" className="start-option" key={project.id} disabled={busy} onClick={() => void run(() => start(project.id))}><Icon name="Files" /><span><strong>{project.name}</strong><small>{project.path}</small></span></button>)}
        {!projects.length && <p className="fine-print">{snapshot.projects.length ? "No matching project." : "Add a workspace folder, import a folder or clone a repository to start coding."}</p>}</div>
      <footer><button type="button" disabled={busy} onClick={() => void run(async () => {
        const path = await window.moguri.chooseProject("import");
        if (!path) return;
        const project = await sdk.projects.add(path);
        if (!project.id) throw new Error("The selected folder was not registered. No chat was created.");
        await start(project.id);
      })}><Icon name="Files" />Import local folder</button>{openRepositories && <button type="button" disabled={busy} onClick={openRepositories}><Icon name="Group" />Add workspace folder</button>}<button type="button" disabled={busy || !localAllowed} title={localAllowed ? undefined : "Local cloning is blocked by execution policy"} onClick={() => { setMode("clone"); setError(""); }}><Icon name="PR" />Clone repository</button>
        {!localAllowed && <PolicyHint label="Why cloning is unavailable" target="environments" beforeNavigate={close} navigationBlocked={busy || cloning ? "Finish or cancel the current owned action before leaving this dialog." : undefined}>Cloning runs on this Local host, which global execution policy excludes. Opening policy does not clone, authenticate or grant Local execution.</PolicyHint>}
      </footer>
    </> : <form onSubmit={(event) => {
      event.preventDefault();
      if (busy || cloning || jobId) return;
      void run(async () => {
        if (!parent || !folder.trim() || folder !== folder.trim() || /[/\\\0\r\n]/.test(folder) || [".", ".."].includes(folder)) throw new Error("Choose a parent folder and a new folder name without path separators.");
        const result = await sdk.projects.clone(repository, destination, true);
        if (!result.id) throw new Error("Clone intent was not acknowledged. Inspect jobs before retrying.");
        setJobId(result.id);
      });
    }}>
      <p className="fine-print">Clone into a new Local folder, then start a chat. No hooks, filters, submodules, model calls or automatic login. SSH uses your existing keys and known-hosts verification.</p>
      <GitHubRepositoryPicker sdk={sdk} selected={repository} disabled={busy || Boolean(jobId)} choose={(value) => { setRepository(value.sshUrl); if (!folder) setFolder(value.fullName.split("/")[1]!); }} />
      <label className="setting-field">Repository URL<input aria-label="Repository URL" placeholder="https://github.com/owner/repository.git" value={repository} disabled={busy || Boolean(jobId)} onChange={(event) => setRepository(event.target.value)} /></label>
      <label className="setting-field">Parent folder<input aria-label="Clone parent folder" value={parent} readOnly /></label>
      <button type="button" disabled={busy || Boolean(jobId)} onClick={() => void run(async () => { const path = await window.moguri.chooseProject("clone"); if (path) setParent(path); })}>Choose clone folder</button>
      <label className="setting-field">New folder name<input aria-label="New clone folder name" value={folder} disabled={busy || Boolean(jobId)} onChange={(event) => setFolder(event.target.value)} /></label>
      {destination && <p className="fine-print path">{destination}</p>}
      {job && <section className="clone-status" aria-label="Repository clone status"><p role="status">{job.status}: {job.error ?? job.progress}</p>{cloning && <><progress aria-label="Cloning repository" /><button type="button" onClick={() => void run(() => sdk.jobs.cancel(job.id).then(() => {}))} disabled={busy}>Cancel clone</button></>}</section>}
      <footer><button type="button" disabled={busy || cloning} onClick={() => { setMode("choose"); setJobId(null); setError(""); }}>Back</button>
        {job?.status === "completed" && job.projectClone ? <button type="button" disabled={busy} onClick={() => void run(() => start(job.projectClone!.projectId))}>Start cloned project</button> :
          <button className="primary" type="submit" disabled={busy || Boolean(jobId) || !localAllowed || !repository || !destination}>Clone and start</button>}</footer>
    </form>}
  </dialog>;
}
