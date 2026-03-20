import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DesignReviewProcessor } from '../../src/review/designReviewProcessor.js';
import type { DesignReviewArtifactSink } from '../../src/review/designReviewArtifactSink.js';
import { buildChecklistSection } from '../../src/review/buildDesignReviewPrompt.js';
import type { CoverageChecklistItem } from '../../src/review/types.js';
import type { ContextMap } from '../../src/types/context.js';
import { buildMinimalDesign } from './fixtures/minimalDesign.js';

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

const generationPrompt = [
  'Your goal is to analyze the provided source code.',
  '',
  '## Main',
  'src/service.ts',
  '```typescript',
  'export class Service {',
  '  public drain(): Promise<void> {',
  '    return Promise.resolve();',
  '  }',
  '}',
  '```',
  '',
  '## Dependencies',
  'src/helpers/util.ts',
  '```typescript',
  'export function helper() {',
  '  return true;',
  '}',
  '```',
].join('\n');

let pwd = '';
let contextMap: ContextMap;

beforeAll(() => {
  pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-review-processor-'));
  const servicePath = path.join(pwd, 'src/service.ts');
  const utilPath = path.join(pwd, 'src/helpers/util.ts');
  mkdirSync(path.dirname(servicePath), { recursive: true });
  mkdirSync(path.dirname(utilPath), { recursive: true });
  writeFileSync(
    servicePath,
    [
      'export class Service {',
      '  public drain(): Promise<void> {',
      '    return Promise.resolve();',
      '  }',
      '}',
    ].join('\n'),
  );
  writeFileSync(utilPath, 'export function helper() { return true; }');
  contextMap = {
    main: [servicePath],
    dependencies: [utilPath],
    uses: [],
  };
});

afterAll(() => {
  if (pwd) {
    rmSync(pwd, { recursive: true, force: true });
  }
});

const baseSectionBodies = {
  Overview: 'Documents the Service class and service.ts responsibilities.',
  'Component Design': 'The Service class exposes drain() for queue flushing.',
};

const designDocument = buildMinimalDesign(baseSectionBodies);

function buildRevisedDesign(overrides: Record<string, string> = {}): string {
  return buildMinimalDesign({ ...baseSectionBodies, ...overrides });
}

function buildCompleteReviewResponse(): string {
  return [
    buildChecklistSection(
      checklist.map((item) => ({ ...item })),
    ).replace(/\[ \]/g, '[x]'),
    '',
    '## Review Result',
    'STATUS: COMPLETE',
    '',
    '## Feedback Items',
    '(none)',
  ].join('\n');
}

function buildNeedsRevisionReviewResponse(): string {
  return [
    buildChecklistSection(checklist),
    '',
    '## Review Result',
    'STATUS: NEEDS_REVISION',
    '',
    '## Feedback Items',
    '1. **[Component Design]** Missing drain() retry logic. _Ref: service.ts_',
  ].join('\n');
}

function passthroughMermaid() {
  return {
    postProcess: jest.fn<any>().mockImplementation(async (design: string) => design),
  };
}

describe('DesignReviewProcessor', () => {
  it('returns unchanged design when the first review is COMPLETE', async () => {
    const reviewDesignDocument = jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse());
    const reviseDesignDocument = jest.fn<any>();
    const logs: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
      logInfo: (message) => logs.push(message),
      logWarn: (message) => logs.push(`WARN:${message}`),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(result.finalDesign).toBe(designDocument);
    expect(result.finalStatus).toBe('COMPLETE');
    expect(result.maxRoundsReachedWithGaps).toBe(false);
    expect(result.reviewRounds).toHaveLength(1);
    expect(reviseDesignDocument).not.toHaveBeenCalled();
    expect(logs).toContain('Review complete — all checklist items covered');
    expect(logs[0]).toMatch(/^Design review: up to \d+ rounds/);
    expect(logs.some((message) => message.includes('Review round 1/'))).toBe(true);
  });

  it('revises and re-reviews until COMPLETE', async () => {
    const needsRevision = buildNeedsRevisionReviewResponse();
    const complete = buildCompleteReviewResponse();
    let reviewCalls = 0;
    const reviewDesignDocument = jest.fn<any>().mockImplementation(async () => {
      reviewCalls += 1;
      return reviewCalls === 1 ? needsRevision : complete;
    });
    const revisedDesign = buildRevisedDesign({
      'Component Design':
        'The Service class exposes drain() with retry logic for queue flushing.',
    });
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(revisedDesign);
    const postProcess = jest.fn<any>().mockImplementation(async (design: string) => `${design}\n`);
    const logs: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: { postProcess },
      logInfo: (message) => logs.push(message),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(2);
    expect(reviseDesignDocument).toHaveBeenCalledTimes(1);
    expect(postProcess).toHaveBeenCalledWith(revisedDesign, generationPrompt);
    expect(result.finalDesign).toBe(`${revisedDesign}\n`);
    expect(result.finalStatus).toBe('COMPLETE');
    expect(result.reviewRounds).toHaveLength(2);
    expect(logs.some((message) => message.includes('revising design'))).toBe(true);
    expect(logs.some((message) => message.includes('revision accepted'))).toBe(true);
  });

  it('retries review when the first response fails to parse', async () => {
    const valid = buildCompleteReviewResponse();
    const reviewDesignDocument = jest
      .fn<any>()
      .mockResolvedValueOnce('STATUS: COMPLETE')
      .mockResolvedValueOnce(valid);

    const processor = new DesignReviewProcessor({
      llmService: {
        reviewDesignDocument,
        reviseDesignDocument: jest.fn<any>(),
      },
      mermaidPostProcessor: passthroughMermaid(),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(2);
    expect(reviewDesignDocument.mock.calls[1]![0]).toContain('Missing ## Coverage Check section');
    expect(result.finalStatus).toBe('COMPLETE');
  });

  it('retries review when manual feedback validation fails', async () => {
    const invalidFeedback = [
      buildChecklistSection(checklist.map((item) => ({ ...item }))),
      '',
      '## Review Result',
      'STATUS: NEEDS_REVISION',
      '',
      '## Feedback Items',
      '1. **[Component Design]** The queue lifecycle is incomplete. _Ref: service.ts_',
    ].join('\n');
    const valid = buildNeedsRevisionReviewResponse();
    const reviewDesignDocument = jest
      .fn<any>()
      .mockResolvedValueOnce(invalidFeedback)
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce(buildCompleteReviewResponse());
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(
      buildRevisedDesign({
        'Component Design':
          'The Service class exposes drain() with retry logic for queue flushing.',
      }),
    );

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
    });

    await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(3);
    expect(reviewDesignDocument.mock.calls[1]![0]).toContain(
      'description must include a term (length >= 4) from service.ts',
    );
  });

  it('returns best-effort result when review parse retries are exhausted', async () => {
    const reviewDesignDocument = jest.fn<any>().mockResolvedValue('STATUS: COMPLETE');
    const warnings: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: {
        reviewDesignDocument,
        reviseDesignDocument: jest.fn<any>(),
      },
      mermaidPostProcessor: passthroughMermaid(),
      logWarn: (message) => warnings.push(message),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(3);
    expect(result.finalDesign).toBe(designDocument);
    expect(result.finalStatus).toBe('NEEDS_REVISION');
    expect(result.maxRoundsReachedWithGaps).toBe(true);
    expect(result.reviewRounds).toHaveLength(1);
    expect(result.unresolvedGaps).toEqual(
      expect.arrayContaining(['main:src/service.ts', 'symbol:src/service.ts:drain']),
    );
    expect(warnings.some((message) => message.includes('ended early'))).toBe(true);
  });

  it('locks disallowed section edits and accepts revision without retry', async () => {
    let reviewCalls = 0;
    const reviewDesignDocument = jest.fn<any>().mockImplementation(async () => {
      reviewCalls += 1;
      return reviewCalls === 1
        ? buildNeedsRevisionReviewResponse()
        : buildCompleteReviewResponse();
    });
    const original = designDocument;
    const revisionWithDrift = buildRevisedDesign({
      Usage: 'Changed usage section unexpectedly.',
      'Component Design':
        'The Service class exposes drain() with retry logic for queue flushing.',
    });
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(revisionWithDrift);

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
    });

    await processor.process({
      designDocument: original,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviseDesignDocument).toHaveBeenCalledTimes(1);
  });

  it('continues review rounds when revision validation fails in an earlier round', async () => {
    const reviewDesignDocument = jest.fn<any>().mockResolvedValue(buildNeedsRevisionReviewResponse());
    const invalidRevision = buildRevisedDesign({
      Usage: 'Changed usage section unexpectedly.',
    });
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(invalidRevision);
    const postProcess = jest.fn<any>().mockImplementation(async (design: string) => `${design}\n`);
    const warnings: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: { postProcess },
      logWarn: (message) => warnings.push(message),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(3);
    expect(reviseDesignDocument).toHaveBeenCalledTimes(2);
    expect(postProcess).toHaveBeenCalledTimes(2);
    expect(result.finalStatus).toBe('NEEDS_REVISION');
    expect(result.maxRoundsReachedWithGaps).toBe(true);
    expect(result.reviewRounds).toHaveLength(3);
    expect(result.finalDesign).toContain('## Usage');
    expect(warnings.filter((message) => message.includes('revision validation failed'))).toHaveLength(2);
    expect(warnings.some((message) => message.includes('max rounds reached with'))).toBe(true);
  });

  it('warns and returns best-effort design when max review rounds are reached with gaps', async () => {
    const needsRevision = buildNeedsRevisionReviewResponse();
    const reviewDesignDocument = jest.fn<any>().mockResolvedValue(needsRevision);
    let reviseCalls = 0;
    const reviseDesignDocument = jest.fn<any>().mockImplementation(async () => {
      reviseCalls += 1;
      return buildRevisedDesign({
        'Component Design': `Revision ${reviseCalls}: partial drain() documentation without full retry coverage.`,
      });
    });
    const warnings: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
      logWarn: (message) => warnings.push(message),
    });

    const result = await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(reviewDesignDocument).toHaveBeenCalledTimes(3);
    expect(reviseDesignDocument).toHaveBeenCalledTimes(2);
    expect(result.maxRoundsReachedWithGaps).toBe(true);
    expect(result.finalStatus).toBe('NEEDS_REVISION');
    expect(result.unresolvedGaps.length).toBeGreaterThan(0);
    expect(warnings.some((message) => message.includes('max rounds reached with'))).toBe(true);
  });

  it('logs STATUS override and honesty failures', async () => {
    const falseComplete = [
      buildChecklistSection(checklist),
      '',
      '## Review Result',
      'STATUS: COMPLETE',
      '',
      '## Feedback Items',
      '(none)',
    ].join('\n');
    const reviewDesignDocument = jest
      .fn<any>()
      .mockResolvedValueOnce(falseComplete)
      .mockResolvedValueOnce(buildCompleteReviewResponse());
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(
      buildRevisedDesign({
        'Component Design':
          'The Service class exposes drain() with retry logic for queue flushing.',
      }),
    );
    const logs: string[] = [];

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
      logInfo: (message) => logs.push(message),
    });

    await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
    });

    expect(logs.some((message) => message.includes('STATUS overridden by coverage check'))).toBe(
      true,
    );
    expect(logs.some((message) => message.includes('uncovered checklist'))).toBe(true);
  });

  it('persists artifacts through the sink as each review and revision step completes', async () => {
    const sink: DesignReviewArtifactSink = {
      writeReviewPrompt: jest.fn(),
      writeReviewResponse: jest.fn(),
      writeRevisionPrompt: jest.fn(),
      writeRevisionDesign: jest.fn(),
      writeFinalDesign: jest.fn(),
    };
    const needsRevision = buildNeedsRevisionReviewResponse();
    const complete = buildCompleteReviewResponse();
    let reviewCalls = 0;
    const reviewDesignDocument = jest.fn<any>().mockImplementation(async () => {
      reviewCalls += 1;
      return reviewCalls === 1 ? needsRevision : complete;
    });
    const revisedDesign = buildRevisedDesign({
      'Component Design':
        'The Service class exposes drain() with retry logic for queue flushing.',
    });
    const reviseDesignDocument = jest.fn<any>().mockResolvedValue(revisedDesign);

    const processor = new DesignReviewProcessor({
      llmService: { reviewDesignDocument, reviseDesignDocument },
      mermaidPostProcessor: passthroughMermaid(),
    });

    await processor.process({
      designDocument,
      generationPrompt,
      contextMap,
      pwd,
      checklist,
      artifactSink: sink,
    });

    expect(sink.writeReviewPrompt).toHaveBeenCalledTimes(2);
    expect(sink.writeReviewResponse).toHaveBeenCalledTimes(2);
    expect(sink.writeRevisionPrompt).toHaveBeenCalledTimes(1);
    expect(sink.writeRevisionDesign).toHaveBeenCalledTimes(1);
    expect(sink.writeFinalDesign).toHaveBeenCalledTimes(1);
  });
});
