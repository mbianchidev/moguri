import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const MenuSeparator = () => <div role="separator" className="menu-separator" />;
export interface WorkspaceMenuPoint { x: number; y: number; anchor: HTMLElement; trigger: HTMLElement | null }
export function WorkspaceContextMenu({ label, point, close, children }: {
  label: string; point: WorkspaceMenuPoint; close: (restore?: boolean) => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, point.x))}px`;
    element.style.top = `${Math.max(48, Math.min(window.innerHeight - bounds.height - 8, point.y))}px`;
    const first = element.querySelector<HTMLButtonElement>("button:not(:disabled)");
    // Action menus open on their first command; option menus open on the current choice.
    (first?.getAttribute("role") === "menuitem" ? first : element.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)') ?? first)?.focus();
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target) && !point.trigger?.contains(event.target)) close(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [close, point.trigger]);
  return createPortal(<div ref={ref} className="session-context-menu" role="menu" aria-label={label} style={{ left: point.x, top: point.y }}
    onClick={(event) => { if (event.target instanceof Element && event.target.closest("button")) close(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key === "Tab") { close(false); return; }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation();
        if (event.target instanceof Element) event.target.closest<HTMLButtonElement>("button:not(:disabled)")?.click();
        return;
      }
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const palette = horizontal && event.target instanceof Element ? event.target.closest(".project-color-palette") : null;
      if ((horizontal && !palette) || !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from((palette ?? ref.current)?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []), index = buttons.findIndex((button) => button === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>{children}</div>, document.body);
}
