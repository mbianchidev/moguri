import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);

test("the approval card names the action, lists exact arguments and keeps its actions visible", async () => {
  const fixture = await setupFixture({ toolCall: { name: "run_command", args: { command: "printf GENERATED_APPROVAL_CARD", timeoutMs: 2000 } } });
  await fixture.configure(); await fixture.send("Generated approval card layout.");
  await waitFor(() => fixture.session().pendingApproval);
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), approval = page.getByRole("region", { name: "Tool approval", exact: true });
    await expect(approval.locator(".approval-summary")).toContainText("Run command");
    await expect(approval.locator(".approval-subject")).toHaveText("printf GENERATED_APPROVAL_CARD");
    await expect(approval).toContainText("on your Mac without sandbox isolation");
    await expect(approval.locator(".approval-args dt")).toHaveText(["timeoutMs"]);
    await expect(approval.locator(".approval-raw pre")).toBeHidden();
    await approval.getByText("Raw JSON", { exact: true }).click();
    await expect(approval.locator(".approval-raw pre")).toContainText('"command": "printf GENERATED_APPROVAL_CARD"');
    const card = await approval.boundingBox(), approve = await approval.getByRole("button", { name: "Approve this action", exact: true }).boundingBox();
    const scope = await approval.getByLabel("Approval scope", { exact: true }).boundingBox();
    expect(card && approve && scope).toBeTruthy();
    expect(approve!.y + approve!.height).toBeLessThanOrEqual(card!.y + card!.height);
    expect(Math.abs(scope!.y + scope!.height / 2 - (approve!.y + approve!.height / 2))).toBeLessThan(8);
    await mkdir(".moguri/artifacts", { recursive: true }); await approval.screenshot({ path: ".moguri/artifacts/approval-card.png" });
    await approval.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect(approval).toHaveCount(0);
  } finally { await app.close(); await fixture.close(); }
});
