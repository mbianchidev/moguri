import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { roleProposalFixture } from "../fixtures/role-proposal-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native role proposals are qualified on macOS.");

test("desktop loads exact final-role provenance without overwriting a summary and separately reviews staging and source application", async () => {
  const f = await roleProposalFixture(), index = await readFile(join(f.project, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByText("Load a retained role proposal", { exact: true }).click();
    await panel.getByLabel("Retained role proposal", { exact: true }).selectOption(f.sequence.id);
    const load = panel.getByRole("button", { name: "Load for review final-role proposal", exact: true });
    await expect(load).toBeEnabled(); expect(f.requests).toHaveLength(3);
    await panel.getByLabel("Candidate summary", { exact: true }).fill("Generated unsaved summary must survive.");
    await expect(load).toBeDisabled(); await expect(panel.getByLabel("Candidate summary", { exact: true })).toHaveValue("Generated unsaved summary must survive.");
    await panel.getByRole("button", { name: "Discard local proposal", exact: true }).click();
    await expect(load).toBeEnabled();
    await panel.getByText("Load a retained role proposal", { exact: true }).scrollIntoViewIfNeeded();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/role-proposal-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await page.screenshot({ path: resolve(".moguri/artifacts/role-proposal-compact.png") });
    await load.click(); await expect(panel.getByLabel("Proposed file text", { exact: true })).toHaveValue(f.patch.edits[0]!.text);
    await expect(panel.getByLabel("Proposed file text", { exact: true })).toBeFocused();
    await panel.getByRole("button", { name: "Review staging", exact: true }).click();
    await panel.getByRole("button", { name: "Stage reviewed proposal", exact: true }).click();
    await expect.poll(() => f.control.snapshot().candidates[0]?.status).toBe("staged");
    expect(f.control.snapshot().candidates[0]?.roleOrigin?.sequenceId).toBe(f.sequence.id);
    expect(f.control.snapshot().candidates[0]?.acceptance).toBe(null);
    await expect(panel.getByLabel("Candidate summary", { exact: true })).toHaveValue("Review repository changes");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe("generated original\n");
    await panel.getByRole("button", { name: "Review application to original source", exact: true }).click();
    await panel.getByRole("button", { name: "Apply reviewed files", exact: true }).click();
    await expect.poll(() => f.control.snapshot().candidates[0]?.status).toBe("applied");
    expect(f.control.snapshot().candidates[0]?.acceptance?.actor).toBe("user");
    expect(await readFile(join(f.project, "fixture.txt"), "utf8")).toBe(f.patch.edits[0]!.text);
    expect(await readFile(join(f.project, ".git/index"))).toEqual(index); expect(f.requests).toHaveLength(3); expect(errors).toEqual([]);
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  } finally {
    const page = app.windows()[0], discard = page?.getByRole("button", { name: "Discard local proposal", exact: true });
    if (discard && await discard.isVisible() && await discard.isEnabled()) await discard.click();
    await app.close(); await f.close();
  }
});

test("a held final-role read cannot populate a changed read-only scope or overwrite a summary-only draft", async () => {
  const f = await roleProposalFixture(), gate = Promise.withResolvers<void>(); let held = false;
  const original = f.control.platform.query.bind(f.control.platform);
  f.control.platform.query = async (...args) => {
    const value = await original(...args);
    if (args[0].type === "candidate.role.proposal" && !held) { held = true; await gate.promise; }
    return value;
  };
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const panel = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await panel.getByText("Load a retained role proposal", { exact: true }).click();
    await panel.getByLabel("Retained role proposal", { exact: true }).selectOption(f.sequence.id); await expect.poll(() => held).toBe(true);
    await panel.getByLabel("Candidate summary", { exact: true }).fill("Generated preserved summary-only draft.");
    await f.sdk.sessions.mode(f.sessionId, "read-only"); gate.resolve();
    await expect(panel.getByLabel("Candidate summary", { exact: true })).toHaveValue("Generated preserved summary-only draft.");
    await expect(panel.getByRole("button", { name: "Load for review final-role proposal", exact: true })).toBeDisabled();
    expect(f.control.snapshot().candidates).toHaveLength(0); expect(f.requests).toHaveLength(3);
    await panel.getByRole("button", { name: "Discard local proposal", exact: true }).click();
    await expect.poll(() => page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  } finally { gate.resolve(); f.control.platform.query = original; await app.close(); await f.close(); }
});
