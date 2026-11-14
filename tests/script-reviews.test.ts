import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptReviewFixture } from "./fixtures/script-review.ts";
import { isRecord, MoguriSdk } from "../packages/sdk/src/index.ts";
import { startService } from "../apps/service/src/server.ts";
import { waitFor } from "./fixture.ts";
import { AttentionNotifier, type Banner } from "../apps/desktop/src/notifications.ts";
import { projectScriptReview } from "../packages/protocol/src/script-reviews.ts";

test("native review grants and results advance once without rebinding a source, owner or retained observation", { skip: process.platform !== "darwin" }, async () => {
  const f = await scriptReviewFixture({ autopilot: true });
  try {
    await f.send("Generated native projection contract."); await f.terminal();
    const original = structuredClone(f.review()!);
    assert.ok(original.attempt);
    const bound = { ...original, revision: original.revision + 1, nativeExecution: {
      version: 1 as const, executionId: "generated-native-execution", workspaceId: "generated-native-workspace",
      turnId: original.turnId, stepId: "generated-native-step", rootDigest: original.source.rootDigest,
      guestRootDigest: "1".repeat(64), resultDigest: null,
    } };
    assert.deepEqual(projectScriptReview(original, bound), bound);
    const observed = { ...bound, revision: bound.revision + 1, nativeExecution: { ...bound.nativeExecution, resultDigest: "2".repeat(64) } };
    assert.deepEqual(projectScriptReview(bound, observed), observed);
    for (const nativeExecution of [
      { ...bound.nativeExecution, executionId: "generated-replacement" },
      { ...bound.nativeExecution, guestRootDigest: "3".repeat(64) },
      { ...bound.nativeExecution, rootDigest: "4".repeat(64) },
    ]) assert.throws(() => projectScriptReview(bound, { ...bound, revision: bound.revision + 1, nativeExecution }), { code: "script_review_corrupt" });
    assert.throws(() => projectScriptReview(original, { ...bound, nativeExecution: { ...bound.nativeExecution, resultDigest: "2".repeat(64) } }), { code: "script_review_corrupt" });
    assert.throws(() => projectScriptReview(observed, { ...observed, revision: observed.revision + 1,
      nativeExecution: { ...observed.nativeExecution, resultDigest: null } }), { code: "script_review_corrupt" });
    assert.throws(() => projectScriptReview(observed, { ...observed, revision: observed.revision + 1,
      nativeExecution: { ...observed.nativeExecution, resultDigest: "3".repeat(64) } }), { code: "script_review_corrupt" });
  } finally { await f.close(); }
});

test("descriptive findings do not contradict an explicit safe full-source assessment", { skip: process.platform !== "darwin" }, async () => {
  const findings = ["The generated script prints one fixture value and does not access the network."];
  const fixture = await scriptReviewFixture({ findings });
  try {
    await fixture.send("Generated descriptive safe script findings.");
    const result = await waitFor(() => fixture.service.controller.events(0).find((event) => event.event_type === "tool.completed" &&
      event.payload.call.name === "review_script" && event.payload.call.arguments.action === "review"));
    assert.ok(result.event_type === "tool.completed");
    assert.equal(result.payload.isError, false, result.payload.text);
    assert.deepEqual(fixture.review()?.advice?.findings, findings);
    assert.equal(fixture.review()?.advice?.verdict, "safe");
    await waitFor(() => fixture.session().pendingApproval?.call.name === "run_script");
    await fixture.approve(false); await fixture.terminal();
  } finally { await fixture.close(); }
});

test("safe review approval clears only its notification, preserves an exact pending execution and survives restart without replay", { skip: process.platform !== "darwin" }, async () => {
  const f = await scriptReviewFixture();
  let reopened: Awaited<ReturnType<typeof startService>> | undefined, sdk: MoguriSdk | undefined;
  try {
    await f.send("Generated safe assessment for explicit review approval.");
    const approval = await waitFor(() => f.session().pendingApproval?.call.name === "run_script" && f.session().pendingApproval);
    await f.sdk.refresh();
    const review = f.review()!, calls = f.requests.length, notifications = f.sdk.attention.list().filter((entry) => entry.reason === "script-review");
    assert.equal(notifications.length, 1);
    const snapshot = f.service.controller.snapshot(), banners: Banner[] = [];
    new AttentionNotifier(0).observe({ ...snapshot, settings: { ...snapshot.settings,
      values: { ...snapshot.settings.values, notifications: { ...snapshot.settings.values.notifications, os: true, previewContent: false } } } },
    f.service.controller.events(0), false, (banner) => banners.push(banner));
    const banner = banners.find((entry) => entry.id === notifications[0]!.id);
    assert.equal(banner?.inbox, true);
    assert.equal(banner?.body, "Repository script assessments need your review.");
    await f.sdk.attention.acknowledge([notifications[0]!.id]);
    assert.equal(f.review()?.approval, undefined);
    assert.equal(f.sdk.attention.list().filter((entry) => entry.reason === "script-review").length, 1);
    const commandId = "generated-approve-safe-script";
    await f.sdk.scriptReviews.approve(f.sessionId, review.id, review.source.digest, review.revision, f.session().revision, commandId);
    assert.equal(f.review()?.approval?.actor, "user");
    assert.equal(f.review()?.approval?.commandId, commandId);
    assert.equal(f.review()?.revision, review.revision, "Review acknowledgement must not invalidate an admitted execution revision.");
    assert.equal(f.session().pendingApproval?.id, approval.id);
    assert.equal(f.sdk.attention.list().some((entry) => entry.reason === "script-review"), false);
    assert.equal(f.requests.length, calls);
    await f.sdk.approvals.respond(f.sessionId, approval.id, true);
    assert.equal((await f.terminal()).status, "completed");
    const original = structuredClone(f.review()!), totalCalls = f.requests.length;
    f.sdk.disconnect(); await f.service.close();
    reopened = await startService({ stateDir: join(f.directory, "state"), provider: f.provider, retentionKey: f.retentionKey });
    sdk = await new MoguriSdk(reopened.connection).ready();
    assert.deepEqual((await sdk.scriptReviews.read(f.sessionId, review.id)).review, original);
    assert.equal(sdk.attention.list().some((entry) => entry.reason === "script-review"), false);
    assert.equal(f.requests.length, totalCalls);
  } finally { sdk?.disconnect(); await reopened?.close(); await f.close(); }
});

test("review approval rejects unsafe, changed, concurrent and unpersisted decisions without lifting execution policy", { skip: process.platform !== "darwin" }, async () => {
  const unsafe = await scriptReviewFixture({ unsafe: true });
  try {
    await unsafe.send("Generated unsafe non-approval."); await unsafe.terminal();
    const review = unsafe.review()!;
    await assert.rejects(() => unsafe.sdk.scriptReviews.approve(unsafe.sessionId, review.id, review.source.digest, review.revision), /safe|force|exact/i);
    assert.equal(unsafe.review()?.approval, undefined);
    assert.equal(unsafe.session().pendingApproval, null);
  } finally { await unsafe.close(); }
  const f = await scriptReviewFixture({ autopilot: true });
  try {
    await f.send("Generated exact approval owner."); await f.terminal();
    const review = f.review()!, calls = f.requests.length;
    await writeFile(join(f.project, "generated-script.sh"), f.source + "# Generated changed bytes\n");
    await assert.rejects(() => f.sdk.scriptReviews.approve(f.sessionId, review.id, review.source.digest, review.revision), /source|changed|bytes/i);
    await writeFile(join(f.project, "generated-script.sh"), f.source);
    f.service.store.db.exec("CREATE TRIGGER generated_approval_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='script.review_approved' BEGIN SELECT RAISE(ABORT,'Generated approval persistence failure'); END");
    await assert.rejects(() => f.sdk.scriptReviews.approve(f.sessionId, review.id, review.source.digest, review.revision));
    f.service.store.db.exec("DROP TRIGGER generated_approval_failure");
    assert.equal(f.review()?.approval, undefined);
    await f.sdk.refresh();
    assert.equal(f.sdk.attention.list().filter((entry) => entry.reason === "script-review").length, 1);
    const sessionRevision = f.session().revision;
    const results = await Promise.allSettled([1, 2].map(() => f.sdk.scriptReviews.approve(f.sessionId, review.id, review.source.digest, review.revision, sessionRevision)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(f.service.controller.events(0).filter((event) => event.event_type === "script.review_approved").length, 1);
    assert.equal(f.requests.length, calls);
  } finally { await f.close(); }
});

test("a legitimate script larger than 64 KiB reaches the actual assessment model as one complete exact source", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true, sourcePadding: 96000 });
  try {
    await fixture.send("Generated larger complete-source review."); await fixture.terminal();
    assert.equal(fixture.review()?.source.bytes, Buffer.byteLength(fixture.source));
    assert.equal(fixture.review()?.advice?.verdict, "unsafe");
    assert.ok(fixture.requests.some((request) => Array.isArray(request.messages) && request.messages.some((value: unknown) => {
      if (!isRecord(value) || value.role !== "tool" || typeof value.content !== "string" || !value.content.startsWith("{")) return false;
      const result: unknown = JSON.parse(value.content);
      return isRecord(result) && result.complete === true && result.text === fixture.source;
    })));
    assert.equal(fixture.session().pendingApproval, null);
  } finally { await fixture.close(); }
});

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

test("the actual TUI queued force owns only its original command and still requires normal execution permission", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  try {
    await fixture.send("Generated queued script review."); await fixture.terminal();
    const review = fixture.review()!, original = fixture.session(), calls = fixture.requests.length;
    const text = `/script-review force ${review.id} ${review.revision} ${review.source.digest} ${original.revision} confirm-unsafe`;
    const saved = await fixture.sdk.command({ type: "draft.save", sessionId: original.id, expectedRevision: original.draft.revision, text, attachments: [] });
    await fixture.sdk.command({ type: "message.send", sessionId: original.id, expectedRevision: saved.revision!, delivery: "queue", client: "tui" });
    const execution = await waitFor(() => {
      const value = fixture.service.controller.snapshot().commandExecutions.find((entry) => entry.sessionId === original.id && entry.name === "script-review");
      return value && ["completed", "failed", "partial"].includes(value.status) ? value : null;
    });
    assert.equal(execution.status, "completed", execution.diagnostic ?? "");
    const approval = await waitFor(() => fixture.session().pendingApproval);
    assert.equal(approval.call.name, "run_script");
    await assert.rejects(() => access(join(fixture.project, "generated-script-result.txt")), { code: "ENOENT" });
    await fixture.sdk.approvals.respond(original.id, approval.id, true);
    await waitFor(() => fixture.session().turnId === null);
    assert.equal(await readFile(join(fixture.project, "generated-script-result.txt"), "utf8"), "GENERATED_FORCED_RUN");
    assert.equal(fixture.requests.length, calls);
    assert.equal(fixture.session().queue.length, 0);
  } finally { await fixture.close(); }
});

test("a complete safe review still follows explicitly delegated Autopilot policy without another approval or model", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ autopilot: true });
  try {
    await fixture.send("Generated explicit automatic reviewed script.");
    assert.equal((await fixture.terminal()).status, "completed");
    assert.equal(fixture.session().pendingApproval, null);
    assert.ok(fixture.service.controller.events(0).some((event) => event.event_type === "tool.decided" && event.payload.actor === "autonomy"));
    assert.ok(fixture.review()?.attempt);
  } finally { await fixture.close(); }
});

test("failed original job persistence cannot start a forced script, publish an approval or authorize replay", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await scriptReviewFixture({ unsafe: true });
  try {
    await fixture.send("Generated retained failure-bound script review."); await fixture.terminal();
    const review = fixture.review()!, jobs = fixture.service.controller.snapshot().jobs.length;
    fixture.service.store.db.exec("CREATE TRIGGER generated_script_job_failure BEFORE INSERT ON events WHEN json_extract(NEW.data,'$.event_type')='job.started' BEGIN SELECT RAISE(ABORT,'Generated script job persistence failure'); END;");
    await assert.rejects(() => fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, review.revision, fixture.session().revision));
    fixture.service.store.db.exec("DROP TRIGGER generated_script_job_failure");
    assert.equal(fixture.session().turnId, null); assert.equal(fixture.session().pendingApproval, null);
    assert.equal(fixture.service.controller.snapshot().jobs.length, jobs);
    await assert.rejects(() => access(join(fixture.project, "generated-script-result.txt")), { code: "ENOENT" });
    const retained = fixture.review()!;
    assert.equal(retained.force?.actor, "user"); assert.ok(retained.attempt);
    await assert.rejects(() => fixture.sdk.scriptReviews.force(fixture.sessionId, review.id, review.source.digest, retained.revision, fixture.session().revision), /original|retained|exact/i);
  } finally { await fixture.close(); }
});
