import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Attachment, MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { CopyButton } from "./CopyButton.tsx";

let active: string | null = null;
const listeners = new Set<() => void>();
const select = (key: string | null) => { active = key; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function InteractiveHtml({ sdk, sessionId, attachment }: { sdk: MoguriSdk; sessionId: string; attachment: Extract<Attachment, { kind: "html" }> }) {
  const key = JSON.stringify([sdk.profileId, sessionId, attachment.id]), selected = useSyncExternalStore(subscribe, () => active === key, () => false);
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(""), [source, setSource] = useState<string | null>(null), [sourceOpen, setSourceOpen] = useState(false);
  useEffect(() => {
    if (!sourceOpen) return;
    let current = true;
    void sdk.attachments.read(sessionId, attachment.id).then((value) => {
      if (value.content.kind !== "html") throw new Error("The exact retained output is no longer HTML.");
      if (current) setSource(value.content.html);
    }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Original page source unavailable."); });
    return () => { current = false; };
  }, [sdk, sessionId, attachment.id, sourceOpen]);
  useEffect(() => {
    if (!selected) return;
    let disposed = false, pending = false, again = false;
    const update = async () => {
      again = true;
      if (pending || disposed || !host.current) return;
      pending = true;
      try {
        while (again && !disposed && host.current) {
          again = false;
          const bounds = host.current.getBoundingClientRect(), blocked = document.querySelector("dialog[open], [popover]:popover-open");
          if (blocked || bounds.bottom < 0 || bounds.top > innerHeight || bounds.width < 1 || bounds.height < 1) await window.moguri.previewHtml({ type: "hide", sessionId, attachmentId: attachment.id, digest: attachment.digest }, sdk.profileId);
          else await window.moguri.previewHtml({ type: "show", sessionId, attachmentId: attachment.id, digest: attachment.digest,
            bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }, sdk.profileId);
        }
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "The isolated page did not render. Its original source is retained."); }
      finally { pending = false; }
    };
    const dismiss = window.moguri.onHtmlDismiss((id) => { if (id === attachment.id) { select(null); trigger.current?.focus(); } });
    const resize = new ResizeObserver(() => void update()); if (host.current) resize.observe(host.current);
    const mutation = new MutationObserver(() => void update()); mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    window.addEventListener("scroll", update, true); window.addEventListener("resize", update); void update();
    return () => {
      disposed = true; dismiss(); resize.disconnect(); mutation.disconnect(); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update);
      if (active === key) select(null);
      void window.moguri.previewHtml({ type: "hide", sessionId, attachmentId: attachment.id, digest: attachment.digest }, sdk.profileId)
        .catch((error: unknown) => console.error("Original isolated page cleanup failed:", error instanceof Error ? error.message : "unconfirmed cleanup"));
    };
  }, [sdk, selected, sessionId, attachment.id, attachment.digest]);
  return <section className="interactive-html" aria-label={`Interactive page ${attachment.path}`}>
    <header><strong>{attachment.path}</strong><button ref={trigger} type="button" aria-expanded={selected} onClick={() => { setError(""); select(selected ? null : key); }}>{selected ? "Close interactive page" : "Open interactive page"}</button>
      <button type="button" aria-expanded={sourceOpen} onClick={() => setSourceOpen((value) => !value)}>View original HTML</button></header>
    {selected && <div ref={host} className="interactive-html-host" aria-label="Separate isolated interactive page" />}
    <p className="fine-print">Isolated page. No network, host files or Moguri access. Escape closes it. Interactions reset when closed; the original source stays retained.</p>
    {sourceOpen && <><CopyButton label="Copy original HTML" text={source ?? ""} disabled={source === null} /><pre>{source ?? "Loading original source..."}</pre></>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </section>;
}
