import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk, PROTOCOL_VERSION } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { initializeGeneratedRepository } from "../fixtures/git-project.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Hidden Electron workflow acceptance uses the macOS runtime.");
test("desktop reviews knowledge promotion, actual hook approval, repository marketplace and explicit containment policy", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  const git = initializeGeneratedRepository(fixture.project);
  const manifest = { schemaVersion: 1, name: "generated-ui-bundle", version: "1.0.0", description: "Generated UI bundle", license: "MIT",
    minimumProtocol: PROTOCOL_VERSION, maximumProtocol: PROTOCOL_VERSION,
    skills: ["---\nname: generated-ui-style\ndescription: Generated reviewed style\n---\nUse generated fixture types."], scripts: [], hooks: [] };
  await writeFile(join(fixture.project, "moguri-marketplace.json"), JSON.stringify({ schemaVersion: 1, packages: [manifest] }));
  git(["add", "--", "moguri-marketplace.json"]);
  git(["-c", "user.name=Generated fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "Generated UI catalog"]);
  const commit = git(["rev-parse", "HEAD"]);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Settings categories" });
    await navigation.getByRole("button", { name: "Knowledge tiers", exact: true }).click();
    const knowledge = page.getByRole("region", { name: "Sky Terra Glacier knowledge", exact: true });
    await expect(knowledge).toContainText("Tiered context injection is off.");
    await knowledge.getByLabel("Knowledge title", { exact: true }).fill("Generated UI Sky");
    await knowledge.getByLabel("Knowledge text", { exact: true }).fill("Generated UI reviewed temporary knowledge with detail.");
    await knowledge.getByRole("button", { name: "Save knowledge", exact: true }).click();
    await expect(knowledge.getByRole("status")).toContainText("Exact note saved");
    const source = fixture.service.controller.snapshot().knowledge.find((record) => record.tier === "Sky")!;
    await knowledge.getByLabel("Promoted title", { exact: true }).fill("Generated UI Glacier");
    await knowledge.getByLabel("Reviewed compressed text", { exact: true }).fill("Generated UI reviewed knowledge.");
    const promote = knowledge.getByRole("button", { name: "Promote reviewed knowledge", exact: true });
    await expect(promote).toBeDisabled();
    await knowledge.getByLabel("I reviewed this exact source and summary.", { exact: false }).check();
    await promote.click();
    await expect(knowledge.getByRole("status")).toContainText("independent retention");
    await sdk.knowledge.forget(source.id, source.revision, true);
    const glacier = fixture.service.controller.snapshot().knowledge.find((record) => record.tier === "Glacier")!;
    expect((await sdk.knowledge.read(glacier.id)).text).toBe("Generated UI reviewed knowledge.");
    expect(fixture.requests.length).toBe(0);

    await navigation.getByRole("button", { name: "Lifecycle hooks", exact: true }).click();
    const hooks = page.getByRole("region", { name: "Reviewed lifecycle hooks", exact: true });
    await hooks.getByLabel("Hook definition JSON", { exact: true }).fill(JSON.stringify({ schemaVersion: 1, name: "generated-ui-hook", description: "Generated UI hook",
      trigger: "turn.start", command: "printf 'generated UI hook proof\\n'", timeoutMs: 2000 }));
    await hooks.getByLabel("I reviewed this exact command and trigger.", { exact: false }).check();
    await hooks.getByRole("button", { name: "Import reviewed hook", exact: true }).click();
    await hooks.getByRole("button", { name: "generated-ui-hook: disabled", exact: true }).click();
    const enable = hooks.getByRole("button", { name: "Enable reviewed capability", exact: true });
    await expect(enable).toBeDisabled();
    await hooks.getByLabel("I reviewed these exact bytes and their execution requirements.", { exact: true }).check();
    await enable.click();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("generated normal task");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toBeVisible();
    expect(fixture.requests.length).toBe(0);
    await page.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("completed");
    expect(fixture.requests.length).toBe(1);
    expect(JSON.stringify(fixture.requests)).not.toContain("generated UI hook proof");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await navigation.getByRole("button", { name: "Marketplace", exact: true }).click();
    const market = page.getByRole("region", { name: "Repository marketplace", exact: true });
    await market.getByLabel("Catalog commit SHA", { exact: true }).fill(commit);
    await market.getByRole("button", { name: "Read pinned catalog", exact: true }).click();
    await market.getByRole("button", { name: "generated-ui-bundle@1.0.0 (MIT): Generated UI bundle", exact: true }).click();
    await market.getByRole("button", { name: "Review pinned bundle", exact: true }).click();
    const install = market.getByRole("button", { name: "Install reviewed bundle", exact: true });
    await expect(install).toBeDisabled();
    await market.getByLabel("I reviewed the exact source, license, complete capabilities and commands.", { exact: false }).check();
    await install.click();
    await expect(market.getByRole("status")).toContainText("installed disabled");
    expect(fixture.service.controller.snapshot().registry.filter((entry) => entry.marketplace || entry.ownerPluginId).every((entry) => !entry.enabled)).toBe(true);

    await navigation.getByRole("button", { name: "Guardrails", exact: true }).click();
    await page.getByLabel("Global allowed environments", { exact: true }).selectOption("sandbox");
    await expect.poll(() => fixture.service.controller.snapshot().policy.allowedEnvs).toEqual(["Sandbox"]);
    expect(fixture.session().controls.env).toBe("Local");
    expect((await sdk.containment.status()).containment.qualifiedSandboxReady).toBe(false);
    expect(fixture.requests.length).toBe(1); expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
