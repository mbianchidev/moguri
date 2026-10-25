import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { openSettingsSection } from "./navigation.ts";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { MoguriClient } from "../../packages/client/src/index.ts";
import { startService } from "../../apps/service/src/server.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { dependencyArchive, dependencyProject } from "../fixtures/dependencies.ts";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const artifacts = resolve(".moguri/artifacts");
test.skip(process.platform !== "darwin", "Initial desktop checkpoint is validated on macOS.");
const launchFixtureApp = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});

test("local Kanban, read-only merge/Linear integration and the managed dependency cache share the SDK", async () => {
  let artifact: Awaited<ReturnType<typeof dependencyArchive>>;
  let downloads = 0;
  let key: string | null = null;
  const fixture = await setupFixture({ platform: {
    cache: { fetch: async (url) => {
      if (String(url).includes("api.osv.dev")) return Response.json({ results: [{}] });
      downloads++; return new Response(artifact.bytes);
    } },
    integrations: {
      vault: { read: async () => key, write: async (_, value) => { key = value; }, remove: async () => { key = null; } },
      fetch: async (url) => {
        if (String(url).startsWith("https://api.github.com/")) return Response.json({ number: 9, html_url: "https://github.com/generated/project/pull/9", state: "closed", draft: false, merged: true, merged_at: "2026-01-01T00:00:00Z" });
        return Response.json({ data: { team: { id: "generated-team", issues: { nodes: [{ id: "generated-linear-ui", identifier: "GEN-9", title: "Generated Linear UI ticket", description: "Generated fixture only", url: "https://linear.app/generated/issue/GEN-9", updatedAt: "2026-01-01T00:00:00Z" }], pageInfo: { hasNextPage: false, endCursor: null } } } } });
      },
    },
  } });
  artifact = await dependencyArchive(fixture.directory); await dependencyProject(fixture.project, artifact);
  const app = await launchFixtureApp(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow();
    const failures: string[] = []; page.on("pageerror", (error) => failures.push(error.message));
    await page.getByRole("button", { name: "Issues", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Project issues", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New issue", exact: true }).click();
    await page.getByLabel("Issue title", { exact: true }).fill("Generated cache feature");
    await page.getByLabel("Issue description", { exact: true }).fill("Generated end-to-end ticket.");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Issue title", { exact: true })).toHaveValue("Generated cache feature");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await page.getByRole("button", { name: "Save issue", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generated cache feature", exact: true })).toBeVisible();
    await page.getByLabel("Phase for issue 1", { exact: true }).selectOption("in-progress");
    await expect.poll(() => fixture.service.controller.snapshot().issues[0]?.phaseId).toBe("in-progress");
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await expect(page.getByLabel("Enable read-only Linear import for this project")).not.toBeChecked();
    await page.getByLabel("Phase name review", { exact: true }).fill("Validation");
    await page.getByLabel("Merged PR destination", { exact: true }).selectOption("review");
    await page.getByLabel("Linear team UUID", { exact: true }).fill("generated-team");
    await page.getByRole("button", { name: "Save board configuration", exact: true }).click();
    await page.getByRole("button", { name: "Save Linear team", exact: true }).click();
    await page.getByLabel("Enable read-only Linear import for this project").check();
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Linear workflows", exact: true }).click();
    await page.getByLabel("Linear personal API key", { exact: true }).fill("generated-linear-ui-key");
    await page.getByRole("button", { name: "Store Linear key in keychain", exact: true }).click();
    await expect(page.getByLabel("Linear personal API key", { exact: true })).toHaveValue("");
    await expect(page.locator(".settings-toolbar").getByRole("status")).toHaveText("Saved");
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Issues", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Validation", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Import Linear team issues", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generated Linear UI ticket", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generated cache feature", exact: true }).click();
    await page.getByLabel("Connected GitHub PR URL", { exact: true }).fill("https://github.com/generated/project/pull/9");
    await page.getByRole("button", { name: "Save issue", exact: true }).click();
    await expect(page.getByLabel("Phase for issue 1", { exact: true })).toHaveValue("review");
    await expect(page.getByRole("region", { name: "Validation issues" })).toContainText("Generated cache feature");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "desktop-project-issues.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1000, 760));
    await page.screenshot({ path: join(artifacts, "desktop-project-issues-compact.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Dependency cache", exact: true }).click();
    await page.getByRole("button", { name: "Inspect current lock", exact: true }).click();
    const prepare = page.getByRole("button", { name: "Prepare verified cache", exact: true });
    await expect(prepare).toBeDisabled();
    await page.getByLabel("I approve sending these exact dependency names and versions to OSV or the explicitly reviewed private advisory destinations above.", { exact: true }).check();
    await prepare.click();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.some((job) => job.kind === "cache.prepare" && job.status === "completed")).toBe(true);
    await page.getByLabel("I approve replacing root/member node_modules with a managed, script-free workspace install.", { exact: true }).check();
    await page.getByRole("button", { name: "Install with scripts blocked", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.some((job) => job.kind === "cache.install" && job.status === "completed")).toBe(true);
    expect(downloads).toBe(1);
    expect(existsSync(join(fixture.project, "node_modules", artifact.name, "UNSAFE_SCRIPT_RAN"))).toBe(false);
    await page.screenshot({ path: join(artifacts, "desktop-dependency-cache.png") });
    expect(JSON.stringify(fixture.service.controller.events(0)).includes("generated-linear-ui-key")).toBe(false);
    expect(fixture.requests.length).toBe(0); expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("Copilot onboarding, streamed tool work, cross-client drafts, cancellation and restart", async () => {
  const packaged = process.env.MOGURI_TEST_APP;
  const packagedRoot = packaged ? resolve(packaged, "../../Resources/app") : undefined;
  const fixture = await setupFixture({ workerPath: packagedRoot ? join(packagedRoot, "dist", "worker.mjs") : undefined });
  await fixture.provider.logout();
  let app: ElectronApplication | undefined, restarted: Awaited<ReturnType<typeof startService>> | undefined;
  const other = new MoguriClient(fixture.service.connection);
  const launch = () => launchFixtureApp(join(fixture.directory, "state"));
  try {
    await mkdir(artifacts, { recursive: true });
    app = await launch();
    let page = await app.firstWindow();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await expect(page.getByRole("heading", { name: "New session", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Model:/ })).toContainText("Select model");
    await openSettingsSection(page, "Providers");
    await page.getByRole("button", { name: "Sign in with GitHub Copilot", exact: true }).click();
    await expect(page.getByLabel("GitHub device code")).toHaveText("TEST-0000");
    await expect(page.getByRole("button", { name: "Open GitHub", exact: true })).toBeVisible();
    fixture.provider.authorize();
    await expect(page.getByText("Connected through your Copilot account.")).toBeVisible();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: /^Model:/ }).click();
    await page.getByRole("dialog", { name: "Model", exact: true }).getByRole("button", { name: /Generated Copilot model/ }).click();
    await expect.poll(() => fixture.session().controls.modelId).toBe(fixture.modelId);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    await page.getByLabel("Prompt", { exact: true }).fill("generated tool task");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("region", { name: "Tool approval" })).toBeVisible();
    await page.getByRole("button", { name: "Approve this action" }).click();
    await expect(page.getByText("Generated Copilot response. The requested fixture operation is complete.")).toBeVisible();
    await expect.poll(() => fixture.session().status).toBe("completed");

    await other.connect();
    await waitFor(() => other.getState().status === "connected");
    await other.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: fixture.session().draft.revision, text: "generated shared draft", attachments: [] });
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("generated shared draft");
    await page.getByLabel("Prompt", { exact: true }).fill("generated slow task");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Generated work in progress.")).toBeVisible();
    await page.getByRole("button", { name: "Stop turn", exact: true }).click();
    await expect.poll(() => fixture.session().status).toBe("stopped");
    await expect(page.getByRole("log", { name: "Session transcript", exact: true }).getByText("Turn stopped. No automatic retry will run.")).toBeVisible();
    await page.getByRole("button", { name: "Insights", exact: true }).click();
    await page.getByRole("button", { name: "Show recent event trace" }).click();
    await expect(page.getByText("Active-generation throughput is not measured", { exact: false })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "desktop-session.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 760));
    await page.getByRole("button", { name: "Hide session sidebar", exact: true }).click();
    await page.screenshot({ path: join(artifacts, "desktop-compact.png") });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await page.getByLabel("Prompt", { exact: true }).fill("generated restart-safe draft");
    await expect.poll(() => fixture.session().draft.text).toBe("generated restart-safe draft");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close();
    app = undefined; other.disconnect();
    restarted = await startService({ stateDir: join(fixture.directory, "state"), provider: fixture.provider, retentionKey: fixture.retentionKey,
      workerPath: packagedRoot ? join(packagedRoot, "dist", "worker.mjs") : undefined, platform: { terminal: { vault: fixture.terminalVault } } });
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("generated restart-safe draft");
    await fixture.provider.logout();
    await expect(page.getByRole("button", { name: /^Model:/ })).toContainText(fixture.modelId);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByText(`Saved model ${fixture.modelId} is unavailable. Reconnect or explicitly choose another model.`)).toBeVisible();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("generated restart-safe draft");
    expect(fixture.requests.length).toBe(3);
    expect(failures).toEqual([]);
    const database = await readFile(join(fixture.directory, "state", "state.sqlite"));
    expect(database.includes(Buffer.from("generated-test-only"))).toBe(false);
  } finally { other.disconnect(); await app?.close(); await restarted?.close(); await fixture.close(); }
});

test("dark mascot branding and shared SDK settings expose prompt, memory, permissions, MCP and optional capabilities", async () => {
  const fixture = await setupFixture();
  const app = await launchFixtureApp(join(fixture.directory, "state"));
  try {
    await writeFile(join(fixture.project, "generated.ts"), "export function sharedSdkKnowledge() { return 'generated'; }");
    const page = await app.firstWindow();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".brand-mascot")).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "System prompt", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System prompt", exact: true })).toBeVisible();
    const prompt = page.getByLabel("Editable system prompt", { exact: true });
    await expect(prompt).toHaveValue(fixture.service.controller.snapshot().settings.defaults.systemPrompt);
    await prompt.fill("Generated user-edited instructions. Never invent results.");
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Insights", exact: true }).click();
    await expect(prompt).toHaveValue("Generated user-edited instructions. Never invent results.");
    await expect(page.getByRole("alert")).toContainText("Your edit is preserved");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
    await page.getByLabel("I understand this can break functionality. Hard permissions cannot be overridden.").check();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.systemPrompt).toBe("Generated user-edited instructions. Never invent results.");
    await page.getByRole("button", { name: "View effective committed prompt" }).click();
    await expect(page.locator(".settings-content pre").last()).toContainText("moguri-execution-contract");
    await page.getByRole("button", { name: "Restore default system prompt" }).click();
    await expect(prompt).toHaveValue(fixture.service.controller.snapshot().settings.defaults.systemPrompt);
    await expect(page.getByText("Generated user-edited instructions. Never invent results.", { exact: true })).toHaveCount(0);
    const categories = page.getByRole("navigation", { name: "Settings categories" });
    await categories.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await categories.getByRole("button", { name: "Guardrails", exact: true }).click();
    const permission = { tools: [{ id: "generated-ui-deny", tool: "write_file", decision: "deny", pathPrefix: "" }], commands: [] };
    await page.getByLabel("Tool and exact-command permissions", { exact: true }).fill(JSON.stringify(permission));
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(async () => JSON.parse(await page.getByLabel("Tool and exact-command permissions", { exact: true }).inputValue())).toEqual(permission);
    await categories.getByRole("button", { name: "Repository memory", exact: true }).click();
    await page.getByLabel("Enable explicit repository indexing and retrieval").check();
    await expect.poll(() => fixture.service.controller.snapshot().settings.values.memory.enabled).toBe(true);
    await page.getByRole("button", { name: "Index Local repository", exact: true }).click();
    await expect.poll(() => fixture.service.controller.snapshot().jobs.some((job) => job.kind === "memory.index" && job.status === "completed")).toBe(true);
    await page.getByLabel("Search repository memory", { exact: true }).fill("shared sdk knowledge");
    await page.getByRole("button", { name: "Search vectors", exact: true }).click();
    await expect(page.locator(".settings-result pre")).toContainText("generated.ts");
    await categories.getByRole("button", { name: "MCP gateway", exact: true }).click();
    await page.getByRole("button", { name: "Discover tools", exact: true }).click();
    await expect(page.getByRole("button", { name: /^grep_logs/ })).toBeVisible();
    await categories.getByRole("button", { name: "Subagents", exact: true }).click();
    await expect(page.getByLabel("Enable optional read-only subagents")).not.toBeChecked();
    await categories.getByRole("button", { name: "Skill gateway", exact: true }).click();
    await expect(page.getByLabel("Allow model-proposed skills, scripts and style knowledge for human review")).not.toBeChecked();
    await categories.getByRole("button", { name: "Voice dictation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download model once", exact: true })).toBeDisabled();
    await expect(page.getByText("NVIDIA documents 40 locales:", { exact: false })).toBeVisible();
    await categories.getByRole("button", { name: "System prompt", exact: true }).click();
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "desktop-sdk-settings.png") });
    expect(fixture.requests.length).toBe(0);
    expect(failures).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});
