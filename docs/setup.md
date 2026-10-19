# Setup and usage

## Supported checkpoint

macOS is the operational target. Node.js 26.4 or newer in the 26.x line is
required to install; `.node-version` and the bundled runtime pin 26.12.0.
Use npm 11.20 or newer so the committed installation-script allowlist is honored.
Rust, Bun, Docker, other provider keys and a Moguri cloud account are not needed.

```bash
npm ci
npm run build
npm start -- --project /absolute/path/to/project
```

In another terminal:

```bash
npm run desktop
```

Both clients discover the same private loopback service. Opening a second client
does not create a second state owner. Closing a client does not stop the service
or already-running work; use the visible stop control to stop a turn.

`npm run service` runs a foreground development service. Do not start it against
a state directory already owned by another service. `npm start -- --help`
prints the built terminal client's entry-point help.

## Sign in with GitHub Copilot

Desktop: open **GitHub Copilot**, choose **Sign in with GitHub Copilot**, then
open GitHub and enter the displayed one-time code. TUI: press **Ctrl+L**, then
open the displayed URL yourself. Authorization is a user action, not a test or
an automated browser operation.

An entitled Copilot subscription, account policy and network access are required.
Moguri uses the maintained pi-ai device flow. It does not scrape VS Code,
OpenCode, GitHub CLI or Copilot CLI credentials and does not silently use
environment-provided tokens. No second provider key is required.

The upstream flow may enable eligible account model policies. The UI discloses
this before authorization. GitHub's formal OpenCode partnership does not imply
official support for Moguri; see [the access boundary](architecture/phase-zero.md#copilot-access-boundary).
Only github.com device authorization is exposed in this checkpoint.

Credentials are stored in the OS keychain under `dev.moguri.profile.default`,
keyed by `github-copilot`. The service alone resolves refresh credentials;
workers receive short-lived request access over private IPC. An unavailable
keychain is an error, not a reason to write plaintext secrets.

After login, **explicitly select a model** in the composer or with **Ctrl+M**.
Only account-enabled models recognized by the provider adapter are listed.
Saved models are rechecked at dispatch, never silently replaced. Authentication
alone does not automatically select a concrete model.

Remote connections are to GitHub's authorization/API endpoints and the
account-specific Copilot endpoint returned by the authenticated provider.
Prompts and approved context go to Copilot when a turn is sent. There is no
Moguri telemetry backend or automatic local-network model scan.

## Work and approvals

The composer exposes **Env**, **Model**, **Autonomy level**, **Budget** through
compact icon/name controls rather than separate labeled rows.
Factory values are Local, unset model, Manual and Unlimited. Only Local/fixed
Copilot/Unlimited is implemented. Manual remains default; Guided displays model
advice but needs human confirmation. Autopilot requires explicit tool or exact
command grants and cannot grant itself anything. Autopilot Max is unavailable.
Unready choices explain the limitation
or fail with a typed error; no fallback to Local or another model is possible.

Every tool needs a human approval bound to its exact arguments and policy/
permission revisions, or an explicit bounded user delegation. Deny wins.
Blanket shell/wildcard allow grants are rejected; shell grants name the exact
command string. File tools list/read/write approved project content; writes require
the digest returned by a read, or `absent` for a new file. Protected credential
paths and symlink escapes are rejected. Text files are limited to 128 KiB;
at most 16 snapshots and 512 KiB of attached text are accepted.

**An approved shell command runs on the host without isolation.** The project
directory is its working directory, not an OS containment boundary. Review the
full command. Commands have bounded output/deadlines, cannot be left running as
implicitly successful background work, and are owned by the current turn.
The worker does not receive the local API token or refresh credential.
An MCP call always requires an exact nested-tool approval and fresh schema/
server fingerprint. Tool annotations are not permissions. An external MCP
caller cannot take over a busy session or bypass the project's active lease.

Desktop **Attach / @ Project text file** and TUI `/attach path/to/file` create
immutable, inspectable snapshots. Changes after attachment do not silently
change the admitted content. Remove desktop attachments with their `x` control
or use TUI `/detach path-or-snapshot-ID`.
Other attachment types and image paste are explicitly unavailable. Bare `@`,
`^`, `:`, `#` and `!` in ordinary text do not read files or create attachments.

## Shared SDK and settings

The [Moguri SDK](sdk.md) is importable independently of either UI. CLI/TUI and
desktop use it for every capability, not separate client-specific versions.
`node bin/moguri.mjs --help` lists CLI commands; `status` exposes project/session
IDs. A normal installation also provides `moguri`.

Desktop starts **dark**, with an original minimal face-and-bat-wing mascot
shared with the TUI loading ASCII. **Settings / Appearance** selects Dark,
Light or System. **Settings / System prompt** and TUI **Ctrl+G** expose the
actual instructions, a breakage warning and restore defaults. Prompt edits need
explicit acknowledgement, apply to new turns and cannot override permissions.
Running turns keep their committed prompt snapshot.

The desktop toolbar starts with **+ Attach**, then the environment icon
(house/box/globe), model name and autonomy icon (hand/traffic light/car/rocket).
Budget is **infinity** while unlimited, followed by microphone and paper-plane
Send. Holding Cmd/Ctrl visibly turns Send into a clock and queues without
starting work. The small delivery chevron retains explicit Steer/Interrupt.
Unavailable execution/autonomy modes remain disabled with their reasons.

The model-name popover contains model selection, optional working context and
the transport's actual supported thinking efforts. The working window stays
within the model maximum, uses labeled estimates and stops an overfull request
without truncating history. It is not a finite spend cap or exact tokenization.
Provider-controlled thinking is shown when effort cannot be transmitted.
Budget's popover shows actual/unknown input, output and cache totals, a local
context estimate including the saved draft, and monetary values only when
available. Unknown telemetry is not zero. The mascot includes its red antenna
pom-pom without copying reference artwork.

The TUI settings JSON editor exposes the same theme, permissions, memory,
optional modes, MCP and voice configuration. Ctrl+Enter saves and acknowledges
the displayed risk; Ctrl+R restores; Esc discards that local editor. Stale
revisions preserve edits and require a reload. Desktop also protects unsaved
settings when navigating away. Section/all reset preserves sessions, knowledge,
credentials and downloaded models, and does not widen the separate allowed-env
policy.

**Sandbox is still unavailable.** Guardrails exposes SendBox configuration and
readiness diagnostics, but the native worker transport/guest bundle/workload
qualification is not complete. Merely entering paths does not enable execution.
Missing protection is an explicit error, never a Local fallback.

## Project-free chats, suggestions and settings chat

Desktop's **No project** section and project selector create chats without
attaching a folder. TUI `/new global` does the same; Ctrl+N keeps the current
scope, or creates a project-free chat when none is selected. CLI:
`moguri session create` with no `--project`. Choose a model explicitly as usual.
Scope is fixed for that session, not silently rebound when a different project
is selected for new chats.

These chats never reuse a previous root. Workspace files, attachments, shell,
terminal, diff, plans and repository memory are unavailable. Provider calls,
global guidance/skills and explicitly configured global MCPs remain available.
The internal MCP advertises only its scope-safe page fetcher. A failed general
chat pauses only itself, not every project-free chat or an unrelated project.

`/suggestions` opens a local preview of earlier user prompts, with repeated
phrase hints and source excerpts. A project chat reads only that project;
a project-free chat reads only prior project-free chats. The **Include all
projects** choice, or `/suggestions all`, explicitly previews a wider scope.
The preview makes no model call. Select a model, review the exact sources and
approve generation to create an ordinary accounted, cancellable settings chat.
In TUI use the displayed `/suggestions run DIGEST` or `run-all DIGEST`.
Changing sources requires fresh review. Control/subagent conversations are
excluded; content is bounded to 12 sessions, eight prompts each, 4,000 Unicode
characters per prompt and 32 KiB of actual UTF-8 text in total.

**Settings chat**, `/meta [REQUEST]` and `/metachat [REQUEST]` let you discuss
Moguri configuration. The model can read non-secret settings and propose
changes, never authenticate, execute workspace tools or approve/apply its own
proposal. Global **User guidance** is separate from the factory system prompt.
Projects can receive configuration, local instruction-file or disabled-skill
proposals. Global settings/policy proposals show global target scope even when
created from a project chat.

GUI review shows exact scope/base/value/evidence and requires risk confirmation.
TUI uses `/config list`, `/config review ID`, then
`/config apply ID SHA256 acknowledge-risk` or `/config reject ID SHA256`.
CLI uses `configuration review ID` and `configuration apply ID --digest SHA256
--acknowledge-config-risk`. A stale base cannot be overwritten. Approval
installs a skill disabled; enabling is separate. Repo instructions are written
locally, never committed or pushed by this flow. A write followed by a storage
failure is explicitly partial and requires inspection/fresh review.

## Attention and notifications

Session indicators distinguish a possible question (`?`), pending approval/
failed work (bell), and agent done/waiting. `/attention` or desktop's bell opens
the shared list. `/attention read ID` marks it read, not resolved: it never
answers a question, approves a tool or restarts work. Question detection is a
nonblocking final-text heuristic, not a model decision or structured user answer.
Runnable follow-up work suppresses a premature done/waiting indicator.

**Settings / Notifications** defaults to in-app indicators on, OS banners off,
content previews off. Optional background banners require the desktop to run,
respect OS permissions/Do Not Disturb, and use generic text unless previews are
explicitly enabled. Selecting a banner opens its session. Startup and preference
changes do not replay old banners. TUI shares state without requiring desktop;
native-banner tests use a generated sink and never show a personal OS banner.

## Session workspace and project settings

**Cmd/Ctrl+Enter queues without starting work**, even when idle or no model is
selected. Use Send or Shift+Cmd/Ctrl+Enter to send now. The queue has explicit
run, reorder, edit, copy and delete controls; sent prompts also have Copy.
Held prompts require a separate release, never an automatic timer.

Both chat clients share `/read-only`, `/agent`, `/rename NAME`, `/side`,
`/subsession [NAME]`, `/browser [URL]`, `/diff`, `/plan`, `/insights`, `/pr`,
`/queue`, `/run ID`, `/copy [ID]`, `/settings`, `/models` and `/help`.
Desktop suggests slash names; TUI displays matching names and `/help`.
TUI also keeps its existing advanced capability commands.

Read-only is a hard agent tool boundary: scoped reads may be approved, but
write, shell, MCP execution, evolution and Git mutations are disabled. A mode
restriction immediately blocks new edit approvals; an active turn acknowledges
it at the next safe steer/step or completion. Already-started effects cannot be
rolled back by a mode change. `/agent` returns at a safe boundary with the project
writer lease. Question-only side sessions cannot promote themselves.
`/side` snapshots approved parent context into a separate read-only conversation,
with separate usage, read approvals and cancellation. User-created subsessions
are attached agent sessions, not the optional model-subagent feature.

The desktop rail exposes Terminal, Browser, Insights, a linked PR when present,
Changes, Plan and Side chat. `/terminal`, its requested `/termnial` alias and the
terminal plus button use **actual Ghostty through `ghostty-web`**, not a new
terminal renderer. Terminal input/resize/output are ephemeral, never model
context or durable command hashes. Closing the panel leaves its shell running;
Close terminal stops the owned group. Restart does not relaunch or replay a
shell. Inspect unconfirmed ownership before acknowledging it. The console is
explicit Local user-controlled host execution, not an agent permission grant,
folder containment, Sandbox or Remote. Allowed-env policy still applies.
TUI rejects `/terminal` because it is already a terminal.

Browser is a basic isolated native HTTPS/loopback preview, with no Moguri/Node
bridge, shared account cookies, automatic model context, popups, downloads or
permission grants. It hides beneath dialogs. It is not Stainless automation.
TUI `/browser` opens the default browser only on an explicit command; `/diff`
displays bounded local changes, and `/plan` opens the existing plan in the
default application. PR/work-item session creation binds context but never
silently checks out a branch or starts work.

Session row menus pin, mark unread, rename, group, attach/detach, archive,
unarchive or delete. Attachments must be acyclic and in the same project.
Archive stops owned work and holds user prompts. A merged PR does not prevent
unarchive. Delete preserves external PRs and independent project artifacts,
detaching surviving children. **Settings / Retention** optionally deletes
archived sessions after a chosen age; it starts off.

Project menus reorder entries, assign a folder/color, open GitHub, create a
session from scratch/local work item/verified PR, open settings, change the
attached folder or remove Moguri-owned project data. Removal never deletes the
repository, closes a PR, removes shared caches/models or erases diagnostic logs.
Unconfirmed owned effects block deletion until explicit inspection.

**Project settings** exposes upstream/main/branch pattern, SendBox configuration,
exact user scripts, preview port, optional read-only `porto list` inventory,
read-only/denied folders, instructions, MCP and plan paths. Saving never runs a
script. Host agent command/MCP tools are blocked when they cannot enforce folder
restrictions. Repo instructions default to AGENTS.md (Agents.md is recognized);
MCP defaults to mcp.json. Missing files are shown, not silently created/pushed.
The explicit publishing action creates only missing defaults and pushes a
selected non-protected branch using an independent index, preserving current
HEAD, staging and unrelated edits. Partial publication is reported and requires
inspection. Reviewed MCP import binds its SHA-256 and installs disabled entries;
credentials remain in the keychain, not repo JSON. Branch settings do not imply
managed worktree support.

## Local memory, skills, scripts and plugins

**Settings / Repository memory** opts into indexing. A second switch explicitly
permits bounded retrieved snippets to enter Copilot context. The database uses
384-dimensional local lexical vectors, not a learned semantic embedding model.
No embeddings provider is required. Root/nested `.gitignore`, protected paths,
symlinks, file count, directory traversal and total source size are bounded.
Unchanged snapshots are reused. Changed, missing or newly ignored files return
no stale source text. Re-index for an updated import/symbol graph; it is a
snapshot, not a live compiler.

`/memory index`, `/memory search TEXT`, `/memory graph` and
`/memory remember CONVENTION` expose these APIs in TUI. Save only non-sensitive
project coding conventions. Knowledge is project-scoped and independent of
session retention.

Standard `SKILL.md` imports, declarative plugin bundles and optional
model-proposed skills/scripts/style facts share one inspectable registry.
Imports start disabled. **Optional evolution** starts off. A model can only
propose: human review binds the exact SHA-256, approval installs disabled
content, and enabling/execution are separate actions. A plugin must be enabled
before its bundled skills. No JavaScript plugin entrypoint or marketplace
dependency installation is supported.

TUI uses `/skills import PATH`, `/plugins import PATH`, `/capabilities`,
`/capability view|enable|disable ID`, `/proposal view ID` and
`/proposal approve|reject ID SHA256`. **Optional subagents** also starts off.
When enabled, up to two depth-one, tool-less children use the parent's fixed
model/approved context with separate usage and owned cancellation. They do not
become extra write-capable agents.

The internal MCP provides `grep_logs`, `fetch_page`, `search_memory` and
`memory_graph`, plus explicitly approved/enabled custom Node scripts. Custom
scripts are **host code without SendBox**, require source review and exact call
approval, and have bounded output/deadlines. See [the SDK contract](sdk.md)
for plugin and script formats.

## Native MCP gateway

**Settings / MCP gateway** configures stdio or Streamable HTTP servers,
discovers bounded tool pages, checks auth and requests exact calls in an idle
main session. Return to that session to approve. Configuration is user-only;
discovery may start the configured local executable, so enable only trusted
servers. Protected-env policy cannot be bypassed by Local MCP discovery.

Bearer credentials live only in the OS keychain. Stdio children receive no
ambient provider tokens. HTTP requires HTTPS, except explicit loopback HTTP.
TUI `/mcp token SERVER`
opens a dedicated masked input, never a composer draft; CLI accepts the
credential through piped stdin, not shell arguments. `/mcp tools`,
`/mcp auth`, `/mcp call` and `/result ID` use the same SDK.

For an HTTP server using OAuth, set its transport to
`{"type":"http","url":"https://example.test/mcp","auth":"oauth"}` and save first.
Choose the server, **Connect OAuth**, then explicitly **Open authorization**.
TUI `/mcp login SERVER` and CLI `moguri mcp login SERVER --session ID` print the
owned authorization state/link; open it yourself. No login starts from model
output, and no browser opens automatically.

The official MCP flow supports discovery, dynamic registration, S256 PKCE and
issuer/resource-bound code exchange/refresh. Client secrets and grants stay in
the explicit keychain, never events, settings or model input. Servers without
dynamic registration can use the advanced registered-client fields, including
an exact `http://127.0.0.1:PORT/oauth/callback` redirect previously registered
with that issuer. A fixed occupied port fails rather than silently changing it.
CLI `mcp oauth-client SERVER` reads JSON with `clientId`, `issuer` and optional
`clientSecret`/`redirectUri` from piped stdin, not secret shell arguments.

Use **Cancel login**, `/mcp cancel ID` or `mcp cancel ID` to settle a pending flow.
Clear explicitly through the UI, `/mcp clear-oauth SERVER` or `mcp clear-oauth
SERVER`. Expiry/restart never replays a callback. An expired/revoked grant
requires explicit reconnect if refresh fails; tools are never retried or sent
an anonymous credential fallback. Global connections survive source-session/
project removal; historical project-only credentials are cleaned separately.

`moguri mcp --session SESSION_ID` exposes one native MCP with discovery,
auth-status, call and paged-result tools. It cannot change settings or
credentials or approve itself. Connector failure/cancellation can leave
external effects unconfirmed; partial is not success and requires inspection.

## Local NVIDIA dictation

Open **Settings / Voice dictation**, review the linked model card/license and
explicitly accept the one-time download. The pinned model is
`nvidia/nemotron-3.5-asr-streaming-0.6b`, Q8 GGUF, **741,548,352 bytes
(about 708 MiB)** under OpenMDW-1.1. NVIDIA documents **40 language-locales**:
19 ready, 13 broad coverage and 8 requiring adaptation. Only the first 32 are
offered as usable without fine-tuning; do not interpret this as 22 verified
languages or 40 ready languages.

The pinned NeMo-Speech.cpp 0.2.0 native runtime ships with the build. Preparing
that runtime does not download the weights. The model download is staged,
size/SHA-256 verified and atomically installed under the private state directory.
Recording passes an existing local GGUF path, never an alias that might
auto-download. Audio never goes to hosted ASR or the Copilot provider.

Desktop **Dictate** or **Start local microphone** asks OS permission only on
that user action. **Stop and transcribe** finalizes; **Cancel and discard**
does not insert partial audio. TUI **Ctrl+Space** starts/stops and **F4** inserts
the completed local transcript into the saved draft. Recording is limited to
two minutes. WAV transcription accepts regular PCM WAV files up to 64 MiB.
Insert is explicit and revision-checked; nothing is automatically sent.

CLI equivalents:

```bash
node bin/moguri.mjs dictate status
node bin/moguri.mjs dictate download --accept-license
node bin/moguri.mjs dictate record --session SESSION_ID
node bin/moguri.mjs dictate file /absolute/path/recording.wav --session SESSION_ID
```

Ctrl+C finalizes a recording or cancels a download/file transcription.
CLI prints the retained result, not an automatic prompt send. Without the
runtime/model or microphone permission, setup fails explicitly; there is no
cloud fallback. Automated checks use generated recognizers, not real audio,
weights, microphone access or personal provider authorization.

## Shared dependency cache

Open **Settings / Dependency cache**, choose npm or pnpm and **Inspect current
lock**. Inspection is local and does not install or run anything. A plan binds
the project, manager, manifest and lock digests, not a mutable branch name.
Registered worktrees with common package/version/integrity bytes share one
profile-owned archive object. Switching branches or editing a lock invalidates
old plans. Mutable `node_modules` trees are never shared between branches.

Explicitly approve sending public dependency names/versions to **OSV**.
**Prepare verified cache** checks every exact version before fetching artifacts
and verifies SHA-512 on insertion and reuse. Known vulnerabilities, missing or
incomplete responses, pagination, outages and corruption block admission. No
package is permanently labeled secure; advisory absence is not a malware scan
or a guarantee that an upstream package is safe.

**Install with scripts blocked** is a second explicit action. It prepares in a
private clean directory without evaluating repository npm/pnpm configuration,
pnpm hooks or package/project lifecycle scripts, then rechecks the exact plan
before replacing the project tree. npm uses its shared archive cache offline;
pnpm uses its pinned native installer, a shared native store and a loopback
mirror that serves only this plan's verified artifacts. pnpm uses copy-on-write
reuse where supported and otherwise copies; npm archive caching does not
eliminate extracted per-project files. npm must be installed to use its adapter.

Initial formats are **single-project npm package-lock v2/v3** and **pnpm
lockfile v9**, with public npm-registry SHA-512 packages. Other managers,
workspaces, tags/aliases, Git/local/custom/private/patch resolutions and missing integrity require
separate qualification; they are not silently skipped.

**Lifecycle execution remains blocked until real SendBox is qualified.**
Packages needing native/postinstall builds may not be usable after this
script-free install. A script cannot be sandbox-tested before its bytes exist:
the safe sequence is advisory preflight, quarantined download, integrity check
and no host execution. Arbitrary separately approved shell commands are outside
this managed API and are not magically protected by cache settings.

Use CLI `cache inspect|prepare|install PROJECT_ID MANAGER ...` or TUI
`/cache inspect npm|pnpm`. Preparation requires the reviewed plan SHA-256 and
`accept-metadata`; TUI installation additionally requires
`replace-node-modules`. CLI uses `--accept-dependency-metadata`.
Jobs retain progress/outcomes and can be cancelled. An interrupted install is
never successful and may quarantine the project until inspection/resume.
Old dependency backups, when crash recovery is unconfirmed, are protected
`.moguri-dependencies-*` paths and must be inspected before manual removal.
The final staged-tree rename requires the state directory and project to share
a filesystem. A cross-filesystem rename fails explicitly and restores/preserves
the old tree. To relocate state, stop its service first, preserve/copy the entire
private directory and point `MOGURI_STATE_DIR` to it on the target filesystem;
never delete history or disable protection to retry.

## Local project Kanban and optional Linear

Desktop **Issues** opens this project's local board. **New** creates a
feature, bug or misc ticket with title, description, phase and optional
connected GitHub PR. There is no assignee and no hosted issue upload. Use
phase selectors to move, title to edit, and Archive/Restore to retain history.
Tickets and configuration survive service restart and session archival.

**Configure phases and integrations** names/adds/reorders phases and chooses
the merged-PR destination. An occupied phase, including archived tickets, cannot
be removed. Edits have optimistic revisions; another client or PR observation
cannot silently overwrite an unsaved edit.

Linking a canonical github.com PR authorizes bounded read-only observation while
Moguri runs. Newly linked PRs are checked immediately, then at most once per
two minutes with a 20-ticket refresh bound. Only a verified merged response
advances phase, once. Closed-without-merge, missing auth, outages and stale
observations leave phase unchanged and show diagnostics. Automatic observation
can be disabled. Public GitHub API is default; explicitly select your signed-in
GitHub CLI account for private PRs. This never merges a PR or starts CI.

TUI `/issues` shows the board; `/issue new` opens a full JSON editor and
`/issue create feature|bug|misc TITLE` is a shortcut. `/issue edit ID`,
`/issue move ID PHASE`, `/issue archive|restore ID`, `/board edit` and
`/board refresh` expose the same SDK. CLI `issues list` shows stable IDs;
mutations require the observed revision. See [SDK examples](sdk.md).

**Linear is optional and off by default.** Enable one exact team UUID, then
store a personal API key in the dedicated masked/keychain input. Explicit
imports read at most 50 team tickets per page with retained remote provenance.
Existing local edits are preserved and no local ticket, repository content,
assignee or user profile is sent to Linear. Importing does not enable OAuth,
background two-way sync or remote issue mutation. Disabling the team or
removing/replacing the key cancels owned imports. Partial HTTP-200 GraphQL
responses are errors, not partial successful imports.

## Delivery, drafts and recovery

**Queue** waits for the current turn. **Steer** is bound to that turn and enters
at its next model-step boundary. A steer that misses the boundary remains
visibly unapplied; it is never silently made into a new turn. Explicitly choose
**Queue as new turn** or `/queue-turn ID` to convert it. **Interrupt** requests
cancellation, waits for the old turn to settle, then admits its message ahead
of ordinary queued work.

Only unclaimed queue items can be edited, reordered or removed. Revision checks
protect concurrent clients. Idempotency IDs prevent replaying a mutation after
a lost response; the SDK never automatically resends paid or side-effecting work.

Drafts auto-save after a short editing interval. **Draft saved** means the
service acknowledged the revision. Unacknowledged text is a local edit, not
promised durable storage. Desktop prevents closing with unsaved edits unless
the user explicitly discards them; TUI **Ctrl+Q** flushes before leaving.
Conflicting drafts preserve local text and require **Reload saved draft** or
**Keep my draft**. TUI uses **Ctrl+R** and **Ctrl+S**, respectively.

Stop records requested, acknowledged and terminal outcomes. Owned PTYs use
TERM/KILL process-group escalation; PID/group metadata and partial or
unconfirmed results remain visible. A completed file write is not rolled back
by stopping a later operation.
The temporary Node supervisor cannot prove cleanup of arbitrarily detached or
reparented descendants. Cancelling or timing out a shell command therefore
records a **partial** result even when its known process group was terminated.
Inspect processes and explicitly resume before more queued work runs.
Daemonizing/background commands are unsupported; full tree-containment
acceptance remains a release blocker.

After a service restart, drafts and unclaimed queues survive. Interrupted
requests/tools become partial or unconfirmed, not successful, and are not
re-executed. Saved queues require explicit resumption. A failed/unconfirmed
workspace pauses automatic admission across its sessions. Inspect the workspace
and processes, then choose **Resume after inspection** or `/resume`.
That action authorizes continuation; it does not retroactively prove cleanup.

Only one active agent writer may lease a project at once; question-only
conversations may run in parallel. Archive preserves drafts/workspace and holds
queued user prompts. Project-owned plan snapshots survive session deletion.
Managed worktrees remain unavailable.

## TUI shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O / Ctrl+N / Ctrl+P | Open project / new session / select session |
| Ctrl+L / Ctrl+M | Copilot sign-in / model picker |
| Cmd/Ctrl+Enter | Hold a prompt in the queue without starting work |
| Shift+Cmd/Ctrl+Enter | Send now; settings editors still use Ctrl+Enter to save |
| Ctrl+C | Stop active turn without closing the TUI |
| Ctrl+Y / Ctrl+D | Approve exact pending tool / deny |
| Ctrl+V | Focus scrollable full approval arguments |
| Ctrl+R / Ctrl+S | Reload saved draft / save or explicitly keep local draft |
| Ctrl+A / Ctrl+B / Ctrl+K | Active/archive view / recent event trace / command help |
| Ctrl+G | Shared SDK settings and prompt editor |
| Ctrl+Space / F4 | Start-stop local dictation / explicitly insert completed transcript |
| Esc / Ctrl+Q | Return to composer / save and leave |

`/help` lists slash commands, including queue editing/reordering, `/steer`,
`/interrupt`, `/attach`, `/resume`, `/archive`, `/restore` and `/policy`.
Desktop uses **Ctrl+K** or **Command+K** for its command palette. Cmd/Ctrl+Enter
holds prompts, never starts them. Settings-editor save shortcuts are distinct.

## State, policy and diagnostics

The default state directory is `~/Library/Application Support/Moguri` on macOS.
`MOGURI_STATE_DIR=/absolute/private/directory` selects a separate state directory.
The directory must be user-owned, non-symlink and mode 0700. Connection metadata
and the SQLite file are mode 0600. Do not commit this directory.
A custom state directory is not a separate credential profile: this checkpoint
has one Default profile and one corresponding OS-keychain namespace.

The service writes `state.sqlite`, WAL files, `connection.json`, `service.lock`
and a diagnostic `service.log`. Connection tokens and OAuth credentials are
never printed in logs or put in URLs. State is migrated transactionally;
upgrading must never require deleting it. Do not edit the database while the
service owns it.

Protocol/database version 6 preserves earlier state through transactional
migrations. Payloads and blob grants use independent profile/project/session
retention keys, wrapped by an OS-keychain master under
`dev.moguri.profile.default.retention`. Its stable account ID travels with the
database; move the complete state directory on the same keychain. Missing or
corrupt keys fail explicitly, never create a plaintext fallback or reset
history. Session deletion removes its content grants while preserving immutable
ciphertext audit rows and sanitized accounting. This is not SSD forensic
erasure or deletion of external backups. Keep the original keychain and state
when restoring a backup.

Global **Allowed environments** policy is available in desktop Connections or
`/policy all` and `/policy protected`. Requiring Sandbox/Remote intentionally
blocks all new work in this checkpoint. Already-running Local turns may finish
under their recorded policy revision and are labeled **Local finishing**.

Node currently prints an **experimental FFI** warning for OpenTUI. It is a known
upstream runtime status, not a suppressed error. A native helper preparation
step fixes the executable bit on node-pty's published macOS spawn helper.
The provider library's unused Google adapter dependency chain currently emits
a `node-domexception` deprecation notice during installation. It is not used as
a Copilot credential source; dependency audits are separate from that notice.
Cheerio's upstream chain also reports deprecated `whatwg-encoding`. These
notices are not vulnerability findings or suppressed install failures.
Vite also reports the approximately 640 kB Ghostty JavaScript chunk as exceeding
its generic 500 kB warning threshold. It is lazy-loaded when Terminal opens;
the separately self-hosted WASM is about 423 kB. The warning is not hidden or
treated as a smaller measured bundle.

## Verification and packaging

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:sdk
npm run spike:workspace
npm run spike:sessions
npm run spike:models
npm run spike:engagement
npm run spike
npm audit --audit-level=moderate
```

Focused checks use `node --import tsx --test tests/<name>.test.ts`. The native
TUI and hidden Electron tests drive actual clients against generated local HTTP
fixtures, including Copilot device-flow behavior. They neither authenticate a
personal account nor establish live Copilot entitlement. Linux CI checks the
portable foundation, with macOS-only operational tests skipped.

```bash
npm run package:mac
```

On macOS arm64 this produces
`release/0.6.0-alpha.1/Moguri-darwin-arm64/Moguri.app`,
`release/Moguri-0.6.0-alpha.1-macos-arm64.dmg` and the corresponding ZIP. The app
contains the pinned Node runtime, SDK/workers, mascot icon, native speech runtime
and production dependencies, but no model weights. Development
application files are unpacked because the external Node service cannot execute
inside Electron's ASAR filesystem. `node scripts/verify-package.mjs` checks the
signature/icon, bundled runtime, CLI/TUI entrypoints, embedded SDK, native speech
readiness, bundled Ghostty assets and isolated packaged service without
using personal credentials. The Electron test can exercise that artifact with
`MOGURI_TEST_APP=/absolute/path/to/Moguri.app/Contents/MacOS/Moguri npm run test:e2e`.
Development artifacts are ad-hoc signed, not notarized; do not advertise them as signed
production releases or disable system-wide security to run them.
Packager may warn that the optional newer `.icon` format is absent; this build
uses the generated `.icns`, which package verification checks against its
declared native bundle icon.

Package verification also exercises the compiled service's project-free
metachat/configuration API, generated OAuth and an exactly approved HTTP MCP
tool call with credential redaction. It injects a generated vault/issuer rather
than opening authorization or touching a personal account.

Remaining blockers and unsupported capabilities are listed in
[Phase 0](architecture/phase-zero.md) and the canonical implementation spec.
CI is configured only for pushes to `main`. PRs/feature branches do not trigger
it; development verification runs locally, without manual CI dispatch.
