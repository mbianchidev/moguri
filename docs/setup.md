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

Credentials are stored in the OS keychain under `dev.moguri.profile.PROFILE_ID`,
keyed by `github-copilot`. Existing Default keeps
`dev.moguri.profile.default`; new profiles begin disconnected. The service alone resolves refresh credentials;
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

Qualified 0.28 can explicitly inspect provider-declared metadata through
**Model / Provider-declared model metadata / Read Copilot model declarations**,
`moguri models evidence MODEL_ID`, or TUI `/model-evidence [MODEL_ID]`.
The SDK operation is `models.evidence(modelId)`. Omitting the TUI ID uses only
the current fixed model, never kupo or an inferred provider. No project content
or inference request is sent. Unknown declarations remain unknown; labels are
not proof of independent weights, quality, permission or user approval.
Opening the menu, normal login and ordinary model discovery add no such read.
See [the current checkpoint](#development-028-explicit-model-declarations).

## Work and approvals

The composer exposes **Env**, **Model**, **Autonomy level**, **Budget** through
compact icon/name controls rather than separate labeled rows.
Factory values are Local, unset model, Manual and Unlimited. Current execution
is Local or explicitly qualified SSH with fixed Copilot/configured local models
and Unlimited or explicit estimate-based caps. Opt-in kupo Single uses those
same transports but blocks every finite inherited cap until its wind-down path
is qualified. Manual remains default; Guided displays model
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
Desktop also captures explicitly selected local text/images and pasted PNG,
JPEG or WebP. Images are bounded/normalized locally with metadata removed;
there is no conversion service. Folder, GitHub issue/PR and session-text
snapshots require exact preview/digest confirmation. Bare `@`, `^`, `:`, `#` and
`!` stay literal until the user selects an attachment; Tab offers the typed
picker without attaching or executing anything.

TUI/CLI use `/attach-file ABSOLUTE_PATH`, `/attach-image ABSOLUTE_PATH`,
`/attach-folder [SHA256] PATH`, `/attach-github [gh-cli] [SHA256] URL` and
`/attach-session [SHA256] ID`. Omitting a digest previews; confirmation uses the
displayed exact command. `/attached ID` inspects a retained snapshot. Terminal
clipboard images use an explicit image path rather than invented support.
CLI equivalents are `moguri context file|image PATH --session ID`,
`context folder PATH|github URL|session ID --session DEST` and the same command
with `--digest SHA256 --confirm-review` after preview.

Images are limited to 8 MiB input/normalized bytes and 16 million pixels.
Folder capture is limited to 200 UTF-8 files and 2 MiB, respecting nested ignore
rules, protected credentials and denied source folders. Combined captured
context is capped at 16 attachments/12 MiB. Unsupported image models block
before admission and preserve the complete draft/queue, including prior image
history; no image is silently dropped. Session snapshots disclose their bounded
public-text scope, not private continuation or tool/binary payloads.

## Reviewed context compaction

Desktop: **Model / Review context and compactions**. Choose a real compactor and
how many complete recent turns to keep, then **Preview source**. Previewing does
not call a model. Inspect the contract/request estimate before **Generate
proposal**. Read the actual summary, check its review acknowledgement, and use
**Apply reviewed summary**. Context is never automatically replaced.

The same capability is available through `sdk.compactions` and CLI/native TUI
`/compact`. Examples:

```text
/compact state
/compact preview {"keepRecentTurns":1}
/compact generate {"digest":"PREVIEW_SHA","modelId":"ACTUAL_MODEL_ID","keepRecentTurns":1} confirm-cost
/compact read COMPACTION_ID
/compact stop COMPACTION_ID
/compact apply COMPACTION_ID REV confirm-reviewed
/compact discard COMPACTION_ID REV
/compact restore ACTIVE_ID CURRENT_STATE_SOURCE_SHA confirm-restore
```

For CLI, use `moguri slash '/compact preview {"keepRecentTurns":1}' --session ID`.
Copy the actual digest/model/revision from the current preview/history; the
placeholders above are not valid hashes. A kupo session must explicitly name
an available fixed compactor in preview options. No fallback is chosen.

Compaction supports text history on Local and qualified core SSH. It uses one
owned tool-less model call with actual role/cost/cancellation; Remote inference
stays on the pinned machine. Generate may spend budget even when rejected.
Absent reports remain unknown/held. Source/model/policy changes, tools,
incomplete/expanding output and image history fail explicitly.

Original append-only history, complete recent turns and your draft stay
retained. Restoring originals makes no call and never refunds charges or
replays tools; normal context-window limits still apply. Session deletion may
delete its compaction text along with its transcript, but cannot erase the
independent ledger's real/unknown charges. There is no automatic compaction,
summary-to-memory promotion, user-answer forgery or new sandbox claim.

## Local models and startup sources

**Settings / Local models** accepts explicit OpenAI-compatible base URLs and
model IDs/context/output/image limits, for servers such as ds4, Ollama or
llama.cpp. Start/configure the actual server yourself; Moguri does not download
or launch model weights. Saving enabled endpoints performs bounded `GET models`
discovery only, never inference or host scanning. Remote URLs require HTTPS;
plain HTTP is loopback-only. Only configured, advertised models become
selectable. Context/thinking controls never guess unsupported capabilities.

Bearer credentials are stored separately through the endpoint-key form or
`moguri models token ENDPOINT` using piped stdin. TUI `/model-token ENDPOINT`
uses masked input, never a draft. Keys bind to the exact resource URL in the
secret backend; moving an endpoint does not reuse its key. Discovery failures
remain visible, and selecting a failed local model never substitutes Copilot.
Copilot's account state is independent of local-model readiness. All calls use
the same worker and per-step provider/API-model provenance. Unknown billing is
still not zero. Request credentials echoed by an untrusted provider are redacted
across stream chunk boundaries and structured response fields.

**Settings / Startup defaults** separates shared global and current-profile control
overrides. **Project settings / New-session defaults** adds project precedence.
Explicit session overrides win; `session create --controls FILE` supports them
in CLI. The complete values and source/revision snapshot are saved once when
creating a session. Inspect **Insights / Startup control sources** or TUI
`/defaults`. Changing preferences does not rewrite existing/running sessions or
widen hard policy. Profile startup reset preserves global values. Restoring
shared global preferences is a separate revision-bound action.

## Experimental kupo Single

In **Settings / kupo Single**, explicitly enable the profile policy, choose one
discovered classifier, approve up to eight exact solver models and separately
allow hosted/network task-data transfer if any selected role uses Copilot, a
non-loopback URL or an unknown endpoint boundary. The configured provider's
local label is not sufficient. Known loopback-only pools can leave consent off;
this does not attest what a user-configured proxy does behind that URL.
Configured-model discovery and inference reject redirects. Saving performs no
inference and does not select a model. Then explicitly choose **kupo Single
(alpha)** in the composer. The default remains disabled and no fallback is
chosen for an invalid plan or unavailable pool.

TUI/CLI share `/kupo status`, `/kupo set POLICY_JSON`, `/kupo history` and
`/model EXACT_ID` through the SDK; for example, pass the literal reviewed command
to `moguri slash '/kupo status' --session ID`. Obtain actual canonical IDs from
`/models`, not invented endpoint names. A policy has `enabled`, `workflow:
"single"`, `classifierModelId`, `approvedModelIds`, `allowHosted` and
`minimumConfidence`; the [routing contract](architecture/routing.md) documents
defaults and every boundary. `/model kupo` explicitly clears prior per-model
options without starting work. Desktop **Restore kupo defaults**, TUI
`/settings reset kupo` or `sdk.settings.reset("kupo", revision)` restores the
disabled policy while preserving history and charges.

The tool-less classifier and selected solver use the same owned worker,
approvals, env and cumulative ledger. Both calls count, including rejected
advice; unknown telemetry stays held. **Insights / kupo Single provenance** and
TUI `/kupo history` expose the actual plan/models; per-call accounting shows
actual roles. Confidence is model-supplied advice, not a calibrated probability,
user answer or authority. Stop/restart never replay routing or effects.

This alpha is text-only and requires Unlimited with no finite session, owner,
profile or global cap. Context/thinking tuning, images, cascade,
critique/revision, calibrated quality and reserved wind-down/authorized
checkpoint commits are not qualified. Hard policy can still stop new routed
calls; it is never removed to enable kupo. Native Sandbox remains unavailable.

## Isolated profiles

Desktop's **Profile** selector and **Manage profiles** create, rename/color and
explicitly choose a profile. TUI **F8** provides the same operations even
without a session, including partial setup inspection/retry/stop. Creation
does not choose the new profile, copy private data or log in. CLI examples:

```bash
node bin/moguri.mjs profile list
node bin/moguri.mjs profile create Work --color '#557799'
node bin/moguri.mjs status --profile PROFILE_ID
node bin/moguri.mjs tui --profile PROFILE_ID
node bin/moguri.mjs desktop --profile PROFILE_ID
node bin/moguri.mjs profile update PROFILE_ID changes.json --revision OBSERVED_REVISION
```

Metadata changes accept `{"name":"Work renamed","color":"#776655"}` or a
subset. `MOGURI_PROFILE_ID=PROFILE_ID` is an explicit launch choice; `--profile`
wins in CLI/TUI. `npm run desktop -- --profile PROFILE_ID` selects the same
native startup scope. There is no shared last-active selection. Omitted SDK/API
scope is actual Default, not the previously viewed profile.

Switching flushes saved drafts and blocks unsaved forms/dialogs or active
dictation. Old work continues in its actual profile. Accounts, settings,
projects, sessions, retained documents, memory/style/indexes, MCP grants and
mutable job data stay scoped. Verified public dependency archives and official
speech weights can share one immutable user cache, not credentials or private
captures. A common physical repository is not an OS sandbox; root writer
ownership/quarantine still spans profiles.

Global environment policy, shared global startup values and optional global
hard budget caps remain authoritative. A new profile cannot escape them.
Profile deletion/merging and native Sandbox execution are not implemented.
See the [isolation contract](architecture/profiles.md).

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

## Remote SSH

**Settings / Remote SSH** configures one explicit host for this profile.
Install this exact packed Moguri build and Node 26.4+ (26.x) on the target
first. The worker command may use `moguri worker --stdio`, or an absolute
compatible Node path followed by the installed `dist/remote-bridge.mjs`.
No automatic cloud provisioning, identity discovery or remote package install
runs when saving settings.

The target JSON has `id`, `name`, `host`, `port`, `user`, `hostKey`,
`identityFile`, `stateDir`, `command`, `allowCopilot` and `models`.
`hostKey` is the full public key type/base64, verified independently, not a
fingerprint or trust-on-first-use instruction. `identityFile` is an explicit
local user-owned private identity with mode 0600 or stricter; its contents are
never copied. `stateDir` is an absolute canonical private remote directory.
Moguri disables ambient SSH config, implicit agent use/forwarding, tunnels,
password prompts, proxy commands and shared control sockets.

Save, then **Probe** or use `/remote probe` / `moguri remote probe`.
The probe verifies the actual installed worker digest and compatible Node.
Each project separately sets **Project / Canonical remote path** (`remotePath`);
Moguri never substitutes the local project folder. Project-free Remote chats
keep a null filesystem root. A symlink alias or changed root blocks execution.
Switching env never chooses another model: an incompatible selection is cleared
so you can choose explicitly. The env menu discloses transfer of approved
history/attachments to the SSH host.

`allowCopilot: true` explicitly grants short-lived request access to that host,
not a refresh credential or the local secret store. Copilot metadata is
rechecked from the SSH host before inference. Remote-local model declarations
use the same endpoint schema as Local models; `localhost` means the SSH host.
Discovery and inference both originate there. `/remote-model-token ENDPOINT`
uses masked TUI input; `moguri remote token ENDPOINT` takes piped stdin. Remote
keys bind the SSH identity and exact endpoint resource, never reuse host-local
keys or enter settings/history.

SSH moves execution and secures transport; it does **not** imply SendBox
containment. Native qualification uses actual generated macOS loopback SSH,
worker/model/file operations, changed host keys, images, disconnect and a real
control-plane SIGKILL/restart. It is not proof of an external Linux deployment
or live Copilot entitlement.

**Owned execution recovery** in Remote settings or Insights exposes the run
identity and actual state. `/remote reconcile ID` / `moguri remote reconcile ID`
reads existing encrypted receipts and late usage without starting a second
worker or replaying tools. Partial turns stay partial. If cleanup cannot be
confirmed, inspect actual remote processes before explicitly recording
`/remote acknowledge ID` or CLI `remote acknowledge ID --confirm-review`.
Acknowledgement is not proof of cleanup. Unknown owned work blocks new
admission/deletion; session deletion destroys its transport key only after
settlement or actual user inspection.

**Files**, **Changes** and **Plan** views use the actual SSH
workspace. `/files`, `/file PATH`, `/diff` and `/plan` share the same SDK path in
CLI/TUI; a Remote plan is displayed as text, never opened as a Local filename.
Protected paths, denied folders, file limits and Git filter/hook suppression
still apply. Changed target/root/policy or a disconnect rejects the read.
Install the worker matching the SDK/service you use and probe it before new
work: qualified 0.21 uses protocol 27. Older run receipts permit inspection,
not continuation.

Explicit Remote user consoles use the captured pinned host/root and independent
authenticated owner through the same SDK/Ghostty. No model is required.
Qualified protocol 27 adds session-bound Remote repository memory through
the same SDK. Source capture/
freshness runs on the pinned host and never uses an attached Local index.
Transferred Local scripts remain blocked.
Remote MCP has an independent reviewed peer/resource
grant and exact call approval; selecting Remote is never access authorization.
Remote plan saves use an explicit reviewed binding
and one owned provider-free filesystem operation; they do not use a Local
project fallback.
An explicit browser URL still opens a client-side preview; Remote localhost
ports are never mapped to this Mac or tunneled implicitly.

### Explicit Remote plan editing

Desktop's existing **Plan** editor saves only the reviewed SSH binding and
expected file digest. Expand **SSH destination and binding** to inspect the
actual root/peer. **Remote save outcome** exposes phase, actual file/directory
effects, owned-worker cleanup and retained snapshot; **Stop Remote save**
targets only that operation. Prompt drafts are independent.

TUI `/plan edit` opens a scoped text editor without a Local file opener. Edit
the JSON `text` field, then Ctrl+Enter explicitly writes/retains it. Esc discards
before saving; while pending, Ctrl+C requests the exact save's stop and the
editor stays preserved until settlement. `/plan saves` and `/plan info ID`
inspect actual lifecycle; `/plan stop ID` stops one exact operation.

CLI:

```bash
moguri plan read --session SESSION_ID
moguri plan save /absolute/generated-plan.md --session SESSION_ID \
  --digest OBSERVED_SHA_OR_absent --binding REVIEWED_BINDING_SHA
moguri plan saves --session SESSION_ID
moguri plan info SAVE_ID --session SESSION_ID
```

The binding comes from the current Remote plan read. Even two absent files in
different roots are not interchangeable. Local saves keep the existing
three-argument SDK/no-binding form. No model, login or tool delegation is needed
for this manual user action. Session mode, env/folder policy, root leases and
actual worker qualification still apply.

A save may write bytes before cancellation, scope change, lost acknowledgement
or retention failure. Partial/unconfirmed errors preserve the edit and actual
outcome, never imply rollback or authorize replay. Inspect the exact operation
and actual remote processes before a new explicit save. Real control-plane
SIGKILL recovery retains the original command intent, and explicit
reconciliation may retain known written bytes without promoting the original
partial turn to success. Committed snapshots survive session deletion with
actual Remote boundary/frame provenance.

## Project-free chats, suggestions and settings chat

Desktop's **No project** section and project selector create chats without
attaching a folder. TUI `/new global` does the same; Ctrl+N keeps the current
scope, or creates a project-free chat when none is selected. CLI:
`moguri session create` with no `--project`. Choose a model explicitly as usual.
Scope is fixed for that session, not silently rebound when a different project
is selected for new chats.

These chats never reuse a previous root. Workspace project files, shell,
terminal, diff, plans and repository memory are unavailable. Provider calls,
explicitly selected client snapshots/images, global guidance/skills and configured global MCPs remain available.
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
`/queue`, `/run ID`, `/copy [ID]`, `/workspace`, `/files [PATH]`, `/file PATH`,
`/settings`, `/models` and `/help`.
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
Changes, Files, Plan and Side chat. `/terminal`, its requested `/termnial` alias and the
terminal plus button use **actual Ghostty through `ghostty-web`**, not a new
terminal renderer. Terminal input/resize/output are ephemeral, never model
context or durable command hashes. Closing the panel leaves its shell running;
Close terminal stops the owned group. Explicit service restart reattaches the
same authenticated Local or pinned SSH owner/PTY while it survives; ordinary service stop
closes its known groups. Missing owner/key/buffer is explicit, never a
replacement or input replay. Inspect unconfirmed ownership before acknowledging it. The console is
explicit user-controlled host execution, not an agent permission grant,
folder containment or Sandbox isolation. Allowed-env policy still applies.
Remote shows its captured SSH host/root; it never silently opens a Local shell.
TUI rejects `/terminal` because it is already a terminal. Use `/terminals open`
for explicit new Local/Remote admission and `/terminals` for
existing consoles: `read ID [OFFSET]`, `reconcile ID`, `close ID`,
`owner-reconcile OWNER_ID`, or inspection acknowledgement with
`confirm-inspected`. Owner metadata is profile-shared, including empty owners.
CLI equivalents are `moguri terminal list|read|reconcile|close` and
`terminal owner-reconcile OWNER_ID`. `terminal open --session ID` explicitly
creates a console; `terminal input ID` accepts bounded piped UTF-8 stdin only.
`acknowledge ID --confirm-review` and `owner-acknowledge OWNER_ID --confirm-review`
record actual user inspection, not proven cleanup.

Ghostty's reconnect control inspects the existing owner, never opens another
shell. Hiding the panel or losing a connection discards queued unsent input;
partly accepted input is not resent. Its owner inspector shows the actual
Local/Remote root/PID, captured peer and private-resource cleanup status, not the session's possibly
changed environment label.
New Remote consoles require a current pinned helper probe. An already
authenticated Remote console can receive allowed original-root input after
service recovery without a new model/core-agent probe. Changing env, peer,
project mapping or policy makes its view read-only, while retained read/close
remain on the original host. The controller's Local shell never selects the
Remote default shell. See [Remote ownership](architecture/remote-user-consoles.md).

`moguri service restart` explicitly preserves user consoles; `service stop`
and ordinary embedded `runtime.close()` stop them. Failed private cleanup
retains the writer lock and registry: repair the explicit secret backend or
inspect unexpected runtime files, then retry stop. Do not delete state or
launch a second writer. See [the ownership contract](architecture/terminal-reattachment.md).

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
credentials remain in the keychain, not repo JSON. Merely saving a branch
pattern does not create a worktree.

### Managed Local worktrees

**Project settings / Isolated worktrees** creates an explicitly named branch
from a selected existing base ref, then offers a new bound Local session.
It never fetches, switches the base checkout, changes its index, runs checkout
hooks/filters or fetches submodules. Configure an available model explicitly
before inference; opening the session does not start it.

```bash
node bin/moguri.mjs workspace list PROJECT_ID
node bin/moguri.mjs workspace discover PROJECT_ID
node bin/moguri.mjs workspace create PROJECT_ID moguri/generated-work main
node bin/moguri.mjs workspace session WORKSPACE_ID
node bin/moguri.mjs workspace files --session SESSION_ID
node bin/moguri.mjs workspace file src/example.ts --session SESSION_ID
node bin/moguri.mjs workspace inspect WORKSPACE_ID
node bin/moguri.mjs workspace remove WORKSPACE_ID --revision OBSERVED_REVISION --confirm-remove
```

Shared chat commands are `/workspace list`, `/workspace discover`,
`/workspace create BRANCH [BASE_REF]`, `/workspace new ID`,
`/workspace bind ID`, `/workspace inspect ID`, `/workspace remove ID` and
`/workspace reconcile ID`. Binding is allowed only for a fresh idle conversation,
never an existing conversation/queue. `/files` and `/file` read the selected
session's actual root, with protected/denied paths and symlinks excluded.
They do not attach their contents to a model or grant agent permissions.

The service records ownership, base commit, branch, exact canonical directory
identity, change-set/ticket/PR association and the creation/removal job.
Different worktrees have independent writer leases and derived memory indexes;
package archives remain shared while installation trees stay root-local.
Git registration discovery is read-only. Unmanaged roots are not adopted or
deleted; attach their folder as a project explicitly if needed.

Stop, failure or restart leaves potentially partial intent visible. Inspect
and explicitly reconcile the real registration/root instead of blindly retrying
Git. Removal refuses dirty/untracked files, active jobs and retained sessions,
including archived sessions. Delete/unbind eligible sessions first; archive or
session deletion never removes a checkout. Removal preserves the branch and
independent plan snapshots. Project relocation/removal refuses retained
worktrees rather than losing them. Remote/Sandbox mappings, external-worktree
adoption and compound candidate orchestration are not implemented.

## Repository memory, skills, scripts and plugins

**Settings / Repository memory** opts into indexing. A second switch explicitly
permits bounded retrieved snippets to enter the chosen model's context. The database uses
384-dimensional local lexical vectors, not a learned semantic embedding model.
No embeddings provider is required. Root/nested `.gitignore`, protected paths,
symlinks, file count, directory traversal and total source size are bounded.
Unchanged Local snapshots are reused; explicit Remote indexing captures fresh
bounded source. Retrieval validates actual-host metadata without rereading the
whole repository. Changed, missing or newly ignored files return no stale
source text. Re-index for updated symbols; the graph is a snapshot, not a live
compiler or hostile timestamp-preserving content proof.

Qualified 0.21/protocol 27 exposes `/memory state`, `/memory index`,
`/memory search TEXT`, `/memory graph [PATH]`, `/memory stop JOB_ID` and
`/memory remember CONVENTION` in TUI. CLI session commands are:

```bash
node bin/moguri.mjs memory index --session SESSION_ID
node bin/moguri.mjs memory state --session SESSION_ID
node bin/moguri.mjs memory search QUERY --session SESSION_ID
node bin/moguri.mjs memory graph --session SESSION_ID
```

They use the session's actual env/profile/peer/root. Legacy commands with an
explicit project/workspace ID stay Local. Desktop labels Local versus Remote,
shows real index job outcomes and discards stale held output after scope
changes. A configured/probed SSH worker and explicit project mapping are
required; no model is needed. A missing Remote index fails explicitly rather
than using Local data. Inspect bound metadata before enabling context injection.
The control plane retains derived text/vectors, not another remote database.
Indexing/injection remain off by default. The expanded builtin MCP memory
resource requires new user review; old two-tool grants do not widen.
See [ownership/recovery](architecture/remote-repository-memory.md).

Save only non-sensitive
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

### Remote MCP

Select an explicitly mapped Remote project, then **Settings / MCP gateway**.
Expand **Configure backend MCP servers** when changing transports. Use
**Probe SSH target**, choose the server and **Review Remote grant**. Review the
profile, host/port/pinned key, Remote root, exact resource and digest before
checking the review confirmation. Access forwarding is a separate, initially
unchecked option for authenticated HTTP: a bearer may be long-lived and the
host can retain received access. Refresh credentials never leave their backend.
Saving a grant starts no tool. Probe SSH again, discover the current catalog,
request the exact call and return to the session for its separate approval.
No selected model is needed for that external operation.

TUI and desktop share `/mcp-remote preview SERVER`,
`/mcp-remote grant SERVER SHA256 REV confirm-reviewed [forward-access]`,
`/mcp-remote revoke SERVER REV confirm-revoke`, `calls` and
`inspect OPERATION_ID`. CLI equivalents are `moguri mcp remote-preview SERVER`,
`remote-grant SERVER --digest SHA256 --revision N --confirm-review
[--forward-access]`, `remote-revoke SERVER --revision N --confirm-review`,
`remote-calls` and `remote-call OPERATION_ID`, each with `--session ID`.
`mcp servers --session ID` reports configured/review-required/access-required/
unready metadata without connecting a server or reading an access credential.
It is not proof of tool availability or approval.

**Recorded Remote calls** shows the actual actor, phase, root and observed or
unknown forwarding receipt. Inspection remains available after revocation;
**Reconcile receipts** reads an existing SSH run, never replays an effect.
Revocation does not need an online/ready host. It also cannot undo access or
external effects already received. Transferred Local scripts
remain unavailable. Remote user consoles are an independent explicit
user-open capability, not an MCP resource grant. Exact current archive
qualification and preserved earlier identities are recorded below.

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

Only one active agent writer may lease a filesystem root at once; separate
managed worktrees and question-only conversations may run in parallel.
Quarantine applies to the failed bound worktree rather than unrelated roots.
Archive preserves drafts/workspace and holds queued user prompts.
Project-owned plan snapshots survive session deletion.

## Independent retained documents

Desktop **Artifacts** opens a session-independent library, including when no
conversation remains. **New artifact** creates a plan, decision, answer, research
note or report in explicit project/profile scope. Text revisions, archive,
history, exact JSON export and confirmed deletion use the same SDK as TUI/CLI.
In TUI, **F5** opens the library without a session; Enter edits JSON and
Ctrl+Enter saves. Cmd+A selects editor text; Esc discards the unsaved edit.
Shared `/artifacts`, `/artifact new KIND NAME`, `/artifact ID`,
`/artifact edit ID`, `history/archive/restore ID`, and
`delete ID REV confirm-delete` expose the same operations.

**Retain a completed message** first previews exact canonical text/digest.
Model output remains labeled model output, not a human answer; later edits
preserve that provenance. File captures have unknown authorship and manual text
is labeled user-entered, not verified authorship. Sources remain traceable after
origin-session deletion. These are text copies: images/media are not implicitly
retained, and documents never become prompts, memory policy or permissions.

```bash
node bin/moguri.mjs artifact create document.json --project PROJECT_ID
node bin/moguri.mjs artifact read ARTIFACT_ID
node bin/moguri.mjs artifact update ARTIFACT_ID changes.json --revision OBSERVED_REVISION
node bin/moguri.mjs artifact export ARTIFACT_ID --output /absolute/new-export.json
node bin/moguri.mjs project removal-preview PROJECT_ID
```

`document.json` contains `kind`, `name` and `text`. Omit both project/session
options to create a standalone profile document. `changes.json` contains only
the desired `name`, `text` or `status` changes. Text is bounded to 128 KiB UTF-8;
exact exports are bounded to 8 MiB and never silently truncated.
Native desktop export uses an explicit save dialog; TUI
`/artifact export ID ABSOLUTE_NEW_FILE_PATH` and CLI write a new private file,
verify its digest and flush it. Existing files are preserved.

Project removal now previews all independent documents, including archived
ones, and requires an exact-set digest plus an explicit choice:
retain as profile documents, save the exact export then delete stored copies,
or delete their grants. A concurrent edit invalidates that preview.
Desktop asks in the removal dialog; CLI accepts `--artifacts retain|delete|export
--digest PREVIEW_SHA` and, for export, `--exported-digest SAVED_EXPORT_SHA`.
TUI uses `/project-removal preview`, `export ABSOLUTE_PATH`,
`retain PREVIEW_SHA confirm-remove`, `delete PREVIEW_SHA confirm-remove`, or
`export-delete PREVIEW_SHA SAVED_EXPORT_SHA confirm-remove`.
Source repository files, external copies and PRs are not erased.

Documents can associate with existing profile navigation folders and work items
from their own project. Associations are revisioned metadata, not filesystem
authority. The TUI's JSON editor, CLI document/changes JSON and desktop fields
edit the same SDK values. Retaining a removed project's documents clears their
work-item link but preserves independent text/history and folder association.

### Reviewed repository artifact copies

The Artifacts panel and project-removal dialog can explicitly copy the complete
project artifact history, including archived revisions, into
`artifacts/moguri-SET_SHA.json` in a reviewed Local base/managed root. A normal
folder need not be a Git repository unless a commit is requested. A new 0600
file is fsynced and verified without overwriting an existing different copy or
following destination symlinks. Review sensitive text before storing it in Git.
These files are user-owned copies, never automatic instructions or model
context. Remote/Sandbox repository publication is not claimed.

Optional commit creates only the explicitly chosen new non-protected **local**
branch from the reviewed HEAD. The current checkout, real Git index and
unrelated staged/unstaged edits stay unchanged. No push, signing or hook/filter
execution occurs. An existing/racing branch or changed base rejects publication.

```bash
node bin/moguri.mjs project materialize-preview PROJECT_ID
node bin/moguri.mjs project materialize-artifacts PROJECT_ID --digest REVIEW_SHA --confirm-write
node bin/moguri.mjs project materialize-preview PROJECT_ID --workspace WORKSPACE_ID --branch docs/retained-copy
node bin/moguri.mjs project materialize-artifacts PROJECT_ID --workspace WORKSPACE_ID --branch docs/retained-copy --digest REVIEW_SHA --confirm-write
node bin/moguri.mjs artifact materialization JOB_ID
node bin/moguri.mjs artifact stop-materialization JOB_ID
node bin/moguri.mjs project remove PROJECT_ID --revision OBSERVED_REVISION --confirm-remove --artifacts materialize --digest SET_SHA --materialization-id COMPLETED_JOB_ID
```

Review digest and artifact-set digest are distinct fields in the preview.
CLI Ctrl+C requests cancellation and reports the actual partial outcome.
Shared `/project-removal materialize-preview [WORKSPACE_ID|-] [NEW_BRANCH]`
and `/project-removal materialize REVIEW_SHA WORKSPACE_ID|- NEW_BRANCH|- confirm-write`
start the same owned job; `materialization JOB_ID` inspects it,
`materialize-stop JOB_ID` requests stop, and
`materialize-delete SET_SHA JOB_ID confirm-remove` chooses verified copies before
project deletion. Omitted workspace means the explicitly shown base folder,
not an inferred SSH path. Existing worktrees still need separate clean removal.

Intent and receipt precede effects. Partial/cancelled/interrupted publication
preserves source grants and quarantines the affected root until inspection.
Restart never retries a copy or commit. Deletion rechecks a completed receipt,
current source set, real file digest/private ownership and requested local
commit; changing/removing the file or branch keeps stored documents intact.

### Estimated budgets and cumulative usage

Factory preference remains **Unlimited**. The composer's Budget popover now
separates current accounting from explicit session limits. Choose estimated
cumulative token and/or USD caps, read the interruption warning and accept the
estimate policy before saving. The service atomically reserves capacity before
each real model dispatch and forwards the reduced output limit.

**This is not an exact provider-billing guarantee.** Input is estimated and
in-flight charges cannot be undone. Real reports settle once. Missing/lost
completion keeps the entire reservation held, not free; late authenticated SSH
usage can refine it without replaying a request or completing a partial turn.
Model-created subagents charge their real owner. Changing models/envs,
resuming, deleting sources and restarting never resets cumulative accounting.

USD choices require fresh model-specific estimates in **Settings / Budgets**.
Configure canonical model IDs, input/output USD per million, a UTC effective
date and `source: "user-estimate"`. No Copilot price is guessed; adapter default
zero is not a bill. An explicit approved zero estimate is allowed. Historical
unpriced/unbounded calls keep affected finite choices unavailable. Cache
categories are included once in total input using the conservative configured
rate, not an invented discount.

The separate **Current-profile hard policy** applies across sessions, including
Unlimited preferences. Factory/settings reset does not clear it. Removing or
changing policy requires the current revision and an explicit user action.
The separate **Global hard policy** counts all profiles without combining their
private task content. Switching profiles, factory resets and source deletion
cannot refund it.

```json
{"kind":"limited","basis":"estimate","tokens":50000}
```

```bash
node bin/moguri.mjs budget set SESSION_ID session-budget.json --confirm-review
node bin/moguri.mjs budget status SESSION_ID
node bin/moguri.mjs budget dashboard --project PROJECT_ID --role solver
node bin/moguri.mjs budget dashboard --filters '{"range":{"kind":"days","days":30},"bucket":"week"}'
node bin/moguri.mjs budget calls --filters '{"range":{"kind":"year","year":2026},"limit":20}'
node bin/moguri.mjs budget policy profile-limit-or-null.json --revision OBSERVED_REVISION --confirm-review
node bin/moguri.mjs budget global global-limit-or-null.json --revision OBSERVED_REVISION --confirm-review
```

Profile-limit JSON uses `{"basis":"estimate","tokens":100000}` without `kind`;
literal `null` explicitly removes policy, not accounting. TUI shares
`/budget status`, `/budget set TOKENS|- USD|- confirm-estimates`,
`/budget profile TOKENS|- USD|- REV confirm-estimates` and
`/budget global TOKENS|- USD|- REV confirm-estimates`, with
`/budget clear-profile REV confirm-policy` or `clear-global` for explicit
removal. It displays the warning before the
typed cap is applied. **F7** opens cumulative profile accounting even without
a session; `/dashboard` supports an explicit filters JSON object.

Desktop **Dashboard** shows authoritative profile totals and actual
role/provider/model groups, with project/folder/session/provider/model/role
filters and bounded pages. Unknown usage, held reservations, estimates and
unreported bills stay distinct. Other profiles' private ledger rows are never
combined. Repository/org/visibility filtering uses explicit verified snapshots,
not guesses from project/owner names or today's repository state.

**Repository attribution** is optional and initially unconfigured. In desktop
Dashboard choose an explicit bound session, review its actual Local/worktree
or pinned SSH root, then request the displayed GitHub lookup. Public access
uses the control-plane API without credentials; Local `gh-cli` uses the
explicitly selected project account. Protocol 26 adds Remote
`gh-cli` using the selected SSH host's account, never a controller account or
root fallback. Install/authenticate `gh` on that host yourself, choose project
GitHub CLI access, then review the displayed host/key/root before refreshing.
The observation retains its captured peer and build. Missing tools/accounts,
stale authority or control loss cannot silently substitute public/Local access.
Linked-PR observation and client attachments retain their existing explicit
control-plane reads.

```bash
node bin/moguri.mjs repository preview --session SESSION_ID
node bin/moguri.mjs repository refresh --session SESSION_ID --digest REVIEWED_BINDING --revision OBSERVED_REV --confirm-review
node bin/moguri.mjs repository state --session SESSION_ID
node bin/moguri.mjs budget dashboard --filters '{"repositoryId":42,"organization":"generated","visibility":"open-source"}'
```

Native TUI shares `/repository preview/state`,
`/repository refresh BINDING REV confirm-lookup`,
`/repository clear REV confirm-clear` and `/repository stop JOB_ID`.
Refresh performs no model request. Future model roles and tool/MCP attempts
capture immutable verified metadata only after rechecking their actual Git
root; changed/missing provenance stays unassigned. Clearing affects future
attribution, not old names, visibility or charges. Source/date coverage discloses
unassigned history excluded by repository filters.

The **open-source** filter specifically means public plus a detected
OSI-approved SPDX license from the pinned metadata dataset; it is not a
license/compliance review or a synonym for every public repository. No
background lookup or retroactive classification runs. See
[the repository contract](architecture/repository-telemetry.md).

**Tool and MCP outcomes** share a separate sanitized, profile-root ledger.
Ordinary tools and actual MCP attempts are disjoint; discovery/result jobs do
not inflate counts. Failure rate uses only completed + failed results, with
denied, stopped, partial, unconfirmed and unknown work visible separately.
Arguments, command/output/error text and prompts are not retained in this
ledger. Previously deleted history is unavailable, not zero historical calls.
User plan saves retain their own explicit control history.

```bash
node bin/moguri.mjs telemetry operations --filters '{"family":"mcp","range":{"kind":"days","days":30}}'
node bin/moguri.mjs telemetry storage --profile PROFILE_ID
```

Native TUI supports `/dashboard operations JSON`, `/dashboard storage` and F7.
Desktop Dashboard has tool/server/actor groups, sanitized paged history and an
explicit **Refresh retained size** action. Retained size is current-profile
key-backed ciphertext, regardless of model/date/project filters. It counts
event payloads once, encrypted blob grants and encrypted scope keys, not all
SQLite bytes, repositories, caches or weights. Physical/freed disk and payload
integrity are not measured. See [the contract](architecture/operation-telemetry.md).

Exhaustion blocks the next chargeable call and retains a diagnostic artifact
without an extra model. It never claims a Git commit. Full kupo wind-down,
accepted-work validation/commit and exact billing integration remain separate.

### Structured questions and actual answers

The model's `ask_user` tool creates a real typed question with optional choices.
This is distinct from a heuristic question badge. Desktop shows the exact
question and offered answers; freeform input uses the existing saved composer,
whose primary **Answer question** action atomically consumes only its text.
Choosing an offered answer preserves unrelated draft text. In TUI, **F6**
opens actual choices; Shift+Cmd/Ctrl+Enter answers from saved composer text.
**Cmd/Ctrl+Enter always holds a queued prompt instead**, including while a
question is waiting. `/question` inspects the actual pending state; explicit
`/question answer ID REV TEXT` is also shared by all clients.

```bash
node bin/moguri.mjs question list
node bin/moguri.mjs question read QUESTION_ID
node bin/moguri.mjs question answer QUESTION_ID answer.txt --revision OBSERVED_REVISION
node bin/moguri.mjs question answer-draft QUESTION_ID --revision OBSERVED_REVISION
```

Only the actual user endpoint records actor `user`. A model question or answer
cannot grant tool/Git permission, change policy or become Core memory.
In **Guided** mode the current solver may recommend one offered choice with a
reason. Desktop's question card and TUI **F6** show its actual model source.
No choice is automatically accepted: you may choose another, queue text or
stop. Tool approvals show only current-step narration, never older advice.
The recommendation uses the original solver call and does not add a hidden
request. Retained documents keep model advice and actual user answers distinct.
Never supply credentials in an answer; use connection settings. A stale,
cancelled or interrupted question rejects input rather than attaching it to a
new turn. Stop/restart cancels the wait without replay or an invented answer.
**Settings / Retention / Structured answers** can opt out of automatic
independent answer artifacts; it defaults on. Answer event, artifact, optional
draft clearing and receipt are one transaction. Source actors and text remain
distinct after edits and session deletion. Automated decision-provider answers
are still unavailable, not mislabeled as human answers.

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
| F5 / F7 / F8 | Retained documents / profile usage / isolated profile picker and metadata |
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
A custom state directory is not itself a separate credential profile:
Default retains its legacy namespace. Create an explicit UUID profile for
account separation instead of pointing another service at the same database.

The service writes `state.sqlite`, WAL files, `connection.json`, `service.lock`
and a diagnostic `service.log`. Connection tokens and OAuth credentials are
never printed in logs or put in URLs. State is migrated transactionally;
upgrading must never require deleting it. Do not edit the database while the
service owns it.

Protocol/database version 18 preserves earlier state through transactional
migrations. Payloads and blob grants use independent profile/project/session
retention keys, plus independent artifact keys, wrapped by an OS-keychain master under
`dev.moguri.profile.default.retention`. Its stable account ID travels with the
database; move the complete state directory on the same keychain. Missing or
corrupt keys fail explicitly, never create a plaintext fallback or reset
history. Session deletion removes its content grants while preserving immutable
ciphertext audit rows and sanitized accounting. This is not SSD forensic
erasure or deletion of external backups. Keep the original keychain and state
when restoring a backup.

Global **Allowed environments** policy is available in desktop Connections or
`/policy all` and `/policy protected`. Requiring Sandbox/Remote blocks new work
until an allowed target is genuinely ready. Already-running Local turns may finish
under their recorded policy revision and are labeled **Local finishing**.
It is global across profiles, including unloaded/new ones. Per-profile
settings reset cannot widen it.

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
npm run spike:runtime
npm run spike:remote
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
`release/<package-version>/Moguri-darwin-arm64/Moguri.app`,
`release/Moguri-<package-version>-macos-arm64.dmg` and the corresponding ZIP. The app
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
For a trusted build whose source and archive identity you have verified,
see [macOS launch troubleshooting](../README.md#macos-launch-troubleshooting).
These are manual, app-specific steps, never global Gatekeeper disabling or
permission to bypass malware warnings.

<a id="development-029-owned-role-contracts"></a>
### Current qualified 0.29.0-alpha.1 checkpoint

Qualified **0.29.0-alpha.1 / protocol and database 35** extends the existing
privileged Node owned executor with optional exact router, canonical patch and
bounded critic response contracts. Each contracted role explicitly selects
earlier result indices; router explanations cannot enter its later context.
Known accounting, scope, result retention and actual worker acknowledgement
still gate every next preparation. Rejected/malformed advice stays retained
and charged, never approval or a silent retry.

New original input documents use version 2 with immutable `inputVersion:2`
metadata; version-1 bytes/context semantics are preserved. The additive
schema-35 marker has raw schema-34 rollback/reopen coverage. Restart an
incompatible running service explicitly and use the matching worker; never
delete local state to upgrade.

SDK `roleSequences.contract(ID, INDEX)`, compiled CLI
`moguri roles contract ID INDEX`, shared/native TUI `/roles contract ID INDEX`
and **Artifacts / Inspect role contract** read original declared checks.
`valid` is only a matching shape/binding with known actual accounting, not
code correctness, independent training, user acceptance or permission.
Pending, uncontracted, invalid and rejected data remain explicit. Reads do not
start or resume a model, widen a pool or refund usage.

Focused gates include strict types/build, actual four-role 168-token
execution and filtered contexts, charged rejection/no next preparation,
version-1 compatibility, compiled CLI/shared/native TUI, two hidden desktop
flows and eight actual controller SIGKILL phases without model/root replay.
The focused final gate passes **30/30 in 19.58 s**. Raw schema-34 marker
failure/reopen preserves actual version-1 role/candidate ciphertext and the
prior model-evidence marker; its successful marker measures **4.21 ms**.
All eight actual controller SIGKILL phases pass for versions 1 and 2, retaining
0/1/1/3 and 0/1/1/4 original calls respectively, zero restarted calls and no
root/model preparation. The focused recovery gate is **11/11 in 29.61 s**.
The integrated prerequisite spike passes **92/92 in 146.20 s**.

Complete source compatibility passes **822/822 in 790.45 s**, with no failed,
cancelled or skipped cases, strict type checks/declaration build and zero source
audit findings. All **55 hidden source desktop workflows pass in 2.2 min**,
and **55 exact packaged-app workflows in 2.1 min**. Compiled CLI, shared/native
TUI and the existing Artifacts panel inspect both valid and rejected contracts.
The bounded desktop/compact inspection is complete with no new layout defect.

Fresh and exact SDK archives independently approve/rebuild their installation,
audit with zero findings and type-check all four external entrypoints.
Their actual installed controller/worker runs four contracted roles with
**168 reported tokens**, exact selected contexts and no forwarded router
explanation. SDK/CLI/shared contract reads, canonical final-role origin,
separate staging/application, independent raw-copy/source deletion/reopen and
actual-user acceptance pass. The exact archive's actual worker also passes
**12/12 private transport/ledger probes in 3.30 s**.

The actual app's bundled Node/runtime/SDK/CLI separately derives retained
version-2 contracts, selected-context advice and canonical origin, then
preserves raw-copy/export5/reopen and separate actual-user application with
model preparation forbidden. This is native reader/publication qualification,
not a claim of live model-family quality. Existing default Copilot inspection
also passes in fresh/exact/bundled form (**447.27 / 403.10 / 507.37 ms**),
using generated memory-only keyring/catalogue interception and zero model calls.

The original failure-injection fixture tried to select encrypted payload
fields from the plaintext event header. That predicate never ran. It now
counts visible role-observation headers and fails the exact third atomic append;
the actual worker retains unknown paid ownership and prepares no next role
(**1.32 s**). No production fallback, relaxed validation or success claim
was used to bypass the failed test.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Moguri-0.29.0-alpha.1-macos-arm64.dmg` | 361297147 | `b8057d11d7c08ae75243e9c348a84b9af391c8046f2ce9710a396f39dbe6bf31` |
| `release/Moguri-0.29.0-alpha.1-macos-arm64.zip` | 283394809 | `ee9eae3a75f63c94065af47625928af531f02d0cb5e2d4c614e9399c35327e61` |
| `release/moguri-0.29.0-alpha.1.tgz` | 7069033 | `08b67d91c90ebf674a70e80dc160f5927cdeba78f8ff61f3500aef9993dd3788` |

App: `release/0.29.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Actual signature/icon/assets, bundled Node 26.12.0, ZIP integrity and
`hdiutil verify` pass. **Ad-hoc signed, not notarized.** The DMG exceeds chat's
64-MiB limit and stays local. Exact archives, including their pre-final-
qualification documentation, are frozen; final notes do not repack them.
All three 0.28 identities were rechecked unchanged.

One/four-console **Electron-only aggregates are 534.81 / 538.45 MiB** under
the **600-MiB Electron-shell** budget. Combined Electron/service/broker is
**875.02 / 879.17 MiB**, not under 600 MiB; generated user programs are separate.
Known experimental FFI, lazy Ghostty chunk, transitive deprecations and optional
newer `.icon` notices remain; the actual declared `.icns` is verified.

Public conditional pattern scheduling, family/quality qualification, finite
kupo, accepted-work wind-down and Max remain separate work. This is not the
completed first milestone; Sandbox stays paused. See
[the full contract](architecture/owned-role-contracts.md).

<a id="development-028-explicit-model-declarations"></a>
<a id="current-qualified-0280-alpha1-checkpoint"></a>
### Preserved qualified 0.28.0-alpha.1 checkpoint

Qualified **0.28.0-alpha.1 / protocol and database 34** adds explicit informational
Copilot catalogue inspection, not another model workflow. SDK, compiled CLI,
shared/native TUI and the existing desktop Model menu use one bounded,
profile-scoped read. It retains no automatic family cache or evidence event
and does not select a model, call inference, change the draft or widen policy.
Local/Remote endpoint families, aliases and synthetic lineage remain unknown.
Provider-declared metadata is not independent-family or quality qualification.

The additive migration marker preserves actual schema-33 role-origin
candidates, ciphertext, receipts, independent raw-input/result grants and
source-report deletion. Raw marker failure/reopen passes, measuring **2.44 ms**
in the focused gate. Existing state must be migrated, never deleted.

The focused gates pass **19/19 in 15.99 s**, compiled CLI and native TUI
inspection, strict type checks/declaration build and **two hidden desktop
workflows in 2.0 s**. The integrated prerequisite spike passes **82/82 in
96.98 s**. The actual built default Copilot adapter, keyring namespace,
SDK/CLI/shared read, exact digest, unknown claims and secret/foreign rejection
pass in **415.20 ms**, with five generated catalogue reads, zero model calls
and zero evidence events. Its private child replaces only the OS keyring
module with a generated memory backend and intercepts catalogue networking;
neither personal credentials nor external inference is used.

Complete source compatibility passes **810/810 in 728.61 s**, with no failed,
cancelled or skipped cases, strict type checks/declaration build and zero audit
findings. All **53 hidden source desktop workflows pass in 2.0 min**, and all
**53 from the exact packaged app in 2.0 min**.
Fresh temporary and exact delivered SDK archives independently approve/rebuild,
audit with zero findings, type-check all four external entrypoints and pass
the existing runtime/worker/retention/SSH/candidate contracts.
Their actual default Copilot adapters pass in **457.33 / 410.33 ms**, without a
substituted ProviderAdapter. The exact archive's actual worker separately
passes **12/12 private transport/ledger cases in 3.29 s**.
The actual app's bundled Node 26.12.0/runtime/SDK/CLI independently passes the
same explicit inspector in **408.48 ms**, alongside the prior native contracts.

Both bounded desktop/compact inspection rounds are complete. Long claims and
digests wrap inside the existing popover; unsupported/unknown/error and
held-response model changes preserve the ordinary composer draft.
The first native full desktop attempt passed 52/53 but raced its second held
prompt against the first send's still-pending UI consumption. The original
trace is retained. Its serial fixture now waits for the actual empty/saved
composer before entering another prompt; it does not suppress conflicts,
weaken draft protection or change production/archive bytes. The focused
two-workflow confirmation passes in **5.4 s**, followed by the full 53/53 gate.
Failed attempts are not counted as complete passes.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Moguri-0.28.0-alpha.1-macos-arm64.dmg` | 370860842 | `f20634aed05a03299052afc6133daf39b1ee255efef33b4a0832f3d5d8f30770` |
| `release/Moguri-0.28.0-alpha.1-macos-arm64.zip` | 283381783 | `231126600370d13bc0189848c3aad9d5b6257d877a5ab0a0342764d492127efb` |
| `release/moguri-0.28.0-alpha.1.tgz` | 7053769 | `4f45d9e40b64b83418f868be0cbca11376710c1113695aa4627aba413cc9fe4d` |

App: `release/0.28.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
The actual signature, declared icon/assets, bundled runtime, ZIP integrity
and `hdiutil verify` pass. **Ad-hoc signed, not notarized.** The DMG exceeds
chat's 64-MiB limit and remains local. These exact archive bytes, including
their pre-final-qualification documentation, are frozen; final notes do not
repack them. All three 0.27 archive identities were rechecked unchanged.

Actual one/four-console **Electron-only aggregates are 535.28 / 538.20 MiB**,
under the **600-MiB Electron-shell** budget. Combined Electron/service/broker
totals are **872.72 / 881.42 MiB**, not under 600 MiB; generated user programs
are separate. Known experimental FFI, lazy Ghostty chunk, transitive
`whatwg-encoding`/`node-domexception` and optional newer `.icon` notices remain;
the actual `.icns` is verified.

No live personal Copilot access, independent-family/quality calibration,
public compound workflow, finite kupo, Max or completed first milestone is
claimed. Frozen 0.27 and earlier deliveries remain preserved. Sandbox work
stays paused. See [the model-evidence contract](architecture/model-evidence.md).

<a id="development-027-canonical-final-role-proposals"></a>
<a id="current-qualified-0270-alpha1-checkpoint"></a>
### Preserved qualified 0.27.0-alpha.1 checkpoint

Qualified **0.27.0-alpha.1 / protocol and database 33** includes the actual
0.26 internal executor below and adds canonical final-role proposals.
[Final-role proposals](architecture/role-proposals.md) link an actual retained
final draft/revision/escalation to an exact separately reviewed candidate.
SDK `candidates.roleProposal(ID)`, CLI `candidate role-proposal ID`, and native
TUI `/candidate role-proposal ID` inspect original model/context/result evidence
without another model or live source lookup. Completed critic/router data and
partial/stopped work cannot become code proposers.

For CLI preview/stage, use `--role-sequence ID` to bind that exact origin into
the preview digest, then the normal `--confirm-write`. Shared preview/stage JSON
uses `roleSequenceId`. Do not mix it with a generation ID. Desktop's existing
Candidates panel exposes **Load a retained role proposal** when completed
proposers exist; loading only fills its local editor. Dirty summary/files/tasks
and changed scopes remain protected. Edits clear verified attribution.

Staging retains a separate copy of the original sequence/role input and raw
result, disclosed in its exact preview. Candidate history survives deletion
of the source report/session; exports use version 5. Source application remains
a separate fresh actual-user review. No implicit inference, validation,
acceptance, Git commit or public compound mode is added.

Complete source compatibility passes **793/793 in 704.73 s**, with no failed,
cancelled or skipped cases, both type checks/declaration build and zero audit
findings. All **51 hidden source desktop workflows pass in 1.9 min**, and all
**51 from the exact packaged app in 2.0 min**. The expanded compound spike
passes **69/69 in 86.42 s**. The targeted backend/state gate passes **21/21 in
25.62 s**, three compiled/shared/native TUI flows **12.27 s**, and the two new
desktop flows **7.9 s**. Raw schema-32 marker failure/reopen preserves actual
role inputs/results, ciphertext, keys, receipts and plans without fabricated
origin; its successful marker measures **3.85 ms**.

Fresh temporary and exact delivered SDK archives independently install with
explicit script approval/rebuild, zero vulnerabilities and all four strict
external entrypoint types. Actual installed controller/worker roles retain
126 reported tokens; SDK/CLI/shared canonical proposals, origin-bound review,
separate staging/application, source-role/session deletion, raw-copy/export5/
reopen and real-user acceptance pass without another model call.
The exact archive's actual worker also passes **12/12 private transport/ledger
probes in 3.76 s**. Generated role labels do not attest family or quality.

The actual app's bundled Node/runtime/SDK/CLI separately passes the canonical
proposal, preview/stage, source-role/session deletion, raw-copy/export5/reopen
and fresh user application with model preparation forbidden. Previous
generation, Local/SSH, OAuth/MCP, memory, console and speech-runtime contracts
remain qualified. The first native qualifier's source-only seeder selected
nonexistent `worker.mjs` under the namespaced TypeScript loader and correctly
became partial with zero requests. Its fixture now explicitly launches the
actual maintained `worker.ts` and requires completed roles; no app, provider,
policy or archive bytes were changed. The first desktop attempt completed its
functional assertions but closed before pending/dirty UI protection settled;
the fixture now observes a clean `beforeunload` before teardown without
disabling production protection. Failed runs are retained, not counted as passes.
Both bounded desktop/compact visual rounds and the mechanical UI scan are done.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Moguri-0.27.0-alpha.1-macos-arm64.dmg` | 366078564 | `c59d663874b00c0994b6112ce72cb595bf455b78a3cac15a12de5fc8d8e27a02` |
| `release/Moguri-0.27.0-alpha.1-macos-arm64.zip` | 283368331 | `6f5b7c962e8505358a941b9afa9ca700ae355d015a512c1290c9c386bead2fdb` |
| `release/moguri-0.27.0-alpha.1.tgz` | 7037548 | `649919e905a6757015c7adfd019b5afb0e990cdcc95c5ff22ec23ed2dd2a50c7` |

App: `release/0.27.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Exact ad-hoc signature, declared icon, bundled Node 26.12.0, native assets,
ZIP integrity and `hdiutil verify` pass. **Not notarized.** The DMG exceeds
chat's 64-MiB attachment limit and remains local. All three archive identities
are frozen, including their pre-final-qualification documentation. Final notes
do not repack them; the three 0.25 hashes were rechecked unchanged.

Actual one/four-console **Electron-only aggregates are 536.33 / 541.16 MiB**,
below the **600-MiB Electron-shell** budget. Combined Electron/service/broker
totals are **874.70 / 880.03 MiB**, not below 600 MiB; generated user programs
are separate. Known experimental FFI, transitive `whatwg-encoding`/
`node-domexception`, lazy Ghostty chunk and optional newer `.icon` notices
remain documented; the declared `.icns` is verified.

This is not completed public compound routing, real-family/quality calibration,
finite kupo, Max or a first milestone. Sandbox and live personal inference
remain off; qualified 0.26 source, frozen 0.25 and earlier deliveries are preserved.

### Qualified 0.26 internal owned-role source

That qualified source checkpoint used **0.26.0-alpha.1 / protocol and database 32**. The internal
[owned executor](architecture/role-sequences.md#internal-owned-execution-026-source)
now connects complete selected-source/policy/model/context snapshots and
planned holds to the actual control plane/worker. Every earlier possible
32-KiB result is budgeted at its maximum JSON escaping before any role starts;
actual prepared context, known accounting and current authority are rechecked
at each boundary. Earlier results remain explicitly untrusted data.

Original admission, actual start/result commits, deadline, stop/journal failure
and no-replay recovery use the existing state, artifact and budget authority.
The versioned input blob does not change protocol-32 event/database shapes.
Existing SDK/CLI/TUI/desktop role inspectors read those real records.
This is a privileged internal Node primitive, not public Cascade/Critique,
independent-family proof, quality/acceptance or public finite kupo.

The coupled source gate passes **38/38 in 95.50 s**, including four actual
controller SIGKILL phases in **9.18 s**, both type checks and declaration build.
Fresh temporary SDK installation, explicit script approval/rebuild, zero
consumer vulnerabilities and four external entrypoint types pass. Its actual
installed controller/worker performs three bounded roles, retains 126 reported
tokens and explicit untrusted contexts, preserves both checkouts/index/HEAD
and exposes SDK/CLI/shared reads. Source deletion/reopen and missing/deleted
original intent cannot replay another paid call. The actual installed worker's
12 private transport/ledger probes pass in **3.53 s**.
The extended compound spike passes **60/60 in 56.12 s**, now including actual
controller ownership/recovery and the shared positive-bound predicate.
Complete source compatibility passes **781/781 in 602.46 s**, with no failed,
cancelled or skipped cases. All **49 hidden source desktop workflows pass in
1.8 min**; source audit is zero. The first full attempt was stopped for the
extracted predicate's nullable-capacity type error; the explicit safe positive
bound and regression fix it. That interrupted attempt is not a passed gate.
No immutable 0.26 app/archive is claimed. Qualified 0.25 and earlier artifacts
stay frozen; live personal inference stays off and Sandbox stays paused.

<a id="current-qualified-0250-alpha1-checkpoint"></a>
### Preserved qualified 0.25.0-alpha.1 checkpoint

Qualified **0.25.0-alpha.1 / protocol and database 32** includes the complete
planned-capacity and acknowledged-worker prerequisites below.
[Role observations](architecture/role-sequences.md) retain exact original
scope/model/plan/command and each admitted input/raw result under their own
artifact grant. They survive source retention without becoming user answers,
normal solver context or permission. Unknown accounting cannot authorize a
later role; stop/restart/late results never replay work or resume a partial
sequence. The schema-31 migration is additive and preserves original bytes.

SDK `roleSequences.read(id, index?)`, CLI `roles ID [INDEX]`, native TUI
`/roles [ID [INDEX]]` and desktop Artifacts inspect the same metadata/raw data.
Generic editing changes metadata only; active reports cannot be archived or
deleted. Complete exports use version 4; earlier document formats stay intact.
No create/run/accept/refund client action or public compound workflow is
enabled. Real-family quality, finite kupo and accepted-work wind-down remain
separate gates. Sandbox remains paused.

Complete source compatibility passes **760/760 in 543.54 s**, with no failed,
cancelled or skipped cases, both type checks/build and zero source audit
findings. All **49 hidden source desktop workflows** and all **49 from the
exact packaged app** pass in **1.8 min** each. Actual controller SIGKILL covers
four retained-metadata phases in **1.66 s**, without resolving a checkout,
preparing a model or replaying a request. Raw schema-31 rollback preserves
genuine generation data, ciphertext, keys and receipts; the successful marker
measures **2.20 ms**. Both bounded desktop/compact visual rounds are complete.

Fresh temporary and exact delivered SDK archives independently install with
explicit script approval/rebuild, zero audit findings and all four strict
external entrypoint types. Their actual installed runtime/SDK/CLI/shared
commands read source-independent role inputs/results, export version 4,
reopen and preserve minimal deletion intent without inference. The exact
delivered archive's **actual installed worker** also passes **12/12 private
role/ledger probes in 3.64 s**. Three generated roles retain 126 reported tokens;
a failed result insert keeps the original unknown 99-token hold and dispatches
no next role. These are mechanical fixtures, not live quality measurements.

The actual bundled Node/runtime/SDK/CLI independently reads retained role data
after source deletion, exports version 4, reopens and rejects deleted original
intent without model preparation. Its existing generation, separately reviewed
stage/apply, Local/SSH, OAuth/MCP, memory, console and speech-runtime contracts
also pass. The first external source-fixture copy failed with `EEXIST` because
its no-overwrite destination was precreated; only the fixture seeder changed.
That failure remains evidence, not a pass or a reason to weaken copy safety.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Moguri-0.25.0-alpha.1-macos-arm64.dmg` | 360313873 | `3aef26cfd9dce09f12ebc6acd5ee48445a1eca966b02a1639e033cabf4edf981` |
| `release/Moguri-0.25.0-alpha.1-macos-arm64.zip` | 283344940 | `e1df4d52edf5566e117a971ba05217822c6d7a72e1bba88436ad2e5c13b85c87` |
| `release/moguri-0.25.0-alpha.1.tgz` | 7009257 | `28a94fc60e8a118f353c47272d4a2fc7a0b34e54e262a35c52611283e5205386` |

App: `release/0.25.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Exact ad-hoc signature, declared icon, bundled Node 26.12.0, native assets,
ZIP and DMG integrity pass. **Not notarized.** The DMG exceeds chat's 64-MiB
attachment limit and remains local. These archives are frozen; final
qualification notes do not repack them. The three 0.23 hashes were rechecked
unchanged.

Actual one/four-console **Electron-only aggregates are 535.09 / 539.22 MiB**,
below the **600-MiB Electron-shell** budget. Combined Electron/service/broker
totals are **876.38 / 881.55 MiB**; generated user programs are separate.
The combined totals are not below 600 MiB. Known experimental FFI, transitive
`whatwg-encoding`/`node-domexception`, lazy Ghostty chunk and optional newer
`.icon` notices remain; the declared `.icns` is verified.

### Earlier 0.24 complete planned capacity

That qualified source checkpoint used **0.24.0-alpha.1 / protocol and database 31**.
The internal [planned-capacity batch](architecture/budget-plans.md#complete-planned-batches)
calculates all same-turn closing-role holds together against current
session/profile/global limits and prices. Earlier prospective holds count
against later roles; a failed bound produces no prefix or fake model call.
Callers must append the complete set with their owning intent in one
transaction before yielding. Single-plan behavior uses this same calculation.

The reservation search also terminates safely at the maximum safe integer;
aggregate overflow is an explicit failure. The batch spike passes **26/26 in
1.13 s**, expanded accounting/profile/routing/generation/compaction checks
**135/135 in 137.08 s**, and both type checks/build. A fresh temporary SDK
independently installs/approves/rebuilds/audits with zero findings, passes four
strict external entrypoint types, and exercises exact finite batch
admission/release plus the prior Local/SSH/generation contracts. Five relevant
hidden desktop workflows pass in **10.9 s** and three native TUI flows in
**2.97 s**. This is a source prerequisite,
not compound scheduling, live-model quality, authorized checkpoint publication
or public finite kupo. No new protocol/event, permission or client write surface
is added. No immutable 0.24 archive/app is qualified; frozen 0.23 and older
deliveries remain unchanged. Sandbox stays paused.

The same source also adds a [private owned-role continuation prerequisite](architecture/owned-role-protocol.md).
One actual root-less read-only worker can continue only after an explicit
retained result, valid bounded reported usage and fresh host authorization.
Earlier output is not automatically inherited. Generated actual-worker and
budget probes cover three acknowledged roles, real SQLite receipt failure,
control loss and the existing 32-step bound. This does not expose
Cascade/Critique, choose model families or authorize a user action; fixed-model
generation remains a separately reviewed one-call operation.
The combined private transport/owned-worker spike passes **32/32 in 5.08 s**,
with both type checks/build. Actual successful three-role/ledger/reopen takes
**326.76 ms**; a real failed completion append takes **279.74 ms**, preserves
the first unknown **99-token** reservation and releases unused plans without
dispatching the next role. These are generated mechanics, not live quality.
Complete source compatibility passes **741/741 in 603.96 s**, both type
checks/build and zero audit findings; all **47 hidden source desktop workflows**
pass in **1.8 min**. Fresh temporary SDK installation/approval/rebuild, four
external entrypoint types and all earlier Local/SSH/generation/batch contracts
pass with zero consumer vulnerabilities. Its **actual installed worker**
passes all **12 private role/ledger probes in 3.84 s**, including real
three-role/retention/reopen and failed-receipt unknown-hold preservation without
another request. This was a source prerequisite, not an immutable 0.24 delivery
or public compound workflow. Its implementation is included in qualified 0.25
above; frozen 0.23 remains preserved below.

<a id="current-qualified-0230-alpha1-checkpoint"></a>
### Preserved qualified 0.23.0-alpha.1 checkpoint

Qualified **0.23.0-alpha.1 / protocol and database 31** includes the planned
budget foundation and owned proposal generation.
[Owned proposal generation](architecture/candidate-generations.md) adds one
explicitly cost-reviewed, tool-less fixed-model Local draft through the existing
worker/ledger. Desktop **Candidates / Generate a separate model proposal** uses
original selected source, a separate clean managed staging worktree and current
model/authority. Review the cost and independent input/result retention first.
Generation never stages, applies or commits.

Read actual usage/outcome and exact generated bytes, then **Load generated
proposal for staging review**. The draft gets focus; staging still requires
its exact review, followed by a separate source application review. Editing the
generated summary/files clears verified model attribution. Generic artifact
editing changes metadata only. An imported proposal does not acquire authorship
or acceptance from the user's staging action.

SDK `candidates.generatePreview`, `generate`, `generation`, `waitGeneration`
and `stopGeneration` share CLI/native TUI/desktop state. CLI
`candidate generate-preview INPUT.json --session SOURCE --workspace STAGE`,
then `generate INPUT.json` with `--digest` and `--confirm-cost`, performs the
same reviewed call. `generated|generation-wait|generation-stop ID` inspect or
stop it. Shared `/candidate generate-preview|generate` uses exact structured
JSON with `confirm-cost`; see [SDK examples](sdk.md#owned-fixed-model-proposal-generation).

Source snapshots/input/output and version-3 report history survive source
retention. Explicit report deletion prevents its original command from making
another paid request, even after receipt loss. Stop reaches actual owned
inference on journal failure; unknown telemetry remains held. Wait cancellation
does not stop the model. Actual SIGKILL covers before admission, in flight,
before result retention and retained output without replay. Schema-30 marker
failure preserves raw ciphertext/keys/receipts and planned capacity.

The complete source gate passes **720/720 in 519.93 s**, both type checks/build
and zero audit findings. All **47 hidden source desktop workflows** pass in
**1.7 min** and all **47 from the exact packaged app** in **1.8 min**.
The focused generation/state/client gate passes **23/23 in 33.17 s**, including
actual four-phase controller SIGKILL in **5.25 s** and the measured schema marker
in **0.82 ms** after exact rollback. Both bounded desktop/compact visual rounds
are complete.

Fresh temporary and exact delivered SDK archives independently install with
explicit script approval/rebuild, zero audit findings and all four strict
external entrypoint types. Actual installed SDK/CLI/shared generation uses the
real owned worker/draft ledger, immutable model provenance and version-3
history, then separately stages/applies and recovers missing-receipt intent
without another request. The actual bundled Node/service/worker/SDK/CLI passes
the same generation path and the preserved Local/SSH/runtime contracts.

The first full source attempt had **719/720** due to an existing SSH
connectivity fixture's generated-directory `ENOTEMPTY` cleanup. Its isolated
seven cases and the complete rerun pass without changing production code or
policy. Failed cleanup is not counted as qualification.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Moguri-0.23.0-alpha.1-macos-arm64.dmg` | 372440230 | `84de54f7bce0f1a5e44b54f98803ab3460268aea7c942dc9ea51d86df06ea11f` |
| `release/Moguri-0.23.0-alpha.1-macos-arm64.zip` | 283321470 | `914748e9f19a0b3ef6a4ce83922e360388c79f4e59a297d4902cdac4e9fe6485` |
| `release/moguri-0.23.0-alpha.1.tgz` | 6977966 | `30a9307a1d094b5717a72867d4e9903d911be9ad6f423e3871d03152256d6785` |

App: `release/0.23.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
The exact ad-hoc signature, icon, Ghostty/speech assets, bundled Node 26.12.0,
archive and DMG integrity pass. **Not notarized.** The DMG exceeds chat's
64-MiB attachment limit and remains local. All qualified archives are frozen;
the three 0.22 hashes were rechecked unchanged.

Actual one/four-console **Electron-only aggregates are 534.84 / 538.66 MiB**,
below the **600-MiB Electron-shell** acceptance budget. Combined
Electron/service/broker totals are **900.48 / 904.58 MiB**; generated user
programs are separate. Never describe the combined totals as under 600 MiB.
Known experimental FFI, transitive `whatwg-encoding`/`node-domexception`,
645.50-kB lazy Ghostty chunk and optional newer `.icon` notices remain
documented; the declared `.icns` is verified.

This is not completed compound routing, real-model quality calibration,
finite kupo or Remote generation. Sandbox remains paused; immutable 0.22 and
older deliveries are unchanged.

### Earlier 0.23 planned-budget foundation

That qualified source checkpoint used **0.23.0-alpha.1 / protocol and database 30**.
[Planned wind-down holds](architecture/budget-plans.md) now live in the same
independent profile budget stream without pretending a future reservation is
a model call. Complete bounds/captured prices, one atomic actual-start transfer,
root-wide capacity and exact ownership remain enforced. Only canonically
undispatched held plans release automatically after their owner ends; unknown
or consumed calls cannot be refunded.

SDK `budgets.plans`, CLI `budget plans`, TUI `/dashboard plans JSON` and desktop
Dashboard inspect the same retained states. Model calls/prices/bills stay
separate, source deletion preserves history, and stale UI scope replies cannot
populate a new filter. Creation/transfer remain internal prerequisites for the
owned compound scheduler, not a new user/plugin permission or finite route.

The targeted legacy/accounting gate passes **70/70 in 3.53 s**. The actual
controller SIGKILL case takes **656.10 ms**, releases only its unused 30-token
plan and preserves the real **9,965-token** interrupted-model hold with exactly
one request and unchanged source. The generated schema-29-to-30 marker takes
**1.10 ms** after exact failure rollback without ciphertext/key/receipt rewrites.
Compiled CLI/shared commands and native TUI inspection pass without inference.
Two hidden desktop scope/price/release flows pass in **1.9 s**; both bounded
desktop/compact inspection rounds are complete.

The complete source gate passes **698/698 in 481.26 s**, both type checks/build
and all **45 hidden source desktop flows in 1.6 min**. A fresh temporary packed
protocol-30 SDK passes explicit installation approval/rebuild, zero consumer
audit findings, all four external entrypoint types, real installed planned-hold
SDK/CLI/shared queries and source-deletion/restart release without model calls,
alongside the earlier Local/SSH/runtime contracts. Source audit is zero.
That source checkpoint did not qualify an immutable 0.23 app/archive; frozen
0.22 and older artifacts were unchanged. Production compound ownership, actual checkpoint-policy integration
and real-model quality remain gated. Sandbox stays paused.

### Earlier 0.23 reserved-checkpoint prerequisite

That prerequisite used **0.23.0-alpha.1**, protocol/database **29**.
The [private checkpoint contract](architecture/winddown-primitives.md) reuses
the existing ledger and shared temporary-index Git helper. Reserved dispatch
cannot spend capacity twice, bypass a newly stricter cap, trust an old session,
change canonical model/input/output or replay a recorded start. An explicitly
reviewed new local ref can preserve accepted files without staging unrelated
work or moving source HEAD/index. Failed/denied/partial publication is not
success or rollback.

The generated gate passes **42/42 in 5.01 s**, final expanded source checks
**93/93 in 16.25 s**, both type checks/build and six hidden source desktop
flows in **12.1 s**. Actual bounded router/critic/checkpoint calls retain
**126 reported tokens within 279 captured tokens**, including original-start
restart protection and an actual separately authorized accepted-work commit.
Model output cannot grant that Git approval; the authorizer is an explicit
fixture, not a public delegated-policy implementation.

A temporary packed SDK passes fresh approved/rebuilt installation, four
external entrypoint types and existing actual Local/SSH/runtime workflows;
source/consumer audits are zero. That prerequisite did not qualify a new 0.23 archive/app.
Production compound integration, durable unused-envelope/wind-down outcomes,
real-family quality and public finite kupo remain blocked. Sandbox stays
paused; immutable 0.22 and older artifacts are unchanged.

<a id="current-qualified-0220-alpha1-checkpoint"></a>

### Preserved qualified 0.22.0-alpha.1 checkpoint

Qualified **0.22.0-alpha.1**, protocol/database **29**, adds the manual Local
reviewed-candidate workflow.
The [Local candidate contract](architecture/candidate-workflows.md) is wired
through SDK, compiled CLI, shared commands, actual native TUI and desktop.
Choose an explicitly Local agent-mode source and a separate clean owned
worktree at its exact repository/HEAD. No model is selected/called for this
workflow and no branch, commit or push is created implicitly.

Load or explicitly add proposed files in desktop Candidates, review staging,
then stage exact bytes separately. A staged proposal is **not accepted**.
Review source application afresh before applying; changed bases, staged text,
mode/env, permissions or roots reject stale authority. Immutable proposal/job/
result history survives origin-session retention. A new explicit compatible
Local session can own a later acceptance without relabeling imported content
as user-written instructions.

CLI:

```bash
moguri candidate preview PATCH.json --session SOURCE --workspace STAGE
moguri candidate stage PATCH.json --session SOURCE --workspace STAGE --digest PREVIEW_SHA --confirm-write
moguri candidate apply-preview CANDIDATE_ID --session SOURCE
moguri candidate apply CANDIDATE_ID --session SOURCE --revision N --digest REVIEW_SHA --confirm-write
moguri candidate read CANDIDATE_ID
moguri candidate stop CANDIDATE_ID
```

For example, a new leaf file can use:

```json
{"kind":"patch","summary":"Review a new text file","edits":[{"path":"example.txt","baseDigest":"absent","text":"Proposed new file.\n"}]}
```

Use the exact source digest when replacing an existing file. At most 20 portable distinct
text paths, 32-KiB patch JSON and a 64-KiB document are supported. Parent
directories must already exist. No deletion/rename/mode change, validation
program, quality claim or Remote/Sandbox fallback. `/candidate` exposes the
same two explicit reviews in the TUI; `/candidates` lists retained outcomes or
opens the desktop panel.

Actual raw index/HEAD/unrelated files stay preserved. Owned stop records its
request before abort; no-effect work is cancelled, possible/confirmed effects
remain partial. Partial roots stay quarantined for explicit existing recovery,
not rollback/retry. Actual service SIGKILL covers before-effects, after-first-
file and completed retention with original-command replay protection.
The focused SDK/file/lease/migration/recovery/client gate passes **94/94 in
43.04 s**; genuine five-mode SIGKILL passes in **7.19 s**, native TUI in
**1.75 s**, and compiled CLI/shared commands in **3.66 s**. The additional
failed-stop-intent append regression passes in **668.72 ms**: the failure is
visible, abort still reaches owned work, and no false successful request or
filesystem effect is recorded. The extended native TUI metadata-only artifact
editor passes in **1.97 s**, preserving immutable proposal bytes.

The complete source gate passes **656/656 cases in 462.93 s**, both type
checks/build, zero source audit findings and **43/43 hidden source desktop
workflows in 1.6 min**. All **43 workflows also pass on the exact packaged
app in 1.6 min**, including separate candidate staging/application, preserved
index, immutable document metadata editing and stale read-only scope/draft
protection. The initial negative-flow cleanup was corrected to explicitly
discard the unsaved draft and observe the actual close guard release, not
force-close the window or count its earlier timeout as a pass.

The exact delivered SDK installs into an independent consumer with explicit
script approval/rebuild, zero audit findings and all four external entrypoint
types. Installed CLI stage, separate SDK application, version-2 history and
original-command replay after restart preserve raw index/HEAD without a model,
alongside the prior Local/SSH/model/profile/retention contracts.
The actual app's bundled Node/service/SDK and CLI independently pass the same
candidate flow and a deleted-receipt replay that preserves a later user edit,
plus prior console, memory, MCP, private GitHub, model and speech-runtime checks.

One/four Local consoles share one owner. Actual Electron aggregates measure
**534.64 / 537.81 MiB**; combined Electron/service/broker measures
**898.47 / 905.58 MiB**, with generated user programs separately reported.
The original **600-MiB budget is Electron-only**, not a whole-runtime claim.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.22.0-alpha.1-macos-arm64.dmg` | 372506384 | `c53ed48f69b2efd1dd63b45370043da7495eca9d28a1a45a47b8c128c4aa63ef` |
| `Moguri-0.22.0-alpha.1-macos-arm64.zip` | 283270610 | `4f8793f5e34a24dae53336f41c18a38f482145fa4f7721d851943cd5bfd6863e` |
| `moguri-0.22.0-alpha.1.tgz` | 6918304 | `5e0d76adc5c452ef0cb8fb48d9181ca2cdbb93946473d4e6fec1bab47df27905` |

App: `release/0.22.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Actual signature/icon/Ghostty/speech assets, ZIP and DMG integrity pass.
These immutable development artifacts are **ad-hoc signed, not notarized**,
and will not be repacked. The DMG exceeds chat's 64-MiB limit and stays local.
Known FFI, transitive deprecation, Ghostty chunk-size and optional `.icon`
notices remain documented; the declared actual `.icns` is verified.
Earlier qualified archives are unchanged.

No personal authorization, paid inference, microphone, weights, Sandbox
probe, tag, release or merge occurred. Sandbox remains paused. Public compound
model roles, finite kupo wind-down/authorized checkpoint commits, Max, complete
detached/reparented containment and gated later work remain unfinished.

### Earlier 0.22 prerequisites

The [generated compound transport proof](architecture/compound-routing-primitives.md)
passes **20/20 in 454.56 ms**, alongside both type checks/build, using actual
bounded pi-ai calls to generated loopback endpoints. Cascade permits one
configured escalation and Critique one independent critic/bounded revision.
Costs/unknowns, identities, data locality and failed receipts remain explicit.
These are unaccepted tool-less proposals, not coding-workspace/application,
finite-budget wind-down, calibrated quality or a public routing feature.
This proof did not qualify an immutable SDK/app. Sandbox pause is unchanged.
The [private candidate-file gate](architecture/candidate-primitives.md)
additionally passes **39/39 in 10.48 s**, with **77/77 directly coupled checks
in 23.78 s** and a fresh approved/audited packed-SDK compatibility install.
Actual generated compound proposals stage once in a real managed worktree;
exact review, raw source-index preservation, changed bases/authority and
partial outcomes are explicit. At that private checkpoint public records/
clients/recovery were still absent; model-role integration and wind-down
remain unqualified after the manual user workflow above.
The additive candidate foundation binds records/job lifecycle to existing
independent artifact keys, validates original roots/intents/effects and marks
interrupted metadata partial without filesystem replay. It is not a public
stage/apply API at that checkpoint, an integrated scheduler or a qualified new desktop.
The internal protocol-28 foundation passes **631/631 local cases in 494.00 s**,
all **41 hidden source desktop workflows in 1.5 min**, and the temporary
packed SDK's approved/rebuilt four-entrypoint/actual Local-SSH compatibility
gate. Source/consumer audits are zero. This is source/internal-state
qualification, not a delivered 0.22 archive or actual packaged desktop.
The shared file tool additionally propagates owned stop through preparation
and reports a post-rename stop/durability failure as partial. Its actual worker
retains the result, quarantines the root and cannot launch a third model leg.
The related **60-case** Local/SSH/routing gate, **four** hidden desktop/SSH
flows, build/types and temporary packed-SDK install/audit pass; no additional
schema, implicit approval or containment guarantee is introduced.

### Preserved qualified 0.21.0-alpha.1 checkpoint

Qualified **0.21.0-alpha.1 / protocol/database 27** implements session-bound
Local/Remote lexical indexing, actual-host source validation, atomic typed
cache publication and original-command no-replay jobs. SDK/CLI/native TUI/
desktop, direct model search, optional context and exact reviewed MCP memory
tools share its profile/peer/root. Indexing/injection stay off by default.

The [memory contract](architecture/remote-repository-memory.md) records
bounded source proof (**18 cases, 3,466.06 ms**), schema/compatibility
(**54/54, 8,104.12 ms**), cache/carrier (**32/32, 4,065.00 ms**) and the
public backend/CLI/crash/schema gate (**19/19, 13,988.01 ms**).
Actual service SIGKILL covers mid-stream, pre-publication and completed
indexes, including a missing original receipt without recapture. Source/env/
root/policy changes, malformed arguments, failed intent/outcome retention,
private profiles and post-publication partial outcomes are explicit.
The source desktop and Local compatibility flows pass **5/5 in 13.3 s**;
both bounded desktop/compact visual rounds are complete.

The complete corrected source gate passes **590/590 in 430.34 s**, both type
checks/build, zero-vulnerability source audit and **41/41 hidden source
desktop workflows in 1.5 min**. The first full run's only failure was an old
Local-only error wording assertion; it now checks the unchanged typed
`memory_disabled` denial rather than constraining cross-env guidance.
The exact SDK independently passes a fresh explicitly approved/rebuilt install,
zero-vulnerability consumer audit and all four external entrypoint types.
Installed CLI/TUI/session memory, actual pinned-SSH index/search, original
command/no new probe on replay, restart and exact approved MCP retrieval pass
without a model call or Local cache substitution, alongside all prior gates.

All **41 workflows pass on the exact packaged app in 1.6 min**. Actual
bundled Node independently verifies Local-cache exclusion, Remote indexing/
CLI/original intent/restart/MCP plus prior GitHub/plan/console/model behavior.
One/four Local consoles share one owner: Electron aggregate is **534.73 /
538.86 MiB**, with combined Electron/service/broker **882.81 / 887.42 MiB**.
Generated user programs are separate. The original **600-MiB budget applies
only to Electron**, not the whole runtime.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.21.0-alpha.1-macos-arm64.dmg` | 371413916 | `c8eff9c3ec7da8562867c5ddc37322f7079a33f5bba56d56eb0a79538a00c608` |
| `Moguri-0.21.0-alpha.1-macos-arm64.zip` | 283219245 | `6b4b124260b15e9d780c24f005e98c8e023ebc89bed69cf3d42071ecaaa735b2` |
| `moguri-0.21.0-alpha.1.tgz` | 6857014 | `bc878b993a01a85ab840a091bf4f578b11914f4c808ced1287d2300dfac62f5f` |

App: `release/0.21.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Actual signature/icon/Ghostty/speech assets and DMG integrity pass.
Artifacts are **ad-hoc signed, not notarized** and will not be repacked.
The DMG exceeds chat's 64-MiB limit and stays local. Earlier qualified
archives remain unchanged. Known FFI, transitive deprecation, Ghostty size
and optional newer `.icon` notices remain visible; script approval completed
before rebuild, and the actual `.icns` is checked.

At that checkpoint no personal authorization, paid inference, microphone,
weights, Sandbox probe, tag, release or merge occurred. Sandbox stayed paused;
compound routing/candidate application/wind-down/Max, complete containment and
gated later work remained unfinished. Memory stays lexical/snapshot-based,
not the deferred Sky/Terra/Glacier roadmap.

### Preserved qualified 0.20.0-alpha.1 checkpoint

**0.20.0-alpha.1 / protocol/database 26** is independently qualified.
The [Remote metadata slice](architecture/remote-github-metadata.md) adds
explicit repository-only GETs through the pinned SSH host's existing `gh`
account. Shared SDK/CLI/native TUI/desktop review shows its actual
host/key/root; retained observations keep original peer/build provenance.
No selected model, provider credential, controller account or public fallback
is needed. Interrupted reads retain partial outcomes and original command
receipts without replay. Migration preserves schema-25 ciphertext/keys/
receipts and old Local/public observations.

The full source gate passes **558/558 in 394.59 s**, both type checks/build,
zero-vulnerability source audit and **39/39 hidden desktop workflows in
1.4 min**. Real service SIGKILL covers pending/completed reads, cancellation,
profile isolation and no-replay original receipts. The isolated compiled
console broker/bridge remain byte-identical to qualified 0.19.

The exact SDK passes a fresh approved/rebuilt install, zero-vulnerability
consumer audit, all four external entrypoint types and actual installed
pinned-SSH account/home/cwd/CLI/TUI/provenance/restart without another request
or controller fallback. Actual installed Local/Remote console and prior
model/role/compaction/plan/MCP/profile/budget gates pass unchanged.

All **39 workflows pass on the exact packaged desktop in 1.5 min**.
Actual bundled Node independently verifies private Remote `gh` origin,
whitelisted facts, CLI/restart retention, prior Remote MCP/plan and
original-owner console restart/stop. One/four Local consoles share one owner:
Electron aggregates are **538.28 / 540.48 MiB**; combined
Electron/service/broker totals are **885.45 / 894.83 MiB**. Generated user
programs are separate. The original **600-MiB budget is Electron-only**.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.20.0-alpha.1-macos-arm64.dmg` | 378746339 | `2fd25ffa3705a54196491d7f8a9496c0594356f9940f1fd35968acbb14912780` |
| `Moguri-0.20.0-alpha.1-macos-arm64.zip` | 283182031 | `560c4c4154225753e1d639ca3809b7f024666345dfccaff4e105bd6d76dc1ebb` |
| `moguri-0.20.0-alpha.1.tgz` | 6815659 | `dc8c705e022a695522d29f5b53090cdb9d75327cb761e7098179de23eccb0cb0` |

App: `release/0.20.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Ad-hoc signature, actual icon/Ghostty/speech assets and DMG integrity pass.
Artifacts are **not notarized** and will not be repacked. The DMG exceeds
chat's 64-MiB limit and stays local. Earlier qualified archives are unchanged.
Existing FFI, transitive `whatwg-encoding`/`node-domexception` deprecation,
Ghostty size and optional newer `.icon` notices remain visible. Explicit file
script approval completed before rebuild; actual `.icns` is verified.

No personal authorization, paid inference, microphone, model weights,
Sandbox probe, tag, release or merge occurred. Sandbox stays paused.
At that checkpoint, Remote repository memory, compound routing/wind-down/Max
and gated later work remained unfinished.

### Preserved qualified 0.19.0-alpha.1 checkpoint

**0.19.0-alpha.1 / protocol/database 25** qualifies the complete
[Remote console slice](architecture/remote-user-consoles.md) through the
service/SDK/CLI/actual OpenTUI/Ghostty. The
[private Remote console prerequisite](architecture/remote-console-primitives.md)
reuses the pinned SSH connector and independent authenticated broker.
Immutable pre-resource owner/binding intent precedes admission; migration
preserves schema-24 state and existing Local owners. The public slice covers
actual host I/O, restart/SIGKILL/lost-input ACKs, missing-key restoration,
profile/alias isolation, concurrent aggregate capacity, cancellation and
partial cleanup retry. All clients share the captured peer/root and
generation-safe ephemeral input, without a selected model or new core-agent
probe for already authenticated recovery.

The corrected full source gate passes **548/548 in 416.23 s**, both type
checks/build, source audit with zero vulnerabilities and **37/37 hidden
desktop workflows in 1.3 min**. The first full run's optional-helper probe
regression is preserved in the architecture history, not hidden by a padded
fixture or Local fallback. The exact SDK archive independently passes a
fresh approved/rebuilt install, zero-vulnerability audit, all four external
entrypoint types and actual installed Local/Remote owner/input/restart/
CLI/TUI/no-replay/private-cleanup checks.

All **37 workflows pass on the exact packaged app in 1.4 min**. Actual
bundled Node/service/worker qualification covers provider-free SSH consoles,
same owner/PID across restart, ordinary stop, prior Remote MCP/plan/model/
compaction/accounting and Local consoles. The Remote cohort is stopped before
the separate Local memory cohort; Remote PIDs/endpoints are never interpreted
as Local.

One/four Local consoles share one owner and retain their original PIDs.
Electron aggregates measure **533.81 / 535.63 MiB**; combined
Electron/service/broker totals are **875.70 / 879.94 MiB**. Generated user
programs are separately reported. The original **600-MiB budget is
Electron-only**, not the whole runtime.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.19.0-alpha.1-macos-arm64.dmg` | 377315532 | `86be87c43043647a40a5634340e6b608a0c92281e31615a4f12c8b2748bf26a4` |
| `Moguri-0.19.0-alpha.1-macos-arm64.zip` | 283176621 | `03fca74e2456b955edbb2b3894cd37fa3c9ebb7578a6bb00d728c90d37071efe` |
| `moguri-0.19.0-alpha.1.tgz` | 6804076 | `ba242c3f03e1c4322518019fb3c497829781fa2923e1d46e3450b07c5f0c5409` |

App: `release/0.19.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.
Strict ad-hoc signature, actual mascot/Ghostty/speech assets and DMG integrity
pass. The DMG exceeds chat's 64-MiB limit and remains local. Artifacts are
**not notarized** and will not be repacked. Prior 0.18/0.17 archives remain
unchanged. Existing OpenTUI experimental FFI, transitive
`whatwg-encoding`/`node-domexception` deprecations, Ghostty size and optional
newer `.icon` notices remain visible; explicit file-package script approval
was completed and the actual `.icns` is verified.

No personal authorization, paid inference, microphone, model weights, Sandbox
probe, tag, release or merge occurred. At that checkpoint, Remote repository
memory/authenticated GitHub CLI metadata, compound routing/wind-down/Max and
gated later work remained unfinished.

### Preserved qualified 0.18.0-alpha.2 checkpoint

**0.18.0-alpha.2 / protocol/database 24** adds reviewed Remote MCP discovery
and exact model/external calls, through the same SDK, owned SSH worker,
CLI/native TUI and factory-dark desktop. Grants bind the actual pinned
peer/resource; authenticated access forwarding requires separate explicit
consent and never includes refresh credentials. Cancellation, lost receipts,
real service SIGKILL/restart and late reconciliation retain actual scope,
actor and partial effects without another connector or false successful turn.

The common protocol-24 implementation passes **519/519 source checks in
330.19 s** and **35/35 source desktop workflows in 1.2 min**. Alpha.2 changes
only the version and obsolete Remote SSH capability guidance, with matching
documentation; its three affected source desktop flows pass in **11.4 s**.
All **35 workflows pass on the exact alpha.2 packaged app in 1.2 min**.
Both type checks, the exact independently installed/rebuilt SDK's four
entrypoints, actual installed Runtime/CLI/TUI/SSH MCP and source/consumer
audits pass. Both audits report zero vulnerabilities.

Actual bundled Node/service/worker qualification includes approved OAuth/MCP,
reviewed no-model pinned SSH plan and MCP operations, independent artifacts,
model/compaction/attribution and restart-reattached user consoles.
One/four consoles use one owner and reattach their original PIDs.
Measured Electron aggregates are **534.81 / 536.77 MiB**; combined
Electron/service/broker totals are **844.66 / 847.16 MiB**. Generated user
programs are separately reported. The 600-MiB budget applies to Electron,
not the whole application.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.18.0-alpha.2-macos-arm64.dmg` | 360405333 | `c05001a7e5507bf9ad2ffeb048fe2ca79e6fa4ee1f31d57781c94c3ecd4bc549` |
| `Moguri-0.18.0-alpha.2-macos-arm64.zip` | 283135509 | `aa49bda8b900a0d09e13de2fc1e0b300d1f9768798a7b6b84908df1a018b24d8` |
| `moguri-0.18.0-alpha.2.tgz` | 6761691 | `17c75569130856e3f01b7bb24c108e8bea6079fd8c2fd5e6209a5918edc92eed` |

App: `release/0.18.0-alpha.2/Moguri-darwin-arm64/Moguri.app`.
Strict ad-hoc signature, native icon/Ghostty/speech assets and actual DMG
integrity pass. The DMG exceeds chat's 64-MiB limit and remains local.
Artifacts are **not notarized**. No real authorization, paid inference,
microphone, model weights, Sandbox probe, tag, release or merge occurred.
Alpha.2, alpha.1 and older qualified archives remain immutable.
At that checkpoint, the wider Remote console/memory/GitHub-CLI, compound
routing/wind-down/Max and gated later work remained unfinished.

### Protocol-24 Remote MCP qualification history

The 0.18 source adds Remote MCP through the existing authority and worker. The
[Remote MCP prerequisite](architecture/remote-mcp-primitives.md) uses the real
pinned SSH supervisor and shared owned connector with generated stdio/HTTP
servers. Ten SSH cases and three exact process-admission/cleanup cases pass.
The private proof did not enable Remote MCP or change durable schemas.
The subsequent [protocol-24 grant/state foundations](architecture/remote-mcp.md)
now add deny-by-default peer/resource grants, immutable operation metadata and
migration rollback. Seven foundation checks and type checks pass; no model,
server or credential is accessed by a grant preview.
Scoped catalog discovery also passes four real-SSH checks, including
access-only generated OAuth, stale authority and actual stdio-server cleanup.
The current source also runs exact approved model-owned and provider-free
external MCP calls in the actual SSH worker, never the Local gateway.
Original intents/results have encrypted session retention, explicit
stop/partial outcomes and no-replay service-crash reconciliation, including
after grant revocation. Shared CLI/TUI commands and the
factory-dark desktop now expose exact review, separate forwarding consent,
revocation and retained-operation inspection through the SDK. Actual OpenTUI
and two hidden desktop workflows pass. No real credential was forwarded.
Sandbox work remains paused.

The complete 0.18 source gate passes **519/519 checks in 330.19 s** and
**35/35 hidden desktop workflows in 1.2 min**, including actual OpenTUI and
the new Remote MCP workflows. Both type checks and source dependency audit
pass; the audit reports zero vulnerabilities. These source results do not
qualify an uninstalled SDK archive or untested packaged app. The existing
OpenTUI experimental FFI warning and Ghostty chunk-size advisory remain;
neither is suppressed or treated as a failed cancellation.

### Superseded immutable 0.18.0-alpha.1 artifacts

The exact SDK was independently installed with explicit script approval,
rebuilt, audited and typechecked through all four entrypoints. Actual installed
Runtime/CLI/TUI includes a no-model SSH MCP call, scoped grant/catalog/result/
cleanup and revocation, plus the prior model/compaction/profile/console gates.
Source and consumer audits both report zero vulnerabilities.
The actual packaged application passes all **35 hidden desktop workflows in
1.3 min**, actual bundled Node/worker/SSH MCP, signatures/assets and DMG
integrity. One/four consoles use one owner and reattach their original PIDs.
Electron aggregate is **540.48 / 542.42 MiB**; combined
Electron/service/broker is **852.13 / 854.39 MiB**, with generated user programs
separate. The original 600-MiB limit applies to Electron only.

A subsequent cross-surface copy check found the Remote SSH settings still
said executable MCP was unavailable, despite the actual verified
implementation and new gateway UI. That stale capability sentence is corrected
in **0.18.0-alpha.2**, with an explicit native regression assertion. Alpha.1
artifacts remain byte-identical, not rebuilt/repacked to hide that discrepancy.
Alpha.2 has the same protocol, schema and runtime behavior. Its independent
exact-artifact qualification is recorded above.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.18.0-alpha.1-macos-arm64.dmg` | 367178471 | `86c41ba8fc4b5070927e73e742c9531688a1b15f947ada5ba60c3c725d210d7a` |
| `Moguri-0.18.0-alpha.1-macos-arm64.zip` | 283135493 | `0ffa0c6eae787b922988e0faa03e410fc30d6ed0a026ba9d272f2bc6edc56aa7` |
| `moguri-0.18.0-alpha.1.tgz` | 6761098 | `ab64d68bf21edb070f439c89b3baa750e3c5c289d36ab0b9d50f50026ec89a91` |

Existing experimental FFI, transitive `whatwg-encoding`/`node-domexception`
deprecations, Ghostty chunk-size and optional newer `.icon` notices remain
visible. Explicit file-package script approval was completed before rebuild;
the audit is clean. The checked `.icns` is present. Artifacts are ad-hoc signed,
not notarized; no tag/release/merge, personal authorization, paid inference,
microphone, model weights or Sandbox probe occurred.

### Preserved qualified 0.17 checkpoint

The **0.17.0-alpha.1 / protocol-23** source adds authenticated restart-
reattachable Local user consoles and retryable private cleanup, through the
same SDK, CLI/native TUI and Ghostty. Generated native integration exercises
actual control-plane restart and preserved PTY identity, stale-input discard
and closed-console reopening without replacement.

The import-isolated slice passed **477 source checks in 342.30 s** and the
actual bundled Node/service/owner qualification. Its native shell measured
**529.30 MiB with one console, 531.06 MiB with four**, below the original
600-MiB Electron-only budget; combined Electron/service/broker totals were
**806.06 / 808.81 MiB**, with generated user programs reported separately.
All four consoles used one broker and reattached their original PIDs.
All **33 source desktop workflows and 33 actual packaged workflows pass in
1.1 min each**. A fresh installed SDK also passes all four external types,
explicit native script approval, an independent zero-advisory audit and actual
installed owner/CLI/TUI restart without replay. The **exact delivered SDK
archive**, not a repack, independently passed that same approved install,
rebuild, audit, external type/runtime and installed SSH/model/terminal suite.

An initial
native run exposed a harness race: the second held shortcut arrived before the
first UI submission gate released, although its server queue entry existed.
The harness now waits for the actual held-submit button, not server state;
the rejected trace remains retained. The initial package
verifier incorrectly applied the Electron-only 600-MiB budget to the entire
runtime: its retained measurement was 554.08 MiB Electron, 277.33 MiB service/
broker and 831.41 MiB combined. Shell and total figures are now reported
separately against the original scope, not silently lowered or renamed.
The idle Ghostty check also exposed an actual zero-byte WASM write error:
empty output pages are now skipped without dropping a real page or weakening
input error handling. Initial native failure traces are retained.

These are development artifacts, ad-hoc signed rather than notarized. The
actual bundled Node/service/broker, one/four consoles, same-process restart,
SDK/CLI/TUI, model/MCP/OAuth/SSH plan and native runtime are qualified with
generated fixtures only. The DMG checksum is valid; no personal account,
microphone, weights, Sandbox probe, tag, release or merge was used.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.17.0-alpha.1-macos-arm64.dmg` | 372190367 | `6d99a2fb913b4d39192cb10a29f2f3cafe616f0ee25ad65aa38591f87c7030b8` |
| `Moguri-0.17.0-alpha.1-macos-arm64.zip` | 283084315 | `05268bcf364acd02b408c9c2693acb39fc8ada785edb351e477d88b3ca12e568` |
| `moguri-0.17.0-alpha.1.tgz` | 6705929 | `fe26be2af5e0f52ba4c86bcd1ca3a821c2c7b19e8adf6a550396072d19c7a8b6` |

App: `release/0.17.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. The DMG exceeds
chat's 64-MiB limit and remains local. Qualified 0.16 and older artifacts are
preserved unchanged; do not rebuild or repack them.

### Previous qualified 0.16 checkpoint

The **0.16.0-alpha.1 / protocol-22** checkpoint adds explicit root-bound GitHub
repository metadata and immutable attribution/filtering across SDK, CLI/native
TUI and desktop. Preview reads Git only; confirmed refresh performs one bounded
lookup with displayed public or explicit Local CLI access. Source root,
policy/revision, response identity and actual Git origin are rechecked.
Remote origin comes from the pinned machine; Remote authenticated CLI remains
unavailable, never host-local fallback.

Future router/solver/side/subagent/compaction calls and external Local MCP
admissions capture verified snapshots. Changed/missing origins and read failures
stay unassigned. Old names/visibility/licenses/charges are not rewritten by
refresh, clear, deletion or restart. Public plus recognized OSI license is an
explicit metadata category, not legal compliance; absent/null license evidence
and excluded unassigned history have separate coverage.

All **448 local checks pass in 327.23 s**, including actual roles/SSH, both
cancellation boundaries, retention/marker failure, restart without lookup replay,
profile isolation and configured/unconfigured admission races. All **31**
hidden source-desktop workflows pass in **1.1 min**, as reported by the runner.
All **31** workflows against the actual packaged app also pass in **1.1 min**.
The native TUI's reviewed preview/explicit refresh/state passes without a model.
Source types/build and audit pass, with zero vulnerabilities. Both bounded
desktop/compact visual rounds are complete.

The first new desktop fixture observed the previous completed turn immediately
after a second UI Send click. It now waits for the actual second provider
request before terminal/accounting assertions. Original trace/context remain
retained; no product guard was relaxed.

The pinned CC0-1.0 SPDX metadata dependency was qualified before the feature.
Model admission never performs a new GitHub lookup or sends metadata to a
model. The exact SDK archive independently passes a fresh script-approved
install/rebuild/audit, all four external type entrypoints and actual installed
repository preview/refresh/state, CLI/shared TUI and attributed MCP projections.
Its snapshot survives source session/project deletion without leaking into a
different profile. Existing routing, compaction, caps, SSH, artifacts and shared
foundation gates also pass. Source/consumer audits have zero vulnerabilities.

The actual bundled Node service and owned worker perform a real generated
repository-attributed model call through the packaged classifier/dataset,
using only an explicitly selected generated CLI account. Its exact repo/org/
public-plus-OSI filter resolves the actual reservation, not a renderer proxy.
Existing packaged MCP, OAuth, compaction, model-free pinned SSH save, PTY,
branding/Ghostty and weightless speech checks pass. Strict ad-hoc signature/
assets and real DMG integrity pass.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.16.0-alpha.1-macos-arm64.dmg` | 365633637 | `377f80909a965cb293d72576e5248e1bc64d34de47e2ed368e463f010e6310da` |
| `Moguri-0.16.0-alpha.1-macos-arm64.zip` | 283041309 | `6211ecfbbbbfb9fdbdab7f128dcc968afad223a118ce249c44ca0578e4ef4334` |
| `moguri-0.16.0-alpha.1.tgz` | 6667728 | `5af88d82abb19d2006391ebedc153b34b66236162de9f6575f549d6158277681` |

App: `release/0.16.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. The DMG exceeds
chat's 64 MiB limit and stays local. Artifacts are ad-hoc signed, not
notarized; no release, tag or merge was created. No repack was used to
incorporate these final qualification notes; older archives remain unchanged.
No personal account, paid inference, model weights, microphone or SendBox probe
was used. Known FFI/deprecation, explicit file-package approval, optional
`.icon` and lazy Ghostty notices remain visible. Remote authenticated CLI,
consoles/MCP/memory, compound routing/authorized wind-down and decision authority
remain incomplete; this is not milestone acceptance. Sandbox stays paused.
See [the exact repository contract](architecture/repository-telemetry.md).

### Historical 0.15 checkpoint

The **0.15.0-alpha.1 / protocol-21** checkpoint adds independently retained,
sanitized tool/MCP outcome metrics and current-profile key-backed ciphertext
measurements. SDK, CLI/native TUI and desktop share the service projections.
Declined approval, ordinary tools, actual model/external MCP actors and
retained-result jobs stay distinct. The known-result failure rate never hides
partial, stopped, unconfirmed or unknown outcomes as successes. Request/start
provenance, missing timing and previously deleted history remain explicit.

All **425 local checks pass in 310.09 s**. All **30** hidden source-desktop
workflows pass in **1.0 min**, and all **30** against the actual packaged app
pass in **1.1 min**, as reported by the runner. Focused coverage also
exercises actual SSH tools, exclusion of user Remote plan operations, native
TUI queries, cross-profile byte/outcome isolation and held stale query replies.
Source types/build pass and audit reports zero vulnerabilities. No sandbox
probe, personal account, microphone, model weights or paid inference was used.

The first added stale-query gate did not observe the RPC through Playwright's
network routing and failed before holding a response. Its original trace and
context are retained separately. The corrected owned-service response hold
passes, preserving the newer filter's real results after the old reply settles.
Both bounded desktop/compact visual rounds are complete.

Migration 21 preserves previous ciphertext, grants and receipts. It records a
compatibility marker and appends retained-only metrics/coverage, never recovered
private contents. Marker/derived-append failures, unexplained missing keys and
invalid profile scope fail explicitly without inventing success or zero bytes.
Storage is not a payload-integrity audit or physical disk/reclamation measure.

The actual bundled Node service passes the exact approved MCP outcome/actor
and retained-size gates, alongside real packaged OAuth, provider-free pinned
SSH plan saves, compaction, PTY, branding/Ghostty and weightless speech checks.
Strict ad-hoc signature/runtime/assets and real DMG integrity pass.
The **exact SDK archive** independently passes a fresh script-approved
install/rebuild/audit, four external type entrypoints and actual installed
CLI/SDK telemetry. A dedicated idle cohort performs an approved MCP call
without model dispatch; its sanitized outcome remains available after source
session/project deletion and stays invisible in another profile.

The first consumer extension incorrectly reused an already-deleted source;
moving its call earlier then hit that original cohort's legitimate non-idle
guard. Both failed harness logs are preserved. A dedicated idle source fixes
the qualification, not the product: no session guard was weakened and no
archive was rebuilt. Source/consumer audits report zero vulnerabilities.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.15.0-alpha.1-macos-arm64.dmg` | 353780484 | `31dfdef43dce4505172897630779e751402b6247e2002a0111bde5a88e20b253` |
| `Moguri-0.15.0-alpha.1-macos-arm64.zip` | 279056588 | `2001424f15e978374e4add4377c8c519d32212d794ab603ec906731b93544e72` |
| `moguri-0.15.0-alpha.1.tgz` | 6635119 | `0a85fce62f72700cf99343840cfe75fa0e2b7eea8358caf9e418cb7faa9b1e36` |

App: `release/0.15.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. The DMG exceeds
chat's 64 MiB limit and remains local. Artifacts are ad-hoc signed, not
notarized. No tag, release or merge was created; older qualified archives
are unchanged. Known FFI/deprecation, explicit file-package approval, optional
`.icon` and lazy 640-kB Ghostty notices remain visible. This is not milestone
acceptance: repository/org/visibility attribution, remote consoles/extensions,
compound routing, reserved wind-down/authorized commits and decision authority
remain separate. Sandbox work remains paused.

### Historical 0.14 checkpoint

The **0.14.0-alpha.1 / protocol-20** checkpoint adds exact user-requested Remote
plan saves across SDK, CLI, native TUI and desktop. The reviewed plan binding
pins profile/session, path, peer/root/build and current policy even when two
files are absent. One typed owned filesystem operation initializes no provider,
calls no model, consumes no prompt draft and never uses a Local fallback.
Local callers retain their existing three-argument API.

The complete source passes **402 local checks in 317.05 s**. All **29** hidden
source-desktop workflows and all **29** against the actual packaged app pass
in **1.1 min each** as reported by the runner. The actual TUI pending editor/
exact-stop flow passes in **1,535.71 ms**, and reviewed edit/save/retained
inspection in **1,452.70 ms**, without a Local opener or model.

Real control-plane SIGKILL before authorization and before result receipt
preserves exact intent and cannot replay a write. Root/mode/folder policy races,
profile/target-alias writer ownership, failed acknowledgements/retention,
duplicate commands, exact 128-KiB UTF-8 results and whitespace are covered.
Stopped post-write work stays partial, actual bytes/independent Remote-boundary
snapshots remain inspectable, and late receipts never promote the original
partial turn to success. Known no-effect failures are distinct from uncertain
filesystem work.

The package verifier starts the **actual bundled Node service and pinned SSH
worker**, saves a reviewed plan without a model, verifies exact Remote bytes/
independent artifact and rejects a Local-file fallback. Existing actual
compaction, OAuth, MCP, PTY, branding/Ghostty and weightless speech gates pass.
The **exact delivered SDK archive** independently passes a fresh script-reviewed
install/rebuild/audit, all four external type entrypoints, actual installed CLI/
SDK Remote saves with reviewed binding, retained artifacts and exact stop/
scope guards. Synthetic test vaults never use personal keychain credentials.
Source/consumer audits report zero vulnerabilities.

The first focused desktop run was **3/4**: long path/fingerprint metadata really
overflowed at compact width. Bounded wrapping/progressive disclosure fixes it;
all four targeted flows and both full source/package runs above pass. Its
original trace/context/screenshot remain retained separately. Held settled RPCs
cannot overwrite a dirty editor with another root's plan. No personal login,
microphone, model weights, paid inference or SendBox probe was used.

Migration 20 preserves old ciphertexts, scoped receipts, keys/grants and ledger
charges. Retained protocol-16/17/18/19 SSH metadata is inspectable only, not
resumable. Remote consoles, executable MCP/repository memory, compound routing,
decision authority and other first-release gaps remain separate. Sandbox stays
paused; this is not complete containment or milestone acceptance.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.14.0-alpha.1-macos-arm64.dmg` | 355392968 | `9bb6ab62b80a2b1567ae3b50d8d907c0d55ea08a01aeb0e8aaa36040052268c7` |
| `Moguri-0.14.0-alpha.1-macos-arm64.zip` | 279032703 | `df36cc68635492d502af8fd19a45559e527eaf14dcc75dd9d19fd32e37110c75` |
| `moguri-0.14.0-alpha.1.tgz` | 6606378 | `e45de8334107fb56a74531c855c2832a49ebe0a999f758a8d4d809dc377ea1b7` |

App: `release/0.14.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. Clean restore,
types/build, strict ad-hoc signature/runtime/assets and real DMG integrity pass.
The DMG exceeds chat's 64 MiB limit and remains local. Development artifacts
are not notarized; no tag, GitHub release or merge was created. Earlier qualified
archives stay unchanged. Known FFI/deprecation, explicit file-package approval,
optional `.icon` and lazy Ghostty notices remain visible.

### Historical 0.13 checkpoint

The **0.13.0-alpha.1 / protocol-19** checkpoint adds reviewed text-context
compaction through one shared SDK and actual Local/pinned-SSH worker. Explicit
preview, metered generation, content/history review, apply/discard, exact owned
stop and original-context restore never rewrite original history, consume the
draft, invent a user answer or reset charges. Synthetic kupo needs an explicit
real compactor; images and automatic compaction remain unsupported.

The corrected source passes **366 local checks in 279.27 s**, all **26** hidden
source-desktop workflows in **52.6 s**, and all **26** against the actual
packaged app in **52.8 s**. Native TUI drives the real preview/generate/read/
apply/restore path in **1,105.20 ms**. Separate real pinned-SSH coverage runs the
same model role without Local fallback. The package verifier also starts the
actual bundled Node service/worker, not a source-service proxy: three generated
source turns plus one compactor call retain its actual 42-token report and
require explicit review/apply/restore. Existing OAuth, PTY, mascot/Ghostty and
weightless speech checks pass.

The **exact delivered SDK archive** independently passes fresh script-reviewed
install/rebuild/audit, all four external entrypoint types, actual installed CLI
preview/generate/read/apply/restore, scoped compaction charges and shipped SSH
workspace reads. Source/consumer audits report zero vulnerabilities. Clean
restore, types/build, strict ad-hoc signature/runtime/assets and real DMG
integrity pass. No personal authorization, microphone, model weights, paid
inference or SendBox probe was used.

The first source run was **364/365**, not a pass: stable history timestamps
exposed a historical-usage anchor lowering fresh request sizing. A focused
48-versus-2,723-token regression now preserves the maintained fresh estimate
floor and matching output headroom without changing actual usage. Complete
corrected source/package results above qualify the artifacts. Earlier consumer
harness failures also remain recorded: it now awaits authoritative operation
state and checks the structured foreign-profile error, not stale peer state or
message aliases. Exact compaction stops cannot cancel newer solver work.

Migration 19 preserves old ciphertexts, scoped receipts, grants and ledger
charges; restart leaves interrupted proposals partial without replay or
application. Original-context restore and source deletion never refund calls.
Legacy protocol-16/17/18 SSH receipts are inspectable only. Sandbox work remains
paused, and the wider first-release/remaining-gap acceptance is not complete.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.13.0-alpha.1-macos-arm64.dmg` | 359965723 | `bb8a60f10415ad83287e620ffae0fa2efde0c4830868bd0c347c5d4dcd36a21f` |
| `Moguri-0.13.0-alpha.1-macos-arm64.zip` | 279005083 | `55e06c9af9c73a453371e9009efdafc865f430e50d8f3ca9aee64e2c02f9bdd4` |
| `moguri-0.13.0-alpha.1.tgz` | 6574857 | `9ffc9c1eaa8cb9b88fee5a93ddfd11de1d70c85de0f33a32797bdb036da493fa` |

App: `release/0.13.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. The DMG exceeds
chat's 64 MiB limit and remains local. Artifacts are ad-hoc signed and not
notarized; no tag, GitHub release or merge was created. Earlier qualified
artifacts stay unchanged. Known FFI/deprecation, explicit file-package approval,
optional `.icon` and lazy Ghostty notices remain visible.

### Historical 0.12 checkpoint

The **0.12.0-alpha.1 / protocol-18** checkpoint adds inclusive UTC date presets,
year/custom ranges, day/week/month buckets, captured rate history, retained
call/owning-turn views and observed stream/category metadata through the shared
SDK/CLI/TUI/desktop. Filters never change cumulative cap admission. Missing
cache details or single-event timing stay unknown; delivery rates are not GPU
generation or productivity. Compaction, broader repository metadata, routed
wind-down and remaining non-sandbox gaps are not implied complete.

The corrected source passes **341 local checks in 261.37 s**, all **24** hidden
source-desktop workflows in **48.6 s**, and all **24** against the actual
packaged app in **49.1 s**. Native TUI exercises dated aggregate/call queries
without another model request. The exact delivered SDK independently passes
fresh install/script review/rebuild/audit, four external entrypoint types,
actual installed CLI dated/call views and shipped SSH worker reads. Source and
consumer audits report zero vulnerabilities. Clean restore, types/build,
strict ad-hoc signature/runtime/assets and real DMG integrity pass.

The first packaged run failed one of 22 flows: closing the model popover
released its pending-settings gate while the request was still in flight.
A deterministic held-response check reproduced the stale-control/draft race.
The parent composer now owns the request count through actual settlement;
errors remain visible after menu closure. Two new controlled checks cover both
success and refusal, preserved drafts and no extra inference. The original
failed run, trace, hashes and unqualified artifacts remain retained separately;
they are not relabeled as successful. Fresh complete source/package runs above
qualify the corrected artifacts.

Migration 18 preserves old ciphertexts, receipts, keys and charges while
appending only provable ledger metadata. Missing old timings stay unknown;
source deletion/restart and failed migration do not refund or replay work.
Legacy protocol-16/17 receipts remain inspectable, not resumable.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.12.0-alpha.1-macos-arm64.dmg` | 361150562 | `4f26b62445311e4fb4a2410657bef9620cd1f69c202420398203b7ef016de5f0` |
| `Moguri-0.12.0-alpha.1-macos-arm64.zip` | 278975325 | `6532b74c00f16cc2db18d8932f3ab0fed46cd091bb09ea20c31b00ad95addc7c` |
| `moguri-0.12.0-alpha.1.tgz` | 6541827 | `c4c05b3eb5adfcfe69f90504c0b32a6c6917807cfe356cd973ae3f5d84039c02` |

App: `release/0.12.0-alpha.1/Moguri-darwin-arm64/Moguri.app`. The DMG exceeds
chat's 64 MiB limit and remains local. These are ad-hoc-signed, unnotarized
development artifacts; no tag, release or merge was created. Earlier qualified
artifacts are unchanged. Known FFI/deprecation, explicit file-package approval,
optional `.icon` and lazy Ghostty notices remain visible. Sandbox work stays
paused, with no SendBox probe or stronger containment claim.

### Historical 0.11 checkpoint

The **0.11.0-alpha.1 / protocol-17** checkpoint adds read-only Remote Files,
Changes and Plan through the pinned SSH worker and existing SDK. The actual
TUI displays remote file/diff/plan text without invoking a Local file opener;
the desktop uses the same APIs and follows explicit root remapping. Direct
Remote plan saves, embedded terminals, executable MCP and repository-memory
transport remain unavailable. This is not the completed first milestone.

The complete local suite passes **326 checks in 201.84 s**. All **21** hidden
source-desktop workflows pass in **45.8 s**, and all **21** pass again against
the actual packaged app in **46.5 s**. The exact delivered SDK archive passes
independent install/script approval/rebuild/audit, all four entrypoint types
and actual installed-worker SSH files/Git/plan reads, alongside the existing
profiles, routing, budgets, artifacts, MCP and Local PTY checks. Source and
consumer audits report zero vulnerabilities; clean restore, types and build
pass. Known FFI/deprecation, explicit file-package approval, optional `.icon`
and lazy Ghostty size notices remain visible.

Migration 17 preserves schema-16 multi-profile ciphertexts, receipts, keys and
retained grants. Injected migration failure leaves old state unchanged. New
workspace queries reject incompatible workers; authenticated protocol-16
receipts remain inspectable without attachment or continuation. Generated real
SSH checks cover protected/denied paths, exact byte limits, FIFOs, hooks/filters,
index preservation, Git root redirection, stale binding races, abort and
shutdown. No personal authorization, paid inference or Sandbox probe is used.

Strict ad-hoc signature/runtime/assets checks and real DMG integrity pass.
These are development artifacts, not notarized production releases. The app is
`release/0.11.0-alpha.1/Moguri-darwin-arm64/Moguri.app`.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.11.0-alpha.1-macos-arm64.dmg` | 361498864 | `26655022d509773c98eca723a9450c73e4cb740382e166e28a52d64d105454e5` |
| `Moguri-0.11.0-alpha.1-macos-arm64.zip` | 278959509 | `8d868c23508bc36b7d767fd7cbcfb85f07f2ef8ae1b0a73961e88865dab12c1d` |
| `moguri-0.11.0-alpha.1.tgz` | 6521142 | `bb3fff492b6ef2a1d115a1805378e805568a0b5925402182c67ceb836e6f218c` |

The DMG exceeds chat's 64 MiB attachment limit and remains local. Earlier
artifacts are unchanged. No release, tag or merge was created. Sandbox work is
paused at the user's request and remains unavailable; this release neither
modifies SendBox nor claims detached-descendant containment.

### Historical 0.10 checkpoint

The **0.10.0-alpha.1 / protocol-16** Single-routing artifacts pass strict
ad-hoc signature/runtime checks and real DMG integrity verification,
**291 full local checks** in **188.15 s**, and all **21 hidden workflows
against the actual packaged app** in **46.4 s**. The exact delivered SDK archive
passes independent install/script approval/rebuild/audit, all four entrypoint
types and real installed SDK/CLI staged router/solver exchanges. Source and
consumer audits report zero vulnerabilities. Clean locked restore, build and
type checks pass.

The same owned Local/SSH worker now stages a bounded, tool-less classifier and
one explicitly approved solver. Actual roles, model IDs, owning-session charges
and receipts remain independent from the synthetic selection. Generated tests
cover missing/over-limit telemetry, failed atomic commitment, revoked
permissions, concurrent pool/task/cap changes, exact Remote-only file effects,
model-created children, cancellation and schema-15 profile-preserving recovery.
Known loopback-only pools work with hosted consent off; configured provider
labels cannot bypass network/unknown destination consent and redirects are
blocked. The actual Copilot adapter exposes maintained output limits, not only
fixture metadata. A first full run caught two obsolete current-version-15
migration assertions; they were corrected without changing legacy input
versions, and the complete 291-check run then passed.

Both clients expose opt-in policy, supported model selection and real
provenance. Successful router notices are informational, not misleading `stop`
warnings; compact transcript resizing keeps a followed solver answer visible.
This is not measured confidence calibration, a live paid Copilot/Jev test or
the completed first milestone. Compound workflows, finite routed budgets and
reserved wind-down/authorized checkpoint commits remain blocked.

Native Sandbox is still unavailable. At that packaging checkpoint, the separately user-authenticated R5
candidate now qualifies startup on the historical protocol-10 image: the
coordinated SendBox investigation reports 11/11 new authenticated starts,
10 positive hardened/thread/workspace workloads, and removed owned VMs.
This was not qualification of that protocol-16 payload or SDK adapter.
Real API networking had failed CONNECT 502/403; an unapproved Copilot CNAME
was observed but was not proven to be the sole cause or implicitly added.
No parent VM probe, production trust/runtime change, personal authorization,
microphone recording or model-weight download was used for this checkpoint.
Known upstream FFI/deprecation, file-package approval, optional `.icon` and lazy
Ghostty size notices remain visible. CI remains main-push-only; no feature or
manual run is dispatched.

| Development artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Moguri-0.10.0-alpha.1-macos-arm64.dmg` | 354271350 | `e7e743e34c8731227b585519c7900b5be61c76758144b4bac31e3602c7d1230a` |
| `Moguri-0.10.0-alpha.1-macos-arm64.zip` | 278945413 | `a0904a683d99422d7864895de7c0a3b95ba816e0542116da85017c07a9fb02a4` |
| `moguri-0.10.0-alpha.1.tgz` | 6493632 | `a767f67756c3ac4546039e977f568b4d077f88f94240330bd33ba563dd9a2814` |

The DMG exceeds the chat's 64 MiB attachment limit and stays at its local release
path; the exact SDK archive can be delivered as an attachment. Earlier qualified
artifacts are not overwritten or relabeled as protocol 16.

### Native runtime prerequisites after 0.10

The official [SendBox 0.2.1 release](https://github.com/mbianchidev/sendbox/releases/tag/v0.2.1)
has now passed checksum/build-provenance verification and user-authenticated
system installation. `/usr/local/bin/sendbox --version` reports `sendbox 0.2.1`;
the root-owned matching guest is
`/usr/local/share/sendbox/guest/aarch64/bundle`, with its adjacent
`release-public.key`. Download and verify the official release before any
administrator installation; Moguri never installs it or authenticates for you.
Do not use an unverified/user-writable guest bundle or disable system security.

The historical protocol-16 worker, exact approvals, large image and conservative
model/command/control-loss cancellation now pass genuine released-guest
primitives. Cold DNS/networking still fails in a fresh guest. Installing 0.2.1
therefore does **not** enable Sandbox, lifecycle scripts or real native model
execution in this alpha. The private staging/evidence prerequisites pass
314 local checks and 21 hidden source-desktop workflows; the existing delivered
0.10 artifacts above are not rebuilt or relabeled by this follow-up.
See [runtime pins](architecture/runtime-foundation.md#released-sendbox-021)
and [native measurements and limitations](architecture/execution-transports.md#released-021-qualification).
Further sandbox work is paused at the user's request pending the separate
SendBox fix; protocol-17 SSH work does not requalify or enable Sandbox.

### Historical 0.9.1 checkpoint

The unchanged **0.9.1-alpha.1 / protocol-15** ownership-fix artifacts pass strict
signature/runtime/DMG verification, **262 full local checks** and all
**20 hidden workflows against the actual packaged app** (**45.2 s**).
The exact delivered SDK archive independently passes a fresh approved
install/rebuild/audit and compiled-model/profile/Guided/platform exchanges,
with zero audit findings.

This fixes a reproduced cross-profile Remote writer race: Local mappings or
profile/target aliases cannot admit two writers to the same captured pinned
SSH peer/canonical root. Existing execution data keeps failed-root quarantine
through unloaded-profile restart. Pending read-only changes retain the writer;
actual acknowledgement releases it and wakes another profile. Distinct SSH
roots stay independent. No new durable schema, account backend, native VM,
live decision provider or SSH containment guarantee is introduced.

| Development artifact | SHA-256 |
| --- | --- |
| `Moguri-0.9.1-alpha.1-macos-arm64.dmg` | `3641ec0977ad7a7d21940d7fb816990936aa52ca38308acf5194dd843e83de03` |
| `Moguri-0.9.1-alpha.1-macos-arm64.zip` | `0478421518611807c81212e8eca74fbf73b2336db00b8b672746871c53f15e23` |
| `moguri-0.9.1-alpha.1.tgz` | `7c7de003cd5d92128b2ff8765845cb3e08243b9d75f94cde752c0be44773fa70` |

### Historical 0.9 checkpoint

The unchanged **0.9.0-alpha.1 / protocol-15** development artifacts pass strict
ad-hoc signature/runtime verification, **247 full local checks** and all
**20 hidden workflows against the actual packaged app** (**45.3 s**).
The exact delivered SDK archive passes a fresh approved install/rebuild/audit
and real compiled-worker Guided recommendation, different actual user answer,
retained source actors and no additional recommendation request, alongside
the existing scoped profile/budget/platform exchange. Audits report zero
vulnerabilities; the actual DMG passes `hdiutil verify`.

This adds provenance-bound Guided offered-choice and tool advice to the
qualified 0.8 profile foundation. Actual user decisions and hard policy still
win. Jev/System One, Autopilot Max, kupo and native Sandbox are not enabled.
The generated System One prototype separately proves bounded wire/failure
handling, including rejection of finite-token admission because the documented
API has no output-token-limit field. No real decision provider was called.
The app is ad-hoc signed only, not notarized or the completed first milestone.
The later shared-SSH-root ownership defect affects 0.8/0.9 profile mappings;
prefer 0.9.1 or newer when profiles can target the same Remote workspace.

| Development artifact | SHA-256 |
| --- | --- |
| `Moguri-0.9.0-alpha.1-macos-arm64.dmg` | `d74f49dfb45eaabeb8b9d3c139b85cb5f1624bdf5d3c4d47ff72f457c394624b` |
| `Moguri-0.9.0-alpha.1-macos-arm64.zip` | `94750f8601ab664ccbd557bddcfeb916a0c8bda60b86e2dc3c129f53520b0501` |
| `moguri-0.9.0-alpha.1.tgz` | `55d73c9f7b4f47188ef4a8a871487036c397394dc2e4232c2ac87c420da033c5` |

### Historical 0.8 checkpoint

The unchanged **0.8.0-alpha.1 / protocol-14** development artifacts pass strict
ad-hoc signature/runtime verification, **229 full local checks** and all
**19 hidden workflows against the actual packaged app** (**44.0 s**).
These add real immutable profiles, private account/data/editors, cross-profile
root/policy/budget authority and native preview/notification scope to the
qualified artifact/question/budget foundation.

`hdiutil verify` passes for the actual DMG. The exact delivered SDK archive
passes a fresh approved external install, all four entrypoint types, actual
installed CLI selection, compiled model workers in two profiles, separate
MCP credentials/ledgers and shared global defaults/caps/env restriction.
Source/consumer audits report zero vulnerabilities. Test output, local state
and agent metadata are excluded from the app bundle.
Sandbox/R5, routed decisions/wind-down and the remaining roadmap are not
qualified by this package. No GitHub release, tag or merge was created.

| Development artifact | SHA-256 |
| --- | --- |
| `Moguri-0.8.0-alpha.1-macos-arm64.dmg` | `a23cbd0a2db5291e803fe71e07f165cda5da1e34daa2f4981036291c3d474832` |
| `Moguri-0.8.0-alpha.1-macos-arm64.zip` | `4071d8b5d1ff496b6b134804c69477f890d63d680dc095c6a16350a05ac755dd` |
| `moguri-0.8.0-alpha.1.tgz` | `61dc9c21caebadd8fb014bf5bc77ccbedfee5bef450a348b14e9b425934422e5` |

### Historical 0.7 checkpoint

The unchanged **0.7.0-alpha.1 / protocol-13** development artifacts passed strict
ad-hoc signature/runtime verification and all **17 hidden packaged Electron
flows** (**37.8 s**), including real structured answers, managed roots,
repository artifact copies/local commits and explicit estimated budgets.
`hdiutil verify` passes for the actual DMG. The exact delivered SDK archive
passes its fresh approved external install, all entrypoint types and generated
worker/model/budget exchange, with zero audit findings.
Test output, local state and agent metadata are excluded from the app bundle.
Sandbox/R5, routed decisions/wind-down, profile isolation and the remaining
roadmap were not qualified by that package. Use 0.8 or newer for actual isolated profiles.

| Development artifact | SHA-256 |
| --- | --- |
| `Moguri-0.7.0-alpha.1-macos-arm64.dmg` | `a9ebb7b43c3ac644560cd302de92f812213191183135908333f2a174fe0152e4` |
| `Moguri-0.7.0-alpha.1-macos-arm64.zip` | `3cb6f540907953462310becba5d37080cfd5018a3d9bf538a5b279185c8e3c87` |
| `moguri-0.7.0-alpha.1.tgz` | `3075cf15b8331f6e5fa7d7cd3554c8bdd7cf2c3d802381622048b6b4d8137376` |

Package verification also exercises the compiled service's project-free
metachat/configuration API, generated OAuth and an exactly approved HTTP MCP
tool call with credential redaction. It injects a generated vault/issuer rather
than opening authorization or touching a personal account.

Remaining blockers and unsupported capabilities are listed in
[Phase 0](architecture/phase-zero.md) and the canonical implementation spec.
CI is configured only for pushes to `main`. PRs/feature branches do not trigger
it; development verification runs locally, without manual CI dispatch.

`node scripts/decision-spike.mjs` runs the separate generated
[System One prerequisite](architecture/decision-primitives.md). It does not
configure an account, send a paid request, enable automatic approval or
qualify Jev for finite-token admission.
