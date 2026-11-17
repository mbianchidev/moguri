# Initial client design

## Product and operating scene

Moguri is an inspectable local coding workspace for developers moving between
terminal and desktop, often while reviewing a live diff or command. The mode is
Operate: readable task state, stable controls and native interaction take
priority over decorative branding. Product authority remains the implementation
specification, not this presentation record.

## Desktop

The desktop uses a restrained dark workbench by explicit user requirement:
slate conversation surfaces, deeper navigation and a quiet green
action/selection vocabulary. Dark is the factory preference; Light and System
are explicit, restorable shared SDK settings. It does not use marketing cards, synthetic
activity or invented metrics. System sans-serif carries UI; system monospace is
reserved for code, paths, IDs and measurements.

| Role | Value |
| --- | --- |
| Main surface | `#191f29` |
| App background | `#141922` |
| Navigation | `#11161e` |
| Subtle surface | `#1d2530` |
| Text | `#e1e8f0` |
| Secondary text | `#a2afc0` |
| Action | `#a8d7bc` |
| Selection | `#233c30` |
| Border | `#344151` |
| Error | `#ffb5a9` |

An original small face-and-purple-bat-wing mascot with a red pom-pom anchors the titlebar and empty
state. One SVG source generates PNG/ICNS native icons; the SDK exports its ASCII
counterpart for terminal loading. The only third-party artwork is the set of
monochrome provider marks on Settings / Model providers, which identify each
service and inherit the text color ([third-party notice](third-party.md)).

Model providers uses one card per account or agent harness: a neutral logo
tile, name, one-line subtitle, a status badge and trailing actions. The badge
states Connected, Not connected, Checking..., Needs attention or Disabled in
words, with a filled or hollow dot, so state never depends on color alone. API
key forms open as disclosures (`aria-expanded`), focus their field, and return
focus to the trigger on Escape or Cancel. Longer explanations stay in the
information popovers.

Projects/sessions sit left; the conversation remains central; the main-session
sidebar sits beside it with a separate seven-panel rail. Explicit grid placement
keeps the rail outside the conversation when the sidebar collapses. Width,
collapse and active-panel preferences are local presentation only. At supported
desktop widths the sidebar stays beside the main pane, not over it.

The composer keeps prompt/snapshot context above one compact toolbar: plus,
environment icon, model name and autonomy icon; budget/infinity, microphone and
paper-plane Send trail on the right. Cmd/Ctrl switches Send to a queue clock.
Native bounded popovers expose the four settings, model context/thinking and
usage without permanent duplicate labels. Setup and unavailable states explain what must happen
next. Approval is an inline, protected-focus action with full arguments and
explicit deny/approve controls. State is labeled in text, not color alone.

Conversation Markdown is rendered without raw HTML, automatic remote images or
implicit external navigation. Long transcripts progressively reveal older
messages. Code stays selectable and horizontally scrollable.
Fenced code uses a quiet language caption with a stable exact-copy action
outside its keyboard-scrollable source. Inline code stays ordinary text.
Activity disclosures retain their chevrons at rest so inspection does not depend
on discovering a hover state.

The transcript and composer/queue/approval surfaces share one measured content
column, excluding the adjacent turn rail; compact expanded turn lists remain
overlays. Navigation starts with Search/Filter/Order icons. Search reveals its
focused field on demand, while active status/order choices expose Reset.
Filters preserve parent context and collapsed-group intent rather than
restructuring the workspace. Location shortcuts live in the sidebar session and
project context menus, not Settings; unavailable roots stay visible but
disabled with their reason. Global skill-folder switches show an exact-path confirmation
before adding a saved discovery source, never an implied execution grant.

Queued prompts use right-aligned muted dashed bubbles, with explicit held/steer
labels. More, Delete and held-prompt Run icons reveal on hover or focus; non-hover
devices retain visible 44px targets. The singular/plural counted chevron preserves
inline edits when collapsed. The chat header carries no shortcut buttons; small
accent count badges on the right-rail Terminal, Plan and Code change icons describe
actual scoped observations, not synthetic progress. A Terminal count opens Agent
activity, not the private User console, and shares existing navigation/dirty-state
guards. Composer controls and the Commands palette open as anchored popups or a
modal dialog, never inside the sidebar.

Obvious navigation/copy/edit/delete actions use labeled icons. Contextual primary
labels are New and Save. Long names truncate within bounded rows while retaining
their full accessible names; controls wrap rather than overlap. Cmd/Ctrl+Enter
holds a prompt; sending is a distinct visible action. Mode and held state remain
textual, not color-only. The sidebar uses the maintained Ghostty canvas with an
explicit Local user-console boundary, not a custom terminal emulation surface.
Native browser previews are hidden while dialogs or other task surfaces own
focus. Project settings and destructive dialogs use the same restrained layout
and clear source/retention boundaries.

Settings choices save as soon as they change: switches, checkboxes, selects,
sliders and color pickers commit on change (sliders and colors when released),
on top of the committed values, so other unsaved text is untouched. Explicit
Save is reserved for written values such as text, paths, numbers, shortcuts and
JSON/YAML editors, and for flows gated by a review or consent step. List actions
like adding, enabling or removing a skill source, or confirming a global skill
folder, also save immediately. A refused save keeps the attempted value visible
with the error and never overwrites another client's revision.

Every Settings page follows one anatomy so pages read alike:

| Element | Rule |
| --- | --- |
| Page title | One `h2` per page (22px). Sections are `h3`, subsections `h4`, detail groups `h5`; embedded panels never add a second page-level `h2`. |
| Scope control | A page that acts on a chosen chat (Artifacts, Candidates, Sandbox, Skills) shows its source-chat select on the title row, right-aligned, like the Suggestions scope. It never sits above the title. |
| Column | Fields, editors, cards, tables and warnings share one 850px column; running text keeps a 76ch measure. |
| Groups | A fieldset with a `legend` is a titled card (subtle surface, 10px radius; nested cards use the main surface). A fieldset without a legend is an invisible wrapper. A titled group that carries its own information button stays unboxed so the title lines up with the button. |
| Disclosures | In Settings, every `details` is a bordered row: its label on the left and a visible Show/Hide pill on the right; the opened content sits inside the same card. Elsewhere disclosures use one rotating chevron, and rows with their own chevron or folder icon opt out. |
| Local paths | Every setting that needs a file or folder on this Mac uses `PathField`: a text field that accepts an absolute path or one starting with `~/`, plus a **Choose…** button for the native picker. Both ways always work; the typed value is kept exactly apart from `~` and surrounding quotes. |
| Field information | A field's information button sits right after the field title on its first line, not at the end of a full-width control. |
| Dropdowns | Every single-choice dropdown with more than 7 selectable options, anywhere in the app, opens a themed list with a search field instead of the native menu (`SelectSearch`). The count decides; there is no per-dropdown opt-in. Each query word must appear in the option text (case- and accent-insensitive). Arrow keys, Page Up/Down, Enter, Escape and type-to-search work from the closed control; the native select keeps its value and change events. |
| Copy | One sentence per page intro and per helper; info popovers at most two short sentences; warnings only for real risk. Internal implementation detail lives in [the Settings reference](settings/README.md), not on screen. |
| Switches | Choices that save immediately are switches with 12px row rhythm; review or consent acknowledgements stay checkboxes. |
| Tables | Left-aligned, muted 11px headers, row dividers, no outer border. |
| Actions in flex panels | Buttons keep their natural width (`align-self: flex-start`) instead of stretching across the column. |
| Empty lists | A section heading is always followed by content or a one-line empty state. |

Settings is a full main-pane task surface, with a category rail, persistent save
state and explicit warning/reset actions. It exposes the shared SDK rather than
owning capability behavior. Dirty settings survive tab changes and block
navigation/unmount until saved or explicitly reloaded. JSON editors expose exact
permissions/MCP configuration during this alpha. Model-weight download requires
its own user acceptance, separate from recording or transcript insertion.

Supporting views show explicit loading, empty and failed states rather than a
blank or success-looking fallback. Workspace-plan reloads retain the original
text and dirty indicator until successful reconciliation, lock conflicting
edits while pending, and recover from failed reads without losing text.

## Terminal

The TUI inherits terminal-oriented density rather than the desktop sidebar.
Its dark slate surfaces reduce the transition from an existing terminal;
desaturated green, amber and error text convey the same state vocabulary.
Navigation appears beside the conversation when space allows. The four controls
remain visible in a fixed-height footer. Full approval arguments are scrollable
and accessible with Ctrl+V; model choice, cancellation and draft conflict
resolution have explicit keyboard paths.

## Accessibility and motion

Controls have labels, visible keyboard focus, disabled explanations, status
announcements and non-color state text. Desktop command palette uses a native
dialog. Reduced-motion preference disables transitions; ordinary hover/focus
feedback is brief and no page-load choreography delays work.

The verification artifacts use generated transcripts and a synthetic Copilot
account catalog. They are demonstrations of the local protocol, not evidence
of personal subscription access or billed cost.
