import { describe, expect, it } from '@jest/globals';
import { deriveReviewStatus } from '../../src/review/deriveReviewStatus.js';
import type { CoverageChecklistItem, DesignReviewResult } from '../../src/review/types.js';

const expectedChecklist: CoverageChecklistItem[] = [
  {
    id: 'main:src/service.ts',
    label: 'service.ts',
    sourceFile: 'src/service.ts',
    searchTerms: ['service.ts', 'service'],
    category: 'main',
  },
];

const designWithService = [
  '# Service Design',
  '',
  '## Overview',
  'Documents the Service class and service.ts responsibilities.',
].join('\n');

function buildParsed(overrides: Partial<DesignReviewResult>): DesignReviewResult {
  return {
    status: 'COMPLETE',
    checklist: [
      {
        id: 'main:src/service.ts',
        label: 'service.ts',
        sourceFile: 'src/service.ts',
        covered: true,
        category: 'main',
      },
    ],
    feedbackItems: [],
    rawResponse: 'review response',
    ...overrides,
  };
}

describe('deriveReviewStatus', () => {
  it('overrides STATUS COMPLETE when checklist items remain unchecked', () => {
    const parsed = buildParsed({
      status: 'COMPLETE',
      checklist: [
        {
          id: 'main:src/service.ts',
          label: 'service.ts',
          sourceFile: 'src/service.ts',
          covered: false,
          category: 'main',
        },
      ],
    });

    const derived = deriveReviewStatus({
      parsed,
      expectedChecklist,
      designDocument: designWithService,
    });

    expect(derived.statusOverridden).toBe(true);
    expect(derived.result.status).toBe('NEEDS_REVISION');
    expect(derived.result.feedbackItems).toEqual([
      {
        description: 'service.ts',
        codeReference: 'src/service.ts',
      },
    ]);
  });

  it('derives COMPLETE when all checklist items are covered and feedback is empty', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({
        status: 'COMPLETE',
        checklist: buildParsed({}).checklist,
      }),
      expectedChecklist,
      designDocument: designWithService,
    });

    expect(derived.statusOverridden).toBe(false);
    expect(derived.result.status).toBe('COMPLETE');
    expect(derived.result.feedbackItems).toEqual([]);
  });

  it('derives COMPLETE when only dependency checklist items remain unchecked', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({
        status: 'COMPLETE',
        checklist: [
          {
            id: 'main:src/service.ts',
            label: 'service.ts',
            sourceFile: 'src/service.ts',
            covered: true,
            category: 'main',
          },
          {
            id: 'dep:src/lib.ts',
            label: 'lib.ts',
            sourceFile: 'src/lib.ts',
            covered: false,
            category: 'dependency',
          },
        ],
      }),
      expectedChecklist: [
        ...expectedChecklist,
        {
          id: 'dep:src/lib.ts',
          label: 'lib.ts',
          sourceFile: 'src/lib.ts',
          searchTerms: ['lib.ts', 'lib'],
          category: 'dependency',
        },
      ],
      designDocument: designWithService,
    });

    expect(derived.statusOverridden).toBe(false);
    expect(derived.result.status).toBe('COMPLETE');
    expect(derived.result.feedbackItems).toEqual([]);
  });

  it('derives COMPLETE when only use checklist items remain unchecked', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({
        status: 'COMPLETE',
        checklist: [
          {
            id: 'main:src/service.ts',
            label: 'service.ts',
            sourceFile: 'src/service.ts',
            covered: true,
            category: 'main',
          },
          {
            id: 'use:src/app.ts',
            label: 'app.ts',
            sourceFile: 'src/app.ts',
            covered: false,
            category: 'use',
          },
        ],
      }),
      expectedChecklist: [
        ...expectedChecklist,
        {
          id: 'use:src/app.ts',
          label: 'app.ts',
          sourceFile: 'src/app.ts',
          searchTerms: ['app.ts', 'app'],
          category: 'use',
        },
      ],
      designDocument: designWithService,
    });

    expect(derived.statusOverridden).toBe(false);
    expect(derived.result.status).toBe('COMPLETE');
    expect(derived.result.feedbackItems).toEqual([]);
  });

  it('derives NEEDS_REVISION when validated manual feedback items remain', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({
        status: 'NEEDS_REVISION',
        checklist: [
          {
            id: 'main:src/service.ts',
            label: 'service.ts',
            sourceFile: 'src/service.ts',
            covered: true,
            category: 'main',
          },
        ],
        feedbackItems: [
          {
            section: 'Component Design',
            description: 'Missing drain() retry logic.',
            codeReference: 'service.ts',
          },
        ],
      }),
      expectedChecklist,
      designDocument: designWithService,
    });

    expect(derived.result.status).toBe('NEEDS_REVISION');
    expect(derived.result.feedbackItems).toHaveLength(1);
  });
});
