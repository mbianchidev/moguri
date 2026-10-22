import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "The desktop slice is qualified on macOS.");
test("checklist bar periodically rechecks the actual plan without model calls or declaring the task complete", async () => {
  const fixture = await setupFixture();
  await mkdir(join(fixture.project, "docs"));
  const path = join(fixture.project, "docs", "plan.md");
  await writeFile(path, "- [x] Generated first step\n- [ ] Generated remaining step\n");
  const app = await electron.launch({ executablePath: require("electron"), args: ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), bar = page.getByRole("region", { name: "Estimated task completion" });
    await expect(bar).toContainText("1/2 (50%)");
    await expect(bar.getByRole("progressbar", { name: "Plan checklist" })).toHaveAttribute("value", "50");
    await writeFile(path, "- [x] Generated first step\n- [x] Generated remaining step\n");
    await expect(bar).toContainText("2/2 (100%)", { timeout: 20_000 });
    await expect(bar).toContainText("Estimate only");
    expect(fixture.session().status).not.toBe("completed");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
