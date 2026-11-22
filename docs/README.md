# Moguri documentation

Start with the guide for your role. Each topic has one authoritative page;
the [README](../README.md) only summarizes.

## Users

| Page | Covers |
| --- | --- |
| [Installation](installation.md) | Requirements, installing a release, first launch, the `moguri` command, upgrades, data location and removal |
| [Setup and usage](setup.md) | Every workflow in depth: providers, sessions, approvals, environments, Git and GitHub, automations, troubleshooting |
| [Settings reference](settings/README.md) | What each desktop Settings page does, its defaults and safeguards |
| [Implemented capabilities](features.md) | What the current alpha implements, by protocol checkpoint |
| [Remaining milestone gaps](remaining-milestone-gaps.md) | Milestone 1 acceptance, the roadmap closure and what is not available yet |
| [Product vision](vision.md) | The broader feature inventory, which is not a list of implemented features |

## Developers

| Page | Covers |
| --- | --- |
| [Development](development.md) | Toolchain, setup, code layout, checks, CI and packaging |
| [Releasing](releasing.md) | `scripts/release.sh`, the release workflow, recovery and current blockers |
| [Implementation specification](implementation.md) | The canonical product and delivery specification |
| [Architecture decisions](architecture/decisions.md) | The selected stack and Phase 0 validation decisions |
| [Architecture overview](architecture/overview.md) | How the service, workers and clients fit together; contracts for each subsystem live in [`architecture/`](architecture/) |
| [SDK and CLI](sdk.md) | The importable SDK, its entrypoints and the `moguri` CLI |
| [Design](design.md) and [design audit](design-audit.md) | Client design rules, Settings save behavior and the visual system |
| [Desktop sidebar specification](specs/desktop-sidebar.md) | The desktop sidebar product spec |
| [Third-party components](third-party.md) | Reused libraries, their licenses and how release artifacts carry notices |

## Project policies

- [Contributing](../CONTRIBUTING.md) and, for coding agents, [`AGENTS.md`](../AGENTS.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security policy](../SECURITY.md)
- [Accessibility](../ACCESSIBILITY.md)
- [License (MIT)](../LICENSE.md)
