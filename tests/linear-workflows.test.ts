import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultBoard, defaultProjectConfiguration, factoryControls, isRecord, projectEvents, PROTOCOL_VERSION, type CapabilityJob, type CommandResult,
  type EventInput, type LocalIssue, type Snapshot,
} from "../packages/protocol/src/index.ts";
import {
  isLinearCommand, isLinearQuery, projectLinearOperation, type LinearCommand, type LinearOperation, type LinearPreview,
  type LinearSnapshot, type LinearWorkflowInput,
} from "../packages/protocol/src/linear-workflows.ts";
import { LinearWorkflows } from "../apps/service/src/linear-workflows.ts";
import { ProjectIntegrations } from "../apps/service/src/project-integrations.ts";
import type { WorkspaceFinish } from "../apps/service/src/session-workspace.ts";
import { digest, EventStore } from "../apps/service/src/store.ts";
import { removePost44FixtureMarkers } from "./fixtures/legacy-state.ts";
import type { WorkflowHost } from "../apps/service/src/workflow-host.ts";
import { LinearWorkflowPanel } from "../apps/desktop/src/LinearWorkflowPanel.tsx";
import { MoguriSdk } from "../packages/sdk/src/index.ts";
import {
  GeneratedLinear, GeneratedLinearVault as Vault, linearFixtureIds as ids, LINEAR_FIXTURE_TIME as T0,
  LINEAR_FIXTURE_TOKEN as generatedToken, linearFixtureNodes as nodes, linearFixtureTimestamp as tick,
  linearFixtureUuid as uuid, linearServiceFixture as sdkFixture,
} from "./fixtures/linear-workflows.ts";

const object = (value: unknown) => { assert.ok(isRecord(value)); return value; };
const clone = <T>(value: T): T => structuredClone(value);

async function fixture() {
  const directory = join(process.cwd(), ".linear-workflow-fixtures", randomUUID()); await mkdir(directory, { recursive: true });
  const root = join(directory, "project"); await mkdir(root);
  const path = join(directory, "events.sqlite"), key = Buffer.alloc(32, 0x6c);
  let store = new EventStore(path, key, "generated-linear-key"), history = store.events();
  const provider = new GeneratedLinear(), vault = new Vault();
  const integrations = new ProjectIntegrations(vault, { fetch: provider.fetch });
  let runtime: LinearWorkflows;
  let holdJobs = false;
  const running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const snapshot = (): Snapshot => ({
    ...projectEvents(history), protocolVersion: PROTOCOL_VERSION, seq: history.at(-1)?.seq ?? 0, profileId: "default",
    provider: { status: "disconnected", models: [], login: null, diagnostic: null }, capabilities: [],
  });
  const commit = (events: EventInput[], receipt?: { id: string; digest: string; result: CommandResult }, forget?: { projects?: string[]; sessions?: string[] }) => {
    store.commit(events, receipt, forget); history = store.events(); snapshot();
  };
  const host: WorkflowHost = {
    snapshot, events: () => history,
    project: (id) => { const value = snapshot().projects.find((entry) => entry.id === id); if (!value) throw new Error("Project missing."); return value; },
    configuration: (id) => snapshot().projectConfigurations.find((entry) => entry.projectId === id) ?? defaultProjectConfiguration(id),
    assertRoot: async (_projectId, _workspaceId, signal) => signal.throwIfAborted(),
    closing: () => false, rootBusy: () => false, commit,
    job: (kind, projectId, workspaceId, execute, start, settled, lifecycle, sessionId) => {
      const id = randomUUID(), controller = new AbortController();
      const job: CapabilityJob = { id, kind, projectId, workspaceId: workspaceId ?? null, sessionId: sessionId ?? null, parentTurnId: null, status: "running", progress: "", resultDigest: null, error: null };
      start(job);
      const owner = snapshot().jobs.find((entry) => entry.id === id)!;
      const retention = { operationId: owner.operationId };
      const progress = (text: string) => commit([{ event_type: "job.progress", profile_id: "default", project_id: projectId, session_id: sessionId ?? null, payload: { jobId: id, progress: text, ...retention } }]);
      const done = holdJobs ? Promise.resolve() : Promise.resolve().then(async () => {
        try {
          const result = await execute(controller.signal, progress, id); controller.signal.throwIfAborted();
          const hash = store.putBlob(JSON.stringify(result));
          const extra = lifecycle?.completed(result, hash) ?? [];
          commit([...extra, { event_type: "job.finished", profile_id: "default", project_id: projectId, session_id: sessionId ?? null, payload: { jobId: id, status: "completed", resultDigest: hash, error: null, ...retention } }]);
        } catch (error) {
          const failure = lifecycle?.failed(error, controller.signal.aborted);
          commit([...(failure?.events ?? []), { event_type: "job.finished", profile_id: "default", project_id: projectId, session_id: sessionId ?? null, payload: { jobId: id, status: failure?.status ?? "failed", resultDigest: null, error: failure?.error ?? "Generated job failed.", ...retention } }]);
        } finally { running.delete(id); settled?.(); }
      });
      running.set(id, { controller, done }); return id;
    },
  };
  commit([
    { event_type: "project.added", profile_id: "default", project_id: "project", payload: { project: { id: "project", name: "Generated project", path: root } } },
    { event_type: "board.saved", profile_id: "default", project_id: "project", payload: { board: { ...defaultBoard("project"), autoRefreshPrs: false, linear: { enabled: true, teamId: ids.team } } } },
  ]);
  runtime = new LinearWorkflows(store, host, integrations);
  const finish = (command: LinearCommand, id: string = randomUUID()): WorkspaceFinish => {
    const hash = digest(JSON.stringify(command));
    return Object.assign((events: EventInput[], result: CommandResult = {}) => {
      commit(events, store.receipt(id, hash) ? undefined : { id, digest: hash, result }); return result;
    }, { intent: { id, digest: hash } });
  };
  const preview = async (input: LinearWorkflowInput) => {
    const value = await runtime.query({ type: "linear.workflow.preview", projectId: "project", input });
    assert.equal(value.type, "linear.workflow.preview"); return value.preview;
  };
  const execute = async (review: LinearPreview, commandId?: string) => {
    const command: LinearCommand = { type: "linear.workflow.execute", projectId: "project", input: review.document.input, expectedDigest: review.digest, confirm: true };
    const result = await runtime.execute(command, finish(command, commandId)); assert.ok(result.id);
    return { command, result, commandId };
  };
  const wait = async (id: string) => {
    const operation = (snapshot() as Snapshot & LinearSnapshot).linearOperations.find((entry) => entry.id === id)!;
    await running.get(operation.jobId)?.done;
    const value = await runtime.query({ type: "linear.workflow.read", operationId: id });
    assert.equal(value.type, "linear.workflow.read"); return value;
  };
  const apply = async (input: LinearWorkflowInput) => {
    const review = await preview(input), admitted = await execute(review);
    return wait(admitted.result.id!);
  };
  const local = (linked = true) => {
    const issue: LocalIssue = { id: "local-ticket", projectId: "project", number: 1, title: "Generated local title", body: "Generated local body", kind: "bug",
      phaseId: "backlog", revision: 0, archived: false, createdAt: T0, updatedAt: T0, pullRequest: null,
      linear: linked ? { id: ids.issue, identifier: "GEN-1", url: "https://linear.app/generated/issue/GEN-1", updatedAt: T0 } : null };
    commit([{ event_type: "issue.saved", profile_id: "default", project_id: "project", payload: { issue, actor: "user" } }]); return issue;
  };
  return {
    provider, vault, integrations, host, snapshot, commit, finish, preview, execute, wait, apply, local,
    runtime: () => runtime, store: () => store, history: () => history, mutations: () => provider.requests.filter((request) => request.query.startsWith("mutation")),
    holdJobs: () => { holdJobs = true; },
    changeBoard: (change: (board: ReturnType<typeof defaultBoard>) => void) => {
      const board = clone(snapshot().boards[0]!); change(board); board.revision++;
      integrations.invalidateLinearProject("project"); commit([{ event_type: "board.saved", profile_id: "default", project_id: "project", payload: { board } }]);
    },
    restart: () => {
      runtime.close(); integrations.invalidateLinearCredentials(); store.close();
      store = new EventStore(path, key, "generated-linear-key"); history = store.events(); runtime = new LinearWorkflows(store, host, integrations);
      commit(runtime.recover());
    },
    close: async () => {
      runtime.close(); integrations.invalidateLinearCredentials(); for (const entry of running.values()) entry.controller.abort();
      await Promise.all([...running.values()].map((entry) => entry.done));
      store.close(); await rm(directory, { recursive: true, force: true });
    },
  };
}

const phaseMapping = [{ phaseId: "backlog", stateId: ids.state }, { phaseId: "done", stateId: ids.done }];

test("Linear typed read requests cannot carry mutations or arbitrary GraphQL", () => {
  assert.equal(isLinearQuery({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue }), true);
  assert.equal(isLinearQuery({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue, query: "mutation { issueDelete }" }), false);
  assert.equal(isLinearQuery({ type: "linear.workflow.execute", projectId: "project" }), false);
  assert.equal(isLinearCommand({ type: "linear.workflow.execute", projectId: "project", input: { action: "issue.create", fields: { title: "Generated", teamId: ids.otherTeam } }, expectedDigest: "a".repeat(64), confirm: true }), false);
  assert.equal(isLinearCommand({ type: "linear.workflow.execute", projectId: "project", input: { action: "issue.update", issueId: ids.issue, fields: { priority: 5 } }, expectedDigest: "a".repeat(64), confirm: true }), false);
});

test("Linear collections read exact bounded teams, states, projects, cycles, labels, members, issues, comments and relationships", async () => {
  const f = await fixture();
  try {
    for (const resource of ["teams", "states", "projects", "cycles", "labels", "users", "issues", "comments", "relations"] as const) {
      const result = await f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource, ...(["comments", "relations"].includes(resource) ? { issueId: ids.issue } : {}) });
      assert.equal(result.type, "linear.workflow.catalog"); if (result.type !== "linear.workflow.catalog") continue;
      assert.ok(result.items.length > 0); assert.equal(result.nextCursor, null); assert.equal(result.page, 1);
      assert.equal(result.identity.workspaceId, ids.workspace); assert.equal(result.team.id, ids.team);
    }
    assert.equal(f.mutations().length, 0);
    assert.equal(JSON.stringify(f.history()).includes(generatedToken), false);
  } finally { await f.close(); }
});

test("Linear issue create, exact optional updates, move, archive, restore and non-permanent delete retain verified receipts", async () => {
  const f = await fixture();
  try {
    const created = await f.apply({ action: "issue.create", fields: { title: "Generated created issue", description: "Generated description", stateId: ids.state,
      projectId: ids.project, cycleId: ids.cycle, priority: 2, estimate: 3, assigneeId: ids.user, labelIds: [ids.label], parentId: ids.otherIssue, dueDate: "2026-11-01" } });
    assert.equal(created.operation.status, "completed"); assert.equal(created.result?.acknowledgement, "verified");
    const id = created.result!.remote[0]!.id;
    assert.equal(id, created.document.reviewId);
    const updated = await f.apply({ action: "issue.update", issueId: id, fields: { title: "Generated updated", description: "", stateId: ids.done,
      projectId: null, cycleId: null, priority: 0, estimate: null, assigneeId: null, labelIds: [], parentId: null, dueDate: null } });
    assert.equal(updated.operation.status, "completed");
    assert.equal(object(f.provider.issues.get(id)).project, null);
    assert.equal((await f.apply({ action: "issue.move", issueId: id, stateId: ids.state })).operation.status, "completed");
    assert.equal((await f.apply({ action: "issue.archive", issueId: id, archived: true })).operation.status, "completed");
    assert.equal((await f.apply({ action: "issue.archive", issueId: id, archived: false })).operation.status, "completed");
    const deleted = await f.apply({ action: "issue.delete", issueId: id });
    assert.equal(deleted.operation.status, "completed"); assert.deepEqual(deleted.result?.deletedIds, [id]);
    assert.equal(f.provider.issues.has(id), false);
    assert.equal(f.mutations().length, 6);
    for (const entry of (f.snapshot() as Snapshot & LinearSnapshot).linearOperations) {
      assert.equal(entry.acceptance.actor, "user"); assert.equal(entry.reviewDigest, entry.inputDigest);
      assert.equal(f.store().receipt(entry.commandId, entry.commandDigest)?.id, entry.id);
    }
  } finally { await f.close(); }
});

test("Linear comments and projects have complete create/edit/delete or archive/restore paths", async () => {
  const f = await fixture();
  try {
    const comment = await f.apply({ action: "comment.create", issueId: ids.issue, body: "Generated comment text" });
    assert.equal(comment.operation.status, "completed");
    const commentId = comment.result!.remote[0]!.id;
    assert.equal((await f.apply({ action: "comment.update", issueId: ids.issue, commentId, body: "Generated edited comment" })).operation.status, "completed");
    assert.equal((await f.apply({ action: "comment.delete", issueId: ids.issue, commentId })).operation.status, "completed");
    const project = await f.apply({ action: "project.create", fields: { name: "Generated created project", description: "Generated summary", content: "Generated full content", leadId: ids.user, startDate: "2026-11-01", targetDate: "2026-12-01", priority: 3 } });
    assert.equal(project.operation.status, "completed");
    const remoteProjectId = project.result!.remote[0]!.id;
    assert.equal((await f.apply({ action: "project.update", remoteProjectId, fields: { name: "Generated renamed project", content: "", leadId: null, targetDate: null } })).operation.status, "completed");
    assert.equal((await f.apply({ action: "project.archive", remoteProjectId, archived: true })).operation.status, "completed");
    assert.equal((await f.apply({ action: "project.archive", remoteProjectId, archived: false })).operation.status, "completed");
  } finally { await f.close(); }
});

test("Linear issue relationships use exact same-team endpoints and supported types", async () => {
  const f = await fixture();
  try {
    for (const relationType of ["blocks", "duplicate", "related"] as const) {
      const result = await f.apply({ action: "relation.create", issueId: ids.issue, relatedIssueId: ids.otherIssue, relationType });
      assert.equal(result.operation.status, "completed");
      const relationId = result.result!.remote[0]!.id;
      assert.equal((await f.apply({ action: "relation.delete", issueId: ids.issue, relationId })).operation.status, "completed");
    }
    await assert.rejects(() => f.preview({ action: "relation.create", issueId: ids.issue, relatedIssueId: ids.issue, relationType: "related" }), /distinct/);
  } finally { await f.close(); }
});

test("Linear preview preserves local and remote original snapshots and only the chosen sync direction runs", async () => {
  const f = await fixture();
  try {
    const original = f.local();
    f.provider.changeIssue(ids.issue, { title: "Generated pulled title", description: "Generated pulled body", stateId: ids.done });
    const review = await f.preview({ action: "ticket.sync", direction: "pull", localIssueId: original.id, expectedLocalRevision: 0, mapping: phaseMapping });
    assert.equal(review.document.local?.title, original.title);
    assert.equal(review.document.localAfter?.title, "Generated pulled title");
    assert.equal(review.document.localAfter?.phaseId, "done");
    assert.equal(review.remoteWrite, false);
    const admitted = await f.execute(review), pulled = await f.wait(admitted.result.id!);
    assert.equal(pulled.operation.status, "completed"); assert.equal(f.mutations().length, 0);
    const current = f.snapshot().issues[0]!;
    assert.equal(current.phaseId, "done"); assert.equal(current.kind, "bug"); assert.equal(current.linear?.id, original.linear?.id);
    const changed = { ...current, title: "Generated pushed title", body: "Generated pushed body", phaseId: "backlog", revision: current.revision + 1 };
    f.commit([{ event_type: "issue.saved", profile_id: "default", project_id: "project", payload: { issue: changed, actor: "user" } }]);
    const pushed = await f.apply({ action: "ticket.sync", direction: "push", localIssueId: changed.id, expectedLocalRevision: changed.revision, mapping: phaseMapping });
    assert.equal(pushed.operation.status, "completed"); assert.equal(f.mutations().length, 1);
    assert.equal(object(f.provider.issues.get(ids.issue)).title, changed.title);
    assert.equal(f.snapshot().issues[0]?.linear?.url, original.linear?.url);
    assert.equal(pulled.document.local?.title, original.title);
  } finally { await f.close(); }
});

test("Linear local publishing is explicit, maps phases and links only the exact successful remote identity", async () => {
  const f = await fixture();
  try {
    const local = f.local(false);
    assert.equal(f.mutations().length, 0);
    const result = await f.apply({ action: "ticket.publish", localIssueId: local.id, expectedLocalRevision: 0, mapping: phaseMapping, fields: { assigneeId: ids.user, labelIds: [ids.label] } });
    assert.equal(result.operation.status, "completed");
    assert.equal(f.snapshot().issues[0]?.linear?.id, result.result?.remote[0]?.id);
    assert.equal(f.snapshot().issues[0]?.title, local.title);
    await assert.rejects(() => f.preview({ action: "ticket.publish", localIssueId: local.id, expectedLocalRevision: 1, mapping: phaseMapping }), /already has/);
  } finally { await f.close(); }
});

test("Linear stale remote bases, local revisions and missing or ambiguous phase mappings reject before dispatch", async () => {
  const f = await fixture();
  try {
    const review = await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated stale replacement" } });
    f.provider.changeIssue(ids.issue, { title: "Generated concurrent remote edit" });
    await assert.rejects(() => f.execute(review), /changed|stale/);
    assert.equal(f.mutations().length, 0); assert.equal(object(f.provider.issues.get(ids.issue)).title, "Generated concurrent remote edit");
    const local = f.local();
    await assert.rejects(() => f.preview({ action: "ticket.sync", direction: "pull", localIssueId: local.id, expectedLocalRevision: 0, mapping: [{ phaseId: "done", stateId: ids.done }] }), /Map/);
    await assert.rejects(() => f.preview({ action: "ticket.sync", direction: "push", localIssueId: local.id, expectedLocalRevision: 0, mapping: [{ phaseId: "backlog", stateId: ids.state }, { phaseId: "done", stateId: ids.state }] }), /unambiguous/);
    const pull = await f.preview({ action: "ticket.sync", direction: "pull", localIssueId: local.id, expectedLocalRevision: 0, mapping: phaseMapping });
    f.commit([{ event_type: "issue.saved", profile_id: "default", project_id: "project", payload: { issue: { ...local, revision: 1, title: "Generated newer local edit" }, actor: "user" } }]);
    await assert.rejects(() => f.execute(pull), /concurrent|revision/);
    assert.equal(f.snapshot().issues[0]?.title, "Generated newer local edit");
  } finally { await f.close(); }
});

test("Linear rechecks the exact remote base after durable admission immediately before mutation", async () => {
  const f = await fixture();
  try {
    const review = await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated refused late stale edit" } });
    let scopes = 0;
    f.provider.hook = ({ name }) => {
      if (name === "MoguriLinearScope" && ++scopes === 2) f.provider.changeIssue(ids.issue, { title: "Generated remote edit after admission" });
    };
    const admitted = await f.execute(review), result = await f.wait(admitted.result.id!);
    assert.equal(result.operation.status, "failed"); assert.equal(result.operation.dispatched, false);
    assert.equal(f.mutations().length, 0); assert.equal(object(f.provider.issues.get(ids.issue)).title, "Generated remote edit after admission");
  } finally { await f.close(); }
});

test("Linear validates actual workspace, team, active assignee and single-team project membership", async () => {
  const f = await fixture();
  try {
    const initial = clone(f.provider.states[0]!);
    f.provider.states[0]!.team.id = ids.otherTeam;
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: "Generated", stateId: ids.state } }), /out-of-scope/);
    f.provider.states[0] = initial;
    f.provider.users[0]!.active = false;
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: "Generated", assigneeId: ids.user } }), /active member/);
    f.provider.users[0]!.active = true;
    f.provider.users[0]!.organization.id = uuid(99);
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: "Generated", assigneeId: ids.user } }), /out-of-scope/);
    f.provider.users[0]!.organization.id = ids.workspace;
    const project = object(f.provider.projects.get(ids.project));
    project.teams = nodes([{ id: ids.team, organization: { id: ids.workspace } }, { id: ids.otherTeam, organization: { id: ids.workspace } }]);
    await assert.rejects(() => f.preview({ action: "project.update", remoteProjectId: ids.project, fields: { name: "Generated refused shared edit" } }), /other teams/);
    object(f.provider.issues.get(ids.otherIssue)).team = { id: ids.otherTeam };
    await assert.rejects(() => f.preview({ action: "relation.create", issueId: ids.issue, relatedIssueId: ids.otherIssue, relationType: "blocks" }), /out-of-scope/);
    object(f.provider.comments.get(ids.comment)).user = { id: ids.user };
    await assert.rejects(() => f.preview({ action: "comment.update", issueId: ids.issue, commentId: ids.comment, body: "Generated refused impersonation" }), /author/);
    f.provider.workspaceId = uuid(99);
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue }), /out-of-scope/);
    assert.equal(f.mutations().length, 0);
  } finally { await f.close(); }
});

test("Linear HTTP-200 partial errors, false success and malformed results stay partial with safe original evidence", async () => {
  for (const failure of ["partial", "rejected", "malformed", "transport"] as const) {
    const f = await fixture();
    try {
      f.provider.hook = ({ name }) => {
        if (name !== "MoguriLinearIssueUpdate") return;
        if (failure === "transport") throw new Error(`Generated malicious reflected ${generatedToken}`);
        const issue = clone(f.provider.issues.get(ids.issue)!);
        return Response.json({
          data: { issueUpdate: { success: failure !== "rejected", issue: failure === "malformed" ? { id: ids.issue, title: generatedToken } : issue } },
          ...(failure === "partial" ? { errors: [{ message: `Generated partial ${generatedToken}` }] } : {}),
        });
      };
      const result = await f.apply({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated exact update" } });
      assert.equal(result.operation.status, "partial"); assert.equal(result.operation.dispatched, true);
      assert.equal(result.result?.acknowledgement, "unknown");
      if (failure !== "transport") assert.deepEqual(result.operation.remoteIds, [ids.issue]);
      assert.equal(JSON.stringify(result).includes(generatedToken), false);
      assert.equal(JSON.stringify(f.history()).includes(generatedToken), false);
      assert.equal(f.mutations().length, 1);
    } finally { await f.close(); }
  }
});

test("Linear read errors never apply partial data and redact credentials reflected in successful content", async () => {
  const f = await fixture();
  try {
    object(f.provider.issues.get(ids.issue)).description = `Generated reflected key ${generatedToken}`;
    const result = await f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue });
    assert.equal(result.type, "linear.workflow.issue");
    assert.equal(JSON.stringify(result).includes(generatedToken), false);
    assert.match(JSON.stringify(result), /redacted/);
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: generatedToken } }), /credential/);
    for (const response of [
      Response.json({ errors: [{ message: generatedToken }], data: { issue: f.provider.issues.get(ids.issue) } }),
      Response.json({ data: { issue: null } }), new Response("not JSON", { status: 200 }), new Response(generatedToken, { status: 429 }),
    ]) {
      f.provider.hook = ({ name }) => name === "MoguriLinearIssue" ? response : undefined;
      await assert.rejects(() => f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue }), (error: unknown) => {
        assert.equal(String(error).includes(generatedToken), false); return true;
      });
    }
    assert.equal(f.mutations().length, 0);
    assert.equal(JSON.stringify(f.history()).includes(generatedToken), false);
  } finally { await f.close(); }
});

test("Linear pagination rejects URLs, invalid metadata, duplicates, cycles and cross-collection cursors", async () => {
  const f = await fixture();
  try {
    for (const bad of [
      { nodes: [f.provider.issues.get(ids.issue)], pageInfo: { hasNextPage: true, endCursor: "https://attacker.invalid/page" } },
      { nodes: [f.provider.issues.get(ids.issue)], pageInfo: { hasNextPage: true, endCursor: null } },
      { nodes: [f.provider.issues.get(ids.issue)], pageInfo: { hasNextPage: false } },
      { nodes: [f.provider.issues.get(ids.issue), f.provider.issues.get(ids.issue)], pageInfo: { hasNextPage: false, endCursor: null } },
      { nodes: Array(51).fill(f.provider.issues.get(ids.issue)), pageInfo: { hasNextPage: false, endCursor: null } },
    ]) {
      f.provider.hook = ({ name }) => name === "MoguriLinearIssues" ? Response.json({ data: { team: { id: ids.team, issues: bad } } }) : undefined;
      await assert.rejects(() => f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "issues" }), /invalid|opaque|incomplete/);
    }
    f.provider.hook = ({ name }) => name === "MoguriLinearIssues" ? Response.json({ data: { team: { id: ids.team, issues: nodes([f.provider.issues.get(ids.issue)], "generated-next") } } }) : undefined;
    const first = await f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "issues" });
    assert.equal(first.type, "linear.workflow.catalog");
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "states", cursor: "generated-next" }), /exact|cursor/);
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "issues", cursor: "generated-next" }), /invalid|incomplete/);
    await f.integrations.setLinearToken("lin_api_generated_new_credential", AbortSignal.timeout(2000));
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "issues", cursor: "generated-next" }), /exact|cursor/);
    assert.equal(f.mutations().length, 0);
  } finally { await f.close(); }
});

test("Linear page limits are disclosed rather than falsely claiming a complete collection", async () => {
  const f = await fixture();
  try {
    f.provider.hook = ({ name, variables }) => {
      if (name !== "MoguriLinearTeams") return;
      const current = variables.after ? Number(String(variables.after).split("-")[1]) : 0;
      return Response.json({ data: { teams: nodes([{ ...f.provider.teams[0], id: uuid(100 + current) }], `page-${current + 1}`) } });
    };
    let cursor: string | undefined;
    for (let page = 1; page <= 5; page++) {
      const result = await f.runtime().query({ type: "linear.workflow.catalog", projectId: "project", resource: "teams", ...(cursor ? { cursor } : {}) });
      assert.equal(result.type, "linear.workflow.catalog"); if (result.type !== "linear.workflow.catalog") continue;
      assert.equal(result.page, page); assert.equal(result.limitReached, page === 5);
      if (page === 5) assert.equal(result.nextCursor, null);
      cursor = result.nextCursor ?? undefined;
    }
  } finally { await f.close(); }
});

test("Linear opt-out, missing credential and read-only session gates prevent networking or mutation admission", async () => {
  const f = await fixture();
  try {
    f.changeBoard((board) => { board.linear.enabled = false; });
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: "Generated opted-out request" } }), /off by default/);
    assert.equal(f.provider.requests.length, 0);
    f.changeBoard((board) => { board.linear.enabled = true; });
    await f.integrations.setLinearToken(undefined, AbortSignal.timeout(2000));
    await assert.rejects(() => f.preview({ action: "issue.create", fields: { title: "Generated no credential" } }), /keychain/);
    assert.equal(f.provider.requests.length, 0);
    await f.integrations.setLinearToken(generatedToken, AbortSignal.timeout(2000));
    f.commit([{ event_type: "session.created", profile_id: "default", project_id: "project", session_id: "readonly", payload: { title: "Generated side", controls: factoryControls(), kind: "side", mode: "read-only" } }]);
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.preview", projectId: "project", sessionId: "readonly", input: { action: "issue.delete", issueId: ids.issue } }), /read-only/);
    assert.equal(f.provider.requests.length, 0);
    f.commit([{ event_type: "policy.updated", profile_id: "default", payload: { policy: { revision: 1, allowedEnvs: ["Remote"] }, finishingTurnIds: [] } }]);
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue }), /excludes Local/);
    assert.equal(f.provider.requests.length, 0);
  } finally { await f.close(); }
});

test("Linear credential revocation and team changes abort their exact old in-flight requests", async () => {
  for (const change of ["revoke", "team"] as const) {
    const f = await fixture();
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; }); let aborted = false;
    try {
      f.provider.hook = ({ name, signal }) => {
        if (name !== "MoguriLinearIssue") return;
        entered(); return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error(generatedToken)); }, { once: true }));
      };
      const request = f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue });
      const rejection = assert.rejects(request, (error: unknown) => { assert.equal(String(error).includes(generatedToken), false); return true; });
      await started;
      if (change === "revoke") await f.integrations.setLinearToken(undefined, AbortSignal.timeout(2000));
      else f.changeBoard((board) => { board.linear.teamId = ids.otherTeam; });
      await rejection; assert.equal(aborted, true); assert.equal(f.mutations().length, 0);
    } finally { await f.close(); }
  }
});

test("Linear keychain changes block new captures until completion and invalidate old reviews without substituting accounts", async () => {
  const f = await fixture();
  try {
    const review = await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated reviewed author" } });
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); f.vault.holdWrite = () => held;
    const changing = f.integrations.setLinearToken("lin_api_generated_second_account", AbortSignal.timeout(2000));
    const before = f.provider.requests.length;
    await assert.rejects(() => f.runtime().query({ type: "linear.workflow.issue", projectId: "project", issueId: ids.issue }), /change|pending/);
    assert.equal(f.provider.requests.length, before);
    release(); await changing; f.vault.holdWrite = undefined;
    await assert.rejects(() => f.execute(review), /changed|stale/);
    const accountReview = await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated reviewed identity" } });
    f.provider.actorId = ids.user;
    await assert.rejects(() => f.execute(accountReview), /changed|stale/);
    assert.equal(f.mutations().length, 0);
  } finally { await f.close(); }
});

test("Linear intent, job and command receipt are atomic before dispatch and duplicate delivery never sends another mutation", async () => {
  const f = await fixture();
  try {
    let beforeEffect = false;
    f.provider.hook = ({ query }) => {
      if (!query.startsWith("mutation")) return;
      const operations = (f.snapshot() as Snapshot & LinearSnapshot).linearOperations;
      assert.equal(operations.length, 1);
      const operation = operations[0]!, job = f.snapshot().jobs.find((entry) => entry.id === operation.jobId)!;
      assert.equal(operation.dispatched, true); assert.equal(job.operationId, operation.id);
      assert.equal(f.store().receipt(operation.commandId, operation.commandDigest)?.id, operation.id); beforeEffect = true;
    };
    const review = await f.preview({ action: "issue.create", fields: { title: "Generated exactly once" } }), commandId = randomUUID();
    const original = await f.execute(review, commandId), completed = await f.wait(original.result.id!);
    assert.equal(completed.operation.status, "completed"); assert.equal(beforeEffect, true);
    f.store().db.prepare("DELETE FROM receipts WHERE profile_id=? AND id=?").run("default", commandId);
    const repeated = await f.runtime().execute(original.command, f.finish(original.command, commandId));
    assert.equal(repeated.id, original.result.id); assert.equal(f.mutations().length, 1);
    await assert.rejects(() => f.execute(review), /Preview|expired|Missing/);
    assert.equal(f.mutations().length, 1);
    const changed: LinearCommand = { ...original.command, input: { action: "issue.create", fields: { title: "Generated changed command" } } } as LinearCommand;
    await assert.rejects(() => f.runtime().execute(changed, f.finish(changed, commandId)), /changed|reused/);
    await assert.rejects(() => f.runtime().execute(original.command, (() => ({})) as WorkspaceFinish), /actual-user/);
  } finally { await f.close(); }
});

test("Linear cancellation before dispatch is no-effect cancellation, never a hidden mutation", async () => {
  const f = await fixture();
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; }); let scopes = 0;
  try {
    f.provider.hook = ({ name, signal }) => {
      if (name !== "MoguriLinearScope" || ++scopes !== 3) return;
      entered(); return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Generated pre-dispatch stop.")), { once: true }));
    };
    const review = await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated cancelled update" } });
    const original = await f.execute(review); await started;
    const stop: LinearCommand = { type: "linear.workflow.cancel", operationId: original.result.id! };
    await f.runtime().execute(stop, f.finish(stop));
    const result = await f.wait(original.result.id!);
    assert.equal(result.operation.status, "cancelled"); assert.equal(result.operation.dispatched, false);
    assert.equal(result.operation.stopRequested, true); assert.equal(f.mutations().length, 0);
  } finally { await f.close(); }
});

test("Linear cancellation still aborts the actual request if retaining its stop intent fails", async () => {
  const f = await fixture();
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; }); let scopes = 0, aborted = false;
  try {
    f.provider.hook = ({ name, signal }) => {
      if (name !== "MoguriLinearScope" || ++scopes !== 3) return;
      entered(); return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("Generated actual owned abort.")); }, { once: true }));
    };
    const original = await f.execute(await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated stop persistence failure" } }));
    await started;
    const cancel: LinearCommand = { type: "linear.workflow.cancel", operationId: original.result.id! };
    const failedFinish = (() => { throw new Error("Generated stop receipt persistence failure."); }) as WorkspaceFinish;
    await assert.rejects(() => f.runtime().execute(cancel, failedFinish), /persistence failure/);
    const result = await f.wait(original.result.id!);
    assert.equal(aborted, true); assert.equal(result.operation.status, "cancelled"); assert.equal(f.mutations().length, 0);
  } finally { await f.close(); }
});

test("Linear cancellation after dispatch retains late remote IDs and a verified response without claiming full success", async () => {
  const f = await fixture();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; }), held = new Promise<void>((resolve) => { release = resolve; });
  try {
    f.provider.hook = async ({ name, variables }) => {
      if (name !== "MoguriLinearIssueUpdate") return;
      f.provider.changeIssue(ids.issue, object(variables.input)); entered(); await held;
      return Response.json({ data: { issueUpdate: { success: true, issue: f.provider.issues.get(ids.issue) } } });
    };
    const original = await f.execute(await f.preview({ action: "issue.update", issueId: ids.issue, fields: { title: "Generated dispatched title" } }));
    await started;
    const stop: LinearCommand = { type: "linear.workflow.cancel", operationId: original.result.id! };
    await f.runtime().execute(stop, f.finish(stop)); release();
    const result = await f.wait(original.result.id!);
    assert.equal(result.operation.status, "partial"); assert.equal(result.operation.stopRequested, true);
    assert.equal(result.result?.acknowledgement, "verified"); assert.deepEqual(result.operation.remoteIds, [ids.issue]);
    assert.equal(result.job?.status, "partial"); assert.equal(f.mutations().length, 1);
  } finally { release?.(); await f.close(); }
});

test("Linear push preserves a concurrent local edit after remote dispatch and retains the actual remote result", async () => {
  const f = await fixture();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; }), held = new Promise<void>((resolve) => { release = resolve; });
  try {
    const local = f.local();
    f.provider.hook = async ({ name, variables }) => {
      if (name !== "MoguriLinearIssueUpdate") return;
      f.provider.changeIssue(ids.issue, object(variables.input)); entered(); await held;
      return Response.json({ data: { issueUpdate: { success: true, issue: f.provider.issues.get(ids.issue) } } });
    };
    const original = await f.execute(await f.preview({ action: "ticket.sync", direction: "push", localIssueId: local.id, expectedLocalRevision: 0, mapping: phaseMapping }));
    await started;
    f.commit([{ event_type: "issue.saved", profile_id: "default", project_id: "project", payload: { issue: { ...local, revision: 1, title: "Generated concurrent local edit survives" }, actor: "user" } }]);
    release(); const result = await f.wait(original.result.id!);
    assert.equal(result.operation.status, "partial");
    assert.equal(f.snapshot().issues[0]?.title, "Generated concurrent local edit survives");
    assert.equal(f.snapshot().issues[0]?.revision, 1);
    assert.equal(object(f.provider.issues.get(ids.issue)).title, local.title);
    assert.deepEqual(result.operation.remoteIds, [ids.issue]); assert.equal(result.result?.acknowledgement, "verified");
  } finally { release?.(); await f.close(); }
});

test("Linear restart recovery never replays dispatched or undispatched original jobs and schema-40 upgrade preserves receipts", async () => {
  for (const dispatched of [false, true]) {
    const f = await fixture();
    try {
      f.holdJobs();
      const commandId = randomUUID(), original = await f.execute(await f.preview({ action: "issue.create", fields: { title: "Generated interrupted create" } }), commandId);
      const operation = (f.snapshot() as Snapshot & LinearSnapshot).linearOperations[0]!;
      if (dispatched) f.commit([{ event_type: "linear.operation_recorded", profile_id: "default", project_id: "project", payload: { operation: { ...operation, revision: 1, updatedAt: tick(20), dispatched: true } } }]);
      removePost44FixtureMarkers(f.store().db);
      f.store().db.exec("BEGIN IMMEDIATE; DELETE FROM retention_metadata WHERE id IN ('task_progress_schema','document_attachment_schema'); PRAGMA user_version=40; COMMIT;");
      f.restart();
      assert.equal(Number(f.store().db.prepare("PRAGMA user_version").get()?.user_version), PROTOCOL_VERSION);
      const current = await f.runtime().query({ type: "linear.workflow.read", operationId: original.result.id! });
      assert.equal(current.type, "linear.workflow.read"); if (current.type !== "linear.workflow.read") continue;
      assert.equal(current.operation.status, dispatched ? "partial" : "cancelled");
      const repeated = await f.runtime().execute(original.command, f.finish(original.command, commandId));
      assert.equal(repeated.id, original.result.id); assert.equal(f.mutations().length, 0);
      assert.equal(f.store().receipt(commandId, current.operation.commandDigest)?.id, original.result.id);
    } finally { await f.close(); }
  }
});

test("Linear original inputs, receipts and jobs survive source project retention loss independently", async () => {
  const f = await fixture();
  try {
    const result = await f.apply({ action: "issue.create", fields: { title: "Generated independently retained result" } });
    const independent = f.history().filter((event) => event.event_type === "linear.operation_recorded" || event.event_type === "job.started" || event.event_type === "job.finished");
    assert.ok(independent.length > 0);
    assert.ok(independent.every((event) => event.artifact_id === result.operation.id));
    f.store().commit([{ event_type: "project.removed", profile_id: "default", payload: { deletedProjectId: "project", usage: [] } }], undefined, { projects: ["project"] });
    f.restart();
    assert.equal(f.snapshot().projects.length, 0);
    const retained = await f.runtime().query({ type: "linear.workflow.read", operationId: result.operation.id });
    assert.equal(retained.type, "linear.workflow.read");
    if (retained.type === "linear.workflow.read") {
      assert.equal(retained.document.input.action, "issue.create"); assert.equal(retained.operation.status, "completed");
      assert.equal(retained.result?.remote[0]?.id, result.result?.remote[0]?.id); assert.equal(retained.job?.status, "completed");
    }
  } finally { await f.close(); }
});

test("Linear projection rejects changed intent, erased effects, fabricated success and terminal replay", async () => {
  const f = await fixture();
  try {
    const completed = await f.apply({ action: "issue.create", fields: { title: "Generated immutable ownership" } });
    const initial = f.history().find((event) => event.event_type === "linear.operation_recorded")!;
    assert.equal(initial.event_type, "linear.operation_recorded");
    const first = (initial.payload as { operation: LinearOperation }).operation;
    assert.equal(projectLinearOperation(undefined, first).id, completed.operation.id);
    assert.throws(() => projectLinearOperation(undefined, { ...first, dispatched: true }), /corrupt/);
    assert.throws(() => projectLinearOperation(first, { ...first, revision: 1, commandId: "changed" }), /corrupt/);
    assert.throws(() => projectLinearOperation(first, { ...first, revision: 1, status: "completed" }), /corrupt/);
    const terminal = completed.operation;
    assert.throws(() => projectLinearOperation(terminal, { ...terminal, revision: terminal.revision + 1, dispatched: false }), /corrupt/);
    assert.throws(() => projectLinearOperation(terminal, { ...terminal, revision: terminal.revision + 1, status: "running" }), /corrupt/);
    assert.throws(() => projectLinearOperation(terminal, { ...terminal, revision: terminal.revision + 1, resultDigest: "b".repeat(64) }), /corrupt/);
    assert.throws(() => new LinearWorkflows(f.store(), f.host, f.integrations, { maxReviews: 0 }), /bounded/);
    assert.throws(() => new LinearWorkflows(f.store(), f.host, f.integrations, { reviewTtlMs: Number.POSITIVE_INFINITY }), /bounded/);
  } finally { await f.close(); }
});

test("Linear SDK and real local HTTP/event transport share reviewed state and retain session-owned results after session deletion", { timeout: 20_000 }, async () => {
  const f = await sdkFixture();
  try {
    await f.enable();
    const states = await f.sdk.linear.catalog(f.projectId, "states");
    assert.equal(states.team.id, ids.team); assert.equal(states.items.length, 2);
    const { preview } = await f.sdk.linear.preview({ projectId: f.projectId, sessionId: f.sessionId }, { action: "issue.create", fields: { title: "Generated SDK remote issue" } });
    const admitted = await f.sdk.linear.accept(preview, true), result = await f.sdk.linear.wait(admitted.id!, { timeoutMs: 5000 });
    assert.equal(result.operation.status, "completed");
    assert.equal(result.operation.sessionId, f.sessionId); assert.equal(result.job?.sessionId, f.sessionId);
    await f.other.refresh();
    assert.equal((await f.other.linear.read(admitted.id!)).operation.id, result.operation.id);
    assert.equal(f.other.getState().snapshot?.linearOperations[0]?.status, "completed");
    const foreign = new MoguriSdk(f.service.connection, undefined, "generated-other-profile");
    assert.throws(() => foreign.linear.accept(preview, true), /different immutable profile/);
    const rejected = await fetch(`${f.service.connection.baseUrl}/v1/query`, {
      method: "POST", headers: { Authorization: `Bearer ${f.service.connection.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "linear.workflow.execute", projectId: f.projectId, input: preview.document.input, expectedDigest: preview.digest, confirm: true }),
    });
    assert.equal(rejected.status, 400);
    await f.sdk.sessions.delete(f.sessionId, true);
    const independent = await f.sdk.linear.read(admitted.id!);
    assert.equal(independent.operation.status, "completed"); assert.equal(independent.job?.status, "completed");
    assert.equal(independent.result?.remote[0]?.id, result.result?.remote[0]?.id);
    assert.equal(f.provider.requests.filter((entry) => entry.query.startsWith("mutation")).length, 1);
    assert.equal(JSON.stringify(f.service.controller.events(0)).includes(generatedToken), false);
  } finally { await f.close(); }
});

test("Linear SDK generic job cancellation records actual stop intent and retains dispatched remote receipts", { timeout: 20_000 }, async () => {
  const f = await sdkFixture();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; }), held = new Promise<void>((resolve) => { release = resolve; });
  try {
    await f.enable();
    f.provider.hook = async ({ name, variables }) => {
      if (name !== "MoguriLinearIssueUpdate") return;
      f.provider.changeIssue(ids.issue, object(variables.input)); entered(); await held;
      return Response.json({ data: { issueUpdate: { success: true, issue: f.provider.issues.get(ids.issue) } } });
    };
    const { preview } = await f.sdk.linear.preview({ projectId: f.projectId, sessionId: f.sessionId }, { action: "issue.update", issueId: ids.issue, fields: { title: "Generated generic job stop" } });
    const admitted = await f.sdk.linear.accept(preview, true); await started;
    const original = await f.sdk.linear.read(admitted.id!);
    await f.sdk.jobs.cancel(original.operation.jobId); release();
    const result = await f.sdk.linear.wait(admitted.id!, { timeoutMs: 5000 });
    assert.equal(result.operation.status, "partial"); assert.equal(result.operation.stopRequested, true);
    assert.equal(result.job?.status, "partial"); assert.deepEqual(result.operation.remoteIds, [ids.issue]);
  } finally { release?.(); await f.close(); }
});

test("Linear actual source-session deletion aborts and joins its owned request without deleting the independent partial result", { timeout: 20_000 }, async () => {
  const f = await sdkFixture();
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
  try {
    await f.enable();
    f.provider.hook = async ({ name, variables, signal }) => {
      if (name !== "MoguriLinearIssueUpdate") return;
      f.provider.changeIssue(ids.issue, object(variables.input)); entered();
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      return Response.json({ data: { issueUpdate: { success: true, issue: f.provider.issues.get(ids.issue) } } });
    };
    const { preview } = await f.sdk.linear.preview({ projectId: f.projectId, sessionId: f.sessionId }, { action: "issue.update", issueId: ids.issue, fields: { title: "Generated delete-session cancellation" } });
    const admitted = await f.sdk.linear.accept(preview, true); await started;
    await f.sdk.refresh(); await f.sdk.sessions.delete(f.sessionId, true);
    const result = await f.sdk.linear.wait(admitted.id!, { timeoutMs: 5000 });
    assert.equal(f.sdk.getState().snapshot?.sessions.some((entry) => entry.id === f.sessionId), false);
    assert.equal(result.operation.status, "partial"); assert.equal(result.operation.stopRequested, true);
    assert.equal(result.job?.status, "partial"); assert.equal(result.job?.sessionId, f.sessionId);
    assert.equal(result.result?.acknowledgement, "verified"); assert.deepEqual(result.operation.remoteIds, [ids.issue]);
  } finally { await f.close(); }
});

test("Linear desktop panel renders an explicit opt-in/review surface without fetching or authorizing on mount", async () => {
  const f = await fixture();
  try {
    f.changeBoard((board) => { board.linear.enabled = false; });
    const sdk = new MoguriSdk({ protocolVersion: PROTOCOL_VERSION, baseUrl: "http://127.0.0.1:1", wsUrl: "ws://127.0.0.1:1", token: "generated-unused-connection", pid: process.pid });
    const snapshot = f.snapshot(), html = renderToStaticMarkup(createElement(LinearWorkflowPanel, { sdk, project: snapshot.projects[0]!, snapshot }));
    assert.match(html, /Off by default/); assert.match(html, /Local tickets stay local/);
    assert.match(html, /Choose exact changes/); assert.match(html, /Preview exact Linear operation/);
    assert.match(html, /disabled/); assert.equal(f.provider.requests.length, 0);
  } finally { await f.close(); }
});
