# Repositories

Technical reference for **Settings / Repositories**. The app shows a short summary;
this page keeps the full detail.

## Repository import

- Import adds repositories to this profile's Local projects. The preview shows every normalized URL and its
  destination before anything is cloned.
- Existing project registrations stay intact. Failures never delete partially cloned folders and never undo
  imports that already succeeded.
- If execution policy does not allow Local, import is blocked. No SSH or Sandbox root, and no other account,
  is substituted.
- Accepted URLs: credential-free HTTPS or SSH only, up to 100 repositories per batch. The preview shows the
  canonical parent folder.
- Clones run one at a time with your existing SSH keys and known-hosts file, without Git hooks, filters,
  submodules, model calls or interactive login. Private-repository and authentication failures, and moved
  URLs, are reported explicitly. URL redirects are not followed; they require a new reviewed URL.
- Import history keeps every batch and its per-entry results across client reloads.
- A cancelled or interrupted clone is recorded as partial. Acknowledging a partial entry records only that you
  inspected its files and possible processes; it is not proof of cleanup. The clone is not replayed and the
  partial outcome is not relabeled.
- If the service does not acknowledge an import request, check the retained batches before starting new
  work; nothing is retried automatically.

## Registered projects

- Change an existing repository's remote in its Project settings. That review shows every affected linked
  worktree, not just the project's display name.
