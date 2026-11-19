import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual hidden desktop qualification is macOS-only.");
const screenshots = process.env.MOGURI_SKILLS_CAPTURES;

test("Skills installs and toggles skills, lists toolsets and opens an editable script request; Artifacts lists project outputs with their chat", async () => {
  test.setTimeout(90_000);
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const projectId = f.session().projectId!, projectPath = f.service.controller.snapshot().projects.find((project) => project.id === projectId)!.path;
  const market = join(f.directory, "generated-market", "generated-tab-skill");
  await mkdir(market, { recursive: true });
  await writeFile(join(market, "SKILL.md"), "---\nname: generated-tab-skill\ndescription: Generated marketplace skill for the Skills tab\n---\nUse generated fixtures.\n");
  await mkdir(join(f.directory, "project", "dist"), { recursive: true });
  await writeFile(join(f.directory, "project", "dist", "Generated.dmg"), "generated dmg");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, evolution: { enabled: true },
    skillSources: [{ id: "generated-market", name: "Generated market", kind: "local", path: join(f.directory, "generated-market"), enabled: true }] }, settings.revision);
  await sdk.sessions.rename(f.sessionId, "Generated artifact chat");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.setViewportSize({ width: 1280, height: 860 });
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await resources.getByRole("button", { name: "Skills", exact: true }).click();
    const workspace = page.getByRole("region", { name: "Skills and tools", exact: true });
    await expect(workspace.getByRole("tab")).toHaveText(["Skills", "Marketplace", "Tools"]);
    await expect(workspace).toContainText("No skills installed yet");

    await workspace.getByRole("tab", { name: "Marketplace", exact: true }).click();
    await workspace.getByRole("combobox", { name: "Install skills into", exact: true }).selectOption({ label: "project" });
    await workspace.getByRole("button", { name: "Find skills", exact: true }).click();
    await workspace.getByRole("button", { name: "Install generated-tab-skill", exact: true }).click();
    await expect(workspace).toContainText("generated-tab-skill is installed in project and off");
    const installed = await waitFor(() => f.service.controller.snapshot().registry.find((entry) => entry.name === "generated-tab-skill"));
    expect([installed.projectId, installed.enabled]).toEqual([projectId, false]);
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-marketplace.png") });

    await workspace.getByRole("tab", { name: "Skills", exact: true }).click();
    await expect(workspace.getByRole("tab", { name: "Skills", exact: true })).toHaveAttribute("aria-selected", "true");
    await workspace.getByRole("switch", { name: "Enable skill generated-tab-skill", exact: true }).click();
    await waitFor(() => f.service.controller.snapshot().registry.find((entry) => entry.id === installed.id)?.enabled === true);
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-installed.png"), animations: "disabled" });

    await workspace.getByRole("tab", { name: "Tools", exact: true }).click();
    await expect(workspace.locator("details.toolset summary").first()).toContainText("Files");
    await expect(workspace).toContainText("Foundational scripts");
    await workspace.getByRole("textbox", { name: "Generated script name", exact: true }).fill("markdown_into_pdf");
    await workspace.getByRole("textbox", { name: "What the generated script should do", exact: true }).fill("turn a Markdown file into a PDF");
    if (screenshots) await page.screenshot({ path: join(screenshots, "skills-tools.png"), fullPage: true });
    const before = f.service.controller.snapshot().sessions.length, requests = f.requests.length;
    await workspace.getByRole("button", { name: "Open a chat with this request", exact: true }).click();
    const created = await waitFor(() => f.service.controller.snapshot().sessions.length > before ? f.service.controller.snapshot().sessions.find((session) => session.title === "Write the markdown_into_pdf tool") : undefined);
    expect(created.projectId).toBe(projectId);
    await waitFor(() => f.service.controller.snapshot().sessions.find((session) => session.id === created.id)?.draft.text.includes("propose_script"));
    await expect(page.locator(".app-shell")).toHaveAttribute("data-session-id", created.id);
    expect(f.requests.length).toBe(requests);

    await resources.getByRole("button", { name: "Artifacts", exact: true }).click();
    const library = page.getByRole("region", { name: "Artifacts library", exact: true });
    await library.getByRole("combobox", { name: "Artifacts project", exact: true }).selectOption(projectId);
    const item = library.locator(".artifact-item", { hasText: "Generated.dmg" });
    await expect(item).toContainText("dist/Generated.dmg");
    await library.getByRole("button", { name: /Builds and installers/ }).click();
    await expect(library.locator(".artifact-item")).toHaveCount(1);
    if (screenshots) await page.screenshot({ path: join(screenshots, "artifacts.png") });
    await item.getByRole("button", { name: "Show in Finder", exact: true }).click();
    await expect(library).toContainText(`Located ${join(projectPath, "dist", "Generated.dmg")}`);

    await resources.getByRole("button", { name: "Automations", exact: true }).click();
    await page.getByRole("switch", { name: "Check for repeated tasks automatically", exact: true }).click();
    await waitFor(() => f.service.controller.snapshot().settings.values.automations?.toolSuggestions?.enabled === true);
    if (screenshots) await page.screenshot({ path: join(screenshots, "automations.png") });
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
