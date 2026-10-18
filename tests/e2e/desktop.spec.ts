import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { MoguriClient } from "../../packages/client/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const artifacts = resolve(".moguri/artifacts");
test.skip(process.platform !== "darwin", "Initial desktop checkpoint is validated on macOS.");

test("Copilot onboarding, streamed tool work, cross-client drafts, cancellation and restart", async () => {
  const packaged = process.env.MOGURI_TEST_APP;
  const packagedRoot = packaged ? resolve(packaged, "../../Resources/app") : undefined;
  const fixture = await setupFixture({ workerPath: packagedRoot ? join(packagedRoot, "dist", "worker.mjs") : undefined });
  await fixture.provider.logout();
  let app: ElectronApplication | undefined;
  const other = new MoguriClient(fixture.service.connection);
  const launch = async () => electron.launch({
    executablePath: packaged ?? require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  try {
    await mkdir(artifacts, { recursive: true });
    app = await launch();
    let page = await app.firstWindow();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await expect(page.getByRole("heading", { name: "New session", exact: true })).toBeVisible();
    await expect(page.getByLabel("Model", { exact: true })).toBeDisabled();
    await page.getByRole("button", { name: /GitHub Copilot.*disconnected/ }).click();
    await page.getByRole("button", { name: "Sign in with GitHub Copilot", exact: true }).click();
    await expect(page.getByLabel("GitHub device code")).toHaveText("TEST-0000");
    await expect(page.getByRole("button", { name: "Open GitHub", exact: true })).toBeVisible();
    fixture.provider.authorize();
    await expect(page.getByText("Connected through your Copilot account.")).toBeVisible();
    await page.getByLabel("Model", { exact: true }).selectOption(fixture.modelId);
    await expect.poll(() => fixture.session().controls.modelId).toBe(fixture.modelId);
    await page.getByRole("button", { name: "Close sidebar", exact: true }).click();
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
    await expect(page.getByText("Turn stopped. No automatic retry will run.")).toBeVisible();
    await page.getByRole("button", { name: "Insights", exact: true }).click();
    await page.getByRole("button", { name: "Show recent event trace" }).click();
    await expect(page.getByText("Active-generation throughput is not measured", { exact: false })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "desktop-session.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 760));
    await page.getByRole("button", { name: "Close sidebar", exact: true }).click();
    await page.screenshot({ path: join(artifacts, "desktop-compact.png") });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await page.getByLabel("Prompt", { exact: true }).fill("generated restart-safe draft");
    await expect.poll(() => fixture.session().draft.text).toBe("generated restart-safe draft");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("generated restart-safe draft");
    await fixture.provider.logout();
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue(fixture.modelId);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByText(`Saved model ${fixture.modelId} is unavailable. Reconnect or explicitly choose another model.`)).toBeVisible();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue("generated restart-safe draft");
    expect(fixture.requests.length).toBe(3);
    expect(failures).toEqual([]);
    const database = await readFile(join(fixture.directory, "state", "state.sqlite"));
    expect(database.includes(Buffer.from("generated-test-only"))).toBe(false);
  } finally { other.disconnect(); await app?.close(); await fixture.close(); }
});
