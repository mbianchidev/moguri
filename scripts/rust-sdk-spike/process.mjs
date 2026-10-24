import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { repo } from "./paths.mjs";
export class JsonProcess {
  constructor(command, args, quit = { action: "quit" }) {
    this.next = 0; this.pending = new Map(); this.stderr = ""; this.quit = quit; this.started = performance.now();
    this.child = spawn(command, args, { cwd: repo, stdio: ["pipe", "pipe", "pipe"] });
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Readiness timed out: ${this.stderr}`)), 15000);
      this.onReady = (value) => { clearTimeout(timeout); this.startupMs = performance.now() - this.started; resolve(value); };
      this.onError = (error) => { clearTimeout(timeout); reject(error); };
    });
    this.exited = new Promise((resolve) => this.child.once("exit", (code) => {
      this.code = code; this.onError(new Error(`Child exited ${code}: ${this.stderr}`));
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error(this.stderr)); }
      this.pending.clear(); resolve(code);
    }));
    this.child.on("error", (error) => this.onError(error));
    this.child.stderr.on("data", (bytes) => { this.stderr += bytes.toString(); });
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      let value;
      try { value = JSON.parse(line); } catch { this.stderr += "\n" + line; return; }
      if (value.type === "ready") this.onReady(value);
      else if (this.pending.has(value.id)) {
        const item = this.pending.get(value.id); this.pending.delete(value.id); clearTimeout(item.timer); item.resolve(value);
      }
    });
  }
  ask(value) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Action timeout ${JSON.stringify(value)}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...value, id }) + "\n");
    });
  }
  async close() {
    if (this.code !== undefined) { assert.equal(this.code, 0, this.stderr); return; }
    try { await this.ask(this.quit); } finally { this.child.stdin.end(); }
    const timer = setTimeout(() => this.child.kill("SIGTERM"), 8000);
    await this.exited; clearTimeout(timer); assert.equal(this.code, 0, this.stderr);
  }
}
export function summary(values) {
  assert.ok(values.length);
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1],
    p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) };
}
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
