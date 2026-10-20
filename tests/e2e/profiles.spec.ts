import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { profileFixture } from "../fixtures/profiles.ts";
import { waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
const packagedWorker = process.env.MOGURI_TEST_APP ? resolve(process.env.MOGURI_TEST_APP, "../../Resources/app/dist/worker.mjs") : undefined;
test.skip(process.platform !== "darwin", "Profile UI execution is qualified on macOS.");
const launch = (stateDir: string, profileId = "default") => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_PROFILE_ID: profileId, MOGURI_TEST_WINDOW: "hidden" },
});

test("desktop creates and switches real scoped clients, protects dirty editors and keeps old owned work private", async () => {
  const fixture = await profileFixture(undefined, packagedWorker);
  const first = await fixture.sdk.sessions.create(null, "Generated Default desktop");
  const background = await fixture.sdk.sessions.create(null, "Generated owned Default work", { modelId: fixture.providers[0]!.modelId });
  await fixture.sdk.artifacts.create(first.id!, { kind: "decision", name: "Generated Default-only document", text: "Generated Default-only retained bytes." });
  await fixture.providers[1]!.provider.logout();
  const app = await launch(fixture.stateDir);
  let release = () => {};
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const active = page.getByLabel("Active profile", { exact: true });
    await expect(active).toHaveValue("default");
    await page.getByRole("button", { name: "Manage profiles", exact: true }).click();
    await page.getByRole("button", { name: "New profile", exact: true }).click();
    await page.getByLabel("Profile name", { exact: true }).fill("Generated desktop Beta");
    await page.getByLabel("Profile accent", { exact: true }).fill("#557799");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue("Generated desktop Beta");
    await expect(active).toBeDisabled();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await page.getByRole("button", { name: "Create profile", exact: true }).click();
    const profile = await waitFor(() => fixture.service.profiles.catalog().profiles.find((profile) => profile.name === "Generated desktop Beta" && profile.status === "ready"));
    await expect(active).toBeEnabled(); await expect(active).toHaveValue("default");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Budgets", exact: true }).click();
    const policy = page.getByRole("region", { name: "Profile budget policy", exact: true }), global = page.getByRole("region", { name: "Global budget policy", exact: true });
    for (const [region, scope, tokens] of [[policy, "profile", "100000"], [global, "global", "200000"]] as const) {
      await region.getByLabel(`${scope} budget mode`, { exact: true }).selectOption("limited");
      await region.getByLabel(`${scope} token cap`, { exact: true }).fill(tokens);
      await region.getByText("I accept estimate-based accounting and interruption risk.", { exact: true }).click();
    }
    await policy.getByRole("button", { name: "Save profile budget policy", exact: true }).click();
    await expect(policy).toContainText("Profile policy saved."); await expect(active).toBeDisabled();
    await global.getByRole("button", { name: "Save global budget policy", exact: true }).click();
    await expect(global).toContainText("Global policy saved."); await expect(active).toBeEnabled();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated private Default desktop draft.");
    await fixture.send(fixture.sdk, background.id!, "generated slow Default-owned profile switch");
    await waitFor(() => fixture.providers[0]!.requests.length === 1);
    const originalRefresh = fixture.providers[1]!.provider.refresh.bind(fixture.providers[1]!.provider);
    const gate = new Promise<void>((resolve) => { release = resolve; }); let entered = false;
    fixture.providers[1]!.provider.refresh = async () => { entered = true; await gate; await originalRefresh(); };
    await active.selectOption(profile.id);
    await waitFor(() => entered);
    await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
    release();
    await expect(page.getByRole("heading", { name: "What are we working on?", exact: true })).toBeVisible();
    await expect(active).toHaveValue(profile.id);
    await expect(page.getByText("Generated Default-only document", { exact: true })).toHaveCount(0);
    expect(fixture.session(fixture.sdk, first.id!).draft.text).toBe("Generated private Default desktop draft.");
    expect(fixture.session(fixture.sdk, background.id!).turnId).toBeTruthy();
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated private Beta desktop draft.");
    const beta = await fixture.service.profiles.control(profile.id);
    await expect.poll(() => beta.snapshot().sessions.length).toBe(1);
    expect(beta.snapshot().sessions[0]!.controls.modelId).toBeNull();
    expect(beta.snapshot().provider.status).toBe("disconnected");
    await page.getByRole("button", { name: "Manage profiles", exact: true }).click();
    await page.getByRole("button", { name: "Rename / color", exact: true }).click();
    await page.getByLabel("Profile name", { exact: true }).fill("Generated desktop Beta renamed");
    await page.getByLabel("Profile accent", { exact: true }).fill("#776655");
    await page.getByRole("button", { name: "Save profile metadata", exact: true }).click();
    await expect(active).toBeEnabled();
    await expect(active.locator("option:checked")).toHaveText("Generated desktop Beta renamed");
    await fixture.sdk.command({ type: "session.stop", sessionId: background.id! });
    await waitFor(() => !fixture.session(fixture.sdk, background.id!).turnId);
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated private Beta desktop draft.");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "profiles-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    if (!await active.isVisible()) await page.getByRole("button", { name: "Toggle projects", exact: true }).click();
    await page.screenshot({ path: join(artifacts, "profiles-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await active.selectOption("default");
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated private Default desktop draft.");
    expect(beta.snapshot().sessions[0]!.draft.text).toBe("Generated private Beta desktop draft.");
    expect(failures).toEqual([]);
  } finally { release(); await app.close(); await fixture.close(); }
});

test("native profile startup and preview partitions reject foreign sessions and stale old-profile closes", async () => {
  const fixture = await profileFixture(undefined, packagedWorker), { profile, client: beta } = await fixture.create("Generated native Beta");
  const a = await fixture.sdk.sessions.create(null, "Generated native Default"), b = await beta.sessions.create(null, "Generated native Beta chat");
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Generated scoped preview</title><h1>Generated scoped preview</h1>"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Generated scoped preview bind failed.");
  const url = `http://127.0.0.1:${address.port}/`, bounds = { x: 300, y: 200, width: 400, height: 250 };
  const app = await launch(fixture.stateDir, profile.id);
  const previewUrls = () => app.evaluate(({ BrowserWindow, WebContentsView }) => BrowserWindow.getAllWindows()[0]!.contentView.children.filter((child) => child instanceof WebContentsView).map((child) => child.webContents.getURL()));
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Active profile", { exact: true })).toHaveValue(profile.id);
    await expect(page.getByRole("heading", { name: "Generated native Beta chat", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generated native Default", exact: true })).toHaveCount(0);
    await expect(page.evaluate(({ id, url, bounds }) => window.moguri.preview({ sessionId: id, url, bounds }, "default"), { id: a.id!, url, bounds })).rejects.toThrow(/inactive profile/);
    await page.evaluate(({ id, profileId, url, bounds }) => window.moguri.preview({ sessionId: id, url, bounds }, profileId), { id: b.id!, profileId: profile.id, url, bounds });
    await expect.poll(previewUrls).toContain(url);
    const partition = await app.evaluate(({ BrowserWindow, WebContentsView, session }, { profileId, id }) => {
      const view = BrowserWindow.getAllWindows()[0]!.contentView.children.find((child) => child instanceof WebContentsView);
      if (!(view instanceof WebContentsView)) throw new Error("Generated scoped preview missing.");
      return view.webContents.session === session.fromPartition(`moguri-preview-${profileId}-${id}`, { cache: false });
    }, { profileId: profile.id, id: b.id! });
    expect(partition).toBe(true);
    await page.evaluate(() => window.moguri.preview(null, "default")); await expect.poll(previewUrls).toContain(url);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:navigate-session", id, "default"), b.id!);
    await expect(page.getByRole("alert")).toContainText("notification's session was removed from its actual profile");
    await expect(page.getByLabel("Active profile", { exact: true })).toHaveValue(profile.id);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]!.webContents.send("moguri:navigate-session", id, "default"), a.id!);
    await expect(page.getByLabel("Active profile", { exact: true })).toHaveValue("default"); await expect.poll(previewUrls).not.toContain(url);
    await page.evaluate(({ id, url, bounds }) => window.moguri.preview({ sessionId: id, url, bounds }, "default"), { id: a.id!, url, bounds });
    await page.evaluate((profileId) => window.moguri.preview(null, profileId), profile.id); await expect.poll(previewUrls).toContain(url);
    await expect(page.evaluate(({ id, url, bounds }) => window.moguri.preview({ sessionId: id, url, bounds }, "default"), { id: b.id!, url, bounds })).rejects.toThrow(/outside the active profile/);
    expect(fixture.providers.reduce((sum, provider) => sum + provider.requests.length, 0)).toBe(0);
  } finally { await app.close(); await fixture.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
