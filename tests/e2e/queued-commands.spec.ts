import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
});
test.skip(process.platform !== "darwin", "Queued UI actions use generated hidden macOS windows.");

test("desktop slash text waits in the real service queue instead of changing theme during an earlier model turn", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("generated slow original queued-theme turn"); await input.press("Enter");
    await expect.poll(() => fixture.requests.length).toBe(1);
    await input.fill("/theme crystal light"); await input.press("Enter");
    await expect.poll(() => fixture.session().queue.length).toBe(1);
    expect(fixture.session().queue[0]?.command?.name).toBe("theme");
    expect(fixture.service.controller.snapshot().settings.values.appearance.palette).not.toBe("crystal");
    await expect(input).toHaveValue("");
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    expect(fixture.session().queue[0]?.held).toBe(true);
    await sdk.command({ type: "session.resume", sessionId: fixture.sessionId });
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.appearance.palette).toBe("crystal");
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "theme")?.status).toBe("completed");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.session().messages.some((message) => message.role === "user" && message.text.startsWith("/theme"))).toBe(false);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("service-only command completion and failure are visible without moving focus or replaying the source", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/theme crystal light"); await input.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "theme")?.status).toBe("completed");
    const entry = fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "theme")!;
    const retained = (await sdk.commands.read(entry.id)).result;
    expect(retained?.kind).toBe("ok");
    if (retained?.kind !== "ok") throw new Error("Generated settings command lost its actual retained confirmation.");
    await expect(page.getByRole("status").filter({ hasText: retained.message })).toBeVisible();
    await expect(input).toBeFocused(); await expect(page.getByRole("dialog", { name: "Command output", exact: true })).toHaveCount(0);
    await input.fill("/model generated-unavailable-model"); await input.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "model")?.status).toBe("failed");
    const failed = fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "model")!;
    await expect(page.getByRole("alert")).toContainText(failed.diagnostic!); await expect(input).toHaveValue("");
    expect((await sdk.commands.read(failed.id)).item.text).toBe("/model generated-unavailable-model");
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Cmd/Ctrl+Enter holds even yolo without running it or requiring a selected model", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/yolo"); await input.press("Meta+Enter");
    await expect.poll(() => fixture.session().queue.length).toBe(1);
    expect(fixture.session().queue[0]?.held).toBe(true); expect(fixture.session().queue[0]?.command?.name).toBe("yolo");
    expect(fixture.session().controls.autonomy).toBe("Manual"); expect(fixture.session().controls.modelId).toBe(null);
    await expect(input).toHaveValue(""); expect(fixture.requests).toHaveLength(0);
    await sdk.command({ type: "session.resume", sessionId: fixture.sessionId });
    await expect.poll(() => fixture.session().controls.autonomy).toBe("Autopilot");
    expect(fixture.session().controls.modelId).toBe(null); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("queued views acknowledge actual desktop navigation and retain service responses outside model messages", async () => {
  const fixture = await setupFixture(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/settings"); await input.press("Enter");
    await expect(page.getByRole("region", { name: "General settings" }).getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "settings")?.status).toBe("completed");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    for (const action of ["open", "close"] as const) {
      await input.fill(`/sidebar ${action}`); await input.press("Enter");
      await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.filter((entry) => entry.name === "sidebar" && entry.status === "completed").length).toBe(action === "open" ? 1 : 2);
      if (action === "open") await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeVisible();
      else await expect(page.getByRole("complementary", { name: "Session sidebar" })).toBeHidden();
    }
    await input.fill("/help"); await input.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "help")?.status).toBe("completed");
    await page.getByText("Commands", { exact: false }).filter({ has: page.getByRole("status") }).click();
    await page.getByRole("button", { name: "Read /help command response" }).click();
    await expect(page.getByRole("dialog", { name: "Command response" })).toContainText("/yolo");
    await page.getByRole("button", { name: "Close command response" }).click();
    expect(fixture.requests).toHaveLength(0); expect(fixture.session().messages).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("the actual queued continuation dialog chooses its original input without consuming another client's newer draft", async () => {
  const fixture = await setupFixture({ responseMode: "text" }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure(); const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/continue-work"); await input.press("Enter");
    const review = page.getByRole("dialog", { name: "Continue work", exact: true });
    await expect(review).toBeVisible(); expect(fixture.requests).toHaveLength(0);
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions[0]?.status).toBe("claimed");
    await sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: fixture.session().draft.revision,
      text: "Generated newer actual client draft.", attachments: [] });
    await review.getByRole("button", { name: "Send to model" }).click();
    await expect(review).toBeHidden(); await fixture.terminal();
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.session().messages.find((message) => message.role === "user")?.text).toBe("/continue-work");
    expect(JSON.stringify(fixture.requests)).not.toContain("Generated newer actual client draft.");
    await expect(input).toHaveValue("Generated newer actual client draft.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("queued desktop archive waits for its real child review and cannot turn the archived model state back into success", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated queued archive child"), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), input = page.getByRole("textbox", { name: "Prompt", exact: true });
    await input.fill("/archive"); await input.press("Enter");
    const review = page.getByRole("dialog", { name: "Archive session", exact: true });
    await expect(review).toBeVisible();
    expect(fixture.session().status).not.toBe("archived"); expect(fixture.requests).toHaveLength(0);
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "archive")?.status).toBe("claimed");
    await review.getByRole("radio", { name: /Archive attached sessions/ }).check();
    await review.getByRole("button", { name: "Archive session", exact: true }).click();
    await expect(review).toBeHidden();
    await expect.poll(() => fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.name === "archive")?.status).toBe("completed");
    expect(fixture.session().status).toBe("archived");
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === child.id)?.status).toBe("archived");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
