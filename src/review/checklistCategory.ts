import type { ChecklistCategory, ChecklistCoverageEntry } from './types.js';

export function checklistCategoryFromId(id: string): ChecklistCategory {
  if (id.startsWith('test:')) {
    return 'test';
  }

  if (id.startsWith('use:')) {
    return 'use';
  }

  if (id.startsWith('dep:') || id.startsWith('ref:')) {
    return 'dependency';
  }

  return 'main';
}

export function checklistEntryBlocksComplete(entry: ChecklistCoverageEntry): boolean {
  const category = entry.category ?? checklistCategoryFromId(entry.id);
  return category === 'main';
}

export function revisionSectionsForChecklistId(id: string): string[] {
  const category = checklistCategoryFromId(id);

  if (category === 'use') {
    return ['Usage'];
  }

  if (category === 'test') {
    return ['Component Design', 'Architecture'];
  }

  if (category === 'dependency') {
    return ['Component Design', 'Architecture'];
  }

  if (id.startsWith('symbol:')) {
    return ['Component Design'];
  }

  return ['Component Design', 'Architecture'];
}
