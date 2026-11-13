import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.tsx";

interface HintAction { label: string; select: () => void }
export function Tooltip({ children, content, openOnClick = false, disabled = false }: {
  children: ReactElement<AriaAttributes>; content: ReactNode; openOnClick?: boolean; disabled?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyboardFocus = useRef(false);
  const show = () => { if (!disabled) { clearTimeout(closeTimer.current); setOpen(true); } };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const focused = keyboardFocus.current && (trigger.current?.querySelector(":focus-visible") || popup.current?.contains(document.activeElement));
      if (!focused && !popup.current?.matches(":hover")) setOpen(false);
    }, 100);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || disabled) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      setOpen(false);
    } };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", escape, true); document.addEventListener("pointerdown", dismiss, true);
    return () => { document.removeEventListener("keydown", escape, true); document.removeEventListener("pointerdown", dismiss, true); };
  }, [open, disabled]);
  useLayoutEffect(() => {
    if (!open || disabled) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = popup.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left)),
        top: anchor.bottom + box.height + 14 > window.innerHeight ? Math.max(8, anchor.top - box.height - 6) : anchor.bottom + 6 });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, content, disabled]);
  return <span ref={trigger} className="tooltip-trigger" onMouseEnter={show} onMouseLeave={leave}
    onPointerDownCapture={() => { keyboardFocus.current = false; }}
    onFocus={(event) => { if (event.target instanceof Element && event.target.matches(":focus-visible")) { keyboardFocus.current = true; show(); } }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={() => { keyboardFocus.current = true; }}
    onClick={openOnClick ? (event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      show();
    } : undefined}>
    {cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], open && !disabled ? id : null].filter(Boolean).join(" ") || undefined })}
    {open && !disabled && createPortal(<div ref={popup} id={id} role="tooltip"
      className="compact-tooltip" style={position} onMouseEnter={show} onMouseLeave={leave}>{content}</div>, trigger.current?.closest("dialog, [popover]") ?? document.body)}
  </span>;
}

export function InfoTip({ label, children, action }: { label: string; children: ReactNode; action?: HintAction }) {
  const [open, setOpen] = useState(false), button = useRef<HTMLButtonElement>(null), id = useId();
  return <span className={`setting-help${open ? " inline-policy-help" : ""}`} onKeyDown={(event) => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
  }}><Tooltip content={children} openOnClick={!action} disabled={open}>
    <button ref={button} type="button" className="icon-button info-button" aria-label={label} aria-expanded={action ? open : undefined}
      aria-controls={open ? id : undefined} onClick={action ? () => setOpen((value) => !value) : undefined}><Icon name="Info" /></button>
  </Tooltip>{open && action && <span id={id} className="inline-help-body" role="region" aria-label={label}>{children}
    <button type="button" className="quiet" onClick={() => { setOpen(false); action.select(); }}>{action.label}<Icon name="Link" /></button>
  </span>}</span>;
}
