import * as path from 'node:path';

const BULLET_PREFIX_PATTERN = /^\s*[-*]\s+/;

export interface ParseContextClassificationResponseResult {
  promoteRelativePaths: string[];
  error?: string;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').trim();
}

function parsePromoteLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return normalizeRelativePath(trimmed.replace(BULLET_PREFIX_PATTERN, ''));
}

export function parseContextClassificationResponse(
  response: string,
  candidateRelativePaths: string[],
): ParseContextClassificationResponseResult {
  const candidateSet = new Set(candidateRelativePaths.map(normalizeRelativePath));
  const promoteRelativePaths: string[] = [];
  const seen = new Set<string>();

  for (const line of response.split('\n')) {
    const normalized = parsePromoteLine(line);
    if (normalized === null) {
      continue;
    }

    if (seen.has(normalized)) {
      return {
        promoteRelativePaths: [],
        error: `Duplicate promoted path: ${normalized}`,
      };
    }

    if (!candidateSet.has(normalized)) {
      return {
        promoteRelativePaths: [],
        error: `Path is not a dependency candidate: ${normalized}`,
      };
    }

    seen.add(normalized);
    promoteRelativePaths.push(normalized);
  }

  return { promoteRelativePaths };
}

export function promoteRelativePathsToAbsolute(
  promoteRelativePaths: string[],
  pwd: string,
): string[] {
  return promoteRelativePaths.map((relativePath) => path.resolve(pwd, relativePath));
}
