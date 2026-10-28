import { useEffect, useRef, useState } from "react";
import { effectiveWebAllowances, type MoguriSdk, type Project, type Session, type Snapshot, type WebScope } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { SettingsHelp, SettingsInput } from "./SettingsFields.tsx";

export function WebAllowlistPanel({ sdk, snapshot, session, project, disabled, onBusy, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; session?: Session; project?: Project; disabled: boolean;
  onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void;
}) {
  const [site, setSite] = useState("");
  const [scopeKey, setScopeKey] = useState(session ? `session:${session.id}` : project ? `project:${project.id}` : "global");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const owner = useRef<MoguriSdk | null>(sdk); owner.current = sdk;
  const entries = snapshot.settings.values.permissions.webAllowlist ?? [];
  const effective = new Set(session ? effectiveWebAllowances(entries, { sessionId: session.id, projectId: session.projectId, env: session.controls.env }).map((entry) => entry.id) : []);
  useEffect(() => { onDirty(Boolean(site.trim())); return () => onDirty(false); }, [site, onDirty]);
  useEffect(() => () => { owner.current = null; onBusy(false); }, [onBusy]);
  const validScope = scopeKey === "global" || snapshot.sessions.some((entry) => scopeKey === `session:${entry.id}`) ||
    snapshot.projects.some((entry) => scopeKey === `project:${entry.id}`);
  const describe = (scope: WebScope) => scope.kind === "global" ? "Global in this profile" : scope.kind === "project" ?
    `Project: ${snapshot.projects.find((entry) => entry.id === scope.projectId)?.name ?? "removed source"}` :
    `Session: ${snapshot.sessions.find((entry) => entry.id === scope.sessionId)?.title ?? "removed source"}`;
  const run = async (operation: () => Promise<unknown>, message: string, added = false) => {
    if (busy || disabled) return;
    const original = sdk; setBusy(true); onBusy(true); setError(""); setStatus("");
    try {
      await operation();
      if (owner.current === original) { if (added) setSite(""); setStatus(message); }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The website allowance could not be saved.";
      if (owner.current === original) setError(message);
      else console.error("The original profile's website allowance update failed after its view closed:", message);
    } finally { if (owner.current === original) { setBusy(false); onBusy(false); } }
  };
  return <section aria-label="Local website allowlist">
    <SettingsHelp label="About the Local website allowlist" target={<h3>Local website allowlist</h3>} descriptionFirst>
      Matching session, project and global entries add together within this profile. Exact hostnames allow default-port HTTPS; an exact origin also retains its scheme and port. No wildcards. Unlisted sites ask in Manual/Guided; explicit Autopilot/Max remains automatic. This filters Moguri web and Agent-browser requests, not approved Local shell scripts. Remote does not inherit these entries; Sandbox keeps its enforced firewall.
    </SettingsHelp>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!validScope) { setError("The original scope was removed. Choose an exact remaining scope before saving."); return; }
      const scope: WebScope = scopeKey.startsWith("session:") ? { kind: "session", sessionId: scopeKey.slice(8) } :
        scopeKey.startsWith("project:") ? { kind: "project", projectId: scopeKey.slice(8) } : { kind: "global" };
      void run(() => sdk.webAllowlist.add(site, scope, snapshot.settings.revision), "Website allowance saved.", true);
    }}>
      <label className="setting-field">Website<SettingsInput aria-label="Allowed website" value={site} placeholder="example.com or https://example.com:8443"
        disabled={disabled || busy} onChange={(event) => setSite(event.target.value)} /></label>
      <label className="setting-field">Scope<select aria-label="Website allowance scope" value={scopeKey} disabled={disabled || busy} onChange={(event) => setScopeKey(event.target.value)}>
        {!validScope && <option value={scopeKey} disabled>Original source removed; choose a scope</option>}
        <optgroup label="Sessions">{snapshot.sessions.map((entry) =>
          <option value={`session:${entry.id}`} key={entry.id}>{entry.id === session?.id ? "This session" : entry.title}</option>)}</optgroup>
        <optgroup label="Projects">{snapshot.projects.map((entry) =>
          <option value={`project:${entry.id}`} key={entry.id}>{entry.id === project?.id ? "This project" : entry.name}</option>)}</optgroup>
        <option value="global">Global in this profile</option>
      </select></label>
      <button type="submit" disabled={disabled || busy || !site.trim() || !validScope}>Add</button>
    </form>
    {!entries.length && <p className="fine-print">No Local websites are pre-approved.</p>}
    {entries.map((entry) => <div className="remembered-approval" key={entry.id}>
      <div><code>{entry.site}</code><small>{describe(entry.scope)}{effective.has(entry.id) ? " / Applies here" : ""}</small></div>
      <button type="button" className="icon-button" aria-label={`Remove ${entry.site} (${describe(entry.scope)})`} title="Remove" disabled={disabled || busy}
        onClick={() => void run(() => sdk.webAllowlist.remove(entry.id, snapshot.settings.revision), "Website allowance removed. Pending website authority was revoked.")}><Icon name="Trash" /></button>
    </div>)}
    {busy && <p role="status">Saving website allowance...</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
