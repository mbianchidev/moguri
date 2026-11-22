import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { myWorkFixture } from "../my-work-fixture.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Dependency roundup desktop qualification uses generated hidden macOS windows.");
const close = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  } });
  await app.close();
};

test("Dependencies sets up a roundup from explicit My Work sources, groups bot PRs read-only and opens one in My Work", async () => {
  const f = await myWorkFixture(), app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: f.stateDir, MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    f.first.pulls.push({ number: 21, state: "open", merged: false, head: f.head, updatedAt: "2026-01-02T00:00:00Z", author: "dependabot[bot]",
      headRef: "dependabot/npm_and_yarn/lodash-4.17.21", labels: ["security"], title: "Bump lodash from 4.17.20 to 4.17.21",
      body: "Bumps [lodash](https://github.com/lodash/lodash) from 4.17.20 to 4.17.21.", requests: [], threads: [], decision: null });
    await f.configure(f.first);
    const page = await app.firstWindow();
    await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("navigation", { name: "Dashboard pages" }).getByRole("button", { name: "Dependencies", exact: true }).click();
    const roundup = page.getByRole("region", { name: "Dependency updates", exact: true });
    await expect(roundup).toHaveAttribute("data-ready", "true");
    await expect(roundup.getByRole("button", { name: "Refresh roundup", exact: true })).toBeDisabled();
    const reads = f.calls.length;
    await roundup.getByRole("button", { name: "Set up roundups", exact: true }).click();
    const setup = roundup.getByRole("form", { name: "Roundup setup", exact: true });
    await setup.getByRole("checkbox", { name: new RegExp(f.first.repository) }).check();
    await expect(setup.getByRole("textbox", { name: "Update bots (GitHub logins)", exact: true })).toHaveValue("dependabot[bot], renovate[bot]");
    await setup.getByRole("button", { name: "Save roundup settings", exact: true }).click();
    await expect(setup).toHaveCount(0);
    expect(f.calls.length).toBe(reads);
    await roundup.getByRole("button", { name: "Refresh roundup", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().dependencyRoundupRuns[0]?.status).toBe("completed");
    const group = roundup.getByRole("article", { name: "lodash updates", exact: true });
    await expect(group).toContainText("Security reported");
    await expect(group).toContainText(`${f.first.repository}#21`);
    await expect(roundup).not.toContainText(`${f.first.repository}#11`);
    expect(f.calls.filter((call) => call.method !== "GET" && call.path !== "graphql")).toHaveLength(0);
    await group.getByRole("button", { name: "Open in My Work", exact: true }).click();
    const detail = page.getByRole("region", { name: "My Work item details", exact: true });
    await expect(detail).toContainText(`${f.first.repository}#21`);
    expect(f.service.controller.snapshot().sessions).toHaveLength(1);
  } finally { await close(app); await f.close(); }
});
