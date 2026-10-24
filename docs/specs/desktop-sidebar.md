# Desktop sidebar specification

## Status

Product specification for the full Moguri desktop sidebar. The initial executable
checkpoint implements the persistent shell, main-session binding, collapse/width
preferences and basic Insights/event trace. The session-workspace alpha adds
actual Ghostty terminals, read-only diffs/files, retained editable Local plans,
linked PR access, isolated native previews and parallel question-only side
sessions. Protocol 17 adds Files, Changes and read-only Plan views from the
actual pinned SSH workspace, without a same-named Local fallback.
Protocol 20 adds exact user-requested Remote plan saves with reviewed binding,
owned no-model execution, actual partial/cleanup state and independently retained
Remote snapshots. Scope changes preserve dirty editors, including held settled
RPC responses. Protocol 21 adds sanitized tool/MCP outcomes and key-backed
retained sizes; protocol 22 adds explicit actual-root GitHub metadata review,
exact refresh/stop, immutable repository/owner/visibility filtering and
unassigned-history coverage. None of these grant tools or dispatch a model.
Its current rail starts with Dashboard, Artifacts, Candidates, Sandbox,
Suggestions and Global Terminal, followed by Terminal, Browser, Insights,
PR when linked, Changes, Files, Plan and Side chat. Attention is in the top bar.
Profile-resource shortcuts open the same independent workspace as the left
navigation; source-chat selection never creates a hidden session.
Suggestions use explicit scoped source
review and configuration proposals; attention read state is not a user answer
or tool decision. Project-free chats show a project-required state for agent workspace
panels instead of reusing a previous root. The user-console exception below
does not grant a model workspace. Extensions remain a roadmap panel,
with capability settings elsewhere. Full metrics,
Stainless automation, native Sandbox terminals and
the remaining release acceptance checks are not claimed complete.
Protocol-25 source adds explicit pinned SSH user consoles with captured-host
Ghostty input/restart semantics, separately from protected process isolation.
See [setup](../setup.md) and [D16](../architecture/decisions.md#d16-session-workspace-ghostty-and-retention).

## Purpose

The desktop app has a persistent, session-aware sidebar beside the main session.
Session-bound tools support that chat; profile-wide resources instead open an
independent central workspace with Back to chat. Their rail shortcuts do not
create a second resource owner or another chat.

This sidebar is desktop-only. The TUI keeps its own navigation and split-panel presentation and does not implement this sidebar contract. Both clients still use the same typed local API, domain model, event stream, permissions, and cancellation semantics.

## Product rules

- The session in the primary pane is the **main session** for the sidebar.
- Switching the main session rebinds session-scoped panels to that session, its project, and its worktree.
- Terminal has separate private User and read-only Agent tabs. Global Terminal opens the independent profile-owned Local console; changing chats never rebinds that console.
- Sidebar content comes from the local control plane. Panels must not keep authoritative copies of session, terminal, file, extension, or usage state.
- Desktop-only layout preferences such as width, collapsed state, active panel, and inline-metric visibility may remain local UI preferences.
- Actions that affect Git, processes, files, sessions, extensions, or remote systems use the same policy checks, autonomy level, and human or delegated approval attribution as every other client. Opening a panel grants no new delegation.
- A panel may show unavailable or partial data, but must explain why. It must not turn missing data into zeroes or successful states.

## Navigation and layout

The first six rail entries are Dashboard, Artifacts, Candidates, Sandbox,
Suggestions and Global Terminal, in that order. Session tools then appear as
Terminal, Browser, Insights, PR when linked, Changes, Files, Plan and Side chat.
Extensions remains a roadmap panel, not an implemented additional entry.

Only one panel needs to be open at a time. The sidebar can collapse, resize, show status badges, and preserve its presentation state. Opening an item may create a split panel without changing the main-session binding.

Both the left project navigation and right context pane have draggable inner
edges and keyboard-focusable separators. Arrow keys resize in 16-pixel steps;
Home/End use the available bounds. Widths persist locally, with the previous
wide/narrow right-pane preference accepted on upgrade. Desktop resizing reserves
at least 340 pixels for chat at the supported window minimum; smaller responsive
layouts use overlays instead. The right pane's **<>** button hides it without
ending owned work, and any rail icon reopens its panel. Rail labels appear as
hover/focus tooltips; unsaved panel edits still prevent collapse/navigation.

Keyboard navigation, focus order, labels, and status announcements must make every panel usable without a pointer.

## Panels

### Changes

Changes shows the main session's worktree state:

- staged, unstaged, untracked, conflicted, and externally changed files;
- file and aggregate diffs;
- the relationship between changes, commits, branch, work item, and pull request;
- refresh and explicit Git actions allowed by the active policy.

The local service owns Git status and mutation. The desktop must not infer repository state from a cached diff or push, merge, rebase, discard changes, or delete a branch without explicit user action or policy.

In Remote, query and mutate the selected SSH workspace through its worker. A same-named local path is not the remote worktree.

### Terminal

Terminal shows terminals and process trees associated with the main session and worktree. Users can open a terminal, inspect output, send input, and request cancellation.
The **Global terminal** scope is also available without any session, limited to
one Local console per profile. **This chat** keeps its own consoles; a
project-free chat explicitly opens the disclosed Local home root, never inherits
a project root. Opening either is a user action, not model workspace authority.
Use Ghostty through its maintained web/WASM integration rather than writing a
terminal emulator. The current Local user console is separate from model tool
permissions. Input/output are ephemeral and never become implicit agent context.

Moguri records terminal ownership and the requested, acknowledged, completed, failed, or partial cancellation outcome. Closing a terminal view must not silently terminate its process, and a stopped or partially stopped process must not be shown as successful.

Show the effective Env, target host, and readiness. Sandbox opens guest terminals; Remote opens terminals on the selected SSH machine. Neither may fall back to a Local shell. If allowed-env policy excludes Local, label any previously running Local turn as Local finishing until it ends; do not imply that a setting retroactively sandboxed it or that SSH alone supplies SendBox controls.

### Files

Files provides a worktree-scoped file tree, search, open-with actions, and text or binary previews. Editing, if enabled, writes through the local service and reports conflicts with external changes.

The panel must respect repository boundaries, content-exclusion rules, ignored or protected paths, profile permissions, and file-size limits. It must not read arbitrary files outside the approved project scope.

Remote files resolve through the authenticated worker and remote workspace identity, not the local filesystem. Transfer previews and edits only within the approved scope, with explicit unavailable/conflict states when SSH is disconnected.

### Browser

Browser hosts private development previews through the optional [`stainless`](https://github.com/mbianchidev/stainless) integration. It can associate a preview, page, console output, network diagnostics, screenshots, and Playwright activity with the main session.
The alpha's basic native isolated preview does not claim Stainless diagnostics,
automation or model-controlled browser tools.

Stainless connection, permission, and health state must be visible. Browser data enters model context only through an explicit user action, tool call, or configured policy. If Stainless is absent or unavailable, the panel shows the missing capability and setup path instead of a broken browser surface.

### Side chat

Side chat is a companion conversation linked to the main session. Its context can include:

- main-session metadata and current lifecycle state;
- selected turns, steering messages, tool or MCP activity, and diagnostics;
- current changes, terminals, files, browser state, and insights;
- user-selected artifacts and event references.

Every context contribution must retain a source reference so the user can see what the side chat knows. Side-chat messages, usage, cost, tools, and cancellation are recorded separately and linked to the main session.

Awareness does not imply control. The side chat cannot silently steer or interrupt the main session, change files, run tools, or perform Git actions. Sending a message or proposed action to the main session is an explicit control-plane command subject to normal permissions and confirmation.

### Insights

Insights is a live, current-main-session view. It includes:

- lifecycle state, model, provider, profile, project, worktree, branch, and work item;
- selected Env and target host, fixed-model or kupo selection and availability, effective autonomy level, actual per-leg providers/models, and human versus generative-model versus System One decision actors;
- wall time and active model, tool, MCP, and terminal time;
- input, output, cached, system-prompt, message, tool-schema, tool-call, MCP-call, and compaction tokens;
- estimated, provider-reported, and billed cost as distinct values;
- tool and MCP calls, retries, failures, and cancellation outcomes;
- compaction history, storage use, artifacts, interventions, and diagnostic events;
- turn and steering metrics defined below.

Show router/classifier, draft, critic, revision, escalation, and approval/steering calls separately, including their usage, cost, latency, outcome, and delegation. Synthetic-model totals aggregate all legs without hiding intermediate failures. Automated answers and steers link to their decision request and policy revision; they are never displayed as user answers.

Show Unlimited or the effective token/USD caps, remaining reservations, telemetry quality, wind-down state, and checkpoint/commit outcomes. Unknown or late remote usage is pending/unavailable, not zero; a requested or failed commit is not a successful checkpoint commit.

#### Turn and steering metrics

Moguri records enough timing and attribution data to show:

- token usage for each turn;
- token usage attributable to each applied steer;
- steer wait time from requested to applied;
- steer response time from applied until the next steer is applied or the turn reaches a terminal state;
- **time per steer**, defined as total time from requested until that same boundary;
- generated tokens per second for each provider generation;
- aggregate tokens per steer, time per steer, and generated tokens per second for the main session.

A steer attribution window begins when the steer is applied at a safe boundary. It ends immediately before the next steer is applied or when the turn completes, fails, or is cancelled. Provider requests in that window carry the steer identifier. Partial, failed, superseded, interrupted, and cancelled windows retain their measured time and token usage with their actual outcome.

Token totals must not double-count cached or category breakdowns. Provider-reported values take precedence. Derived attribution is labeled **estimated** and includes its method.

Generated tokens per second is:

`output tokens / active generation seconds`

Use the provider's output-token count and measured generation interval. If either value is unavailable, show the metric as unavailable. A wall-clock approximation may be shown only when labeled **estimated**. Turn throughput uses total output tokens generated in the turn divided by total measured active generation time in that turn. Session throughput uses the same weighted calculation across the session. Neither value is an unweighted average of per-request rates, and tool, MCP, queue, and other non-generation time is excluded.

Non-generative classification and System One calls retain their usage and cost but do not inflate text-generation throughput. Report their decision latency separately.

Users can optionally show a compact metrics footer on every chat turn. The preference can be set globally and overridden for the current session. The footer shows available turn totals and generated tokens per second. A turn with steers lists each steer separately with attributed tokens and canonical total time per steer; wait and response time are available as a breakdown. In-progress values are marked provisional and settle from stored events when the turn reaches a terminal state.

### Extensions

Extensions lists canvas extensions and MCP Apps available to the active profile. It shows:

- installed, enabled, disabled, unavailable, incompatible, and unhealthy states;
- source, version, declared capabilities, permissions, and profile scope;
- connection or process health and useful diagnostics;
- actions to open a canvas or MCP App and explicitly enable, disable, configure, install, update, or remove it.

Extension state and permissions belong to the local control plane. Opening an extension may use a desktop canvas, but the extension cannot bypass profile isolation, secret storage, audit events, or user confirmation.

A canvas extension is a plugin that exposes an interactive desktop canvas. An MCP App is an MCP integration that exposes an interactive app surface in addition to, or instead of, ordinary tools. Both use the existing plugin or integration manifest, capability, compatibility, permission, profile, and health model rather than creating a second extension authority. MCP tool calls keep normal MCP telemetry; app lifecycle and permission events are recorded separately and linked to the same extension identity.

## Data and protocol requirements

Phase 1 domain and event design must support:

- a stable main-session identifier for every sidebar query and command;
- linked side-chat sessions with separate usage, cost, tools, and cancellation;
- turn and steer identifiers on provider requests and usage records, including the originating client or linked side-chat session for each steer;
- timestamps for turn start and terminal outcome, steer requested and applied, generation start and completion, and cancellation transitions;
- provider-reported versus derived token attribution and timing quality;
- terminal ownership, file-change conflicts, browser capability state, and extension health;
- requested/effective Env, default and allowed-env policy sources, SSH host/workspace identity, readiness, and Local turns permitted to finish after Local is excluded;
- fixed/kupo selection and availability, versioned routing plans and leg identities, autonomy level, delegation, typed decision requests/results, actor, confidence semantics, and decision-originated steers;
- budget caps, usage/reservations, telemetry quality, warnings, exhaustion, and checkpoint/commit outcomes;
- restart recovery without losing accepted steers, measurements, linked side-chat context, or terminal state promised by the service.

Durable additions use the versioned event stream and migrations. Presentation preferences do not need session events unless they must synchronize across desktop installations.

## Cross-client behavior

- The TUI does not gain the desktop sidebar or its layout preferences.
- Mutations started from a sidebar panel appear in the TUI through the shared event stream.
- TUI actions update the open desktop panels through the same stream.
- Insights queries and metrics definitions are shared even when the TUI presents them differently.
- A side chat is a linked session, not hidden desktop-only state, so its lifecycle and resource use remain observable to other clients.

## Failure and cancellation behavior

- Each panel distinguishes loading, empty, unavailable, disconnected, permission-denied, failed, cancelled, and partially completed states.
- Reconnecting replays stored events before accepting new mutations.
- A stale panel cannot overwrite newer queue, file, terminal, extension, or session state.
- Cancelling the main session does not silently cancel side chat, and cancelling side chat does not silently cancel the main session. A workflow may cancel both only when ownership and policy say so.
- Loss of Stainless, an MCP App, or an extension cannot make the main session fail unless the active operation depends on it; that operation receives a specific diagnostic.
- SendBox failure or unavailable guest terminal support produces a diagnostic or unavailable state, never a replacement host terminal or an unsandboxed retry.
- SSH loss leaves remote process completion/cancellation unconfirmed until reconciled. Preserve the main session, late usage, and pending operations; do not replace it with Local execution or repeat side effects on reconnect.

## Delivery order

The sidebar shell follows the documented phase order:

- Phase 0 validates the desktop shell, PTY supervisor, native addon, Remote SSH, composer/default contracts, and packaging choices in the [architecture decisions](../architecture/decisions.md) before implementation.
- Phases 1 and 2 establish the main-session binding and add panels backed by the first session-control vertical slice.
- Phase 3 connects work items, worktrees, changes, files, and artifacts.
- Phase 4 adds complete Insights metrics and inline turn metrics.
- Phase 5 enables extension management and profile-scoped health.
- Side chat and the Stainless browser integration land with their later-work capabilities; their sidebar entries may expose an unavailable state earlier.

## Acceptance checks

- [x] The sidebar exists in desktop and is not required in the TUI.
- [ ] Switching the main session rebinds all panels without leaking state from the previous profile, project, or session.
- [ ] Changes, Terminal, and Files reflect external and TUI-originated updates without stale writes.
- [ ] Browser clearly handles connected, missing, disconnected, denied, and failed Stainless states.
- [ ] Side chat cites its main-session context and cannot mutate or steer the main session without an explicit command.
- [ ] Insights traces every total to stored events and labels provider-reported, measured, and estimated values.
- [ ] Turn metrics can be enabled or hidden without changing the recorded session data.
- [ ] Per-steer token and time attribution does not overlap or disappear after failure, cancellation, restart, or a second steer.
- [ ] Generated tokens per second uses output tokens and active generation time, with unavailable or estimated states handled explicitly.
- [ ] Extensions expose capability, permission, profile, version, and health state without leaking secrets.
- [ ] Concurrent desktop and TUI actions cannot corrupt panel state or bypass policy and cancellation semantics.
- [ ] Both clients agree on Env and allowed-env enforcement; Sandbox/Remote terminal actions cannot run locally, and already-running Local turns remain visibly distinguished from protected new work.
- [ ] Both clients agree on model selection and autonomy level; all kupo and decision-provider calls remain attributable, and model decisions cannot masquerade as human approval or bypass a hard policy.
- [ ] Remote Changes, Terminal, and Files use the selected SSH workspace; connection loss cannot become false success, zero usage, duplicate execution, or Local fallback.
- [ ] Budget state distinguishes unlimited preference from inherited caps, provider/estimated/unknown usage, reservations, wind-down, and actual commit outcomes.
