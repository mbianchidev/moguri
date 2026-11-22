import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution is qualified on macOS.");
test("Custom agents in Capabilities adds a disabled preset, saves the switch immediately and shows a tagged run with its linked chats", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), skillPath = join(fixture.project, "SKILL.md");
  await writeFile(skillPath, "---\nname: generated-guide-style\ndescription: Generated style guidance\n---\nKeep generated guides short.\n");
  await sdk.capabilities.importSkill(fixture.session().projectId!, skillPath); sdk.disconnect();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Capabilities", exact: true }).click();
    await page.getByRole("tablist", { name: "Capabilities sections", exact: true }).getByRole("tab", { name: "Custom agents", exact: true }).click();
    const panel = page.getByRole("region", { name: "Custom agents", exact: true });
    await expect(page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Personas" })).toHaveCount(0);
    await expect(panel).toContainText("No custom agents yet.");
    await panel.getByRole("button", { name: "Add Docs", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Docs", exact: true });
    await expect(dialog.getByRole("textbox", { name: "Handle", exact: true })).toHaveValue("docs");
    await dialog.getByRole("combobox", { name: "Tools", exact: true }).selectOption("read-only");
    await dialog.getByRole("button", { name: "Choose skills", exact: true }).click();
    const skills = page.getByRole("dialog", { name: "Choose skills", exact: true });
    await skills.getByRole("searchbox", { name: "Filter skills", exact: true }).fill("guide");
    await skills.getByRole("menuitemcheckbox", { name: "generated-guide-style", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("list", { name: "Chosen skills", exact: true })).toContainText("generated-guide-style");
    await dialog.getByRole("button", { name: "Create custom agent", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = panel.getByRole("article", { name: "@docs", exact: true });
    await expect(card.getByRole("switch", { name: "On" })).not.toBeChecked();
    expect(fixture.service.controller.snapshot().personas[0]?.status).toBe("disabled");
    expect(fixture.service.controller.snapshot().personas[0]?.skills).toEqual(["generated-guide-style"]);
    await card.getByRole("switch", { name: "On" }).click();
    await expect(card.getByRole("switch", { name: "On" })).toBeChecked();
    await expect.poll(() => fixture.service.controller.snapshot().personas[0]?.status).toBe("enabled");
    await expect(panel.getByRole("button", { name: "Add Docs", exact: true })).toHaveCount(0);
    await fixture.send("Generated desktop request for @docs to review the guide.");
    await expect(card.getByRole("list", { name: "Recent runs", exact: true }).getByRole("listitem").first()).toContainText("Completed");
    await expect(card).toContainText("Read-only, Manual autonomy");
    await card.getByRole("button", { name: "Open agent chat", exact: true }).click();
    await expect(page.locator(".session-header h1")).toContainText("@docs · Docs");
    await expect(page.getByText(/You are @docs \(Docs\)/).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Capabilities", exact: true }).click();
    await page.getByRole("tablist", { name: "Capabilities sections", exact: true }).getByRole("tab", { name: "Custom agents", exact: true }).click();
    await card.getByRole("switch", { name: "On" }).click();
    await expect.poll(() => fixture.service.controller.snapshot().personas[0]?.status).toBe("paused");
    await expect(card).toContainText("Paused");
  } finally { await app.close(); await fixture.close(); }
});
