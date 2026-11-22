import { useEffect, useRef } from "react";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { GithubItem, MoguriSdk, Snapshot } from "../../../packages/sdk/src/index.ts";

/**
 * Presentation-only cache of each project's open pull requests (number, title, URL and state), per profile.
 * It lets "From code change" list PRs immediately; every selection still rereads the exact PR before a session starts.
 */
const MAX_ITEMS = 100;
const itemSchema = Type.Object({
  id: Type.Integer(), number: Type.Integer({ minimum: 1 }), title: Type.String({ maxLength: 1024 }), url: Type.String({ maxLength: 2048 }),
  state: Type.String({ maxLength: 32 }), draft: Type.Boolean(), author: Type.Union([Type.String({ maxLength: 256 }), Type.Null()]),
}, { additionalProperties: false });
const schema = Type.Object({
  schemaVersion: Type.Literal(1), repository: Type.String({ maxLength: 256 }), accountId: Type.String({ maxLength: 256 }), fetchedAt: Type.String({ maxLength: 64 }),
  items: Type.Array(itemSchema, { maxItems: MAX_ITEMS }),
}, { additionalProperties: false });
export type CachedPullRequests = Static<typeof schema>;
type CacheStorage = Pick<Storage, "getItem" | "setItem">;
const key = (profileId: string, projectId: string) => `moguri.pulls.v1:${profileId}:${projectId}`;

export function readCachedPullRequests(storage: CacheStorage, profileId: string, projectId: string): CachedPullRequests | null {
  try {
    const text = storage.getItem(key(profileId, projectId));
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (Value.Check(schema, value)) return value;
    console.warn("Moguri ignored an invalid cached pull request list; it will be read again.");
  } catch (error) { console.warn("Moguri could not read a cached pull request list; it will be read again.", error); }
  return null;
}
export function saveCachedPullRequests(storage: CacheStorage, profileId: string, projectId: string, repository: string, accountId: string, items: GithubItem[], now = new Date()): void {
  const value: CachedPullRequests = { schemaVersion: 1, repository, accountId, fetchedAt: now.toISOString(), items: items.filter((item) => item.number && item.url).slice(0, MAX_ITEMS)
    .map((item) => ({ id: item.id, number: item.number!, title: item.title, url: item.url!, state: item.state, draft: item.draft ?? false, author: item.author ?? null })) };
  try { storage.setItem(key(profileId, projectId), JSON.stringify(value)); }
  catch (error) { console.warn("Moguri could not cache this project's pull request list.", error); }
}
/** Cached entries as picker items; fields the cache does not keep stay empty. */
export const cachedItems = (cache: CachedPullRequests): GithubItem[] => cache.items.map((item) => ({ ...item, kind: "pull", body: "", updatedAt: null, headSha: null, conclusion: null }));

/** Reads one project's open PRs through its Local GitHub account and caches them. */
export async function refreshPullRequests(sdk: MoguriSdk, projectId: string): Promise<CachedPullRequests | null> {
  const scope = { env: "Local" as const, projectId };
  const context = await sdk.github.project(scope);
  const value = await sdk.github.browse(scope, { resource: "pulls", repository: context.repository, account: context.account, state: "open", page: 1, perPage: 30 });
  if (value.accountId !== context.accountId) throw new Error("The GitHub account changed while listing pull requests.");
  saveCachedPullRequests(localStorage, sdk.profileId, projectId, context.repository, context.accountId, value.items);
  return readCachedPullRequests(localStorage, sdk.profileId, projectId);
}

const START_MS = 2 * 60_000, SPACING_MS = 20_000, CYCLE_MS = 15 * 60_000, QUICK_MS = 30_000;
/**
 * Slowly keeps every project's open PR list cached in the background: starting two minutes after launch, one project every 20 s,
 * each at most every 15 minutes.
 * The returned function refreshes one project right away (at most every 30 s), for example when the user opens it.
 */
export function usePullRequestPrefetch(sdk: MoguriSdk, snapshot: Snapshot): (projectId: string) => void {
  const projects = useRef<string[]>([]), last = useRef(new Map<string, number>()), running = useRef(new Set<string>()), unavailable = useRef(new Map<string, number>());
  projects.current = snapshot.projects.map((project) => project.id);
  const refresh = (projectId: string, minimum: number) => {
    const now = Date.now();
    if (running.current.has(projectId) || now - (last.current.get(projectId) ?? 0) < minimum || now - (unavailable.current.get(projectId) ?? 0) < CYCLE_MS) return;
    running.current.add(projectId); last.current.set(projectId, now);
    void refreshPullRequests(sdk, projectId).then(() => unavailable.current.delete(projectId), (error: unknown) => {
      // Projects without a GitHub upstream or signed-in account are skipped until the next cycle.
      unavailable.current.set(projectId, Date.now());
      console.debug("Background pull request listing skipped a project:", error instanceof Error ? error.message : error);
    }).finally(() => running.current.delete(projectId));
  };
  useEffect(() => {
    if (sdk.getState().status !== "connected") return;
    let index = 0, timer: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(() => {
      timer = setInterval(() => {
        const ids = projects.current;
        if (!ids.length || document.hidden) return;
        refresh(ids[index++ % ids.length]!, CYCLE_MS);
      }, SPACING_MS);
    }, START_MS);
    return () => { clearTimeout(delay); clearInterval(timer); };
  }, [sdk, sdk.profileId]);
  return (projectId) => refresh(projectId, QUICK_MS);
}
