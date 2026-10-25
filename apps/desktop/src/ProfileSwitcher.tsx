import { SettingsInput } from "./SettingsFields.tsx";
import { useEffect, useState } from "react";
import type { MoguriSdk, Profile, ProfileCatalog, Snapshot } from "../../../packages/sdk/src/index.ts";

export function ProfileSwitcher({ sdk, snapshot, disabled, expanded, setExpanded, onSwitch, onDirty }: {
  sdk: MoguriSdk; snapshot: Snapshot; disabled: boolean; expanded: boolean; setExpanded: (open: boolean) => void;
  onSwitch: (id: string) => Promise<void>; onDirty: (dirty: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<ProfileCatalog | null>(null), [mode, setMode] = useState<"new" | "edit" | null>(null);
  const [name, setName] = useState(""), [color, setColor] = useState(""), [base, setBase] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [inspected, setInspected] = useState("");
  const dirty = Boolean(mode && (mode === "new" ? name || color : name !== base?.name || color !== (base?.color ?? "")));
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => {
    let current = true;
    void sdk.profiles.list().then((value) => { if (current) setCatalog(value.catalog); }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : "Profiles are unavailable. No Default fallback was used."); });
    return () => { current = false; };
  }, [sdk, snapshot.profileCatalogRevision]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Profile action failed; no data or account was copied."); }
    finally { setBusy(false); }
  };
  const reload = async () => { setCatalog((await sdk.profiles.list()).catalog); };
  const edit = (kind: "new" | "edit") => {
    const current = catalog?.profiles.find((profile) => profile.id === sdk.profileId);
    setBase(kind === "edit" ? current ?? null : null); setName(kind === "edit" ? current?.name ?? "" : ""); setColor(kind === "edit" ? current?.color ?? "" : "");
    setMode(kind); setError(""); setNotice(""); setExpanded(true);
  };
  const save = async () => {
    if (mode === "edit") {
      if (!base) throw new Error("Reload the current profile metadata before renaming.");
      await sdk.profiles.update(base.id, { name, color: color || null }, base.revision);
    } else {
      const result = await sdk.profiles.create(name, color || null); await sdk.profiles.wait(result.id!);
    }
    setMode(null); setBase(null); await reload(); setNotice("Profile metadata saved. Choose a profile explicitly; accounts and project data were not copied.");
  };
  return <section className="profile-switcher" aria-label="Profiles" aria-busy={busy}>
    <label className="setting-field"><span className="profile-label">{snapshot.profile?.color && <span className="status-dot" style={{ backgroundColor: snapshot.profile.color }} aria-hidden="true" />}Profile</span><select aria-label="Active profile" title={snapshot.profile?.name ?? sdk.profileId} value={sdk.profileId} disabled={disabled || busy || dirty || !catalog} onChange={(event) => { const id = event.target.value; void run(() => onSwitch(id)); }}>
      {!catalog && <option value={sdk.profileId}>{snapshot.profile?.name ?? sdk.profileId}</option>}
      {catalog?.profiles.map((profile) => <option key={profile.id} value={profile.id} disabled={profile.status !== "ready"}>{profile.name}{profile.status === "ready" ? "" : ` / ${profile.status}`}</option>)}
    </select></label>
    <button type="button" className="quiet" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} disabled={busy || dirty}>Manage profiles</button>
    {expanded && <div className="profile-management"><p className="fine-print">Accounts, projects and memory stay separate. Running work stays in its profile.</p>
      {!mode && <div className="button-row"><button type="button" disabled={disabled || busy} onClick={() => edit("new")}>New profile</button><button type="button" disabled={disabled || busy || !catalog} onClick={() => edit("edit")}>Rename / color</button></div>}
      {mode && <><label className="setting-field">Profile name<SettingsInput aria-label="Profile name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(save); } }} /></label>
        <label className="setting-field">Accent (optional)<SettingsInput aria-label="Profile accent" value={color} placeholder="#557799" maxLength={7} disabled={busy} onChange={(event) => setColor(event.target.value)} /></label>
        <div className="button-row"><button type="button" className="primary" disabled={busy || !dirty || !name.trim()} onClick={() => void run(save)}>{mode === "new" ? "Create profile" : "Save profile metadata"}</button><button type="button" disabled={busy} onClick={() => { setMode(null); setBase(null); }}>Discard profile edit</button></div></>}
      {catalog?.profiles.filter((profile) => profile.status !== "ready").map((profile) => <div key={profile.id}><strong>{profile.name} / {profile.status}</strong><p className="fine-print">{profile.diagnostic ?? "Preparing owned resources; no provider login or data copy."}</p>
        {profile.status === "creating" ? <button type="button" disabled={busy} onClick={() => void run(async () => { await sdk.profiles.stop(profile.id); await reload(); })}>Stop profile setup</button> : <>
          <label className="check-setting"><SettingsInput type="checkbox" checked={inspected === profile.id} onChange={(event) => setInspected(event.target.checked ? profile.id : "")} />I inspected this profile's owned resource directory.</label>
          <button type="button" disabled={busy || inspected !== profile.id} onClick={() => void run(async () => { await sdk.profiles.retry(profile.id, profile.revision, true); await sdk.profiles.wait(profile.id); setInspected(""); await reload(); })}>Retry profile setup</button></>}
      </div>)}
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="fine-print" role="status">{notice}</p>}
  </section>;
}
