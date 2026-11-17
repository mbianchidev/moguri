import { useEffect, useState } from "react";
import { defaultProjectConfiguration, parse, ProjectSettingsSchema, type InstallerCandidate, type MoguriSdk, type Session, type Snapshot } from "../../../packages/sdk/src/index.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";

/** Sessions where the user chose "Not now"; the card returns in later sessions until a project preference is saved. */
const postponed = new Set<string>();

/**
 * Asks once per project whether the agent should build the project's installer when a session's work is done.
 * The answer is saved in the project's settings; the agent only follows it, under normal approvals.
 */
export function InstallerPreference({ sdk, session, snapshot }: { sdk: MoguriSdk; session: Session; snapshot: Snapshot }) {
  const configuration = session.projectId ? snapshot.projectConfigurations.find((entry) => entry.projectId === session.projectId) ?? defaultProjectConfiguration(session.projectId) : undefined;
  const project = snapshot.projects.find((entry) => entry.id === session.projectId);
  const eligible = Boolean(project && configuration && configuration.values.repo.installers === undefined && session.kind === "agent" &&
    session.status === "completed" && !session.turnId && !postponed.has(session.id));
  const [candidates, setCandidates] = useState<InstallerCandidate[] | null>(null), [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!eligible || !project) return;
    let current = true;
    void sdk.projects.installers(project.id).then((value) => { if (current) { setCandidates(value); setChoice((previous) => previous || value[0]?.run || ""); } },
      (failure: unknown) => console.error("Installer lookup failed:", failure instanceof Error ? failure.message : failure));
    return () => { current = false; };
  }, [sdk, eligible, project?.id, project?.path]);
  if (!eligible || hidden || !project || !configuration || !candidates?.length) return null;
  const save = (installers: "build" | "skip") => {
    setBusy(true); setError("");
    const latest = sdk.getState().snapshot?.projectConfigurations.find((entry) => entry.projectId === project.id) ?? configuration;
    const settings = parse(ProjectSettingsSchema, { ...latest.values, repo: { ...latest.values.repo, installers, ...(installers === "build" && choice ? { installerCommand: choice } : {}) } });
    void sdk.projects.configure(project.id, settings, latest.revision).then(() => setHidden(true),
      (failure: unknown) => setError(failure instanceof Error ? failure.message : "The preference wasn't saved. Try again from Project settings."))
      .finally(() => setBusy(false));
  };
  return <section className="continuation-status repository-proposal installer-preference" aria-label="Installer preference">
    <Icon name="Box" />
    <div><strong>Build an installer when work is done?</strong>
      <p>This project ({project.name}) has an installer command. Moguri can run it as the last step of each session's work here. You can change this later in Project settings.</p>
      {candidates.length > 1 ? <label className="setting-field">Command<select aria-label="Installer command to use" value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
        {candidates.map((candidate) => <option key={candidate.run} value={candidate.run}>{candidate.run}</option>)}
      </select></label> : <p><code>{choice}</code></p>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    </div>
    <button type="button" disabled={busy} onClick={() => { postponed.add(session.id); setHidden(true); }}>Not now</button>
    <button type="button" disabled={busy} onClick={() => save("skip")}>Don't build</button>
    <button type="button" className="primary" disabled={busy || !choice} onClick={() => save("build")}>Build at the end</button>
  </section>;
}
