import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

export function AnchoredMenu({ label, trigger, close, className = "", children }: {
  label: string; trigger: RefObject<HTMLElement | null>; close(): void; className?: string; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null), closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    const element = panel.current, anchor = trigger.current;
    if (!element || !anchor) return;
    element.showPopover();
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      element.style.width = `${Math.min(300, innerWidth - 24)}px`;
      const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(12, Math.min(bounds.right - box.width, innerWidth - box.width - 12))}px`;
      element.style.top = `${bounds.bottom + box.height + 6 <= innerHeight - 12 ? bounds.bottom + 6 : Math.max(12, bounds.top - box.height - 6)}px`;
    };
    const observer = new ResizeObserver(position); observer.observe(element); observer.observe(anchor);
    position(); addEventListener("resize", position); addEventListener("scroll", position, true);
    element.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    return () => {
      observer.disconnect(); removeEventListener("resize", position); removeEventListener("scroll", position, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [trigger]);
  return <div ref={panel} className={`anchored-menu ${className}`} popover="auto" role="dialog" aria-label={label} onToggle={(event) => {
    if (event.newState !== "closed") return;
    if (document.activeElement === document.body || panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
    closeRef.current();
  }}>{children}</div>;
}
