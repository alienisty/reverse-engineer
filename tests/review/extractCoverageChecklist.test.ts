import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractCoverageChecklist } from '../../src/review/extractCoverageChecklist.js';
import type { ContextMap } from '../../src/types/context.js';

describe('extractCoverageChecklist', () => {
  let pwd = '';

  afterEach(() => {
    if (pwd) {
      rmSync(pwd, { recursive: true, force: true });
      pwd = '';
    }
  });

  function createFixture(files: Record<string, string>): ContextMap {
    pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-checklist-'));

    const main: string[] = [];
    const dependencies: string[] = [];
    const uses: string[] = [];

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(pwd, relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, content);
    }

    return { main, dependencies, uses };
  }

  function toPosix(relativePath: string): string {
    return relativePath.split(path.sep).join('/');
  }

  it('should add one main file row per main context file', () => {
    const servicePath = 'src/service.ts';
    const context = createFixture({
      [servicePath]: 'export class Service {}',
    });
    context.main.push(path.join(pwd, servicePath));

    const items = extractCoverageChecklist(context, pwd);
    const fileItem = items.find((item) => item.id === `main:${toPosix(servicePath)}`);

    expect(fileItem).toEqual({
      id: 'main:src/service.ts',
      label: 'service.ts',
      sourceFile: 'src/service.ts',
      searchTerms: ['service.ts', 'service'],
      category: 'main',
    });
  });

  it('should add one dep file row per dependency context file', () => {
    const refPath = 'src/helpers/util.ts';
    const context = createFixture({
      [refPath]: 'export function helper() {}',
    });
    context.dependencies.push(path.join(pwd, refPath));

    const items = extractCoverageChecklist(context, pwd);
    const fileItem = items.find((item) => item.id === `dep:${toPosix(refPath)}`);

    expect(fileItem).toEqual({
      id: 'dep:src/helpers/util.ts',
      label: 'util.ts',
      sourceFile: 'src/helpers/util.ts',
      searchTerms: ['util.ts', 'util'],
      category: 'dependency',
    });
  });

  it('should add test file rows with use prefix for test use paths', () => {
    const testPath = 'core/src/test/java/au/example/ServiceTest.java';
    const context = createFixture({
      [testPath]: 'class ServiceTest {}',
    });
    context.uses.push(path.join(pwd, testPath));

    const items = extractCoverageChecklist(context, pwd);
    const fileItem = items.find((item) => item.id === `use:${toPosix(testPath)}`);

    expect(fileItem).toEqual({
      id: `use:${toPosix(testPath)}`,
      label: 'ServiceTest.java',
      sourceFile: toPosix(testPath),
      searchTerms: ['ServiceTest.java', 'ServiceTest'],
      category: 'use',
    });
  });

  it('should add one use file row per use context file', () => {
    const usePath = 'src/app/bootstrap.ts';
    const context = createFixture({
      [usePath]: 'import { Service } from "../service";',
    });
    context.uses.push(path.join(pwd, usePath));

    const items = extractCoverageChecklist(context, pwd);
    const fileItem = items.find((item) => item.id === `use:${toPosix(usePath)}`);

    expect(fileItem).toEqual({
      id: 'use:src/app/bootstrap.ts',
      label: 'bootstrap.ts',
      sourceFile: 'src/app/bootstrap.ts',
      searchTerms: ['bootstrap.ts', 'bootstrap'],
      category: 'use',
    });
  });

  it('should order items as main file rows, then dependency and use file rows', () => {
    const mainPath = 'src/main.ts';
    const depPath = 'src/dep.ts';
    const usePath = 'src/use.ts';
    const context = createFixture({
      [mainPath]: 'class Main { public run() {} }',
      [depPath]: 'class Dep {}',
      [usePath]: 'class Use {}',
    });
    context.main.push(path.join(pwd, mainPath));
    context.dependencies.push(path.join(pwd, depPath));
    context.uses.push(path.join(pwd, usePath));

    const items = extractCoverageChecklist(context, pwd);

    expect(items.map((item) => item.id)).toEqual([
      'main:src/main.ts',
      'dep:src/dep.ts',
      'use:src/use.ts',
    ]);
  });
});
