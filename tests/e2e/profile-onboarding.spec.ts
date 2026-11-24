import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { profileFixture } from "../fixtures/profiles.ts";
import { waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Profile UI execution is qualified on macOS.");
const anthropicKey = "sk-ant-api03-generated-desktop-import-key";

test("the sidebar profile creates a profile with a swatch or custom accent, opens its onboarding and imports reviewed keys, repositories and skills", async () => {
  const models = new Map<string, Map<string, string>>();
  const fixture = await profileFixture((id) => {
    let secrets = models.get(id); if (!secrets) { secrets = new Map(); models.set(id, secrets); }
    const scoped = secrets;
    return { models: { vault: { read: async (key: string) => scoped.get(key) ?? null, write: async (key: string, value: string) => { scoped.set(key, value); },
      remove: async (key: string) => { scoped.delete(key); } }, hosted: { baseUrls: { anthropic: "http://127.0.0.1:9", openrouter: "http://127.0.0.1:9/api/v1" } } } };
  });
  const repository = join(fixture.directory, "generated-repository"), skills = join(fixture.directory, "generated-skills");
  await mkdir(repository); await mkdir(skills);
  await fixture.sdk.projects.add(repository, "generated-repository");
  models.get("default")!.set("hosted.anthropic", JSON.stringify({ type: "api_key", key: anthropicKey }));
  await fixture.sdk.refresh();
  const current = fixture.sdk.settings.get()!;
  await fixture.sdk.settings.update({ ...current.values, hostedProviders: ["anthropic"],
    skillSources: [{ id: "generated-folder", name: "Generated skills", enabled: true, kind: "local", path: skills }] }, current.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: fixture.stateDir, MOGURI_PROFILE_ID: "default", MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const profileButton = page.getByRole("button", { name: /^Current profile: / });
    await expect(profileButton).toHaveAccessibleName("Current profile: Default");
    await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);

    // With one profile, the sidebar profile opens Create profile directly.
    await profileButton.click();
    const dialog = page.getByRole("dialog", { name: "Create profile", exact: true });
    await dialog.getByLabel("Profile name", { exact: true }).fill("Generated imported");
    const accents = dialog.getByRole("radiogroup", { name: "Profile accent", exact: true });
    await accents.getByRole("radio", { name: "Ocean", exact: true }).click();
    await expect(accents.getByRole("radio", { name: "Ocean", exact: true })).toHaveAttribute("aria-checked", "true");
    await accents.getByRole("radio", { name: "Custom", exact: true }).click();
    await dialog.getByLabel("Custom accent hex", { exact: true }).fill("#55779");
    await expect(dialog.getByRole("button", { name: "Create and open", exact: true })).toBeDisabled();
    await dialog.getByLabel("Custom accent hex", { exact: true }).fill("#557799");
    await dialog.getByRole("button", { name: "Create and open", exact: true }).click();

    // The new profile opens with its own onboarding, though this window uses manual onboarding.
    await expect(profileButton).toHaveAccessibleName("Current profile: Generated imported");
    const created = fixture.service.profiles.catalog().profiles.find((profile) => profile.name === "Generated imported")!;
    expect(created.color).toBe("#557799");
    const setup = page.getByRole("region", { name: "Getting started" });
    await expect(setup).toBeVisible();
    for (let step = 0; step < 4; step++) await setup.getByRole("button", { name: "Continue", exact: true }).last().click();
    await setup.getByRole("radiogroup", { name: "Copy from profile", exact: true }).getByRole("radio", { name: "Default" }).click();
    await setup.getByRole("button", { name: "Continue", exact: true }).last().click();

    await setup.getByRole("checkbox", { name: /^Anthropic API key/ }).check();
    await setup.getByRole("button", { name: "Review", exact: true }).click();
    await expect(setup.getByText("Copy this from Default into this profile:", { exact: true })).toBeVisible();
    expect(models.get(created.id)?.size ?? 0).toBe(0);
    await setup.getByRole("button", { name: "Import", exact: true }).click();
    await setup.getByRole("checkbox", { name: /^generated-repository/ }).check();
    await setup.getByRole("button", { name: "Review", exact: true }).click();
    await setup.getByRole("button", { name: "Import", exact: true }).click();
    await setup.getByRole("checkbox", { name: /^Generated skills/ }).check();
    await setup.getByRole("button", { name: "Review", exact: true }).click();
    await setup.getByRole("button", { name: "Import", exact: true }).click();
    await expect(setup.getByText("Imported 1 from Default")).toHaveCount(3);
    await setup.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(setup).toHaveCount(0);

    const target = await fixture.service.profiles.control(created.id), values = target.snapshot().settings.values;
    expect(values.hostedProviders).toEqual(["anthropic"]);
    expect(values.skillSources?.map((source) => source.path)).toEqual([skills]);
    expect(target.snapshot().projects.map((project) => project.path)).toEqual(fixture.sdk.getState().snapshot!.projects.map((project) => project.path));
    expect(JSON.parse(models.get(created.id)!.get("hosted.anthropic")!)).toEqual({ type: "api_key", key: anthropicKey });
    expect(JSON.parse(models.get("default")!.get("hosted.anthropic")!)).toEqual({ type: "api_key", key: anthropicKey });
    expect(await page.content()).not.toContain(anthropicKey);

    // With several profiles the button opens a menu: switch, New profile... and Manage profiles.
    await profileButton.click();
    const menu = page.getByRole("menu", { name: "Profiles", exact: true });
    await expect(menu.getByRole("menuitemradio", { name: "Generated imported" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitem", { name: "New profile...", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Manage profiles", exact: true })).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "Default" }).click();
    await expect(profileButton).toHaveAccessibleName("Current profile: Default");
    await waitFor(() => fixture.service.profiles.catalog().profiles.length === 2);
    expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
