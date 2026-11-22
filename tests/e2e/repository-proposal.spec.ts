import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Home-backed native chat execution is qualified on macOS.");
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
const respond = (request: Record<string, unknown>) => {
  const messages = request.messages as Record<string, unknown>[], user = messages.findLastIndex((message) => message.role === "user");
  return messages.slice(user + 1).some((message) => message.role === "tool") ? { text: "Generated repository write complete." } :
    { tool: { name: "write_file", args: { path: "code/generated-repo/src/main.ts", text: "export const generated = true;\n", expectedDigest: "absent" } } };
};
async function proposingChat(title: string) {
  const fixture = await setupFixture({ respond }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const repo = join(fixture.home, "code", "generated-repo");
  await mkdir(join(repo, "src"), { recursive: true }); execFileSync("git", ["init", "-q", repo]);
  const created = await sdk.sessions.create(null, title, { modelId: fixture.modelId });
  await sdk.sessions.autonomy(created.id!, "Autopilot");
  const draft = sdk.sessions.get(created.id!)!.draft;
  await sdk.command({ type: "draft.save", sessionId: created.id!, expectedRevision: draft.revision, text: "Generated repository write.", attachments: [] });
  await sdk.command({ type: "message.send", sessionId: created.id!, expectedRevision: draft.revision + 1, delivery: "queue" });
  await waitFor(() => sdk.sessions.get(created.id!)?.repositoryProposal?.status === "pending" && !sdk.sessions.get(created.id!)?.turnId);
  return { fixture, sdk, id: created.id!, repo: await realpath(repo) };
}

test("a chat that wrote code in an unimported repository asks before importing, then moves under the new project and remembers the choice", async () => {
  const { fixture, sdk, id, repo } = await proposingChat("Generated repository chat");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), rail = page.getByRole("navigation", { name: "Sidebar panels", exact: true });
    await page.locator(".session-link").filter({ hasText: "Generated repository chat" }).click();
    const card = page.getByRole("region", { name: "Move chat to repository", exact: true });
    await expect(card).toContainText(repo);
    await expect.poll(() => rail.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(["Terminal", "Browser", "Insights", "Plan", "Side chat"]);
    expect(sdk.sessions.get(id)!.projectId).toBeNull();
    const requests = fixture.requests.length;
    await card.getByRole("checkbox", { name: /Do not ask again/ }).check();
    await page.screenshot({ path: test.info().outputPath("repository-proposal.png") });
    await card.getByRole("button", { name: "Import and move", exact: true }).click();
    const project = await waitFor(() => sdk.getState().snapshot!.projects.find((value) => value.path === repo));
    await expect.poll(() => sdk.sessions.get(id)?.projectId).toBe(project.id);
    expect(sdk.sessions.get(id)!.homeRoot).toBeUndefined();
    expect(sdk.settings.get()!.values.interactions.confirmRepositoryImport).toBe(false);
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("region", { name: `Project ${project.name}`, exact: true }).getByRole("button", { name: "Generated repository chat", exact: true })).toBeVisible();
    await expect(rail.getByRole("button", { name: "Code change", exact: true })).toBeVisible();
    expect(fixture.requests).toHaveLength(requests);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Not now keeps the chat in Home without importing the observed repository", async () => {
  const { fixture, sdk, id, repo } = await proposingChat("Generated declined repository chat");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await page.locator(".session-link").filter({ hasText: "Generated declined repository chat" }).click();
    const card = page.getByRole("region", { name: "Move chat to repository", exact: true });
    await card.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(() => sdk.sessions.get(id)?.repositoryProposal?.status).toBe("dismissed");
    expect(sdk.sessions.get(id)!.projectId).toBeNull();
    expect(sdk.getState().snapshot!.projects.some((project) => project.path === repo)).toBe(false);
    expect(sdk.settings.get()!.values.interactions.confirmRepositoryImport).toBeUndefined();
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
