# Moguri

Moguri is a planned local-first harness for AI-assisted software development, with a terminal UI (TUI) and a desktop app. It aims to give developers one place to run, inspect, steer, stop, and resume agent work across projects and worktrees, with shared permissions, durable artifacts, and visible usage and costs.

> [!WARNING]
> **Documentation-only pre-alpha.** This repository contains specifications, not a runnable application. The TUI, desktop app, agent runtime, and integrations described below are planned, not implemented.

Moguri is built from zero with borrowed libraries. It does not fork OpenCode or Pi. The [implementation specification](docs/implementation.md) defines the product and delivery order; the [architecture decisions](docs/architecture/decisions.md) record the selected stack.

## Getting started

To read or contribute to the specifications, you only need Git and a Markdown viewer. This repository is private, so cloning requires repository access and configured GitHub SSH authentication:

```sh
git clone git@github.com:mbianchidev/moguri.git
cd moguri
```

Open [`docs/implementation.md`](docs/implementation.md) to start. A successful checkout gives you this README, contributor instructions, and the documents linked below, not an executable.

**Installation and first run are not available yet.** There is no application source, package manifest, lockfile, installer, packaged desktop build, test suite, or CI configuration. No dependency-install, build, test, or launch command is established. Installing Node.js or Rust alone will not make this checkout runnable.

## Documentation

| Document | Purpose |
| --- | --- |
| [Implementation specification](docs/implementation.md) | Canonical product requirements, first-milestone acceptance checks, phase order, and deferred work. |
| [Architecture decisions](docs/architecture/decisions.md) | Selected stack, execution boundaries, open decisions, and required Phase 0 validation spikes. |
| [Desktop sidebar specification](docs/specs/desktop-sidebar.md) | Planned desktop panels, main-session context, telemetry, and cross-client behavior. |
| [Contributor instructions](AGENTS.md) | Repository state, implementation constraints, and the change contract. |

## Platforms and prerequisites (planned)

The release order is **macOS first, Linux next, Windows later**. No platform has a runnable Moguri release in this checkout. The architecture targets a signed and notarized macOS app; an exact application minimum OS version and complete build prerequisites are not established yet.

| Component | Selected design and requirements |
| --- | --- |
| Service and TUI | Node.js 26; OpenTUI requires 26.4 or later. Future distributions are intended to bundle a pinned Node.js runtime. |
| Client interfaces | OpenTUI + React for the TUI; Electron + React + Vite for desktop. |
| Agent and native helpers | A Moguri-owned agent loop using `pi-ai` for providers and authentication; Rust helpers for process control, PTYs, file search, and Git reads. |
| Sandbox env | Native [SendBox](https://github.com/mbianchidev/sendbox), whose documented host requirements are macOS 26+ on Apple silicon, or virtualization-capable Linux with Kata. The worker image, scoped access, and transport still require validation. |
| Remote env | A user-configured, reachable SSH machine with verified host identity, usable credentials, a compatible worker/toolchain, an approved workspace, and model access from that machine. |

The package manager, monorepo tooling, CLI/runtime packaging, and Linux package formats remain [open decisions](docs/architecture/decisions.md#still-open). These are design requirements, not verified installation instructions.

## Usage and configuration (planned)

There is no working CLI or configuration file format yet. The planned session composer exposes the same independent controls through desktop, TUI, and CLI:

| Control | Choices | Factory default |
| --- | --- | --- |
| **Env** | Local host execution, Sandbox via SendBox, or Remote via SSH | Local |
| **Model** | A fixed configured model or **kupo** | Unset until generative provider login/API-key setup or local-model configuration |
| **Autonomy level** | Manual, Guided, Autopilot, or Autopilot Max | Manual |
| **Budget** | Unlimited, cumulative token cap, USD cap, or both when supported | Unlimited |

Defaults resolve from explicit session values, then repo/project, profile, global, and finally factory settings. Defaults never weaken permissions or move an already-running turn to another env.

**kupo** is Moguri's HydraFusion-inspired synthetic/auto model. It is designed to route across approved, available local and hosted models using single-model, cascade, or draft/critique/revision workflows. Optional System One decision providers, including [TypeSafe AI's Jev](https://docs.typesafe.ai/introduction), support delegated decisions, tool approvals, and steering with either kupo or a fixed model. A decision-only provider does not supply a generative model.

**Manual** leaves questions and approvals to the user. **Guided** recommends but still requires human confirmation. **Autopilot** lets the current model act within delegated policy; **Autopilot Max** uses a configured decision provider within that policy. None can bypass hard permissions, budgets, or allowed-env policy.

**Env** does not imply unrestricted access or isolation: Local runs on the host, Sandbox uses SendBox, and Remote runs the agent and model calls on the SSH machine. SSH alone is not SendBox containment. Global user-only policy may require Sandbox or Remote, blocking new Local turns while already-running Local turns may finish. Missing or failed Sandbox/Remote support must never silently fall back to Local.

**Budgets** include every model role, subject to stricter inherited limits; unknown telemetry is not zero usage. Finite caps may interrupt work. kupo is intended to reserve wind-down capacity and attempt a checkpoint commit of accepted changes when policy and approvals permit it, without exceeding the cap or guaranteeing a successful commit.

## Planned feature inventory

This inventory retains the broader product vision; none of these capabilities is implemented in this checkout. The [first-milestone acceptance criteria](docs/implementation.md#milestone-acceptance-criteria) and [implementation order](docs/implementation.md#implementation-order) define the delivery scope. Specialized workflows, automatic model installation, and other [deferred work](docs/implementation.md#deferred-work) are not first-milestone promises.

- Desktop has an Attach button and image paste; shared attachment triggers are `^` for a local file, `:` for a local folder, `#` for a GitHub issue or PR, `!` for a Moguri session, and `@` for a project file. TUI/CLI expose equivalent typed attachments without the desktop button.
- Dashboard (7, 30, 60, 90, and 365 days, a selectable year, a custom period, or all time)
  - Session costs, with estimates, provider-reported usage, and billed amounts kept distinct
  - Token usage per session, divided by tool calls, MCP calls, system prompts, messages etc.
  - Compaction history
  - Experimental velocity metrics, not raw commits or lines changed as proof of productivity
  - Session metadata, including archived sessions, with explicit deletion controls
  - Per-session pricing where provider data is available
  - Global aggregates filtered by time, repository, GitHub organization, visibility, profile, provider, and model
- Local-model runtime discovery and compatibility checks; guided installation from Hugging Face is deferred
- New productivity shortcuts
  - `Option+Space` or `Ctrl+Space` for voice dictation, initially evaluating NVIDIA Nemotron speech models
- Isolated profiles with different API keys, project bindings, accents, and policies
  - Work
  - Open Source
- Durable artifacts retain questions, answers, provenance, and project context independently of session retention. Project deletion offers explicit retention, export, or materialization into an `artifacts/` directory, with an optional approved commit. Examples:
  - Decisions (why did I use Golang instead of Rust?)
  - Plans
  - Answers to questions on the project
- Projects with worktrees
  - Worktree-aware sessions, including creation from issues or PRs through an authorized GitHub integration or MCP; Linear and Jira entry points require their own integrations
- Folders containing multiple repos/projects
  - Work across multiple projects in one stream, with policy-gated PR ordering and merging, optionally using GitHub stacked PRs
- Group sessions within the same projects with or without an orchestrator session
  - Attach an orchestrator session later
- Command palette
- Split panel
- Desktop-only, main-session-aware [sidebar](docs/specs/desktop-sidebar.md) for Changes, Terminal, Files, Stainless Browser, Side chat, Insights, and Extensions
- Persistent drafts and editable queued messages that survive app closure and session resume
- Visible, explorable session archives
- Automatic session deletion disabled by default, with optional maximum-age or storage-size limits
- Agent skills/hooks
  - Optional self-evolving skills powered by Sky, Terra, and Glacier memory tiers, with review, evaluation, and rollback
  - A versioned gallery/marketplace
- Metachat
  - Chat with Moguri to change settings, inspect state, and troubleshoot
- Scheduled actions
  - Watch CI
  - Dependency roundups covering Dependabot, Renovate, and other bot PRs
  - "My work", check open PRs
  - Run prompt
  - Run an agentic workflow combining prompts and explicit scripts, optionally delegated to a server
- Compact and detailed views for agent tools, steers, and subagents
  - Collapsible provider-exposed reasoning and summaries, never a promise of hidden chain-of-thought
  - Share time elapsed since script started
  - Share total time elapsed since sub-session/sub-agent started (and token count if possible)
  - Share total time elapsed since whole session started
  - Manual stop controls for every agent- or subagent-owned command and background process in both clients
- Structured and exposed harness plugins/instructions/skills (with slash commands / when feasible - skills always)
  - github plugin for correctly opening/closing/editing PRs, issues - querying CI checks, checking Actions logs, dependabot PRs, code review comment read + write + resolve convo
  - vulnerability resolution methods
  - conflict resolution with rebase vs merge on main/master or other target PRs
  - logging / observability
  - commit message style, rules (linted) and frequency
  - commit message signing with secure SSH key and strip co-authored with to avoid doing free marketing for agents
  - token savings `--silent` & co. + caveman
  - documentation guidelines (in docs/ not in random markdown files)
  - tech stack preferences
  - general coding guidelines
  - Policy import and synchronization from accessible instruction sources; see the [deferred policy work](docs/implementation.md#skills-hooks-plugins-and-policies)
- Reusable deterministic tools
  - Built-in utilities, Python-backed where appropriate, for diffing, parsing, splitting, searching, and structured data manipulation
- Better messaging
  - Automatically detects prompts that are repeated e.g. "Fix all review comments and rebase on main" will get a proposed slash command `/fix-rebase`
  - Allow ordering/shuffling, deleting or editing messages previously queued (if not picked up already)
  - Allow sending a message in different modes:
    - Stop current turn and send immediately
    - Queue waiting for current turn to finish
    - Steer the current turn
- Session restoration
  - Unarchive sessions without pretending deleted sessions can be restored
- Continuous modes (with taggable `@` agents, deferred)
  - Continuous Product Manager - uses analytics such as PostHog to identify improvements, research the market, create issues and explicit assumptions, and measure results after implementation
  - Continuous Maintenance (toggle per repo) - handles dependency/security PRs, breaking changes, policy-gated merging, and custom maintenance actions
  - Continuous Docs (toggle per repo)
- Specialized workflows and team modes (deferred)
  - Deep search - give a goal, run research, use sources and get to the bottom of a question (scientific oriented)
  - SRE - give an error, access to read-only infra MCPs, architecture diagrams and code -> get a resolution
  - Long-running Autopilot - durable plans, checkpoints, and recovery for giant greenfield projects (e.g. a browser) or major rewrites (e.g. C to Rust), within delegated policies and budgets
  - Stabilize - evaluate repository health, attempt policy-gated integration of pending PRs, remediate security issues, configure Dependabot, harden Actions, and add agentic issue triage
  - Swarm - Solves all open issues by creating a roadmap and rationalizing the end to end state of the repo, after planning carefully and reporting back to the user before implementation
  - Team (like [squad](https://bradygaster.github.io/squad)) + [paperclip](https://github.com/paperclipai/paperclip) style, council and other projects that use different personas + agents for better results
- Integration with:
  - [SendBox](https://github.com/mbianchidev/sendbox) - native, planned first-release Sandbox env with scoped local VM execution; missing sandbox support never silently falls back to Local
  - [Porto](https://github.com/mbianchidev/porto) - deferred integration for local dev servers and container stacks through its separately installed CLI
  - [sql-not-so-lite](https://github.com/mbianchidev/sql-not-so-lite) - deferred integration for local database management through its separately installed CLI
  - [Stainless](https://github.com/mbianchidev/stainless) - deferred privacy-oriented browser integration for dev previews and Playwright through MCP and open-with actions

### Research to evaluate

- **Virtualized worktrees:** evaluate Delta DB-style copy-on-write B-trees and hash array mapped tries against ordinary Git worktrees and filesystem snapshots, rather than assuming branches are computationally free.
- **Conflict-free replicated worktrees:** evaluate CRDT-backed concurrent editing without claiming that textual convergence eliminates semantic conflicts.
- **Model provenance:** evaluate patch- and line-level model/agent history without overstating certainty or adding unwanted Git attribution.

## Important limitations

The specifications are not evidence that model routing, cancellation, restart recovery, isolation, or cost enforcement work today. Provider-hidden reasoning is not available, usage and pricing may be incomplete, and an SSH connection is not a sandbox. The optional VS Code/`vslocal` extension follows a stable TUI and desktop protocol, not the first implementation slice.

Feature work starts only after the [Phase 0 validation spikes](docs/architecture/decisions.md#phase-0-validation-spikes), with measured pass/fail results recorded under `docs/`. No spike result documents are present yet.

## macOS launch troubleshooting

No packaged desktop build is provided here yet. These steps apply only to a trusted macOS `.app` build whose source and integrity you have verified, if Gatekeeper blocks its first launch because of download quarantine.

Move the `.app` bundle into `/Applications` first. The command below assumes it is named `Moguri.app`; no packaging configuration currently confirms that name. If your verified build has a different name, substitute its actual bundle name:

```sh
xattr -dr com.apple.quarantine "/Applications/Moguri.app"
```

Then reopen the app from Applications. This removes quarantine recursively from this app only; it does not verify, sign, or notarize it. Never use this for untrusted downloads or to bypass malware warnings, and do not disable Gatekeeper globally.

## Contributing

Specification clarifications, architecture feedback, and Phase 0 validation work are welcome. Read [AGENTS.md](AGENTS.md) and the [implementation working agreement](docs/implementation.md#working-agreement-for-implementation-agents) before making changes. Follow the documented phase order, record library licenses and measured spike results, and keep durable documentation under `docs/`.

There is no dedicated `CONTRIBUTING.md` or code of conduct in this checkout.

## License

No project license or `LICENSE` file is declared in this repository. Do not assume an open-source license from the planned use of third-party libraries; their licenses do not license Moguri itself.
