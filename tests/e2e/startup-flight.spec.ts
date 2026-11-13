import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setupFixture } from "../fixture.ts";

const require = createRequire(import.meta.url);
const launch = (stateDir: string) => electron.launch({
  executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
  env: { ...process.env, MOGURI_STATE_DIR: stateDir, MOGURI_TEST_WINDOW: "hidden" },
});
test.skip(process.platform !== "darwin", "Startup flight uses generated hidden macOS windows.");

for (const reduced of [false, true]) test(`startup flight is playable without dispatching work${reduced ? " with reduced motion" : ""}`, async ({}, info) => {
  const f = await setupFixture(), gate = Promise.withResolvers<void>();
  const snapshot = f.service.profiles.snapshot.bind(f.service.profiles);
  f.service.profiles.snapshot = async (...args: Parameters<typeof snapshot>) => { await gate.promise; return snapshot(...args); };
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    const opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    const flap = opening.getByRole("button", { name: "Flap Moguri's wings", exact: true });
    await expect(flap).toBeVisible();
    await expect(opening).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(opening.getByRole("navigation")).toHaveCount(0);
    await expect(opening.getByRole("textbox", { name: "Opening prompt", exact: true })).not.toBeVisible();
    await page.clock.install();
    const avatar = opening.locator(".startup-flight-avatar");
    const score = opening.getByRole("heading", { name: /^Flight score: / });
    const openingBounds = await opening.boundingBox(), scoreBounds = await score.boundingBox();
    if (!openingBounds || !scoreBounds) throw new Error("The generated startup score is not visible.");
    expect(scoreBounds.x - openingBounds.x).toBeLessThan(openingBounds.width * 0.1);
    expect(scoreBounds.y - openingBounds.y).toBeLessThan(openingBounds.height * 0.15);
    const original = await avatar.evaluate((element) => getComputedStyle(element).transform);
    await page.keyboard.press("Space"); await page.clock.runFor(100);
    await expect(score).not.toHaveAttribute("aria-label", "Flight score: 0");
    const raised = await avatar.evaluate((element) => getComputedStyle(element).transform);
    expect(raised).not.toBe(original);
    const wing = opening.locator("#moguri-left-wing");
    expect(await wing.evaluate((element) => getComputedStyle(element).animationName)).toBe(reduced ? "none" : "moguri-wing-flap");
    await flap.press("Enter"); await page.clock.runFor(100);
    await page.screenshot({ path: info.outputPath(reduced ? "startup-flight-reduced.png" : "startup-flight.png") });
    await page.clock.runFor(2000);
    const result = opening.getByRole("status", { name: "Flight status", exact: true });
    await expect(result).toContainText("Game over! Moguri fell.");
    const restart = opening.getByRole("button", { name: "Play again", exact: true });
    await expect(restart).toBeVisible();
    const landedScore = await score.textContent();
    await opening.getByText("Draft while waiting", { exact: true }).click();
    const input = opening.getByRole("textbox", { name: "Opening prompt", exact: true });
    await input.fill("Generated startup draft"); await input.press("Space"); await page.clock.runFor(100);
    await expect(input).toHaveValue("Generated startup draft ");
    expect(await score.textContent()).toBe(landedScore);
    await restart.press("Enter"); await page.clock.runFor(100);
    await expect(result).not.toContainText("Game over");
    await expect(flap).toBeVisible();
    await expect(input).toHaveValue("Generated startup draft ");
    expect(f.requests).toHaveLength(0);
    expect(f.service.controller.snapshot().budgetEntries).toHaveLength(0);
    await page.clock.resume(); gate.resolve();
    await expect(opening).toHaveCount(0);
    const review = page.getByRole("region", { name: "Opening draft review", exact: true });
    await expect(review.getByRole("textbox", { name: "Unapplied opening draft", exact: true })).toHaveValue("Generated startup draft ");
    await review.getByRole("button", { name: "Discard opening draft", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeVisible();
    expect(f.requests).toHaveLength(0); expect(errors).toEqual([]);
  } finally {
    gate.resolve(); f.service.profiles.snapshot = snapshot;
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.removeAllListeners("will-prevent-unload"); window.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    } });
    await app.close(); await f.close();
  }
});

test("startup stars award a visible bonus and light clouds end the round without delaying readiness", async ({}, info) => {
  const f = await setupFixture(), gate = Promise.withResolvers<void>();
  const snapshot = f.service.profiles.snapshot.bind(f.service.profiles);
  f.service.profiles.snapshot = async (...args: Parameters<typeof snapshot>) => { await gate.promise; return snapshot(...args); };
  const app = await launch(join(f.directory, "state"));
  try {
    const page = await app.firstWindow();
    await page.addInitScript(() => { Math.random = () => 0.5; });
    await page.reload();
    const opening = page.getByRole("region", { name: "Opening workspace", exact: true });
    const playfield = opening.getByRole("button", { name: "Flap Moguri's wings", exact: true });
    const mascot = opening.locator(".startup-flight-mascot");
    const result = opening.getByRole("status", { name: "Flight status", exact: true });
    const bonus = opening.getByRole("status", { name: "Flight bonus points", exact: true });
    await expect(playfield).toBeVisible(); await page.clock.install();
    await playfield.press("Space");
    let sawCloud = false;
    for (let step = 0; step < 65; step++) {
      if ((await result.textContent())?.includes("Game over")) break;
      const stars = opening.locator(".startup-flight-object.powerup svg");
      const target = await stars.count() ? await stars.first().boundingBox() : null;
      const player = await mascot.boundingBox();
      if (player && (!target || player.y + player.height / 2 > target.y + target.height / 2 + 4)) await playfield.press("Space");
      await page.clock.runFor(100);
      if (!sawCloud && await opening.locator(".startup-flight-object.obstacle").count()) {
        const cloud = await opening.locator(".startup-flight-object.obstacle svg").first().boundingBox(), arena = await playfield.boundingBox();
        if (cloud && arena && cloud.x + cloud.width <= arena.x + arena.width) {
          sawCloud = true;
          await page.screenshot({ path: info.outputPath("startup-flight-obstacles-and-stars.png") });
        }
      }
      if (await bonus.count()) break;
    }
    await expect(bonus).toHaveText("50 bonus points");
    expect(sawCloud).toBe(true);
    await page.clock.runFor(100); await expect(bonus).toHaveText("50 bonus points");
    for (let step = 0; step < 50; step++) {
      if ((await result.textContent())?.includes("Game over")) break;
      const clouds = opening.locator(".startup-flight-object.obstacle svg");
      const target = await clouds.count() ? await clouds.first().boundingBox() : null;
      const player = await mascot.boundingBox();
      if (player && target && player.y + player.height / 2 > target.y + target.height / 2 + 4) await playfield.press("Space");
      await page.clock.runFor(100);
    }
    await expect(result).toContainText("Game over! You hit a cloud.");
    await expect(opening.getByRole("button", { name: "Play again", exact: true })).toBeVisible();
    expect(f.requests).toHaveLength(0);
    expect(f.service.controller.snapshot().budgetEntries).toHaveLength(0);
    await page.clock.resume(); gate.resolve();
    await expect(opening).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toBeVisible();
  } finally { gate.resolve(); f.service.profiles.snapshot = snapshot; await app.close(); await f.close(); }
});
