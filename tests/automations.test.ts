import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  MoguriSdk, describeAutomationSchedule, dueAutomationOccurrences, executeAutomationsCommand, nextAutomationOccurrence, parseAutomationWorkflow, validateAutomation,
  type AutomationDefinition, type AutomationRun, type AutomationSchedule,
} from "../packages/sdk/src/index.ts";
import { startService } from "../apps/service/src/server.ts";
import { EventStore } from "../apps/service/src/store.ts";
import { projectEvents } from "../packages/protocol/src/index.ts";
import { setupFixture, waitFor } from "./fixture.ts";
import { GeneratedIntakeClock } from "./fixtures/intake-clock.ts";
import { initializeGeneratedRepository } from "./fixtures/git-project.ts";

const at = (value: string) => Date.parse(value);
const iso = (value: number | null) => value === null ? null : new Date(value).toISOString();

test("automation schedules resolve DST gaps and overlaps, weekdays and intervals, and coalesce missed occurrences", () => {
  const daily: AutomationSchedule = { kind: "daily", time: "02:30", timeZone: "Europe/Rome" };
  assert.equal(iso(nextAutomationOccurrence(daily, 0, at("2030-03-30T12:00:00Z"))), "2030-03-31T01:30:00.000Z", "a nonexistent wall time runs once, shifted forward by the gap");
  assert.equal(iso(nextAutomationOccurrence(daily, 0, at("2030-10-26T12:00:00Z"))), "2030-10-27T00:30:00.000Z", "an ambiguous wall time runs at its first occurrence");
  assert.equal(iso(nextAutomationOccurrence(daily, 0, at("2030-10-27T00:30:00Z"))), "2030-10-28T01:30:00.000Z", "the repeated hour never runs twice");
  const weekly: AutomationSchedule = { kind: "weekly", days: [1, 3], time: "09:00", timeZone: "UTC" };
  assert.equal(iso(nextAutomationOccurrence(weekly, 0, at("2030-01-01T10:00:00Z"))), "2030-01-02T09:00:00.000Z");
  assert.equal(iso(nextAutomationOccurrence(weekly, 0, at("2030-01-02T09:00:00Z"))), "2030-01-07T09:00:00.000Z");
  const hourly: AutomationSchedule = { kind: "interval", minutes: 60, timeZone: "UTC" }, anchor = at("2030-01-01T10:00:00Z");
  assert.equal(iso(nextAutomationOccurrence(hourly, anchor, anchor)), "2030-01-01T11:00:00.000Z");
  assert.deepEqual(dueAutomationOccurrences(hourly, anchor, at("2030-01-01T11:00:00Z"), at("2030-01-01T13:30:00Z")),
    { latest: at("2030-01-01T13:00:00Z"), missed: 2, next: at("2030-01-01T14:00:00Z") });
  assert.deepEqual(dueAutomationOccurrences({ kind: "daily", time: "09:00", timeZone: "UTC" }, 0, at("2030-01-01T09:00:00Z"), at("2030-01-04T10:00:00Z")),
    { latest: at("2030-01-04T09:00:00Z"), missed: 3, next: at("2030-01-05T09:00:00Z") });
  const once: AutomationSchedule = { kind: "once", at: "2030-01-02T09:00:00.000Z", timeZone: "UTC", localTime: "2030-01-02T09:00", offsetMinutes: 0 };
  assert.deepEqual(dueAutomationOccurrences(once, 0, at("2030-01-02T09:00:00Z"), at("2030-01-03T00:00:00Z")), { latest: at("2030-01-02T09:00:00Z"), missed: 0, next: null });
  assert.equal(describeAutomationSchedule(weekly), "Weekly on Mon, Wed at 09:00 (UTC)");
  assert.equal(describeAutomationSchedule({ kind: "weekly", days: [5, 1, 2, 3, 4], time: "08:15", timeZone: "UTC" }), "Weekdays at 08:15 (UTC)");
  assert.equal(describeAutomationSchedule(hourly), "Every 1 hour");
  const scripted: AutomationDefinition = { name: "Generated", schedule: hourly, steps: [{ kind: "script", path: "scripts/check.sh", interpreter: "sh" }] };
  assert.throws(() => validateAutomation(scripted, "Remote"), /must use Local/);
  assert.doesNotThrow(() => validateAutomation(scripted, "Local"));
  assert.throws(() => validateAutomation({ ...scripted, schedule: { ...hourly, timeZone: "Generated/Invalid" } }, "Local"), /timezone/);
  assert.throws(() => validateAutomation({ ...scripted, schedule: { ...once, offsetMinutes: 60 } }, "Local"), /DST|offset/);
});

const prompts = (...texts: string[]): AutomationDefinition["steps"] => texts.map((text) => ({ kind: "prompt" as const, text }));

test("explicit activation gates automations; each recurring run gets a new chat and chains its prompt steps", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await fixture.configure(); await sdk.refresh();
    const projectId = fixture.session().projectId, controls = { modelId: fixture.modelId };
    const definition: AutomationDefinition = { name: "Generated digest", schedule: { kind: "interval", minutes: 60, timeZone: "UTC" },
      steps: prompts("Generated automation step one.", "Generated automation step two.") };
    const paused = await sdk.automations.create(projectId, definition, { enabled: false, controls });
    await sdk.refresh();
    assert.equal(sdk.automations.list()[0]?.status, "paused"); assert.equal(sdk.automations.list()[0]?.nextAt, null);
    clock.advanceBy(7_200_000);
    assert.equal(fixture.requests.length, 0); assert.equal(sdk.automations.runs().length, 0);
    await sdk.automations.enable(paused.id!); await sdk.refresh();
    const enabled = sdk.automations.list()[0]!;
    assert.equal(enabled.nextAt, "2030-01-01T13:00:00.000Z");
    assert.equal(enabled.controls.modelId, fixture.modelId);
    const before = fixture.service.controller.snapshot().sessions.length;
    clock.advanceBy(3_600_000);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns[0]?.status === "completed");
    await sdk.refresh();
    const run = sdk.automations.runs()[0]!;
    assert.equal(run.trigger, "schedule"); assert.equal(run.occurrenceAt, "2030-01-01T13:00:00.000Z"); assert.equal(run.missed, 0);
    assert.deepEqual(run.progress.map((step) => step.status), ["completed", "completed"]);
    const chat = fixture.service.controller.snapshot().sessions.find((session) => session.id === run.sessionId)!;
    assert.equal(fixture.service.controller.snapshot().sessions.length, before + 1);
    assert.equal(chat.title, "Generated digest"); assert.equal(chat.projectId, projectId);
    assert.deepEqual(chat.messages.filter((message) => message.role === "user").map((message) => message.text), ["Generated automation step one.", "Generated automation step two."]);
    assert.equal(fixture.requests.length, 2);
    assert.equal(sdk.automations.list()[0]?.nextAt, "2030-01-01T14:00:00.000Z");
    await sdk.automations.pause(enabled.id); await sdk.refresh();
    clock.advanceBy(86_400_000);
    assert.equal(fixture.requests.length, 2); assert.equal(sdk.automations.runs().length, 1);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("an overlapping occurrence is skipped while a run is active, and Stop ends the run without later steps", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await fixture.configure(); await sdk.refresh();
    const created = await sdk.automations.create(fixture.session().projectId, { name: "Generated overlap", schedule: { kind: "interval", minutes: 60, timeZone: "UTC" },
      steps: prompts("Please answer generated slow step.", "Generated step that must not run.") }, { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh();
    clock.advanceBy(3_600_000);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns[0]?.progress[0]?.status === "running" && fixture.requests.length === 1);
    clock.advanceBy(3_600_000);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns.length === 2);
    await sdk.refresh();
    const [skipped, active] = [...sdk.automations.runs()].sort((a, b) => a.status === "skipped" ? -1 : b.status === "skipped" ? 1 : 0);
    assert.equal(skipped?.status, "skipped"); assert.match(skipped!.diagnostic!, /still active/); assert.equal(skipped?.sessionId, null);
    assert.equal(active?.status, "running");
    await assert.rejects(() => sdk.automations.runNow(created.id!), /still active/);
    await assert.rejects(() => sdk.automations.delete(created.id!), /still active/);
    await sdk.automations.stopRun(active!.id);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns.find((run) => run.id === active!.id)?.status === "stopped");
    const stopped = fixture.service.controller.snapshot().automationRuns.find((run) => run.id === active!.id)!;
    assert.deepEqual(stopped.progress.map((step) => step.status), ["stopped", "skipped"]);
    assert.equal(fixture.requests.length, 1);
    await sdk.refresh();
    await sdk.automations.delete(created.id!); await sdk.refresh();
    assert.equal(sdk.automations.list().length, 0); assert.equal(sdk.automations.runs().length, 0);
    clock.advanceBy(7_200_000);
    assert.equal(fixture.requests.length, 1);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("missed occurrences coalesce into one run after restart, and interrupted runs are never replayed", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  const stateDir = join(fixture.directory, "state"), reopen = () => startService({ stateDir, provider: fixture.provider, retentionKey: fixture.retentionKey, platform: { intakeClock: clock } });
  let reopened: Awaited<ReturnType<typeof startService>> | undefined;
  try {
    await fixture.configure(); await sdk.refresh();
    await sdk.automations.create(fixture.session().projectId, { name: "Generated missed", schedule: { kind: "interval", minutes: 60, timeZone: "UTC" },
      steps: prompts("Please answer generated slow restart step.") }, { enabled: true, controls: { modelId: fixture.modelId } });
    sdk.disconnect(); await fixture.service.close();
    clock.advanceBy(3 * 3_600_000 + 1_800_000);
    reopened = await reopen();
    clock.advanceBy(0);
    await waitFor(() => reopened!.controller.snapshot().automationRuns[0]?.progress[0]?.status === "running" && fixture.requests.length === 1);
    const first = reopened.controller.snapshot().automationRuns[0]!;
    assert.equal(first.occurrenceAt, "2030-01-01T13:00:00.000Z"); assert.equal(first.missed, 2);
    assert.equal(reopened.controller.snapshot().automations[0]?.nextAt, "2030-01-01T14:00:00.000Z");
    await reopened.close(); reopened = undefined;

    const store = new EventStore(join(stateDir, "state.sqlite"), fixture.retentionKey);
    const state = projectEvents(store.events()), stopped = state.automationRuns.find((run) => run.id === first.id)!;
    assert.equal(stopped.status, "stopped", "a graceful shutdown stops the active step instead of leaving it to replay");
    const automation = state.automations[0]!, chat = fixture.sessionId, turnId = "generated-automation-turn", itemId = "generated-automation-item";
    const runEvent = (run: AutomationRun) => ({ event_type: "automation.run_recorded" as const, profile_id: "default", project_id: run.projectId, payload: { run } });
    const base = { ...first, trigger: "manual" as const, missed: 0, revision: 0, status: "starting" as const, sessionId: null, progress: [{ status: "pending" as const, itemId: null, turnId: null }] };
    const creating: AutomationRun = { ...base, id: "generated-creating-run" };
    const queued: AutomationRun = { ...base, id: "generated-crashed-run", revision: 1, status: "running", sessionId: chat, progress: [{ status: "queued", itemId, turnId: null }] };
    const item = { id: itemId, text: "Please answer generated slow restart step.", attachments: [], delivery: "queue" as const, automation: { automationId: automation.id, runId: queued.id, step: 0 } };
    const scope = { profile_id: "default", project_id: fixture.session().projectId, session_id: chat };
    store.commit([runEvent(creating), runEvent({ ...queued, revision: 0, status: "starting", sessionId: null, progress: base.progress }), runEvent(queued),
      { ...scope, event_type: "queue.enqueued", payload: { item } },
      { ...scope, turn_id: turnId, event_type: "turn.started", payload: { item, controls: first.controls, policyRevision: 0 } },
      runEvent({ ...queued, revision: 2, progress: [{ status: "running", itemId, turnId }] })]);
    store.close();
    reopened = await reopen();
    const runs = reopened.controller.snapshot().automationRuns;
    assert.equal(runs.find((run) => run.id === creating.id)?.status, "partial");
    assert.match(runs.find((run) => run.id === creating.id)!.diagnostic!, /restarted while this run was creating/);
    assert.equal(runs.find((run) => run.id === queued.id)?.status, "partial");
    assert.deepEqual(runs.find((run) => run.id === queued.id)?.progress.map((step) => step.status), ["partial"]);
    clock.advanceBy(0); await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(fixture.requests.length, 1);
    assert.equal(reopened.controller.events(0).filter((event) => event.event_type === "queue.enqueued" && event.payload.item.automation?.runId === first.id).length, 1);
  } finally { await reopened?.close(); sdk.disconnect(); await fixture.close(); }
});

test("a script step runs the exact repository-trusted entrypoint without a model call, under normal approval", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await mkdir(join(fixture.project, "scripts"));
    await writeFile(join(fixture.project, "scripts/generated.sh"), "printf '%s\\n' \"$1\" > generated-automation-result.txt\n");
    initializeGeneratedRepository(fixture.project, ["fixture.txt", "scripts/generated.sh"]);
    await fixture.configure(); await sdk.refresh();
    const projectId = fixture.session().projectId;
    const definition: AutomationDefinition = { name: "Generated scripted", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" },
      steps: [{ kind: "script", path: "scripts/generated.sh", interpreter: "sh", args: ["Generated automation argument"] }, ...prompts("Generated step after the script.")] };
    await assert.rejects(() => sdk.automations.create(projectId, definition, { enabled: true, controls: { modelId: fixture.modelId, env: "Remote" } }), /Local|Remote|unavailable|excluded/i);
    const created = await sdk.automations.create(projectId, definition, { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh();
    await sdk.automations.runNow(created.id!);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns[0]?.status === "blocked");
    assert.match(fixture.service.controller.snapshot().automationRuns[0]!.diagnostic!, /repository trust/);
    const { preview } = await sdk.repositoryTrust.preview(projectId);
    await sdk.repositoryTrust.trust(preview); await sdk.refresh();
    await sdk.automations.runNow(created.id!);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns.find((run) => run.status !== "blocked")?.progress[0]?.status === "running");
    const run = () => fixture.service.controller.snapshot().automationRuns.find((value) => value.status !== "blocked")!;
    const chat = () => fixture.service.controller.snapshot().sessions.find((session) => session.id === run().sessionId)!;
    await waitFor(() => chat().pendingApproval);
    assert.equal(fixture.requests.length, 0);
    await sdk.approvals.respond(chat().id, chat().pendingApproval!.id, true);
    await waitFor(() => run().status === "completed");
    const root = fixture.service.controller.snapshot().managedWorkspaces.find((workspace) => workspace.id === chat().workspaceId)?.path ?? fixture.project;
    assert.equal(await readFile(join(root, "generated-automation-result.txt"), "utf8"), "Generated automation argument\n");
    const attempt = fixture.service.controller.snapshot().trustedScriptAttempts.find((value) => value.automation?.runId === run().id);
    assert.equal(attempt?.automation?.step, 0); assert.equal(attempt?.path, "scripts/generated.sh");
    assert.equal(fixture.requests.length, 1, "only the prompt step called a model");
    assert.deepEqual(run().progress.map((step) => step.status), ["completed", "completed"]);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("the readable workflow file resolves local once times and rejects malformed steps", () => {
  const parsed = parseAutomationWorkflow(parseYaml(`name: Generated release check
schedule:
  kind: once
  at: "2030-10-27T02:30"
  timeZone: Europe/Rome
controls:
  autonomy: Manual
steps:
  - prompt: Summarize generated release notes.
  - script: scripts/check.sh
    interpreter: sh
    args: [--quick]
`));
  assert.deepEqual(parsed.definition.schedule, { kind: "once", at: "2030-10-27T00:30:00.000Z", timeZone: "Europe/Rome", localTime: "2030-10-27T02:30", offsetMinutes: 120 });
  assert.deepEqual(parsed.definition.steps, [{ kind: "prompt", text: "Summarize generated release notes." }, { kind: "script", path: "scripts/check.sh", interpreter: "sh", args: ["--quick"] }]);
  assert.deepEqual(parsed.controls, { autonomy: "Manual" });
  assert.throws(() => parseAutomationWorkflow({ name: "Generated", schedule: { kind: "daily", time: "9am", timeZone: "UTC" }, steps: [{ prompt: "x" }] }), /schedule/);
  assert.throws(() => parseAutomationWorkflow({ name: "Generated", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" }, steps: [{ script: "a.sh", interpreter: "perl" }] }), /steps/);
  assert.throws(() => parseAutomationWorkflow({ name: "Generated", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" }, steps: [{ prompt: "x" }], controls: { budget: "lots" } }), /controls/);
});

test("the shared /automations command reads and controls the same service state as other clients", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready(), other = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await fixture.configure(); await sdk.refresh();
    assert.match(await executeAutomationsCommand(sdk, ""), /No automations/);
    const created = await other.automations.create(fixture.session().projectId, { name: "Generated shared", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" },
      steps: prompts("Generated shared step.") }, { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh();
    const listed = await executeAutomationsCommand(sdk, "list");
    assert.match(listed, /Generated shared \[[0-9a-f]{8}\] Active/); assert.match(listed, /Daily at 09:00 \(UTC\)/); assert.match(listed, /1\. Generated shared step\./);
    await executeAutomationsCommand(sdk, `pause ${created.id!.slice(0, 8)}`); await other.refresh();
    assert.equal(other.automations.list()[0]?.status, "paused");
    await executeAutomationsCommand(sdk, `run ${created.id!.slice(0, 8)}`);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns[0]?.status === "completed");
    await sdk.refresh();
    assert.match(await executeAutomationsCommand(sdk, `runs ${created.id!.slice(0, 8)}`), /completed manual/);
    await assert.rejects(() => executeAutomationsCommand(sdk, "enable"), /automation ID/);
    await executeAutomationsCommand(sdk, `delete ${created.id!}`); await other.refresh();
    assert.equal(other.automations.list().length, 0);
  } finally { other.disconnect(); sdk.disconnect(); await fixture.close(); }
});

test("automatic model recovery keeps a run's step alive until the retried turn completes", { skip: process.platform !== "darwin" }, async () => {
  const clock = new GeneratedIntakeClock(), fixture = await setupFixture({ httpFailure: { status: 408, message: "Timed out reading request body. Generated fixture; no personal inference.", remaining: 1 },
    responseMode: "text", maxOutputTokens: 128, platform: { intakeClock: clock } });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await fixture.configure(); await sdk.refresh();
    const created = await sdk.automations.create(fixture.session().projectId, { name: "Generated recovery", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" },
      steps: prompts("Generated step that first fails transiently.", "Generated step after recovery.") }, { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh(); await sdk.automations.runNow(created.id!);
    const run = () => fixture.service.controller.snapshot().automationRuns[0]!;
    const chat = () => fixture.service.controller.snapshot().sessions.find((session) => session.id === run().sessionId);
    await waitFor(() => fixture.service.controller.snapshot().modelFailures[0]?.status === "pending" && chat()?.turnId === null);
    assert.equal(run().status, "running", "a failed turn awaiting automatic recovery does not end the run"); assert.equal(run().progress[0]?.status, "running");
    clock.advanceBy(30_000);
    await waitFor(() => run().status === "completed");
    assert.deepEqual(run().progress.map((step) => step.status), ["completed", "completed"]);
    assert.equal(fixture.service.controller.snapshot().modelFailures[0]?.status, "recovered");
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("deleting an automation while stopping its active run settles the run and removes its queued step", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await setupFixture({ responseMode: "text", maxOutputTokens: 128 });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await fixture.configure(); await sdk.refresh();
    const created = await sdk.automations.create(fixture.session().projectId, { name: "Generated delete", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" },
      steps: prompts("Please answer generated slow delete step.", "Generated step that must not run.") }, { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh(); await sdk.automations.runNow(created.id!);
    await waitFor(() => fixture.service.controller.snapshot().automationRuns[0]?.progress[0]?.status === "running" && fixture.requests.length === 1);
    const runId = fixture.service.controller.snapshot().automationRuns[0]!.id;
    await sdk.refresh(); await sdk.automations.delete(created.id!, { stopRunning: true });
    const final = () => fixture.service.controller.events(0).findLast((event) => event.event_type === "automation.run_recorded" && event.payload.run.id === runId);
    await waitFor(() => { const event = final(); return event?.event_type === "automation.run_recorded" && event.payload.run.status === "stopped"; });
    const event = final();
    assert.ok(event?.event_type === "automation.run_recorded"); assert.deepEqual(event.payload.run.progress.map((step) => step.status), ["stopped", "skipped"]);
    await sdk.refresh(); assert.equal(sdk.automations.list().length, 0); assert.equal(sdk.automations.runs().length, 0);
    const chat = fixture.service.controller.snapshot().sessions.find((session) => session.id === event.payload.run.sessionId)!;
    assert.equal(chat.queue.length, 0); assert.equal(fixture.requests.length, 1);
  } finally { sdk.disconnect(); await fixture.close(); }
});

test("a script step after a prompt step waits for queued chat work instead of blocking", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await setupFixture({ maxOutputTokens: 128, respond: (_request, index) => ({ text: `Generated reply ${index}.`, delayMs: index === 0 ? 600 : 0 }) });
  const sdk = await new MoguriSdk(fixture.service.connection).ready();
  try {
    await mkdir(join(fixture.project, "scripts"));
    await writeFile(join(fixture.project, "scripts/generated.sh"), "printf 'Generated waited\\n' > generated-waited-result.txt\n");
    initializeGeneratedRepository(fixture.project, ["fixture.txt", "scripts/generated.sh"]);
    await fixture.configure(); await sdk.refresh();
    const projectId = fixture.session().projectId;
    await sdk.repositoryTrust.trust((await sdk.repositoryTrust.preview(projectId)).preview);
    const created = await sdk.automations.create(projectId, { name: "Generated waiting", schedule: { kind: "daily", time: "09:00", timeZone: "UTC" },
      steps: [...prompts("Generated prompt before the script."), { kind: "script", path: "scripts/generated.sh", interpreter: "sh" }] },
      { enabled: true, controls: { modelId: fixture.modelId } });
    await sdk.refresh(); await sdk.automations.runNow(created.id!);
    const run = () => fixture.service.controller.snapshot().automationRuns[0]!;
    const chat = () => fixture.service.controller.snapshot().sessions.find((session) => session.id === run().sessionId)!;
    await waitFor(() => run().progress[0]?.status === "running" && fixture.requests.length === 1);
    await sdk.refresh();
    await sdk.command({ type: "draft.save", sessionId: chat().id, expectedRevision: chat().draft.revision, text: "Generated user follow-up in the run chat.", attachments: [] });
    await sdk.command({ type: "message.send", sessionId: chat().id, expectedRevision: chat().draft.revision, delivery: "queue" });
    await waitFor(() => fixture.requests.length === 2);
    await waitFor(() => Boolean(chat().pendingApproval));
    assert.equal(run().status, "running"); assert.equal(run().progress[1]?.status, "running");
    await sdk.approvals.respond(chat().id, chat().pendingApproval!.id, true);
    await waitFor(() => run().status === "completed");
    const root = fixture.service.controller.snapshot().managedWorkspaces.find((workspace) => workspace.id === chat().workspaceId)?.path ?? fixture.project;
    assert.equal(await readFile(join(root, "generated-waited-result.txt"), "utf8"), "Generated waited\n");
  } finally { sdk.disconnect(); await fixture.close(); }
});
