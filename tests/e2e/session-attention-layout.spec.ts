import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native attention-row layout qualification is macOS-only.");

async function compact(link: Locator, label: string) {
  const dot = await link.locator(".session-status-dot").boundingBox();
  const marker = await link.getByRole("img", { name: label, exact: true }).boundingBox();
  const title = await link.locator(".session-link-text > span").boundingBox();
  const caption = await link.getByText("Needs attention", { exact: true }).boundingBox();
  const row = await link.boundingBox();
  expect(dot).not.toBeNull(); expect(marker).not.toBeNull(); expect(title).not.toBeNull(); expect(caption).not.toBeNull();
  expect(dot!.width).toBe(6); expect(dot!.height).toBe(6);
  expect(marker!.width).toBe(15); expect(marker!.height).toBe(15);
  expect(title!.width).toBeGreaterThan(48); expect(title!.height).toBeLessThanOrEqual(18);
  expect(caption!.height).toBeLessThanOrEqual(15); expect(row!.height).toBeLessThanOrEqual(64);
}

for (const kind of ["approval", "question"] as const) test(`${kind} stays a small dot and glyph with a readable title in narrow, selected and unselected session rows`, async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const name = `Generated ${kind} session with a long title`, label = kind === "approval" ? "Permission or approval needed" : "Question needs your answer";
  await sdk.sessions.organize(fixture.sessionId, { title: name });
  await fixture.configure(); await fixture.send(kind === "approval" ? "generated forbidden write" : "generated structured question choices only");
  await waitFor(() => kind === "approval" ? fixture.session().pendingApproval : fixture.session().pendingQuestionId);
  const other = await sdk.sessions.create(fixture.session().projectId, "Generated separate session");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
    args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const link = navigation.getByRole("button", { name, exact: true });
    await link.click();
    await expect(link.getByRole("img", { name: label, exact: true })).toBeVisible();
    await compact(link, label);
    if (kind === "approval") {
      await expect(page.getByRole("region", { name: "Tool approval", exact: true })).toHaveCSS("padding-top", "14px");
      await mkdir(".moguri/artifacts", { recursive: true });
      await page.screenshot({ path: ".moguri/artifacts/desktop-session-attention.png", animations: "disabled" });
    }
    const resizer = page.getByRole("separator", { name: "Resize projects sidebar", exact: true });
    await resizer.focus(); await page.keyboard.press("Home");
    await expect(resizer).toHaveAttribute("aria-valuenow", "180");
    await compact(link, label);
    await navigation.getByRole("button", { name: "Generated separate session", exact: true }).click();
    await compact(link, label);
    expect(fixture.session().status).toBe("waiting_input");
    expect(kind === "approval" ? fixture.session().pendingApproval : fixture.session().pendingQuestionId).not.toBeNull();
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === other.id)?.turnId).toBeNull();
    expect(fixture.requests).toHaveLength(1);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
