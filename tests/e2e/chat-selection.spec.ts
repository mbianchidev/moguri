import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native navigation qualification is macOS-only.");

test("Chats exposes plus; context selection highlights rows without checkboxes and counted actions apply exactly to the selected set", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const names = ["Generated selected A", "Generated selected B", "Generated selected C", "Generated selected D"];
  const selected: string[] = [];
  for (const name of names) selected.push((await sdk.sessions.create(null, name)).id!);
  const untouched = (await sdk.sessions.create(null, "Generated untouched chat")).id!;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), nav = page.getByRole("navigation", { name: "Projects and sessions" });
    const chats = nav.getByRole("region", { name: "Chats", exact: true });
    await expect(chats.locator("header").getByRole("button", { name: "New chat", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Select chats", exact: true })).toHaveCount(0);
    const first = chats.getByRole("button", { name: names[0]!, exact: true });
    await first.focus(); await first.press("Shift+F10");
    await page.getByRole("menuitem", { name: "Select", exact: true }).click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    for (const name of names.slice(1)) {
      const row = chats.getByRole("button", { name, exact: true });
      await row.focus(); await row.press("Space");
      await expect(row).toHaveAttribute("aria-pressed", "true");
    }
    await expect(chats.locator('.session-row[data-session-selected="true"]')).toHaveCount(4);
    await expect(nav.locator('input[type="checkbox"]')).toHaveCount(0);
    await first.press("Shift+F10");
    const archive = page.getByRole("menuitem", { name: "Archive (4)", exact: true });
    await expect(archive).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toHaveCount(0);
    await archive.click();
    const review = page.getByRole("dialog", { name: "archive selected sessions", exact: true });
    await expect(review).toContainText("Archive 4 selected sessions");
    await review.getByRole("button", { name: "Apply to selected sessions", exact: true }).click();
    await expect.poll(() => selected.every((id) => sdk.sessions.get(id)?.status === "archived")).toBe(true);
    expect(sdk.sessions.get(untouched)?.status).toBe("idle");
    expect(sdk.sessions.get(f.sessionId)?.status).toBe("idle");
    await expect(nav.getByRole("region", { name: "Selected session actions", exact: true })).toHaveCount(0);
    const keep = chats.getByRole("button", { name: "Generated untouched chat", exact: true });
    await keep.click({ button: "right" }); await page.getByRole("menuitem", { name: "Select", exact: true }).click();
    await keep.press("Escape");
    await expect(keep).not.toHaveAttribute("aria-pressed");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
