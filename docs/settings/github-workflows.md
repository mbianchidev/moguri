# GitHub workflows

Technical reference for **Settings / GitHub workflows**. The app shows a short summary;
this page keeps the full detail.

## GitHub integration

- Moguri uses one existing GitHub CLI (`gh`) account on this Mac for repository discovery, issues and pull
  requests. There is no client ID, copied token or account name to configure.
- The Copilot model login and the private updater PAT stay separate from this account. Remote operations keep
  their separately captured SSH account.
- Where to start work: use New to import a repository, Code change for pull requests and Work item for GitHub
  issues. Project menus start sessions from either source.
- Verifying the account (status "Verified gh account: LOGIN / ID") does not grant repository access or approve
  any operation. If the account is unavailable or cannot be verified, no other credential is used.
- Sign in: in a Local session terminal or your own terminal on this Mac, run
  `gh auth login --hostname github.com --web --git-protocol ssh`, then return and verify the account. You
  complete authorization yourself. Private repositories need access through this account; organizations may
  also require SSO authorization.
- For background linked-PR observations, choose your signed-in GitHub CLI account under Project settings.
  Remote metadata keeps its separately selected SSH account. Moguri never switches accounts or authenticates
  automatically.
- Open terminal needs a selected Local session; Moguri does not create a global console or a hidden chat for
  it.

## Advanced Git and GitHub operations

- These are explicit operations on a Local project or managed workspace. Before each write you review the exact
  HEAD, index digest, remote or resource revision and any protected actions (for example pushing to the main
  branch), and you confirm each protected action separately.
- Git hooks and Git configuration are honored as usual; they are not sandboxed.
- GitHub calls use only the named controller `gh` account (the "gh account login" field), never SSH
  credentials.
- New work needs an explicitly allowed Local project. There is no Remote or Sandbox fallback and no inherited
  root. Retained operation history stays inspectable without a source project.
- If repository defaults (repository, account, default branch, current branch) cannot be read, check the
  upstream remote and the `gh` account; Git-only inputs stay available.
- Operation labels were shortened; the underlying operations are unchanged:
  - "Create local branch": creates the exact branch name from the given start branch or commit; optionally
    switches to it (requires a clean checkout).
  - "Stage files" / "Unstage files" / "Commit staged files": act on the exact listed paths only; the commit
    includes only the selected staged paths.
  - "Revert current commit": rolls back the current commit by creating a new revert commit whose tree equals the
    previous tree. History is preserved and dirty work is never reset.
  - "Push branch (optional force-with-lease)": force-with-lease uses the exact remote SHA captured in the
    review; Moguri never performs a raw force push.
  - "Push tag", "Delete tag": act on the exact named tag, locally or on an explicit remote.
  - "Edit / Delete issue, PR or review comment": target an existing comment by ID in either the issue/PR
    conversation or an inline PR review.
  - "Submit PR review" and "Merge pull request": bound to the exact PR head reviewed.
  - "Publish draft release": publishes a reviewed draft release.
  - "Watch CI for a commit": watches CI at the exact head SHA, with a bounded deadline of at most 1800 seconds.
- Rebase: start on a clean current branch, continue after explicitly resolving and staging conflicts, or
  explicitly abort the rebase.
- Draft PRs and draft releases: publishing requires a separate explicit confirmation.
- Review panel fields: Local root, HEAD, index digest, remote name/URL, destination ref and SHA, the controller
  GitHub identity, and the review digest. Remote resource content shown in the review is the exact revision
  reviewed and is untrusted data.
- Read GitHub data: read-only, bounded pages (20 items per page) using the repository and account entered above.
  There is no endpoint editor, no account substitution and no implicit refresh.
- Operation history includes this profile's independently retained operations from all projects, including
  deleted sources. Selecting a history entry never grants access to that source root. Deleting the source session
  does not erase the operation.
- Interrupted or ambiguous writes are recorded as partial. They are never automatically replayed, rolled back
  or reported as successful. Conflict resolution, rebase continue/abort and every new write need their own fresh
  review.
- Starting an operation never retries or cleans up branches automatically; inspect its retained result.
- CI results: if the bounded deadline is reached, pending or no-checks is not success. A completed watch is an
  observed result for that exact head, not branch-protection clearance.
- Partial Git operations: acknowledging an inspection records only that you inspected the retained partial
  operation, its original input and possible effects. It is not cleanup proof or success. It does not stop,
  signal, replay, undo or resume work, infer process (PID) ownership, or clear other uncertainty about the
  root. The operation stays partial, and the acknowledgement is not permission to replay.

## Advanced Git and GitHub operations

The disclosure was previously labeled "Advanced reviewed Git and GitHub operations". Every operation in
it is reviewed before it runs.
