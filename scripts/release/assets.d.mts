export const RELEASE_REPOSITORIES: readonly ["moguri-dev/moguri", "mbianchidev/moguri"];
export type ReleaseRepository = typeof RELEASE_REPOSITORIES[number];
export function releaseRepository(env?: Record<string, string | undefined>): ReleaseRepository;
export const REPOSITORY: ReleaseRepository;
export const ARCH: "arm64";
export interface AssetNames { dmg: string; zip: string; manifest: string; provenance: string; sums: string }
export interface AssetIdentity { version: string; tag: string; commit: string; tree: string; prerelease: boolean }
export function assetNames(version: string): AssetNames;
export function fileDigest(path: string, algorithm?: string): Promise<string>;
export function stageAssets(options: AssetIdentity & { source: string; out: string; builtAt?: string }): Promise<AssetNames>;
export function verifyAssets(options: AssetIdentity & { dir: string; digests?: Record<string, string> }): Promise<{ names: AssetNames; sha256: Record<string, string> }>;
