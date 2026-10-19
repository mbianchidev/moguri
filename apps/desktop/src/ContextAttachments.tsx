import { useEffect, useRef, useState } from "react";
import { type Attachment, type ContextPreview, type DraftEditor, type MoguriSdk, type Project, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

export type AttachmentReviewRequest =
  | { kind: "folder"; path: string; preview: ContextPreview }
  | { kind: "github"; url: string; access: "public" | "gh-cli"; preview: ContextPreview }
  | { kind: "session"; sourceSessionId: string; preview: ContextPreview };
type Run = (work: () => Promise<unknown>) => Promise<void>;
export function AttachmentMenu({ sdk, session, project, snapshot, editor, run, capture, review, close, initial }: {
  sdk: MoguriSdk; session: Session; project?: Project; snapshot: Snapshot; editor: DraftEditor; run: Run; capture: Run;
  review: (request: AttachmentReviewRequest) => void; close: () => void;
  initial?: { prefix: string; query: string } | null;
}) {
  const [url, setUrl] = useState(initial?.prefix === "#" ? initial.query : ""), [access, setAccess] = useState<"public" | "gh-cli">("public"), [sourceId, setSourceId] = useState(initial?.prefix === "!" && snapshot.sessions.some((source) => source.id === initial.query) ? initial.query : "");
  const file = (mode: "text" | "image") => { close(); void capture(async () => { const path = await window.moguri.chooseAttachment(mode === "image" ? "image" : "file"); if (path) await sdk.attachments.file(session.id, path, mode); }); };
  return <><h2>Attach context</h2>
    <button className="composer-menu-option" type="button" aria-label="Project text file" disabled={!project} title={!project ? "Select a project for workspace files." : undefined} onClick={() => { if (!project) return; close(); void capture(async () => { const path = await window.moguri.chooseFile(project.path); if (path) await editor.attach(path); }); }}><Icon name="Files" /><span>Project text file<small>@ explicit snapshot from this local project</small></span></button>
    <button className="composer-menu-option" type="button" onClick={() => file("text")}><Icon name="Files" /><span>Local text file<small>^ explicit client selection</small></span></button>
    <button className="composer-menu-option" type="button" onClick={() => file("image")}><Icon name="Image" /><span>Image<small>PNG, JPEG or WebP; paste also works</small></span></button>
    <button className="composer-menu-option" type="button" onClick={() => void run(async () => { const path = await window.moguri.chooseAttachment("folder"); if (path) review({ kind: "folder", path, preview: (await sdk.attachments.folderPreview(session.id, path)).preview }); })}><Icon name="Files" /><span>Folder<small>: review exact files and exclusions</small></span></button>
    <label className="setting-field">GitHub issue or PR<input aria-label="GitHub attachment URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repo/issues/1" /></label>
    <select aria-label="GitHub attachment access" value={access} onChange={(event) => setAccess(event.target.value === "gh-cli" ? "gh-cli" : "public")}><option value="public">Public GitHub</option><option value="gh-cli">My GitHub CLI account</option></select>
    <button type="button" disabled={!url} onClick={() => void run(async () => review({ kind: "github", url, access, preview: (await sdk.attachments.githubPreview(session.id, url, access)).preview }))}>Preview reference</button>
    <label className="setting-field">Session<select aria-label="Context source session" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose conversation</option>{snapshot.sessions.filter((source) => source.id !== session.id).map((source) => <option value={source.id} key={source.id}>{source.title}{source.status === "archived" ? " (archived)" : ""}</option>)}</select></label>
    <button type="button" disabled={!sourceId} onClick={() => void run(async () => review({ kind: "session", sourceSessionId: sourceId, preview: (await sdk.attachments.sessionPreview(session.id, sourceId)).preview }))}>Preview session context</button>
    <p>Snapshots are explicit, immutable and removable. Prefixes in ordinary text stay literal. Nothing is sent to a model until you send the prompt.</p>
  </>;
}
export function AttachmentReview({ request, sdk, sessionId, editor, close, adopt }: { request: AttachmentReviewRequest; sdk: MoguriSdk; sessionId: string; editor: DraftEditor; close: () => void; adopt: (draft: Session["draft"]) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const attach = async () => {
    setBusy(true); setError("");
    try {
      await editor.flush();
      if (request.kind === "folder") await sdk.attachments.folder(sessionId, request.path, request.preview.digest, true);
      else if (request.kind === "github") await sdk.attachments.github(sessionId, request.url, request.access, request.preview.digest, true);
      else await sdk.attachments.session(sessionId, request.sourceSessionId, request.preview.digest, true);
      const draft = sdk.getState().snapshot?.sessions.find((session) => session.id === sessionId)?.draft;
      if (draft) await adopt(draft);
      close();
    } catch (error) { setError(error instanceof Error ? error.message : "The source could not be attached. Your draft was preserved."); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="workspace-dialog attachment-review" aria-label="Review attachment" onClose={close}><header><h2>Review context snapshot</h2><button className="icon-button" type="button" aria-label="Close attachment review" disabled={busy} onClick={close}><Icon name="Close" /></button></header>
    <p><strong>{request.preview.label}</strong></p><p className="fine-print path">{request.preview.source.location}</p>
    <p>{request.preview.kind} / {new Intl.NumberFormat().format(request.preview.bytes)} bytes. Destination: {request.preview.destination.env} / {request.preview.destination.target}. Model: {request.preview.destination.modelId ?? "not selected yet"}.</p>
    <p className="fine-print">Only this destination session receives the captured content. No source session is resumed, repository checked out or host folder mounted.</p>
    {request.preview.files.length > 0 && <details open><summary>{request.preview.files.length} approved files</summary>{request.preview.files.map((file) => <p className="fine-print path" key={file.path}>{file.path} / {file.bytes} bytes</p>)}</details>}
    {request.preview.excluded.length > 0 && <details><summary>{request.preview.excluded.length} exclusions</summary>{request.preview.excluded.map((entry) => <p className="fine-print path" key={entry.path}>{entry.path}: {entry.reason}</p>)}</details>}
    {request.preview.text && <pre>{request.preview.text}</pre>}
    <label className="check-setting"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />I reviewed this source snapshot and destination.</label>
    {error && <p className="inline-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" type="button" disabled={!checked || busy} onClick={() => void attach()}>Attach</button></footer>
  </dialog>;
}
export function ContextImage({ sdk, sessionId, attachment }: { sdk: MoguriSdk; sessionId: string; attachment: Attachment }) {
  const [source, setSource] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let current = true; setSource(""); setError("");
    void sdk.attachments.read(sessionId, attachment.id).then((result) => { if (current && result.content.kind === "image") setSource(`data:${result.content.mimeType};base64,${result.content.data}`); }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Image preview unavailable."); });
    return () => { current = false; };
  }, [sessionId, attachment.id, attachment.digest]);
  return source ? <img className="context-image" src={source} alt={attachment.path} /> : error ? <span className="inline-error">{error}</span> : <span role="status">Loading image...</span>;
}
export async function clipboardImage(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Paste a PNG, JPEG or WebP image up to 8 MiB. No clipboard content was sent.");
  const bytes = new Uint8Array(await file.arrayBuffer()), parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(parts.join(""));
}
