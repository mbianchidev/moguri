import { useEffect, useId, useRef, useState } from "react";
import { builtinClashNotice, skillListGroups, type GatewaySkill, type MoguriSdk, type SkillListGroup, type SkillListItem, type SkillSourceFailure, type Snapshot } from "@moguri-dev/sdk";
import { Icon } from "./Icon.tsx";
import { Alert } from "./Alert.tsx";

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
/** One pending action per row, with its error kept beside the control that caused it. */
function useRowAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), pending = useRef(false);
  const act = (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    void operation().catch((failure: unknown) => setError(message(failure, "That didn't work. Nothing else changed.")))
      .finally(() => { pending.current = false; setBusy(false); });
  };
  return { busy, error, act };
}

function SkillRow({ sdk, item, group, report }: { sdk: MoguriSdk; item: SkillListItem; group: string; report: (notice: string) => void }) {
  const { busy, error, act } = useRowAction(), [body, setBody] = useState<string | null>(null), [deleting, setDeleting] = useState(false);
  // A refused switch keeps the attempted value visible beside its error, like other Settings choices.
  const [attempted, setAttempted] = useState<boolean | null>(null), on = item.state === "on";
  useEffect(() => { if (attempted === on) setAttempted(null); }, [attempted, on]);
  const { registry, source } = item, trust = source && (item.state === "untrusted" || item.state === "changed");
  // A source skill and a copy installed from it can share a name, so a source skill's switch also names its group.
  const name = source ? `${item.name} from ${group}` : item.name;
  const where = registry ? `${registry.ownerPluginId ? "Bundled" : "Installed"} in ${registry.scope}` : source!.path;
  return <article className="capability-row skills-row skill-list-row" data-state={item.state}>
    <div><strong>{item.name}</strong><small>{item.description}</small>
      <code>{where} / {item.digest.slice(0, 12)}</code>
      {item.state === "untrusted" && <small>Not trusted yet, so chats can't see or load it. Trusting lets every chat load this exact version.</small>}
      {item.state === "changed" && <small>Changed since you trusted it. Chats can't load it until you trust this version.</small>}
      {registry?.retired && <small>Removed from its bundle. Install or roll back the whole bundle to use it again.</small>}
      {registry?.pluginOff && item.state !== "on" && <small>Turn on its plugin in Settings / Integrations / Plugins first.</small>}
      {item.shadowedBy && <Alert as="p" tone="warning" className="skill-clash">{builtinClashNotice(item.name, item.shadowedBy)}</Alert>}
      {body !== null && <pre className="skills-source" aria-label={`${item.name} source`}>{body}</pre>}
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      {deleting && registry && <div className="capability-delete" role="group" aria-label={`Confirm deleting skill ${item.name}`}>
        <span>Delete {item.name}? Chats that use it lose access.</span>
        <button type="button" disabled={busy} onClick={() => setDeleting(false)}>Cancel</button>
        <button type="button" className="danger" disabled={busy} onClick={() => act(async () => {
          await sdk.capabilities.delete(registry.capabilityId, registry.revision, true);
          report(`Deleted skill ${item.name}. Chats that used it lose access.`);
        })}>Delete skill</button>
      </div>}</div>
    <button type="button" disabled={busy} aria-expanded={body !== null} aria-label={`${body !== null ? "Hide" : "View"} source of ${name}`} onClick={() => body !== null ? setBody(null) :
      act(async () => {
        if (registry) setBody((await sdk.capabilities.content(registry.capabilityId)).content);
        else { const read = await sdk.skills.read(source!.skillId, item.digest); setBody(`${read.authority}\n\n${read.body}`); }
      })}>{body !== null ? "Hide source" : "View source"}</button>
    {trust ? <button type="button" className="primary" disabled={busy || !source.packageDigest} aria-label={`Trust skill ${name}`} onClick={() => act(async () => {
      await sdk.skills.trust(source.sourceId, source.path, item.digest, source.packageDigest!);
      report(`${item.name} is trusted and on. Trusting grants no tools; calls still follow your approvals.`);
    })}>{item.state === "changed" ? "Trust again" : "Trust"}</button> :
      <label className="check-setting"><input type="checkbox" role="switch" aria-label={`Enable skill ${name}`} checked={attempted ?? on}
        disabled={busy || Boolean(registry && item.state !== "on" && (registry.retired || registry.pluginOff))}
        onChange={(event) => { const enabled = event.target.checked; setAttempted(enabled); act(async () => {
          if (registry) await sdk.capabilities.toggle(registry.capabilityId, enabled, registry.revision);
          else await sdk.skills.setEnabled(source!.sourceId, source!.path, enabled);
        }); }} /><span>{attempted ?? on ? "On" : "Off"}</span></label>}
    {registry && !registry.ownerPluginId && <button type="button" className="icon-button danger" aria-label={`Delete skill ${item.name}`} title="Delete skill"
      aria-expanded={deleting} disabled={busy} onClick={() => setDeleting((value) => !value)}><Icon name="Trash" /></button>}
  </article>;
}

function SkillGroup({ sdk, group, expanded, toggle, reading, report }: {
  sdk: MoguriSdk; group: SkillListGroup; expanded: boolean; toggle: () => void; reading: boolean; report: (notice: string) => void;
}) {
  const panel = useId(), on = group.skills.filter((item) => item.state === "on").length;
  const count = group.sourceId && !group.loaded ? group.error ? "Couldn't be read" : reading ? "Reading..." : "Not read yet" : `${on} of ${group.skills.length} on`;
  return <section className="skill-group" aria-label={group.label}>
    <h4><button type="button" className="skill-group-toggle" aria-expanded={expanded} aria-controls={panel} onClick={toggle}>
      <Icon name={expanded ? "Down" : "ChevronRight"} /><span className="skill-group-label">{group.label}</span>{" "}<span className="skill-group-count">{count}</span>
    </button></h4>
    {expanded && <div id={panel} className="skill-group-body">
      {group.detail && <code className="skill-group-detail">{group.detail}</code>}
      {group.defaults === "trust" && <p className="fine-print">Marketplace skills stay off until you trust each one. Trusting lets chats load that exact version; it never grants tools or approves actions.</p>}
      {group.kind === "repository" && group.defaults === "on" && <p className="fine-print">Your repository: its skills are on by default. Turn off any you don't want chats to use.</p>}
      {group.error && <Alert as="p" tone="warning">Couldn't read this source: {group.error}</Alert>}
      {group.sourceId && !group.loaded && !group.error && <p className="fine-print" role="status">{reading ? "Reading this source..." : "This source hasn't been read yet."}</p>}
      {group.skills.map((item) => <SkillRow key={item.key} sdk={sdk} item={item} group={group.label} report={report} />)}
      {group.loaded && !group.skills.length && <p className="fine-print">No skills found in this source.</p>}
    </div>}
  </section>;
}

/**
 * D57. Every skill the profile knows, grouped by where it came from: personal repositories, marketplace providers, folders, plugins and
 * projects. Settings starts with every group collapsed (and reads sources only once one is opened); Capabilities starts expanded.
 */
export function SkillList({ sdk, snapshot, defaultExpanded }: { sdk: MoguriSdk; snapshot: Snapshot; defaultExpanded: boolean }) {
  const sources = snapshot.settings.values.skillSources ?? [], enabled = sources.filter((source) => source.enabled);
  const key = JSON.stringify([sdk.profileId, enabled]);
  const [read, setRead] = useState<{ key: string; skills: GatewaySkill[]; failures: SkillSourceFailure[] } | null>(null);
  const [reading, setReading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [wanted, setWanted] = useState(defaultExpanded), [attempt, setAttempt] = useState(0), [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!wanted || !enabled.length) { setReading(false); return; }
    const abort = new AbortController();
    setReading(true); setError("");
    void sdk.skills.sources(abort.signal).then((value) => { if (!abort.signal.aborted) setRead({ key, ...value }); })
      .catch((failure: unknown) => { if (!abort.signal.aborted) setError(message(failure, "The skill sources couldn't be read.")); })
      .finally(() => { if (!abort.signal.aborted) setReading(false); });
    return () => abort.abort(new Error("The skill list changed before the sources were read."));
    // `key` captures every input of this read; `enabled` is derived from it.
  }, [sdk, key, wanted, attempt]);
  const current = read?.key === key ? read : null;
  const groups = skillListGroups({ registry: snapshot.registry, projects: snapshot.projects, sources, switches: snapshot.settings.values.skillSwitches,
    sourceSkills: current?.skills ?? null, failures: current?.failures ?? [] });
  return <section className="skill-list" aria-label="All skills">
    <header className="skill-list-header">
      <p className="fine-print">Skills add instructions, never tool permissions. Switches save right away; chats use only skills that are on. Skills from your repositories and folders start on; marketplace skills start off until you trust them.</p>
      <button type="button" className="icon-button" aria-label="Read skill sources again" title="Read sources again" disabled={reading || !enabled.length}
        onClick={() => { setWanted(true); setAttempt((value) => value + 1); }}><Icon name="Refresh" /></button>
    </header>
    {error && <div className="alert-recovery"><Alert as="p" role="alert">{error}</Alert><button type="button" disabled={reading} onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
    <p className="fine-print" role="status" aria-label="Skill list status">{notice}</p>
    {!groups.length && <p className="fine-print">No skills yet. Add a repository, marketplace or folder in the Marketplace, or import a SKILL.md in Settings / Skills.</p>}
    {groups.map((group) => <SkillGroup key={group.id} sdk={sdk} group={group} reading={reading} report={setNotice} expanded={open[group.id] ?? defaultExpanded}
      toggle={() => { setOpen((value) => ({ ...value, [group.id]: !(value[group.id] ?? defaultExpanded) })); if (group.sourceId) setWanted(true); }} />)}
  </section>;
}
