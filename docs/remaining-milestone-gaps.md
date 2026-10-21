# First-milestone gap handoff

## Starting point

> **0.28 in development:** Copilot catalogue/metadata inspection. Informational
> only, not proof of model-family independence or working compound routing.

**Still open:** public Cascade/Critique, budget wind-down/checkpoint commits,
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

## Committed baseline, not remaining implementation

The current implementation is on draft [PR #5](https://github.com/mbianchidev/moguri/pull/5),
not merged into `main` at this handoff. The implementation checkpoint is
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

## First-milestone acceptance gaps

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

## User-reported app requirements

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

The canonical specification explicitly defers broader orchestrator/session
groups, multi-repo coordinated workflows, marketplaces/full hooks and
Sky/Terra/Glacier evolution, full GitHub/two-way Linear/Porto/database plugins,
scheduling, specialized workflows and managed cloud provisioning.
Track those existing roadmap items separately; do not turn them into new
first-milestone blockers or use them to inflate this handoff's estimate.
