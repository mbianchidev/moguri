import { openSettingsSection } from "./navigation.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compoundApiFixture } from "../fixtures/compound-api.ts";

const require = createRequire(import.meta.url);
test.skip(process.platform !== "darwin", "Actual desktop compound worker is qualified on macOS.");
test("desktop reviews public task/plan/architecture/source and model cost, separately approves real project tests, then separately applies the selected candidate", async () => {
  const f = await compoundApiFixture(); await f.configure();
  await f.sdk.command({ type: "draft.save", sessionId: f.sessionId, expectedRevision: f.session().draft.revision, text: "Generated preserved unsent composer draft.", attachments: [] });
  const index = await readFile(join(f.project, ".git/index"));
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openSettingsSection(page, "Candidates");
    await page.getByLabel("Settings source chat", { exact: true }).selectOption(f.sessionId);
    const compound = page.getByRole("region", { name: "Public compound workflows", exact: true });
    await compound.getByLabel("Compound task", { exact: true }).fill(f.input.input.task);
    await compound.getByLabel("Compound request plan", { exact: true }).fill(f.input.requestPlan);
    await compound.getByLabel("Compound request architecture", { exact: true }).fill(f.input.requestArchitecture);
    await compound.getByLabel("Compound source paths", { exact: true }).fill("fixture.txt");
    await compound.getByLabel("Compound draft worktree", { exact: true }).selectOption(f.workspace.id);
    await compound.getByLabel("Compound alternate worktree", { exact: true }).selectOption(f.alternate.id);
    await compound.getByLabel("Compound validation script", { exact: true }).selectOption("generated-validation");
    await compound.getByRole("button", { name: "Review compound input", exact: true }).click();
    await expect(compound.getByRole("region", { name: "Exact compound input review", exact: true })).toContainText("generated original");
    await expect(compound.getByRole("button", { name: "Start reviewed compound", exact: true })).toBeDisabled();
    await compound.getByLabel("Reviewed compound input and model cost", { exact: true }).check();
    await compound.getByRole("button", { name: "Start reviewed compound", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().compoundWorkflows[0]?.status).toBe("waiting_validation");
    const review = compound.getByRole("region", { name: "Exact compound staging and test review", exact: true });
    await expect(review).toContainText(f.proposal.plan); await expect(review).toContainText(f.proposal.architecture); await expect(review).toContainText(f.command);
    await expect(review.getByRole("button", { name: "Stage and run reviewed project tests", exact: true })).toBeDisabled();
    expect(await f.source()).toBe("generated original\n"); expect(f.session().draft.text).toBe("Generated preserved unsent composer draft.");
    await review.getByLabel("Reviewed compound staging and test", { exact: true }).check();
    await review.getByRole("button", { name: "Stage and run reviewed project tests", exact: true }).click();
    await expect.poll(() => f.service.controller.snapshot().compoundWorkflows[0]?.status).toBe("proposed");
    await expect(compound).toContainText("GENERATED_REAL_PROJECT_TEST_PASSED");
    expect(await f.source()).toBe("generated original\n");
    await compound.getByRole("button", { name: "Inspect recommended candidate", exact: true }).click();
    const candidates = page.getByRole("region", { name: "Reviewed repository candidates", exact: true });
    await candidates.getByRole("button", { name: "Review source application", exact: true }).click();
    await candidates.getByRole("button", { name: "Apply reviewed files", exact: true }).click();
    await expect.poll(() => f.sdk.getState().snapshot!.candidates[0]?.status).toBe("applied");
    expect(await f.source()).toBe(f.proposal.patch.edits[0]!.text); expect(await readFile(join(f.project, ".git/index"))).toEqual(index);
    expect(f.session().draft.text).toBe("Generated preserved unsent composer draft.");
    expect(errors).toEqual([]);
  } finally { await app.close(); await f.close(); }
});

test("desktop saves only explicitly reviewed compound policy and exact-model lineage claims without selecting a model or starting inference", async () => {
  const f = await compoundApiFixture();
  f.policy.routes = [{ id: "generated-reviewed-critique", pattern: "critique", draftId: f.ids[1]!, criticId: f.ids[3]!, lineageReviewId: null }];
  const app = await electron.launch({ executablePath: process.env.MOGURI_TEST_APP ?? require("electron"), args: process.env.MOGURI_TEST_APP ? [] : ["."],
    env: { ...process.env, MOGURI_STATE_DIR: join(f.directory, "state"), MOGURI_TEST_WINDOW: "hidden" } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("form", { name: "Message composer" }).getByRole("button", { name: /^Model:/ }).click();
    await page.getByRole("button", { name: "kupo Single settings", exact: true }).click();
    await page.getByLabel("kupo workflow", { exact: true }).selectOption("compound");
    await page.getByLabel("Complete compound routing policy", { exact: true }).fill(JSON.stringify(f.policy));
    const review = page.getByRole("region", { name: "Source-backed lineage review", exact: true });
    await review.getByLabel("Lineage draft model", { exact: true }).selectOption(f.ids[1]!);
    await review.getByLabel("Lineage critic model", { exact: true }).selectOption(f.ids[3]!);
    await review.getByLabel("Reviewed draft lineage", { exact: true }).fill("generated-alpha");
    await review.getByLabel("Reviewed critic lineage", { exact: true }).fill("generated-beta");
    await review.getByLabel("Lineage source URL", { exact: true }).fill("https://generated.example.invalid/training-report");
    await review.getByLabel("Lineage source text", { exact: true }).fill("Generated explicitly reviewed synthetic lineage report, not real training or quality proof.");
    await review.getByLabel("Lineage review limitations", { exact: true }).fill("Generated user policy claim only. Real training and model quality remain unproven.");
    await expect(review.getByRole("button", { name: "Add reviewed lineage claim to draft", exact: true })).toBeDisabled();
    await review.getByLabel("Reviewed exact lineage source", { exact: true }).check();
    await review.getByRole("button", { name: "Add reviewed lineage claim to draft", exact: true }).click();
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect.poll(() => f.sdk.routing.policy()?.workflow).toBe("compound");
    const policy = f.sdk.routing.policy(); expect(policy?.workflow).toBe("compound");
    if (!policy || policy.workflow !== "compound") throw new Error("Generated reviewed compound policy did not persist.");
    expect(policy.lineageReviews).toHaveLength(1);
    expect(policy.routes[0]?.pattern === "critique" && policy.routes[0].lineageReviewId).toBe(policy.lineageReviews[0]!.id);
    expect(f.session().controls.modelId).toBeNull(); expect(f.session().controls.env).toBe("Local");
    expect(f.session().controls.autonomy).toBe("Manual"); expect(f.session().controls.budget.kind).toBe("unlimited");
    expect(f.requests).toHaveLength(0); expect(f.providers.every((provider) => !provider.requests.length)).toBe(true);
  } finally { await app.close(); await f.close(); }
});
