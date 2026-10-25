import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { bundledCliLauncher, CliInstallation } from "../apps/desktop/src/cli-installation.ts";

const execute = promisify(execFile);
const generatedCli = `console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid, runtime: process.execPath })); process.exitCode = Number(process.env.GENERATED_EXIT ?? 0);`;

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "moguri-cli-installation-")));
  const appRoot = join(directory, "Generated app's $bundle", "Moguri.app", "Contents", "Resources", "app");
  await mkdir(join(appRoot, "dist"), { recursive: true });
  await mkdir(join(appRoot, "node_modules", "node", "bin"), { recursive: true });
  await symlink(process.execPath, join(appRoot, "node_modules", "node", "bin", "node"));
  await writeFile(join(appRoot, "dist", "cli.mjs"), generatedCli);
  await writeFile(join(appRoot, "dist", "moguri"), bundledCliLauncher(), { mode: 0o755 });
  const home = join(directory, "generated-home");
  await mkdir(home);
  return { directory, appRoot, home, close: () => rm(directory, { recursive: true, force: true }) };
}

test("the bundled launcher uses its own Node and preserves arguments, working directory and exit codes", async () => {
  const f = await fixture();
  try {
    const path = join(f.appRoot, "dist", "moguri");
    const args = ["space argument", "'quoted'", "$HOME", "`not a command`", "", "line\nbreak"];
    const result = await execute(path, args, { cwd: f.directory, env: { PATH: "/usr/bin:/bin" } });
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.args, args);
    assert.equal(report.cwd, f.directory);
    assert.equal(report.runtime, process.execPath);
    await assert.rejects(() => execute(path, [], { env: { PATH: "/usr/bin:/bin", GENERATED_EXIT: "37" } }), { code: 37 });
  } finally { await f.close(); }
});

test("explicit installation publishes an executable bound to this app without changing shell configuration", async () => {
  const f = await fixture();
  try {
    const installation = new CliInstallation(f.appRoot, f.home);
    const before = await installation.status();
    assert.equal(before.state, "absent");
    assert.equal(before.available, true);
    await assert.rejects(() => lstat(join(f.home, ".local")), { code: "ENOENT" });
    const installed = await installation.install();
    assert.equal(installed.state, "installed");
    assert.equal(installed.path, join(f.home, ".local", "bin", "moguri"));
    assert.match(installed.digest!, /^[a-f0-9]{64}$/);
    const metadata = await lstat(installed.path);
    assert.equal(metadata.mode & 0o777, 0o755);
    const args = ["a quoted path", "'$literal'"];
    assert.deepEqual(JSON.parse((await execute(installed.path, args, { env: { PATH: "/usr/bin:/bin" } })).stdout).args, args);
    assert.deepEqual(await installation.install(), installed);
    assert.equal((await lstat(installed.path)).mtimeMs, metadata.mtimeMs);
    await assert.rejects(() => lstat(join(f.home, ".zshrc")), { code: "ENOENT" });
  } finally { await f.close(); }
});

test("both launchers exec the CLI in place and retain normal SIGTERM and SIGINT termination", async () => {
  const f = await fixture();
  try {
    const installed = await new CliInstallation(f.appRoot, f.home).install();
    await writeFile(join(f.appRoot, "dist", "cli.mjs"), `console.log(JSON.stringify({ pid: process.pid })); setInterval(() => {}, 1000);`);
    for (const path of [join(f.appRoot, "dist", "moguri"), installed.path]) for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const child = spawn(path, [], { env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] });
      const exited = once(child, "exit");
      try {
        const [data] = await once(child.stdout!, "data");
        assert.equal(JSON.parse(String(data)).pid, child.pid);
        assert.equal(child.kill(signal), true);
        assert.deepEqual(await exited, [null, signal]);
      } finally {
        if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
      }
    }
  } finally { await f.close(); }
});

test("removal requires the reviewed unchanged managed command and leaves shell configuration intact", async () => {
  const f = await fixture();
  try {
    const installation = new CliInstallation(f.appRoot, f.home), installed = await installation.install();
    await writeFile(join(f.home, ".zshrc"), "# Generated existing shell settings\n");
    await assert.rejects(() => installation.remove("0".repeat(64)), /changed|review/i);
    assert.equal((await installation.status()).state, "installed");
    assert.equal((await installation.remove(installed.digest!)).state, "absent");
    await assert.rejects(() => lstat(installed.path), { code: "ENOENT" });
    assert.equal(await readFile(join(f.home, ".zshrc"), "utf8"), "# Generated existing shell settings\n");
    const replacement = await installation.install();
    await writeFile(replacement.path, "#!/bin/sh\nprintf 'Generated foreign command\\n'\n");
    await assert.rejects(() => installation.remove(replacement.digest!), /changed|managed|review/i);
    assert.match(await readFile(replacement.path, "utf8"), /Generated foreign command/);
  } finally { await f.close(); }
});

test("installation never replaces existing files, directories, dangling symlinks or the manual workaround", async () => {
  for (const kind of ["file", "directory", "symlink", "workaround"] as const) {
    const f = await fixture();
    try {
      const installation = new CliInstallation(f.appRoot, f.home), { path } = await installation.status();
      await mkdir(dirname(path), { recursive: true });
      if (kind === "directory") await mkdir(path);
      else if (kind === "symlink") await symlink(join(f.directory, "missing-command"), path);
      else await writeFile(path, kind === "workaround" ? `#!/bin/sh\nexec "/Applications/Moguri.app/Contents/Resources/app/node_modules/node/bin/node" "/Applications/Moguri.app/Contents/Resources/app/dist/cli.mjs" "$@"\n` : "Generated existing command\n");
      const original = await lstat(path);
      assert.equal((await installation.status()).state, "conflict");
      await assert.rejects(() => installation.install(), /existing command|overwritten/i);
      await assert.rejects(() => installation.remove("0".repeat(64)), /managed|review|changed/i);
      assert.equal((await lstat(path)).ino, original.ino);
      assert.deepEqual(await readdir(dirname(path)), ["moguri"]);
    } finally { await f.close(); }
  }
});

test("concurrent installations publish only complete launchers without overwriting another writer", async () => {
  const f = await fixture();
  try {
    const first = new CliInstallation(f.appRoot, f.home), second = new CliInstallation(f.appRoot, f.home);
    const results = await Promise.allSettled([first.install(), second.install()]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    for (const result of results) if (result.status === "rejected") assert.match(String(result.reason), /existing command|overwritten/);
    const installed = await first.status();
    assert.equal(installed.state, "installed");
    assert.deepEqual(JSON.parse((await execute(installed.path, ["concurrent"])).stdout).args, ["concurrent"]);
    assert.deepEqual(await readdir(dirname(installed.path)), ["moguri"]);
  } finally { await f.close(); }
});

test("a moved or missing app fails clearly without substitution and supports explicit remove/reinstall", async () => {
  const f = await fixture();
  try {
    const installation = new CliInstallation(f.appRoot, f.home), installed = await installation.install();
    const app = resolve(f.appRoot, "../../.."), moved = join(f.directory, "Generated relocated app", "Renamed Moguri.app");
    await mkdir(dirname(moved));
    await rename(app, moved);
    await assert.rejects(() => execute(installed.path), (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && "stderr" in error);
      assert.equal(error.code, 127);
      assert.match(String(error.stderr), /app moved or was removed/);
      return true;
    });
    const root = join(moved, "Contents", "Resources", "app"), current = new CliInstallation(root, f.home);
    assert.equal((await current.status()).state, "stale");
    assert.deepEqual(JSON.parse((await execute(join(root, "dist", "moguri"), ["moved"])).stdout).args, ["moved"]);
    await assert.rejects(() => current.install(), /Remove it/);
    await current.remove(installed.digest!);
    const repaired = await current.install();
    assert.equal(repaired.state, "installed");
    assert.notEqual(repaired.digest, installed.digest);
    assert.deepEqual(JSON.parse((await execute(repaired.path, ["repaired"])).stdout).args, ["repaired"]);
  } finally { await f.close(); }
});

test("unpackaged or incomplete apps cannot install a command and missing bundle files exit nonzero", async () => {
  for (const removed of ["cli", "node"] as const) {
    const f = await fixture();
    try {
      const development = new CliInstallation(null, f.home);
      assert.equal((await development.status()).available, false);
      await assert.rejects(() => development.install(), /packaged macOS/);
      const path = removed === "cli" ? join(f.appRoot, "dist", "cli.mjs") : join(f.appRoot, "node_modules", "node", "bin", "node");
      await unlink(path);
      const installation = new CliInstallation(f.appRoot, f.home);
      assert.equal((await installation.status()).available, false);
      await assert.rejects(() => installation.install(), /unavailable|incomplete/);
      await assert.rejects(() => execute(join(f.appRoot, "dist", "moguri")), { code: 127 });
      await assert.rejects(() => lstat(join(f.home, ".local")), { code: "ENOENT" });
    } finally { await f.close(); }
  }
});

test("installation refuses symlinked command directories instead of writing outside the displayed destination", async () => {
  const f = await fixture();
  try {
    const elsewhere = join(f.directory, "generated-elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, join(f.home, ".local"));
    await assert.rejects(() => new CliInstallation(f.appRoot, f.home).install(), /symbolic link|symlink/i);
    assert.deepEqual(await readdir(elsewhere), []);
  } finally { await f.close(); }
});

test("restart observes actual files without replaying private staging and can remove a now-broken managed launcher", async () => {
  const f = await fixture();
  try {
    const installation = new CliInstallation(f.appRoot, f.home), { path } = await installation.status();
    await mkdir(dirname(path), { recursive: true });
    const staged = join(dirname(path), ".moguri-generated-interrupted.tmp");
    await writeFile(staged, "#!/bin/sh\n# Generated interrupted staging\n", { mode: 0o700 });
    const restarted = new CliInstallation(f.appRoot, f.home);
    assert.equal((await restarted.status()).state, "absent");
    await assert.rejects(() => lstat(path), { code: "ENOENT" });
    const installed = await restarted.install();
    assert.equal((await new CliInstallation(f.appRoot, f.home).status()).digest, installed.digest);
    await unlink(join(f.appRoot, "dist", "cli.mjs"));
    const broken = await restarted.status();
    assert.equal(broken.state, "stale");
    assert.equal(broken.available, false);
    assert.equal((await restarted.remove(installed.digest!)).state, "absent");
    assert.match(await readFile(staged, "utf8"), /Generated interrupted staging/);
  } finally { await f.close(); }
});

test("translocated apps require an installed copy before publishing a command", async () => {
  const f = await fixture();
  try {
    const app = resolve(f.appRoot, "../../.."), moved = join(f.directory, "AppTranslocation", "Moguri.app");
    await mkdir(dirname(moved));
    await rename(app, moved);
    const installation = new CliInstallation(join(moved, "Contents", "Resources", "app"), f.home);
    assert.equal((await installation.status()).available, false);
    await assert.rejects(() => installation.install(), /Copy Moguri.app to Applications/);
    await assert.rejects(() => lstat(join(f.home, ".local")), { code: "ENOENT" });
  } finally { await f.close(); }
});
