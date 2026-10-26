import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.tsx";

export function Tooltip({ children, content, openOnClick = false }: {
  children: ReactElement<AriaAttributes>; content: ReactNode; openOnClick?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!trigger.current?.matches(":focus-within") && !popup.current?.matches(":hover")) setOpen(false);
    }, 100);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", escape, true); document.addEventListener("pointerdown", dismiss, true);
    return () => { document.removeEventListener("keydown", escape, true); document.removeEventListener("pointerdown", dismiss, true); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = popup.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left)),
        top: anchor.bottom + box.height + 14 > window.innerHeight ? Math.max(8, anchor.top - box.height - 6) : anchor.bottom + 6 });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, content]);
  return <span ref={trigger} className="tooltip-trigger" onMouseEnter={show} onMouseLeave={leave} onFocus={show}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onClick={openOnClick ? show : undefined}>
    {cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], open ? id : null].filter(Boolean).join(" ") || undefined })}
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className="compact-tooltip" style={position}
      onMouseEnter={show} onMouseLeave={leave}>{content}</div>, trigger.current?.closest("dialog") ?? document.body)}
  </span>;
}

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="setting-help"><Tooltip content={children} openOnClick>
    <button type="button" className="icon-button info-button" aria-label={label}><Icon name="Info" /></button>
  </Tooltip></span>;
}
