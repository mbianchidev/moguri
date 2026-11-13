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
    const focused = element.querySelector<HTMLInputElement>("input") ?? element.querySelector<HTMLElement>('[aria-checked="true"]:not([aria-disabled="true"])') ??
      element.querySelector<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])');
    focused?.focus({ preventScroll: true });
    if (focused && !("value" in focused)) {
      const scroller = focused.closest(".composer-model-list") ?? element, bounds = scroller.getBoundingClientRect(), selected = focused.getBoundingClientRect();
      if (selected.top < bounds.top) scroller.scrollTop += selected.top - bounds.top;
      else if (selected.bottom > bounds.bottom) scroller.scrollTop += selected.bottom - bounds.bottom;
    }
    return () => {
      if (button.current?.isConnected && (element.contains(document.activeElement) || document.activeElement === document.body)) button.current.focus({ preventScroll: true });
    };
  }, [open]);
  return <><button ref={button} type="button" className="model-setting-row" aria-label={label} aria-haspopup="menu" aria-expanded={open}
    aria-controls={open ? id : undefined} disabled={disabled} onClick={toggle} onKeyDown={(event) => {
      if (event.key === "ArrowRight" && !open) { event.preventDefault(); toggle(); }
    }}><span>{text}</span><small>{value}</small><Icon name={open ? "Down" : "ChevronRight"} /></button>
    {open && <div ref={panel} id={id} role="menu" aria-label={text === "Model" ? "Models" : label} className="model-cascade-menu" onKeyDown={(event) => {
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
