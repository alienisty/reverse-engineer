import * as path from 'node:path';
import type { ContextMap } from '../types/context.js';
import { isTestSourceFile } from '../utils/pathUtils.js';
import type { ChecklistCategory, CoverageChecklistItem } from './types.js';

function toRelativePath(absolutePath: string, pwd: string): string {
  return path.relative(pwd, absolutePath).split(path.sep).join('/');
}

function basename(relativePath: string): string {
  return path.posix.basename(relativePath.replace(/\\/g, '/'));
}

function fileSearchTerms(relativePath: string): string[] {
  const base = basename(relativePath);
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  const terms = new Set<string>([base]);

  if (stem.length > 0 && stem !== base) {
    terms.add(stem);
  }

  return [...terms];
}

function buildFileItem(
  prefix: 'main' | 'dep' | 'use' | 'test',
  category: ChecklistCategory,
  relativePath: string,
): CoverageChecklistItem {
  const fileName = basename(relativePath);

  return {
    id: `${prefix}:${relativePath}`,
    label: fileName,
    sourceFile: relativePath,
    searchTerms: fileSearchTerms(relativePath),
    category,
  };
}

export function extractCoverageChecklist(
  context: ContextMap,
  pwd: string,
): CoverageChecklistItem[] {
  const items: CoverageChecklistItem[] = [];

  for (const absolutePath of context.main) {
    const relativePath = toRelativePath(absolutePath, pwd);
    items.push(buildFileItem('main', 'main', relativePath));
  }

  for (const absolutePath of context.dependencies) {
    const relativePath = toRelativePath(absolutePath, pwd);
    items.push(buildFileItem('dep', 'dependency', relativePath));
  }

  for (const absolutePath of context.uses) {
    const relativePath = toRelativePath(absolutePath, pwd);
    if (isTestSourceFile(relativePath)) {
      items.push(buildFileItem('test', 'test', relativePath));
    } else {
      items.push(buildFileItem('use', 'use', relativePath));
    }
  }

  return items;
}
