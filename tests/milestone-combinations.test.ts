import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { isRecord, KUPO_MODEL_ID, PROTOCOL_VERSION, type Controls } from "../packages/sdk/src/index.ts";
import { frameDigest } from "../apps/service/src/worker-wire.ts";
import { remoteRootLease } from "../apps/service/src/remote.ts";
import { routedFixture } from "./fixtures/single-routing.ts";
import { generatedDocx } from "./fixtures/documents.ts";
import { initializeGeneratedRepository } from "./fixtures/git-project.ts";
import { nativeConfiguration } from "./fixtures/native-target.ts";
import { nativeMilestoneFixture } from "./fixtures/native-milestone-api.ts";
import { waitFor } from "./fixture.ts";
import {
  configureMilestoneRouting, milestoneAxes, milestoneBudget, milestoneCellId, milestoneResponses, nativeMilestoneWitness, requiredMilestoneCells,
  type MilestoneCell, type MilestoneFixture,
} from "./fixtures/milestone-combinations.ts";

const cells = requiredMilestoneCells();
const sourceCells = cells.filter((cell) => cell.env !== "Sandbox");
const nativeCells = cells.filter((cell) => cell.env === "Sandbox");
const native = await nativeConfiguration(true);
const nativeGroups = process.env.MOGURI_NATIVE_GROUPS;
const nativeGroupMode = nativeGroups !== undefined;
const concurrency = 4, cellTimeout = 45000, setupTimeout = 15000;
const actorGroupTimeout = setupTimeout + cellTimeout * milestoneAxes.autonomy.length * milestoneAxes.budget.length;
const sourceGroupTimeout = setupTimeout + cellTimeout * milestoneAxes.window.length * milestoneAxes.input.length;
let documentCapture = Promise.resolve();

async function captureDocument(fixture: MilestoneFixture, sessionId: string, path: string) {
  const previous = documentCapture, release = Promise.withResolvers<void>();
  documentCapture = release.promise;
  await previous;
  try { return await fixture.sdk.attachments.document(sessionId, path); }
  finally { release.resolve(); }
}

test("the required milestone cell map is the complete Cartesian set, with native-unqualified cells retained separately", () => {
  assert.equal(cells.length, 10080);
  assert.equal(new Set(cells.map(milestoneCellId)).size, cells.length);
  assert.equal(sourceCells.length, 6720);
  assert.equal(cells.filter((cell) => cell.env === "Sandbox").length, 3360);
  assert.equal(cells.filter((cell) => cell.selection === "fixed" || cell.effort === "default").length, 3168);
  assert.equal(cells.filter((cell) => cell.selection !== "fixed" && cell.effort !== "default").length, 6912);
  for (const [axis, values] of Object.entries(milestoneAxes)) {
    for (const value of values) {
      assert.equal(cells.filter((cell) => cell[axis as keyof MilestoneCell] === value).length, cells.length / values.length);
    }
  }
});

test("missing qualification artifacts retain every required not-run/native-unqualified cell instead of dropping the report", {
  skip: process.platform !== "darwin", timeout: 15000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "moguri-generated-matrix-preflight-"));
  try {
    await mkdir(join(directory, "dist/desktop/renderer/assets"), { recursive: true });
    await writeFile(join(directory, "fixture.txt"), "Generated empty qualification root, never a release or model call.\n");
    initializeGeneratedRepository(directory);
    await assert.rejects(() => promisify(execFile)(process.execPath, [
      "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      "--test", "--test-name-pattern", "^required Local/SSH source cells",
      resolve("tests/milestone-combinations.test.ts"),
    ], { cwd: directory, timeout: 10000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } }), (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && error.code === 1);
      assert.ok("stdout" in error && typeof error.stdout === "string");
      assert.match(error.stdout, /ENOENT/);
      return true;
    });
    const report = JSON.parse(await readFile(join(directory, ".test-output/milestone-combinations/source-report.json"), "utf8"));
    assert.equal(report.sourceStatus, "INCOMPLETE");
    assert.equal(report.sourcePassed, 0);
    assert.equal(report.nativeStatus, "UNQUALIFIED");
    assert.equal(report.nativeUnqualified, 3360);
    assert.match(report.diagnostic, /ENOENT/);
    assert.deepEqual(report.identity.inputs, {});
    assert.equal(report.cells.filter((cell: { outcome: string }) => cell.outcome === "not-run").length, 6720);
    assert.equal(report.cells.filter((cell: { outcome: string }) => cell.outcome === "native-unqualified").length, 3360);
    assert.equal(new Set(report.cells.map((cell: { id: string }) => cell.id)).size, 10080);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function runCell(fixture: MilestoneFixture, cell: MilestoneCell, options: { window?: number; question?: boolean; image?: boolean } = {}) {
  const cellDeadline = Date.now() + cellTimeout;
  const contextWindow = options.window ?? (cell.window === "maximum" ? 32768 : 16384);
  const modelOptions: Controls["modelOptions"] = {
    contextWindow, ...(cell.effort === "default" ? {} : { thinkingEffort: cell.effort }),
  };
  if (cell.selection !== "fixed" && cell.effort !== "default") {
    const before = fixture.service.controller.snapshot(), requests = fixture.requests.length + fixture.solver.requests.length;
    await assert.rejects(() => fixture.sdk.sessions.create(fixture.session().projectId, milestoneCellId(cell), {
      env: cell.env, modelId: KUPO_MODEL_ID, autonomy: cell.autonomy, budget: milestoneBudget(cell.budget), modelOptions,
    }), (error: unknown) => error instanceof Error && "code" in error && error.code === "routing_effort");
    const after = fixture.service.controller.snapshot();
    assert.equal(after.seq, before.seq);
    assert.equal(after.sessions.length, before.sessions.length);
    assert.equal(after.budgetEntries.length, before.budgetEntries.length);
    assert.equal(fixture.requests.length + fixture.solver.requests.length, requests);
    assert.equal(after.executions.length, before.executions.length);
    assert.equal(after.sandboxExecutions?.length, before.sandboxExecutions?.length);
    return {
      id: milestoneCellId(cell), outcome: cell.env === "Sandbox" ? "native-pass" as const : "source-pass" as const,
      coverage: "manual-kupo-effort-rejected" as const, controls: { modelId: KUPO_MODEL_ID, modelOptions },
      roles: [], calls: 0, reportedTokens: 0, billedUsd: null, models: [], profileId: after.profileId,
      rootDigest: null, peerDigest: null, targetDigest: null, rootLease: null, workerDigest: null,
      cleanup: "not-started", rejection: { code: "routing_effort", beforeSeq: before.seq, afterSeq: after.seq },
      nativeReceipt: undefined,
    };
  }
  const created = await fixture.sdk.sessions.create(fixture.session().projectId, milestoneCellId(cell), {
    env: cell.env, modelId: cell.selection === "fixed" ? fixture.solverId : KUPO_MODEL_ID,
    budget: milestoneBudget(cell.budget), modelOptions,
  });
  const sessionId = created.id!;
  const session = () => fixture.service.controller.snapshot().sessions.find((value) => value.id === sessionId)!;
  await fixture.sdk.sessions.autonomy(sessionId, cell.autonomy);
  const text = `Generated original required cell ${milestoneCellId(cell)}.${options.question ? " Generated actual-question case." : ""}`;
  await fixture.sdk.command({ type: "draft.save", sessionId, expectedRevision: session().draft.revision, text, attachments: [] });
  let documentId: string | undefined;
  let documentPath: string | undefined;
  if (cell.input === "image" || options.image) {
    const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: { r: 41, g: 82, b: 123 } } }).png().toBuffer();
    await fixture.sdk.attachments.image(sessionId, png.toString("base64"), "Generated matrix image");
  }
  if (cell.input === "document") {
    documentPath = join(fixture.directory, "generated-matrix.docx");
    await writeFile(documentPath, generatedDocx());
    documentId = (await captureDocument(fixture, sessionId, documentPath)).id!;
  }
  const observed = milestoneResponses(fixture, cell, documentId, options.question);
  const admittedDraft = session().draft;
  const image = admittedDraft.attachments.find((attachment) => attachment.kind === "image");
  const imageContent = image ? (await fixture.sdk.attachments.read(sessionId, image.id)).content : null;
  assert.ok(!image || imageContent?.kind === "image");
  const imageUri = imageContent?.kind === "image" ? `data:${imageContent.mimeType};base64,${imageContent.data}` : null;
  const before = fixture.service.controller.snapshot().seq;
  await fixture.sdk.command({ type: "message.send", sessionId, expectedRevision: admittedDraft.revision, delivery: "queue" });
  if (options.question && cell.autonomy !== "Autopilot Max") {
    const question = await waitFor(() => {
      if (fixture.service.controller.events(before).some((event) => event.session_id === sessionId && event.event_type === "turn.finished")) {
        throw new Error(`Required question ended before an actual answer: ${session().status}: ${session().lastError}; ${
        JSON.stringify(session().messages.filter((message) => message.role === "tool"))}`);
      }
      return fixture.service.controller.snapshot().questions.find((question) => question.sessionId === sessionId && question.status === "open");
    }, 15000);
    assert.equal(question.answer, null);
    assert.equal(fixture.service.controller.snapshot().decisions.some((decision) => decision.sessionId === sessionId), false);
    if (cell.autonomy === "Guided") {
      assert.equal(question.recommendation?.actor, "model");
      assert.equal(question.recommendation?.modelId, fixture.service.controller.snapshot().budgetEntries.find((entry) => entry.id === question.stepId)?.modelId);
    }
    await fixture.sdk.questions.answer(question.id, question.choices[0]!, question.revision);
  }
  await waitFor(() => !session().turnId && ["completed", "failed", "stopped", "partial"].includes(session().status),
    cell.env === "Sandbox" ? Math.max(0, cellDeadline - Date.now()) : 30000).catch((error: unknown) => {
    const snapshot = fixture.service.controller.snapshot();
    throw new Error(`Required cell ${milestoneCellId(cell)} did not settle: ${JSON.stringify({
      directory: fixture.directory, status: session().status, error: session().lastError, approval: session().pendingApproval,
      tools: session().messages.filter((message) => message.role === "tool"),
      executions: snapshot.sandboxExecutions?.filter((value) => value.sessionId === sessionId).map(({ id, status, diagnostic, cleanup }) => ({ id, status, diagnostic, cleanup })),
      calls: snapshot.budgetEntries.filter((entry) => entry.sessionId === sessionId).map(({ role, status }) => ({ role, status })),
    })}`, { cause: error });
  });
  assert.equal(session().status, "completed", `${milestoneCellId(cell)}: ${session().lastError ?? ""}`);
  let nativeReceipt: Record<string, unknown> | null = null;
  if (cell.env === "Sandbox") {
    const execution = await waitFor(() => fixture.service.controller.snapshot().sandboxExecutions?.find((value) =>
      value.sessionId === sessionId && value.cleanup === "owned-guest-stopped" && !fixture.service.controller.sandbox.owns(value.id)), 15000);
    const retained = (await fixture.sdk.sandbox.result(execution.id)).result;
    assert.ok(retained);
    assert.equal(retained.journal.status, "verified");
    const witness = await nativeMilestoneWitness(execution, retained);
    const proof: unknown = JSON.parse(witness.text);
    assert.ok(isRecord(proof) && Array.isArray(proof.calls));
    assert.equal(proof.platform, "linux");
    assert.ok(Number.isSafeInteger(proof.uid) && Number(proof.uid) > 0);
    assert.ok(Number.isSafeInteger(proof.pid) && Number(proof.pid) > 0);
    assert.equal(proof.runId, execution.id);
    assert.equal(observed.length, 0, "Controller inference is never a substitute for guest-owned calls.");
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.solver.requests.length, 0);
    for (const call of proof.calls) {
      assert.ok(isRecord(call) && typeof call.modelId === "string" && isRecord(call.request));
      observed.push({ modelId: call.modelId, request: call.request });
    }
    assert.equal(execution.workerDigest, native!.qualification!.workerDigest);
    assert.equal(execution.image, native!.image);
    assert.match(execution.nativeSessionId!, /^[a-f0-9]{32}$/);
    assert.match(execution.planDigest!, /^[a-f0-9]{64}$/);
    assert.match(execution.signerFingerprint!, /^[a-f0-9]{64}$/);
    assert.equal(execution.workerOutcome, "completed");
    assert.deepEqual(execution.config.qualification!.allowedDomains, ["api.githubcopilot.com"]);
    assert.deepEqual(execution.networkScope?.allowedDomains, ["api.githubcopilot.com"]);
    assert.equal(await readFile(join(fixture.project, "fixture.txt"), "utf8"), "generated original\n");
    nativeReceipt = {
      executionId: execution.id, nativeSessionId: execution.nativeSessionId, image: execution.image,
      workerDigest: execution.workerDigest, configurationDigest: execution.configDigest, planDigest: execution.planDigest,
      signerFingerprint: execution.signerFingerprint, frameCursor: execution.lastSequence, journal: retained.journal,
      rootDigest: frameDigest(execution.stage.workspace), sourceRootDigest: frameDigest(execution.sourceRoot), inputDigest: execution.inputDigest,
      witnessSha256: witness.digest, witnessBytes: witness.bytes, witnessAuditDigest: witness.auditDigest, witnessAfterId: witness.afterId,
      guestPid: proof.pid, uid: proof.uid,
      network: { kind: "provider-only-generated-inference", scope: execution.networkScope },
      sourceUnchanged: true, ownedGuestAbsent: true,
    };
  }
  const state = fixture.service.controller.snapshot();
  const entries = state.budgetEntries.filter((entry) => entry.sessionId === sessionId);
  const firstRoles = cell.selection === "fixed" || cell.selection === "automatic-single" ? ["solver"] :
    cell.selection === "single" ? ["router", "solver"] :
    cell.selection === "cascade" ? ["router", "draft", "critic", "escalation", "critic"] :
      ["router", "draft", "critic", "revision", "critic"];
  const roles = cell.input === "document" || options.question ? [
    ...firstRoles, ...(options.question && cell.autonomy === "Autopilot Max" ? ["decision"] : []),
    ...firstRoles.filter((role) => role !== "router"),
  ] : firstRoles;
  assert.deepEqual(entries.map((entry) => entry.role), roles);
  assert.equal(observed.length, roles.length);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.ok(entries.every((entry) => entry.env === cell.env && entry.status === "settled" && entry.reportedTokens === 42));
  const starts = fixture.service.controller.events(before).filter((event) => event.session_id === sessionId && event.event_type === "model.started");
  assert.equal(starts.length, observed.length);
  for (const [index, event] of starts.entries()) {
    assert.equal(event.profile_id, state.profileId);
    assert.equal(event.project_id, session().projectId);
    assert.equal(event.event_type, "model.started");
    if (event.event_type !== "model.started") assert.fail("A model start lost its actual event type.");
    assert.equal(event.payload.contextWindow, contextWindow);
    assert.ok(event.payload.contextEstimate! + 4096 < contextWindow);
    assert.equal(event.payload.modelId, observed[index]!.modelId);
    assert.equal(entries[index]!.outputLimit, 128);
    assert.equal(observed[index]!.request.max_tokens ?? observed[index]!.request.max_completion_tokens, 128);
    assert.equal(observed[index]!.request.reasoning_effort, event.payload.thinkingEffort);
    if (cell.effort !== "default") assert.equal(event.payload.thinkingEffort, cell.effort);
    if (["router", "critic"].includes(event.payload.role!)) assert.deepEqual(observed[index]!.request.tools ?? [], []);
  }
  const status = (await fixture.sdk.budgets.status(sessionId)).status;
  assert.equal(status.totals.knownReportedTokens, roles.length * 42);
  assert.equal(status.totals.unknownTokenCalls, 0);
  assert.equal(status.totals.billedUsd, null);
  assert.equal(state.budgetPlans.some((plan) => plan.sessionId === sessionId && plan.status === "held"), false);
  if (cell.budget === "tokens" || cell.budget === "both") assert.equal(status.remainingTokens, 1_000_000 - roles.length * 42);
  if (cell.budget === "usd" || cell.budget === "both") assert.ok(status.remainingUsd! > 0 && status.remainingUsd! < 10);
  assert.deepEqual(session().controls.modelOptions, modelOptions);
  assert.equal(session().controls.autonomy, cell.autonomy);
  assert.equal(session().controls.automaticApprovals, cell.autonomy.startsWith("Autopilot"));
  assert.equal(session().messages.filter((message) => message.role === "user").length, 1);
  assert.equal(session().messages.find((message) => message.role === "user")?.text,
    text + (admittedDraft.attachments.length ? `\n\nAttached: ${admittedDraft.attachments.map((attachment) => attachment.path).join(", ")}` : ""));
  const admission = fixture.service.controller.events(before).find((event) => event.session_id === sessionId && event.event_type === "turn.started");
  assert.ok(admission?.event_type === "turn.started");
  assert.equal(admission.payload.item.text, text);
  assert.deepEqual(admission.payload.item.attachments, admittedDraft.attachments);
  assert.ok(JSON.stringify(observed[0]!.request.messages).includes(text));
  const route = state.routings.find((routing) => routing.sessionId === sessionId);
  if (cell.selection === "fixed") assert.equal(route, undefined);
  else assert.equal(route?.plan?.pattern, cell.selection === "automatic-single" ? "single" : cell.selection);
  assert.equal(state.provider.models.find((model) => model.id === fixture.solverId)?.contextWindow, 32768);
  assert.equal(state.provider.models.find((model) => model.id === fixture.modelId)?.contextWindow, 32768);
  if (cell.input === "image" || options.image) {
    assert.equal(session().messages.find((message) => message.role === "user")?.attachments?.[0]?.kind, "image");
    assert.ok(imageUri);
    for (const call of observed) assert.ok(JSON.stringify(call.request.messages).includes(imageUri));
  }
  for (const call of observed.filter((call) => call.modelId === fixture.solverId)) {
    assert.doesNotMatch(JSON.stringify(call.request), /GENERATED_MATRIX_ROUTER_REASON_NOT_SOLVER_CONTEXT/);
  }
  if (cell.env === "Sandbox") for (const call of observed) {
    assert.equal(JSON.stringify(call.request).includes(fixture.project), false, "A controller source path cannot become guest model context.");
  }
  if (documentId) {
    assert.doesNotMatch(JSON.stringify(observed[0]!.request), /GENERATED_DOCUMENT_SECRET/);
    assert.ok(documentPath);
    for (const call of observed) {
      assert.equal(JSON.stringify(call.request).includes(documentPath), false);
      if (cell.env === "Remote") assert.equal(JSON.stringify(call.request).includes(fixture.project), false);
    }
    const tool = session().messages.find((message) => message.role === "tool");
    assert.equal(tool?.outcome, "completed");
    assert.match(tool!.text, /GENERATED_DOCUMENT_SECRET/);
    assert.doesNotMatch(tool!.text, /Generated table cell B/);
    assert.equal(session().messages.filter((message) => message.role === "tool").length, 1);
  }
  if (options.question) {
    const question = state.questions.find((question) => question.sessionId === sessionId)!;
    assert.equal(question.answer?.actor, cell.autonomy === "Autopilot Max" ? "decision-provider" : "user");
    if (cell.autonomy === "Autopilot Max") {
      const decision = state.decisions.find((decision) => decision.sessionId === sessionId)!;
      assert.equal(decision.status, "applied");
      assert.equal(decision.modelId, fixture.modelId);
      assert.equal(question.answer?.modelId, fixture.modelId);
      assert.equal(question.answer?.decisionId, decision.id);
      assert.deepEqual(observed.find((_call, index) => entries[index]?.role === "decision")?.request.tools ?? [], []);
    }
  }
  if (cell.env === "Remote") {
    const execution = await waitFor(() => fixture.service.controller.snapshot().executions.find((execution) =>
      execution.sessionId === sessionId && execution.cleanup === "owned-worker-stopped" &&
      !fixture.service.controller.remote.owns(execution.id)), 8000);
    assert.equal(execution.workspace, fixture.workspace);
    assert.equal(execution.workerDigest, fixture.service.controller.remote.readiness.workerDigest);
    assert.equal(execution.configDigest, frameDigest(execution.target));
    assert.ok(execution.workerPid && execution.workerPid !== process.pid);
    assert.equal(fixture.service.controller.remote.owns(execution.id), false);
    assert.equal(state.executions.filter((value) => value.sessionId === sessionId).length, 1);
  }
  const execution = fixture.service.controller.snapshot().executions.find((value) => value.sessionId === sessionId);
  const result = {
    id: milestoneCellId(cell), outcome: cell.env === "Sandbox" ? "native-pass" as const : "source-pass" as const, controls: session().controls, roles,
    coverage: "execution" as const,
    calls: observed.length, reportedTokens: roles.length * 42, billedUsd: status.totals.billedUsd,
    models: entries.map((entry) => ({ role: entry.role, modelId: entry.modelId, providerId: entry.providerId,
      apiModelId: entry.apiModelId, inputEstimate: entry.inputEstimate, outputLimit: entry.outputLimit,
      reportedTokens: entry.reportedTokens, planId: entry.planId })),
    profileId: state.profileId, rootDigest: nativeReceipt?.rootDigest ?? frameDigest(cell.env === "Remote" ? execution!.workspace :
      state.projects.find((project) => project.id === session().projectId)!.path),
    peerDigest: execution ? frameDigest(execution.target.hostKey) : null,
    targetDigest: execution?.configDigest ?? null,
    rootLease: execution ? remoteRootLease(execution.target, execution.workspace) : null,
    workerDigest: nativeReceipt?.workerDigest ?? execution?.workerDigest ?? null,
    cleanup: nativeReceipt ? "owned-guest-stopped" : execution?.cleanup ?? "authoritative-local-turn-settled",
    ...(nativeReceipt ? { nativeReceipt } : {}),
  };
  await fixture.sdk.sessions.delete(sessionId, true);
  return result;
}

test("native qualification reads an oversized original signed witness without relaxing user output limits", {
  skip: !native, timeout: 90000,
}, async () => {
  assert.ok(native);
  const fixture = await nativeMilestoneFixture(native);
  try {
    await configureMilestoneRouting(fixture, "cascade");
    const { configuration } = await fixture.sdk.projects.configuration(fixture.session().projectId);
    await fixture.sdk.projects.configure(configuration.projectId, { ...configuration.values,
      instructions: "Generated qualification context; not permission or instructions to execute tools.\n".repeat(64) }, configuration.revision);
    await runCell(fixture, { env: "Sandbox", selection: "cascade", autonomy: "Guided", budget: "unlimited",
      window: "maximum", effort: "default", input: "document" });
    const execution = fixture.service.controller.snapshot().sandboxExecutions![0]!;
    const result = (await fixture.sdk.sandbox.result(execution.id)).result;
    assert.ok(result);
    assert.equal(result.files.some((file) => file.path === "generated-native-matrix.json"), false);
    assert.ok(result.excluded.some((file) => file.path === "generated-native-matrix.json" && file.reason.includes("128-KiB")));
    const witness = await nativeMilestoneWitness(execution, result);
    assert.ok(witness.bytes > 128 * 1024 && witness.bytes <= 2 * 1024 * 1024);
  } finally { await fixture.close(); }
});

test("native finite critique document and text turns settle inside the existing cell deadline", {
  skip: !native, timeout: 90000,
}, async () => {
  assert.ok(native);
  const fixture = await nativeMilestoneFixture(native);
  try {
    await configureMilestoneRouting(fixture, "critique");
    for (const cell of [
      { autonomy: "Autopilot Max", budget: "usd", window: "half", effort: "default", input: "document" },
      { autonomy: "Autopilot", budget: "both", window: "maximum", effort: "default", input: "text" },
    ] as const) {
      await runCell(fixture, { env: "Sandbox", selection: "critique", ...cell });
    }
  } finally { await fixture.close(); }
});

test("reviewed native groups reject partial-cell and duplicate selections before creating a qualification journal", {
  skip: !native, timeout: 15000,
}, async () => {
  const directory = ".test-output/milestone-combinations";
  await mkdir(directory, { recursive: true });
  const before = (await readdir(directory)).filter((name) => name.startsWith("native-progress-")).sort();
  for (const [selection, diagnostic] of [
    [["critique/Autopilot/unlimited"], /Select only exact whole native groups/],
    [["critique/Autopilot", "critique/Autopilot"], /Duplicate group selection/],
    [[], /Select only exact whole native groups/],
  ] as const) {
    await assert.rejects(() => promisify(execFile)(process.execPath, [
      "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      "--test", "--test-name-pattern", "^reviewed native Sandbox groups execute",
      resolve("tests/milestone-combinations.test.ts"),
    ], { timeout: 10000, env: { ...process.env, NODE_TEST_CONTEXT: undefined, MOGURI_NATIVE_GROUPS: JSON.stringify(selection) } }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && error.code === 1);
      assert.ok("stdout" in error && typeof error.stdout === "string");
      assert.match(error.stdout, diagnostic); return true;
    });
  }
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith("native-progress-")).sort(), before);
});

for (const env of ["Local", "Remote", "Sandbox"] as const)
  for (const selection of milestoneAxes.selection)
    test(`exact arbitrary ${env}/${selection} window and genuine effort traverse the owning worker without changing capacity`, {
      skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 90000,
    }, async () => {
      const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
        await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
      try {
        await configureMilestoneRouting(fixture, selection);
        await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: selection === "fixed" ? "high" : "default", input: "text" }, { window: 24577 });
      } finally { await fixture.close(); }
    });

for (const env of ["Local", "Remote", "Sandbox"] as const) test(`${env} manual Kupo effort cells reject every level and workflow before dispatch`, {
  skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 60000,
}, async () => {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    for (const selection of milestoneAxes.selection) {
      if (selection === "fixed") continue;
      await configureMilestoneRouting(fixture, selection);
      for (const effort of milestoneAxes.effort) if (effort !== "default") {
        const result = await runCell(fixture, { env, selection, autonomy: "Autopilot Max", budget: "both",
          window: "half", effort, input: "document" });
        assert.equal(result.coverage, "manual-kupo-effort-rejected");
        assert.equal(result.cleanup, "not-started");
      }
    }
  } finally { await fixture.close(); }
});

for (const env of ["Local", "Remote", "Sandbox"] as const) for (const selection of milestoneAxes.selection)
test(`mixed approved image/document ${env}/${selection} context reaches every actual role without a path or body fallback`, {
  skip: process.platform !== "darwin" || env === "Sandbox" && !native, timeout: 90000,
}, async () => {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, selection);
    await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: selection === "fixed" ? "high" : "default", input: "document" }, { image: true });
  } finally { await fixture.close(); }
});

async function actorGroup(group: TestContext, env: MilestoneCell["env"], selection: MilestoneCell["selection"]) {
  const fixture = env === "Sandbox" ? await nativeMilestoneFixture(native!) :
    await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, selection);
    const settings = fixture.sdk.settings.get()!;
    await fixture.sdk.settings.update({
      ...settings.values, decisions: { ...settings.values.decisions, technicalQuestions: [{
        id: "generated-matrix-technical", kind: "technical-choice", question: "Choose a generated matrix approach?",
        choices: ["Generated first choice", "Generated second choice"],
      }] },
    }, settings.revision);
    for (const autonomy of milestoneAxes.autonomy) for (const budget of milestoneAxes.budget) {
      let passed = false;
      await group.test(`${autonomy}/${budget}`, { timeout: cellTimeout }, async () => {
        await runCell(fixture, { env, selection, autonomy, budget, window: "maximum", effort: "default", input: "text" }, { question: true });
        passed = true;
      });
      assert.ok(passed, "A required actual-actor/cap case failed; no later group case is inferred successful.");
    }
  } finally { await fixture.close(); }
}

test("every Local/SSH selection and cap preserves actual Manual/Guided/Autopilot answers or one bounded-model Max decision", {
  skip: process.platform !== "darwin", concurrency,
  timeout: setupTimeout + actorGroupTimeout * Math.ceil(2 * milestoneAxes.selection.length / concurrency),
}, async (t) => {
  await Promise.all((["Local", "Remote"] as const).flatMap((env) => milestoneAxes.selection.map((selection) =>
    t.test(`${env}/${selection}`, { timeout: actorGroupTimeout }, (group) => actorGroup(group, env, selection)))));
});

test("every native selection and cap preserves actual Manual/Guided/Autopilot answers or one bounded-model Max decision", {
  skip: !native, concurrency: 2, timeout: setupTimeout + actorGroupTimeout * Math.ceil(milestoneAxes.selection.length / 2),
}, async (t) => {
  await Promise.all(milestoneAxes.selection.map((selection) =>
    t.test(`Sandbox/${selection}`, { timeout: actorGroupTimeout }, (group) => actorGroup(group, "Sandbox", selection))));
});

for (const env of ["Local", "Remote"] as const) for (const selection of ["fixed", "automatic-single"] as const)
test(`configured ${env}/${selection} retains approved image/document drafts when its actual transport has no effort override`, {
  skip: process.platform !== "darwin", timeout: 30000,
}, async () => {
  const fixture = await routedFixture({ env, configured: false, legacy: false, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, "automatic-single");
    await fixture.sdk.sessions.configure(fixture.sessionId, {
      ...fixture.session().controls, env, modelId: selection === "fixed" ? fixture.solverId : KUPO_MODEL_ID,
      budget: milestoneBudget("both"),
    });
    await fixture.sdk.command({ type: "draft.save", sessionId: fixture.sessionId, expectedRevision: 0,
      text: "Generated unsent incompatible controls.", attachments: [] });
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#224466" } }).png().toBuffer();
    await fixture.sdk.attachments.image(fixture.sessionId, image.toString("base64"), "Generated preserved image");
    const path = join(fixture.directory, "generated-incompatible.docx");
    await writeFile(path, generatedDocx());
    await fixture.sdk.attachments.document(fixture.sessionId, path);
    const before = fixture.session();
    for (const thinkingEffort of milestoneAxes.effort) if (thinkingEffort !== "default") {
      await assert.rejects(() => fixture.sdk.sessions.modelOptions(fixture.sessionId, { contextWindow: 16384, thinkingEffort }),
        /thinking|effort|No configured model/i);
      assert.deepEqual(fixture.session().draft, before.draft);
      assert.deepEqual(fixture.session().controls, before.controls);
    }
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.solver.requests.length, 0);
    assert.equal(fixture.service.controller.snapshot().budgetEntries.length, 0);
  } finally { await fixture.close(); }
});

test("required Local/SSH source cells execute every independent control/input combination through the service and SDK", {
  skip: process.platform !== "darwin", concurrency, timeout: 7200000,
}, async (t) => {
  const groupId = (cell: MilestoneCell) => `${cell.env}/${cell.selection}/${cell.autonomy}/${cell.budget}/${cell.effort}`;
  const groups = [...new Set(sourceCells.map(groupId))];
  const completed = new Map<string, Awaited<ReturnType<typeof runCell>>>();
  const failed = new Map<string, string>(), completedGroups = new Set<string>();
  const identity: { commit: string; dirtyAtStart: boolean; protocol: number; node: string; inputs: Record<string, string> } = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtyAtStart: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    protocol: PROTOCOL_VERSION, node: process.version,
    inputs: {},
  };
  const startedAt = new Date().toISOString();
  const directory = ".test-output/milestone-combinations", runId = startedAt.replace(/\D/g, "");
  const journalPath = join(directory, `source-progress-${runId}.jsonl`);
  let journalWrites = Promise.resolve();
  const journal = (entry: object) => journalWrites = journalWrites.then(() => appendFile(journalPath, `${JSON.stringify(entry)}\n`));
  let diagnostic: string | null = null;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(journalPath, `${JSON.stringify({ version: 1, startedAt, sourceStatus: "RUNNING", nativeStatus: "UNQUALIFIED", axes: milestoneAxes })}\n`, { flag: "wx" });
    const paths = ["package.json", "package-lock.json", "scripts/worker-image/Containerfile",
      "apps/service/src/worker.ts", "apps/service/src/remote-bridge.ts", "dist/worker.mjs", "dist/remote-bridge.mjs",
      "apps/desktop/src/BudgetControls.tsx", "apps/desktop/src/SettingsPanel.tsx",
      "dist/mcp-worker.mjs", "dist/data-worker.mjs", "dist/service.mjs", "dist/cli.mjs", "dist/tui.mjs",
      "dist/runtime.mjs", "dist/sdk/index.mjs", "dist/desktop/main.mjs", "dist/desktop/renderer/index.html",
      ...(await readdir("dist/desktop/renderer/assets")).sort().map((name) => `dist/desktop/renderer/assets/${name}`),
      "tests/fixtures/single-routing.ts", "tests/fixtures/milestone-combinations.ts", "tests/milestone-combinations.test.ts",
      "tests/tui-milestone-combinations.test.ts", "tests/e2e/milestone-combinations.spec.ts"];
    identity.inputs = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
    await journal({ type: "identity", identity });
    await Promise.all(groups.map((group) => t.test(group, { timeout: sourceGroupTimeout }, async (groupTest) => {
      const required = sourceCells.filter((cell) => groupId(cell) === group);
      const first = required[0]!;
      assert.ok(first.env !== "Sandbox");
      const fixture = await routedFixture({ env: first.env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
      try {
        await configureMilestoneRouting(fixture, first.selection);
        const model = fixture.sdk.getState().snapshot!.provider.models.find((model) => model.id === fixture.solverId)!;
        assert.deepEqual(model.thinkingLevels, milestoneAxes.effort.filter((effort) => effort !== "default"));
        for (const cell of required) {
          let passed = false;
          await groupTest.test(milestoneCellId(cell), { timeout: cellTimeout }, async () => {
            try {
              const result = await runCell(fixture, cell);
              assert.equal(completed.has(result.id), false);
              await journal({ type: "cell", result });
              completed.set(result.id, result);
              passed = true;
            } catch (error) {
              failed.set(milestoneCellId(cell), error instanceof Error ? error.message : String(error));
              await journal({ type: "cell", result: { id: milestoneCellId(cell), outcome: "source-failed", diagnostic: failed.get(milestoneCellId(cell)) } });
              throw error;
            }
          });
          assert.ok(passed, `Required cell did not pass; remaining group cells are not qualification: ${milestoneCellId(cell)}`);
        }
      } finally { await fixture.close(); }
      await journal({ type: "group-cleanup-confirmed", group });
      completedGroups.add(group);
    })));
    assert.deepEqual([...completed.keys()].sort(), sourceCells.map(milestoneCellId).sort());
    assert.equal(completed.size, 6720);
    assert.equal(completedGroups.size, groups.length);
  } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const report = {
      version: 1, identity, startedAt, finishedAt: new Date().toISOString(),
      sourceStatus: completed.size === sourceCells.length && completedGroups.size === groups.length ? "PASS" : "INCOMPLETE", diagnostic,
      nativeStatus: "UNQUALIFIED", nativeImage: null, nativePhysicalReceipt: null,
      required: cells.length, sourcePassed: completed.size, nativeUnqualified: 3360, journalPath,
      coverage: { executions: [...completed.values()].filter((cell) => cell.coverage === "execution").length,
        controlRejections: [...completed.values()].filter((cell) => cell.coverage === "manual-kupo-effort-rejected").length },
      cells: cells.map((cell) => completed.get(milestoneCellId(cell)) ?? {
        id: milestoneCellId(cell), outcome: cell.env === "Sandbox" ? "native-unqualified" :
          failed.has(milestoneCellId(cell)) ? "source-failed" : "not-run",
        diagnostic: cell.env === "Sandbox" ? "This source-only report cannot substitute for the independent exact-current physical native matrix." :
          failed.get(milestoneCellId(cell)) ?? diagnostic ?? "Required source cell did not complete; no qualification inferred.",
      }),
    };
    await mkdir(directory, { recursive: true });
    const content = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(join(directory, `source-report-${runId}.json`), content, { flag: "wx" });
    await writeFile(join(directory, "source-report.json.tmp"), content);
    await rename(join(directory, "source-report.json.tmp"), join(directory, "source-report.json"));
  }
});

test(nativeGroupMode ? "reviewed native Sandbox groups execute every whole-group combination on the exact owned guest" :
  "required native Sandbox cells execute every independent control/input combination on the exact owned guest", {
  skip: !native, concurrency: 2, timeout: 14_400_000,
}, async (t) => {
  assert.ok(native);
  const groupId = (cell: MilestoneCell) => `${cell.selection}/${cell.autonomy}`;
  const allGroups = [...new Set(nativeCells.map(groupId))];
  let groups = allGroups;
  if (nativeGroupMode) {
    const requested: unknown = JSON.parse(nativeGroups);
    assert.ok(Array.isArray(requested) && requested.length > 0 &&
      requested.every((group: unknown) => typeof group === "string" && allGroups.includes(group)), "Select only exact whole native groups.");
    assert.equal(new Set(requested).size, requested.length, "Duplicate group selection cannot qualify repeated work.");
    groups = allGroups.filter((group) => requested.includes(group));
  }
  const requiredCells = nativeCells.filter((cell) => groups.includes(groupId(cell))), completedGroups = new Set<string>();
  const completed = new Map<string, Awaited<ReturnType<typeof runCell>>>(), failed = new Map<string, string>();
  const startedAt = new Date().toISOString(), runId = startedAt.replace(/\D/g, "");
  const directory = ".test-output/milestone-combinations", journalPath = join(directory, `native-progress-${runId}.jsonl`);
  const identity = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtyAtStart: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    protocol: PROTOCOL_VERSION, node: process.version, image: native.image, qualification: native.qualification,
    scope: { kind: nativeGroupMode ? "reviewed-whole-groups" : "whole-matrix", groups, wholeRequired: nativeCells.length },
    fixtureNetwork: { toolDomains: [], providerHosts: ["api.githubcopilot.com"], inference: "in-guest generated HTTP; real factory/cold network gates remain separate" },
    inputs: {} as Record<string, string>,
  };
  let writes = Promise.resolve(), diagnostic: string | null = null;
  const journal = (entry: object) => writes = writes.then(() => appendFile(journalPath, `${JSON.stringify(entry)}\n`));
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(journalPath, `${JSON.stringify({ version: 1, startedAt,
      ...(nativeGroupMode ? { nativeGroupStatus: "RUNNING" } : { nativeNominalStatus: "RUNNING" }), axes: milestoneAxes })}\n`, { flag: "wx" });
    const inputs = ["package.json", "package-lock.json", "dist/worker.mjs", "dist/remote-bridge.mjs", "dist/mcp-worker.mjs",
      "dist/service.mjs", "dist/runtime.mjs", "dist/sdk/index.mjs", "scripts/worker-image/Containerfile", "apps/service/src/native-evidence.ts",
      "tests/milestone-combinations.test.ts", "tests/fixtures/single-routing.ts", "tests/fixtures/native-target.ts", "tests/fixtures/native-api.ts",
      "tests/fixture.ts", "tests/fixtures/native-milestone-api.ts",
      "tests/fixtures/milestone-combinations.ts", "tests/fixtures/milestone-response.ts", "tests/fixtures/native-milestone-provider.mjs"];
    identity.inputs = Object.fromEntries(await Promise.all(inputs.map(async (path) =>
      [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
    await journal({ type: "identity", identity });
    await Promise.all(groups.map((group) => t.test(group, { timeout: 60_000 + nativeCells.length / allGroups.length * cellTimeout }, async (groupTest) => {
      const required = nativeCells.filter((cell) => groupId(cell) === group), first = required[0]!;
      const fixture = await nativeMilestoneFixture(native);
      try {
        await configureMilestoneRouting(fixture, first.selection);
        for (const cell of required) {
          let passed = false;
          await groupTest.test(milestoneCellId(cell), { timeout: cellTimeout }, async () => {
            try {
              const result = await runCell(fixture, cell);
              assert.equal(completed.has(result.id), false);
              await journal({ type: "cell", result });
              completed.set(result.id, result);
              passed = true;
            } catch (error) {
              failed.set(milestoneCellId(cell), error instanceof Error ? error.message : String(error));
              await journal({ type: "cell", result: { id: milestoneCellId(cell), outcome: "native-failed", diagnostic: failed.get(milestoneCellId(cell)) } });
              throw error;
            }
          });
          assert.ok(passed, `Required native cell failed; remaining group cells stay unqualified: ${milestoneCellId(cell)}`);
        }
      } finally { await fixture.close(); }
      await journal({ type: "group-cleanup-confirmed", group });
      completedGroups.add(group);
    })));
    assert.deepEqual([...completed.keys()].sort(), requiredCells.map(milestoneCellId).sort());
    assert.equal(completedGroups.size, groups.length);
    for (const [path, digest] of Object.entries(identity.inputs)) {
      assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), digest, `Native qualification inputs changed: ${path}`);
    }
  } catch (error) {
    diagnostic = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const qualified = new Map(diagnostic === null ? completed : []);
    for (const cell of requiredCells) if (!completedGroups.has(groupId(cell))) qualified.delete(milestoneCellId(cell));
    const report = {
      version: 1, identity, startedAt, finishedAt: new Date().toISOString(), diagnostic, journalPath,
      ...(nativeGroupMode ? { format: "moguri-native-group-qualification", wholeMatrixQualified: false,
        groupStatus: qualified.size === requiredCells.length ? "PASS" : "INCOMPLETE", selectedGroups: groups,
        groupPassed: qualified.size, groupObservedPassed: completed.size, groupUnqualified: requiredCells.length - qualified.size } :
        { nativeNominalStatus: qualified.size === nativeCells.length ? "PASS" : "INCOMPLETE",
          nativePassed: qualified.size, nativeObservedPassed: completed.size, nativeUnqualified: nativeCells.length - qualified.size }),
      required: requiredCells.length,
      coverage: { executions: [...qualified.values()].filter((cell) => cell.coverage === "execution").length,
        controlRejections: [...qualified.values()].filter((cell) => cell.coverage === "manual-kupo-effort-rejected").length },
      qualification: "Actual current guest executions with generated inference, plus separately counted pre-admission control rejections. Failure/ownership gates, clients, hosted CI and live model quality remain separate.",
      cells: requiredCells.map((cell) => qualified.get(milestoneCellId(cell)) ?? {
        ...completed.get(milestoneCellId(cell)),
        id: milestoneCellId(cell), outcome: failed.has(milestoneCellId(cell)) ? "native-failed" : "native-unqualified",
        diagnostic: completed.has(milestoneCellId(cell)) ? "The original cell was observed, but its complete group/cleanup did not qualify." :
          failed.get(milestoneCellId(cell)) ?? diagnostic ?? "Required physical cell did not complete; no qualification inferred.",
      }),
    };
    await writes;
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const name = nativeGroupMode ? "native-group-report" : "native-report";
    await writeFile(join(directory, `${name}-${runId}.json`), content, { flag: "wx" });
    await writeFile(join(directory, `${name}.json.tmp`), content);
    await rename(join(directory, `${name}.json.tmp`), join(directory, `${name}.json`));
  }
});
