# Reverse Engineering Design Document Tool

A tool that reverse engineers source code into detailed design documents. Given one or more input file paths, it detects the programming language, connects to the appropriate Language Server Protocol (LSP) for intelligence, discovers implementation-context files, invokes an LLM to generate a comprehensive design document, and runs a reliability-focused review/revision loop before saving final artifacts.

## Features

- **Language Detection**: Automatically detects programming languages from file extensions.
- **Multi-Language LSP Integration**: Supports simultaneous, configurable language servers (via `config/lsp.config.json`).
- **Implementation Context**: Discovers files that implement functions/types (not just call them), and deduplicates context buckets (`main` > `dependencies` > `uses`) to ensure each file path is included in at most one set.
- **LLM-Powered**: Generates comprehensive design documents using the official Node.js `openai` library.
- **Mermaid validation and repair**: Diagrams in the generated design are parsed and, when invalid, surgically repaired by the LLM (up to three attempts) before the design file is written.
- **Programmatic design review**: Each run builds a coverage checklist from discovered source files/symbols and runs up to 3 review rounds.
- **Guarded revisions**: When review finds gaps, revisions are constrained to allowed sections and validated for structure and section preservation before acceptance.
- **Versioned artifacts**: Writes `design.v0`, per-round `review.N` and `design.vN`, and final `design.<model>.md`.
- **Flexible CLI**: Supports custom working directory and design naming.
- **Terminal Progress Dashboard (TUI)**: Shows real-time spinner animations, active pipeline phase tracking, elapsed time, and a scrolling log window. Automatically falls back to clean line-by-line console logging in non-TTY environments (e.g. CI, scripts) or when `--no-tui` is specified.

## Installation

To install the dependencies and build the application:

```bash
npm install
npm run build
```

The published CLI entry point is the compiled `dist/cli.js` output. During local development, `npm start -- ...` still runs the source entrypoint through `tsx`.

### Global Installation (Run from any terminal)

To make the `reverse-engineer` command available globally in your system, first ensure you have built the application (`npm run build`), and then run either of the following commands from the project root directory:

1. **Symlink the package locally** (best for development/updates):
   ```bash
   npm link
   ```

2. **Install the package globally** from the project directory:
   ```bash
   npm install -g .
   ```

*Note: Depending on your system configuration, you may need administrator permissions (e.g., prefixing with `sudo` on Linux/macOS, or running the terminal as Administrator on Windows).*

## Usage

Set the required environment variables:

```bash$env:
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-...
export LLM_MODEL=gpt-4
```

Run the tool:

```bash
# Basic usage (globally installed)
reverse-engineer --name myproject ./service.ts ./handler.js

# Or using the local dev script
npm start -- --name myproject ./service.ts ./handler.js

# With custom working directory
reverse-engineer --pwd ./myrepo --name myproject ./service.ts ./handler.js

# Write artifacts outside the workspace (--output; relative to cwd)
reverse-engineer --pwd ./myrepo --output ./generated-docs --name myproject ./service.ts

# With an explicit LSP config overlay (relative to cwd)
reverse-engineer --pwd ./myrepo --config ./myrepo-lsp.override.json --name myproject ./service.ts

# Compiled CLI entrypoint directly via node
node dist/cli.js --name myproject ./service.ts ./handler.js
```

## Configuration

### Environment Variables
- `LLM_BASE_URL` - Base URL for LLM API (e.g., `https://api.openai.com/v1`)
- `LLM_API_KEY` - API key for authentication
- `LLM_MODEL` - Model name (e.g., `gpt-4`, `claude-3-opus`)

### LSP Configuration
The tool ships a base `config/lsp.config.json` with default language servers. Optional overlays merge on top:

- **Project workspace (`--pwd`)** — when `--config` is omitted, `config/lsp.config.json` under `--pwd` is merged if present.
- **Explicit overlay (`--config`)** — merges the given file onto the base; relative paths resolve from the process working directory.

Overlay entries replace or add `servers` and `extensions` keys from the base. Use a project config only when you need paths or commands specific to that repository.

Ensure configured executables are installed on your system PATH.

```json
{
  "typescript": { "command": "typescript-language-server", "args": ["--stdio"] },
  "python": { "command": "pyright-langserver", "args": ["--stdio"] },
  "java": { "command": "jdtls", "args": [] }
}
```

#### Installing Language Servers

| Language | Language Server | Linux / macOS Installation | Windows Installation |
| :--- | :--- | :--- | :--- |
| **TypeScript** | `typescript-language-server` | `npm install -g typescript-language-server typescript` | `npm install -g typescript-language-server typescript` |
| **Python** | `pyright` | `npm install -g pyright` | `npm install -g pyright` |
| **Java** | `jdtls` | See [Eclipse JDT.LS](https://projects.eclipse.org/projects/eclipse.jdt.ls) | See [Eclipse JDT.LS](https://projects.eclipse.org/projects/eclipse.jdt.ls) |

*Note: For Java, you must add the JDT.LS installation directory or binary to your system PATH after download.*

### CLI Options
- `--name <name>` - Name of the design (required, used for output directory)
- `--pwd <path>` - Workspace root for LSP and input resolution (optional, defaults to current directory)
- `--output <path>` - Root directory for generated artifacts (optional, defaults to `--pwd`; relative paths resolve from cwd; created if missing)
- `--config <path>` - Optional LSP config overlay merged onto the application base
- `--no-tui` - Disable TUI progress display (reverts to standard line-by-line console logs)
- `<files...>` - Input file paths (relative to --pwd if provided)

## Output
The tool writes artifacts to `<output>/<name>/` (or `<pwd>/<name>/` when `--output` is omitted). Filenames include the `LLM_MODEL` value, for example with `gpt-4`:

- `prompt.gpt-4.md` - system prompt plus assembled source prompt sent to generation
- `design.v0.gpt-4.md` - initial generated design after mermaid post-processing
- `review.1.gpt-4.md` ... `review.3.gpt-4.md` - validated review responses for completed rounds
- `design.v1.gpt-4.md` ... `design.v3.gpt-4.md` - revised designs accepted by revision validators
- `design.gpt-4.md` - final design chosen by the review loop

## Review Pipeline

After generation and initial mermaid repair, the tool performs a reliability-oriented loop:

1. Build a programmatic checklist from discovered `main`/`references` files and extracted symbols.
2. Ask the model for a structured review (`Coverage Check`, `Review Result`, `Feedback Items`).
3. Parse and validate review output (including source-anchored feedback refs); retry malformed responses up to 3 times.
4. Derive status in code (the model's `STATUS` line is advisory). Coverage honesty validation bypasses checks for uses files and uses symbols, since they must not appear in the design document except in the Usage section.
5. If revision is needed, request a constrained rewrite and validate structure + section preservation; retry up to 3 times.
6. Re-run mermaid post-processing on each accepted revision.
7. Stop early when status becomes `COMPLETE`, or after 3 rounds with warning logs and best-effort final output.


## Exit Codes

- `0`: Successful run, including best-effort completion when max review rounds are reached with unresolved gaps.
- `1`: Fatal failure (environment/config/LSP/discovery/LLM/file I/O issues, invalid/non-existent `--pwd` or input files, or exhausted review/revision retry budgets).
