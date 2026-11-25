import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { trayMenu, trayTemplate, type RendererTrayAction, type TrayMenuOption } from "../../apps/desktop/src/tray-menu.ts";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The menu-bar flows use generated hidden macOS windows; hidden runs never create a real tray item.");
const strip = (options: TrayMenuOption[]): TrayMenuOption[] => options.map(({ click: _click, submenu, ...rest }) => ({ ...rest, ...(submenu ? { submenu: strip(submenu) } : {}) }));
const send = (app: ElectronApplication, action: RendererTrayAction, profileId: string) => app.evaluate(({ BrowserWindow }, input) => {
  BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:tray-action", input.action, input.profileId);
}, { action, profileId });

test("the menu-bar menu builds natively and its window actions start chats, projects and archive reviews", async () => {
  test.setTimeout(ciTime(60_000));
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); await fixture.send("Generated tray session"); await fixture.terminal();
  const projectId = fixture.session().projectId!, sessions = () => sdk.getState().snapshot!.sessions;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByRole("navigation", { name: "Profile resources", exact: true })).toBeVisible();
    await sdk.refresh();
    const template = strip(trayTemplate(trayMenu(sdk.getState().snapshot!, { openShortcut: "CommandOrControl+Shift+O" }), () => {}));
    const built = await app.evaluate(({ Menu }, input) => {
      const menu = Menu.buildFromTemplate(input as Parameters<typeof Menu.buildFromTemplate>[0]);
      return menu.items.map((item) => ({ label: item.label, enabled: item.enabled, submenu: item.submenu?.items.map((child) => child.label) ?? null,
        accelerator: item.accelerator ?? null, role: item.role ?? null }));
    }, template);
    expect(built.map((item) => item.label)).toEqual(["1 session", "", "project", "New session", "", "Create Session…", "New Chat", "New Project", "", "Open Moguri", "Settings…", "", "Quit"]);
    expect(built[0]!.enabled).toBe(false);
    expect(built[3]!.submenu).toEqual(["Session completed", "", "Open", "Archive…"]);
    expect(built.find((item) => item.label === "Open Moguri")?.accelerator).toBe("CommandOrControl+Shift+O");
    expect(built.at(-1)?.role).toBe("quit");

    // Each action finishes in the window (selecting the new chat and closing New) after the service acknowledges it, so the
    // next action waits for that selection; otherwise its New dialog is closed by the previous action's completion.
    const shell = page.locator(".app-shell");
    const before = sessions().length;
    await send(app, { kind: "new-chat" }, sdk.profileId);
    const chat = await waitFor(() => sessions().length === before + 1 && sessions().find((session) => session.projectId === null));
    await expect(shell).toHaveAttribute("data-session-id", chat.id);
    await send(app, { kind: "new-session", projectId }, sdk.profileId);
    const created = await waitFor(() => sessions().filter((session) => session.projectId === projectId).length === 2 &&
      sessions().find((session) => session.projectId === projectId && session.id !== fixture.sessionId));
    await expect(shell).toHaveAttribute("data-session-id", created.id);

    await send(app, { kind: "new-project" }, sdk.profileId);
    const start = page.getByRole("dialog", { name: "New", exact: true });
    await expect(start.getByRole("heading", { name: "Import local folder", exact: true })).toBeVisible();
    await start.getByRole("button", { name: "Back", exact: true }).click();
    await expect(start.getByRole("button", { name: /New chat/ })).toBeVisible();
    await start.getByRole("button", { name: "Close New", exact: true }).click();

    await send(app, { kind: "archive", sessionId: fixture.sessionId }, sdk.profileId);
    const archive = page.getByRole("dialog", { name: "Archive session", exact: true });
    await expect(archive).toBeVisible();
    await archive.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.session().status).not.toBe("archived");

    await send(app, { kind: "new-chat" }, "generated-other-profile");
    await expect(page.getByText("That menu-bar action belongs to another profile. Switch to it first; nothing was changed.")).toBeVisible();

    await openSettingsSection(page, "Keyboard shortcuts");
    const field = page.getByLabel("Open Moguri shortcut", { exact: true });
    await expect(field).toHaveValue("Primary+Shift+KeyO");
    await field.fill("Control+Alt+KeyM");
    await page.getByRole("button", { name: "Save Open Moguri shortcut", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.settings.values.shortcuts?.openApp).toBe("Control+Alt+KeyM");
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
