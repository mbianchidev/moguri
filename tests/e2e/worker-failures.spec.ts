import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Failure presentation uses generated hidden macOS windows.");
test("missing file activity says Not Found instead of denied", async () => {
  const f = await setupFixture({ toolCall: { name: "read_file", args: { path: "generated-missing.txt" } } });
  await f.configure(); await f.send("Generated missing file activity."); await f.terminal();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const activity = page.locator("details.activity-read-file");
    await expect(activity.locator("summary")).toContainText("Not Found");
    await expect(activity.locator("summary")).not.toContainText("denied");
    await activity.locator("summary").press("Enter");
    await expect(activity.getByRole("region", { name: "Operation result", exact: true })).toContainText('Not Found: "generated-missing.txt"');
  } finally { await app.close(); await f.close(); }
});

test("a provider failure shows the actual redacted diagnostic without a second empty assistant response", async () => {
  const f = await setupFixture({ httpFailure: { status: 413, message: "Generated selected model context is too large." } });
  await f.configure(); await f.send("Generated failed provider UI."); await f.terminal();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const transcript = page.getByRole("log", { name: "Session transcript", exact: true });
    await expect(transcript).toContainText("Generated selected model context is too large.");
    await expect(transcript).not.toContainText("No text response was returned.");
    await expect(transcript).not.toContainText("The provider request failed. Check the selected provider");
    expect(f.requests).toHaveLength(1);
  } finally { await app.close(); await f.close(); }
});
