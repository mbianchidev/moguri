import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export async function qualifyDecisions({ packageRoot, directory }) {
  const { createRuntime, connectMoguri } = await import(pathToFileURL(join(packageRoot, "dist/sdk/node.mjs")).href);
  const requests = [], server = createServer((request, response) => {
    void (async () => {
      if (request.method === "GET" && request.url.endsWith("/models")) {
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: [{ id: "generated-fixed" }, { id: "generated-decision" }] })); return;
      }
      const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(input);
      assert.ok(["generated-fixed", "generated-decision"].includes(input.model));
      const tool = input.model === "generated-fixed" && !input.messages.some((message) => message.role === "tool");
      const text = input.model === "generated-decision" ? JSON.stringify({ answers: { action: { type: "choice", choice: "allow", confidence: 0.98,
        probabilities: { allow: 0.98, deny: 0.01, askUser: 0.01 } } } }) : "Generated installed fixed task completed.";
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: "generated-installed-response", object: "chat.completion.chunk", model: input.model,
        choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      chunk(tool ? { role: "assistant", tool_calls: [{ index: 0, id: "generated-installed-read", type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "generated.txt" }) } }] } : { role: "assistant", content: text });
      chunk({}, tool ? "tool_calls" : "stop");
      response.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 } })}\n\n`);
      response.end("data: [DONE]\n\n");
    })().catch((error) => { console.error("Generated installed decision provider failed:", error.message); if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const root = join(directory, "project"), stateDir = join(directory, "state"); await mkdir(root, { recursive: true });
  await writeFile(join(root, "generated.txt"), "Generated external consumer source; read only.\n");
  const provider = { state: { status: "disconnected", models: [], login: null, diagnostic: null }, onChange() {},
    async refresh() { this.onChange(); }, login() { throw new Error("No personal authentication in installed decision qualification."); },
    async cancel() {}, async logout() {}, async prepare() { throw new Error("No hidden generative/provider fallback."); } };
  const secrets = new Map(), vault = { read: async (id) => secrets.get(id) ?? null, write: async (id, value) => { secrets.set(id, value); }, remove: async (id) => { secrets.delete(id); } };
  const options = { stateDir, provider, retentionKey: Buffer.alloc(32, 0x67), platform: { vault, models: { vault }, terminal: { vault } } };
  let runtime, sdk;
  try {
    runtime = await createRuntime(options); sdk = await connectMoguri({ stateDir, autoStart: false });
    const project = await sdk.command({ type: "project.add", path: root });
    const current = structuredClone(sdk.settings.get());
    current.values.localModels = ["generated-fixed", "generated-decision"].map((id) => ({ id, name: id, enabled: true,
      baseUrl: `http://127.0.0.1:${address.port}/v1`, auth: "none", models: [{ id, name: id, contextWindow: 32768, maxTokens: 2048, imageInput: false }] }));
    current.values.permissions.tools = [{ id: "generated-installed-read", tool: "read_file", decision: "allow", pathPrefix: "generated.txt" }];
    await sdk.settings.update(current.values, current.revision); await sdk.models.refresh();
    const models = sdk.getState().snapshot.provider.models, fixed = models.find((model) => model.apiModelId === "generated-fixed"), decision = models.find((model) => model.apiModelId === "generated-decision");
    assert.ok(fixed && decision);
    const settings = structuredClone(sdk.settings.get()); settings.values.decisions = { ...settings.values.decisions, enabled: true, modelId: decision.id, outputTokens: 256 };
    await sdk.settings.update(settings.values, settings.revision);
    // Qualify explicit bounded Max delegation, not newly selected automatic tool approval.
    const created = await sdk.sessions.create(project.id, "Generated installed owned decision", { modelId: fixed.id, autonomy: "Autopilot Max",
      ...(sdk.getState().snapshot.protocolVersion >= 65 ? { automaticApprovals: false } : {}) });
    assert.equal((await sdk.decisions.status(created.id)).ready, true);
    await sdk.command({ type: "draft.save", sessionId: created.id, expectedRevision: 0, text: "Read the exact generated external source.", attachments: [] });
    await sdk.command({ type: "message.send", sessionId: created.id, expectedRevision: 1, delivery: "queue" });
    const deadline = Date.now() + 10000;
    while (runtime.controller.snapshot().sessions.find((session) => session.id === created.id).status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(runtime.controller.snapshot().sessions.find((session) => session.id === created.id).status, "completed");
    await sdk.refresh(); const record = sdk.decisions.list(created.id)[0]; assert.ok(record);
    assert.equal(record.status, "applied"); assert.equal(record.applied.actor, "decision-provider"); assert.equal(record.cleanup, "owned-worker-stopped");
    assert.deepEqual(runtime.controller.snapshot().budgetEntries.map((entry) => entry.role), ["solver", "decision", "solver"]);
    assert.equal((await sdk.budgets.status(created.id)).status.totals.reportedTokens, 126);
    const original = await sdk.decisions.read(record.id);
    const cli = join(packageRoot, "bin/moguri.mjs"), result = await promisify(execFile)(process.execPath, [cli, "decisions", "read", record.id], { env: { ...process.env, MOGURI_STATE_DIR: stateDir } });
    assert.equal(JSON.parse(result.stdout).decision.applied.actor, "decision-provider");
    const shared = await sdk.slash(created.id, "/decisions read " + record.id, "tui"); assert.equal(JSON.parse(shared.text).decision.id, record.id);
    assert.equal(JSON.parse((await sdk.artifacts.export(record.id)).export.text).schemaVersion, 9);
    await sdk.sessions.delete(created.id, true); assert.equal((await sdk.decisions.read(record.id)).result, original.result);
    sdk.disconnect(); await runtime.close(); runtime = await createRuntime(options); sdk = await connectMoguri({ stateDir, autoStart: false });
    assert.equal((await sdk.decisions.read(record.id)).result, original.result); assert.equal(runtime.controller.snapshot().budgetEntries.length, 3);
    assert.equal(requests.filter((request) => request.model === "generated-fixed").length, 2); assert.equal(requests.filter((request) => request.model === "generated-decision").length, 1);
    return "Actual packed SDK/runtime/worker/CLI/shared explicitly bounded Max decisions retained exact delegation, provider actor, 126 all-role tokens, export-9 raw evidence and source-deletion/restart without a paid replay or model fallback.";
  } finally {
    sdk?.disconnect();
    try { await runtime?.close(); }
    finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  }
}
