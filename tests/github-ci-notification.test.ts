import assert from "node:assert/strict";
import test from "node:test";
import { githubApplicationFixture } from "./github-workflows-fixture.ts";
import { AttentionNotifier, type Banner } from "../apps/desktop/src/notifications.ts";
import { ciTime } from "./fixtures/time-scale.ts";

test("CI failure raises one private source-bound notification and marking it read never answers or restarts work", { timeout: ciTime(30_000) }, async () => {
  const f = await githubApplicationFixture();
  try {
    const project = await f.sdk.github.project(f.scope), head = f.git(["rev-parse", "HEAD"]);
    const source = { kind: "pull" as const, repository: project.repository, account: project.account, accountId: project.accountId, number: 11 };
    f.setCi({ checks: [{ id: 82, name: "Generated failed check", status: "completed", conclusion: "failure", head_sha: head }], runs: [], statuses: [] });
    const review = await f.sdk.github.previewCi(f.scope, source, { timeoutMs: 1000, pollMs: 50 });
    const started = await f.sdk.github.execute(review, review.document.confirmations, true);
    const finished = await f.sdk.github.wait(started.id!, { timeoutMs: 5000 });
    await f.sdk.refresh();
    const snapshot = f.sdk.getState().snapshot!, entries = snapshot.attention.filter((entry) => entry.reason === "ci");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.messageId, started.id);
    assert.equal(entries[0]?.operationRevision, finished.operation.revision);
    assert.equal(entries[0]?.source, "state");
    assert.equal(entries[0]?.kind, "bell");
    const visible = { ...snapshot, settings: { ...snapshot.settings, values: { ...snapshot.settings.values,
      notifications: { ...snapshot.settings.values.notifications, os: true, previewContent: false } } } };
    const shown: Banner[] = [], notifier = new AttentionNotifier(0), events = f.service.controller.events(0);
    notifier.observe(visible, events, false, (banner) => shown.push(banner));
    notifier.observe(visible, events, false, (banner) => shown.push(banner));
    assert.equal(shown.length, 1);
    assert.equal(shown[0]?.body, "A PR CI watch needs inspection.");
    const userMessages = f.session().messages.filter((message) => message.role === "user").length;
    await f.sdk.attention.acknowledge([entries[0]!.id]);
    assert.equal(f.sdk.getState().snapshot!.attention.find((entry) => entry.id === entries[0]!.id)?.active, true);
    assert.equal(f.session().pendingQuestionId, null);
    assert.equal(f.session().pendingApproval, null);
    assert.equal(f.session().messages.filter((message) => message.role === "user").length, userMessages);
    assert.equal((await f.sdk.github.ci(f.scope, source)).watches.length, 1);
    assert.deepEqual(f.writes(), { issues: 0, pulls: 0 });
  } finally { await f.close(); }
});
