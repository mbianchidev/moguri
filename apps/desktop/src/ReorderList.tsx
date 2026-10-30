import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

const MIME = "application/x-moguri-list-order";
export function reorderItems<T extends { id: string }>(items: readonly T[], sourceId: string, beforeId: string | null): T[] {
  const source = items.find((item) => item.id === sourceId);
  if (!source || new Set(items.map((item) => item.id)).size !== items.length || beforeId !== null && !items.some((item) => item.id === beforeId)) {
    throw new Error("The original list membership changed or is missing. Start the move again; no newer values were overwritten.");
  }
  if (beforeId === sourceId) return [...items];
  const result = items.filter((item) => item.id !== sourceId), index = beforeId === null ? result.length : result.findIndex((item) => item.id === beforeId);
  result.splice(index, 0, source);
  return result;
}

export function ReorderList<T extends { id: string }>({ items, scope, label, name, disabled = false, change, children }: {
  items: readonly T[]; scope: string; label: string; name: (item: T, index: number) => string; disabled?: boolean;
  change: (items: T[]) => void | Promise<unknown>; children: (item: T, index: number) => ReactNode;
}) {
  const id = useId(), host = useRef<HTMLDivElement>(null), pending = useRef(false), focus = useRef<string | null>(null);
  const drag = useRef<{ id: string; scope: string; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!focus.current || busy) return;
    const handle = [...host.current?.querySelectorAll<HTMLButtonElement>(".reorder-handle") ?? []].find((button) => button.dataset.reorderId === focus.current);
    if (handle) { handle.focus(); focus.current = null; }
  }, [items, busy]);
  const move = async (source: string, before: string | null) => {
    if (disabled || pending.current) return;
    setError("");
    try {
      const next = reorderItems(items, source, before);
      if (next.every((item, index) => item.id === items[index]?.id)) return;
      pending.current = true; setBusy(true);
      await change(next); focus.current = source;
    } catch (error) { setError(error instanceof Error ? error.message : "The list could not be reordered. Existing values were preserved."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div ref={host} className="reorder-list" role="list" aria-label={label} aria-busy={busy}>
    <span id={id} className="sr-only">Drag the handle to reorder. Alt+Up or Alt+Down moves this item with the keyboard.</span>
    {items.map((item, index) => <div key={item.id} className={`reorder-item${drop?.id === item.id ? drop.after ? " reorder-after" : " reorder-before" : ""}`} role="listitem"
      onDragOver={(event) => {
        if (!drag.current || disabled || busy || !event.dataTransfer.types.includes(MIME)) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect(); setDrop({ id: item.id, after: event.clientY >= bounds.top + bounds.height / 2 });
      }}
      onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(null); }}
      onDrop={(event) => {
        const intent = drag.current; if (!intent || !event.dataTransfer.types.includes(MIME)) return;
        event.preventDefault(); event.stopPropagation(); drag.current = null; setDrop(null);
        if (intent.scope !== scope || JSON.stringify(intent.ids) !== JSON.stringify(items.map((item) => item.id))) {
          setError("The original profile or list structure changed. Start the drag again; no newer arrangement was overwritten."); return;
        }
        if (intent.id === item.id) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        void move(intent.id, event.clientY < bounds.top + bounds.height / 2 ? item.id : items[index + 1]?.id ?? null);
      }}>
      <button type="button" className="icon-button reorder-handle" data-reorder-id={item.id} aria-label={`Reorder ${name(item, index)}`} aria-describedby={id}
        title="Drag to reorder; Alt+Up/Down with the keyboard" disabled={disabled || busy} draggable={!disabled && !busy}
        onDragStart={(event) => {
          event.stopPropagation();
          drag.current = { id: item.id, scope, ids: items.map((item) => item.id) };
          event.dataTransfer.setData(MIME, item.id); event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => { drag.current = null; setDrop(null); }}
        onKeyDown={(event) => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "ArrowUp" && index > 0) void move(item.id, items[index - 1]!.id);
          if (event.key === "ArrowDown" && index < items.length - 1) void move(item.id, items[index + 2]?.id ?? null);
        }}><Icon name="Grip" /></button>
      <div className="reorder-content">{children(item, index)}</div>
    </div>)}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
  </div>;
}
