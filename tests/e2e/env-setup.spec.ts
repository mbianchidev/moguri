import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { frameDigest } from "../../apps/service/src/worker-wire.ts";
import { generatedSandboxDistribution } from "../fixtures/sandbox-distribution.ts";
import { assertOperationLatency } from "../fixtures/latency-budgets.ts";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (state: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: state, MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Env setup uses generated hidden macOS windows.");

for (const projectFree of [false, true]) test(`first Sandbox selection sets up ${projectFree ? "a project-free chat" : "a project"} without configuration or premature readiness`, async () => {
  const generated = await generatedSandboxDistribution(), release = Promise.withResolvers<void>();
  let installed = false, installs = 0, imports = 0, probes = 0;
  const f = await setupFixture({ platform: { sandbox: { distribution: generated.directory, setup: { automatic: false,
    installed: async () => installed, install: async () => { installs++; installed = true; },
    importImage: async () => { imports++; await release.promise; },
  } } } });
  const sdk = await new MoguriSdk(f.service.connection).ready(), controller = f.service.controller;
  await f.configure();
  const id = projectFree ? (await sdk.sessions.create(null, "Generated free Sandbox chat")).id! : f.sessionId;
  const session = () => controller.snapshot().sessions.find((session) => session.id === id)!;
  if (projectFree) await sdk.sessions.configure(id, { ...session().controls, modelId: f.modelId });
  controller.sandbox.probe = async () => {
    probes++;
    const config = controller.snapshot().settings.values.sandbox;
    const ready = { ready: true, configured: true, diagnostic: "Generated first-use qualification, no real VM.",
      configDigest: frameDigest(config), release: config.qualification!.release, workerDigest: config.qualification!.workerDigest, image: config.image };
    controller.sandbox.readiness = ready; controller.provider.synchronize(); controller.emit("change", []); return ready;
  };
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.locator(`.session-link[data-session-id="${id}"]`).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    const env = page.getByRole("dialog", { name: "Execution environment", exact: true });
    const sandbox = env.getByRole("button", { name: /^Sandbox / });
    await expect(sandbox).toBeEnabled(); await sandbox.click();
    const setup = page.getByRole("dialog", { name: "Set up SendBox", exact: true });
    await expect(setup).toBeVisible();
    await expect(setup.getByLabel("SendBox version to review", { exact: true })).toHaveCount(0);
    await expect(setup.getByRole("textbox")).toHaveCount(0);
    const review = setup.getByRole("region", { name: "Exact managed Sandbox review", exact: true });
    await expect(review).toContainText("GitHub Meta network delegation");
    await expect(review).toContainText("shared-cloud");
    if (!projectFree) await page.screenshot({ path: test.info().outputPath("sendbox-first-use.png") });
    const enable = review.getByRole("button", { name: "Enable SendBox", exact: true });
    await expect(enable).toBeDisabled();
    expect(installs).toBe(0); expect(imports).toBe(0); expect(probes).toBe(0);
    await review.getByLabel("I reviewed this runtime, pinned worker", { exact: false }).check();
    await enable.click(); await expect.poll(() => imports).toBe(1);
    expect(installs).toBe(1); expect(probes).toBe(0);
    expect(session().controls.env).toBe("Local");
    release.resolve();
    await expect.poll(() => session().controls.env).toBe("Sandbox");
    await expect(setup).toBeHidden();
    expect(probes).toBe(1);
    expect(controller.snapshot().settings.values.sandboxManagement).toMatchObject({ enabled: true, automaticWorkspaces: true, automaticProviderNetwork: true });
    expect(session().projectId).toBe(projectFree ? null : f.session().projectId);
    await page.getByLabel("Prompt", { exact: true }).fill("Generated first-use draft, no inference.");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const another = await sdk.sessions.create(projectFree ? f.session().projectId : null, "Generated next SendBox chat");
    await page.locator(`.session-link[data-session-id="${another.id}"]`).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    await env.getByRole("button", { name: /^Sandbox / }).click();
    await expect.poll(() => controller.snapshot().sessions.find((session) => session.id === another.id)?.controls.env).toBe("Sandbox");
    await expect(page.getByRole("dialog", { name: "Set up SendBox", exact: true })).toHaveCount(0);
    expect(installs).toBe(1); expect(imports).toBe(1); expect(probes).toBe(1);
    expect(session().draft.text).toBe("Generated first-use draft, no inference.");
    expect(f.requests).toHaveLength(0);
  } finally { release.resolve(); await app.close(); sdk.disconnect(); await f.close(); await generated.close(); }
});

test("first-use cancellation waits for its original import, preserves the draft and never replays setup", async () => {
  const generated = await generatedSandboxDistribution(), release = Promise.withResolvers<void>();
  let imports = 0, probes = 0;
  const f = await setupFixture({ platform: { sandbox: { distribution: generated.directory, setup: { automatic: false,
    installed: async () => true, importImage: async () => { imports++; await release.promise; },
    install: async () => { throw new Error("Generated cancellation must not request OS installation."); },
  } } } });
  const sdk = await new MoguriSdk(f.service.connection).ready();
  f.service.controller.sandbox.probe = async () => { probes++; throw new Error("Cancelled setup must not launch a probe."); };
  await f.configure();
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Prompt", { exact: true }).fill("Generated draft survives cancelled SendBox setup.");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const open = async () => {
      await page.getByRole("button", { name: "Execution environment", exact: true }).click();
      await page.getByRole("dialog", { name: "Execution environment", exact: true }).getByRole("button", { name: /^Sandbox / }).click();
    };
    await open();
    const setup = page.getByRole("dialog", { name: "Set up SendBox", exact: true });
    await setup.getByLabel("I reviewed this runtime, pinned worker", { exact: false }).check();
    await setup.getByRole("button", { name: "Enable SendBox", exact: true }).click();
    await expect.poll(() => imports).toBe(1);
    const id = (await sdk.sandbox.setup.status()).setup.operation!.id;
    await setup.getByRole("button", { name: "Cancel original setup", exact: true }).click();
    await expect(setup.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    expect(f.session().controls.env).toBe("Local"); expect(probes).toBe(0);
    release.resolve();
    await expect.poll(async () => (await sdk.sandbox.setup.operation(id)).operation.status).toBe("partial");
    await expect(setup.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    await setup.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await expect(setup.getByRole("region", { name: "Exact managed Sandbox review", exact: true })).toBeVisible();
    expect((await sdk.sandbox.setup.status()).setup.operation!.id).toBe(id);
    expect(imports).toBe(1); expect(probes).toBe(0);
    expect(f.session().controls.env).toBe("Local"); expect(f.session().draft.text).toBe("Generated draft survives cancelled SendBox setup.");
    await page.keyboard.press("Escape"); expect(f.requests).toHaveLength(0);
  } finally { release.resolve(); await app.close(); sdk.disconnect(); await f.close(); await generated.close(); }
});

test("completed setup cannot select Env through a stale original session revision", async () => {
  const generated = await generatedSandboxDistribution(), release = Promise.withResolvers<void>();
  let imports = 0;
  const f = await setupFixture({ platform: { sandbox: { distribution: generated.directory, setup: { automatic: false,
    installed: async () => true, importImage: async () => { imports++; await release.promise; },
  } } } });
  const sdk = await new MoguriSdk(f.service.connection).ready(), controller = f.service.controller;
  await f.configure();
  controller.sandbox.probe = async () => {
    const config = controller.snapshot().settings.values.sandbox;
    const ready = { ready: true, configured: true, diagnostic: "Generated exact qualified runtime.",
      configDigest: frameDigest(config), release: config.qualification!.release, workerDigest: config.qualification!.workerDigest, image: config.image };
    controller.sandbox.readiness = ready; controller.provider.synchronize(); controller.emit("change", []); return ready;
  };
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    const env = page.getByRole("dialog", { name: "Execution environment", exact: true });
    await env.getByRole("button", { name: /^Sandbox / }).click();
    const setup = page.getByRole("dialog", { name: "Set up SendBox", exact: true });
    await setup.getByLabel("I reviewed this runtime, pinned worker", { exact: false }).check();
    await setup.getByRole("button", { name: "Enable SendBox", exact: true }).click();
    await expect.poll(() => imports).toBe(1);
    await sdk.sessions.rename(f.sessionId, "Generated peer retained title");
    release.resolve();
    await expect(setup.getByRole("alert").filter({ hasText: /changed|revision/i })).toBeVisible();
    expect(f.session().controls.env).toBe("Local"); expect(f.session().title).toBe("Generated peer retained title");
    expect((await sdk.sandbox.setup.status()).setup.operation?.status).toBe("completed");
    await setup.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    await env.getByRole("button", { name: /^Sandbox / }).click();
    await expect.poll(() => f.session().controls.env).toBe("Sandbox");
    expect(imports).toBe(1); expect(f.requests).toHaveLength(0);
  } finally { release.resolve(); await app.close(); sdk.disconnect(); await f.close(); await generated.close(); }
});

test("Env settings appear on row hover or keyboard focus without changing Env or keeping footer actions", async () => {
  const f = await setupFixture(); await f.configure();
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.locator(`.session-link[data-session-id="${f.sessionId}"]`).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    const env = page.getByRole("dialog", { name: "Execution environment", exact: true });
    await expect(env).not.toContainText("Remote transfers approved context");
    for (const name of ["Remote SSH setup", "Sandbox qualification", "Native workspace and results"]) {
      await expect(env.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    const gear = env.getByRole("button", { name: "Remote settings", exact: true }), row = gear.locator("..");
    await env.getByRole("heading").hover();
    await expect(gear).toHaveCSS("opacity", "0");
    await row.hover(); await expect(gear).toHaveCSS("opacity", "1");
    const bounds = await row.boundingBox(), button = await gear.boundingBox();
    expect(bounds).not.toBeNull(); expect(button).not.toBeNull();
    expect(Math.abs(bounds!.x + bounds!.width - button!.x - button!.width)).toBeLessThan(3);
    await gear.focus(); await env.getByRole("heading").hover();
    await expect(gear).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Remote SSH", exact: true })).toBeVisible();
    expect(f.session().controls.env).toBe("Local");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    await env.getByRole("button", { name: "SendBox settings", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Managed SendBox setup", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Sandbox execution and reviewed publication", exact: true })).toBeVisible();
    expect(f.session().controls.env).toBe("Local"); expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("each desktop start refreshes current models without blocking New chat, and Providers offers a truthful manual refresh", async () => {
  const f = await setupFixture(); await f.configure();
  const gate = Promise.withResolvers<void>(), original = f.provider.state.models[0]!;
  let refreshes = 0, fail = false;
  f.provider.refresh = async () => {
    refreshes++;
    if (fail) throw new Error("Generated model discovery failure.");
    f.provider.state = { ...f.provider.state, status: "connecting", models: [] }; f.provider.onChange();
    await gate.promise;
    f.provider.state = { ...f.provider.state, status: "connected", models: [original,
      { ...original, id: "generated-fresh-model", name: "Generated fresh model" }] };
    f.provider.onChange();
  };
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await expect.poll(() => refreshes).toBe(1);
    const create = page.getByRole("region", { name: "Chats", exact: true }).locator("header").getByRole("button", { name: "New chat", exact: true });
    await expect(create).toBeEnabled();
    const began = performance.now(); await create.click();
    await expect(page.getByRole("heading", { name: "New chat", exact: true })).toBeVisible();
    await expect(create).toBeEnabled();
    assertOperationLatency("session.create", performance.now() - began);
    gate.resolve();
    await expect.poll(() => f.service.controller.snapshot().provider.models.filter((model) => !model.synthetic).map((model) => model.id).sort())
      .toEqual([original.id, "generated-fresh-model"].sort());
    await openSettingsSection(page, "Providers");
    const refresh = page.getByRole("button", { name: "Refresh available models", exact: true });
    await expect(refresh).toBeEnabled(); await refresh.click();
    await expect.poll(() => refreshes).toBe(2); await expect(refresh).toBeEnabled();
    fail = true; await refresh.click();
    await expect.poll(() => refreshes).toBe(3);
    await expect(page.getByRole("region", { name: "Provider and model availability", exact: true })).toContainText("discovery failed");
    expect(f.service.controller.snapshot().provider.models.filter((model) => !model.synthetic)).toHaveLength(0);
    fail = false; await page.reload();
    await expect.poll(() => refreshes).toBe(4);
    await expect.poll(() => f.service.controller.snapshot().provider.models.filter((model) => !model.synthetic).map((model) => model.id).sort())
      .toEqual([original.id, "generated-fresh-model"].sort());
    expect(f.requests).toHaveLength(0);
  } finally { gate.resolve(); await app.close(); await f.close(); }
});
