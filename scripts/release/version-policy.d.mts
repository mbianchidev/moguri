export const TAG_PREFIX: "v";
export class VersionPolicyError extends Error {
  code: number;
  constructor(message: string, code?: number);
}
export interface NormalizedVersion { version: string; tag: string; prerelease: boolean }
export function normalizeVersion(input: string): NormalizedVersion;
export function gapWarnings(previous: string, chosen: string): string[];
export function checkRelease(input: string, options?: { published?: string[]; current?: string }): NormalizedVersion & {
  previous: string | null;
  baseline: string | null;
  firstRelease: boolean;
  warnings: string[];
};
