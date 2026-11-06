# First-milestone acceptance and roadmap

## Merged-code audit, 2026-11-06

The current baseline is merged main
[`812e335`](https://github.com/mbianchidev/moguri/commit/812e33526e432fb92b580956f97f8c2bf269e002),
including [#51](https://github.com/mbianchidev/moguri/pull/51), protocol **92**
and **0.31.0-alpha.1**. Its executable/test cut is `81dec6a`; the subsequent
qualification notes and merge do not change those executable bytes.
The [exact completion record](architecture/milestone-completion.md#final-frozen-ciruntime-cut)
contains the complete macOS source result (2,455 passes, 29 explicit skips),
owned Linux source result (1,604 passes, 831 explicit skips), installed SDK
and packaged application evidence. These are local generated results, not
GitHub-hosted CI, Linux release support or current physical SendBox acceptance.

| Area | Current status |
| --- | --- |
| Shared clients, durable sessions and controls | Implemented, including drafts/queues, profiles, independent artifacts, managed worktrees, original terminal ownership and restart/migration coverage. |
| Model windows and long pastes | Implemented: maximum/half or actual provider windows, exact scoped files for pastes over 50 lines, and preservation of unsupported context. |
| Automatic Kupo and budgets | Implemented: Single/Cascade/Critique, exact pooled window/effort, all-role token/USD holds, selected-boundary finishing and separately reviewed checkpoints. [#36](https://github.com/mbianchidev/moguri/issues/36) is complete. |
| Runtime/hardware readiness | Implemented and merged in #51, with one-use actual-user executable review and honest unknown capacity. [#37](https://github.com/mbianchidev/moguri/issues/37) is complete. |
| Reviewed candidate transports | Local v1 and pinned-SSH/native-private v2 staging, tests and separately accepted application are implemented. Native physical qualification remains a separate gate. |
| Required combinations and native acceptance | [#38](https://github.com/mbianchidev/moguri/issues/38) remains open. Six explicit Local/SSH finite-routing cases are not the complete required cross-product; fresh exact-worker guest/control/network/cleanup evidence is still missing. |
| Final integrated acceptance | [#17](https://github.com/mbianchidev/moguri/issues/17) remains open. Do not rebuild merged features or replace missing physical/hosted evidence with passing fixtures. |

The latest main CI
[run 42183960883](https://github.com/mbianchidev/moguri/actions/runs/42183960883)
failed **before either OS job started any step**. Both check annotations report
failed account payments or an insufficient spending limit. The account owner
must resolve that GitHub billing/eligibility gate before a fresh authorized
main-CI run can qualify the build. The earlier six-hour cancellation and its
now-merged fixture/runtime repairs remain distinct historical evidence.
CI still runs only on pushes to `main`; a working-branch PR with no checks
is not green CI.

Released SendBox 0.2.4's documented Meta-DNS prerequisite and fresh physical
qualification of the exact current worker remain unresolved. Producer images
and earlier physical receipts cannot qualify changed native payloads.
No host fallback, broader egress, personal authorization or upstream change
is implied. Real Jev's missing enforceable wire stays blocked; Laya remains
optional. Development packaging is ad-hoc signed, not notarized.

## Ordered remaining roadmap

The live parent is [#39](https://github.com/mbianchidev/moguri/issues/39).
Ordering does not authorize implementation or turn optional features into
first-milestone prerequisites.

| Order | Remaining work |
| --- | --- |
| 1. First-milestone acceptance | #38 exact required combination/native evidence; #17 criterion-by-criterion integrated acceptance and real hosted CI eligibility. |
| 2. Existing integrations and everyday workflows | #45 remaining applicable skills controls; #7 durable PR-watch association/freshness/notifications; #9 cross-repository GitHub My Work inbox; #23 opt-in OTLP export; #13 per-turn rewind; #12 actual Stainless integration. |
| 3. Distribution and documentation | #26 Homebrew cask and install/update ownership; #14 landing/downloads/user/developer site. Publication/access, licensing and signing remain explicit decisions. |
| 4. Optional providers and automation | #34 Laya; #6 recurring/declarative workflows; #8 dependency roundups; #10 continuous personas; #11 specialized presets; #46 Slack mentions. Existing one-time scheduled prompts are not a recurring workflow engine. |

The [#22 Rust feasibility study](https://github.com/mbianchidev/moguri/issues/22)
is complete, with its source and reproduction harness retained at `d8a3c9c`
on the separately named prototype branch. Closing the investigation does not
authorize production adoption. Any future Rust change still needs an explicit
decision, current-protocol parity, ADRs and a feature-equivalent value/release
comparison. No Rust rewrite is a current milestone blocker.

## Historical handoff

Everything below preserves the original pre-merge handoff and starting-point
estimate. Its PR states, gaps and SendBox 0.2.3 request are historical, not the
current backlog. The merged-code status above and canonical
[milestone criteria](implementation.md#milestone-acceptance-criteria) take
precedence; no new numeric completion estimate is inferred.

Current protocol86 snapshot retry and separately reviewed transport checkpoints
are in [the exact retry/checkpoint contract](architecture/native-retry-checkpoints.md).
The preceding selected-boundary scheduling/decision/finishing slice is retained
in [owned model transports](architecture/owned-model-transports.md).
Jev's real bounded output/accounting contract, live model source review and the
wider roadmap remain separate from those implementation-owned paths.
The historical handoff and starting-point estimate below remain original.

Historical issue-17 source continuation: model windows/scoped paste, native
0.2.3 service/client lifecycle, reviewed Local Cascade/Critique, finite Local
wind-down/accepted-work checkpoints and
[bounded Local Max](architecture/owned-decisions.md) now have executable shared
paths. The [generated full/packed/fresh-native sweep](setup.md#final-protocol-40-source-acceptance)
passes; live-provider/quality and disclosed unsupported combinations remain
open. This does not change the historical starting point, frozen archives,
roadmap boundaries or estimate below.

## Starting point

> **0.28 in development:** Copilot catalogue/metadata inspection. Informational
> only, not proof of model-family independence or working compound routing.

**Open at that starting point:** public Cascade/Critique, budget wind-down/checkpoint commits,
System One/Max, previously paused Sandbox, and final hardening.
Version bumps alone do not justify increasing the estimate.

This preserves the user's requested capability-level starting point. The
committed 0.28 inspector and 0.29 private role-contract checkpoint do not close
those public workflow or first-release gates. Test totals, archive numbers and
private prototypes are evidence about their stated scope, not milestone
completion. Do not increase the existing estimate merely because another
package/protocol version was produced; this handoff sets no new numeric estimate.

The implementation specification's
[milestone acceptance criteria](implementation.md#milestone-acceptance-criteria)
remain authoritative. Audit executable behavior before implementing a gap:
many limitations in the earlier gap table have already been addressed.

## Historical committed baseline

At the original handoff, implementation was on draft
[PR #5](https://github.com/mbianchidev/moguri/pull/5), not merged into `main`.
The implementation checkpoint was
`6e84af318517d41629b33243ceb87682f2c22843`; this document is a subsequent
documentation-only commit. Preserve the committed implementation in the fresh
session rather than rebuilding it from the documentation-only default branch.
Do not merge, rebase, close a PR or create a stacked PR without the required
user direction.

Existing foundations include shared SDK/service/TUI/desktop control, maintained
Copilot login, configured local models, core pinned SSH execution, isolated
profiles and inherited defaults, fixed-model caps/accounting/dashboard,
managed Local worktrees, typed attachments, independent artifacts/answers,
Ghostty user consoles and owned restart recovery. Opt-in Single and Guided
advice exist; private owned roles, canonical proposals, metadata inspection and
declared output contracts are not public compound orchestration or Max.
See [setup](setup.md) for exact implemented and unavailable behavior.

## Historical first-milestone acceptance gaps

| Area | Remaining work and acceptance evidence |
| --- | --- |
| Public compound routing | Expose complete bounded Cascade and Critique/revision through shared SDK, CLI/TUI and desktop. Bind approved model/pattern/privacy policy to actual classifier and role results; make conditional escalation/revision/final-candidate selection explicit. Router/critic advice must never become instructions, permissions or human acceptance. Preserve rejected candidates separately from the user's worktree. |
| Model identity and quality | Provider-declared family/vendor/version is informational. Do not infer independent training from labels, model-name prefixes, provider names, aliases or generated fixtures. Document the eligibility source and limitations; keep unsupported local/remote identity unknown. Mechanical contract validity is not code quality or a calibrated confidence threshold. |
| Budgets and wind-down | Connect cumulative token/USD caps to every router, solver, critic, revision, checkpoint and decision role. Integrate complete held capacity, late/unknown telemetry and actual-policy wind-down. Attempt only an authorized accepted-work checkpoint commit before the cap, preserving denial/failure/partial outcomes, the user's index/HEAD and explicit Git policy. Do not enable finite kupo merely because private reservation primitives pass. |
| System One and Max | Complete a compatible bounded decision-provider path, including the documented Jev contract only where its actual limits are enforceable. Wire fixed-model and kupo decisions, questions, tool approvals and bounded steering under explicit delegation. Retain the real model actor, provenance, cost and applied/rejected outcome. Human intervention, changed policy, hard denials and user-only facts must win races. |
| Sandbox execution | Previously paused and still unqualified. The new user request explicitly resumes Moguri integration with released SendBox **0.2.3**, not an older runtime or assumed readiness. Complete real owned worker/model/tool transport, policy, provenance, cancellation, guest/control loss, restart and reviewed source publication. No Local fallback, broad egress workaround or falsely successful cleanup. |
| Env/control combinations | Prove supported fixed/kupo, autonomy, Env and budget combinations through the same authority. Preserve Local defaults and the recorded finish-current-turn exception when allowed-env policy tightens. Retain core SSH host/root/account provenance, remote inference and no-replay behavior while adding Sandbox and new model controls. |
| Cancellation and final hardening | Complete or explicitly report inability to stop the whole owned process tree, including detached/reparented descendants. Exercise concurrent clients, stale approvals/decisions, stop and policy-revocation races, failed cancellation/cleanup, actual controller/guest/SSH loss, migrations, corrupted state, storage pressure, provider outages and plugin incompatibility. Unknown or partial work must not become successful. |
| Cross-client and durable regression | Revalidate every changed path across SDK, CLI, actual TUI and desktop. Preserve drafts/held queues, distinct Queue/Steer/Interrupt behavior, source-independent artifacts, managed worktree ownership, profile isolation, exact accounting categories and original terminal owners. Every durable change needs migration and restart/no-replay coverage; never require deleting user state. |

## Historical user-reported app requirements

### Model context-window choices

- Offer the model maximum and half of that maximum for each model.
- If the provider actually declares supported working windows, use that
  supported information instead of inventing extra options.
- Replace arbitrary UI-only context-window choices with a consistent typed
  SDK/service contract used by desktop, CLI and TUI.
- Preserve the maximum bound and truthful estimated input/output accounting.
  Do not silently clamp, drop context or claim an exact token measurement.
- Cover model changes, persisted defaults/overrides, stale selection,
  unsupported values, boundary rounding and windows below the current
  working-context minimum where relevant.

### Pasted text exceeding 50 lines

- When a session receives pasted text with **more than 50 lines**, create a
  scoped file attachment rather than supplying the entire paste to model
  context.
- Make the file available through the existing bounded read/grep/search tools
  so the agent can discover relevant sections. A filename pointing to a file
  that the selected execution boundary cannot read is not a complete solution.
- Keep the behavior in the SDK/control plane, not only a desktop paste handler.
  Preserve the exact text, source/retention ownership and the unsent draft on
  failed/cancelled persistence.
- Respect project-free sessions, profiles, permissions, protected paths,
  attachment limits and Local/Remote/Sandbox boundaries. Never silently write
  an unexpected source file or upload the whole text through another route.
- Test exactly 50 versus 51 lines, line endings, large input, concurrent edits,
  queue/restart/retention, inaccessible files and model/tool compatibility.

### SendBox 0.2.3

- Inspect the released 0.2.3 integration contract and verify the actual host,
  guest/workload versions, trusted artifact hashes and required runtime before
  changing Moguri readiness.
- Re-run owned generated qualification against 0.2.3. Historical 0.2.1
  failures are evidence about that older release, not proof that 0.2.3 works
  or fails.
- Prove cold provider networking, scoped request access, actual model/tool
  frames, stop/cleanup, guest/control loss and restart with no replay or
  fallback. Apply real permissions and complete accounting throughout.
- Record pass/fail measurements under `docs/`. Keep readiness blocked for any
  unmet gate. Do not restart archived SendBox work or make unrelated changes
  in other repositories.

## End-to-end handoff rules

Work from the actual committed implementation in one fresh Moguri session.
Use the issue checklist, existing architecture and phase order; implement
complete vertical slices and mark acceptance evidence, not versions, complete.
Carry all new capability APIs through the SDK and wire both clients. Maintain
the existing default-dark UI and explicit user-only Git/policy actions.

The previous Sandbox pause is lifted specifically for the requested 0.2.3
integration. It is not permission to bypass isolation or policy, assume a
successful installation, complete personal authorization, access a real
microphone or run uncontrolled workloads.

No release tag, merge, broad new workstream or estimate increase is requested.
Keep earlier qualified archives immutable. Continue to commit with
`--no-gpg-sign` and no tool/agent attribution.

## Not silently added to the milestone

The owner subsequently requested the explicitly scoped
[protocol-41 platform extension](architecture/platform-workflows.md):
Sky/Terra/Glacier knowledge, reviewed hooks/repository-backed marketplace,
two-way GitHub/Linear workflows, private/workspace and Python/Rust/Go caches,
and a qualified SendBox requirement for whole-descendant containment.
This request does not change this handoff's first-milestone estimate or
retrospectively qualify older images/archives.

Broader orchestrator/session groups, multi-repo coordination, Porto/database
plugins, scheduling, specialized modes and managed cloud provisioning remain
separate deferred work. Do not silently make them new first-milestone blockers.
