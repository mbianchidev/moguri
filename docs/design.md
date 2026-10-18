# Initial client design

## Product and operating scene

Moguri is an inspectable local coding workspace for developers moving between
terminal and desktop, often while reviewing a live diff or command. The mode is
Operate: readable task state, stable controls and native interaction take
priority over decorative branding. Product authority remains the implementation
specification, not this presentation record.

## Desktop

The desktop uses a restrained, light workbench suited to ordinary ambient
daylight: white conversation surface, cool-gray project navigation and a quiet
green action/selection vocabulary. It does not use marketing cards, synthetic
activity or invented metrics. System sans-serif carries UI; system monospace is
reserved for code, paths, IDs and measurements.

| Role | Value |
| --- | --- |
| Main surface | `#ffffff` |
| App background | `#f5f6f8` |
| Navigation | `#eff1f4` |
| Subtle surface | `#f7f8fa` |
| Text | `#202936` |
| Secondary text | `#616c7c` |
| Action | `#286547` |
| Selection | `#dfe8e3` |
| Border | `#dce1e7` |
| Error | `#a23e38` |

Projects/sessions sit left; the conversation remains central; the main-session
sidebar sits beside it with a separate seven-panel rail. Explicit grid placement
keeps the rail outside the conversation when the sidebar collapses. Width,
collapse and active-panel preferences are local presentation only. At supported
desktop widths the sidebar stays beside the main pane, not over it.

The composer keeps prompt/snapshot context above Env, Model, Autonomy level and
Budget, in that order. Setup and unavailable states explain what must happen
next. Approval is an inline, protected-focus action with full arguments and
explicit deny/approve controls. State is labeled in text, not color alone.

Conversation Markdown is rendered without raw HTML, automatic remote images or
implicit external navigation. Long transcripts progressively reveal older
messages. Code stays selectable and horizontally scrollable.

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
