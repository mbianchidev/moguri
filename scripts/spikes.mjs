import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { createModels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import * as pty from "node-pty";

await mkdir(".moguri", { recursive: true });
const temporary = await mkdtemp(resolve(".moguri/spike-"));
const results = [];
const measure = async (name, run) => {
  const started = performance.now();
  try {
    const detail = await run();
    results.push({ name, status: "PASS", elapsedMs: performance.now() - started, ...detail });
  } catch (error) {
    results.push({ name, status: "FAIL", elapsedMs: performance.now() - started, error: String(error) });
  }
};

try {
  await measure("Copilot OAuth, account discovery, streaming and cancellation (generated HTTP fixtures)", async () => {
    const originalFetch = globalThis.fetch;
    const models = createModels({
      credentials: new InMemoryCredentialStore(),
      authContext: { env: async () => undefined, fileExists: async () => false },
    });
    const provider = githubCopilotProvider();
    models.setProvider(provider);
    const model = provider.getModels().find((candidate) => candidate.api === "openai-completions");
    assert.ok(model);
    let deviceCodeSeen = false;
    let cancelNext = false;
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/login/device/code")) return Response.json({
        device_code: "generated-device", user_code: "TEST-0000",
        verification_uri: "https://github.com/login/device", expires_in: 900, interval: 1,
      });
      if (url.endsWith("/login/oauth/access_token")) return Response.json({ access_token: "generated-refresh" });
      if (url.endsWith("/copilot_internal/v2/token")) return Response.json({
        token: "generated-access", expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      if (url.endsWith("/models")) return Response.json({
        data: [{ id: model.id, model_picker_enabled: true, policy: { state: "enabled" } }],
      });
      if (url.endsWith("/chat/completions")) {
        if (cancelNext) return new Promise((_, reject) => {
          const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
          assert.ok(signal);
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        const chunk = (delta, finish_reason = null) => ({
          id: "generated-response", object: "chat.completion.chunk", model: model.id,
          choices: [{ index: 0, delta, finish_reason }],
        });
        const frames = [
          chunk({ role: "assistant", content: "Generated streaming response" }),
          chunk({}, "stop"),
          { choices: [], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } },
        ];
        return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    };
    try {
      await models.login("github-copilot", "oauth", {
        prompt: async () => "",
        notify: (event) => { if (event.type === "device_code") deviceCodeSeen = true; },
      });
      assert.equal(deviceCodeSeen, true);
      assert.deepEqual((await models.getAvailable()).map((candidate) => candidate.id), [model.id]);
      let text = "";
      const stream = models.streamSimple(model, { messages: [{ role: "user", content: "Generated task", timestamp: Date.now() }] }, { maxRetries: 0 });
      for await (const event of stream) if (event.type === "text_delta") text += event.delta;
      assert.equal(text, "Generated streaming response");
      assert.equal((await stream.result()).stopReason, "stop");
      cancelNext = true;
      const abort = new AbortController();
      const cancelling = models.streamSimple(model, { messages: [] }, { signal: abort.signal, maxRetries: 0 });
      const cancelledAt = performance.now();
      setTimeout(() => abort.abort(), 30);
      const result = await cancelling.result();
      assert.equal(result.stopReason, "aborted");
      return { requests: calls, cancellationMs: performance.now() - cancelledAt, network: "all HTTP intercepted; no personal account or paid inference used" };
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await measure("SQLite WAL append, crash rollback and projection rebuild", async () => {
    const path = join(temporary, "events.sqlite");
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE events (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL)");
    const append = db.prepare("INSERT INTO events (payload) VALUES (?)");
    const latencies = [];
    for (let i = 0; i < 1000; i++) {
      const started = performance.now();
      append.run(JSON.stringify({ type: "generated.event", index: i }));
      latencies.push(performance.now() - started);
    }
    latencies.sort((a, b) => a - b);
    db.close();
    const crashed = spawn(process.execPath, ["--input-type=module", "-e", `
      import {DatabaseSync} from "node:sqlite";
      const db=new DatabaseSync(process.argv[1]);
      db.exec("BEGIN; INSERT INTO events (payload) VALUES ('uncommitted')");
      process.kill(process.pid,"SIGKILL");
    `, path], { stdio: "ignore" });
    await new Promise((resolve) => crashed.once("exit", resolve));
    const recovered = new DatabaseSync(path);
    const started = performance.now();
    const projection = recovered.prepare("SELECT payload FROM events ORDER BY seq").all().map((row) => JSON.parse(row.payload));
    const rebuildMs = performance.now() - started;
    recovered.close();
    assert.equal(projection.length, 1000);
    assert.ok(latencies[949] < 20, "append p95 must be below 20 ms");
    return { events: projection.length, appendP95Ms: latencies[949], rebuildMs, crash: "uncommitted transaction rolled back" };
  });

  await measure("macOS PTY nested process cancellation", async () => {
    const terminal = pty.spawn("/bin/sh", ["-c", "sleep 60 & echo GENERATED_CHILD=$!; wait"], { cwd: temporary, cols: 80, rows: 24, env: { PATH: "/usr/bin:/bin" } });
    let childPid;
    const exited = new Promise((resolve) => terminal.onExit(resolve));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PTY child did not start")), 3000);
        terminal.onData((data) => {
          const match = data.match(/GENERATED_CHILD=(\d+)/);
          if (match) { childPid = Number(match[1]); clearTimeout(timer); resolve(); }
        });
      });
      const started = performance.now();
      process.kill(-terminal.pid, "SIGTERM");
      await Promise.race([exited, sleep(2000).then(() => { throw new Error("PTY did not exit"); })]);
      await sleep(150);
      let survivor = false;
      try { process.kill(childPid, 0); survivor = true; } catch (error) { if (error.code !== "ESRCH") throw error; }
      if (survivor) process.kill(childPid, "SIGKILL");
      assert.equal(survivor, false, "nested child survived SIGTERM");
      return { cancellationMs: performance.now() - started, survivors: 0, platforms: "macOS arm64 only; Linux not verified" };
    } finally {
      try { process.kill(-terminal.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  });

  // The OpenTUI rendering spike moved with the TUI to moguri-dev/moguri-tui, whose TUI tests render through OpenTUI.
  await measure("Electron shell, long timeline startup, memory and scrolling", async () => {
    const electron = (await import("electron")).default;
    const child = spawn(electron, [resolve("scripts/spike-electron.cjs")], { stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(code, 0, stderr);
    const report = JSON.parse(stdout.trim().split("\n").findLast((line) => line.startsWith("{")));
    assert.ok(report.coldStartMs < 3000, "cold start must be below 3 s");
    assert.ok(report.memoryMiB < 600, "shell aggregate memory must be below 600 MiB");
    assert.ok(report.scrollFrameMs < 40, "scroll frame must be below 40 ms");
    return report;
  });

  await measure("Node filesystem and Git CLI bounded baseline", async () => {
    const repo = join(temporary, "generated-repository");
    await mkdir(repo);
    for (let group = 0; group < 20; group++) {
      const directory = join(repo, `group-${group}`);
      await mkdir(directory);
      await Promise.all(Array.from({ length: 100 }, (_, i) => writeFile(join(directory, `fixture-${i}.txt`), "generated fixture\n")));
    }
    execFileSync("git", ["init", "--quiet", repo]);
    const started = performance.now();
    const files = await readdir(repo, { recursive: true });
    const searchMs = performance.now() - started;
    const gitStarted = performance.now();
    const status = execFileSync("git", ["-C", repo, "status", "--porcelain=v1", "-uall"], { encoding: "utf8" });
    const gitStatusMs = performance.now() - gitStarted;
    assert.equal(status.trim().split("\n").length, 2000);
    assert.ok(searchMs < 500 && gitStatusMs < 1000);
    return { generatedFiles: 2000, entries: files.length, searchMs, gitStatusMs, nativeComparison: "not run: Rust toolchain unavailable" };
  });

  for (const [name, reason] of [
    ["Live Copilot and ds4 inference", "No user-authorized login or configured ds4 endpoint; fixture pass does not prove live entitlement."],
    ["Rust supervisor/addon and Linux process tree", "Rust toolchain and Linux execution host unavailable. Node PTY baseline measured separately."],
    ["Signed/notarized macOS and Linux CLI packaging", "No signing/notarization identity or Linux host; development packaging only."],
    ["Native SendBox worker", "SendBox CLI and digest-pinned guest workload are not installed."],
    ["kupo quality, cost and candidate isolation", "No approved multi-model pool or evaluated classifier; not enabled in initial checkpoint."],
    ["Live System One decisions", "No configured decision provider or delegated policy; not enabled."],
    ["Remote SSH reconnect and worker cancellation", "No user-configured SSH target; arbitrary host discovery is prohibited."],
    ["Full attachments, inherited defaults and finite budgets", "Initial checkpoint will support explicit project text files and factory defaults only; unsupported choices must fail closed."],
  ]) results.push({ name, status: "FAIL", reason });
  console.log(JSON.stringify({ platform: process.platform, arch: process.arch, results }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
if (results.some((result) => result.status === "FAIL" && result.error)) process.exitCode = 1;
