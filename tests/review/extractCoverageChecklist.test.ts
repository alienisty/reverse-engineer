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

  it('should add test file rows with test prefix for test use paths', () => {
    const testPath = 'core/src/test/java/au/example/ServiceTest.java';
    const context = createFixture({
      [testPath]: 'class ServiceTest {}',
    });
    context.uses.push(path.join(pwd, testPath));

    const items = extractCoverageChecklist(context, pwd);
    const fileItem = items.find((item) => item.id === `test:${toPosix(testPath)}`);

    expect(fileItem).toEqual({
      id: `test:${toPosix(testPath)}`,
      label: 'ServiceTest.java',
      sourceFile: toPosix(testPath),
      searchTerms: ['ServiceTest.java', 'ServiceTest'],
      category: 'test',
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

  it('should extract symbols from main files only', () => {
    const mainPath = 'src/CoalescingQueue.ts';
    const refPath = 'src/Dependency.ts';
    const context = createFixture({
      [mainPath]: `
export class CoalescingQueue {
  private pending = new Map<string, Promise<void>>();

  public drain(): Promise<void> {
    return Promise.resolve();
  }
}

export function createQueue() {
  return new CoalescingQueue();
}
`,
      [refPath]: `
export interface Dependency {
  connect(): void;
}

export enum Mode {
  Fast,
  Safe,
}
`,
    });
    context.main.push(path.join(pwd, mainPath));
    context.dependencies.push(path.join(pwd, refPath));

    const items = extractCoverageChecklist(context, pwd);
    const symbolIds = items
      .filter((item) => item.id.startsWith('symbol:'))
      .map((item) => item.id);

    expect(symbolIds).toEqual([
      'symbol:src/CoalescingQueue.ts:CoalescingQueue',
      'symbol:src/CoalescingQueue.ts:createQueue',
      'symbol:src/CoalescingQueue.ts:drain',
    ]);
    expect(symbolIds.some((id) => id.includes('Dependency'))).toBe(false);
    expect(symbolIds.some((id) => id.includes('Mode'))).toBe(false);
  });

  it('should extract classes, interfaces, enums, functions, and methods', () => {
    const mainPath = 'lib/types.ts';
    const context = createFixture({
      [mainPath]: `
interface Worker {
  run(): void;
}

enum Status {
  Idle,
  Busy,
}

class Processor {
  protected process(input: string): string {
    return input;
  }
}

function standalone() {}
export function exportedHelper() {}
export class ExportedProcessor extends Processor {}
`,
    });
    context.main.push(path.join(pwd, mainPath));

    const items = extractCoverageChecklist(context, pwd);
    const labels = Object.fromEntries(
      items
        .filter((item) => item.id.startsWith('symbol:'))
        .map((item) => [item.id.split(':').pop(), item.label]),
    );

    expect(labels).toMatchObject({
      Worker: 'interface Worker in types.ts',
      Status: 'enum Status in types.ts',
      Processor: 'class Processor in types.ts',
      process: 'method process in types.ts',
      standalone: 'function standalone in types.ts',
      exportedHelper: 'function exportedHelper in types.ts',
      ExportedProcessor: 'class ExportedProcessor in types.ts',
    });
  });

  it('should deduplicate symbols extracted by multiple patterns', () => {
    const mainPath = 'src/service.ts';
    const context = createFixture({
      [mainPath]: `
class Service {}
export class Service {}
export function Service() {}
`,
    });
    context.main.push(path.join(pwd, mainPath));

    const items = extractCoverageChecklist(context, pwd);
    const serviceSymbols = items.filter((item) => item.id.includes(':Service'));

    expect(serviceSymbols).toHaveLength(1);
    expect(serviceSymbols[0]?.label).toBe('class Service in service.ts');
    expect(serviceSymbols[0]?.searchTerms).toEqual(['Service']);
  });

  it('should order items as main file rows, main symbols, then dependency and use file rows', () => {
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
      'symbol:src/main.ts:Main',
      'symbol:src/main.ts:run',
      'dep:src/dep.ts',
      'use:src/use.ts',
    ]);
  });

  it('should skip symbol extraction when a main file is missing on disk', () => {
    pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-checklist-'));
    const missingPath = path.join(pwd, 'missing.ts');
    const context: ContextMap = {
      main: [missingPath],
      dependencies: [],
      uses: [],
    };

    const items = extractCoverageChecklist(context, pwd);

    expect(items).toEqual([
      {
        id: 'main:missing.ts',
        label: 'missing.ts',
        sourceFile: 'missing.ts',
        searchTerms: ['missing.ts', 'missing'],
        category: 'main',
      },
    ]);
  });
});
