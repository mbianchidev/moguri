import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { nativeGroupPublicationFixture, nativePublicationFixture } from "../fixtures/native-publication.ts";
import { nativeConfiguration } from "../fixtures/native-target.ts";
import { nativeApiFixture } from "../fixtures/native-api.ts";

const require = createRequire(import.meta.url), configuration = await nativeConfiguration();
test.skip(process.platform !== "darwin", "Hidden native desktop runs on qualified macOS.");
const launch = (state: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: state, MOGURI_TEST_WINDOW: "hidden" } });

test("retained native data is not readiness; desktop source publication needs exact separate user review", async () => {
  const fixture = await nativePublicationFixture(), app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Sandbox");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(fixture.sessionId);
    const panel = page.getByRole("region", { name: "Sandbox execution and reviewed publication", exact: true });
    await panel.getByText("Advanced: prepare from chosen files", { exact: true }).click();
    await expect(panel.getByRole("button", { name: "Use for session: reviewed Sandbox", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "Inspect retained result", exact: true }).click();
    await panel.getByText(`fixture.txt / ${fixture.result.files[0]!.bytes} bytes`, { exact: true }).click();
    const selected = panel.getByLabel("Select native output fixture.txt", { exact: true });
    await selected.focus(); await page.keyboard.press("Space"); await expect(selected).toBeChecked();
    await panel.getByRole("button", { name: "Review publication of selected source", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact native source publication", exact: true });
    const publish = review.getByRole("button", { name: "Publish reviewed native files", exact: true });
    await expect(publish).toBeDisabled();
    expect(await readFile(join(fixture.root, "fixture.txt"), "utf8")).toBe("generated original\n");
    const acceptance = review.getByLabel("I reviewed these changes and want them copied into my files.", { exact: false });
    await acceptance.focus(); await page.keyboard.press("Space"); await expect(publish).toBeEnabled();
    await publish.press("Enter");
    await expect.poll(() => fixture.service.controller.snapshot().sandboxPublications?.[0]?.status).toBe("completed");
    await expect(panel.getByRole("status").filter({ hasText: "Publication completed" })).toBeVisible();
    await expect(panel.getByRole("region", { name: "Exact native source publication", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("region", { name: "Native source publication outcome", exact: true })).toBeFocused();
    expect(await readFile(join(fixture.root, "fixture.txt"), "utf8")).toBe(fixture.result.files[0]!.text);
    expect(fixture.requests.length).toBe(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/native-publication-review.png") });
    expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("group result publication has no first repository and changing its explicit member revokes the old review", async () => {
  const fixture = await nativeGroupPublicationFixture(), app = await launch(join(fixture.directory, "state"));
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Sandbox");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(fixture.groupSessionId);
    const panel = page.getByRole("region", { name: "Sandbox execution and reviewed publication", exact: true });
    await expect(panel.getByRole("region", { name: "Original captured native repositories", exact: true })).toContainText(fixture.repositories[1]!.root.root);
    await panel.getByRole("button", { name: "Inspect retained result", exact: true }).click();
    const picker = panel.getByRole("combobox", { name: "Native publication repository", exact: true });
    await expect(picker).toHaveValue("");
    const first = fixture.repositories[0]!, second = fixture.repositories[1]!;
    const check = (directory: string) => panel.getByLabel(`Select native output ${directory}/fixture.txt`, { exact: true });
    for (const [index, repository] of fixture.repositories.entries()) {
      await panel.getByText(`${repository.name}/fixture.txt / ${fixture.result.files[index]!.bytes} bytes`, { exact: true }).click();
      await expect(check(repository.directory)).toBeDisabled();
    }
    await picker.selectOption(first.projectId); await expect(check(first.directory)).toBeEnabled(); await expect(check(second.directory)).toBeDisabled();
    await check(first.directory).check();
    await panel.getByRole("button", { name: "Review publication of selected source", exact: true }).click();
    const review = panel.getByRole("region", { name: "Exact native source publication", exact: true });
    await expect(review).toContainText(first.root.root);
    await picker.selectOption(second.projectId); await expect(review).toHaveCount(0); await expect(check(first.directory)).not.toBeChecked();
    await check(second.directory).check();
    await panel.getByRole("button", { name: "Review publication of selected source", exact: true }).click();
    await expect(review).toContainText(second.root.root);
    const publish = review.getByRole("button", { name: "Publish reviewed native files", exact: true });
    await expect(publish).toBeDisabled();
    await review.getByLabel("I reviewed these changes and want them copied into my files.", { exact: false }).check(); await publish.click();
    await expect.poll(() => fixture.service.controller.snapshot().sandboxPublications?.[0]?.status).toBe("completed");
    expect(await readFile(join(first.root.root, "fixture.txt"), "utf8")).toBe("generated original\n");
    expect(await readFile(join(second.root.root, "fixture.txt"), "utf8")).toBe(fixture.result.files[1]!.text);
    expect(fixture.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally { await app.close(); await fixture.close(); }
});

test("actual native desktop qualifies reviewed artifacts, stages exact source, approves guest tools and publishes only accepted outputs", async () => {
  test.skip(!configuration, "Explicit current native installation/workload receipts are required; no VM qualification is inferred.");
  test.setTimeout(90_000);
  if (!configuration) return;
  const fixture = await nativeApiFixture(configuration), { sdk, service, provider, project } = fixture;
  const bound = await sdk.command({ type: "project.add", path: project }), created = await sdk.sessions.create(bound.id!);
  const session = () => service.controller.snapshot().sessions.find((value) => value.id === created.id)!;
  await sdk.sessions.configure(created.id!, { ...session().controls, modelId: provider.modelId });
  const app = await launch(fixture.state);
  let passed = false;
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    const panel = page.getByRole("region", { name: "Sandbox execution and reviewed publication", exact: true });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Sandbox", exact: true }).click();
    await page.getByText("Advanced manual configuration", { exact: true }).click();
    await page.getByLabel("SendBox configuration", { exact: true }).fill(JSON.stringify(fixture.reviewedConfiguration));
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    const review = page.getByLabel("I reviewed the saved SendBox artifacts", { exact: false });
    await expect(review).toBeEnabled(); await review.check();
    await page.getByRole("button", { name: "Verify reviewed Sandbox", exact: true }).click();
    await expect(panel.getByRole("status").filter({ hasText: `Verified pinned SendBox ${configuration.qualification!.release}` })).toBeVisible();
    expect(provider.requests.length).toBe(0);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await page.getByRole("button", { name: "Execution environment", exact: true }).click();
    await page.getByRole("dialog", { name: "Execution environment", exact: true }).getByRole("button", { name: /^Sandbox Verified SendBox/ }).click();
    await expect.poll(() => session().controls.env).toBe("Sandbox");
    expect(session().controls.modelId).toBe(provider.modelId);
    const prompt = page.getByLabel("Prompt", { exact: true }); await prompt.fill("generated native write");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: /^Review a private native workspace before starting a turn/ }).click();
    await panel.getByText("Advanced: prepare from chosen files", { exact: true }).click();
    await panel.getByLabel("Native source paths", { exact: true }).fill("fixture.txt");
    await panel.getByRole("button", { name: "Preview native source", exact: true }).click();
    const source = panel.getByRole("region", { name: "Exact native source review", exact: true });
    await source.getByText(`fixture.txt / ${Buffer.byteLength("generated source original\n")} bytes`, { exact: true }).click();
    await expect(source.getByText("generated source original", { exact: true })).toBeVisible();
    await source.getByLabel("I reviewed these files and their contents.", { exact: true }).check();
    await source.getByRole("button", { name: "Prepare reviewed native stage", exact: true }).click();
    await expect.poll(() => session().sandboxWorkspaceId).toBeTruthy();
    await expect(panel.getByRole("status").filter({ hasText: "Workspace prepared." })).toBeVisible();
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await expect(prompt).toHaveValue("generated native write");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => session().status).toBe("completed");
    expect(session().pendingApproval).toBeNull();
    expect(await readFile(join(project, "fixture.txt"), "utf8")).toBe("generated source original\n");
    expect(session().usage.filter((usage) => usage.role === "solver").map((usage) => usage.totalTokens)).toEqual([42, 42, 42]);
    await expect.poll(() => session().usage.filter((usage) => usage.role === "title").map((usage) => usage.totalTokens)).toEqual([42]);
    expect(session().usage.map((usage) => usage.role)).toEqual(["solver", "solver", "solver", "title"]);
    await openSettingsSection(page, "Sandbox");
    await panel.getByRole("button", { name: "Inspect retained result", exact: true }).click();
    await panel.getByText(`fixture.txt / ${Buffer.byteLength("generated native replacement\n")} bytes`, { exact: true }).click();
    await panel.getByLabel("Select native output fixture.txt", { exact: true }).check();
    await panel.getByRole("button", { name: "Review publication of selected source", exact: true }).click();
    const publication = panel.getByRole("region", { name: "Exact native source publication", exact: true });
    await publication.getByLabel("I reviewed these changes and want them copied into my files.", { exact: false }).check();
    await publication.getByRole("button", { name: "Publish reviewed native files", exact: true }).click();
    await expect.poll(() => service.controller.snapshot().sandboxPublications?.[0]?.status).toBe("completed");
    expect(await readFile(join(project, "fixture.txt"), "utf8")).toBe("generated native replacement\n");
    expect(provider.requests.length).toBe(0);
    await mkdir(resolve(".moguri/artifacts"), { recursive: true });
    await page.screenshot({ path: resolve(".moguri/artifacts/native-desktop-execution.png") });
    expect(errors).toEqual([]); passed = true;
  } finally { await app.close(); await fixture.close(passed); }
});
