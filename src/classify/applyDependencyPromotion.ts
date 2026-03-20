import type { ContextMap } from '../types/context.js';

function sortedPaths(paths: string[]): string[] {
  return [...paths].sort();
}

export function applyDependencyPromotion(
  context: ContextMap,
  promotePaths: string[],
): ContextMap {
  const promoteSet = new Set(promotePaths);
  const main = [...context.main];

  for (const absolutePath of promotePaths) {
    if (!main.includes(absolutePath)) {
      main.push(absolutePath);
    }
  }

  return {
    main,
    dependencies: sortedPaths(context.dependencies.filter((path) => !promoteSet.has(path))),
    uses: sortedPaths(context.uses.filter((path) => !promoteSet.has(path))),
  };
}
