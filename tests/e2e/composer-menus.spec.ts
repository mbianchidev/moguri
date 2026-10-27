import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { MoguriSdk, slashCommands } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Composer menus use generated hidden macOS windows.");
test("the model control opens cascading model, effort and context menus with exact supported options and Kupo's unavailable explanation", async () => {
  const fixture = await setupFixture({ reasoning: true, contextWindow: 32768 });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.routing.configure({ ...sdk.routing.policy()!, enabled: false }, sdk.settings.get()!.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const root = page.getByRole("dialog", { name: "Model", exact: true });
    await root.getByRole("button", { name: "Choose model", exact: true }).click();
    const models = page.getByRole("menu", { name: "Models", exact: true });
    await expect(models.getByRole("menuitemradio", { name: /^Generated Copilot model/ })).toHaveAttribute("aria-checked", "true");
    const kupo = models.getByRole("menuitemradio", { name: /^Kupo/ });
    await expect(kupo).toHaveAttribute("aria-disabled", "true");
    await models.getByRole("button", { name: "Why Kupo is unavailable", exact: true }).hover();
    await expect(page.getByRole("tooltip")).toContainText(/model|pool|Kupo|disabled/i);
    await mkdir(".moguri/artifacts", { recursive: true }); await page.screenshot({ path: ".moguri/artifacts/composer-model-cascade.png" });
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await root.getByRole("button", { name: "Thinking effort", exact: true }).click();
    const effort = page.getByRole("menu", { name: "Thinking effort", exact: true });
    await effort.getByRole("menuitemradio", { name: "Low", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.thinkingEffort).toBe("low");
    await root.getByRole("button", { name: "Working context window", exact: true }).click();
    const windows = page.getByRole("menu", { name: "Working context window", exact: true });
    await expect(windows.getByRole("menuitemradio")).toHaveCount(3);
    await windows.getByRole("menuitemradio", { name: "16,384 tokens", exact: true }).click();
    await expect.poll(() => fixture.session().controls.modelOptions?.contextWindow).toBe(16384);
    await expect(root.getByRole("button", { name: "Thinking effort", exact: true })).toContainText("Low");
    await expect(root.getByRole("button", { name: "Working context window", exact: true })).toContainText("16.4K");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    await root.getByRole("button", { name: "Thinking effort", exact: true }).focus(); await page.keyboard.press("ArrowRight");
    await expect(effort.getByRole("menuitemradio", { name: "Low", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(root.getByRole("button", { name: "Thinking effort", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the scrollable slash list contains all builtins before skills, loads the exact chosen skill and routes /side text without touching an existing side draft", async () => {
  const fixture = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const root = join(fixture.directory, "generated-ui-command-skills"); await mkdir(root);
  for (let index = 0; index < 10; index++) {
    const path = join(root, `skill-${index}`); await mkdir(path);
    await writeFile(join(path, "SKILL.md"), `---\nname: generated-ui-command-${index}\ndescription: Generated selectable UI skill\n---\nGenerated exact UI skill ${index}.\n`);
  }
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-ui-commands", name: "Generated UI commands", enabled: true, kind: "local", path: root }] }, settings.revision);
  const side = await sdk.sessions.side(fixture.sessionId);
  await sdk.command({ type: "draft.save", sessionId: side.id!, expectedRevision: 0, text: "Generated earlier side draft.", attachments: [] });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("/");
    const list = page.getByRole("listbox", { name: "Slash commands", exact: true });
    await expect(list.getByRole("option")).toHaveCount(slashCommands.length + 10);
    expect(await list.getByRole("option").evaluateAll((items) => items.map((item) => item.getAttribute("data-command-kind")))).toEqual([
      ...slashCommands.map(() => "builtin"), ...Array.from({ length: 10 }, () => "skill"),
    ]);
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await list.getByRole("option", { name: /generated-ui-command-9/ }).click();
    await expect(prompt).toHaveValue(/Generated exact UI skill 9/);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    await prompt.fill("/side Generated real slash side question.");
    await page.getByRole("button", { name: "Run command", exact: true }).click();
    const panel = page.locator(".side-chat-panel");
    await expect(panel.getByRole("log", { name: "Side chat transcript", exact: true })).toContainText("Generated Copilot response.");
    await expect(panel.getByLabel("Side question", { exact: true })).toHaveValue("Generated earlier side draft.");
    await expect(prompt).toHaveValue("");
    expect(fixture.session().messages).toHaveLength(0); expect(fixture.requests).toHaveLength(1);
    expect(JSON.stringify(fixture.requests[0]?.messages)).toContain("Generated real slash side question.");
    await expect(panel.getByRole("status").filter({ hasText: "Draft saved" })).toHaveText("Draft saved");
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
