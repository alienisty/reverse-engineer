import { describe, expect, it } from '@jest/globals';
import {
  checklistCategoryFromId,
  checklistEntryBlocksComplete,
  revisionSectionsForChecklistId,
} from '../../src/review/checklistCategory.js';
import type { ChecklistCoverageEntry } from '../../src/review/types.js';

describe('checklistCategory', () => {
  it('maps id prefixes to categories', () => {
    expect(checklistCategoryFromId('main:src/a.ts')).toBe('main');
    expect(checklistCategoryFromId('symbol:src/a.ts:Foo')).toBe('main');
    expect(checklistCategoryFromId('dep:src/lib.ts')).toBe('dependency');
    expect(checklistCategoryFromId('use:src/app.ts')).toBe('use');
    expect(checklistCategoryFromId('test:src/ServiceTest.java')).toBe('test');
    expect(checklistCategoryFromId('ref:legacy.ts')).toBe('dependency');
  });

  it('treats only main entries as blocking for COMPLETE', () => {
    const mainEntry: ChecklistCoverageEntry = {
      id: 'main:src/service.ts',
      label: 'service.ts',
      sourceFile: 'src/service.ts',
      covered: false,
      category: 'main',
    };
    const useEntry: ChecklistCoverageEntry = {
      id: 'use:src/app.ts',
      label: 'app.ts',
      sourceFile: 'src/app.ts',
      covered: false,
      category: 'use',
    };
    const depEntry: ChecklistCoverageEntry = {
      id: 'dep:src/lib.ts',
      label: 'lib.ts',
      sourceFile: 'src/lib.ts',
      covered: false,
      category: 'dependency',
    };

    expect(checklistEntryBlocksComplete(mainEntry)).toBe(true);
    expect(checklistEntryBlocksComplete(useEntry)).toBe(false);
    expect(checklistEntryBlocksComplete(depEntry)).toBe(false);
  });

  it('routes revision sections by category', () => {
    expect(revisionSectionsForChecklistId('test:src/ServiceTest.java')).toEqual([
      'Component Design',
      'Architecture',
    ]);
    expect(revisionSectionsForChecklistId('use:src/app.ts')).toEqual(['Usage']);
    expect(revisionSectionsForChecklistId('dep:src/lib.ts')).toEqual([
      'Component Design',
      'Architecture',
    ]);
    expect(revisionSectionsForChecklistId('symbol:src/a.ts:run')).toEqual(['Component Design']);
  });
});
