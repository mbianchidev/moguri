import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { setupFixture } from "../../tests/fixture.ts";

const fixture = await setupFixture({
  workerPath: fileURLToPath(new URL("../../dist/worker.mjs", import.meta.url)),
  responseMode: "text",
});
console.log(JSON.stringify({ type: "ready", connection: fixture.service.connection, sessionId: fixture.sessionId }));
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const value = JSON.parse(line);
    if (value.action === "quit") { console.log(JSON.stringify({ id: value.id, ok: true })); break; }
    console.log(JSON.stringify({ id: value.id, ok: true, snapshot: fixture.service.controller.snapshot(), requests: fixture.requests.length }));
  }
} finally { await fixture.close(); }
