#!/usr/bin/env bash
# Moguri release entrypoint. Usage and the full flow: scripts/release.sh --help and docs/releasing.md.
set -Eeuo pipefail
export GIT_PAGER=cat GH_PAGER=cat PAGER=cat GIT_TERMINAL_PROMPT=0 GIT_EDITOR=true GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1

readonly REPOSITORY="mbianchidev/moguri"
readonly BASE_BRANCH="main"
readonly REMOTE="origin"
readonly CI_WORKFLOW="ci.yml"
readonly RELEASE_WORKFLOW="release.yml"
readonly POLL_INTERVAL=10
DISCOVERY_TIMEOUT="${MOGURI_RELEASE_DISCOVERY_TIMEOUT:-600}"
CHECKS_TIMEOUT="${MOGURI_RELEASE_CHECKS_TIMEOUT:-60}"
MERGE_TIMEOUT="${MOGURI_RELEASE_MERGE_TIMEOUT:-1800}"
CI_TIMEOUT="${MOGURI_RELEASE_CI_TIMEOUT:-21600}"
WORKFLOW_TIMEOUT="${MOGURI_RELEASE_WORKFLOW_TIMEOUT:-3600}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
HELPERS="$SCRIPT_DIR/release"
TMP_ROOT="${TMPDIR:-/tmp}"
TMP_ROOT="${TMP_ROOT%/}"

MODE="release"
INPUT=""
CHILD=""
OWNED_DIRS=""
LOCK=""
LOCK_HELD=0
JOURNAL=""
ATTEMPT_DIR=""
STAGE="starting"

usage() {
  cat <<'EOF'
Usage: scripts/release.sh [--dry-run | --local-only] VERSION

Release Moguri VERSION (x.y.z or vx.y.z, optionally with a -prerelease such as
-alpha.2 or -rc.1). Build metadata (+...) is rejected because npm and the
updater drop it.

A normal run:
  1. Checks tools, GitHub auth and that origin is github.com/mbianchidev/moguri.
  2. Creates an owned worktree from fresh origin/main and bumps package.json and
     package-lock.json with npm version (no tag).
  3. Commits "release: VERSION" and runs the same checks as CI: npm ci, npm
     audit, typecheck, build, npm test, verify:sdk and test:e2e. It then packages
     the DMG and ZIP and verifies them with verify:update.
  4. Pushes release/vVERSION, opens a ready PR, watches any PR checks and
     merges it (squash, exact head) without admin bypass.
  5. Waits for the main CI run on the merge commit to pass.
  6. Uploads a draft GitHub release from the merged commit, pushes an annotated
     vVERSION tag on that commit, and watches the Release workflow. The workflow
     re-verifies the draft and publishes it.
  7. Verifies the published release, assets and digests.

Rerunning the same VERSION resumes from the recorded and live state. It never
duplicates the bump PR, tag or release.

Options:
  --dry-run     Print the detected state and plan. No worktree, commit, push,
                PR, tag or release is created; only remote refs are fetched.
  --local-only  Steps 1-3 in an owned worktree without pushing anything. The
                validated DMG/ZIP stay under .git/moguri-release/<tag>/.
  -h, --help    Show this help.

Requires macOS on Apple silicon, Node.js 26, npm, git, gh (logged in to
github.com with push access), Python 3.10+, Apple container, and the macOS
hdiutil, codesign, ditto and shasum tools.
EOF
}

say() { printf '==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
now() { date +%s; }

journal_set() {
  local key="$1" value="$2" tmp="$JOURNAL.tmp.$$"
  { if [ -f "$JOURNAL" ]; then grep -v "^$key=" "$JOURNAL" || true; fi; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  mv "$tmp" "$JOURNAL"
}
journal_get() { if [ -f "$JOURNAL" ]; then sed -n "s/^$1=//p" "$JOURNAL" | tail -n 1; fi; }
stage() { STAGE="$1"; if [ -n "$JOURNAL" ] && [ -d "$ATTEMPT_DIR" ]; then journal_set stage "$1"; fi; }

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -n "$CHILD" ]; then kill -TERM "$CHILD" 2>/dev/null || true; wait "$CHILD" 2>/dev/null || true; fi
  local dir
  for dir in $OWNED_DIRS; do
    if [ -d "$dir/src" ]; then git -C "$REPO_ROOT" worktree remove --force "$dir/src" || warn "Could not remove the owned worktree $dir/src."; fi
    case "$dir" in "$TMP_ROOT"/moguri-release.*) rm -rf "$dir" || warn "Could not remove $dir." ;; esac
  done
  if [ "$LOCK_HELD" = 1 ]; then rm -rf "$LOCK" || warn "Could not remove the release lock $LOCK."; fi
  if [ "$rc" -ne 0 ]; then
    printf '\nRelease stopped during: %s (exit %s).\n' "$STAGE" "$rc" >&2
    if [ -n "$JOURNAL" ] && [ -f "$JOURNAL" ]; then printf 'Attempt journal: %s\n' "$JOURNAL" >&2; fi
    if [ "$MODE" = release ] && [ -n "$INPUT" ]; then printf 'After fixing the cause, rerun: scripts/release.sh %s\n' "$INPUT" >&2; fi
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Runs a long command in the background so INT/TERM can stop it, and fails with the step name.
run_in() {
  local dir="$1" description="$2"; shift 2
  say "$description"
  (cd "$dir" && exec "$@") &
  CHILD=$!
  if ! wait "$CHILD"; then CHILD=""; die "$description failed."; fi
  CHILD=""
}

# Runs a watcher with an overall deadline, keeping its native output on the terminal.
with_deadline() {
  local seconds="$1"; shift
  "$@" &
  CHILD=$!
  local watched=$CHILD rc=0
  ( sleep "$seconds"; kill -TERM "$watched" 2>/dev/null ) &
  local watchdog=$!
  wait "$watched" || rc=$?
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  CHILD=""
  return "$rc"
}

new_owned_dir() {
  local dir
  dir="$(mktemp -d "$TMP_ROOT/moguri-release.XXXXXX")"
  OWNED_DIRS="$OWNED_DIRS $dir"
  printf '%s\n' "$dir"
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0 ;;
      --dry-run) MODE="dry-run" ;;
      --local-only) MODE="local-only" ;;
      -*) die "Unknown option $1. See --help." ;;
      *) [ -z "$INPUT" ] || die "Give exactly one version. See --help."; INPUT="$1" ;;
    esac
    shift
  done
  [ -n "$INPUT" ] || { usage >&2; exit 2; }
}

require_tools() {
  local missing="" tool
  for tool in git gh node npm python3 container hdiutil codesign ditto shasum; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  [ -z "$missing" ] || die "Missing required tools:$missing."
  [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "Releases build the macOS arm64 app and must run on macOS on Apple silicon."
  case "$(node --version)" in v26.*) ;; *) die "Node.js 26 is required (see .node-version); found $(node --version)." ;; esac
  gh auth status --hostname github.com >/dev/null 2>&1 || die "gh is not logged in to github.com. Run: gh auth login --hostname github.com"
}

remote_repository() {
  case "$1" in
    git@github.com:*) printf '%s\n' "${1#git@github.com:}" ;;
    ssh://git@github.com/*) printf '%s\n' "${1#ssh://git@github.com/}" ;;
    https://github.com/*) printf '%s\n' "${1#https://github.com/}" ;;
    *) printf 'unknown\n' ;;
  esac | sed -e 's#\.git$##' -e 's#/$##'
}

verify_remote() {
  local fetch push count
  fetch="$(git -C "$REPO_ROOT" remote get-url "$REMOTE" 2>/dev/null)" || die "Remote $REMOTE is not configured."
  count="$(git -C "$REPO_ROOT" remote get-url --push --all "$REMOTE" | wc -l | tr -d ' ')"
  [ "$count" = 1 ] || die "Remote $REMOTE has $count push URLs; releases need exactly one."
  push="$(git -C "$REPO_ROOT" remote get-url --push "$REMOTE")"
  [ "$(remote_repository "$fetch")" = "$REPOSITORY" ] || die "Remote $REMOTE fetches from $fetch, not github.com/$REPOSITORY."
  [ "$(remote_repository "$push")" = "$REPOSITORY" ] || die "Remote $REMOTE pushes to $push, not github.com/$REPOSITORY."
}

acquire_lock() {
  LOCK="$GIT_COMMON/moguri-release.lock"
  if ! mkdir "$LOCK" 2>/dev/null; then
    local holder
    holder="$(cat "$LOCK/pid" 2>/dev/null || true)"
    if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then die "Another release (pid $holder) is running for this repository."; fi
    warn "Taking over a stale release lock left by pid ${holder:-unknown}."
    rm -rf "$LOCK"
    mkdir "$LOCK" || die "Could not create the release lock $LOCK."
  fi
  LOCK_HELD=1
  printf '%s\n' "$$" > "$LOCK/pid"
}

base_ref() { printf 'refs/remotes/%s/%s\n' "$REMOTE" "$BASE_BRANCH"; }

fetch_base() {
  say "Fetching $REMOTE/$BASE_BRANCH"
  git -C "$REPO_ROOT" fetch --quiet --no-tags "$REMOTE" "+refs/heads/$BASE_BRANCH:$(base_ref)" || die "Could not fetch $REMOTE/$BASE_BRANCH. Nothing was changed."
  BASE_SHA="$(git -C "$REPO_ROOT" rev-parse "$(base_ref)")"
}

version_at() { git -C "$REPO_ROOT" show "$1:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).version)))'; }

lock_versions_at() { git -C "$REPO_ROOT" show "$1:package-lock.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.version+" "+j.packages[""].version)})'; }

check_versions_at() {
  local commit="$1"
  [ "$(version_at "$commit")" = "$VERSION" ] || die "package.json at $commit is not $VERSION."
  [ "$(lock_versions_at "$commit")" = "$VERSION $VERSION" ] || die "package-lock.json at $commit does not record $VERSION."
}

is_ancestor() {
  local rc=0
  git -C "$REPO_ROOT" merge-base --is-ancestor "$1" "$2" || rc=$?
  case "$rc" in 0) return 0 ;; 1) return 1 ;; *) die "git could not compare $1 with $2." ;; esac
}

remote_tag_commit() {
  local lines
  lines="$(git -C "$REPO_ROOT" ls-remote "$REMOTE" "refs/tags/$TAG" "refs/tags/$TAG^{}")" || die "Could not list remote tags."
  if [ -z "$lines" ]; then printf 'none\n'; return; fi
  printf '%s\n' "$lines" | awk -v peeled="refs/tags/$TAG^{}" -v plain="refs/tags/$TAG" '$2==peeled{p=$1} $2==plain{t=$1} END{print (p!="" ? p : t)}'
}

inspect_state() {
  say "Inspecting existing release state for $TAG"
  local release prs count
  release="$(node "$HELPERS/github.mjs" release "$TAG")" || die "Could not read GitHub releases."
  RELEASE_ID=none; RELEASE_DRAFT=none
  if [ "$release" != none ]; then IFS=$'\t' read -r RELEASE_ID RELEASE_DRAFT _ _ _ <<< "$release"; fi
  TAG_COMMIT="$(remote_tag_commit)"
  prs="$(gh pr list --repo "$REPOSITORY" --head "$BRANCH" --base "$BASE_BRANCH" --state all \
    --json number,state,url,headRefOid,mergeCommit,isCrossRepository \
    --jq '.[] | [.state, .url, .headRefOid, (.mergeCommit.oid // "none"), .isCrossRepository] | @tsv')" || die "Could not list pull requests."
  count="$(printf '%s' "$prs" | grep -c . || true)"
  [ "$count" -le 1 ] || die "Found $count pull requests for $BRANCH. Resolve them on GitHub first."
  PR_STATE=none; PR_URL=""; PR_HEAD=""; MERGE_SHA=""
  if [ "$count" = 1 ]; then
    local cross
    IFS=$'\t' read -r PR_STATE PR_URL PR_HEAD MERGE_SHA cross <<< "$prs"
    [ "$cross" = false ] || die "The $BRANCH pull request comes from a fork."
    [ "$PR_STATE" != CLOSED ] || die "$PR_URL was closed without merging. Reopen it or choose a new version."
  fi
  BRANCH_SHA="$(git -C "$REPO_ROOT" ls-remote --heads "$REMOTE" "refs/heads/$BRANCH" | cut -f1)"

  if [ "$RELEASE_ID" != none ] && [ "$RELEASE_DRAFT" = false ]; then STATE=published
  elif [ "$TAG_COMMIT" != none ]; then
    [ "$RELEASE_ID" != none ] || die "Remote tag $TAG exists without a release. Inspect it on GitHub; it was not replaced."
    STATE=tagged; MERGE_SHA="$TAG_COMMIT"
  elif [ "$PR_STATE" = MERGED ]; then STATE=merged
  elif [ "$PR_STATE" = OPEN ]; then
    [ -n "$BRANCH_SHA" ] && [ "$BRANCH_SHA" = "$PR_HEAD" ] || die "$PR_URL is open but $BRANCH on $REMOTE does not match its head."
    STATE=pr-open; BUMP_SHA="$PR_HEAD"
  elif [ -n "$BRANCH_SHA" ]; then STATE=branch; BUMP_SHA="$BRANCH_SHA"
  else STATE=fresh
  fi
  if [ "$RELEASE_ID" != none ] && [ "$RELEASE_DRAFT" = true ] && { [ "$STATE" = fresh ] || [ "$STATE" = branch ] || [ "$STATE" = pr-open ]; }; then
    die "A draft release for $TAG exists before its bump merged. Review or delete it on GitHub; it was not replaced."
  fi
}

check_policy() {
  local published line result previous current
  if [ "$STATE" = published ]; then PREVIOUS=none; return; fi
  published="$(node "$HELPERS/github.mjs" published)" || die "Could not list published releases."
  set -- check "$VERSION"
  while IFS= read -r line; do [ -z "$line" ] || set -- "$@" --published "$line"; done <<< "$published"
  if [ "$STATE" = fresh ]; then
    current="$(version_at "$BASE_SHA")"
    if [ "$(node "$HELPERS/version-policy.mjs" compare "$VERSION" "$current")" != 1 ]; then
      die "$VERSION must be greater than $BASE_BRANCH's current version $current."
    fi
    set -- "$@" --current "$current"
  fi
  result="$(node "$HELPERS/version-policy.mjs" "$@")" || die "Version policy rejected $VERSION."
  IFS=$'\t' read -r _ _ _ previous _ <<< "$result"
  PREVIOUS="$previous"
  if [ "$previous" = none ]; then note "No published release yet: $TAG will be the first."; else note "Previous published release: v$previous"; fi
}

print_plan() {
  say "Plan for $TAG (state: $STATE)"
  note "Repository: $REPOSITORY, base $BASE_BRANCH at $BASE_SHA"
  note "Prerelease: $PRERELEASE"
  case "$STATE" in
    published) note "Already published. Only verify the release, assets and digests." ;;
    tagged) note "Tag $TAG points to $MERGE_SHA. Watch or resume the Release workflow, then verify publication." ;;
    merged) note "Bump merged as $MERGE_SHA ($PR_URL). Rebuild or reuse validated artifacts, gate on main CI, upload the draft, tag, watch the Release workflow." ;;
    pr-open) note "Resume $PR_URL at $BUMP_SHA: validate, watch PR checks, merge, then gate on main CI, upload the draft, tag, watch the Release workflow." ;;
    branch) note "Resume $BRANCH at $BUMP_SHA: validate, open the PR, merge, then gate on main CI, upload the draft, tag, watch the Release workflow." ;;
    fresh) note "Bump $BASE_BRANCH to $VERSION in an owned worktree, validate and package, push $BRANCH, open and merge the PR, gate on main CI, upload the draft, tag, watch the Release workflow." ;;
  esac
}

# Full local validation and packaging of the checked-out commit in an owned worktree; matches .github/workflows/ci.yml.
validate_and_package() {
  local dir="$1"
  run_in "$dir" "Installing dependencies (npm ci)" npm ci --no-fund --no-audit
  run_in "$dir" "Auditing dependencies" npm audit --audit-level=moderate
  run_in "$dir" "Type checking" npm run typecheck
  run_in "$dir" "Building" npm run build
  run_in "$dir" "Installing Playwright Chromium" npm exec -- playwright install chromium
  run_in "$dir" "Running the test suite" npm test
  run_in "$dir" "Verifying the packed SDK" npm run verify:sdk
  run_in "$dir" "Running hidden desktop end-to-end tests" env MOGURI_TEST_WINDOW=hidden npm run test:e2e
  run_in "$dir" "Packaging the macOS app" node scripts/package.mjs
  run_in "$dir" "Verifying the update ZIP and DMG" npm run verify:update
  [ -z "$(git -C "$dir" status --porcelain)" ] || { git -C "$dir" status --short >&2; die "Validation changed tracked or unignored files. Nothing was published."; }
  local tree build
  tree="$(git -C "$dir" rev-parse 'HEAD^{tree}')"
  build="$ATTEMPT_DIR/build"
  rm -rf "$build"; mkdir -p "$build"
  local name
  for name in "Moguri-$VERSION-macos-arm64.dmg" "Moguri-$VERSION-macos-arm64.zip" "Moguri-$VERSION-macos-arm64.manifest.json"; do
    cp "$dir/release/$name" "$build/$name"
  done
  (cd "$build" && shasum -a 256 "Moguri-$VERSION"-macos-arm64.* > SHA256.build)
  printf '%s\n' "$tree" > "$build/tree"
  journal_set validated_tree "$tree"
  say "Validated and packaged tree $tree"
}

validated_build_for() {
  local tree="$1" build="$ATTEMPT_DIR/build"
  [ -f "$build/tree" ] && [ "$(cat "$build/tree")" = "$tree" ] && (cd "$build" && shasum -a 256 --check --status SHA256.build)
}

prepare_bump() {
  stage "creating the release bump"
  local dir
  dir="$(new_owned_dir)"
  git -C "$REPO_ROOT" worktree add --quiet --detach "$dir/src" "$BASE_SHA"
  (cd "$dir/src" && npm version "$VERSION" --no-git-tag-version --ignore-scripts >/dev/null) || die "npm version $VERSION failed."
  [ "$(git -C "$dir/src" status --porcelain)" = " M package-lock.json
 M package.json" ] || { git -C "$dir/src" status --short >&2; die "npm version changed unexpected files."; }
  git -C "$dir/src" add package.json package-lock.json
  git -C "$dir/src" -c commit.gpgsign=false commit --quiet --no-gpg-sign --no-verify -m "release: $VERSION"
  BUMP_SHA="$(git -C "$dir/src" rev-parse HEAD)"
  check_versions_at "$BUMP_SHA"
  journal_set bump_sha "$BUMP_SHA"
  stage "validating the release bump"
  validate_and_package "$dir/src"
}

validate_existing_bump() {
  local parent
  [ "$(git -C "$REPO_ROOT" cat-file -t "$BUMP_SHA" 2>/dev/null)" = commit ] || git -C "$REPO_ROOT" fetch --quiet --no-tags "$REMOTE" "refs/heads/$BRANCH" || die "Could not fetch $BRANCH."
  [ "$(git -C "$REPO_ROOT" log -1 --format=%s "$BUMP_SHA")" = "release: $VERSION" ] || die "$BRANCH head is not a \"release: $VERSION\" commit."
  parent="$(git -C "$REPO_ROOT" rev-parse "$BUMP_SHA^")"
  is_ancestor "$parent" "$BASE_SHA" || die "$BRANCH is not based on $BASE_BRANCH. Close it or choose a new version."
  check_versions_at "$BUMP_SHA"
  if validated_build_for "$(git -C "$REPO_ROOT" rev-parse "$BUMP_SHA^{tree}")"; then
    say "Reusing validated artifacts for $BUMP_SHA"
    return
  fi
  stage "validating the release bump"
  local dir
  dir="$(new_owned_dir)"
  git -C "$REPO_ROOT" worktree add --quiet --detach "$dir/src" "$BUMP_SHA"
  validate_and_package "$dir/src"
}

push_branch() {
  stage "pushing $BRANCH"
  if ! git -C "$REPO_ROOT" push --quiet "$REMOTE" "$BUMP_SHA:refs/heads/$BRANCH"; then
    [ "$(git -C "$REPO_ROOT" ls-remote --heads "$REMOTE" "refs/heads/$BRANCH" | cut -f1)" = "$BUMP_SHA" ] || die "Pushing $BRANCH failed."
    note "The push reported an error, but $REMOTE has $BRANCH at $BUMP_SHA."
  fi
}

open_pr() {
  stage "opening the release PR"
  local body
  body="Release bump for Moguri $VERSION, created by \`scripts/release.sh\`.

Local validation on macOS arm64 passed for this exact tree: \`npm ci\`, \`npm audit --audit-level=moderate\`, \`npm run typecheck\`, \`npm run build\`, \`npm test\`, \`npm run verify:sdk\`, \`npm run test:e2e\`, packaging and \`npm run verify:update\`.

After merge, the script waits for main CI on the merge commit, uploads a draft release built from it, pushes the annotated \`$TAG\` tag and watches the Release workflow, which verifies and publishes the draft."
  PR_URL="$(gh pr create --repo "$REPOSITORY" --base "$BASE_BRANCH" --head "$BRANCH" --title "release: $VERSION" --body "$body")" || die "Could not open the release PR."
  journal_set pr_url "$PR_URL"
  note "Opened $PR_URL"
}

pr_head() { gh pr view "$PR_URL" --repo "$REPOSITORY" --json headRefOid --jq .headRefOid; }

gate_pr_checks() {
  stage "watching PR checks"
  local deadline count bad
  deadline=$(( $(now) + CHECKS_TIMEOUT ))
  while :; do
    count="$(gh pr view "$PR_URL" --repo "$REPOSITORY" --json statusCheckRollup --jq '.statusCheckRollup | length')"
    [ "$count" -gt 0 ] && break
    if [ "$(now)" -ge "$deadline" ]; then
      note "No PR checks reported: this repository runs CI only on pushes to $BASE_BRANCH."
      note "The local validation above gates this PR; main CI on the merge commit gates the tag."
      return
    fi
    sleep "$POLL_INTERVAL"
  done
  with_deadline "$CI_TIMEOUT" gh pr checks "$PR_URL" --repo "$REPOSITORY" --watch --fail-fast --interval "$POLL_INTERVAL" || die "PR checks failed for $PR_URL."
  bad="$(gh pr checks "$PR_URL" --repo "$REPOSITORY" --json name,bucket --jq '[.[] | select(.bucket != "pass") | .name] | join(", ")')"
  [ -z "$bad" ] || die "PR checks did not all pass: $bad."
}

merge_pr() {
  stage "merging the release PR"
  [ "$(pr_head)" = "$BUMP_SHA" ] || die "$PR_URL head changed from $BUMP_SHA. Rerun to revalidate it."
  local deadline mergeable
  deadline=$(( $(now) + DISCOVERY_TIMEOUT ))
  while :; do
    mergeable="$(gh pr view "$PR_URL" --repo "$REPOSITORY" --json mergeStateStatus --jq .mergeStateStatus)"
    case "$mergeable" in
      CLEAN|HAS_HOOKS|UNSTABLE) break ;;
      DIRTY) die "$PR_URL conflicts with $BASE_BRANCH. Close it and rerun with a new attempt after resolving." ;;
      UNKNOWN) ;;
      *) note "GitHub reports $PR_URL as $mergeable; requesting a merge once requirements pass." ; break ;;
    esac
    [ "$(now)" -lt "$deadline" ] || die "GitHub did not compute mergeability for $PR_URL within ${DISCOVERY_TIMEOUT}s."
    sleep "$POLL_INTERVAL"
  done
  gh pr merge "$PR_URL" --repo "$REPOSITORY" --squash --auto --match-head-commit "$BUMP_SHA" --subject "release: $VERSION" --body "" \
    || die "GitHub refused to merge $PR_URL. It was left open; no admin merge or direct push was attempted."
  local state
  deadline=$(( $(now) + MERGE_TIMEOUT ))
  while :; do
    IFS=$'\t' read -r state MERGE_SHA <<< "$(gh pr view "$PR_URL" --repo "$REPOSITORY" --json state,mergeCommit --jq '[.state, (.mergeCommit.oid // "none")] | @tsv')"
    [ "$state" = MERGED ] && [ "$MERGE_SHA" != none ] && break
    [ "$state" != CLOSED ] || die "$PR_URL was closed without merging."
    [ "$(now)" -lt "$deadline" ] || die "$PR_URL did not merge within ${MERGE_TIMEOUT}s. It is still recoverable; rerun later."
    sleep "$POLL_INTERVAL"
  done
  journal_set merge_sha "$MERGE_SHA"
  note "Merged as $MERGE_SHA"
}

verify_merge_commit() {
  stage "verifying the merged commit"
  fetch_base
  [ "$(git -C "$REPO_ROOT" cat-file -t "$MERGE_SHA" 2>/dev/null)" = commit ] || die "Merge commit $MERGE_SHA is not available after fetching $BASE_BRANCH."
  is_ancestor "$MERGE_SHA" "$BASE_SHA" || die "Merge commit $MERGE_SHA is not on $BASE_BRANCH."
  check_versions_at "$MERGE_SHA"
  MERGE_TREE="$(git -C "$REPO_ROOT" rev-parse "$MERGE_SHA^{tree}")"
}

ensure_merged_artifacts() {
  if validated_build_for "$MERGE_TREE"; then
    note "The merged tree matches the validated tree; reusing its artifacts."
    return
  fi
  stage "validating the merged commit"
  note "No validated artifacts for the merged tree; validating and packaging $MERGE_SHA."
  local dir
  dir="$(new_owned_dir)"
  git -C "$REPO_ROOT" worktree add --quiet --detach "$dir/src" "$MERGE_SHA"
  validate_and_package "$dir/src"
}

find_run() {
  local workflow="$1" event="$2" branch="$3" sha="$4" deadline line
  deadline=$(( $(now) + DISCOVERY_TIMEOUT ))
  while :; do
    line="$(gh run list --repo "$REPOSITORY" --workflow "$workflow" --event "$event" --branch "$branch" --commit "$sha" --limit 1 \
      --json databaseId --jq '.[0].databaseId // empty')" || die "Could not list $workflow runs."
    if [ -n "$line" ]; then printf '%s\n' "$line"; return; fi
    [ "$(now)" -lt "$deadline" ] || die "No $workflow run for $sha appeared within ${DISCOVERY_TIMEOUT}s."
    sleep "$POLL_INTERVAL"
  done
}

run_field() { gh run view "$1" --repo "$REPOSITORY" --json "$2" --jq ".$2 // \"none\""; }

report_run_failure() {
  local run="$1"
  printf '\nFailed jobs in run %s:\n' "$run" >&2
  gh run view "$run" --repo "$REPOSITORY" --json jobs --jq '.jobs[] | select(.conclusion != "success") | "  \(.name): \(.conclusion // .status) \(.url)"' >&2 || true
  gh run view "$run" --repo "$REPOSITORY" --log-failed 2>/dev/null | tail -n 60 >&2 || note "Failed-job logs are not accessible."
  printf 'Logs: %s\n' "$(run_field "$run" url)" >&2
}

# Watches one exact run. A run that already finished unsuccessfully (a replay) gets one failed-jobs rerun.
watch_run() {
  local run="$1" label="$2" timeout="$3" status conclusion attempt deadline
  status="$(run_field "$run" status)"; conclusion="$(run_field "$run" conclusion)"
  if [ "$status" = completed ] && [ "$conclusion" != success ]; then
    attempt="$(run_field "$run" attempt)"
    say "$label run $run previously ended $conclusion; rerunning its failed jobs once"
    gh run rerun "$run" --repo "$REPOSITORY" --failed || die "Could not rerun $label run $run."
    deadline=$(( $(now) + DISCOVERY_TIMEOUT ))
    until [ "$(run_field "$run" attempt)" -gt "$attempt" ]; do
      [ "$(now)" -lt "$deadline" ] || die "The $label rerun did not start within ${DISCOVERY_TIMEOUT}s."
      sleep "$POLL_INTERVAL"
    done
  fi
  say "Watching $label run $(run_field "$run" url)"
  if ! with_deadline "$timeout" gh run watch "$run" --repo "$REPOSITORY" --exit-status --interval "$POLL_INTERVAL"; then
    report_run_failure "$run"; die "$label run $run failed or exceeded ${timeout}s."
  fi
  conclusion="$(run_field "$run" conclusion)"
  if [ "$conclusion" != success ] || [ -n "$(gh run view "$run" --repo "$REPOSITORY" --json jobs --jq '[.jobs[] | select(.conclusion != "success")] | .[].name')" ]; then
    report_run_failure "$run"; die "$label run $run concluded $conclusion."
  fi
}

gate_main_ci() {
  stage "waiting for main CI on $MERGE_SHA"
  local run
  run="$(find_run "$CI_WORKFLOW" push "$BASE_BRANCH" "$MERGE_SHA")"
  journal_set ci_run "$run"
  watch_run "$run" "main CI" "$CI_TIMEOUT"
}

stage_assets() {
  stage "staging release assets"
  ASSETS="$ATTEMPT_DIR/assets-$MERGE_SHA"
  if [ -d "$ASSETS" ] && node "$HELPERS/assets.mjs" verify --version "$VERSION" --commit "$MERGE_SHA" --tree "$MERGE_TREE" --dir "$ASSETS" >/dev/null 2>&1; then
    note "Reusing verified staged assets in $ASSETS"
    return
  fi
  rm -rf "$ASSETS"
  node "$HELPERS/assets.mjs" stage --version "$VERSION" --commit "$MERGE_SHA" --tree "$MERGE_TREE" --source "$ATTEMPT_DIR/build" --dir "$ASSETS" || die "Staging release assets failed."
}

upload_draft() {
  stage "uploading the draft release"
  local release missing changes notes name
  release="$(node "$HELPERS/github.mjs" release "$TAG")" || die "Could not read GitHub releases."
  if [ "$release" = none ]; then
    changes="$ATTEMPT_DIR/changes.md"; notes="$ATTEMPT_DIR/notes.md"
    set -- api "repos/$REPOSITORY/releases/generate-notes" -f "tag_name=$TAG" -f "target_commitish=$MERGE_SHA"
    [ "$PREVIOUS" = none ] || set -- "$@" -f "previous_tag_name=v$PREVIOUS"
    gh "$@" --jq .body > "$changes" || die "Could not generate the change list."
    node "$HELPERS/notes.mjs" --version "$VERSION" --previous "$PREVIOUS" --commit "$MERGE_SHA" --changes "$changes" > "$notes"
    set -- release create "$TAG" --repo "$REPOSITORY" --draft --target "$MERGE_SHA" --title "Moguri $VERSION" --notes-file "$notes"
    [ "$PRERELEASE" = false ] || set -- "$@" --prerelease
    while IFS= read -r name; do set -- "$@" "$ASSETS/$name"; done <<< "$(node "$HELPERS/assets.mjs" names --version "$VERSION")"
    gh "$@" >/dev/null || note "gh reported an error creating the draft; checking what GitHub recorded."
  else
    local draft target
    IFS=$'\t' read -r _ draft _ target _ <<< "$release"
    [ "$draft" = true ] || die "$TAG is already published."
    [ "$target" = "$MERGE_SHA" ] || die "The existing $TAG draft targets $target, not $MERGE_SHA. Review it on GitHub; it was not replaced."
    note "Reusing the existing $TAG draft"
  fi
  missing="$(node "$HELPERS/github.mjs" assets "$TAG" "$ASSETS")" || die "The $TAG draft does not match the staged assets."
  if [ -n "$missing" ]; then
    set -- release upload "$TAG" --repo "$REPOSITORY"
    while IFS= read -r name; do [ -z "$name" ] || set -- "$@" "$ASSETS/$name"; done <<< "$missing"
    say "Uploading missing assets"
    gh "$@" || die "Uploading assets to the $TAG draft failed. Rerun to resume."
    missing="$(node "$HELPERS/github.mjs" assets "$TAG" "$ASSETS")" || die "The $TAG draft does not match the staged assets."
    [ -z "$missing" ] || die "The $TAG draft is still missing: $missing"
  fi
  note "Draft release has every asset with matching SHA-256 digests."
}

push_tag() {
  stage "pushing tag $TAG"
  local local_commit
  if git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    [ "$(git -C "$REPO_ROOT" cat-file -t "refs/tags/$TAG")" = tag ] || die "Local $TAG is not an annotated tag. Inspect it; it was not replaced."
    local_commit="$(git -C "$REPO_ROOT" rev-parse "refs/tags/$TAG^{commit}")"
    [ "$local_commit" = "$MERGE_SHA" ] || die "Local $TAG points to $local_commit, not $MERGE_SHA. Inspect it; it was not replaced."
  else
    git -C "$REPO_ROOT" -c tag.gpgSign=false tag -a "$TAG" "$MERGE_SHA" -m "Moguri $VERSION"
  fi
  if ! git -C "$REPO_ROOT" push --quiet "$REMOTE" "refs/tags/$TAG:refs/tags/$TAG"; then
    [ "$(remote_tag_commit)" = "$MERGE_SHA" ] || die "Pushing $TAG failed and $REMOTE does not have it."
    note "The push reported an error, but $REMOTE has $TAG on $MERGE_SHA."
  fi
  journal_set tag_pushed "$MERGE_SHA"
}

watch_release_workflow() {
  stage "watching the Release workflow"
  local run
  run="$(find_run "$RELEASE_WORKFLOW" push "$TAG" "$MERGE_SHA")"
  journal_set release_run "$run"
  watch_run "$run" "Release" "$WORKFLOW_TIMEOUT"
}

verify_publication() {
  stage "verifying the published release"
  local url
  url="$(node "$HELPERS/github.mjs" verify-published "$TAG" "$MERGE_SHA")" || die "The published $TAG release did not verify."
  [ "$(remote_tag_commit)" = "$MERGE_SHA" ] || die "Remote $TAG does not point to $MERGE_SHA."
  stage "completed"
  say "Released Moguri $VERSION: $url"
  note "Ad-hoc signed, not notarized. Users verify SHA256SUMS and use Open Anyway (see the release notes)."
}

main() {
  parse_args "$@"
  require_tools
  verify_remote
  local normalized
  normalized="$(node "$HELPERS/version-policy.mjs" normalize "$INPUT")" || exit 2
  IFS=$'\t' read -r VERSION TAG PRERELEASE <<< "$normalized"
  BRANCH="release/$TAG"
  GIT_COMMON="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  ATTEMPT_DIR="${MOGURI_RELEASE_STATE_DIR:-$GIT_COMMON/moguri-release}/$TAG"
  JOURNAL="$ATTEMPT_DIR/journal"
  [ "$MODE" = dry-run ] || { acquire_lock; mkdir -p "$ATTEMPT_DIR"; }
  fetch_base
  inspect_state
  check_policy
  print_plan
  if [ "$MODE" = dry-run ]; then say "Dry run: nothing was changed."; exit 0; fi
  journal_set version "$VERSION"

  if [ "$MODE" = local-only ]; then
    [ "$STATE" = fresh ] || die "--local-only needs a version with no existing branch, PR, tag or release (state: $STATE)."
    prepare_bump
    say "Local-only release validation passed. Artifacts: $ATTEMPT_DIR/build"
    exit 0
  fi

  case "$STATE" in
    published)
      MERGE_SHA="$(remote_tag_commit)"
      verify_publication; exit 0 ;;
    fresh)
      prepare_bump; push_branch; open_pr ;;
    branch)
      validate_existing_bump; open_pr ;;
    pr-open)
      validate_existing_bump ;;
  esac
  if [ "$STATE" = fresh ] || [ "$STATE" = branch ] || [ "$STATE" = pr-open ]; then
    gate_pr_checks
    merge_pr
  fi
  verify_merge_commit
  if [ "$STATE" != tagged ]; then
    gate_main_ci
    ensure_merged_artifacts
    stage_assets
    upload_draft
    push_tag
  fi
  watch_release_workflow
  verify_publication
}

main "$@"
