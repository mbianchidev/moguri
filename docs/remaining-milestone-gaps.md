# First-milestone acceptance and roadmap

## Acceptance continuation, 2026-11-11

The starting merged main is
[`13001b7`](https://github.com/mbianchidev/moguri/commit/13001b7e206211cc70b32639b155de0b064bf2e1),
including #62, protocol101 / `0.32.0-alpha.1`. The unchanged milestone criteria
still govern acceptance. The [current native record](architecture/milestone-combination-matrix.md#current-build-qualification-2026-11-11)
preserves the initial ten-gate 0.2.4 pass, later startup failures and the
subsequent reviewed 0.2.5 seven-pass/two-fail/one-skip outcome separately.
All **3,360 nominal native cells remain unqualified**; neither source test
counts nor a host installation reduces that set.

The user selected Apple Container 1.7.1 and personally installed the reviewed
SendBox bytes and matched trusted Apple CLI without agent-driven host/service
changes. Actual compatible-backend support and newly reported Rust dependency
repairs were merged in
[mbianchidev/sendbox#85](https://github.com/mbianchidev/sendbox/pull/85).
The user then directed use of published 0.2.6 and personally installed its
reviewed side-by-side package. Exact hosted-workflow provenance, unchanged
Ed25519 trust root, every signed guest artifact and patched release locks are
verified; factory/producer/qualifier defaults now select 0.2.6 without changing
saved older choices. Fresh current-payload native receipts remain prerequisites,
not completed main delivery or an inferred scope exclusion.

This Moguri branch adds the complete physical cell runner and direct
root-disclosure/pre-copy-inspection repairs. Its focused source/build/type and
fresh packed external SDK checks pass, with zero npm vulnerabilities. Current
host parsing is not native execution acceptance; original physical retry/
rewind failures remain open. No reviewed-script Sandbox path or broader UI
work is claimed by this acceptance continuation.

The requested order remains acceptance under #39, reviewed Sandbox scripts
under #45, then the explicit #53 interaction polish. The historical audit below
keeps its original source/PR states and receipts; it is not the newer branch's
delivery claim.

## Historical merged-code audit, 2026-11-10

The audited main is
[`2f6c4bc`](https://github.com/mbianchidev/moguri/commit/2f6c4bcfd2755725facdf4250941ac06e130a309),
including merged [#60](https://github.com/mbianchidev/moguri/pull/60),
protocol **99**, **0.32.0-alpha.1**. The unchanged
[milestone criteria](implementation.md#milestone-acceptance-criteria), not a
version, test total or closed issue, define acceptance.

The [current protocol99 evidence](architecture/session-inbox.md#final-qualification-2026-11-10-utc)
names implementation/package cut `13fd073` and clean final test cut `c39995a`.
Their runtime/package/script bytes are identical. Its full source, actual
TUI, hidden desktop, packed SDK, installed app and ten feature-specific native
gates are recorded separately, with exact artifacts and earlier failures.
They are not hosted CI or the complete native/control matrix.

The control-placement correction at
[`ac15a9f`](https://github.com/mbianchidev/moguri/commit/ac15a9f83469ccbd0aa4b742c2105a034d733b36)
is **on this branch, not yet merged main delivery**: source admission only in
Settings / Skills, and checkpoints/rewind in the existing session prompt
timeline sidebar. It preserves named skill-load activity, exact review and
restoration authority, with no protocol/schema change. Its new client
qualification does not relabel the older app/native receipts.

## Delivered on main, not remaining implementation

| Delivery | Current executable scope and evidence |
| --- | --- |
| #51; closed #36/#37 | Shared runtime/hardware readiness, one-use reviewed executable probes, exact pooled window/effort, finite all-role reservations and reviewed Local/SSH/private-native candidates. Shared sessions, queues, profiles, independent artifacts, worktrees, typed context and Ghostty ownership already exist. |
| #52; closed #7 | Retained exact-PR CI watches, deduplication, original observations, loss/restart recovery and notifications across SDK/CLI/TUI/desktop. [PR/CI contract](architecture/github-workflows.md#protocol93-qualification). |
| #56; #38 is closed | Complete required Local/SSH source cell/criterion mapping, GitHub/input and control repairs. The [matrix](architecture/milestone-combination-matrix.md) retains all 10,080 nominal cells: 6,720 Local/SSH pass at the protocol99 test cut, while 3,360 native cells remain explicitly unqualified. #56 explicitly disclaims full/native acceptance; GitHub's closed issue state is not that acceptance. |
| #57 | Narrow actual DS4/DeepSeek compatibility and cache-accounting evidence, not a general model-quality/capacity or all-Env claim. [Exact contract](architecture/ds4-compatibility.md). |
| #58; closed #9 | Unified authorized cross-repository GitHub My Work inbox, distinct from the existing active-session dashboard and the session notification Inbox. Refresh is read-only and profile/account/repository-bound. [My Work contract](architecture/my-work.md). |
| #59; selected #23 slice | Original-owner startup/reconnect, background-window lifecycle and opt-in metadata-only OTLP traces/metrics over control-plane records. Export is off by default; logs, content capture and peer/guest-internal auto-instrumentation are not implemented. [Startup](architecture/startup-responsiveness.md) and [OTLP](architecture/otlp-export.md). |
| #60; closed #13 and selected #45 slice | Governed complete Local skill-source admission/provenance/least privilege/revocation, justified complete-source/envelope limits, per-turn checkpoints and reviewed Local/pinned-SSH/private-Sandbox rewind. Also actual named skill-load indicators, session Inbox and centered empty states. [Source/rewind](architecture/skills-and-rewind.md) and [Inbox/load](architecture/session-inbox.md) contracts. |

Closed #35 keeps its historical exact-artifact scope. Closed #22 is a completed
Rust feasibility study, not production adoption; #1 is reference material.
No closed implementation/research issue certifies first-milestone acceptance.

## Remaining first-milestone acceptance

[#39](https://github.com/mbianchidev/moguri/issues/39) owns this checklist.
[#17](https://github.com/mbianchidev/moguri/issues/17) is administratively
consolidated into that parent as redundant tracking, **not completed milestone
acceptance**. No actual gate is removed or silently narrowed:

- [ ] Record final criterion-by-criterion integrated acceptance against the
  unchanged specification, with exact source/builds, cross-client ownership,
  failure/restart/migration and supported/unavailable outcomes.
- [ ] Qualify the remaining required native/control/role/input combinations,
  including current-policy and actual-human races, candidates, finishing,
  cancellation failure, guest/control/SSH loss, late/unknown accounting,
  receipts and no-replay recovery. Keep all 3,360 unqualified native cells
  visible; accepted scope changes require an explicit product decision.
- [ ] Restore account eligibility and record a fresh authorized hosted-main
  CI pass. Generated/local source and package success cannot replace it.

The latest main
[run 42984028685](https://github.com/mbianchidev/moguri/actions/runs/42984028685),
for `13001b7`, failed on 2026-11-11 before either OS job ran a step.
Both annotations still say recent payments failed or the spending limit
needs increasing. This is a refreshed account-owned gate, not a diagnosis of
an install/build/test failure. Separate notices mention macOS arm64 capacity
and the Ubuntu 26 label migration. CI stays main-push-only; absent branch/PR
checks are not green CI. No rerun, billing action or trigger change was made.

### Current native evidence remains exact-build scoped

The user installed independently verified, released
[SendBox0.2.6](https://github.com/mbianchidev/sendbox/releases/tag/v0.2.6).
It includes matched Container1.7.1 support and patched host/guest dependencies.
At clean `a91f8a9`, all ten protocol101 selected physical gates pass, including
real cold provider/network policy, owned-guest teardown, retry/checkpoints,
three rewind scopes and hidden desktop restoration. Historical failures retain
their original outcomes; earlier reviewed0.2.5 bytes are not retroactively
dependency-patched.

The separately approved [protocol102 native identity repair](architecture/candidate-transports.md#versioned-native-identity-repair)
changes worker/bridge bytes. Its [current-image continuation](architecture/milestone-combination-matrix.md#protocol102-continuation-2026-11-12)
passes focused actual native candidates, original rollback-journal recovery,
real guest Cascade/Critique tests and every native TUI/desktop selection.
Those are not all3,360 nominal cells, the full remaining loss/concurrency set,
arbitrary reviewed scripts or a new ten-gate/final integrated receipt. Earlier
protocol99/101 receipts cannot qualify changed102 bytes.

The subsequent clean102 ten-gate run passes, but the full nominal run exposes
the [reviewed macOS PTY capacity defect](architecture/milestone-combination-matrix.md#reviewed-pty-capacity-repair-2026-11-12).
Its487 observed passes are not accepted cells. The user-approved maintained
PTY beta fixes the600-exit allocator regression; its changed dependency/image
still requires the fresh complete nominal and final integrated receipts.

The subsequent host-only echo repair is also not final acceptance: a fresh TUI
case exposes independent guest-PTY restoration after the worker completed.
The [nested terminal repair](architecture/milestone-combination-matrix.md#nested-private-terminal-repair-2026-11-12)
preserves strict control rejection and requires new exact bridge/image evidence.
The interrupted639 observed native cells qualify zero of the3,360 required
cells. Original setup failures during an observed external Meta quota window
and interrupted source invocations are retained, not relabeled green.
The subsequent combined host/guest setup still exposes late controller packets.
The [terminal ACK ordering repair](architecture/milestone-combination-matrix.md#terminal-ack-ordering-repair-2026-11-12)
addresses the accepted reply releasing the peer before its durable ACK, without
ignoring any unknown frame or changing authentication. Its fresh complete
qualification remains separate from earlier passing feature-specific gates.

Live provider/decision quality, calibrated independence/confidence and actual
billed-cost evidence remain distinct from generated accounting. Jev's missing
enforceable wire stays blocked; optional Laya is not a hidden milestone gate.
Public signing/notarization/distribution decisions are also separate.

## Ordered remaining roadmap

Ordering is triage, not permission to implement or an invented dependency chain.
Delivered #7/#9/#13/#36/#37/#38 do not reappear as new implementation work.

| Order | Actual remaining scope |
| --- | --- |
| 1. Acceptance | The three parent-owned acceptance items above, with the original native cell/gate definitions retained in the matrix. |
| 2. Everyday UX and existing integrations | #53 design/UX polish, #55 default smart-compaction direction, #45 remaining applicable AST controls and real reviewed-script Sandbox execution, #23 scope beyond the delivered metadata exporter, #12 actual Stainless qualification. The focused placement fix does not implement the #53 redesign or #55 policy. |
| 3. Distribution and docs | #26 Homebrew cask/access/install/update ownership; #14 landing/downloads/user/developer site. Repository visibility/access, license and signing/notarization need explicit decisions, not assumed publication. |
| 4. Optional providers and automation | #34 Laya, #6 recurring/declarative workflows, #8 dependency roundups, #10 continuous personas, #11 bounded specialized presets, #46 Slack mentions and #54 GetMoshi integration. Existing one-time schedules and reviewed compaction are not those broader features. |

#23 remains open for its broader requested scope: do not claim that OTLP export
is absent or implement a second ledger. Current export has no diagnostic-log
signal, exporter credentials/custom headers, content capture or peer/guest
internal propagation. Additional scope needs explicit privacy/transport review.

#45 remains open, but its obsolete 64-KiB script ceiling and missing Local
admission descriptions are not current gaps. Complete reviewed script source
now permits 512 KiB with a 2-MiB escaped envelope and real next-model
context/all-role-budget admission. Current [AST category boundaries](architecture/file-access.md#owasp-source-and-review-boundary)
still disclose unqualified reviewed-script Sandbox execution, unsupported Remote
skills/scripts, no semantic/malware scanner or external publisher PKI/global
revocation infrastructure, and no whole-descendant Local isolation or blanket
AST01-AST10 certification. Passing rewind/native gates does not authorize scripts.

At the live read the repository is private, has no repository license and has
no GitHub releases. Development macOS app/DMG/ZIP artifacts are ad-hoc signed,
not notarized or public distribution. This audit opens no other-repository PR,
changes no upstream dependency and makes no publication/installation decision.
Future Rust adoption still requires explicit direction, current-protocol parity,
ADRs and a feature-equivalent value/distribution comparison.

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
