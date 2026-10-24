import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { generatedAdvice, setupDecisions } from "../fixtures/decisions-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual bounded Local decision worker is qualified on macOS.");
test("desktop explicitly saves a compatible decision policy, enables Local Max independently of the selected model, and inspects real provider-attributed results", async () => {
  const f = await setupDecisions(), policy = structuredClone(f.sdk.settings.get()!.values.decisions);
  const disabled = structuredClone(f.sdk.settings.get()!.values); disabled.decisions.enabled = false;
  await f.sdk.settings.update(disabled, f.sdk.settings.get()!.revision);
  await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, autonomy: "Manual" });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const composer = page.getByRole("form", { name: "Message composer" });
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Autopilot Max/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Decision provider settings", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Decision provider settings", exact: true }).click();
    await page.getByLabel("Decision provider policy", { exact: true }).fill(JSON.stringify(policy));
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => f.sdk.settings.get()!.values.decisions.enabled).toBe(true);
    expect(f.session().controls.autonomy).toBe("Manual"); expect(f.session().controls.modelId).toBe(f.modelId);
    expect(f.requests).toHaveLength(0); expect(f.advice.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Autopilot Max/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Autopilot Max/ }).click();
    await expect.poll(() => f.session().controls.autonomy).toBe("Autopilot Max");
    await composer.getByRole("textbox", { name: "Prompt", exact: true }).fill("generated tool reviewed desktop decision");
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().decisions[0]?.status).toBe("applied");
    await expect.poll(() => f.session().status).toBe("completed");
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Artifacts", exact: true }).click();
    const decisions = page.getByRole("region", { name: "Decision-provider observations", exact: true });
    await expect(decisions).toContainText("Decision applied"); await expect(decisions).toContainText(f.decisionModelId);
    await expect(decisions).toContainText("42"); await expect(decisions).toContainText("decision-provider");
    expect(f.session().controls.modelId).toBe(f.modelId); expect(f.session().controls.env).toBe("Local");
    expect(f.requests).toHaveLength(2); expect(f.advice.requests).toHaveLength(1); expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("desktop human denial overrides an actual in-flight decision and preserves its unknown held cost without fake user attribution", async () => {
  const f = await setupDecisions({ advice: { stream: { chunks: [generatedAdvice()], delayMs: 1500 } } });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("form", { name: "Message composer" })).toBeVisible();
    await f.send("generated tool actual desktop human override");
    await expect.poll(() => f.advice.requests.length).toBe(1);
    const approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval).toContainText("You can override");
    await approval.getByRole("button", { name: "Deny", exact: true }).click();
    await expect.poll(() => f.session().status).toBe("completed");
    await expect.poll(() => f.service.controller.snapshot().decisions[0]?.status).toBe("partial");
    const record = f.service.controller.snapshot().decisions[0]!;
    expect(record.applied).toBeNull();
    expect(f.service.controller.snapshot().budgetEntries.find((entry) => entry.id === record.stepId)?.status).toBe("unknown");
    expect(f.service.controller.events(0).some((event) => event.event_type === "tool.started")).toBe(false);
    expect(f.service.controller.events(0).filter((event) => event.event_type === "tool.decided" && event.payload.actor === "user")).toHaveLength(1);
    expect(f.advice.requests).toHaveLength(1);
  } finally { await app.close(); await f.close(); }
});

test("desktop preserves explicit Jev configuration but keeps Max blocked with its real output-bound reason and no generative fallback", async () => {
  const f = await setupDecisions();
  await f.sdk.sessions.configure(f.sessionId, { ...f.session().controls, autonomy: "Manual" });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    await page.getByRole("button", { name: "Decision provider settings", exact: true }).click();
    const policy = { ...f.sdk.settings.get()!.values.decisions, provider: "jev", modelId: "jev-0.0.1", allowHosted: true };
    await page.getByLabel("Decision provider policy", { exact: true }).fill(JSON.stringify(policy));
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => f.sdk.settings.get()!.values.decisions.provider).toBe("jev");
    await expect(page.getByRole("status").filter({ hasText: "no enforceable output-token-limit" })).toBeVisible();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await composer.getByRole("button", { name: "Autonomy level", exact: true }).click();
    const max = page.getByRole("button", { name: /^Autopilot Max/ });
    await expect(max).toBeDisabled(); await expect(max).toContainText("no enforceable output-token-limit");
    expect(f.session().controls.autonomy).toBe("Manual"); expect(f.session().controls.modelId).toBe(f.modelId);
    expect(f.requests).toHaveLength(0); expect(f.advice.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});
