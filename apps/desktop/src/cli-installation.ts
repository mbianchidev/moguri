import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { access, link, lstat, mkdir, open, readFile, realpath, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface CliInstallationStatus {
  path: string;
  available: boolean;
  state: "absent" | "installed" | "stale" | "conflict";
  detail: string;
  digest: string | null;
}

export type CliInstallationRequest = { action: "status" | "install" } | { action: "remove"; expectedDigest: string };

const launch = `
if [ ! -x "$app_root/node_modules/node/bin/node" ] || [ ! -f "$app_root/dist/cli.mjs" ]; then
  printf '%s\\n' "Moguri: the bundled Node runtime or CLI is missing at $app_root." >&2
  printf '%s\\n' 'If the app moved or was removed, open Moguri at its current location and use Settings > General > Command line to remove and reinstall the moguri command. Reinstall the app if its bundled files are missing.' >&2
  exit 127
fi
exec "$app_root/node_modules/node/bin/node" "$app_root/dist/cli.mjs" "$@"
`;

// Package managers such as Homebrew expose the bundled launcher through a symlink, so it follows its own link chain to find the app.
export function bundledCliLauncher(): string {
  return `#!/bin/sh
self=$0
hops=0
while [ -L "$self" ]; do
  hops=$((hops + 1))
  if [ "$hops" -gt 40 ]; then printf '%s\\n' "Moguri: too many symbolic links while resolving $0." >&2; exit 127; fi
  target=$(/usr/bin/readlink -- "$self") || exit 127
  case $target in /*) self=$target ;; *) self=$(/usr/bin/dirname -- "$self")/$target ;; esac
done
app_root=$(CDPATH= cd -P -- "$(/usr/bin/dirname -- "$self")/.." && pwd -P) || exit 127
${launch}`;
}

const marker = "# Moguri managed CLI launcher v1 ";
const hasCode = (error: unknown, code: string) => error instanceof Error && "code" in error && error.code === code;
const missing = (error: unknown) => hasCode(error, "ENOENT");
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

function installedCliLauncher(appRoot: string): string {
  return `#!/bin/sh\n${marker}${Buffer.from(appRoot).toString("base64")}\napp_root=${shellQuote(appRoot)}\n${launch}`;
}

interface InstalledCommand { metadata: Stats; appRoot: string | null; digest: string | null }

export class CliInstallation {
  readonly path: string;
  private readonly appRoot: string | null;

  constructor(appRoot: string | null, home: string) {
    if (!isAbsolute(home) || appRoot !== null && !isAbsolute(appRoot)) throw new Error("Command installation requires explicit absolute application and home paths.");
    this.appRoot = appRoot;
    this.path = join(home, ".local", "bin", "moguri");
  }

  private async bundle(): Promise<{ root: string | null; reason: string | null }> {
    if (!this.appRoot) return { root: null, reason: "Install the command from a packaged macOS Moguri app, not an unpackaged development client." };
    try {
      const root = await realpath(this.appRoot);
      if (!root.endsWith(".app/Contents/Resources/app")) return { root: null, reason: "The running app does not have the expected bundled resources layout." };
      if (root.startsWith("/Volumes/") || root.includes("/AppTranslocation/")) return { root: null, reason: "Copy Moguri.app to Applications and open that copy before installing the command. Mounted installers and translocated apps are temporary." };
      await access(join(root, "node_modules", "node", "bin", "node"), constants.X_OK);
      if (!(await stat(join(root, "dist", "cli.mjs"))).isFile() ||
        await readFile(join(root, "dist", "moguri"), "utf8") !== bundledCliLauncher()) return { root: null, reason: "The app's bundled CLI or launcher is incomplete. Reinstall Moguri before installing the command." };
      return { root, reason: null };
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].some((code) => hasCode(error, code))) throw error;
      return { root: null, reason: `Command installation is unavailable: ${String(error)}` };
    }
  }

  private async directories(create: boolean): Promise<boolean> {
    for (const path of [dirname(dirname(this.path)), dirname(this.path)]) {
      if (create) {
        try { await mkdir(path, { mode: 0o755 }); }
        catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
      }
      let metadata: Stats;
      try { metadata = await lstat(path); } catch (error) { if (!create && missing(error)) return false; throw error; }
      if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== process.getuid?.() || metadata.mode & 0o022) throw new Error(`Command directory ${path} must be user-owned, not group/world-writable, and not a symbolic link. No alternate destination was used.`);
    }
    return true;
  }

  private async inspect(): Promise<InstalledCommand | null> {
    if (!await this.directories(false)) return null;
    let metadata: Stats;
    try { metadata = await lstat(this.path); } catch (error) { if (missing(error)) return null; throw error; }
    if (!metadata.isFile() || metadata.size > 16_384 || metadata.uid !== process.getuid?.() || metadata.mode & 0o022) return { metadata, appRoot: null, digest: null };
    const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const held = await file.stat();
      if (held.ino !== metadata.ino || held.dev !== metadata.dev) throw new Error("The command changed during inspection. Refresh before modifying it.");
      const text = await file.readFile("utf8"), header = text.split("\n")[1];
      if (!header?.startsWith(marker)) return { metadata, appRoot: null, digest: null };
      const appRoot = Buffer.from(header.slice(marker.length), "base64").toString("utf8");
      if (!isAbsolute(appRoot) || resolve(appRoot) !== appRoot || text !== installedCliLauncher(appRoot)) return { metadata, appRoot: null, digest: null };
      return { metadata, appRoot, digest: digest(text) };
    } finally { await file.close(); }
  }

  async status(): Promise<CliInstallationStatus> {
    const [bundle, installed] = await Promise.all([this.bundle(), this.inspect()]);
    let state: CliInstallationStatus["state"] = "absent", detail = "The moguri command is not installed.";
    if (installed) {
      if (!installed.appRoot) { state = "conflict"; detail = `An existing command at ${this.path} is not an unchanged Moguri-managed launcher. It will not be overwritten or removed.`; }
      else if (installed.appRoot === bundle.root && installed.metadata.mode & 0o100) { state = "installed"; detail = "The moguri command is installed for this app."; }
      else { state = "stale"; detail = "The managed command points to a different or missing app, or is not executable. Remove it, then install again from the current app."; }
    }
    return { path: this.path, available: bundle.root !== null, state, detail: bundle.reason ? `${bundle.reason} ${detail}` : detail, digest: installed?.digest ?? null };
  }

  async install(): Promise<CliInstallationStatus> {
    const before = await this.status();
    if (!before.available) throw new Error(before.detail);
    if (before.state === "installed") return before;
    if (before.state !== "absent") throw new Error(before.detail);
    const bundle = await this.bundle();
    if (!bundle.root) throw new Error(bundle.reason ?? "The actual bundled runtime could not be verified.");
    const directory = dirname(this.path);
    await this.directories(true);
    const temporary = join(directory, `.moguri-${randomUUID()}.tmp`), file = await open(temporary, "wx", 0o700);
    try {
      try { await file.writeFile(installedCliLauncher(bundle.root)); await file.chmod(0o755); await file.sync(); }
      finally { await file.close(); }
      await link(temporary, this.path);
    } catch (error) {
      await unlink(temporary).catch((cleanup: unknown) => { throw new AggregateError([error, cleanup], "Command installation failed and its exact staging file could not be removed."); });
      throw new Error(`Could not install ${this.path}. No existing command was overwritten: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    try { await unlink(temporary); }
    catch (error) { throw new Error(`The command was published at ${this.path}, but staging cleanup failed. Refresh its status before retrying.`, { cause: error }); }
    const installed = await this.status();
    if (installed.state !== "installed") throw new Error(`Command publication needs inspection: ${installed.detail}`);
    return installed;
  }

  async remove(expectedDigest: string): Promise<CliInstallationStatus> {
    const installed = await this.inspect();
    if (!/^[a-f0-9]{64}$/.test(expectedDigest) || !installed?.digest || installed.digest !== expectedDigest) throw new Error("The command is not an unchanged managed launcher or changed since review. Refresh before removing it; no command was removed.");
    await this.directories(false);
    const current = await lstat(this.path);
    if (current.ino !== installed.metadata.ino || current.dev !== installed.metadata.dev ||
      current.mtimeMs !== installed.metadata.mtimeMs || current.ctimeMs !== installed.metadata.ctimeMs) throw new Error("The reviewed command changed before removal. No command was removed.");
    await unlink(this.path);
    return this.status();
  }
}
