import { describe, expect, it, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateFeedbackItems } from '../../src/review/validateFeedbackItems.js';
import { loadSourceContext } from '../../src/review/reviewSourceContext.js';
import type { ContextMap } from '../../src/types/context.js';
import type { DesignReviewFeedbackItem } from '../../src/review/types.js';

describe('validateFeedbackItems', () => {
  let pwd = '';
  let contextMap: ContextMap;

  afterEach(() => {
    if (pwd) {
      rmSync(pwd, { recursive: true, force: true });
      pwd = '';
    }
  });

  function createFixture(files: Record<string, string>): void {
    pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-feedback-'));
    contextMap = { main: [], dependencies: [], uses: [] };

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(pwd, relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, content);
    }

    contextMap.main.push(path.join(pwd, 'src/service.ts'));
    contextMap.dependencies.push(path.join(pwd, 'src/helpers/util.ts'));
  }

  it('passes valid manual feedback with a source-anchored term', () => {
    createFixture({
      'src/service.ts': [
        'export class Service {',
        '  public drain(): Promise<void> {',
        '    return Promise.resolve();',
        '  }',
        '}',
      ].join('\n'),
      'src/helpers/util.ts': 'export function helper() { return true; }',
    });

    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        section: 'Component Design',
        description: 'Missing drain() retry logic.',
        codeReference: 'service.ts',
      },
    ];

    const loadedSource = loadSourceContext(contextMap, pwd);
    expect(validateFeedbackItems({ feedbackItems, loadedSource })).toEqual({});
  });

  it('fails when _Ref path is missing', () => {
    createFixture({
      'src/service.ts': 'export class Service {}',
      'src/helpers/util.ts': 'export function helper() {}',
    });

    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        description: 'Missing drain() retry logic.',
      },
    ];

    const loadedSource = loadSourceContext(contextMap, pwd);
    expect(validateFeedbackItems({ feedbackItems, loadedSource }).error).toBe(
      'Item 1: _Ref: path_ is required on manual feedback items',
    );
  });

  it('fails when _Ref path is not found in the source context', () => {
    createFixture({
      'src/service.ts': 'export class Service {}',
      'src/helpers/util.ts': 'export function helper() {}',
    });

    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        description: 'Missing queue lifecycle details.',
        codeReference: 'missing.ts',
      },
    ];

    const loadedSource = loadSourceContext(contextMap, pwd);
    expect(validateFeedbackItems({ feedbackItems, loadedSource }).error).toBe(
      'Item 1: _Ref: missing.ts_ not found in source context',
    );
  });

  it('fails when description does not contain a source term of length >= 4', () => {
    createFixture({
      'src/service.ts': [
        'export class Service {',
        '  public drain(): Promise<void> {',
        '    return Promise.resolve();',
        '  }',
        '}',
      ].join('\n'),
      'src/helpers/util.ts': 'export function helper() {}',
    });

    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        description: 'The queue lifecycle is incomplete.',
        codeReference: 'service.ts',
      },
    ];

    const loadedSource = loadSourceContext(contextMap, pwd);
    expect(validateFeedbackItems({ feedbackItems, loadedSource }).error).toBe(
      'Item 1: description must include a term (length >= 4) from service.ts',
    );
  });

  it('validates each manual feedback item independently', () => {
    createFixture({
      'src/service.ts': [
        'export class Service {',
        '  public drain(): Promise<void> {',
        '    return Promise.resolve();',
        '  }',
        '}',
      ].join('\n'),
      'src/helpers/util.ts': 'export function helper() {}',
    });

    const feedbackItems: DesignReviewFeedbackItem[] = [
      {
        description: 'Missing drain() retry logic.',
        codeReference: 'service.ts',
      },
      {
        description: 'Helper behavior is undocumented.',
        codeReference: 'unknown.ts',
      },
    ];

    const loadedSource = loadSourceContext(contextMap, pwd);
    expect(validateFeedbackItems({ feedbackItems, loadedSource }).error).toBe(
      'Item 2: _Ref: unknown.ts_ not found in source context',
    );
  });
});
