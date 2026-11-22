import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ANALYTICS_LANES, outcomeLabel, sessionStatusLabel, type StatusLabel, type AnalyticsEvent, type AnalyticsLane, type AnalyticsOverview, type AnalyticsSessionDetail, type AnalyticsSessionSummary, type MoguriSdk } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const LANES: Record<AnalyticsLane, string> = { prompt: "Prompts", answer: "Answers", thinking: "Thinking", command: "Commands", file: "Files", web: "Web", tool: "Tools", context: "Context" };
// Analytics states use the shared status vocabulary so they read the same as navigation and Insights.
const STATUS: Record<AnalyticsEvent["status"], StatusLabel> = { running: outcomeLabel("running"), ok: outcomeLabel("completed"), failed: outcomeLabel("failed"), stopped: outcomeLabel("stopped") };
const STATE: Record<AnalyticsSessionSummary["state"], StatusLabel> = { working: sessionStatusLabel("running"), waiting: sessionStatusLabel("waiting_input"), idle: sessionStatusLabel("idle") };
const POLL_MS = 2_000, MIN_SPAN = 2_000, CLUSTER_PX = 10, BAR_PX = 8;
const TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600].map((seconds) => seconds * 1_000);
type Range = { from: number; to: number };
type Mark = { kind: "bar"; event: AnalyticsEvent; x: number; w: number } | { kind: "dot"; event: AnalyticsEvent; x: number } | { kind: "cluster"; events: AnalyticsEvent[]; x: number };

const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const duration = (ms: number) => ms < 1_000 ? `${Math.max(0, Math.round(ms))} ms` : ms < 60_000 ? `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)} s` :
  ms < 3_600_000 ? `${Math.floor(ms / 60_000)} min ${Math.round(ms % 60_000 / 1_000)} s` : `${(ms / 3_600_000).toFixed(1)} h`;
const ago = (ms: number) => ms < 60_000 ? "just now" : ms < 3_600_000 ? `${Math.floor(ms / 60_000)} min ago` : `${Math.floor(ms / 3_600_000)} h ago`;
const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e4 ? `${Math.round(value / 1e3)}k` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : String(value);
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`;
const failure = (error: unknown) => error instanceof Error ? error.message : "Analytics is unavailable right now.";
const searchable = (event: AnalyticsEvent) => `${event.label} ${event.detail} ${event.tool ?? ""} ${event.modelId ?? ""}`.toLowerCase();

/** Polls the service's in-memory analytics while mounted and visible. Nothing is cached on the client. */
function usePoll<T>(read: (() => Promise<T>) | null, onError: (message: string) => void): T | null {
  const [value, setValue] = useState<{ read: unknown; value: T } | null>(null);
  useEffect(() => {
    if (!read) return;
    let active = true;
    const tick = () => { if (!document.hidden) void read().then((next) => { if (active) setValue({ read, value: next }); }, (error: unknown) => { if (active) onError(failure(error)); }); };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [read]);
  return value && value.read === read ? value.value : null;
}

export function AnalyticsView({ sdk, connected, openSession }: { sdk: MoguriSdk; connected: boolean; openSession: (id: string) => void }) {
  const [error, setError] = useState(""), [chosen, setChosen] = useState<string | null>(null), [filter, setFilter] = useState("");
  const readOverview = useMemo(() => connected ? () => sdk.analytics.overview() : null, [sdk, connected]);
  const overview = usePoll(readOverview, setError);
  const sessionId = overview?.sessions.some((session) => session.sessionId === chosen) ? chosen : overview?.sessions[0]?.sessionId ?? null;
  const readSession = useMemo(() => connected && sessionId ? () => sdk.analytics.session(sessionId) : null, [sdk, connected, sessionId]);
  const detail = usePoll(readSession, setError);
  useEffect(() => { if (overview) setError(""); }, [overview]);
  if (!connected) return <section className="analytics" aria-label="Analytics"><p className="analytics-empty">Analytics needs the connected service. Nothing is stored to show offline.</p></section>;
  return <section className="analytics" aria-label="Analytics">
    <header className="analytics-head">
      <Stats overview={overview} />
      <p className="analytics-retention">In memory only. Last {Math.round((overview?.windowMs ?? 3_600_000) / 60_000)} min, cleared every {Math.round((overview?.pruneEveryMs ?? 30_000) / 1_000)} s, never saved.</p>
    </header>
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {!overview ? <p role="status" className="analytics-empty">Reading live sessions...</p> : !overview.sessions.length ?
      <p className="analytics-empty">No running or recent sessions. Start a turn and it shows up here live.</p> :
      <div className="analytics-body">
        <SessionList sessions={overview.sessions} selected={sessionId} onSelect={setChosen} filter={filter} setFilter={setFilter} now={overview.generatedAt} />
        {detail && detail.summary.sessionId === sessionId ? <Timeline key={sessionId} detail={detail} openSession={openSession} /> :
          <p role="status" className="analytics-empty">{readSession && detail === null ? "Reading session..." : "This session has no recent activity."}</p>}
      </div>}
  </section>;
}

function Stats({ overview }: { overview: AnalyticsOverview | null }) {
  const value = (render: (overview: AnalyticsOverview) => string) => overview ? render(overview) : "–";
  const items: [string, string][] = [
    ["Live", value((o) => String(o.live))], ["Working", value((o) => String(o.working))], ["Projects", value((o) => String(o.projects))],
    ["Service CPU", value((o) => o.serviceCpuPercent === null ? "Measuring" : `${o.serviceCpuPercent}%`)], ["Service memory", value((o) => bytes(o.serviceMemoryBytes))],
    ["MCP servers", value((o) => String(o.mcpServers))],
  ];
  return <dl className="analytics-stats">{items.map(([label, text]) => <div key={label} data-live={label === "Live" && overview?.live ? true : undefined}>
    <dt>{label}</dt><dd data-word={/^[A-Za-z]/.test(text) || undefined}>{text}</dd></div>)}</dl>;
}

function SessionList({ sessions, selected, onSelect, filter, setFilter, now }: {
  sessions: AnalyticsSessionSummary[]; selected: string | null; onSelect: (id: string) => void; filter: string; setFilter: (value: string) => void; now: number;
}) {
  const query = filter.trim().toLowerCase();
  const shown = sessions.filter((session) => !query || `${session.title} ${session.projectName ?? ""} ${session.firstPrompt}`.toLowerCase().includes(query));
  const group = (title: string, items: AnalyticsSessionSummary[]) => items.length ? <section aria-label={`${title} sessions`}><h3>{title}<span>{items.length}</span></h3><ul>{items.map((session) =>
    <li key={session.sessionId}><button type="button" aria-current={session.sessionId === selected ? "true" : undefined} onClick={() => onSelect(session.sessionId)}>
      <span className="analytics-session-title"><i data-state={session.state} aria-hidden="true" /><span>{session.title}</span></span>
      <small>{session.projectName ?? "Chat"} · {session.state === "idle" ? ago(now - session.lastEventAt) : STATE[session.state].label}</small>
    </button></li>)}</ul></section> : null;
  return <aside className="analytics-sessions" aria-label="Sessions">
    <input type="search" value={filter} placeholder="Filter sessions" aria-label="Filter sessions" onChange={(event) => setFilter(event.target.value)} />
    {group("Live", shown.filter((session) => session.state !== "idle"))}{group("Recent", shown.filter((session) => session.state === "idle"))}
    {!shown.length && <p className="fine-print">No sessions match.</p>}
  </aside>;
}

function marks(events: AnalyticsEvent[], range: Range, width: number, now: number): Mark[] {
  const span = range.to - range.from, px = (time: number) => (time - range.from) / span * width, result: Mark[] = [];
  let cluster: { events: AnalyticsEvent[]; x0: number; x1: number } | null = null;
  const flush = () => {
    if (cluster) result.push(cluster.events.length === 1 ? { kind: "dot", event: cluster.events[0]!, x: cluster.x0 } : { kind: "cluster", events: cluster.events, x: (cluster.x0 + cluster.x1) / 2 });
    cluster = null;
  };
  for (const event of events) {
    const end = event.end ?? now;
    if (end < range.from || event.start > range.to) continue;
    const x = px(event.start), x2 = px(end);
    if (x2 - x >= BAR_PX) { flush(); const left = Math.max(x, -2); result.push({ kind: "bar", event, x: left, w: Math.min(x2, width + 2) - left }); continue; }
    if (cluster && x - cluster.x0 <= CLUSTER_PX) { cluster.events.push(event); cluster.x1 = x; } else { flush(); cluster = { events: [event], x0: x, x1: x }; }
  }
  flush();
  return result;
}
function ticks(range: Range, width: number): number[] {
  const span = range.to - range.from, step = TICKS.find((value) => value / span * width >= 84) ?? TICKS.at(-1)!;
  const values: number[] = [];
  for (let time = Math.ceil(range.from / step) * step; time <= range.to; time += step) values.push(time);
  return values;
}

function Timeline({ detail, openSession }: { detail: AnalyticsSessionDetail; openSession: (id: string) => void }) {
  const { summary, events } = detail, live = summary.state !== "idle";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [detail]);
  const domain = useMemo<Range>(() => {
    if (!events.length) return { from: now - 60_000, to: now };
    let from = Infinity, to = -Infinity;
    for (const event of events) { from = Math.min(from, event.start); to = Math.max(to, event.end ?? now); }
    if (live) to = Math.max(to, now);
    const pad = Math.max((to - from) * 0.03, 400);
    return { from: from - pad, to: to + pad };
  }, [events, now, live]);
  const [view, setView] = useState<Range | null>(null), [follow, setFollow] = useState(true);
  const range = view ? follow && live ? { from: domain.to - (view.to - view.from), to: domain.to } : view : domain;
  const [hidden, setHidden] = useState<ReadonlySet<AnalyticsLane>>(new Set()), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null), [hover, setHover] = useState<{ event: AnalyticsEvent; count?: number; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(640), [brush, setBrush] = useState<{ a: number; b: number } | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLDivElement>(null), lanesRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef(range); rangeRef.current = range;
  const drag = useRef<{ kind: "pan" | "ruler" | "overview"; x0: number; range: Range; moved: boolean } | null>(null);

  const needle = query.trim().toLowerCase(), matches = (event: AnalyticsEvent) => !needle || searchable(event).includes(needle);
  const counts = useMemo(() => Object.fromEntries(ANALYTICS_LANES.map((lane) => [lane, events.filter((event) => event.lane === lane).length])) as Record<AnalyticsLane, number>, [events]);
  const byLane = useMemo(() => Object.fromEntries(ANALYTICS_LANES.map((lane) => [lane, events.filter((event) => event.lane === lane).sort((a, b) => a.start - b.start)])) as Record<AnalyticsLane, AnalyticsEvent[]>, [events]);
  const ordered = useMemo(() => events.filter((event) => !hidden.has(event.lane) && matches(event)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), [events, hidden, needle]);
  const chosen = events.find((event) => event.id === selected) ?? null;
  const tokens = events.filter((event) => event.lane === "answer" && typeof event.outputTokens === "number");
  const tokenMax = Math.max(1, ...tokens.map((event) => event.outputTokens ?? 0));

  useEffect(() => {
    const element = rulerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const timeAt = (clientX: number, base = rangeRef.current) => {
    const left = rulerRef.current?.getBoundingClientRect().left ?? 0;
    return base.from + (clientX - left) / width * (base.to - base.from);
  };
  const apply = (next: Range) => {
    const span = Math.max(MIN_SPAN, next.to - next.from), center = (next.from + next.to) / 2;
    setView(next.to - next.from < MIN_SPAN ? { from: center - span / 2, to: center + span / 2 } : next);
    setFollow(false);
  };
  const zoom = (factor: number, at?: number) => {
    const current = rangeRef.current, anchor = at ?? (current.from + current.to) / 2, span = Math.max(MIN_SPAN, (current.to - current.from) * factor);
    const ratio = (anchor - current.from) / (current.to - current.from);
    apply({ from: anchor - ratio * span, to: anchor - ratio * span + span });
  };
  const fit = () => { setView(null); setFollow(true); };
  const reveal = (event: AnalyticsEvent) => {
    setSelected(event.id);
    const current = rangeRef.current, span = current.to - current.from;
    if (event.start < current.from || event.start > current.to) apply({ from: event.start - span / 2, to: event.start + span / 2 });
  };
  const step = (direction: 1 | -1) => {
    if (!ordered.length) return;
    const index = chosen ? ordered.findIndex((event) => event.id === chosen.id) : -1;
    const next = index < 0 ? direction > 0 ? ordered.find((event) => event.start >= range.from) ?? ordered[0]! : [...ordered].reverse().find((event) => event.start <= range.to) ?? ordered.at(-1)!
      : ordered[Math.min(ordered.length - 1, Math.max(0, index + direction))]!;
    reveal(next);
  };

  useEffect(() => {
    const element = lanesRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const current = rangeRef.current, shift = event.deltaX / width * (current.to - current.from);
        apply({ from: current.from + shift, to: current.to + shift });
      } else zoom(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), timeAt(event.clientX));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  const down = (kind: "pan" | "ruler" | "overview") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, x0: event.clientX, range: rangeRef.current, moved: false };
    if (kind === "ruler") setBrush({ a: event.clientX, b: event.clientX });
    if (kind === "overview") centerOverview(event.clientX, drag.current.range);
  };
  const centerOverview = (clientX: number, base: Range) => {
    const left = rulerRef.current?.getBoundingClientRect().left ?? 0, at = domain.from + (clientX - left) / width * (domain.to - domain.from), span = base.to - base.from;
    apply({ from: at - span / 2, to: at + span / 2 });
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    if (Math.abs(event.clientX - state.x0) > 3) state.moved = true;
    if (state.kind === "pan" && state.moved) {
      const shift = -(event.clientX - state.x0) / width * (state.range.to - state.range.from);
      apply({ from: state.range.from + shift, to: state.range.to + shift });
    } else if (state.kind === "ruler") setBrush({ a: state.x0, b: event.clientX });
    else if (state.kind === "overview") centerOverview(event.clientX, state.range);
  };
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (state?.kind === "ruler") {
      setBrush(null);
      if (Math.abs(event.clientX - state.x0) > 4) { const a = timeAt(state.x0, state.range), b = timeAt(event.clientX, state.range); apply({ from: Math.min(a, b), to: Math.max(a, b) }); }
    }
  };
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).matches("input")) return;
    const actions: Record<string, () => void> = {
      ArrowRight: () => step(1), ArrowLeft: () => step(-1), f: fit, F: fit, l: () => setFollow(true), L: () => setFollow(true),
      Escape: () => setSelected(null), "+": () => zoom(0.6), "=": () => zoom(0.6), "-": () => zoom(1 / 0.6),
    };
    const action = actions[event.key];
    if (!action || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault(); action();
  };
  const hoverAt = (target: HTMLElement, event: AnalyticsEvent, count?: number) => {
    const box = target.getBoundingClientRect(), frame = canvasRef.current?.getBoundingClientRect();
    if (frame) setHover({ event, count, x: box.left + box.width / 2 - frame.left, y: box.top - frame.top });
  };
  const px = (time: number) => (time - range.from) / (range.to - range.from) * width;
  const following = live && (view === null || follow);
  const brushBox = brush && rulerRef.current ? (() => { const left = rulerRef.current!.getBoundingClientRect().left; return { left: Math.min(brush.a, brush.b) - left, width: Math.abs(brush.b - brush.a) }; })() : null;
  const overviewX = (time: number) => (time - domain.from) / (domain.to - domain.from) * width;

  return <div className="analytics-main">
    <section className="analytics-timeline" aria-label={`Timeline for ${summary.title}`}>
      <header className="analytics-session-head">
        <div><h2>{summary.title}</h2>{summary.firstPrompt && <p title={summary.firstPrompt}>{summary.firstPrompt}</p>}</div>
        <StatusBadge className="analytics-state" status={STATE[summary.state]} />
        <button type="button" onClick={() => openSession(summary.sessionId)}>Open session</button>
      </header>
      <div className="analytics-toolbar">
        <div className="analytics-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoom(1 / 0.6)}>Zoom out</button><button type="button" onClick={() => zoom(0.6)}>Zoom in</button><button type="button" onClick={fit}>Fit</button>
          <button type="button" aria-pressed={following} disabled={!live} onClick={() => setFollow(true)}>Follow live</button>
        </div>
        <span className="analytics-range">{clock(range.from)} – {clock(range.to)} · {duration(range.to - range.from)}</span>
        <label className="analytics-find">
          <input type="search" value={query} placeholder="Find events" aria-label="Find events" onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); step(event.shiftKey ? -1 : 1); } }} />
          {needle && <small aria-live="polite">{ordered.length} {ordered.length === 1 ? "match" : "matches"}</small>}
        </label>
      </div>
      <div className="analytics-lane-chips" role="group" aria-label="Show lanes">{ANALYTICS_LANES.map((lane) =>
        <button key={lane} type="button" data-lane={lane} aria-label={`${LANES[lane]} ${counts[lane]}`} aria-pressed={!hidden.has(lane)} onClick={() => setHidden((current) => {
          const next = new Set(current); if (next.has(lane)) next.delete(lane); else next.add(lane); return next;
        })}><i aria-hidden="true" />{LANES[lane]}<span>{counts[lane]}</span></button>)}</div>
      <div className="analytics-canvas" ref={canvasRef} tabIndex={0} role="group" aria-label="Session timeline. Arrow keys move between events, F fits, L follows live, Escape clears."
        aria-describedby="analytics-keys" onKeyDown={keys}>
        <div className="analytics-row analytics-overview-row"><span>Overview</span>
          <div className="analytics-overview" onPointerDown={down("overview")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden="true">
            {events.map((event) => <i key={event.id} data-lane={event.lane} data-failed={event.status === "failed" || undefined}
              style={{ left: overviewX(event.start), top: ANALYTICS_LANES.indexOf(event.lane) * 3 + 2 }} />)}
            <b style={{ left: overviewX(range.from), width: Math.max(4, overviewX(range.to) - overviewX(range.from)) }} />
          </div>
        </div>
        <div className="analytics-row analytics-ruler-row"><span />
          <div className="analytics-ruler" ref={rulerRef} onPointerDown={down("ruler")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Drag to zoom to a range">
            {ticks(range, width).map((time) => <span key={time} style={{ left: px(time) }}>{clock(time)}</span>)}
            {following && <em style={{ left: Math.min(width - 1, px(now)) }} aria-hidden="true" />}
            {brushBox && <b style={brushBox} aria-hidden="true" />}
          </div>
        </div>
        <div className="analytics-lanes" ref={lanesRef} onPointerDown={down("pan")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={fit}
          onPointerLeave={() => setHover(null)}>
          {ANALYTICS_LANES.filter((lane) => !hidden.has(lane)).map((lane) => <div key={lane} className="analytics-row" data-lane={lane}>
            <span>{LANES[lane]}</span>
            <div className="analytics-track">{marks(byLane[lane], range, width, now).map((mark) => {
              if (mark.kind === "cluster") {
                const label = `${mark.events.length} ${LANES[lane].toLowerCase()} from ${clock(mark.events[0]!.start)}. Zoom in.`;
                return <button key={`cluster:${mark.events[0]!.id}`} type="button" tabIndex={-1} className="analytics-cluster" style={{ left: mark.x }} aria-label={label}
                  data-dim={needle && !mark.events.some(matches) || undefined} data-failed={mark.events.some((event) => event.status === "failed") || undefined}
                  onPointerEnter={(event) => hoverAt(event.currentTarget, mark.events[0]!, mark.events.length)} onPointerLeave={() => setHover(null)}
                  onClick={() => { const from = mark.events[0]!.start, to = Math.max(...mark.events.map((value) => value.end ?? now)), pad = Math.max(500, (to - from) * 0.3); apply({ from: from - pad, to: to + pad }); }}>
                  {mark.events.length}</button>;
              }
              const event = mark.event;
              return <button key={event.id} type="button" tabIndex={-1} className={mark.kind === "bar" ? "analytics-bar" : "analytics-dot"} data-status={event.status}
                aria-label={`${LANES[lane]}: ${event.label}, ${clock(event.start)}`} aria-pressed={selected === event.id}
                data-dim={needle && !matches(event) || undefined} style={mark.kind === "bar" ? { left: mark.x, width: mark.w } : { left: mark.x }}
                onPointerEnter={(target) => hoverAt(target.currentTarget, event)} onPointerLeave={() => setHover(null)}
                onClick={() => { setSelected(event.id); canvasRef.current?.focus({ preventScroll: true }); }} />;
            })}</div>
          </div>)}
          <div className="analytics-row analytics-tokens-row"><span>Tokens out</span>
            <div className="analytics-track" aria-hidden="true">{tokens.map((event) => {
              const at = event.end ?? event.start;
              return at < range.from || at > range.to ? null : <i key={event.id} style={{ left: px(at), height: `${Math.max(6, (event.outputTokens ?? 0) / tokenMax * 100)}%` }} />;
            })}<small>{tokens.length ? `peak ${compact(tokenMax)}` : "no reports yet"}</small></div>
          </div>
        </div>
        {hover && <div className="analytics-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.count ? `${hover.count} ${LANES[hover.event.lane].toLowerCase()}` : hover.event.label}</strong>
          <span>{LANES[hover.event.lane]} · {clock(hover.event.start)}{hover.count ? "" : ` · ${hover.event.end === null ? "running" : duration(hover.event.end - hover.event.start)}`}{hover.event.status === "failed" ? " · failed" : ""}</span>
        </div>}
      </div>
      {detail.truncated && <p className="fine-print">Showing the newest {events.length.toLocaleString()} events of this session.</p>}
      <Footer summary={summary} />
    </section>
    <EventDetail event={chosen} now={now} onStep={step} />
  </div>;
}

function Footer({ summary }: { summary: AnalyticsSessionSummary }) {
  const totals = summary.totals;
  const items: [string, string][] = [["Prompts", String(totals.prompts)], ["Commands", String(totals.commands)], ["MCP calls", String(totals.mcpCalls)], ["Edits", String(totals.edits)],
    ["Failed", String(totals.failed)], ["Tokens in", compact(totals.inputTokens)], ["Tokens out", compact(totals.outputTokens)]];
  return <footer className="analytics-footer"><dl>{items.map(([label, value]) => <div key={label} data-failed={label === "Failed" && totals.failed > 0 || undefined}><dt>{label}</dt><dd>{value}</dd></div>)}
    <div className="analytics-models"><dt>Model</dt><dd>{totals.models.length ? totals.models.join(", ") : "None yet"}</dd></div></dl>
    {totals.unreportedCalls > 0 && <small>{totals.unreportedCalls} model {totals.unreportedCalls === 1 ? "call has" : "calls have"} no token report. Gaps are not zero.</small>}
  </footer>;
}

function EventDetail({ event, now, onStep }: { event: AnalyticsEvent | null; now: number; onStep: (direction: 1 | -1) => void }) {
  return <aside className="analytics-detail" aria-label="Selected event" aria-live="polite">{event ? <>
    <header><i data-lane={event.lane} aria-hidden="true" /><span>{LANES[event.lane]}</span><StatusBadge className="analytics-event-status" status={STATUS[event.status]} /></header>
    <h3>{event.label || "Untitled event"}</h3>
    <dl>
      <div><dt>Started</dt><dd>{clock(event.start)}</dd></div>
      <div><dt>Duration</dt><dd>{event.end === null ? `${duration(now - event.start)} so far` : event.end === event.start ? "Instant" : duration(event.end - event.start)}</dd></div>
      {event.tool && <div><dt>Tool</dt><dd>{event.tool}{event.mcp ? " (MCP)" : ""}</dd></div>}
      {event.modelId && <div><dt>Model</dt><dd>{event.modelId}</dd></div>}
      {event.lane === "answer" && event.end !== null && <div><dt>Tokens</dt><dd>{typeof event.inputTokens === "number" ? compact(event.inputTokens) : "?"} in · {typeof event.outputTokens === "number" ? compact(event.outputTokens) : "?"} out</dd></div>}
    </dl>
    {event.detail && event.detail !== event.label && <pre>{event.detail}</pre>}
    <div className="analytics-detail-nav"><button type="button" onClick={() => onStep(-1)}>Previous</button><button type="button" onClick={() => onStep(1)}>Next</button></div>
  </> : <>
    <h3>Select an event</h3>
    <p>Click a marker on the timeline, or focus it and use the keys below.</p>
    <dl id="analytics-keys" className="analytics-keys">
      {([["Scroll or pinch", "Zoom"], ["Drag", "Pan"], ["Drag the ruler", "Zoom to range"], ["Double-click", "Fit"], ["← →", "Previous, next"], ["F", "Fit"], ["L", "Follow live"], ["Esc", "Clear"]] as const)
        .map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}
    </dl>
  </>}</aside>;
}
