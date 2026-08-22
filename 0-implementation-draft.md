# Moguri

> A local-first control plane for AI-assisted software development.

Moguri gives developers one place to run, inspect, steer, stop, resume, and understand AI software work across a terminal UI and desktop application.

It starts from [OpenCode](https://github.com/anomalyco/opencode) as a deliberately divergent fork. OpenCode is the initial technical foundation, not a compatibility boundary or the limit of the product. Moguri is not affiliated with the OpenCode project.

> [!WARNING]
> Moguri is pre-alpha. This README defines the product direction, architectural constraints, first implementation milestone, and working agreement for agents and contributors. It does not claim that the described features exist yet.

## Why Moguri

Current coding agents optimize individual conversations. Real software work spans repositories, worktrees, issues, pull requests, background processes, CI runs, decisions, and many resumable agent sessions.

Moguri treats that complete lifecycle as the product.

The goal is not another chat interface. The goal is an inspectable and durable workspace where:

- users own their data and credentials;
- terminal and desktop clients operate on the same state;
- every session, message, tool call, process, artifact, and cost event is traceable;
- every running action can be stopped;
- work can survive application restarts and session deletion;
- model providers, policies, tools, and integrations remain replaceable;
- automation remains bounded by explicit permissions, budgets, and stop conditions.

## Product principles

1. **Local first** — Core operation must not require a Moguri cloud service. State is stored locally and can be exported.
2. **User controlled** — Network access, destructive commands, background execution, and autonomous continuation are governed by visible policies.
3. **Interruptible** — Model requests, tools, subprocess trees, MCP calls, subagents, and workflows expose cancellation wherever the underlying provider permits it.
4. **Durable** — Drafts, queued messages, sessions, work items, and artifacts survive restarts.
5. **Observable** — Moguri exposes available prompts, reasoning summaries, tool activity, timing, token usage, compactions, errors, and costs. It must never promise access to hidden chain-of-thought.
6. **Honest accounting** — Estimated cost, provider-reported usage, and billed cost are stored separately.
7. **Portable** — Clients depend on Moguri protocols and domain types, not directly on one model provider.
8. **Profile isolated** — Credentials, projects, policies, integrations, budgets, and memory do not leak between profiles.
9. **No silent autonomy** — Self-modification, scheduled work, merges, pushes, and other consequential actions require explicit policy.

## Core concepts

| Concept | Meaning |
| --- | --- |
| **Profile** | An isolated identity and policy context containing credential references, projects, provider configuration, budgets, integrations, and memory boundaries. |
| **Folder** | A collection of related projects or repositories that may participate in one stream of work. |
| **Project** | A repository or local directory managed by Moguri. |
| **Work item** | A durable objective such as an issue, pull request, maintenance task, or user-defined goal. |
| **Change set** | The branch, worktree, commits, diffs, and optional pull request produced for a work item. |
| **Session** | A resumable execution context for one agent. Sessions are replaceable; project knowledge is not. |
| **Turn** | Work initiated by one admitted user or system message. A turn may contain several model steps. |
| **Step** | One model request and the tool activity caused by its response. |
| **Artifact** | Durable knowledge such as a decision, plan, answer, research note, or report. Artifacts outlive sessions. |
| **Workflow** | A declarative combination of a trigger, goal, profile, permissions, budget, stop conditions, and outputs. |

The durable hierarchy is:

```text
Profile
└── Folder
    └── Project
        └── Work item
            ├── Change set
            ├── Sessions
            └── Artifacts
```

A session contains an append-only stream:

```text
Session → Turn → Step → model, message, tool, MCP, process, compaction, and cost events
```

## Target architecture

```text
┌──────────────┐  ┌──────────────┐  ┌────────────────┐
│ Terminal UI  │  │ Desktop app  │  │ VSX extension  │
└──────┬───────┘  └──────┬───────┘  └───────┬────────┘
       └─────────────────┴───────────────────┘
                   typed local API
                  + event stream
                         │
             ┌───────────▼───────────┐
             │ Moguri control plane  │
             ├───────────────────────┤
             │ session lifecycle     │
             │ message queue         │
             │ cancellation          │
             │ worktrees/change sets │
             │ artifacts             │
             │ profiles/policies     │
             │ telemetry/budgets     │
             │ plugins/workflows     │
             └───────────┬───────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼───────┐
│ agent loop  │  │ provider/model│  │ capabilities │
│ + context   │  │ adapters      │  │ tools/MCP/FS │
└─────────────┘  └───────────────┘  └──────────────┘
```

The OpenCode-derived runtime is the first implementation of the agent loop and local API. New Moguri code should preserve clear seams so clients, telemetry, artifacts, and policies do not depend on provider-specific payloads.

### One source of truth

Durable state is represented by typed, append-only events. Current state, dashboards, transcripts, and model context are projections of that event stream.

Every durable event must contain at least:

```text
id, schema_version, timestamp, profile_id, project_id,
work_item_id?, session_id?, turn_id?, step_id?,
parent_event_id?, correlation_id?, event_type, payload
```

Events must be versioned and migratable. Large or binary payloads should be content-addressed outside ordinary event rows and referenced by digest.

No client may keep authoritative session state that is absent from the control plane.

### Persistence

Use the repository's existing SQLite and migration conventions for structured local state. Store large transcripts, attachments, process output, and snapshots as content-addressed blobs when placing them directly in SQLite would harm reliability or performance.

Required properties:

- atomic queue and lifecycle transitions;
- crash-safe writes;
- explicit schema migrations;
- tombstones or trash before destructive deletion;
- configurable retention with deletion disabled by default;
- pinned artifacts excluded from session garbage collection;
- export and backup paths that do not require internal database knowledge.

### Credentials and privacy

Profiles store references to credentials held by the operating-system keychain or another explicit secret backend. Secrets must not be written to config files, events, logs, artifacts, prompts, or analytics.

Moguri must disclose every remote connection it initiates. Product telemetry is opt-in. Local usage analytics remain local unless the user deliberately exports or shares them.

## First milestone: local session control plane

The first milestone proves that Moguri can own the complete local session lifecycle through both the desktop and terminal clients.

### 1. Hybrid desktop and terminal experience

The desktop app and TUI use the same protocol, commands, domain types, and event stream. Core controls must have behavior parity even when presentation differs.

Initial surfaces:

- project and work-item navigation;
- active, idle, blocked, completed, failed, and archived sessions;
- command palette;
- session detail and event trace;
- message composer with persistent drafts;
- editable message queue;
- visible running processes and stop controls;
- basic analytics dashboard.

### 2. Projects, work items, and worktrees

A session can attach to an existing project worktree or request a new isolated worktree. Moguri records the relationship between the work item, branch, worktree, commits, and pull request without treating Git as the session database.

Initial behavior:

- create, discover, open, and remove managed worktrees safely;
- detect dirty or externally modified worktrees;
- prevent accidental reuse by incompatible active sessions;
- preserve a worktree when deleting or archiving its session;
- never push, merge, rebase, or delete branches without explicit policy or user action.

### 3. Session lifecycle

Initial session states:

```text
created → idle → queued → running → waiting_input
                         ↘ stopping → stopped
                         ↘ completed
                         ↘ failed
any terminal state → archived → restored
```

Transitions must be explicit, persisted, observable, and idempotent. Restarting Moguri must reconcile interrupted sessions and processes without reporting false success.

### 4. Message queue

Message state is durable:

```text
draft → queued → claimed → admitted → completed
             ↘ edited
             ↘ cancelled
```

Users can edit, reorder, or remove only messages that have not been claimed. Claiming and queue mutation must be atomic.

Delivery modes:

- **Queue** — deliver after the current turn reaches a terminal boundary.
- **Steer** — inject the message at the next safe boundary in the current turn.
- **Interrupt** — request cancellation of the active turn, then admit the message after cancellation is acknowledged or explicitly fails.

The UI must distinguish requested, acknowledged, and completed cancellation.

### 5. Cancellation and process control

Cancellation propagates from workflows to sessions, subagents, tools, terminals, subprocess trees, and provider requests. Every component must report whether cancellation is supported and whether it succeeded.

A stopped action must never be recorded as successful. Errors and partial cleanup remain visible in the event trace.

Both clients must provide a manual stop control for every active command or agent-owned background process.

### 6. Durable artifacts

Initial artifact types:

- decision;
- plan;
- answer;
- research note;
- report.

Artifacts include scope, provenance, source-event references, creation time, status, and revision history. They may attach to a work item, project, folder, or profile, but not only to a session.

Deleting a session does not delete its artifacts. Deleting a project containing artifacts requires a preview and an explicit choice to retain, export, materialize into the repository, or delete them.

### 7. Telemetry, cost control, and dashboard

Capture enough data to answer:

- what is running;
- how long it has run;
- what model and provider were used;
- how many input, output, cached, system-prompt, tool-schema, and compaction tokens were reported or derived;
- which tools and MCP servers were called;
- which calls failed, retried, or were cancelled;
- how much the session is estimated to cost;
- whether a provider-reported or billed amount is available;
- how much budget remains.

Initial dashboard views:

- current session detail;
- sessions over 7, 30, 60, 90, and 365 days;
- selectable year, custom range, and all time;
- usage and cost by project, profile, provider, model, and session;
- wall time versus active model/tool time;
- compaction history;
- tool and MCP failure rates;
- archived sessions and storage usage.

Cost controls support warning and hard-stop thresholds at profile and session scope. Hard stops occur before another model request whenever possible; Moguri must not pretend it can recover already consumed provider cost.

Velocity metrics are experimental. Prefer time-to-green, successful work-item completion, intervention count, review cycles, and rework over raw commits or lines changed.

### 8. Profiles, policies, plugins, and providers

A profile combines:

- project and folder bindings;
- secret references;
- provider and model routing;
- policy packs and approval rules;
- session and workflow budgets;
- enabled plugins and integrations;
- isolated artifact and memory namespaces;
- optional presentation and voice settings.

Plugins declare capabilities, configuration schema, required permissions, hooks, and version compatibility. Installation and updates are explicit. A plugin cannot silently expand its permissions.

Provider support must expose normalized model capabilities while retaining raw provider metadata for diagnostics. [Simon Willison's `llm`](https://github.com/simonw/llm) may be implemented as an optional adapter; it must not become the only provider abstraction.

For local models, the first milestone performs runtime discovery, compatibility checks, capacity checks, and health reporting. Automatic model installation from Hugging Face is deferred.

## Milestone acceptance criteria

The first milestone is complete only when all of the following hold:

- A session created in the TUI appears and can be controlled in the desktop app, and vice versa.
- Restarting Moguri loses no admitted messages, queued messages, drafts, artifacts, or terminal session state that was promised as durable.
- A session can be bound to a managed worktree without coupling worktree deletion to session deletion.
- Queue editing and claiming remain correct under concurrent client actions.
- Interrupt, steer, and queue have distinct tested semantics.
- Cancelling a command terminates or reports failure to terminate its complete owned process tree.
- Artifacts survive archival and deletion of their source session.
- Profile boundaries prevent credentials, projects, policies, and artifacts from leaking across profiles.
- Dashboard totals can be traced back to individual immutable events.
- Estimated, provider-reported, and billed costs are never conflated.
- Every state transition and failure produces a useful diagnostic event.
- Core behavior is covered by unit, integration, migration, restart-recovery, and cross-client contract tests.

## Implementation order

Implement vertical slices in this order. Do not attempt the entire vision in one change.

### Phase 0 — Reconcile the fork

1. Inventory existing OpenCode capabilities that already satisfy or partially satisfy this README.
2. Document ownership and data flow for sessions, storage, worktrees, questions, providers, tools, MCP, plugins, background jobs, TUI, desktop, and stats.
3. Record intentional divergence and identify code that should be reused rather than duplicated.
4. Establish baseline tests and migrations before changing durable state.

Expected document: `docs/architecture/upstream-capability-map.md`.

### Phase 1 — Domain protocol and event foundation

1. Define stable IDs, entity schemas, lifecycle states, commands, events, errors, and protocol versioning.
2. Add append-only persistence and projection interfaces.
3. Add restart reconciliation and migration tests.
4. Expose the same typed API and event stream to both clients.

Expected documents:

- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/event-catalog.md`

### Phase 2 — Session operations

Implement session lifecycle, persistent drafts, queue mutation, delivery modes, cancellation propagation, process ownership, and cross-client controls as one end-to-end slice.

### Phase 3 — Work items, worktrees, and artifacts

Bind sessions to durable work items and change sets. Add safe worktree management and artifacts that remain independent from session retention.

### Phase 4 — Telemetry and dashboard

Instrument the event pipeline, normalize usage and cost records, add budgets, and build session/project/profile dashboard projections.

### Phase 5 — Profiles and extension management

Add profile isolation, secret backends, policy evaluation, plugin manifests, provider management, and local-runtime health checks.

### Phase 6 — Hardening

Test crash recovery, concurrent clients, queue races, cancellation failure, schema migration, corrupted state, storage pressure, profile isolation, provider outages, and plugin incompatibility.

## Deferred work

These ideas remain part of the long-term vision but are not first-milestone requirements:

- scheduled and continuous workflows;
- GitHub, Linear, and Jira lifecycle automation;
- multi-repository streams and coordinated pull requests;
- plugin marketplace;
- self-evolving skills, tools, or memory;
- automatic Hugging Face model installation;
- voice dictation;
- team, council, swarm, SRE, stabilization, and long-running autopilot templates;
- virtualized or CRDT-backed worktrees;
- model or agent provenance at line level;
- cloud delegation and hosted orchestration.

Deferred features must be expressed later through the same event, policy, capability, workflow, and artifact primitives. Avoid adding one-off agent modes to the core.

## Explicit non-goals

Moguri will not:

- claim access to provider-hidden chain-of-thought;
- silently send source code or telemetry to a Moguri service;
- store plaintext API keys in profiles;
- treat a cancelled operation as successful;
- delete artifacts merely because a session expired;
- perform automatic pushes, merges, rebases, or branch deletion without policy;
- use raw token count, commit count, or lines changed as proof of productivity;
- represent estimated provider cost as an invoice;
- guarantee that textual conflict avoidance prevents semantic code conflicts.

## Working agreement for implementation agents

When using this README as an implementation brief:

1. Read the existing code and tests before proposing new packages or abstractions.
2. Reuse existing OpenCode behavior when it satisfies the required invariant.
3. Preserve working behavior until an intentional replacement is tested and documented.
4. Start with the smallest complete vertical slice that reaches both TUI and desktop.
5. Keep authoritative state in the control plane, never in one client.
6. Use explicit typed errors and lifecycle events; do not silently recover into success-shaped state.
7. Add migrations for durable schema changes. Never require users to delete local state to upgrade.
8. Test cancellation, restart recovery, concurrency, and failure paths—not only happy paths.
9. Keep secrets and customer data out of tests. Use generated fixtures.
10. Update the relevant file under `docs/` whenever architecture, setup, configuration, or protocol behavior changes.
11. Avoid speculative work from the deferred list until the milestone acceptance criteria are met.
12. Leave the repository buildable and the supported client surfaces behaviorally consistent.

Before implementing a phase, the agent should state:

- the existing components it will reuse;
- the invariant being introduced;
- the affected durable schemas and migrations;
- the cross-client behavior;
- the failure and cancellation behavior;
- the tests that will prove completion.

## Long-term direction

After the local control plane is trustworthy, Moguri can add declarative workflows shaped as:

```text
trigger + profile + goal + permissions + budget + stop conditions + outputs
```

CI watching, dependency maintenance, documentation updates, research, stabilization, and autonomous development should become workflow templates over shared primitives rather than separate hardcoded agent loops.

Experimental memory can use three retention tiers:

- **Sky** — ephemeral turn and session context;
- **Terra** — durable project and work-item knowledge;
- **Glacier** — compressed, explicitly promoted long-term knowledge.

Promotion between tiers must preserve provenance, confidence, scope, expiry, and profile isolation.

## Related projects

- [OpenCode](https://github.com/anomalyco/opencode) — initial codebase and primary inspiration
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — plugin-oriented harness architecture
- [LLM](https://github.com/simonw/llm) — optional model and plugin ecosystem
- [sendbox](https://github.com/mbianchidev/sendbox) — optional agent sandboxing
- [porto](https://github.com/mbianchidev/porto) — optional local service and container orchestration
- [sql-not-so-lite](https://github.com/mbianchidev/sql-not-so-lite) — optional local database management
- [stainless](https://github.com/mbianchidev/stainless) — optional browser, preview, and Playwright integration

## License

See [LICENSE](LICENSE).
