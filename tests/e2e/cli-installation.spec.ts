import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { execFile } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url), execute = promisify(execFile);
test.skip(process.platform !== "darwin", "The native command installer is macOS-only.");

test("explicit native command installation and removal use a generated home, preserve conflicts and show PATH instructions", async () => {
  const fixture = await setupFixture();
  let app: ElectronApplication | undefined;
  try {
    const appRoot = join(fixture.directory, "Generated app's $bundle", "Moguri.app", "Contents", "Resources", "app"), home = join(fixture.directory, "generated-home");
    await mkdir(join(appRoot, "dist"), { recursive: true });
    await mkdir(join(appRoot, "node_modules", "node", "bin"), { recursive: true });
    await mkdir(home);
    await symlink(require.resolve("node/bin/node"), join(appRoot, "node_modules", "node", "bin", "node"));
    await writeFile(join(appRoot, "dist", "cli.mjs"), `console.log(JSON.stringify(process.argv.slice(2)));`);
    await copyFile(resolve("dist/moguri"), join(appRoot, "dist", "moguri"));
    await chmod(join(appRoot, "dist", "moguri"), 0o755);
    const startup = "# Generated existing shell configuration\n";
    await writeFile(join(home, ".zshrc"), startup);
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_CLI_APP_ROOT: appRoot, MOGURI_TEST_CLI_HOME: home },
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const section = page.getByRole("region", { name: "Command line installation", exact: true });
    const install = section.getByRole("button", { name: "Install moguri command", exact: true }), remove = section.getByRole("button", { name: "Remove moguri command", exact: true });
    await expect(install).toBeEnabled();
    await expect(remove).toBeDisabled();
    await expect(section.getByText('export PATH="$HOME/.local/bin:$PATH"', { exact: true })).toBeVisible();
    await expect(lstat(join(home, ".local"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(page.evaluate(() => window.moguri.cliInstallation(Object.assign({ action: "install" as const }, { path: "/unreviewed-command" })))).rejects.toThrow(/explicit|unsupported|invalid/i);
    await install.click();
    await expect(section.getByRole("status")).toContainText("installed for this app");
    const path = join(home, ".local", "bin", "moguri"), args = ["generated argument", "'$literal'", ""];
    expect(JSON.parse((await execute(path, args, { env: { PATH: "/usr/bin:/bin" } })).stdout)).toEqual(args);
    expect(await readFile(join(home, ".zshrc"), "utf8")).toBe(startup);
    await writeFile(path, "#!/bin/sh\nprintf 'Generated foreign replacement\\n'\n");
    await remove.click();
    await expect(section.getByRole("alert")).toContainText("changed");
    expect(await readFile(path, "utf8")).toContain("Generated foreign replacement");
    await section.getByRole("button", { name: "Refresh command status", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("will not be overwritten or removed");
    await expect(remove).toBeDisabled();
    await expect(install).toBeDisabled();
    await unlink(path);
    await section.getByRole("button", { name: "Refresh command status", exact: true }).click();
    await expect(install).toBeEnabled();
    await install.click();
    await expect(remove).toBeEnabled();
    await remove.click();
    await expect(section.getByRole("status")).toContainText("not installed");
    await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(home, ".zshrc"), "utf8")).toBe(startup);
    expect(fixture.requests.length).toBe(0);
  } finally { await app?.close(); await fixture.close(); }
});

test("the unpackaged desktop cannot install a shell command", async () => {
  test.skip(Boolean(process.env.MOGURI_TEST_APP), "This check intentionally uses an unpackaged development client.");
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_CLI_APP_ROOT: "", MOGURI_TEST_CLI_HOME: join(fixture.directory, "unused-home") },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const section = page.getByRole("region", { name: "Command line installation", exact: true });
    await expect(section.getByRole("status")).toContainText("packaged macOS Moguri app");
    await expect(section.getByRole("button", { name: "Install moguri command", exact: true })).toBeDisabled();
  } finally { await app.close(); await fixture.close(); }
});

test("the actual packaged app installs its shipped CLI using its bundled runtime", async () => {
  const executablePath = process.env.MOGURI_TEST_APP;
  test.skip(!executablePath, "Requires an actual packaged Moguri executable.");
  const fixture = await setupFixture();
  let app: ElectronApplication | undefined;
  try {
    const home = join(fixture.directory, "generated-packaged-home");
    await mkdir(home);
    app = await electron.launch({
      executablePath, args: [],
      env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_CLI_APP_ROOT: "", MOGURI_TEST_CLI_HOME: home },
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const section = page.getByRole("region", { name: "Command line installation", exact: true });
    await section.getByRole("button", { name: "Install moguri command", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("installed for this app");
    const path = join(home, ".local", "bin", "moguri");
    expect((await execute(path, ["--help"], { env: { PATH: "/usr/bin:/bin" } })).stdout).toContain("Moguri CLI + SDK");
    await section.getByRole("button", { name: "Remove moguri command", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("not installed");
    await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(fixture.requests.length).toBe(0);
  } finally { await app?.close(); await fixture.close(); }
});
