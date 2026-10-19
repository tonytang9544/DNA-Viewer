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

## Current functionality

- GenBank (`.gb`, `.gbk`, `.genbank`) is the primary annotated format.
- FASTA (`.fa`, `.fasta`, `.fna`) is supported for basic sequence exchange.
- Import one record per file, edit and export it, and keep multiple documents open in tabs.
- Edit sequence bases and feature annotations; use search, reverse complement, undo/redo, and local recovery for unsaved changes.
- View aligned forward and complementary strands with feature annotations in the SeqViz workspace, switching between linear, circular, or combined views. The standalone statistics panel is not currently exposed in this UI.
- Select sequences in either direction, extend linear selections across viewer pages, and drag circular-map selections across the origin.
- Use the left File, Edit, and View menus for document actions, editing tools, and linear/circular display modes; open documents are navigated from the top tab bar.
- Save, Save As, and GenBank/FASTA exports open the native file chooser so the output location is explicit. Save As does not automatically replace the imported source file; the app does not retain its original path.
- Local recovery is not a replacement for an exported backup.
- Linear insertions and deletions update feature coordinates. Circular records currently support equal-length substitutions only; circular insertions and deletions are rejected explicitly.
- Parsing, writing, editing, and recovery run locally; the app does not upload sequence data.
- Additional records per file and third-party formats such as SnapGene `.dna` remain deferred compatibility work.

The GenBank test fixture in `examples/annotated-circular.gb` exercises annotations on a circular sequence, including a feature spanning the origin.

The Phase 1 UI and backend are implemented. Automated frontend checks/build and Rust tests/lint pass; browser smoke testing confirms the paired-strand viewer and feature annotations render. Interactive desktop acceptance testing is still needed before treating the phase exit criteria as complete.

## Quality checks

```sh
npm run check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

CI runs those checks and attempts desktop builds on macOS, Windows, and Linux.
