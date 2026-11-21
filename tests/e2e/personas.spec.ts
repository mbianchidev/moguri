import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden desktop execution is qualified on macOS.");
test("Personas adds a disabled preset, saves the switch immediately and shows a tagged run with its linked chats", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 });
  await fixture.configure();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("switch", { name: "Agent mode" })).toBeEnabled();
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Personas", exact: true }).click();
    const panel = page.getByRole("region", { name: "Personas", exact: true });
    await expect(panel).toContainText("No personas yet.");
    await panel.getByRole("button", { name: "Add Docs", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Docs", exact: true });
    await expect(dialog.getByRole("textbox", { name: "Handle", exact: true })).toHaveValue("docs");
    await dialog.getByRole("combobox", { name: "Tools", exact: true }).selectOption("read-only");
    await dialog.getByRole("button", { name: "Create persona", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = panel.getByRole("article", { name: "@docs", exact: true });
    await expect(card.getByRole("switch", { name: "On" })).not.toBeChecked();
    expect(fixture.service.controller.snapshot().personas[0]?.status).toBe("disabled");
    await card.getByRole("switch", { name: "On" }).click();
    await expect(card.getByRole("switch", { name: "On" })).toBeChecked();
    await expect.poll(() => fixture.service.controller.snapshot().personas[0]?.status).toBe("enabled");
    await expect(panel.getByRole("button", { name: "Add Docs", exact: true })).toHaveCount(0);
    await fixture.send("Generated desktop request for @docs to review the guide.");
    await expect(card.getByRole("list", { name: "Recent runs", exact: true }).getByRole("listitem").first()).toContainText("Completed");
    await expect(card).toContainText("Read-only, Manual autonomy");
    await card.getByRole("button", { name: "Open persona chat", exact: true }).click();
    await expect(page.locator(".session-header h1")).toContainText("@docs · Docs");
    await expect(page.getByText(/You are @docs \(Docs\)/).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Personas", exact: true }).click();
    await card.getByRole("switch", { name: "On" }).click();
    await expect.poll(() => fixture.service.controller.snapshot().personas[0]?.status).toBe("paused");
    await expect(card).toContainText("Paused");
  } finally { await app.close(); await fixture.close(); }
});
