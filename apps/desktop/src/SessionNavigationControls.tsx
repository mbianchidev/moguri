import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { SessionNavigationStatus, SessionPromptOrder } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { WorkspaceContextMenu, type WorkspaceMenuPoint } from "./WorkspaceContextMenu.tsx";

const statuses: Array<{ value: SessionNavigationStatus; label: string }> = [
  { value: "finished", label: "Finished" }, { value: "error", label: "Error" },
  { value: "attention", label: "Needs attention" }, { value: "progress", label: "In progress" },
];
const orders: Array<{ value: SessionPromptOrder; label: string }> = [
  { value: "default", label: "Default order" }, { value: "newest", label: "Newest prompt first" }, { value: "oldest", label: "Oldest prompt first" },
];
export function SessionNavigationControls({ search, changeSearch, filters, changeFilters, order, changeOrder, statusId, menuChanged, children }: {
  search: string; changeSearch: (value: string) => void; filters: SessionNavigationStatus[]; changeFilters: (values: SessionNavigationStatus[]) => void;
  order: SessionPromptOrder; changeOrder: (value: SessionPromptOrder) => void; statusId: string; menuChanged: (open: boolean) => void; children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  const [menu, setMenu] = useState<(WorkspaceMenuPoint & { kind: "filter" | "order" }) | null>(null);
  useEffect(() => { menuChanged(Boolean(menu)); return () => menuChanged(false); }, [Boolean(menu), menuChanged]);
  const close = (restore = true) => { const anchor = menu?.anchor; setMenu(null); if (restore) queueMicrotask(() => { if (anchor?.isConnected) anchor.focus(); }); };
  const open = (kind: "filter" | "order", anchor: HTMLButtonElement) => {
    if (menu?.kind === kind) { close(); return; }
    const bounds = anchor.getBoundingClientRect(); setMenu({ kind, x: bounds.left, y: bounds.bottom, anchor, trigger: anchor });
  };
  return <div className="workspace-navigation-controls">
    <div className="workspace-navigation-tools">
      <button ref={trigger} type="button" className="icon-button" aria-label="Search sessions" title="Search chats and projects"
        aria-expanded={searchOpen} aria-controls={searchOpen ? id : undefined} aria-pressed={Boolean(search)}
        onClick={() => { if (searchOpen) changeSearch(""); setSearchOpen(!searchOpen); }}><Icon name="Search" /></button>
      <button type="button" className="icon-button" aria-label="Filter sessions" title="Filter by session status" aria-haspopup="menu"
        aria-expanded={menu?.kind === "filter"} aria-pressed={filters.length > 0} onClick={(event) => open("filter", event.currentTarget)}><Icon name="Filter" /></button>
      <button type="button" className="icon-button" aria-label="Order sessions" title="Order by the latest sent prompt; unsent chats use creation time"
        aria-description="Shows one flat list of sessions from every project, group and folder by newest or oldest latest-prompt time; unsent chats use creation time." aria-haspopup="menu"
        aria-expanded={menu?.kind === "order"} aria-pressed={order !== "default"} onClick={(event) => open("order", event.currentTarget)}><Icon name="Sort" /></button>
      {(filters.length > 0 || order !== "default") && <button type="button" className="quiet nav-reset" aria-label="Reset session filters and ordering"
        onClick={() => { changeFilters([]); changeOrder("default"); }}>Reset</button>}
      {children}
    </div>
    {searchOpen && <search id={id} className="workspace-session-search" aria-label="Chats and projects"><input ref={input} autoFocus type="search" aria-label="Search sessions" aria-describedby={statusId}
      placeholder="Find chats or projects" value={search} onChange={(event) => changeSearch(event.target.value)} onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.stopPropagation();
        if (search) changeSearch(""); else { setSearchOpen(false); trigger.current?.focus(); }
      }} />
      {search && <button type="button" className="icon-button" aria-label="Clear session search" title="Clear search (Escape)" onClick={() => { changeSearch(""); input.current?.focus(); }}><Icon name="Close" /></button>}
    </search>}
    {menu && <WorkspaceContextMenu label={menu.kind === "filter" ? "Session status filters" : "Session ordering"} point={menu} close={close}>
      {menu.kind === "filter" ? statuses.map((status) => <button key={status.value} type="button" role="menuitemcheckbox" aria-checked={filters.includes(status.value)}
        onClick={() => changeFilters(filters.includes(status.value) ? filters.filter((value) => value !== status.value) : [...filters, status.value])}>
        <Icon name={filters.includes(status.value) ? "Check" : "Circle"} />{status.label}</button>) :
        orders.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={order === option.value}
          onClick={() => changeOrder(option.value)}><Icon name={order === option.value ? "Check" : "Circle"} />{option.label}</button>)}
    </WorkspaceContextMenu>}
  </div>;
}
