import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Coordination/watch UI uses generated hidden macOS fixtures.");

test("main and side sessions inspect public context and send truthful advisory messages without inference", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await sdk.sessions.rename(f.sessionId, "Generated coordination main");
  const side = await sdk.sessions.spawn(f.sessionId, "side", "Generated coordination side"), app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Generated coordination main", exact: true }).click();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Side chat", exact: true }).click();
    const main = page.locator(".coordination-panel").first(), child = page.locator(".coordination-panel").nth(1);
    await main.locator("summary").focus(); await main.locator("summary").press("Enter");
    await main.getByRole("button", { name: "Inspect session", exact: true }).click();
    await expect(main.getByRole("region", { name: "Coordinated session state" })).toContainText("read-only");
    await main.getByLabel("Coordination message", { exact: true }).fill("Generated user main advisory.");
    await expect(main.getByLabel("Coordination target", { exact: true })).toBeDisabled();
    await main.getByRole("button", { name: "Send advisory", exact: true }).click();
    await expect(main.getByLabel("Coordination message", { exact: true })).toHaveValue("");
    await expect(main.getByLabel("Coordination target", { exact: true })).toBeEnabled();
    await child.locator("summary").click();
    await child.getByRole("button", { name: "Read public transcript", exact: true }).click();
    await expect(child.getByRole("region", { name: "Coordinated public context" })).toContainText(f.sessionId);
    await child.getByLabel("Coordination message", { exact: true }).fill("Generated user side advisory.");
    await child.getByRole("button", { name: "Send advisory", exact: true }).click();
    await expect(child.getByLabel("Coordination message", { exact: true })).toHaveValue("");
    await expect(child.getByLabel("Coordination target", { exact: true })).toBeEnabled();
    await expect(page.getByLabel("Question-only side session", { exact: true })).toBeEnabled();
    await expect.poll(() => f.service.controller.snapshot().coordinationMessages.length).toBe(2);
    expect(f.service.controller.snapshot().coordinationMessages.every((message) => message.origin.actor === "user")).toBe(true);
    expect(f.service.controller.snapshot().sessions.find((session) => session.id === side.id)?.mode).toBe("read-only");
    await expect(child.getByRole("button", { name: "Dispatch child task", exact: true })).toHaveCount(0);
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("the Agent pane follows an original watch and records actual inspection, never successful cancellation", async () => {
  const f = await setupFixture({ toolCall: { name: "command_job", args: { action: "start", command: "printf 'GENERATED_WATCH_UI\\n'; sleep 30", timeoutMs: 60000 } } });
  const sdk = await new MoguriSdk(f.service.connection).ready();
  await f.configure(); await f.send("Generated watch UI request."); await f.approve(); await f.terminal();
  const job = await waitFor(() => f.service.controller.snapshot().jobs.find((job) => job.commandJob)), app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    const jobs = page.locator(".command-jobs");
    await expect(jobs.getByLabel("Original watch output", { exact: true })).toContainText("GENERATED_WATCH_UI");
    await jobs.getByRole("button", { name: "Stop watch job", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().jobs.find((entry) => entry.id === job.id)?.status).toBe("partial");
    await expect(jobs.getByRole("region", { name: "Unconfirmed watch inspection" })).toBeVisible();
    await jobs.getByRole("checkbox", { name: "I inspected this original watch job" }).check();
    await jobs.getByRole("button", { name: "Acknowledge watch inspection", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().jobs.find((entry) => entry.id === job.id)?.commandJob?.inspected).toBe(true);
    expect(f.service.controller.snapshot().jobs.find((entry) => entry.id === job.id)?.status).toBe("partial");
    expect(f.requests).toHaveLength(2);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
