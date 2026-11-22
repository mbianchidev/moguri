import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@moguri-dev/sdk";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Native upgrade confirmation qualification is macOS-only.");
test("native startup recognizes a healthy older service and a generated cancellation neither stops it nor opens a personal dialog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moguri-generated-native-upgrade-")), token = "generated-native-upgrade-token";
  let healthReads = 0, lifecycleRequests = 0;
  const server = createServer((request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ${token}`);
    if (request.url === "/v1/health") { healthReads++; response.end(JSON.stringify({ pid: process.pid, protocolVersion: PROTOCOL_VERSION - 1 })); }
    else { lifecycleRequests++; response.writeHead(500).end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Generated upgrade endpoint failed.");
  const original = JSON.stringify({ protocolVersion: PROTOCOL_VERSION - 1, pid: process.pid, token, baseUrl: `http://127.0.0.1:${address.port}`, wsUrl: `ws://127.0.0.1:${address.port}/v1/events` });
  const metadata = join(directory, "connection.json"); await writeFile(metadata, original, { mode: 0o600 });
  const child = spawn(process.env.MOGURI_TEST_APP ?? require("electron"), process.env.MOGURI_TEST_APP ? [] : ["."], {
    env: { ...process.env, MOGURI_STATE_DIR: directory, MOGURI_TEST_WINDOW: "hidden", MOGURI_TEST_SERVICE_UPGRADE: "cancel" }, stdio: ["ignore", "ignore", "pipe"],
  });
  let errors = ""; child.stderr!.on("data", (value: Buffer) => { errors = (errors + value.toString("utf8")).slice(-4096); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Generated native upgrade did not finish its cancellation.")); }, 10_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
    });
    expect(code).toBe(0); expect(healthReads).toBeGreaterThan(0); expect(lifecycleRequests).toBe(0);
    expect(errors).not.toContain("Moguri desktop startup failed");
    expect(await readFile(metadata, "utf8")).toBe(original);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
