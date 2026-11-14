import { useId, useRef, useState } from "react";
import type { Command, MoguriSdk, Session } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { SidebarMenu } from "./ChatMenus.tsx";
import { AttachmentChip } from "./ContextAttachments.tsx";
import { useCopyFeedback } from "./CopyButton.tsx";
import { Icon } from "./Icon.tsx";
import { ReorderList } from "./ReorderList.tsx";
import { Tooltip } from "./Tooltip.tsx";

export function Queue({ session, command, client, modal }: {
  session: Session; command: (command: Command) => Promise<void>; client: MoguriSdk; modal: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true), contentId = useId();
  const [editing, setEditing] = useState<string | null>(null), [text, setText] = useState(""), [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null), trigger = useRef<HTMLButtonElement>(null);
  const menuIndex = session.queue.findIndex((item) => item.id === menuId), menu = session.queue[menuIndex];
  const count = `${session.queue.length} queued ${session.queue.length === 1 ? "message" : "messages"}`;
  const copy = useCopyFeedback(JSON.stringify([client.profileId, session.id, menu?.id, menu?.text]), async () => {
    if (!menu) throw new Error("This queued message is no longer available. Nothing was copied.");
    await window.moguri.copyText(menu.text);
  });
  const save = async (messageId: string) => {
    setError("");
    try {
      await client.command({ type: "queue.edit", sessionId: session.id, messageId, expectedRevision: session.queueRevision, text });
      setEditing(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Queue edit failed. Your replacement text is preserved."); }
  };
  return <section className="queue" aria-label="Message queue">
    <header>
      <button type="button" className="quiet queue-disclosure" aria-label={expanded ? "Hide queued prompts" : "Show queued prompts"}
        aria-description={count} aria-expanded={expanded} aria-controls={contentId} onClick={() => { setExpanded((value) => !value); setMenuId(null); }}>
        {count}<Icon name={expanded ? "Down" : "ChevronRight"} />
      </button>
      {!session.turnId && session.queue.some((item) => item.delivery !== "steer") &&
        <button type="button" className="quiet queue-resume" onClick={() => void command({ type: "session.resume", sessionId: session.id })}>Resume queued work</button>}
    </header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div id={contentId} className="queue-content" hidden={!expanded}>
      <ReorderList items={session.queue} scope={`${client.profileId}:queue:${session.id}`} label="Queued prompt order" name={(_item, index) => `queued message ${index + 1}`} disabled={editing !== null}
        change={async (items) => { await client.command({ type: "queue.reorder", sessionId: session.id, expectedRevision: session.queueRevision, messageIds: items.map((item) => item.id) }); }}>
        {(item, index) => <div className="queue-item" data-menu-open={menu?.id === item.id || undefined}>
          {editing === item.id ? <div className="queue-editor">
            <textarea autoFocus aria-label="Edit queued message" value={text} onChange={(event) => setText(event.target.value)} />
            <div className="button-row"><button type="button" onClick={() => void save(item.id)}>Save</button>
              <button type="button" className="quiet" onClick={() => setEditing(null)}>Cancel</button></div>
          </div> : <>
            <div className="queue-bubble">
              {(item.held || item.delivery === "steer") && <span className="queue-delivery">{item.held ? "Held" : item.targetTurnId !== session.turnId ? "Unapplied steer" : "Pending steer"}</span>}
              <div className="queue-text">{item.text || "Attached project context"}</div>
              {item.attachments.length > 0 && <div className="attachment-list">{item.attachments.map((attachment) =>
                <AttachmentChip key={attachment.id} sdk={client} sessionId={session.id} attachment={attachment} onOpenChange={modal} />)}</div>}
            </div>
            <div className="queue-actions">
              <Tooltip content="More actions"><button type="button" className="icon-button" aria-label={`More actions for queued message ${index + 1}`}
                aria-haspopup="dialog" aria-expanded={menu?.id === item.id} onClick={(event) => { trigger.current = event.currentTarget; setMenuId(menuId === item.id ? null : item.id); }}><Icon name="More" /></button></Tooltip>
              <Tooltip content="Delete queued message"><button type="button" className="icon-button" aria-label={`Remove queued message ${index + 1}`}
                onClick={() => void command({ type: "queue.remove", sessionId: session.id, messageId: item.id, expectedRevision: session.queueRevision })}><Icon name="Trash" /></button></Tooltip>
              {item.held && <Tooltip content="Release this held prompt"><button type="button" className="icon-button queue-run" aria-label={`Run queued message ${index + 1}`}
                onClick={() => { setError(""); void client.prompts.release(session.id, item.id, session.queueRevision).catch((error: unknown) =>
                  setError(error instanceof Error ? error.message : "Prompt could not be released.")); }}><Icon name="ArrowUp" /></button></Tooltip>}
            </div>
          </>}
        </div>}
      </ReorderList>
    </div>
    {expanded && menu && <SidebarMenu label={`Queued message ${menuIndex + 1} actions`} sourceSessionId={session.id} trigger={trigger} close={() => setMenuId(null)} className="queued-message-menu">
      <p className="queued-message-preview">{menu.text || "Attached project context"}</p>
      <button type="button" aria-label={`Edit queued message ${menuIndex + 1}`} onClick={() => { setEditing(menu.id); setText(menu.text); setMenuId(null); }}><Icon name="Edit" />Edit message</button>
      <button type="button" aria-label={`Copy queued message ${menuIndex + 1}`} aria-busy={copy.pending || undefined} onClick={() => void copy.copy()}><Icon name={copy.copied ? "Check" : "Copy"} />{copy.copied ? "Copied" : "Copy message"}</button>
      {menu.delivery === "steer" && <button type="button" onClick={() => {
        void command({ type: "queue.make-turn", sessionId: session.id, messageId: menu.id, expectedRevision: session.queueRevision }); setMenuId(null);
      }}><Icon name="Clock" />Queue as new turn</button>}
      <span className="sr-only" role="status">{copy.copied ? "Copied." : ""}</span>
      {copy.error && <Alert as="p" className="inline-error" role="alert">{copy.error}</Alert>}
    </SidebarMenu>}
  </section>;
}
