# Molecular Cloning Studio

A local-first desktop workspace for molecular cloning and sequence analysis, built with Tauri, React/TypeScript, and Rust.

## Prerequisites

- Node.js 24 or later and npm
- Rust stable with the `rustfmt` and `clippy` components
- Tauri platform prerequisites for your operating system: <https://v2.tauri.app/start/prerequisites/>

## Run locally

From this folder:

```sh
npm ci
npm run tauri dev
```

Build a desktop bundle with:

```sh
npm run tauri build
```

## Phase 0 file support

- GenBank (`.gb`, `.gbk`, `.genbank`) is the primary annotated format.
- FASTA (`.fa`, `.fasta`, `.fna`) is supported for basic sequence exchange.
- The initial proof of concept handles one record per file. Additional records and third-party formats such as SnapGene `.dna` are deferred compatibility work.
- Parsing, writing, and sequence display run locally; the app does not upload sequence data.

The GenBank test fixture in `examples/annotated-circular.gb` exercises annotations on a circular sequence, including a feature spanning the origin.

## Quality checks

```sh
npm run check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

CI runs those checks and attempts desktop builds on macOS, Windows, and Linux.
