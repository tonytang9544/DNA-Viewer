# Project Coding Standards

These standards guide implementation of the Tauri desktop application described in [plan.md](./plan.md). Keep the TypeScript UI and Rust scientific engine as distinct layers connected through small, typed Tauri commands. Apply the conventions of each language rather than forcing one language's style onto the other.

## Frontend — TypeScript

### Modularity and boundaries

- Organize code by product feature or responsibility (for example, sequence editor, plasmid map, document I/O), not by large catch-all files.
- Keep UI components focused on rendering and interaction. Put reusable state transitions and presentation-independent logic in feature modules; keep sequence transformations and authoritative biological rules in Rust.
- Put Tauri calls behind a small typed API layer. Components should not invoke arbitrary command strings or duplicate Rust validation.
- Keep shared types limited to genuine cross-module contracts. Prefer explicit dependencies over circular imports and broad “utils” modules.
- Add an abstraction when it removes real duplication or isolates a changing boundary, such as a file-format adapter; do not build generic frameworks for hypothetical future needs.

### Readability and language conventions

- Use strict TypeScript. Prefer inferred types for obvious local values and explicit types at module boundaries, public APIs, and non-obvious data structures.
- Prefer `const`, narrow types, discriminated unions, and exhaustive handling of variants. Avoid `any`, unchecked casts, and non-null assertions; use a runtime guard or improve the type instead.
- Use descriptive names and small functions with one clear responsibility. Make state changes and asynchronous work easy to follow; avoid deeply nested conditionals and opaque chained expressions.
- Follow the formatter, linter, and established naming/import conventions once project tooling is configured. Do not add style-only configuration or dependencies without need.
- Handle loading, empty, success, and failure states intentionally. Surface command and file errors to the user; do not silently swallow failures or substitute plausible data.
- Keep visual components accessible: use semantic controls, keyboard-operable interactions, and labels that describe the action or data.

### Documentation and extensibility

- Document exported APIs and non-obvious behavior, especially coordinate systems, sequence orientation, and assumptions at the TypeScript/Rust boundary.
- Comments should explain why a decision or workaround exists, not restate what the code does. Update relevant docs when behavior or contracts change.
- Keep view state separate from sequence/document data so additional views can reuse the same model.
- Extend file support through focused format adapters and explicit capability reporting; do not scatter file-specific conditionals through UI components.

### Testing

- Keep tests proportionate while the product is early. Add a small number of focused tests for important user-visible behavior, critical state transitions, and cross-language contract handling.
- Prefer testing behavior at the feature or integration boundary over many trivial component tests or tests of implementation details.
- Do not create exhaustive snapshots, duplicate tests across layers, or broad test scaffolding before there is a stable need. Add coverage when a bug, high-risk behavior, or concrete release requirement justifies it.

## Backend — Rust

### Modularity and boundaries

- Keep biological domain logic independent of Tauri. Organize modules around clear responsibilities such as sequence model, formats, analysis, and cloning; do not split into crates until the boundaries and scale justify it.
- Expose narrow public APIs and keep implementation details private by default. Avoid cyclic module dependencies and oversized modules.
- Treat the domain model as authoritative for sequence and feature invariants. Put parsing and serialization at format boundaries, and translate to/from domain types explicitly.
- Keep Tauri commands thin: validate request shape, call domain operations, and return typed results or errors. Do not place scientific algorithms in command handlers.
- Make extension points explicit where formats or algorithms are expected to vary, but prefer straightforward enums and functions over trait hierarchies or plugin systems without a demonstrated need.

### Readability and Rust conventions

- Follow idiomatic Rust naming (`snake_case` for functions/modules, `UpperCamelCase` for types) and format with `rustfmt`; use Clippy to catch common issues when tooling is configured.
- Prefer ownership and borrowing that make lifetimes clear. Avoid unnecessary clones, interior mutability, and shared state; use them only when the design requires them.
- Use concrete types and enums to express domain concepts. Avoid stringly typed states and unchecked indexing; validate boundaries and preserve invariants in constructors or focused validation functions.
- Return `Result` for recoverable failures and define errors that preserve useful context. Propagate errors explicitly; do not hide them behind broad catches, panics for normal input, or silent fallback values.
- Keep functions focused and control flow direct. Avoid clever iterator chains or abstractions when a simple loop or match is easier to understand.
- Make coordinate conventions, strand/orientation semantics, and circular-sequence behavior explicit in types and APIs. Use checked conversions at file-format and FFI boundaries.

### Documentation and extensibility

- Add Rust documentation comments to public types and functions, explaining purpose, invariants, coordinate conventions, and important edge cases. Keep examples concise and accurate.
- Document assumptions for scientific algorithms and reference datasets, including limitations that affect interpretation. Comments should clarify reasoning that is not apparent from the code.
- Preserve unknown format metadata where practical, and report unsupported content or information loss rather than implying a lossless conversion.
- Add a new format or algorithm behind the relevant module boundary without making unrelated domain or UI code format-specific.

### Testing

- Keep the initial test suite intentionally lean. Prioritize focused unit tests for correctness-critical sequence operations, coordinate conversion, circular-origin cases, and parsing/validation boundaries.
- Add a small number of representative integration or fixture-based tests for important file and Tauri contracts; test failure cases when they could otherwise produce misleading scientific results.
- Do not aim for exhaustive coverage or add tests for every trivial accessor, branch, or internal helper. Expand tests when requirements stabilize, defects occur, or release risk warrants it.

