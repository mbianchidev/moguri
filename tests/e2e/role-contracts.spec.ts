import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { roleContractFixture } from "../fixtures/role-contract-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Owned role contract inspection is qualified on macOS.");

test("desktop inspects original selected-context contracts as data, never quality, permission or model acceptance", async () => {
  const f = await roleContractFixture(), created = await f.run(); await f.settled(created.id);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Artifacts");
    const panel = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await panel.getByLabel("Retained artifact", { exact: true }).selectOption(created.id);
    const roles = panel.getByRole("region", { name: "Retained role sequence", exact: true });
    await roles.getByLabel("Retained role index", { exact: true }).selectOption("2");
    await roles.getByRole("button", { name: "View contract for original role", exact: true }).click();
    const output = roles.getByLabel("Role contract evaluation", { exact: true });
    await expect(output).toContainText('"role.contract.read"'); await expect(output).toContainText('"verdict": "revise"');
    await expect(output).toContainText("not code quality"); await expect(output).toBeFocused();
    await expect(panel.getByLabel("Artifact text", { exact: true })).toHaveAttribute("readonly", "");
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/role-contract-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 }); await page.screenshot({ path: resolve(".moguri/artifacts/role-contract-compact.png") });
    await roles.getByLabel("Retained role index", { exact: true }).selectOption("1");
    await expect(output).toHaveCount(0);
    await roles.getByRole("button", { name: "View contract for original role", exact: true }).click();
    await expect(output).toContainText('"kind": "patch"');
    await expect(roles.getByRole("button", { name: "View contract for original role", exact: true })).toBeEnabled();
    expect(f.requests).toHaveLength(4); expect(f.control.snapshot().candidates).toHaveLength(0);
  } finally { await app.close(); await f.close(); }
});

test("a rejected critic remains inspectable with actual charged data and cannot look like a completed accepted workflow", async () => {
  const f = await roleContractFixture(); f.replies[2] = JSON.stringify({ ...f.critique, verdict: "reject" });
  const created = await f.run(); await f.settled(created.id);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await openSettingsSection(page, "Artifacts");
    const panel = page.getByRole("region", { name: "Retained artifacts", exact: true });
    await panel.getByLabel("Retained artifact", { exact: true }).selectOption(created.id);
    const roles = panel.getByRole("region", { name: "Retained role sequence", exact: true });
    await roles.getByLabel("Retained role index", { exact: true }).selectOption("2");
    await roles.getByRole("button", { name: "View contract for original role", exact: true }).click();
    await expect(roles.getByLabel("Role contract evaluation", { exact: true })).toContainText('"status": "rejected"');
    await expect(roles.getByLabel("Role contract evaluation", { exact: true })).toContainText("no continuation or user approval");
    await expect(roles.getByRole("button", { name: "View contract for original role", exact: true })).toBeEnabled();
    expect(f.current(created.id).status).not.toBe("completed"); expect(f.requests).toHaveLength(3);
  } finally { await app.close(); await f.close(); }
});
