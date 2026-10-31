import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { reviewNativeTools, setupFixture } from "../fixture.ts";
import { routedFixture } from "../fixtures/single-routing.ts";
import { openModelChoices, openSettingsSection } from "./navigation.ts";
import { defaultKupoSettings } from "../../packages/sdk/src/index.ts";
import { generatedKupoProfile } from "../fixtures/kupo-profiles.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Kupo desktop coverage uses generated hidden macOS fixtures.");

test("unavailable and unbounded models cannot be checked for Kupo; retained unavailable approvals can only be removed", async () => {
  const fixture = await routedFixture();
  await fixture.sdk.models.setEnabled(fixture.solver.modelId, false);
  const { maxTokens: _, ...original } = fixture.provider.state.models[0]!;
  fixture.provider.state.models.push({ ...original, id: "generated-unbounded-kupo", apiModelId: "generated-unbounded-kupo", name: "Generated unknown-output model" });
  fixture.provider.onChange(); await fixture.sdk.refresh();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(); await openSettingsSection(page, "Kupo routing");
    const id = fixture.solverId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const unavailable = page.getByRole("checkbox", { name: new RegExp(`unavailable solver ${id}`, "i") });
    await expect(unavailable).toBeDisabled();
    await expect(unavailable).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Approve solver Generated unknown-output model", exact: true })).toBeDisabled();
    await expect(fixture.sdk.sessions.selectModel(fixture.sessionId, "kupo")).rejects.toThrow(/eligible|approved|pool|unavailable/i);
    await page.getByRole("button", { name: `Remove unavailable solver ${fixture.solverId}`, exact: true }).click();
    await expect.poll(() => fixture.sdk.settings.get()!.values.kupo.approvedModelIds.includes(fixture.solverId)).toBe(false);
    expect(fixture.requests).toHaveLength(0); expect(fixture.solver.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("the disconnected model dropdown always shows unavailable Kupo and its reason", async () => {
  const fixture = await setupFixture();
  await fixture.provider.logout();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const models = await openModelChoices(page);
    const kupo = models.getByRole("menuitemradio", { name: /^Kupo Unavailable/ });
    await expect(kupo).toBeVisible();
    await expect(kupo).toHaveAttribute("aria-disabled", "true");
    await models.getByRole("button", { name: "Why Kupo is unavailable", exact: true }).hover();
    await expect(page.getByRole("dialog", { name: "Why Kupo is unavailable", exact: true })).toContainText("No configured model");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); await fixture.close(); }
});

test("Kupo defaults to automatic configured-model routing and runs Single from the ordinary composer", async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 }), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await composer.getByRole("button", { name: /^Model:/ }).click();
    const models = page.getByRole("dialog", { name: "Model", exact: true });
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Kupo Automatic/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe("kupo");
    await models.getByText("Model details and setup", { exact: true }).click();
    await models.getByRole("button", { name: "Kupo settings", exact: true }).click();
    await expect(page.getByLabel("kupo workflow", { exact: true })).toHaveValue("auto");
    await expect(page.getByLabel("Enable automatic Kupo", { exact: true })).toBeChecked();
    await expect(page.getByRole("table", { name: "Kupo model capabilities" })).toContainText("Generated Copilot model");
    expect(fixture.requests).toHaveLength(0);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated desktop Kupo sole-model task.");
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.session().usage.map((entry) => entry.role)).toEqual(["solver"]);
  } finally { await app.close(); await fixture.close(); }
});

test("ordinary desktop Kupo selects Cascade and still waits for the exact human tool approval", async () => {
  const fixture = await routedFixture({ configured: false });
  await reviewNativeTools(fixture, ["read_file"]);
  await fixture.sdk.refresh();
  const draft = await generatedKupoProfile(fixture.sdk, fixture.solverId, { category: "economy", score: 0.3, price: 0 });
  const gate = await generatedKupoProfile(fixture.sdk, fixture.modelId, { category: "frontier", score: 0.8, price: 5 });
  await fixture.sdk.routing.configure({ ...defaultKupoSettings(), modelProfiles: [draft, gate] }, fixture.sdk.settings.get()!.revision);
  fixture.options.respond = (_request, index) => ({ text: JSON.stringify(index === 1 ?
    { pattern: "cascade", modelId: fixture.solverId, escalationId: fixture.modelId, complexity: "moderate", confidence: 0.95, reason: "Generated desktop automatic route." } :
    { verdict: "pass", reason: "Generated desktop gate, not permission." }) });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), composer = page.getByRole("form", { name: "Message composer" });
    await composer.getByRole("button", { name: /^Model:/ }).click();
    await (await openModelChoices(page)).getByRole("menuitemradio", { name: /^Kupo Automatic/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe("kupo");
    await page.keyboard.press("Escape");
    await page.getByLabel("Prompt", { exact: true }).fill("generated tool through desktop automatic Kupo");
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.session().pendingApproval?.call.name).toBe("read_file");
    expect(fixture.service.controller.events(0).some((event) => event.event_type === "tool.started")).toBe(false);
    await page.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.session().usage.map((entry) => entry.role)).toEqual(["router", "draft", "critic", "draft", "critic"]);
    await expect(page.getByText("Generated routed solver answer.", { exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(3); expect(fixture.solver.requests).toHaveLength(2);
  } finally { await app.close(); await fixture.close(); }
});
