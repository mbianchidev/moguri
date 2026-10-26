import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { compareSessions, isRecord, MoguriError, MoguriSdk } from "../../packages/sdk/src/index.ts";
import { setupFixture, waitFor } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (directory: string) => electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"),
  args: process.env.MOGURI_TEST_APP ? [] : ["."], env: { ...process.env, MOGURI_STATE_DIR: join(directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
const link = (page: Page, name: string) => page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name, exact: true });
const row = (page: Page, name: string) => page.getByRole("navigation", { name: "Projects and sessions" }).locator(".session-row").filter({ has: page.getByRole("button", { name, exact: true }) });
test.skip(process.platform !== "darwin", "Native session ordering is qualified with generated hidden macOS fixtures.");

test("native session reordering survives unrelated live changes during the drag", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  const first = await sdk.sessions.create(null, "Generated live first"), second = await sdk.sessions.create(null, "Generated live second");
  const third = await sdk.sessions.create(null, "Generated live third"), app = await launch(fixture.directory);
  let cleanupPage: Page | undefined;
  try {
    const page = await app.firstWindow(); cleanupPage = page;
    const order = () => sdk.getState().snapshot!.sessions.filter((entry) => entry.projectId === null && !entry.parentSessionId).sort(compareSessions).map((entry) => entry.id);
    await expect(link(page, "Generated live third")).toBeVisible();
    await page.evaluate(() => document.addEventListener("dragstart", () => { document.documentElement.dataset.generatedSessionDrag = "started"; }, { once: true }));
    const source = await row(page, "Generated live third").boundingBox(), target = await row(page, "Generated live first").boundingBox();
    if (!source || !target) throw new Error("Generated session rows did not expose native drag bounds.");
    await page.mouse.move(source.x + 35, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(source.x + 55, source.y + source.height / 2 - 8, { steps: 8 });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.generatedSessionDrag)).toBe("started");
    await sdk.sessions.organize(third.id!, { unread: true });
    await expect(link(page, "Generated live third")).toHaveAttribute("data-unread", "true");
    await page.mouse.move(target.x + 35, target.y + 2, { steps: 10 }); await page.mouse.up();
    await expect.poll(order).toEqual([third.id, first.id, second.id]);
    await page.reload();
    await expect.poll(() => page.getByRole("navigation", { name: "Projects and sessions" }).locator(".general-chats .session-link").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-session-id")))).toEqual([third.id, first.id, second.id]);
    expect(fixture.requests).toHaveLength(0);
  } finally { await cleanupPage?.keyboard.press("Escape"); await cleanupPage?.mouse.up(); await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("Unpin has a barred pin icon, while Pin and the pinned-state marker remain standard pins", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated pinned session", pinned: true });
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow(), actions = link(page, "Generated pinned session");
    await actions.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Actions for Generated pinned session", exact: true });
    await expect(menu.getByRole("menuitem", { name: "Unpin", exact: true }).locator("svg")).toHaveAttribute("data-icon", "PinOff");
    await mkdir(".moguri/artifacts", { recursive: true });
    await menu.screenshot({ path: ".moguri/artifacts/session-unpin-action.png" });
    await expect(link(page, "Generated pinned session").locator('[data-icon="Pin"]')).toHaveCount(1);
    await menu.getByRole("menuitem", { name: "Unpin", exact: true }).click();
    await expect.poll(() => fixture.session().pinned).toBe(false);
    await actions.click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Pin", exact: true }).locator("svg")).toHaveAttribute("data-icon", "Pin");
    await page.keyboard.press("Escape"); expect(fixture.requests).toHaveLength(0);
  } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
});

for (const scope of ["Chats", "project"] as const) {
  test(`the ${scope} session row reorders on halves, never nests, and preserves pin partitions`, async () => {
    const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
    const projectId = scope === "Chats" ? null : fixture.session().projectId;
    const first = await sdk.sessions.create(projectId, "Generated row first"), second = await sdk.sessions.create(projectId, "Generated row second");
    const third = await sdk.sessions.create(projectId, "Generated row third"), app = await launch(fixture.directory);
    const ids = [first.id, second.id, third.id];
    const order = () => sdk.getState().snapshot!.sessions.filter((entry) => ids.includes(entry.id)).sort(compareSessions).map((entry) => entry.id);
    try {
      const page = await app.firstWindow(), source = row(page, "Generated row third"), sourceLink = link(page, "Generated row third");
      await expect(source).toHaveAttribute("draggable", "true");
      await expect(page.getByRole("button", { name: "Actions for Generated row third", exact: true })).toHaveCount(0);
      const target = row(page, "Generated row first"), targetBounds = await target.boundingBox();
      if (!targetBounds) throw new Error("Generated first row has no native drop bounds.");
      await source.dragTo(target, { targetPosition: { x: 35, y: targetBounds.height - 3 } });
      await expect.poll(order).toEqual([first.id, third.id, second.id]);
      expect(sdk.getState().snapshot!.sessions.find((entry) => entry.id === third.id)?.parentSessionId).toBeUndefined();
      await source.dragTo(row(page, "Generated row first"), { targetPosition: { x: 35, y: 3 } });
      await expect.poll(order).toEqual([third.id, first.id, second.id]);
      await expect(sourceLink).toBeEnabled(); await sourceLink.focus(); await sourceLink.press("Alt+ArrowDown");
      await expect.poll(order).toEqual([first.id, third.id, second.id]);
      await sdk.sessions.organize(second.id!, { pinned: true });
      await expect.poll(order).toEqual([second.id, first.id, third.id]);
      await expect(sourceLink).toBeEnabled(); await source.dragTo(row(page, "Generated row second"), { targetPosition: { x: 35, y: 3 } });
      expect(order()).toEqual([second.id, first.id, third.id]);
      await mkdir(".moguri/artifacts", { recursive: true });
      if (scope === "Chats") await page.getByRole("navigation", { name: "Projects and sessions" }).screenshot({ path: ".moguri/artifacts/session-reorder-row.png" });
      expect(fixture.requests).toHaveLength(0);
    } finally { await app.close(); sdk.disconnect(); await fixture.close(); }
  });
}

test("unrelated pending UI metadata cannot disable native session reordering", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { unread: true });
  const first = await sdk.sessions.create(null, "Generated busy first"), second = await sdk.sessions.create(null, "Generated busy second");
  const third = await sdk.sessions.create(null, "Generated busy third"), dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  const gate = Promise.withResolvers<void>(); let entered = false;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.organize" && raw.command.sessionId === fixture.sessionId &&
      isRecord(raw.command.changes) && raw.command.changes.unread === false) { entered = true; await gate.promise; }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await link(page, fixture.session().title).click(); await waitFor(() => entered);
    const source = row(page, "Generated busy third");
    await expect(source).toHaveAttribute("draggable", "true");
    await source.dragTo(row(page, "Generated busy first"), { targetPosition: { x: 35, y: 3 } });
    await expect.poll(() => sdk.getState().snapshot!.sessions.filter((entry) => entry.projectId === null).sort(compareSessions).map((entry) => entry.id)).toEqual([third.id, first.id, second.id]);
    gate.resolve(); expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a concurrent pin change refuses stale reorder intent without a retry or an order-event prefix", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated structural first" });
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated structural second");
  await sdk.sessions.create(fixture.session().projectId, "Generated structural third");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>(); let calls = 0;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.reorder") { calls++; if (calls === 1) await gate.promise; }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated structural third").dragTo(row(page, "Generated structural first"), { targetPosition: { x: 35, y: 3 } });
    await waitFor(() => calls === 1); await sdk.sessions.organize(second.id!, { pinned: true }); gate.resolve();
    await expect(page.getByRole("alert")).toContainText("list changed its order");
    expect(calls).toBe(1); expect(sdk.getState().snapshot!.sessions.find((entry) => entry.id === second.id)?.pinned).toBe(true);
    expect(fixture.service.controller.events(0).filter((event) => event.event_type === "session.organized" && event.payload.changes.order !== undefined)).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("leaving a native reorder target clears its old insertion cue", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.create(null, "Generated cue first");
  await sdk.sessions.create(null, "Generated cue second");
  await sdk.sessions.create(null, "Generated cue third");
  const app = await launch(fixture.directory);
  const before = sdk.getState().snapshot!.sessions.filter((entry) => entry.projectId === null).sort(compareSessions).map((entry) => entry.id);
  let cleanupPage: Page | undefined;
  try {
    const page = await app.firstWindow(); cleanupPage = page;
    const sourceRow = row(page, "Generated cue third");
    await expect(sourceRow).toBeVisible();
    const source = await sourceRow.boundingBox(), target = await row(page, "Generated cue first").boundingBox();
    const outside = await page.getByRole("navigation", { name: "Profile resources" }).getByRole("button", { name: "Dashboard", exact: true }).boundingBox();
    if (!source || !target || !outside) throw new Error("Generated drag targets have no native geometry.");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + 35, target.y + 3, { steps: 12 });
    await expect(row(page, "Generated cue first")).toHaveClass(/drop-before/);
    await page.mouse.move(outside.x + 20, outside.y + outside.height / 2, { steps: 12 });
    await expect(page.locator(".drop-before, .drop-after, .drop-detach")).toHaveCount(0);
    await page.keyboard.press("Escape"); await page.mouse.up();
    expect(sdk.getState().snapshot!.sessions.filter((entry) => entry.projectId === null).sort(compareSessions).map((entry) => entry.id)).toEqual(before);
    expect(fixture.requests).toHaveLength(0);
  } finally { await cleanupPage?.keyboard.press("Escape"); await cleanupPage?.mouse.up(); await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a known revision-only reorder conflict refreshes live metadata without overwriting structural changes", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated race first" });
  const second = await sdk.sessions.create(fixture.session().projectId, "Generated race second");
  const third = await sdk.sessions.create(fixture.session().projectId, "Generated race third");
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller), gate = Promise.withResolvers<void>();
  let calls = 0;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.reorder") { calls++; if (calls === 1) await gate.promise; }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated race third").dragTo(row(page, "Generated race first"), { targetPosition: { x: 30, y: 2 } });
    await waitFor(() => calls === 1);
    await sdk.sessions.organize(second.id!, { unread: true }); gate.resolve();
    await expect.poll(() => sdk.getState().snapshot!.sessions.slice().sort(compareSessions).map((entry) => entry.id)).toEqual([third.id, fixture.sessionId, second.id]);
    expect(calls).toBe(2);
    const writes = fixture.service.controller.events(0).filter((event) => event.event_type === "session.organized" && event.payload.changes.order !== undefined);
    expect(writes).toHaveLength(3);
    expect(writes.map((event) => event.seq)).toEqual([writes[0]!.seq, writes[0]!.seq + 1, writes[0]!.seq + 2]);
    expect(fixture.requests).toHaveLength(0);
  } finally { gate.resolve(); fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});

test("a non-revision failure never retries a session reorder or reports success", async () => {
  const fixture = await setupFixture(), sdk = await new MoguriSdk(fixture.service.connection).ready();
  await sdk.sessions.organize(fixture.sessionId, { title: "Generated refused first" });
  await sdk.sessions.create(fixture.session().projectId, "Generated refused second");
  const before = sdk.getState().snapshot!.sessions.slice().sort(compareSessions).map((entry) => entry.id);
  const dispatch = fixture.service.controller.dispatch.bind(fixture.service.controller);
  let calls = 0;
  fixture.service.controller.dispatch = async (raw: unknown) => {
    if (isRecord(raw) && isRecord(raw.command) && raw.command.type === "session.reorder") { calls++; throw new MoguriError("generated_order_refused", "Generated reorder was refused before changing session order.", 503); }
    return dispatch(raw);
  };
  const app = await launch(fixture.directory);
  try {
    const page = await app.firstWindow();
    await row(page, "Generated refused second").dragTo(row(page, "Generated refused first"), { targetPosition: { x: 30, y: 2 } });
    await expect(page.getByRole("alert")).toContainText("Generated reorder was refused");
    expect(calls).toBe(1);
    expect(sdk.getState().snapshot!.sessions.slice().sort(compareSessions).map((entry) => entry.id)).toEqual(before);
    expect(fixture.requests).toHaveLength(0);
  } finally { fixture.service.controller.dispatch = dispatch; await app.close(); sdk.disconnect(); await fixture.close(); }
});
