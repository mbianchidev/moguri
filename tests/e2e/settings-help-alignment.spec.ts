import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { githubApplicationFixture } from "../github-workflows-fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Settings geometry uses generated hidden macOS windows.");
const aligned = async (target: Locator, info: Locator) => {
  await target.scrollIntoViewIfNeeded();
  const subject = await target.boundingBox(), explanation = await info.boundingBox();
  expect(subject).not.toBeNull(); expect(explanation).not.toBeNull();
  expect(Math.abs(subject!.y + subject!.height / 2 - explanation!.y - explanation!.height / 2)).toBeLessThanOrEqual(2);
  expect(explanation!.x).toBeGreaterThanOrEqual(subject!.x + subject!.width);
};

test("application, command-line and wrapped toggle explanations stay aligned without changing their controls", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const application = page.getByRole("region", { name: "Application preferences", exact: true });
    const command = page.getByRole("region", { name: "Command line installation", exact: true });
    const update = application.getByRole("switch", { name: "Check for and download updates automatically", exact: true });
    const title = application.getByRole("heading", { name: "Application", exact: true });
    const titleHelp = application.locator(".settings-help-row").filter({ has: page.getByRole("heading", { name: "Application", exact: true }) }).getByRole("button", { name: "More about this setting", exact: true });
    const updateHelp = application.locator(".settings-help-row").filter({ has: page.getByRole("switch", { name: "Check for and download updates automatically", exact: true }) }).getByRole("button", { name: "More about this setting", exact: true });
    const background = application.getByRole("switch", { name: "Keep agents running when the last window closes", exact: true });
    const backgroundHelp = application.locator(".settings-help-row").filter({ has: page.getByRole("switch", { name: "Keep agents running when the last window closes", exact: true }) }).getByRole("button", { name: "More about this setting", exact: true });
    await expect(update).toBeEnabled();
    await page.locator(".settings-content").getByRole("heading", { name: "General", exact: true }).scrollIntoViewIfNeeded();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: process.env.MOGURI_HELP_ALIGNMENT_SCREENSHOT ?? ".moguri/artifacts/settings-info-after.png" });
    for (const width of [1200, 860]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setSize(width, 900), width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await aligned(title, titleHelp);
      await aligned(command.getByRole("heading", { name: "Command line", exact: true }), command.getByRole("button", { name: "More about this setting", exact: true }));
      await aligned(background, backgroundHelp);
      await aligned(update, updateHelp);
      const checked = await update.isChecked();
      await updateHelp.click();
      await expect(page.getByRole("tooltip")).toContainText("Installing and restarting always waits for your confirmation");
      await expect(update).toBeChecked({ checked });
      await updateHelp.focus(); await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expect(updateHelp).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await page.getByRole("navigation", { name: "Settings categories", exact: true }).getByRole("button", { name: "Appearance", exact: true }).click();
    const disclosure = page.getByText("Custom element colors", { exact: true }).locator("..");
    const information = disclosure.locator("..").getByRole("button", { name: "More about this setting", exact: true });
    expect(await disclosure.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    await information.click();
    await expect(page.getByRole("tooltip")).toContainText("Custom colors apply when Custom is selected");
    expect(await disclosure.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    await information.focus(); await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("every settings category keeps visible information on its actual title or first control line at wide and narrow widths", async () => {
  const secrets = new Map<string, string>();
  const fixture = await githubApplicationFixture({ integrations: { vault: {
    read: async (key) => secrets.get(key) ?? null, write: async (key, value) => { secrets.set(key, value); }, remove: async (key) => { secrets.delete(key); },
  }, fetch: async () => { throw new Error("Generated settings geometry does not authorize an external request."); } } });
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const before = fixture.service.controller.snapshot().sessions.length;
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const categories = page.getByRole("navigation", { name: "Settings categories", exact: true });
    await expect(categories.getByRole("button", { name: "General", exact: true })).toBeVisible();
    const labels = (await categories.getByRole("button").allTextContents()).filter((label) => label.trim() && label.trim() !== "Restore all defaults");
    expect(labels.length).toBeGreaterThan(20);
    const settings = page.getByRole("region", { name: "Moguri settings", exact: true });
    let inspected = 0, maximumOffset = 0;
    for (const label of labels) {
      await expect(settings.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
      const section = categories.getByRole("button", { name: label.trim(), exact: true });
      await section.click(); await expect(section).toHaveAttribute("aria-current", "page");
      for (const summary of await settings.locator("details > summary").all()) {
        if (await summary.isVisible() && !await summary.evaluate((node) => (node.parentElement as HTMLDetailsElement).open)) await summary.click();
      }
      for (const width of [1280, 860]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setSize(width, 900), width);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        const rows = await settings.locator("button.info-button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => {
          const help = button.closest(".setting-help"), target = help?.previousElementSibling;
          if (!target) return { text: button.getAttribute("aria-label"), delta: null };
          let subject = target;
          if (subject.matches("label.check-setting")) subject = subject.querySelector("input")!;
          else if (subject.matches("details")) subject = subject.querySelector(":scope > summary")!;
          else if (subject.matches("fieldset")) subject = subject.querySelector(":scope > legend")!;
          else if (subject.matches(".setting-editor")) subject = subject.querySelector("label")!;
          const box = subject.getBoundingClientRect(), icon = button.getBoundingClientRect(), style = getComputedStyle(subject);
          const firstLine = subject.matches("label.setting-field, summary, legend, p");
          const lineHeight = Number.parseFloat(style.lineHeight), padding = Number.parseFloat(style.paddingTop);
          let center = box.y + box.height / 2;
          if (firstLine && Number.isFinite(lineHeight)) center = box.y + padding + Number.parseFloat(style.borderTopWidth) + lineHeight / 2;
          else if (firstLine) {
            const walker = document.createTreeWalker(subject, NodeFilter.SHOW_TEXT);
            let text = walker.nextNode();
            while (text && !text.textContent?.trim()) text = walker.nextNode();
            if (text) { const range = document.createRange(); range.selectNodeContents(text); const first = range.getClientRects()[0]; if (first) center = first.y + first.height / 2; }
          }
          return { text: target.textContent?.trim().slice(0, 100), delta: Math.abs(center - icon.y - icon.height / 2) };
        }));
        inspected += rows.length;
        for (const row of rows) if (row.delta !== null) maximumOffset = Math.max(maximumOffset, row.delta);
        expect(rows.filter((row) => row.delta === null || row.delta > 2), `${label.trim()} at ${width}px`).toEqual([]);
      }
    }
    expect(inspected).toBeGreaterThan(100);
    expect(errors).toEqual([]);
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "model.started")).toBe(false);
    expect(fixture.service.controller.snapshot().sessions).toHaveLength(before);
    console.info(JSON.stringify({ primitive: "settings-help-alignment", sections: labels.length, renderings: inspected, maximumOffsetCssPixels: maximumOffset, widths: [1280, 860] }));
  } finally { await app.close(); await fixture.close(); }
});
