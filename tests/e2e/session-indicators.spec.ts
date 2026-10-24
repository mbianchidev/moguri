import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { colorContrast, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
const url = (number: number) => `https://github.com/generated/project/pull/${number}`;
const github: typeof fetch = async (input) => {
  const number = Number(String(input).split("/").at(-1));
  if (number === 5) return Response.json({ message: "Generated inaccessible PR." }, { status: 403 });
  return Response.json({ number, html_url: url(number), state: number === 7 || number === 4 ? "closed" : "open", draft: number === 2,
    merged: number === 7, merged_at: number === 7 ? "2026-01-01T00:00:00Z" : null });
};
const hex = (css: string) => {
  const values = css.match(/[\d.]+/g);
  if (!values || values.length < 3) throw new Error(`Expected an actual computed RGB color: ${css}`);
  return `#${values.slice(0, 3).map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`;
};
async function contrast(marker: Locator, property: "color" | "backgroundColor" = "color") {
  const computed = await marker.evaluate((node, property) => {
    const foreground = getComputedStyle(node)[property];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const background = getComputedStyle(parent).backgroundColor;
      if (background !== "transparent" && background !== "rgba(0, 0, 0, 0)") return { foreground, background };
    }
    throw new Error("The rendered indicator has no effective background.");
  }, property);
  expect(colorContrast(hex(computed.foreground), hex(computed.background))).toBeGreaterThanOrEqual(3);
  return computed.foreground;
}
async function complete(sdk: MoguriSdk, sessionId: string, modelId: string) {
  const session = sdk.getState().snapshot!.sessions.find((session) => session.id === sessionId)!;
  await sdk.command({ type: "session.configure", sessionId, expectedRevision: session.revision, controls: { ...session.controls, modelId } });
  await sdk.command({ type: "draft.save", sessionId, expectedRevision: session.draft.revision, text: "Generated status indicator completion.", attachments: [] });
  await sdk.command({ type: "message.send", sessionId, expectedRevision: session.draft.revision + 1, delivery: "queue" });
  await waitFor(() => sdk.getState().snapshot!.sessions.find((session) => session.id === sessionId)?.status === "completed");
}
test.skip(process.platform !== "darwin", "Native status-indicator qualification is macOS-only.");

test("live work, real questions and permission pauses override merged PRs and remain visible after acknowledgement or notification opt-out", async () => {
  const fixture = await setupFixture({ platform: { integrations: { fetch: github } } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { prUrl: url(7) });
  await waitFor(() => fixture.session().prObservation?.pullRequest.state === "merged");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const link = page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: fixture.session().title, exact: true });
    await link.click();
    await expect(link.getByRole("img", { name: "Attached pull request merged", exact: true })).toBeVisible();
    await fixture.configure(); await fixture.send("generated slow status task");
    const progress = link.getByRole("img", { name: "Session in progress", exact: true }), dot = link.locator(".session-status-dot");
    await expect(progress).toBeVisible(); await expect(progress.locator("svg")).toHaveAttribute("data-icon", "Progress");
    await expect(dot).toHaveCSS("animation-name", "session-blue-pulse");
    await expect(progress.locator("svg")).toHaveCSS("animation-name", "session-status-spin");
    await expect(link.locator('[data-icon="PRMerged"]')).toHaveCount(0);
    await contrast(progress); await contrast(dot, "backgroundColor");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(dot).toHaveCSS("animation-name", "none"); await expect(progress.locator("svg")).toHaveCSS("animation-name", "none");
    await expect(progress).toBeVisible();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const settings = sdk.settings.get()!;
    await sdk.settings.update({ ...settings.values, notifications: { ...settings.values.notifications, inApp: false } }, settings.revision);
    await expect(progress).toBeVisible();
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    await fixture.send("generated structured question choices only");
    const questionId = await waitFor(() => fixture.session().pendingQuestionId);
    const question = link.getByRole("img", { name: "Question needs your answer", exact: true });
    await expect(question).toBeVisible(); await expect(question.locator("svg")).toHaveAttribute("data-icon", "Question");
    await expect(dot).toHaveCSS("animation-name", "none"); await contrast(question);
    const attention = fixture.service.controller.snapshot().attention.filter((entry) => entry.sessionId === fixture.sessionId && entry.active);
    expect(attention.length).toBeGreaterThan(0);
    await sdk.command({ type: "attention.acknowledge", attentionIds: attention.map((entry) => entry.id) });
    await expect(question).toBeVisible(); expect(fixture.session().pendingQuestionId).toBe(questionId);
    await sdk.command({ type: "session.stop", sessionId: fixture.sessionId }); await fixture.terminal();
    await fixture.send("generated forbidden write");
    await waitFor(() => fixture.session().pendingApproval);
    const pause = link.getByRole("img", { name: "Permission or approval needed", exact: true });
    await expect(pause).toBeVisible(); await expect(pause.locator("svg")).toHaveAttribute("data-icon", "Waiting"); await contrast(pause);
    expect(existsSync(join(fixture.project, "forbidden.txt"))).toBe(false);
    await fixture.approve(false); await fixture.terminal();
    await fixture.send("Generated ordinary completed status."); await fixture.terminal();
    await sdk.sessions.organize(fixture.sessionId, { prUrl: null });
    const done = link.getByRole("img", { name: "Session completed", exact: true });
    await expect(done).toBeVisible(); await expect(done.locator("svg")).toHaveAttribute("data-icon", "Check");
    for (const theme of ["light", "dark"] as const) {
      const current = sdk.settings.get()!;
      await sdk.settings.update({ ...current.values, appearance: { ...current.values.appearance, theme, palette: "orchid" } }, current.revision);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const color = await contrast(done);
      expect(color).toBe(await dot.evaluate((node) => getComputedStyle(node).backgroundColor));
      const channels = color.match(/\d+/g)!.map(Number);
      expect(channels[1]!).toBeGreaterThan(channels[0]!); expect(channels[1]!).toBeGreaterThan(channels[2]!);
    }
    expect(errors).toEqual([]);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("completed rows show checks plus green open or gray draft PRs, while only a verified merge shows the purple merged glyph", async () => {
  const fixture = await setupFixture({ platform: { integrations: { fetch: github } } }), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const projectId = fixture.session().projectId;
  const draft = await sdk.sessions.fromWork(projectId, { prUrl: url(2) }), open = await sdk.sessions.fromWork(projectId, { prUrl: url(3) });
  const closed = await sdk.sessions.fromWork(projectId, { prUrl: url(4) }), merged = await sdk.sessions.fromWork(projectId, { prUrl: url(7) });
  for (const created of [draft, open, closed]) await complete(sdk, created.id!, fixture.modelId);
  const unknown = await sdk.sessions.create(projectId, "Generated unverified PR");
  await complete(sdk, unknown.id!, fixture.modelId); await sdk.sessions.organize(unknown.id!, { prUrl: url(5) });
  await waitFor(() => sdk.getState().snapshot!.sessions.find((session) => session.id === unknown.id)?.prObservation?.pullRequest.diagnostic);
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), navigation = page.getByRole("navigation", { name: "Projects and sessions" });
    const link = (id: string) => navigation.getByRole("button", { name: sdk.getState().snapshot!.sessions.find((session) => session.id === id)!.title, exact: true });
    const draftLink = link(draft.id!), draftIcon = draftLink.getByRole("img", { name: "Attached pull request is draft", exact: true });
    await draftLink.click(); await expect(draftLink).toHaveAttribute("aria-description", /Session completed; Attached pull request is draft/);
    await expect(draftLink.locator('[data-icon="Check"]')).toHaveCount(1); await expect(draftIcon.locator("svg")).toHaveAttribute("data-icon", "PR");
    const gray = await contrast(draftIcon), channels = gray.match(/\d+/g)!.map(Number);
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(40);
    const openLink = link(open.id!), openIcon = openLink.getByRole("img", { name: "Attached pull request is open", exact: true });
    await openLink.click(); await expect(openLink.locator('[data-icon="Check"]')).toHaveCount(1);
    const green = await contrast(openIcon);
    expect(green).toBe(await openLink.locator(".session-mark.completed").evaluate((node) => getComputedStyle(node).color));
    expect(green).not.toBe(gray);
    await draftLink.hover(); await contrast(draftIcon);
    const closedLink = link(closed.id!);
    await expect(closedLink.getByRole("img", { name: "Attached pull request is closed, not merged", exact: true })).toBeVisible();
    await expect(closedLink.locator('[data-icon="PRMerged"]')).toHaveCount(0);
    const mergedLink = link(merged.id!), mergedIcon = mergedLink.getByRole("img", { name: "Attached pull request merged", exact: true });
    await mergedLink.click(); await expect(mergedIcon.locator("svg")).toHaveAttribute("data-icon", "PRMerged");
    await expect(mergedLink.locator('[data-icon="Check"]')).toHaveCount(0);
    const purple = await contrast(mergedIcon);
    expect(purple).toBe(await mergedLink.locator(".session-status-dot").evaluate((node) => getComputedStyle(node).backgroundColor));
    const unverified = link(unknown.id!).getByRole("img", { name: /^Attached pull request status is not verified:/ });
    await expect(unverified).toBeVisible(); await expect(unverified).toHaveAttribute("title", /HTTP 403/);
    await expect(link(unknown.id!).locator('[data-icon="PRMerged"]')).toHaveCount(0);
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/desktop-session-status-indicators.png", animations: "disabled" });
    const readsBeforeReload = fixture.service.store.events().filter((event) => event.event_type === "session.pr_observed").length;
    await page.reload(); await expect(mergedIcon).toBeVisible(); await expect(draftIcon).toBeVisible();
    expect(fixture.service.store.events().filter((event) => event.event_type === "session.pr_observed")).toHaveLength(readsBeforeReload);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});
