import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { generatedSandboxDistribution } from "../fixtures/sandbox-distribution.ts";
import { nativeConfiguration } from "../fixtures/native-target.ts";
import { nativeApiFixture } from "../fixtures/native-api.ts";
import { frameDigest } from "../../apps/service/src/worker-wire.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (state: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: state, MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Managed native desktop is macOS-only.");

test("bundled setup replaces blank JSON, requires exact approval and autosaves management controls", async () => {
  const generated = await generatedSandboxDistribution(); let imports = 0, probes = 0;
  const fixture = await setupFixture({ platform: { sandbox: { distribution: generated.directory, setup: { automatic: false,
    installed: async () => true, importImage: async () => { imports++; },
    install: async () => { throw new Error("A generated hidden window cannot request administrator authorization."); },
  } } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), controller = fixture.service.controller;
  controller.sandbox.probe = async () => {
    probes++;
    const config = controller.snapshot().settings.values.sandbox;
    const ready = { ready: true, configured: true, diagnostic: "Generated managed readiness without a VM.",
      configDigest: frameDigest(config), release: config.qualification!.release, workerDigest: config.qualification!.workerDigest, image: config.image };
    controller.sandbox.readiness = ready; controller.provider.synchronize(); controller.emit("change", []); return ready;
  };
  const app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Sandbox", exact: true }).click();
    const panel = page.getByRole("region", { name: "Managed SendBox setup", exact: true });
    await expect(panel).toContainText("0.2.4");
    await expect(page.getByLabel("SendBox configuration", { exact: true })).not.toBeVisible();
    await panel.getByRole("button", { name: "Review bundled setup", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact managed Sandbox review", exact: true });
    const enable = review.getByRole("button", { name: "Enable Sandbox", exact: true });
    await expect(enable).toBeDisabled();
    await expect(review).toContainText("GitHub Meta network delegation");
    await expect(review).toContainText("shared-cloud");
    await expect(review).toContainText("hourly");
    expect(imports).toBe(0); expect(probes).toBe(0);
    await review.getByLabel("I reviewed this runtime, pinned worker", { exact: false }).check();
    await enable.click();
    await expect.poll(() => controller.snapshot().settings.values.sandboxManagement?.enabled).toBe(true);
    await expect(panel.getByRole("status").filter({ hasText: "Setup completed" })).toBeVisible();
    expect(imports).toBe(1); expect(probes).toBe(1); expect(fixture.requests.length).toBe(0);
    const automatic = panel.getByLabel("Check public SendBox releases at startup and every four hours", { exact: true });
    await expect(automatic).toBeEnabled(); await automatic.uncheck();
    try { await expect.poll(() => controller.snapshot().settings.values.sandboxManagement?.automaticUpdates).toBe(false); }
    catch (error) {
      console.error(JSON.stringify({ diagnostic: "generated-managed-autosave", revision: controller.snapshot().settings.revision,
        management: controller.snapshot().settings.values.sandboxManagement, checked: await automatic.isChecked(),
        alerts: await page.getByRole("alert").allTextContents(), toolbar: await page.locator(".settings-toolbar").innerText() }));
      throw error;
    }
    await expect(panel.getByLabel("Prepare private session workspaces automatically", { exact: true })).toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); sdk.disconnect(); await fixture.close(); await generated.close();
  }
});

for (const projectFree of [false, true]) test(`actual first-use SendBox sends in ${projectFree ? "a root-less chat" : "a project"} without settings or a file preview`, async () => {
  const configuration = await nativeConfiguration(), distribution = process.env.MOGURI_SANDBOX_DISTRIBUTION;
  test.skip(!configuration || !distribution, "Explicit current native and bundled-distribution receipts are required.");
  test.setTimeout(120_000);
  if (!configuration || !distribution) return;
  const fixture = await nativeApiFixture(configuration, { distribution, providerBaseUrl: "https://api.individual.githubcopilot.com",
    dns: { addresses: async () => ["1.1.1.1"], aliases: async (host) => host === "api.individual.githubcopilot.com" ? ["api.githubcopilot.com"] : [] } });
  const { sdk, service, provider, project } = fixture;
  const settings = structuredClone(sdk.settings.get()!); settings.values.sandbox = fixture.reviewedConfiguration;
  await sdk.settings.update(settings.values, settings.revision);
  const bound = projectFree ? null : await sdk.command({ type: "project.add", path: project });
  const created = await sdk.sessions.create(bound?.id ?? null);
  const session = () => service.controller.snapshot().sessions.find((value) => value.id === created.id)!;
  await sdk.sessions.configure(created.id!, { ...session().controls, modelId: provider.modelId });
  const app = await launch(fixture.state); let passed = false;
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(`.session-link[data-session-id="${created.id}"]`).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    await page.getByRole("dialog", { name: "Execution environment", exact: true }).getByRole("button", { name: /^Sandbox / }).click();
    const setup = page.getByRole("dialog", { name: "Set up SendBox", exact: true });
    const review = setup.getByRole("region", { name: "Exact managed Sandbox review", exact: true });
    await review.getByLabel("I reviewed this runtime, pinned worker", { exact: false }).check();
    await review.getByRole("button", { name: "Enable SendBox", exact: true }).click();
    await expect.poll(() => session().controls.env, { timeout: 30_000 }).toBe("Sandbox");
    await expect(setup).toBeHidden();
    await page.getByLabel("Prompt", { exact: true }).fill("generated native write");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Review a private native workspace/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => session().status, { timeout: 30_000 }).toBe("completed");
    expect(session().pendingApproval).toBeNull();
    expect(await readFile(join(project, "fixture.txt"), "utf8")).toBe("generated source original\n");
    if (projectFree) {
      expect(service.controller.snapshot().sandboxExecutions![0]?.root).toBeNull();
      expect(service.controller.snapshot().sandboxExecutions![0]?.sourceRoot).toBeNull();
      expect(session().projectId).toBeNull();
      expect(session().homeRoot?.root).toBe(fixture.home);
    } else expect((await sdk.workspaces.file(created.id!, "fixture.txt")).text).toBe("generated native replacement\n");
    expect(service.controller.snapshot().sandboxWorkspaces![0]?.preparation?.kind).toBe("automatic");
    expect(service.controller.snapshot().sandboxExecutions![0]?.networkScope?.allowedDomains).toContain("api.individual.githubcopilot.com");
    await openSettingsSection(page, "Sandbox");
    const retained = page.getByRole("region", { name: "Sandbox execution and reviewed publication", exact: true });
    await expect(retained).toContainText("shared-cloud");
    await expect(retained).toContainText("0.2.4");
    await expect(retained).not.toContainText("Exact entries stay exact");
    expect(provider.requests.length).toBe(0); expect(errors).toEqual([]); passed = true;
  } finally { await app.close(); await fixture.close(passed); }
});
