import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon.tsx";

export function ModelSubmenu({ label, text, value, open, disabled, toggle, close, children }: {
  label: string; text: string; value: string; open: boolean; disabled?: boolean;
  toggle: () => void; close: () => void; children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    const element = panel.current, anchor = button.current;
    if (!open || !element || !anchor) return;
    element.showPopover();
    const place = () => {
      const bounds = anchor.getBoundingClientRect(), parent = anchor.closest(".composer-popover")!.getBoundingClientRect();
      element.style.width = `${Math.min(300, innerWidth - 24)}px`;
      element.style.maxHeight = `${Math.max(100, innerHeight - 80)}px`;
      const box = element.getBoundingClientRect();
      const left = parent.right + box.width + 8 < innerWidth ? parent.right + 6 : parent.left - box.width - 6 > 12 ? parent.left - box.width - 6 : Math.max(12, innerWidth - box.width - 12);
      element.style.left = `${left}px`; element.style.top = `${Math.max(48, Math.min(bounds.top, innerHeight - box.height - 12))}px`;
    };
    const observer = new ResizeObserver(place); observer.observe(element); observer.observe(anchor);
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    const focused = element.querySelector<HTMLInputElement>("input") ?? element.querySelector<HTMLElement>('[aria-checked="true"]:not([aria-disabled="true"])') ??
      element.querySelector<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])');
    focused?.focus({ preventScroll: true });
    if (focused && !("value" in focused)) {
      const scroller = focused.closest(".composer-model-list") ?? element, bounds = scroller.getBoundingClientRect(), selected = focused.getBoundingClientRect();
      if (selected.top < bounds.top) scroller.scrollTop += selected.top - bounds.top;
      else if (selected.bottom > bounds.bottom) scroller.scrollTop += selected.bottom - bounds.bottom;
    }
    return () => {
      observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      if (button.current?.isConnected && (element.contains(document.activeElement) || document.activeElement === document.body)) button.current.focus({ preventScroll: true });
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [open]);
  return <><button ref={button} type="button" className="model-setting-row" aria-label={label} aria-haspopup="menu" aria-expanded={open}
    aria-controls={open ? id : undefined} disabled={disabled} onClick={toggle} onKeyDown={(event) => {
      if (event.key === "ArrowRight" && !open) { event.preventDefault(); toggle(); }
    }}><span>{text}</span><small>{value}</small><Icon name="ChevronRight" /></button>
    {open && <div ref={panel} id={id} role="menu" aria-label={text === "Model" ? "Models" : label} className="model-cascade-menu" popover="manual" onKeyDown={(event) => {
      if (["Escape", "ArrowLeft"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])')];
      const index = items.findIndex((item) => item === document.activeElement), next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    }}>{children}</div>}
  </>;
}
