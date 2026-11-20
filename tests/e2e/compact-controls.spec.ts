import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Compact controls use generated hidden macOS windows.");

test("MCP retains its accessible X and Linear uses a concise Remove action, each clearing only its original generated backend", async () => {
  const mcp = new Map<string, string>(), linear = new Map<string, string>();
  const vault = (values: Map<string, string>) => ({ read: async (id: string) => values.get(id) ?? null,
    write: async (id: string, value: string) => { values.set(id, value); }, remove: async (id: string) => { values.delete(id); } });
  const fixture = await setupFixture({ platform: { vault: vault(mcp), integrations: { vault: vault(linear) } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, mcpServers: [{ id: "generated-compact-server", name: "Generated compact server", enabled: true,
    transport: { type: "http", url: "https://generated.invalid/mcp", auth: "bearer" } }] }, settings.revision);
  await sdk.mcp.setToken("generated-compact-server", "generated-mcp-test-key");
  await sdk.linear.setToken("generated-linear-test-key");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "MCP gateway");
    await page.getByLabel("Server", { exact: true }).selectOption("generated-compact-server");
    const removeMcp = page.getByRole("button", { name: "Remove credential", exact: true });
    await expect(removeMcp).toHaveText(""); await expect(removeMcp.locator("svg[data-icon='Close']")).toBeVisible();
    await removeMcp.hover(); await expect(page.getByRole("tooltip")).toHaveText("Remove credential");
    await removeMcp.click(); await expect.poll(() => mcp.size).toBe(0);
    expect(linear.size).toBe(1);
    await openSettingsSection(page, "Linear");
    const connection = page.getByRole("region", { name: "Linear integration connection", exact: true });
    const removeLinear = connection.getByRole("button", { name: "Remove Linear key", exact: true });
    await expect(removeLinear).toHaveText("Remove");
    await removeLinear.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => linear.size).toBe(0);
    await expect(connection).toContainText("API key removed.");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("the session USD X edits only that draft limit and still requires the original accounting acknowledgement before save", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await fixture.configure();
  await sdk.sessions.configure(fixture.sessionId, { ...fixture.session().controls, budget: { kind: "limited", basis: "estimate", tokens: 10000, usd: 1 } }, fixture.session().revision);
  await sdk.budgets.policy({ basis: "estimate", tokens: 100000 }, 0, true);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Budget and usage", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Budget and usage", exact: true });
    await menu.getByRole("button", { name: "View usage and limits...", exact: true }).click();
    const controls = menu.getByRole("region", { name: "Session budget controls", exact: true });
    const remove = controls.getByRole("button", { name: "Remove session USD limit", exact: true });
    await expect(remove).toHaveText(""); await expect(remove.locator("svg[data-icon='Close']")).toBeVisible();
    await remove.click();
    await expect(controls.getByLabel("session USD cap", { exact: true })).toHaveValue("");
    await expect(controls.getByRole("button", { name: "Save session budget", exact: true })).toBeDisabled();
    expect(fixture.session().controls.budget).toMatchObject({ usd: 1, tokens: 10000 });
    const acknowledgement = controls.getByRole("checkbox", { name: "I understand costs are estimates and a cap can stop a chat mid-task.", exact: true });
    await acknowledgement.check(); await controls.getByRole("button", { name: "Save session budget", exact: true }).click();
    await expect(controls).toContainText("Session budget saved.");
    expect(fixture.session().controls.budget).toEqual({ kind: "limited", basis: "estimate", tokens: 10000 });
    expect(sdk.getState().snapshot?.budgetPolicy.limit?.tokens).toBe(100000);
    expect(fixture.requests).toHaveLength(0);
    await page.keyboard.press("Escape");
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
