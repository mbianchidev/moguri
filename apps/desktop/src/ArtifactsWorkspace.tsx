import { useEffect, useMemo, useState } from "react";
import { messageLinks, sessionTitle, type ArtifactFile, type ArtifactLibrary, type Attachment, type MoguriSdk, type RetainedArtifact, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";
import { ContextImage } from "./ContextAttachments.tsx";
import type { SettingsTab } from "./SettingsPanel.tsx";

const filters = [
  { id: "all", label: "All" }, { id: "builds", label: "Builds and installers" }, { id: "documents", label: "Documents" },
  { id: "images", label: "Images" }, { id: "media", label: "Media" }, { id: "links", label: "Links" }, { id: "notes", label: "Saved notes" },
] as const;
type Filter = typeof filters[number]["id"];
type Item = { key: string; sessionId: string | null; name: string; detail: string; when: string; filter: Exclude<Filter, "all">; icon: string } & (
  | { type: "file"; file: ArtifactFile }
  | { type: "image"; attachment: Attachment & { kind: "image" } }
  | { type: "link"; url: string }
  | { type: "note"; artifact: RetainedArtifact });
const PAGE = 100;
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
const fileFilter = (file: ArtifactFile): Item["filter"] => file.kind === "installer" || file.kind === "archive" ? "builds" : file.kind === "image" ? "images" : file.kind === "media" ? "media" : "documents";
const fileIcon = (file: ArtifactFile) => file.kind === "installer" || file.kind === "archive" ? "Box" : file.kind === "image" ? "Image" : file.kind === "media" ? "Play" : "File";

/** Every artifact of one project (or of project-free chats) in one place, each linked to the session that produced it when known. */
export function ArtifactsWorkspace({ sdk, snapshot, initialProjectId, openSession, openSettings }: {
  /** The project to show first; null for project-free chats, undefined for no preference. */
  sdk: MoguriSdk; snapshot: Snapshot; initialProjectId: string | null | undefined; openSession: (id: string) => Promise<void>; openSettings: (tab: SettingsTab) => void;
}) {
  const projects = snapshot.projects.slice().sort((a, b) => a.name.localeCompare(b.name));
  const [scope, setScope] = useState<string>(initialProjectId === undefined ? projects[0]?.id ?? "" : initialProjectId ?? ""), projectId = scope || null;
  const [library, setLibrary] = useState<ArtifactLibrary | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(PAGE), [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set()), [confirming, setConfirming] = useState<Item[] | null>(null), [deleting, setDeleting] = useState(false);
  const project = snapshot.projects.find((value) => value.id === projectId);
  /** Saved notes and files outside a workspace folder's own read-only checkout can be deleted; chat images and links are conversation history. */
  const deletable = (item: Item) => item.type === "note" || item.type === "file" && !(project?.workspaceFolderId && item.file.root === project.path);
  useEffect(() => { if (scope && !snapshot.projects.some((project) => project.id === scope)) setScope(""); }, [scope, snapshot.projects]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setLibrary(null);
    void sdk.artifacts.library(projectId).then((value) => { if (active) setLibrary(value); })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Output files couldn't be listed. Other artifacts are still shown."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sdk, projectId, revision]);
  useEffect(() => { setLimit(PAGE); setPreview(null); setNotice(""); setSelected(new Set()); setConfirming(null); }, [projectId, filter, query]);
  const items = useMemo(() => {
    const sessions = snapshot.sessions.filter((session) => session.projectId === projectId && session.kind !== "subagent");
    const result: Item[] = [], links = new Map<string, Item>();
    for (const file of library?.projectId === projectId ? library.files : []) {
      result.push({ key: `file:${file.path}`, type: "file", file, sessionId: file.sessionId, name: file.relativePath.split("/").at(-1) ?? file.relativePath,
        detail: `${file.relativePath} / ${file.kind === "installer" && file.bytes === 0 ? "app bundle" : size(file.bytes)}${file.origin === "agent" ? " / written by the agent" : ""}`,
        when: file.modifiedAt, filter: fileFilter(file), icon: fileIcon(file) });
    }
    for (const session of sessions) for (const message of session.messages) {
      for (const attachment of message.attachments ?? []) if (attachment.kind === "image") result.push({ key: `image:${session.id}:${attachment.id}`, type: "image", attachment,
        sessionId: session.id, name: attachment.path, detail: `${attachment.width} × ${attachment.height} PNG / ${message.role === "user" ? "attached by you" : "from the agent"}`,
        when: message.timestamp, filter: "images", icon: "Image" });
      if (message.role !== "user" && message.role !== "assistant") continue;
      for (const url of messageLinks(message.text)) {
        const previous = links.get(url);
        if (previous && previous.when >= message.timestamp) continue;
        let host = url;
        try { host = new URL(url).host; } catch { /* messageLinks only returns parseable URLs */ }
        links.set(url, { key: `link:${url}`, type: "link", url, sessionId: session.id, name: url, detail: host, when: message.timestamp, filter: "links", icon: "Globe" });
      }
    }
    result.push(...links.values());
    for (const artifact of snapshot.artifacts.filter((value) => value.projectId === projectId && value.status === "active")) result.push({ key: `note:${artifact.id}`, type: "note", artifact,
      sessionId: artifact.originSessionId, name: artifact.name, detail: `${artifact.kind} / saved note`, when: artifact.updatedAt, filter: "notes", icon: "Artifacts" });
    return result.sort((a, b) => b.when.localeCompare(a.when) || a.key.localeCompare(b.key));
  }, [library, projectId, snapshot.sessions, snapshot.artifacts]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = items.filter((item) => (filter === "all" || item.filter === filter) && terms.every((term) => {
    const session = snapshot.sessions.find((value) => value.id === item.sessionId);
    return `${item.name} ${item.detail} ${session ? sessionTitle(session) : ""}`.toLowerCase().includes(term);
  }));
  const counts = Object.fromEntries(filters.map(({ id }) => [id, id === "all" ? items.length : items.filter((item) => item.filter === id).length]));
  const shown = visible.slice(0, limit), removable = shown.filter(deletable), chosen = removable.filter((item) => selected.has(item.key));
  const toggle = (key: string, on: boolean) => setSelected((current) => { const next = new Set(current); if (on) next.add(key); else next.delete(key); return next; });
  const remove = async (targets: Item[]) => {
    setDeleting(true); setError(""); setNotice("");
    const failures: string[] = [];
    let trashed = 0, deleted = 0;
    try {
      const files = targets.flatMap((item) => item.type === "file" ? [item] : []);
      if (files.length) for (const result of await window.moguri.trashArtifacts(sdk.profileId, projectId, files.map((item) => item.file.path))) {
        if (result.trashed) trashed++;
        else failures.push(`${files.find((item) => item.file.path === result.path)?.name ?? result.path}: ${result.error ?? "not moved"}`);
      }
      for (const item of targets) if (item.type === "note") {
        try { await sdk.artifacts.delete(item.artifact.id, item.artifact.revision, true); deleted++; }
        catch (failure) { failures.push(`${item.name}: ${failure instanceof Error ? failure.message : "not deleted"}`); }
      }
    } catch (failure) { failures.push(failure instanceof Error ? failure.message : "The delete couldn't finish."); }
    finally {
      setDeleting(false); setConfirming(null); setSelected(new Set()); setRevision((value) => value + 1);
      const done = [trashed ? `Moved ${trashed} ${trashed === 1 ? "file" : "files"} to the Trash.` : "", deleted ? `Deleted ${deleted} saved ${deleted === 1 ? "note" : "notes"}.` : ""].filter(Boolean).join(" ");
      if (done) setNotice(done);
      if (failures.length) setError(`${failures.length === targets.length ? "Nothing was deleted." : "Some artifacts weren't deleted."} ${failures.join(" ")}`);
    }
  };
  const confirmFiles = confirming?.filter((item) => item.type === "file").length ?? 0, confirmNotes = (confirming?.length ?? 0) - confirmFiles;
  const reveal = async (file: ArtifactFile) => {
    setError(""); setNotice("");
    try {
      const result = await window.moguri.revealArtifact(sdk.profileId, projectId, file.path);
      if (!result.revealed) setNotice(`Located ${result.path}.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The file couldn't be shown in Finder."); }
  };
  return <section className="artifacts-workspace" aria-label="Artifacts library" data-project-id={projectId ?? ""}>
    <header className="artifacts-toolbar">
      <label className="setting-field">Project<select aria-label="Artifacts project" value={scope} onChange={(event) => setScope(event.target.value)}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}<option value="">Chats without a project</option>
      </select></label>
      <label className="setting-field">Search<input type="search" aria-label="Search artifacts" maxLength={200} value={query} placeholder="Name, path or chat" onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="button" className="icon-button" aria-label="Refresh artifacts" title="Refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="Refresh" /></button>
    </header>
    <div className="artifact-filters" role="group" aria-label="Artifact types">{filters.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id}
      onClick={() => setFilter(id)}>{label}<span aria-hidden="true">{counts[id]}</span><span className="sr-only">, {counts[id]} items</span></button>)}</div>
    <p className="fine-print">Build outputs come from dist, out, build, release and similar folders in the project and its sessions' worktrees. Moguri reads only file names, sizes and dates; revealing a file in Finder never opens or runs it.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <p className="fine-print" role="status">{notice}</p>}
    {loading && <p className="fine-print" role="status">Looking for output files...</p>}
    {library?.truncated && <p className="fine-print">Some folders were too large to list completely. The newest files found are shown.</p>}
    {library?.roots.filter((root) => root.status === "missing").map((root) => <p className="fine-print" key={root.path}>{root.path}: {root.diagnostic}</p>)}
    {removable.length > 0 && <div className="artifact-selection" role="group" aria-label="Selected artifacts">
      <button type="button" disabled={deleting} onClick={() => setSelected(chosen.length === removable.length ? new Set() : new Set(removable.map((item) => item.key)))}>
        {chosen.length === removable.length ? "Clear selection" : "Select all shown"}</button>
      <button type="button" className="danger" disabled={!chosen.length || deleting || Boolean(confirming)} onClick={() => setConfirming(chosen)}>Delete selected ({chosen.length})</button>
    </div>}
    {confirming && <section className="artifact-confirm" role="alertdialog" aria-label="Confirm artifact deletion">
      <p>{[confirmFiles ? `Move ${confirmFiles} ${confirmFiles === 1 ? "file" : "files"} to the Trash` : "", confirmNotes ? `delete ${confirmNotes} saved ${confirmNotes === 1 ? "note" : "notes"}` : ""].filter(Boolean).join(" and ").replace(/^./, (first) => first.toUpperCase())}?</p>
      <ul>{confirming.map((item) => <li key={item.key} className="path">{item.type === "file" ? item.file.relativePath : item.name}</li>)}</ul>
      <p className="fine-print">{confirmFiles ? "Files can be restored from the Trash. " : ""}{confirmNotes ? "Saved notes and their revisions can't be restored. Chats and other copies aren't changed." : "Chats aren't changed."}</p>
      <div className="button-row"><button type="button" className="danger" disabled={deleting} onClick={() => void remove(confirming)}>{deleting ? "Deleting..." : "Delete"}</button>
        <button type="button" disabled={deleting} onClick={() => setConfirming(null)}>Cancel</button></div>
    </section>}
    {!loading && !visible.length && <p className="artifacts-empty">{items.length ? "No artifacts match these filters." : "No artifacts yet. Builds, files the agent writes, images, links and saved notes from this project's chats appear here."}</p>}
    <ul className="artifact-list">{shown.map((item) => {
      const session = snapshot.sessions.find((value) => value.id === item.sessionId);
      return <li className="artifact-item" key={item.key} data-artifact-type={item.type}>
        {deletable(item) ? <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.key)} disabled={deleting} onChange={(event) => toggle(item.key, event.target.checked)} /> :
          <span className="artifact-select-placeholder" aria-hidden="true" />}<Icon name={item.icon} />
        <div className="artifact-item-body"><strong title={item.name}>{item.name}</strong><small className="path">{item.detail}</small>
          <small>{session ? <button type="button" className="quiet" onClick={() => void openSession(session.id)}>{sessionTitle(session)}</button> :
            <span>{item.sessionId ? "Chat removed" : "No linked chat"}</span>} / <time dateTime={item.when}>{new Date(item.when).toLocaleString()}</time></small>
          {item.type === "image" && preview === item.key && item.sessionId && <div className="artifact-preview"><ContextImage sdk={sdk} sessionId={item.sessionId} attachment={item.attachment} /></div>}</div>
        <div className="artifact-item-actions">
          {item.type === "file" && <button type="button" onClick={() => void reveal(item.file)}>Show in Finder</button>}
          {item.type === "image" && <button type="button" aria-expanded={preview === item.key} onClick={() => setPreview((value) => value === item.key ? null : item.key)}>{preview === item.key ? "Hide" : "Preview"}</button>}
          {item.type === "link" && <button type="button" onClick={() => void window.moguri.openExternal(item.url).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The link couldn't be opened."))}>Open link</button>}
          {item.type === "note" && <button type="button" onClick={() => openSettings("artifacts")}>Open in Settings</button>}
          {deletable(item) && <button type="button" className="danger" aria-label={item.type === "file" ? `Move ${item.name} to the Trash` : `Delete ${item.name}`}
            disabled={deleting || Boolean(confirming)} onClick={() => setConfirming([item])}>{item.type === "file" ? "Move to Trash" : "Delete"}</button>}
        </div>
      </li>;
    })}</ul>
    {visible.length > limit && <button type="button" onClick={() => setLimit((value) => value + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</button>}
  </section>;
}
