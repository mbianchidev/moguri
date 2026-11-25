import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { isRecord, MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
test.skip(process.platform !== "darwin", "Native unread-session presentation qualification is macOS-only.");

test("manual unread uses modest title weight without extra row dots and remains independent of notification preferences", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated unread session" });
  await sdk.sessions.create(fixture.session().projectId, "Generated read session");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const unread = navigation.getByRole("button", { name: "Generated unread session", exact: true });
    const read = navigation.getByRole("button", { name: "Generated read session", exact: true });
    await read.click();
    const title = unread.locator(".session-link-text > span"), family = await title.evaluate((node) => getComputedStyle(node).fontFamily);
    await expect(title).toHaveCSS("font-weight", "400");
    await unread.click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Mark unread", exact: true }).click();
    await expect.poll(() => fixture.session().unread).toBe(true);
    await expect(title).toHaveCSS("font-weight", "550");
    await expect(unread).toHaveAttribute("aria-description", /^Unread\./);
    await expect(unread.locator(".unread-dot, .attention-unread-dot")).toHaveCount(0);
    await expect(title).toHaveCSS("font-family", family); await expect(read.locator(".session-link-text > span")).toHaveCSS("font-weight", "400");
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, notifications: { ...settings.values.notifications, inApp: false } }, settings.revision);
    await expect(title).toHaveCSS("font-weight", "550");
    await unread.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Mark read", exact: true }).click();
    await expect.poll(() => fixture.session().unread).toBe(false);
    await expect(title).toHaveCSS("font-weight", "400");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("unseen completion becomes bolder, reading it clears the emphasis and real questions keep their yellow status", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated background session" });
  await sdk.sessions.create(fixture.session().projectId, "Generated current session"); await fixture.configure();
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    await navigation.getByRole("button", { name: "Generated current session", exact: true }).click();
    const background = navigation.getByRole("button", { name: "Generated background session", exact: true }), title = background.locator(".session-link-text > span");
    await fixture.send("Generated background response."); await fixture.terminal();
    await waitFor(() => sdk.getState().snapshot!.attention.some((entry) => entry.sessionId === fixture.sessionId && entry.active && !entry.acknowledged));
    await expect(title).toHaveCSS("font-weight", "550"); await expect(background.locator(".unread-dot, .attention-unread-dot")).toHaveCount(0);
    await expect(background.getByRole("img", { name: "Session completed", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Inbox", exact: true }).locator(".attention-unread-dot")).toBeVisible();
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/desktop-session-unread.png", animations: "disabled" });
    await background.click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Mark read", exact: true }).click();
    await expect(title).toHaveCSS("font-weight", "400");
    expect(fixture.session().status).toBe("completed");
    await fixture.send("generated structured question choices only");
    const question = await waitFor(() => fixture.session().pendingQuestionId);
    await expect(title).toHaveCSS("font-weight", "550");
    const marker = background.getByRole("img", { name: "Question needs your answer", exact: true });
    await expect(marker).toBeVisible();
    await background.click();
    await expect(title).toHaveCSS("font-weight", "400"); await expect(marker).toBeVisible();
    expect(fixture.session().pendingQuestionId).toBe(question); expect(fixture.session().status).toBe("waiting_input");
    await expect(background.locator(".unread-dot, .attention-unread-dot")).toHaveCount(0);
    await page.screenshot({ path: ".moguri/artifacts/desktop-session-read-question.png", animations: "disabled" });
    expect(fixture.requests).toHaveLength(2);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a held Mark read cannot acknowledge a newer question that arrived after the user's action", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated read-race session" });
  await sdk.sessions.create(fixture.session().projectId, "Generated current session"); await fixture.configure();
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let entered = false;
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    await navigation.getByRole("button", { name: "Generated current session", exact: true }).click();
    const target = navigation.getByRole("button", { name: "Generated read-race session", exact: true });
    await fixture.send("Generated original unread completion."); await fixture.terminal();
    const original = await waitFor(() => sdk.getState().snapshot!.attention.find((entry) => entry.sessionId === fixture.sessionId && entry.active && !entry.acknowledged));
    await expect(target.locator(".session-link-text > span")).toHaveCSS("font-weight", "550");
    fixture.service.controller.dispatch = async (raw: unknown) => {
      if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.organize" && isRecord(raw.command.changes) && raw.command.changes.unread === false) {
        entered = true; await gate.promise;
      }
      return dispatch(raw);
    };
    await target.click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Mark read", exact: true }).click();
    await waitFor(() => entered);
    await fixture.send("generated structured question choices only");
    const pending = await waitFor(() => fixture.session().pendingQuestionId);
    const newer = await waitFor(() => sdk.getState().snapshot!.attention.find((entry) => entry.sessionId === fixture.sessionId && entry.active && entry.id !== original.id));
    gate.resolve();
    await waitFor(() => sdk.getState().snapshot!.attention.find((entry) => entry.id === original.id)?.acknowledged);
    expect(sdk.getState().snapshot!.attention.find((entry) => entry.id === newer.id)?.acknowledged).toBe(false);
    await expect(target.locator(".session-link-text > span")).toHaveCSS("font-weight", "550");
    expect(fixture.session().pendingQuestionId).toBe(pending);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});
