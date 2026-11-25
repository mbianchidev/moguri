import { useEffect, useState } from "react";
import { hostedProvider, type HostedKeyProviderId, type MoguriSdk, type ProfileImportResponse } from "@moguri-dev/sdk";
import { Alert } from "./Alert.tsx";

export type ImportKind = "models" | "repositories" | "skills";
interface Item { key: string; label: string; detail: string; disabled: boolean }
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

function items(kind: ImportKind, review: ProfileImportResponse): Item[] {
  const { preview } = review;
  if (kind === "repositories") return preview.repositories.map((repository) => ({ key: repository.projectId, label: repository.name, detail: repository.registered ? "Already in this profile." : repository.path,
    disabled: repository.registered }));
  if (kind === "skills") return preview.skillSources.map((source) => ({ key: source.id, label: source.name,
    detail: source.configured ? "Already a skill source here." : `${source.kind === "local" ? "Folder" : source.personal ? "Your repository" : "Marketplace"}: ${source.location}`, disabled: source.configured }));
  return [
    ...preview.hostedProviders.map((provider): Item => {
      const name = hostedProvider(provider.providerId)?.name ?? provider.providerId;
      return { key: `hosted:${provider.providerId}`, label: `${name} key`, disabled: provider.configured || provider.credential !== "api_key",
        detail: provider.configured ? "Already set up here." : provider.credential === "oauth" ? "Signed in there. Sign-ins aren't copied; sign in again here." :
          provider.credential === "api_key" ? "Copied into this profile's own keychain slot." : "No key is stored there." };
    }),
    ...preview.localEndpoints.map((endpoint): Item => ({ key: `endpoint:${endpoint.id}`, label: endpoint.name, disabled: endpoint.configured,
      detail: endpoint.configured ? "An endpoint with this ID is already here." : `${endpoint.baseUrl}, ${endpoint.models} model${endpoint.models === 1 ? "" : "s"}${endpoint.keyStored ? ", with its key" : ""}` })),
    ...preview.modelPreferences ? [{ key: "preferences", label: "Model switches and sources", disabled: false,
      detail: `${preview.modelPreferences.disabledProviders + preview.modelPreferences.disabledModels} switched off, ${preview.modelPreferences.sources} source choice${preview.modelPreferences.sources === 1 ? "" : "s"}. Replaces this profile's.` }] : [],
  ];
}
const nouns: Record<ImportKind, string> = { models: "model providers", repositories: "repositories", skills: "skill sources" };
const notes: Record<ImportKind, string> = {
  models: `Keys are copied inside Moguri into this profile's own keychain slots, so each can be removed or rotated on its own. The other profile isn't changed.`,
  repositories: "They're added at the same folders, not cloned, so both profiles use one checkout. The other profile isn't changed.",
  skills: "The sources are added here; marketplace skills stay off until you trust them in this profile. The other profile isn't changed.",
};

/**
 * D76. One optional onboarding import step: choose items from the source profile, review exactly what will be copied, then import.
 * `done` receives a short answer for the conversation: what was imported, or that the step was skipped.
 */
export function ImportStep({ sdk, kind, sourceId, sourceName, done }: { sdk: MoguriSdk; kind: ImportKind; sourceId: string; sourceName: string; done: (answer: string) => void }) {
  const [review, setReview] = useState<ProfileImportResponse | null>(null), [chosen, setChosen] = useState<string[]>([]), [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void sdk.profiles.imports.preview(sourceId).then((value) => { if (current) setReview(value); },
      (failure: unknown) => { if (current) setError(message(failure, `${sourceName} couldn't be read. Skip this step or try again later from Settings.`)); });
    return () => { current = false; };
  }, [sdk, sourceId, sourceName]);
  const list = review ? items(kind, review) : [], selected = list.filter((item) => chosen.includes(item.key) && !item.disabled);
  const apply = async () => {
    if (!review || busy || !selected.length) return;
    setBusy(true); setError("");
    try {
      const keys = selected.map((item) => item.key);
      if (kind === "repositories") await sdk.profiles.imports.repositories(sourceId, review.digest, keys);
      else if (kind === "skills") await sdk.profiles.imports.apply(sourceId, review.digest, { skillSources: keys });
      else await sdk.profiles.imports.apply(sourceId, review.digest, {
        hostedProviders: keys.filter((key) => key.startsWith("hosted:")).map((key) => key.slice(7) as HostedKeyProviderId),
        localEndpoints: keys.filter((key) => key.startsWith("endpoint:")).map((key) => key.slice(9)), modelPreferences: keys.includes("preferences") });
      done(`Imported ${selected.length} from ${sourceName}`);
    } catch (failure) { setError(message(failure, "Nothing was imported. Review it again or skip this step.")); setConfirming(false); }
    finally { setBusy(false); }
  };
  return <div className="onboarding-card">
    {!review && !error && <p className="fine-print" role="status">Reading {sourceName}...</p>}
    {review && !list.length && <p className="fine-print">{sourceName} has no {nouns[kind]} to copy.</p>}
    {review && list.length > 0 && !confirming && <ul className="onboarding-toggles" aria-label={`${sourceName} ${nouns[kind]}`}>
      {list.map((item) => <li key={item.key}><label className="check-setting"><input type="checkbox" checked={chosen.includes(item.key) && !item.disabled} disabled={busy || item.disabled}
        onChange={(event) => { const on = event.target.checked; setChosen((current) => on ? [...current, item.key] : current.filter((key) => key !== item.key)); }} />
        <span>{item.label}<small>{item.detail}</small></span></label></li>)}
    </ul>}
    {confirming && <div className="onboarding-review" aria-label="Review import">
      <p>Copy {selected.length === 1 ? "this" : `these ${selected.length}`} from {sourceName} into this profile:</p>
      <ul>{selected.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
      <p className="fine-print">{notes[kind]}</p>
    </div>}
    {error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    <div className="button-row">
      {confirming ? <><button type="button" className="primary" disabled={busy} onClick={() => void apply()}>{busy ? "Importing..." : "Import"}</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Back</button></> :
        <><button type="button" className="primary" disabled={busy || !selected.length} onClick={() => { setError(""); setConfirming(true); }}>Review</button>
          <button type="button" disabled={busy} onClick={() => done("Skipped")}>{list.length ? "Skip" : "Continue"}</button></>}
    </div>
  </div>;
}
