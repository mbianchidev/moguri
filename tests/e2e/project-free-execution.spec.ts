import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { automaticHome, homeCommand, setupFixture, waitFor } from "../fixture.ts";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Home-backed native chat execution is qualified on macOS.");

test("an ordinary project-free desktop chat shows only chat panels and runs an approved command in its separate Agent terminal", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "pwd", timeoutMs: 2000 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const created = await sdk.sessions.create(null, "Generated Home-backed chat", { modelId: fixture.modelId });
  const home = sdk.getState().snapshot!.sessions.find((session) => session.id === created.id)!.homeRoot!.root;
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, interactions: { ...settings.values.interactions, confirmTerminalClose: false } }, settings.revision);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".session-link").filter({ hasText: "Generated Home-backed chat" }).click();
    const panels = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    await expect.poll(() => panels.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(["Terminal", "Browser", "Insights", "Plan", "Side chat"]);
    await page.getByLabel("Prompt", { exact: true }).fill("Generated ordinary chat pwd request.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const approval = await waitFor(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.pendingApproval);
    expect(approval.call.name).toBe("run_command");
    await sdk.approvals.respond(created.id!, approval.id, true);
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.status).toBe("completed");
    await panels.getByRole("button", { name: "Terminal", exact: true }).click();
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    const agent = page.getByRole("region", { name: "Agent terminal", exact: true });
    await expect(agent.getByLabel("Agent command transcript", { exact: true })).toContainText(home);
    await expect(agent).toContainText("completed");
    await expect(agent.getByRole("textbox", { name: "Agent terminal output", exact: true })).toHaveAttribute("aria-readonly", "true");
    await panels.getByRole("button", { name: "Insights", exact: true }).click();
    await page.getByText("Session identity and workspace", { exact: true }).click();
    await expect(page.getByText("None (project-free)", { exact: true })).toBeVisible();
    await expect(page.locator("dl.facts").getByText(home, { exact: true })).toBeVisible();
    expect(fixture.service.controller.snapshot().projects).toHaveLength(1);
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.projectId).toBeNull();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/project-free-home-chat.png") });
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("stopping a Home Agent command preserves its private User console for inspection and only an actual click acknowledges the exact retained Home risk", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf 'GENERATED_HOME_AGENT_LIVE\\n'; sleep 30", timeoutMs: 30000 } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), created = await sdk.sessions.create(null, "Generated Home inspection console", { modelId: fixture.modelId });
  await sdk.sessions.autonomy(created.id!, "Autopilot");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.locator(".session-link").filter({ hasText: "Generated Home inspection console" }).click();
    await page.getByRole("navigation", { name: "Sidebar panels", exact: true }).getByRole("button", { name: "Terminal", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((terminal) => terminal.sessionId === created.id).length).toBe(1);
    const user = sdk.getState().snapshot!.terminals.find((terminal) => terminal.sessionId === created.id)!;
    await page.getByLabel("Prompt", { exact: true }).fill("Generated live Home Agent command.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.processes.length).toBe(1);
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    await expect(page.getByLabel("Agent command transcript", { exact: true })).toContainText("GENERATED_HOME_AGENT_LIVE");
    await sdk.command({ type: "session.stop", sessionId: created.id! });
    await expect.poll(() => fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.turnId).toBeNull();
    const writer = fixture.service.controller.snapshot().chatWriters.find((writer) => writer.sessionId === created.id)!;
    expect(writer.status).toBe("unconfirmed");
    await page.getByRole("tab", { name: "User", exact: true }).click();
    await sdk.terminal.input(user.id, "GENERATED_HOME_PRIVATE_INSPECTION\n");
    expect((await sdk.terminal.read(user.id)).terminal.status).toBe("running");
    expect(JSON.stringify(fixture.requests).includes("GENERATED_HOME_PRIVATE_INSPECTION")).toBe(false);
    const review = page.getByRole("region", { name: "Home writer inspection", exact: true });
    await expect(review).toContainText("Home needs inspection");
    await expect(review.getByRole("button", { name: "Acknowledge inspected Home", exact: true })).toBeEnabled();
    await review.getByRole("button", { name: "Acknowledge inspected Home", exact: true }).click();
    await expect(review).toHaveCount(0);
    const acknowledged = fixture.service.controller.snapshot().chatWriters.find((entry) => entry.id === writer.id)!;
    expect(acknowledged.status).toBe("acknowledged"); expect(acknowledged.inspection).toEqual({ sessionId: created.id, actor: "user" });
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.status).toBe("partial");
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.queue).toEqual([]);
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("an ordinary Home chat reviews an independently retained writer after its original chat was removed without resuming or approving other work", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const source = await automaticHome(sdk, "Generated removed Home writer");
  await homeCommand(sdk, source, "printf generated > generated-inspection-ready; sleep 30", 30000);
  await waitFor(() => existsSync(join(fixture.home, "generated-inspection-ready")));
  await sdk.command({ type: "session.stop", sessionId: source });
  const writer = sdk.getState().snapshot!.chatWriters.find((writer) => writer.sessionId === source)!;
  await sdk.command({ type: "session.resume", sessionId: source });
  await sdk.sessions.delete(source, true);
  const inspector = await sdk.sessions.create(null, "Generated independent Home reviewer");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.locator(".session-link").filter({ hasText: "Generated independent Home reviewer" }).click();
    const review = page.getByRole("region", { name: "Home writer inspection", exact: true });
    await expect(review).toContainText("Original chat removed");
    await expect(review).toContainText(writer.id);
    await review.getByRole("button", { name: "Acknowledge inspected Home", exact: true }).click();
    await expect(review).toHaveCount(0);
    const retained = fixture.service.controller.snapshot().chatWriters.find((value) => value.id === writer.id)!;
    expect(retained.sessionId).toBe(source); expect(retained.inspection).toEqual({ sessionId: inspector.id, actor: "user" });
    expect(retained.status).toBe("acknowledged");
    expect(fixture.service.controller.snapshot().sessions.find((session) => session.id === inspector.id)?.controls.autonomy).toBe("Manual");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
