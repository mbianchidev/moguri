export const REPOSITORY: "mbianchidev/moguri";
export const ARCH: "arm64";
export interface AssetNames { dmg: string; zip: string; manifest: string; provenance: string; sums: string }
export interface AssetIdentity { version: string; tag: string; commit: string; tree: string; prerelease: boolean }
export function assetNames(version: string): AssetNames;
export function fileDigest(path: string, algorithm?: string): Promise<string>;
export function stageAssets(options: AssetIdentity & { source: string; out: string; builtAt?: string }): Promise<AssetNames>;
export function verifyAssets(options: AssetIdentity & { dir: string; digests?: Record<string, string> }): Promise<{ names: AssetNames; sha256: Record<string, string> }>;
