# Moguri

Moguri runs coding agents from a terminal UI or desktop app. It keeps sessions, worktrees, message queues, commands, costs, and project knowledge in one local system. If Moguri starts something, the user can see it and stop it.

Repository: [github.com/mbianchidev/open-moguri](https://github.com/mbianchidev/open-moguri)

Moguri is built from zero. It owns its domain model, event store, protocol, local service and clients, and borrows maintained libraries for providers, MCP, terminals, diffs and storage. The [architecture decisions](docs/architecture/decisions.md) record the stack. Moguri is inspired by [OpenCode](https://github.com/anomalyco/opencode) and [Pi](https://pi.dev/), forks neither, and is not affiliated with either project.

The desktop app and TUI are first-class clients. An optional VSX extension will connect [`vslocal`](https://github.com/mbianchidev/vslocal) to the same local service. [Simon Willison's `llm`](https://github.com/simonw/llm) can provide models through an optional adapter.

Status: pre-alpha. This README is a build brief. It does not claim that these features already work.

## What Moguri fixes

Most coding agents store work as chats. Software work does not fit neatly inside one chat. It spans repositories, issues, pull requests, worktrees, commands, CI runs, decisions, and several agents working at once.

Moguri keeps that work together. A session may end or be deleted. The work item, code, decisions, plans, and answers remain.

## Rules

- Core features work without a Moguri cloud service.
- TUI and desktop clients read and change the same state.
- Drafts, queued messages, sessions, artifacts, and archives survive restarts.
- Users can stop model requests, tools, MCP calls, subagents, terminals, and owned process trees when the provider or operating system allows it.
- Moguri records failed or partial cancellation as failure. It never turns a stopped operation into success.
- Pushes, merges, rebases, branch deletion, scheduled work, and self-modification follow visible policies.
- Profiles keep credentials, projects, policies, budgets, integrations, artifacts, and memory separate.
- API keys live in the operating system keychain or another configured secret store.
- Moguri separates estimated cost, provider-reported usage, and billed cost.
- Moguri shows prompts, provider-supplied reasoning summaries, tool activity, timing, token usage, compactions, and errors. It cannot show reasoning that a provider does not return.
- Moguri shows every remote destination it contacts and why the connection is needed.
- Product telemetry is opt-in. Local analytics stay local until the user exports or shares them.

## Data model

| Name | What it represents |
| --- | --- |
| Profile | One identity and policy context. It has its own accounts, API keys, projects, models, budgets, integrations, accents, and memory. |
| Folder | A set of projects or repositories that belong to one stream of work. |
| Project | A repository or local directory. |
| Work item | An issue, pull request, maintenance task, or user goal. |
| Change set | The branch, worktree, commits, diff, and optional pull request for a work item. |
| Session | One resumable agent context. |
| Turn | Work started by one admitted message. |
| Step | One model request and the tool work caused by its response. |
| Artifact | A decision, plan, answer, research note, or report that survives its source session. |
| Workflow | A trigger, goal, profile, permissions, budget, stop conditions, and outputs. |

The durable ownership tree is:

```text
Profile
  Folder
    Project
      Work item
        Change set
        Sessions
        Artifacts
```

A session records:

```text
Session -> Turn -> Step -> model, message, tool, MCP, process, compaction, and cost events
```

## Architecture

```text
TUI          Desktop          vslocal VSX
 |              |                 |
 +--------------+-----------------+
                |
       typed local API
       and event stream
                |
        Moguri local service
                |
  +-------------+-------------+
  |             |             |
sessions     providers     tools, MCP,
and agents   and models    files, shells
```

A Moguri-owned agent loop, using `pi-ai` for providers and authentication, is the first runtime. Clients talk to Moguri types and commands, not raw provider payloads.

Moguri stores durable changes as typed, append-only events. The clients, dashboards, transcripts, and model context derive their state from those events. A client cannot keep authoritative session state in memory.

Each event includes:

```text
id
schema version
timestamp
profile and project
optional work item, session, turn, and step
parent and correlation IDs
event type
payload
```

Use the repository's existing SQLite and migration code for structured state. Store large logs, attachments, snapshots, and binary data as content-addressed files when SQLite is the wrong place for them.

Writes must survive crashes. Queue claims and lifecycle changes must be atomic. Schema changes require migrations. Users must not have to delete local data to upgrade.

Destructive deletion first moves data to trash and writes a tombstone. Permanent deletion happens only after the configured retention period or an explicit purge.

Provide supported export, backup, and restore commands. Users must not need to understand the database schema to move or recover their state.

## First release

The first release proves that Moguri can run and control local sessions from both clients.

### TUI and desktop

Both clients need:

- project and work-item navigation;
- split panels;
- a command palette;
- active, idle, blocked, failed, completed, and archived sessions;
- persistent prompt drafts;
- an editable message queue;
- compact and detailed views for messages, steering, tools, MCP calls, reasoning summaries, and subagents;
- a session event log;
- running commands and stop buttons;
- a basic analytics dashboard.

Creating a session in one client must make it appear in the other.

The desktop app also reserves a persistent, main-session-aware sidebar for Changes, Terminal, Files, a Stainless-backed Browser, Side chat, Insights, and Extensions. The TUI does not implement this desktop sidebar. Panel capabilities follow the build order; Side chat and the Stainless browser integration remain later work and show a clear unavailable state until implemented. Both clients still share the underlying commands, state, events, metrics, and cancellation behavior. See [`docs/specs/desktop-sidebar.md`](docs/specs/desktop-sidebar.md).

### Projects and worktrees

A session can use an existing worktree or ask Moguri to create one. Moguri records the work item, branch, worktree, commits, and pull request without using Git as its session database.

Moguri must:

- create, discover, open, and remove managed worktrees safely;
- detect dirty or externally changed worktrees;
- stop incompatible active sessions from sharing a worktree by accident;
- keep a worktree when its session is archived or deleted;
- require a user action or policy before push, merge, rebase, or branch deletion.

Creating a session from a GitHub issue or pull request requires an installed and authorized GitHub integration or MCP. Linear and Jira use the same connector rule.

### Session lifecycle

```text
created -> idle -> queued -> running -> waiting for input
                         -> stopping -> stopped
                         -> completed
                         -> failed

terminal state -> archived -> restored
```

Every transition is stored and safe to repeat. After a restart, Moguri reconciles interrupted sessions and processes instead of reporting false success.

### Message queue

```text
draft -> queued -> claimed -> admitted -> completed
               -> edited
               -> cancelled
```

Users can reorder, edit, or remove messages until an agent claims them. Claiming and editing must be atomic.

Moguri supports three delivery modes:

- Queue waits for the current turn to end.
- Steer injects the message at the next safe point in the current turn.
- Interrupt asks the active turn to stop, then sends the message after Moguri confirms or fails the cancellation.

The UI shows the difference between a requested stop, an acknowledged stop, and a finished stop.

Draft and queued messages survive app closure. They remain when the session resumes.

### Cancellation

Cancellation travels from a workflow to its sessions, subagents, tools, MCP calls, terminals, provider requests, and subprocess trees.

Every running item reports whether it supports cancellation and whether the stop succeeded. Both clients show a manual stop control for every command or background process owned by Moguri.

### Artifacts

The first artifact types are:

- decisions;
- plans;
- answers;
- research notes;
- reports.

When an agent asks a structured question, Moguri records the question and answer. User or profile policy can turn that answer into a durable artifact.

Artifacts store their creation time, current status, revision history, scope, and source-event links. They can belong to a work item, project, folder, or profile. Deleting a session does not delete them.

When a user deletes a project with artifacts, Moguri shows what will happen. The user can keep them, export them, write them to `artifacts/` in the repository, commit that directory, or delete them.

### Dashboard and budgets

Record:

- model and provider;
- input, output, cached, system-prompt, message, tool-schema, tool-call, MCP-call, and compaction tokens;
- tool and MCP calls, failures, retries, cancellations, and failure rates;
- script, command, subsession, subagent, session-group, and whole-session time;
- per-turn and per-steer tokens and elapsed time;
- measured or explicitly estimated output-token generation throughput;
- wall time and active model or tool time as separate values;
- estimated cost;
- unit price, pricing source, currency, and effective date;
- provider-reported or billed cost when available;
- remaining budget;
- compaction history;
- storage use;
- session metadata including profile, project, repository, worktree, branch, work item, parent or orchestrator, provider, model, state, tags, timestamps, duration, storage, and archive status.

Token splits below one provider request may be estimates. Label them as estimates.

Dashboard ranges:

- 7, 30, 60, 90, and 365 days;
- one selected year;
- day, week, and month groups;
- custom range;
- all time.

Filters:

- folder;
- project and repository;
- GitHub organization;
- open-source, public, internal, or private repository;
- profile;
- provider and model;
- session.

Each session page shows its price, token use, per-turn and per-steer metrics, output-token generation throughput, tools, MCP calls, compactions, metadata, timers, archive state, storage, and delete controls.

Budgets can warn or stop at profile and session scope. A hard stop blocks the next model request where possible. It cannot undo cost already charged by a provider.

Velocity is experimental. Start with time to green, completed work items, human interventions, review cycles, and rework. Commit count and lines changed are poor measures on their own.

### Profiles

A profile has:

- project and folder bindings;
- its own provider accounts and API keys;
- model routing;
- policies and approval rules;
- session and workflow budgets;
- plugins and integrations;
- separate artifacts and memory;
- language, accent, voice, and presentation settings.

Work and Open Source are example profiles. They may use different providers, keys, projects, policies, budgets, voices, and integrations.

Sharing a credential between profiles requires explicit configuration.

### Plugins and model providers

Plugins declare:

- capabilities;
- settings schema;
- permissions;
- hooks;
- compatible Moguri versions.

Installing or updating a plugin cannot silently add permissions.

Provider adapters expose a common set of model capabilities and retain raw provider data for debugging. `llm` is an optional adapter, not the only provider interface.

For local models, the first release detects installed runtimes and checks operating system, architecture, drivers, accelerators, RAM, VRAM, disk, and model compatibility. It shows a health report with each check, its status, and any action needed before the model can run.

### Archives and retention

Archived sessions stay visible, searchable, restorable, and individually deletable.

Automatic deletion is off by default. Users can set a maximum age in days, a maximum storage size in GB, or both. Pinned artifacts are not session garbage.

## Acceptance checks

The first release is done when:

- [ ] A session created in the TUI can be controlled from desktop, and the reverse works.
- [ ] Restarting Moguri loses no accepted message, queued message, draft, artifact, or promised terminal state.
- [ ] A session can use a managed worktree without tying worktree deletion to session deletion.
- [ ] Concurrent clients cannot corrupt queue ordering or claims.
- [ ] Queue, Steer, and Interrupt have separate tested behavior.
- [ ] Stopping a command kills its owned process tree or reports exactly what survived.
- [ ] Artifacts survive archive and deletion of their source session.
- [ ] One profile cannot read another profile's credentials, projects, policies, or artifacts.
- [ ] Every dashboard total can be traced to stored events.
- [ ] Estimated, reported, and billed cost never share one field.
- [ ] Every failed transition leaves a useful diagnostic event.
- [ ] Unit, integration, migration, restart-recovery, and cross-client contract tests cover core behavior.
- [ ] Tests cover concurrent clients, cancellation failure, provider outages, corrupt state, full disks, and plugin incompatibility.

## Build order

### Phase 0: validate the decisions

Before adding features, run the validation spikes in the [architecture decisions](docs/architecture/decisions.md): providers with Copilot and ds4, the Rust supervisor, the event store, the desktop shell, the TUI, the native addon, and packaging.

Record each pass or fail result and its measurements under `docs/`. If a spike fails, update the decision before building on it.

### Phase 1: define the data and protocol

Define IDs, commands, events, lifecycle states, errors, protocol versions, migrations, and restart recovery.

Write:

- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/event-catalog.md`

Expose one typed API and event stream to both clients.

### Phase 2: session control

Build one complete path through persistent drafts, queue editing, delivery modes, cancellation, process ownership, and both clients.

### Phase 3: work items and artifacts

Connect projects, work items, worktrees, change sets, sessions, and artifacts.

### Phase 4: analytics and budgets

Add usage events, cost records, budget checks, dashboard queries, and traceable totals.

### Phase 5: profiles and extensions

Add profile isolation, secret stores, policy checks, plugin manifests, provider management, and local-model health checks.

### Phase 6: break it on purpose

Test crashes, queue races, concurrent clients, failed cancellation, bad migrations, corrupt state, full disks, provider outages, and incompatible plugins.

## Later work

These features matter, but they do not block the first release.

Build later features on the same events, policies, capability interfaces, workflows, and artifacts. Do not add a separate agent loop for each mode.

### Shortcuts and chat

- Add configurable keyboard shortcuts.
- Use `Option+Space` or `Ctrl+Space` for voice dictation. Start by evaluating NVIDIA Nemotron speech models.
- Detect repeated prompts and propose reusable commands. Repeating "Fix all review comments and rebase on main" might produce `/fix-rebase`.
- Show all provider-returned reasoning, prompts, tools, MCP calls, steering, and subagent activity in collapsible views.
- Show elapsed time and token counts for scripts, commands, subsessions, subagents, groups, and whole sessions.
- Let users define age and storage deletion rules.

### Session groups

- Group sessions inside one project with or without an orchestrator.
- Attach or replace an orchestrator after the group starts.
- Detach a session without deleting its worktree, artifacts, or history.
- Tag agents with `@` handles.
- Show group tasks, time, tokens, and cancellation.
- Group several repositories into one work stream.
- Coordinate pull-request order and policy-gated merging.
- Support GitHub stacked pull requests.
- Run sessions, groups, and workflows on optional remote or hosted execution backends. Changing the backend must not change permissions, budgets, events, artifacts, or stop controls.

### Skills, hooks, and policies

- Build a gallery for plugins, skills, hooks, workflows, personas, and policy packs.
- Show structured manifests for plugins, instructions, hooks, and skills.
- Keep skills directly invocable. Add slash commands where they fit.
- Let skills and hooks evolve only through a visible proposal, evaluation, approval, version, and rollback.
- Use Core, Sky, Terra, and Glacier memory to support those proposals. Agents can read Core but cannot change it.
- Add policy packs for GitHub work, vulnerability fixes, conflict strategy, logging, commit messages, commit frequency, signing, attribution, command output, docs, technology choices, and coding rules.
- Support secure SSH commit signing.
- Let users suppress automatic tool co-author trailers.
- Standardize `--silent`, output truncation, and a terse "caveman" mode.
- Keep durable docs under `docs/`. Do not scatter generated summary files through repositories.
- Import policies from sources such as [`copilot-instructions.md`](https://github.com/mbianchidev/.github-private/blob/main/copilot-instructions.md) when access allows it.
- Ship Python tools for diffing, parsing, splitting, finding, and structured data work. Agents should not write the same disposable helpers every session.

### Git and work trackers

- Create a GitHub plugin that opens, edits, closes, and queries issues and pull requests.
- Read CI checks and Actions logs.
- Read, write, and resolve review conversations.
- Handle Dependabot, Renovate, and other bot pull requests.
- Add ecosystem-specific vulnerability fixes.
- Let policy choose merge or rebase for main, master, other target branches, and stacked pull requests.
- Start work from GitHub, Linear, and Jira items when the matching connector is installed.

### Scheduled work

- Run CI watches.
- Produce dependency roundups.
- Add a "My work" view for open pull requests, pending reviews, broken CI, and unresolved comments.
- Run a prompt now or on a schedule.
- Run workflows that combine prompts and named scripts with readable syntax.
- Optionally run scheduled work on a server without changing its permissions, budgets, event log, or artifacts.

### Agent personas and continuous modes

Continuous modes are user-definable personas with stable `@` handles. Users and agents can tag them in messages, queues, session groups, and workflows. A persona inherits the active profile and project. That sets its permissions, budget, integrations, memory, and repository scope.

The following personas are examples. Users, projects, profiles, and plugins can add others with their own names, handles, prompts, skills, tools, models, policies, schedules, triggers, budgets, and memory.

- `@product-manager` configures product analytics such as PostHog, reads usage, identifies weak metrics and missing features, researches the market, records assumptions, creates issues, measures results after implementation, and reports back.
- `@maintenance` runs per repository. It handles Dependabot and other dependency or security pull requests, fixes breaking changes, merges when policy permits it, and runs custom maintenance actions.
- `@docs` runs per repository. Users can tag it for one task or leave it running under a repository policy.

### Agent modes

- Deep Search takes a question, researches sources, and keeps going until it resolves or bounds the question.
- SRE takes an error and reads infrastructure MCPs, diagrams, telemetry, and code. Infrastructure access stays read-only.
- Autopilot takes a clear task through implementation, tests, review, and delivery.
- Long-running Autopilot handles work such as building a browser or rewriting C in Rust. It uses checkpoints, recovery, and budgets.
- Stabilize checks repository health, handles pending pull requests, fixes security issues, installs or repairs Dependabot, hardens Actions, and adds issue-triage workflows.
- Swarm reads all open issues, proposes a roadmap and target state, waits for approval, then coordinates the approved work.
- Team supports user-defined personas, councils, and patterns inspired by [Squad](https://bradygaster.github.io/squad) and [Paperclip](https://github.com/paperclipai/paperclip).

### First-party integrations

- [`sendbox`](https://github.com/mbianchidev/sendbox) provides profile-selectable agent sandboxes.
- [`porto`](https://github.com/mbianchidev/porto) manages local development servers and container stacks through its installed CLI.
- [`sql-not-so-lite`](https://github.com/mbianchidev/sql-not-so-lite) manages local databases through its installed CLI.
- [`stainless`](https://github.com/mbianchidev/stainless) provides private browser previews and Playwright through MCP and open-with support.

### Local model installation

Guide users through installing compatible Hugging Face models after the system check passes. Show download size, RAM, VRAM, disk use, expected runtime, model license, and trust information before downloading anything.

### Metachat

Add a chat with Moguri itself. It changes settings, inspects stored state, explains failures, and helps troubleshoot the app.

### Memory

Moguri can use four memory levels:

- Core holds user-given instructions and policies. Only the user can create, change, or delete Core entries. Core instructions have the highest priority within their scope.
- Sky holds temporary turn and session context.
- Terra holds project and work-item knowledge.
- Glacier holds compressed knowledge that a user or approved policy promoted for long-term use.

Each stored memory needs a source, confidence, scope, expiry rule, and profile owner. Agents may propose promotion between Sky, Terra, and Glacier. They cannot promote anything into Core.

### Research

Virtualized worktrees may use Delta DB-style copy-on-write B-trees and hash array mapped tries. Measure them against ordinary Git worktrees and filesystem snapshots before building them.

CRDT-backed worktrees may let humans and agents edit concurrently. Textual convergence does not prevent semantic code conflicts.

Model provenance may record which model or agent proposed, applied, modified, reviewed, or verified a patch or line. Rebases, formatters, and human edits make exact attribution difficult. Keep this metadata out of Git authorship unless the user asks for it.

## Instructions for coding agents

Read the existing code and tests before proposing new packages.

Keep working behavior until its replacement has tests and documentation.

For each change:

1. Name the existing code and libraries it reuses.
2. State the behavior and stored events it adds.
3. Describe schema changes and migrations.
4. Cover TUI and desktop behavior.
5. Describe failures and cancellation.
6. Add tests that prove the behavior.

Keep authoritative state in the local service. Do not hide state in one client.

Use typed errors. Log enough context to debug failures. Do not catch an error and return success.

Test restart recovery, concurrency, and cancellation. Happy-path tests are not enough.

Use generated fixtures. Never put customer or personal data in tests.

Update the relevant file under `docs/` when setup, configuration, architecture, or protocol behavior changes.

Implement one working path at a time. Do not start the later-work list until the first-release acceptance checks pass.

Leave the repository buildable. Keep TUI and desktop behavior consistent.

## Related projects

- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev/)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [LLM](https://github.com/simonw/llm)
- [vslocal](https://github.com/mbianchidev/vslocal)
- [sendbox](https://github.com/mbianchidev/sendbox)
- [porto](https://github.com/mbianchidev/porto)
- [sql-not-so-lite](https://github.com/mbianchidev/sql-not-so-lite)
- [stainless](https://github.com/mbianchidev/stainless)
