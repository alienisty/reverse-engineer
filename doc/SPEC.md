# Technical Architecture

This document covers the technical implementation details of the Reverse Engineering Design Document Tool. For information on installation, usage, and configuration, please refer to the [README.md](./README.md). For LSP-specific discovery behavior, see [LSP.md](./LSP.md).

## Data Flow

```
CLI Arguments (input files + --name + --pwd + optional --config + optional --output)
        ↓
Environment Validation + Config Loading (application base + optional project or --config overlay)
        ↓
Language Detection (extension-based)
        ↓
LSP Manager (multi-instance spawn + initialize timeout)
        ↓
Workspace Discovery (`ContextMap`: `main` + `dependencies` + `uses`)
        ↓
Context Classification (LLM promotes integral `dependencies` to `main` when candidates exist)
        ↓
Prompt Building (`## Main` + `## Dependencies` + `## Uses` + shared role model)
        ↓
LLM Generation (streamed response aggregation)
        ↓
Mermaid Post-Process (validate all mermaid fences, retry repair up to 3 times)
        ↓
Write `prompt.<model>.md` + `design.v0.<model>.md`
        ↓
Extract Programmatic Coverage Checklist (`main:`/`dep:`/`use:` file rows from `ContextMap`)
        ↓
Design Review Loop (up to 3 rounds):
  review call → parse/feedback validation retries (max 3) → derive status
  if NEEDS_REVISION and rounds remain:
    revision call → structure/preservation retries (max 3) → mermaid post-process
    write `design.vN.<model>.md`
        ↓
Write final `design.<model>.md` (latest reviewed/revised version)
```

## Workspace and Paths

- **`--pwd`** is the workspace root. It is used for:
  - Optional project overlay `config/lsp.config.json` (merged onto the application base when `--config` is omitted)
  - Spawning language servers (`cwd` and `rootUri`)
  - Resolving input file paths and discovered context paths
  - Writing output to `<outputRoot>/<name>/` (`outputRoot` is `--output` or `--pwd`)
- **Application base config** — always loaded from the packaged `config/lsp.config.json` beside the tool install.
- **`--config`** — optional overlay merged onto the base; absolute paths are used as-is, relative paths resolve from the process working directory. When set, the project overlay under `--pwd` is not applied.
- Input paths on the CLI are relative to `--pwd` when provided.
- Launch `cwd` and `--pwd` may differ. Artifact output uses `--output` when set (relative paths resolve from cwd), otherwise `--pwd`. The output root and `<name>` subdirectory are created recursively if missing. A target workspace without its own config uses the application base only.

## Context Contract

`ContextMap` (`src/types/context.ts`) is the discovery output consumed by `PromptBuilder`, `extractCoverageChecklist`, and the design review loop:

```typescript
interface ContextMap {
  main: string[];         // absolute paths: CLI inputs + promoted implementations
  dependencies: string[]; // absolute paths: type definitions main builds on (not in main)
  uses: string[];         // absolute paths: reference/usages of declared symbols (not in main)
}
```

Paths are absolute, resolved under `--pwd`, deduplicated per bucket, and sorted lexicographically. Discovery includes **every** distinct in-workspace path per bucket — no hit ranking, top-k caps, or fallback lists.

### Context classification (dependency promotion)

After LSP discovery, when `dependencies` is non-empty, `classifyContextDependencies` (`src/classify/classifyContextDependencies.ts`) calls the LLM once (with up to 3 parse retries) to decide which dependency candidates are **integral parts of the main component design** and should move to `main`.

| Aspect | Behavior |
| :--- | :--- |
| Candidates | `dependencies` only (not `uses`) |
| Prompt | Main file paths + symbols; dependency candidates with full source (`buildContextClassificationPrompt`) |
| Response | Newline-separated relative paths to promote only (empty when none) |
| Apply | `applyDependencyPromotion` moves paths to `main`, removes them from `dependencies` and `uses` |
| Skip | No LLM call when `dependencies` is empty |
| Failure | `ContextClassificationError` after parse retries exhausted |

Promotion runs before `PromptBuilder` and `extractCoverageChecklist`, so promoted files receive `main:` checklist rows instead of advisory `dep:` rows.

### Shared source role model (generation and review)

| Category | Purpose | May influence |
| :--- | :--- | :--- |
| **Main** | Core design subject | Overview, Architecture, Component Design, Data Flow, Interface Design, Roadmap, etc. |
| **Dependencies** | What main implements against | Accuracy of main’s description; not standalone design subjects |
| **Uses** | Read-only wiring evidence (production and testing) | **Usage** only — illustrative examples synthesized from patterns; must not drive other sections |

**Prohibitions (both prompts):** no consumer-driven architecture; no full designs for dependency modules; no use-site class names or verbatim consumer code in **Usage**; empty `uses` is acceptable.

**Usage section:** Read **Uses** files to identify integration patterns, then write stable illustrative snippets with fictional consumer names and only **main** APIs. Do not copy production class names, packages, or multi-line consumer bodies.

### LSP bucket routing

| LSP request | Bucket |
| :--- | :--- |
| `textDocument/implementation` | `dependencies` |
| `textDocument/definition` (referenced type definition, not already `main`) | `dependencies` |
| `textDocument/typeDefinition` from `typeParameter` + `declaration` token (not already `main`) | `main` |
| `textDocument/typeDefinition` (other, not already `main`) | `dependencies` |
| `textDocument/references` (declared symbol only) | `uses` |

Generic type-parameter promotion uses LSP semantic token types: `typeParameter` with the `declaration` modifier (covers declared type parameters and their constraint types via `typeDefinition`). Type-parameter usages without `declaration` remain in `dependencies`.

See [LSP.md](./LSP.md) for the full discovery algorithm.

## Architecture Components

### LSP Manager (`LSPManager`)
The `LSPManager` orchestrates multiple simultaneous language server instances. It:
1. Loads the application base config, then merges an overlay from `--config` or from `config/lsp.config.json` under `--pwd` when present.
2. Spawns child processes per required language with `cwd` set to `--pwd`.
3. Applies initialization timeout and early-exit handling before accepting a server as ready.
4. Routes requests to the appropriate LSP instance based on file language.
5. Exposes `openDocument` for explicit `didOpen` sync when needed.

See [LSP.md](./LSP.md) for discovery requests and response handling.

### Discovery Service (`DiscoveryService`)
Builds a `ContextMap` by first querying `textDocument/documentSymbol` to identify the file header, scanning unique header words, and resolving their imports via LSP definitions. It then walks semantic tokens and routes LSP navigation results into three buckets (see LSP bucket routing above). It also recursively processes newly discovered files in the dependencies or uses sets that reside in the same directory as any of the initial input files. Handles `null`, single, and array LSP location results; logs and continues on per-file or per-symbol failures. Returns all deduped paths per bucket within `--pwd`.

### Context classification (`src/classify/`)
Post-discovery LLM step that promotes integral dependency files to `main` (see Context classification above). `Orchestrator` invokes it between discovery and prompt building.

### Prompt Builder (`PromptBuilder`)
Assembles the user prompt from `ContextMap` file contents under `## Main`, `## Dependencies`, and `## Uses`, with explicit role framing matching the shared source role model. Lives in `src/promptBuilder.ts` (application layer, not `utils`).

### Orchestrator (`Orchestrator`)
Runs the pipeline: detect languages -> start LSPs -> discover context -> build prompt -> call LLM -> mermaid post-process -> extract coverage checklist -> run review/revision processor with immediate artifact persistence under `<outputRoot>/<name>/`.

Key responsibilities:
- Writes `prompt.<model>.md` and initial post-processed design as `design.v0.<model>.md` before review.
- Invokes `DesignReviewProcessor` with a `FileDesignReviewArtifactSink` that persists each review prompt, review response, revision prompt, per-round revised design (`design.v<round>.<model>.md`), and final `design.<model>.md` as soon as that step completes (not buffered until pipeline end).
- Passes `ContextMap`, workspace root, generation prompt, and programmatic checklist to the review processor.
- Propagates hard errors to the CLI; always shuts down LSPs in `finally`.

### Design Review Processor (`src/review/designReviewProcessor.ts`)
Coordinates reliability checks around the review/revision loop. When an optional `DesignReviewArtifactSink` is provided (the orchestrator uses `FileDesignReviewArtifactSink`), prompts and designs are written to disk at each step rather than accumulated for batch export.

1. Load layered review source context from `ContextMap` + disk reads (`reviewSourceContext.ts` — `## Main` / `## Dependencies` / `## Uses`; same role model as generation).
2. Build review prompt with precomputed checklist and source context (not by re-parsing `generationPrompt`).
3. Retry review parse/validation up to `MAX_REVIEW_PARSE_ATTEMPTS` (3) for malformed responses or invalid manual feedback refs.
4. Derive status programmatically (`deriveReviewStatus`) from checklist coverage + validated feedback. **Usage** copy-paste is judged by the reviewer model only (prompt instructs comparing **Uses** to **Usage** fenced code); there is no programmatic Usage validator.
5. If status is `NEEDS_REVISION` and rounds remain, run one revision LLM call per round. Post-revision validation checks structure (`validateDesignStructure`) and section preservation (`validateRevisionPreservation`) only; the next review round re-evaluates Usage illustrativeness via the reviewer.
6. Mermaid-post-process each revision before it is promoted to the next round.
7. Stop early on `COMPLETE`, or after `MAX_REVIEW_ROUNDS` (3) with unresolved gaps and warning logs. At most three `review-prompt.*` and three `revision-prompt.*` artifacts (one per round; parse-retry attempts may add extra review-prompt files for the same round).
8. When revision validation fails in a round before the last, continue to the next review round with the best-effort revised design.

This module throws `DesignReviewError` when review parse/validation retries are exhausted. Failed revision validation returns a best-effort design for that round and either continues to the next review round or finishes when no rounds remain.

#### Coverage checklist (`extractCoverageChecklist`)

Built from `ContextMap` before the first review round:

| Checklist prefix | Source bucket | Blocks `COMPLETE` when unchecked? |
| :--- | :--- | :--- |
| `main:` | `main` | **Yes** |
| `dep:` | `dependencies` | No (advisory; misdescription may still surface via feedback) |
| `use:` | `uses` (production and testing integration) | **No** |

Legacy `ref:` ids are treated as dependency category for parse compatibility.

#### Status derivation (`deriveReviewStatus`)

- Only **main** checklist gaps block `COMPLETE`.
- Unchecked `dep:` / `use:` rows do not block `COMPLETE`.
- Validated manual feedback items always force `NEEDS_REVISION`.
- Reviewer prompt requires detecting **Usage** copy-paste from **Uses** (consumer bodies or production class names) via manual feedback and unchecked `use:` rows; shared imports/main types alone are not treated as copy-paste.


#### Revision scope (`validateRevisionPreservation`)

Allowed sections are derived from feedback targets plus uncovered checklist gaps, routed by category:

| Checklist category | Allowed revision sections |
| :--- | :--- |
| Main | Component Design + Architecture |
| Dependency | Component Design + Architecture |
| Use | Usage only |

### Mermaid validation and repair (`src/mermaid/`)

After design generation, `MermaidPostProcessor` validates every fenced ` ```mermaid ` block in the document before write:

1. **`extractMermaidBlocks`** — fence-aware scan; returns ordered blocks with index, offsets, source, and line number for error reporting.
2. **`validateDiagram`** — thin wrapper around the official `mermaid` package `parse` API (with a minimal `happy-dom` shim for Node).
3. **`validateDesignMermaid`** — validates all extracted blocks; returns `{ valid, failures }` with per-block parse errors.
4. **`repairDesignMermaid`** — builds a repair prompt (generation context + current design + numbered failures) instructing the model to return the **complete** design markdown and change **only** invalid mermaid fences; `stripRepairResponse` unwraps an outer markdown fence if present.
5. **`MermaidPostProcessor.postProcess`** — validate → repair loop (up to **3** LLM repair calls). On success, returns the repaired document. If diagrams remain invalid after three rounds, logs a **warning per remaining failure** to stderr and still returns the last version (pipeline exits **0**; `design.<model>.md` is always written).

`prompt.<model>.md` is not updated by repair; only `design.<model>.md` reflects post-processed content.

### LLM Integration (`LLMService`)
Uses the official Node.js `openai` library with a pluggable `LLMTransport` for streaming (`stream: true`). `collectStreamedContent` aggregates delta chunks without stripping model output.

Transport exposes five streamed operations:
- `streamDesignDocument` (`SYSTEM_PROMPT`)
- `streamContextClassification` (`CONTEXT_CLASSIFICATION_SYSTEM_PROMPT`)
- `streamMermaidRepair` (`MERMAID_REPAIR_SYSTEM_PROMPT`)
- `streamDesignReview` (`DESIGN_REVIEW_SYSTEM_PROMPT`)
- `streamDesignRevision` (`DESIGN_REVISION_SYSTEM_PROMPT`)

`LLMService` mirrors those via `generateDesignDocument`, `classifyDependencies`, `repairDesignMermaid`, `reviewDesignDocument`, and `reviseDesignDocument`.

## Output Artifacts

Under `<outputRoot>/<name>/` (see Workspace and Paths for `outputRoot`):

| File | Contents |
| :--- | :--- |
| `prompt.<model>.md` | System prompt plus assembled source prompt sent to generation |
| `design.v0.<model>.md` | Initial generated design after mermaid post-process |
| `review.1.<model>.md` ... `review.3.<model>.md` | Raw, successfully parsed/validated review responses per completed round |
| `review-prompt.<round>.<attempt>.<model>.md` | System + user prompt sent for each review LLM call (includes parse-retry attempts) |
| `revision-prompt.<round>.<attempt>.<model>.md` | System + user prompt sent for each revision LLM call (includes validation-retry attempts) |
| `design.v1.<model>.md` ... `design.v3.<model>.md` | Successfully revised + mermaid-post-processed design versions per round |
| `design.<model>.md` | Final design selected by the review loop (last revised or last reviewed version) |

`<model>` is `LLM_MODEL` sanitized for use in filenames (path separators and invalid characters become `-`).

## Packaging

- Development runs the source CLI via `tsx src/cli.ts` (`npm start`).
- Distribution targets the compiled `dist/cli.js` entrypoint built from `tsconfig.build.json`.
- The build output contains application code only; tests are not emitted into `dist/`.

## Exit Codes

| Code | Meaning |
| :--- | :--- |
| 0 | Success, including best-effort completion when max review rounds are reached with unresolved gaps (warned to stderr) |
| 1 | General error (missing env, config, LSP, discovery, LLM, file I/O) or exhausted review/revision retry budgets |

Process control (`console` logging, `process.exit`) is owned by `src/cli.ts`.
