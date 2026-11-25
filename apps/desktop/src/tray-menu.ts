import { compareSessionPriority, defaultProjectConfiguration, parseShortcut, sessionIndicator, type Session, type Snapshot } from "@moguri-dev/sdk";

/** What a tray click asks for. Renderer actions reuse the window's own flows (confirmations, unsaved-edit guards). */
export type TrayAction =
  | { kind: "open-app" } | { kind: "settings" } | { kind: "new-chat" } | { kind: "new-project" }
  | { kind: "new-session"; projectId: string }
  | { kind: "open-session"; sessionId: string } | { kind: "stop"; sessionId: string } | { kind: "archive"; sessionId: string };
export type RendererTrayAction = Extract<TrayAction, { kind: "new-chat" | "new-project" | "new-session" | "archive" }>;
export type TrayItem =
  | { type: "label"; label: string }
  | { type: "separator" }
  | { type: "action"; label: string; action: TrayAction; accelerator?: string }
  | { type: "submenu"; label: string; items: TrayItem[] }
  | { type: "quit"; label: string };
export const TRAY_SESSION_LIMIT = 25;
export const DEFAULT_OPEN_APP_SHORTCUT = "Primary+Shift+KeyO";

const ellipsis = (text: string, limit: number) => {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("").trimEnd()}…` : chars.join("");
};
const STATUS: Partial<Record<ReturnType<typeof sessionIndicator>["kind"], string>> = { running: "Working", question: "Needs you", approval: "Needs you", failed: "Failed" };

/** Structural subset of Electron's MenuItemConstructorOptions, so this module stays free of Electron imports. */
export interface TrayMenuOption {
  label?: string; type?: "separator"; enabled?: false; role?: "quit"; accelerator?: string; registerAccelerator?: false;
  submenu?: TrayMenuOption[]; click?: () => void;
}
export function trayTemplate(items: TrayItem[], click: (action: TrayAction) => void): TrayMenuOption[] {
  return items.map((item) => item.type === "separator" ? { type: "separator" } : item.type === "label" ? { label: item.label, enabled: false } :
    item.type === "quit" ? { label: item.label, role: "quit" } :
      item.type === "submenu" ? { label: item.label, submenu: trayTemplate(item.items, click) } :
        { label: item.label, ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false as const } : {}), click: () => click(item.action) });
}
/** Electron accelerator for a Moguri shortcut, or null for "none". */
export function electronAccelerator(value: string): string | null {
  const shortcut = parseShortcut(value);
  if (!shortcut) return null;
  return [shortcut.primary ? "CommandOrControl" : "", shortcut.control ? "Control" : "", shortcut.meta ? "Command" : "", shortcut.alt ? "Alt" : "", shortcut.shift ? "Shift" : "",
    shortcut.code.replace(/^Key|^Digit/, "")].filter(Boolean).join("+");
}

/** Ordinary top-level chats the tray lists, in sidebar order: projects first, then project-free chats. */
export function traySessions(snapshot: Snapshot): { title: string; sessions: Session[] }[] {
  const listed = snapshot.sessions.filter((session) => session.status !== "archived" && session.kind === "agent" && session.purpose !== "kanban");
  const ids = new Set(listed.map((session) => session.id));
  const top = listed.filter((session) => !session.parentSessionId || !ids.has(session.parentSessionId));
  const order = (projectId: string) => (snapshot.projectConfigurations.find((entry) => entry.projectId === projectId) ?? defaultProjectConfiguration(projectId)).order ?? 0;
  const projects = [...snapshot.projects].sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));
  const sort = (sessions: Session[]) => sessions.sort((a, b) => compareSessionPriority(a, b, snapshot));
  return [...projects.map((project) => ({ title: project.name, sessions: sort(top.filter((session) => session.projectId === project.id)) })),
    { title: "Chats", sessions: sort(top.filter((session) => session.projectId === null)) }].filter((group) => group.sessions.length);
}

export function trayMenu(snapshot: Snapshot | null, options: { openShortcut: string | null; limit?: number }): TrayItem[] {
  const open: TrayItem = { type: "action", label: "Open Moguri", action: { kind: "open-app" }, ...(options.openShortcut ? { accelerator: options.openShortcut } : {}) };
  const tail: TrayItem[] = [{ type: "separator" }, open, { type: "action", label: "Settings…", action: { kind: "settings" } }, { type: "separator" }, { type: "quit", label: "Quit" }];
  if (!snapshot) return [{ type: "label", label: "Connecting…" }, ...tail];
  const groups = traySessions(snapshot), total = groups.reduce((sum, group) => sum + group.sessions.length, 0), limit = options.limit ?? TRAY_SESSION_LIMIT;
  // Over the limit, keep the sessions that need you or are working, then the sidebar's own priority order.
  const urgent = (session: Session) => ["running", "question", "approval"].includes(sessionIndicator(session, snapshot).kind);
  const shown = new Set(groups.flatMap((group) => group.sessions).sort((a, b) => Number(urgent(b)) - Number(urgent(a)) || compareSessionPriority(a, b, snapshot)).slice(0, limit).map((session) => session.id));
  const items: TrayItem[] = [{ type: "label", label: total ? `${total} ${total === 1 ? "session" : "sessions"}` : "No sessions" }];
  if (total) items.push({ type: "separator" });
  for (const group of groups) {
    const sessions = group.sessions.filter((session) => shown.has(session.id));
    if (!sessions.length) continue;
    items.push({ type: "label", label: ellipsis(group.title, 40) });
    for (const session of sessions) {
      const indicator = sessionIndicator(session, snapshot), status = STATUS[indicator.kind], working = indicator.kind === "running";
      const title = session.titleSource === "factory" ? "New session" : session.title;
      const pr = indicator.prUrl && indicator.pr ? `PR #${indicator.pr.number} · ${indicator.prState === "unknown" ? "linked" : indicator.prState}` : null;
      items.push({ type: "submenu", label: status ? `${ellipsis(title, 30)} · ${status}` : ellipsis(title, 44), items: [
        { type: "label", label: [indicator.label, pr].filter(Boolean).join(" · ") },
        { type: "separator" },
        { type: "action", label: "Open", action: { kind: "open-session", sessionId: session.id } },
        ...(working && session.status !== "stopping" ? [{ type: "action" as const, label: "Stop", action: { kind: "stop" as const, sessionId: session.id } }] : []),
        ...(working ? [] : [{ type: "action" as const, label: "Archive…", action: { kind: "archive" as const, sessionId: session.id } }]),
      ] });
    }
  }
  if (total > shown.size) items.push({ type: "action", label: `${total - shown.size} more in Moguri…`, action: { kind: "open-app" } });
  const projects = [...snapshot.projects].sort((a, b) => a.name.localeCompare(b.name));
  items.push({ type: "separator" },
    { type: "submenu", label: "Create Session…", items: projects.length ? projects.slice(0, 40).map((project) =>
      ({ type: "action" as const, label: ellipsis(project.name, 44), action: { kind: "new-session" as const, projectId: project.id } })) : [{ type: "label", label: "No projects yet" }] },
    { type: "action", label: "New Chat", action: { kind: "new-chat" } },
    { type: "action", label: "New Project", action: { kind: "new-project" } },
    ...tail);
  return items;
}
