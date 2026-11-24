import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { MoguriSdk, type VirtualDiskStatus } from "@moguri-dev/sdk";
import type { VirtualDiskOptions } from "@moguri-dev/sdk/testing";
import { setupFixture } from "../fixture.ts";
import { ciTime } from "../fixtures/time-scale.ts";

const require = createRequire(import.meta.url), GiB = 1024 ** 3;
test.skip(process.platform !== "darwin", "The session disk UI is qualified on macOS.");

test("the session disk shows a live usage bar in the sidebar and Settings, warns when full and disappears when off", async () => {
  // A generated driver: real folders stand in for the mounted volume, and the test sets its free space.
  const space = { freeBytes: 40 * GiB, totalBytes: 50 * GiB };
  const driver: NonNullable<VirtualDiskOptions["driver"]> = { supported: true, create: async () => {}, attach: async () => {}, detach: async () => {},
    resize: async () => {}, compact: async () => {}, mounted: () => true, space: () => ({ ...space }) };
  const fixture = await setupFixture({ virtualDisk: { driver, intervalMs: 100 } });
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(fixture.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const status = async (): Promise<VirtualDiskStatus> => (await sdk.application.disk.status()).disk;
  try {
    const page = await app.firstWindow(), sidebar = page.getByRole("button", { name: /^Session disk: / });
    await expect(page.getByRole("button", { name: /^Current profile: / })).toBeVisible();
    await expect(sidebar).toHaveCount(0);

    await sdk.application.disk.configure(50, 0);
    await expect.poll(async () => (await status()).disk?.status, { timeout: ciTime(10_000) }).toBe("ready");
    await expect(sidebar).toHaveAccessibleName("Session disk: 10.0 GB used of 50.0 GB, 40.0 GB free. Open Retention settings");
    await expect(sidebar.locator(".disk-usage-bar")).toHaveAttribute("data-disk-tone", "ready");

    space.freeBytes = 20 * GiB;
    await expect(sidebar).toHaveAccessibleName(/^Session disk: 30\.0 GB used of 50\.0 GB, 20\.0 GB free/, { timeout: ciTime(5000) });

    space.freeBytes = 1 * GiB;
    await expect(sidebar.locator(".disk-usage-bar")).toHaveAttribute("data-disk-tone", "paused", { timeout: ciTime(5000) });
    await expect(sidebar).toHaveAccessibleName(/Full: work on the disk is paused/);
    await sidebar.click();
    const settings = page.getByRole("region", { name: "Session disk", exact: true });
    const meter = settings.getByRole("meter", { name: "Session disk usage", exact: true });
    await expect(meter).toHaveAttribute("aria-valuetext", /^Session disk: 49\.0 GB used of 50\.0 GB, 1\.0 GB free\. Full/);
    await expect(settings.getByRole("status")).toContainText("Full: work on the disk is paused.");

    space.freeBytes = 40 * GiB;
    await expect(meter).toHaveAttribute("aria-valuetext", "Session disk: 10.0 GB used of 50.0 GB, 40.0 GB free", { timeout: ciTime(5000) });
    await settings.getByLabel("Limit session worktrees to a virtual disk", { exact: true }).uncheck();
    await expect.poll(async () => (await status()).disk?.status, { timeout: ciTime(10_000) }).toBe("off");
    await expect(meter).toHaveCount(0);
    await expect(sidebar).toHaveCount(0);
  } finally { sdk.disconnect(); await app.close(); await fixture.close(); }
});
