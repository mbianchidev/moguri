import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface ChatMenu {
  id: string;
  label: string;
  sourceSessionId?: string;
  close(): void;
}
export const ChatMenuContext = createContext<{
  target: HTMLDivElement | null;
  activeId: string | null;
  register(menu: ChatMenu): () => void;
} | null>(null);

export function SidebarMenu({ id: suppliedId, label, sourceSessionId, close: onClose, trigger, className = "", children, focusOnOpen = true,
  role = "dialog" }: {
  id?: string; label: string; sourceSessionId?: string; close(): void; trigger?: RefObject<HTMLElement | null>;
  className?: string; children: ReactNode; focusOnOpen?: boolean; role?: "dialog" | "region";
}) {
  const host = useContext(ChatMenuContext), generatedId = useId(), id = suppliedId ?? generatedId;
  const panel = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);
  const originalFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const focused = useRef(false), active = !host || host.activeId === id;
  useLayoutEffect(() => host?.register({ id, label, sourceSessionId, close }), [host?.register, id, label, sourceSessionId, close]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!active || !element || !focusOnOpen || focused.current) return;
    const destination = element.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex="0"]');
    destination?.focus({ preventScroll: true });
    focused.current = true;
  }, [active, host?.target, focusOnOpen]);
  useLayoutEffect(() => {
    const element = panel.current;
    return () => {
      const destination = trigger?.current ?? originalFocus.current;
      if (destination?.isConnected && (document.activeElement === document.body || element?.contains(document.activeElement))) {
        requestAnimationFrame(() => {
          if (destination.isConnected && (document.activeElement === document.body || element?.contains(document.activeElement))) {
            destination.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [host?.target, trigger]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); }
    };
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || panel.current?.contains(event.target) || trigger?.current?.contains(event.target) ||
        host?.target?.closest("#session-sidebar")?.contains(event.target)) return;
      close();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", dismiss);
    return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", dismiss); };
  }, [active, close, host?.target, trigger]);
  const content = <div ref={panel} id={id} hidden={!active} className={`sidebar-menu ${className}`} role={role} aria-label={label}
    data-source-session-id={sourceSessionId} onKeyDown={(event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); }
    }}>{children}</div>;
  return host ? host.target && createPortal(content, host.target) : content;
}
