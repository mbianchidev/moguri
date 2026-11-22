import { useEffect, useState, type FormEvent } from "react";
import { appearanceColors, themePalettes, DEFAULT_SESSION_LIFECYCLE, type ApplicationConfiguration, type ApplicationPreferences, type MoguriSdk, type Snapshot, type ThemeMode, type UserSettings } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

type Step = "name" | "accent" | "theme" | "preferences" | "done";
const steps: Step[] = ["name", "accent", "theme", "preferences", "done"];
const themes = [{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }, { id: "system", label: "Match macOS" }] as const;
const palettes = themePalettes.filter((palette) => palette.id !== "custom");
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const completed = (current: UserSettings): UserSettings => ({ ...current, onboarding: { completedAt: new Date().toISOString() } });

/**
 * Getting started (D54): a short conversational setup for the optional name Moguri uses to address the user, an accent palette,
 * the theme and a few behaviors. Choices save as they change, like Settings; the name saves on Continue. Finishing or skipping
 * records `onboarding.completedAt`; Settings / General can run it again.
 */
export function Onboarding({ sdk, snapshot, onClose, openProviders }: {
  sdk: MoguriSdk; snapshot: Snapshot; onClose: () => void; openProviders: () => void;
}) {
  const values = snapshot.settings.values;
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(values.user?.name ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [application, setApplication] = useState<ApplicationConfiguration | null>(null);
  useEffect(() => {
    let current = true;
    void sdk.application.status().then((value) => { if (current) setApplication(value.configuration); },
      (failure: unknown) => { if (current) setError(message(failure, "App preferences couldn't be read. Change them later in Settings / General.")); });
    return () => { current = false; };
  }, [sdk]);
  const reached = (target: Step) => steps.indexOf(step) >= steps.indexOf(target);
  const mode: ThemeMode = values.appearance.theme === "light" || values.appearance.theme === "system" && !window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "light" : "dark";
  const save = async (change: (current: UserSettings) => UserSettings) => {
    const current = sdk.settings.get();
    if (!current) throw new Error("Settings aren't loaded yet. Try again in a moment.");
    await sdk.settings.update(change(structuredClone(current.values)), current.revision);
  };
  const run = async (operation: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); } catch (failure) { setError(message(failure, fallback)); } finally { setBusy(false); }
  };
  const saveName = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    void run(async () => {
      await save((current) => ({ ...current, user: value ? { ...current.user, name: value } : {} }));
      setName(value); setStep("accent");
    }, "Your name wasn't saved. Edit it and try again.");
  };
  const finish = (after: () => void) => void run(async () => { await save(completed); after(); },
    "Setup couldn't be marked finished. Your choices are saved; try again.");
  const preference = (key: keyof ApplicationPreferences, value: boolean) => void run(async () => {
    if (!application) throw new Error("App preferences aren't loaded yet. Change them later in Settings / General.");
    await sdk.application.configure({ [key]: value }, application.revision);
    setApplication((await sdk.application.status()).configuration);
    if (key !== "automaticUpdates") await window.moguri.applyApplicationPreferences();
  }, "The app preference wasn't changed.");
  const profileToggles: { id: string; label: string; hint: string; checked: boolean; change: (current: UserSettings, on: boolean) => UserSettings }[] = [
    { id: "autoSendQueue", label: "Send the next queued prompt when a turn finishes", hint: "Prompts you hold start one at a time, top first.",
      checked: values.interactions.autoSendQueue !== false, change: (current, on) => ({ ...current, interactions: { ...current.interactions, autoSendQueue: on } }) },
    { id: "chatTitles", label: "Name new chats from their topic", hint: "One small model call after the first reply.",
      checked: values.chatTitles?.enabled !== false, change: (current, on) => ({ ...current, chatTitles: { modelId: null, ...current.chatTitles, enabled: on } }) },
    { id: "wrapUp", label: "Wrap up each request in a Moguri worktree", hint: "Commit, push, open or update a draft PR and check CI.",
      checked: (values.wrapUp ?? DEFAULT_SESSION_LIFECYCLE).enabled, change: (current, on) => ({ ...current, wrapUp: { ...(current.wrapUp ?? DEFAULT_SESSION_LIFECYCLE), enabled: on } }) },
    { id: "osNotifications", label: "Show desktop notifications", hint: "When a chat finishes or needs you while Moguri is in the background.",
      checked: values.notifications.os, change: (current, on) => ({ ...current, notifications: { ...current.notifications, os: on } }) },
    { id: "needsInputSound", label: "Play a sound when a chat needs you", hint: "Questions and approvals.",
      checked: values.notifications.needsInputSound?.enabled !== false,
      change: (current, on) => ({ ...current, notifications: { ...current.notifications, needsInputSound: { id: "default", ...current.notifications.needsInputSound, enabled: on } } }) },
  ];
  const appToggles: { id: keyof ApplicationPreferences; label: string; hint: string }[] = [
    { id: "automaticUpdates", label: "Check for and download updates automatically", hint: "Installing always waits for you." },
    { id: "menuBar", label: "Show Moguri in the menu bar", hint: "Applies to every profile." },
  ];
  const paletteName = palettes.find((palette) => palette.id === (values.appearance.palette ?? "moguri"))?.name ?? "Custom";
  const themeName = themes.find((theme) => theme.id === values.appearance.theme)?.label ?? "Dark";
  const addressed = values.user?.name;
  const answer = (label: string, value: string | null, target: Step) => <div className="onboarding-answer">
    <span>{label}</span>{value ? <strong>{value}</strong> : <em>No answer</em>}
    <button type="button" className="quiet" disabled={busy} aria-label={`Change ${label.toLowerCase()}`} onClick={() => { setError(""); setStep(target); }}>Change</button>
  </div>;
  return <section className="onboarding" aria-label="Getting started">
    <header className="onboarding-header">
      <span className="onboarding-title">Getting started</span>
      {step !== "done" && <button type="button" className="quiet" disabled={busy} onClick={() => finish(onClose)}>Skip setup</button>}
    </header>
    <div className="onboarding-thread">
      <p className="onboarding-line">Hi, I'm Moguri. Let's set things up for you; it takes a minute, and you can change everything later in Settings.</p>
      {step === "name" ? <form className="onboarding-card" onSubmit={saveName}>
        <label className="setting-field">What should I call you?
          <input aria-label="Your name" value={name} maxLength={80} autoFocus placeholder="Your name (optional)" onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="fine-print">Optional. Moguri greets you with it and adds it to each chat's instructions so the agent can address you, which sends it to your model provider. Leave it empty to stay anonymous.</p>
        <div className="button-row"><button type="submit" className="primary" disabled={busy}>Continue</button></div>
      </form> : answer("Name", addressed ?? null, "name")}

      {reached("accent") && <p className="onboarding-line">{addressed ? `${addressed}, let's` : "Let's"} pick an accent color.</p>}
      {step === "accent" ? <div className="onboarding-card">
        <div className="onboarding-swatches" role="radiogroup" aria-label="Accent color">
          {palettes.map((palette) => <button key={palette.id} type="button" role="radio" aria-checked={(values.appearance.palette ?? "moguri") === palette.id} disabled={busy}
            onClick={() => void run(() => save((current) => ({ ...current, appearance: { ...current.appearance, palette: palette.id } })), "The accent color wasn't saved.")}>
            <span className="onboarding-swatch" style={{ background: appearanceColors({ ...values.appearance, palette: palette.id }, mode).accent }} aria-hidden="true" />
            <span>{palette.name}</span>
          </button>)}
        </div>
        <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => setStep("theme")}>Continue</button></div>
      </div> : reached("theme") && answer("Accent color", paletteName, "accent")}

      {reached("theme") && <p className="onboarding-line">Light or dark?</p>}
      {step === "theme" ? <div className="onboarding-card">
        <div className="onboarding-choices" role="radiogroup" aria-label="Theme">
          {themes.map((theme) => <button key={theme.id} type="button" role="radio" aria-checked={values.appearance.theme === theme.id} disabled={busy}
            onClick={() => void run(() => save((current) => ({ ...current, appearance: { ...current.appearance, theme: theme.id } })), "The theme wasn't saved.")}>{theme.label}</button>)}
        </div>
        <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => setStep("preferences")}>Continue</button></div>
      </div> : reached("preferences") && answer("Theme", themeName, "theme")}

      {reached("preferences") && <p className="onboarding-line">Choose how Moguri works for you. These save as you switch them.</p>}
      {step === "preferences" ? <div className="onboarding-card">
        <ul className="onboarding-toggles">
          {profileToggles.map((toggle) => <li key={toggle.id}><label className="check-setting"><input type="checkbox" role="switch" checked={toggle.checked} disabled={busy}
            onChange={(event) => { const on = event.target.checked; void run(() => save((current) => toggle.change(current, on)), "That preference wasn't saved."); }} />
            <span>{toggle.label}<small>{toggle.hint}</small></span></label></li>)}
          {appToggles.map((toggle) => <li key={toggle.id}><label className="check-setting"><input type="checkbox" role="switch" checked={application?.values[toggle.id] ?? true}
            disabled={busy || !application} onChange={(event) => preference(toggle.id, event.target.checked)} /><span>{toggle.label}<small>{toggle.hint}</small></span></label></li>)}
        </ul>
        <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => setStep("done")}>Continue</button></div>
      </div> : reached("done") && answer("Preferences", "Saved", "preferences")}

      {step === "done" && <>
        <p className="onboarding-line">You're all set{addressed ? `, ${addressed}` : ""}. Connect a model provider if you haven't yet, then start a chat.</p>
        <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => finish(onClose)}>Finish</button>
          <button type="button" disabled={busy} onClick={() => finish(openProviders)}>Open model providers</button></div>
      </>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    </div>
  </section>;
}
