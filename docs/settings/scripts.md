# Scripts

Technical reference for **Settings / Scripts**. The app shows a short summary;
this page keeps the full detail.

## Repository script reviews

- Agent assessments are advice, not a safety guarantee or permission.
- Unsafe advice never opens an execution-approval prompt by itself; the user must force the exact unsafe source first.
- Approving a safe assessment clears only that notification. It does not run the script or grant execution permission.
- Forcing overrides only the unsafe advice. Hard policy, the exact source and root, and normal execution approval still apply.
- In Sandbox, a forced script runs in a new model-free guest that uses the same verified private stage and reviewed native network boundary, never the Local source. Isolation does not make the code safe.
- Locally, code may change your files or contact external services without OS isolation.
- One original attempt is retained per review. Inspect its actual tool or job outcome; it cannot be replayed.
- Contract: `docs/architecture/content-review.md`.

## Scripts (previously "Foundational and approved scripts")

Built-in `grep_logs`, `fetch_page`, `search_memory` and `memory_graph` are exposed through the single
internal MCP, without generated one-off scripts.

## Warning

Approved custom scripts execute as Local host code, not in a fictional sandbox. Review the full source,
enable it explicitly, and approve each call. Use only scripts you trust.

## Optional evolution

The switch was previously labeled "Allow model-proposed skills, scripts and style knowledge for human
review". Off by default. Nothing applies itself; approval installs disabled content and enabling and
execution remain separate actions.

## Proposal review

The heading was "Review exact proposed content". The consent checkbox was "I reviewed this exact source.
Approval does not grant execution permissions." The SHA-256 digest shown binds the approval to the exact
content reviewed.
