import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { roleSequenceFixture } from "../fixtures/role-sequence-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native retained-role inspection is qualified on macOS.");

test("desktop reads exact retained role data, preserves immutable input and edits metadata without dispatch", async () => {
  const f = await roleSequenceFixture(); f.start(0); f.result(0); f.start(1); f.result(1); f.complete();
  const original = f.current().inputDigest;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Artifacts");
    const panel = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await panel.getByLabel("Retained artifact", { exact: true }).selectOption(f.initial.id);
    await expect(panel.getByLabel("Artifact text", { exact: true })).toHaveAttribute("readonly", "");
    const roles = panel.getByRole("region", { name: "Retained role sequence", exact: true });
    await roles.getByLabel("Retained role index", { exact: true }).selectOption("1");
    await roles.getByRole("button", { name: "View role from original record", exact: true }).click();
    await expect(roles.getByLabel("Recorded role data", { exact: true })).toContainText("GENERATED_RETAINED_CRITIC_RESULT_NOT_CONTEXT");
    await expect(roles.getByLabel("Recorded role data", { exact: true })).toBeFocused();
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/retained-role-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await page.screenshot({ path: resolve(".moguri/artifacts/retained-role-compact.png") });
    await panel.getByLabel("Artifact name", { exact: true }).fill("Generated renamed role evidence");
    await panel.getByRole("button", { name: "Save artifact", exact: true }).click();
    await expect(panel).toContainText("Document saved");
    expect(f.current().inputDigest).toBe(original); expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("desktop cannot archive/delete an active retained role and observes partial explicit stop without inventing acknowledgement", async () => {
  const f = await roleSequenceFixture(); f.start(0);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Artifacts");
    const panel = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await panel.getByLabel("Retained artifact", { exact: true }).selectOption(f.initial.id);
    await expect(panel.getByRole("button", { name: "Archive artifact", exact: true })).toBeDisabled();
    await panel.getByText("Delete this document", { exact: true }).click();
    await expect(panel.getByRole("button", { name: "Delete artifact", exact: true })).toBeDisabled();
    await f.sdk.command({ type: "session.stop", sessionId: f.sessionId });
    await expect(panel.getByRole("region", { name: "Retained role sequence", exact: true })).toContainText("Sequence partial");
    await expect(panel.getByRole("button", { name: "Archive artifact", exact: true })).toBeEnabled();
    expect(f.current().stopRequested).toBe(true); expect(f.requests).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});
