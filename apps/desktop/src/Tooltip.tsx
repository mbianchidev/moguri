import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.tsx";

interface HintAction { label: string; select: () => void }
export function Tooltip({ children, content, openOnClick = false, disabled = false, action, dialogLabel }: {
  children: ReactElement<AriaAttributes>; content: ReactNode; openOnClick?: boolean; disabled?: boolean; action?: HintAction; dialogLabel?: string;
}) {
  const id = useId(), trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusAction = useRef(false);
  const keyboardFocus = useRef(false);
  const focusTrigger = () => trigger.current?.querySelector<HTMLElement>("button,a[href],input,select,textarea,[tabindex]")?.focus();
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
      if (action && popup.current?.contains(document.activeElement)) focusTrigger();
      setOpen(false);
    } };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", escape, true); document.addEventListener("pointerdown", dismiss, true);
    return () => { document.removeEventListener("keydown", escape, true); document.removeEventListener("pointerdown", dismiss, true); };
  }, [open, disabled, action]);
  useLayoutEffect(() => {
    if (open && action && focusAction.current) { focusAction.current = false; popup.current?.querySelector("button")?.focus(); }
  }, [open, action]);
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
    onKeyDown={(event) => {
      keyboardFocus.current = true;
      if (action && open && event.key === "Tab" && !event.shiftKey && event.target instanceof Node && !popup.current?.contains(event.target)) {
        event.preventDefault(); popup.current?.querySelector("button")?.focus();
      }
    }}
    onClick={openOnClick ? (event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      show();
      if (action && event.detail === 0) {
        keyboardFocus.current = true;
        if (popup.current) popup.current.querySelector("button")?.focus();
        else focusAction.current = true;
      }
    } : undefined}>
    {cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], open && !disabled ? action ? `${id}-description` : id : null].filter(Boolean).join(" ") || undefined,
      ...(action ? { "aria-haspopup": "dialog", "aria-expanded": open && !disabled, "aria-controls": open && !disabled ? id : undefined } : {}) })}
    {open && !disabled && createPortal(<div ref={popup} id={id} role={action ? "dialog" : "tooltip"} aria-label={action ? dialogLabel ?? action.label : undefined}
      className={`compact-tooltip${action ? " policy-tooltip" : ""}`} style={position} onMouseEnter={show} onMouseLeave={leave}
      onKeyDown={(event) => {
        if (action && event.key === "Tab") {
          if (event.shiftKey) event.preventDefault();
          focusTrigger(); setOpen(false);
        }
      }}>{action ? <><div id={`${id}-description`}>{content}</div><button type="button" className="quiet" onClick={(event) => {
        event.stopPropagation(); setOpen(false); action.select();
      }}>{action.label}<Icon name="Link" /></button></> : content}</div>, trigger.current?.closest("dialog, [popover]") ?? document.body)}
  </span>;
}

export function InfoTip({ label, children, action }: { label: string; children: ReactNode; action?: HintAction }) {
  return <span className="setting-help"><Tooltip content={children} openOnClick action={action} dialogLabel={label}>
    <button type="button" className="icon-button info-button" aria-label={label}><Icon name="Info" /></button>
  </Tooltip></span>;
}
