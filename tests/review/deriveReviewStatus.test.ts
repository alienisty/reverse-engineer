import { describe, expect, it } from '@jest/globals';
import { deriveReviewStatus } from '../../src/review/deriveReviewStatus.js';
import { validateCoverageHonesty } from '../../src/review/validateCoverageHonesty.js';
import type { CoverageChecklistItem, DesignReviewResult } from '../../src/review/types.js';

const expectedChecklist: CoverageChecklistItem[] = [
  {
    id: 'main:src/service.ts',
    label: 'service.ts',
    sourceFile: 'src/service.ts',
    searchTerms: ['service.ts', 'service'],
    category: 'main',
  },
  {
    id: 'symbol:src/service.ts:drain',
    label: 'method drain in service.ts',
    sourceFile: 'src/service.ts',
    searchTerms: ['drain'],
    category: 'main',
  },
];

const designWithService = [
  '# Service Design',
  '',
  '## Overview',
  'Documents the Service class and service.ts responsibilities.',
].join('\n');

const designWithoutDrain = [
  '# Service Design',
  '',
  '## Overview',
  'Documents the Service class and service.ts responsibilities.',
  'Covers the main service file only.',
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
      {
        id: 'symbol:src/service.ts:drain',
        label: 'method drain in service.ts',
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

describe('validateCoverageHonesty', () => {
  it('auto-flips false [x] checkmarks when search terms are absent from the design', () => {
    const result = validateCoverageHonesty({
      checklist: buildParsed({}).checklist,
      expectedChecklist,
      designDocument: designWithoutDrain,
    });

    expect(result.failedItemIds).toEqual(['symbol:src/service.ts:drain']);
    expect(result.checklist.find((entry) => entry.id === 'symbol:src/service.ts:drain')?.covered).toBe(
      false,
    );
    expect(result.feedbackItems).toEqual([
      {
        description: 'Design does not mention method drain in service.ts despite coverage claim',
        codeReference: 'src/service.ts',
      },
    ]);
  });

  it('keeps honest [x] checkmarks when search terms appear in the design', () => {
    const result = validateCoverageHonesty({
      checklist: buildParsed({}).checklist,
      expectedChecklist,
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
    });

    expect(result.failedItemIds).toEqual([]);
    expect(result.checklist.every((entry) => entry.covered)).toBe(true);
    expect(result.feedbackItems).toEqual([]);
  });

  it('skips honesty check for test files even if they are in category main', () => {
    const testExpected: CoverageChecklistItem[] = [
      {
        id: 'main:tests/ServiceTest.ts',
        label: 'ServiceTest.ts',
        sourceFile: 'tests/ServiceTest.ts',
        searchTerms: ['ServiceTest.ts', 'ServiceTest'],
        category: 'main',
      },
    ];
    const testChecklist = [
      {
        id: 'main:tests/ServiceTest.ts',
        label: 'ServiceTest.ts',
        sourceFile: 'tests/ServiceTest.ts',
        covered: true,
        category: 'main' as const,
      },
    ];
    const result = validateCoverageHonesty({
      checklist: testChecklist,
      expectedChecklist: testExpected,
      designDocument: '# Some Design document without mentions',
    });

    expect(result.failedItemIds).toEqual([]);
    expect(result.checklist[0]?.covered).toBe(true);
    expect(result.feedbackItems).toEqual([]);
  });

  it('skips honesty check for symbols in test files', () => {
    const testExpected: CoverageChecklistItem[] = [
      {
        id: 'symbol:tests/ServiceTest.ts:ServiceTest',
        label: 'class ServiceTest in ServiceTest.ts',
        sourceFile: 'tests/ServiceTest.ts',
        searchTerms: ['ServiceTest'],
        category: 'main',
      },
    ];
    const testChecklist = [
      {
        id: 'symbol:tests/ServiceTest.ts:ServiceTest',
        label: 'class ServiceTest in ServiceTest.ts',
        sourceFile: 'tests/ServiceTest.ts',
        covered: true,
        category: 'main' as const,
      },
    ];
    const result = validateCoverageHonesty({
      checklist: testChecklist,
      expectedChecklist: testExpected,
      designDocument: '# Some Design document without mentions',
    });

    expect(result.failedItemIds).toEqual([]);
    expect(result.checklist[0]?.covered).toBe(true);
    expect(result.feedbackItems).toEqual([]);
  });
});

describe('deriveReviewStatus', () => {
  it('overrides STATUS COMPLETE when checklist items remain unchecked', () => {
    const parsed = buildParsed({
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
          id: 'symbol:src/service.ts:drain',
          label: 'method drain in service.ts',
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
        description: 'method drain in service.ts',
        codeReference: 'src/service.ts',
      },
    ]);
  });

  it('derives NEEDS_REVISION from false [x] coverage claims', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({ status: 'COMPLETE' }),
      expectedChecklist,
      designDocument: designWithoutDrain,
    });

    expect(derived.statusOverridden).toBe(true);
    expect(derived.honestyFailures).toEqual(['symbol:src/service.ts:drain']);
    expect(derived.result.status).toBe('NEEDS_REVISION');
    expect(derived.result.feedbackItems).toEqual([
      {
        description: 'Design does not mention method drain in service.ts despite coverage claim',
        codeReference: 'src/service.ts',
      },
    ]);
    expect(derived.result.checklist.find((entry) => entry.id === 'symbol:src/service.ts:drain')?.covered).toBe(
      false,
    );
  });

  it('derives COMPLETE when all checklist items are honestly covered and feedback is empty', () => {
    const derived = deriveReviewStatus({
      parsed: buildParsed({
        status: 'COMPLETE',
        checklist: buildParsed({}).checklist,
      }),
      expectedChecklist,
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
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
            id: 'symbol:src/service.ts:drain',
            label: 'method drain in service.ts',
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
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
    });

    expect(derived.statusOverridden).toBe(false);
    expect(derived.result.status).toBe('COMPLETE');
    expect(derived.result.feedbackItems).toEqual([]);
  });

  it('does not fail honesty when a covered use item is absent from the design', () => {
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
            id: 'symbol:src/service.ts:drain',
            label: 'method drain in service.ts',
            sourceFile: 'src/service.ts',
            covered: true,
            category: 'main',
          },
          {
            id: 'use:src/app.ts',
            label: 'app.ts',
            sourceFile: 'src/app.ts',
            covered: true,
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
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
    });

    expect(derived.honestyFailures).toEqual([]);
    expect(derived.result.status).toBe('COMPLETE');
    expect(derived.result.feedbackItems).toEqual([]);
  });

  it('does not fail honesty when a covered test item is absent from the design', () => {
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
            id: 'symbol:src/service.ts:drain',
            label: 'method drain in service.ts',
            sourceFile: 'src/service.ts',
            covered: true,
            category: 'main',
          },
          {
            id: 'test:src/ServiceTest.java',
            label: 'ServiceTest.java',
            sourceFile: 'src/ServiceTest.java',
            covered: true,
            category: 'test',
          },
        ],
      }),
      expectedChecklist: [
        ...expectedChecklist,
        {
          id: 'test:src/ServiceTest.java',
          label: 'ServiceTest.java',
          sourceFile: 'src/ServiceTest.java',
          searchTerms: ['ServiceTest.java', 'ServiceTest'],
          category: 'test',
        },
      ],
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
    });

    expect(derived.honestyFailures).toEqual([]);
    expect(derived.result.status).toBe('COMPLETE');
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
            id: 'symbol:src/service.ts:drain',
            label: 'method drain in service.ts',
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
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
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
          {
            id: 'symbol:src/service.ts:drain',
            label: 'method drain in service.ts',
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
      designDocument: `${designWithService}\nThe drain method handles queue flushing.`,
    });

    expect(derived.result.status).toBe('NEEDS_REVISION');
    expect(derived.result.feedbackItems).toHaveLength(1);
  });
});
