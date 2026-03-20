import { describe, it, expect, jest } from '@jest/globals';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import {
  classifyContextDependencies,
  ContextClassificationError,
} from '../../src/classify/classifyContextDependencies.js';
import type { ContextMap } from '../../src/types/context.js';

function buildClassificationResponse(promote: string[]): string {
  return promote.join('\n');
}

describe('classifyContextDependencies', () => {
  it('skips LLM when there are no dependencies', async () => {
    const context: ContextMap = {
      main: ['/pwd/Main.ts'],
      dependencies: [],
      uses: [],
    };
    const classifyDependencies = jest.fn<any>();

    const result = await classifyContextDependencies({
      contextMap: context,
      pwd: '/pwd',
      llmService: { classifyDependencies },
    });

    expect(result).toBe(context);
    expect(classifyDependencies).not.toHaveBeenCalled();
  });

  it('promotes dependencies selected by the model', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-classify-'));
    const concurrentDir = path.join(pwd, 'concurrent');
    const utilDir = path.join(pwd, 'util');
    mkdirSync(concurrentDir, { recursive: true });
    mkdirSync(utilDir, { recursive: true });

    const queuePath = path.join(concurrentDir, 'Queue.java');
    const requestPath = path.join(concurrentDir, 'Request.java');
    const genericPath = path.join(utilDir, 'Generic.java');
    writeFileSync(queuePath, 'class Queue {}');
    writeFileSync(requestPath, 'interface Request {}');
    writeFileSync(genericPath, 'class Generic {}');

    const context: ContextMap = {
      main: [queuePath],
      dependencies: [requestPath, genericPath],
      uses: [requestPath],
    };

    const classifyDependencies = jest.fn<any>().mockResolvedValue(
      buildClassificationResponse(['concurrent/Request.java']),
    );

    const result = await classifyContextDependencies({
      contextMap: context,
      pwd,
      llmService: { classifyDependencies },
    });

    expect(result.main).toEqual([queuePath, requestPath]);
    expect(result.dependencies).toEqual([genericPath]);
    expect(result.uses).toEqual([]);
    expect(classifyDependencies).toHaveBeenCalledTimes(1);

    rmSync(pwd, { recursive: true, force: true });
  });

  it('retries on parse failure then succeeds', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-classify-retry-'));
    const depPath = path.join(pwd, 'dep.ts');
    writeFileSync(depPath, 'export class Dep {}');

    const context: ContextMap = {
      main: [path.join(pwd, 'main.ts')],
      dependencies: [depPath],
      uses: [],
    };
    writeFileSync(path.join(pwd, 'main.ts'), 'export class Main {}');

    const classifyDependencies = jest
      .fn<any>()
      .mockResolvedValueOnce('invalid/path')
      .mockResolvedValueOnce('');

    const result = await classifyContextDependencies({
      contextMap: context,
      pwd,
      llmService: { classifyDependencies },
    });

    expect(result).toEqual(context);
    expect(classifyDependencies).toHaveBeenCalledTimes(2);

    rmSync(pwd, { recursive: true, force: true });
  });

  it('throws after exhausted parse retries', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-classify-fail-'));
    const depPath = path.join(pwd, 'dep.ts');
    writeFileSync(depPath, 'export class Dep {}');
    writeFileSync(path.join(pwd, 'main.ts'), 'export class Main {}');

    const context: ContextMap = {
      main: [path.join(pwd, 'main.ts')],
      dependencies: [depPath],
      uses: [],
    };

    const classifyDependencies = jest.fn<any>().mockResolvedValue('still/invalid');

    await expect(
      classifyContextDependencies({
        contextMap: context,
        pwd,
        llmService: { classifyDependencies },
      }),
    ).rejects.toBeInstanceOf(ContextClassificationError);

    expect(classifyDependencies).toHaveBeenCalledTimes(3);

    rmSync(pwd, { recursive: true, force: true });
  });
});
