import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { compareSessions, isRecord, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
const navigation = (page: Page) => page.getByRole("navigation", { name: "Projects and sessions" });
const link = (page: Page, name: string) => navigation(page).getByRole("button", { name, exact: true });
const row = (page: Page, name: string) => navigation(page).locator(".session-row").filter({ has: page.getByRole("button", { name, exact: true }) });
const review = (page: Page) => page.getByRole("dialog", { name: "Detach session", exact: true });
test.skip(process.platform !== "darwin", "Native session dragging uses generated hidden macOS fixtures.");

for (const scope of ["Chats", "project"] as const) {
  test(`whole rows reorder ${scope} children and drag-out detachment requires review`, async () => {
    const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
    const projectId = scope === "Chats" ? null : fixture.session().projectId;
    const parent = await sdk.sessions.create(projectId, "Generated drag parent");
    const first = await sdk.sessions.spawn(parent.id!, "agent", "Generated child first");
    const second = await sdk.sessions.spawn(parent.id!, "agent", "Generated child second");
    const before = sdk.getState().snapshot!.sessions.find((session) => session.id === second.id)!;
    const app = await launch(fixture.directory);
    try {
      const page = await app.firstWindow();
      await expect(link(page, before.title)).toBeVisible();
      await expect(navigation(page).locator('[data-icon="Grip"]')).toHaveCount(0);
      await row(page, before.title).dragTo(row(page, "Generated child first"), { targetPosition: { x: 45, y: 3 } });
      await expect.poll(() => sdk.getState().snapshot!.sessions.filter((session) => session.parentSessionId === parent.id)
        .sort(compareSessions).map((session) => session.id)).toEqual([second.id, first.id]);
      await row(page, before.title).dragTo(row(page, "Generated drag parent"), { targetPosition: { x: 45, y: 3 } });
      await expect(review(page)).toBeVisible();
      await expect(review(page)).toContainText("Generated drag parent");
      await expect(review(page).getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      expect(sdk.getState().snapshot!.sessions.find((session) => session.id === second.id)?.parentSessionId).toBe(parent.id);
      await review(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(review(page)).toHaveCount(0);
      await expect(link(page, before.title)).toBeFocused();
      expect(sdk.getState().snapshot!.sessions.find((session) => session.id === second.id)?.parentSessionId).toBe(parent.id);
      await row(page, before.title).dragTo(row(page, "Generated drag parent"), { targetPosition: { x: 45, y: 3 } });
      await review(page).getByRole("button", { name: "Detach session", exact: true }).click();
      await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => session.id === second.id)?.parentSessionId ?? null).toBeNull();
      await expect(link(page, before.title)).toBeFocused();
      const detached = sdk.getState().snapshot!.sessions.find((session) => session.id === second.id)!;
      expect([detached.projectId, detached.workspaceId, detached.controls.env, detached.kind])
        .toEqual([before.projectId, before.workspaceId, before.controls.env, before.kind]);
      expect(fixture.requests).toHaveLength(0);
    } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
  });
}

test("remembered detachment applies to drag and keyboard actions, survives reload and is resettable", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated remembered child");
  const next = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated keyboard child");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated remembered child").dragTo(row(page, fixture.session().title), { targetPosition: { x: 45, y: 3 } });
    await review(page).getByLabel("Do not ask again when detaching sessions", { exact: true }).check();
    await review(page).getByRole("button", { name: "Detach session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId ?? null).toBeNull();
    await page.reload();
    await link(page, "Generated keyboard child").focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Detach", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => session.id === next.id)?.parentSessionId ?? null).toBeNull();
    await expect(review(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Confirmations", exact: true }).click();
    const preference = page.getByLabel("Confirm before detaching a child session", { exact: true });
    await expect(preference).not.toBeChecked();
    await preference.check();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => sdk.settings.get()?.values.interactions.confirmSessionDetach).toBe(true);
    await expect(preference).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toHaveCount(1);
    await page.getByRole("button", { name: "Back to session", exact: true }).click();
    await sdk.sessions.organize(child.id!, { parentSessionId: fixture.sessionId });
    await link(page, "Generated remembered child").focus(); await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Detach", exact: true }).click();
    await expect(review(page)).toBeVisible(); await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a changed hierarchy invalidates the exact reviewed detachment", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated stale child");
  const other = await sdk.sessions.create(fixture.session().projectId, "Generated different parent");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated stale child").dragTo(row(page, fixture.session().title), { targetPosition: { x: 45, y: 3 } });
    await expect(review(page)).toBeVisible();
    await sdk.sessions.organize(child.id!, { parentSessionId: other.id! });
    await expect(review(page).getByRole("alert")).toContainText("changed");
    await expect(review(page).getByRole("button", { name: "Detach session", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId).toBe(other.id);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("choosing no parent uses the same cancellable detach review as dragging", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated parent-selector child");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await link(page, "Generated parent-selector child").click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Attach to session", exact: true }).click();
    const attach = page.getByRole("dialog", { name: "Attach session", exact: true });
    await expect(attach.getByLabel("Destination", { exact: true })).toHaveValue(fixture.sessionId);
    await attach.getByLabel("Destination", { exact: true }).selectOption("");
    await attach.getByRole("button", { name: "Save", exact: true }).click();
    await expect(attach).toHaveCount(0);
    await expect(review(page)).toBeVisible();
    await page.keyboard.press("Escape");
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId).toBe(fixture.sessionId);
    await expect(link(page, "Generated parent-selector child")).toBeFocused();
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("global terminal navigation and scope selection are removed without opening a hidden chat", async () => {
  const fixture = await setupFixture({ platform: { terminal: { executable: "/bin/sh", args: ["-c", "printf 'GENERATED_PRIVATE_READY\\n'; exec cat"] } } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("navigation", { name: "Profile resources" }).getByRole("button"))
      .toHaveText(["Dashboard", "Suggestions", "Automations"]);
    await page.getByRole("navigation", { name: "Sidebar panels" }).getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(page.getByLabel("Terminal scope", { exact: true })).toHaveCount(0);
    await expect.poll(() => sdk.getState().snapshot!.terminals.filter((terminal) => terminal.sessionId === fixture.sessionId && terminal.status === "running").length).toBe(1);
    expect(sdk.getState().snapshot!.terminals.some((terminal) => terminal.sessionId === null)).toBe(false);
    expect(sdk.getState().snapshot!.sessions).toHaveLength(1);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("group headers are explicit detach destinations and changed destinations invalidate review", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated grouped child");
  const destination = await sdk.sessions.group(fixture.session().projectId, "Generated destination");
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated grouped child").dragTo(page.getByRole("heading", { name: "Generated destination", exact: true }));
    await expect(review(page)).toContainText("Generated destination");
    const group = sdk.getState().snapshot!.sessionGroups.find((group) => group.id === destination.id)!;
    await sdk.sessions.group(fixture.session().projectId, "Generated changed destination", group.order, group.id, group.revision);
    await expect(review(page).getByRole("alert")).toContainText("changed");
    await expect(review(page).getByRole("button", { name: "Detach session", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await row(page, "Generated grouped child").dragTo(page.getByRole("heading", { name: "Generated changed destination", exact: true }));
    await review(page).getByRole("button", { name: "Detach session", exact: true }).click();
    await expect.poll(() => sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId ?? null).toBeNull();
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.groupId).toBe(destination.id);
    expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a failed remembered preference cannot detach or falsely clear review", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated failed-preference child");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "settings.update") throw new MoguriError("generated_preference_failure", "Generated preference save failed before detachment.", 503);
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated failed-preference child").dragTo(row(page, fixture.session().title), { targetPosition: { x: 45, y: 3 } });
    await review(page).getByLabel("Do not ask again when detaching sessions", { exact: true }).check();
    await review(page).getByRole("button", { name: "Detach session", exact: true }).click();
    await expect(review(page).getByRole("alert")).toContainText("Generated preference save failed");
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId).toBe(fixture.sessionId);
    expect(sdk.settings.get()!.values.interactions.confirmSessionDetach).toBe(true);
    await expect(review(page).getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a hierarchy change during preference persistence cannot be detached by an older confirmation", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const child = await sdk.sessions.spawn(fixture.sessionId, "agent", "Generated racing child");
  const other = await sdk.sessions.create(fixture.session().projectId, "Generated racing parent");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let entered = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "settings.update") { entered = true; await gate.promise; }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated racing child").dragTo(row(page, fixture.session().title), { targetPosition: { x: 45, y: 3 } });
    await review(page).getByLabel("Do not ask again when detaching sessions", { exact: true }).check();
    await review(page).getByRole("button", { name: "Detach session", exact: true }).click();
    await waitFor(() => entered);
    await sdk.sessions.organize(child.id!, { parentSessionId: other.id! });
    gate.resolve();
    await expect(review(page).getByRole("alert").filter({ hasText: /no session action was performed/ })).toBeVisible();
    expect(sdk.getState().snapshot!.sessions.find((session) => session.id === child.id)?.parentSessionId).toBe(other.id);
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "session.organized" && event.session_id === child.id && event.payload.changes.parentSessionId === null)).toHaveLength(0);
    await page.keyboard.press("Escape");
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});
