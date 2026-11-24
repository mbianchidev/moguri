# Development

This guide is for contributors working on Moguri itself. Users installing the
app should read [installation](installation.md). Coding agents also follow
[`AGENTS.md`](../AGENTS.md), which holds the repository's binding architecture
rules.

## Toolchain

- macOS on Apple silicon runs the full suite, the desktop app and packaging.
  Linux runs the portable foundation only; it is not release qualification.
- Node.js 26, pinned in [`.node-version`](../.node-version). `package.json`
  enforces it with `engine-strict`.
- npm (bundled with Node). Dependencies are pinned exactly (`save-exact`).
- Git, and the GitHub CLI (`gh`) for GitHub workflows and releases.
- Python 3.10+ for DMG packaging. Packaging creates a private virtual
  environment under `.native/` and never changes system Python packages.
- Apple `container` only for Sandbox images, packaging and native
  qualification.

## Setup and running

The SDK, the local service and its workers come from the public
[`@moguri-dev/sdk`](https://github.com/moguri-dev/moguri-sdk) package on
GitHub Packages, which needs a token to install even public packages. The committed `.npmrc` maps the `@moguri-dev` scope to
`https://npm.pkg.github.com`; put a classic token with `read:packages` in your
user `~/.npmrc` (`//npm.pkg.github.com/:_authToken=...`) or `NODE_AUTH_TOKEN`
before `npm ci`. Never commit it.

```sh
npm ci
npm run build
npm start -- --project /absolute/path/to/project   # TUI
npm run desktop                                    # desktop app, same service and sessions
```

`npm start` runs the TUI from the installed `@moguri-dev/tui` package, and
`npx moguri` its CLI; their sources live in
[moguri-tui](https://github.com/moguri-dev/moguri-tui).
`npm run service` runs the installed SDK's service. State goes to
`~/Library/Application Support/Moguri` unless `MOGURI_STATE_DIR` points to a
private directory; use a separate one for development. The service writes
diagnostics to `service.log` in that directory; see
[state, policy and diagnostics](setup.md#state-policy-and-diagnostics).

## Code layout

| Path | Contents |
| --- | --- |
| `apps/desktop` | The Electron main process and the React renderer |
| `node_modules/@moguri-dev/tui` | The `moguri` CLI and the OpenTUI terminal client, from [moguri-tui](https://github.com/moguri-dev/moguri-tui). The build's `dist/cli.mjs` shim runs its `./cli` entry for the app's `dist/moguri` launcher |
| `node_modules/@moguri-dev/sdk` | The SDK, protocol, local control plane and workers, from [moguri-sdk](https://github.com/moguri-dev/moguri-sdk). Clients import only `@moguri-dev/sdk`, `/node`, `/react`, `/mcp` and `/remote-bridge`; tests may also use the unstable `/testing` entry |
| `scripts` | Build, packaging, spikes, qualification and [release](releasing.md) tooling |
| `tests` | Node test runner suites; `tests/e2e` holds hidden Electron Playwright specs |
| `docs` | User, developer and architecture documentation; see the [index](README.md) |

The [architecture overview](architecture/overview.md), the
[implementation specification](implementation.md) and
[architecture decisions](architecture/decisions.md) explain how the pieces fit.
The [SDK reference](sdk.md) documents the public API and CLI.

## Checks

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript for the desktop and tests |
| `npm run build` | Desktop bundles, the `dist/moguri` launcher with its `dist/cli.mjs` shim and `dist/THIRD_PARTY_NOTICES.md` |
| `npm test` | Full Node suite, including the covering-array milestone matrix. Run `npm run build` first: some tests execute `dist` bundles. TUI and CLI suites run in moguri-tui |
| `node --import tsx --test tests/<name>.test.ts` | One or more focused suites |
| `npm run test:e2e` | Hidden Electron end-to-end tests. Needs a build and `npm exec -- playwright install chromium` once |
| `npm audit --audit-level=moderate` | Dependency audit |
| `npm run test:matrix` | Opt-in full 10,080-cell milestone matrix |

Documentation cites test evidence by file name. Since the
[D75](architecture/decisions.md#d75-sdk-and-tui-split-repository-moves-and-homebrew-prerequisites)
split, SDK, service and worker suites live in
[moguri-sdk](https://github.com/moguri-dev/moguri-sdk) and TUI and CLI suites
in [moguri-tui](https://github.com/moguri-dev/moguri-tui); a cited test that is
not in `tests/` here is in one of those repositories.

Tests use generated fixtures only: no real credentials, personal data,
microphones or live provider logins. Electron tests run hidden and never open
the real GitHub authorization page. Phase 0 and platform spikes
(`npm run spike`, `npm run spike:*`) are listed in `AGENTS.md`.

## Continuous integration

[`ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main` and every
other branch except `release/**`, on macOS and Ubuntu: audit, typecheck,
build, `npm test` and, on macOS, `test:e2e`. It installs the public SDK
package with the workflow's own `GITHUB_TOKEN`. A new push to a branch cancels
that branch's superseded run; `main` keeps one run per commit. Pull request
events (including fork PRs) and tags do not trigger it, so still run the
relevant checks locally before pushing.

Shared macOS runners run the suites three to four times slower than a
developer Mac, so CI sets `MOGURI_TEST_TIME_SCALE=4`. It stretches harness
deadlines only: `waitFor`, per-test and polling timeouts, the milestone
runner's cell and setup timeouts and Playwright's waits, each wrapped in
`ciTime()` from `tests/fixtures/time-scale.ts`. Product latency budgets that
tests assert (for example the startup and input budgets) are never scaled, and
CI never retries failed tests. Wrap new harness timeouts in `ciTime()`.

Those runners still miss the budgets in `tests/fixtures/latency-budgets.ts`, so
CI also sets `MOGURI_SKIP_LATENCY_BUDGETS=1`: a missed budget is logged as
"Latency budget not enforced on CI" instead of failing. Local runs and
`scripts/release.sh`, which clears the variable, always enforce them. Inline
budget checks in a spec follow the same switch through
`latencyBudgetsEnforced`.

The tag-triggered
[`release.yml`](../.github/workflows/release.yml) verifies and publishes
releases; see [releasing](releasing.md).

## Packaging

`npm run package:mac` builds an ad-hoc-signed development app, DMG, ZIP and
integrity manifest under `release/`. `npm run verify:update` checks the ZIP
through the production updater and the DMG layout without launching the app.
Packaging requires `LICENSE.md` and the generated third-party notices in the
app bundle; see [third-party components](third-party.md).

## Documentation

Put durable documentation under `docs/` and update the relevant setup,
settings, architecture or protocol page in the same change. Keep the
[README](../README.md) short and link here instead.
