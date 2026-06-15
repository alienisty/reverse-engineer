import type { ContextMap } from '../types/context.js';

/**
 * Deduplicates file paths across the entire ContextMap according to the following rules:
 * 1. Each file path appears in at most one list (main, dependencies, or uses).
 * 2. Precedence is main > dependencies > uses.
 * 3. File paths are unique within each list, preserving their relative order of appearance.
 * 
 * @param context The input ContextMap.
 * @returns A new, deduplicated ContextMap.
 */
export function deduplicateContextMap(context: ContextMap): ContextMap {
  const seen = new Set<string>();
  const main: string[] = [];
  const dependencies: string[] = [];
  const uses: string[] = [];

  for (const file of context.main) {
    if (!seen.has(file)) {
      seen.add(file);
      main.push(file);
    }
  }

  for (const file of context.dependencies) {
    if (!seen.has(file)) {
      seen.add(file);
      dependencies.push(file);
    }
  }

  for (const file of context.uses) {
    if (!seen.has(file)) {
      seen.add(file);
      uses.push(file);
    }
  }

  return { main, dependencies, uses };
}
