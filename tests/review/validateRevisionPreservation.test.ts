import { describe, expect, it } from '@jest/globals';
import { buildDesignRevisionPrompt } from '../../src/review/buildDesignRevisionPrompt.js';
import { buildRevisionRetryPrompt } from '../../src/review/buildRevisionRetryPrompt.js';
import {
  deriveAllowedRevisionSections,
  lockRevisionToAllowedSections,
  validateRevisionPreservation,
} from '../../src/review/validateRevisionPreservation.js';
import type { ChecklistCoverageEntry, DesignReviewFeedbackItem } from '../../src/review/types.js';
import { buildMinimalDesign } from './fixtures/minimalDesign.js';

describe('deriveAllowedRevisionSections', () => {
  it('routes use checklist gaps to Usage only', () => {
    const uncoveredChecklist: ChecklistCoverageEntry[] = [
      {
        id: 'use:src/app/bootstrap.ts',
        label: 'bootstrap.ts',
        sourceFile: 'src/app/bootstrap.ts',
        covered: false,
        category: 'use',
      },
    ];

    expect(deriveAllowedRevisionSections([], uncoveredChecklist)).toEqual(['Usage']);
  });

  it('includes sections from feedback items and checklist gaps', () => {
    const feedbackItems: DesignReviewFeedbackItem[] = [
      { section: 'Data Flow', description: 'Add drain flow.' },
    ];
    const uncoveredChecklist: ChecklistCoverageEntry[] = [
      {
        id: 'main:src/service.ts',
        label: 'service.ts',
        sourceFile: 'src/service.ts',
        covered: false,
        category: 'main',
      },
      {
        id: 'symbol:src/service.ts:drain',
        label: 'method drain in service.ts',
        sourceFile: 'src/service.ts',
        covered: false,
        category: 'main',
      },
    ];

    expect(deriveAllowedRevisionSections(feedbackItems, uncoveredChecklist)).toEqual([
      'Architecture',
      'Component Design',
      'Data Flow',
    ]);
  });
});

describe('validateRevisionPreservation', () => {
  const original = buildMinimalDesign();

  it('passes when only allowed sections change', () => {
    const revised = buildMinimalDesign({
      'Component Design': 'Revised component section with drain() retry logic and class details.',
    });
    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        section: 'Component Design',
        description: 'Document drain() retry logic.',
        codeReference: 'service.ts',
      },
    ];

    expect(
      validateRevisionPreservation({
        original,
        revised,
        feedbackItems,
        uncoveredChecklist: [],
      }).errors,
    ).toEqual([]);
  });

  it('fails when a disallowed section changes', () => {
    const revised = buildMinimalDesign({
      Usage: 'Completely rewritten usage examples that were not requested.',
    });
    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        section: 'Component Design',
        description: 'Document drain() retry logic.',
        codeReference: 'service.ts',
      },
    ];

    expect(
      validateRevisionPreservation({
        original,
        revised,
        feedbackItems,
        uncoveredChecklist: [],
      }).errors,
    ).toContain('## Usage changed but is not in allowed sections');
  });

  it('fails when a targeted section is unchanged despite feedback', () => {
    const revised = original;
    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        section: 'Component Design',
        description: 'Document drain() retry logic.',
        codeReference: 'service.ts',
      },
    ];

    expect(
      validateRevisionPreservation({
        original,
        revised,
        feedbackItems,
        uncoveredChecklist: [],
      }).errors,
    ).toContain('## Component Design unchanged but feedback requested changes');
  });

  it('fails when revised design drops an original section', () => {
    const revised = buildMinimalDesign();
    const withoutUsage = revised
      .split('\n')
      .filter((line) => !line.startsWith('## Usage'))
      .join('\n');

    expect(
      validateRevisionPreservation({
        original,
        revised: withoutUsage,
        feedbackItems: [],
        uncoveredChecklist: [],
      }).errors,
    ).toContain('Revised design is missing section: ## Usage');
  });

  it('allows checklist-implied sections to change without explicit feedback section', () => {
    const revised = buildMinimalDesign({
      Architecture: 'Expanded architecture for the main service file and queue boundaries.',
    });
    const uncoveredChecklist: ChecklistCoverageEntry[] = [
      {
        id: 'main:src/service.ts',
        label: 'service.ts',
        sourceFile: 'src/service.ts',
        covered: false,
        category: 'main',
      },
    ];

    expect(
      validateRevisionPreservation({
        original,
        revised,
        feedbackItems: [],
        uncoveredChecklist,
      }).errors,
    ).toEqual([]);
  });

  it('allows use checklist gaps to change only Usage', () => {
    const revised = buildMinimalDesign({
      Usage: 'Documents how bootstrap.ts wires the service at startup.',
    });
    const uncoveredChecklist: ChecklistCoverageEntry[] = [
      {
        id: 'use:src/app/bootstrap.ts',
        label: 'bootstrap.ts',
        sourceFile: 'src/app/bootstrap.ts',
        covered: false,
        category: 'use',
      },
    ];

    expect(
      validateRevisionPreservation({
        original,
        revised,
        feedbackItems: [],
        uncoveredChecklist,
      }).errors,
    ).toEqual([]);
  });
});

describe('lockRevisionToAllowedSections', () => {
  const original = buildMinimalDesign({
    Overview: 'Original overview content.',
    'Component Design': 'Original component design.',
    Usage: 'Original usage instructions.',
  });

  it('restores disallowed section changes while preserving allowed ones', () => {
    const revised = buildMinimalDesign({
      Overview: 'Unexpected rewritten overview content.',
      'Component Design': 'Updated component design with drain() retry behavior.',
      Usage: 'Unexpected rewritten usage instructions.',
    });

    const locked = lockRevisionToAllowedSections(original, revised, ['Component Design']);

    expect(locked).toContain('## Overview\nOriginal overview content.');
    expect(locked).toContain(
      '## Component Design\nUpdated component design with drain() retry behavior.',
    );
    expect(locked).toContain('## Usage\nOriginal usage instructions.');
  });
});

describe('buildDesignRevisionPrompt', () => {
  it('lists allowed sections and feedback items', () => {
    const prompt = buildDesignRevisionPrompt({
      designDocument: buildMinimalDesign(),
      generationPrompt: '## Main\nsrc/service.ts',
      feedbackItems: [
        {
          section: 'Component Design',
          description: 'Missing drain() retry logic.',
          codeReference: 'service.ts',
        },
      ],
      allowedSections: ['Component Design', 'Data Flow'],
    });

    expect(prompt).toContain('You may change only: ## Component Design, ## Data Flow.');
    expect(prompt).toContain('Missing drain() retry logic.');
    expect(prompt).toContain('_Ref: service.ts_');
    expect(prompt).toContain('## Current design document');
  });
});

describe('buildRevisionRetryPrompt', () => {
  it('includes numbered validation failures and the failed revision', () => {
    const originalPrompt = 'Revise the design.';
    const failedResponse = '# Bad revision';
    const validationErrors = ['## Usage changed but is not in allowed sections'];

    const prompt = buildRevisionRetryPrompt({
      originalPrompt,
      failedResponse,
      validationErrors,
    });

    expect(prompt).toContain('1. ## Usage changed but is not in allowed sections');
    expect(prompt).toContain('## Original revision request');
    expect(prompt).toContain(originalPrompt);
    expect(prompt).toContain('## Previous invalid revision');
    expect(prompt).toContain(failedResponse);
  });
});
