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
/** Item owner: a project ID, or null for project-free chats. */
type Item = { key: string; projectId: string | null; sessionId: string | null; name: string; detail: string; when: string; filter: Exclude<Filter, "all">; icon: string } & (
  | { type: "file"; file: ArtifactFile }
  | { type: "image"; attachment: Attachment & { kind: "image" } }
  | { type: "link"; url: string }
  | { type: "note"; artifact: RetainedArtifact });
const PAGE = 100;
/** Select values: "" lists every project plus project-free chats; project IDs are UUIDs, so the sentinel can't collide. */
const ALL = "", PROJECT_FREE = ":project-free";
/** Library scans run at most this many at a time so a profile with many projects doesn't push each scan past its service timeout. */
const SCANS = 4;
const TRASH_BATCH = 100;
const ownerLabel = (snapshot: Snapshot, id: string | null) => id === null ? "Chats without a project" : snapshot.projects.find((value) => value.id === id)?.name ?? "Removed project";
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
const fileFilter = (file: ArtifactFile): Item["filter"] => file.kind === "installer" || file.kind === "archive" ? "builds" : file.kind === "image" ? "images" : file.kind === "media" ? "media" : "documents";
const fileIcon = (file: ArtifactFile) => file.kind === "installer" || file.kind === "archive" ? "Box" : file.kind === "image" ? "Image" : file.kind === "media" ? "Play" : "File";

/** Every artifact of all projects, one project or project-free chats in one place, each linked to the session that produced it when known. */
export function ArtifactsWorkspace({ sdk, snapshot, initialProjectId, openSession, openSettings }: {
  /** The project to show first; null for project-free chats, undefined for all projects. */
  sdk: MoguriSdk; snapshot: Snapshot; initialProjectId: string | null | undefined; openSession: (id: string) => Promise<void>; openSettings: (tab: SettingsTab) => void;
}) {
  const projects = snapshot.projects.slice().sort((a, b) => a.name.localeCompare(b.name));
  const [scope, setScope] = useState<string>(initialProjectId === undefined ? ALL : initialProjectId ?? PROJECT_FREE);
  const all = scope === ALL, projectId = all || scope === PROJECT_FREE ? null : scope;
  const owners: (string | null)[] = all ? [...projects.map((value) => value.id), null] : [projectId], ownersKey = JSON.stringify(owners);
  const [library, setLibrary] = useState<{ key: string; values: ArtifactLibrary[] } | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(PAGE), [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set()), [confirming, setConfirming] = useState<Item[] | null>(null), [deleting, setDeleting] = useState(false);
  const projectOf = (id: string | null) => id === null ? undefined : snapshot.projects.find((value) => value.id === id);
  /** Saved notes and files outside a workspace folder's own read-only checkout can be deleted; chat images and links are conversation history. */
  const deletable = (item: Item) => {
    const owner = projectOf(item.projectId);
    return item.type === "note" || item.type === "file" && !(owner?.workspaceFolderId && item.file.root === owner.path);
  };
  useEffect(() => { if (!all && scope !== PROJECT_FREE && !snapshot.projects.some((project) => project.id === scope)) setScope(ALL); }, [all, scope, snapshot.projects]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setLibrary(null);
    const ids = JSON.parse(ownersKey) as (string | null)[], values: (ArtifactLibrary | undefined)[] = [], failures: (string | undefined)[] = [];
    let next = 0;
    const scan = async () => {
      while (active && next < ids.length) {
        const index = next++, id = ids[index]!;
        try { values[index] = await sdk.artifacts.library(id); }
        catch (failure) {
          const reason = failure instanceof Error ? failure.message : "Output files couldn't be listed.";
          console.error("Moguri artifact library:", id ?? "project-free", reason);
          failures[index] = ids.length > 1 ? `${ownerLabel(snapshot, id)}: ${reason}` : reason;
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(SCANS, ids.length) }, scan)).then(() => {
      if (!active) return;
      setLibrary({ key: ownersKey, values: values.filter((value) => value !== undefined) });
      const failed = failures.filter(Boolean);
      if (failed.length) setError(`${failed.join(" ")} Other artifacts are still shown.`);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sdk, ownersKey, revision]);
  useEffect(() => { setLimit(PAGE); setPreview(null); setNotice(""); setSelected(new Set()); setConfirming(null); }, [scope, filter, query]);
  const items = useMemo(() => {
    const inScope = (id: string | null) => all || id === projectId;
    const sessions = snapshot.sessions.filter((session) => inScope(session.projectId) && session.kind !== "subagent");
    const result: Item[] = [], links = new Map<string, Item>(), paths = new Set<string>();
    for (const value of library?.key === ownersKey ? library.values : []) for (const file of value.files) {
      // A file reachable from two projects (nested checkouts) is listed once, under the first project that found it.
      if (paths.has(file.path)) continue;
      paths.add(file.path);
      result.push({ key: `file:${file.path}`, type: "file", file, projectId: value.projectId, sessionId: file.sessionId, name: file.relativePath.split("/").at(-1) ?? file.relativePath,
        detail: `${file.relativePath} / ${file.kind === "installer" && file.bytes === 0 ? "app bundle" : size(file.bytes)}${file.origin === "agent" ? " / written by the agent" : ""}`,
        when: file.modifiedAt, filter: fileFilter(file), icon: fileIcon(file) });
    }
    for (const session of sessions) for (const message of session.messages) {
      for (const attachment of message.attachments ?? []) if (attachment.kind === "image") result.push({ key: `image:${session.id}:${attachment.id}`, type: "image", attachment,
        projectId: session.projectId, sessionId: session.id, name: attachment.path, detail: `${attachment.width} × ${attachment.height} PNG / ${message.role === "user" ? "attached by you" : "from the agent"}`,
        when: message.timestamp, filter: "images", icon: "Image" });
      if (message.role !== "user" && message.role !== "assistant") continue;
      for (const url of messageLinks(message.text)) {
        const previous = links.get(url);
        if (previous && previous.when >= message.timestamp) continue;
        let host = url;
        try { host = new URL(url).host; } catch { /* messageLinks only returns parseable URLs */ }
        links.set(url, { key: `link:${url}`, type: "link", url, projectId: session.projectId, sessionId: session.id, name: url, detail: host, when: message.timestamp, filter: "links", icon: "Globe" });
      }
    }
    result.push(...links.values());
    for (const artifact of snapshot.artifacts.filter((value) => inScope(value.projectId) && value.status === "active")) result.push({ key: `note:${artifact.id}`, type: "note", artifact,
      projectId: artifact.projectId, sessionId: artifact.originSessionId, name: artifact.name, detail: `${artifact.kind} / saved note`, when: artifact.updatedAt, filter: "notes", icon: "Artifacts" });
    return result.sort((a, b) => b.when.localeCompare(a.when) || a.key.localeCompare(b.key));
  }, [library, ownersKey, all, projectId, snapshot.sessions, snapshot.artifacts]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = items.filter((item) => (filter === "all" || item.filter === filter) && terms.every((term) => {
    const session = snapshot.sessions.find((value) => value.id === item.sessionId);
    return `${item.name} ${item.detail} ${session ? sessionTitle(session) : ""} ${all ? ownerLabel(snapshot, item.projectId) : ""}`.toLowerCase().includes(term);
  }));
  const counts = Object.fromEntries(filters.map(({ id }) => [id, id === "all" ? items.length : items.filter((item) => item.filter === id).length]));
  const shown = visible.slice(0, limit), removable = shown.filter(deletable), chosen = removable.filter((item) => selected.has(item.key));
  const toggle = (key: string, on: boolean) => setSelected((current) => { const next = new Set(current); if (on) next.add(key); else next.delete(key); return next; });
  const remove = async (targets: Item[]) => {
    setDeleting(true); setError(""); setNotice("");
    const failures: string[] = [];
    let trashed = 0, deleted = 0;
    try {
      // The Trash bridge re-checks each path against one owner's library, at most 100 paths per call.
      const files = targets.flatMap((item) => item.type === "file" ? [item] : []), batches = new Map<string | null, (typeof files)[]>();
      for (const item of files) {
        const batch = batches.get(item.projectId) ?? [];
        if (!batch.length || batch.at(-1)!.length >= TRASH_BATCH) batch.push([]);
        batch.at(-1)!.push(item);
        batches.set(item.projectId, batch);
      }
      for (const [owner, groups] of batches) for (const group of groups) {
        try {
          for (const result of await window.moguri.trashArtifacts(sdk.profileId, owner, group.map((item) => item.file.path))) {
            if (result.trashed) trashed++;
            else failures.push(`${group.find((item) => item.file.path === result.path)?.name ?? result.path}: ${result.error ?? "not moved"}`);
          }
        } catch (failure) { failures.push(`${group.length} ${group.length === 1 ? "file" : "files"} from ${ownerLabel(snapshot, owner)}: ${failure instanceof Error ? failure.message : "not moved"}`); }
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
      if (failures.length) setError(`${trashed + deleted === 0 ? "Nothing was deleted." : "Some artifacts weren't deleted."} ${failures.join(" ")}`);
    }
  };
  const confirmFiles = confirming?.filter((item) => item.type === "file").length ?? 0, confirmNotes = (confirming?.length ?? 0) - confirmFiles;
  const reveal = async (item: Item & { type: "file" }) => {
    setError(""); setNotice("");
    try {
      const result = await window.moguri.revealArtifact(sdk.profileId, item.projectId, item.file.path);
      if (!result.revealed) setNotice(`Located ${result.path}.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The file couldn't be shown in Finder."); }
  };
  const libraries = library?.key === ownersKey ? library.values : [];
  return <section className="artifacts-workspace" aria-label="Artifacts library" data-scope={all ? "all" : projectId ?? "project-free"}>
    <header className="artifacts-toolbar">
      <label className="setting-field">Project<select aria-label="Artifacts project" value={scope} onChange={(event) => setScope(event.target.value)}>
        <option value={ALL}>All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}<option value={PROJECT_FREE}>Chats without a project</option>
      </select></label>
      <label className="setting-field">Search<input type="search" aria-label="Search artifacts" maxLength={200} value={query} placeholder={all ? "Name, path, chat or project" : "Name, path or chat"} onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="button" className="icon-button" aria-label="Refresh artifacts" title="Refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="Refresh" /></button>
    </header>
    <div className="artifact-filters" role="group" aria-label="Artifact types">{filters.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id}
      onClick={() => setFilter(id)}>{label}<span aria-hidden="true">{counts[id]}</span><span className="sr-only">, {counts[id]} items</span></button>)}</div>
    <p className="fine-print">Build outputs come from dist, out, build, release and similar folders in {all ? "each project" : "the project"} and its sessions' worktrees. Moguri reads only file names, sizes and dates; revealing a file in Finder never opens or runs it.</p>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}{notice && <p className="fine-print" role="status">{notice}</p>}
    {loading && <p className="fine-print" role="status">Looking for output files...</p>}
    {libraries.some((value) => value.truncated) && <p className="fine-print">Some folders were too large to list completely. The newest files found are shown.</p>}
    {libraries.flatMap((value) => value.roots.filter((root) => root.status === "missing")).map((root) => <p className="fine-print" key={root.path}>{root.path}: {root.diagnostic}</p>)}
    {removable.length > 0 && <div className="artifact-selection" role="group" aria-label="Selected artifacts">
      <button type="button" disabled={deleting} onClick={() => setSelected(chosen.length === removable.length ? new Set() : new Set(removable.map((item) => item.key)))}>
        {chosen.length === removable.length ? "Clear selection" : "Select all shown"}</button>
      <button type="button" className="danger" disabled={!chosen.length || deleting || Boolean(confirming)} onClick={() => setConfirming(chosen)}>Delete selected ({chosen.length})</button>
    </div>}
    {confirming && <section className="artifact-confirm" role="alertdialog" aria-label="Confirm artifact deletion">
      <p>{[confirmFiles ? `Move ${confirmFiles} ${confirmFiles === 1 ? "file" : "files"} to the Trash` : "", confirmNotes ? `delete ${confirmNotes} saved ${confirmNotes === 1 ? "note" : "notes"}` : ""].filter(Boolean).join(" and ").replace(/^./, (first) => first.toUpperCase())}?</p>
      <ul>{confirming.map((item) => <li key={item.key} className="path">{item.type === "file" ? item.file.relativePath : item.name}{all && ` (${ownerLabel(snapshot, item.projectId)})`}</li>)}</ul>
      <p className="fine-print">{confirmFiles ? "Files can be restored from the Trash. " : ""}{confirmNotes ? "Saved notes and their revisions can't be restored. Chats and other copies aren't changed." : "Chats aren't changed."}</p>
      <div className="button-row"><button type="button" className="danger" disabled={deleting} onClick={() => void remove(confirming)}>{deleting ? "Deleting..." : "Delete"}</button>
        <button type="button" disabled={deleting} onClick={() => setConfirming(null)}>Cancel</button></div>
    </section>}
    {!loading && !visible.length && <p className="artifacts-empty">{items.length ? "No artifacts match these filters." : `No artifacts yet. Builds, files the agent writes, images, links and saved notes from ${all ? "every project's chats and chats without a project" : scope === PROJECT_FREE ? "chats without a project" : "this project's chats"} appear here.`}</p>}
    <ul className="artifact-list">{shown.map((item) => {
      const session = snapshot.sessions.find((value) => value.id === item.sessionId);
      return <li className="artifact-item" key={item.key} data-artifact-type={item.type}>
        {deletable(item) ? <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.key)} disabled={deleting} onChange={(event) => toggle(item.key, event.target.checked)} /> :
          <span className="artifact-select-placeholder" aria-hidden="true" />}<Icon name={item.icon} />
        <div className="artifact-item-body"><strong title={item.name}>{item.name}</strong><small className="path">{item.detail}</small>
          <small>{all && `${ownerLabel(snapshot, item.projectId)} / `}{session ? <button type="button" className="quiet" onClick={() => void openSession(session.id)}>{sessionTitle(session)}</button> :
            <span>{item.sessionId ? "Chat removed" : "No linked chat"}</span>} / <time dateTime={item.when}>{new Date(item.when).toLocaleString()}</time></small>
          {item.type === "image" && preview === item.key && item.sessionId && <div className="artifact-preview"><ContextImage sdk={sdk} sessionId={item.sessionId} attachment={item.attachment} /></div>}</div>
        <div className="artifact-item-actions">
          {item.type === "file" && <button type="button" onClick={() => void reveal(item)}>Show in Finder</button>}
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
