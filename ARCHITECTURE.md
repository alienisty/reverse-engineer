# Architecture: Reverse Engineering Design Document Tool

## Overview
This tool automates the creation of technical design documents by analyzing source code. It leverages Language Server Protocol (LSP) to understand code structure, dependencies, and type information, then uses an LLM to generate a comprehensive `design.md` file.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js
- **CLI Framework:** `commander`
- **LLM Integration:** `openai` (Node.js SDK)
- **LSP Integration:** `vscode-languageserver`, `vscode-languageserver-protocol`, `vscode-jsonrpc`
- **Testing:** `jest`, `ts-jest`
- **Build/Run:** `tsc` (`tsconfig.build.json`), `tsx`

## Directory Structure
```text
.
├── src/                  # Core application logic
│   ├── classify/         # Context dependency promotion (LLM classification)
│   ├── cli.ts            # CLI entry point
│   ├── discovery.ts      # Symbol/dependency discovery
│   ├── llm.ts            # LLM API service
│   ├── lspManager.ts     # LSP lifecycle management
│   ├── mermaid/          # Mermaid diagram validation and repair
│   ├── orchestrator.ts   # Main workflow controller
│   ├── progressLogger.ts # CLI progress logger
│   ├── promptBuilder.ts  # Prompt assembly for LLM input
│   ├── review/           # Programmatic design review, checklist, and revision loop
│   │   ├── extractCoverageChecklist.ts # Programmatic checklist extraction (propagates symbols as search terms)
│   │   └── ...
│   ├── sourceRoleModel.ts  # Shared source role model mapping
│   ├── types/            # Core TypeScript types
│   └── utils/            # Helper utilities (config, paths)
├── doc/                  # Documentation (SPEC.md, PLAN.md)
├── config/               # Configuration files (lsp.config.json)
├── tests/                # Test suite
├── jest.config.js        # Jest configuration
└── tsconfig.build.json   # Production build configuration
```

## Core Components
- **`Orchestrator` (`src/orchestrator.ts`):** The central controller. It manages the sequence: language detection -> LSP startup -> workspace discovery -> context classification -> prompt building -> LLM invocation -> mermaid post-processing -> extract checklist -> design review loop -> file saving.
- **`LSPManager` (`src/lspManager.ts`):** Manages multiple simultaneous LSP instances based on detected languages.
- **`DiscoveryService` (`src/discovery.ts`):** Uses LSP (document symbols, definitions, type definitions, references) to discover workspace imports, symbols, and references to build a context graph of the codebase, recursively scanning discovered files that share a directory with the initial input files.
- **`ContextClassifier` (`src/classify/`):** Invokes the LLM to classify discovered dependencies and promote integral candidates to `main` files.
- **`LLMService` (`src/llm.ts`):** Interfaces with the configured LLM API using the official Node.js SDK.
- **`PromptBuilder` (`src/promptBuilder.ts`):** Converts the classified context map into a structured prompt for the LLM.
- **`ProgressLogger` (`src/progressLogger.ts`):** Handles CLI output logging. Includes `createConsoleProgressLogger` for clean line-by-line output, and `TUIProgressLogger` for a rich, in-place dashboard showing real-time spinner animations, pipeline stages, elapsed time, and scrolling logs (when stdout is a TTY and not disabled).
- **`MermaidPostProcessor` (`src/mermaid/`):** Extracts, parses, and validates all Mermaid diagrams in the generated design document, invoking the LLM up to three times to repair any invalid syntax.
- **`DesignReviewProcessor` (`src/review/`):** Orchestrates the programmatic design review and revision loop:
  - **`extractCoverageChecklist`**: Generates a checklist of files and symbols from the main files. Defines symbol names defined in main files are propagated as search terms to their parent files.
  - **`validateRevisionPreservation`**: Restricts revision LLM requests to specific allowed sections targetable by feedback/checklist gaps.

## Data Flow
1. **Input & Config:** CLI parses options, loads the base configuration, and overlays either the `--config` file or the workspace-level `config/lsp.config.json`.
2. **Language Detection & LSP Startup:** Extension-based language detection occurs and matching LSP processes are spawned.
3. **Workspace Discovery:** Discovers `main`, `dependencies`, and `uses` files via LSP.
4. **Context Classification:** Dependency promotion classification runs to move integral files into `main`.
5. **Prompt Building & Generation:** `PromptBuilder` aggregates files, and the LLM streams the initial design document.
6. **Mermaid Post-Processing:** Diagrams are checked for syntax correctness and repaired if necessary.
7. **Design Review Loop (up to 3 rounds):**
   - The checklist is extracted (with symbols propagated to file search terms).
   - The LLM performs a structured review of the design against the checklist.
   - Gaps are evaluated in code.
   - If gaps/feedback exist and rounds remain, a revision prompt is generated, and a revised design is requested, validated for structural preservation, mermaid post-processed, and carried to the next round.
8. **Output Writing:** Persists the final and versioned design, prompt, review, and revision logs to `<outputRoot>/<name>/`.

## Packaging
- Local development uses `npm start`, which runs `src/cli.ts` through `tsx`.
- Distribution targets the compiled `dist/cli.js` entrypoint.
- `tsconfig.build.json` keeps test files out of the production build output.

## Configuration
- **LSP:** `config/lsp.config.json` defines LSP server configurations.
- **Environment:** Requires `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.

