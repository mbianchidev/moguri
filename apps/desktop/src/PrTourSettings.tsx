import { DEFAULT_PR_TOUR_PROMPT, PR_TOUR_LIMITS, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { SettingsHelp, SettingsInput, SettingsTextarea } from "./SettingsFields.tsx";

/** Global guided PR tour prompt (Settings / Integrations / GitHub). Written text, so it saves only with Save (D64). */
export function PrTourPromptSettings({ value, saved, snapshot, disabled, change, save, reset, openProject }: {
  value: string | undefined; saved: string | undefined; snapshot: Snapshot; disabled: boolean;
  change: (prompt: string) => void; save: () => void; reset: () => void; openProject: (projectId: string) => void;
}) {
  const text = value ?? DEFAULT_PR_TOUR_PROMPT, current = saved?.trim() ? saved : DEFAULT_PR_TOUR_PROMPT;
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
  const overrides = snapshot.projectConfigurations.filter((configuration) => projects.has(configuration.projectId) && configuration.values.repo.tourPrompt?.trim());
  return <section aria-label="PR tour">
    <SettingsHelp label="About PR tours" target={<h3>PR tour</h3>}>Tour, in a pull request's Files tab, asks the chat's agent to read the PR and write a guided review. It runs as a read-only turn with the chat's model, Env, budget and approvals.</SettingsHelp>
    <label className="setting-field">Tour prompt<SettingsTextarea aria-label="PR tour prompt" maxLength={PR_TOUR_LIMITS.prompt} value={text} disabled={disabled}
      onChange={(event) => change(event.target.value)} /></label>
    <p className="fine-print">{saved?.trim() ? "You're using your own prompt." : "You're using the default prompt."} Moguri adds the pull request, its exact head and the tour format after it; those parts can't be changed. A blank prompt uses the default.</p>
    <div className="button-row">
      <button type="button" className="primary" aria-label="Save PR tour prompt" disabled={disabled || text === current} onClick={save}>Save</button>
      <button type="button" aria-label="Reset PR tour prompt to default" disabled={disabled || saved === undefined && value === undefined} onClick={reset}>Reset to default</button>
    </div>
    <h4>Repository prompts</h4>
    {overrides.length ? <ul className="automation-exceptions" aria-label="Repositories with their own tour prompt">{overrides.map((configuration) => {
      const name = projects.get(configuration.projectId)?.name ?? configuration.projectId;
      return <li key={configuration.projectId}><span><strong>{name}</strong> uses its own tour prompt.</span>
        <button type="button" disabled={disabled} aria-label={`Open ${name} settings`} onClick={() => openProject(configuration.projectId)}>Open settings</button></li>;
    })}</ul> : <p className="fine-print">Every repository uses this prompt. A repository can set its own in its Project settings.</p>}
  </section>;
}

/** One repository's tour prompt: inherit the global prompt, or override it with text saved by Save (Project settings). */
export function PrTourRepositoryPrompt({ value, saved, inherited, disabled, override, change, save }: {
  value: string | undefined; saved: string | undefined; inherited: string; disabled: boolean;
  override: (enabled: boolean) => void; change: (prompt: string) => void; save: () => void;
}) {
  const overriding = value !== undefined;
  return <div className="setting-editor">
    <SettingsHelp label="About this repository's tour prompt" target={<h4>Tour prompt for this repository</h4>}>Used when a chat in this repository writes a pull request tour. Without an override it uses the global prompt from Settings / Integrations / GitHub.</SettingsHelp>
    <label className="check-setting"><SettingsInput type="checkbox" aria-label="Override the tour prompt for this repository" checked={overriding} disabled={disabled}
      onChange={(event) => override(event.target.checked)} />Override the tour prompt</label>
    <label className="setting-field">Repository tour prompt<SettingsTextarea aria-label="Repository tour prompt" maxLength={PR_TOUR_LIMITS.prompt} readOnly={!overriding} disabled={disabled}
      value={value ?? inherited} onChange={(event) => change(event.target.value)} /></label>
    <p className="fine-print">{overriding ? "This repository uses its own prompt. Saving a blank prompt goes back to the global one." : "Inherits the global prompt."}</p>
    <button type="button" className="primary" aria-label="Save repository tour prompt" disabled={disabled || !overriding || value === saved} onClick={save}>Save</button>
  </div>;
}
