import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { KUPO_MODEL_ID, PROTOCOL_VERSION, type Controls } from "../packages/sdk/src/index.ts";
import { frameDigest } from "../apps/service/src/worker-wire.ts";
import { remoteRootLease } from "../apps/service/src/remote.ts";
import { routedFixture } from "./fixtures/single-routing.ts";
import { generatedDocx } from "./fixtures/documents.ts";
import { waitFor } from "./fixture.ts";
import {
  configureMilestoneRouting, milestoneAxes, milestoneBudget, milestoneCellId, milestoneResponses, requiredMilestoneCells,
  type MilestoneCell, type MilestoneFixture,
} from "./fixtures/milestone-combinations.ts";

const cells = requiredMilestoneCells();
const sourceCells = cells.filter((cell) => cell.env !== "Sandbox");

test("the required milestone cell map is the complete Cartesian set, with native-unqualified cells retained separately", () => {
  assert.equal(cells.length, 10080);
  assert.equal(new Set(cells.map(milestoneCellId)).size, cells.length);
  assert.equal(sourceCells.length, 6720);
  assert.equal(cells.filter((cell) => cell.env === "Sandbox").length, 3360);
  for (const [axis, values] of Object.entries(milestoneAxes)) {
    for (const value of values) {
      assert.equal(cells.filter((cell) => cell[axis as keyof MilestoneCell] === value).length, cells.length / values.length);
    }
  }
});

async function runCell(fixture: MilestoneFixture, cell: MilestoneCell, options: { window?: number; question?: boolean; image?: boolean } = {}) {
  const contextWindow = options.window ?? (cell.window === "maximum" ? 32768 : 16384);
  const modelOptions: Controls["modelOptions"] = {
    contextWindow, ...(cell.effort === "default" ? {} : { thinkingEffort: cell.effort }),
  };
  const created = await fixture.sdk.sessions.create(fixture.session().projectId, milestoneCellId(cell), {
    env: cell.env, modelId: cell.selection === "fixed" ? fixture.solverId : KUPO_MODEL_ID,
    budget: milestoneBudget(cell.budget), modelOptions,
  });
  const sessionId = created.id!;
  const session = () => fixture.service.controller.snapshot().sessions.find((value) => value.id === sessionId)!;
  await fixture.sdk.sessions.autonomy(sessionId, cell.autonomy);
  const text = `Generated original required cell ${milestoneCellId(cell)}.`;
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
    documentId = (await fixture.sdk.attachments.document(sessionId, documentPath)).id!;
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
      if (!session().turnId) throw new Error(`Required question ended before an actual answer: ${session().status}: ${session().lastError}; ${
        JSON.stringify(session().messages.filter((message) => message.role === "tool"))}`);
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
  await waitFor(() => !session().turnId && ["completed", "failed", "stopped", "partial"].includes(session().status), 30000);
  assert.equal(session().status, "completed", `${milestoneCellId(cell)}: ${session().lastError ?? ""}`);
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
    id: milestoneCellId(cell), outcome: "source-pass" as const, controls: session().controls, roles,
    calls: observed.length, reportedTokens: roles.length * 42, billedUsd: status.totals.billedUsd,
    models: entries.map((entry) => ({ role: entry.role, modelId: entry.modelId, providerId: entry.providerId,
      apiModelId: entry.apiModelId, inputEstimate: entry.inputEstimate, outputLimit: entry.outputLimit,
      reportedTokens: entry.reportedTokens, planId: entry.planId })),
    profileId: state.profileId, rootDigest: frameDigest(cell.env === "Remote" ? execution!.workspace :
      state.projects.find((project) => project.id === session().projectId)!.path),
    peerDigest: execution ? frameDigest(execution.target.hostKey) : null,
    targetDigest: execution?.configDigest ?? null,
    rootLease: execution ? remoteRootLease(execution.target, execution.workspace) : null,
    workerDigest: execution?.workerDigest ?? null, cleanup: execution?.cleanup ?? "authoritative-local-turn-settled",
  };
  await fixture.sdk.sessions.delete(sessionId, true);
  return result;
}

for (const env of ["Local", "Remote"] as const)
  for (const selection of milestoneAxes.selection)
    test(`exact arbitrary ${env}/${selection} window and genuine effort traverse the owning worker without changing capacity`, {
      skip: process.platform !== "darwin", timeout: 45000,
    }, async () => {
      const fixture = await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
      try {
        await configureMilestoneRouting(fixture, selection);
        await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: "high", input: "text" }, { window: 24577 });
      } finally { await fixture.close(); }
    });

for (const env of ["Local", "Remote"] as const) for (const selection of milestoneAxes.selection)
test(`mixed approved image/document ${env}/${selection} context reaches every actual role without a path or body fallback`, {
  skip: process.platform !== "darwin", timeout: 45000,
}, async () => {
  const fixture = await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
  try {
    await configureMilestoneRouting(fixture, selection);
    await runCell(fixture, { env, selection, autonomy: "Manual", budget: "both", window: "half", effort: "high", input: "document" }, { image: true });
  } finally { await fixture.close(); }
});

test("every Local/SSH selection and cap preserves actual Manual/Guided/Autopilot answers or one bounded-model Max decision", {
  skip: process.platform !== "darwin", concurrency: 4, timeout: 300000,
}, async (t) => {
  await Promise.all((["Local", "Remote"] as const).flatMap((env) => milestoneAxes.selection.map((selection) =>
    t.test(`${env}/${selection}`, { timeout: 240000 }, async (group) => {
      const fixture = await routedFixture({ env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
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
          await group.test(`${autonomy}/${budget}`, { timeout: 45000 }, async () => {
            await runCell(fixture, { env, selection, autonomy, budget, window: "maximum", effort: "default", input: "text" }, { question: true });
            passed = true;
          });
          assert.ok(passed, "A required actual-actor/cap case failed; no later group case is inferred successful.");
        }
      } finally { await fixture.close(); }
    }))));
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
  skip: process.platform !== "darwin", concurrency: 4, timeout: 7200000,
}, async (t) => {
  const groups = [...new Set(sourceCells.map((cell) => `${cell.env}/${cell.selection}/${cell.autonomy}/${cell.budget}`))];
  const completed = new Map<string, Awaited<ReturnType<typeof runCell>>>();
  const failed = new Map<string, string>(), completedGroups = new Set<string>();
  const paths = ["package.json", "package-lock.json", "scripts/worker-image/Containerfile",
    "apps/service/src/worker.ts", "apps/service/src/remote-bridge.ts", "dist/worker.mjs", "dist/remote-bridge.mjs",
    "apps/desktop/src/BudgetControls.tsx", "apps/desktop/src/SettingsPanel.tsx",
    "dist/mcp-worker.mjs", "dist/data-worker.mjs", "dist/service.mjs", "dist/cli.mjs", "dist/tui.mjs",
    "dist/sdk/runtime.mjs", "dist/sdk/index.mjs", "dist/desktop/main.mjs", "dist/desktop/renderer/index.html",
    ...(await readdir("dist/desktop/renderer/assets")).sort().map((name) => `dist/desktop/renderer/assets/${name}`),
    "tests/fixtures/single-routing.ts", "tests/fixtures/milestone-combinations.ts", "tests/milestone-combinations.test.ts",
    "tests/tui-milestone-combinations.test.ts", "tests/e2e/milestone-combinations.spec.ts"];
  const identity = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtyAtStart: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    protocol: PROTOCOL_VERSION, node: process.version,
    inputs: Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")]))),
  };
  const startedAt = new Date().toISOString();
  try {
    await Promise.all(groups.map((group) => t.test(group, { timeout: 750000 }, async (groupTest) => {
      const required = sourceCells.filter((cell) => `${cell.env}/${cell.selection}/${cell.autonomy}/${cell.budget}` === group);
      const first = required[0]!;
      assert.ok(first.env !== "Sandbox");
      const fixture = await routedFixture({ env: first.env, legacy: false, configured: false, reasoningRoles: true, imageInput: true, toolInput: true });
      try {
        await configureMilestoneRouting(fixture, first.selection);
        const model = fixture.sdk.getState().snapshot!.provider.models.find((model) => model.id === fixture.solverId)!;
        assert.deepEqual(model.thinkingLevels, milestoneAxes.effort.filter((effort) => effort !== "default"));
        for (const cell of required) {
          let passed = false;
          await groupTest.test(milestoneCellId(cell), { timeout: 45000 }, async () => {
            try {
              const result = await runCell(fixture, cell);
              assert.equal(completed.has(result.id), false);
              completed.set(result.id, result);
              passed = true;
            } catch (error) {
              failed.set(milestoneCellId(cell), error instanceof Error ? error.message : String(error));
              throw error;
            }
          });
          assert.ok(passed, `Required cell did not pass; remaining group cells are not qualification: ${milestoneCellId(cell)}`);
        }
      } finally { await fixture.close(); }
      completedGroups.add(group);
    })));
    assert.deepEqual([...completed.keys()].sort(), sourceCells.map(milestoneCellId).sort());
    assert.equal(completed.size, 6720);
    assert.equal(completedGroups.size, groups.length);
  } finally {
    const report = {
      version: 1, identity, startedAt, finishedAt: new Date().toISOString(),
      sourceStatus: completed.size === sourceCells.length && completedGroups.size === groups.length ? "PASS" : "INCOMPLETE",
      nativeStatus: "UNQUALIFIED", nativeImage: null, nativePhysicalReceipt: null,
      required: cells.length, sourcePassed: completed.size, nativeUnqualified: 3360,
      cells: cells.map((cell) => completed.get(milestoneCellId(cell)) ?? {
        id: milestoneCellId(cell), outcome: cell.env === "Sandbox" ? "native-unqualified" :
          failed.has(milestoneCellId(cell)) ? "source-failed" : "not-run",
        diagnostic: cell.env === "Sandbox" ? "Released SendBox Meta-DNS prerequisite and fresh exact-current physical receipts remain required." :
          failed.get(milestoneCellId(cell)) ?? "Required source cell did not complete; no qualification inferred.",
      }),
    };
    const directory = ".test-output/milestone-combinations";
    await mkdir(directory, { recursive: true });
    const content = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(join(directory, `source-report-${startedAt.replace(/\D/g, "")}.json`), content, { flag: "wx" });
    await writeFile(join(directory, "source-report.json.tmp"), content);
    await rename(join(directory, "source-report.json.tmp"), join(directory, "source-report.json"));
  }
});
