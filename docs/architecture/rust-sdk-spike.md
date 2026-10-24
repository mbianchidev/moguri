# Retained Rust SDK prototype

The [issue-22 feasibility study](https://github.com/mbianchidev/moguri/issues/22)
has an opt-in source prototype under `scripts/rust-sdk-spike/`. It is not a
production SDK, TUI replacement or change to D02/D04/D14. The existing Node
control plane, worker, providers and browser-safe SDK remain authoritative.

The original study used commit
`c54ac5228f8ea3e958600bf73b4c66725493a434`, protocol 43, Node 26.12.0 and
Rust 1.99.1 on macOS arm64. The retained generators reject another protocol
rather than silently benchmarking incompatible fixtures. New results record
the actual checkout revision; historical measurements remain on the issue.

## Scope and dependencies

The Cargo workspace contains an I/O-free Rust client-state core, a direct
native benchmark driver, Node-API level-9 bindings and single-threaded
`wasm32-unknown-unknown` bindings. The JS comparison core, canonical-schema
generator, actual SDK draft oracles, generated service and hidden Electron
harnesses are retained alongside them.

The selected libraries are `jsonschema` 0.60.1 (MIT), `napi` 3.15.0 /
`napi-derive` 3.6.13 (MIT), `wasm-bindgen` 0.2.129 (MIT OR Apache-2.0),
`serde-wasm-bindgen` 0.6.5 (MIT), and `serde` / `serde_json` 1.0.229 /
1.0.154 (MIT OR Apache-2.0). `Cargo.lock` preserves the investigated graph.
No production npm dependency or runtime entrypoint loads this workspace.

Selected invariants cover immutable profile scope, frame admission, attachment
generations, a 200-event history, optimistic draft conflicts and explicit
pending/unknown/stopping outcomes. No durable event, database schema, migration,
permission grant or accounting rule changes. The code compares selected
client behavior; authoritative effects, permissions, retention and budgets
still belong to the existing service.

## Build prerequisites

Use the repository's locked Node dependencies and built SDK/service/worker:

```sh
npm ci
npm run build
```

Use a complete, matching Rust 1.99.1 toolchain with the
`wasm32-unknown-unknown` standard library. With Rustup, the target can be
installed explicitly with `rustup target add wasm32-unknown-unknown`.
Do not mix Homebrew compiler metadata with upstream standard-library
components, even when the displayed versions match.

The binding generator must match the locked `wasm-bindgen` crate:

```sh
cargo install --locked --version 0.2.129 wasm-bindgen-cli \
  --root scripts/rust-sdk-spike/tools
```

The following native-addon copy command is for the qualified macOS arm64
development host. Linux, Intel macOS, signing/notarization and relocation
remain separate acceptance gates, not implied by compilation.

## Reproduce

Run from the repository root:

```sh
cargo build --release --locked \
  --manifest-path scripts/rust-sdk-spike/Cargo.toml \
  -p sdk-study-cli -p sdk-study-native
cargo build --release --locked --target wasm32-unknown-unknown \
  --manifest-path scripts/rust-sdk-spike/Cargo.toml \
  -p sdk-study-wasm
cp scripts/rust-sdk-spike/target/release/libsdk_study_native.dylib \
  scripts/rust-sdk-spike/sdk-native.node
scripts/rust-sdk-spike/tools/bin/wasm-bindgen --target web \
  --out-dir scripts/rust-sdk-spike/pkg-web \
  scripts/rust-sdk-spike/target/wasm32-unknown-unknown/release/sdk_study_wasm.wasm

cargo test --release --locked --lib \
  --manifest-path scripts/rust-sdk-spike/Cargo.toml -p sdk-study-core
node_modules/node/bin/node scripts/rust-sdk-spike/generate.mjs
node_modules/node/bin/node scripts/rust-sdk-spike/build-fixture.mjs
node_modules/node/bin/node scripts/rust-sdk-spike/oracles.mjs
node_modules/node/bin/node scripts/rust-sdk-spike/browser-run.mjs
node_modules/node/bin/node scripts/rust-sdk-spike/lab.mjs
```

The generator writes synthetic datasets, exports the current canonical query
and command schemas, and builds the TypeBox AOT comparison. The oracle runner
compares selected draft transitions against the actual SDK. `lab.mjs` exercises
583 query shapes, 10,000 generated frame transitions, codec edge cases, matched
CPU/interop workloads, fresh-process initialization and actual authenticated
SDK requests. There is no personal provider login or paid inference.

`browser-run.mjs` owns a hidden generated Electron window with sandbox and
context isolation enabled and Node integration off. It checks WASM under
blocking/allowing CSPs, selected state/validation behavior and native-addon
loading in the main process. It closes its application and loopback server
after the run; it never opens the user's Moguri app or authorization page.
`sdk-fixture.ts` uses the generated test provider and closes its private
service and temporary project on exit.

Measurements and failure evidence are written under
`scripts/rust-sdk-spike/results/`. Rust targets, native/WASM outputs, generated
schemas/datasets/AOT modules, browser profile, toolchains and installed tools
are ignored by Git. The original session artifacts remain retained separately.

## Limits

The prototype is intentionally incomplete. It does not replace every SDK
capability, React facade, Node bootstrap, MCP function, queue or context
workflow. The earlier temporary TUI prototype is not part of this workspace.
No application default or production transport changes.

Codec probes intentionally expose current differences involving JS
`undefined`, Date objects, lone surrogates, UTF-16 offsets and safe integers.
Those observations are not drop-in compatibility passes. A single schema
does not establish identical codecs, disposal or concurrent-effect behavior.
Rust ownership does not prove permissions, durable accounting, restart
recovery or cancellation success.

Only matched workloads compare equivalent work. Full-SDK imports versus a
partial core are component observations, not a complete rewrite benchmark.
The native addon is a development artifact with a build-path-specific Mach-O
install name, not a relocatable release.
