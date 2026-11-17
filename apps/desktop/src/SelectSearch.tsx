import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { wordMatch } from "../../../packages/protocol/src/search.ts";
import { Icon } from "./Icon.tsx";

/** Single-choice dropdowns with more than this many selectable options always open with search. */
export const SELECT_SEARCH_LIMIT = 7;
type Choice = { option: HTMLOptionElement; index: number; label: string; group: string | null; disabled: boolean };

const choices = (select: HTMLSelectElement): Choice[] => Array.from(select.options).filter((option) => !option.hidden).map((option, index) => {
  const group = option.parentElement instanceof HTMLOptGroupElement ? option.parentElement : null;
  return { option, index, label: option.label || option.text, group: group?.label ?? null, disabled: option.disabled || Boolean(group?.disabled) };
});
const searchable = (target: EventTarget | null): HTMLSelectElement | null => target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 &&
  !target.matches(":disabled") && choices(target).filter((choice) => !choice.disabled).length > SELECT_SEARCH_LIMIT ? target : null;
const selectName = (select: HTMLSelectElement) => {
  const named = select.getAttribute("aria-label")?.trim();
  if (named) return named;
  const label = select.labels?.[0];
  if (!label) return "options";
  const parts: string[] = [], walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement?.closest("select, button")) parts.push(node.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim() || "options";
};

/** Replaces the native popup of long single-choice selects with a searchable list; the native select keeps its value, events and form semantics. */
export function SelectSearch() {
  const [open, setOpen] = useState<{ select: HTMLSelectElement; query: string; key: number } | null>(null);
  const current = useRef(open), sequence = useRef(0);
  current.current = open;
  useEffect(() => {
    const show = (select: HTMLSelectElement, query = "") => setOpen({ select, query, key: ++sequence.current });
    const mousedown = (event: MouseEvent) => {
      const select = event.button === 0 ? searchable(event.target) : null;
      if (!select) return;
      event.preventDefault(); select.focus({ preventScroll: true });
      if (current.current?.select === select) setOpen(null); else show(select);
    };
    const keydown = (event: KeyboardEvent) => {
      const select = searchable(event.target);
      if (!select || current.current || event.metaKey || event.ctrlKey) return;
      const typed = !event.altKey && event.key.length === 1 && event.key !== " ";
      if (!typed && ![" ", "Enter", "ArrowDown", "ArrowUp", "F4"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); show(select, typed ? event.key : "");
    };
    document.addEventListener("mousedown", mousedown, true); document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("mousedown", mousedown, true); document.removeEventListener("keydown", keydown, true); };
  }, []);
  return open && <SelectSearchList key={open.key} select={open.select} initialQuery={open.query} close={(restore) => {
    setOpen((value) => value?.key === open.key ? null : value);
    if (restore && open.select.isConnected) open.select.focus({ preventScroll: true });
  }} />;
}

function SelectSearchList({ select, initialQuery, close }: { select: HTMLSelectElement; initialQuery: string; close: (restore: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), closeRef = useRef(close), id = useId();
  closeRef.current = close;
  const [query, setQuery] = useState(initialQuery), [revision, setRevision] = useState(0), [active, setActive] = useState<HTMLOptionElement | null>(null);
  const all = useMemo(() => choices(select), [select, revision]), name = useMemo(() => selectName(select), [select, revision]);
  const matches = all.filter((choice) => wordMatch(query, choice.label)), enabled = matches.filter((choice) => !choice.disabled);
  const highlighted = enabled.find((choice) => choice.option === active) ?? enabled.find((choice) => choice.option.selected) ?? enabled[0];
  const optionId = (choice: Choice) => `${id}-option-${choice.index}`;
  const host = select.closest<HTMLElement>("dialog, [popover]") ?? document.body;
  useLayoutEffect(() => {
    const element = panel.current!;
    element.showPopover();
    const position = () => {
      if (!select.isConnected) { closeRef.current(false); return; }
      const bounds = select.getBoundingClientRect(), width = Math.min(Math.max(bounds.width, 260), innerWidth - 24);
      const below = innerHeight - bounds.bottom - 18, above = bounds.top - 18, downward = below >= 220 || below >= above;
      element.style.width = `${width}px`; element.style.maxHeight = `${Math.max(160, Math.min(420, downward ? below : above))}px`;
      element.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - width - 12))}px`;
      element.style.top = `${downward ? bounds.bottom + 6 : Math.max(12, bounds.top - 6 - element.getBoundingClientRect().height)}px`;
    };
    const outside = (event: MouseEvent) => { if (event.target !== select && !(event.target instanceof Node && element.contains(event.target))) closeRef.current(false); };
    const resize = new ResizeObserver(position), mutations = new MutationObserver(() => setRevision((value) => value + 1));
    resize.observe(element); resize.observe(select);
    mutations.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
    position(); addEventListener("resize", position); addEventListener("scroll", position, true);
    document.addEventListener("mousedown", outside, true);
    input.current?.focus({ preventScroll: true });
    return () => {
      resize.disconnect(); mutations.disconnect(); removeEventListener("resize", position); removeEventListener("scroll", position, true);
      document.removeEventListener("mousedown", outside, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [select]);
  useEffect(() => { if (highlighted) document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" }); }, [highlighted?.option]);
  const choose = (choice: Choice) => {
    if (choice.disabled || !choice.option.isConnected || choice.option.closest("select") !== select || select.matches(":disabled")) { close(true); return; }
    if (!choice.option.selected) {
      choice.option.selected = true;
      select.dispatchEvent(new Event("input", { bubbles: true })); select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  };
  const move = (delta: number) => {
    if (!enabled.length) return;
    const index = highlighted ? enabled.indexOf(highlighted) : -1;
    setActive(enabled[Math.max(0, Math.min(enabled.length - 1, index + delta))]!.option);
  };
  const sections: { group: string | null; items: Choice[] }[] = [];
  for (const choice of matches) {
    const last = sections.at(-1);
    if (last && last.group === choice.group) last.items.push(choice); else sections.push({ group: choice.group, items: [choice] });
  }
  const option = (choice: Choice) => <div key={choice.index} id={optionId(choice)} role="option" aria-selected={choice.option.selected} aria-disabled={choice.disabled || undefined}
    className={`select-search-option${choice === highlighted ? " active" : ""}`} onMouseMove={() => { if (!choice.disabled) setActive(choice.option); }} onClick={() => choose(choice)}>
    <span>{choice.label}</span>{choice.option.selected && <Icon name="Check" />}</div>;
  return createPortal(<div ref={panel} className="select-search" popover="manual" role="dialog" aria-label={`Choose ${name}`}
    onMouseDown={(event) => { if (event.target !== input.current) event.preventDefault(); }}>
    <input ref={input} type="search" className="select-search-input" role="combobox" aria-label={`Search ${name}`} aria-expanded="true" aria-autocomplete="list"
      aria-controls={`${id}-list`} aria-activedescendant={highlighted ? optionId(highlighted) : undefined} placeholder="Search" spellCheck={false} autoComplete="off" value={query}
      onChange={(event) => { setQuery(event.target.value); setActive(null); }} onKeyDown={(event) => {
        const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key];
        if (step) { event.preventDefault(); move(step); return; }
        if (event.key === "Enter") { event.preventDefault(); if (highlighted) choose(highlighted); return; }
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); close(true); }
      }} />
    <div id={`${id}-list`} className="select-search-list" role="listbox" aria-label={name}>
      {sections.map((section, index) => section.group === null ? section.items.map(option) :
        <div key={`group-${index}`} role="group" aria-labelledby={`${id}-group-${index}`}>
          <div id={`${id}-group-${index}`} className="select-search-group">{section.group}</div>{section.items.map(option)}</div>)}
    </div>
    {!matches.length && <p className="select-search-empty" role="status">No matches</p>}
  </div>, host);
}
