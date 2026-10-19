# Molecular Cloning and DNA Analysis App — Implementation Plan

## 1. Product goal

Build a desktop application for everyday molecular cloning, DNA sequence visualization, and analysis. Use a TypeScript frontend for the interactive workspace and a Rust engine for sequence operations, file parsing, and computationally intensive analysis. Tauri provides the desktop shell and the boundary between them.

The product should use the open GenBank format as its primary annotated sequence format and interoperability target, while providing a native project format when needed to preserve application state. Support importing additional formats over time to ease migration from other tools. The product should be independently designed and implemented; do not reproduce another product's branding or interface.

## 2. Initial release scope

### Include

- Create, open, edit, and save DNA/RNA and protein sequence records.
- Use GenBank as the primary annotated sequence import/export format and support FASTA for basic sequence exchange; preserve annotations and metadata where possible.
- Plan for post-MVP import of additional common formats, including SnapGene `.dna`, to make it easier for users to transition existing work. Treat broad format compatibility as a lower priority than the core editing and analysis workflows.
- Nucleotide sequence view with feature annotations, selectable regions, search, and reverse-complement navigation.
- Plasmid map view with feature labels, orientation, and a readable linear sequence view.
- Feature editing: add, edit, delete, and orient features; support common feature types such as CDS, promoter, primer, and origin of replication.
- Basic analysis: sequence length, GC content, translation, reverse complement, restriction-site search, and primer binding-site display.
- Cloning workspace for planning restriction-ligation assembly from existing fragments, with explicit input validation and a clear, editable result.
- Undo/redo for document edits, autosave or recovery for unsaved work, and useful error messages for invalid or unsupported files.
- Cross-platform desktop builds for macOS, Windows, and Linux.

### Defer until after the first usable release

- Primer design scoring, PCR simulation, and advanced assembly methods (for example Gibson or Golden Gate).
- Chromatogram viewing, NGS workflows, shared projects, cloud sync, and accounts.
- Large-scale comparative genomics and external database integrations.
- Broad third-party format compatibility, including SnapGene `.dna` import, until after the MVP. Add formats incrementally only after confirming that implementation is lawful and technically supportable; do not assume export support or full round-tripping.

## 3. Proposed architecture

```text
┌────────────────────────────────────────────────────────────┐
│ TypeScript UI (React + Vite, subject to confirmation)       │
│ Document state · sequence editor · linear view · map view   │
└──────────────────────────┬─────────────────────────────────┘
                           │ typed Tauri commands/events
┌──────────────────────────▼─────────────────────────────────┐
│ Rust application layer                                      │
│ Commands · validation · document lifecycle · file I/O       │
├────────────────────────────────────────────────────────────┤
│ Rust domain/analysis crates                                 │
│ Sequence model · feature model · translation · enzymes      │
│ cloning operations · format parsers · serialization          │
└──────────────────────────┬─────────────────────────────────┘
                           │
                    Local project files
```

- **Frontend:** TypeScript with React and Vite is a practical starting point for a component-based desktop UI. Keep rendering and interaction in the frontend; keep authoritative sequence transformations and file interpretation in Rust. Use a state solution that supports document-level undo/redo without duplicating the domain model.
- **Desktop integration:** Tauri commands should expose small, typed operations and return structured results. Generate or maintain TypeScript bindings from Rust command types where feasible. Validate inputs on the Rust side even when the UI also validates them.
- **Rust core:** Separate the domain model from Tauri-specific code so core operations can be tested without launching the desktop app. Keep parsers and exporters behind a format boundary.
- **Rendering:** Use a shared coordinate model for linear and circular views. For large records, render only visible sequence/feature ranges and avoid one UI element per base.
- **Persistence and formats:** Treat a document as sequence data, annotations, and metadata. Make GenBank the primary annotated interchange format and use a versioned application project format when needed to preserve editable state. Use atomic saves and retain the original imported file when practical. Keep format-specific readers/writers behind the format boundary so additional importers can be added without changing the core model.
- **Dependency policy:** Evaluate Rust crates for format coverage, maintenance, license compatibility, and correctness before adoption. Keep restriction-enzyme definitions and other reference datasets versioned, attributable, and independently testable.

## 4. Core domain model

Define and document stable domain types before implementing multiple views:

- **SequenceRecord:** stable ID, name, molecule type, topology (linear/circular), sequence, alphabet, and metadata.
- **Feature:** stable ID, label, feature type, strand/orientation, one or more zero-based half-open ranges, and qualifiers.
- **Project/Document:** one or more records, project metadata, and the version of the serialized schema.
- **Analysis result:** typed result data plus warnings and source coordinates; do not return display-ready strings from the scientific engine.

Coordinate conventions must be explicit and consistent across Rust, TypeScript, file formats, and UI selection. Support features that cross the origin on circular sequences, and convert between internal and external coordinate conventions only at format boundaries.

## 5. Delivery phases

### Phase 0 — Foundation and technical proof

1. Confirm target platforms, initial release format priorities, and whether the app is fully offline.
2. Scaffold Tauri, Rust, and the TypeScript UI; add formatting, linting, tests, and CI for supported operating systems.
3. Establish typed command contracts, error representation, logging, and the sequence/feature coordinate conventions.
4. Establish GenBank import/export behavior with representative annotated circular records; support basic FASTA exchange. Defer broader third-party import compatibility.

**Exit criteria:** a packaged desktop shell opens on each target OS; Rust core tests run independently; GenBank records can be imported, displayed, and exported without silent loss of supported annotations. Broad third-party format import is not an MVP gate.

### Phase 1 — Sequence documents and navigation

1. Implement record creation, file open/save, document tabs, and recovery for unsaved edits.
2. Build the linear sequence view with selection, keyboard navigation, search, and basic editing.
3. Display and edit feature annotations; support reverse-complement navigation while maintaining coherent feature coordinates and strand.
4. Add overview statistics and the initial circular plasmid map.

**Exit criteria:** a user can open, inspect, edit, save, close, and reopen a sequence document; edits and annotations remain consistent between linear and circular views.

### Phase 2 — Everyday analysis

1. Implement and test reverse complement, GC content, translation, and restriction-site search in Rust.
2. Present results as selectable sequence ranges and map annotations.
3. Add primer records and display exact primer binding matches; clearly label mismatches and ambiguity rather than implying certainty.
4. Add validation for alphabet, sequence length, feature ranges, and unsupported record constructs.

**Exit criteria:** analysis results are reproducible, coordinate-correct, and mapped to the same regions in every view.

### Phase 3 — Cloning workflow

1. Model fragments and cloning operations as explicit, inspectable inputs and outputs.
2. Implement restriction-ligation planning for a deliberately constrained initial set of cases, including compatible ends and circularization.
3. Show warnings for incompatible ends, duplicate/ambiguous sites, orientation, and unsupported cases; never silently produce a plausible-looking invalid construct.
4. Let users inspect and edit the resulting construct and its feature annotations before saving.

**Exit criteria:** a documented set of representative cloning scenarios produces validated constructs, with negative tests for invalid or ambiguous inputs.

### Phase 4 — Hardening and release

1. Test large records, malformed files, unusual annotations, circular-origin features, and platform-specific file dialogs and packaging.
2. Add accessibility, keyboard workflows, localization-ready UI strings, and user-facing documentation.
3. Review privacy, update/signing strategy, dependency licenses, and backup/recovery behavior.
4. Collect opt-in feedback and use it to prioritize advanced assembly and analysis workflows.

**Exit criteria:** release builds install and launch on all supported operating systems; critical workflows pass automated and manual acceptance checks; known format limitations are documented.

### Phase 5 — Migration-focused format imports

1. Gather representative user-provided files and prioritize additional formats based on actual migration needs.
2. Add importers incrementally, starting with widely used annotated formats such as SnapGene `.dna` where lawful and technically supportable.
3. Map supported annotations and metadata into the shared domain model; preserve the source file and clearly report unsupported fields or information loss.
4. Add format-specific fixtures and round-trip/import fidelity tests. Treat import as a compatibility feature, not a prerequisite for the MVP.

**Exit criteria:** each additional importer has documented format coverage, tested annotation mapping, explicit limitations, and actionable errors for unsupported or malformed input.

## 6. Testing and correctness strategy

- **Rust unit tests:** sequence alphabet handling, coordinate conversions, circular wraparound, reverse complement, translation, restriction matching, and cloning edge cases.
- **Format fixtures:** representative valid and invalid GenBank and FASTA documents for MVP, followed by fixtures for each added third-party importer; assert round-trip behavior where supported and document which metadata is preserved or discarded.
- **Property tests:** reverse-complement involution; sequence length preservation; valid feature ranges after transformations; consistent coordinate conversion.
- **Frontend tests:** selection and editing behavior, keyboard navigation, map/linear synchronization, undo/redo, error states, and accessibility basics.
- **Integration tests:** Tauri command serialization, open/edit/save/reopen flows, and generated clone validation.
- **Manual acceptance:** use a small, reviewed fixture set on each OS; verify rendering, file dialogs, high-DPI behavior, and packaged installation.
- **Scientific validation:** compare outputs against hand-checked examples and independently verified references. Record assumptions and limitations for each algorithm and dataset.

## 7. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Coordinate bugs, especially on circular sequences | Specify zero-based half-open internal ranges; test origin-spanning features and every transformation. |
| File conversion loses annotations or metadata | Define supported format subsets, preserve unknown GenBank qualifiers where possible, and report losses or unsupported fields during import/export. |
| UI becomes slow for long sequences | Virtualize visible sequence ranges and benchmark with realistic large records early. |
| Scientific results appear authoritative despite ambiguous inputs | Return structured warnings, expose assumptions, and reject unsupported cases explicitly. |
| Frontend and Rust models drift | Keep command/domain types centralized and test serialization at the boundary. |
| Licensing or data provenance issues | Audit dependencies and reference datasets before adoption; record licenses and attribution in the project. |
| Scope expands before core workflows work | Deliver in phases; keep advanced assembly and integrations out of the first release. |

## 8. Suggested initial repository layout

```text
src/                    # TypeScript UI, views, and frontend state
src-tauri/
  src/                  # Tauri commands and application lifecycle
  crates/
    domain/             # Sequence, feature, document types and invariants
    formats/            # GenBank-first, then FASTA and additional importers
    analysis/           # Translation, enzymes, and other sequence operations
    cloning/            # Validated construct operations
```

Keep the exact crate split proportional to the initial codebase; the boundaries are logical responsibilities, not a requirement to create empty crates up front.

## 9. First implementation milestone

Start with the foundation and a thin vertical slice:

1. Create the Tauri + TypeScript + Rust project and CI.
2. Define the sequence and feature model, coordinate rules, and typed error shape.
3. Import one GenBank record in Rust, expose it through a typed Tauri command, and display it in a simple linear view.
4. Add a round-trip test and verify that malformed input produces an actionable error.
5. Verify annotated and circular GenBank records before building out the map and editing workflows; keep SnapGene `.dna` and other third-party importers in the post-MVP compatibility phase.

This sequence validates the cross-language architecture early while keeping the first milestone small enough to complete and review.
