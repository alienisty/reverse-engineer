import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildDesignReviewPrompt,
  buildChecklistSection,
  buildReviewSourceContext,
  formatChecklistLine,
} from '../../src/review/buildDesignReviewPrompt.js';
import { buildReviewParseRetryPrompt } from '../../src/review/buildReviewParseRetryPrompt.js';
import { parseDesignReviewResponse } from '../../src/review/parseDesignReviewResponse.js';
import type { CoverageChecklistItem } from '../../src/review/types.js';
import type { ContextMap } from '../../src/types/context.js';

const checklist: CoverageChecklistItem[] = [
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

let pwd = '';
let contextMap: ContextMap;
let sourceContext = '';

beforeAll(() => {
  pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-review-prompt-'));
  const servicePath = path.join(pwd, 'src/service.ts');
  const queuePath = path.join(pwd, 'src/queue.ts');
  const appPath = path.join(pwd, 'src/app.ts');
  mkdirSync(path.dirname(servicePath), { recursive: true });
  writeFileSync(servicePath, 'export class Service { drain() {} }');
  writeFileSync(queuePath, 'export interface Queue {}');
  writeFileSync(appPath, 'new Service().drain();');
  contextMap = {
    main: [servicePath],
    dependencies: [queuePath],
    uses: [appPath],
  };
  sourceContext = buildReviewSourceContext(contextMap, pwd);
});

afterAll(() => {
  if (pwd) {
    rmSync(pwd, { recursive: true, force: true });
  }
});

const designDocument = [
  '# Service Design',
  '',
  '## Overview',
  'Covers the Service class.',
].join('\n');

describe('buildDesignReviewPrompt', () => {
  it('embeds source context, design document, and checklist lines', () => {
    const prompt = buildDesignReviewPrompt({
      designDocument,
      sourceContext,
      checklist,
    });

    expect(prompt).toContain('## Source context');
    expect(prompt).toContain('1. **Main** — Core design subject');
    expect(prompt).toContain('2. **Dependencies** — Implementation context');
    expect(prompt).toContain('3. **Uses** — Read-only evidence');
    expect(prompt).toContain(sourceContext);
    expect(prompt).toContain('## Main');
    expect(prompt).toContain('## Dependencies');
    expect(prompt).toContain('## Uses');
    expect(prompt).toContain('## Design document');
    expect(prompt).toContain(designDocument);
    expect(prompt).toContain('- [ ] main:src/service.ts — service.ts');
    expect(prompt).toContain('- [ ] symbol:src/service.ts:drain — method drain in service.ts');
    expect(prompt).toContain('## Required response format');
    expect(prompt).toContain('STATUS: COMPLETE');
    expect(prompt).toContain('## Feedback Items');
  });

  it('requires unchanged checklist ids and labels', () => {
    const prompt = buildDesignReviewPrompt({
      designDocument,
      sourceContext,
      checklist,
    });

    expect(prompt).toContain('Include every checklist line below unchanged except toggle [ ] to [x]');
    expect(prompt).toContain('Do not invent, remove, or reword checklist lines.');
    expect(prompt).toContain('Apply the source role model');
    expect(prompt).toContain('Usage vs Uses');
  });
});

describe('buildReviewSourceContext', () => {
  it('layers Main, Dependencies, and Uses from ContextMap disk reads', () => {
    const context = buildReviewSourceContext(contextMap, pwd);

    expect(context).toContain('## Main');
    expect(context).toContain('src/service.ts');
    expect(context).toContain('## Dependencies');
    expect(context).toContain('src/queue.ts');
    expect(context).toContain('## Uses');
    expect(context).toContain('src/app.ts');
    expect(context).not.toContain('## References');
  });

  it('returns empty string when all buckets are empty', () => {
    expect(buildReviewSourceContext({ main: [], dependencies: [], uses: [] }, pwd)).toBe('');
  });
});

describe('formatChecklistLine', () => {
  it('formats unchecked and checked markers', () => {
    expect(formatChecklistLine(checklist[0]!)).toBe('- [ ] main:src/service.ts — service.ts');
    expect(formatChecklistLine(checklist[0]!, true)).toBe('- [x] main:src/service.ts — service.ts');
  });
});

describe('buildChecklistSection', () => {
  it('returns (none) for an empty checklist', () => {
    expect(buildChecklistSection([])).toBe('## Coverage Check\n(none)');
  });
});

describe('buildReviewParseRetryPrompt', () => {
  it('includes the parse failure, review prompt, and invalid response', () => {
    const reviewPrompt = buildDesignReviewPrompt({
      designDocument,
      sourceContext,
      checklist,
    });
    const failedResponse = 'STATUS: COMPLETE';
    const parseError = 'Missing ## Coverage Check section';

    const retryPrompt = buildReviewParseRetryPrompt({
      reviewPrompt,
      failedResponse,
      parseError,
    });

    expect(retryPrompt).toContain(parseError);
    expect(retryPrompt).toContain(reviewPrompt);
    expect(retryPrompt).toContain(failedResponse);
    expect(retryPrompt).toContain('First section must be ## Coverage Check');
    expect(retryPrompt).toContain('STATUS: COMPLETE or STATUS: NEEDS_REVISION');
  });
});

describe('parseDesignReviewResponse', () => {
  it('parses a well-formed review response', () => {
    const response = [
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '- [ ] symbol:src/service.ts:drain — method drain in service.ts',
      '',
      '## Review Result',
      'STATUS: NEEDS_REVISION',
      '',
      '## Feedback Items',
      '1. **[Component Design]** Missing drain() retry logic. _Ref: service.ts_',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result).toEqual({
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
          covered: false,
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
      rawResponse: response,
    });
  });

  it('parses checklist ids that contain hyphens in file paths', () => {
    const hyphenChecklist: CoverageChecklistItem[] = [
      {
        id: 'main:core/horus-core/src/main/java/au/com/onyxtech/horus/concurrent/CoalescingProcessingQueue.java',
        label: 'CoalescingProcessingQueue.java',
        sourceFile: 'core/horus-core/src/main/java/au/com/onyxtech/horus/concurrent/CoalescingProcessingQueue.java',
        searchTerms: ['CoalescingProcessingQueue.java', 'CoalescingProcessingQueue'],
        category: 'main',
      },
    ];
    const response = [
      '## Coverage Check',
      '- [x] main:core/horus-core/src/main/java/au/com/onyxtech/horus/concurrent/CoalescingProcessingQueue.java — CoalescingProcessingQueue.java',
      '',
      '## Review Result',
      'STATUS: COMPLETE',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, hyphenChecklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.checklist).toHaveLength(1);
    expect(parsed.result?.checklist[0]).toMatchObject({
      id: hyphenChecklist[0]!.id,
      covered: true,
    });
  });

  it('parses messy local-LLM output with preamble and fuzzy status formatting', () => {
    const response = [
      'Here is my review of the design document:',
      '',
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '- [x] symbol:src/service.ts:drain — method drain in service.ts',
      '',
      '## Review Result',
      '**STATUS:** COMPLETE',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.status).toBe('COMPLETE');
    expect(parsed.result?.checklist.every((entry) => entry.covered)).toBe(true);
    expect(parsed.result?.feedbackItems).toEqual([]);
  });

  it('derives COMPLETE from all checked items when STATUS line is missing', () => {
    const response = [
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '- [x] symbol:src/service.ts:drain — method drain in service.ts',
      '',
      '## Review Result',
      'Looks good.',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.status).toBe('COMPLETE');
  });

  it('derives COMPLETE when only use checklist items are unchecked and STATUS is missing', () => {
    const useChecklist: CoverageChecklistItem[] = [
      ...checklist,
      {
        id: 'use:src/app.ts',
        label: 'app.ts',
        sourceFile: 'src/app.ts',
        searchTerms: ['app.ts'],
        category: 'use',
      },
    ];
    const response = [
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '- [x] symbol:src/service.ts:drain — method drain in service.ts',
      '- [ ] use:src/app.ts — app.ts',
      '',
      '## Review Result',
      'Usage wiring not fully documented.',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, useChecklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.status).toBe('COMPLETE');
  });

  it('derives NEEDS_REVISION from unchecked checklist items when STATUS line is missing', () => {
    const response = [
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '- [ ] symbol:src/service.ts:drain — method drain in service.ts',
      '',
      '## Review Result',
      'Some gaps remain.',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.status).toBe('NEEDS_REVISION');
  });

  it('parses bullet feedback items without section tags', () => {
    const response = [
      '## Coverage Check',
      '- [ ] main:src/service.ts — service.ts',
      '- [ ] symbol:src/service.ts:drain — method drain in service.ts',
      '',
      '## Review Result',
      'STATUS: NEEDS_REVISION',
      '',
      '## Feedback Items',
      '- Missing queue lifecycle details. _Ref: service.ts_',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.result?.feedbackItems).toEqual([
      {
        description: 'Missing queue lifecycle details.',
        codeReference: 'service.ts',
      },
    ]);
  });

  it('returns an error when required sections are missing', () => {
    expect(parseDesignReviewResponse('STATUS: COMPLETE').error).toBe(
      'Missing ## Coverage Check section',
    );

    expect(
      parseDesignReviewResponse(['## Coverage Check', '- [ ] main:src/service.ts — service.ts'].join('\n')).error,
    ).toBe('Missing ## Review Result section');
  });

  it('treats expected checklist items missing from the response as uncovered gaps', () => {
    const response = [
      '## Coverage Check',
      '- [x] main:src/service.ts — service.ts',
      '',
      '## Review Result',
      'STATUS: COMPLETE',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response, checklist);

    expect(parsed.error).toBeUndefined();
    expect(parsed.result?.checklist).toEqual([
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
    ]);
    expect(parsed.result?.status).toBe('COMPLETE');
  });

  it('returns an error when STATUS cannot be determined and checklist is empty', () => {
    const response = [
      '## Coverage Check',
      '(none)',
      '',
      '## Review Result',
      'Looks acceptable.',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response);

    expect(parsed.error).toBe('Unable to parse STATUS from review response');
  });

  it('falls back to keyword detection when checklist is empty', () => {
    const response = [
      '## Coverage Check',
      '(none)',
      '',
      '## Review Result',
      'This design NEEDS REVISION before shipping.',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');

    const parsed = parseDesignReviewResponse(response);

    expect(parsed.result?.status).toBe('NEEDS_REVISION');
  });
});
