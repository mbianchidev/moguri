# Releasing Moguri

Releases publish a macOS arm64 DMG, an updater ZIP and its integrity manifest
to GitHub Releases. One command drives the whole process:

```sh
scripts/release.sh 0.33.0          # or v0.33.0, 0.33.0-alpha.1, 1.0.0-rc.1
```

Preview first. A dry run fetches `origin/main` and reads GitHub state, and
nothing else:

```sh
scripts/release.sh --dry-run 0.33.0
```

`scripts/release.sh --help` lists every option.

## Release contract

| Item | Decision |
| --- | --- |
| Destination | GitHub Releases of `moguri-dev/moguri` (formerly `mbianchidev/moguri`), which the in-app updater reads; see [Repository move](#repository-move) |
| Platform | macOS on Apple silicon (arm64) only |
| Signing | Ad-hoc signed; not Developer ID signed or notarized |
| Tags | Annotated `v<version>` on the squash-merged `release: <version>` commit on `main` |
| Versions | [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html). Prerelease versions publish GitHub prereleases, which stable installs ignore. Build metadata (`+...`) is rejected because npm and the updater drop it |
| Build model | Hybrid: the maintainer's Mac builds; CI verifies and publishes (decided 2026-11-19) |
| Homebrew | Publish a cask to `mbianchidev/homebrew-tap` (decided 2026-11-19). The cask can only install once the repository and its release downloads are public |

### Why releases build locally

Packaging bundles the Sandbox worker image, which `scripts/package.mjs` builds
with Apple `container` on Virtualization.framework. GitHub-hosted macOS
runners do not support nested virtualization, so they cannot build it. A
self-hosted runner could, but self-hosted runners are risky on public
repositories. Instead, `scripts/release.sh` builds and tests on the
maintainer's Mac from a clean worktree, and the tag-triggered
[Release workflow](../.github/workflows/release.yml) independently re-verifies
the uploaded bytes before it publishes them.

**Trust boundary:** CI proves the published files are exactly the files
uploaded for that tag. Their checksums, GitHub asset digests and provenance
agree, the update manifest matches the ZIP, the DMG layout is correct, and the
app's version and identity match the tagged source. It does **not** prove the
binaries reproduce bit-for-bit from source. A draft and its assets stay
editable by anyone with write access until published, which is why the
workflow checks again immediately before undrafting.

## Prerequisites

- macOS on Apple silicon with Node.js 26 (`.node-version`), npm, Git,
  Python 3.10+, Apple `container`, and the system `hdiutil`, `codesign`,
  `ditto` and `shasum`.
- `gh` logged in to github.com with push access: `gh auth login --hostname github.com`.
- A classic token with `read:packages` in your user `~/.npmrc`
  (`//npm.pkg.github.com/:_authToken=...`), so `npm ci` can install
  `@moguri-dev/sdk` and `@moguri-dev/tui`: GitHub Packages needs a token even
  for public packages.
  The Release workflow reads it with its own `GITHUB_TOKEN`.
- The `origin` remote fetching and pushing `github.com/moguri-dev/moguri`, or
  the pre-transfer `github.com/mbianchidev/moguri` (SSH or HTTPS), with
  exactly one push URL. The verified origin selects the release repository and
  is passed to the Node helpers as `MOGURI_RELEASE_REPOSITORY`; the Release
  workflow uses `GITHUB_REPOSITORY`. Any other origin is refused.
- Working GitHub Actions. The script waits for main CI, and only the Release
  workflow can publish.
- Time and disk: the run executes the full CI-equivalent suite and builds a
  ~2 GB worker image and ~1.7 GB of release artifacts.

## What a release does

1. **Preflight.** Checks the tools and GitHub auth, verifies `origin`, takes a
   per-repository lock, fetches `origin/main` and inspects the existing tag,
   release, `release/v<version>` branch and PR.
2. **Version policy.** Rejects invalid, backwards or already-published
   versions, and anything not greater than `main`'s current version. Warns
   (without stopping) when the version skips a component or prerelease counter.
3. **Bump.** In a temporary owned worktree at `origin/main`, runs
   `npm version <version> --no-git-tag-version`, which updates `package.json`
   and `package-lock.json`, and commits `release: <version>` without signing
   or hooks. Your own checkout is never modified.
4. **Validate and package.** Runs `npm ci`, `npm audit --audit-level=moderate`,
   `npm run typecheck`, `npm run build`, `npm test`,
   hidden `npm run test:e2e`, `node scripts/package.mjs` and
   `npm run verify:update`. Validation must leave the tree clean. This mirrors
   [CI](../.github/workflows/ci.yml), which skips `release/**` branches, but
   always enforces the product latency budgets that CI only reports
   (`MOGURI_SKIP_LATENCY_BUDGETS` is cleared for these runs).
5. **Pull request.** Pushes `release/v<version>` and opens a ready PR. It
   watches any PR checks; release branches have none by design. It then merges
   with `gh pr merge --squash --auto --match-head-commit`. GitHub merges
   immediately when nothing blocks. Rejection leaves the PR open; there is no
   admin merge or direct push to `main`.
6. **Main CI gate.** Verifies the merge commit is on `main` with the chosen
   version, then watches that commit's `CI` run with `gh run watch`. CI uses
   one concurrency group per commit, so a later push to `main` cannot cancel
   this gate. If `main` moved and the merged tree differs from the validated
   one, it validates and packages the merge commit again.
7. **Draft release.** Stages the DMG, ZIP, manifest,
   `Moguri-<version>-provenance.json` (source commit, tree and per-asset
   SHA-256) and `SHA256SUMS`. It generates notes from GitHub's change list
   plus install, upgrade and limitation sections, and uploads a draft targeting
   the merge commit.
8. **Tag.** Creates and pushes the annotated `v<version>` tag on the merge
   commit, which triggers the Release workflow.
9. **Release workflow.** Watches the exact run.
   [`scripts/release/publish.mjs`](../scripts/release/publish.mjs) checks that
   the tag is annotated, points to a `main` commit with that `package.json`
   version, and that the draft targets it with the right prerelease flag and
   exactly the five assets. It downloads them and checks GitHub's SHA-256
   digests, `SHA256SUMS`, provenance and the manifest. It runs
   `verify-update-package.mjs` on the real ZIP and DMG and audits dependencies.
   It rechecks that the draft and tag did not change, then publishes the
   release and marks stable versions latest.
10. **Verify publication.** Confirms the release is published and the tag
    points to the merge commit. It also checks that every published asset's
    digest equals the bytes this run uploaded, so a consistent but swapped
    draft cannot pass.

Failures print the stage, the failing job logs or URL, and the journal path.
Progress is recorded in `.git/moguri-release/v<version>/journal`. Validated
artifacts are kept beside it so a rerun can reuse them after checking their
checksums. Owned worktrees and the lock are removed on success, failure and
Ctrl+C.

## Rerunning after a failure

Rerun the same command. The script resumes from GitHub's live state and never
creates a second bump, PR, tag or release:

| State found | What a rerun does |
| --- | --- |
| Nothing pushed yet (local validation failed) | Starts over from fresh `origin/main` |
| `release/v<version>` branch, no PR | Verifies the branch is one `release: <version>` commit on `main`, revalidates unless matching artifacts exist, and opens the PR |
| Open PR | Verifies the head and version, revalidates if needed, then continues to merge |
| PR closed without merging | Stops. Reopen it or choose a new version |
| Merged, no tag | Continues from the recorded merge commit: CI gate, draft, tag, workflow |
| Draft exists | Reuses it if it targets the merge commit and every present asset matches. Uploads only missing assets; never replaces one |
| Tag pushed | Watches the Release workflow. If that run already failed, reruns its failed jobs once |
| Published | Only verifies the publication |

A rerun reruns the failed jobs of an already-failed main CI or Release run
once; it does not loop. Changed code under an existing remote tag needs a new
version. Never force-push a release tag or replace published assets.

## Local validation without publishing

```sh
scripts/release.sh --local-only 0.33.0
```

Runs steps 1 to 4 in an owned worktree and keeps the validated DMG, ZIP and
manifest under `.git/moguri-release/v0.33.0/build`. Nothing is pushed.
`MOGURI_RELEASE_STATE_DIR` moves the journal and artifacts elsewhere. Timeouts
can be raised with `MOGURI_RELEASE_CI_TIMEOUT`,
`MOGURI_RELEASE_WORKFLOW_TIMEOUT`, `MOGURI_RELEASE_MERGE_TIMEOUT`,
`MOGURI_RELEASE_DISCOVERY_TIMEOUT` and `MOGURI_RELEASE_CHECKS_TIMEOUT`
(seconds).

## Tests

`tests/release-version-policy.test.ts`, `tests/release-assets.test.ts` and
`tests/release-script.test.ts` cover version policy, asset verification,
dry-run state handling and `--local-only` cleanup. They check that owned
worktrees, temporary directories and the lock are removed on success, on
failure and on SIGTERM. The script test uses a real
`git@github.com:mbianchidev/moguri.git` remote served through an SSH shim, a
fake `gh`, generated stand-ins for the slow npm checks and packaging, and a
disposable `HOME`. Lint the entrypoint and workflow with
`shellcheck scripts/release.sh` and `actionlint`.

## Current blockers

- **No green main CI run yet:** Actions start jobs since the repository
  became public on 2026-11-23, but the last `main` run (`5652dd8`) stalled in
  the SSH compound-environment tests and was cancelled. The release script
  waits for a passing main CI run on the release merge commit.
- **No release yet:** the in-app updater reads public releases without a
  token once one exists. The Homebrew cask waits for the first release (D75).

## Repository move

[#93](https://github.com/moguri-dev/moguri/issues/93) transferred this
repository to the moguri-dev organization. The owner kept the name
`moguri-dev/moguri` rather than the planned `moguri-dev/moguri-desktop`
([D75](architecture/decisions.md#d75-sdk-and-tui-split-repository-moves-and-homebrew-prerequisites)
revision, protocol 123). SendBox later moved to `sendbox-dev/sendbox`; packaging and
the SendBox updater follow GitHub's move redirect while the pinned identity stays
`mbianchidev/sendbox` ([D80](architecture/decisions.md#d80-sendboxs-repository-move)).

- `scripts/release.sh` and its helpers accept only `moguri-dev/moguri` and
  the pre-transfer `mbianchidev/moguri`, and stamp the verified one into the
  update manifest. `moguri-dev/moguri-desktop` is refused.
- The in-app updater (protocol 123 and later) starts at
  `api.github.com/repos/moguri-dev/moguri`. It follows at most one same-origin
  301 to `api.github.com/repositories/<id>`, accepts either repository name
  and reads releases and assets through the ID path.
- Installs with protocol 121 or 122 start at `mbianchidev/moguri`, follow
  GitHub's redirect and then reject the `moguri-dev/moguri` name, so they stop
  updating and must be reinstalled by hand (accepted gap).
- Never create a new repository at `mbianchidev/moguri`; it would replace
  GitHub's redirect.

## Homebrew cask

The owner chose on 2026-11-19 to publish a cask to `mbianchidev/homebrew-tap`
(first [#26](https://github.com/mbianchidev/moguri/issues/26), now part of
[#93](https://github.com/mbianchidev/moguri/issues/93)). The tap
accepts only immutable, published `vX.Y.Z` release assets whose `sha256`
matches the GitHub digest and `SHA256SUMS`. It never accepts a placeholder or
locally rebuilt checksum, so the cask PR can only be opened after the first
release is published **and** the repository is public.

At that point, open a draft PR in the tap that follows its `AGENTS.md`:

- `Casks/moguri.rb` with the release DMG URL and digest, `depends_on arch:
  :arm64`, `app "Moguri.app"`, a `moguri` command, caveats for the
  unnotarized first launch, and a `zap` limited to Moguri's own state.
- An updater registration in `scripts/ci/package_updates.py` (asset templates
  and `SHA256SUMS`, with prerelease handling for alpha versions), with tests,
  docs and the README rows.

The Moguri-side prerequisites are on `main` (protocol 121):

- The bundled launcher (`Moguri.app/Contents/Resources/app/dist/moguri`)
  follows its own symlink chain before locating the app, so a cask `binary`
  symlink works.
- The in-app updater detects a Homebrew-managed app (a `Caskroom/moguri`
  directory under `HOMEBREW_PREFIX`, `/opt/homebrew` or `/usr/local`). It still
  reports newer releases but downloads nothing, never replaces the app and
  points to `brew upgrade --cask moguri`.
