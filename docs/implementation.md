# Moguri implementation specification

> A local-first control plane for AI-assisted software development.

Moguri gives developers one place to run, inspect, steer, stop, resume, and understand AI software work across a terminal UI and desktop application.

It is built from zero: Moguri owns its domain model, event store, protocol, local service and clients, and borrows maintained libraries for providers, MCP, terminals, diffs and storage. The [architecture decisions](architecture/decisions.md) record the stack. Moguri is inspired by [OpenCode](https://github.com/anomalyco/opencode) and [Pi](https://pi.dev/), forks neither, and is not affiliated with either project.

> [!WARNING]
> Moguri is pre-alpha. This document defines the product direction, architectural constraints, first implementation milestone, and working agreement for contributors. It does not claim that the described features exist yet.

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
| **Profile** | An isolated identity and policy context with its own credential references—including different API keys for the same provider—plus projects, provider configuration, budgets, integrations, and memory boundaries. |
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

A Moguri-owned agent loop, using `pi-ai` for providers and authentication, is the first runtime behind the local API. New Moguri code should preserve clear seams so clients, telemetry, artifacts, and policies do not depend on provider-specific payloads.

The optional VSX extension initially targets [`vslocal`](https://github.com/mbianchidev/vslocal) and may support other compatible editors. It is a thin client over the same typed local API and must not become a second control plane.

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

Use SQLite for structured local state and define migration conventions before persisting user data. Store large transcripts, attachments, process output, and snapshots as content-addressed blobs when placing them directly in SQLite would harm reliability or performance.

Required properties:

- atomic queue and lifecycle transitions;
- crash-safe writes;
- explicit schema migrations;
- tombstones or trash before destructive deletion;
- configurable retention by maximum age in days and/or storage size in GB, with automatic deletion disabled by default;
- archived sessions that remain visible, searchable, restorable, and individually deletable;
- pinned artifacts excluded from session garbage collection;
- export and backup paths that do not require internal database knowledge.

### Credentials and privacy

Profiles store references to credentials held by the operating-system keychain or another explicit secret backend. Each profile can use a different account or API key for the same provider. Credentials are shared between profiles only through explicit user configuration. Secrets must not be written to config files, events, logs, artifacts, prompts, or analytics.

Moguri must disclose every remote connection it initiates. Product telemetry is opt-in. Local usage analytics remain local unless the user deliberately exports or shares them.

## First milestone: local session control plane

The first milestone proves that Moguri can own the complete local session lifecycle through both the desktop and terminal clients.

### 1. Hybrid desktop and terminal experience

The desktop app and TUI use the same protocol, commands, domain types, and event stream. Core controls must have behavior parity even when presentation differs.

Initial surfaces:

- project and work-item navigation;
- active, idle, blocked, completed, failed, and archived sessions;
- split-panel workflows;
- command palette;
- session detail and event trace;
- compact and detailed rendering modes for messages, steering events, tools, MCP calls, and subagents;
- message composer with persistent drafts;
- editable message queue;
- visible running processes and stop controls;
- basic analytics dashboard.

The desktop app additionally reserves a persistent, main-session-aware sidebar for Changes, Terminal, Files, a Stainless-backed Browser, Side chat, Insights, and Extensions. This is a desktop presentation, not a TUI requirement. Panel capabilities follow the build order; Side chat and the Stainless browser integration remain later work and show a clear unavailable state until implemented. Its data and actions still use the shared local control plane. See [`specs/desktop-sidebar.md`](specs/desktop-sidebar.md).

Desktop stop controls cover the active agent, its subagents, and every command or background process Moguri owns.

### 2. Projects, work items, and worktrees

A session can attach to an existing project worktree or request a new isolated worktree. Moguri records the relationship between the work item, branch, worktree, commits, and pull request without treating Git as the session database.

Creating work items or sessions from GitHub issues or pull requests requires an installed and authorized GitHub integration or MCP. Linear and Jira entry points follow the same explicit connector model.

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

#### Execution modes and native SendBox integration

The first release includes a built-in execution backend for [SendBox](https://github.com/mbianchidev/sendbox), not an optional plugin or a user-written shell wrapper. Each session offers:

| Mode | Execution boundary |
| --- | --- |
| **YOLO (host)** | The agent worker and its tools run directly on the host with the user's permissions. This is the out-of-box default, not a promise of isolation. |
| **SendBox (local sandbox)** | The agent worker and its executable tools run in a local SendBox Linux VM with explicitly scoped workspace mounts, network destinations, credentials, and MCP access. |

YOLO describes the isolation choice; it does not disable Git approvals, budgets, or other Moguri policies. The local control plane remains the authoritative event writer in both modes. See [D10](architecture/decisions.md#d10-native-sendbox-execution-and-global-enforcement) for the backend boundary and platform requirements.

- Users can change the global default, override it per profile, and choose the mode per session. Resolve defaults in that order, with an explicit session choice taking precedence.
- A separate, user-only global **Require SendBox** policy is off by default. When enabled, it takes precedence over every default and per-session choice. Newly admitted turns use SendBox; explicit YOLO requests are rejected before any model request or agent tool starts. Agents, plugins, profiles, and future automation cannot grant themselves exceptions or disable the policy.
- Turning the requirement on blocks new YOLO turns, including queued messages, new child-agent turns, and recovery after a restart. Turns already running at the policy-change boundary may finish under their recorded prior policy. Persist that boundary atomically with turn admission, and show these turns as **YOLO finishing**, not sandboxed. Changing a default alone does not move a running turn between backends.
- SendBox execution starts only after runtime, workload image, guest artifacts, policy, credentials, and workspace checks succeed. Missing or unsupported capabilities produce actionable diagnostics; never retry on the host or issue model requests while sandbox readiness is unconfirmed.
- TUI, desktop, and the later VS Code extension expose the selected and effective mode, the source of its default or enforcement, runtime health, and launch or cleanup failures through the same API. Terminals, subagents, MCP calls, and executable extensions cannot bypass the selected boundary.

The finish-current-turn exception applies only to execution mode, not to other permissions, budgets, or manual stop controls. Existing host processes remain visibly unsandboxed and cannot be reused to execute a newly admitted sandbox-required turn.

Phase 1 schemas must record the requested and effective mode, default and policy revision, grandfathered turn identifiers, backend identity, readiness, and launch, failure, cancellation, and teardown events. Restart recovery rechecks policy and reconciles the actual backend before admitting work; it never treats missing mode or readiness data as permission to run on the host. Future durable changes require migrations and restart-recovery coverage.

#### Approval and decision modes

Model selection (**fixed model** or **kupo**), execution mode (**YOLO** or **SendBox**), and approval mode are separate settings. Every supported combination uses the same control-plane authorization and events.

| Approval mode | Who handles questions and approval requests |
| --- | --- |
| **Manual** | The user answers agent questions and approves tool/action requests. This is the out-of-box default; only explicitly preapproved operations may proceed without a prompt. |
| **Guided** | The current generative model recommends an answer or approval with an explanation; the user still confirms. In kupo, this is the active solver model, not the hidden router or critic. |
| **Autopilot** | The current generative model resolves routine questions and approves actions within user-delegated policy. It asks the user sparingly for missing facts, unclear scope, or permissions that were not delegated. |
| **Autopilot Max** | A configured System One/decision provider, such as Jev, selects answers, approves or denies delegated actions, and chooses bounded steering actions. This also works with a fixed generative model; it does not require kupo. |

Users can configure defaults globally and per profile and select the mode per session. Delegation must expose its allowed actions, repository and data scope, budget, and stop conditions. A mode selection is not an unrestricted permission grant: hard denials, user-only settings, secret boundaries, Git policies, and Require SendBox remain authoritative.

The decision layer handles structured questions with explicit alternatives, tool approval requests, and typed steering choices. Autopilot Max can answer those requests instead of asking the user, but it cannot invent user-only facts or turn an open-ended question into a fabricated user answer. Unclear questions, insufficient confidence, unavailable providers, and decisions outside delegation go to the user or leave the operation visibly blocked. Guided advice and automated decisions are never recorded as human approval.

Decisions bind to one request, exact arguments and context, policy revision, and session/turn/step. Recheck authorization before applying an answer, executing a tool, or admitting a steer. A user response, changed request, revoked delegation, cancellation, or newer policy invalidates an outstanding model decision. Recovery cannot replay side effects or reuse an approval for different arguments.

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

Cancellation propagates from workflows to sessions, subagents, tools, terminals, subprocess trees, and provider requests. Persist requested, acknowledged, completed, failed, and partial outcomes. Every component must report whether cancellation is supported and whether it succeeded.

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

When an agent asks a structured question, Moguri records the question and answer as source events and can materialize the answer as a durable artifact according to user or profile policy.

Retain whether the answer came from the user, the generative model, or a delegated decision provider. Automated answers are not user instructions and cannot be promoted into user-only Core memory.

Deleting a session does not delete its artifacts. Deleting a project containing artifacts requires a preview and an explicit choice to retain, export, materialize them into an `artifacts/` directory in the repository, optionally commit that directory, or delete the artifacts.

### 7. Telemetry, cost control, and dashboard

Capture enough data to answer:

- what is running;
- how long it has run;
- what model and provider were used;
- how many input, output, cached, system-prompt, message, tool-schema, tool-call, MCP-call, and compaction tokens were reported or derived;
- which tools and MCP servers were called;
- which calls failed, retried, or were cancelled;
- which router/classifier, solver, critic, revision, escalation, approval, or steering role made each model call;
- how much the session is estimated to cost;
- which unit prices, pricing source, currency, and effective date were used for that estimate;
- whether a provider-reported or billed amount is available;
- how much budget remains.

Initial dashboard views:

- current session detail;
- sessions over 7, 30, 60, 90, and 365 days;
- selectable year, custom range, and all time;
- usage and cost grouped by day, week, month, custom period, and all time;
- global filtering by folder, project, repository, GitHub organization, repository visibility—including open-source, public, internal, and private repositories—profile, provider, model, and session;
- wall time versus active model/tool time;
- elapsed time for each command, subagent, session group, and complete session, with token usage where available;
- token usage and elapsed time for each turn and applied steer;
- measured output-token generation throughput per generation, turn, and session, with estimates labeled;
- compaction history;
- tool and MCP failure rates;
- archived sessions, deletion controls, and storage usage;
- session metadata including profile, project, repository, worktree, branch, work item, parent or orchestrator, provider, model, state, tags, timestamps, duration, storage, and archive status.

Cost controls support warning and hard-stop thresholds at profile and session scope. Hard stops occur before another model request whenever possible; Moguri must not pretend it can recover already consumed provider cost.

Charge every kupo leg and decision-provider call to its owning turn and profile, including failed attempts, retries, and fallbacks. Show both the selected synthetic model and the actual provider/model/version for each call. Decision latency and non-generative output are distinct from text-generation throughput; nothing is free merely because it is an internal routing or approval step.

Token attribution below the provider-request level is derived unless the provider reports it directly. Moguri must label derived attribution and its limitations rather than present estimates as exact measurements.

Velocity metrics are experimental. Prefer time-to-green, successful work-item completion, intervention count, review cycles, and rework over raw commits or lines changed.

### 8. Profiles, policies, plugins, and providers

A profile combines:

- project and folder bindings;
- profile-specific accounts, secret references, and API keys;
- fixed-model or kupo selection, approved routing pools, and decision-provider configuration;
- default session execution mode, subject to the global Require SendBox policy;
- policy packs, approval-mode defaults, and bounded delegation rules;
- session and workflow budgets;
- enabled plugins and integrations;
- isolated artifact and memory namespaces;
- optional presentation, language, accent, and voice settings.

Typical profiles include **Work** and **Open Source**, each with independent projects, provider accounts, API keys, policies, budgets, integrations, accents, and memory boundaries.

Plugins declare capabilities, configuration schema, required permissions, hooks, and version compatibility. Installation and updates are explicit. A plugin cannot silently expand its permissions.

Provider support must expose normalized model capabilities while retaining raw provider metadata for diagnostics. [Simon Willison's `llm`](https://github.com/simonw/llm) may be implemented as an optional adapter; it must not become the only provider abstraction.

For local models, the first milestone discovers installed runtimes and reports compatibility and capacity checks for the operating system, architecture, drivers, accelerators, RAM, VRAM, disk, and model. Automatic model installation from Hugging Face is deferred.

#### Model selection: fixed or kupo

Users can always pin a single provider/model or select **kupo**, Moguri's synthetic auto model. A fixed selection is not silently replaced by a router. kupo combines a classifier with a versioned execution policy to select an eligible model/workflow for each request or safe model-step boundary, using a user-configured mix of local and third-party hosted models.

| kupo pattern | Behavior |
| --- | --- |
| **Single** | One selected model solves the request through the normal permission-aware agent loop. |
| **Cascade** | An efficient model drafts first. Explicit validation and quality gates accept the candidate or escalate to a stronger eligible model within the configured limits. |
| **Critique/revision** | A model drafts; an independent, read-only, tool-less critic from a different model family reviews; the solver performs a bounded revision. |

These are HydraFusion-inspired execution patterns, not a dependency on a private HydraFusion implementation or an assumed public API. The router may use a configured local or hosted classifier, including an optional System One backend. Deterministic policy filters models and data destinations before classification and rechecks every dispatch. Context size, tools, output format, provider availability, privacy restrictions, budgets, and cancellation support constrain the plan. No model may invent an eligible endpoint or send local-only data to a hosted classifier or critic.

Every leg has explicit ownership, limits, cancellation, context provenance, and cost accounting. Compound solvers stage candidate changes in owned workspaces; rejected, failed, or cancelled candidates are not applied to the user's worktree. Applying an accepted patch checks its base and preserves unrelated user edits. Retries or escalation do not replay external side effects. Already-performed effects and incomplete cleanup remain visible as partial outcomes.

Fallback models and workflow limits are user-configured and policy-constrained, not silent provider substitutions. Insufficient eligible models, classifier failure, invalid plans, low confidence, and exhausted budgets produce a visible fallback decision or a blocked request. See [D11](architecture/decisions.md#d11-kupo-synthetic-model-and-routing).

#### System One decision providers

An optional typed decision-provider interface serves kupo classification and delegated decisions with fixed models alike. **Jev by TypeSafe AI** is an initial hosted adapter target; compatible local or hosted decision providers can implement the same contract. Text-generation providers remain behind the existing Moguri provider interface; a decision-only API is not presented as a chat model.

System One calls return structured predicates, choices, or scores, with probabilities and confidence where supported. Validate the response schema and permitted alternatives; absence of confidence is not certainty, a high score is not authorization, and vendor speed/calibration claims are not Moguri guarantees. Measure thresholds on generated task fixtures before relying on them.

Hosted decision calls need their own approved data destination, scoped secret reference, budget, and SendBox network path. Treat task content and tool arguments as data, not instructions that can rewrite the decision policy. Persist the question, alternatives, provider/model version, values, confidence semantics, actor, delegation, and applied or rejected outcome. Autopilot Max requires a compatible configured decision provider; it never silently falls back to self-approval by the generative model. See [D12](architecture/decisions.md#d12-system-one-decisions-and-approval-modes).

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
- New sessions default to YOLO, user-configured defaults and per-session choices agree across clients, and sandboxed runs cannot execute agent tools on the host.
- Require SendBox rejects every new YOLO turn across all admission paths. Only turns already running at the recorded policy boundary may finish, including when clients race with the setting change.
- Missing SendBox prerequisites, launch failure, lost guest readiness, or restart cannot cause host fallback, unprotected model requests, or a falsely successful cleanup.
- Fixed-model and kupo selection work independently of every approval and execution mode. Manual is the default; Guided cannot approve without the user, and Autopilot Max works with a fixed model and a configured decision provider.
- kupo exercises single, cascade, and critique/revision patterns across generated local/hosted fixtures without violating privacy, capability, budget, workspace, or sandbox constraints. Rejected candidates cannot overwrite the user's worktree.
- Router, critic, and decision calls are fully accounted for and cancellable. Outages, invalid output, stale decisions, duplicate recovery, or low confidence cannot fabricate approval, replay a side effect, or hide a paid call.
- Automatic answers and steers retain their real actor and delegation. Human intervention or a policy change wins a race with an outstanding decision, and no model can override a hard denial or a user-only setting.

## Implementation order

Implement vertical slices in this order. Do not attempt the entire vision in one change.

### Phase 0 — Validate the decisions

1. Run the validation spikes in the [architecture decisions](architecture/decisions.md): providers with Copilot and ds4, the Rust supervisor, the event store, the desktop shell, the TUI, the native addon, packaging, the native SendBox path, kupo orchestration, and System One decisions.
2. Record each pass or fail result with its measurements, and update a decision before building on a failed spike.
3. Settle the open items Phase 1 needs, such as the protocol schema tool and SQLite driver.
4. Establish the toolchain, test harness and migration framework before adding durable state.

Expected documents: spike results under `docs/` and an up-to-date `architecture/decisions.md`.

### Phase 1 — Domain protocol and event foundation

1. Define stable IDs, entity schemas, lifecycle states, commands, events, errors, and protocol versioning, including execution mode, sandbox readiness, global enforcement, routing plans and legs, approval requests, delegation, decision actors, and steers.
2. Add append-only persistence and projection interfaces.
3. Add restart reconciliation and migration tests.
4. Expose the same typed API and event stream to both clients.

Expected documents:

- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/event-catalog.md`

### Phase 2 — Session operations

Implement session lifecycle, persistent drafts, queue mutation, delivery modes, Manual/Guided approvals, cancellation propagation, process ownership, host and native SendBox execution, configurable global defaults, global enforcement, and cross-client controls as one end-to-end slice.

### Phase 3 — Work items, worktrees, and artifacts

Bind sessions to durable work items and change sets. Add safe worktree management and artifacts that remain independent from session retention.

### Phase 4 — Telemetry and dashboard

Instrument the event pipeline, normalize usage and cost records, add budgets, and build session/project/profile dashboard projections with per-leg and decision-role attribution.

### Phase 5 — Profiles and extension management

Add profile isolation, secret backends, policy evaluation, profile execution and approval defaults, plugin manifests, provider management, and local-runtime health checks. Complete kupo's single/cascade/critique workflows, System One adapters, and delegated Autopilot/Autopilot Max over the same loop, budgets, and cancellation tree. Profile settings and model decisions cannot weaken global sandbox enforcement.

### Phase 6 — Hardening

Test crash recovery, concurrent clients, queue and approval races, stale or adversarial decision output, routing/candidate isolation, execution-mode and enforcement races, SendBox loss and cleanup, cancellation failure, schema migration, corrupted state, storage pressure, profile isolation, provider outages, and plugin incompatibility.

## Deferred work

These ideas remain part of the long-term vision but are not first-milestone requirements:

### Interaction and productivity

- configurable productivity shortcuts;
- global `Option+Space` or `Ctrl+Space` voice dictation, initially evaluating NVIDIA Nemotron speech models;
- automatic detection of repeated prompts and proposals for reusable slash commands such as `/fix-rebase`;
- compact and detailed views with collapsible provider-exposed reasoning, tool activity, steering events, and subagent traces;
- configurable session deletion policies based on maximum age, maximum storage, or both.

### Local models

- guided installation of compatible models from Hugging Face;
- preflight checks for operating system, architecture, runtime, drivers, accelerators, RAM, VRAM, disk, and model compatibility;
- explicit download size, expected resource usage, license, and trust information before installation.

### Sessions and orchestration

- session groups within one project, with or without an orchestrator;
- attaching or replacing an orchestrator after a group already exists;
- detaching a session from a group without deleting the session, its worktree, or its artifacts;
- taggable `@` agents and group-level task, timing, token, and cancellation views;
- folders containing multiple repositories that participate in one work stream;
- coordinated pull-request ordering and merging, optionally using GitHub stacked pull requests;
- cloud delegation and hosted orchestration as optional execution backends.

### Skills, hooks, plugins, and policies

- a gallery or marketplace for versioned plugins, skills, hooks, workflows, and policy packs;
- structured, inspectable manifests for harness plugins, instructions, hooks, and skills; skills are always visible and directly invocable, with slash commands added where feasible;
- optional self-evolving skills and hooks powered by the Sky, Terra, and Glacier memory tiers, with review, evaluation, approval, versioning, and rollback;
- policy packs for GitHub operations, vulnerability remediation, conflict-resolution strategy, logging, observability, linted commit-message conventions, commit frequency, signing, attribution, token-saving modes, documentation layout, technology preferences, and general coding rules;
- configurable secure SSH commit signing and commit-attribution rules, including suppression of automatic tool co-author trailers;
- token-saving execution modes such as a standard `--silent` convention, output truncation, and an intentionally terse “caveman” communication mode;
- documentation policies that keep durable documentation under `docs/` rather than scattering temporary summary Markdown files through repositories;
- policy import and synchronization from sources such as [`copilot-instructions.md`](https://github.com/mbianchidev/.github-private/blob/main/copilot-instructions.md), subject to repository access;
- deterministic first-party utilities—Python-backed where appropriate—for diffing, parsing, splitting, searching, and structured data manipulation so agents do not repeatedly generate disposable scripts.

### First-party integrations

- a GitHub plugin for creating, editing, closing, and querying issues and pull requests; checking CI and Actions logs; handling dependency bot pull requests; and reading, writing, and resolving review conversations;
- vulnerability-resolution workflows with ecosystem-specific remediation strategies;
- explicit merge-versus-rebase conflict-resolution policies for default branches and stacked pull requests;
- GitHub, Linear, and Jira entry points for creating sessions from issues or pull requests;
- `porto`, when installed, for local development servers and container stacks through its CLI;
- `sql-not-so-lite`, when installed, for local database operations through its CLI;
- `stainless` for privacy-preserving browser previews and Playwright through its MCP and open-with integration.

### Metachat and scheduled actions

- a Moguri metachat for changing settings, inspecting state, explaining failures, and troubleshooting the harness itself;
- scheduled CI watching;
- dependency roundups covering Dependabot, Renovate, and other update bots;
- a **My work** workflow for open pull requests, pending reviews, broken CI, and unresolved comments;
- scheduled prompts;
- agentic workflows combining prompts and explicit scripts through a readable workflow syntax;
- optional delegation of scheduled workflows to a server while retaining the same policy, budget, event, and artifact model.

### Continuous modes and taggable agent personas

Continuous modes run as named agent personas with stable, configurable `@` handles. Users and other agents can tag a persona in messages, queued work, session groups, or workflows to request work, provide context, steer execution, or transfer ownership. Each mention resolves through the active profile and project so permissions, budgets, integrations, memory, and repository scope remain explicit.

The personas below are examples, not a closed set. Users, projects, profiles, and plugins can define additional personas with custom names, `@` handles, prompts, skills, tools, models, policies, schedules, triggers, budgets, and memory scopes.

- **`@product-manager` — Continuous Product Manager** — installs or configures product analytics such as PostHog, gains insights from usage, identifies metrics and missing capabilities to improve, performs market research, creates issues and explicit assumptions, measures results after implementation, and reports findings back to the user;
- **`@maintenance` — Continuous Maintenance** — a per-repository toggle that keeps Dependabot and other dependency or security update pull requests moving through remediation and policy-gated merging, handles breaking changes, and runs additional user-defined maintenance actions;
- **`@docs` — Continuous Docs** — a per-repository documentation persona that can be tagged for targeted work or run continuously under repository policy.

### Agent and team modes

The first-release approval modes apply independently to these later specialized workflows; they are not separate permission authorities.

- **Deep Search** — source-driven, scientific-oriented research that continues until the stated question is resolved or bounded;
- **SRE** — combines an error report with read-only infrastructure MCPs, architecture diagrams, telemetry, and source code to produce and validate a resolution;
- **Long-running Autopilot** — supports giant greenfield systems such as a browser and major rewrites such as C-to-Rust migrations, using durable plans, checkpoints, recovery, and budgets;
- **Stabilize** — evaluates repository health, attempts policy-gated integration of pending pull requests, remediates security issues, installs or repairs Dependabot, enhances and hardens Actions, and installs agentic issue-triage workflows;
- **Swarm** — analyzes all open issues, proposes a coherent roadmap and rationalized target state, reports for approval, then coordinates implementation toward resolving the complete approved issue set;
- **Team** — supports persona-based agents, councils, and patterns inspired by [Squad](https://bradygaster.github.io/squad) and [Paperclip](https://github.com/paperclipai/paperclip).

### Research tracks

- **Virtualized worktrees** — evaluate Delta DB-style copy-on-write persistent structures such as B-trees and hash array mapped tries for fast agent branches, while measuring them against ordinary Git worktrees and filesystem snapshots;
- **Conflict-free replicated worktrees** — evaluate CRDT-backed concurrent editing by humans and agents without claiming that textual convergence removes semantic conflicts;
- **Model provenance** — evaluate patch- and line-level history for which model or agent proposed, applied, modified, reviewed, and verified code, without adding unwanted Git attribution or overstating certainty.

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
- treat a router, critic, or decision-model score as a permission grant or record its choice as a human answer.

## Working agreement for implementation agents

When using this implementation specification:

1. Read the existing code and tests before proposing new packages or abstractions.
2. Reuse maintained libraries when they satisfy the required invariant, and record their licenses.
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

- the existing components and libraries it will reuse;
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

- **Sky** - ephemeral turn and session context;
- **Terra** - durable project and work-item knowledge;
- **Glacier** - compressed, explicitly promoted long-term knowledge.
- **Core** - user written instructiions.

Promotion between tiers must preserve provenance, confidence, scope, expiry, and profile isolation.

## Related projects

- [OpenCode](https://github.com/anomalyco/opencode) — primary inspiration
- [Pi](https://pi.dev/) — `pi-ai` provider and authentication library
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — plugin-oriented harness architecture
- [LLM](https://github.com/simonw/llm) — optional model and plugin ecosystem
- [vslocal](https://github.com/mbianchidev/vslocal) — optional IDE integration through a VSX extension
- [sendbox](https://github.com/mbianchidev/sendbox) — native local VM-sandboxed session execution
- [porto](https://github.com/mbianchidev/porto) — optional local service and container orchestration
- [sql-not-so-lite](https://github.com/mbianchidev/sql-not-so-lite) — optional local database management
- [stainless](https://github.com/mbianchidev/stainless) — optional browser, preview, and Playwright integration
