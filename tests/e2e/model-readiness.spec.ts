import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { configureGeneratedReadiness, generatedReadinessCollector, generatedReviewedReadinessCollector } from "../fixtures/model-readiness.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Readiness UI uses generated observations in a hidden macOS app.");

async function desktopReadiness(options: {
  collect?: typeof generatedReadinessCollector; configuration?: Parameters<typeof configureGeneratedReadiness>[2];
  selectModel?: boolean; exposeModels?: boolean;
} = {}) {
  const fixture = await setupFixture({ exposeModels: options.exposeModels ?? true, responseMode: "text",
    platform: { modelReadiness: { collect: options.collect ?? generatedReadinessCollector } } });
  const sdk = new MoguriSdk(fixture.service.connection);
  let app: ElectronApplication | undefined;
  const close = async () => {
    try { await app?.close(); } finally { sdk.disconnect(); await fixture.close(); }
  };
  try {
    await sdk.ready();
    const model = await configureGeneratedReadiness(sdk, fixture, options.configuration);
    if (options.selectModel !== false) {
      const catalogue = sdk.models.catalogue().models.find((entry) => entry.offerings.some((offering) => offering.model.id === model.id));
      if (!catalogue) throw new Error("Missing exact generated model inventory.");
      await sdk.models.selectSource(catalogue.apiModelId, model.id, sdk.settings.get()!.revision);
      await sdk.sessions.selectModel(fixture.sessionId, model.id);
    }
    app = await electron.launch({
      executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
      env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
    });
    return { fixture, sdk, model, app, close };
  } catch (error) { await close(); throw error; }
}

test("the real composer shows scoped observations only after an explicit refresh and clears them for required preflight", async () => {
  const { fixture, model, app, close } = await desktopReadiness({
    configuration: { runtime: { kind: "llama-cpp", executablePath: "/generated/readiness/llama-cli" } },
  });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated readiness draft stays unsent.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const control = page.getByRole("dialog", { name: "Model", exact: true });
    await control.getByText("Model details and setup", { exact: true }).click();
    const readiness = control.getByRole("region", { name: "Execution-machine model readiness" });
    await readiness.getByText("Local runtime and hardware readiness", { exact: true }).click();
    await expect(readiness.getByRole("table", { name: "Current runtime and hardware observations" })).toHaveCount(0);
    await readiness.getByRole("button", { name: "Refresh readiness", exact: true }).click();
    const table = readiness.getByRole("table", { name: "Current runtime and hardware observations" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "System RAM", exact: true }) })).toContainText("16 GiB");
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Estimated model capacity / performance", exact: true }) })).toContainText("Unknown");
    await readiness.getByLabel("Readiness check mode", { exact: true }).selectOption("required");
    await expect(table).toHaveCount(0);
    await readiness.getByRole("button", { name: "Refresh readiness", exact: true }).click();
    await expect(readiness.getByRole("alert")).toContainText("Required runtime/model evidence is missing, incompatible or unknown");
    await expect(table).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated readiness draft stays unsent.");
    expect(fixture.session().controls.modelId).toBe(model.id);
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await close(); }
});

test("runtime version execution needs exact visible user review and never repeats on an ordinary readiness refresh", async () => {
  const { fixture, app, close } = await desktopReadiness({
    collect: generatedReviewedReadinessCollector, configuration: {
      runtime: { kind: "llama-cpp", executablePath: "/generated/readiness/llama-cli", modelPath: "/generated/readiness/model.gguf" },
      requirements: {
        provenance: { kind: "user-supplied-model-requirements", actor: "user", sourceDigest: "c".repeat(64), recordedAt: "2026-01-01T00:00:00.000Z" },
        runtimeKinds: ["llama-cpp"], minimumRuntimeBuild: 9911, operatingSystems: ["linux"], architectures: ["x64"],
        accelerator: "cpu", minimumRamBytes: 8 * 1024 ** 3, modelFormat: "gguf", minimumModelBytes: 1024 ** 3,
      },
    },
  });
  try {
    const page = await app.firstWindow(), prompt = page.getByLabel("Prompt", { exact: true });
    await prompt.fill("Generated exact-version review stays separate from the prompt.");
    await page.getByRole("button", { name: /^Model:/ }).click();
    const control = page.getByRole("dialog", { name: "Model", exact: true });
    await control.getByText("Model details and setup", { exact: true }).click();
    const readiness = control.getByRole("region", { name: "Execution-machine model readiness" });
    await readiness.getByText("Local runtime and hardware readiness", { exact: true }).click();
    await readiness.getByLabel("Readiness check mode", { exact: true }).selectOption("required");
    const previewButton = readiness.getByRole("button", { name: "Review runtime version command", exact: true });
    await expect(previewButton).toBeVisible();
    await previewButton.click();
    const review = readiness.getByRole("group", { name: "Exact runtime version review", exact: true });
    await expect(review).toContainText("/generated/readiness/llama-cli");
    await expect(review).toContainText("--version");
    await expect(review).toContainText("a".repeat(64));
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "model.runtime_executable_reviewed")).toHaveLength(0);
    await review.getByRole("button", { name: "Approve once and read version", exact: true }).focus();
    await page.keyboard.press("Enter");
    const table = readiness.getByRole("table", { name: "Current runtime and hardware observations", exact: true });
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Runtime version / build", exact: true }) }))
      .toContainText("build:9911@abcdef01234567");
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "model.runtime_executable_reviewed")).toHaveLength(1);
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "model.runtime_review_consumed")).toHaveLength(1);
    await readiness.getByLabel("Readiness check mode", { exact: true }).selectOption("informational");
    await readiness.getByRole("button", { name: "Refresh readiness", exact: true }).click();
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Runtime version / build", exact: true }) })).toContainText("Unknown");
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "model.runtime_review_consumed")).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveValue("Generated exact-version review stays separate from the prompt.");
    expect(fixture.requests).toHaveLength(0);
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  } finally { await close(); }
});

test("the composer can inspect an unavailable unselected configured model without silently selecting it", async () => {
  const { fixture, model, app, close } = await desktopReadiness({ exposeModels: false, selectModel: false });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: /^Model:/ }).click();
    const control = page.getByRole("dialog", { name: "Model", exact: true });
    await control.getByText("Model details and setup", { exact: true }).click();
    const inspection = control.getByLabel("Inspect configured model without selecting it", { exact: true });
    await expect(inspection).toBeVisible();
    await inspection.selectOption(model.id);
    const readiness = control.getByRole("region", { name: "Execution-machine model readiness" });
    await readiness.getByText("Local runtime and hardware readiness", { exact: true }).click();
    await readiness.getByRole("button", { name: "Refresh readiness", exact: true }).click();
    await expect(readiness.getByRole("table", { name: "Current runtime and hardware observations" })).toBeVisible();
    expect(fixture.session().controls.modelId).toBeNull();
    expect(fixture.requests).toHaveLength(0);
  } finally { await close(); }
});
