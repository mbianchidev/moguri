import { Type } from "typebox";
import { Value } from "typebox/value";

/** Presentation-only sidebar state: which projects and project groups the user collapsed, per profile. */
export interface CollapsedNavigation { projects: Set<string>; folders: Set<string> }
type NavigationStorage = Pick<Storage, "getItem" | "setItem">;

const MAX_IDS = 2048;
const ids = Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: MAX_IDS, uniqueItems: true });
const schema = Type.Object({ schemaVersion: Type.Literal(1), projects: ids, folders: ids }, { additionalProperties: false });
const key = (profileId: string) => `moguri.navigation.v1:${profileId}:collapsed`;
const empty = (): CollapsedNavigation => ({ projects: new Set(), folders: new Set() });

export function readCollapsedNavigation(storage: NavigationStorage, profileId: string): CollapsedNavigation {
  let text: string | null;
  try { text = storage.getItem(key(profileId)); }
  catch (error) { console.warn("Moguri could not read the saved sidebar collapse state; groups start expanded.", error); return empty(); }
  if (text === null) return empty();
  let value: unknown;
  try { value = JSON.parse(text); } catch { value = null; }
  if (!Value.Check(schema, value)) {
    console.warn("Moguri ignored an invalid saved sidebar collapse state; groups start expanded.");
    return empty();
  }
  return { projects: new Set(value.projects), folders: new Set(value.folders) };
}

/** Saves only IDs that still exist, so removed projects and groups do not accumulate. */
export function saveCollapsedNavigation(storage: NavigationStorage, profileId: string, state: CollapsedNavigation, existing: CollapsedNavigation): void {
  const kept = (values: Set<string>, present: Set<string>) => [...values].filter((id) => present.has(id)).slice(0, MAX_IDS);
  try { storage.setItem(key(profileId), JSON.stringify({ schemaVersion: 1, projects: kept(state.projects, existing.projects), folders: kept(state.folders, existing.folders) })); }
  catch (error) { console.warn("Moguri could not save the sidebar collapse state.", error); }
}
