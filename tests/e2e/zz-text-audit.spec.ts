import { _electron as electron, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
const require = createRequire(import.meta.url);
test("settings text audit", async () => {
  test.setTimeout(300_000);
  const fixture = await setupFixture(); await fixture.configure();
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "General", exact: true }).waitFor();
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    const labels = (await categories.getByRole("button").allTextContents()).map((v) => v.trim()).filter((v) => v && v !== "Restore all defaults");
    const report: unknown[] = [];
    for (const label of labels) {
      await categories.getByRole("button", { name: label, exact: true }).click(); await page.waitForTimeout(250);
      report.push(await page.locator(".settings-content").evaluate((root, label) => {
        const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;
        const texts = [...root.querySelectorAll("p, .fine-print, [role=alert], [role=status], .settings-warning")].filter(visible).map((el) => (el.textContent ?? "").trim()).filter(Boolean);
        const unique = [...new Set(texts)];
        const words = (root as HTMLElement).innerText.split(/\s+/).filter(Boolean).length;
        const tips = [...root.querySelectorAll(".info-button")].length;
        const details = [...root.querySelectorAll("details > summary")].map((s) => s.textContent?.trim());
        return { label, texts: unique, words, paragraphs: unique.length, paragraphWords: unique.join(" ").split(/\s+/).length, tips, details };
      }, label));
    }
    writeFileSync(process.env.OUT!, JSON.stringify(report, null, 1));
  } finally { await app.close(); await fixture.close(); }
});
