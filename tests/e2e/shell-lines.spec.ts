import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native user consoles are qualified on macOS.");

test("a leading ! runs the line in the chat's terminal without a model call, steer or session attachment", async () => {
  const fixture = await setupFixture({ responseMode: "text",
    platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_TERMINAL_READY\\n'; exec /bin/sh"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("!printf 'GENERATED_%s\\n' RAN_FROM_COMPOSER");
    await expect(page.locator(".composer-shell-hint")).toContainText("runs this line in the chat's terminal");
    await expect(page.locator(".composer-shell-hint")).toContainText("No model call");
    await expect(page.getByRole("listbox", { name: "Active context sessions", exact: true })).toHaveCount(0);
    await expect(page.locator(".attachment-trigger-hint")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run in terminal", exact: true })).toBeEnabled();
    await prompt.press("Enter");
    await expect(prompt).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Ghostty terminal", exact: true })).toBeAttached();
    await expect.poll(async () => {
      const terminal = sdk.getState().snapshot!.terminals.find((value) => value.sessionId === fixture.sessionId && value.status === "running");
      return terminal ? (await sdk.terminal.read(terminal.id)).data : "";
    }).toContain("GENERATED_RAN_FROM_COMPOSER");
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.session().messages).toHaveLength(0); expect(fixture.session().queue).toHaveLength(0);
    // The line exists only as the user's ordinary draft until it runs; no receipt, message or terminal record holds it.
    expect(JSON.stringify(fixture.service.controller.events(0).filter((event) => event.event_type !== "draft.saved")).includes("RAN_FROM_COMPOSER")).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
