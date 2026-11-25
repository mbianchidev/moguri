import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { ThinkingEffortSchema, type Snapshot } from "@moguri-dev/sdk";

export const STARTUP_CACHE_MAX_BYTES = 256 * 1024;
const scopeSchema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const profileSchema = Type.String({ pattern: "^[A-Za-z0-9_-]{1,128}$" });
const modelSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 256 }), name: Type.String({ minLength: 1, maxLength: 512 }),
  providerId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
  thinkingLevels: Type.Array(ThinkingEffortSchema, { maxItems: 7, uniqueItems: true }),
}, { additionalProperties: false });
const viewSchema = Type.Object({
  schemaVersion: Type.Literal(1), scopeKey: scopeSchema, storeId: scopeSchema, profileId: profileSchema,
  session: Type.Union([Type.Null(), Type.Object({
    id: Type.String({ pattern: "^[A-Za-z0-9_-]{1,128}$" }),
    draftRevision: Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })), draftEmpty: Type.Optional(Type.Boolean()),
    modelId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    thinkingEffort: Type.Union([ThinkingEffortSchema, Type.Null()]),
  }, { additionalProperties: false })]),
  models: Type.Array(modelSchema, { maxItems: 512 }),
}, { additionalProperties: false });
const profileHintSchema = Type.Object({
  schemaVersion: Type.Literal(1), scopeKey: scopeSchema, profileId: profileSchema,
}, { additionalProperties: false });
export type StartupView = Static<typeof viewSchema>;
export type StartupModel = Static<typeof modelSchema>;
export interface StartupContext { scopeKey: string | null; profileId: string; profileExplicit: boolean }
type CacheStorage = Pick<Storage, "getItem" | "setItem">;
function checked<T extends TSchema>(schema: T, value: unknown): Static<T> {
  if (!Value.Check(schema, value)) throw new Error("The cached startup presentation has an unsupported version or invalid metadata. Live state was not replaced.");
  return value;
}
function bounded(text: string): string {
  if (text.length > STARTUP_CACHE_MAX_BYTES || new TextEncoder().encode(text).byteLength > STARTUP_CACHE_MAX_BYTES) {
    throw new Error("The startup presentation cache exceeds its bounded metadata size. No history or replacement cache was used.");
  }
  return text;
}
function decoded(text: string): unknown {
  try { return JSON.parse(bounded(text)); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error("The cached startup presentation is not valid JSON. Live state was not replaced.", { cause: error });
  }
}
const profileKey = (scopeKey: string) => `moguri.startup.v1:${checked(scopeSchema, scopeKey)}:profile`;
const viewKey = (scopeKey: string, profileId: string) => `moguri.startup.v1:${checked(scopeSchema, scopeKey)}:view:${checked(profileSchema, profileId)}`;

export function readStartupProfile(storage: CacheStorage, context: StartupContext): string {
  if (context.profileExplicit || context.scopeKey === null) return context.profileId;
  const text = storage.getItem(profileKey(context.scopeKey));
  if (text === null) return context.profileId;
  const value = checked(profileHintSchema, decoded(text));
  if (value.scopeKey !== context.scopeKey) throw new Error("The cached startup profile belongs to a different root. No profile was selected.");
  return value.profileId;
}
export function readStartupView(storage: CacheStorage, scopeKey: string, profileId: string): StartupView | null {
  const text = storage.getItem(viewKey(scopeKey, profileId));
  if (text === null) return null;
  const value = checked(viewSchema, decoded(text));
  if (value.scopeKey !== scopeKey || value.profileId !== profileId) throw new Error("The cached startup presentation belongs to a different root/profile. No view was restored.");
  return value;
}
export function saveStartupView(storage: CacheStorage, view: StartupView): void {
  checked(viewSchema, view);
  storage.setItem(viewKey(view.scopeKey, view.profileId), bounded(JSON.stringify(view)));
  storage.setItem(profileKey(view.scopeKey), JSON.stringify({ schemaVersion: 1, scopeKey: view.scopeKey, profileId: view.profileId }));
}
export function isModelDiscoveryPending(provider: Snapshot["provider"]): boolean {
  return provider.status === "connecting" || Boolean(provider.connections?.some((provider) => provider.status === "connecting"));
}
export function createStartupView(scopeKey: string, storeId: string, snapshot: Snapshot, sessionId: string | null, previous?: StartupView | null): StartupView {
  const session = snapshot.sessions.find((session) => session.id === sessionId);
  const matching = previous?.scopeKey === scopeKey && previous.storeId === storeId && previous.profileId === snapshot.profileId;
  const current = snapshot.provider.models.map(({ id, name, providerId, thinkingLevels }) => ({
    id, name, providerId: providerId ?? null, thinkingLevels: [...thinkingLevels ?? []],
  }));
  const available = new Set(current.map((model) => model.id));
  const refreshing = new Set(snapshot.provider.connections?.filter((provider) => provider.status === "connecting").map((provider) => provider.id));
  const retained = matching ? previous.models.filter((model) => !available.has(model.id) &&
    (model.providerId !== null && refreshing.has(model.providerId) || snapshot.provider.status === "connecting" && !snapshot.provider.connections?.length)) : [];
  const models = snapshot.provider.status === "connected" || isModelDiscoveryPending(snapshot.provider) ? [...current, ...retained] : [];
  return checked(viewSchema, {
    schemaVersion: 1, scopeKey, storeId, profileId: snapshot.profileId, models,
    session: session ? { id: session.id, modelId: session.controls.modelId, thinkingEffort: session.controls.modelOptions?.thinkingEffort ?? null } : null,
  });
}
