import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptReviewFixture } from "./fixtures/script-review.ts";
import { isRecord, MoguriSdk } from "../packages/sdk/src/index.ts";
import { startService } from "../apps/service/src/server.ts";
import { waitFor } from "./fixture.ts";

test("the owning agent receives the entire source and assesses it before normal Manual execution approval", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture();
  try {
    await fixture.send("Generated complete repository-script review request.");
    const approval = await waitFor(() => fixture.session().pendingApproval?.call.name === "run_script" && fixture.session().pendingApproval);
    const review = fixture.review()!;
    assert.equal(review.advice?.verdict, "safe"); assert.equal(review.inspection.actor, "model");
    assert.equal(fixture.service.controller.events(0).some((event) => event.event_type === "tool.started" && event.payload.call.name === "run_script"), false);
    await fixture.sdk.approvals.respond(fixture.sessionId, approval.id, true);
    assert.equal((await fixture.terminal()).status, "completed");
    assert.ok(fixture.service.controller.events(0).some((event) => event.event_type === "tool.completed" && event.payload.call.name === "run_script" &&
      event.payload.outcome === "completed" && event.payload.text.includes("GENERATED_REVIEWED_RUN")));
    assert.equal((await fixture.sdk.scriptReviews.read(fixture.sessionId, review.id)).text, fixture.source);
  } finally { await fixture.close(); }
});

test("even explicit Autopilot cannot request execution approval or run an agent-reported unsafe script", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true, attemptUnsafe: true, autopilot: true });
  try {
    await fixture.send("Generated unsafe repository-script review request."); await fixture.terminal();
    assert.equal(fixture.review()?.advice?.verdict, "unsafe"); assert.equal(fixture.session().pendingApproval, null);
    const events = fixture.service.controller.events(0);
    assert.equal(events.some((event) => event.event_type === "tool.requested" && event.payload.approval.call.name === "run_script"), false);
    assert.equal(events.some((event) => event.event_type === "tool.started" && event.payload.call.name === "run_script"), false);
    await assert.rejects(() => access(join(fixture.project, "generated-script-result.txt")), { code: "ENOENT" });
  } finally { await fixture.close(); }
});

test("an explicit user force overrides only unsafe advice and still waits for Manual permission without another model call", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  try {
    await fixture.send("Generated unsafe repository-script review request."); await fixture.terminal();
    const review = fixture.review()!, calls = fixture.requests.length;
    const forced = await fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, review.revision, fixture.session().revision, "generated-original-script-force");
    const approval = await waitFor(() => fixture.session().pendingApproval);
    assert.equal(approval.call.name, "run_script"); assert.equal(fixture.review()?.force?.actor, "user");
    await assert.rejects(() => access(join(fixture.project, "generated-script-result.txt")), { code: "ENOENT" });
    await fixture.sdk.approvals.respond(fixture.sessionId, approval.id, true);
    assert.equal((await fixture.sdk.jobs.wait(forced.id!)).status, "completed");
    assert.equal(await readFile(join(fixture.project, "generated-script-result.txt"), "utf8"), "GENERATED_FORCED_RUN");
    assert.equal(fixture.requests.length, calls);
    await assert.rejects(() => fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, fixture.review()!.revision, fixture.session().revision), /retained|replay|original|exact/i);
  } finally { await fixture.close(); }
});

test("user force cannot adopt changed source bytes or lift a hard execution denial", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  try {
    await fixture.send("Generated unsafe repository-script review request."); await fixture.terminal();
    const review = fixture.review()!;
    await writeFile(join(fixture.project, "generated-script.sh"), fixture.source + "printf GENERATED_CHANGED_SOURCE\n");
    await assert.rejects(() => fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, review.revision, fixture.session().revision), /source|bytes|changed/i);
    assert.equal(fixture.review()?.force, null);
    await writeFile(join(fixture.project, "generated-script.sh"), fixture.source);
    const settings = fixture.sdk.settings.get()!;
    await fixture.sdk.settings.update({ ...settings.values, permissions: { ...settings.values.permissions,
      tools: [{ id: "generated-hard-script-denial", tool: "run_command", pathPrefix: "", decision: "deny" }] } }, settings.revision);
    await assert.rejects(() => fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, review.revision, fixture.session().revision), /denied|policy/i);
    assert.equal(fixture.review()?.force, null);
    await assert.rejects(() => access(join(fixture.project, "generated-script-result.txt")), { code: "ENOENT" });
  } finally { await fixture.close(); }
});

test("public repository scripts require website approval, deliver the whole source before assessment and never re-download on execution", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ publicUrl: true });
  try {
    await fixture.send("Generated public repository-script review request.");
    const inspect = await waitFor(() => fixture.session().pendingApproval?.call.name === "review_script" && fixture.session().pendingApproval);
    assert.equal(inspect.call.arguments.url, fixture.url); assert.equal(fixture.sourceReads(), 0);
    await fixture.sdk.approvals.respond(fixture.sessionId, inspect.id, true);
    const execute = await waitFor(() => fixture.session().pendingApproval?.call.name === "run_script" && fixture.session().pendingApproval);
    const review = fixture.review()!;
    assert.equal(review.source.url, fixture.url); assert.equal(review.advice?.verdict, "safe"); assert.equal(fixture.sourceReads(), 1);
    assert.equal((await fixture.sdk.scriptReviews.read(fixture.sessionId, review.id)).text, fixture.source);
    await fixture.sdk.approvals.respond(fixture.sessionId, execute.id, true);
    assert.equal((await fixture.terminal()).status, "completed");
    assert.equal(fixture.sourceReads(), 1, "The immutable source must not be fetched or replaced during execution.");
    assert.ok(fixture.requests.some((request) => Array.isArray(request.messages) && request.messages.some((message: unknown) => {
      if (!isRecord(message) || message.role !== "tool" || typeof message.content !== "string") return false;
      const result: unknown = JSON.parse(message.content);
      return isRecord(result) && result.text === fixture.source && result.complete === true;
    })));
  } finally { await fixture.close(); }
});

test("retained unsafe review survives genuine service restart and a missing force receipt cannot authorize another execution", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  let reopened: Awaited<ReturnType<typeof startService>> | undefined, sdk: MoguriSdk | undefined;
  try {
    await fixture.send("Generated retained script review."); await fixture.terminal();
    const original = structuredClone(fixture.review()!), calls = fixture.requests.length;
    fixture.sdk.disconnect(); await fixture.service.close();
    reopened = await startService({ stateDir: join(fixture.directory, "state"), provider: fixture.provider, retentionKey: fixture.retentionKey });
    sdk = await new MoguriSdk(reopened.connection).ready();
    assert.deepEqual((await sdk.scriptReviews.read(fixture.sessionId, original.id)).review, original);
    assert.equal(fixture.requests.length, calls);
    const session = () => reopened!.controller.snapshot().sessions.find((session) => session.id === fixture.sessionId)!;
    const commandId = "generated-retained-script-force";
    const command = { type: "script.review.force" as const, sessionId: fixture.sessionId, reviewId: original.id,
      expectedDigest: original.source.digest, expectedRevision: original.revision, expectedSessionRevision: session().revision, confirmUnsafe: true as const };
    const forced = await sdk.command(command, commandId);
    const approval = await waitFor(() => session().pendingApproval);
    await sdk.approvals.respond(fixture.sessionId, approval.id, true);
    assert.equal((await sdk.jobs.wait(forced.id!)).status, "completed");
    const attempts = reopened.controller.snapshot().scriptReviews[0]!.attempt;
    reopened.store.db.prepare("DELETE FROM receipts WHERE id=?").run(commandId);
    await assert.rejects(() => sdk!.command(command, commandId), /original|retained|exact|revision/i);
    assert.deepEqual(reopened.controller.snapshot().scriptReviews[0]!.attempt, attempts);
    assert.equal(fixture.requests.length, calls);
  } finally { sdk?.disconnect(); await reopened?.close(); await fixture.close(); }
});
