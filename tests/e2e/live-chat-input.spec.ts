import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CHAT_TITLE_PROMPT, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Live composer/naming uses a generated hidden desktop.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });

test("ordinary active input has a Send now action and an acknowledged live row without stopping or future-turn queueing", async () => {
  const f = await setupFixture();
  await f.configure(); await f.send("generated slow original desktop owner");
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeEnabled(); await prompt.fill("Generated actual desktop interjection.");
    const turn = f.session().turnId;
    await expect(page.getByRole("button", { name: "Send now", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop turn", exact: true })).toBeVisible();
    const began = performance.now(); await page.getByRole("button", { name: "Send now", exact: true }).click();
    const live = page.getByRole("article", { name: "Live message", exact: true });
    await expect(live).toContainText("Generated actual desktop interjection.");
    expect(performance.now() - began).toBeLessThan(750);
    const item = f.session().queue[0]!;
    expect(item.delivery).toBe("steer"); expect(item.targetTurnId).toBe(turn);
    expect(f.session().turnId).toBe(turn); expect(f.requests).toHaveLength(1);
    await page.getByRole("button", { name: "Stop turn", exact: true }).click();
    await expect.poll(() => f.session().turnId).toBeNull();
    expect(f.session().queue[0]?.held).toBe(true); expect(f.requests).toHaveLength(1);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); await f.close(); }
});

test("a new factory topic is model-summarized and a started inline user edit wins over that result", async () => {
  const f = await setupFixture({ respond: (request) => ({ text: JSON.stringify(request.messages).includes(CHAT_TITLE_PROMPT.split("\n")[0]!) ?
    '{"title":"Generated bounded chat summary"}' : "Generated original response.", delayMs: JSON.stringify(request.messages).includes(CHAT_TITLE_PROMPT.split("\n")[0]!) ? 1200 : undefined }) });
  const sdk = await new MoguriSdk(f.service.connection).ready();
  const created = await sdk.sessions.create(f.session().projectId), id = created.id!;
  await sdk.sessions.selectModel(id, f.modelId);
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    const link = page.locator(`.session-link[data-session-id="${id}"]`);
    await expect(link).toBeVisible(); await link.click();
    const prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeEnabled(); await prompt.fill("Generated topic about a bounded chat planner.");
    await prompt.press("Enter");
    await expect.poll(() => f.requests.length).toBe(2);
    await link.press("F2");
    const form = page.getByRole("form", { name: "Rename chat inline", exact: true }), field = form.getByLabel("Chat name", { exact: true });
    await expect(field).toBeFocused(); await field.fill("Generated actual user naming choice");
    await expect.poll(() => f.service.controller.snapshot().sessions.find((session) => session.id === id)?.title).toBe("Generated bounded chat summary");
    const began = performance.now(); await field.press("Enter");
    await expect.poll(() => f.service.controller.snapshot().sessions.find((session) => session.id === id)?.title).toBe("Generated actual user naming choice");
    expect(performance.now() - began).toBeLessThan(750);
    await expect(form).toHaveCount(0); await expect(page.getByRole("dialog", { name: "Rename", exact: true })).toHaveCount(0);
    expect(f.requests).toHaveLength(2);
    expect(f.service.controller.snapshot().budgetEntries.filter((entry) => entry.sessionId === id && entry.role === "title")).toHaveLength(1);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
