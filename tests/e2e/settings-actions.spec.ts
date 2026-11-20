import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Settings captions use generated hidden macOS windows.");

test("Linear key actions use concise visible verbs and preserve storage, explicit verification, removal and secret isolation", async () => {
  const secrets = new Map<string, string>(), requests: string[] = [];
  const fixture = await setupFixture({ platform: { integrations: {
    vault: { read: async (id) => secrets.get(id) ?? null, write: async (id, value) => { secrets.set(id, value); }, remove: async (id) => { secrets.delete(id); } },
    fetch: async (url, init) => {
      expect(String(url)).toBe("https://api.linear.app/graphql"); requests.push(String(init?.body));
      return Response.json({ data: { viewer: { id: "generated-linear-actor", name: "Generated Linear account" },
        organization: { id: "generated-linear-workspace", name: "Generated Linear workspace" } } });
    },
  } } }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Linear");
    const panel = page.getByRole("region", { name: "Linear integration connection", exact: true });
    const store = panel.getByRole("button", { name: "Store Linear key in keychain", exact: true });
    const verify = panel.getByRole("button", { name: "Verify Linear account", exact: true });
    const remove = panel.getByRole("button", { name: "Remove Linear key", exact: true });
    await expect(store).toHaveText("Store"); await expect(verify).toHaveText("Verify"); await expect(remove).toHaveText("Remove");
    expect(requests).toHaveLength(0);
    await panel.getByLabel("Linear personal API key", { exact: true }).fill("generated-concise-linear-key");
    await expect(verify).toBeDisabled(); await store.click();
    await expect(panel.getByLabel("Linear personal API key", { exact: true })).toHaveValue("");
    await expect.poll(() => secrets.size).toBe(1); expect(requests).toHaveLength(0);
    await verify.click(); await expect(panel).toContainText("Generated Linear account / Generated Linear workspace");
    expect(requests).toHaveLength(1); expect(requests[0]).toContain("MoguriConnection");
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/settings-linear-actions.png" });
    await remove.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => secrets.size).toBe(0);
    await expect(panel).toContainText("API key removed.");
    expect(JSON.stringify(fixture.service.controller.events(0))).not.toContain("generated-concise-linear-key");
    expect(await page.content()).not.toContain("generated-concise-linear-key");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("shortcut buttons say Record while exact accessible names, keyboard capture, cancellation and individual saves stay intact", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Keyboard shortcuts");
    for (const label of ["Commands shortcut", "Terminal copy shortcut", "Voice shortcut"]) {
      await expect(page.getByRole("button", { name: `Record ${label}`, exact: true })).toHaveText("Record");
    }
    const original = structuredClone(sdk.settings.get()!.values);
    await page.getByRole("button", { name: "Record Commands shortcut", exact: true }).click();
    await expect(page.getByRole("button", { name: "Press a shortcut...", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Control+Shift+P");
    await expect(page.getByLabel("Commands shortcut", { exact: true })).toHaveValue("Control+Shift+KeyP");
    expect(sdk.settings.get()!.values.shortcuts?.commands).toBe(original.shortcuts?.commands);
    await page.getByRole("button", { name: "Save Commands shortcut", exact: true }).click();
    await expect.poll(() => sdk.settings.get()!.values.shortcuts?.commands).toBe("Control+Shift+KeyP");
    await page.getByRole("button", { name: "Record Voice shortcut", exact: true }).click(); await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Record Voice shortcut", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Voice shortcut", { exact: true })).toHaveValue(original.voice.shortcut ?? "Control+Space");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/settings-shortcut-actions.png" });
    // Keyboard shortcuts and Voice dictation share the Interface page, which offers the voice shortcut editor once.
    await openSettingsSection(page, "Voice dictation");
    await expect(page.getByRole("button", { name: "Record Voice shortcut", exact: true })).toHaveCount(1);
    expect(sdk.settings.get()!.values.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC").toBe(original.shortcuts?.terminalCopy ?? "Primary+Shift+KeyC");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("contextual settings actions use short captions while retaining their precise accessible purpose", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    const actions = [
      ["General", "Store release access token", "Store"],
      ["General", "Inspect updater credential", "Inspect"],
      ["General", "Check for updates now", "Check"],
      ["GitHub", "Verify GitHub CLI account", "Verify"],
      ["Local models", "Refresh models", "Refresh"],
      ["MCP gateway", "List configured servers", "List"],
      ["MCP gateway", "Verify credential status", "Verify"],
      ["User guidance", "Restore defaults for user guidance", "Restore defaults"],
      ["User guidance", "Load starter for readiness into draft", "Load starter"],
      ["Retention", "Run cleanup with configured retention", "Run cleanup"],
      ["Voice dictation", "Find microphones with explicit audio access", "Find microphones"],
    ] as const;
    for (const [section, name, caption] of actions) {
      await openSettingsSection(page, section);
      await expect(page.getByRole("button", { name, exact: true })).toHaveText(caption);
      const mismatches = await page.getByRole("region", { name: "Moguri settings", exact: true }).getByRole("button").evaluateAll((buttons) => {
        const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        return buttons.filter((button) => {
          const label = button.getAttribute("aria-label"), caption = normalize(button.textContent ?? "");
          return button.checkVisibility() && label && caption && !normalize(label).includes(caption);
        }).map((button) => ({ caption: button.textContent, name: button.getAttribute("aria-label") }));
      });
      expect(mismatches).toEqual([]);
    }
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
