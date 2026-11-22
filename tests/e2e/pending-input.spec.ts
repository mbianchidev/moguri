import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isRecord, MoguriError } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Pending input uses a generated hidden desktop.");

for (const outcome of ["accepted", "refused"] as const) test(`an immediately visible sending row preserves the original input until it is ${outcome}`, async () => {
  const fixture = await setupFixture({ responseMode: "text" }), gate = Promise.withResolvers<void>();
  await fixture.configure();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let entered = false;
  fixture.service.controller.dispatch = async (...args: Parameters<typeof dispatch>) => {
    const envelope: unknown = args[0];
    if (isRecord(envelope) && isRecord(envelope.command) && envelope.command.type === "message.send") {
      entered = true; await gate.promise;
      if (outcome === "refused") throw new MoguriError("generated_input_refused", "Generated original input was refused.", 409);
    }
    return dispatch(...args);
  };
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });

  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    const original = `Generated original ${outcome} input.`;
    await prompt.fill(original);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const began = performance.now();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const pending = page.getByRole("article", { name: "Pending message", exact: true });
    await expect(pending).toBeVisible({ timeout: 1000 });
    const visibleMs = performance.now() - began;
    expect(visibleMs).toBeLessThan(1000);
    await expect(pending).toContainText(original);
    await expect(pending.getByRole("status")).toContainText("Awaiting service acknowledgement");
    await expect(prompt).toHaveValue("");
    await expect.poll(() => entered).toBe(true);
    expect(fixture.session().messages).toHaveLength(0);
    expect(fixture.session().queue).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
    console.log(JSON.stringify({ primitive: "pending-input-before-acknowledgement", outcome, visibleMs, modelCalls: 0 }));
    if (outcome === "accepted") await prompt.fill("Generated newer unsent input.");
    gate.resolve();
    await expect(pending).toHaveCount(0);
    if (outcome === "accepted") {
      await expect(page.getByRole("article", { name: "User prompt", exact: true })).toContainText(original);
      await expect(prompt).toHaveValue("Generated newer unsent input.");
      await fixture.terminal();
      await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
      expect(fixture.session().draft.text).toBe("Generated newer unsent input.");
      expect(fixture.requests).toHaveLength(1);
    } else {
      await expect(prompt).toHaveValue(original);
      await expect(page.getByRole("form", { name: "Message composer", exact: true }).getByRole("alert")).toContainText("Generated original input was refused.");
      await expect(page.getByRole("article", { name: "User prompt", exact: true })).toHaveCount(0);
      expect(fixture.requests).toHaveLength(0);
    }
  } finally {
    gate.resolve(); fixture.service.controller.dispatch = dispatch;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); await fixture.close();
  }
});

test("Insights copies bounded startup and client transport timings without retaining draft content or credentials", async () => {
  const fixture = await setupFixture();
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    const page = await app.firstWindow(), text = "Generated private draft excluded from timing diagnostics.";
    await page.getByLabel("Prompt", { exact: true }).fill(text);
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("moguri:copy-text");
      ipcMain.handle("moguri:copy-text", (_event, value: string) => { process.env.MOGURI_GENERATED_TIMING_COPY = value; });
    });
    const insights = page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Insights", exact: true });
    if (await insights.getAttribute("aria-expanded") !== "true") await insights.click();
    await page.getByRole("button", { name: "Show recent event trace", exact: true }).click();
    await page.getByText("Client request timings", { exact: true }).click();
    const copy = page.getByRole("button", { name: "Copy client request timings", exact: true });
    const diagnostics = page.locator(".event-trace details").filter({ has: page.getByText("Client request timings", { exact: true }) });
    await expect.poll(async () => JSON.parse(await diagnostics.locator("pre").textContent() ?? "{}").desktopStartup?.phase).toBe("ready");
    await copy.click();
    const captured = await app.evaluate(() => process.env.MOGURI_GENERATED_TIMING_COPY);
    expect(captured).toBeTruthy();
    const value = JSON.parse(captured!);
    expect(value.desktopStartup.phase).toBe("ready");
    expect(value.clientRequests.length).toBeLessThanOrEqual(50);
    expect(value.clientRequests.some((entry: { operation: string }) => entry.operation === "draft.save")).toBe(true);
    for (const secret of [text, fixture.service.connection.token, fixture.sessionId, fixture.directory]) expect(captured).not.toContain(secret);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});
