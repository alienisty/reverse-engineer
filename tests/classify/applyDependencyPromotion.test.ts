import { describe, it, expect } from '@jest/globals';
import { applyDependencyPromotion } from '../../src/classify/applyDependencyPromotion.js';
import type { ContextMap } from '../../src/types/context.js';

describe('applyDependencyPromotion', () => {
  it('moves promoted paths from dependencies to main', () => {
    const context: ContextMap = {
      main: ['/pwd/src/Queue.java'],
      dependencies: ['/pwd/src/Request.java', '/pwd/util/Generic.java'],
      uses: [],
    };

    const result = applyDependencyPromotion(context, ['/pwd/src/Request.java']);

    expect(result.main).toEqual(['/pwd/src/Queue.java', '/pwd/src/Request.java']);
    expect(result.dependencies).toEqual(['/pwd/util/Generic.java']);
    expect(result.uses).toEqual([]);
  });

  it('removes promoted paths from uses', () => {
    const context: ContextMap = {
      main: ['/pwd/src/Queue.java'],
      dependencies: ['/pwd/src/Request.java'],
      uses: ['/pwd/src/Request.java', '/pwd/consumer/Worker.java'],
    };

    const result = applyDependencyPromotion(context, ['/pwd/src/Request.java']);

    expect(result.main).toContain('/pwd/src/Request.java');
    expect(result.dependencies).toEqual([]);
    expect(result.uses).toEqual(['/pwd/consumer/Worker.java']);
  });

  it('dedupes main and sorts remaining buckets', () => {
    const context: ContextMap = {
      main: ['/pwd/b/Main.ts', '/pwd/a/Main.ts'],
      dependencies: ['/pwd/z/Dep.ts', '/pwd/m/Dep.ts'],
      uses: ['/pwd/y/Use.ts'],
    };

    const result = applyDependencyPromotion(context, ['/pwd/m/Dep.ts']);

    expect(result.main).toEqual(['/pwd/b/Main.ts', '/pwd/a/Main.ts', '/pwd/m/Dep.ts']);
    expect(result.dependencies).toEqual(['/pwd/z/Dep.ts']);
    expect(result.uses).toEqual(['/pwd/y/Use.ts']);
  });
});
