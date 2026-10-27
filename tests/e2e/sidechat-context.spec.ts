import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Side chat context uses generated hidden macOS windows.");

test("each desktop side question includes both original and later main work without reopening or changing read-only controls", async () => {
  const fixture = await setupFixture({ responseMode: "text" });
  await fixture.configure(); await fixture.send("Generated DESKTOP_MAIN_TIME_ONE."); await fixture.terminal();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Side chat", exact: true }).click();
    const side = page.locator(".side-chat-panel"), prompt = side.getByLabel("Side question", { exact: true });
    await expect(side).toContainText("main chat context refreshes for each new question");
    await prompt.fill("Generated DESKTOP_SIDE_QUESTION_ONE.");
    await side.getByRole("button", { name: "Send", exact: true }).click();
    await expect(side.getByRole("log", { name: "Side chat transcript", exact: true })).toContainText("Generated Copilot response.");
    await expect(side.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    expect(JSON.stringify(fixture.requests.at(-1)?.messages)).toContain("DESKTOP_MAIN_TIME_ONE");
    await fixture.send("Generated DESKTOP_MAIN_TIME_TWO."); await fixture.terminal();
    await prompt.fill("Generated DESKTOP_SIDE_QUESTION_TWO.");
    await expect(side.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await side.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.requests.length).toBe(4);
    const context = JSON.stringify(fixture.requests.at(-1)?.messages);
    for (const sentinel of ["DESKTOP_MAIN_TIME_ONE", "DESKTOP_MAIN_TIME_TWO", "DESKTOP_SIDE_QUESTION_ONE", "DESKTOP_SIDE_QUESTION_TWO"]) {
      expect(context.match(new RegExp(sentinel, "g"))).toHaveLength(1);
    }
    const saved = fixture.service.controller.snapshot().sessions.find((entry) => entry.kind === "side")!;
    expect(saved.mode).toBe("read-only"); expect(saved.controls).toEqual(fixture.session().controls);
    expect(saved.sideContext?.parentSessionId).toBe(fixture.sessionId);
    await expect(side.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
    await page.reload(); await expect(side).toContainText("main chat context refreshes for each new question");
    expect(fixture.requests).toHaveLength(4); expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
