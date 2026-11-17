# Design audit and direction

This is the whole-app audit for [#53](https://github.com/mbianchidev/moguri/issues/53).
It separates what was observed from what changed, records the visual system it
produced and lists what remains. It is a UI quality pass on the development
alpha, not first-release acceptance, a human screen-reader audit or WCAG
certification. App-wide accessibility verification (screen reader, WCAG 2.2 AA,
keyboard and focus, contrast on a physical display) moved to
[#77](https://github.com/mbianchidev/moguri/issues/77).

## Method

- Source: `main` at `52f1752` (protocol 109, `0.32.0-alpha.1`), audited
  2026-11-17 on macOS arm64.
- Desktop: hidden Electron with generated fixtures only (no personal account,
  credentials or live inference), captured at 1280x800 and at a 760 CSS pixel
  viewport. The window minimum is 840px, so 760 is what a minimum window shows
  at about 110% zoom. `tests/e2e/design-captures.spec.ts` reproduces every
  screenshot below when `MOGURI_DESIGN_CAPTURE_DIR` and
  `MOGURI_DESIGN_CAPTURE_PREFIX` are set.
- TUI: the native OpenTUI test renderer with generated fixtures at 100x30 and
  52x24. `tests/tui-design-captures.test.ts` reproduces the frames when
  `MOGURI_TUI_CAPTURE_DIR` and `MOGURI_TUI_CAPTURE_PREFIX` are set.
- Stylesheet: a scan of `apps/desktop/src/styles.css` for raw values, undeclared
  variables, radii, shadows and font stacks, plus WCAG ratios computed for all
  ten presets in Dark and Light.
- Second pass: `main` at `f2a1684` (protocol 110), surveyed 2026-11-17 across
  about 60 generated screens: every Settings page, every Dashboard page, Inbox,
  Suggestions, Automations, each sidebar panel, the session context menu, the
  command palette, the terminal close dialog, and running, failed, stopped,
  failed-command and diff states at 1280 and 760, plus the TUI frames. It
  produced O11 to O22.

## What already worked

Earlier slices (#61, #62, #65, #66, #68, #70) left a solid base: a global 2px
focus ring, labeled icon buttons, 44px coarse-pointer targets, reduced-motion
rules for every looping animation, palette contrast checks for the main roles,
and session rows that pair a dot with an icon and an accessible label. The
audit kept all of that.

## Observed problems

| # | Observation | Evidence | Severity |
| --- | --- | --- | --- |
| O1 | At 760 CSS px and below the open side panel overlays the conversation and covers Approve, Deny and Send. A pending decision is hidden until the panel is closed. | `before-approval-760.png`; the new narrow test fails on `52f1752` with "760px covers Approve". | High |
| O2 | State words diverge: `waiting_input` (TUI list and state row), `Waiting Input` (Insights), `waiting input` (activity row), `Needs attention` (navigation) and raw lowercase outcomes (`partial`, `failed`). | `before-question-1280.png`, TUI frames below. | High |
| O3 | Two undeclared CSS variables, `--border` (8 uses) and `--panel` (1), silently dropped borders and a background on pinned sessions, bulk actions, interactive HTML, the PR pane and CI watch. | Stylesheet scan. | Medium |
| O4 | Styling was per slice: 56 raw hex values outside the palette, six overlay radii (5 to 10px), ten shadow values, five monospace stacks and no spacing, type, elevation or motion scale. | Stylesheet scan. | Medium |
| O5 | The CSS Light fallbacks had drifted from the SDK palette (control line, muted text, hover line), so first paint could differ from the runtime theme. | `appearanceColors()` versus `:root[data-theme="light"]`. | Low |
| O6 | Dark dialogs, the command palette and narrow drawers used shadows of 8 to 19% alpha, nearly invisible on slate. | Visual review. | Low |
| O7 | The connection line showed a failure-red dot while merely connecting. | `App.tsx` connection line. | Low |
| O8 | Partial results used the failure color in navigation; only the icon told them apart. | `.session-status-dot[data-session-state="partial"]`. | Low |
| O9 | A missing tool outcome read `result` in the TUI and was blank in the desktop Tool outputs header, rather than unknown. | `TuiMessage`, `App.tsx`. | Low |
| O10 | At 52x24 the TUI approval box shows only `{` of the arguments; the command needs Ctrl+V. | `before-tui-approval-52x24`. | Low |
| O11 | Failed and stopped session notices shared one amber warning surface, so a failure read like a stop. | `before-failed-model-1280.png`, `before-stopped-1280.png` | Medium |
| O12 | After a failed turn the composer's primary action silently became an icon-only Resume (play) or Retry, with no visible word. | `before-failed-model-1280.png` | Medium |
| O13 | Code change and Work item showed Git's raw `fatal: not a git repository` stderr as a red error for an ordinary folder project. | `before-code-change-folder-1280.png` | Medium |
| O14 | Diffs were uncolored 11px text, `git status` was 10px and every sidebar `pre` was 10px. | `before-code-change-diff-1280.png` | Medium |
| O15 | At 760 CSS px activity labels wrapped (`Run` / `command`) and the composer toolbar split into two rows. | `before-failed-command-760.png` | Low |
| O16 | The command palette focused its Esc button instead of the search field, drew `>` characters instead of icons, used a different header from other dialogs and showed nothing when no command matched. | `before-palette-1280.png` | Low |
| O17 | Analytics used its own outlined pills and words (Working, Needs you, Done) instead of `StatusBadge`; Dashboard tiles drew words such as Not reported in large monospace numerals. | `before-analytics-1280.png`, `before-cost-1280.png` | Low |
| O18 | Main-pane pages drifted: Automations had its own narrower, offset column; Suggestions put a larger Usage gaps heading under a smaller section title and used a chevron for Refresh. | `before-automations-1280.png`, `before-suggestions-1280.png` | Low |
| O19 | Long-tail rules still held 350 literal font sizes, about 1,100 literal spacing values and 120 literal radii; Budgets showed raw provider ids at 10px. | Stylesheet scan, `before-settings-budgets-1280.png` | Low |
| O20 | The TUI named tools by raw id (`run_command / Pending`) where the desktop says Run command, and colored every notice amber. | TUI frames below | Low |
| O21 | The Plan panel's workspace plan file toggle looked like centered body text, and Files labeled its root `.`. | Survey | Low |
| O22 | A provider failure shows the provider's response verbatim, including a JSON body. | `before-failed-model-1280.png` | Low |

## Direction

Keep the Operate-mode dark workbench: slate surfaces, quiet green action and
selection, system type. Polish comes from consistency, not decoration:

1. One token layer drives every surface; components never invent values.
2. Every state is a word from one shared vocabulary; color only reinforces it.
3. Pending decisions win the layout. Nothing overlays approvals, questions or
   the composer.
4. Unknown and partial outcomes stay visible and distinct from failure and
   success.
5. Desktop and TUI share words and state, not pixels.

## Prioritized changes

| Priority | Change | Status |
| --- | --- | --- |
| P1 | Narrow layout: from 760 to 561 CSS px the open side panel keeps its own column; at 560 and below it overlays, but approvals, questions and the composer stack above it (O1). | Done |
| P1 | Shared state vocabulary in `packages/protocol/src/status-labels.ts`, used by desktop `StatusBadge` (Insights, message outcomes, activity rows) and the TUI list, state row and outcomes (O2, O9). | Done |
| P1 | Token layer: palette roles, status roles, spacing, radius, type, targets, elevation, focus and motion, documented in [design.md](design.md#visual-system) (O4). | Done |
| P2 | Replace undeclared `--border`/`--panel` (O3); move every raw color into tokens (brand, terminal, chart lanes, swatch); unify overlay radii, shadows and the monospace stack (O4). | Done |
| P2 | Sync CSS fallbacks with the SDK palette (O5); deeper Dark dialog and drawer shadows (O6). | Done |
| P2 | Connection dot shows running while connecting (O7); partial uses its own status color (O8). | Done |
| P2 | Regression coverage: `tests/design-tokens.test.ts` and `tests/e2e/design-system.spec.ts`. | Done |
| P2 | Session notices take their outcome's tone: failed uses the error surface, stopped and completed stay neutral, partial and unknown keep attention; each keeps its worded badge and a left status rule (O11). The TUI uses the same mapping (O20). | Done |
| P2 | When the primary composer action becomes Resume or Retry it shows that word next to its icon (O12). | Done |
| P2 | `PanelError` shows a folder without Git as an expected empty state with the exact Git detail in a disclosure, for Code change, Work item and every other Git-backed panel (O13). | Done |
| P2 | `UnifiedDiff` renders Code change and PR patches with added, removed, hunk and header line roles, keeps the `+`/`-` text and scrolls by keyboard; sidebar code and `git status` move to 11px (O14). | Done |
| P2 | TUI tool rows, pending requests and the approval box use the shared `describeActivityCall` label and subject (O20). | Done |
| P3 | TUI compact approval shows the command subject before raw JSON at 52x24 (O10). | Done |
| P3 | Convert the remaining per-component spacing, font sizes and radii in long-tail Settings, analytics and every other rule to scale tokens; add 6, 10 and 14px half steps and a titlebar inset token; a test keeps literals out (O19). | Done |
| P3 | Activity labels never wrap, and at 760 CSS px the composer's controls stay on one row by truncating the model name first (O15). | Done |
| P3 | Command palette: focus starts in the search field, header and close button match other dialogs, icon chevrons, and a worded no-match state (O16). | Done |
| P3 | Analytics uses `StatusBadge` and the shared words; Dashboard tiles render words in the UI face (O17). | Done |
| P3 | Automations uses the shared main-pane column; Suggestions headings nest under the section title and Refresh uses the refresh icon; Budgets shows provider names (O18, O19). | Done |
| P3 | The plan file toggle is a chevron disclosure; Files names its root Workspace root (O21). | Done |
| P3 | Provider failure text stays verbatim (O22). It is the exact retained diagnostic; rewording it would need a service change and could hide detail. It wraps within the notice. | Kept by design |
| P3 | Human screen-reader pass (VoiceOver), WCAG 2.2 AA audit and a Light-theme review on a physical display. | Moved to [#77](https://github.com/mbianchidev/moguri/issues/77) |

## Before and after

All screenshots use generated fixtures. Before is `52f1752` for the first ten
rows and `f2a1684` for the rest; after is the change that finished #53.

| Screen | Before | After |
| --- | --- | --- |
| Start, 1280 | ![](assets/design/before-start-1280.png) | ![](assets/design/after-start-1280.png) |
| Start, 760 | ![](assets/design/before-start-760.png) | ![](assets/design/after-start-760.png) |
| Approval, 1280 | ![](assets/design/before-approval-1280.png) | ![](assets/design/after-approval-1280.png) |
| Approval, 760 | ![](assets/design/before-approval-760.png) | ![](assets/design/after-approval-760.png) |
| Question, 1280 | ![](assets/design/before-question-1280.png) | ![](assets/design/after-question-1280.png) |
| Question, 760 | ![](assets/design/before-question-760.png) | ![](assets/design/after-question-760.png) |
| Long conversation, 1280 | ![](assets/design/before-conversation-1280.png) | ![](assets/design/after-conversation-1280.png) |
| Long conversation, 760 | ![](assets/design/before-conversation-760.png) | ![](assets/design/after-conversation-760.png) |
| Composer popover | ![](assets/design/before-composer-popover-1280.png) | ![](assets/design/after-composer-popover-1280.png) |
| Settings / Appearance | ![](assets/design/before-settings-1280.png) | ![](assets/design/after-settings-1280.png) |
| Failed model request (O11, O12) | ![](assets/design/before-failed-model-1280.png) | ![](assets/design/after-failed-model-1280.png) |
| Stopped turn (O11) | ![](assets/design/before-stopped-1280.png) | ![](assets/design/after-stopped-1280.png) |
| Failed command, 760 (O15) | ![](assets/design/before-failed-command-760.png) | ![](assets/design/after-failed-command-760.png) |
| Code change, folder without Git (O13) | ![](assets/design/before-code-change-folder-1280.png) | ![](assets/design/after-code-change-folder-1280.png) |
| Code change, Git diff (O14) | ![](assets/design/before-code-change-diff-1280.png) | ![](assets/design/after-code-change-diff-1280.png) |
| Command palette (O16) | ![](assets/design/before-palette-1280.png) | ![](assets/design/after-palette-1280.png) |
| Dashboard / Analytics (O17) | ![](assets/design/before-analytics-1280.png) | ![](assets/design/after-analytics-1280.png) |
| Dashboard / Cost (O17) | ![](assets/design/before-cost-1280.png) | ![](assets/design/after-cost-1280.png) |
| Automations (O18) | ![](assets/design/before-automations-1280.png) | ![](assets/design/after-automations-1280.png) |
| Suggestions (O18) | ![](assets/design/before-suggestions-1280.png) | ![](assets/design/after-suggestions-1280.png) |
| Settings / Budgets (O19) | ![](assets/design/before-settings-budgets-1280.png) | ![](assets/design/after-settings-budgets-1280.png) |

The 760 rows show the first pass's main fix: Approve, Deny and the composer are
no longer under the panel. The 1280 rows show the shared words (Needs
attention, Pending, Completed) in Insights and activity rows. The second-pass
rows show failure and stop reading differently, the labeled Resume action, the
Git empty state, colored diffs, the one-row narrow composer and the aligned
supporting pages. Settings layout is unchanged; its type and spacing now come
from the scale tokens.

### TUI, pending approval at 100x30

Before:

```text
 Chats                   │
 > ! New session         │  │ You
 project / waiting_input │  │ Generated approval request for the design audit.
                         │  run_command / requested
 ...
                         │  Env Local | Model gemini-3.5-flash
 /new  /sessions         │  Autonomy level Manual | Budget Unlimited
 /profiles  /sidebar     │  agent | waiting_input
```

After:

```text
 Chats                   │
 > ! New session         │  │ You
 Needs attention / proje │  │ Generated approval request for the design audit.
                         │  run_command / Pending
 ...
                         │  Env Local | Model gemini-3.5-flash
 /new  /sessions         │  Autonomy level Manual | Budget Unlimited
 /profiles  /sidebar     │  Agent | Needs attention
```

The state word now leads the session row, so a narrow sidebar clips the
project name instead of the state.

### TUI, Sessions tab and 52x24 state row

Before:

```text
                         │   ▶ ! New session
                         │     project / waiting_input / ID 3f204cfe-21d4-4701-b524-0cfd8f86e5ce

 Autonomy level Manual | Budget Unlimited
 agent | waiting_input
```

After:

```text
                         │   ▶ ! New session
                         │     project / Needs attention / ID 1f5e38b2-cde1-4e23-8af7-f50b381cbe69

 Autonomy level Manual | Budget Unlimited
 Agent | Needs attention
```

Session IDs differ because each capture uses a fresh generated fixture.

### TUI, pending approval at 52x24 (O10, O20)

Before:

```text
 run_command / Pending
 ...
 ┌────────────────────────────────────────────────┐
 │ Approval required: run_command                 │
 │ {                                            ▀ │
 │ Unsandboxed Local.                             │
 │ Ctrl+Y approve | Ctrl+D deny | Ctrl+V args     │
 └────────────────────────────────────────────────┘
```

After:

```text
 Run command / Pending
 ...
 ┌────────────────────────────────────────────────┐
 │ Approval required: run_command                 │
 │ Run command: printf GENERATED_DESIGN_AUDIT   ▀ │
 │ Unsandboxed Local.                             │
 │ Ctrl+Y approve | Ctrl+D deny | Ctrl+V args     │
 └────────────────────────────────────────────────┘
```

The title keeps the exact tool name being approved; the first line names what
it does, and the exact arguments follow under Arguments in the same scrollable
box and in Ctrl+V.

## Verification

- `tests/design-tokens.test.ts`: palette fallbacks equal the SDK palette; all
  documented scales exist with no circular references; every `var()` resolves
  or is set at runtime; raw colors appear only in the token blocks; status,
  focus and text contrast hold for every preset in Dark and Light; brand and
  chart tokens keep their own contrast; looping animations stop under reduced
  motion; every state maps to a declared status token.
- Measured minimums across ten presets and both modes: body text 11.03:1,
  secondary text 5.82:1, failed, attention, partial and unknown status text
  5.16:1, focus ring and status dots 3.08:1.
- `tests/e2e/design-system.spec.ts`: keyboard alone moves from the session row
  to the prompt, sends, reaches Approve, approves and reaches the code block,
  with a visible 2px focus ring at each stop and worded status in Insights and
  navigation. At 1280, 840, 760, 600 and 420 CSS px nothing overflows
  horizontally and Approve, Deny and the prompt are not covered.
- `tests/design-tokens.test.ts` also fails on any literal pixel spacing, font
  size or radius outside the token blocks (hairlines and `clamp()`/`calc()`
  geometry excepted).
- `tests/e2e/design-system.spec.ts` also proves a failed notice uses the failed
  tone with a worded Resume or Retry action, a folder without Git shows a status
  rather than an alert with the exact Git detail on demand, the palette focuses
  its search and states a no-match result, a stopped notice uses the stopped
  tone and badge, and a real Git diff marks added, removed and hunk lines.
- `tests/tui-presentation.test.ts` proves the 52x24 approval shows
  `Run command: printf ...` before its arguments without sending anything, and
  tool rows read `Read file / Completed  fixture.txt`.
- Existing desktop and TUI interaction suites keep the approval, question,
  composer, queue and navigation semantics.

## Remaining limitations

- App-wide accessibility verification is tracked in
  [#77](https://github.com/mbianchidev/moguri/issues/77): no human screen-reader,
  WCAG 2.2 AA or physical-display audit was performed here, and ratios are
  computed from declared colors.
- Custom user colors are validated by the existing appearance checks, not by
  the status-token checks.
- Snapping to the scale moved some long-tail spacing by 1 to 4px; component
  sizes such as icons, tiles and fixed widths stay literal by design.
- Provider failure text stays verbatim (O22).
- This pass does not change service, SDK capability or permission behavior and
  does not prove first-release readiness.
