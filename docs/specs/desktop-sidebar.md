# Desktop sidebar specification

## Status

Product specification for a planned Moguri desktop surface. It does not describe implemented behavior.

## Purpose

The desktop app has a persistent, session-aware sidebar beside the main session. The sidebar gives users supporting views without replacing or obscuring the primary chat.

This sidebar is desktop-only. The TUI keeps its own navigation and split-panel presentation and does not implement this sidebar contract. Both clients still use the same typed local API, domain model, event stream, permissions, and cancellation semantics.

## Product rules

- The session in the primary pane is the **main session** for the sidebar.
- Switching the main session rebinds every sidebar panel to that session, its project, and its worktree.
- Sidebar content comes from the local control plane. Panels must not keep authoritative copies of session, terminal, file, extension, or usage state.
- Desktop-only layout preferences such as width, collapsed state, active panel, and inline-metric visibility may remain local UI preferences.
- Actions that affect Git, processes, files, sessions, extensions, or remote systems use the same policy checks and explicit confirmations as every other client.
- A panel may show unavailable or partial data, but must explain why. It must not turn missing data into zeroes or successful states.

## Navigation and layout

The sidebar provides these top-level panels:

1. Changes
2. Terminal
3. Files
4. Browser
5. Side chat
6. Insights
7. Extensions

Only one panel needs to be open at a time. The sidebar can collapse, resize, show status badges, and preserve its presentation state. Opening an item may create a split panel without changing the main-session binding.

Keyboard navigation, focus order, labels, and status announcements must make every panel usable without a pointer.

## Panels

### Changes

Changes shows the main session's worktree state:

- staged, unstaged, untracked, conflicted, and externally changed files;
- file and aggregate diffs;
- the relationship between changes, commits, branch, work item, and pull request;
- refresh and explicit Git actions allowed by the active policy.

The local service owns Git status and mutation. The desktop must not infer repository state from a cached diff or push, merge, rebase, discard changes, or delete a branch without explicit user action or policy.

### Terminal

Terminal shows terminals and process trees associated with the main session and worktree. Users can open a terminal, inspect output, send input, and request cancellation.

Moguri records terminal ownership and the requested, acknowledged, completed, failed, or partial cancellation outcome. Closing a terminal view must not silently terminate its process, and a stopped or partially stopped process must not be shown as successful.

Show the session's effective execution mode and SendBox readiness. A sandboxed session opens guest terminals through the execution backend, never a host shell as a fallback. When Require SendBox is enabled, label any previously running host turn as YOLO finishing until it ends; do not imply that enabling the setting retroactively sandboxed it.

### Files

Files provides a worktree-scoped file tree, search, open-with actions, and text or binary previews. Editing, if enabled, writes through the local service and reports conflicts with external changes.

The panel must respect repository boundaries, content-exclusion rules, ignored or protected paths, profile permissions, and file-size limits. It must not read arbitrary files outside the approved project scope.

### Browser

Browser hosts private development previews through the optional [`stainless`](https://github.com/mbianchidev/stainless) integration. It can associate a preview, page, console output, network diagnostics, screenshots, and Playwright activity with the main session.

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
- wall time and active model, tool, MCP, and terminal time;
- input, output, cached, system-prompt, message, tool-schema, tool-call, MCP-call, and compaction tokens;
- estimated, provider-reported, and billed cost as distinct values;
- tool and MCP calls, retries, failures, and cancellation outcomes;
- compaction history, storage use, artifacts, interventions, and diagnostic events;
- turn and steering metrics defined below.

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
- selected and effective execution mode, policy revision, sandbox readiness, and host turns permitted to finish after global Require SendBox is enabled;
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

## Delivery order

The sidebar shell follows the documented phase order:

- Phase 0 validates the desktop shell, PTY supervisor, native addon and packaging choices in the [architecture decisions](../architecture/decisions.md) before implementation.
- Phases 1 and 2 establish the main-session binding and add panels backed by the first session-control vertical slice.
- Phase 3 connects work items, worktrees, changes, files, and artifacts.
- Phase 4 adds complete Insights metrics and inline turn metrics.
- Phase 5 enables extension management and profile-scoped health.
- Side chat and the Stainless browser integration land with their later-work capabilities; their sidebar entries may expose an unavailable state earlier.

## Acceptance checks

- [ ] The sidebar exists in desktop and is not required in the TUI.
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
- [ ] Both clients agree on execution mode and enforcement; sandboxed terminal actions cannot run on the host, and already-running YOLO turns are visibly distinguished from protected new work.
