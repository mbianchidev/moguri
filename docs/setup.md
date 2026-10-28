# Setup and usage

Current service/SDK/desktop protocol is **69**. Upgrades preserve existing
history, identities and budget holds, with exact provenance-based rekeying for
candidate-owned generation output described below. Restart matching
clients and service; never delete state to upgrade.

## Saved turn and usage information

The model button opens **Model**, **Effort**, and **Context window** rows with
side menus. Kupo is in the model list; its adjacent information button explains
unavailability without enabling it or substituting another model. Only the
selected model's qualified options are offered, and changes save through the
shared session controls. Escape/Left returns from a submenu; Right opens it.
`/thinking high` and `/effort low` set a supported effort; either accepts
`default` to clear only that override. `/context-window 24577` sets that exact
whole-token ceiling. `min`, `half` and `max` select the minimum, floored half
and maximum supported ceiling. Each shortcut preserves the other setting
and does not run a model.

Type `/` for the complete scrollable command list: built-ins first, enabled
skills last. Configured skill sources refresh explicitly when this chooser is
opened. Arrow keys move and Tab selects; skill selection loads its exact fresh
source into your draft as untrusted guidance, without running a model or
granting tools. A failed source stays an explicit error, not a stale catalog.
`/side YOUR QUESTION` sends only that question and its selected attachments to
the original read-only side chat and opens its panel. It preserves any existing
side draft and never runs the main chat's model. `/side` alone only opens it.
The [protocol-68 qualification](architecture/chat-activity.md#protocol-68-composer-and-compact-control-qualification)
records the earlier composer/turn-control development installer and its exact
checksum, complete coverage and remaining release exclusions.
The [tuning-shortcut qualification](architecture/model-controls.md#tuning-shortcut-qualification)
records the preceding protocol-69 shortcut installer.
The [settings help qualification](architecture/settings-platform.md#settings-help-alignment-qualification)
records the current aligned-settings installer and its exact identity.

The small **Turns** index beside the conversation jumps to sent prompts and
questions you actually answered, showing the original question and your choice.
Tool permission decisions, queued drafts and automated answers do not appear.
The rail starts collapsed as plain blocks without numbers. Hover or focus a
block for its prompt/question preview. The little **<** arrow expands full
details and becomes **>** to collapse. Clicking a block expands and focuses
that item; clicking the same item again collapses it. Both long histories and
long individual prompt/answer details scroll inside the list. Enter/Space
activates a focused point and Escape collapses expanded details.
Older points reveal retained history automatically without
discarding your draft or following new output away from the point you chose.
The [navigation qualification](architecture/chat-activity.md#turn-navigation-qualification)
records the earlier protocol-66 navigation checkpoint.

Turn information and **Budget and usage** open from the chat's saved snapshot,
without fetching details on click. Tokens, context and captured-rate USD estimates
update during a turn and remain available after reopening the chat or restarting
the service. Cached input is shown separately and is already included in input
tokens, not added to them. Known cache counts stay visible while another call is
still unreported; missing cache data is not zero.

`~` marks estimated input or visible streamed output and its estimated cost.
Provider-reported usage replaces those estimates when available. Unknown or
stopped calls retain their original holds; estimates are never bills or refunds.
Context shows the last retained model input plus its visible output against the
selected working window, not the unsent draft or a fresh inference request.
Original turn details retain the window actually used for that turn.

Schema 66 adds an atomic metadata marker without rewriting encrypted history,
receipts or accounting holds. On startup, previously discarded positive cache
counts can be recovered only from that call's exact retained provider result.
Only the original captured rate can reprice its estimate; missing, mismatched,
deleted or unreported evidence stays unknown. No model or tool is replayed.
The [protocol-66 qualification](architecture/chat-activity.md#protocol-66-qualification)
records coverage and the exact local development installer's identity.

## Folder sessions and shared controls

Drop a project onto the center of another project and name the new folder.
The files are not moved. Its **+** starts a Local chat with every current member
repository captured explicitly; each nested project's **+** still starts a
single-repository chat. Click the folder header to expand/collapse it, or use
**Projects menu / Expand all groups / Collapse all groups**.
Edge drops continue to reorder projects.

Folder tools explicitly select a captured repository by ID or original name.
Files, Changes and Terminal have repository pickers; no first member,
common-parent directory or HOME console is substituted. Folder sessions are
currently Local-only. PR, Work item and workspace plan files remain
single-repository surfaces: open them from an individual member project's chat.
The folder's Plan panel still shows its own explicit model task checklist.
Per-repository MCP, memory indexing, hooks, background jobs and publication are
not implicitly combined or enabled by grouping.

Drop a session onto another to attach its navigation, including project-free
chats; edge drops reorder. This does not change original context/coordination
ownership. Search sessions by fuzzy, case-insensitive name. Settings use the
same matching, switches for booleans, dropdowns for exclusive choices and
grips for reorderable lists; Alt+Up/Down is the keyboard alternative.
Icon actions retain accessible names and tooltips.
Information icons share the row of the title, toggle, field or disclosure they
explain; wrapped labels keep the icon aligned with the first control line.
Help remains keyboard-focusable and Escape dismisses it without changing the
setting or toggling the disclosure.
Settings action captions use their surrounding field or section for context.
Linear keys use **Store**, **Verify**, and **Remove**; shortcut fields use
**Record** and **Save** in both Keyboard shortcuts and Voice dictation.
Other settings follow the same concise pattern, with precise accessible names
and explicit scope/restart consequences where necessary. Warnings, verification
status and review acknowledgements remain visible.
MCP credentials and an unavailable session USD limit retain **X** actions;
candidate-file and attachment-preview removal use bin icons. PR draft creation,
GitHub issue import, Agent output following and all-project suggestion scope
use toggles. "Do not ask again" flags remain checkboxes, as do multiple-choice
lists and explicit source/risk acknowledgements.

Opening **Side chat** immediately opens its original read-only conversation.
It captures the parent's history and inherits model, thinking, window,
autonomy and budget controls, with the same composer, voice, Markdown
transcript and held queue. Later changes are independent. Retained
conversations have no arbitrary total text-byte ceiling; actual model windows,
image bounds and finite budgets still apply. Use reviewed compaction inside
the same session when its effective context no longer fits.

## Project Kanban, continuation and provider prices

Each project has a **Kanban** row and special board chat. Opening it does not run
a model. Board shows local cards and imported Linear cards; **GitHub issues**
and **GitHub PRs** load that repository's source picker in the same view. **Chat**
uses the normal saved composer, model controls, approvals and transcript.
**Work item / Kanban card** can attach a card from the selected session's own
project without running it.

Create an item directly in its column with **Add item**. Drag cards between
columns or reorder them inside a column; Alt+Left/Right changes column and
Alt+Up/Down reorders with the keyboard. Moves use the shared service and survive
restart. A stale drag cannot overwrite another client's arrangement.

Secondary-click a project, use the macOS two-finger click, or press Shift+F10 on
its name for the same actions menu. **Show/Hide Kanban** is also in
**Project settings / Project Kanban**. Hiding keeps its cards, chat and owned
tasks. Drag project headers to reorder inside their folder; Alt+Up/Down remains
the keyboard alternative. Project/session menus no longer contain Move up/down.

Send an exact new `continue work` prompt or `/continue-work [CARD_ID]` in Chat.
Each request asks **Work from Kanban** or **Send to model**; the choice is never
remembered. Cancel keeps the exact draft. Sending to the model submits the
unchanged prompt normally, without a Kanban delegation. The Kanban choice
selects **one** eligible item, creates a visible delegated task on a new isolated
Local worktree, and stops at its draft PR. The original chat's model and budget
are captured; the task uses Autopilot automatic approvals, or its already
selected qualified Max layer. The original chat and global defaults are not
changed. Select a model first. This explicit workflow delegates its branch push
and draft PR, never a merge, force push, rebase or branch deletion.
Ordinary safety/context limits, hard policy and budget caps still apply.

Project settings select Kanban, open GitHub issues or open GitHub PRs.
In-progress cards precede backlog by default; eligible non-final phases are
configurable. Existing PR work updates that exact same-repository head rather
than creating another PR. Fork-head updates and Remote/Sandbox continuation
remain unqualified, with no Local/account fallback. GitHub uses the captured
controller CLI account; no automatic login or credential forwarding occurs.
Held/recovered prompts never create an autonomous task.

**Sync with GitHub** continuously reads linked status into Kanban, never the
other direction. **Import open GitHub issues** optionally brings the repository's
open issues onto the board and keeps imported links updated, including later
closure/reopening. The source binds this Mac's actual CLI account, canonical
project root, upstream and repository identity. Account/root changes fail
explicitly rather than retargeting the import.

Open issues without an active linked PR are **Backlog**; an attached draft PR
means **In progress**; a ready open PR means **Review**; a closed issue means
**Done**, for both completed and won't-do reasons. Explicitly linked PR-only
cards follow their verified draft/open/closed state too. Project settings map
these meanings to existing columns. GitHub-managed cards can be
reordered within a column but cannot be moved to a conflicting column while
sync is on. Turn sync off for a local-only phase override; no drag writes GitHub.
Imported source text updates only fields that have not been edited locally.

Linked statuses are checked periodically while Moguri runs; repository import
pages are refreshed at most every five minutes automatically. The 500-card
alpha bound is explicit. Partial/error responses keep existing cards and show
a sync diagnostic; no prefix is falsely reported as a complete import.
Draft PR publication places a synchronized card in In progress, not Review.
Competing requests cannot claim the same source. Stop/cancellation and restart
retain partial work and unknown model charges; they never replay the task.
Inspect an interrupted task's actual branch, jobs and results before **I
inspected this task; release card**. Inspection neither resumes nor deletes it.

**Settings / Budgets / Provider API-equivalent prices** supplies current
originating-provider reference rates, including name-matched Copilot/reseller
models. For example, Opus 5.5 uses Anthropic's API rate, not a claimed GitHub
invoice. Public reference refresh is explicit, credential-free and bounded;
ordinary Copilot login/inference gains no metadata requests. Missing,
ambiguous, stale and expired prices remain unknown. Each call captures its
rate/source; later refresh never reprices history. Explicit user overrides win.
Finite USD admission additionally needs the explicit API-equivalent consent
checkbox or a fresh dated user rate, plus existing estimate-based cap consent.
Provider-reported and billed amounts stay separate.

TUI/CLI share `/kanban`, `/kanban show|hide`, `/kanban source SOURCE`,
`/continue-work [CARD_ID]`, `/work-item [CARD_ID|clear]` and `/prices`.
CLI also has `moguri kanban open|items|continue|work|stop|inspect` and
`moguri prices [refresh PROVIDER]`. See the
[contract and qualification](architecture/project-kanban.md).
An interactive CLI slash request asks the same route question. JSON/non-TTY
consumers receive a typed review with its exact profile/session/draft revision
and must explicitly choose a route; no default dispatch is inferred.

## Session approvals and GitHub workflows

Factory Manual/Guided runs native file reads, searches, data queries and edits
without a permission card. Explicit stricter review/deny rules still apply.
Shell scripts and external MCPs still need approval or remembered delegation;
an MCP read-only annotation is not authority.

**Settings / Guardrails / Local website allowlist** pre-approves exact hostnames
or HTTPS/loopback HTTP origins for one session, one real project, or all Local
projects in this profile. Matching scopes add together. No wildcards,
credentials, paths, query strings or cross-profile grants. CLI/TUI and desktop
share `/firewall`, `/firewall add session|project|global HOST_ORIGIN`, and
`/firewall remove ID`. Unlisted websites ask in Manual/Guided; explicit
Autopilot/Max remains automatic. Every redirect and Agent-browser request keeps
its original admitted scope. Removing a rule revokes pending website authority,
without replay or undoing already-dispatched website effects.
This is **not an OS firewall for approved Local shell scripts**. Remote does
not inherit Local entries, and Sandbox retains its enforced firewall.
See [native operations and scoped website approvals](architecture/native-network-policy.md).
The CLI form is `moguri firewall ... --session ID`. Keyless web search contacts
`html.duckduckgo.com`; allowing only its parent hostname does not allow that
separate exact host.

Manual and Guided approval cards offer **Only this action**, **Approve for this
session**, **Approve for this project**, and **Always approve across projects in
this profile**. Commands can match exact text or a displayed simple command
family. Compound shell expressions still need their own approval. MCP grants
bind the exact server configuration, tool and discovered schema, not just a
tool name. **Settings / Guardrails / Remembered approvals** lists and revokes
grants. They survive restart but never cross profiles or execution environments.

Selecting **Autopilot** automatically approves declared tools and commands in
every subsequent turn. **Autopilot Max** uses the same unattended permissions
plus the configured bounded System One-compatible layer for qualified technical
choices and steering. Hard denials, read-only mode, allowed-env policy, actual
capability readiness, secret boundaries and budgets remain final. Missing
workspaces are not invented. Max still requires an explicitly configured,
qualified provider; the dedicated Jev wire and Remote/native Max remain
unqualified. Upgrades preserve older bounded Autopilot selections: select the
mode again to opt into automatic approvals. Manual remains the factory default.

**New / Clone repository** loads repositories from the existing GitHub CLI
account, with user-owned and organization-member repositories first on each
page. Public repository search is separate and explicit. Pick a repository to
populate its SSH URL and folder name, then choose a new destination. A direct
HTTPS/SSH URL remains available. Moguri never authenticates, switches accounts,
overwrites an existing folder, or forwards Copilot/updater credentials.

**Code change** now includes project PR selection, full descriptions and reviewed
PR creation; **Work item** provides the equivalent GitHub issue flow and shows
an attached local ticket when present. PR base defaults to GitHub's actual
default branch and head to the current local branch. The head must already be
pushed. Review the exact title/body and confirmations before publication.
Results are linked only after the original durable operation completes.
Cancellation or uncertain effects remain partial, never retried as a new write.
Existing advanced Git/review/release operations remain in the collapsed
**Settings / GitHub workflows / Advanced** section.

Project menus offer **From PR** and **From work item** dropdowns for that
repository. Review the full body, then start an idle session with an unsent
draft. Its canonical URL, original numeric account identity and exact source
digest are retained. Changed source/account/root bindings require a fresh
review. No checkout, branch, model call or prompt execution starts implicitly.

TUI uses `/github repos`, `/github repos public QUERY`, `/github issues` and
`/github pulls` for native pickers. Enter reviews an item; Ctrl+N creates its
idle session, Ctrl+L links it, and Ctrl+B opens its canonical GitHub URL.
Ctrl+Shift+Y opens remembered approval choices. `/approve project family`,
`/approve session`, `/approvals`, and `/approvals revoke ID` use the same SDK.
`/github source issue|pull NUMBER` and `/github start issue|pull NUMBER SHA`
also support explicit source review from SDK/CLI slash consumers.

GitHub settings detect the CLI account when opened, without a separate client
ID or account-name field. If needed, sign in yourself with
`gh auth login --hostname github.com --web --git-protocol ssh`. Explicit
background linked-PR observations retain their existing per-project access
choice, separate from these interactive reads.

On macOS, Finder/Dock launches often omit Homebrew from `PATH`. Moguri preserves
the inherited lookup order and adds missing `/usr/local/bin` and
`/opt/homebrew/bin` locations when starting its Local background service; its
owned programs inherit that environment. Direct in-process SDK runtimes and
Remote peers keep their caller/host environment unchanged. Moguri does not run
shell startup files, scan other applications' private
tool caches, install a CLI or copy credentials. An explicitly supplied program
`PATH` or absolute executable stays authoritative; Linux/Remote Linux lookup is
unchanged. Git and GitHub CLI must still be installed by the user, and GitHub
authentication remains explicit. After installing a build containing this fix,
quit and reopen Moguri so its original background service restarts with the
corrected environment; existing healthy services are not silently replaced.

**Settings / General / Private GitHub updates / Create a token with the right
permissions** supplies a prefilled fine-grained-token link and exact steps:
resource owner `mbianchidev`, **Only select repositories / moguri**, **Contents /
Read-only**, included Metadata read access, and a short expiration. You must
select the repository and finish authorization yourself. The updater needs no
write, Workflows, Actions or administration permissions. Paste the token only
into **Private release PAT**, never chat. `/updates token-help` exposes the same
guidance in TUI/CLI. See the [workflow contract](architecture/session-github-workflows.md).

## Automatic Kupo

Protocol 61 adds [automatic Kupo](architecture/automatic-kupo.md) to the ordinary
composer. It always appears in the model list, with an unavailable reason when
there is no eligible configured model. New/reset routing policies use automatic
selection; existing explicit Single/Compound settings are preserved. Upgrading
does not select Kupo, authenticate, make a model call or change autonomy.

Protocol 63 converges its original schema-61 state with the session/GitHub
schema-61 and Kanban/pricing schema-62 lineages. Recognized markers are required;
upgrades preserve consent, original selected responses, encrypted history,
receipts and unknown budget holds. A missing current marker is an error, never
permission to recreate or replay work.

## Workspace experience and skill gateway

Protocol 59 adds the [workspace experience and skill gateway](architecture/workspace-experience.md).
The left sidebar has **New**, Dashboard, Suggestions and Automations.
**Code change** and **Work item** belong to the right rail and follow
the selected session, with the protocol-61 GitHub workflows described above.
Automations is intentionally empty; no scheduler is implied. Profile, Ask Moguri
and Settings share one compact footer row. Copilot connection status appears
only in Settings / Models / Providers, not in the left sidebar.
Artifacts, Candidates and unified
**Sandbox** management now live in Settings, with optional source-chat selection.
Non-secret settings fields have hover/focus copy buttons; explanatory text uses
keyboard-accessible information tooltips. Errors, status and safety reviews
remain visible. The menu-bar mascot has a dedicated transparent template icon.

New project-free Local User consoles start in the configured **HOME**, not
Moguri's application-state directory. Project User consoles use their actual bound
Moguri worktree. Existing consoles retain their original root; missing or
invalid HOME fails rather than selecting another directory.

**Settings / Instructions / Skill gateway** accepts a local folder, a public
GitHub repository root such as `https://github.com/owner/skills`, or a direct
HTTPS `.zip` URL. Add a named source, save it, then **Find skills**. Nested
`SKILL.md` files use standard YAML front matter. Every search/read rechecks
fresh bytes; changed content requires a fresh digest. No extraction, installer,
script execution, automatic authentication or stale offline fallback occurs.
The current limits are 16 sources, 512 combined skills, 64 KiB per skill,
8 MiB compressed and 32 MiB expanded per archive. Links, traversal, duplicate
archive paths, unsupported encryption and invalid text fail explicitly.
Sources are profile-private Local control-plane capabilities, not an SSH or
Sandbox filesystem transport.

The same discovery is available through `/skills find QUERY`, `/skills read ID
SHA`, `moguri skills find QUERY`, `moguri skills read ID --digest SHA` and outward
MCP tools `moguri_find_skills` / `moguri_read_skill`. The existing `moguri mcp
--session ID` gateway cannot configure sources or approve tools. Model-side
`use_skill` discovers configured sources on qualified Local turns; loading
guidance never installs or enables a capability.

**Suggestions** starts with profile-wide local usage-gap checks and bounded
prior prompts, without creating a hidden chat or calling a model. Optionally
select a chat to narrow the scope. Review the exact usage gaps, excerpts and
selected model before generation; configuration proposals still need a separate
actual-user decision. `/suggestions session` preserves explicit scoped access.

**Dashboard** has My work, Usage, Cost and Velocity pages with charts first,
project/model breakdowns and detailed accounting behind a disclosure. The
initial window is seven UTC days, with 30/60/90-day presets and custom inclusive
dates initialized to the trailing year. My work includes current open sessions
even when older than the selected range. Velocity reports observed completed
agent turns, timing and user interventions against the previous equal window,
not invented time savings or a proven productivity increase. Unknown tokens,
unpriced calls and invoices stay distinct. CLI/TUI share
`/dashboard work|usage|cost|velocity` and `moguri dashboard` projections; F7
includes the shared overview.

Protocol 57 implements [session-owned candidate cleanup](architecture/candidate-cleanup.md).
Permanent session deletion, whether manual or archived-session expiry, deletes
all candidates and fixed-model generation proposals originating from that exact
session. Archiving alone preserves them. Session-delete confirmation and
**Settings / Sessions / Retention** disclose this; no separate candidate
confirmation is required. Ordinary artifacts, usage/budget records, applied
code, worktrees, branches and PRs are preserved.

Associated candidates are also deleted after a fresh authoritative read confirms
their exact repository/PR merged. Automatic reads include archived sessions and
honor the project's public/authenticated metadata setting and board automatic-PR
refresh policy. Disabling automatic PR refresh stops new merge observations.
There is no public/other-account fallback. Closed-without-merge, stale or failed
observations cannot delete proposals. The first recorded association is fixed;
relinking a session does not retarget its older candidates or cancel newer work.

Candidate creation is available only for explicit Git-backed Local projects,
not project-free chats or plain folders. Desktop disables creation until the
shared `candidates.eligibility(sessionId)` service check succeeds. CLI/TUI use
`candidate eligibility --session ID` or `/candidate eligibility`; direct
stage/generate/compound requests still enforce the same gate before effects.
The service persists cleanup intent before cancellation and resumes it after
restart. Pending/failed cleanup remains visible in Candidates and stored-session
management; it is not a successful deletion. Reconcile exact owned resources
and retry deletion, or let verified-merge cleanup retry. Unknown model usage
continues holding capacity. Legacy records with no canonical origin remain
unassigned rather than adopting the current session.

Protocol 53 converges the independent main-line schemas 44-52 and desktop
schemas 44-46. The original desktop provenance marker identifies that lineage;
version numbers alone cannot distinguish the two histories. Required markers
and the final version advance atomically, without rewriting encrypted events,
keys, receipts or source grants. Missing main-line markers or invalid provenance
fail explicitly and preserve state. See [retained-state upgrades](sdk.md#retained-state-upgrades).

Protocol 54 adds exact-scoped, read-only session PR observations and explicit
draft state. The additive indicator marker does not rewrite encrypted history
or turn old missing draft information into a ready PR. Session dots and trailing
icons show active work or required input before a merged PR, then completion:
blue blinking dot/spinner, yellow question or approval pause, green completed
check with a green open or gray draft PR, or purple merged-PR glyph.
Reduced motion keeps those indicators static. Failure, partial, stopped and
held states never become successful completion.
See [session indicator authority](architecture/session-interactions.md#session-status-and-linked-pr-indicators).
The prior [protocol-54 qualification](architecture/session-interactions.md#protocol-54-qualification)
covers complete Node/Electron suites, the packed SDK and actual development package.

Protocol 55 adds independently retained, profile-private remembered model
selections. **Settings / Sessions / Startup defaults / Global default model**
offers a fixed shared model/effort, **Last selected model and thinking effort**,
or no selected model. Last selected means the latest explicit selection, not
the last inference, sent prompt or a different profile. Global defaults remain
subject to explicit profile/project/session overrides; existing chats keep their
controls. With no remembered choice, the factory still selects no model.
See [new-session model defaults](architecture/model-controls.md#new-session-model-defaults).
The prior [protocol-55 qualification](architecture/model-controls.md#model-default-qualification)
passes 1,315 Node/worker/CLI/TUI cases with 14 physical-native skips and 157
hidden desktop cases with two physical-native skips. The packed external SDK,
matching native worker image and actual development app/ZIP/DMG are qualified
separately; installer integrity is not notarization or physical VM readiness.

Protocol 56 adds user-toggled Local browser control through the existing
session pane and exact MCP approvals. The metadata-only `browser_control_schema`
upgrade preserves encrypted state and forces review of an older running
service rather than silently reusing a process without the new tools.
Browser control/leases never survive restart.
See [browser ownership and qualification](architecture/agent-browser.md).
The browser-control checkpoint's protocol-56 run passes **1,330 Node cases with 14 skips**, **166
hidden desktop cases with two skips**, the packed external SDK/all 12 installed
workers and **28 cases against the actual rebuilt app**. The matching worker,
ZIP/update consumer and DMG geometry/integrity pass separately. The sliding
control is a real button switch, not a checkbox; it keeps keyboard support and
immediate off/on revocation. Physical VM/containment and notarization remain
separate unqualified release gates.
The later [image-preview display checkpoint](#image-preview-display-qualification)
keeps those backend bundles unchanged and separately qualifies the larger
images, fresh full desktop run and rebuilt installer.

Protocol 58 adds [lean tools and scoped coordination](architecture/lean-tooling.md).
Its strict additive marker preserves ciphertext, drafts, receipts, grants and
unknown budget holds. Normal fixed/kupo solver turns load typed native schemas
on demand; discovering a schema grants nothing. Deterministic compact results
retain exact original-source paging. Structured documents/SQL, explicit
watches/DAP, keyless search and original-parent/child messages use the same
authority. This does not qualify an older native image, a language adapter or
live task-quality/token-saving claims.
The released candidate-retention 57 lineage and earlier development
lean-tooling 57 lineage have distinct retained markers. The schema-58 upgrade
recognizes exactly one valid original lineage, atomically converges both
capabilities and refuses missing, corrupt or ambiguous provenance.

An older `connection.json` is not necessarily corrupt. A stale unreachable
connection can start the current service through its normal writer-lock/recovery
path without deleting stored history. If an older service is actually running
and its private token, PID and protocol are confirmed, desktop asks before
restarting that exact owner. **Restart service** stops in-flight agent work,
preserves authenticated user terminals, then opens the current client. **Cancel**
leaves the original service unchanged.

Newer protocols, changed owners, malformed/private-file violations and
unresponsive health checks are not force-restarted or silently replaced. Close
the original service or inspect it before retrying; never delete the database,
keys or session state as a workaround. CLI `moguri service restart` remains an
explicit action against an authenticated responsive service.

Closing the last desktop window, Cmd+Q and **Quit Moguri** wait for the exact
connected service to shut down before Electron exits. Running model/tool work
stops with its real outcome, and ordinary exit closes known user terminal groups
across profiles. Saved history, profiles, artifacts and unknown budget holds
remain. This is separate from explicit upgrade/update/storage restarts, which
retain their reviewed terminal-preservation behavior.

Cancelling an unsaved-edit close leaves the service running. A changed owner or
failed/unconfirmed cleanup blocks successful exit and shows a retry error; the
app does not start another service or force-kill a guessed process. Other
independent state roots are not scanned or stopped by name.

## Protocol-58 integrated source qualification

The final integration preserves main `2445dac` (candidate cleanup) and the lean
tooling/coordination slice in merge `5994f83`. Both original schema-57 lineages
upgrade through their actual retained provenance; neither feature replaces the
other or weakens source/accounting ownership.

| Check | Observed result |
| --- | --- |
| Clean locked install, audit, shared type checks and production build | PASS; zero vulnerabilities |
| Complete Node/worker/CLI/native-TUI regression | 1,422 passed, 14 declared skips, zero failures; 1,177.61 s |
| Complete hidden desktop regression | 178 passed, 3 declared skips, zero failures; 5.7 min |
| Independently installed packed SDK, declarations and all four entrypoints | PASS; zero vulnerabilities |
| Actual installed worker continuation/receipt/cancellation probes | 12 passed, zero failures |
| Both schema-57 lineages, failed convergence, ambiguous/corrupt/missing markers | PASS; ciphertext, original grants and accounting preserved |
| Candidate deletion blocked by an original partial watch | PASS; exact actual-user inspection/Resume/retry remains available, no new work admitted |

The earlier warnings and unqualified gates below remain explicit. This is not
qualification of a new physical native image, every DAP adapter, live
task-quality/token-saving guarantees or the complete first milestone.

## Pre-integration lean-tooling qualification

The 2026-10-25 pre-integration source qualification at `5434338` uses generated repositories, loopback
providers/SSH, isolated test profiles and hidden Electron. No personal
authorization, real microphone, personal console or paid model is used.

| Check | Observed result |
| --- | --- |
| Clean locked install and root audit | PASS; 454 packages audited, zero vulnerabilities |
| Shared SDK/CLI/TUI/desktop type checks and production build | PASS |
| Complete Node/worker/CLI/native-TUI regression | 1,380 passed, 14 declared skips, zero failures; 1,095.38 s |
| Complete hidden desktop regression | 176 passed, 3 declared skips, zero failures; 5.5 min |
| Independently installed packed SDK, declarations and all four entrypoints | PASS; 397 consumer packages, zero vulnerabilities |
| Actual installed worker continuation/receipt/cancellation probes | 12 passed, zero failures |
| Typed schema comparison and public keyless search | [Measured schema bytes/estimates](architecture/lean-tooling.md#phase-0-evidence-2026-10-25); three observed HTTPS search results |

The full sweep caught and fixed an actual private-broker import regression and
obsolete eager-schema/output-byte expectations. A genuinely pre-tooling
encrypted command fixture now tests the old desktop migration instead of
relabeling future raw-result grants as old data. Hidden teardown waits for the
renderer acknowledgement, not merely a backend message count, before closing
an unsaved-state-protected window.

The packed consumer also caught a dependency portability error that a root-only
audit missed: npm root overrides do not propagate to dependent installations.
The spreadsheet writer was replaced rather than waiving the advisory or
modifying the consumer's policy. Both actual dependency graphs now pass.
The external consumer still reports the existing `whatwg-encoding` and
`node-domexception` deprecations; the Vite build retains its greater-than-500-kB
chunk warning and OpenTUI's experimental FFI warning remains expected.

Declared skipped gates remain unqualified. These checks do not qualify a
matching new physical native image, every language DAP adapter, live provider
task/cache/quality non-regression, exact token/billing savings, notarization or
the complete first milestone. Current native live coordination and Local-only
issue/watch boundaries are explicit in the
[protocol contract](architecture/lean-tooling.md), never transport fallbacks.

## Protocol-53 integrated source qualification

The 2026-10-24 integration merges main `5d1f97e` through the two-parent merge
`2f28e7f`, with final desktop preservation fixes in `f9f476b` and deterministic
Electron revision coverage in `29d7b07`. It preserves main's unified Start and
cloning, independent consoles, searchable settings/profiles/preferences,
device-aware browser audio and sounds, native application/storage/update
controls, connection upgrades and owned shutdown, task plans/Other answers,
and managed SendBox setup/staging/bootstrap/network controls.

The original requested attachment/navigation/terminal/voice changes, activity,
compact usage and separate Agent terminal are all retained. Main's per-message
copy controls and available chat width also remain; turn-level response/info
actions supplement rather than replace them. Opening intent is consumed once,
so returning from Settings or remounting User cannot relaunch a closed console.
Enter consumes its native event; Shift+Enter, IME composition and explicit held
prompts retain their distinct behavior.

| Check | Observed result |
| --- | --- |
| Locked root install, type checks and production build | PASS; neither requested root deprecation warning |
| Complete unit/integration/worker/CLI/native-TUI suite | 1,259 passed, 14 physical-native skips, zero failures; 1,269.69 s |
| Complete hidden Electron suite | 119 passed, 2 physical-native skips, zero failures; 4.1 min |
| Actual external packed SDK | All entrypoints, declarations and installed client/runtime paths pass; all 12 installed-worker probes pass |
| Cross-client Linear revision synchronization | 3 repeated hidden runs pass without weakening stale-review rejection |
| Final packaged Ghostty and generated browser dictation | 2 hidden Electron cases pass in 4.8 s |
| Root, generated SDK host and no-cache image dependency audits | Zero vulnerabilities |
| Actual macOS package and bundled native distribution | PASS; original no-script installer and protocol-53 worker digests verified |
| Production update consumer and actual DMG layout | PASS; 740,331,550-byte ZIP/manifest verified in 100.00 s; read-only DMG mount verified |

The full Node suite ran on `2f28e7f`. The subsequent fixes change only desktop
presentation, Electron coverage and documentation. A Git comparison verifies
the final service, SDK, CLI, TUI, build scripts, manifests and generated Node
test inputs remain byte-identical to that full run. Final type checks and the
complete Electron run cover the desktop follow-ups. Of 245 incoming-main paths,
175 main-only paths remain byte-identical; deliberate main-only changes are the
Confirmations catalogue entry, the sidebar contract and updated Electron
expectations for the requested interaction behavior.

The native image was built without cache in 40.11 s and verifies the exact
locked Linux arm64 payload and generated PTY. Its immutable local identity is
`docker.io/library/moguri-worker@sha256:62a19e9b4a87f18aa73a32b0d579199097518b1e7aa3bb5cd207b76db87c3a5f`.
This is image/package qualification, not proof of actual SendBox VM containment
or Linux release readiness. The 14 unit and 2 desktop skips retain their physical
native prerequisites. Personal accounts, microphones, speech weights and paid
inference were not used; actual ASR accuracy remains unqualified. The macOS
bundle is ad-hoc signed, not notarized.

Root and image installs no longer emit the requested deprecated-package notices.
npm does not inherit a dependency's overrides, so a generated external SDK host
without its own compatibility policy still reports those upstream notices;
the scoped host configuration remains in [the SDK guide](sdk.md).
Non-blocking build/package notices remain for large UI chunks and the optional
Apple `.icon` companion format; the ordinary bundled `.icns` is retained.
Historical source qualifications below are not relabeled as this integrated run.

## Managed SendBox

On supported Apple-silicon macOS with Apple Containerization available, the app
includes SendBox **0.2.4**, a versioned no-script installer, and a compatible
digest-pinned Linux image containing Moguri's worker, Node 26.12.0 and native
dependencies. You do not run a build, container command or SHA command to use it.

Open **Settings > Execution & permissions > SendBox**, choose **Review bundled
setup**, review the actual version, image, workspace/network policy and install
location, then choose **Enable Sandbox**. An already configured exact root-owned
0.2.4 installation can be reused. A fresh installation requests your administrator
approval for `/opt/moguri/sendbox/<version>`; it never overwrites another SendBox
installation or approves the OS dialog for you. Unsupported prerequisites block
setup without a Local fallback.

After qualification, select **Sandbox** in the composer and send normally.
Managed engine qualification does not contact an unselected model provider;
actual selected-provider access is checked before a turn's model admission.
Private project/worktree copies are prepared automatically under ignore/folder
rules; project-free chats get an empty root-less workspace. There is no required
file preview or empty-stage confirmation. Successful private work persists across
turns. After cancellation/rollback, verified retained private work is copied into
a newly owned stage rather than being discarded or silently replaced by the
original checkout. Source publication still has its separate exact review.

Provider networking uses the actual prepared HTTPS endpoint, not an assumed
canonical Copilot host. Managed policy resolves and allows its bounded public
CNAME chain automatically, capturing the effective hosts with the original
execution. No permanent historical grant or hardcoded alias is inferred.
`github.com` and `api.github.com` are default tool grants. In SendBox 0.2.4,
`github.com` also delegates GitHub Meta domains and IPv4/IPv6 CIDRs, including
shared-cloud ranges, refreshed before readiness and hourly. This is broader than
exact-host-only egress and can cover shared infrastructure; setup review states
that explicitly before Enable Sandbox. The native public-page tool works without a project,
uses the enforced guest proxy and requires ordinary tool permission. This is not
an interactive browser or a general native MCP grant.

Advanced manual configuration also accepts explicitly reviewed `*.domain.com`
tool rules. These permit subdomains at any depth, not the apex or lookalike
suffixes. Except for the disclosed 0.2.4 GitHub Meta delegation, exact entries
remain exact. Private-address protections remain in the
guest, and selected-provider URLs/CNAMEs still require exact admission. No
additional wildcard is added automatically by Moguri. Per the owner's explicit
choice, 0.2.4's default GitHub grant includes the disclosed Meta delegation.
Selected-provider credentials and tool approvals remain separate.

New factory defaults select 0.2.4. An explicitly saved 0.2.3 selection and its
release/approval records remain unchanged; using the new bundle still requires
review. See [the release pins and upgrade boundary](architecture/managed-sandbox.md#default-sendbox-024).

**Check public SendBox releases** checks at startup and every four hours when
enabled. **Check SendBox updates now** uses the same fixed public repository with
no Copilot, CLI or private updater token. The configured version stays selected.
Choose another eligible version, prepare its signed release for review, then
approve separately before installation/activation. Unknown digests, changed trust
roots, cancelled authorization and interrupted operations remain explicit; old
versions and active work are not deleted or replayed.

Approved managed setup requalifies the existing version on restart, without
reinstalling it or draining saved queues. A changed Moguri worker requires its
matching bundled setup review, not old manually copied image hashes. **Advanced
manual configuration** and exact-file staging remain available for experts;
old manual configurations do not silently gain the managed policy.

CLI/TUI expose `/sandbox setup` and its exact confirmation command, plus
`/sandbox updates`. Embeddings can explicitly provide the same distribution
through the Node SDK; root/React entrypoints remain browser-safe. See the
[managed contract and qualification](architecture/managed-sandbox.md).

## Searchable desktop navigation

Settings has a search field and grouped categories. **General** owns profile
management; **Models > Providers** owns Copilot sign-in, separate from repository
integration. SendBox configuration is under **Execution & permissions**.
Click a project folder to open that project's settings. Dirty edits block
leaving their owner; searching never saves or discards text.

The scrollable left resources are **Dashboard, Suggestions, Automations**.
Artifacts, Candidates and Sandbox live in Settings. The right rail contains
**Terminal, Browser, Insights, Changes, Files, Plan, Side chat, Code change,
Work item**, in that order. Global views are not duplicated there;
`/pr` opens the selected session's Code change panel. Attention uses the single
top-bar icon. Where a global action needs a source, select an actual **Source
chat** first. Viewing a global resource never creates a hidden chat or model
request. Terminal uses the selected session's authenticated Ghostty owner;
Global Terminal is no longer a navigation or creation entrypoint.

Unread sessions use slightly heavier title text instead of an extra dot.
Mark read or selecting the session removes that emphasis; an older held read
action cannot consume a newly arrived question. Actual yellow question/approval
status and its icon remain until answered/decided, independently of read state.

The shared preferences below include device-aware local speech, independent
notification sounds, root-owned native updates and reviewed store relocation.
Their explicit authority, failure and qualification requirements are in
[settings platform](architecture/settings-platform.md).

## Session navigation, plans and queued work

Right-click a session name, use a macOS two-finger click, or press Shift+F10 on
its focused name for Pin, Rename, Archive, Delete and organization actions.
Ordinary clicks still open the chat. Archive no longer occupies the chat header.
Confirmation dialogs offer **Do not ask again** separately for archive/delete;
change either preference in **Settings / Sessions / Retention**. These preferences
do not grant permissions, enable automatic cleanup or bypass retained-artifact
reviews. Deletion still stops owned work and preserves independent documents.

Drag any part of a session row to reorder siblings, including children, within
their pinned/unpinned group. The target's top/bottom halves insert before/after
without nesting. There is no grip button. Alt+Up/Down on the focused name is
the keyboard alternative; use **Attach to session** in the menu
to choose a parent. Drag a child to a root row or its project/Chats/group
header/background to detach into that root list. This asks for confirmation by
default. **Do not ask again when detaching sessions** is saved per profile and
can be restored in **Settings / Confirmations**. Cancel keeps hierarchy/order
unchanged; changes during review require a fresh review.
Only the current project's hierarchy changes: workspace, Env and read-only/model
subagent boundaries do not move. Each service attempt checks every sibling
revision atomically instead of publishing a partial arrangement.
Ordinary live activity/read-state changes no longer cancel the drag. A known
revision-only rejection can refresh once while the exact original structural
intent still matches; changed order, membership, pin or hierarchy stays refused.
Unpin uses a crossed-out pin; pinned-state markers and Pin retain a standard pin.

The latest ordering build passes 153 hidden desktop cases with two
physical-native skips; 21 ordering/icon/hierarchy/keyboard/narrow-row cases also
pass in the actual packaged app. Exact original-intent/CAS rules and installer
measurements are in [session ordering qualification](architecture/session-interactions.md#session-ordering-qualification).

The right sidebar has panel-hide and maximize/restore icons. Maximize covers the
chat, not left navigation; restore preserves its previous split width. Agent and
read-only are a pen/book toggle immediately after the composer's **+** attachment
button. Cmd/Ctrl+K still opens Commands,
without a titlebar advertisement.

During a turn, hold Cmd/Ctrl with a nonempty draft to replace Stop with the clock
action. A successful held submission restores Stop and preserves the running
turn. The clock stays visible while acknowledgement is pending, even after
releasing the modifier. **Resume queued work** sends one prompt per finished turn, not one combined
prompt or parallel calls. Stop holds undispatched work; reopening the app does
not drain it. Interrupt retains its separately requested next-turn behavior.

When a session/worktree requires inspection, the composer's primary Send
position becomes a **Resume** play icon instead of adding a header button.
Inspect the retained effects first. Click Resume or press Enter to continue
existing work without sending or clearing the current draft/attachments.
Shift+Enter remains newline, Cmd/Ctrl+Enter remains Hold, and explicit slash
commands remain available. Pending resumes disable the control; failures remain
visible until an explicit retry. Neither automatically retries; active work still
shows Stop.

The prior composer-recovery build passed 144 hidden desktop cases with two
physical-native skips; 14 recovery/composer/Start/Stop cases also passed in its
actual packaged app. See [composer recovery qualification](architecture/session-interactions.md#composer-recovery-qualification)
for the exact scope, installation and artifact evidence.

The Plan tab stays empty until the owning model explicitly supplies at least two
actionable steps. Model checkmarks and estimates live there only, never above
the textbox, and never prove acceptance or successful completion. An existing
repository checklist does not become a task plan. **Open workspace plan file**
still exposes the separately reviewed Local/SSH file editor and retained saves.
Every actual model question offers **Other, please specify**, with an explicit
text answer that neither consumes an unrelated draft nor grants tool permission.

New consoles use embedded Ghostty and the actual execution host's configured
login shell, including the account shell when a desktop launch omitted SHELL.
For zsh, ordinary login-shell configuration supplies the prompt; no iTerm,
Terminal.app or external Ghostty app is launched or impersonated. Closed consoles
leave the selector while their ownership/cleanup evidence remains retained.
Existing PTYs are never replaced merely to change their shell. See the
[protocol-51 interaction contract](architecture/session-interactions.md).

## Shared session and instruction preferences

Protocol/database **45** adds nested preference normalization without rewriting
existing events, keys, grants, budgets or saved retention ages. Restart matching
clients and service to upgrade; do not delete local state.

**Instructions / User guidance** has independently saved README/issue/PR,
readiness, stack/bootstrap, writing, contact/license and engineering-workflow
templates. Loading the readiness starter edits the draft only. Contacts and
licenses remain unset. Five project workflow overrides live in the project's
settings; an explicit empty override disables that inherited field. All
guidance enters future recorded prompts, never grants permissions or rewrites
an in-flight turn.

**Appearance** offers Moguri, Ocean, Orchid and Custom palettes in dark/light
modes. Custom element colors are saved together and validated against measured
text, focus, control, selection and semantic contrast. Invalid combinations
remain editable and never replace committed colors.

**Sessions / Startup defaults** exposes a shared **Global default model** and
supported global thinking effort, plus separate current-profile model/effort
overrides. The default last-selected mode remembers explicit selections in that
profile and does not copy the old session's working window or draft. The page also offers
dry/minimal/balanced/detailed response verbosity, plus the existing explicit
global/profile budget and advanced defaults. Existing sessions keep their saved
controls. **Execution & permissions** owns default autonomy and tool
ask/deny behavior; exact grants and deny rules still apply.

**Sessions / Retention** displays the actual encrypted store directory, manages
confirmed session deletion and optionally prevents macOS idle sleep during real
owned work plus a configurable tail. It does not override manual sleep, lid
closure or the remote host. Failures expose the original helper and explicit
retry; no other process is adopted. CLI `moguri runtime status` and TUI
`/runtime` read the same runtime data.

Auto-archive and auto-delete both start off with distinct seven-day thresholds.
Only actual completion ages a session for archive; drafts, held queues, input,
active descendants/consoles and unconfirmed effects block it. Archived age
starts at actual archival, not completion. Deletion preserves independently
retained artifacts/worktrees and all-role budget accounting.

Ticket phase and per-project import configuration live in **Project settings**;
Linear authentication lives in **Integrations / Linear**, including without a
project. GitHub integration explicitly checks the existing controller CLI
account, separate from Copilot and updater credentials. The optional
**sql-not-so-lite** connection only checks an existing daemon's health; it never
starts a daemon, requests a Home scan or exposes the private event store.

For current continuation scope, see the
[first-milestone gap handoff](remaining-milestone-gaps.md).
The user has reopened previously paused Sandbox integration specifically for
SendBox 0.2.3. Historical checkpoint measurements below remain scoped to their
recorded versions; they do not qualify the new runtime or close the milestone.
Fresh [0.2.3 requalification](architecture/sendbox-0.2.3.md) verifies released
host/guest artifacts, actual generated worker/tool/image frames and cancellation.
Cold provider networking requires a separately reviewed exact DNS-alias scope;
the endpoint-only probe fails. These primitives do not by themselves enable
public Sandbox. The recorded protocol-40 service/SDK/client lifecycle below
extends them without changing factory settings or broadening policy.

## Separate Agent terminal

Current source uses protocol/database **60**. The session's **Terminal** pane
has separate **User** and **Agent** tabs. User remains your private, interactive
console. Agent shows Moguri's actual command requests/results and live output;
merely opening either Agent history or a retained result never starts a model
or shell. Retained legacy independent consoles remain user-only and inspectable.

Moguri runs commands through the existing approved `run_command` capability,
then can list or reread exact original output with `read_agent_terminal`.
Command approvals, exact-command grants, environment/root/folder policy,
timeouts, cancellation and unknown cleanup retain their existing semantics.
The Agent tab labels pending, denied, failed, partial and unconfirmed work
without inventing success, and follows bounded UTF-8 output tails by default.
Earlier pages and commands remain explicitly accessible.

Each command uses a fresh owned PTY, not a persistent interactive shell.
Shell variables and a changed directory do not implicitly carry to the next
command. The Agent viewer has no keyboard-input route; use the User tab for
personal typing and **Stop** in chat to cancel active agent work. Agent command
output is part of its approved tool history; User/Global input/output is not.

CLI `agent-terminal list --session ID` and
`agent-terminal read COMMAND_ID [UTF8_OFFSET|tail] --session ID`, shared
`/agent-terminal list/read`, and `sdk.agentTerminals.list/read` inspect the
same exact session/profile records. Source deletion removes this access.
The original desktop schema-46 view is included in protocol 53. Convergence
changes no SQL layout, ciphertext, grants or receipts and never replays commands.
Restart service and clients together.
See [the ownership and capability contract](architecture/agent-terminal.md).

### Protocol-46 source qualification

On macOS arm64 / Node 26, type checks and the production build pass. The complete
unit/integration/native-TUI suite passes **1,112 cases**, with **nine physical
native-workload skips**, zero failures and a duration of **979.63 s**.
Complete hidden Electron acceptance passes **84 cases**, with **one physical
native-workload skip**, zero failures and a duration of **3.2 min**.

Generated model flows execute and reread actual Local and pinned loopback-SSH
command output. They prove private User console bytes stay out of model
requests, explicit read denial and read-only mode remain enforced, held reads
cannot outlive policy revocation/stop, and agent cancellation preserves the
separate User console. Other checks cover exact source/session isolation,
Unicode tail bounds, schema-45 ciphertext/receipt preservation, restart without
command replay, native read-only Ghostty, keyboard escape, stale-view rejection
and unavailable history without a false empty state.

The packed external SDK passes browser-safe entrypoint/declaration checks and
Agent SDK/React/CLI/TUI scope/source inspection. All **12 actual installed-worker
acknowledgement/accounting/cancellation probes** pass. The audit reports
**zero vulnerabilities**. Project-free models do not receive an unusable
terminal tool; the unchanged context/headroom guard remains enforced.
Read-only declaration tests inspect actual tool names, not strings appearing
in descriptions, while preserving the existing no-write/no-execution checks.

No personal console, account, microphone or paid inference was used. Physical
SendBox workloads, Linux UI and signed/notarized release gates remain
unqualified; source version numbers and generated SSH evidence do not close
them. Earlier protocol qualification records below remain historical.

## Chat activity and usage

Protocol 45 introduced this activity slice. Chat operations appear as compact
icon-led rows for file reads/creation/edits, file/skill/web search, skill loading,
GitHub/Linear issue creation, commands/scripts, MCP calls and actual questions.
Expand a row for its original arguments/result, local start date/time, observed
duration and retained UTF-8 output size. Large results use explicit byte pages.
Running operations have an elapsed wall timer; waiting, failed, stopped,
partial and unconfirmed outcomes stay distinct.

**Thought** opens only already-public provider-exposed reasoning. Its duration
covers the whole model request, not separately measured thinking. Hidden model
contexts, private role results and user-terminal input/output are not exposed.
Explicit skill selection and reviewed GitHub/Linear actions without an owning
turn appear under **Session actions**, not attributed to an adjacent response.

Hover a response, or focus its actions with the keyboard, to **Copy response**
or open **Turn information**. Copy excludes tools/reasoning. Info uses that
turn's original model/context and complete owning-turn accounting, not the
currently selected model or newly edited rates. Unknown quantities stay unknown.

The composer budget button opens a compact view: **Est. USD**, plan, session
calls, input/output/cache tokens and estimated context window. **View usage and
limits...** opens detailed accounting and the existing warned budget controls.
These are not provider billing, subscription-plan balances or AI credits.
Hard policy and unknown held usage remain enforced.

SDK `activity.list/read/turn/response`, CLI `activity list/turn/read --session ID`
and shared `/activity` use the same retained service view. Results require the
exact current-profile source session; its deletion cannot recover contents from
the independent sanitized operation ledger. The additive schema-45 upgrade
preserves existing ciphertext, keys and receipts. Restart clients/service
together without deleting state. See [the contract](architecture/chat-activity.md).

### Protocol-45 source qualification

On macOS arm64 / Node 26, type checks and the production build pass. The complete
unit/integration/native-TUI suite passes **1,097 cases**, with **nine physical
native-workload skips**, zero failures and a duration of **1,097.37 s**.
Complete hidden Electron acceptance passes **80 cases**, with **one physical
native-workload skip**, zero failures and a duration of **3.4 min**.

The actual packed external SDK passes all public entrypoint/declaration checks,
including the browser-safe activity/React surface, original session-granted
skill bytes, CLI/TUI reads and profile/deletion isolation without inference.
All **12 actual installed-worker acknowledgement/accounting/cancellation
probes** pass. The dependency audit reports **zero vulnerabilities**.

Generated coverage includes exact file/command/MCP inputs/results, actual
question answers versus stop, original model/context/captured rates, public-only
reasoning, atomic skill/grant rollback, UTF-8 paging, reused call IDs, shared
cancellation cursors, bounded live tails, late results, source restart and
schema-44 ciphertext preservation. Hidden UI coverage exercises hover/keyboard
copy/info, stale-session isolation, reduced-motion timers, compact layout and
unchanged warned hard-budget controls.

No real microphone, speech weights, personal authorization or paid inference
was used. The skipped current SendBox workload, real ASR accuracy, Linux UI and
signed/notarized release remain unqualified. Historical protocol-44 results
below remain separate; current source does not relabel them as new acceptance.

## Desktop interactions

Open a Local session's **Browser** pane and turn on its top **Agent control**
switch to let the agent use that existing isolated page. An empty pane is
enough: the agent can navigate allowed sites automatically or request approval
for an unlisted site in Manual/Guided. Builtin MCP search
for `browser` or `navigate` exposes status, navigation, bounded accessibility
snapshots, clicks, text-field input and allowed keys. Reads/interactions bind
the exact `expectedUrl` returned by status/snapshot, never a replacement page.
The native view filters redirects, subresources and WebSocket requests against
that admitted scope. Turning the switch off revokes access and cancels pending
actions; turning it back on creates fresh authority, never replays an old call.
Closing/reopening, profile switching and service restart all leave control off.
Permission/autonomy changes revoke the original control too. Direct user
navigation turns Agent control off and unloads the prior agent-controlled
document before releasing its retained network filter.
No personal browser, account cookies, browser download or debug port is used.
Password/file fields, uploads/downloads and popup windows are unavailable;
agent-triggered JavaScript confirmation dialogs are dismissed, never accepted.
Sandbox/Remote browser control and Stainless diagnostics remain unqualified.
See the [browser contract](architecture/agent-browser.md).

Protocol 44 introduced these interaction changes. Protocol 60 leaves Dashboard,
Suggestions and Automations in the left sidebar, removing Global Terminal;
Artifacts/Candidates/Sandbox are Settings sections. The right rail is reserved
for Terminal, Browser, Insights, Changes, Files, Plan, Side chat, Code change
and Work item. Its two link panels are per session. Global actions and existing slash commands
retain their independently scoped source selection. Attention remains in the top bar. The unified New
chooser and project-free navigation remain available.

| Attach menu | Shortcut | Selection |
| --- | --- | --- |
| Project file or folder | `@project-name/path` | Explicit named Local project; the selected Local session uses its bound worktree |
| Issue or pull request | `#137`, `owner/repo#137` | Current project's GitHub upstream, or an explicitly named repository |
| Session | `:session-name` | Dropdown of non-archived sessions in this profile |
| Local file | `^/absolute/file.pdf` | Source/text, PDF, DOCX, XLSX or supported image through one picker |
| Local folder | `^/absolute/folder` | Exact bounded file set and exclusions, reviewed before attachment |

GitHub files use `@owner/repo/README.md` through the GitHub chooser. Automatic
access tries the Local control plane's GitHub CLI account and, if unavailable,
uses only the public API with that boundary disclosed in the preview. Switching
access/source/destination after preview requires fresh review. Remote GitHub
files currently support exact UTF-8 text up to 128 KiB, not binary conversion.
Project-free chats must specify a repository for issues/PRs. Names of Local
projects contain only letters, digits, `-` and `_`; existing display names are
normalized deterministically, with collision suffixes, without changing IDs,
folders or repository files.

Click any attached chip to inspect the retained snapshot. Session context opens
as JSON, images open enlarged, and documents keep their bounded page/section/
cell previews. Image attachments stay compact in the composer and sent messages,
with a small thumbnail and filename. Only clicking or keyboard-activating an
attachment opens its image in the near-full-window viewer,
preserves its aspect ratio without cropping, and keeps Close/Remove visible on
smaller windows. Multiple attachments wrap as compact file-like chips;
hovering never expands an image. These are display changes only, not extra
image capture, model context or image processing.
Remove works on draft context, never deletes the original file,
and does not rewrite sent messages. Dropping a sidebar session onto the composer
attaches its content after source/destination review; it does not reparent,
resume or otherwise control that session. **Do not ask me again** suppresses
future session-attachment dialogs only. Source/digest, profile, destination and
draft-revision checks remain enforced.

### Image preview display qualification

Inline images use compact 36x28-pixel thumbnails rather than expanded cards.
Only explicit activation opens the image-only dialog, which
occupies the available window, up to 1440x960 pixels, while preserving image
aspect ratio and keeping Close/Remove visible at 840x620. Text/document chips,
retained bytes, model context, permissions and source-file retention are
unchanged. Ten service/runtime/worker/SDK/native-host bundles are SHA-256
identical to the qualified backend checkpoint; no schema or dependency changed.

The preceding expanded-viewer checkpoint's complete hidden Electron run passed **168 cases, two skipped, zero
failed** (170 total) in **5.3 minutes**. The actual rebuilt app passes **11
image/browser cases in 29.7 seconds**. The fresh packed SDK/install/audit and
all 12 installed-worker probes pass; audits find zero vulnerabilities.
An existing hidden Remote resize fixture now keeps its own resize frames
running and awaits the real SSH grid growth acknowledgement before checking
shrinkage, without changing production behavior, sleeping or weakening the
comparison. Combined image/Remote cases pass three repetitions: **12/12**.

That checkpoint's native distribution remains protocol 56 / SendBox 0.2.4 with the
same pinned worker image. Its check passes in **4,224.97 ms**; the actual
**740,607,177-byte ZIP** passes the production update consumer in
**103,047.20 ms**. The **754,273,639-byte DMG** passes native Finder geometry
and unchanged-app integrity, SHA-256
`92d8ac5389a3489a0713c3bd4b795800d5c06908b3af33693f0453c06f7c32a2`.
This remains ad-hoc development signing, not notarization or physical
SendBox/Linux release readiness. Existing minimal SDK-host/chunk/optional-icon
notices remain disclosed. Screenshots and logs use only generated fixtures.

#### Compact attachment refinement

Attachments now stay as small file-like chips in both the composer and sent
messages, with a 36x28 image thumbnail and filename. Hovering does not expand
them; only click or keyboard activation opens the already approved large
viewer. The former large inline cards and their scrolling layout are removed.
Captured data, source files, model requests, removal ownership and all ten
shared/native-host bundle hashes remain unchanged.

The focused image/desktop interaction run passes **9 cases in 15.5 seconds**.
The actual rebuilt app passes **11 image/browser cases in 30.3 seconds**.
The fresh external SDK install, imports/declarations and all 12 installed
workers pass; audits find zero vulnerabilities. The broader desktop run is
**not clean**: 167 passed, two skipped and one timing-sensitive Remote console
resize check failed while sampling its SSH grid after native window growth.
This is retained in `compact-image-attachments-full-e2e.log`, not reported as
a passing full suite. Production terminal behavior is unchanged by this
image-only refinement.

The current native distribution check passes in **4,214.34 ms**. The
**740,607,115-byte ZIP** passes the production update consumer in
**112,654.00 ms**. The **754,273,679-byte DMG** retains the verified native
geometry and unchanged signed app, SHA-256
`cea9944c7b5a6fc4f27bb3bc199c696bfb46e30ecf915a60aa5c6338a357de52`.
Signing remains development-only; no personal browser, screen, credentials,
microphone, administrator install or physical VM qualification was used.

### Session ordering and navigation

Drag a session above or below a sibling to reorder it. Order is saved atomically
in the service and shared with desktop, TUI and SDK clients. It cannot move a
session across projects, parents, groups, pinned sections or archive sections.
Alt+Up/Down provides keyboard reordering; the session menu retains the other organization actions.
Double-click a session to rename it; its current name is selected in the
existing dialog. Single click still opens it, and Escape or Cancel leaves its
name unchanged.
`moguri session reorder ID...` and `/reorder-sessions ID...` require the complete
current sibling set, not a partial list. Settings, Issues and Archived toggle
back to the conversation when selected again in the left sidebar.

**Terminal** is session-owned. Project-free Local consoles start in configured
HOME, never the Moguri state directory or `MOGURI_STATE_DIR`; project consoles
use their actual bound worktree. The project menu's **Open project terminal**
selects an existing session rather than creating a global console or hidden
chat. With no project session, create/select one first. Global Terminal and its
scope picker are removed. Existing independent consoles retain their captured
roots and remain inspectable/closable through SDK/CLI, without input replay.
Allowed-env policy still applies. Use the session's Terminal panel or `/terminal`.
Explicitly opening an eligible terminal pane starts the
console without a Start button. Restoring a saved pane or reconnecting does not
replay a launch; existing authenticated owners are reused.

Closing a terminal pane asks for confirmation and detaches its view, leaving
consoles running. Its **Do not ask me again** option is saved in this profile.
The console's X button explicitly terminates that exact console without a
dialog. It never immediately relaunches a replacement. Both confirmation
preferences are available under **Settings > Confirmations**, including reset
to the default of asking.

Desktop **Ctrl+Space** is hold-to-talk: words stream into the current draft and
release flushes the final buffer without an Insert step or prompt submission.
Device-aware browser capture stays local, using 16-kHz PCM. Surrounding typing
is preserved; overlapping edits stop insertion instead of overwriting text.
Reviewed file/native transcripts retain their separate explicit Insert flow.
Native recording separately shows
Preparing, Recording and Finalizing: recording starts only after the pinned
runtime reports readiness. Its Stop allows up to one minute to drain the final
transcript instead of killing it after three seconds; cancellation still
discards output and escalates a stuck process. Automatic language selection
uses the runtime's native default. Stopping an existing native recording in
the composer inserts only its exact completed result into the current draft. Errors
are shown next to the active voice controls, not in a general Settings job log.
Runtime/model setup and explicit model-license consent remain required. Tests
use generated recognizers and Electron's generated audio device, not a personal
microphone or real speech model, so they do not establish actual ASR accuracy.

The additive schema-44 migration preserves ciphertext, receipts and existing
attachment grants. Restart the service and clients together; keep the existing
data directory and encryption backend. The root install uses maintained
encoding-sniffer and Node-native fetch compatibility instead of deprecated
whatwg-encoding/node-domexception chains; Electron and advisory fixes are also
included. See the [context contract](architecture/context-inputs.md#desktop-interaction-revision)
and [console ownership contract](architecture/terminal-reattachment.md#global-local-consoles-and-pane-confirmation).

### Protocol-44 source qualification

On macOS arm64 / Node 26, `npm ci`, type checks, the production build, the six
available baseline primitives and the moderate-or-higher audit pass. The root install emits neither
reported deprecation warning and the audit reports zero vulnerabilities.

The complete unit/integration/native-TUI run passes **1,082 cases**, with **nine
physical native-workload skips**, zero failures and a duration of **1,021.86 s**.
Complete hidden Electron acceptance passes **77 cases**, with **one physical
native-workload skip**, zero failures and a duration of **3.2 min**. This includes
actual session dragging/reordering, source and GitHub-file shortcuts, retained
previews/removal, saved confirmations, compact rail access, independent global
consoles, existing Local/SSH owner recovery, uniform Settings fonts and generated
slow-finalization dictation without draft loss or a generative-model request.

The actual packed external SDK passes all public entrypoint/declaration checks,
safe identifiers, shared sibling order, exact Local source resolution, profile
isolation, and SDK/CLI/TUI global-console retention after session deletion. All
**12 installed-worker acknowledgement/accounting/cancellation probes** also pass.
Legacy fixture corrections preserve strict migration rollback, ciphertext, keys,
receipts and unknown telemetry; no product assertion or admission gate was relaxed.

Microphone permission is synthetic in tests, recognizers and model bytes are
generated, and no real speech model, microphone, personal login or paid inference
is used. These results do not qualify real ASR accuracy, the skipped current
SendBox workload, Linux UI or a signed/notarized release. Existing OpenTUI FFI
and lazy Ghostty bundle-size notices remain nonfatal. Minimal external SDK hosts
can still see upstream npm warnings because dependency overrides are not inherited;
the [scoped host override](sdk.md#shared-interaction-apis) is documented separately.

## Document attachments and task completion

Protocol/database **43** introduced the 0.30.0-alpha.1 document slice. It extends the existing
attachment pipeline with validated PDF, Word `.docx` and Excel `.xlsx` snapshots.
Desktop **Attach > Local file** shows local extraction, exact cancellation,
ready/limited chips and bounded previews/search. **Local file** also accepts
source files such as `.java`; file/clipboard images keep their existing behavior.
Use the picker for documents rather than pasting an Office clipboard file.

CLI examples, with explicitly selected absolute paths and a session ID:

```sh
moguri context document /absolute/path/report.pdf --session ID
moguri context document-read ATTACHMENT_ID --session ID --filters '{"page":1,"limit":4096}'
moguri context document-read ATTACHMENT_ID --session ID --filters '{"sheet":"Sheet1","range":"A1:D20"}'
moguri context document-search ATTACHMENT_ID --session ID --filters '{"query":"literal text","limit":5}'
moguri context documents --session ID --filters '{"offset":0,"limit":5}'
```

TUI uses `/attach-document /absolute/path/report.docx`, `/attached ID`,
`/document-read ID {"section":2}`, `/document-search ID {"query":"literal"}`
and `/documents`. Ctrl+C during its capture requests only that capture's stop.
SDK/CLI capture IDs also support exact `cancelDocument` / `context cancel ID`.
Cmd/Ctrl+Enter continues to hold prompts without inference.

Original bytes and extracted content share the session/profile encryption
boundary. Models get descriptors, not complete documents. Bounded approved
tools use the authenticated snapshot broker on Local and pinned SSH; native
execution still needs an exact current-protocol qualified workload, never a
Local fallback. Tool-less chats or explicitly `toolInput: false` local models
preserve the draft/queue and explain the block.

Limits are 8 MiB originals, 32 MiB ZIP expansion, 200 PDF pages, 32 sheets,
50,000 actual cells, 2 MiB extraction and a 10-second resource-bounded parser.
The existing 16 attachments / 12 MiB aggregate counts original plus extracted
bytes. Exceeded limits, encryption, malformed files and unsupported active
content fail without truncation or draft loss. No OCR, external conversion,
external-link fetching, hidden inference or formula recalculation occurs.
DOCX extraction covers body paragraphs/headings/tables, not full visual layout.
See the [complete contract](architecture/document-attachments.md) for memory
watchdogs, provenance, recovery and supported limitations.

Existing state upgrades in place through additive schema-42/43 migrations.
Restart older clients and the service before connecting the matching SDK.
Keep the original state directory and encryption backend; do not delete state
to upgrade. Completed document snapshots survive restart without reparsing;
interrupted captures do not replay or consume the unsent draft.

Current source adds [estimated task completion](architecture/task-progress.md)
from protocol/database 42. Desktop and TUI always expose the bound-plan checklist,
rechecked every 15 seconds. Long-running tasks can include separately labeled
owning-model estimates at normal safe boundaries, not hidden polling inference.
CLI `moguri progress --session ID` and `/progress` inspect the same data.
These percentages do not complete a task or override its plan, policy or result.

### Protocol-43 source qualification

Type checks, production build, the generated document spike, dependency audit
and actual packed external SDK all pass. Full unit/integration/native-TUI checks
pass **1,068 cases**, with **nine actual native-workload skips** and no failures
(979.23 s). Full hidden Electron acceptance passes **70 cases**, with **one
native-workload skip** and no failures (2.8 min). Source and packed-consumer
audits report zero vulnerabilities.

The final compact progress layout preserves the original question/answer and
raw-result viewport assertions. No budget/context, permission, cancellation or
no-truncation gate was relaxed. See the [qualification history](architecture/document-attachments.md#final-source-acceptance)
for generated-fixture corrections and precise boundaries. A current protocol-43
SendBox image still needs separate qualification; old images and historical
milestone/release claims below are unchanged. Existing npm/OpenTUI/bundle-size
notices remain nonfatal.

## Owner-requested platform extension

The prior source uses protocol/database **41** for
[reviewed platform workflows](architecture/platform-workflows.md).
This extends, rather than relabels, the historical protocol-40 acceptance
below. Marketplace is repository-backed, with no new hosted account/service.
Private/workspace cache scope is npm/pnpm, Python, Rust/Cargo and Go; C# remains
deferred. The first-milestone estimate and unrelated roadmap gates are unchanged.

Desktop adds **Knowledge tiers**, **Lifecycle hooks**, **Marketplace**,
**GitHub workflows** and **Linear workflows** in Settings. Standard terminal
controls expose the same typed SDK authority, with dedicated CLI help and
shared `/knowledge`, `/hooks`, `/capability`, `/marketplace`, `/github`,
`/linear`, `/cache` and `/containment` commands.
Imports and rollbacks install disabled content, note injection remains
separately off, and every Git/Linear write requires its exact live review.
Optional Linear's existing board/team enable and masked keychain path remain.
Private registry credentials use `cache token ID` with piped stdin or the
native TUI's masked `/cache token ID` dialog, never composer text.

Guardrails can explicitly require **qualified SendBox** for new turns needing
whole-descendant containment. Native Local/SSH process groups are not a
substitute. Existing sessions retain their selected Env; unavailable current
image/release qualification blocks work rather than falling back. The current
source needs a fresh protocol-41 workload receipt; protocol-40 images below
remain immutable historical evidence.

See the [GitHub](architecture/github-workflows.md),
[Linear](architecture/linear-workflows.md) and
[scoped cache](architecture/dependency-cache-scopes.md) contracts for exact
supported operations, consent, failures and limits. Source qualification for
this extension is recorded separately from earlier archive/milestone claims.

### Protocol-41 complete source acceptance

The final native-enabled source passes **1,045/1,045 unit/integration/native
TUI cases in 935.17 s**, with **zero skips**, followed by **67/67 hidden
Electron workflows in 2.6 min**. The current immutable worker image also
passes eight actual pinned SendBox 0.2.3 cases, including observed living
double-fork/setsid/reparented descendants and verified exact VM absence.
The new containment primitive takes **2,902.53 ms**, with zero inference calls.
Its [release/image/payload pins](architecture/platform-workflows.md#protocol-41-source-qualification)
are distinct from the historical protocol-40 image.

Types, production build and the actual packed external SDK installation pass.
Root/React/Node/MCP entrypoints, real installed Git tag creation, tier
expiry/promotion, disabled marketplace/hooks, source-independent receipts and
the existing Local/SSH/role/budget contracts are exercised without personal
authorization or live paid inference. Source, image and external consumer
audits report zero vulnerabilities.

The failed sweeps and precise corrections are retained in
[the extension qualification](architecture/platform-workflows.md#protocol-41-source-qualification):
metadata-only cache lease lookup restores private no-source-probe guards;
generated SSH teardown retries only transient post-shutdown filesystem races;
UI assertions use the exact new consent and wait for the required asynchronous
model options. No admission/permission bound or no-replay assertion was relaxed.
Existing npm deprecation/script-review, OpenTUI FFI and lazy Ghostty bundle-size
notices remain nonfatal.

This qualifies the stated generated source and actual VM boundary, not a new
published app/archive, live GitHub/Linear entitlement, autonomous webhooks,
unattended evolution or completion of Milestone 1. Python/Cargo/Go are verified
cache-only adapters; Cargo workspace/alternate-registry support remains
explicitly unavailable. Native Local/SSH still lacks the qualified VM's
whole-descendant guarantee. CI remains main-push-only: no feature/PR workflow,
real main push, merge, rebase, release or tag is dispatched by this acceptance.

## Issue 17 source qualification

### Final protocol-40 source acceptance

The complete current source passes **956/956 unit/integration/native checks
in 854.52 s**, with no skipped cases on this macOS host. All **64 hidden
Electron workflows pass in 2.5 min**. The exact current protocol-40 image is
qualified against released SendBox 0.2.3, including actual guest tools,
Manual approvals, project-free paste paging, acknowledged cancellation,
guest loss, real controller SIGKILL and late metering without replay.
Its immutable pins and narrower networking boundary are recorded in
[the native qualification](architecture/sendbox-0.2.3.md#protocol-40-source-requalification).

Type checks, production build and actual packed external SDK installation
pass. `npm run verify:sdk` exercises root/React/Node/MCP entrypoints, the
installed runtime/worker/CLI and an actual 126-token generated
solver/decision/solver sequence, independent export/deletion/reopen, plus
the existing Local/SSH contracts. Source, image and external-consumer audits
report zero vulnerabilities.

The initial full run found one old assertion expecting
`budget_plan_capacity` after policy had already fallen below held capacity.
The current guard correctly reports `budget_exhausted` before dispatch.
The regression now also checks the unchanged complete hold, zero started
entries and zero remaining capacity. The 25 affected budget cases and the
complete 956-case rerun pass; no production cap or admission check was relaxed.

Existing npm deprecation/initial package script-approval notices,
OpenTUI experimental FFI and lazy Ghostty bundle-size warnings remain
nonfatal. Injected persistence/scope failures and generated server loss
produce intentional diagnostics. No personal login, live paid inference,
real microphone or uncontrolled source checkout is used.

This qualifies the stated generated source boundary, not a new app/SDK
archive, billed-usage guarantee, calibrated model quality or completed
Milestone 1. Jev's missing enforceable output bound, endpoint-only cold
provider networking, Remote/native compound/Max/wind-down and the disclosed
native side-panel/extension gaps remain blocked. Detached/reparented
Local/SSH containment remains unproven. CI stays main-push-only, with no
feature/PR trigger, release/tag, main push, rebase or PR merge.

### Protocol-36 context-only acceptance

The shared working-window and scoped-paste slice uses protocol/database **36**.
SDK, CLI, actual native TUI and hidden desktop checks cover maximum/half and
declared windows, actual request/role bounds, exact 50/51-line capture, CRLF/CR/LF
and Unicode, bounded Local/SSH reads, stale approvals, failed persistence,
concurrent edits, independent child grants and schema-35/restart/no-replay.
Incompatible settings-only/tool-less chats retain files and fail explicitly.

That protocol-36 context-only source checkpoint passes **843/843** full unit/integration/native
checks in **656.46 s**, followed by **56/56** hidden Electron workflows.
Type checks, production build and `npm run verify:sdk` pass. The external
consumer installs/audits the actual packed SDK and exercises all entrypoints,
exact paste/queue/deletion isolation and the existing owned Local/SSH runtime.
Source and consumer audits report zero vulnerabilities. Generated fixtures use
no personal credentials, live inference or real microphone.

The first full run exposed nine manually constructed legacy fixtures retaining
the new schema-36 marker; their future-marker cleanup is corrected, without
relaxing production migrations. The installed-paste check initially matched
error wording instead of the actual typed `attachment_session` code; it now
checks that code. The native composer also ignores deferred programmatic
CRLF-normalizing change events rather than treating them as concurrent edits.

Existing npm deprecation/initial file-package script-approval notices,
OpenTUI's experimental FFI warning and the lazy Ghostty chunk-size warning
remain nonfatal. CI is still main-push-only; no feature/PR run is dispatched.
No earlier app/SDK archive is rebuilt, no release tag is created, and test
counts do not establish calibrated quality or completion of issue 17.
Those context-only results do not qualify public Cascade/Critique, finite
kupo wind-down/authorized checkpoints, System One/Max or production Sandbox.
The later source checkpoints below record their own narrower evidence.

### SendBox image compatibility and failed verification

Under **Settings > Execution & permissions**, review and save the exact
SendBox installation, immutable workload image, worker/bridge digests and
network hostnames, then explicitly verify. A syntactically valid configuration
can still pin an incompatible workload: the historical image
`sha256:517fba3d59a3be64c04166dff9de038168580ce67315c4de538503636e3680b0`
uses protocol **50**, not the current **51**. Use the actual matching image
receipt; changing JSON version fields cannot upgrade those bytes.

Version refusal now names the guest and required protocols before initialization
or provider access. New failed probes retain their original signed guest identity
for exact cleanup. Earlier failed private intents are not silently cleared,
adopted or replayed. An original unconfirmed cleanup record is not proof that
a guest is currently running or permission to stop one by name.

If verification instead reports a provider-network failure, review the actual
proxy/DNS boundary. API-only access may reject the provider's current DNS alias.
No alias is added automatically, and offline guest qualification does not
establish Copilot connectivity. Sandbox consoles remain unavailable independently
of core native-agent readiness. See the
[protocol-51 bootstrap contract](architecture/sendbox-0.2.3.md#protocol-51-bootstrap-and-private-qualification)
for ownership, cleanup and network limitations.

### Native service/SDK development checkpoint

Current source adds protocol/database **37**, not a new qualified archive.
Explicitly reviewed SendBox 0.2.3 release/image pins can now qualify the actual
guest and prepare a bounded private text stage through the SDK. Model/worker
calls run there, with Manual approvals, scoped pasted-file reads, the shared
budget ledger and verified original VM cleanup. A project-free model root stays
null. Source files are copied only by separately reviewed actual-user publication;
source index/HEAD and unrelated edits are not staged, committed or reset.

Six opt-in actual-native cases pass in **19.59 s**: pinned guest qualification,
encrypted IPC/failed rollback, ordinary SDK model/tools and source publication,
project-free long-paste paging, acknowledged cancellation/unknown holds, and real
controller SIGKILL followed by late usage reconciliation without a new call/VM.
Inference and metadata responses in these cases are generated inside the guest,
not live Copilot networking or billed-usage evidence. The endpoint-only cold
network gate remains separate and failed; no alias is added automatically.
The latest ordinary execution/publication case passes in **4.08 s**.

Run the actual native cases only with the exact current generated image receipt:

```sh
MOGURI_NATIVE_INSTALLATION=.native/sendbox-0.2.3/installation.json \
MOGURI_NATIVE_WORKLOAD=/absolute/path/to/current/qualification.json \
node --import tsx --test --test-concurrency=1 \
  tests/sandbox-runtime.test.ts tests/sandbox-service.test.ts \
  tests/sandbox-recovery.test.ts
```

Without these explicit receipts the cases are skipped, not counted as native
qualification. The additive migration preserves ciphertext, command receipts,
scoped files and unsupported saved windows through failure/reopen. Native
records/results/publications have independent report grants; deleting a source
conversation does not erase them. Private stage directories and SendBox's own
snapshot store are not claimed as cryptographically deleted or reclaimed.

CLI/TUI and hidden desktop now expose that same native authority. Guardrails
requires saved reviewed artifacts/network scope and explicit model-free
verification. Select Sandbox without changing autonomy or choosing a substitute
model, open **Sandbox**, preview exact source text, confirm the file set, then
prepare the private stage. Ordinary Send and Manual approval controls remain
shared; Cmd/Ctrl+Enter still holds rather than runs.

The actual TUI native keyboard flow passes in **3.97 s**, including held queue,
guest tools, human approvals and separately confirmed source publication.
The hidden desktop native flow passes in **6.5 s**; its independent retained-data
review case also proves that an existing report is not readiness. Output review
is consumed on publication and focus moves to the real job outcome. Native
report editors change only metadata, not original bytes or acceptance.
The actual guest-loss SDK case passes in **3.42 s**, retaining partial work and
unknown capacity without conflating the host CLI's code with the signed runtime
exit. Additional real controller-SIGKILL cases before/after the first source
copy preserve original publication attempts and lost-receipt idempotence.

Dedicated CLI uses `moguri sandbox status|runs`, explicit
`probe --confirm-review`, `preview/prepare PATHS.json --session ID`, retained
`execution/result`, and `publish-preview/publish RUN_ID PATHS.json` with separate
digest/revision/`--confirm-write`. Shared terminal commands use `/sandbox`;
`/sandbox preview PATHS_JSON` returns the exact confirmation command rather
than staging automatically. `--help` and `/help` list inspection, exact-run
stop, reconciliation and publication-job cancellation.

Other environment/autonomy combinations still require acceptance. Native console, MCP, memory, subagent,
evolution, Git-stage views and native plan writes fail explicitly instead of
using a Local source root. Public compound, wind-down and Max remain open.

The committed native checkpoint at `b16ce0e` passes **874/874** full local
checks with the actual native fixture enabled in **705.52 s**, then **58/58**
hidden Electron cases in **2.1 min**, plus the actual packed external SDK
install/type/runtime/CLI verification and zero source/consumer audit findings.
The first sweep caught a shutdown-order regression: an early native cleanup
await could let a held Remote secret write start a PTY before cancellation.
Cancellation is now signalled synchronously before cleanup is joined; its
actual held-write and native/restart checks pass. The failed sweep is not a pass.
The refreshed no-cache workload receipt is
`sha256:b03ab376659754d5332cbab352ab3637bb8f6be9e7fc5ae1895a5be183c5e067`.
This records that checkpoint, not public compound/Max completion.

### Reviewed Local compound source checkpoint

Current source uses protocol/database **38**. In **Settings / kupo routing**,
choose **Reviewed Cascade / Critique**, review the complete explicit policy
JSON and save it. Models remain unselected until the user chooses kupo.
Declare exact Cascade draft/escalation IDs or Critique draft/critic IDs from
the available configured catalog. Hosted/network data needs explicit consent.
Critique additionally requires an exact-model, source-backed lineage review:
paste the source and limitations, review the pair/expiry, add its draft claim
to matching routes, then separately Save settings. This never fetches a URL
or inspects provider metadata, and the claim is not proof about training or
model quality.

In a Local project agent, open **Candidates / Reviewed Cascade / Critique**.
Select two distinct clean owned worktrees and an actual user-configured
project validation script. Review the exact task, optional request plan and
architecture, selected source/new files, bases, eligible roles, privacy and
model cost. Starting pays only for owned bounded model roles. It does not
approve staging, execution or source changes. Selected source bases must
match the clean committed candidate bases; dirty selected input is rejected,
not silently dropped. Unselected source/index edits remain untouched.

Each proposal pauses for exact candidate plan/architecture/implementation and
host-command review. Explicitly approve **Stage and run reviewed project
tests** or decline. Manual permissions, hard denials and folder restrictions
remain authoritative. Failed drafts stay in their original worktree; one
configured Cascade escalation or eligible Critique/revision can use the
alternate. A passing critic cannot override failed tests. A recommended
candidate is not accepted source: **Inspect recommended candidate**, then use
the independent **Review source application / Apply reviewed files** flow.
No dependency install, Git stage, commit or push is implied.

Shared terminal commands are `/compound preview INPUT_JSON`, its returned
`start SHA confirm-cost INPUT_JSON`, `/compound validation ID` for the exact
next staging/test confirmation, `read ID`, `deny` and exact `stop`.
`moguri compound preview INPUT.json --session ID` takes the same selection
without a `sessionId` override in JSON. Dedicated CLI `start` needs
`--digest SHA --confirm-cost`; `review ID VALIDATION` additionally needs the
actual revision/digest and `--confirm-stage-and-test`. `read`, `validation`,
`deny` and `stop` inspect or control only original retained work.

Composer drafts, typed attachments and held prompts are not consumed or
silently included in these explicitly selected inputs. Ordinary Send/Resume
cannot turn a held compound prompt into an unreviewed Single call. Public
reports and raw role/test data are independently retained; source application
and Git authority remain separate. Metadata editors cannot replace those
documents. Artifact export schema 7 includes actual role/test history and
candidate-origin copies.

The source/client qualification and remaining gates are recorded in
[the public compound contract](architecture/compound-workflows.md).
Remote/Sandbox compound transports, finite kupo wind-down, authorized accepted-
work checkpoints and System One/Max remain unqualified. Native Local commands
do not prove detached/reparented containment. The schema-38 workload must be
rebuilt/requalified before native acceptance; older image pins are not reused
as evidence for this source.

## Supported checkpoint

### Protocol-39 reserved wind-down development

The current [Local wind-down lifecycle](architecture/budget-winddown.md)
adds explicit `settings.winddown`, default off with no model. Configure it
in **Settings / Budgets / Budget wind-down policy** using an exact available
model ID, separate hosted metadata consent, full output tokens and a deadline.
Saving performs no inference or Git operation. Eligible finite Local kupo
controls then use actual service readiness, not a client-only bypass.
Remote/native finite kupo remains unavailable.

Single reserves one complete finishing role with the original turn. Compound
reserves its router and finisher atomically before a request. Ordinary calls,
complete future route batches, the finishing call and every inherited
session/profile/global unit share the same ledger. When ordinary work cannot
fit, only its original held metadata-only finishing role may run; the
interrupted task is not labeled complete. Unknown usage remains held.
A newly stricter cap below actual/held charges blocks even that dispatch.

The model receives canonical call-count/token aggregates and digests, not
raw task text, code or chat history. Its summary is not validation, source
acceptance or Git approval. In **Candidates / Budget wind-down checkpoints**,
separately choose actual-user **applied** candidates, review the exact source
bytes/modes, current root/base, new local branch and message, then confirm
**Create reviewed local checkpoint branch**. A temporary index and explicit
`--no-gpg-sign` preserve the real source index/HEAD and unrelated staged edits.
No checkout, push, merge, rebase or branch deletion occurs. Decline, partial
publication and controller loss retain original observations without replay.

SDK `winddown.status/list/read/stop/decline`, `commitPreview/commit` and
`waitCommit` are shared by all clients. `/winddown commit-preview JSON`
returns a separate exact `confirm-git` command. Dedicated
`moguri winddown preview INPUT.json --session ID` and
`commit INPUT.json --session ID --revision N --digest SHA --confirm-git`
use the same reviewed input without a session/root/profile override in JSON.
Readiness, unknown accounting and actual publication are displayed separately.
Artifact export schema 8 retains the original role and separate actual-user
Git history; metadata editors cannot replace it.

The schema-38-to-39 migration preserves exact encrypted compound roles/tests,
receipts and independent data through failure/reopen. This is source
qualification, not a new archive/release or the final issue-17 sweep. The
final protocol-40 worker image is covered by the fresh source acceptance above.
Detached/reparented containment remains unproven.

### Protocol-40 bounded decision providers and Local Max

The [owned decision contract](architecture/owned-decisions.md) adds an
explicitly selected bounded-model System One-compatible alternative over the
existing root-less worker, authorizer and all-role ledger. It is not Jev and
does not infer calibrated quality, training independence or new permissions.

In desktop **Autonomy / Decision provider settings**, edit the complete
**Decision provider policy** using one exact available model ID from the
disclosed list. Defaults are disabled, no model, no hosted consent, 512 output
tokens, a 15-second deadline and four total decision/steering calls per turn.
Confidence and selected probability have separate 0.9 thresholds; these are
user policy, not calibrated reliability. Do not put credentials in JSON;
configure the selected endpoint's explicit secret backend separately.
Save settings, then separately choose **Autopilot Max**. Saving never changes
the solver, Env or budget and never starts inference.

`reviewDelegatedTools` can allow, decline or escalate only an already allowed
exact user tool/command delegation. An ordinary `ask` remains human; hard
denial wins before a paid role. `technicalQuestions` may contain explicit
`{id, kind: "technical-choice", question, choices}` entries. Only the exact
question and identical choices, with freeform disabled, may be answered as
the actual `decision-provider`. Unseen questions and user-only facts stay
human; no answer grants tool/Git authority or consumes a human draft.
When answer retention is enabled, its original scoped decision input/result
evidence is independently retained too.

Optional `steering` starts off. Its `steeringChoices` are exact user-authored
`{id, text}` alternatives; `continue` and `askUser` are reserved. The real safe
solver boundary can apply one bounded choice, add nothing, or pause for human
review. Human queued steers/mode changes win. Solver context labels provider
steering as untrusted data, not a fabricated human message.

Use SDK `decisions.status/list/read/stop`, shared
`/decisions status|list|read ID|stop ID confirm-stop|set POLICY_JSON`, or:

```bash
moguri decisions status --session ID
moguri decisions set POLICY.json --confirm-review
moguri decisions list --session ID
moguri decisions read DECISION_ID
moguri decisions stop DECISION_ID
```

Desktop **Artifacts / Decision-provider observations** shows the actual
actor/model/step, raw evidence, charges and cleanup. Generic document editing
is metadata-only. A human can answer/approve while the decision is in flight;
that real answer wins, cancels stale advice and never refunds unknown usage.
Source/report deletion and restart cannot replay a paid call or tool.
Applied tool/steering receipts keep their own original evidence grants too:
deleting the separate report cannot invalidate the still-retained conversation.

The current Jev API has no enforceable output-token-limit field. Its saved
configuration stays visible, but Max remains blocked with that exact reason;
there is no invented `max_tokens` or generative fallback. Remote/native Max
also stays blocked rather than making its calls on the controller.
Fixed and kupo Single solvers work independently of Local Max; reviewed
compound staging/tests/source/Git still need their separate actual-user gates.
The additive schema-39-to-40 migration preserves original encrypted
wind-down data, receipts and charges without a state reset.

[Laya is evaluated as an optional separately installed decision service](architecture/decisions.md#laya-optional-provider-evaluation),
on the same laptop or at a user-managed endpoint. It is not yet supported by
the policy settings or local chat-model configuration. Moguri does not install
Laya, download its weights or silently use it instead of Jev.

The earlier focused source/SDK/CLI/TUI checkpoint passes **34/34 checks in 8.55 s**.
Six hidden desktop checks, including the existing composer regressions, pass
in **8.3 s**. These generated mechanics are not live Jev/Copilot quality,
provider-side cancellation or billed cost. Final generated full/packed/native
acceptance is recorded above rather than inferred from those focused totals.

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

The TUI composer uses **Enter to send** and **Shift+Enter for a newline**.
Cmd/Ctrl+Enter still holds without running; Shift+Cmd/Ctrl+Enter sends now.
Settings/JSON editors keep their separate Ctrl+Enter save action. Shift requires
a terminal that reports the modifier; OpenTUI negotiates its existing enhanced
keyboard protocol, and Ctrl+J remains a newline fallback in legacy terminals.

Moguri's effective model prompt includes first-party product/setup facts even
in project-free chats and with a custom editable system prompt. It knows this
repository, the source-build commands above, the TUI/desktop entrypoints and
current alpha/platform limits without asking for Moguri's official guide.
This does not inspect an installed version, account or current client, publish
an npm package, enable repository memory, install anything or grant permission.
Saved prompt settings are unchanged; running turns keep their captured prompt.

## Sign in with GitHub Copilot

Desktop: open **Settings / Models / Providers**, choose **Sign in** under
**GitHub Copilot**, then
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

## Lean tools and coordinated work

Moguri starts normal solver turns with a small typed catalogue. The model uses
`discover_tools` to load relevant file, search, data, document, web, process or
coordination schemas. Empty-query pages and exact tool names remain available.
Complete required role evidence and repository instructions are not silently
summarized. Enabled skill bodies load through `use_skill`, not all at once.

`read_file` returns a whole-source digest and compact structural/line/byte views;
`edit_file` applies exact unique replacements. `find_files`/`search_files` honor
nested ignore files and protected/denied paths. `query_data` uses core YAML/JSON
plus a disclosed stdin-only jq subset. Local search/query require `rg`/`jq` on
the actual host (for example an explicit `brew install ripgrep jq`); tools never
install them or fall back to another environment.

`write_document`, `inspect_document` and `edit_document` create/read/edit actual
bounded PDF/DOCX/XLSX files with exact source digests. Unsupported structures,
PDF characters/layout editing and OCR fail explicitly; formulas never execute.
Project SQLite reads and approved transactions are separate from service-backed
todo/memory SQL. Model state writes can update an explicit task plan and
current-session Sky notes, never raw state storage, memory promotion or opt-in.

Browser-free `web_search` uses public keyless search; `web_fetch` retrieves a
selected page. Provider challenges are errors, not empty success or a hidden
switch. Optional Firecrawl/self-hosted/API search stays behind an explicitly
configured, approved MCP server. `create_issue` previews then separately creates
an exact GitHub/Linear issue through the configured Local account/team pipeline.
Its actor stays model, not user acceptance.

`/review [PROMPT]`, `/security [PROMPT]`, `/performance [PROMPT]` and
`/debug [PROMPT]` investigate and fix within the session's existing controls.
Defaults cover current changes/relevant code, or the project when clean.
Debug can inspect the session-owned app/Agent logs and an explicitly configured
approved DAP adapter. Other targets need explicit selection. None of these
commands changes Env, model, autonomy, permissions or budget.

In **Side chat / Main and child sessions**, inspect public transcript/progress,
send advisory messages, review/revoke exact root grants, or explicitly dispatch
an agent child's task. A side chat can read/message its actual main but stays
read-only. Separate agent children start Manual. Questions and approvals are
answered through their original owning controls, never by sending a message.
Advisories do not start a paid reply or consume the target draft. Queued work/
messages whose original grant/root changed stay retained, not fresh execution
or model context. Sidebar reparenting grants no authority.

**Terminal / Agent / Owned command and watch jobs** shows explicit Local watches,
original logs, observed wall time/output and actual stop/partial outcomes.
Inspect a partial job's captured root/processes, acknowledge its exact digest,
then Resume separately. Neither acknowledgement nor a saved PID proves cleanup.
Ordinary `run_command` never becomes an implicit successful background watch.

The same SDK powers `/tools [OFFSET] [QUERY]`, `/tool NAME SCHEMA_SHA JSON`,
`/tool-result STEP CALL [OFFSET]`, `/state SELECT_SQL`, `/watch` and
`/coordinate`; CLI accepts the same names without `/` and with `--session ID`.
Use `/help` for exact review/inspection arguments. User tool jobs are
Local-only; model-turn-only capabilities cannot be promoted into standalone jobs.
See [SDK examples](sdk.md#lean-tools-and-session-coordination) and
[boundaries/evidence](architecture/lean-tooling.md).

## Work and approvals

The composer exposes **Env**, **Model**, **Autonomy level**, **Budget** through
compact icon/name controls rather than separate labeled rows.
Factory values are Local, unset model, Manual and Unlimited. Current execution
is Local, explicitly qualified native Sandbox or pinned SSH with fixed
Copilot/configured local models and Unlimited or explicit estimate-based caps.
Opt-in kupo Single uses its approved transports; finite Local routing needs
the explicit reserved wind-down policy above. Manual remains default; Guided displays model
advice but needs human confirmation. Autopilot is selectable in project and
project-free chats, including when no tool grants exist. Only explicitly
delegated tools/commands run without asking; selecting the mode grants nothing.
Local Autopilot Max needs its
separately configured compatible bounded decision provider. Jev and
Remote/native Max remain unavailable.
Unready choices explain the limitation
or fail with a typed error; no fallback to Local or another model is possible.

**Model / Working context** offers the model maximum and its integer-floored
half as presets, omitting windows below 8,192 tokens. Without discrete provider
restrictions, `/context-window N` or `/model-settings {"contextWindow":N}`
accepts any exact integer from 8,192 through the model maximum. The menu also
shows a valid exact selected value. Actual provider-declared working windows
remain an exact allowed set rather than a range. `/context-window min|max`
selects the actual allowed endpoints; `half` floors half the supported maximum
and fails if that result is too small or not provider-declared, never clamping
or substituting it. `/model-settings` in desktop, TUI or `moguri slash` shows
the current service settings and estimate.
`/model-settings reset` restores the model default. An unsupported saved value
stays visible and blocks inference until explicitly corrected. No history is
silently truncated and context/output counts remain estimates.

`/thinking LEVEL` and `/effort LEVEL` are equivalent. They accept only the
selected model's actual effort levels; `default` clears effort without clearing
the working window. Context-only changes preserve effort and do not change the
remembered model selection. Kupo does not accept fixed-role tuning overrides.
Protocol 69 only advances service/state metadata for these shared validation
rules; encrypted history, receipts, budgets and source grants are unchanged.

Each response can use the model's declared output maximum within the selected
context window and its headroom; Moguri does not impose a separate 8,192-token
response ceiling. Reasoning shares the response allowance. Session/profile/global
token or USD caps can still reduce the actual forwarded limit. If the provider
exhausts it, the turn stays partial and shows that exact limit; pending tools
from the incomplete response do not run. No automatic retry, model fallback or
budget increase occurs. See [response and reasoning bounds](architecture/model-controls.md#per-response-output-and-reasoning).

Tools use native policy, a scoped website allowance, exact human approval or
explicit user delegation. Scripts and external MCP calls are not native-safe
merely because their names or annotations say "read". Deny wins.
Blanket shell/wildcard allow grants are rejected; shell grants name the exact
command string. File tools list/read/write approved project content; writes require
the fresh digest returned by a read, or `absent` for a new file. An ordinary
`read_file` refreshes a stale digest explicitly; its `sourceVersion` reports
the change and stale byte continuations restart at zero. Use
`requireExactVersion: true` only for an intentional pinned read. Stale writes
and edits still fail instead of substituting versions. Protected credential
paths and symlink escapes are rejected. Full text reads/`write_file` are limited
to 128 KiB; selective reads and exact `edit_file` support sources up to 1 MiB.
For `read_file`, literal `search` or byte `offset`/`limit` selects at most
16 KiB even when `mode: "full"` is also present; only unpaged full mode uses
the smaller source cap. A missing literal match succeeds with empty text.
Invalid tool arguments identify the schema fields and constraints to correct,
without echoing submitted values or executing an operation.
Builtin MCP `grep_logs` supports a 1-MiB UTF-8 source and returns up to
100 matching lines, 1,000 characters each, within 12,000 serialized UTF-8 bytes,
with byte offsets and explicit
clipping/omission flags. Use `read_file` for exact source paging or
`search_files` for regex/larger sources.
Structured binary documents have their separate 8-MiB parser/authoring boundary;
at most 16 snapshots and 512 KiB of attached text are accepted.

**An approved shell command runs on the host without isolation.** The project
directory is its working directory, not an OS containment boundary. Review the
full command. Commands have bounded output/deadlines, cannot be left running as
implicitly successful background work, and ordinary `run_command` is owned by
the current turn. Explicit `command_job` watches have their separate captured
session/root/timeout owner and truthful inspection lifecycle described above.
The worker does not receive the local API token or refresh credential.
An external/script MCP call requires exact nested-tool approval or an existing
grant, plus a fresh schema/server fingerprint. Known builtin read/status tools
use native policy, and builtin web/browser tools use scoped website policy.
Tool annotations are not permissions. An external MCP
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

Text pastes over 50 logical lines become encrypted, immutable `paste_file`
attachments, preserving exact UTF-8 text and CRLF/CR/LF endings up to 128 KiB.
Desktop clipboard paste, TUI bracketed paste and SDK `attachments.paste`
capture immediately; ordinary SDK send and queue edits enforce the same rule.
Failed saves, overlapping edits or unsupported sizes preserve the complete
unsent draft. A trailing newline counts as an empty final line.
Model context gets only a scoped filename/digest descriptor. Approved
`read_file` calls read at most 16 KiB with UTF-8 byte `offset`/`limit` and
optional literal `search`; use the returned `nextOffset` to continue.
Local, SSH and qualified native workers use an authenticated controller snapshot broker, not a
host-path mount or source-file write. Project-free chats get access only to
their admitted files, never a previous workspace. Sandbox still requires its
separate execution qualification and cannot fall back to Local.

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

## Provider and model availability

**Settings / Models / Providers** lists this profile's providers and discovered
or explicitly configured models. Use the switches to disable a provider while
retaining its login/configuration, or keep just the models you want. Disabled
models disappear from selection lists and cannot be selected with `/model`;
Kupo and every new model admission use the same service-owned availability.
Already admitted calls retain their actual result and charges.

Models with the same exact upstream API ID share one row and an exclusive
provider dropdown. Choose a source explicitly when there is more than one.
An unavailable/disabled saved source never silently changes to another provider.
IDs are declared catalogue keys, not independent-family or quality evidence.
Current sessions and remembered defaults retain their original selection;
reenable it or explicitly choose another available model before new inference.

CLI uses `moguri models catalogue`, `models enable|disable API_ID`,
`models provider PROVIDER_ID enable|disable`, and
`models source API_ID MODEL_ID`. Writes accept an observed `--revision N`.
TUI and desktop share `/models catalogue`, `/models enable|disable API_ID`,
`/models provider PROVIDER_ID enable|disable`, and
`/models source API_ID MODEL_ID`; bare `/models` still opens available choices.
These profile preferences survive restart, never sign in or start inference,
and do not alter another profile. Local/SSH endpoint-enabled controls remain
consistent with provider-list changes. See the
[model-control contract](architecture/model-controls.md#provider-and-model-availability).

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
Omitting a model default uses the current profile's last explicit model/effort
selection; explicit `modelId: null` remains no model. A remembered choice
survives deleting its source session/project and restarting, but never grants
context or workspace access. Unsupported saved choices remain visible and
blocked rather than selecting a different provider. Fixed defaults and explicit
model-option overrides retain their normal precedence.

## Kupo automatic model

Connect a generative provider or configure a local model, then choose **Kupo**
in the Model dropdown. No separate classifier or approved-pool setup is needed
for the factory automatic policy. CLI/TUI use `/model kupo`; `/kupo status`
shows the exact policy, available models and service-owned capability inventory.

| Eligible configured models | Automatic behavior |
| --- | --- |
| 0 | Kupo remains visible but unavailable; no inference or fallback. |
| 1 | That exact model runs Single, without a classifier request. |
| 2+ | A bounded router selects Single, gated Cascade or an eligible Critique plan for the task. |
| 3-20 | All models retain their declared capability categories; the pool is not silently truncated. |

Kupo uses all eligible configured models by default, including later additions.
**Settings / Kupo routing** can disable automatic routing, disallow hosted/network
task-data transfer, or narrow the advanced policy to a nonempty explicit
`approvedModelIds` subset. Loopback describes the execution host, not a promise
that a configured proxy never forwards data. Remote inference stays on the
pinned SSH host and retains its separate credential grant.

Cascade gates each proposed response before its tools can run and permits one
bound escalation. Critique requires a current, exact, user-reviewed distinct
lineage pair and permits one same-model revision. Without that evidence the
router can select only another eligible pattern. Capability categories and
model verdicts are fallible routing advice, not measured quality, executed
tests or permission.

Only the selected response reaches existing Manual/Guided/Autopilot checks.
All actual router, draft, gate/critic, revision and escalation calls count.
Unknown accounting, invalid advice, stop or failed persistence blocks continuation.
Restart never replays paid calls or tools. **Insights / Kupo routing provenance**
shows the plan and actual per-call models.

Finite automatic budgets, images, per-model context/thinking overrides and
Sandbox response orchestration remain unavailable. A fixed model or the
separately reviewed worktree workflow retains its own qualified capabilities.
Restoring Kupo defaults enables the automatic configured-model policy without
selecting a model or starting work.

## Explicit Single routing policy

In **Settings / Kupo routing**, choose **Explicit Single policy**, enable the profile policy, choose one
discovered classifier, approve up to eight exact solver models and separately
allow hosted/network task-data transfer if any selected role uses Copilot, a
non-loopback URL or an unknown endpoint boundary. The configured provider's
local label is not sufficient. Known loopback-only pools can leave consent off;
this does not attest what a user-configured proxy does behind that URL.
Configured-model discovery and inference reject redirects. Saving performs no
inference and does not select a model. Then explicitly choose **Kupo** in the
composer. This retained advanced policy is not the factory automatic policy;
no fallback is chosen for an invalid plan or unavailable pool.

TUI/CLI share `/kupo status`, `/kupo set POLICY_JSON`, `/kupo history` and
`/model EXACT_ID` through the SDK; for example, pass the literal reviewed command
to `moguri slash '/kupo status' --session ID`. Obtain actual canonical IDs from
`/models`, not invented endpoint names. A policy has `enabled`, `workflow:
"single"`, `classifierModelId`, `approvedModelIds`, `allowHosted` and
`minimumConfidence`; the [Single routing contract](architecture/routing.md)
documents its boundaries. `/model kupo` clears prior per-model options without
starting work. Restoring Kupo defaults switches back to the automatic policy
while preserving history and charges.

The tool-less classifier and selected solver use the same owned worker,
approvals, env and cumulative ledger. Both calls count, including rejected
advice; unknown telemetry stays held. **Insights / Kupo routing provenance** and
TUI `/kupo history` expose the actual plan/models; per-call accounting shows
actual roles. Confidence is model-supplied advice, not a calibrated probability,
user answer or authority. Stop/restart never replay routing or effects.

The explicit Single policy is text-only. Finite Local caps require the separate
qualified [reserved wind-down policy](architecture/budget-winddown.md).
Context/thinking tuning, images, calibrated quality and native Sandbox remain
unqualified. This policy never turns an ordinary prompt into the separately
reviewed worktree workflow or lifts a hard cap.

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
Send. While idle, holding Cmd/Ctrl visibly turns Send into a queue clock.
During an actual active turn the same button becomes a **red Stop icon**;
its acknowledged stop preserves your unsent draft. Enter still answers/queues
and Cmd/Ctrl+Enter still holds prompts. The delivery chevron retains explicit
Send/Answer/Queue, Steer and Interrupt actions while Stop occupies the main slot.
Unavailable execution/autonomy modes remain disabled with their reasons.

In both desktop chat composers, **Enter** sends and **Shift+Enter** inserts a
newline. **Cmd/Ctrl+Enter** still holds the prompt without running it;
**Shift+Cmd/Ctrl+Enter** retains the explicit send-now shortcut. Input-method
composition and held/repeated Enter never submit a prompt. Message copy buttons
appear on hover or keyboard focus. Conversation text uses the available chat
width rather than a narrow fixed column.

Drag either sidebar's inner edge to resize it, or focus its separator and use
Left/Right arrows; Home/End select the available minimum/maximum. Widths survive
desktop reloads and shrink as necessary to preserve chat space. The right
sidebar's **<>** button hides it; any labeled icon in the remaining rail opens
its panel, and clicking that same active icon again collapses back to the rail.
This also works from a maximized pane and with the keyboard. It follows the
same unsaved-edit and terminal-hide confirmation/opt-out checks as the header
hide button; hiding never terminates a running terminal. Those icons show tooltips on hover and keyboard focus. Unsaved panel
edits still block navigation and collapse.

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

Desktop toggle/dropdown preferences and model context/thinking choices save
automatically. Text/JSON settings have a **Save** beside the editor; the settings
toolbar can still save all pending text edits. Automatic preference changes do
not save unrelated text, even in the same settings section. An in-flight save
blocks conflicting navigation, and refusal or another client's revision keeps
the edit visible rather than silently overwriting committed settings. Budget
risk acknowledgement, source review, downloads and model proposals remain
explicit actions, not autosaved approvals.

**Sandbox is gated, not enabled by entering paths.** The development SDK now
has explicit 0.2.3 guest qualification, source review/preparation, execution
inspection/reconciliation and separately accepted text-output publication.
Guardrails requires separate explicit verification of the saved review. Exact release,
workload, current reviewed network scope and private staging are mandatory;
missing protection is an explicit error, never a Local fallback.

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

## Project-free chats, suggestions and ask Moguri

Desktop uses one **New** button. Choose **New chat** for a project-free
conversation, an existing project for a new session there, **Import local
folder** to attach an explicitly chosen directory, or **Clone repository** to
clone an HTTPS/SSH URL into a new folder before starting a project chat.
The general conversation section is **Chats**; there is no project dropdown or
separate import plus. TUI `/new global` does the same; Ctrl+N keeps the current
scope, or creates a project-free chat when none is selected. CLI:
`moguri session create` with no `--project`. Choose a model explicitly as usual.
Scope is fixed for that session, not silently rebound when a different project
is selected for new chats.

Ordinary **Local** chats capture configured **Home** as their initial working
directory, matching the private User console. Files, approved shell commands,
bounded command jobs, Agent output and configured global tools work without
selecting a project. Desktop **Files** reads that Home; **Terminal / Agent**
shows actual agent commands, separate from private User-console bytes.
Home is not a synthetic project or sandbox. A changed/missing directory fails
for filesystem work instead of selecting another Home, a previous project or
the state directory. Readback/browser status and model-only answers do not
silently acquire filesystem authority.

Manual approvals and remembered session/profile-wide grants work normally.
Explicit Autopilot approves supported tools automatically, not hard denials,
read-only/side restrictions, allowed-env policy or budget overrides. A Home
binding is not permission. Side chats may read approved Home files, never run
commands or edit them. A project-scoped remembered grant still needs a real
project.

Use an explicit `gh --repo owner/repo ...` target or `git -C /selected/checkout`
for repository work from Home. GitHub pickers, repository diff, project plans,
indexing and owned project publication still need a real selected repository.
No prior project/account is inferred and no login is automated. **Browser**
works in an ordinary chat after the user opens its pane and enables **Agent
control**, with the same exact page leases and normal approvals. Project-free
Remote/Sandbox transports do not use controller Home as a fallback.

Model-only chats remain parallel. Actual overlapping Home writers serialize,
including across profiles. An interrupted writer's unknown process/file effects
retain their original profile/root identity after restart or source deletion.
Desktop shows **Home needs inspection**; **Acknowledge inspected Home** records
actual-user risk acceptance, not cleanup proof, permissions or queue resumption.
CLI `moguri home status --session ID` and shared TUI/desktop `/home` inspect the
same retained state. After actual inspection, `/home acknowledge WRITER_ID
REVISION confirm-inspected` acknowledges only that exact writer. Resume paused
work separately. Autopilot, a new chat, navigation and deletion cannot clear it.
See the [Home execution contract](architecture/project-free-execution.md).

The current qualified Home build is
`release/Moguri-0.30.0-alpha.1-home-chats-72-macos-arm64.dmg`.
Use matching protocol-72 clients/service, quit the old app before replacement
and preserve existing state. This is ad-hoc-signed development output, not a
notarized or uploaded release. Full source, hidden desktop, actual packaged-app,
installed-SDK and integrity results are recorded in the
[complete Home qualification](architecture/project-free-execution.md#complete-protocol-72-qualification).

Cloning requires an existing parent folder and a new destination name. It never
overwrites a directory, initializes submodules, runs hooks/filters, logs in, or
starts inference. SSH uses existing keys and requires known-hosts verification;
HTTPS URLs must not embed credentials. Local policy and captured destination/
containing-workspace writer leases still apply. Cancel preserves partial files,
and restart or a missing response never automatically repeats the original job.
Inspect failed/partial jobs and destinations before a separate explicit action.
CLI: `moguri project clone URL /absolute/new-folder --confirm-write`.
TUI: `/clone {"repository":"URL","path":"/absolute/new-folder"} confirm-clone`,
then `/result JOB_ID` after the capability job completes. Existing local folders
can also be registered with `moguri project add /absolute/folder`.

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

**ask Moguri**, `/meta [REQUEST]` and `/metachat [REQUEST]` let you discuss
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

## macOS command-line installation

`Moguri.app` bundles the CLI, TUI, OpenTUI dependencies and shared pinned Node
runtime, even for desktop-only users. Dragging the app from the DMG into
Applications installs those files. It **does not launch the TUI or automatically
add `moguri` to your shell's PATH**.

Open the installed app yourself, then choose **Settings > General > Command line
> Install `moguri` command**. This explicitly creates an executable at
`~/.local/bin/moguri` for your macOS user, across Moguri profiles. It needs no
administrator access or system Node. Both it and the app's shipped
`Contents/Resources/app/dist/moguri` launcher `exec` the bundled Node runtime and
CLI, preserving arguments, working directory, standard streams, signals and exit
codes. Neither launcher opens Electron.

The action does not edit shell startup files. For macOS zsh with the default
`~/.zshrc`, run this once in your terminal:

```sh
{
  grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.zshrc" 2>/dev/null ||
    printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
} &&
export PATH="$HOME/.local/bin:$PATH"
```

Then run `moguri` to start the TUI, or `moguri --help` for CLI commands.
`command -v moguri` shows which command your current shell resolves. Adapt the
startup file if you use a custom zsh `ZDOTDIR`, Bash or another shell; Electron's
PATH is not proof of your terminal's PATH.

Existing files, directories and symlinks at the destination are never
overwritten. **Refresh command status** shows collisions and changed commands.
Inspect an existing command yourself rather than replacing it blindly. Shell
aliases or commands elsewhere on PATH can still take precedence.
The `.local` and `bin` parent directories must be user-owned, not
group/world-writable and not symlinks; no alternate destination is substituted.

**Remove `moguri` command** removes only an unchanged, reviewed Moguri-managed
launcher. It does not remove the app, its data, the bin directory or the PATH
line. The launcher binds the exact app location, not an app-name search or a
system Node fallback. If you move or rename the app, open that actual copy,
remove the old managed command and install again. A missing app/runtime/CLI
exits with code 127 and recovery instructions. If you deleted the app, reinstall
it before using the native removal action. A copy under `/Volumes`, a
translocated app or an unpackaged development client cannot install the command.

### Manual zsh workaround for older builds

For an older build without the native installer, this is a **manual workaround,
not the managed installation mechanism**. It assumes the trusted app is at
`/Applications/Moguri.app`, uses its bundled Node and refuses to overwrite an
existing launcher:

```sh
mkdir -p "$HOME/.local/bin" &&
(
  set -C
  cat > "$HOME/.local/bin/moguri" <<'EOF'
#!/bin/sh
exec "/Applications/Moguri.app/Contents/Resources/app/node_modules/node/bin/node" \
  "/Applications/Moguri.app/Contents/Resources/app/dist/cli.mjs" "$@"
EOF
) &&
chmod +x "$HOME/.local/bin/moguri" &&
{
  grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.zshrc" 2>/dev/null ||
    printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
} &&
export PATH="$HOME/.local/bin:$PATH"
```

Then run:

```sh
moguri
```

This workaround stays pinned to `/Applications/Moguri.app`. It has no managed
ownership record, moved-app diagnostics or native removal support, and an
interrupted write may leave an incomplete file. To switch to the native
installer, first inspect `~/.local/bin/moguri`. **Only if it is the manual
workaround you created**, remove it yourself with
`rm "$HOME/.local/bin/moguri"`, then use the native install action. The app will
not silently adopt or overwrite it.

The [launcher contract](architecture/cli-launcher.md) records publication,
ownership, recovery and qualification boundaries.

## Application and storage settings

**Settings / General / Application** controls the actual menu-bar icon across
all profiles. Profile settings remain independent. Native failures are visible
and can be retried from the saved application preference; hidden checks never
create a real menu-bar item.

**Settings / General / Private GitHub updates** uses a separate PAT stored in the
secure secret backend. It is not Copilot sign-in or `gh` authentication. Prefer
a fine-grained token limited to `mbianchidev/moguri` with Contents read access.
The password field has its own Save; the automatic-check toggle never commits a
pending token. By default the running desktop checks at startup and every four
hours, verifies and stages newer eligible releases, and announces availability.
Without a configured PAT the actual missing-credential status is shown; another
account/provider is never tried.

Apple signing is not a prerequisite. Ad-hoc/unsigned integrity checks are not
notarization or independent publisher signing: updates trust the exact configured
GitHub release repository and verified manifest/asset/bundle digests. Quarantine
and OS warnings remain. **Review install and restart** binds the actual old/new
bundle bytes, owned destination and retained previous-app backup. Only a real
packaged application can install; an unpackaged development build may check/
stage but cannot replace the checkout. Confirmation saves client drafts, stops
all owned profile work and restarts through a pinned current-code helper.
Authenticated terminals survive without input replay; unknown accounting stays
held. Interrupted/partial work is retained and never automatically installed
again. An OS launch request is not proof of startup; the next actual running
bundle must verify its retained version/digest. Inspect the retained journal/
backup after failure instead of deleting state or bypassing Gatekeeper.

CLI `updates status`, `history`, `read ID`, `check`, `cancel ID`, and
`install-preview ID` share the SDK. `updates token` accepts the separate PAT only
through piped stdin; `updates clear-token` removes it. TUI `/updates` supports
inspection/check/cancel, never credentials or application replacement. Packaging
emits `Moguri-VERSION-macos-arm64.zip` and the matching `.manifest.json`; both
must be attached to the same actual release. This task does not publish a
release, sign/notarize it, or qualify a personal private GitHub token.
The DMG contains the actual `Moguri.app` bundle and an **Applications** shortcut.
Drag the app onto that shortcut to install; the mounted image itself is read-only.
The shortcut is outside the app and is not included in the updater ZIP.
Development app bundles are kept under `release/builds.noindex/` so build
versions do not accumulate as launchable Spotlight duplicates. Distribution DMGs,
ZIPs and integrity manifests remain directly under `release/`.

After `npm run package:mac`, `npm run verify:update` runs the actual ZIP and
manifest through the production bounded extractor, full bundle inventory and
native identity/architecture checks, then mounts the DMG read-only without
opening Finder to verify the app and exact `/Applications` shortcut. No app is
launched. `npm run verify:update -- --dmg-only` checks just that installer layout.
Its owned mount is detached and temporary stage independently removed. Generated feed/helper tests remain separate
from this actual packaging roundtrip and from live release/PAT qualification.

**Settings / Sessions / Retention / Change storage location** reviews a complete
encrypted-store move, including every profile and independently retained artifact.
Choose an absent or empty private destination outside existing project, worktree,
data and locator roots. Review the exact source, destination, original resource
base and active-owner count, then explicitly confirm **Move store and restart
Moguri**. Other edits must be saved first. Model/tool work stops; uncertain
accounting remains held. Authenticated terminals survive the explicit restart
without replaying queued input.

Only the closed encrypted SQLite database moves. Captured project/worktree roots,
profile resources, caches, speech weights and terminal brokers remain at the
original resource base shown in review. The old encrypted database remains a
retired backup and cannot start a stale writer. Failed/partial targets are kept
for inspection, not deleted or retried. Default discovery changes only after
actual copied bytes and key identity are verified; the first target boot checks
the exact copy again. Never remove the original resources or private external
locator as a cleanup shortcut.

An explicit `MOGURI_STATE_DIR` is never cleared: restart without that override
before changing default storage. CLI `storage status`, `storage preview PATH`
and `storage move PATH --digest REVIEW_SHA --confirm-write` share the protocol;
restart CLI/TUI clients explicitly after a successful move. `/runtime storage`
and `/runtime storage-preview ABSOLUTE_PATH` provide terminal review without a
hidden session. Corrupt/missing location metadata or changed copied bytes block
startup; restore the exact original locator or copied database from the retained
backup instead of deleting state or forcing a stale writer.

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

Attention and completion sounds each start enabled with an original Moguri
earcon, while focused as well as in the background, independently from banners.
Saved explicit mute and focus choices are preserved; enable **Play application
sounds while Moguri is focused** if this was previously disabled.
Attention audio requires the exact pending question/approval or actual
failed/partial work, not a heuristic badge. Completion audio excludes stopped,
partial and failed work. Delivery rechecks the actual state after loading a
custom sound; reconnect does not replay offline alerts. Preview is
explicit; hidden generated checks suppress all speaker output. OS banners are
silent to avoid duplicate audio. System volume/device controls still apply.

Import a custom **mono 16-kHz PCM16 WAV, up to ten seconds**, in Notifications.
Choose it separately for either alert. The private encrypted snapshot survives
source-file/session deletion and restart. Select another sound before removing
it; missing audio never becomes a default silently. Each profile retains up to
32 sounds. CLI `notification-sounds list`, `import FILE.wav --confirm-write`,
`read ID`, and `remove ID --digest SHA --confirm-remove` share the same resources.
TUI `/notification-sounds` inspects/removes metadata without terminal playback.

## Session workspace and project settings

Right-click a project header, press **Shift+F10** while it is focused, or open
its **Project actions** button to choose an icon color. The same context menu
offers named red, orange, yellow, green, blue, indigo and violet presets, plus
a half-white/half-black pencil swatch for a custom color. It opens a preview
that changes the project only after **Save**; Cancel leaves the saved color
unchanged. There are no separate Default color or Custom color buttons.
Color picking is no longer part of the project settings form.

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
`/side` opens a separate read-only conversation and captures its original main
session's latest retained context whenever a new side question begins,
with separate usage, read approvals and cancellation. User-created subsessions
are attached agent sessions, not the optional model-subagent feature.
Side chat exposes its own **Model** selector. It inherits the current parent
selection at creation, but an unset/unavailable/synthetic selection requires an
explicit concrete model. Choosing it does not change the parent, Env or
read-only scope, and no failed model is silently substituted.
Protocol 58 adds explicit root-bound live messages/public inspection and
separate executable agent-child tasks without widening the side chat's mode.
Each new side turn atomically retains its own original-parent context snapshot.
Main work after the first side question is included in the next one; side
history is preserved, without injecting the same main history repeatedly.
An in-progress answer or tool continuation keeps its original frozen capture.
Unsent main drafts/held queues are not included. Missing parent/source/model
capability fails explicitly with the undispatched question preserved. Existing
captures survive parent removal; navigation attachments never change the source.
Live coordination grants remain separate, not an automatic tool/permission grant.
The [protocol-67 side-context qualification](architecture/session-reliability.md#protocol-67-side-context-qualification)
records coverage and the exact local development installer. Quit before
replacing the app, then reopen matching clients/service; retained state is
preserved, never deleted to upgrade.

The desktop rail exposes Terminal, Browser, Insights, Changes, Files, Plan and
Side chat. A connected PR remains available through `/pr`, not an extra rail icon.
`/terminal`, its requested `/termnial` alias and the
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

Terminal requires a selected session. A project-free chat opens the disclosed
HOME root without making it a model workspace; project consoles use their exact
project/worktree. Legacy null-session owners are never adopted by a new chat,
relabelled Remote or silently terminated when navigation is upgraded. Inspect
and close them explicitly with `moguri terminal list|read|reconcile|close`.

Opening Terminal explicitly starts or reuses the selected chat's qualified
console. Selecting another chat/project or creating a chat while that pane is
open carries fresh intent for its exact owner/root, not the previous chat.
Unrelated pending read/metadata requests cannot disable terminal startup or +;
only the console's own pending operation gates them. Actual failures remain
visible, with explicit + retry rather than automatic launch replay. Settings/
tab restoration and reselecting the same X-closed visible chat do not reopen it.
Sandbox user consoles remain unqualified and are labelled as such; Agent
command output stays separate, with no automatic Local fallback.

The terminal-startup follow-up is included in the rebuilt development app/DMG:
the final complete hidden Electron run passes 138 cases with two physical-native
skips, and 14 startup/sidebar cases pass in the actual packaged app. Exact
ownership, failure/retry, installation and artifact measurements are recorded
in [session-terminal startup qualification](architecture/sdk-platform.md#session-terminal-startup-qualification).

CLI `moguri terminal default-root` discloses the default without starting a
process. `terminal open --session ID --root /absolute/root` opens a
project-free Local console. TUI `/terminals open /absolute/root` does the same
for its selected session. Global creation commands are retired with an explicit
error; `/terminals` still includes retained legacy independent consoles for
inspection/read/close. The low-level SDK compatibility overload remains, not a
desktop or CLI creation surface.

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
restrictions. Repo instructions default to AGENTS.md (Agents.md is recognized).
Nested `AGENTS.md` and supplementary `moguri.md` inherit root to target; nearer
textual rules and same-directory `moguri.md` take precedence, never over hard policy.
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

Desktop dictation requests audio-only OS permission only on explicit activation.
**Voice input device** lists microphones after a separate explicit request;
non-default selection is exact, never silently substituted. Browser capture
downmixes/resamples locally to bounded mono 16-kHz PCM16 frames. A private,
authenticated loopback connection streams those frames into the pinned native
recognizer, which loads the already verified local model once. Audio, upload credentials
and audio fingerprints do not enter durable events, command receipts or model
context. Private crash staging is removed before another capture; unknown or
changed staging entries are retained and block capture with a diagnostic.

**Hold Ctrl+Space, speak, release.** Recognized words appear directly in the
owning main or side-chat textbox while speaking. Release flushes the original
buffer and replaces its provisional text once; it never sends a chat message.
The shortcut is always hold-to-talk and ignores terminals, dialogs and other
composers. Voice/Accessibility settings share an editable shortcut. Optional
microphone-button push-to-talk also supports pointer release outside the button
and Space/Enter on the focused button. Otherwise that button keeps click/start
and click/stop. The microphone icon stays visible and highlights while the
owning capture records, including activation through the keyboard shortcut.
Cold-start progress distinguishes model preparation from ready streaming.
The pinned native runtime can buffer its readiness log, so Moguri verifies the
exact authenticated local listener instead of waiting for that log to flush.
Capture errors retain the original recognizer diagnostic rather than a second
misleading missing-capture message. Use matching protocol-71 clients/service
for this repair; upgrading preserves existing history and model preferences.
Releasing before admission never opens a late microphone and explains why no
audio was captured, instead of silently returning to idle.
Repeated keydown and stop requests do not duplicate frames or finalization.
Blur, sleep, hidden/unmounted capture surfaces and profile changes discard active
microphone audio with a visible interruption reason; recognized words already
inserted remain in the draft. Hiding after release does not cancel the original
flush. Editing the dictated span or receiving a different client's draft stops
insertion instead of overwriting newer text. Typing before/after that span is
preserved. The native host stops its exact recognizer on controller-pipe loss;
restart never resumes a recording. Desktop captures are at most two minutes;
excess/invalid input is rejected, not truncated. The older SDK batch-WAV and
explicit transcript-insertion APIs remain available for integrations.

TUI **Ctrl+Space** starts/stops its native default microphone; **F4** inserts the
completed local transcript. CLI/TUI native live recording does not pretend to
select a saved desktop device: choose the native default or use explicit file
transcription. Native file transcription accepts regular PCM WAV up to 64 MiB.
Live native finalization has up to 60 seconds; cancel escalates an unresponsive
process. Actual exit status/signal and bounded diagnostics remain visible.
**Settings / Voice dictation / Native speech backend** saves an explicit
Automatic/CPU/Metal choice. No failure silently switches backends or providers.
Stop/discard controls and capability-job cancellation stay available while a
preference save is pending. New recordings are blocked until that save settles.

**Accessibility / Keyboard shortcuts** also remaps Commands and terminal Copy.
Protected editing/navigation bindings remain fixed and listed, including Enter
to send, Shift+Enter newline and Cmd/Ctrl+Enter holding a prompt. Settings reject
collisions; a shortcut edit needs its adjacent Save and does not save other text.

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
The final staged-tree rename requires the original cache/resource base and project to share
a filesystem. A cross-filesystem rename fails explicitly and restores/preserves
the old tree. Reviewed encrypted-store relocation does not retarget that captured
cache/resource authority. Use a project on the qualified same filesystem or
cancel the install; never manually clone state, discard history or disable
protection to force a retry.

## Local project Kanban and optional Linear

Desktop's per-project **Kanban** row, or **Issues**, opens the special board
chat. **New** creates a
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

Direct session and managed-workspace PR links share the same read-only
observation preference. Up to four session reads can be in flight; fresh
observations are retained for two minutes and a verified merge is stable.
Matching work-item links reuse the board's current observation. Project-free
links stay public-only with no root or inherited account. Private reads use the
exact bound Local root and explicitly selected control-plane `gh` access,
not a Remote SSH account. Missing access stays visibly unverified with its
diagnostic; no account, provider or base checkout is substituted.

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
and processes, then use the composer's **Resume** play control or `/resume`.
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
Use an explicit canonical-model override with input/output USD per million, UTC
date and `source: "user-estimate"`, or explicitly accept published API-equivalent
references for finite limits. Automatic references are on for estimates, not
finite-limit consent. They assume the named originating model's API price even
through Copilot, never its subscription bill. An explicit approved zero
override remains allowed. Historical unpriced/unbounded calls still block
affected finite choices. Provider rates use reported cache subsets once;
unknown write TTL reserves the maximum listed write price. Manual overrides
retain their conservative flat-input behavior.

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
npm run build
npm test
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

Build before running the test suite on a clean checkout. Compiled CLI and
worker integration tests exercise `dist/cli.mjs` and other actual bundled
entrypoints; dependency installation does not create them. Main-only CI follows
the same build-before-test order on both runners.

Focused checks use `node --import tsx --test tests/<name>.test.ts`. The native
TUI and hidden Electron tests drive actual clients against generated local HTTP
fixtures, including Copilot device-flow behavior. They neither authenticate a
personal account nor establish live Copilot entitlement. Linux CI checks the
portable foundation, with macOS-only operational tests skipped.

```bash
npm run package:mac
```

DMG packaging also needs Python 3.10 or newer. The build creates a private
`.native/dmgbuild-py<version>-<manifest-digest>/` environment and installs only
the three SHA-256-locked wheels in `scripts/requirements-dmg.txt` from PyPI.
System Python packages are never changed, and Python/build tools are not shipped
in the app. Runtime/TUI installation requirements remain unchanged.

The DMG opens in a native 540-by-380-point icon-view window: Moguri on the
left, Applications on the right, with 80-point icons, 12-point native labels,
and a light-gray/dashed-arrow background at both normal and Retina density.
The title is `Moguri <version>-arm64`. Only the real app and Applications link
are visible; toolbars, sidebars and status/path bars stay hidden. This matches
the supplied Porto installer proportions without using Porto branding.
Finder metadata is written offline, never through Finder/AppleScript automation.
`npm run verify:update -- --dmg-only` checks the actual read-only mounted image,
including the background alias, exact pixels/geometry and unchanged signed app.

On macOS arm64 this produces
`release/builds.noindex/<package-version>/Moguri-darwin-arm64/Moguri.app`,
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
