import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { remoteFixture } from "../fixtures/remote-service.ts";
import { reviewNativeTools } from "../fixture.ts";
import { openSettingsSection } from "./navigation.ts";

const require = createRequire(import.meta.url);
const openApp = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native Remote MCP UI is qualified on macOS.");

test("desktop reviews an exact Remote grant, approves a provider-free SSH call and reads retained results after offline revocation", async () => {
  const f = await remoteFixture({ exposeModels: false }), sdk = await new MoguriSdk(f.service.connection).ready();
  let app: ElectronApplication | undefined;
  try {
    await reviewNativeTools(sdk, ["mcp_gateway"]);
    await f.probe(); await sdk.sessions.env(f.sessionId, "Remote");
    app = await openApp(f.directory);
    const page = await app.firstWindow(), failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "MCP gateway");
    const access = page.getByRole("region", { name: "Remote MCP access", exact: true });
    await expect(access).toBeVisible();
    await access.getByRole("button", { name: "Review Remote grant", exact: true }).click();
    await expect(access).toContainText(f.workspace);
    await expect(access).toContainText(`:${f.ssh.target.port}`);
    await expect(access.getByRole("button", { name: "Save exact Remote grant", exact: true })).toBeDisabled();
    await expect(access.getByLabel("Allow Remote MCP access forwarding", { exact: true })).toHaveCount(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-mcp-review-desktop.png") });
    await page.setViewportSize({ width: 900, height: 740 });
    await page.screenshot({ path: resolve(".moguri/artifacts/remote-mcp-review-compact.png") });
    expect(await access.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await access.getByLabel("Confirm exact Remote MCP review", { exact: true }).check();
    await access.getByRole("button", { name: "Save exact Remote grant", exact: true }).click();
    await expect(access.getByRole("status")).toContainText("Grant saved");
    expect(f.controller.snapshot().settings.values.remote?.mcpGrants?.[0]?.forwardAccess).toBe(false);
    await access.getByRole("button", { name: "Probe SSH target", exact: true }).click();
    await expect(access.getByRole("status")).toContainText("SSH readiness updated");
    await page.getByRole("button", { name: "Discover tools", exact: true }).click();
    await page.locator(".tool-discovery-row").filter({ hasText: "grep_logs" }).click();
    await page.getByLabel("Exact MCP JSON arguments", { exact: true }).fill(JSON.stringify({ path: "fixture.txt", query: "remote source" }));
    await page.getByRole("button", { name: "Request in main session with exact arguments", exact: true }).click();
    await expect.poll(async () => ({ approval: f.session().pendingApproval?.call.name, diagnostic: f.session().lastError,
      captures: f.controller.snapshot().checkpointCaptures.map((capture) => ({ phase: capture.phase, status: capture.status, diagnostic: capture.diagnostic })),
      alerts: await page.getByRole("alert").allTextContents() })).toMatchObject({ approval: "mcp_gateway" });
    expect(f.controller.snapshot().executions.length).toBe(0); expect(f.requests.length).toBe(0);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Approve this action", exact: true }).click();
    await expect.poll(() => f.controller.snapshot().remoteMcpCalls[0]?.status).toBe("completed");
    await expect.poll(() => f.session().status).toBe("completed");
    const call = f.controller.snapshot().remoteMcpCalls[0]!;
    expect(call.actor).toBe("external"); expect(f.session().controls.modelId).toBeNull(); expect(f.requests.length).toBe(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "MCP gateway");
    await access.getByText("Recorded Remote calls (1)", { exact: true }).click();
    await access.getByRole("button", { name: `Inspect MCP operation ${call.id}`, exact: true }).click();
    await expect(access.getByLabel("Remote MCP operation result", { exact: true })).toContainText("generated actual remote source");
    await f.ssh.close();
    await access.getByRole("button", { name: "Revoke Remote grant", exact: true }).click();
    await expect(access.getByRole("status")).toContainText("Remote grant revoked");
    expect(f.controller.snapshot().settings.values.remote?.mcpGrants).toEqual([]);
    await access.getByRole("button", { name: `Inspect MCP operation ${call.id}`, exact: true }).click();
    await expect(access.getByLabel("Remote MCP operation result", { exact: true })).toContainText(f.workspace);
    expect(failures).toEqual([]);
  } finally { await app?.close(); sdk.disconnect(); await f.close(); }
});

test("desktop cannot publish a stale Remote review or implicitly enable forwarding of an authenticated resource", async () => {
  let reads = 0;
  const f = await remoteFixture({ exposeModels: false, platform: { vault: { read: async () => { reads++; throw new Error("A review cannot read credentials."); }, write: async () => {}, remove: async () => {} } } });
  const sdk = await new MoguriSdk(f.service.connection).ready(), query = f.controller.platform.query.bind(f.controller.platform);
  let app: ElectronApplication | undefined, held = false, release = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  try {
    const settings = structuredClone(sdk.settings.get()!.values);
    settings.mcpServers = [{ id: "generated-ui-bearer", name: "Generated Remote bearer", enabled: true, transport: { type: "http", url: "https://generated.invalid/original-mcp", auth: "bearer" } }];
    await sdk.settings.update(settings, sdk.settings.get()!.revision); await f.probe(); await sdk.sessions.env(f.sessionId, "Remote");
    f.controller.platform.query = async (input) => {
      const result = await query(input);
      if (input.type === "mcp.remote.preview" && !held) { held = true; await barrier; }
      return result;
    };
    app = await openApp(f.directory);
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await openSettingsSection(page, "MCP gateway");
    await page.getByLabel("Server", { exact: true }).selectOption("generated-ui-bearer");
    const access = page.getByRole("region", { name: "Remote MCP access", exact: true });
    await access.getByRole("button", { name: "Review Remote grant", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    const changed = structuredClone(sdk.settings.get()!.values);
    changed.mcpServers[0]!.transport = { type: "http", url: "https://generated.invalid/current-mcp", auth: "bearer" };
    await sdk.settings.update(changed, sdk.settings.get()!.revision);
    await expect(page.getByLabel("Configured MCP servers", { exact: true })).toHaveValue(/current-mcp/);
    release();
    await expect(access.getByRole("alert")).toContainText("scope changed during review");
    await expect(access.getByRole("button", { name: "Save exact Remote grant", exact: true })).toHaveCount(0);
    await access.getByRole("button", { name: "Review Remote grant", exact: true }).click();
    await expect(access).toContainText("https://generated.invalid/current-mcp");
    await expect(access).not.toContainText("https://generated.invalid/original-mcp");
    await expect(access.getByLabel("Allow Remote MCP access forwarding", { exact: true })).not.toBeChecked();
    await expect(access).toContainText("long-lived bearer");
    await access.getByLabel("Confirm exact Remote MCP review", { exact: true }).check();
    await access.getByRole("button", { name: "Save exact Remote grant", exact: true }).click();
    await expect(access.getByRole("status")).toContainText("Grant saved");
    expect(f.controller.snapshot().settings.values.remote!.mcpGrants![0]!.forwardAccess).toBe(false);
    expect(reads).toBe(0); expect(f.requests.length).toBe(0); expect(f.controller.snapshot().remoteMcpCalls.length).toBe(0);
  } finally { release(); f.controller.platform.query = query; await app?.close(); sdk.disconnect(); await f.close(); }
});
