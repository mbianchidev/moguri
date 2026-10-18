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

The composer always exposes **Env**, **Model**, **Autonomy level**, **Budget**.
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
Interactive OAuth-only MCPs remain unsupported. TUI `/mcp token SERVER`
opens a dedicated masked input, never a composer draft; CLI accepts the
credential through piped stdin, not shell arguments. `/mcp tools`,
`/mcp auth`, `/mcp call` and `/result ID` use the same SDK.

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

Only one active turn may lease a project at once. Archive preserves the session,
draft and workspace; restore is explicit. Session/project deletion, artifact
retention management and managed worktrees are not exposed yet.

## TUI shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O / Ctrl+N / Ctrl+P | Open project / new session / select session |
| Ctrl+L / Ctrl+M | Copilot sign-in / model picker |
| Ctrl+Enter | Send or queue prompt |
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
Desktop uses **Ctrl+K** or **Command+K** for its command palette and either
modifier plus Enter to send.

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

## Verification and packaging

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:sdk
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
`release/0.2.0-alpha.1/Moguri-darwin-arm64/Moguri.app`,
`release/Moguri-0.2.0-alpha.1-macos-arm64.dmg` and the corresponding ZIP. The app
contains the pinned Node runtime, SDK/workers, mascot icon, native speech runtime
and production dependencies, but no model weights. Development
application files are unpacked because the external Node service cannot execute
inside Electron's ASAR filesystem. `node scripts/verify-package.mjs` checks the
signature/icon, bundled runtime, CLI/TUI entrypoints, embedded SDK, native speech
readiness and isolated packaged service without
using personal credentials. The Electron test can exercise that artifact with
`MOGURI_TEST_APP=/absolute/path/to/Moguri.app/Contents/MacOS/Moguri npm run test:e2e`.
Development artifacts are ad-hoc signed, not notarized; do not advertise them as signed
production releases or disable system-wide security to run them.

Remaining blockers and unsupported capabilities are listed in
[Phase 0](architecture/phase-zero.md) and the canonical implementation spec.
