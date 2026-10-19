import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { DraftEditor, slashCommands, type Controls, type ModelContextPreview, type ModelInfo, type ModelOptions, type MoguriSdk, type Project, type Session, type Snapshot, type ThinkingEffort } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";

type Menu = "attach" | "env" | "model" | "autonomy" | "budget" | "delivery";
type Run = (operation: () => Promise<unknown>) => Promise<void>;
const envIcon = { Local: "House", Sandbox: "Box", Remote: "Globe" } as const;
const autonomyIcon = { Manual: "Hand", Guided: "Traffic", Autopilot: "Car", "Autopilot Max": "Rocket" } as const;
const compact = (value: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const count = (value: number) => new Intl.NumberFormat().format(value);
export function useQueueModifier(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const update = (event: KeyboardEvent) => setHeld(event.metaKey || event.ctrlKey);
    const reset = () => setHeld(false);
    window.addEventListener("keydown", update); window.addEventListener("keyup", update); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", update); window.removeEventListener("keyup", update); window.removeEventListener("blur", reset); };
  }, []);
  return held;
}

export function ChatComposer({ session, project, snapshot, client, editor, run, busy, connected, onConnect, onSlash, onMenuChange, onGuardrails }: {
  session: Session; project: Project; snapshot: Snapshot; client: MoguriSdk; editor: DraftEditor; run: Run; busy: boolean; connected: boolean;
  onConnect: () => void; onMenuChange: (open: boolean) => void; onGuardrails: () => void;
  onSlash: (session: Session, editor: DraftEditor, text: string) => Promise<void>;
}) {
  const draft = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [menu, setMenu] = useState<Menu | null>(null);
  const heldModifier = useQueueModifier();
  const [configuring, setConfiguring] = useState(false);
  const [delivery, setDelivery] = useState<"queue" | "steer" | "interrupt">("queue");
  const model = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const voiceJob = snapshot.jobs.findLast((job) => job.sessionId === session.id && job.kind === "voice.record" && job.status === "running");
  const transcript = snapshot.jobs.findLast((job) => job.sessionId === session.id && ["voice.record", "voice.transcribe"].includes(job.kind) && job.status === "completed");
  const [insertedTranscript, setInsertedTranscript] = useState<string | null>(null);
  const isSlash = draft.text.startsWith("/");
  const held = heldModifier && !isSlash;
  const canQueue = connected && !busy && !configuring && session.status !== "archived" && Boolean(draft.text.trim() || draft.attachments.length) && !draft.conflict;
  const canSend = canQueue && snapshot.provider.status === "connected" && Boolean(model) && (delivery === "queue" || Boolean(session.turnId));
  const suggestions = isSlash && !/\s/.test(draft.text) ? slashCommands.filter((command) => command.name.startsWith(draft.text.slice(1))).slice(0, 7) : [];
  useEffect(() => { onMenuChange(menu !== null); return () => onMenuChange(false); }, [menu, onMenuChange]);
  const send = (event?: FormEvent, hold = held) => {
    event?.preventDefault();
    void run(() => isSlash ? onSlash(session, editor, draft.text) : editor.send(hold ? "queue" : delivery, hold));
  };
  const dictate = () => run(async () => {
    await editor.flush();
    if (voiceJob) return client.voice.stop(voiceJob.id);
    const status = (await client.voice.status()).voice;
    if (!status.runtimeReady || !status.modelReady) throw new Error(status.diagnostic ?? "Set up local dictation in Settings before recording.");
    if (!await window.moguri.microphonePermission()) throw new Error("Microphone permission was denied. No audio was recorded.");
    return client.voice.record(session.id);
  });
  const configure = (controls: Controls) => run(async () => {
    await client.sessions.configure(session.id, controls, session.revision);
    setMenu(null);
  });
  const toggle = (value: Menu) => setMenu((current) => current === value ? null : value);
  const close = (value: Menu) => setMenu((current) => current === value ? null : current);
  const status = draft.conflict ? "Draft conflict" : draft.saving ? "Saving..." : draft.dirty ? "Unsent edits" : "Draft saved";
  const sendLabel = isSlash ? "Run command" : held ? "Queue prompt without starting work" : delivery === "steer" ? "Steer" : delivery === "interrupt" ? "Interrupt" : session.turnId ? "Queue" : "Send";
  const item = (name: Menu, label: string, icon: string, children: ReactNode) => <ComposerPopover name={name} label={label} description={name === "env" ? `${session.controls.env}. Host execution is not sandboxed.` : name === "autonomy" ? session.controls.autonomy : name === "budget" ? session.controls.budget.kind === "unlimited" ? "Unlimited" : "Configured cap" : undefined} open={menu === name} toggle={() => toggle(name)} close={() => close(name)} trigger={<Icon name={icon} />}>{children}</ComposerPopover>;
  return <form className="composer compact-composer" onSubmit={(event) => send(event)} aria-label="Message composer" aria-description="Cmd/Ctrl+Enter queues without starting work. Shift+Cmd/Ctrl+Enter sends now.">
    {session.controls.modelId && !model && <button type="button" className="setup-hint" onClick={onConnect}>Saved model {session.controls.modelId} is unavailable. Reconnect or explicitly choose another model.<Icon name="Down" /></button>}
    {session.localFinishing && <p className="local-finishing">Local finishing. New Local turns are blocked by policy.</p>}
    {draft.attachments.length > 0 && <div className="attachment-list">{draft.attachments.map((attachment) => <span key={attachment.id} title={`Snapshot SHA-256 ${attachment.digest}`}><Icon name="Files" />{attachment.path}<button type="button" aria-label={`Remove attachment ${attachment.path}`} onClick={() => editor.edit(draft.text, draft.attachments.filter((item) => item.id !== attachment.id))}><Icon name="Close" /></button></span>)}</div>}
    <label className="sr-only" htmlFor={`prompt-${session.id}`}>Prompt</label>
    <textarea id={`prompt-${session.id}`} placeholder="Ask anything about this project..." value={draft.text} disabled={session.status === "archived"} onChange={(event) => editor.edit(event.target.value)}
      onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void run(async () => { throw new Error("Image paste is not available. No clipboard file was attached or sent."); }); } }}
      onKeyDown={(event) => {
        if (event.code === "Space" && event.ctrlKey) { event.preventDefault(); void dictate(); }
        else if (event.key === "Tab" && suggestions[0]) { event.preventDefault(); editor.edit(`/${suggestions[0].name} `); }
        else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (isSlash ? canQueue : event.shiftKey ? canSend : canQueue) send(undefined, !event.shiftKey); }
      }} />
    {suggestions.length > 0 && <div className="slash-suggestions" role="listbox" aria-label="Slash commands">{suggestions.map((suggestion) => <button type="button" role="option" aria-selected={false} key={suggestion.name} onClick={() => editor.edit(`/${suggestion.name} `)}><strong>/{suggestion.name}</strong><span>{suggestion.description}</span></button>)}</div>}
    {draft.error && <div className="draft-error" role="alert"><p>{draft.error}</p><div className="button-row">{draft.conflict ? <><button type="button" onClick={() => editor.reload()}>Reload saved draft</button><button type="button" onClick={() => void run(() => editor.keepMine())}>Keep my draft</button></> : <button type="button" onClick={() => void run(() => editor.flush())}>Retry save</button>}</div></div>}
    {transcript && transcript.id !== insertedTranscript && <div className="composer-transcript"><Icon name="Mic" /><span>Dictation ready</span><button type="button" onClick={() => void run(async () => { await editor.flush(); await client.voice.insert(session.id, transcript.id, client.getState().snapshot!.sessions.find((item) => item.id === session.id)!.draft.revision); setInsertedTranscript(transcript.id); })}>Insert</button></div>}
    <div className="composer-toolbar">
      <div className="composer-leading">
        {item("attach", "Attach", "Plus", <><h2>Attach</h2><button className="composer-menu-option" type="button" onClick={() => { setMenu(null); void run(async () => { const path = await window.moguri.chooseFile(project.path); if (path) await editor.attach(path); }); }}><Icon name="Files" />Project text file</button><p>Only explicit project text snapshots are available. Folder, image and remote-reference attachments are not ready.</p></>)}
        {item("env", "Execution environment", envIcon[session.controls.env], <><h2>Execution environment</h2>{snapshot.capabilities.map((capability) => <button className="composer-menu-option" key={capability.env} type="button" disabled={Boolean(session.turnId) || !capability.ready || !snapshot.policy.allowedEnvs.includes(capability.env)} aria-pressed={session.controls.env === capability.env} title={capability.reason} onClick={() => void configure({ ...session.controls, env: capability.env })}><Icon name={envIcon[capability.env]} /><span>{capability.env}<small>{!snapshot.policy.allowedEnvs.includes(capability.env) ? "Blocked by policy" : capability.env === "Local" ? "Host execution, not sandboxed" : "Not ready"}</small></span>{session.controls.env === capability.env && <Icon name="Check" />}</button>)}<p>Missing isolation never falls back to Local.</p></>)}
        <ComposerPopover name="model" label="Model" description={model?.name ?? session.controls.modelId ?? "Select model"} open={menu === "model"} toggle={() => toggle("model")} close={() => close("model")} trigger={<span className="composer-model-name">{model?.name ?? (session.controls.modelId ? session.controls.modelId : "Select model")}</span>} model>
          <ModelMenu sdk={client} session={session} snapshot={snapshot} onConnect={() => { setMenu(null); onConnect(); }} onSaving={setConfiguring} />
        </ComposerPopover>
        {item("autonomy", "Autonomy level", autonomyIcon[session.controls.autonomy], <><h2>Autonomy</h2>{(["Manual", "Guided", "Autopilot", "Autopilot Max"] as const).map((autonomy) => {
          const grants = snapshot.settings.values.permissions.tools.some((rule) => rule.decision === "allow") || snapshot.settings.values.permissions.commands.some((rule) => rule.decision === "allow");
          const reason = autonomy === "Manual" ? "You approve tools" : autonomy === "Guided" ? "Advice, then your confirmation" : autonomy === "Autopilot" ? grants ? "Within explicit delegations" : "Configure bounded delegations first" : "Decision provider not ready";
          return <button className="composer-menu-option" type="button" key={autonomy} aria-pressed={autonomy === session.controls.autonomy} disabled={Boolean(session.turnId) || autonomy === "Autopilot Max" || autonomy === "Autopilot" && !grants} title={reason} onClick={() => void configure({ ...session.controls, autonomy })}><Icon name={autonomyIcon[autonomy]} /><span>{autonomy}<small>{reason}</small></span>{autonomy === session.controls.autonomy && <Icon name="Check" />}</button>;
        })}<button className="quiet" type="button" onClick={() => { setMenu(null); onGuardrails(); }}>Guardrails</button></>)}
      </div>
      <div className="composer-trailing">
        {item("budget", "Budget and usage", session.controls.budget.kind === "unlimited" ? "Infinity" : "Dollar", <UsageMenu sdk={client} session={session} editor={editor} />)}
        <button className={`icon-button composer-mic ${voiceJob ? "recording" : ""}`} type="button" aria-label={voiceJob ? "Stop local dictation" : "Start local dictation"} title={voiceJob ? "Stop dictation" : "Dictate (Ctrl+Space)"} onClick={() => void dictate()}><Icon name={voiceJob ? "Stop" : "Mic"} /></button>
        <div className="composer-send-group">
          <button className="primary icon-button composer-send" type="submit" aria-label={sendLabel} title={held ? "Queue without starting (Cmd/Ctrl+Enter)" : `${sendLabel}. Hold Cmd/Ctrl to queue without starting.`} disabled={isSlash || held ? !canQueue : !canSend} onClick={(event) => { event.preventDefault(); send(undefined, (event.metaKey || event.ctrlKey || held) && !isSlash); }}><Icon name={held ? "Clock" : "Send"} /></button>
          <ComposerPopover name="delivery" label="Delivery mode" open={menu === "delivery"} toggle={() => toggle("delivery")} close={() => close("delivery")} trigger={<Icon name="Down" />}>
            <h2>Delivery</h2>{(["queue", "steer", "interrupt"] as const).map((value) => <button className="composer-menu-option" type="button" key={value} aria-pressed={delivery === value} disabled={value !== "queue" && !session.turnId} onClick={() => { setDelivery(value); setMenu(null); }}><Icon name={value === "queue" ? "Send" : value === "steer" ? "Agent" : "Stop"} /><span>{value === "queue" ? session.turnId ? "Queue after current turn" : "Send" : value === "steer" ? "Steer at next boundary" : "Interrupt current turn"}</span></button>)}<p>Cmd/Ctrl+Enter always holds the prompt instead.</p>
          </ComposerPopover>
        </div>
      </div>
      <span className="sr-only" role="status">{status}</span>
    </div>
  </form>;
}

function ComposerPopover({ name, label, description, open, toggle, close, trigger, children, model = false }: {
  name: Menu; label: string; description?: string; open: boolean; toggle: () => void; close: () => void; trigger: ReactNode; children: ReactNode; model?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const element = panel.current;
    element.showPopover();
    const position = () => {
      if (!button.current) return;
      const anchor = button.current.getBoundingClientRect();
      const parent = button.current.closest(".composer")!.getBoundingClientRect();
      element.style.width = `${Math.min(360, parent.width, window.innerWidth - 24)}px`;
      const width = element.getBoundingClientRect().width;
      element.style.left = `${Math.max(12, Math.min(parent.right - width, anchor.left, window.innerWidth - width - 12))}px`;
      element.style.maxHeight = `${Math.max(100, anchor.top - 60)}px`;
      element.style.top = `${Math.max(50, anchor.top - element.getBoundingClientRect().height - 8)}px`;
    };
    const observer = new ResizeObserver(position); observer.observe(element); observer.observe(button.current);
    position(); window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); if (element.matches(":popover-open")) element.hidePopover(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open]);
  return <div className={`composer-control ${model ? "model-menu-control" : ""}`}>
    <button ref={button} type="button" className={model ? "composer-model-button quiet" : "icon-button"} aria-label={model ? undefined : label} aria-description={description} title={description ? `${label}: ${description}` : label} data-composer-control={name} aria-haspopup="dialog" aria-expanded={open} aria-controls={`composer-${name}`} onClick={toggle}>{model && <span className="sr-only">Model: </span>}{trigger}</button>
    {open && <div ref={panel} id={`composer-${name}`} className={`composer-popover ${name}-popover`} popover="auto" role="dialog" aria-label={label} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); } }} onToggle={(event) => { if (event.newState === "closed") { if (document.activeElement === document.body || panel.current?.contains(document.activeElement)) button.current?.focus(); close(); } }}>{children}</div>}
  </div>;
}

function ModelMenu({ sdk, session, snapshot, onConnect, onSaving }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot; onConnect: () => void; onSaving: (saving: boolean) => void }) {
  const current = snapshot.provider.models.find((model) => model.id === session.controls.modelId);
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState(session.controls.modelOptions?.contextWindow?.toString() ?? "");
  const [effort, setEffort] = useState<ThinkingEffort | "">(session.controls.modelOptions?.thinkingEffort ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { onSaving(saving); return () => onSaving(false); }, [saving, onSaving]);
  const revision = useRef(session.revision);
  const reload = () => { revision.current = session.revision; setWindow(session.controls.modelOptions?.contextWindow?.toString() ?? ""); setEffort(session.controls.modelOptions?.thinkingEffort ?? ""); setError(""); };
  const options: ModelOptions = { ...(window ? { contextWindow: Number(window) } : {}), ...(effort ? { thinkingEffort: effort } : {}) };
  const dirty = options.contextWindow !== session.controls.modelOptions?.contextWindow || options.thinkingEffort !== session.controls.modelOptions?.thinkingEffort;
  const select = async (model: ModelInfo) => {
    setSaving(true); setError("");
    try {
      const { modelOptions: _, ...controls } = session.controls;
      const result = await sdk.sessions.configure(session.id, { ...controls, modelId: model.id }, revision.current);
      revision.current = result.revision!; setWindow(""); setEffort("");
    } catch (error) { setError(error instanceof Error ? error.message : "Model selection failed. No fallback was used."); }
    finally { setSaving(false); }
  };
  const save = async () => {
    setSaving(true); setError("");
    try { const result = await sdk.sessions.modelOptions(session.id, options, revision.current); revision.current = result.revision!; }
    catch (error) { setError(error instanceof Error ? error.message : "Model settings were not saved."); }
    finally { setSaving(false); }
  };
  return <><h2>Model</h2>{snapshot.provider.status !== "connected" ? <><p>Connect GitHub Copilot to discover account-enabled models.</p><button type="button" onClick={onConnect}>Connect Copilot</button></> : <>
    <input className="composer-model-search" aria-label="Search models" placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="composer-model-list">{snapshot.provider.models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase())).map((model) => <button type="button" className="composer-menu-option" key={model.id} aria-pressed={model.id === session.controls.modelId} disabled={saving || Boolean(session.turnId) || dirty} onClick={() => void select(model)}><span>{model.name}<small>{compact(model.contextWindow)} maximum context</small></span>{model.id === session.controls.modelId && <Icon name="Check" />}</button>)}</div>
    <div className="model-tuning">
      <label>Working context<input aria-label="Working context window" type="number" min={8192} max={current?.contextWindow ?? 10_000_000} step={1024} value={window} placeholder={current ? `Model maximum (${count(current.contextWindow)})` : "Select a model"} disabled={!current || saving || Boolean(session.turnId)} onChange={(event) => setWindow(event.target.value)} /></label>
      <label>Thinking effort<select aria-label="Thinking effort" value={effort} disabled={!current?.thinkingLevels?.length || saving || Boolean(session.turnId)} onChange={(event) => setEffort(event.target.value as ThinkingEffort | "")}><option value="">{current?.thinkingLevels?.length ? "Model default" : "Provider controlled"}</option>{current?.thinkingLevels?.map((level) => <option value={level} key={level}>{level}</option>)}</select></label>
      <p>Working context stays within the model maximum. Counts are estimated; overfull requests stop without truncating history.</p>
      {session.turnId && <p>Stop the active turn before changing model settings.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row"><button type="button" className="primary" disabled={!current || !dirty || saving || Boolean(session.turnId)} onClick={() => void save()}>Save</button><button type="button" className="quiet" disabled={saving} onClick={reload}>Reload</button></div>
    </div>
  </>}</>;
}

function UsageMenu({ sdk, session, editor }: { sdk: MoguriSdk; session: Session; editor: DraftEditor }) {
  const [context, setContext] = useState<ModelContextPreview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void (async () => { await editor.flush(); const result = await sdk.sessions.context(session.id); if (current) { setContext(result.context); setError(""); } })().catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Context usage is unavailable."); });
    return () => { current = false; };
  }, [session.draft.revision, session.revision, session.usage.length, session.usage.at(-1)?.outcome]);
  const tokens = (field: "inputTokens" | "outputTokens" | "cacheReadTokens") => {
    if (!session.usage.length) return "0";
    const values = session.usage.map((usage) => usage[field]);
    const known = values.filter((value): value is number => value !== null);
    return known.length ? `${count(known.reduce((sum, value) => sum + value, 0))}${known.length < values.length ? " + unknown" : ""}` : "Not reported";
  };
  const dollars = (field: "estimatedUsd" | "providerReportedUsd" | "billedUsd") => {
    const values = session.usage.map((usage) => usage[field]);
    if (!values.length || values.every((value) => value === null)) return null;
    return `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(values.reduce<number>((sum, value) => sum + (value ?? 0), 0))}${values.some((value) => value === null) ? " + unknown" : ""}`;
  };
  return <><header className="composer-usage-heading"><h2>Usage</h2><span>{session.controls.budget.kind === "unlimited" ? "Unlimited" : "Configured cap"}</span></header><dl className="composer-usage"><dt>Input tokens</dt><dd>{tokens("inputTokens")}</dd><dt>Output tokens</dt><dd>{tokens("outputTokens")}</dd><dt>Cached input</dt><dd>{tokens("cacheReadTokens")}</dd><dt>Context estimate</dt><dd>{context ? `~${count(context.estimatedTokens)}${context.contextWindow ? ` / ${count(context.contextWindow)}` : ""}` : error ? "Unavailable" : "Loading..."}</dd>
    {(["estimatedUsd", "providerReportedUsd", "billedUsd"] as const).map((field) => { const value = dollars(field); return value ? <div className="usage-dollar-row" key={field}><dt>{field === "estimatedUsd" ? "Estimated USD" : field === "providerReportedUsd" ? "Provider-reported USD" : "Billed USD"}</dt><dd>{value}</dd></div> : null; })}
  </dl>{!dollars("estimatedUsd") && !dollars("providerReportedUsd") && !dollars("billedUsd") && <p>USD not reported.</p>}<p>Context includes the saved draft and is estimated. Usage updates after each call; unreported values stay unknown.</p>{error && <p className="inline-error" role="alert">{error}</p>}</>;
}
