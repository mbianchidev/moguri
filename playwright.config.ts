import { defineConfig } from "@playwright/test";
import { ciTime } from "./tests/fixtures/time-scale.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: ciTime(30_000),
  expect: { timeout: ciTime(10_000) },
  reporter: "list",
  use: { trace: "retain-on-failure" },
});
