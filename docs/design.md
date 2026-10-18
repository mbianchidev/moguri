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

An original small face-and-purple-bat-wing mascot anchors the titlebar and empty
state. One SVG source generates PNG/ICNS native icons; the SDK exports its ASCII
counterpart for terminal loading. No supplied third-party artwork is embedded.

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

Settings is a full main-pane task surface, with a category rail, persistent save
state and explicit warning/reset actions. It exposes the shared SDK rather than
owning capability behavior. Dirty settings survive tab changes and block
navigation/unmount until saved or explicitly reloaded. JSON editors expose exact
permissions/MCP configuration during this alpha. Model-weight download requires
its own user acceptance, separate from recording or transcript insertion.

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
