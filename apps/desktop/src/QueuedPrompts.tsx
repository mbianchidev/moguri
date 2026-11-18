import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { isRecord, type Attachment, type Command, type CommandResult, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { AnchoredMenu } from "./AnchoredMenu.tsx";
import { AttachmentChip, AttachmentMenu, AttachmentReview, captureReviewed, clipboardImage, SESSION_DRAG_TYPE, type AttachmentReviewRequest } from "./ContextAttachments.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { Icon } from "./Icon.tsx";
import { ReorderList } from "./ReorderList.tsx";
import { Tooltip } from "./Tooltip.tsx";

type QueueItem = Session["queue"][number];
interface QueueEdit { id: string; text: string; attachments: Attachment[] }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const editable = (item: QueueItem) => !item.scheduledPromptId && !item.lifecycle;

/** Queued prompts render like sent prompts with a dashed outline; click one to edit it in place (D48). */
export function Queue({ session, snapshot, command, client, modal }: {
  session: Session; snapshot: Snapshot; command: (command: Command) => Promise<void>; client: MoguriSdk; modal: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true), contentId = useId();
  const [edit, setEdit] = useState<QueueEdit | null>(null), [error, setError] = useState(""), [lost, setLost] = useState<string | null>(null);
  const count = `${session.queue.length} queued ${session.queue.length === 1 ? "message" : "messages"}`;
  useEffect(() => {
    if (!edit || session.queue.some((item) => item.id === edit.id)) return;
    // The service claimed or removed the prompt mid-edit; keep the unsaved text visible instead of dropping it.
    setLost(edit.text); setEdit(null);
  }, [edit, session.queue]);
  const sendNow = (item: QueueItem) => {
    setError("");
    void client.prompts.sendNow(session.id, item.id, session.queueRevision).catch((error: unknown) => setError(message(error, "The prompt couldn't be sent now. It stays queued.")));
  };
  return <section className="queue" aria-label="Message queue">
    <header>
      <button type="button" className="quiet queue-disclosure" aria-label={expanded ? "Hide queued prompts" : "Show queued prompts"}
        aria-description={count} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)}>
        {count}<Icon name={expanded ? "Down" : "ChevronRight"} />
      </button>
      {!session.turnId && session.queue.some((item) => item.delivery !== "steer") &&
        <button type="button" className="quiet queue-resume" onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume queued work</button>}
    </header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {lost !== null && <Alert as="div" className="inline-error queue-lost" role="alert"><p>This prompt was sent or removed before your edit was saved. Your unsaved text:</p>
      <pre>{lost}</pre><button type="button" className="quiet" onClick={() => setLost(null)}>Dismiss</button></Alert>}
    <div id={contentId} className="queue-content" hidden={!expanded}>
      <ReorderList items={session.queue} scope={`${client.profileId}:queue:${session.id}`} label="Queued prompt order" name={(_item, index) => `queued message ${index + 1}`} disabled={edit !== null}
        change={async (items) => { await client.command({ type: "queue.reorder", sessionId: session.id, expectedRevision: session.queueRevision, messageIds: items.map((item) => item.id) }); }}>
        {(item, index) => edit?.id === item.id ?
          <QueuedPromptEditor sdk={client} session={session} snapshot={snapshot} index={index} edit={edit} update={setEdit} modal={modal} expanded={expanded}
            close={() => setEdit(null)} /> :
          <QueuedPrompt sdk={client} session={session} item={item} index={index} modal={modal} sendNow={() => sendNow(item)}
            remove={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}
            edit={editable(item) && edit === null ? () => { setError(""); setEdit({ id: item.id, text: item.text, attachments: item.attachments }); } : undefined} />}
      </ReorderList>
    </div>
  </section>;
}

function QueuedPrompt({ sdk, session, item, index, modal, sendNow, remove, edit }: {
  sdk: MoguriSdk; session: Session; item: QueueItem; index: number; modal: (open: boolean) => void;
  sendNow: () => void; remove: () => void; edit?: () => void;
}) {
  const textId = useId(), number = index + 1, steering = item.delivery === "steer" && Boolean(session.turnId) && item.targetTurnId === session.turnId;
  const delivery = item.held ? "Held" : item.delivery === "steer" ? steering ? "Pending steer" : "Unapplied steer" : null;
  const text = <span id={textId} className="queue-text">{item.text || "Attached context"}</span>;
  return <article className="message user queued-prompt" aria-label={`Queued message ${number}`}>
    <header><strong>You</strong>{delivery && <span className="queue-delivery">{delivery}</span>}
      <div className="queue-actions">
        <CopyButton label={`Copy queued message ${number}`} title="Copy" text={item.text} />
        <Tooltip content={steering ? "Already steering the running turn" : session.turnId ? "Send now: steer the running turn" : "Send now"}>
          <button type="button" className="icon-button queue-send-now" aria-label={`Send queued message ${number} now`} disabled={steering} onClick={sendNow}><Icon name="ArrowUp" /></button></Tooltip>
        <Tooltip content="Delete"><button type="button" className="icon-button" aria-label={`Remove queued message ${number}`} onClick={remove}><Icon name="Trash" /></button></Tooltip>
      </div>
    </header>
    {edit ? <button type="button" className="queued-prompt-body" aria-label={`Edit queued message ${number}`} aria-describedby={textId} onClick={edit}>{text}</button> : <div className="queued-prompt-body">{text}</div>}
    {item.attachments.length > 0 && <div className="attachment-list">{item.attachments.map((attachment) =>
      <AttachmentChip key={attachment.id} sdk={sdk} sessionId={session.id} attachment={attachment} onOpenChange={modal} />)}</div>}
  </article>;
}

/** Edits one queued prompt in place. Attachments are staged for this prompt and saved only with Save; nothing is sent. */
function QueuedPromptEditor({ sdk, session, snapshot, index, edit, update, modal, expanded, close }: {
  sdk: MoguriSdk; session: Session; snapshot: Snapshot; index: number; edit: QueueEdit; update: Dispatch<SetStateAction<QueueEdit | null>>;
  modal: (open: boolean) => void; expanded: boolean; close: () => void;
}) {
  const [menu, setMenu] = useState(false), [review, setReview] = useState<AttachmentReviewRequest | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [extracting, setExtracting] = useState<{ id: string; name: string } | null>(null);
  const attachButton = useRef<HTMLButtonElement>(null), project = snapshot.projects.find((value) => value.id === session.projectId);
  useEffect(() => { if (!expanded) setMenu(false); }, [expanded]);
  useEffect(() => { if (!review) return; modal(true); return () => modal(false); }, [review, modal]);
  const add = (result: CommandResult) => {
    const attachment = result.attachment;
    if (!attachment) throw new Error("The attachment wasn't staged for this queued prompt. Nothing was added.");
    update((current) => current && current.id === edit.id ? { ...current, attachments: [...current.attachments, attachment] } : current);
  };
  const run = async (work: () => Promise<unknown>) => {
    setError("");
    try { await work(); } catch (error) { setError(message(error, "That couldn't be attached. Your edit is preserved.")); }
  };
  const attachFile = async (path: string) => {
    if (!/\.(pdf|xlsx|docx)$/i.test(path)) { add(await sdk.attachments.queued.file(session.id, edit.id, path)); return; }
    const id = crypto.randomUUID(); setExtracting({ id, name: path.split(/[\\/]/).at(-1) ?? "Selected document" });
    try { add(await sdk.attachments.queued.document(session.id, edit.id, path, id)); } finally { setExtracting(null); }
  };
  const reviewAttachment = async (request: AttachmentReviewRequest) => {
    if (request.kind === "session" && sdk.settings.get()?.values.interactions.confirmSessionAttachments === false) add(await captureReviewed(sdk, session.id, request, edit.id));
    else setReview(request);
    setMenu(false);
  };
  const attachPath = async (path: string) => {
    const selected = await sdk.attachments.localPath(session.id, path);
    if (selected.kind === "folder") await reviewAttachment({ kind: "folder", path: selected.path, preview: (await sdk.attachments.folderPreview(session.id, selected.path)).preview });
    else await attachFile(selected.path);
  };
  const save = async () => {
    if (busy || extracting) return;
    setBusy(true); setError("");
    try { await sdk.prompts.edit(session.id, edit.id, edit.text, edit.attachments, session.queueRevision); close(); }
    catch (error) { setError(message(error, "The queued prompt couldn't be saved. Your edit is preserved.")); }
    finally { setBusy(false); }
  };
  const number = index + 1;
  return <div className="message user queued-prompt queued-prompt-editor" aria-label={`Editing queued message ${number}`}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || menu || review) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save(); }
    }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDrop={(event) => {
      if (!event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
      event.preventDefault(); event.stopPropagation();
      const raw = event.dataTransfer.getData(SESSION_DRAG_TYPE);
      void run(async () => {
        const source: unknown = JSON.parse(raw);
        if (!isRecord(source) || source.profileId !== sdk.profileId || typeof source.sessionId !== "string" || source.sessionId === session.id) throw new Error("Drop another session from this profile. No source content was read.");
        await reviewAttachment({ kind: "session", sourceSessionId: source.sessionId, preview: (await sdk.attachments.sessionPreview(session.id, source.sessionId)).preview });
      });
    }}>
    <textarea autoFocus aria-label="Edit queued message" value={edit.text} disabled={busy}
      onChange={(event) => { const text = event.target.value; update((current) => current && current.id === edit.id ? { ...current, text } : current); }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length) return;
        event.preventDefault();
        void run(async () => {
          if (files.length !== 1) throw new Error("Paste one image at a time. Nothing was attached.");
          const file = files[0]!;
          add(await sdk.attachments.queued.image(session.id, edit.id, await clipboardImage(file), (file.name || "Clipboard image").slice(0, 100)));
        });
      }}
 />
    {edit.attachments.length > 0 && <div className="attachment-list">{edit.attachments.map((attachment) =>
      <AttachmentChip key={attachment.id} sdk={sdk} sessionId={session.id} attachment={attachment} onOpenChange={modal}
        remove={async () => { update((current) => current && current.id === edit.id ? { ...current, attachments: current.attachments.filter((value) => value.id !== attachment.id) } : current); }} />)}</div>}
    {extracting && <div className="document-capture"><p role="status">Extracting {extracting.name} locally. Your edit is preserved.</p><progress aria-label="Local document extraction" />
      <button type="button" onClick={() => void sdk.attachments.cancelDocument(session.id, extracting.id).catch((error: unknown) => setError(message(error, "Stopping the extraction isn't confirmed.")))}>Cancel extraction</button></div>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div className="queued-prompt-editor-actions">
      <Tooltip content="Attach"><button ref={attachButton} type="button" className="icon-button" aria-label={`Attach to queued message ${number}`} aria-haspopup="dialog" aria-expanded={menu}
        disabled={busy} onClick={() => setMenu((value) => !value)}><Icon name="Plus" /></button></Tooltip>
      <Tooltip content="Cancel"><button type="button" className="icon-button queued-prompt-cancel" aria-label={`Cancel editing queued message ${number}`} disabled={busy} onClick={close}><Icon name="Close" /></button></Tooltip>
      <Tooltip content="Save"><button type="button" className="icon-button primary" aria-label={`Save queued message ${number}`} disabled={busy || Boolean(extracting)} onClick={() => void save()}><Icon name="Check" /></button></Tooltip>
    </div>
    {menu && expanded && <AnchoredMenu label={`Attach to queued message ${number}`} trigger={attachButton} close={() => setMenu(false)} className="queued-attachment-menu">
      <AttachmentMenu sdk={sdk} session={session} project={project} snapshot={snapshot} run={run} capture={run} attachPath={attachPath} review={reviewAttachment} close={() => setMenu(false)}
        selectFile={() => void run(async () => { const path = await window.moguri.chooseAttachment("file"); if (path) await attachFile(path); })} />
    </AnchoredMenu>}
    {review && <AttachmentReview sdk={sdk} request={review} attach={async (request) => add(await captureReviewed(sdk, session.id, request, edit.id))} close={() => setReview(null)} />}
  </div>;
}
