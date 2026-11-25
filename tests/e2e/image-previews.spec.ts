import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { MoguriSdk } from "@moguri-dev/sdk";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url), artifacts = resolve(".moguri/artifacts");
test.skip(process.platform !== "darwin", "Desktop image previews are qualified in hidden macOS Electron.");

async function imageFixture() {
  const fixture = await setupFixture({ imageInput: true, responseMode: "text" });
  await fixture.configure();
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const images = [
    { name: "generated-landscape.png", width: 1440, height: 960 },
    { name: "generated-portrait.png", width: 960, height: 1440 },
  ];
  for (const image of images) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}">
      <rect width="100%" height="100%" fill="#192a38"/><rect x="24" y="24" width="${image.width - 48}" height="${image.height - 48}" rx="24" fill="#a8d7bc"/>
      <rect x="60" y="60" width="${image.width - 120}" height="${image.height - 120}" rx="16" fill="#233c30"/>
      <circle cx="${image.width / 2}" cy="${image.height / 2}" r="160" fill="#a8d7bc"/>
      <text x="70" y="130" fill="#e1e8f0" font-family="sans-serif" font-size="40">Generated image preview</text>
      <text x="70" y="${image.height - 80}" fill="#e1e8f0" font-family="sans-serif" font-size="32">${image.width} x ${image.height}</text></svg>`;
    const path = join(fixture.directory, image.name);
    await sharp(Buffer.from(svg)).png().toFile(path);
    await sdk.attachments.file(fixture.sessionId, path, "image");
  }
  const note = join(fixture.directory, "generated-preview-note.txt");
  await writeFile(note, "Generated text attachment stays compact.");
  await sdk.attachments.file(fixture.sessionId, note, "text");
  const draft = sdk.getState().snapshot!.sessions.find((session) => session.id === fixture.sessionId)!.draft;
  await sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: draft.revision, text: "Generated image preview draft.", attachments: draft.attachments });
  const app = await electron.launch({
    executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 900));
  await mkdir(artifacts, { recursive: true });
  return { fixture, sdk, app, page, close: async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await app.close(); sdk.disconnect(); await fixture.close();
  } };
}

test("attached images stay compact and expand only after explicit activation", async () => {
  const owned = await imageFixture();
  try {
    const composer = owned.page.getByRole("form", { name: "Message composer", exact: true });
    await expect(composer.getByRole("img")).toHaveCount(2);
    for (const name of ["generated-landscape.png", "generated-portrait.png"]) {
      const image = composer.getByRole("img", { name, exact: true });
      await expect(image).toBeVisible();
      const bounds = await image.boundingBox();
      expect(bounds?.width).toBeLessThanOrEqual(48);
      expect(bounds?.height).toBeLessThanOrEqual(40);
      expect((await composer.getByRole("button", { name: `Preview attachment ${name}`, exact: true }).boundingBox())?.height).toBeLessThanOrEqual(44);
      await expect(image).toHaveCSS("object-fit", "contain");
    }
    const note = composer.getByRole("button", { name: "Preview attachment generated-preview-note.txt", exact: true });
    expect((await note.boundingBox())?.height).toBeLessThan(48);
    await owned.page.screenshot({ path: join(artifacts, "desktop-compact-image-attachments.png") });
    const open = composer.getByRole("button", { name: "Preview attachment generated-landscape.png", exact: true });
    const dialog = owned.page.getByRole("dialog", { name: "Attachment preview generated-landscape.png", exact: true });
    await expect(dialog).toHaveCount(0);
    await open.hover();
    await expect(dialog).toHaveCount(0);
    await open.focus(); await owned.page.keyboard.press("Enter");
    const large = dialog.getByRole("img", { name: "generated-landscape.png", exact: true });
    await expect(large).toBeVisible();
    expect((await dialog.boundingBox())?.width).toBeGreaterThan(1100);
    const bounds = await large.boundingBox();
    expect(bounds?.width).toBeGreaterThan(1000); expect(bounds?.height).toBeGreaterThan(550);
    await expect(large).toHaveCSS("object-fit", "contain");
    await expect(dialog.getByRole("button", { name: "Remove attachment", exact: true })).toBeInViewport();
    await owned.page.screenshot({ path: join(artifacts, "desktop-large-image-preview.png") });
    await owned.page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(owned.page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated image preview draft.");
    await owned.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(840, 620));
    const portrait = composer.getByRole("button", { name: "Preview attachment generated-portrait.png", exact: true });
    await portrait.scrollIntoViewIfNeeded(); await portrait.click();
    const small = owned.page.getByRole("dialog", { name: "Attachment preview generated-portrait.png", exact: true });
    await expect(small.getByRole("img", { name: "generated-portrait.png", exact: true })).toBeVisible();
    await expect(small.getByRole("button", { name: "Close preview", exact: true })).toBeInViewport();
    await expect(small.getByRole("button", { name: "Remove attachment", exact: true })).toBeInViewport();
    expect(await owned.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await small.getByRole("button", { name: "Remove attachment", exact: true }).click();
    await expect.poll(() => owned.fixture.session().draft.attachments.length).toBe(2);
    expect((await stat(join(owned.fixture.directory, "generated-portrait.png"))).isFile()).toBe(true);
    await expect(owned.page.getByLabel("Prompt", { exact: true })).toHaveValue("Generated image preview draft.");
    expect(owned.fixture.requests).toHaveLength(0);
  } finally { await owned.close(); }
});

test("sent images stay compact until clicked without gaining draft removal or new model calls", async () => {
  const owned = await imageFixture();
  try {
    const prompt = owned.page.getByLabel("Prompt", { exact: true });
    await expect(prompt).toHaveValue("Generated image preview draft.");
    await expect(owned.page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await prompt.press("Enter");
    await expect.poll(() => owned.fixture.session().status).toBe("completed");
    const sent = owned.page.getByRole("log", { name: "Session transcript", exact: true }).getByRole("article").filter({ hasText: "Generated image preview draft." });
    await expect(sent.getByRole("img")).toHaveCount(2);
    for (const name of ["generated-landscape.png", "generated-portrait.png"]) {
      const image = sent.getByRole("img", { name, exact: true });
      const bounds = await image.boundingBox();
      expect(bounds?.width).toBeLessThanOrEqual(48);
      expect(bounds?.height).toBeLessThanOrEqual(40);
    }
    await sent.getByRole("button", { name: "Preview attachment generated-landscape.png", exact: true }).click();
    const dialog = owned.page.getByRole("dialog", { name: "Attachment preview generated-landscape.png", exact: true });
    const expanded = dialog.getByRole("img", { name: "generated-landscape.png", exact: true });
    await expect(expanded).toBeVisible();
    expect((await expanded.boundingBox())?.width).toBeGreaterThan(1000);
    expect((await expanded.boundingBox())?.height).toBeGreaterThan(550);
    await expect(dialog.getByRole("button", { name: "Remove attachment", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
    await owned.page.screenshot({ path: join(artifacts, "desktop-compact-sent-images.png") });
    expect(owned.fixture.requests).toHaveLength(1);
    expect(owned.fixture.session().messages.find((message) => message.role === "user")?.attachments).toHaveLength(3);
  } finally { await owned.close(); }
});
