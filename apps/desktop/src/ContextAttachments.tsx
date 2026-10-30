import { useEffect, useRef, useState } from "react";
import { sessionTitle, type Attachment, type AttachmentAccess, type ContextPreview, type DraftEditor, type MoguriSdk, type Project, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { SettingsAction } from "./SettingsFields.tsx";
import { ContextDocument } from "./DocumentAttachment.tsx";
import { Alert } from "./Alert.tsx";

export type AttachmentReviewRequest =
  | { kind: "folder"; path: string; preview: ContextPreview }
  | { kind: "github"; url: string; access: AttachmentAccess; preview: ContextPreview }
  | { kind: "session"; sourceSessionId: string; preview: ContextPreview };
type Run = (work: () => Promise<unknown>) => Promise<void>;
export const SESSION_DRAG_TYPE = "application/x-moguri-session";
export const matchingContextSessions = (snapshot: Snapshot, destinationId: string, query: string) => snapshot.sessions.filter((source) => source.id !== destinationId && source.status !== "archived" &&
  (!query || source.id === query || sessionTitle(source).toLowerCase().includes(query.toLowerCase()) || sessionTitle(source).toLowerCase().replace(/\s+/g, "-").includes(query.toLowerCase())));
export function AttachmentMenu({ sdk, session, project, snapshot, run, capture, selectFile, attachPath, review, close, initial }: {
  sdk: MoguriSdk; session: Session; project?: Project; snapshot: Snapshot; run: Run; capture: Run;
  review: (request: AttachmentReviewRequest) => Promise<void>; close: () => void;
  selectFile: () => void; attachPath: (path: string) => Promise<void>;
  initial?: { prefix: string; query: string } | null;
}) {
  const namedProject = initial?.prefix === "@" ? snapshot.projects.find((value) => initial.query === value.name || initial.query.startsWith(`${value.name}/`)) : undefined;
  const remote = initial?.prefix === "@" && !namedProject && /^[^/]+\/[^/]+\/.+/.test(initial.query);
  const [page, setPage] = useState<"menu" | "project" | "github" | "session">(initial?.prefix === "#" || remote ? "github" : initial?.prefix === "@" ? "project" : [":", "!"].includes(initial?.prefix ?? "") ? "session" : "menu");
  const [url, setUrl] = useState(remote ? `@${initial!.query}` : initial?.prefix === "#" ? initial.query : "");
  const [access, setAccess] = useState<AttachmentAccess>("auto");
  const [query, setQuery] = useState([":", "!"].includes(initial?.prefix ?? "") ? initial!.query : "");
  const [projectId, setProjectId] = useState(namedProject?.id ?? project?.id ?? snapshot.projects[0]?.id ?? "");
  const [path, setPath] = useState(namedProject ? initial!.query.slice(namedProject.name.length + 1) || "." : initial?.prefix === "@" && !remote ? initial.query : ".");
  const previewGithub = (reference = url) => run(async () => { await review({ kind: "github", url: reference, access, preview: (await sdk.attachments.githubPreview(session.id, reference, access)).preview }); close(); });
  if (page === "menu") return <div className="attachment-menu" aria-label="Attachment sources">
    <button className="composer-menu-option" type="button" onClick={() => setPage("project")}><Icon name="Files" /><span>Project file or folder...</span><kbd>@</kbd></button>
    <button className="composer-menu-option" type="button" onClick={() => setPage("github")}><Icon name="PR" /><span>Issue or pull request...</span><kbd>#</kbd></button>
    <button className="composer-menu-option" type="button" onClick={() => setPage("session")}><Icon name="Side chat" /><span>Session...</span><kbd>:</kbd></button>
    <hr />
    <button className="composer-menu-option" type="button" title="Attach any file" onClick={() => { close(); selectFile(); }}><Icon name="File" /><span>Local file...</span><kbd>^</kbd></button>
    <button className="composer-menu-option" type="button" onClick={() => void run(async () => { const path = await window.moguri.chooseAttachment("folder"); if (path) { await review({ kind: "folder", path, preview: (await sdk.attachments.folderPreview(session.id, path)).preview }); close(); } })}><Icon name="Files" /><span>Local folder...</span><kbd>^</kbd></button>
  </div>;
  return <div className="attachment-picker"><header><button className="icon-button" type="button" aria-label="Back to attachment sources" onClick={() => setPage("menu")}><Icon name="Back" /></button><h2>{page === "project" ? "Project file or folder" : page === "github" ? "GitHub context" : "Session context"}</h2></header>
    {page === "project" && <>
      <label className="setting-field">Local project<select aria-label="Attachment project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPath("."); }}>{snapshot.projects.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="setting-field">File or folder<input aria-label="Project attachment path" autoFocus value={path} placeholder="docs/README.md or docs/" onChange={(event) => setPath(event.target.value)} /></label>
      <button type="button" disabled={!projectId || !path} onClick={() => void capture(async () => { const selected = await sdk.attachments.projectPath(session.id, projectId, path); await attachPath(selected.path); close(); })}>Attach project file or folder</button>
      {initial?.prefix === "@" && /^[^/]+\/[^/]+\/.+/.test(initial.query) && <button type="button" className="quiet" onClick={() => void previewGithub(`@${initial.query}`)}>Preview GitHub file {initial.query}</button>}
      <p>Explicit Local source snapshot. A named project's files do not change this chat's execution root.</p>
    </>}
    {page === "github" && <>
      <label className="setting-field">Issue, pull request or file<input aria-label="GitHub attachment reference" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder={project ? "#137 or @owner/repo/README.md" : "owner/repo#137 or @owner/repo/README.md"} /></label>
      <label className="setting-field">Access<select aria-label="GitHub attachment access" value={access} onChange={(event) => setAccess(event.target.value === "gh-cli" ? "gh-cli" : event.target.value === "public" ? "public" : "auto")}><option value="auto">GitHub CLI, or public access</option><option value="public">Public GitHub</option><option value="gh-cli">My GitHub CLI account</option></select></label>
      <button type="button" disabled={!url} onClick={() => void previewGithub()}>Preview reference</button>
      <p>Read-only snapshot. Access uses this Mac's chosen GitHub CLI account or the public API, never an SSH host's account.</p>
    </>}
    {page === "session" && <>
      <label className="setting-field">Find session<input aria-label="Find context session" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Session name" /></label>
      <div className="context-session-options">{matchingContextSessions(snapshot, session.id, query).map((source) => <button className="composer-menu-option" type="button" key={source.id} onClick={() => void run(async () => { await review({ kind: "session", sourceSessionId: source.id, preview: (await sdk.attachments.sessionPreview(session.id, source.id)).preview }); close(); })}><Icon name="Side chat" /><span>{sessionTitle(source)}<small>{snapshot.projects.find((value) => value.id === source.projectId)?.name ?? "No project"}</small></span></button>)}</div>
      {!matchingContextSessions(snapshot, session.id, query).length && <p>No matching active sessions.</p>}
    </>}
  </div>;
}
export function AttachmentReview({ request, sdk, sessionId, editor, close, adopt }: { request: AttachmentReviewRequest; sdk: MoguriSdk; sessionId: string; editor: DraftEditor; close: () => void; adopt: (draft: Session["draft"]) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [remember, setRemember] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const attach = async () => {
    setBusy(true); setError("");
    try {
      await editor.flush();
      if (request.kind === "session" && remember) {
        const settings = sdk.settings.get();
        if (!settings) throw new Error("Reconnect before saving the session-attachment preference.");
        await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmSessionAttachments: false } }, settings.revision);
      }
      if (request.kind === "folder") await sdk.attachments.folder(sessionId, request.path, request.preview.digest, true);
      else if (request.kind === "github") await sdk.attachments.github(sessionId, request.url, request.access, request.preview.digest, true);
      else await sdk.attachments.session(sessionId, request.sourceSessionId, request.preview.digest, true);
      const draft = sdk.getState().snapshot?.sessions.find((session) => session.id === sessionId)?.draft;
      if (draft) await adopt(draft);
      close();
    } catch (error) { setError(error instanceof Error ? error.message : "The source could not be attached. Your draft was preserved."); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="workspace-dialog attachment-review" aria-label="Review attachment" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={close}><header><h2>Review context snapshot</h2><button className="icon-button" type="button" aria-label="Close attachment review" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    <p><strong>{request.preview.label}</strong></p><p className="fine-print path">{request.preview.source.location}</p>
    <p>{request.preview.kind} / {new Intl.NumberFormat().format(request.preview.bytes)} bytes. Destination: {request.preview.destination.env} / {request.preview.destination.target}. Model: {request.preview.destination.modelId ?? "not selected yet"}.</p>
    <p className="fine-print">Only this destination session receives the captured content. No source session is resumed, repository checked out or host folder mounted.</p>
    {request.preview.files.length > 0 && <details open><summary>{request.preview.files.length} approved files</summary>{request.preview.files.map((file) => <p className="fine-print path" key={file.path}>{file.path} / {file.bytes} bytes</p>)}</details>}
    {request.preview.excluded.length > 0 && <details><summary>{request.preview.excluded.length} exclusions</summary>{request.preview.excluded.map((entry) => <p className="fine-print path" key={entry.path}>{entry.path}: {entry.reason}</p>)}</details>}
    {request.preview.text && <pre>{request.preview.text}</pre>}
    <label className="check-setting"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />I reviewed this source snapshot and destination.</label>
    {request.kind === "session" && <label className="check-setting"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Do not ask me again when attaching content from a session</label>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}<footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" type="button" disabled={!checked || busy} onClick={() => void attach()}>Attach</button></footer>
  </dialog>;
}
export function AttachmentChip({ sdk, sessionId, attachment, remove, onOpenChange }: {
  sdk: MoguriSdk; sessionId: string; attachment: Attachment; remove?: () => Promise<void>; onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [imageError, setImageError] = useState("");
  useEffect(() => { if (open) onOpenChange?.(true); return () => { if (open) onOpenChange?.(false); }; }, [open, onOpenChange]);
  return <span className={`attachment-chip${attachment.kind === "image" ? " attachment-chip-image" : ""}`} title={`${attachment.kind} / ${attachment.bytes} bytes / SHA-256 ${attachment.digest}`}>
    {attachment.kind === "document" ? <ContextDocument sdk={sdk} sessionId={sessionId} attachment={attachment} remove={remove} onOpenChange={onOpenChange} /> :
      <button className="attachment-preview-button" type="button" aria-label={`Preview attachment ${attachment.path}`} onClick={() => setOpen(true)}>
        {attachment.kind === "image" ? <ContextImage sdk={sdk} sessionId={sessionId} attachment={attachment} onError={setImageError} /> : <Icon name={attachment.kind === "session" ? "Side chat" : attachment.kind.startsWith("github") ? "PR" : "File"} />}<span>{attachment.path}</span>
      </button>}
    {remove && <button type="button" aria-label={`Remove attachment ${attachment.path}`} onClick={() => void remove().catch((error: unknown) => setError(error instanceof Error ? error.message : "The attachment could not be removed."))}><Icon name="Close" /></button>}
    {error && <Alert as="span" className="inline-error" role="alert">{error}</Alert>}
    {imageError && <Alert as="span" className="inline-error" role="alert">{imageError}</Alert>}
    {open && <AttachmentPreview sdk={sdk} sessionId={sessionId} attachment={attachment} remove={remove} close={() => setOpen(false)} />}
  </span>;
}
function AttachmentPreview({ sdk, sessionId, attachment, remove, close }: { sdk: MoguriSdk; sessionId: string; attachment: Attachment; remove?: () => Promise<void>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    if (attachment.kind === "image") return;
    let current = true;
    void sdk.attachments.read(sessionId, attachment.id).then((result) => {
      if (result.content.kind !== "text") throw new Error("The retained attachment type differs from this text preview. No substitute content was shown.");
      if (current) setText(result.content.text);
    })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "The retained attachment could not be read."); });
    return () => { current = false; };
  }, [sdk, sessionId, attachment.id]);
  return <dialog ref={dialog} className={`workspace-dialog attachment-preview${attachment.kind === "image" ? " attachment-preview-image" : ""}`} aria-label={`Attachment preview ${attachment.path}`} onClose={close} onCancel={(event) => { if (busy) event.preventDefault(); }}>
    <header><h2>{attachment.path}</h2><button className="icon-button" type="button" aria-label="Close attachment preview" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    <p className="fine-print">Retained snapshot / {attachment.bytes} bytes. Viewing this content does not send a prompt.</p>
    {"source" in attachment && <p className="fine-print path">{attachment.source.location}</p>}
    {attachment.kind === "image" ? <div className="attachment-image-stage"><ContextImage sdk={sdk} sessionId={sessionId} attachment={attachment} /></div> : text === null && !error ? <p role="status">Loading retained content...</p> : <pre aria-label="Attached content">{text}</pre>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <footer>{remove && <SettingsAction label="Remove attachment" icon="Trash" className="danger" disabled={busy} onClick={() => { setBusy(true); void remove().then(close).catch((error: unknown) => setError(error instanceof Error ? error.message : "The attachment could not be removed.")).finally(() => setBusy(false)); }} />}<button type="button" disabled={busy} onClick={close}>Close preview</button></footer>
  </dialog>;
}
export function ContextImage({ sdk, sessionId, attachment, onError }: { sdk: MoguriSdk; sessionId: string; attachment: Attachment; onError?: (message: string) => void }) {
  const [source, setSource] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let current = true; setSource(""); setError(""); onError?.("");
    void sdk.attachments.read(sessionId, attachment.id).then((result) => {
      if (result.content.kind !== "image") throw new Error("The retained attachment is not an image. No substitute content was shown.");
      if (current) setSource(`data:${result.content.mimeType};base64,${result.content.data}`);
    }).catch((error: unknown) => { if (current) { const message = error instanceof Error ? error.message : "Image preview unavailable."; setError(message); onError?.(message); } });
    return () => { current = false; };
  }, [sdk, sessionId, attachment.id, attachment.digest, onError]);
  return source ? <img className="context-image" src={source} alt={attachment.path} /> : error ? onError ? <span className="image-preview-unavailable">Image unavailable</span> : <Alert as="span" className="inline-error" role="alert">{error}</Alert> : <span role="status">Loading image...</span>;
}
export async function clipboardImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) && /\.(pdf|docx|xlsx)$/i.test(file.name)) throw new Error("Use Attach > Local file for PDF, Word or Excel files. Clipboard document capture is unavailable here; your complete draft was preserved.");
  if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Paste a PNG, JPEG or WebP image up to 8 MiB. No clipboard content was sent.");
  const bytes = new Uint8Array(await file.arrayBuffer()), parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(parts.join(""));
}
