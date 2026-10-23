import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The desktop slice is qualified on macOS.");
test("an existing workspace checklist never becomes an automatic model task plan or composer completion bar", async () => {
  const fixture = await setupFixture();
  await mkdir(join(fixture.project, "docs"));
  const path = join(fixture.project, "docs", "plan.md");
  await writeFile(path, "- [x] Generated first step\n- [ ] Generated remaining step\n");
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), bar = page.getByRole("region", { name: "Estimated task completion" });
    await expect(bar).toHaveCount(0);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("region", { name: "Model task plan", exact: true })).toContainText("No task plan");
    await page.getByRole("button", { name: "Open workspace plan file", exact: true }).click();
    await expect(page.getByLabel("Project plan", { exact: true })).toHaveValue("- [x] Generated first step\n- [ ] Generated remaining step\n");
    await writeFile(path, "- [x] Generated first step\n- [x] Generated remaining step\n");
    await page.getByRole("button", { name: "Reload plan", exact: true }).click();
    await expect(page.getByLabel("Project plan", { exact: true })).toHaveValue("- [x] Generated first step\n- [x] Generated remaining step\n");
    await expect(bar).toHaveCount(0);
    expect(fixture.session().status).not.toBe("completed");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
