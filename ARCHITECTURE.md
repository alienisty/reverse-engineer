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
├── src/                # Core application logic
│   ├── cli.ts          # CLI entry point
│   ├── orchestrator.ts # Main workflow controller
│   ├── lspManager.ts   # LSP lifecycle management
│   ├── discovery.ts    # Symbol/dependency discovery
│   ├── llm.ts          # LLM API service
│   ├── promptBuilder.ts# Prompt assembly for LLM input
│   └── utils/          # Helper utilities (config, paths)
├── doc/                # Documentation (SPEC.md, PLAN.md)
├── config/             # Configuration files (lsp.config.json)
├── tests/              # Test suite
├── jest.config.js      # Jest configuration
└── tsconfig.build.json # Production build configuration
```

## Core Components
- **`Orchestrator` (`src/orchestrator.ts`):** The central controller. It manages the sequence: language detection -> LSP startup -> workspace discovery -> prompt building -> LLM invocation -> file saving.
- **`LSPManager` (`src/lspManager.ts`):** Manages multiple simultaneous LSP instances based on detected languages.
- **`DiscoveryService` (`src/discovery.ts`):** Uses LSP to extract symbols, definitions, and references to build a context graph of the codebase.
- **`LLMService` (`src/llm.ts`):** Interfaces with the configured LLM API.
- **`PromptBuilder` (`src/promptBuilder.ts`):** Converts the discovered context into a structured prompt for the LLM.

## Data Flow
1. **Input:** CLI accepts file paths, project name, and working directory.
2. **Discovery:** `LSPManager` spawns servers. `DiscoveryService` queries them to map the codebase.
3. **Prompting:** `PromptBuilder` aggregates the map into a prompt.
4. **Generation:** `LLMService` sends the prompt to the LLM.
5. **Output:** The result is saved to `<name>/design.md`, with the assembled model prompt persisted as `<name>/prompt.md`.

## Packaging
- Local development uses `npm start`, which runs `src/cli.ts` through `tsx`.
- Distribution targets the compiled `dist/cli.js` entrypoint.
- `tsconfig.build.json` keeps test files out of the production build output.

## Configuration
- **LSP:** `config/lsp.config.json` defines LSP server configurations.
- **Environment:** Requires `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
