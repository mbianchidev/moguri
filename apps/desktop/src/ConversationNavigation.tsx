import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ConversationNavigationEntry } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { Alert } from "./Alert.tsx";

const preview = (text: string) => {
  const value = text.replace(/\s+/g, " ").trim();
  const characters = Array.from(value);
  return characters.length > 120 ? `${characters.slice(0, 117).join("")}...` : value;
};
export function ConversationNavigation({ entries, viewport, renderedFrom, label, onNavigate }: {
  entries: ConversationNavigationEntry[]; viewport: RefObject<HTMLDivElement | null>; renderedFrom: number; label: string;
  onNavigate: (entry: ConversationNavigationEntry) => void;
}) {
  const [compact, setCompact] = useState(true), [expanded, setExpanded] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null), [pending, setPending] = useState<string | null>(null), [error, setError] = useState("");
  const list = useRef<HTMLOListElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const listId = useId(), key = JSON.stringify(entries.map((entry) => entry.id));
  useLayoutEffect(() => {
    if (!pending) return;
    const view = viewport.current, target = view && [...view.querySelectorAll<HTMLElement>("[data-conversation-anchor]")].find((element) => element.dataset.conversationAnchor === pending);
    if (!view || !target) { setError("This conversation point is no longer available. Choose an original turn in this chat."); setPending(null); return; }
    view.scrollTo({ top: Math.max(0, view.scrollTop + target.getBoundingClientRect().top - view.getBoundingClientRect().top - 12), behavior: "instant" });
    const item = [...list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []].find((button) => button.dataset.turnEntry === pending);
    item?.focus({ preventScroll: true });
    setActive(pending); setPending(null);
  }, [pending, renderedFrom, viewport]);
  useEffect(() => {
    const view = viewport.current, container = view?.parentElement;
    if (!view || !container) return;
    let frame = 0;
    const update = () => {
      frame = 0; setCompact(container.clientWidth < 560);
      const top = view.getBoundingClientRect().top + 24;
      let current: string | null = null;
      for (const target of view.querySelectorAll<HTMLElement>("[data-conversation-anchor]")) {
        if (target.getBoundingClientRect().top > top && current) break;
        current = target.dataset.conversationAnchor ?? null;
        if (target.getBoundingClientRect().top > top) break;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(view); observer.observe(container); if (view.firstElementChild) observer.observe(view.firstElementChild);
    view.addEventListener("scroll", schedule, { passive: true }); schedule();
    return () => { observer.disconnect(); view.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); };
  }, [key, renderedFrom, viewport]);
  useEffect(() => {
    const view = list.current, target = view?.querySelector<HTMLButtonElement>('button[aria-current="location"]');
    if (!view || !target) return;
    const bounds = view.getBoundingClientRect(), item = target.getBoundingClientRect();
    if (item.top < bounds.top || item.height > bounds.height) view.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) view.scrollTop += item.bottom - bounds.bottom;
  }, [active, expanded]);
  return <nav className={`turn-navigation${expanded ? " expanded" : ""}`} aria-label={label} data-compact={compact} onKeyDown={(event) => {
    if (event.key === "Escape" && expanded) { event.preventDefault(); setExpanded(false); toggle.current?.focus(); }
  }}>
    <header><strong>Turns</strong><button ref={toggle} type="button" className="icon-button" aria-label="Show turn previews" aria-expanded={expanded} aria-controls={listId}
      title={expanded ? "Collapse turn previews" : "Expand turn previews"} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? "ChevronRight" : "ChevronLeft"} /></button></header>
    <ol ref={list} id={listId}>{entries.map((entry, index) => {
      const text = preview(entry.text), answer = entry.kind === "answer" ? preview(entry.answer) : null;
      return <li key={entry.id}><Tooltip disabled={expanded} content={<>{text}{answer !== null && <><br /><span>Your answer: {answer}</span></>}</>}>
        <button type="button" data-turn-entry={entry.id} aria-label={`${entry.kind === "prompt" ? "Prompt" : "Answer"} ${index + 1}: ${text}${answer === null ? "" : ` Your answer: ${answer}`}`}
          aria-current={active === entry.id ? "location" : undefined} onClick={() => {
            setError(""); setSelected(entry.id);
            if (expanded && selected === entry.id) { setExpanded(false); return; }
            setExpanded(true); onNavigate(entry); setPending(entry.id);
          }}><span className="turn-navigation-marker" aria-hidden="true">{expanded ? entry.kind === "answer" ? <Icon name="Question" /> : index + 1 : null}</span>
          {expanded && <span className="turn-navigation-preview"><span>{entry.text}</span>{entry.kind === "answer" && <small>Your answer: {entry.answer}</small>}</span>}
        </button>
      </Tooltip></li>;
    })}</ol>
    {error && <Alert as="p" className="turn-navigation-error inline-error" role="alert">{error}</Alert>}
  </nav>;
}

export function AnsweredQuestion({ entry }: { entry: Extract<ConversationNavigationEntry, { kind: "answer" }> }) {
  return <article className="message user answered-question" aria-label="Answered question" data-conversation-anchor={entry.id} tabIndex={-1}>
    <header><strong>You answered</strong><time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>
    <p className="answered-question-prompt"><Icon name="Question" /><span>{entry.text}</span></p>
    <p className="answered-question-text">{entry.answer}</p>
  </article>;
}
