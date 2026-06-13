# Language Server Protocol (LSP) Usage

This document describes how the reverse-engineering tool uses LSP for workspace discovery. For installation, CLI usage, and high-level architecture, see [README.md](../README.md) and [SPEC.md](./SPEC.md).

## Overview

Discovery is **server-driven**: the client queries the language server for document symbols to identify the file header and scan imports/dependencies, and walks semantic tokens in each input file, issuing LSP navigation requests to find related implementation and reference files. The tool does **not** rely on language-specific regexes or AST parsers to match import patterns.

The result is a `ContextMap` with three buckets:

| Field | Meaning |
| :--- | :--- |
| `main` | Input files, implementation files, and generic-header type definitions for types declared in the inputs |
| `dependencies` | Supporting type definitions that main builds on (not already in `main`) |
| `uses` | Reference/usages of declared symbols (not already in `main`) |

Paths are absolute, resolved under `--pwd`, and filtered so only files inside the workspace root are kept.

**Post-discovery classification:** LSP routing is unchanged. When the `dependencies` bucket is non-empty, the orchestrator runs an LLM classification step (`classifyContextDependencies`) that may promote integral dependency files to `main` before prompt building. See [SPEC.md](./SPEC.md) (Context classification).

## LSP Manager Lifecycle

`LSPManager` (`src/lspManager.ts`) owns one child process and JSON-RPC connection per language:

1. **Spawn** — Runs the configured command from the merged LSP config (application base plus optional project or `--config` overlay) with `cwd` set to `--pwd` so the server indexes the target workspace.
2. **Initialize** — Sends `initialize` with `rootUri` derived from `--pwd`, then `initialized`.
3. **Readiness guards** — Rejects startup when:
   - Initialize does not complete within the timeout (default 30s, overridable via `LSPManagerOptions`).
   - The server process exits before initialize finishes.
4. **Request routing** — `sendRequest(language, method, params)` targets the connection for that language.
5. **Shutdown** — Disposes connections and kills child processes (always invoked from `Orchestrator.run` in a `finally` block).

### Document sync

Discovery calls `openDocument` (`textDocument/didOpen`) for each input file before semantic-token and navigation requests. Java (`jdtls`) in particular expects documents to be open in the LSP session rather than read implicitly from disk.

### jdtls / JSON-RPC compatibility

`LSPManager` uses a tolerant JSON-RPC connection (`src/utils/lspConnection.ts`) that:

- Normalizes malformed responses where jdtls omits `result` instead of sending `null` ([eclipse.jdt.ls#3112](https://github.com/eclipse/eclipse.jdt.ls/issues/3112)).
- Acknowledges server-initiated `client/registerCapability` and `window/workDoneProgress/create` requests.
- Serializes outbound requests per language to avoid overlapping navigation calls overwhelming the server.

## Discovery Algorithm

Implemented in `DiscoveryService.discoverContext` (`src/discovery.ts`).

### Per input file

1. Resolve the absolute path under `--pwd` and map the file extension to a language via config.
2. Open the document (`textDocument/didOpen`).
3. Query **`textDocument/documentSymbol`** to identify declarations and locate the file header:
   - Traverse the symbols to find the start line of the first declared symbol (`minStartLine`).
   - Define the file header range as lines from `0` to `minStartLine - 1` (capped at at most `100` lines).
4. Scan the file header range for unique words of length >= 2 matching `/[a-zA-Z_][a-zA-Z0-9_]*/g`.
5. For the first occurrence of each unique word in the header:
   - Query **`textDocument/definition`** and **`textDocument/typeDefinition`** at its line/character coordinate.
   - If any resolved target path is within the workspace and not already in `main`, add it to `dependencies`.
6. Request **`textDocument/semanticTokens/full`** for the file URI.
7. Decode the delta-encoded `data` array using the server’s semantic-token legend from initialize capabilities.
8. For each token whose type is in the discoverable set (`type`, `typeParameter`, `class`, `interface`, `function`, `method`, `variable`, `property`, `enum`, etc.):
   - Request **`textDocument/typeDefinition`** at the token position.
   - When the token is a generic type-parameter declaration (`typeParameter` + `declaration` modifier), add in-workspace type-definition paths to **`main`** (and remove from `dependencies` if previously added).
   - Otherwise, when the type definition is not already in `main`, add in-workspace paths to **`dependencies`**.
   - Request **`textDocument/definition`** at the token position, adding in-workspace resolved paths to **`dependencies`** (when not already in `main`).
   - When the type definition resolves to the **same file** and the token has `public` + `declaration` modifiers:
     - For `interface` or `abstract` declarations: request **`textDocument/implementation`** and add in-workspace implementation paths to `dependencies`.
     - For `class` or `interface`: request **`textDocument/references`** (excluding the declaration) and add in-workspace reference paths to `uses`.

### Response normalization

LSP navigation methods may return `null`, a single `Location`, a single `LocationLink`, or an array of either shape. Discovery normalizes all of these to arrays before processing. `LocationLink.targetUri` and `Location.uri` are both supported when extracting file paths.

### Partial failure

- A failure for one input file is logged with `console.error` and discovery continues for remaining files.
- A failure for one symbol/token is logged with position context and processing continues for other tokens.
- Missing language mapping for an extension skips that file silently.

### Workspace filtering

Discovered URIs are converted to filesystem paths and kept only when `isWithinPwd(path, pwd)` is true, so external library definitions do not enter the context map.

## LSP Methods Reference

| Method | Role in discovery |
| :--- | :--- |
| `textDocument/documentSymbol` | Identify symbols to locate the file header boundaries |
| `textDocument/semanticTokens/full` | Enumerate type-like tokens to analyze |
| `textDocument/definition` | Resolve standard and static imports in the header, and symbol definitions in code |
| `textDocument/typeDefinition` | Resolve where a token’s type is defined |
| `textDocument/implementation` | Find concrete implementations of abstract types/interfaces |
| `textDocument/references` | Find usages that provide supporting context |
| `initialize` / `initialized` | Server startup (manager only) |
| `textDocument/didOpen` | Optional explicit document sync (manager API) |

## Failure Propagation

| Layer | Behavior |
| :--- | :--- |
| `LSPManager.startServer` | Throws on missing config, spawn/stdio errors, init timeout, or early process exit |
| `DiscoveryService` | Logs per-file/per-symbol errors; returns partial `ContextMap` |
| `Orchestrator.run` | Propagates errors from LSP, discovery, LLM, or filesystem writes; always shuts down LSP in `finally` |
| `cli.ts` | Catches errors, prints to stderr, exits with code `1` |

## Related Documentation

- [SPEC.md](./SPEC.md) — End-to-end pipeline, components, packaging, and exit codes
- [README.md](../README.md) — Installation, environment variables, and CLI options
