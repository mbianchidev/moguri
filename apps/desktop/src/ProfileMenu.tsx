import { useEffect, useRef, useState, type FormEvent } from "react";
import { appearanceColors, themePalettes, type MoguriSdk, type ProfileCatalog, type Snapshot } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";
import { AnchoredMenu } from "./AnchoredMenu.tsx";
import { Icon } from "./Icon.tsx";

/** The profile accent swatches: each palette's dark accent. The profile keeps a plain hex color, so a custom one needs no schema change. */
export const profileSwatches = themePalettes.filter((palette) => palette.id !== "custom")
  .map((palette) => ({ id: palette.id, name: palette.name, color: appearanceColors({ theme: "dark", palette: palette.id }, "dark").accent }));
const hex = /^#[a-fA-F0-9]{6}$/;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/**
 * D76. The sidebar's profile button: with one profile it opens Create profile; otherwise a menu lists the profiles to switch to (the
 * same guards as Settings), plus New profile and Manage profiles.
 */
export function ProfileMenu({ sdk, snapshot, onSwitch, onCreated, onManage, onError }: {
  sdk: MoguriSdk; snapshot: Snapshot; onSwitch: (id: string) => Promise<void>; onCreated: (id: string) => Promise<void>; onManage: () => void; onError: (text: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [catalog, setCatalog] = useState<ProfileCatalog | null>(null), [menu, setMenu] = useState(false), [create, setCreate] = useState(false), [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const value = (await sdk.profiles.list()).catalog;
      setCatalog(value);
      if (value.profiles.length <= 1) setCreate(true); else setMenu(true);
    } catch (error) { onError(message(error, "Profiles couldn't be read.")); }
    finally { setBusy(false); }
  };
  const choose = (id: string) => {
    setMenu(false);
    if (id !== sdk.profileId) void onSwitch(id).catch((error: unknown) => onError(message(error, "The profile couldn't be opened.")));
  };
  const name = snapshot.profile?.name ?? sdk.profileId;
  return <>
    <button ref={button} type="button" className="profile-indicator profile-menu-button" aria-haspopup="dialog" aria-expanded={menu || create}
      aria-label={`Current profile: ${name}`} title="Switch or create profiles" disabled={busy} onClick={() => void open()}>
      {snapshot.profile?.color && <span className="status-dot" style={{ backgroundColor: snapshot.profile.color }} aria-hidden="true" />}<span>{name}</span>
    </button>
    {menu && catalog && <AnchoredMenu label="Profiles" trigger={button} close={() => setMenu(false)} className="pr-state-menu profile-menu">
      <div role="menu" aria-label="Profiles">
        {catalog.profiles.map((profile) => <button key={profile.id} type="button" role="menuitemradio" aria-checked={profile.id === sdk.profileId}
          disabled={profile.status !== "ready"} onClick={() => choose(profile.id)}>
          <span className="status-dot" style={profile.color ? { backgroundColor: profile.color } : undefined} aria-hidden="true" />
          <span><strong>{profile.name}</strong>{profile.status !== "ready" && <small>{profile.status === "creating" ? "Setting up" : "Setup incomplete. Inspect it in Settings / General."}</small>}</span>
          {profile.id === sdk.profileId && <Icon name="Check" />}
        </button>)}
        <hr />
        <button type="button" role="menuitem" onClick={() => { setMenu(false); setCreate(true); }}><Icon name="Plus" /><span><strong>New profile...</strong></span></button>
        <button type="button" role="menuitem" onClick={() => { setMenu(false); onManage(); }}><Icon name="Settings" /><span><strong>Manage profiles</strong></span></button>
      </div>
    </AnchoredMenu>}
    {create && <CreateProfileDialog sdk={sdk} close={() => setCreate(false)} created={onCreated} />}
  </>;
}

/** Name plus an accent from the swatches, or a custom color (picker or hex). Creating switches to the new profile and starts its onboarding. */
export function CreateProfileDialog({ sdk, close, created }: { sdk: MoguriSdk; close: () => void; created: (id: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const [name, setName] = useState(""), [color, setColor] = useState(profileSwatches[0]!.color), [custom, setCustom] = useState(false), [text, setText] = useState(profileSwatches[0]!.color);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const chosen = custom ? text.trim() : color, valid = hex.test(chosen);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !name.trim() || !valid) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await sdk.profiles.create(name.trim(), chosen.toLowerCase());
      const profile = await sdk.profiles.wait(result.id!);
      close();
      await created(profile.id);
    } catch (failure) { setError(message(failure, "The profile wasn't created.")); }
    finally { pending.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="workspace-dialog profile-create-dialog" aria-label="Create profile" onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <header><h2>Create profile</h2></header>
    <form onSubmit={(event) => void submit(event)}>
      <p className="fine-print">A profile is like a separate Moguri: its own settings, accounts, projects, skills and memory. You'll set it up after it opens, and you can copy model keys, repositories and skills from another profile then.</p>
      <label className="setting-field">Profile name<input aria-label="Profile name" value={name} maxLength={80} required autoFocus disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <fieldset className="profile-accent"><legend>Accent</legend>
        <div className="onboarding-swatches" role="radiogroup" aria-label="Profile accent">
          {profileSwatches.map((swatch) => <button key={swatch.id} type="button" role="radio" aria-checked={!custom && color === swatch.color} disabled={busy}
            onClick={() => { setCustom(false); setColor(swatch.color); setText(swatch.color); }}>
            <span className="onboarding-swatch" style={{ background: swatch.color }} aria-hidden="true" /><span>{swatch.name}</span>
          </button>)}
          <button type="button" role="radio" aria-checked={custom} disabled={busy} onClick={() => setCustom(true)}>
            <span className="onboarding-swatch" style={{ background: valid ? chosen : undefined }} aria-hidden="true" /><span>Custom</span>
          </button>
        </div>
        {custom && <div className="profile-custom-color">
          <label className="setting-field">Color<input type="color" aria-label="Custom accent color" value={valid ? chosen.toLowerCase() : "#000000"} disabled={busy}
            onChange={(event) => setText(event.target.value)} /></label>
          <label className="setting-field">Hex<input aria-label="Custom accent hex" value={text} maxLength={7} placeholder="#557799" disabled={busy}
            aria-invalid={!valid} onChange={(event) => setText(event.target.value)} /></label>
          {!valid && <p className="fine-print" role="status">Use a hex color like #557799.</p>}
        </div>}
      </fieldset>
      {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
      <footer className="button-row"><button type="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !name.trim() || !valid}>{busy ? "Creating..." : "Create and open"}</button></footer>
    </form>
  </dialog>;
}
