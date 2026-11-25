import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MoguriSdk } from "@moguri-dev/sdk";
import { admitGeneratedSkill, setupFixture, waitFor, type GeneratedProviderOptions } from "../fixture.ts";
import { waitForWorkspace } from "./navigation.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual hidden desktop qualification is macOS-only.");
async function centered(hero: Locator, viewport: Locator) {
  const content = await hero.boundingBox(), area = await viewport.boundingBox();
  const observed = await viewport.evaluate((view) => ({
    height: innerHeight, scrollTop: view.scrollTop, scrollHeight: view.scrollHeight, clientHeight: view.clientHeight,
    display: getComputedStyle(view).display, align: getComputedStyle(view).alignItems, padding: getComputedStyle(view).padding,
    content: view.firstElementChild?.getBoundingClientRect().toJSON(),
  }));
  expect(content).not.toBeNull(); expect(area).not.toBeNull();
  expect(content!.y).toBeGreaterThanOrEqual(area!.y);
  expect(content!.y + content!.height).toBeLessThanOrEqual(area!.y + area!.height);
  expect(Math.abs(content!.x + content!.width / 2 - area!.x - area!.width / 2)).toBeLessThanOrEqual(12);
  expect(Math.abs(content!.y + content!.height / 2 - area!.y - area!.height / 2), JSON.stringify({ content, area, observed })).toBeLessThanOrEqual(16);
  const logo = await hero.getByRole("img").boundingBox(), heading = await hero.getByRole("heading").boundingBox();
  expect(logo).not.toBeNull(); expect(heading).not.toBeNull();
  expect(Math.abs(logo!.x + logo!.width / 2 - area!.x - area!.width / 2)).toBeLessThanOrEqual(12);
  expect(Math.abs(heading!.x + heading!.width / 2 - area!.x - area!.width / 2)).toBeLessThanOrEqual(12);
}

test("Inbox follows Dashboard, opens the exact questioning session and lets the user answer then independently delete notifications", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  await sdk.sessions.rename(f.sessionId, "Generated Inbox question");
  await f.configure(); await f.send("generated structured question choices only");
  const questionId = await waitFor(() => f.session().pendingQuestionId);
  const question = f.service.controller.snapshot().questions.find((question) => question.id === questionId)!;
  await sdk.sessions.create(null, "Generated Inbox other");
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Generated Inbox other", exact: true }).click();
    const resources = page.getByRole("navigation", { name: "Profile resources", exact: true });
    await expect(resources.getByRole("button")).toHaveText(["Dashboard", "Inbox", "Suggestions", "Automations", "Capabilities", "Artifacts"]);
    await expect(page.getByRole("button", { name: "Attention notifications", exact: true })).toHaveCount(0);
    const inboxButton = resources.getByRole("button", { name: "Inbox", exact: true });
    await inboxButton.focus(); await page.keyboard.press("Enter");
    const inbox = page.getByRole("region", { name: "Inbox notifications", exact: true });
    await expect(inbox).toBeVisible(); await expect(inbox).toContainText(question.question);
    const requests = f.requests.length;
    await inbox.getByRole("button", { name: "Generated Inbox question", exact: true }).click();
    const card = page.getByRole("region", { name: "User question", exact: true });
    await expect(card).toBeVisible();
    expect(f.session().pendingQuestionId).toBe(questionId); expect(f.requests.length).toBe(requests);
    await card.getByRole("button", { name: question.choices[0]!, exact: true }).click(); await f.terminal();
    expect(f.service.controller.snapshot().questions.find((entry) => entry.id === questionId)?.answer?.actor).toBe("user");
    await inboxButton.click(); await expect(inbox).toContainText("Agent done and waiting");
    const remove = inbox.getByRole("button", { name: "Delete notification", exact: true });
    await remove.focus(); await page.keyboard.press("Enter");
    await expect(inbox.locator(".attention-item")).toHaveCount(0);
    expect(f.service.controller.snapshot().sessions.some((session) => session.id === f.sessionId)).toBe(true);
    expect(f.service.controller.snapshot().questions.find((entry) => entry.id === questionId)?.answer?.actor).toBe("user");
    await page.getByRole("navigation", { name: "Projects and sessions" }).getByRole("button", { name: "Generated Inbox question", exact: true }).click();
    await expect(page.locator(".session-header h1")).toHaveText("Generated Inbox question");
    await inboxButton.click(); await expect(inbox.locator(".attention-item")).toHaveCount(0);
    await f.send("Generated next Inbox notification."); await f.terminal();
    await expect(inbox.locator(".attention-item")).toHaveCount(1);
    const beforeDelete = f.requests.length;
    await sdk.sessions.delete(f.sessionId, true, f.session().revision);
    await expect(inbox.locator(".attention-item")).toHaveCount(0);
    expect(f.requests.length).toBe(beforeDelete);
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/session-inbox.png", animations: "disabled" });
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("only an actual successful complete skill load adds its named book icon to chat", async () => {
  const options: GeneratedProviderOptions = {};
  const f = await setupFixture(options), sdk = await new MoguriSdk(f.service.connection).ready();
  const root = join(f.directory, "generated-inbox-skill"); await mkdir(root);
  await writeFile(join(root, "SKILL.md"), "---\nname: generated-chat-book\ndescription: Generated exact source\n---\nGenerated complete instructions.\n");
  const settings = sdk.settings.get()!;
  await sdk.settings.update({ ...settings.values, skillSources: [{ id: "generated-chat-book", name: "Generated chat book", kind: "local", path: root, enabled: true }] }, settings.revision);
  const skill = (await sdk.skills.find("", { sessionId: f.sessionId })).skills[0]!;
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const chat = page.getByRole("log", { name: "Session transcript", exact: true }), rows = chat.locator(".activity-row[data-kind='load-skill']");
    await sdk.skills.read(skill.id, skill.digest, f.sessionId); await sdk.skills.inspect(f.sessionId, skill.id, skill.digest);
    await expect(rows).toHaveCount(0);
    await admitGeneratedSkill(sdk, f.sessionId, skill.id, skill.digest);
    await sdk.skills.consume(f.sessionId, skill.id, skill.digest);
    await expect(rows).toHaveCount(1); await expect(rows.locator("summary")).toContainText("Loaded skill");
    await expect(rows.locator("summary")).toContainText("generated-chat-book");
    await expect(rows.locator("summary svg[data-icon='Skill']")).toBeVisible();
    await expect(chat.getByRole("heading", { name: "What are we working on?", exact: true })).toHaveCount(0);
    await rows.locator("summary").click();
    await expect(rows.getByRole("region", { name: "Operation result", exact: true })).toContainText("Generated complete instructions.");
    expect(f.requests).toHaveLength(0);
    options.toolCall = { name: "use_skill", args: { action: "load", id: skill.id, expectedDigest: skill.digest } };
    await f.configure(); await f.send("Generated real native skill loading in chat.");
    await waitFor(() => f.session().pendingApproval || ["completed", "failed", "partial", "stopped"].includes(f.session().status));
    if (f.session().pendingApproval) await f.approve();
    await f.terminal();
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Loaded skill" })).toHaveCount(2);
    await expect(rows.locator("summary svg[data-icon='Skill']")).toHaveCount(2);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});

test("the new-chat mascot and invitation are centered in the real available chat area at wide and narrow sizes", async () => {
  const f = await setupFixture(), sdk = await new MoguriSdk(f.service.connection).ready();
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(); await waitForWorkspace(page);
    const viewport = page.getByRole("log", { name: "Session transcript", exact: true }), hero = viewport.locator(".session-empty");
    await mkdir(".moguri/artifacts", { recursive: true });
    for (const [width, height] of [[1280, 900], [860, 680]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size[0]!, size[1]!), [width!, height!]);
      await expect(hero).toBeVisible(); await expect.poll(async () => Math.round((await viewport.boundingBox())!.width)).toBeGreaterThan(200);
      await page.screenshot({ path: ".moguri/artifacts/centered-new-chat-initial.png", animations: "disabled" });
      await centered(hero, viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await mkdir(".moguri/artifacts", { recursive: true });
    await page.screenshot({ path: ".moguri/artifacts/centered-new-chat.png", animations: "disabled" });
    await sdk.sessions.delete(f.sessionId, true, f.session().revision);
    const welcome = page.locator(".welcome"); await expect(welcome).toBeVisible();
    const invitation = await welcome.evaluate((view) => {
      const bounds = view.getBoundingClientRect(), children = [...view.children].map((child) => child.getBoundingClientRect());
      const left = Math.min(...children.map((child) => child.left)), right = Math.max(...children.map((child) => child.right));
      const top = Math.min(...children.map((child) => child.top)), bottom = Math.max(...children.map((child) => child.bottom));
      return { x: Math.abs((left + right) / 2 - bounds.x - bounds.width / 2), y: Math.abs((top + bottom) / 2 - bounds.y - bounds.height / 2) };
    });
    expect(invitation.x).toBeLessThanOrEqual(12); expect(invitation.y).toBeLessThanOrEqual(16);
  } finally { await app.close(); sdk.disconnect(); await f.close(); }
});
