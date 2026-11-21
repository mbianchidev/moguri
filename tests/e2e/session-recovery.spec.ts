import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";
import { appendLegacyAutopilot } from "../fixtures/legacy-state.ts";
import { MoguriError } from "../../packages/sdk/src/index.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden native session recovery is qualified on macOS.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });

test("legacy Autopilot shows no reselection warning and approves actual commands on subsequent turns and renderer reload", async () => {
  const f = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf 'Generated hidden automatic command\\n'", timeoutMs: 2000 } } });
  await f.configure(); appendLegacyAutopilot(f.service, f.sessionId);
  const app = await launch(f.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Autonomy level", exact: true });
    await expect(menu).toContainText("Autonomous and Autopilot are unattended");
    await expect(menu).not.toContainText("legacy bounded grants");
    await page.keyboard.press("Escape");
    for (const prompt of ["Generated hidden first automatic turn.", "Generated hidden second automatic turn."]) {
      await page.getByLabel("Prompt", { exact: true }).fill(prompt);
      await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect.poll(() => f.session().messages.filter((message) => message.role === "user").length).toBe(prompt.includes("second") ? 2 : 1);
      await f.terminal();
      await expect(page.getByRole("region", { name: "Tool approval", exact: true })).not.toBeVisible();
    }
    await page.reload(); await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await expect(menu).not.toContainText("legacy bounded grants");
    expect(f.service.controller.events(0).filter((event) => event.event_type === "tool.decided")
      .every((event) => event.event_type === "tool.decided" && event.payload.actor === "autonomy")).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible()))).toBe(false);
  } finally { await app.close(); await f.close(); }
});

test("a transient real snapshot failure reconnects without losing the composer or duplicating its eventual prompt", async () => {
  const f = await setupFixture(); await f.configure();
  const app = await launch(f.directory);
  const snapshot = f.service.profiles.snapshot.bind(f.service.profiles);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toBeVisible(); await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    let failed = false, recovered = false;
    f.service.profiles.snapshot = async (...args: Parameters<typeof snapshot>) => {
      if (!failed) { failed = true; throw new MoguriError("generated_snapshot_failure", "Generated transient snapshot failure.", 503); }
      recovered = true; return snapshot(...args);
    };
    await prompt.fill("Generated preserved disconnected edit.");
    await expect.poll(() => failed && recovered).toBe(true);
    await expect(prompt).toHaveValue("Generated preserved disconnected edit.");
    await prompt.fill("Generated preserved disconnected edit. Still here.");
    await expect.poll(() => f.session().draft.text).toBe("Generated preserved disconnected edit. Still here.");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => f.session().messages.filter((message) => message.role === "user").length).toBe(1);
    await f.terminal(); expect(f.requests).toHaveLength(1);
    expect(f.session().messages.find((message) => message.role === "user")?.text).toBe("Generated preserved disconnected edit. Still here.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { f.service.profiles.snapshot = snapshot; await app.close(); await f.close(); }
});

test("the desktop proxy inspects a lost draft acknowledgement by its exact receipt without sending another save", async () => {
  const f = await setupFixture(), app = await launch(f.directory);
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await expect(page.getByText("Local service connected", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      const original = globalThis.fetch; let drop = true;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await original(input, init);
        const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        const command = typeof body === "object" && body !== null && "command" in body ? body.command : null;
        if (drop && String(input).endsWith("/v1/commands") && typeof command === "object" && command !== null &&
          "type" in command && command.type === "draft.save") {
          drop = false; await response.text(); document.documentElement.dataset.generatedDraftAckLost = "true";
          throw new DOMException("Signal timed out", "TimeoutError");
        }
        return response;
      };
    });
    await prompt.fill("Generated saved through its exact original receipt.");
    await expect(page.locator("html")).toHaveAttribute("data-generated-draft-ack-lost", "true");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    expect(f.session().draft.text).toBe("Generated saved through its exact original receipt.");
    expect(f.service.controller.events(0).filter((event) => event.event_type === "draft.saved")).toHaveLength(1);
    await page.reload(); await expect(prompt).toHaveValue("Generated saved through its exact original receipt.");
    expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});
