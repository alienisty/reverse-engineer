# Code Style Guide

## Naming Conventions
- **Classes:** PascalCase (e.g., `Orchestrator`, `LSPManager`)
- **Functions/Methods:** camelCase (e.g., `run()`, `startServer()`)
- **Variables/Properties:** camelCase (e.g., `lspManager`, `config`)
- **Constants:** camelCase or UPPER_CASE (depending on scope)
- **Files:** camelCase (e.g., `orchestrator.ts`, `promptBuilder.ts`)

## File Organization
- **Core Logic:** Located in `src/`.
- **Utilities:** Located in `src/utils/`.
- **Tests:** Located in `tests/` with corresponding names (e.g., `src/orchestrator.ts` -> `tests/orchestrator.test.ts`).

## Import Style
- Use ES Modules (`import ... from '...'`).
- Prefer explicit imports.
- Use `.js` extension in imports for local files (e.g., `import { LSPManager } from './lspManager.js';`).

## Code Patterns
- **Dependency Injection:** Components are injected via constructors (e.g., `Orchestrator` receives its services in the constructor).
- **Asynchronous Operations:** Extensive use of `async`/`await` for I/O and API calls.
- **Error Handling:** Use `try-catch` blocks. CLI errors exit with `process.exit(1)`.

## Logging
- Use `console.log` for standard output.
- Use `console.error` for error output.

## Testing
- Use `jest` for unit and integration tests.
- Tests should be placed in `tests/` and mirror the `src/` structure.
- Use `cross-env NODE_OPTIONS='--experimental-vm-modules' jest` to run tests.

## Do's and Don'ts
- **Do:** Use TypeScript types for all interfaces and function signatures.
- **Do:** Keep components modular and testable via dependency injection.
- **Don't:** Hardcode configurations; use `config/` or environment variables.
- **Don't:** Use `console.log` for debugging in production code (use a proper logger if added later).
